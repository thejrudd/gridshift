const REGULAR_SEASON_WEEK_COUNT = 18;
const NFL_TEAM_COUNT = 32;
const NFL_GAME_COUNT = 272;
const GAMES_PER_TEAM = 17;

const NFL_TEAMS = Object.freeze([
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
  'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
  'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
  'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS',
]);

const NFL_TEAM_SET = new Set(NFL_TEAMS);
const TEAM_ALIASES = Object.freeze({
  GNB: 'GB',
  JAC: 'JAX',
  KAN: 'KC',
  LA: 'LAR',
  LVR: 'LV',
  NEP: 'NE',
  NOR: 'NO',
  SFO: 'SF',
  TAM: 'TB',
  WSH: 'WAS',
});

function normalizeSeason(value) {
  const normalized = String(value ?? '').trim();
  if (!/^\d{4}$/.test(normalized)) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : null;
}

export function normalizeNflTeamAbbr(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!normalized) return null;
  const canonical = TEAM_ALIASES[normalized] ?? normalized;
  return NFL_TEAM_SET.has(canonical) ? canonical : null;
}

function getWeekEntries(seasonSchedule) {
  const rawWeeks = seasonSchedule?.weeks;
  if (Array.isArray(rawWeeks)) return rawWeeks;
  if (!rawWeeks || typeof rawWeeks !== 'object') return [];
  return Object.entries(rawWeeks).map(([week, games]) => ({
    week: Number(week),
    games: Array.isArray(games) ? games : [],
  }));
}

function normalizeGameTeam(game, side) {
  if (side === 'home') return normalizeNflTeamAbbr(game?.homeTeam ?? game?.home);
  return normalizeNflTeamAbbr(game?.awayTeam ?? game?.away);
}

function createEmptyCoverage() {
  return {
    weekCount: 0,
    gameCount: 0,
    uniqueGameCount: 0,
    teamCount: 0,
    teamsWithExactly17Games: 0,
  };
}

/**
 * Validates a full NFL regular-season schedule and derives its team bye weeks.
 * Missing schedule rows are treated as byes only after the entire season passes
 * every coverage check; partial or mismatched data always fails closed.
 */
export function buildByeWeekScheduleBundle(seasonSchedule, {
  expectedSeason = null,
  scheduleMap = null,
} = {}) {
  const season = normalizeSeason(seasonSchedule?.season);
  const normalizedExpectedSeason = normalizeSeason(expectedSeason);
  const weeks = getWeekEntries(seasonSchedule);
  const issues = [];
  const coverage = createEmptyCoverage();
  const teamWeeks = new Map(NFL_TEAMS.map((team) => [team, new Set()]));
  const seenWeekNumbers = new Set();
  const seenGameKeys = new Set();

  if (!season) issues.push('missing-season');
  if (!weeks.length) issues.push('missing-weeks');

  for (const weekEntry of weeks) {
    const week = Number(weekEntry?.week);
    if (!Number.isInteger(week) || week < 1 || week > REGULAR_SEASON_WEEK_COUNT) {
      issues.push('invalid-week');
      continue;
    }
    if (seenWeekNumbers.has(week)) issues.push('duplicate-week');
    seenWeekNumbers.add(week);

    const teamsInWeek = new Set();
    const games = Array.isArray(weekEntry?.games) ? weekEntry.games : [];
    coverage.gameCount += games.length;

    for (const game of games) {
      const home = normalizeGameTeam(game, 'home');
      const away = normalizeGameTeam(game, 'away');
      if (!home || !away || home === away) {
        issues.push('invalid-game-team');
        continue;
      }
      if (teamsInWeek.has(home) || teamsInWeek.has(away)) issues.push('duplicate-team-in-week');
      teamsInWeek.add(home);
      teamsInWeek.add(away);
      teamWeeks.get(home).add(week);
      teamWeeks.get(away).add(week);

      const gameId = String(game?.id ?? '').trim();
      const gameKey = gameId || `${week}:${[home, away].sort().join(':')}`;
      if (seenGameKeys.has(gameKey)) issues.push('duplicate-game-id');
      seenGameKeys.add(gameKey);
    }
  }

  coverage.weekCount = seenWeekNumbers.size;
  coverage.uniqueGameCount = seenGameKeys.size;
  coverage.teamCount = [...teamWeeks.values()].filter((teamWeekSet) => teamWeekSet.size > 0).length;
  coverage.teamsWithExactly17Games = [...teamWeeks.values()]
    .filter((teamWeekSet) => teamWeekSet.size === GAMES_PER_TEAM)
    .length;

  if (coverage.weekCount !== REGULAR_SEASON_WEEK_COUNT) issues.push('incomplete-week-count');
  if (coverage.gameCount !== NFL_GAME_COUNT) issues.push('incomplete-game-count');
  if (coverage.uniqueGameCount !== NFL_GAME_COUNT) issues.push('incomplete-unique-game-count');
  if (coverage.teamCount !== NFL_TEAM_COUNT) issues.push('incomplete-team-count');
  if (coverage.teamsWithExactly17Games !== NFL_TEAM_COUNT) issues.push('incomplete-team-games');

  const byeWeekByTeam = {};
  for (const team of NFL_TEAMS) {
    const missingWeeks = Array.from(
      { length: REGULAR_SEASON_WEEK_COUNT },
      (_, index) => index + 1,
    ).filter((week) => !teamWeeks.get(team).has(week));
    if (missingWeeks.length !== 1) {
      issues.push('invalid-team-bye-count');
      continue;
    }
    byeWeekByTeam[team] = missingWeeks[0];
  }

  const seasonMismatch = Boolean(
    normalizedExpectedSeason
    && season
    && normalizedExpectedSeason !== season,
  );
  const scheduleAvailable = Boolean(season && weeks.length);
  const complete = scheduleAvailable && !seasonMismatch && issues.length === 0;
  const status = seasonMismatch
    ? 'season-mismatch'
    : !scheduleAvailable
      ? 'unavailable'
      : complete
        ? 'complete'
        : 'partial';

  return {
    season,
    expectedSeason: normalizedExpectedSeason,
    source: 'season-schedule',
    status,
    complete,
    scheduleMap: scheduleMap && typeof scheduleMap === 'object' ? scheduleMap : null,
    byeWeekByTeam: complete ? byeWeekByTeam : {},
    coverage,
    issues: [...new Set(issues)],
  };
}

export function isByeWeekBundleForSeason(bundle, season) {
  const normalizedSeason = normalizeSeason(season);
  return Boolean(
    bundle?.complete
    && bundle?.status === 'complete'
    && normalizedSeason
    && normalizeSeason(bundle?.season) === normalizedSeason,
  );
}

export function getByeWeekForTeam(bundle, team, season = null) {
  if (!bundle?.complete || bundle?.status !== 'complete') return null;
  if (season != null && !isByeWeekBundleForSeason(bundle, season)) return null;
  const normalizedTeam = normalizeNflTeamAbbr(team);
  if (!normalizedTeam) return null;
  const byeWeek = Number(bundle?.byeWeekByTeam?.[normalizedTeam]);
  return Number.isInteger(byeWeek) && byeWeek >= 1 && byeWeek <= REGULAR_SEASON_WEEK_COUNT
    ? byeWeek
    : null;
}
