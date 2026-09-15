// starterProjections.js — shared projection assembly for Companion Matchup and
// Companion Live. Both tabs must produce IDENTICAL pre-kickoff projections for
// the same player/week, so the schedule/defense/weather input assembly and the
// projectPlayer call live here, in one place.

import {
  buildDefenseTable,
  computeLeagueAvgPPGByPositionFromDefenseTable,
  getDefenseStrength,
  projectPlayer,
} from './projectionEngine.js';
import { STADIUMS, WEEK_DATES_2025 } from '../data/stadiums.js';
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

const DERIVED_PROJECTION_STAT_KEYS = new Set([
  'pts_allow_0', 'pts_allow_1_6', 'pts_allow_7_13', 'pts_allow_14_17',
  'pts_allow_18_21', 'pts_allow_22_27', 'pts_allow_14_20', 'pts_allow_21_27',
  'pts_allow_28_34', 'pts_allow_35_45', 'pts_allow_46p', 'pts_allow_35p',
  'yds_allow_0_100', 'yds_allow_100_199', 'yds_allow_200_299',
  'yds_allow_300_349', 'yds_allow_350_399', 'yds_allow_400_449',
  'yds_allow_450_499', 'yds_allow_500_549', 'yds_allow_550p',
]);

/**
 * Distinguishes a pre-kickoff zero from a live/final zero. A weekly stat row
 * is useful evidence when the schedule feed is late, while a non-zero
 * matchup total remains a compatibility fallback for providers that omit
 * schedule timestamps.
 */
export function isStarterGameStarted({ scheduleEntry = null, weekEntry = null, fallbackPoints = null, nowMs = Date.now() } = {}) {
  if (scheduleEntry?.completed === true) return true;
  const kickoffMs = Date.parse(scheduleEntry?.kickoff ?? '');
  if (Number.isFinite(kickoffMs) && kickoffMs <= nowMs) return true;
  if (weekEntry) return true;
  if (Number.isFinite(kickoffMs)) return false;
  const numericFallback = Number(fallbackPoints);
  return Number.isFinite(numericFallback) && numericFallback !== 0;
}

export function getProjectionScoreTone(actualPoints, projectedPoints, tolerance = 0.05) {
  if (actualPoints == null || projectedPoints == null) return 'default';
  const actual = Number(actualPoints);
  const projected = Number(projectedPoints);
  if (!Number.isFinite(actual) || !Number.isFinite(projected)) return 'default';
  const delta = actual - projected;
  if (delta > tolerance) return 'positive';
  if (delta < -tolerance) return 'negative';
  return 'default';
}

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
  historicalWeeklyStats = null,
  providerProjections = null,
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
    historicalWeeklyStats,
    providerProjections,
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
    gameStarted: isStarterGameStarted({ scheduleEntry: schedEntry, weekEntry }),
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
  if (!context) return null;
  const projectionArgs = {
    pos: info.position,
    oppTeam: info.oppTeam,
    isHome: info.isHome,
    isIndoor: info.isIndoor ?? false,
    weather: info.isIndoor ? null : weather,
    players: context.players,
    scoringSettings: context.scoringSettings,
    scheduleMap: context.scheduleMap,
    week: context.week,
    defStrength: info.defStrength ?? null,
    leagueAvg: context.leagueAvgByPos?.[info.position] ?? 0,
    skipOpponentLookup: true,
  };

  // BDL is the optional primary forecast when the connected application has a
  // usable provider row. GridShift's current-season model and the most recent
  // completed local season remain the graceful no-BDL fallback path.
  const currentProjection = info.weekly?.length
    ? projectPlayer({
        ...projectionArgs,
        weeklyArr: info.weekly,
        allWeeklyStats: context.weeklyStats,
      })
    : null;
  const providerProjection = context.providerProjections?.get(info.playerId ?? info.id) ?? null;
  const historicalWeekly = context.historicalWeeklyStats?.[info.playerId ?? info.id] ?? [];
  const historicalProjection = !providerProjection && !currentProjection && historicalWeekly.length
    ? projectPlayer({
        ...projectionArgs,
        weeklyArr: historicalWeekly,
        priorWeeklyOverride: historicalWeekly,
        allWeeklyStats: context.historicalWeeklyStats,
        scheduleMap: null,
        defStrength: null,
        leagueAvg: 0,
        week: null,
      })
    : null;
  const selectedProjection = providerProjection ?? currentProjection ?? historicalProjection;
  const projection = selectedProjection && !selectedProjection.factors?.source
    ? {
        ...selectedProjection,
        factors: {
          ...selectedProjection.factors,
          source: currentProjection ? 'current-season' : 'prior-season',
        },
      }
    : selectedProjection;
  if (!projection) return null;
  if (!gateAvailability) return projection;

  const { factor, status } = getAvailabilityProjectionFactor(context.players?.[info.playerId ?? info.id]);
  if (factor === 1) return projection;
  const scale = (value) => {
    if (value == null) return value;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(numeric * factor * 10) / 10 : value;
  };
  const scaledProjectedStats = projection.projectedStats && typeof projection.projectedStats === 'object'
    ? Object.fromEntries(Object.entries(projection.projectedStats).map(([key, value]) => {
        const numeric = Number(value);
        return [key, Number.isFinite(numeric) && !DERIVED_PROJECTION_STAT_KEYS.has(key) ? numeric * factor : value];
      }))
    : projection.projectedStats;
  return {
    ...projection,
    projected: scale(projection.projected),
    min: scale(projection.min),
    max: scale(projection.max),
    projectedStats: scaledProjectedStats,
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
