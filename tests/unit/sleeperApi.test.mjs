import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateSeasonStats,
  getDraft,
  getDraftPicks,
  getDraftTradedPicks,
  getLeague,
  getLeagueDrafts,
} from '../../src/api/sleeperApi.js';

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

test('live Sleeper draft endpoints bypass stale draft caches', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      json: async () => ({}),
    };
  };

  try {
    await getLeagueDrafts('league-1');
    await getDraft('draft-1');
    await getDraftPicks('draft-1');
    await getDraftTradedPicks('draft-1');

    assert.deepEqual(calls.map((call) => call.options.cache), [
      'no-store',
      'no-store',
      'no-store',
      'no-store',
    ]);
    calls.forEach((call) => {
      const url = new URL(call.url);
      assert.match(url.searchParams.get('_gridshift') ?? '', /^\d+-\d+$/);
    });
    assert.equal(new Set(calls.map((call) => call.url)).size, calls.length);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('non-live Sleeper endpoints keep default fetch caching behavior', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      json: async () => ({}),
    };
  };

  try {
    await getLeague('league-1');
    assert.equal(calls[0].options.cache, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
