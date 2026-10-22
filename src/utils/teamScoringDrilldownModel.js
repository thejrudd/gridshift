import { buildFantasyMatchupScoringBreakdown } from './fantasyMatchupBreakdown.js';
import { getFantasyProjectionSourceLabel } from './fantasyProjections.js';
import { getFallbackRemainingGameFraction } from './liveScoringFeed.js';
import {
  getPaceProjectedFinal,
  getStarterOutlook,
  PACE_PROJECTION_MODEL,
  resolveStarterProjection,
} from './liveWinProbability.js';
import { buildPlayerProjectionBreakdown, getFantasyBreakdownGroupId } from './playerMatchupPresentation.js';
import { isTeamDefensePosition } from './nflPlays/playerNameIndex.js';

/*
 * Team scoring drilldown model (Fantasy Matchups → team scorecard).
 *
 * Shapes one side's lineup into the projection, live and final views. It adds
 * no projection or scoring source of its own:
 *  - projected points per starter: resolveStarterProjection(), the same value
 *    the masthead's projected total (`expectedA/B`) sums;
 *  - projected categories: buildPlayerProjectionBreakdown(), the player
 *    drilldown's projected stat line under league scoring;
 *  - actual categories: buildFantasyMatchupScoringBreakdown(), reconciled to
 *    each starter's displayed points;
 *  - live projected finish: the PACE_PROJECTION_MODEL outlook that
 *    buildMatchupWinProbability() sums into `paceExpectedA/B`.
 * Any gap between the rows and a reported total stays visible as a row.
 */

const EPSILON = 0.005;

// Offence first, then defence, then deductions and everything else. D/ST and
// IDP are separate groups. `model` (the shared group id) holds rows that are
// not one scoring stat — a projection's gap to its own stat line, provider
// points no stat explains, a season-average stand-in, league adjustments — and
// reads "Other" here.
export const TEAM_SCORING_GROUPS = [
  { id: 'passing', label: 'Passing' },
  { id: 'rushing', label: 'Rushing' },
  { id: 'receiving', label: 'Receiving' },
  { id: 'bonus', label: 'Bonuses' },
  { id: 'kicking', label: 'Kicking' },
  { id: 'special', label: 'Special teams' },
  { id: 'dst', label: 'D/ST' },
  { id: 'idp', label: 'IDP' },
  { id: 'negative', label: 'Negative plays' },
  { id: 'model', label: 'Other' },
];
const GROUP_ORDER = new Map(TEAM_SCORING_GROUPS.map((group, index) => [group.id, index]));
const IDP_POSITIONS = new Set(['DL', 'DE', 'DT', 'LB', 'ILB', 'OLB', 'DB', 'CB', 'S', 'SS', 'FS', 'IDP']);

/* A team defence's or IDP player's scoring all belongs to that unit — an IDP
   pass defended is not passing — so the player's position decides the group
   before the stat key does. Only the not-a-stat `model` rows stay Other. */
export function getTeamScoringGroupId(row, position) {
  const base = getFantasyBreakdownGroupId(row);
  if (base === 'model') return base;
  if (isTeamDefensePosition(position)) return 'dst';
  if (IDP_POSITIONS.has(String(position ?? '').toUpperCase())) return 'idp';
  if (base === 'defense') return String(row?.statKey ?? row?.key ?? '').startsWith('idp') ? 'idp' : 'dst';
  return base;
}

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function getTeamScoringLastName(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] ?? '');
}

function isEmptySpot(player) {
  return !player || !player.id || player.id === '0' || player.name === 'Empty';
}

function normalizeState(state, player) {
  if (player?.isBye || state === 'bye') return 'bye';
  if (state === 'final' || state === 'live' || state === 'pre') return state;
  if (player?.scheduleEntry?.completed === true) return 'final';
  return player?.gameStarted ? 'live' : 'pre';
}

function addTo(map, key, value) {
  map[key] = round2((map[key] ?? 0) + value);
}

function remainingFraction(spot, state, points, now) {
  if (state === 'pre') return 1;
  if (state === 'final' || state === 'bye') return 0;
  const supplied = finiteOrNull(spot.remainingFraction);
  if (supplied != null) return Math.min(1, Math.max(0, supplied));
  return getFallbackRemainingGameFraction({
    scheduleEntry: spot.player?.scheduleEntry ?? null,
    currentPoints: points,
    now,
  });
}

function projectionRowsFor({ projection, resolved, scoringSettings, position }) {
  if (resolved.source === 'projection') {
    const breakdown = buildPlayerProjectionBreakdown(projection, scoringSettings, position);
    if (breakdown?.rows?.length) return breakdown.rows;
  }
  if (Math.abs(resolved.projected) < EPSILON) return [];
  return [{
    key: 'projection_estimate',
    statKey: 'fantasy_points_total',
    label: resolved.source === 'seasonAvg' ? 'Season average estimate' : 'Position estimate',
    statVal: null,
    pts: resolved.projected,
  }];
}

/**
 * @param {object} options
 * @param {Array} options.spots  one entry per starting lineup spot, in league
 *   roster order: { slotPos, slotLabel, player, state, points, remainingFraction }.
 *   `state` is 'pre' | 'live' | 'final' | 'bye'; `points` the starter's
 *   displayed points (null before kickoff).
 * @param {boolean} options.settled  the matchup is officially settled.
 * @param {number|null} options.teamPoints  the reported team total, when one
 *   is authoritative; the difference from the starters becomes a visible row.
 * @param {object} options.baselines  recorded pregame projections by player id
 *   (used once settled, matching the masthead's projection).
 */
export function buildTeamScoringDrilldownModel({
  spots = [],
  settled = false,
  teamPoints = null,
  week,
  weeklyStats = null,
  players = null,
  scoringSettings = null,
  derivedRowsByPlayerId = {},
  baselines = null,
  now = Date.now(),
} = {}) {
  const normalized = spots.map((spot, index) => {
    const empty = isEmptySpot(spot?.player);
    const player = empty ? null : spot.player;
    const state = empty ? 'empty' : normalizeState(spot.state, player);
    const points = empty || state === 'pre' ? null : finiteOrNull(spot.points ?? player?.weekPts) ?? (state === 'bye' ? null : 0);
    return { spot, index, empty, player, state, points };
  });

  const anyStarted = normalized.some(({ state }) => state === 'live' || state === 'final');
  const phase = settled ? 'final' : anyStarted ? 'live' : 'pregame';

  const reportedPlayerIds = normalized.filter(({ player }) => player).map(({ player }) => player.id);
  const pointsMap = Object.fromEntries(normalized
    .filter(({ player, points }) => player && points != null)
    .map(({ player, points }) => [player.id, points]));
  const actualBreakdown = buildFantasyMatchupScoringBreakdown({
    playerIds: reportedPlayerIds,
    playerPoints: pointsMap,
    week,
    weeklyStats,
    players,
    scoringSettings,
    derivedRowsByPlayerId,
  });
  const actualRowsById = new Map(actualBreakdown.playerRows
    .filter((row) => !row.isAdjustment)
    .map((row) => [String(row.id), row.breakdown ?? []]));

  const categories = [];
  const projectionSources = new Set();
  const resultSpots = normalized.map(({ spot, index, empty, player, state, points }) => {
    const key = `spot-${index}`;
    const label = spot?.slotLabel ?? spot?.slotPos ?? player?.position ?? 'Spot';
    const base = {
      key,
      index,
      slotPos: spot?.slotPos ?? null,
      label,
      empty,
      state,
      player: player ? {
        id: player.id,
        name: player.name ?? String(player.id),
        lastName: getTeamScoringLastName(player.name),
        position: player.position ?? null,
        team: player.team ?? null,
      } : null,
    };
    if (empty) {
      return { ...base, projected: 0, actual: null, paceFinal: 0, remaining: 0, projectedByGroup: {}, actualByGroup: {}, projectionSource: null };
    }

    const baselineProjection = phase === 'final' ? baselines?.[String(player.id)]?.projection ?? null : null;
    const projection = baselineProjection && finiteOrNull(baselineProjection.projected) != null
      ? baselineProjection
      : player.projection ?? null;
    const resolved = state === 'bye'
      ? { projected: 0, source: 'bye' }
      : resolveStarterProjection({ position: player.position, projection, fallbackAvg: player.avgPPG });
    if (resolved.source === 'projection') {
      const sourceLabel = getFantasyProjectionSourceLabel(projection);
      if (sourceLabel) projectionSources.add(sourceLabel);
    } else if (resolved.source === 'seasonAvg') {
      projectionSources.add('Season average');
    } else if (resolved.source === 'posDefault') {
      projectionSources.add('Position estimate');
    }

    const projectedRows = state === 'bye' ? [] : projectionRowsFor({ projection, resolved, scoringSettings, position: player.position });
    const actualRows = points == null ? [] : (actualRowsById.get(String(player.id)) ?? []);

    const fraction = remainingFraction(spot, state, points, now);
    let paceFinal = round2(resolved.projected);
    if (state === 'final' || state === 'bye') paceFinal = round2(points ?? 0);
    else if (state === 'live') {
      const outlook = getStarterOutlook({
        current: points ?? 0,
        position: player.position,
        projection,
        fallbackAvg: player.avgPPG,
        fraction,
        model: PACE_PROJECTION_MODEL,
      });
      paceFinal = fraction > 0 ? getPaceProjectedFinal(outlook) : round2(points ?? 0);
    }

    const projectedByGroup = {};
    const actualByGroup = {};
    const byKey = new Map();
    const take = (row, field) => {
      const groupId = getTeamScoringGroupId(row, player.position);
      const entry = byKey.get(row.key) ?? {
        id: `${key}:${row.key}`,
        spotKey: key,
        spotLabel: label,
        playerId: player.id,
        playerName: base.player.lastName,
        key: row.key,
        label: row.label,
        group: groupId,
        projectedStat: null,
        projectedPts: 0,
        actualStat: null,
        actualPts: 0,
      };
      if (field === 'projected') {
        entry.projectedPts = round2(entry.projectedPts + row.pts);
        if (row.statVal != null) entry.projectedStat = (entry.projectedStat ?? 0) + Number(row.statVal);
        addTo(projectedByGroup, groupId, row.pts);
      } else {
        entry.actualPts = round2(entry.actualPts + row.pts);
        if (row.statVal != null) entry.actualStat = (entry.actualStat ?? 0) + Number(row.statVal);
        addTo(actualByGroup, groupId, row.pts);
      }
      byKey.set(row.key, entry);
    };
    projectedRows.forEach((row) => take(row, 'projected'));
    actualRows.forEach((row) => take(row, 'actual'));
    for (const entry of byKey.values()) {
      categories.push({ ...entry, diff: round2(entry.actualPts - entry.projectedPts) });
    }

    return {
      ...base,
      projected: round2(resolved.projected),
      projectionSource: resolved.source,
      actual: points == null ? null : round2(points),
      paceFinal,
      remaining: state === 'live' || state === 'pre' ? round2(Math.max(0, paceFinal - (points ?? 0))) : 0,
      remainingFraction: fraction,
      projectedByGroup,
      actualByGroup,
    };
  });

  const starterActual = round2(resultSpots.reduce((sum, spot) => sum + (spot.actual ?? 0), 0));
  const reportedTeam = finiteOrNull(teamPoints);
  const teamAdjustment = phase !== 'pregame' && reportedTeam != null && Math.abs(reportedTeam - starterActual) >= 0.01
    ? round2(reportedTeam - starterActual)
    : 0;
  if (teamAdjustment) {
    categories.push({
      id: 'team:league_adjustment',
      spotKey: null,
      spotLabel: null,
      playerId: null,
      playerName: null,
      key: 'league_adjustment',
      label: 'League scoring adjustment',
      group: 'model',
      projectedStat: null,
      projectedPts: 0,
      actualStat: null,
      actualPts: teamAdjustment,
      diff: teamAdjustment,
    });
  }

  const sumGroups = (field) => {
    const totals = {};
    resultSpots.forEach((spot) => Object.entries(spot[field]).forEach(([group, value]) => addTo(totals, group, value)));
    return totals;
  };
  const projectedByGroup = sumGroups('projectedByGroup');
  const actualByGroup = sumGroups('actualByGroup');
  if (teamAdjustment) addTo(actualByGroup, 'model', teamAdjustment);

  const projected = round2(resultSpots.reduce((sum, spot) => sum + spot.projected, 0));
  const actual = phase === 'pregame' ? null : round2(starterActual + teamAdjustment);
  const paceFinal = round2(resultSpots.reduce((sum, spot) => sum + spot.paceFinal, 0) + teamAdjustment);
  const remaining = phase === 'live' ? round2(resultSpots.reduce((sum, spot) => sum + spot.remaining, 0)) : 0;

  const groups = TEAM_SCORING_GROUPS
    .filter((group) => [projectedByGroup, actualByGroup].some((totals) => Math.abs(totals[group.id] ?? 0) >= EPSILON))
    .map((group) => ({
      ...group,
      projected: projectedByGroup[group.id] ?? 0,
      actual: actualByGroup[group.id] ?? 0,
      diff: round2((actualByGroup[group.id] ?? 0) - (projectedByGroup[group.id] ?? 0)),
    }));

  categories.sort((left, right) => (
    (GROUP_ORDER.get(left.group) ?? 99) - (GROUP_ORDER.get(right.group) ?? 99)
    || Math.abs(right.projectedPts) - Math.abs(left.projectedPts)
  ));

  const counts = resultSpots.reduce((acc, spot) => ({ ...acc, [spot.state]: (acc[spot.state] ?? 0) + 1 }), {});

  return {
    phase,
    spots: resultSpots,
    groups,
    categories,
    totals: {
      projected,
      actual,
      paceFinal,
      remaining,
      teamAdjustment,
      diff: actual == null ? null : round2(actual - projected),
    },
    counts,
    projectionSources: [...projectionSources],
  };
}
