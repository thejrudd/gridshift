// liveDemoPlays.js — special multi-player moments used only by Fantasy Live's
// mock feed. Each returned event still runs through the active league scoring
// settings so its expanded breakdown matches the rest of the feed.

import { calcPoints } from './scoringEngine.js';
import { getSleeperPlayerName, getTeamAbbr } from './liveScoringFeed.js';

const OFFENSE_POSITIONS = new Set(['RB', 'WR', 'TE']);
const TEAM_DEFENSE_POSITIONS = new Set(['DEF', 'DST', 'D/ST']);
const IDP_POSITIONS = new Set(['DL', 'DE', 'DT', 'LB', 'ILB', 'OLB', 'DB', 'CB', 'S', 'SS', 'FS']);

export function limitPlayByPlayGames(games = [], { mock = false, maxGames = 8 } = {}) {
  return mock ? games : games.slice(0, maxGames);
}

function positionOf(row) {
  return String(row?.player?.position ?? '').toUpperCase();
}

function findTwoWayPair(sides) {
  const orientations = [
    [sides[0], sides[1]],
    [sides[1], sides[0]],
  ];
  for (const [offenseSide, defenseSide] of orientations) {
    const offense = offenseSide?.rows?.find((row) => OFFENSE_POSITIONS.has(positionOf(row)));
    const defense = defenseSide?.rows?.find((row) => (
      TEAM_DEFENSE_POSITIONS.has(positionOf(row)) || IDP_POSITIONS.has(positionOf(row))
    ));
    if (offense && defense) return { offense, defense };
  }
  return null;
}

export function buildSharedDemoScoringEvents({
  sides = [],
  scoringSettings = {},
  progress = 0.58,
} = {}) {
  const pair = findTwoWayPair(sides);
  if (!pair) return [];

  const offensePosition = positionOf(pair.offense);
  const defensePosition = positionOf(pair.defense);
  const defenseIsTeam = TEAM_DEFENSE_POSITIONS.has(defensePosition);
  const offenseName = getSleeperPlayerName(pair.offense.player);
  const defenseName = defenseIsTeam
    ? `${getTeamAbbr(pair.defense.player?.team) || 'Opposing'} defense`
    : getSleeperPlayerName(pair.defense.player);
  const sharedPlayId = `demo-shared-fumble-${pair.offense.id}-${pair.defense.id}`;
  const description = `${offenseName} makes a 75-yard catch before ${defenseName} forces the fumble and returns it 42 yards for a touchdown`;
  const at = 'demo-shared-snap';
  const clampedProgress = Math.min(0.95, Math.max(0.05, Number(progress) || 0.58));

  const offenseStats = {
    rec: 1,
    rec_yd: 75,
    fum_lost: 1,
  };
  const defenseStats = defenseIsTeam
    ? {
        def_ff: 1,
        fum_rec: 1,
        def_td: 1,
        def_fum_td: 1,
      }
    : {
        idp_ff: 1,
        idp_fr: 1,
        idp_def_td: 1,
        idp_fr_td: 1,
        idp_fr_yd: 42,
      };

  const common = {
    sharedPlayId,
    desc: description,
    at,
    progress: clampedProgress,
    source: 'demo',
    estimated: true,
    glance: {
      clock: 'Shared snap',
      score: 'Offense + defense',
      live: false,
    },
  };

  return [
    {
      ...common,
      id: `${sharedPlayId}-offense`,
      playerId: pair.offense.id,
      kind: 'to',
      mechanism: 'pass',
      stats: offenseStats,
      pts: Math.max(0.1, Math.round(calcPoints(
        offenseStats,
        scoringSettings,
        offensePosition,
      ) * 10) / 10),
    },
    {
      ...common,
      id: `${sharedPlayId}-defense`,
      playerId: pair.defense.id,
      kind: 'td',
      mechanism: 'def',
      stats: defenseStats,
      pts: Math.max(0.1, Math.round(calcPoints(
        defenseStats,
        scoringSettings,
        defensePosition,
      ) * 10) / 10),
    },
  ];
}
