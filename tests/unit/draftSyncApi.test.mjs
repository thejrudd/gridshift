import assert from 'node:assert/strict';
import test from 'node:test';
import { getDraftSyncDevice, getDraftSyncPairingStatus, getDraftSyncState, getDraftSyncStatus, putDraftSyncState } from '../../src/api/draftSyncApi.js';

function response({ status = 200, body = {}, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { return headers[name] ?? headers[name.toLowerCase()] ?? null; } },
    async json() { return body; },
  };
}

test('Draft Sync status reads the server capability envelope', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/draft-sync/status');
    assert.equal(options.credentials, 'same-origin');
    return response({ body: { ok: true, draftSync: { enabled: true, ready: true } } });
  };
  try {
    const result = await getDraftSyncStatus();
    assert.deepEqual(result.draftSync, { enabled: true, ready: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Draft Sync state requests include the Sleeper scope and preserve ETags', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url, 'https://gridshift.test');
    assert.equal(parsed.searchParams.get('sleeperUserId'), 'user-1');
    assert.equal(parsed.searchParams.get('leagueId'), 'league-1');
    assert.equal(options.headers.Authorization, 'Bearer token');
    assert.equal(options.headers['If-None-Match'], '"2"');
    return response({ body: { ok: true, revision: 2, state: null }, headers: { ETag: '"2"' } });
  };
  try {
    const result = await getDraftSyncState({
      token: 'token',
      etag: '"2"',
      scope: { sleeperUserId: 'user-1', leagueId: 'league-1', season: '2026', draftId: 'draft-1' },
    });
    assert.equal(result.missing, true);
    assert.equal(result.etag, '"2"');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Draft Sync pairing status requests use the starter device token and opaque pairing ID', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/draft-sync/pairing/status?pairingId=pairing-123');
    assert.equal(options.headers.Authorization, 'Bearer starter-token');
    return response({ body: { ok: true, pairingId: 'pairing-123', status: 'claimed' } });
  };
  try {
    const result = await getDraftSyncPairingStatus({ token: 'starter-token', pairingId: 'pairing-123' });
    assert.equal(result.status, 'claimed');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Draft Sync device requests read the persisted authority role', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/draft-sync/device');
    assert.equal(options.headers.Authorization, 'Bearer token');
    return response({ body: { ok: true, deviceRole: 'non-authoritative' } });
  };
  try {
    const result = await getDraftSyncDevice({ token: 'token' });
    assert.equal(result.deviceRole, 'non-authoritative');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Draft Sync writes send a revision-checked minimal state document', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/draft-sync/state');
    assert.equal(options.method, 'PUT');
    assert.equal(options.headers.Authorization, 'Bearer token');
    const body = JSON.parse(options.body);
    assert.equal(body.sleeperUserId, 'user-1');
    assert.equal(body.expectedRevision, 2);
    assert.equal(body.initialChoiceAt, 1_234);
    assert.deepEqual(body.state, {
      schemaVersion: 1,
      board: { byPosition: { QB: ['player-1'] }, overall: ['player-1'] },
      modelWeights: { market: 25 },
      keeperIds: [],
    });
    return response({ body: { ok: true, revision: 3 }, headers: { ETag: '"3"' } });
  };
  try {
    const result = await putDraftSyncState({
      token: 'token',
      expectedRevision: 2,
      initialChoiceAt: 1_234,
      scope: { sleeperUserId: 'user-1', leagueId: 'league-1', season: '2026', draftId: 'draft-1' },
      state: {
        schemaVersion: 1,
        board: { byPosition: { QB: ['player-1'] }, overall: ['player-1'] },
        modelWeights: { market: 25 },
        keeperIds: [],
      },
    });
    assert.equal(result.revision, 3);
    assert.equal(result.etag, '"3"');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
