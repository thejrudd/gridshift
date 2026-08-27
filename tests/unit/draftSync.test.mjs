import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getDraftSyncConfig } from '../../server/draftSyncConfig.js';
import { createDraftSyncRouter } from '../../server/draftSyncHandlers.js';
import { createDraftSyncStore } from '../../server/draftSyncStore.js';
import { createPredictionsSyncRouter } from '../../server/predictionsSyncHandlers.js';

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gridshift-draft-sync-'));
}

function getRouteHandler(router, routePath, method) {
  const route = router.stack.find((layer) => layer.route?.path === routePath && layer.route.methods?.[method])?.route;
  const handler = route?.stack.find((layer) => layer.method === method)?.handle;
  assert.equal(typeof handler, 'function');
  return handler;
}

function invoke(router, routePath, method, { body = {}, query = {}, token, headers = {} } = {}) {
  const captured = { statusCode: 200, headers: {}, body: null, ended: false };
  const response = {
    status(statusCode) {
      captured.statusCode = statusCode;
      return this;
    },
    set(name, value) {
      captured.headers[String(name).toLowerCase()] = String(value);
      return this;
    },
    json(payload) {
      captured.body = payload;
      return this;
    },
    end() {
      captured.ended = true;
      return this;
    },
  };
  const request = {
    body,
    query,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  };
  getRouteHandler(router, routePath, method)(request, response);
  return { response: captured, body: captured.body };
}

function scope(sleeperUserId = 'user-1', leagueId = 'league-1', draftId = 'draft-1') {
  return { sleeperUserId, leagueId, season: '2026', draftId };
}

function draftState(ids = []) {
  return {
    schemaVersion: 1,
    board: { byPosition: { QB: ids }, overall: ids },
    modelWeights: { market: 25, production: 25, scoringFit: 20, need: 20, schedule: 10 },
    keeperIds: [],
  };
}

function predictionsState(overrides = {}) {
  return {
    schemaVersion: 1,
    season: '2026',
    scheduleFingerprint: '2026-schedule-fingerprint',
    predictions: { 'game-1': { winnerTeamId: 'ARI' } },
    playoffPicks: { championTeamId: 'ARI' },
    ...overrides,
  };
}

function enabledConfig(dataDir, overrides = {}) {
  return {
    enabled: true,
    ready: true,
    production: false,
    sessionSecret: 'draft-sync-test-session-secret',
    dataDir,
    pairingTtlMs: 300_000,
    maxPayloadBytes: 64 * 1024,
    ...overrides,
  };
}

test('Draft Sync configuration is disabled by default and normalizes bounded settings', () => {
  const disabled = getDraftSyncConfig({ env: { NODE_ENV: 'test' } });
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.ready, false);
  assert.equal(disabled.pairingTtlMs, 600_000);
  assert.equal(disabled.maxPayloadBytes, 64 * 1024);

  const configured = getDraftSyncConfig({
    env: {
      NODE_ENV: 'production',
      GRIDSHIFT_DRAFT_SYNC_ENABLED: 'true',
      GRIDSHIFT_SESSION_SECRET: 'production-secret',
      GRIDSHIFT_DRAFT_SYNC_DATA_DIR: '/srv/gridshift/draft-sync',
      GRIDSHIFT_DRAFT_SYNC_PAIRING_TTL_MS: '120000',
      GRIDSHIFT_DRAFT_SYNC_MAX_PAYLOAD_BYTES: '4096',
    },
  });
  assert.equal(configured.enabled, true);
  assert.equal(configured.ready, true);
  assert.equal(configured.dataDir, '/srv/gridshift/draft-sync');
  assert.equal(configured.pairingTtlMs, 120_000);
  assert.equal(configured.maxPayloadBytes, 4096);

  const missingProductionSecret = getDraftSyncConfig({
    env: { NODE_ENV: 'production', GRIDSHIFT_DRAFT_SYNC_ENABLED: 'true' },
  });
  assert.equal(missingProductionSecret.enabled, true);
  assert.equal(missingProductionSecret.ready, false);
});

test('disabled Draft Sync reports capability without initializing SQLite', async () => {
  const dataDir = temporaryDirectory();
  fs.rmSync(dataDir, { recursive: true, force: true });
  let storeFactoryCalls = 0;
  const router = createDraftSyncRouter({
    config: { enabled: false, ready: false, pairingTtlMs: 300_000, maxPayloadBytes: 1024 },
    storeFactory: () => {
      storeFactoryCalls += 1;
      throw new Error('must not initialize');
    },
  });

  try {
    const status = invoke(router, '/status', 'get');
    assert.equal(status.response.statusCode, 200);
    assert.equal(status.body.draftSync.enabled, false);

    const start = invoke(router, '/pairing/start', 'post', { body: { sleeperUserId: 'user-1' } });
    assert.equal(start.response.statusCode, 503);
    assert.equal(storeFactoryCalls, 0);
    assert.equal(fs.existsSync(dataDir), false);
  } finally {
    if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('Draft Sync persists pairing devices and scoped JSON state with conditional revisions', async () => {
  const dataDir = temporaryDirectory();
  let nowMs = 1_000;
  const config = enabledConfig(dataDir);
  const router = createDraftSyncRouter({ config, now: () => nowMs });
  const firstScope = scope();

  try {
    const missingAuth = invoke(router, '/state', 'get', { query: firstScope });
    assert.equal(missingAuth.response.statusCode, 401);

    const started = invoke(router, '/pairing/start', 'post', { body: { sleeperUserId: 'user-1' } });
    assert.equal(started.response.statusCode, 200);
    assert.match(started.body.pairingCode, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    assert.match(started.body.pairingId, /^[A-Za-z0-9_-]+$/);
    assert.doesNotMatch(started.body.pairingCode, /[01IO]/);
    assert.equal(typeof started.body.deviceToken, 'string');
    assert.ok(started.body.deviceToken.length >= 40);
    assert.equal(started.body.deviceRole, 'authoritative');

    const pendingStatus = invoke(router, '/pairing/status', 'get', {
      token: started.body.deviceToken,
      query: { pairingId: started.body.pairingId },
    });
    assert.equal(pendingStatus.response.statusCode, 200);
    assert.equal(pendingStatus.body.status, 'pending');

    const wrongUser = invoke(router, '/pairing/claim', 'post', { body: { sleeperUserId: 'user-2', pairingCode: started.body.pairingCode } });
    assert.equal(wrongUser.response.statusCode, 403);

    const claimed = invoke(router, '/pairing/claim', 'post', { body: { sleeperUserId: 'user-1', pairingCode: started.body.pairingCode } });
    assert.equal(claimed.response.statusCode, 200);
    assert.notEqual(claimed.body.deviceToken, started.body.deviceToken);
    assert.equal(claimed.body.deviceRole, 'non-authoritative');

    const starterDevice = invoke(router, '/device', 'get', { token: started.body.deviceToken });
    assert.equal(starterDevice.response.statusCode, 200);
    assert.equal(starterDevice.body.deviceRole, 'authoritative');
    const claimedDevice = invoke(router, '/device', 'get', { token: claimed.body.deviceToken });
    assert.equal(claimedDevice.response.statusCode, 200);
    assert.equal(claimedDevice.body.deviceRole, 'non-authoritative');

    const claimedStatus = invoke(router, '/pairing/status', 'get', {
      token: started.body.deviceToken,
      query: { pairingId: started.body.pairingId },
    });
    assert.equal(claimedStatus.response.statusCode, 200);
    assert.equal(claimedStatus.body.status, 'claimed');

    const otherStarterStatus = invoke(router, '/pairing/status', 'get', {
      token: claimed.body.deviceToken,
      query: { pairingId: started.body.pairingId },
    });
    assert.equal(otherStarterStatus.response.statusCode, 404);

    const reused = invoke(router, '/pairing/claim', 'post', { body: { sleeperUserId: 'user-1', pairingCode: started.body.pairingCode } });
    assert.equal(reused.response.statusCode, 409);

    const initial = invoke(router, '/state', 'get', { query: firstScope, token: started.body.deviceToken });
    assert.equal(initial.response.statusCode, 200);
    assert.equal(initial.response.headers.etag, '"0"');
    assert.deepEqual(initial.body.state, null);
    assert.equal(initial.body.deviceRole, 'authoritative');

    const unchanged = invoke(router, '/state', 'get', { query: firstScope, token: claimed.body.deviceToken, headers: { 'if-none-match': '"0"' } });
    assert.equal(unchanged.response.statusCode, 304);
    assert.equal(unchanged.response.headers.etag, '"0"');

    const written = invoke(router, '/state', 'put', {
      token: claimed.body.deviceToken,
      headers: { 'if-match': '"0"' },
      body: { ...firstScope, state: draftState(['player-1']) },
    });
    assert.equal(written.response.statusCode, 200);
    assert.equal(written.response.headers.etag, '"1"');
    assert.equal(written.body.revision, 1);

    const invalidSchema = invoke(router, '/state', 'put', {
      token: claimed.body.deviceToken,
      headers: { 'if-match': '"1"' },
      body: { ...firstScope, state: { ...draftState(['player-2']), schemaVersion: 2 } },
    });
    assert.equal(invalidSchema.response.statusCode, 400);
    const afterInvalidSchema = invoke(router, '/state', 'get', { query: firstScope, token: claimed.body.deviceToken });
    assert.equal(afterInvalidSchema.body.revision, 1);
    assert.deepEqual(afterInvalidSchema.body.state, draftState(['player-1']));

    const conflict = invoke(router, '/state', 'put', {
      token: started.body.deviceToken,
      headers: { 'if-match': '"0"' },
      body: { ...firstScope, state: draftState(['player-2']) },
    });
    assert.equal(conflict.response.statusCode, 409);
    assert.equal(conflict.response.headers.etag, '"1"');
    assert.equal(conflict.body.revision, 1);

    const otherScope = invoke(router, '/state', 'get', { query: scope('user-1', 'league-2'), token: started.body.deviceToken });
    assert.equal(otherScope.response.statusCode, 200);
    assert.equal(otherScope.body.revision, 0);

    const wrongScopeUser = invoke(router, '/state', 'get', { query: scope('user-2'), token: started.body.deviceToken });
    assert.equal(wrongScopeUser.response.statusCode, 403);

    const revoked = invoke(router, '/revoke-device', 'post', { token: started.body.deviceToken });
    assert.equal(revoked.response.statusCode, 200);
    const afterRevoke = invoke(router, '/state', 'get', { query: firstScope, token: started.body.deviceToken });
    assert.equal(afterRevoke.response.statusCode, 403);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('Draft Sync code generators publish the authoritative starting plan for receivers', () => {
  const dataDir = temporaryDirectory();
  const router = createDraftSyncRouter({ config: enabledConfig(dataDir), now: () => 2_000 });
  const firstScope = scope();

  try {
    const started = invoke(router, '/pairing/start', 'post', { body: { sleeperUserId: 'user-1' } });
    const claimed = invoke(router, '/pairing/claim', 'post', {
      body: { sleeperUserId: 'user-1', pairingCode: started.body.pairingCode },
    });
    const authoritativeState = draftState(['primary-player']);
    const written = invoke(router, '/state', 'put', {
      token: started.body.deviceToken,
      headers: { 'if-match': '"0"' },
      body: { ...firstScope, initialChoiceAt: 2_000, state: authoritativeState },
    });
    assert.equal(written.response.statusCode, 200);
    assert.equal(written.body.deviceRole, 'authoritative');

    const receiverState = invoke(router, '/state', 'get', { token: claimed.body.deviceToken, query: firstScope });
    assert.equal(receiverState.response.statusCode, 200);
    assert.equal(receiverState.body.deviceRole, 'non-authoritative');
    assert.deepEqual(receiverState.body.state, authoritativeState);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('Draft Sync initial starting-plan choices use the earliest choice timestamp', async () => {
  const dataDir = temporaryDirectory();
  const store = createDraftSyncStore({ config: enabledConfig(dataDir) });
  const firstScope = scope();

  try {
    const first = store.putState(firstScope, 0, draftState(['player-1']), 2_000, 2_000);
    assert.equal(first.conflict, false);
    assert.equal(first.initialChoiceAt, 2_000);

    const laterChoice = store.putState(firstScope, 0, draftState(['player-2']), 3_000, 3_000);
    assert.equal(laterChoice.conflict, true);
    assert.deepEqual(laterChoice.state, draftState(['player-1']));
    assert.equal(laterChoice.initialChoiceAt, 2_000);

    const earlierChoice = store.putState(firstScope, 0, draftState(['player-3']), 4_000, 1_000);
    assert.equal(earlierChoice.conflict, false);
    assert.deepEqual(earlierChoice.state, draftState(['player-3']));
    assert.equal(earlierChoice.initialChoiceAt, 1_000);

    const normalUpdate = store.putState(firstScope, earlierChoice.revision, draftState(['player-4']), 5_000);
    assert.equal(normalUpdate.conflict, false);
    assert.equal(normalUpdate.initialChoiceAt, 1_000);
    const authoritativeReset = store.putState(firstScope, 0, draftState(['player-5']), 6_000, 6_000, 'authoritative');
    assert.equal(authoritativeReset.conflict, false);
    assert.deepEqual(authoritativeReset.state, draftState(['player-5']));
    assert.equal(authoritativeReset.initialChoiceAt, 6_000);
  } finally {
    store.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('Draft Sync expires single-use pairing codes and returns 413 for oversized payloads', async () => {
  const dataDir = temporaryDirectory();
  let nowMs = 1_000;
  const router = createDraftSyncRouter({
    config: enabledConfig(dataDir, { pairingTtlMs: 100, maxPayloadBytes: 512 }),
    now: () => nowMs,
  });

  try {
    const started = invoke(router, '/pairing/start', 'post', { body: { sleeperUserId: 'user-1' } });
    nowMs += 101;
    const expired = invoke(router, '/pairing/claim', 'post', {
      body: { sleeperUserId: 'user-1', pairingCode: started.body.pairingCode },
    });
    assert.equal(expired.response.statusCode, 409);

    const oversized = invoke(router, '/state', 'put', {
      token: started.body.deviceToken,
      headers: { 'if-match': '"0"' },
      body: { ...scope(), state: 'x'.repeat(2_000) },
    });
    assert.equal(oversized.response.statusCode, 413);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('Draft Sync production readiness failures return 503 without opening storage', async () => {
  let storeFactoryCalls = 0;
  const router = createDraftSyncRouter({
    config: {
      enabled: true,
      ready: false,
      pairingTtlMs: 300_000,
      maxPayloadBytes: 1024,
    },
    storeFactory: () => {
      storeFactoryCalls += 1;
      throw new Error('must not initialize');
    },
  });
  const response = invoke(router, '/pairing/start', 'post', { body: { sleeperUserId: 'user-1' } });
  assert.equal(response.response.statusCode, 503);
  assert.equal(storeFactoryCalls, 0);
});

test('Draft Sync SQLite store uses a WAL database and stores only token hashes', () => {
  const dataDir = temporaryDirectory();
  const config = enabledConfig(dataDir);
  const store = createDraftSyncStore({ config, now: () => 1_000 });
  try {
    const rawToken = 'test-device-token';
    store.createPairing({
      sleeperUserId: 'user-1',
      starterTokenHash: 'hashed-device-token',
      code: 'ABCDEFGH',
      createdAt: 1_000,
      expiresAt: 2_000,
    });
    assert.equal(store.getDevice(rawToken), null);
    assert.equal(store.databasePath.endsWith('draft-sync.sqlite'), true);
    assert.equal(fs.existsSync(`${store.databasePath}-wal`), true);
  } finally {
    store.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('Predictions Sync reuses paired Draft devices while isolating season state and revisions', () => {
  const dataDir = temporaryDirectory();
  const config = enabledConfig(dataDir);
  const store = createDraftSyncStore({ config, now: () => 1_000 });
  const draftRouter = createDraftSyncRouter({ config, store, now: () => 1_000 });
  const predictionsRouter = createPredictionsSyncRouter({ config, store, now: () => 2_000 });
  const predictionScope = { sleeperUserId: 'user-1', season: '2026' };

  try {
    const status = invoke(predictionsRouter, '/status', 'get');
    assert.equal(status.response.statusCode, 200);
    assert.equal(status.body.predictionsSync.enabled, true);
    assert.equal(status.body.predictionsSync.credentialSource, 'draft-sync');

    const started = invoke(draftRouter, '/pairing/start', 'post', { body: { sleeperUserId: 'user-1' } });
    const initial = invoke(predictionsRouter, '/state', 'get', { token: started.body.deviceToken, query: predictionScope });
    assert.equal(initial.response.statusCode, 200);
    assert.equal(initial.body.revision, 0);
    assert.equal(initial.body.state, null);

    const written = invoke(predictionsRouter, '/state', 'put', {
      token: started.body.deviceToken,
      headers: { 'if-match': '"0"' },
      body: { ...predictionScope, state: predictionsState() },
    });
    assert.equal(written.response.statusCode, 200);
    assert.equal(written.body.revision, 1);

    const unchanged = invoke(predictionsRouter, '/state', 'get', {
      token: started.body.deviceToken,
      query: predictionScope,
      headers: { 'if-none-match': '"1"' },
    });
    assert.equal(unchanged.response.statusCode, 304);

    const conflict = invoke(predictionsRouter, '/state', 'put', {
      token: started.body.deviceToken,
      headers: { 'if-match': '"0"' },
      body: { ...predictionScope, state: predictionsState({ predictions: { 'game-1': { winnerTeamId: 'ATL' } } }) },
    });
    assert.equal(conflict.response.statusCode, 409);
    assert.equal(conflict.body.revision, 1);

    const invalidSeason = invoke(predictionsRouter, '/state', 'put', {
      token: started.body.deviceToken,
      headers: { 'if-match': '"1"' },
      body: { ...predictionScope, state: predictionsState({ season: '2025' }) },
    });
    assert.equal(invalidSeason.response.statusCode, 400);

    const wrongUser = invoke(predictionsRouter, '/state', 'get', {
      token: started.body.deviceToken,
      query: { sleeperUserId: 'user-2', season: '2026' },
    });
    assert.equal(wrongUser.response.statusCode, 403);
  } finally {
    store.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
