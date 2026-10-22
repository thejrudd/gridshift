/* Player drilldown view model.
   Pure shaping for the redesigned Fantasy Matchups player drilldown (Claude
   Design "Player Drilldown Dashboard"). Nothing here is a new projection or
   scoring source: weekly points come from the same calcPoints rows as the
   season average, stat rows from buildFantasyScoringBreakdown, projections
   from the shared BDL → Sleeper → GridShift chain, and play contributions
   from the existing estimated play timeline. */

import { buildFantasyScoringBreakdown } from './fantasyBreakdownRows.js';
import { getFallbackRemainingGameFraction } from './liveScoringFeed.js';
import {
  BREAKDOWN_GROUPS,
  buildDrilldownOpponentContext,
  getFantasyBreakdownGroupId,
  groupFantasyBreakdownRows,
  matchupNumber,
} from './playerMatchupPresentation.js';
import { buildProjectionContext, projectStarter } from './starterProjections.js';

export const DRILLDOWN_FORM_WEEKS = 6;
export const DRILLDOWN_STAT_ROWS = 5;
const MIN_STEP = 0.05;
const PROVIDER_SOURCES = {
  balldontlie: 'BALLDONTLIE projection',
  sleeper: 'Sleeper projection',
};

const round = (value, digits = 2) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};
const mean = values => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

/** Scored rows for one weekly stat entry under the active league scoring. */
export function scoreDrilldownEntry(entry, scoringSettings, position) {
  if (!entry) return [];
  return buildFantasyScoringBreakdown(entry, scoringSettings, position).rows ?? [];
}

/** Offensive snap share (0–100) when the provider reported both snap counts. */
export function getSnapShare(entry) {
  const player = matchupNumber(entry?.off_snp);
  const team = matchupNumber(entry?.tm_off_snp);
  if (player == null || team == null || team <= 0) return null;
  return round(Math.max(0, Math.min(1, player / team)) * 100, 0);
}

/**
 * Week rows for the form and trend charts. `gameRows` are the already-qualified
 * season rows (same rows as the season average); the drilldown's own week is
 * appended from its official total only once that game has settled.
 */
export function buildDrilldownWeeks({
  gameRows = [],
  weeklyEntries = [],
  scoringSettings,
  position,
  currentWeek,
  current = null,
  tierByWeek = null,
} = {}) {
  const entryByWeek = new Map((weeklyEntries ?? []).map(entry => [Number(entry?.week), entry]));
  const toRow = (row, entry) => ({
    week: Number(row.week),
    opponent: row.opponent ?? null,
    isHome: row.isHome ?? null,
    points: matchupNumber(row.points),
    rows: row.rows ?? scoreDrilldownEntry(entry, scoringSettings, position),
    entry: entry ?? null,
    snapShare: getSnapShare(entry),
    tier: tierByWeek?.get?.(Number(row.week)) ?? null,
  });
  const prior = (gameRows ?? [])
    .filter(row => Number(row.week) < Number(currentWeek) && matchupNumber(row.points) != null)
    .sort((left, right) => left.week - right.week)
    .map(row => toRow(row, entryByWeek.get(Number(row.week))));
  const settled = current && matchupNumber(current.points) != null
    ? toRow({ ...current, week: Number(currentWeek) }, current.entry ?? entryByWeek.get(Number(currentWeek)))
    : null;
  return { prior, current: settled };
}

/** The stat keys that carry the most fantasy points across the given row sets. */
export function selectDrilldownStatKeys(rowSets = [], limit = DRILLDOWN_STAT_ROWS) {
  const totals = new Map();
  rowSets.forEach((rows) => {
    (rows ?? []).forEach((row) => {
      const key = String(row?.statKey ?? row?.key ?? '');
      const pts = matchupNumber(row?.pts);
      if (!key || pts == null || getFantasyBreakdownGroupId(row) === 'model') return;
      const current = totals.get(key) ?? { key, label: row.label ?? key, group: getFantasyBreakdownGroupId(row), weight: 0 };
      current.weight += Math.abs(pts);
      totals.set(key, current);
    });
  });
  return [...totals.values()]
    .filter(item => item.weight > 0)
    .sort((left, right) => right.weight - left.weight || left.key.localeCompare(right.key))
    .slice(0, limit)
    .map(({ key, label, group }) => ({ key, label, group }));
}

/**
 * One week's stat line over the selected keys. Anything the selected keys do
 * not explain (bonuses, adjustments, minor stats) is kept as "Other" so the
 * rows always add up to the week's total.
 */
export function buildDrilldownStatLine({ rows = [], entry = null, statKeys = [], total = null } = {}) {
  const byKey = new Map((rows ?? []).map(row => [String(row?.statKey ?? row?.key ?? ''), row]));
  const items = statKeys.map(({ key, label, group }) => {
    const row = byKey.get(key);
    const pts = matchupNumber(row?.pts) ?? 0;
    const value = matchupNumber(row?.statVal) ?? matchupNumber(entry?.[key]) ?? (row ? null : 0);
    return { key, label, group, value, pts };
  });
  const rowTotal = (rows ?? []).reduce((sum, row) => sum + (matchupNumber(row?.pts) ?? 0), 0);
  const resolvedTotal = matchupNumber(total) ?? rowTotal;
  const other = resolvedTotal - items.reduce((sum, item) => sum + item.pts, 0);
  return {
    items,
    other: Math.abs(other) >= MIN_STEP ? round(other) : null,
    total: round(resolvedTotal),
  };
}

/** Points for one stat key (or the total when `key` is null) in a stat line. */
export function getStatLinePoints(line, key = null) {
  if (!line) return null;
  if (!key) return line.total;
  if (key === 'other') return line.other ?? 0;
  return line.items.find(item => item.key === key)?.pts ?? 0;
}

function groupSums(rows, total) {
  const sums = new Map();
  const labels = new Map();
  groupFantasyBreakdownRows(rows ?? []).forEach((group) => {
    sums.set(group.id, group.sum);
    labels.set(group.id, group.label);
  });
  const explained = [...sums.values()].reduce((sum, value) => sum + value, 0);
  const residual = matchupNumber(total) == null ? 0 : total - explained;
  if (Math.abs(residual) > 1e-9) sums.set('model', (sums.get('model') ?? 0) + residual);
  return { sums, labels };
}

function averageGroupSums(priorWeeks) {
  const labels = new Map([['model', 'Other']]);
  const averages = new Map();
  priorWeeks.forEach((week) => {
    const { sums, labels: weekLabels } = groupSums(week.rows, week.points);
    weekLabels.forEach((label, id) => { if (id !== 'model') labels.set(id, label); });
    sums.forEach((value, id) => averages.set(id, (averages.get(id) ?? 0) + value / priorWeeks.length));
  });
  return { averages, labels };
}

// The same categories as average → target points, so a deduction (turnovers)
// reads as negative on both sides instead of as a signed delta.
function shiftCategories(averages, targetSums, labels) {
  const order = [...BREAKDOWN_GROUPS.map(group => group.id).filter(id => id !== 'model'), 'model'];
  return order
    .filter(id => averages.has(id) || targetSums.has(id))
    .map((id) => {
      const average = averages.get(id) ?? 0;
      const target = targetSums.get(id) ?? 0;
      return { id, label: labels.get(id) ?? id, average: round(average), projected: round(target), change: round(target - average) };
    })
    .filter(category => Math.max(Math.abs(category.average), Math.abs(category.projected)) >= MIN_STEP);
}

/**
 * One played week against the season average by scoring category, in the
 * same average → points form as a provider projection build. `projected`
 * holds the week's points so the chart reads both the same way.
 */
export function buildWeekCategoryShift({ week = null, priorWeeks = [] } = {}) {
  const points = matchupNumber(week?.points);
  if (points == null || !priorWeeks.length || !week.rows?.length) return null;
  const { averages, labels } = averageGroupSums(priorWeeks);
  const { sums, labels: weekLabels } = groupSums(week.rows, points);
  weekLabels.forEach((label, id) => { if (id !== 'model') labels.set(id, label); });
  const categories = shiftCategories(averages, sums, labels);
  if (!categories.length) return null;
  return { categories, average: round(mean(priorWeeks.map(row => row.points))), projected: points };
}

/**
 * How the projection is reached from the season average.
 *
 * Provider projections (BALLDONTLIE, then Sleeper) are a projected stat line
 * with no published reasoning, so the bridge is the exact per-category change
 * from the player's average scoring to that projected line. GridShift's own
 * model is multiplicative, so its adjustments are attributed in a fixed order
 * (recent form → small-sample shrinkage → matchup → weather → availability)
 * and every step is the change at that point in the chain.
 */
export function buildProjectionBridge({ projection = null, projectedRows = [], priorWeeks = [] } = {}) {
  const projected = matchupNumber(projection?.projected);
  if (projected == null) return null;
  const source = projection?.factors?.source ?? null;

  if (PROVIDER_SOURCES[source]) {
    if (!priorWeeks.length || !projectedRows?.length) return null;
    const { averages, labels } = averageGroupSums(priorWeeks);
    const { sums: projectedSums, labels: projectedLabels } = groupSums(projectedRows, projected);
    projectedLabels.forEach((label, id) => { if (id !== 'model') labels.set(id, label); });
    const base = mean(priorWeeks.map(week => week.points));
    const ids = [...new Set([...averages.keys(), ...projectedSums.keys()])]
      .sort((left, right) => (left === 'model') - (right === 'model'));
    const steps = [{ id: 'base', label: 'Season avg', value: round(base), kind: 'base' }];
    let running = base;
    ids.forEach((id) => {
      const delta = (projectedSums.get(id) ?? 0) - (averages.get(id) ?? 0);
      if (id === 'model' || Math.abs(delta) < MIN_STEP) return;
      steps.push({ id, label: labels.get(id) ?? id, value: round(delta) });
      running += delta;
    });
    const remainder = projected - running;
    if (Math.abs(remainder) >= MIN_STEP) steps.push({ id: 'other', label: 'Other', value: round(remainder) });
    steps.push({ id: 'total', label: 'Projection', value: projected, kind: 'total' });
    const categories = shiftCategories(averages, projectedSums, labels);
    return {
      kind: 'provider',
      source,
      sourceLabel: PROVIDER_SOURCES[source],
      steps,
      categories,
      average: round(base),
      projected,
    };
  }

  const factors = projection?.factors ?? {};
  const season = matchupNumber(factors.seasonBase);
  const shrunk = matchupNumber(factors.shrunkBase);
  if (season == null || shrunk == null) return null;
  const recent = matchupNumber(factors.recentBase) ?? season;
  const weight = matchupNumber(factors.recentWeight) ?? 0;
  const blended = recent * weight + season * (1 - weight);
  const steps = [{ id: 'base', label: 'Season avg', value: season, kind: 'base' }];
  let running = season;
  const add = (id, label, next, { always = false } = {}) => {
    const delta = next - running;
    if (always || Math.abs(delta) >= MIN_STEP) steps.push({ id, label, value: round(delta) });
    running = next;
  };
  add('form', 'Recent form', blended, { always: true });
  add('sample', 'Sample size', shrunk);
  add('matchup', 'Matchup', running * (matchupNumber(factors.oppFactor) ?? 1), { always: true });
  if (matchupNumber(factors.snapFactor) != null && factors.snapFactor !== 1) add('usage', 'Usage trend', running * factors.snapFactor);
  add('weather', 'Weather', running * (matchupNumber(factors.weatherFactor) ?? 1), { always: true });
  const availability = matchupNumber(factors.availabilityFactor);
  if (availability != null && availability !== 1) add('availability', 'Availability', running * availability, { always: true });
  const remainder = projected - running;
  if (Math.abs(remainder) >= MIN_STEP) steps.push({ id: 'other', label: 'Rounding', value: round(remainder) });
  steps.push({ id: 'total', label: 'Projection', value: projected, kind: 'total' });
  return {
    kind: 'model',
    source,
    sourceLabel: source === 'prior-season' ? 'GridShift model · prior season' : 'GridShift model',
    steps,
  };
}

/** Share of the player's game already played, 0–1. Settled games are 1. */
export function getDrilldownElapsedFraction({ phase, scheduleEntry = null, total = null, now = Date.now() } = {}) {
  if (phase === 'final') return 1;
  if (phase !== 'live') return 0;
  const remaining = getFallbackRemainingGameFraction({ scheduleEntry, currentPoints: total, now });
  return Number.isFinite(remaining) ? Math.max(0, Math.min(1, 1 - remaining)) : 0;
}

/**
 * Scoring pace: estimated play contributions placed on the game clock. The
 * play sum is an estimate, so the official total is carried separately and the
 * chart draws any difference as a labelled stat update at "now".
 */
export function buildScoringPace({ events = [], phase, elapsed = 0, total = null, projected = null, low = null, high = null, estimate = null } = {}) {
  const final = phase === 'final';
  const nowFraction = final ? 1 : Math.max(0, Math.min(1, elapsed));
  const marks = [];
  let cumulative = 0;
  (events ?? [])
    .map(event => ({ event, progress: matchupNumber(event?.progress) }))
    .filter(({ event, progress }) => progress != null && matchupNumber(event?.pts) != null && progress <= nowFraction + 1e-6)
    .sort((left, right) => left.progress - right.progress || (left.event.order ?? 0) - (right.event.order ?? 0))
    .forEach(({ event, progress }) => {
      cumulative += Number(event.pts);
      marks.push({
        id: event.id,
        minute: round(progress * 60, 2),
        pts: Number(event.pts),
        cum: round(cumulative),
        clock: event.glance?.clock || null,
        desc: event.desc ?? 'Scoring play',
        td: event.kind === 'td',
      });
    });
  const official = matchupNumber(total);
  const projection = matchupNumber(projected);
  if (!marks.length && projection == null) return null;
  const current = official ?? round(cumulative);
  const finish = final ? current : matchupNumber(estimate) ?? (projection != null ? current + projection * (1 - nowFraction) : current);
  return {
    final,
    now: round(nowFraction * 60, 2),
    marks,
    playTotal: round(cumulative),
    total: current,
    unexplained: Math.abs(current - cumulative) >= 0.1 ? round(current - cumulative) : 0,
    estimate: round(finish, 1),
    projected: projection,
    low: matchupNumber(low),
    high: matchupNumber(high),
  };
}

/**
 * The next scheduled game: GridShift's early model estimate (no provider
 * projection exists for a future week yet) and the opponent's fantasy points
 * allowed to the position. Returns null when next week's schedule is unknown.
 */
export function buildNextWeekPreview({ playerId, players, weeklyStats, scheduleMap, scoringSettings, week } = {}) {
  const player = players?.[playerId];
  const nextWeek = Number(week) + 1;
  if (!player || !Number.isFinite(nextWeek)) return null;
  const games = scheduleMap?.[nextWeek] ?? scheduleMap?.[String(nextWeek)];
  if (!games || !Object.keys(games).length) return null;
  const entry = games[player.team] ?? null;
  if (!entry) return { week: nextWeek, bye: true };
  const context = buildProjectionContext({ weeklyStats, players, scheduleMap, scoringSettings, week: nextWeek });
  const projection = context ? projectStarter(playerId, context) : null;
  const opponentContext = entry.opp && context
    ? buildDrilldownOpponentContext({ currentDefenseTable: context.defenseTable, oppTeam: entry.opp, position: player.position, beforeWeek: nextWeek })
    : null;
  return {
    week: nextWeek,
    bye: false,
    opponent: entry.opp ?? null,
    isHome: entry.home ?? null,
    kickoff: entry.kickoff ?? entry.date ?? null,
    projected: matchupNumber(projection?.projected),
    opponentContext,
  };
}
