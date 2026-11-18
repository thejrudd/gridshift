import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateSeasonStats,
  getDraft,
  getDraftPicks,
  getDraftTradedPicks,
  getLeague,
  getLeagueDrafts,
  getLiveLeague,
  getLiveWeeklyStats,
  getLeagueRosters,
  getWeeklyProjections,
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

test('weekly Sleeper projections use the public projection endpoint without credentials', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return { ok: true, json: async () => [] };
  };

  try {
    await getWeeklyProjections('2026', 2);
    assert.equal(calls[0].url, 'https://api.sleeper.com/projections/nfl/2026/2?season_type=regular');
    assert.equal(calls[0].options.cache, 'no-store');
    assert.deepEqual(calls[0].options.headers, { Accept: 'application/json' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('live Sleeper league metadata bypasses stale caches', async () => {
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
    await getLiveLeague('league-1');
    assert.equal(calls[0].options.cache, 'no-store');
    const url = new URL(calls[0].url);
    assert.equal(url.pathname, '/v1/league/league-1');
    assert.match(url.searchParams.get('_gridshift') ?? '', /^\d+-\d+$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('live Sleeper weekly stats bypass stale caches', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const payload = { 'player-1': { rec: 5, rec_yd: 72 } };

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return { ok: true, json: async () => payload };
  };

  try {
    assert.deepEqual(await getLiveWeeklyStats('2026', 7), payload);
    assert.deepEqual(await getLiveWeeklyStats('2026', 7), payload);
    assert.deepEqual(calls.map((call) => call.options.cache), ['no-store', 'no-store']);
    calls.forEach((call) => {
      const url = new URL(call.url);
      assert.equal(url.pathname, '/v1/stats/nfl/regular/2026/7');
      assert.match(url.searchParams.get('_gridshift') ?? '', /^\d+-\d+$/);
    });
    assert.notEqual(calls[0].url, calls[1].url);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Sleeper roster requests bypass stale caches', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      json: async () => ([]),
    };
  };

  try {
    await getLeagueRosters('league-1');
    await getLeagueRosters('league-1');

    assert.deepEqual(calls.map((call) => call.options.cache), ['no-store', 'no-store']);
    calls.forEach((call) => {
      const url = new URL(call.url);
      assert.equal(url.pathname, '/v1/league/league-1/rosters');
      assert.match(url.searchParams.get('_gridshift') ?? '', /^\d+-\d+$/);
    });
    assert.notEqual(calls[0].url, calls[1].url);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('concurrent players DB loads share one download and the result is reused', async () => {
  const { getAllPlayers, resetPlayersCacheForTests } = await import('../../src/api/sleeperApi.js');
  const originalFetch = globalThis.fetch;
  const calls = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    await gate;
    return { ok: true, json: async () => ({ 4984: { team: 'BUF', position: 'QB' } }) };
  };
  resetPlayersCacheForTests();
  try {
    const pending = [getAllPlayers(), getAllPlayers(), getAllPlayers()];
    release();
    const results = await Promise.all(pending);
    assert.equal(calls.filter((url) => url.endsWith('/players/nfl')).length, 1);
    assert.ok(results.every((result) => result === results[0]));
    assert.equal(await getAllPlayers(), results[0]);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    resetPlayersCacheForTests();
  }
});

test('weekly stats with teams use api.sleeper.com and carry game-time teams', async () => {
  const { getWeeksWithTeams } = await import('../../src/api/sleeperApi.js');
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const week = Number(String(url).match(/\/2025\/(\d+)/)[1]);
    if (week === 3) return { ok: false, status: 500, json: async () => null };
    return {
      ok: true,
      json: async () => [{ player_id: '19', team: week < 2 ? 'CLE' : 'CIN', opponent: 'PIT', player: { position: 'QB' }, stats: { pass_yd: 100 } }],
    };
  };
  try {
    const failedWeeks = [];
    const byWeek = await getWeeksWithTeams('2025', [1, 2, 3], { failedWeeks });
    assert.ok(calls.every((url) => url.startsWith('https://api.sleeper.com/stats/nfl/2025/') && url.includes('season_type=regular')));
    assert.deepEqual(failedWeeks, [3]);
    assert.deepEqual(byWeek[1]['19'], { week: 1, pass_yd: 100, team: 'CLE', opp: 'PIT', _teamSource: 'espn' });
    assert.equal(byWeek[2]['19'].team, 'CIN');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('cachedFetch shares one in-flight request per key', async () => {
  const store = new Map();
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
  try {
    const { cachedFetch } = await import('../../src/utils/playerCache.js');
    let calls = 0;
    const fetchFn = async () => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return { ok: 1 }; };
    const results = await Promise.all([cachedFetch('k1', fetchFn, 1000), cachedFetch('k1', fetchFn, 1000)]);
    assert.equal(calls, 1);
    assert.deepEqual(results, [{ ok: 1 }, { ok: 1 }]);
    // A TTL function sees the cached data.
    assert.deepEqual(await cachedFetch('k1', fetchFn, (data) => (data.ok ? Infinity : 0)), { ok: 1 });
    assert.equal(calls, 1);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test('weekly stats with teams revalidate instead of reusing a browser-cached copy', async () => {
  const { getWeeklyStatsWithTeams } = await import('../../src/api/sleeperApi.js');
  const originalFetch = globalThis.fetch;
  let options = null;
  globalThis.fetch = async (_url, init) => { options = init; return { ok: true, json: async () => [] }; };
  try {
    await getWeeklyStatsWithTeams('2026', 10);
    assert.equal(options.cache, 'no-cache');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
