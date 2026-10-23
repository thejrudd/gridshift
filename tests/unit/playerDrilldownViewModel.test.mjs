import test from 'node:test';
import assert from 'node:assert/strict';
import {
  averageScoredGames,
  buildPaceModel,
  buildProjectionBridge,
  buildSeasonAverageShift,
  buildSeasonGames,
  buildStatRings,
  buildUsageModel,
  buildWeekColumns,
  byKeyFromRows,
  scoreWeekEntry,
  selectPriorGames,
} from '../../src/utils/playerDrilldownViewModel.js';
import { buildPlayerProjectionBreakdown } from '../../src/utils/playerMatchupPresentation.js';

const SCORING = { rec: 1, rec_yd: 0.1, rec_td: 6, rush_yd: 0.1, fum_lost: -2 };
const weekly = [
  { week: 1, rec: 6, rec_yd: 86, opp: 'CLE' },
  { week: 2, rec: 7, rec_yd: 91, rec_td: 1, opp: 'JAX' },
  { week: 3, rec: 4, rec_yd: 58, opp: 'MIN' },
  { week: 4, rec: 7, rec_yd: 114, opp: 'DEN' },
];
const close = (actual, expected, digits = 2) => assert.equal(Number(actual.toFixed(digits)), Number(expected.toFixed(digits)));
const scored = () => selectPriorGames({ weeklyRows: weekly, week: 5 }).map(entry => scoreWeekEntry(entry, SCORING, 'WR'));

test('season average folds league-scored games by stat', () => {
  const average = averageScoredGames(scored());
  assert.equal(average.games, 4);
  close(average.total, (14.6 + 22.1 + 9.8 + 18.4) / 4);
  close(average.byKey.rec_td.pts, 1.5);
  close(average.byKey.rec_yd.stat, (86 + 91 + 58 + 114) / 4);
});

test('prior games respect the qualifying-week list and exclude the current week', () => {
  const rows = selectPriorGames({ weeklyRows: [...weekly, { week: 5, rec: 9 }], week: 5, gameWeeks: [1, 3] });
  assert.deepEqual(rows.map(row => row.week), [1, 3]);
});

test('provider bridge is the per-stat difference and closes on the provider total', () => {
  const average = averageScoredGames(scored());
  const projection = { projected: 17.8, projectedStats: { rec: 6.4, rec_yd: 81, rec_td: 0.5 }, factors: { source: 'balldontlie' } };
  const projectedBreakdown = buildPlayerProjectionBreakdown(projection, SCORING, 'WR');
  const bridge = buildProjectionBridge({ projection, projectedBreakdown, seasonAverage: average });
  assert.equal(bridge.kind, 'stat-line');
  assert.equal(bridge.sourceLabel, 'BDL projection');
  const sum = bridge.base + bridge.steps.reduce((total, step) => total + step.value, 0);
  close(sum, bridge.total, 1);
  close(bridge.total, 17.8, 1);
});

test('provider bridge needs a season sample and a projected stat line', () => {
  const projection = { projected: 12, factors: { source: 'sleeper' } };
  assert.equal(buildProjectionBridge({ projection, projectedBreakdown: null, seasonAverage: null }), null);
});

test('GridShift bridge applies factors in fixed order and lands on the projection', () => {
  const projection = {
    projected: 16.4,
    factors: { seasonBase: 15, recentBase: 18, recentWeight: 0.5, shrunkBase: 16.2, oppFactor: 1.05, locationFactor: 1, weatherFactor: 0.97, snapFactor: 1 },
  };
  const bridge = buildProjectionBridge({ projection });
  assert.equal(bridge.kind, 'factors');
  assert.equal(bridge.sourceLabel, 'GridShift model');
  assert.deepEqual(bridge.steps.map(step => step.key), ['form', 'sample', 'matchup', 'weather']);
  close(bridge.steps[0].value, 1.5);
  const sum = bridge.base + bridge.steps.reduce((total, step) => total + step.value, 0);
  close(sum, 16.4, 2);
});

test('GridShift bridge keeps a neutral weather step but drops disabled factors', () => {
  const bridge = buildProjectionBridge({ projection: { projected: 15, factors: { seasonBase: 15, oppFactor: 1, weatherFactor: 1, locationFactor: 1, snapFactor: 1 } } });
  assert.deepEqual(bridge.steps.map(step => step.key), ['matchup', 'weather']);
  assert.ok(bridge.steps.every(step => step.value === 0));
});

test('week columns add a projected ghost pregame and the settled week at final', () => {
  const games = buildSeasonGames({ priorEntries: selectPriorGames({ weeklyRows: weekly, week: 5 }), scoringSettings: SCORING, position: 'WR', scheduleMap: null, team: 'CIN' });
  const average = averageScoredGames(scored());
  const projection = { projected: 17.8, projectedStats: { rec: 6.4, rec_yd: 81, rec_td: 0.5 }, factors: { source: 'balldontlie' } };
  const pre = buildWeekColumns({ mode: 'pregame', seasonGames: games, week: 5, projectedBreakdown: buildPlayerProjectionBreakdown(projection, SCORING, 'WR'), seasonAverage: average });
  assert.equal(pre.columns.at(-1).kind, 'projected');
  assert.equal(pre.columns.length, 5);
  assert.ok(pre.stats.some(stat => stat.key === 'rec_yd'));
  close(pre.cell(pre.columns[0], 'rec_yd').pts, 8.6);
  close(pre.averageOf(null), average.total);

  const actual = scoreWeekEntry({ week: 5, rec: 8, rec_yd: 120, rec_td: 1 }, SCORING, 'WR');
  const fin = buildWeekColumns({ mode: 'final', seasonGames: games, week: 5, actualBreakdown: actual, actualTotal: actual.total, seasonAverage: average });
  assert.equal(fin.columns.at(-1).kind, 'current');
  close(fin.cell(fin.columns.at(-1), null).pts, 26);
});

test('pace model accumulates estimated plays on the game clock', () => {
  const events = [
    { id: 'a', pts: 1.8, progress: 0.05, glance: { clock: 'Q1 12:00' }, desc: '8-yd catch' },
    { id: 'b', pts: 9.4, progress: 0.8, glance: { clock: 'Q4 12:00' }, desc: '24-yd touchdown catch', stats: { rec_td: 1 } },
  ];
  const live = buildPaceModel({ events: events.slice(0, 1), elapsedFraction: 0.5, projected: 18 });
  close(live.now, 30);
  close(live.est, 1.8 + 9);
  const final = buildPaceModel({ events, final: true, projected: 18 });
  assert.equal(final.now, 60);
  close(final.cum, 11.2);
  assert.equal(final.marks[1].td, true);
});

test('stat rings compare actual stats with the projected line', () => {
  const projection = { projected: 17.8, projectedStats: { rec: 6.4, rec_yd: 81, rec_td: 0.5 }, factors: { source: 'balldontlie' } };
  const actual = scoreWeekEntry({ week: 5, rec: 5, rec_yd: 79 }, SCORING, 'WR');
  const rings = buildStatRings({ actualBreakdown: actual, projectedBreakdown: buildPlayerProjectionBreakdown(projection, SCORING, 'WR') });
  const yards = rings.find(ring => ring.key === 'rec_yd');
  assert.equal(yards.value, 79);
  close(yards.target, 81);
  assert.equal(rings.find(ring => ring.key === 'rec_td').value, 0);
});

test('usage shares come from weekly team totals and need two weeks', () => {
  const weeklyStats = {
    me: [{ week: 1, off_snp: 60, tm_off_snp: 70, rec_tgt: 8, team: 'CIN' }, { week: 2, off_snp: 63, tm_off_snp: 70, rec_tgt: 10, team: 'CIN' }],
    mate: [{ week: 1, rec_tgt: 24, team: 'CIN' }, { week: 2, rec_tgt: 30, team: 'CIN' }],
  };
  const usage = buildUsageModel({ playerId: 'me', position: 'WR', team: 'CIN', weeklyStats, players: {}, weeks: [1, 2], seasonWeeks: [1, 2] });
  const snaps = usage.find(metric => metric.key === 'snaps');
  assert.equal(snaps.byWeek[1], 86);
  const targets = usage.find(metric => metric.key === 'targets');
  assert.equal(targets.byWeek[1], 25);
  assert.equal(buildUsageModel({ playerId: 'me', position: 'WR', team: 'CIN', weeklyStats, players: {}, weeks: [1], seasonWeeks: [1] }), null);
});

test('season average shift includes the settled week', () => {
  const shift = buildSeasonAverageShift({ seasonGames: [{ points: 10 }, { points: 20 }], weekPoints: 30 });
  close(shift.before, 15);
  close(shift.after, 20);
});

test('byKeyFromRows merges rows by stat key', () => {
  const byKey = byKeyFromRows([{ statKey: 'rec', label: 'Reception', statVal: 3, pts: 3 }, { statKey: 'rec', label: 'Reception', statVal: 1, pts: 1 }]);
  assert.equal(byKey.rec.pts, 4);
  assert.equal(byKey.rec.stat, 4);
});
