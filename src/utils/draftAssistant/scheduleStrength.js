import { createPointsCalculator } from '../scoringEngine.js';

/**
 * War Room schedule strength.
 *
 * Two different seasons feed this signal and conflating them was the original bug:
 *   - "how generous is the unit this player faces" comes from the PRIOR completed season's
 *     weekly stats, because that is the only real production data that exists at draft time;
 *   - "who does this team actually play" comes from the UPCOMING season's schedule,
 *     which ships in public/season-schedule.json and drives Statistics › Schedule.
 *
 * The resulting index is tiered by percentile within position rather than against
 * fixed cutoffs. Averaging a full slate of opponents pulls every team hard toward
 * the league mean, so absolute thresholds collapsed almost the entire board into a
 * single "Neutral" bucket. Percentiles guarantee spread no matter how compressed
 * the underlying index is.
 */

export const SCHEDULE_TIERS = Object.freeze([
  Object.freeze({ key: 'very-tough', label: 'Very tough', tone: 'negative', maxPercentile: 20 }),
  Object.freeze({ key: 'tough', label: 'Tough', tone: 'negative', maxPercentile: 40 }),
  Object.freeze({ key: 'neutral', label: 'Neutral', tone: 'neutral', maxPercentile: 60 }),
  Object.freeze({ key: 'favorable', label: 'Favorable', tone: 'positive', maxPercentile: 80 }),
  Object.freeze({ key: 'very-favorable', label: 'Very favorable', tone: 'positive', maxPercentile: 100 }),
]);

// Positions are discovered from the league's own weekly stats rather than hardcoded, so
// kickers, team defenses, and IDP slots keep a schedule signal in the leagues that roster
// them. This list is only the expected baseline for tests and docs.
export const SCHEDULE_STRENGTH_POSITIONS = Object.freeze(['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB']);

// Percentiles are meaningless off a handful of teams, so a sparsely-covered position stays
// unavailable instead of inventing tiers from noise.
const MIN_TEAMS_FOR_TIERING = 8;

export const UNAVAILABLE_SCHEDULE_SIGNAL = Object.freeze({
  label: 'Unavailable',
  tierKey: null,
  tone: 'neutral',
  value: null,
  percentile: null,
  detail: null,
  opponents: [],
  gamesRemaining: 0,
});

// public/season-schedule.json carries ESPN abbreviations; Sleeper player teams and the
// prior-season scheduleMap use the Sleeper spelling. Mirrors ESPN_ABBR_TO_SLEEPER in playerApi.js.
const ESPN_ABBR_TO_SLEEPER = { WSH: 'WAS', JAC: 'JAX' };

function normalizeTeam(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!normalized) return null;
  return ESPN_ABBR_TO_SLEEPER[normalized] ?? normalized;
}

function normalizePosition(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'DST') return 'DEF';
  return normalized || null;
}

/**
 * Average fantasy points each team surrendered per game to each opposing position, in the
 * completed season the War Room reads from.
 *
 * The mechanic is symmetric and that is what makes it work for both sides of the ball:
 * every player-week credits the OPPONENT with the points that player scored, bucketed by
 * the scorer's position. So `table.BUF.RB` is "RB points BUF's defense gave up", while
 * `table.BUF.LB` is "IDP linebacker points BUF's OFFENSE gave up" and `table.BUF.DEF` is
 * "DST points BUF's offense gave up" — sacks surrendered, turnovers, and a low scoring
 * output. Higher is favorable for the player in every case, so tiering direction is
 * consistent across offense, IDP, and team defense without special-casing.
 *
 * Note this is empirical rather than modeled: O-line weakness shows up through sacks
 * actually surrendered, not as an explicit line-quality input.
 *
 * The denominator is games actually played (derived from that season's schedule map),
 * not weeks in which points happened to be recorded — a unit that shut a position out
 * should be credited with the shutout rather than skipping the week.
 */
export function buildPointsAllowedByOpponent({ weeklyStats, players, scheduleMap, scoringSettings }) {
  if (!weeklyStats || !players || !scheduleMap) return {};
  const calcPoints = createPointsCalculator(scoringSettings);

  const gamesByTeam = {};
  for (const [week, weekData] of Object.entries(scheduleMap)) {
    const weekNumber = Number(week);
    if (!Number.isFinite(weekNumber)) continue;
    for (const team of Object.keys(weekData ?? {})) {
      const normalizedTeam = normalizeTeam(team);
      if (!normalizedTeam) continue;
      if (!gamesByTeam[normalizedTeam]) gamesByTeam[normalizedTeam] = new Set();
      gamesByTeam[normalizedTeam].add(weekNumber);
    }
  }

  const totals = {};
  for (const [playerId, playerWeeks] of Object.entries(weeklyStats)) {
    const player = players[playerId];
    const position = normalizePosition(player?.fantasy_positions?.[0] ?? player?.position);
    if (!position) continue;

    for (const weekEntry of playerWeeks ?? []) {
      const week = Number(weekEntry?.week);
      if (!Number.isFinite(week)) continue;
      // The scorer's own team, and the team they played — whichever unit was on the
      // other side of the ball is the one charged with the points.
      const scorerTeam = normalizeTeam(weekEntry?.team ?? player?.team);
      const opponentTeam = normalizeTeam(
        weekEntry?.opp ?? (scorerTeam ? scheduleMap?.[week]?.[scorerTeam]?.opp : null),
      );
      if (!opponentTeam) continue;
      const value = calcPoints(weekEntry, player?.position);
      if (!Number.isFinite(value) || value <= 0) continue;
      if (!totals[opponentTeam]) totals[opponentTeam] = {};
      totals[opponentTeam][position] = (totals[opponentTeam][position] ?? 0) + value;
    }
  }

  const table = {};
  for (const [team, byPosition] of Object.entries(totals)) {
    const games = gamesByTeam[team]?.size ?? 0;
    if (!games) continue;
    table[team] = {};
    for (const [position, total] of Object.entries(byPosition)) {
      if (!Number.isFinite(total)) continue;
      table[team][position] = { total, games, avg: total / games };
    }
  }
  return table;
}

/**
 * Collapse the normalized season schedule (Statistics › Schedule's data) into the same
 * `{ [week]: { [team]: { opp, home } } }` shape the rest of the app already speaks.
 */
export function buildUpcomingScheduleMap(seasonSchedule) {
  const weeks = Array.isArray(seasonSchedule?.weeks) ? seasonSchedule.weeks : [];
  const map = {};
  for (const weekEntry of weeks) {
    const week = Number(weekEntry?.week);
    if (!Number.isFinite(week)) continue;
    for (const game of weekEntry.games ?? []) {
      const home = normalizeTeam(game?.homeTeam);
      const away = normalizeTeam(game?.awayTeam);
      if (!home || !away) continue;
      if (!map[week]) map[week] = {};
      map[week][home] = { opp: away, home: true, kickoff: game?.kickoff ?? null, completed: Boolean(game?.completed) };
      map[week][away] = { opp: home, home: false, kickoff: game?.kickoff ?? null, completed: Boolean(game?.completed) };
    }
  }
  return map;
}

/**
 * First week that still has football left to play. Pre-draft that is week 1, so an
 * offseason draft evaluates the whole season; an in-season draft only counts what
 * the drafted player can still contribute.
 */
export function getFirstRemainingWeek(scheduleMap, nowMs = Date.now()) {
  const weeks = Object.keys(scheduleMap ?? {})
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  for (const week of weeks) {
    const games = Object.values(scheduleMap[week] ?? {});
    if (!games.length) continue;
    const hasRemaining = games.some((game) => {
      if (game?.completed) return false;
      const kickoff = game?.kickoff ? Date.parse(game.kickoff) : null;
      return kickoff == null || !Number.isFinite(kickoff) || kickoff > nowMs;
    });
    if (hasRemaining) return week;
  }
  return weeks.length ? weeks[weeks.length - 1] + 1 : 1;
}

function getRemainingOpponents(team, scheduleMap, fromWeek) {
  const normalizedTeam = normalizeTeam(team);
  if (!normalizedTeam || !scheduleMap) return [];
  return Object.entries(scheduleMap)
    .map(([week, weekData]) => ({ week: Number(week), entry: weekData?.[normalizedTeam] }))
    .filter(({ week, entry }) => Number.isFinite(week) && week >= fromWeek && entry?.opp)
    .sort((a, b) => a.week - b.week)
    .map(({ week, entry }) => ({ week, opponent: normalizeTeam(entry.opp), home: Boolean(entry.home) }));
}

function toPercentile(sortedValues, value) {
  if (!sortedValues.length) return null;
  // Share of the league this schedule is softer than, midpoint-adjusted so ties land together.
  let below = 0;
  let equal = 0;
  for (const entry of sortedValues) {
    if (entry < value) below += 1;
    else if (entry === value) equal += 1;
  }
  return ((below + equal / 2) / sortedValues.length) * 100;
}

function getTierForPercentile(percentile) {
  if (percentile == null) return null;
  return SCHEDULE_TIERS.find((tier) => percentile <= tier.maxPercentile) ?? SCHEDULE_TIERS[SCHEDULE_TIERS.length - 1];
}

/**
 * Build the per-team, per-position schedule strength table the War Room reads.
 *
 * @param {object} options.pointsAllowedByOpponent prior-season output of buildPointsAllowedByOpponent
 * @param {object} options.upcomingScheduleMap  upcoming-season week → team → { opp }
 * @param {number} options.fromWeek             first week to count (defaults to the first unplayed week)
 */
export function buildScheduleStrengthTable({
  pointsAllowedByOpponent,
  upcomingScheduleMap,
  fromWeek = null,
  nowMs = Date.now(),
}) {
  if (!pointsAllowedByOpponent || !upcomingScheduleMap) return null;

  const startWeek = fromWeek ?? getFirstRemainingWeek(upcomingScheduleMap, nowMs);
  const allTeams = new Set();
  for (const weekData of Object.values(upcomingScheduleMap)) {
    for (const team of Object.keys(weekData ?? {})) allTeams.add(team);
  }
  if (!allTeams.size) return null;

  // Every position the league actually produced stats for — including K, DEF, and IDP slots.
  const positions = new Set();
  for (const byPosition of Object.values(pointsAllowedByOpponent)) {
    for (const position of Object.keys(byPosition ?? {})) positions.add(position);
  }

  const leagueAverageByPosition = {};
  for (const position of positions) {
    const values = Object.values(pointsAllowedByOpponent)
      .map((entry) => entry?.[position]?.avg)
      .filter((value) => Number.isFinite(value));
    leagueAverageByPosition[position] = values.length >= MIN_TEAMS_FOR_TIERING
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  }

  // Pass 1 — raw index per team/position.
  const rawByPosition = {};
  const opponentsByTeam = {};
  for (const team of allTeams) {
    const opponents = getRemainingOpponents(team, upcomingScheduleMap, startWeek);
    opponentsByTeam[team] = opponents;
    for (const position of positions) {
      const leagueAverage = leagueAverageByPosition[position];
      if (!leagueAverage) continue;
      const allowed = opponents
        .map(({ opponent }) => pointsAllowedByOpponent[opponent]?.[position]?.avg)
        .filter((value) => Number.isFinite(value));
      if (!allowed.length) continue;
      const averageAllowed = allowed.reduce((sum, value) => sum + value, 0) / allowed.length;
      if (!rawByPosition[position]) rawByPosition[position] = {};
      rawByPosition[position][team] = (averageAllowed / leagueAverage) * 100;
    }
  }

  // Pass 2 — tier each team against the league-wide spread for its position.
  const table = {};
  for (const [position, byTeam] of Object.entries(rawByPosition)) {
    const values = Object.values(byTeam);
    if (values.length < MIN_TEAMS_FOR_TIERING) continue;
    for (const [team, rawIndex] of Object.entries(byTeam)) {
      const percentile = toPercentile(values, rawIndex);
      const tier = getTierForPercentile(percentile);
      const opponents = opponentsByTeam[team] ?? [];
      if (!table[team]) table[team] = {};
      table[team][position] = {
        label: tier?.label ?? 'Neutral',
        tierKey: tier?.key ?? 'neutral',
        tone: tier?.tone ?? 'neutral',
        value: Math.round(rawIndex),
        percentile: percentile == null ? null : Math.round(percentile),
        detail: `${Math.round(rawIndex)} vs league average over ${opponents.length} game${opponents.length === 1 ? '' : 's'}`,
        opponents,
        gamesRemaining: opponents.length,
      };
    }
  }

  return { fromWeek: startWeek, byTeam: table };
}

export function getScheduleSignal(scheduleStrength, team, position) {
  const normalizedTeam = normalizeTeam(team);
  const normalizedPosition = normalizePosition(position);
  if (!scheduleStrength?.byTeam || !normalizedTeam || !normalizedPosition) return UNAVAILABLE_SCHEDULE_SIGNAL;
  return scheduleStrength.byTeam[normalizedTeam]?.[normalizedPosition] ?? UNAVAILABLE_SCHEDULE_SIGNAL;
}

/**
 * Percentile is what the Draft Rating consumes — the raw index has a spread of only a
 * few points around 100, so scoring it directly contributed almost no differentiation.
 */
export function scoreScheduleSignal(signal) {
  // Must stay null (not 0) when the signal is missing — buildDraftModelSignal drops
  // null components from the weighted average, whereas 0 would score the player as
  // having the worst schedule in the league.
  const raw = signal?.percentile;
  if (raw == null) return null;
  const percentile = Number(raw);
  return Number.isFinite(percentile) ? Math.max(0, Math.min(100, percentile)) : null;
}
