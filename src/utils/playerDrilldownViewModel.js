// View models for the redesigned player matchup drilldown (Claude Design
// "Player drilldown" prototype). Every function here is pure and only
// reshapes data GridShift already has: league-scored weekly breakdowns, the
// shared projection, defense splits and the play timeline. Nothing is invented;
// a block whose inputs are missing returns null and is not rendered.
import { buildFantasyScoringBreakdown } from './fantasyBreakdownRows.js';
import { parseGlanceProgress } from './livePlaysFeed.js';
import { getDefenseStrength } from './projectionEngine.js';
import { buildProjectionContext, projectStarter } from './starterProjections.js';

const finite = (value) => {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;
const OTHER_KEY = '__other';

export const PROVIDER_PROJECTION_LABELS = Object.freeze({
  balldontlie: 'BDL projection',
  sleeper: 'Sleeper projection',
});

/** League-scored breakdown rows for one weekly stat entry, keyed by stat. */
export function scoreWeekEntry(entry, scoringSettings, position) {
  if (!entry) return null;
  const { rows, total } = buildFantasyScoringBreakdown(entry, scoringSettings, position);
  const byKey = {};
  rows.forEach((row) => {
    const key = row.statKey ?? row.key;
    if (!key) return;
    const current = byKey[key] ?? { key, label: row.label, stat: null, pts: 0 };
    current.pts += finite(row.pts) ?? 0;
    const stat = finite(row.statVal);
    if (stat != null) current.stat = (current.stat ?? 0) + stat;
    byKey[key] = current;
  });
  return { rows, total: finite(total), byKey };
}

/** Breakdown rows folded into { [statKey]: { key, label, stat, pts } }. */
export function byKeyFromRows(rows = []) {
  const byKey = {};
  rows.forEach((row) => {
    const key = row.statKey ?? row.key;
    if (!key) return;
    const current = byKey[key] ?? { key, label: row.label, stat: null, pts: 0 };
    current.pts += finite(row.pts) ?? 0;
    const stat = finite(row.statVal);
    if (stat != null) current.stat = (current.stat ?? 0) + stat;
    byKey[key] = current;
  });
  return byKey;
}

/**
 * Prior weekly entries that count as games for the season average. When the
 * defense-performance model supplies its qualifying weeks they are used
 * verbatim so every season-average figure in the drilldown agrees.
 */
export function selectPriorGames({ weeklyRows = [], week, gameWeeks = null }) {
  const allowed = gameWeeks ? new Set(gameWeeks.map(Number)) : null;
  return (weeklyRows ?? [])
    .filter((entry) => Number(entry?.week) < Number(week))
    .filter((entry) => (allowed ? allowed.has(Number(entry.week)) : true))
    .sort((left, right) => left.week - right.week);
}

/** Per-stat season averages (points and raw stat) across scored games. */
export function averageScoredGames(scoredGames = []) {
  if (!scoredGames.length) return null;
  const byKey = {};
  let total = 0;
  scoredGames.forEach((game) => {
    total += game.total ?? 0;
    Object.values(game.byKey).forEach((row) => {
      const current = byKey[row.key] ?? { key: row.key, label: row.label, stat: 0, pts: 0 };
      current.pts += row.pts;
      current.stat += row.stat ?? 0;
      byKey[row.key] = current;
    });
  });
  const games = scoredGames.length;
  Object.values(byKey).forEach((row) => {
    row.pts /= games;
    row.stat /= games;
  });
  return { games, total: total / games, byKey };
}

/**
 * Season average → projection, as signed point steps.
 *
 * Provider projections (BDL first, then Sleeper) publish a stat line but no
 * reasoning, so their bridge is the per-stat difference between the player's
 * league-scored season average and the provider's projected line. The steps
 * add up exactly, with no ordering assumption.
 *
 * GridShift's own model multiplies its baseline by factors. Its bridge applies
 * them in a fixed order (recent form → sample size → matchup → weather →
 * availability) so each step is the point change at that stage.
 */
export function buildProjectionBridge({
  projection,
  projectedBreakdown = null,
  seasonAverage = null,
  maxSteps = 4,
} = {}) {
  const projected = finite(projection?.projected);
  if (projected == null) return null;
  const factors = projection?.factors ?? {};
  const providerLabel = PROVIDER_PROJECTION_LABELS[factors.source];

  if (providerLabel) {
    if (!seasonAverage?.games || !projectedBreakdown?.rows?.length) return null;
    const projectedByKey = byKeyFromRows(projectedBreakdown.rows);
    const total = finite(projectedBreakdown.total) ?? projected;
    const keys = new Set([...Object.keys(seasonAverage.byKey), ...Object.keys(projectedByKey)]);
    const deltas = [...keys].map((key) => ({
      key,
      label: projectedByKey[key]?.label ?? seasonAverage.byKey[key]?.label ?? key,
      value: (projectedByKey[key]?.pts ?? 0) - (seasonAverage.byKey[key]?.pts ?? 0),
    })).filter((row) => Math.abs(row.value) >= 0.005)
      .sort((left, right) => Math.abs(right.value) - Math.abs(left.value));
    const shown = deltas.slice(0, maxSteps);
    const rest = deltas.slice(maxSteps).reduce((sum, row) => sum + row.value, 0);
    if (Math.abs(rest) >= 0.05) shown.push({ key: OTHER_KEY, label: 'Other stats', value: rest });
    // Keep the bridge closed exactly on the displayed projection.
    const drift = total - seasonAverage.total - shown.reduce((sum, row) => sum + row.value, 0);
    if (Math.abs(drift) >= 0.005 && shown.length) shown[shown.length - 1].value += drift;
    return {
      kind: 'stat-line',
      source: factors.source,
      sourceLabel: providerLabel,
      baseLabel: 'Season avg',
      base: seasonAverage.total,
      steps: shown.map((row) => ({ ...row, value: round2(row.value) })),
      total,
      games: seasonAverage.games,
    };
  }

  const season = finite(factors.seasonBase);
  if (season == null) return null;
  const recent = finite(factors.recentBase);
  const recentWeight = finite(factors.recentWeight);
  const shrunk = finite(factors.shrunkBase);
  const blended = recent != null && recentWeight != null
    ? recent * recentWeight + season * (1 - recentWeight)
    : season;
  const steps = [];
  let running = season;
  const push = (key, label, next, { always = false } = {}) => {
    const value = next - running;
    if (always || Math.abs(value) >= 0.05) steps.push({ key, label, value });
    running = next;
  };
  push('form', 'Recent form', blended);
  if (shrunk != null) push('sample', 'Sample size', shrunk);
  [
    ['matchup', 'Matchup', finite(factors.oppFactor), true],
    ['location', 'Home / away', finite(factors.locationFactor), false],
    ['weather', 'Weather', finite(factors.weatherFactor), true],
    ['snaps', 'Snap trend', finite(factors.snapFactor), false],
    ['availability', 'Availability', finite(factors.availabilityFactor), false],
  ].forEach(([key, label, factor, always]) => {
    if (factor == null) return;
    push(key, label, running * factor, { always });
  });
  // Factors are stored at two decimals; fold that rounding into the last step
  // so the bridge lands on the projection the rest of the app shows.
  const drift = projected - running;
  if (Math.abs(drift) >= 0.005) {
    const last = [...steps].reverse().find((step) => step.value !== 0) ?? steps[steps.length - 1];
    if (last) last.value += drift;
  }
  return {
    kind: 'factors',
    source: factors.source ?? 'current-season',
    sourceLabel: factors.source === 'prior-season' ? 'GridShift model · prior season' : 'GridShift model',
    baseLabel: factors.source === 'prior-season' ? 'Prior-season avg' : 'Season avg',
    base: season,
    steps: steps.map((step) => ({ ...step, value: round2(step.value) })),
    total: projected,
    games: null,
  };
}

const SHORT_STAT_LABELS = {
  pass_yd: 'pass yds', pass_td: 'pass TD', pass_int: 'INT', rush_yd: 'rush yds', rush_td: 'rush TD',
  rush_att: 'car', rec: 'rec', rec_yd: 'yds', rec_td: 'TD', fgm: 'FG', xpm: 'XP', fum_lost: 'fum lost',
};

/** Compact "6 rec · 86 yds · 1 TD" line from the three biggest scoring stats. */
export function buildShortStatLine(byKey = {}, limit = 3) {
  return Object.values(byKey)
    .filter((row) => row.stat != null && row.stat !== 0 && Math.abs(row.pts) >= 0.05)
    .sort((left, right) => Math.abs(right.pts) - Math.abs(left.pts))
    .slice(0, limit)
    .map((row) => `${Number.isInteger(row.stat) ? row.stat : round1(row.stat)} ${SHORT_STAT_LABELS[row.key] ?? row.label}`)
    .join(' · ');
}

function scheduleOpponent(scheduleMap, week, team, entry) {
  const sched = team ? scheduleMap?.[week]?.[team] : null;
  const opp = sched?.opp ?? (entry?.opp ? String(entry.opp).toUpperCase() : null);
  if (!opp) return null;
  const home = sched?.home ?? (entry?.home == null ? null : entry.home === 1 || entry.home === true);
  return { opp, home, label: home === false ? `@${opp}` : opp };
}

function gameResult(scheduleMap, week, team) {
  const sched = team ? scheduleMap?.[week]?.[team] : null;
  const pf = finite(sched?.ptsFor);
  const pa = finite(sched?.ptsAgainst);
  if (pf == null || pa == null) return null;
  return `${pf > pa ? 'W' : pf < pa ? 'L' : 'T'} ${pf}–${pa}`;
}

/** Scored past games with opponent, defense tier, result and a short stat line. */
export function buildSeasonGames({ priorEntries = [], scoringSettings, position, scheduleMap, team, tierByWeek = {} }) {
  return priorEntries.map((entry) => {
    const scored = scoreWeekEntry(entry, scoringSettings, position);
    const opponent = scheduleOpponent(scheduleMap, entry.week, team, entry);
    return {
      week: Number(entry.week),
      opp: opponent?.label ?? '—',
      oppTeam: opponent?.opp ?? null,
      home: opponent?.home ?? null,
      points: scored?.total ?? 0,
      byKey: scored?.byKey ?? {},
      tier: tierByWeek[entry.week] ?? null,
      result: gameResult(scheduleMap, entry.week, team),
      line: buildShortStatLine(scored?.byKey),
    };
  }).filter((game) => game.points != null);
}

const STAT_COLOR_TOKENS = ['--pdd-st-1', '--pdd-st-2', '--pdd-st-3', '--pdd-st-4'];

/**
 * Week columns for the linked Recent form / stat line pair.
 * Pregame: last six games plus this week's projected line as a ghost column.
 * Final: the five games before this week plus this week's settled line.
 */
export function buildWeekColumns({
  mode,
  seasonGames = [],
  week,
  opponentLabel = null,
  projectedBreakdown = null,
  projectedTotal = null,
  actualBreakdown = null,
  actualTotal = null,
  seasonAverage = null,
  maxStats = 4,
}) {
  const pastCount = mode === 'final' ? 5 : 6;
  const past = seasonGames.slice(-pastCount).map((game) => ({ ...game, kind: 'past' }));
  const columns = [...past];
  if (mode === 'pregame') {
    const total = finite(projectedBreakdown?.total) ?? finite(projectedTotal);
    if (total != null) {
      columns.push({
        week: Number(week), opp: opponentLabel ?? '—', kind: 'projected', points: total,
        byKey: projectedBreakdown?.rows?.length ? byKeyFromRows(projectedBreakdown.rows) : null,
      });
    }
  } else if (mode === 'final' && finite(actualTotal) != null) {
    columns.push({
      week: Number(week), opp: opponentLabel ?? '—', kind: 'current', points: finite(actualTotal),
      byKey: byKeyFromRows(actualBreakdown?.rows ?? []),
    });
  }
  if (!columns.length) return null;

  const weight = {};
  columns.forEach((column) => Object.values(column.byKey ?? {}).forEach((row) => {
    const current = weight[row.key] ?? { key: row.key, label: row.label, sum: 0 };
    current.sum += Math.abs(row.pts);
    weight[row.key] = current;
  }));
  const stats = Object.values(weight)
    .filter((row) => row.sum >= 0.05)
    .sort((left, right) => right.sum - left.sum)
    .slice(0, maxStats)
    .map((row, index) => ({ key: row.key, label: row.label, color: STAT_COLOR_TOKENS[index] }));
  const statKeys = new Set(stats.map((stat) => stat.key));
  const otherOf = (column) => (column.byKey
    ? column.points - Object.values(column.byKey).filter((row) => statKeys.has(row.key)).reduce((sum, row) => sum + row.pts, 0)
    : null);
  if (columns.some((column) => Math.abs(otherOf(column) ?? 0) >= 0.05)) {
    stats.push({ key: OTHER_KEY, label: 'Other', color: '--color-label-tertiary' });
  }
  const cell = (column, key) => {
    if (key == null) return { pts: column.points, stat: null };
    if (!column.byKey) return null;
    if (key === OTHER_KEY) return { pts: otherOf(column), stat: null };
    const row = column.byKey[key];
    return { pts: row?.pts ?? 0, stat: row?.stat ?? 0 };
  };
  const averageOf = (key) => {
    if (!seasonAverage) return null;
    if (key == null) return seasonAverage.total;
    if (key === OTHER_KEY) {
      return seasonAverage.total - Object.values(seasonAverage.byKey)
        .filter((row) => statKeys.has(row.key)).reduce((sum, row) => sum + row.pts, 0);
    }
    return seasonAverage.byKey[key]?.pts ?? 0;
  };
  const averageStatOf = (key) => (key && key !== OTHER_KEY ? seasonAverage?.byKey?.[key]?.stat ?? 0 : null);
  return { mode, columns, stats, cell, averageOf, averageStatOf, focusWeek: Number(week) };
}

/** Snap, target and carry shares by week, from Sleeper weekly team totals. */
export function buildUsageModel({ playerId, position, team, weeklyStats = {}, players = {}, weeks = [], seasonWeeks = [] }) {
  const own = weeklyStats?.[playerId] ?? [];
  const ownByWeek = new Map(own.map((entry) => [Number(entry.week), entry]));
  const wanted = new Set([...weeks, ...seasonWeeks].map(Number));
  const teamTotals = new Map();
  const needTeamTotals = ['RB', 'WR', 'TE', 'QB'].includes(position);
  if (needTeamTotals && team) {
    Object.entries(weeklyStats ?? {}).forEach(([id, rows]) => {
      (rows ?? []).forEach((entry) => {
        const wk = Number(entry?.week);
        if (!wanted.has(wk)) return;
        const rowTeam = String(entry.team ?? players?.[id]?.team ?? '').toUpperCase();
        if (rowTeam !== String(team).toUpperCase()) return;
        const totals = teamTotals.get(wk) ?? { tgt: 0, att: 0 };
        totals.tgt += finite(entry.rec_tgt) ?? 0;
        totals.att += finite(entry.rush_att) ?? 0;
        teamTotals.set(wk, totals);
      });
    });
  }
  const metrics = [
    { key: 'snaps', label: 'Snaps', sub: 'snap share', read: (entry) => {
      const mine = finite(entry?.off_snp);
      const all = finite(entry?.tm_off_snp);
      return mine != null && all > 0 ? (100 * mine) / all : null;
    } },
    ['RB', 'WR', 'TE'].includes(position) && { key: 'targets', label: 'Targets', sub: 'team target share', read: (entry, wk) => {
      const all = teamTotals.get(wk)?.tgt;
      return all > 0 ? (100 * (finite(entry?.rec_tgt) ?? 0)) / all : null;
    } },
    ['RB', 'QB'].includes(position) && { key: 'carries', label: 'Carries', sub: 'team carry share', read: (entry, wk) => {
      const all = teamTotals.get(wk)?.att;
      return all > 0 ? (100 * (finite(entry?.rush_att) ?? 0)) / all : null;
    } },
  ].filter(Boolean).map((metric) => {
    const byWeek = {};
    [...wanted].forEach((wk) => {
      const entry = ownByWeek.get(wk);
      if (!entry) return;
      const value = metric.read(entry, wk);
      if (value != null) byWeek[wk] = Math.round(value);
    });
    const seasonValues = seasonWeeks.map((wk) => byWeek[wk]).filter((value) => value != null);
    return {
      key: metric.key,
      label: metric.label,
      sub: metric.sub,
      byWeek,
      average: seasonValues.length ? seasonValues.reduce((sum, value) => sum + value, 0) / seasonValues.length : null,
    };
  }).filter((metric) => weeks.filter((wk) => metric.byWeek[wk] != null).length >= 2 && metric.average != null);
  return metrics.length ? metrics : null;
}

/**
 * Cumulative estimated play points against game time (0–60 minutes). The line
 * is built from estimated play contributions, so it can differ from the
 * official total; the hero number stays authoritative.
 */
export function buildPaceModel({ events = [], final = false, elapsedFraction = null, projected = null, low = null, high = null, estimatedFinish = null }) {
  let cum = 0;
  const marks = [];
  events.forEach((event) => {
    const progress = finite(event?.progress) ?? parseGlanceProgress(event?.glance?.clock);
    const pts = finite(event?.pts);
    if (progress == null || pts == null) return;
    cum += pts;
    marks.push({
      id: event.id,
      min: progress * 60,
      clock: event?.glance?.clock ?? '',
      desc: event.desc ?? 'Play',
      pts,
      cum: round2(cum),
      td: ['pass_td', 'rush_td', 'rec_td'].some((key) => (finite(event?.stats?.[key]) ?? 0) > 0)
        || /touchdown|\bTD\b/i.test(String(event.desc ?? '')),
    });
  });
  const lastMark = marks.length ? marks[marks.length - 1].min : 0;
  const elapsed = final ? 60 : Math.max(lastMark, Math.min(60, (finite(elapsedFraction) ?? 0) * 60));
  if (!final && !marks.length && elapsed <= 0) return null;
  const proj = finite(projected);
  const est = final ? cum : finite(estimatedFinish) ?? (proj != null ? cum + (proj * (60 - elapsed)) / 60 : cum);
  return {
    final, marks, now: elapsed, cum: round2(cum), est: round2(est), projected: proj,
    low: finite(low), high: finite(high),
  };
}

/**
 * Up to four raw-stat rings: actual against the projected line when one
 * exists, otherwise against the season average.
 */
export function buildStatRings({ actualBreakdown = null, projectedBreakdown = null, seasonAverage = null, limit = 4 }) {
  const actual = byKeyFromRows(actualBreakdown?.rows ?? []);
  const projected = projectedBreakdown?.rows?.length ? byKeyFromRows(projectedBreakdown.rows) : null;
  const basis = projected ?? seasonAverage?.byKey ?? null;
  if (!basis) return null;
  const rings = Object.values(basis)
    .filter((row) => row.stat != null && row.stat > 0 && row.pts > 0)
    .sort((left, right) => right.pts - left.pts)
    .slice(0, limit)
    .map((row) => ({
      key: row.key,
      label: row.label,
      value: actual[row.key]?.stat ?? 0,
      target: row.stat,
      targetLabel: projected ? 'proj' : 'avg',
    }));
  return rings.length ? rings : null;
}

/** Season average before this week and after including it. */
export function buildSeasonAverageShift({ seasonGames = [], weekPoints = null }) {
  const points = finite(weekPoints);
  if (!seasonGames.length || points == null) return null;
  const before = seasonGames.reduce((sum, game) => sum + game.points, 0) / seasonGames.length;
  const after = (before * seasonGames.length + points) / (seasonGames.length + 1);
  return { before, after, delta: after - before };
}

/** Rank of `oppTeam` among defenses by fantasy points allowed to `position` (1 = fewest). */
export function rankDefenseAgainstPosition(defenseTable, oppTeam, position, beforeWeek) {
  if (!defenseTable || !oppTeam) return null;
  const rows = Object.keys(defenseTable)
    .map((team) => ({ team, strength: getDefenseStrength(defenseTable, team, position, beforeWeek) }))
    .filter((row) => row.strength?.ptsAllowedPerGame != null)
    .sort((left, right) => left.strength.ptsAllowedPerGame - right.strength.ptsAllowedPerGame);
  const index = rows.findIndex((row) => row.team === String(oppTeam).toUpperCase());
  if (index < 0) return null;
  return { rank: index + 1, teamCount: rows.length, perGame: rows[index].strength.ptsAllowedPerGame };
}

/**
 * Next week's early projection from GridShift's own model (provider
 * projections only exist for the current week) and the opponent's rank.
 */
export function buildNextWeekOutlook({ playerId, position, team, week, weeklyStats, players, scheduleMap, scoringSettings }) {
  const nextWeek = Number(week) + 1;
  const sched = team ? scheduleMap?.[nextWeek]?.[team] : null;
  if (!sched?.opp) return null;
  const context = buildProjectionContext({ weeklyStats, players, scheduleMap, scoringSettings, week: nextWeek });
  if (!context) return null;
  const projection = projectStarter(playerId, context);
  const defense = rankDefenseAgainstPosition(context.defenseTable, sched.opp, position, nextWeek);
  if (finite(projection?.projected) == null && !defense) return null;
  return {
    week: nextWeek,
    opp: sched.opp,
    home: sched.home ?? null,
    kickoff: sched.kickoff ?? null,
    projected: finite(projection?.projected),
    defense,
  };
}
