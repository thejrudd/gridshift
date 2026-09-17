import assert from 'node:assert/strict';
import test from 'node:test';

import { getPlayerDesignations } from '../../src/api/playerDesignationsApi.js';

test('player designation client requests the bounded server route', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, season: 2026, week: 7, data: [] }),
    };
  };

  try {
    const response = await getPlayerDesignations({ season: 2026, week: 7, teams: ['was', 'BUF'] });
    assert.equal(response.ok, true);
    assert.equal(calls[0].url, '/api/fantasy/player-designations?season=2026&week=7&teams=BUF%2CWAS');
    assert.deepEqual(calls[0].options.headers, { Accept: 'application/json' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('player designation client validates season and week before fetching', async () => {
  await assert.rejects(() => getPlayerDesignations({ season: 'twenty', week: 7, teams: ['BUF'] }), /valid NFL season/i);
  await assert.rejects(() => getPlayerDesignations({ season: 2026, week: 0, teams: ['BUF'] }), /valid NFL week/i);
  await assert.rejects(() => getPlayerDesignations({ season: 2026, week: 19, teams: ['BUF'] }), /valid NFL week/i);
  await assert.rejects(() => getPlayerDesignations({ season: 2026, week: 7 }), /Sleeper concern team/i);
});

test('player designation client surfaces the sanitized server error', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 403,
    json: async () => ({ ok: false, error: 'Player designations are not available.' }),
  });

  try {
    await assert.rejects(
      () => getPlayerDesignations({ season: 2026, week: 7, teams: ['BUF'] }),
      (error) => error.message === 'Player designations are not available.' && error.status === 403,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
