import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPartialPlayStats,
  getYardageProgress,
  reconcileFantasyTickerPoints,
  selectViewerFantasyReplay,
} from '../../src/utils/nflPlays/playRecapFraming.js';

const PPR = { rec_yd: 0.1, rec: 1, rec_td: 6, rush_yd: 0.1, rush_td: 6, pass_yd: 0.04, pass_td: 4 };
const catchOnly = new Set(['catch']);
const scored = new Set(['catch', 'score']);

test('yardage accrues a yard at a time, in whole yards', () => {
  const stats = { rec_yd: 10, rec: 1 };
  const at3 = buildPartialPlayStats(stats, { yardsSoFar: 3, totalYards: 10, fired: catchOnly });
  assert.equal(at3.rec_yd, 3);
  // Never a fraction of a yard partway between.
  const at7 = buildPartialPlayStats(stats, { yardsSoFar: 7.6, totalYards: 10, fired: catchOnly });
  assert.equal(at7.rec_yd, 7);
});

test('a reception lands whole at the catch, not spread across it', () => {
  const stats = { rec_yd: 10, rec: 1 };
  const beforeCatch = buildPartialPlayStats(stats, { yardsSoFar: 0, totalYards: 10, fired: new Set() });
  assert.equal(beforeCatch.rec, undefined, 'the reception counted before it was caught');
  const afterCatch = buildPartialPlayStats(stats, { yardsSoFar: 0, totalYards: 10, fired: catchOnly });
  assert.equal(afterCatch.rec, 1);
});

test('a touchdown waits for the score, not the catch', () => {
  const stats = { rec_yd: 10, rec: 1, rec_td: 1 };
  const atCatch = buildPartialPlayStats(stats, { yardsSoFar: 10, totalYards: 10, fired: catchOnly });
  assert.equal(atCatch.rec_td, undefined);
  const atScore = buildPartialPlayStats(stats, { yardsSoFar: 10, totalYards: 10, fired: scored });
  assert.equal(atScore.rec_td, 1);
});

test('a defensive touchdown waits for the turnover and goal-line score', () => {
  const stats = {
    int: 1,
    int_ret_yd: 80,
    def_td: 1,
    def_int_td: 1,
    bonus_def_int_td_50p: 1,
  };
  const beforePick = buildPartialPlayStats(stats, { yardsSoFar: 0, totalYards: 80, fired: new Set() });
  assert.deepEqual(beforePick, { int_ret_yd: 0 });
  const afterPick = buildPartialPlayStats(stats, { yardsSoFar: 0, totalYards: 80, fired: new Set(['turnover']) });
  assert.deepEqual(afterPick, { int: 1, int_ret_yd: 0 });
  const halfway = buildPartialPlayStats(stats, { yardsSoFar: 40, totalYards: 80, fired: new Set(['turnover']) });
  assert.deepEqual(halfway, { int: 1, int_ret_yd: 40 });
  const atGoal = buildPartialPlayStats(stats, { yardsSoFar: 80, totalYards: 80, fired: new Set(['turnover', 'score']) });
  assert.deepEqual(atGoal, stats);
});

test('a missed extra point waits for the score beat', () => {
  const stats = { xpmiss: 1 };
  assert.equal(buildPartialPlayStats(stats, { fired: new Set() }).xpmiss, undefined);
  assert.equal(buildPartialPlayStats(stats, { fired: new Set(['score']) }).xpmiss, 1);
});

test('the replay ticker reconciles to the feed value for one player on a multi-scorer play', () => {
  assert.equal(reconcileFantasyTickerPoints(10.9, 10.9, 2.7, { settled: true }), 2.7);
  assert.ok(Math.abs(reconcileFantasyTickerPoints(2, 10.9, 2.7) - (2 * 2.7 / 10.9)) < 1e-9);
});

test('the replay ticker preserves calculated scoring when no feed total is supplied', () => {
  assert.equal(reconcileFantasyTickerPoints(4.4, 10.9, null), 4.4);
  assert.equal(reconcileFantasyTickerPoints(0, 0, 1.5, { settled: true }), 1.5);
});

test('only the viewer roster supplies fantasy scoring to the replay', () => {
  const event = { playerId: 'wr', pts: 2.7, stats: { rec: 1, rec_yd: 39, rec_td: 1 } };
  assert.deepEqual(selectViewerFantasyReplay(event, true, () => 'WR'), [{
    stats: event.stats,
    points: 2.7,
    position: 'WR',
  }]);
  assert.deepEqual(selectViewerFantasyReplay(event, false), []);
});

test('estimated provider plays keep their calculated stat total in the replay', () => {
  const event = { playerId: 'wr', pts: 2.7, estimated: true, stats: { rec: 1, rec_yd: 39, rec_td: 1 } };
  assert.equal(selectViewerFantasyReplay(event, true, () => 'WR')[0].points, null);
});

test('the finished partial line is the whole line', () => {
  const stats = { rec_yd: 10, rec: 1, rec_td: 1 };
  const done = buildPartialPlayStats(stats, { yardsSoFar: 10, totalYards: 10, fired: scored });
  assert.deepEqual(done, stats);
});

test('a PPR reception is one point at once, not ten tenths', () => {
  // The scoring itself is the league's; this checks the partial line it sees.
  const stats = { rec_yd: 10, rec: 1 };
  const values = [];
  for (let yard = 0; yard <= 10; yard += 1) {
    const partial = buildPartialPlayStats(stats, { yardsSoFar: yard, totalYards: 10, fired: catchOnly });
    values.push(Math.round(((partial.rec_yd ?? 0) * PPR.rec_yd + (partial.rec ?? 0) * PPR.rec) * 10) / 10);
  }
  // Reception lands immediately, then a tenth per yard on top.
  assert.equal(values[0], 1);
  assert.equal(values[10], 2);
  const steps = values.slice(1).map((value, i) => Math.round((value - values[i]) * 10) / 10);
  assert.ok(steps.every((step) => step === 0.1), `uneven steps: ${steps}`);
});

test('a lost fumble waits for the turnover', () => {
  const stats = { rush_yd: 4, fum_lost: 1 };
  const running = buildPartialPlayStats(stats, { yardsSoFar: 4, totalYards: 4, fired: new Set() });
  assert.equal(running.fum_lost, undefined);
  const lost = buildPartialPlayStats(stats, { yardsSoFar: 4, totalYards: 4, fired: new Set(['turnover']) });
  assert.equal(lost.fum_lost, 1);
});

test('yardage progress comes from the ball, so it stops when the ball does', () => {
  const geometry = { start: 30, end: 40 };
  assert.equal(getYardageProgress(geometry, 30), 0);
  assert.equal(getYardageProgress(geometry, 35), 0.5);
  assert.equal(getYardageProgress(geometry, 40), 1);
  // Beats after the whistle cannot push it further.
  assert.equal(getYardageProgress(geometry, 44), 1);
});

test('a play that loses ground still reads forward', () => {
  const geometry = { start: 40, end: 37 };
  assert.equal(getYardageProgress(geometry, 40), 0);
  assert.equal(getYardageProgress(geometry, 37), 1);
});

test('a play with no ground gained is complete immediately', () => {
  assert.equal(getYardageProgress({ start: 25, end: 25 }, 25), 1);
});
