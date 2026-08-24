import assert from 'node:assert/strict';
import test from 'node:test';

import { getLiveGamePlays } from '../../src/api/liveApi.js';

test('Fantasy Live serializes preseason play scope without exposing provider credentials', async () => {
  const originalFetch = globalThis.fetch;
  let request = null;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return { ok: true, json: async () => ({ ok: true, data: [] }) };
  };
  try {
    await getLiveGamePlays(1393548, { seasonType: 'preseason' });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(request.url, '/api/live/game/1393548/plays?seasonType=preseason');
  assert.deepEqual(request.options.headers, { Accept: 'application/json' });
  assert.equal(request.url.includes('key='), false);
});
