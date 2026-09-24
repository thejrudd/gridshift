/**
 * Fantasy Schedule model.
 *
 * Turns a season's worth of provider matchup rows into week-grouped pairings
 * and a single roster's week-by-week season card.
 *
 * Every field is derived from data the provider already returns: pairings and
 * completed scores come from the weekly matchup rows, while current season
 * summaries come from the roster snapshot. A week the provider has not paired
 * yet stays `null` rather than being guessed, and playoff weeks are never
 * seeded here — the bracket does not exist until the regular season ends.
 */

import { buildFantasyMatchupGroups } from './fantasyMatchups.js';
import { getFantasyLeagueMaxWeek } from './fantasySeasonWeeks.js';

// Number(null) is 0 and Number('') is 0, so absent values must be rejected
// before coercion or a missing total silently counts as a zero.
const num = (value) => {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const round1 = (value) => (num(value) == null ? null : Math.round(num(value) * 10) / 10);

const normalizeRosterId = (value) => (value == null || value === '' ? null : String(value));

/**
 * Sleeper splits season totals into a whole part and a hundredths part.
 * ESPN rosters come through the adapter already carrying `fpts` only.
 */
function rosterPoints(settings, key) {
  const whole = num(settings?.[key]);
  if (whole == null) return null;
  const decimal = num(settings?.[`${key}_decimal`]) ?? 0;
  return round1(whole + decimal / 100);
}

/**
 * Resolve the weeks a league actually plays a regular-season matchup in.
 * Anything from `playoffStartWeek` on is bracket territory: real pairings
 * exist there only once seeding is settled, so the Schedule view stops at
 * `regularSeasonWeeks` and says so instead of fetching a bracket.
 */
export function getFantasyScheduleWeekBounds(league) {
  const maxWeek = getFantasyLeagueMaxWeek(league);
  const rawPlayoffStart = num(league?.settings?.playoff_week_start);
  const playoffStartWeek = rawPlayoffStart != null
    && rawPlayoffStart >= 1
    && rawPlayoffStart <= maxWeek
    ? Math.floor(rawPlayoffStart)
    : null;
  const regularSeasonWeeks = playoffStartWeek ? playoffStartWeek - 1 : maxWeek;
  return {
    maxWeek,
    playoffStartWeek,
    regularSeasonWeeks: Math.max(0, regularSeasonWeeks),
  };
}

/**
 * Season card for one roster: record, points for, and points per game.
 * Games played is derived from the record rather than assumed from the week,
 * so a roster the provider has not scored yet reports `null` instead of a
 * division by zero.
 */
export function getFantasyRosterSeasonSummary(roster) {
  const rosterId = normalizeRosterId(roster?.roster_id);
  if (!rosterId) return null;
  const settings = roster?.settings ?? {};
  const wins = num(settings.wins) ?? 0;
  const losses = num(settings.losses) ?? 0;
  const ties = num(settings.ties) ?? 0;
  const gamesPlayed = wins + losses + ties;
  const pointsFor = rosterPoints(settings, 'fpts');
  const pointsAgainst = rosterPoints(settings, 'fpts_against');
  return {
    rosterId,
    wins,
    losses,
    ties,
    gamesPlayed,
    recordLabel: ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`,
    pointsFor,
    pointsAgainst,
    pointsPerGame: pointsFor != null && gamesPlayed > 0
      ? round1(pointsFor / gamesPlayed)
      : null,
  };
}

export function buildFantasyRosterSummaryMap(rosters) {
  return new Map(
    (rosters ?? [])
      .map((roster) => getFantasyRosterSeasonSummary(roster))
      .filter(Boolean)
      .map((summary) => [summary.rosterId, summary]),
  );
}

/**
 * The scoring gap between two teams' season averages. Null when either side
 * has not played a scored game yet — an average of nothing is not zero.
 */
export function getFantasyScheduleEdge(summary, opponentSummary) {
  const mine = num(summary?.pointsPerGame);
  const theirs = num(opponentSummary?.pointsPerGame);
  if (mine == null || theirs == null) return null;
  return round1(mine - theirs);
}

/**
 * Reconstruct one roster's season record and PPG immediately before a week.
 * Only completed earlier matchups contribute. If any earlier week is missing,
 * unpaired, or not yet scored, the snapshot is unknown rather than partial.
 */
function getFantasyRosterSummaryBeforeWeek(weeks, rosterId, week) {
  const target = normalizeRosterId(rosterId);
  const cutoffWeek = num(week);
  if (!target || cutoffWeek == null) return null;

  let wins = 0;
  let losses = 0;
  let ties = 0;
  let gamesPlayed = 0;
  let pointsFor = 0;
  let expectedWeek = 1;

  for (const entry of weeks ?? []) {
    const entryWeek = num(entry?.week);
    if (entryWeek == null) return null;
    if (entryWeek >= cutoffWeek) break;
    if (entryWeek !== expectedWeek) return null;
    expectedWeek += 1;
    if (!Array.isArray(entry.groups)) return null;

    const group = entry.groups.find((candidate) => (
      (candidate.sides ?? []).some((side) => side.rosterId === target)
    ));
    if (!group) return null;

    const side = group.sides.find((candidate) => candidate.rosterId === target);
    if (!side) return null;

    const opponents = group.sides.filter((candidate) => candidate.rosterId !== target);
    if (opponents.length === 0) continue;
    if (opponents.length !== 1 || !group.isPlayed) return null;

    const points = num(side.row?.points);
    const opponentPoints = num(opponents[0].row?.points);
    if (points == null || opponentPoints == null) return null;

    pointsFor += points;
    gamesPlayed += 1;
    if (points > opponentPoints) wins += 1;
    else if (points < opponentPoints) losses += 1;
    else ties += 1;
  }

  if (expectedWeek !== cutoffWeek) return null;

  const roundedPointsFor = round1(pointsFor);
  return {
    rosterId: target,
    wins,
    losses,
    ties,
    gamesPlayed,
    recordLabel: ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`,
    pointsFor: roundedPointsFor,
    pointsPerGame: gamesPlayed > 0 ? round1(pointsFor / gamesPlayed) : null,
  };
}

/**
 * A week's matchup row carries `points` once the provider has scored it.
 * Before that every side reads 0, which is indistinguishable from a real
 * shutout, so a week is only treated as played when it is behind the league's
 * current week AND at least one side actually posted points.
 */
function resolveWeekResult(group, currentWeek, week) {
  const isPast = num(currentWeek) != null && week < currentWeek;
  const totals = (group?.sides ?? []).map((side) => num(side?.row?.points));
  const scored = totals.some((total) => total != null && total > 0);
  return isPast && scored;
}

/**
 * Group one season of weekly matchup rows into ordered weeks of pairings.
 *
 * `matchupsByWeek` is a plain object keyed by week number. A week that is
 * absent (never fetched) and a week that came back empty (not paired yet) are
 * different states: the first is `null`, the second is an empty group list.
 */
export function buildFantasyScheduleWeeks({
  matchupsByWeek = {},
  rosters = [],
  getUserDisplayName = null,
  userRosterId = null,
  regularSeasonWeeks = 0,
  currentWeek = null,
} = {}) {
  const weeks = [];
  for (let week = 1; week <= regularSeasonWeeks; week += 1) {
    const rows = matchupsByWeek?.[week];
    if (rows == null) {
      weeks.push({ week, groups: null, isComplete: false, isCurrent: week === num(currentWeek) });
      continue;
    }
    const groups = buildFantasyMatchupGroups(rows, rosters, getUserDisplayName, userRosterId)
      .map((group) => ({
        ...group,
        week,
        isPlayed: resolveWeekResult(group, currentWeek, week),
      }));
    weeks.push({
      week,
      groups,
      isComplete: groups.length > 0 && groups.every((group) => group.isPlayed),
      isCurrent: week === num(currentWeek),
    });
  }
  return weeks;
}

/**
 * One roster's season, a row per week. A week with a single side is a fantasy
 * bye; a week the provider has not paired is `opponent: null` with
 * `isUnscheduled` set, so the view can say "not posted yet" rather than
 * implying a bye.
 */
export function buildFantasyRosterScheduleRows(weeks, rosterId) {
  const target = normalizeRosterId(rosterId);
  if (!target) return [];
  const historyCache = new Map();
  const summaryBeforeWeek = (id, week) => {
    if (!id) return null;
    const key = `${week}:${id}`;
    if (!historyCache.has(key)) {
      historyCache.set(key, getFantasyRosterSummaryBeforeWeek(weeks, id, week));
    }
    return historyCache.get(key);
  };

  return (weeks ?? []).map((entry) => {
    const base = {
      week: entry.week,
      isCurrent: entry.isCurrent,
      isPending: entry.groups == null,
      isUnscheduled: false,
      isBye: false,
      isPlayed: false,
      side: null,
      opponent: null,
      pointsFor: null,
      pointsAgainst: null,
      result: null,
    };
    if (entry.groups == null) return base;

    const group = entry.groups.find((candidate) => (
      (candidate.sides ?? []).some((side) => side.rosterId === target)
    ));
    if (!group) return { ...base, isUnscheduled: true };

    const side = group.sides.find((candidate) => candidate.rosterId === target) ?? null;
    const opponent = group.sides.find((candidate) => candidate.rosterId !== target) ?? null;
    const pointsFor = round1(num(side?.row?.points));
    const pointsAgainst = round1(num(opponent?.row?.points));
    let result = null;
    if (group.isPlayed && pointsFor != null && pointsAgainst != null) {
      if (pointsFor > pointsAgainst) result = 'W';
      else if (pointsFor < pointsAgainst) result = 'L';
      else result = 'T';
    }

    return {
      ...base,
      isBye: !opponent,
      isPlayed: group.isPlayed,
      side,
      opponent,
      selectedSummaryBefore: summaryBeforeWeek(target, entry.week),
      opponentSummaryBefore: summaryBeforeWeek(opponent?.rosterId, entry.week),
      pointsFor,
      pointsAgainst,
      result,
    };
  });
}

/**
 * Average points per game of the opponents a roster has left to play, which
 * is the only strength-of-schedule figure derivable without a projection
 * model. Opponents with no scored game yet are excluded rather than counted
 * as zero; an empty remaining slate returns null.
 */
export function getRemainingOpponentAverage(rows, summaryMap, fromWeek) {
  const start = num(fromWeek) ?? 1;
  const averages = (rows ?? [])
    .filter((row) => row.week >= start && row.opponent && !row.isPlayed)
    .map((row) => num(summaryMap?.get(row.opponent.rosterId)?.pointsPerGame))
    .filter((value) => value != null);
  if (!averages.length) return null;
  return round1(averages.reduce((total, value) => total + value, 0) / averages.length);
}

/**
 * Weeks where this roster meets an opponent it has already played, keyed by
 * week, carrying the earlier week number. Rematches are a scheduling fact,
 * not a prediction.
 */
export function buildFantasyRematchMap(rows) {
  const seen = new Map();
  const rematches = new Map();
  (rows ?? []).forEach((row) => {
    const opponentId = row.opponent?.rosterId;
    if (!opponentId) return;
    const firstWeek = seen.get(opponentId);
    if (firstWeek != null) rematches.set(row.week, firstWeek);
    else seen.set(opponentId, row.week);
  });
  return rematches;
}
