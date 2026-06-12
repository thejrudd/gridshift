import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDraft,
  getDraftPicks,
  getDraftTradedPicks,
  getLeague,
  getLeagueDrafts,
} from '../../src/api/sleeperApi.js';

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
