import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWinProbabilityTimeline } from '../../src/utils/winProbability.js';

test('live win probability ends at elapsed game time instead of filling the chart', () => {
  const timeline = buildWinProbabilityTimeline([
    { period: 1, time: '15:00', homeWinProbability: 0.48 },
    { period: 2, time: '0:00', homeWinProbability: 0.55 },
    { period: 3, time: '7:30', homeWinProbability: 0.64 },
  ]);

  assert.equal(timeline.complete, false);
  assert.equal(timeline.points.at(-1).x, 62.5);
});
test('final win probability fills the full chart even when the last provider play has time remaining', () => {
  const timeline = buildWinProbabilityTimeline([
    { period: 1, time: '15:00', homeWinProbability: 0.48 },
    { period: 4, time: '2:00', homeWinProbability: 0.82 },
  ], { gameStatus: 'final' });

  assert.equal(timeline.complete, true);
  assert.equal(timeline.points.at(-1).x, 100);
});
