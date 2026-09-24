import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getHeatmapCompletedGameCount } from '../../src/utils/fantasyHeatmapData.js';

describe('Fantasy Heatmap game averages', () => {
  it('counts finalized games only, including a finalized zero-stat game', () => {
    const scheduleMap = {
      1: { LV: { opp: 'MIA', completed: true } },
      2: { LV: { opp: 'LAC', completed: true } },
      3: { LV: { opp: 'BUF', completed: false } },
      4: { LV: { opp: 'DEN', status: 'scheduled' } },
    };

    assert.equal(getHeatmapCompletedGameCount(scheduleMap, 'LV', [1, 2, 3, 4]), 2);
  });

  it('respects the active location filter without treating future games as played', () => {
    const scheduleMap = {
      1: { LV: { opp: 'MIA', completed: true, home: true } },
      2: { LV: { opp: 'LAC', completed: true, home: false } },
      3: { LV: { opp: 'BUF', completed: false, home: true } },
    };

    assert.equal(
      getHeatmapCompletedGameCount(scheduleMap, 'LV', [1, 2, 3], (team, week) => (
        team === 'LV' && week !== 2
      )),
      1,
    );
  });
});
