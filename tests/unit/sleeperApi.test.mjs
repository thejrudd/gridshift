import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { aggregateSeasonStats } from '../../src/api/sleeperApi.js';

describe('Sleeper stats aggregation', () => {
  it('counts active zero-point games while excluding explicit inactive games from gp', () => {
    const seasonStats = aggregateSeasonStats({
      'player-1': [
        { week: 1, gp: 1, rush_yd: 0, rec: 0, fantasy_points: 0 },
        { week: 2, gp: 0, rush_yd: 0, rec: 0, fantasy_points: 0 },
        { week: 3, gp: 1, rush_yd: 20, rec: 1 },
      ],
    });

    assert.equal(seasonStats['player-1'].gp, 2);
    assert.equal(seasonStats['player-1'].rush_yd, 20);
  });

  it('still infers gp for active stat rows when the source omits games played', () => {
    const seasonStats = aggregateSeasonStats({
      'defense-1': [
        { week: 1, tkl: 4 },
        { week: 2, sack: 2 },
      ],
    });

    assert.equal(seasonStats['defense-1'].gp, 2);
  });
});
