// starterProjections.js — shared projection assembly for Companion Matchup and
// Companion Live. Both tabs must produce IDENTICAL pre-kickoff projections for
// the same player/week, so the schedule/defense/weather input assembly and the
// projectPlayer call live here, in one place.

import {
  buildDefenseTable,
  computeLeagueAvgPPGByPositionFromDefenseTable,
  getDefenseStrength,
  projectPlayer,
} from './projectionEngine';
import { STADIUMS, WEEK_DATES_2025 } from '../data/stadiums';
import { getPlayerAvailabilityStatus } from './playerAvailabilityStatus.js';

// Availability gating: roster-state adjustment applied on top of the model.
// Out-type statuses zero the projection; game-time-decision statuses haircut it.
const AVAILABILITY_ZERO = new Set([
  'Out', 'Injured Reserve', 'PUP', 'NFI', 'Suspended', 'Exempt', 'COVID-19',
  'Inactive', 'Retired', 'Reserve', 'DNP',
]);
const AVAILABILITY_FACTORS = {
  Doubtful: 0.25,
  Questionable: 0.85,
};

export function getAvailabilityProjectionFactor(player) {
  const status = getPlayerAvailabilityStatus(player);
  if (!status) return { factor: 1, status: null };
  if (AVAILABILITY_ZERO.has(status)) return { factor: 0, status };
  return { factor: AVAILABILITY_FACTORS[status] ?? 1, status };
}

/**
 * Builds the shared lookup context. Callers memoize the result; Matchup can
 * pass its cached defenseTable/leagueAvgByPos to avoid recomputation.
 */
export function buildProjectionContext({
  weeklyStats,
  players,
  scheduleMap,
  scoringSettings,
  week,
  defenseTable = null,
  leagueAvgByPos = null,
}) {
  if (!weeklyStats || !players) return null;
  const resolvedDefenseTable = defenseTable
    ?? buildDefenseTable(weeklyStats, players, scheduleMap, scoringSettings, undefined, false, week);
  const resolvedLeagueAvg = leagueAvgByPos
    ?? computeLeagueAvgPPGByPositionFromDefenseTable(resolvedDefenseTable, week);
  return {
    weeklyStats,
    players,
    scheduleMap,
    scoringSettings,
    week,
    defenseTable: resolvedDefenseTable,
    leagueAvgByPos: resolvedLeagueAvg,
  };
}

/**
 * Schedule/game derivation for one player — mirrors Companion Matchup's
 * enrichPlayer exactly (stat-entry opponent preferred, ESPN schedule fallback,
 * home team decides the stadium, bye = week has games but not for this team).
 */
export function resolveStarterGameInfo(playerId, context) {
  const { players, weeklyStats, scheduleMap, week, defenseTable } = context ?? {};
  const player = players?.[playerId];
  if (!player) return null;

  const weekly = weeklyStats?.[playerId] ?? [];
  const weekEntry = weekly.find((w) => w.week === week) ?? null;
  const myTeam = player.team || 'FA';
  const schedEntry = scheduleMap?.[week]?.[myTeam] ?? null;
  const oppTeam = weekEntry?.opp?.toUpperCase() ?? schedEntry?.opp ?? null;
  const isHome = schedEntry != null
    ? schedEntry.home
    : weekEntry != null ? (weekEntry.home === 1 || weekEntry.home === true) : null;
  const homeTeam = isHome === true ? myTeam : isHome === false ? oppTeam : null;
  const stadium = homeTeam ? (STADIUMS[homeTeam] ?? null) : null;
  const defStrength = oppTeam && defenseTable
    ? getDefenseStrength(defenseTable, oppTeam, player.position, week)
    : null;
  const weekHasGames = !!scheduleMap && Object.keys(scheduleMap[week] ?? {}).length > 0;
  const isBye = weekHasGames && !schedEntry && myTeam !== 'FA';

  return {
    playerId,
    position: player.position,
    team: myTeam,
    weekly,
    weekEntry,
    oppTeam,
    isHome,
    homeTeam,
    gameDate: schedEntry?.date ?? WEEK_DATES_2025[week] ?? null,
    stadium,
    isIndoor: stadium?.indoor ?? null,
    defStrength,
    isBye,
  };
}

/** Weather cache key matching Companion Matchup's weatherMap convention. */
export function getStarterWeatherKey(info) {
  return info?.homeTeam && info?.gameDate ? `${info.homeTeam}-${info.gameDate}` : null;
}

/**
 * The single shared projectPlayer call. `info` is the output of
 * resolveStarterGameInfo (or Matchup's equivalent enriched player fields).
 */
export function projectFromGameInfo(info, context, { weather = null, gateAvailability = true } = {}) {
  if (!info?.weekly?.length || !context) return null;
  const projection = projectPlayer({
    weeklyArr: info.weekly,
    pos: info.position,
    oppTeam: info.oppTeam,
    isHome: info.isHome,
    isIndoor: info.isIndoor ?? false,
    weather: info.isIndoor ? null : weather,
    allWeeklyStats: context.weeklyStats,
    players: context.players,
    scoringSettings: context.scoringSettings,
    scheduleMap: context.scheduleMap,
    week: context.week,
    defStrength: info.defStrength ?? null,
    leagueAvg: context.leagueAvgByPos?.[info.position] ?? 0,
    skipOpponentLookup: true,
  });
  if (!projection) return null;
  if (!gateAvailability) return projection;

  const { factor, status } = getAvailabilityProjectionFactor(context.players?.[info.playerId ?? info.id]);
  if (factor === 1) return projection;
  const scale = (value) => Math.round(value * factor * 10) / 10;
  return {
    ...projection,
    projected: scale(projection.projected),
    min: scale(projection.min),
    max: scale(projection.max),
    factors: {
      ...projection.factors,
      availabilityFactor: factor,
      availabilityStatus: status,
    },
  };
}

/** Resolve + project in one step (Companion Live's entry point). */
export function projectStarter(playerId, context, options = {}) {
  const info = resolveStarterGameInfo(playerId, context);
  if (!info) return null;
  return projectFromGameInfo(info, context, options);
}
