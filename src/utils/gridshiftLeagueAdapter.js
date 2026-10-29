// GridShift-league implementation of the league data contract
// (src/utils/leagueProviderContract.js): pure mappers from GridShift platform
// API responses. The requests live in src/api/gridshiftPlatformApi.js.
//
// Only platform data goes in: no Sleeper league ids, seasons, rosters, caches,
// or names are read here, so nothing from a Sleeper league can reach a
// GridShift league. The one link to core's own data is the NFL player catalog
// (portraits and player pages), matched by cross-provider identity
// (`buildPlayerCatalogIndex`), as the user decided on 2026-10-28.

import { LEAGUE_PROVIDER_IDS } from './leagueProviderContract.js';
import { canonicalizeAvailabilityStatus } from './playerAvailabilityStatus.js';
import { getProviderIdentityKey } from './providerPlayerIdentity.js';
import { LINEUP_RESERVE_SLOTS, LINEUP_SLOT_ORDER, UNPLACED_SLOT, getLineupSlotLabel, listLineupSlots } from './gridshiftLineup.js';

const NO_MANAGER = 'No manager';

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundScore(value) {
  return Math.round(finiteNumber(value) * 100) / 100;
}

/**
 * `GET /api/leagues` entry, or `GET /api/leagues/:id` body, to a league summary.
 * @returns {import('./leagueProviderContract.js').LeagueSummary | null}
 */
export function mapGridShiftLeagueSummary(entry) {
  const league = entry?.league ?? entry;
  if (!league?.id) return null;
  const role = entry?.viewerRole ?? entry?.role ?? null;
  return {
    provider: LEAGUE_PROVIDER_IDS.GRIDSHIFT,
    leagueId: String(league.id),
    name: String(league.name ?? 'League'),
    season: String(league.season ?? ''),
    viewerRole: role === 'commissioner' || role === 'manager' ? role : null,
  };
}

/** `GET /api/leagues/:id/teams` body to contract teams, keyed by team id. */
export function mapGridShiftTeams(teamsBody, { viewerUserId = null } = {}) {
  const teams = new Map();
  for (const team of teamsBody?.teams ?? []) {
    if (!team?.id) continue;
    teams.set(String(team.id), {
      teamId: String(team.id),
      name: String(team.name ?? 'Team'),
      managerName: team.managerUsername ? String(team.managerUsername) : NO_MANAGER,
      isViewer: Boolean(viewerUserId && team.managerUserId === viewerUserId),
    });
  }
  return teams;
}

/**
 * Up to five most recent final regular-season results per team, oldest first,
 * from `GET /api/leagues/:id/matchups`. Totals include commissioner
 * adjustments, matching the platform's standings.
 */
export function buildGridShiftRecentForm(matchupsBody) {
  const form = new Map();
  const finals = (matchupsBody?.matchups ?? [])
    .filter((matchup) => matchup?.kind === 'regular' && matchup.status === 'final' && matchup.home && matchup.away)
    .sort((left, right) => finiteNumber(left.week) - finiteNumber(right.week));
  const push = (teamId, result) => {
    if (!form.has(teamId)) form.set(teamId, []);
    form.get(teamId).push(result);
  };
  finals.forEach(({ home, away }) => {
    const homeTotal = roundScore(home.total ?? home.providerPoints);
    const awayTotal = roundScore(away.total ?? away.providerPoints);
    if (homeTotal === awayTotal) {
      push(String(home.teamId), 'T');
      push(String(away.teamId), 'T');
    } else {
      push(String(home.teamId), homeTotal > awayTotal ? 'W' : 'L');
      push(String(away.teamId), awayTotal > homeTotal ? 'W' : 'L');
    }
  });
  return new Map([...form.entries()].map(([teamId, results]) => [teamId, results.slice(-5)]));
}

/** The last week whose regular-season matchups are final in this league, or 0. */
export function getGridShiftThroughWeek(matchupsBody) {
  return (matchupsBody?.matchups ?? [])
    .filter((matchup) => matchup?.kind === 'regular' && matchup.status === 'final')
    .reduce((latest, matchup) => Math.max(latest, finiteNumber(matchup.week)), 0);
}

/**
 * Standings model from the platform responses Standings needs. Row order and
 * seeds are the platform's `rank` (its own tiebreakers); core never re-sorts.
 *
 * @param {object} input
 * @param {object} input.league     `GET /api/leagues/:id` body
 * @param {object} input.teams      `GET /api/leagues/:id/teams` body
 * @param {object} input.standings  `GET /api/leagues/:id/standings` body (final results only)
 * @param {object} input.weeks      `GET /api/leagues/:id/weeks` body
 * @param {object} input.matchups   `GET /api/leagues/:id/matchups` body
 * @returns {import('./leagueProviderContract.js').StandingsModel}
 */
export function buildGridShiftStandingsModel({ league, teams, standings, weeks, matchups }, { retry = () => {}, viewerUserId = null } = {}) {
  const summary = mapGridShiftLeagueSummary(league);
  const season = summary?.season || String(weeks?.season ?? '');
  const teamsById = mapGridShiftTeams(teams, { viewerUserId });
  const recentForm = buildGridShiftRecentForm(matchups);
  const throughWeek = getGridShiftThroughWeek(matchups);

  const rows = [...(standings?.standings ?? [])]
    .sort((left, right) => finiteNumber(left.rank) - finiteNumber(right.rank))
    .map((row) => {
      const teamId = String(row.teamId);
      const team = teamsById.get(teamId);
      return {
        participantId: teamId,
        seed: finiteNumber(row.rank),
        teamName: team?.name ?? 'Team',
        managerName: team?.managerName ?? NO_MANAGER,
        wins: finiteNumber(row.wins),
        losses: finiteNumber(row.losses),
        ties: finiteNumber(row.ties),
        recentForm: recentForm.get(teamId) ?? [],
        pointsFor: roundScore(row.pointsFor),
        pointsAgainst: roundScore(row.pointsAgainst),
      };
    });

  const hasStandings = rows.length > 0 && throughWeek > 0;
  const championshipWeek = weeks?.championshipWeek == null ? null : finiteNumber(weeks.championshipWeek, null);

  return {
    provider: LEAGUE_PROVIDER_IDS.GRIDSHIFT,
    status: hasStandings ? 'ready' : 'empty',
    season,
    error: '',
    retry,
    // A finished GridShift season (final table, championship result) is not
    // modelled yet; the live table is shown until then.
    historical: false,
    standings: {
      season,
      throughWeek,
      playoffTeamCount: 2,
      rows,
      divisions: [{ id: 'League', label: 'League', rows }],
    },
    brackets: null,
    finalPlacements: null,
    postseason: championshipWeek ? { kind: 'championship', week: championshipWeek } : null,
  };
}

// ── Stage 5.2: players, rosters and lineups, matchups ───────────────────────

/**
 * Index of core's player catalog (Sleeper player ids) by cross-provider
 * identity (`providerPlayerIdentity.js`: normalized name, NFL team, position
 * family). Ambiguous identities map to null, so they never match. The catalog
 * is the NFL player directory core already loads; no Sleeper league data is
 * read.
 */
export function buildPlayerCatalogIndex(catalog) {
  const index = new Map();
  for (const [sleeperId, player] of Object.entries(catalog ?? {})) {
    const key = getProviderIdentityKey({
      name: player?.full_name || [player?.first_name, player?.last_name].filter(Boolean).join(' '),
      team: player?.team,
      position: player?.position,
    });
    if (!key) continue;
    index.set(key, index.has(key) ? null : String(sleeperId));
  }
  return index;
}

/** The core catalog id for one platform player, or null when unmatched or ambiguous. */
export function matchCatalogPlayerId(catalogIndex, { name, nflTeam, position }) {
  if (!catalogIndex) return null;
  const key = getProviderIdentityKey({ name, team: nflTeam, position });
  return key ? catalogIndex.get(key) ?? null : null;
}

/**
 * `GET …/player-directory` rows to contract players, keyed by platform player
 * id. `sleeperId` is the matched core catalog id (portrait and player page) or
 * '' when unmatched, so nothing looks a platform uuid up in core's catalog.
 */
export function mapGridShiftPlayers(directoryBody, { catalogIndex = null } = {}) {
  const players = new Map();
  for (const row of directoryBody?.players ?? []) {
    if (!row?.playerId) continue;
    const name = String(row.name ?? [row.firstName, row.lastName].filter(Boolean).join(' ') ?? 'Player');
    const position = row.position ? String(row.position) : null;
    const nflTeam = row.nflTeam ? String(row.nflTeam).toUpperCase() : null;
    players.set(String(row.playerId), {
      playerId: String(row.playerId),
      name,
      position,
      nflTeam,
      injuryStatus: canonicalizeAvailabilityStatus(row.injury?.status ?? null),
      injuryNote: row.injury?.note ?? null,
      game: row.game ?? null,
      seasonPoints: row.points?.season == null ? null : roundScore(row.points.season),
      lastWeekPoints: row.points?.lastWeek == null ? null : roundScore(row.points.lastWeek),
      positionRank: row.rank?.position == null ? null : finiteNumber(row.rank.position, null),
      ownerTeamId: row.ownerTeamId ? String(row.ownerTeamId) : null,
      sleeperId: matchCatalogPlayerId(catalogIndex, { name, nflTeam, position }) ?? '',
    });
  }
  return players;
}

/** Which team the signed-in account manages, and whether it may edit a team's lineup. */
export function getGridShiftViewer({ league, teams, session }) {
  const userId = session?.user?.id ?? null;
  const role = league?.viewerRole ?? null;
  const viewerTeam = (teams?.teams ?? []).find((team) => userId && team.managerUserId === userId) ?? null;
  return {
    userId,
    role: role === 'commissioner' || role === 'manager' ? role : null,
    teamId: viewerTeam ? String(viewerTeam.id) : null,
    canEditTeam: (teamId) => Boolean(teamId && (role === 'commissioner' || (viewerTeam && String(viewerTeam.id) === String(teamId)))),
  };
}

/** Teams for a selector: the viewer's team first, then by name. */
export function listGridShiftTeamOptions(teamsBody, viewer) {
  const teams = mapGridShiftTeams(teamsBody, { viewerUserId: viewer?.userId ?? null });
  return [...teams.values()]
    .sort((left, right) => Number(right.isViewer) - Number(left.isViewer) || left.name.localeCompare(right.name))
    .map((team) => ({ id: team.teamId, name: team.name, managerName: team.managerName, isMe: team.isViewer, avatarUrl: null }));
}

// A player in a lineup who is no longer rostered (a week's saved lineup keeps
// them) is missing from the owned-player directory; the week's points list
// still names them.
function lineupPlayer(players, playerId, fallback = null) {
  if (!playerId) return null;
  return players.get(String(playerId)) ?? {
    playerId: String(playerId),
    name: fallback?.name ?? 'Player',
    position: fallback?.position ?? null,
    nflTeam: null,
    injuryStatus: null,
    sleeperId: '',
  };
}

/** Week points by player id from `GET …/points?week=`: `{ points, name, position, starter }`. */
export function mapGridShiftWeekPoints(pointsBody) {
  const byPlayer = new Map();
  for (const team of pointsBody?.teams ?? []) {
    for (const player of team.players ?? []) {
      byPlayer.set(String(player.playerId), {
        points: player.points == null ? null : roundScore(player.points),
        name: player.name ?? null,
        position: player.position ?? null,
        starter: Boolean(player.starter),
      });
    }
  }
  return byPlayer;
}

/**
 * One team's lineup for a week as display sections (one per slot type, in the
 * platform's slot order). Each row is a slot instance with its player (or
 * null), the lock, and the platform's IR eligibility message.
 *
 * @param {object} lineupView  `GET …/teams/:teamId/lineup?week=` body
 * @param {Map} players        `mapGridShiftPlayers` result
 */
export function buildGridShiftLineupSections(lineupView, players, weekPoints = new Map(), { teamId = null } = {}) {
  const assignment = lineupView?.assignment ?? {};
  const locked = new Set((lineupView?.lockedPlayerIds ?? []).map(String));
  const eligibility = lineupView?.irEligibility ?? {};
  const sections = [];
  const placed = new Set();
  const row = (slot, playerId) => {
    const points = playerId ? weekPoints.get(String(playerId)) ?? null : null;
    const player = lineupPlayer(players, playerId, points);
    const ir = playerId ? eligibility[playerId] ?? null : null;
    return {
      slot,
      player,
      locked: Boolean(playerId && locked.has(String(playerId))),
      irEligible: Boolean(ir?.eligible),
      irMessage: ir?.message ?? null,
      weekPoints: points?.points ?? null,
      // A started week keeps its saved lineup, so it can hold a player who has since left the roster.
      leftRoster: Boolean(teamId && player && players.get(String(playerId))?.ownerTeamId !== String(teamId)),
    };
  };
  for (const slot of listLineupSlots(assignment)) {
    let section = sections[sections.length - 1];
    if (!section || section.type !== slot.type) {
      section = { type: slot.type, label: getLineupSlotLabel(slot.type), rows: [] };
      sections.push(section);
    }
    if (slot.playerId) placed.add(String(slot.playerId));
    section.rows.push(row({ type: slot.type, index: slot.index }, slot.playerId));
  }
  // Rostered players in no slot (acquired after this week's lineup was saved).
  if (teamId) {
    const unplaced = [...players.values()].filter((player) => player.ownerTeamId === String(teamId) && !placed.has(player.playerId));
    if (unplaced.length) {
      sections.push({
        type: UNPLACED_SLOT,
        label: 'Not in lineup',
        rows: unplaced.map((player) => row({ type: UNPLACED_SLOT, index: 0, playerId: player.playerId }, player.playerId)),
      });
    }
  }
  return sections;
}

/**
 * Matchups for one week with team names, records, and totals (adjustments
 * included). Order: the viewer's matchup first, then the platform's order.
 */
export function buildGridShiftWeekMatchups({ teams, matchups, standings, viewer, week }) {
  const teamsById = mapGridShiftTeams(teams, { viewerUserId: viewer?.userId ?? null });
  const records = new Map((standings?.standings ?? []).map((row) => [String(row.teamId), row]));
  const side = (entry) => {
    if (!entry?.teamId) return null;
    const teamId = String(entry.teamId);
    const team = teamsById.get(teamId);
    const record = records.get(teamId);
    return {
      teamId,
      name: team?.name ?? 'Team',
      managerName: team?.managerName ?? NO_MANAGER,
      isViewer: Boolean(team?.isViewer),
      providerPoints: entry.providerPoints == null ? null : roundScore(entry.providerPoints),
      adjustments: roundScore(entry.adjustments ?? 0),
      total: entry.total == null ? null : roundScore(entry.total),
      record: record ? {
        wins: finiteNumber(record.wins), losses: finiteNumber(record.losses), ties: finiteNumber(record.ties),
        pointsFor: roundScore(record.pointsFor), pointsAgainst: roundScore(record.pointsAgainst),
      } : null,
    };
  };
  return (matchups?.matchups ?? [])
    .filter((matchup) => finiteNumber(matchup?.week) === finiteNumber(week))
    .map((matchup) => {
      let home = side(matchup.home);
      let away = side(matchup.away);
      // The viewer's team reads on the left, as in a Sleeper matchup.
      if (away?.isViewer && !home?.isViewer) [home, away] = [away, home];
      return { id: String(matchup.id), week: finiteNumber(matchup.week), kind: matchup.kind, status: matchup.status, mine: home, opponent: away };
    })
    .sort((left, right) => Number(Boolean(right.mine?.isViewer)) - Number(Boolean(left.mine?.isViewer)));
}

/** Weeks the league plays, for the week picker, with the platform's current week. */
export function buildGridShiftWeekOptions(weeksBody) {
  const options = (weeksBody?.weeks ?? [])
    .filter((entry) => entry?.leagueWeek)
    .map((entry) => ({ week: finiteNumber(entry.week), status: entry.status, kind: entry.leagueWeek }));
  const current = finiteNumber(weeksBody?.currentWeek, null);
  const currentWeek = options.some((option) => option.week === current)
    ? current
    : options.find((option) => option.status !== 'final')?.week ?? options[options.length - 1]?.week ?? null;
  return { options, currentWeek, championshipWeek: weeksBody?.championshipWeek ?? null };
}

/**
 * Head-to-head rows for one matchup: starters paired slot by slot, then bench
 * and IR. A row's player carries the week's provider points (`GET …/points`)
 * and whether the game has started (the lineup's locks, or a past week).
 */
export function buildGridShiftMatchupRows({ mineLineup, opponentLineup, points, players, weekStatus }) {
  const pointsById = mapGridShiftWeekPoints(points);
  const weekStarted = weekStatus === 'final' || weekStatus === 'provisional' || weekStatus === 'in_progress';
  const weekOver = weekStatus === 'final';
  const toRowPlayer = (playerId, lineup) => {
    const player = lineupPlayer(players, playerId, pointsById.get(String(playerId)));
    if (!player) return null;
    const locked = (lineup?.lockedPlayerIds ?? []).map(String).includes(String(playerId));
    const game = player.game ?? null;
    const gameStarted = weekOver || locked || (weekStarted && pointsById.has(String(playerId)) && game?.status !== 'scheduled');
    return {
      id: player.playerId,
      sleeperId: player.sleeperId,
      name: player.name,
      position: player.position,
      team: player.nflTeam,
      oppTeam: weekStarted && !weekOver ? game?.opponent ?? null : null,
      isHome: weekStarted && !weekOver ? game?.home ?? null : null,
      weekPts: pointsById.get(String(playerId))?.points ?? null,
      gameStarted,
      availabilityStatus: player.injuryStatus,
    };
  };
  const rows = [];
  const mineSlots = mineLineup?.assignment ?? {};
  const oppSlots = opponentLineup?.assignment ?? {};
  for (const type of LINEUP_SLOT_ORDER) {
    const mine = Array.isArray(mineSlots[type]) ? mineSlots[type] : [];
    const opp = Array.isArray(oppSlots[type]) ? oppSlots[type] : [];
    const count = Math.max(mine.length, opp.length);
    for (let index = 0; index < count; index += 1) {
      const reserve = LINEUP_RESERVE_SLOTS.includes(type);
      if (reserve && !mine[index] && !opp[index]) continue;
      rows.push({
        key: `${type}:${index}`,
        slotType: type,
        slotLabel: getLineupSlotLabel(type),
        bench: reserve,
        mine: toRowPlayer(mine[index] ?? null, mineLineup),
        opponent: toRowPlayer(opp[index] ?? null, opponentLineup),
      });
    }
  }
  return rows;
}
