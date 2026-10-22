import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDrilldownStatLine,
  buildDrilldownWeeks,
  buildNextWeekPreview,
  buildProjectionBridge,
  buildScoringPace,
  buildWeekCategoryShift,
  getDrilldownElapsedFraction,
  getSnapShare,
  getStatLinePoints,
  scoreDrilldownEntry,
  selectDrilldownStatKeys,
} from '../../src/utils/playerDrilldownModel.js';

const scoring = { rec: 1, rec_yd: 0.1, rec_td: 6, rush_yd: 0.1, fum_lost: -2 };
const week = (n, stats) => ({ week: n, ...stats });
const entries = [
  week(1, { rec: 6, rec_yd: 86, off_snp: 60, tm_off_snp: 70 }),
  week(2, { rec: 7, rec_yd: 91, rec_td: 1 }),
  week(3, { rec: 4, rec_yd: 58 }),
];
const gameRows = [
  { week: 1, opponent: 'CLE', isHome: true, points: 14.6 },
  { week: 2, opponent: 'JAX', isHome: false, points: 22.1 },
  { week: 3, opponent: 'MIN', isHome: true, points: 9.8 },
];

test('week rows keep only prior qualified weeks and append a settled current week', () => {
  const { prior, current } = buildDrilldownWeeks({
    gameRows, weeklyEntries: entries, scoringSettings: scoring, position: 'WR', currentWeek: 3,
    current: { points: 9.8, opponent: 'MIN' },
    tierByWeek: new Map([[1, 'strong']]),
  });
  assert.deepEqual(prior.map(row => row.week), [1, 2]);
  assert.equal(prior[0].tier, 'strong');
  assert.equal(prior[0].snapShare, 86);
  assert.equal(current.week, 3);
  assert.equal(current.points, 9.8);
  assert.equal(buildDrilldownWeeks({ gameRows, currentWeek: 3 }).current, null);
});

test('snap share needs both snap counts', () => {
  assert.equal(getSnapShare({ off_snp: 45, tm_off_snp: 60 }), 75);
  assert.equal(getSnapShare({ off_snp: 45 }), null);
  assert.equal(getSnapShare({ off_snp: 0, tm_off_snp: 0 }), null);
});

test('stat keys are chosen by fantasy weight and stat lines always reconcile to the total', () => {
  const rows = entries.map(entry => scoreDrilldownEntry(entry, scoring, 'WR'));
  const keys = selectDrilldownStatKeys(rows, 2);
  assert.deepEqual(keys.map(key => key.key), ['rec_yd', 'rec']);
  const line = buildDrilldownStatLine({ rows: rows[1], entry: entries[1], statKeys: keys, total: 22.1 });
  assert.equal(line.total, 22.1);
  assert.equal(getStatLinePoints(line, 'rec_yd'), 9.1);
  assert.equal(line.items.find(item => item.key === 'rec').value, 7);
  // The TD is not a selected key, so it lands in Other instead of disappearing.
  assert.equal(line.other, 6);
  assert.equal(getStatLinePoints(line), 22.1);
});

test('provider projections bridge from the season average by stat category', () => {
  const prior = buildDrilldownWeeks({ gameRows, weeklyEntries: entries, scoringSettings: scoring, position: 'WR', currentWeek: 4 }).prior;
  const projectedRows = scoreDrilldownEntry({ rec: 6, rec_yd: 81, rec_td: 0.5 }, scoring, 'WR');
  const bridge = buildProjectionBridge({
    projection: { projected: 17.1, factors: { source: 'balldontlie' } },
    projectedRows,
    priorWeeks: prior,
  });
  assert.equal(bridge.kind, 'provider');
  assert.equal(bridge.sourceLabel, 'BALLDONTLIE projection');
  assert.equal(bridge.steps[0].kind, 'base');
  assert.equal(bridge.steps.at(-1).value, 17.1);
  const sum = bridge.steps.slice(0, -1).reduce((total, step) => total + step.value, 0);
  assert.ok(Math.abs(sum - 17.1) < 0.02, `steps sum to the projection (${sum})`);
  assert.ok(bridge.steps.some(step => step.label === 'Receiving'));
  // Category rows carry both ends and reconcile to the season average and projection.
  const receiving = bridge.categories.find(category => category.id === 'receiving');
  assert.ok(receiving && Math.abs(receiving.projected - receiving.average - receiving.change) < 0.02);
  const sumOf = key => bridge.categories.reduce((total, category) => total + category[key], 0);
  assert.ok(Math.abs(sumOf('average') - bridge.average) < 0.05, 'category averages sum to the season average');
  assert.ok(Math.abs(sumOf('projected') - 17.1) < 0.05, 'category projections sum to the projection');
});

test('turnovers stay negative on both ends of a provider bridge', () => {
  const qbScoring = { pass_yd: 0.04, pass_td: 4, pass_int: -2 };
  const weeks = [
    { week: 1, points: 10.8, rows: scoreDrilldownEntry({ pass_yd: 220, pass_td: 1, pass_int: 1 }, qbScoring, 'QB') },
    { week: 2, points: 6.8, rows: scoreDrilldownEntry({ pass_yd: 220, pass_td: 1, pass_int: 2 }, qbScoring, 'QB') },
  ];
  const bridge = buildProjectionBridge({
    projection: { projected: 12.8, factors: { source: 'balldontlie' } },
    projectedRows: scoreDrilldownEntry({ pass_yd: 220, pass_td: 1, pass_int: 0.5 }, qbScoring, 'QB'),
    priorWeeks: weeks,
  });
  const turnovers = bridge.categories.find(category => category.id === 'negative');
  assert.equal(turnovers.label, 'Turnovers');
  assert.equal(turnovers.average, -3);
  assert.equal(turnovers.projected, -1);
  assert.equal(turnovers.change, 2);
});

test('a played week compares with the season average by scoring category', () => {
  const qbScoring = { pass_yd: 0.04, pass_td: 4, pass_int: -2 };
  const weeks = [
    { week: 1, points: 10.8, rows: scoreDrilldownEntry({ pass_yd: 220, pass_td: 1, pass_int: 1 }, qbScoring, 'QB') },
    { week: 2, points: 6.8, rows: scoreDrilldownEntry({ pass_yd: 220, pass_td: 1, pass_int: 2 }, qbScoring, 'QB') },
  ];
  const shift = buildWeekCategoryShift({ week: weeks[0], priorWeeks: weeks });
  assert.equal(shift.average, 8.8);
  assert.equal(shift.projected, 10.8);
  const turnovers = shift.categories.find(category => category.id === 'negative');
  assert.equal(turnovers.average, -3);
  assert.equal(turnovers.projected, -2);
  const sumOf = key => shift.categories.reduce((total, category) => total + category[key], 0);
  assert.ok(Math.abs(sumOf('projected') - 10.8) < 0.05, 'categories sum to the week total');
  assert.equal(buildWeekCategoryShift({ week: weeks[0], priorWeeks: [] }), null);
  assert.equal(buildWeekCategoryShift({ week: { week: 3, points: null, rows: [] }, priorWeeks: weeks }), null);
});

test('a provider projection without history has no bridge', () => {
  assert.equal(buildProjectionBridge({ projection: { projected: 12, factors: { source: 'sleeper' } }, projectedRows: [], priorWeeks: [] }), null);
});

test('the GridShift model bridge attributes factors in a fixed order', () => {
  const bridge = buildProjectionBridge({
    projection: {
      projected: 15.5,
      factors: { source: 'current-season', seasonBase: 16, recentBase: 18, recentWeight: 0.5, shrunkBase: 16.8, oppFactor: 0.95, weatherFactor: 1, snapFactor: 1, locationFactor: 1, availabilityFactor: 0.97 },
    },
  });
  assert.equal(bridge.kind, 'model');
  assert.deepEqual(bridge.steps.map(step => step.label), ['Season avg', 'Recent form', 'Sample size', 'Matchup', 'Weather', 'Availability', 'Projection']);
  assert.equal(bridge.steps[1].value, 1);
  assert.equal(bridge.steps[2].value, -0.2);
  assert.equal(bridge.steps[3].value, -0.84);
  assert.equal(bridge.steps[4].value, 0);
  assert.ok(!bridge.steps.some(step => /home|away/i.test(step.label)));
  const sum = bridge.steps.slice(0, -1).reduce((total, step) => total + step.value, 0);
  assert.ok(Math.abs(sum - 15.5) < 0.06);
});

test('scoring pace places plays on the clock and keeps the official total separate', () => {
  const events = [
    { id: 'b', progress: 0.5, pts: 4, glance: { clock: 'Q3 15:00' }, desc: 'Catch' },
    { id: 'a', progress: 0.25, pts: 2, glance: { clock: 'Q2 15:00' }, desc: 'Catch', kind: 'td' },
    { id: 'c', progress: 0.9, pts: 9, desc: 'Later' },
  ];
  const pace = buildScoringPace({ events, phase: 'live', elapsed: 0.6, total: 6.5, projected: 18, estimate: 14.1 });
  assert.deepEqual(pace.marks.map(mark => mark.id), ['a', 'b']);
  assert.equal(pace.marks[0].minute, 15);
  assert.equal(pace.marks[0].td, true);
  assert.equal(pace.marks[1].cum, 6);
  assert.equal(pace.now, 36);
  assert.equal(pace.total, 6.5);
  assert.equal(pace.unexplained, 0.5);
  assert.equal(pace.estimate, 14.1);
  const final = buildScoringPace({ events, phase: 'final', total: 15, projected: 18 });
  assert.equal(final.marks.length, 3);
  assert.equal(final.estimate, 15);
  assert.equal(buildScoringPace({ events: [], phase: 'final', total: 3 }), null);
});

test('elapsed fraction is zero before kickoff and one when settled', () => {
  assert.equal(getDrilldownElapsedFraction({ phase: 'pregame' }), 0);
  assert.equal(getDrilldownElapsedFraction({ phase: 'final' }), 1);
});

test('next-week preview reports a bye and unknown schedules', () => {
  const players = { p: { position: 'WR', team: 'CIN' } };
  assert.deepEqual(buildNextWeekPreview({ playerId: 'p', players, weeklyStats: {}, scheduleMap: { 8: { BAL: { opp: 'PIT' } } }, scoringSettings: scoring, week: 7 }), { week: 8, bye: true });
  assert.equal(buildNextWeekPreview({ playerId: 'p', players, weeklyStats: {}, scheduleMap: {}, scoringSettings: scoring, week: 7 }), null);
  const preview = buildNextWeekPreview({ playerId: 'p', players, weeklyStats: { p: entries }, scheduleMap: { 8: { CIN: { opp: 'BAL', home: true } } }, scoringSettings: scoring, week: 7 });
  assert.equal(preview.opponent, 'BAL');
  assert.equal(preview.isHome, true);
  assert.equal(preview.bye, false);
});
