import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computePositionalRanks,
  computeWeeklyPositionalRanks,
  hasRecordedFantasyStats,
} from '../../src/utils/projectionEngine.js';
import { DEFAULT_SCORING } from '../../src/utils/scoringEngine.js';

const scoring = { ...DEFAULT_SCORING };

test('recorded fantasy stats distinguish zero or negative rows from empty placeholders', () => {
  assert.equal(hasRecordedFantasyStats({ gp: 1, pass_int: 1 }), true);
  assert.equal(hasRecordedFantasyStats({ gp: 1 }), false);
  assert.equal(hasRecordedFantasyStats({ gp: 0 }), false);
  assert.equal(hasRecordedFantasyStats({ pass_yd: 0 }), true);
  assert.equal(hasRecordedFantasyStats({ gp: 1 }, [{ week: 1, pass_yd: 0 }]), true);
});

test('season positional ranks include recorded zero and negative totals but exclude empty placeholders', () => {
  const players = {
    positive: { position: 'QB' },
    zero: { position: 'QB' },
    negative: { position: 'QB' },
    unplayed: { position: 'QB' },
  };
  const seasonStats = {
    positive: { gp: 1, pass_yd: 100 },
    zero: { gp: 1, pass_yd: 0 },
    negative: { gp: 1, pass_int: 1 },
    unplayed: { gp: 1 },
  };

  assert.deepEqual(computePositionalRanks(seasonStats, players, scoring), {
    positive: { rank: 1, posCount: 3, posLabel: 'QB' },
    zero: { rank: 2, posCount: 3, posLabel: 'QB' },
    negative: { rank: 3, posCount: 3, posLabel: 'QB' },
  });
});

test('weekly positional ranks use recorded fantasy stats instead of a positive-score gate', () => {
  const players = {
    positive: { position: 'QB' },
    zero: { position: 'QB' },
    negative: { position: 'QB' },
    unplayed: { position: 'QB' },
  };
  const weeklyStats = {
    positive: [{ week: 1, pass_yd: 100, gp: 1 }],
    zero: [{ week: 1, gp: 1, pass_yd: 0 }],
    negative: [{ week: 1, pass_int: 1, gp: 1 }],
    unplayed: [{ week: 1, gp: 1 }],
  };

  assert.deepEqual(computeWeeklyPositionalRanks(weeklyStats, players, scoring, 1), {
    positive: { rank: 1, posLabel: 'QB' },
    zero: { rank: 2, posLabel: 'QB' },
    negative: { rank: 3, posLabel: 'QB' },
  });
});
