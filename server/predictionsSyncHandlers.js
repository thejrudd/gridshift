import { Buffer } from 'node:buffer';
import express from 'express';
import process from 'node:process';
import { getDraftSyncConfig } from './draftSyncConfig.js';
import { buildDraftSyncEtag, parseDraftSyncRevision } from './draftSyncCrypto.js';
import { createDraftSyncStore } from './draftSyncStore.js';

const MAX_ID_LENGTH = 160;
const PREDICTIONS_SYNC_SCHEMA_VERSION = 1;

function requestError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sendError(res, error, fallbackMessage = 'Predictions Sync request failed.') {
  return res.status(error?.statusCode ?? 400).set('Cache-Control', 'no-store').json({
    ok: false,
    error: error?.message ?? fallbackMessage,
  });
}

function normalizeId(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.length > MAX_ID_LENGTH) throw requestError(`${label} is required.`, 400);
  return normalized;
}

function normalizeScope(input = {}) {
  const season = String(input.season ?? '').trim();
  if (!/^\d{4}$/.test(season)) throw requestError('A valid four-digit season is required.', 400);
  return {
    sleeperUserId: normalizeId(input.sleeperUserId ?? input.sleeper_user_id, 'Sleeper user ID'),
    season,
  };
}

function getBearerToken(req) {
  const authorization = String(req.headers?.authorization ?? '').trim();
  if (/^Bearer\s+/i.test(authorization)) return authorization.replace(/^Bearer\s+/i, '').trim();
  return String(req.headers?.['x-predictions-sync-device-token'] ?? req.headers?.['x-draft-sync-device-token'] ?? '').trim();
}

function getExpectedRevision(req) {
  const header = req.headers?.['if-match'];
  return header != null
    ? parseDraftSyncRevision(header)
    : parseDraftSyncRevision(req.body?.expectedRevision ?? req.body?.revision);
}

function ifNoneMatchMatches(req, etag) {
  return String(req.headers?.['if-none-match'] ?? '')
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === etag || value === `W/${etag}`);
}

function isPlainRecord(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function assertPayloadSize(value, maxPayloadBytes) {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > maxPayloadBytes) {
    throw requestError('Predictions Sync payload is too large.', 413);
  }
}

function assertPredictionsState(state, scope) {
  if (!isPlainRecord(state)) throw requestError('Predictions Sync state must be a JSON object.', 400);
  if (state.schemaVersion !== PREDICTIONS_SYNC_SCHEMA_VERSION) {
    throw requestError('This Predictions Sync state schema is not supported by the server.', 400);
  }
  if (String(state.season ?? '') !== scope.season) {
    throw requestError('Predictions Sync state season must match its scope.', 400);
  }
  if (typeof state.scheduleFingerprint !== 'string' || !state.scheduleFingerprint.trim() || state.scheduleFingerprint.length > MAX_ID_LENGTH) {
    throw requestError('Predictions Sync state must include a schedule fingerprint.', 400);
  }
  if (!isPlainRecord(state.predictions) && !Array.isArray(state.predictions)) {
    throw requestError('Predictions Sync state must include canonical predictions.', 400);
  }
  if (state.playoffPicks != null && !isPlainRecord(state.playoffPicks) && !Array.isArray(state.playoffPicks)) {
    throw requestError('Predictions Sync playoff picks must be an object or array.', 400);
  }
  return state;
}

export function createPredictionsSyncRouter({
  config: injectedConfig,
  env = process.env,
  store: injectedStore,
  storeFactory = createDraftSyncStore,
  now = () => Date.now(),
} = {}) {
  const config = injectedConfig ?? getDraftSyncConfig({ env });
  const router = express.Router();
  let store = injectedStore ?? null;
  let storeError = null;

  router.use(express.json({ limit: `${config.maxPayloadBytes}b` }));

  function requireReady() {
    if (!config.enabled || !config.ready) throw requestError('Predictions Sync is not configured on this server.', 503);
    if (store) return store;
    if (storeError) throw requestError('Predictions Sync storage is unavailable.', 503);
    try {
      store = storeFactory({ config, now });
      return store;
    } catch {
      storeError = true;
      throw requestError('Predictions Sync storage is unavailable.', 503);
    }
  }

  function requireDevice(req) {
    const token = getBearerToken(req);
    if (!token) throw requestError('A paired device token is required.', 401);
    const currentStore = requireReady();
    let device;
    try { device = currentStore.getDevice(token); } catch { throw requestError('Predictions Sync storage is unavailable.', 503); }
    if (!device) throw requestError('The paired device token is invalid.', 401);
    if (device.revokedAt != null) throw requestError('This paired device has been revoked.', 403);
    return { device, currentStore };
  }

  function requireScopeForDevice(input, device) {
    const scope = normalizeScope(input);
    if (scope.sleeperUserId !== device.sleeperUserId) throw requestError('This device is not authorized for that Sleeper user.', 403);
    return scope;
  }

  router.get('/status', (_req, res) => res.set('Cache-Control', 'no-store').json({
    ok: true,
    predictionsSync: {
      enabled: config.enabled,
      ready: config.ready,
      maxPayloadBytes: config.maxPayloadBytes,
      credentialSource: 'draft-sync',
    },
  }));

  router.get('/state', (req, res) => {
    try {
      const { device, currentStore } = requireDevice(req);
      const scope = requireScopeForDevice(req.query, device);
      const result = currentStore.getPredictionState(scope);
      const etag = buildDraftSyncEtag(result.revision);
      if (ifNoneMatchMatches(req, etag)) return res.status(304).set('Cache-Control', 'no-store').set('ETag', etag).end();
      return res.set('Cache-Control', 'no-store').set('ETag', etag).json({
        ok: true, scope, revision: result.revision, state: result.state, deviceRole: device.role,
        updatedAt: result.updatedAt == null ? null : new Date(result.updatedAt).toISOString(),
      });
    } catch (error) { return sendError(res, error, 'Could not read Predictions Sync state.'); }
  });

  router.put('/state', (req, res) => {
    try {
      const { device, currentStore } = requireDevice(req);
      const scope = requireScopeForDevice(req.body, device);
      if (!Object.prototype.hasOwnProperty.call(req.body ?? {}, 'state')) throw requestError('Predictions Sync state is required.', 400);
      const expectedRevision = getExpectedRevision(req);
      if (expectedRevision == null) throw requestError('If-Match or an expected revision is required.', 409);
      assertPayloadSize(req.body.state, config.maxPayloadBytes);
      assertPredictionsState(req.body.state, scope);
      const result = currentStore.putPredictionState(scope, expectedRevision, req.body.state, Number(now()));
      const etag = buildDraftSyncEtag(result.revision);
      if (result.conflict) return res.status(409).set('Cache-Control', 'no-store').set('ETag', etag).json({
        ok: false, error: 'Predictions Sync state revision conflict.', revision: result.revision,
        state: result.state, deviceRole: device.role,
      });
      return res.set('Cache-Control', 'no-store').set('ETag', etag).json({
        ok: true, scope, revision: result.revision, state: result.state, deviceRole: device.role,
        updatedAt: new Date(result.updatedAt).toISOString(),
      });
    } catch (error) { return sendError(res, error, 'Could not write Predictions Sync state.'); }
  });

  router.use((error, _req, res, next) => {
    if (error?.type === 'entity.too.large') return res.status(413).set('Cache-Control', 'no-store').json({ ok: false, error: 'Predictions Sync payload is too large.' });
    if (error) return sendError(res, error, 'Invalid Predictions Sync JSON payload.');
    return next();
  });

  return router;
}
