import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPartialPlayStats,
  getYardageProgress,
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
