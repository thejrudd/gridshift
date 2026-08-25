import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import express from 'express';
import process from 'node:process';
import { getDraftSyncConfig } from './draftSyncConfig.js';
import {
  buildDraftSyncEtag,
  formatPairingCode,
  generateDeviceToken,
  generatePairingId,
  generatePairingCode,
  hashDraftSyncToken,
  parseDraftSyncRevision,
  normalizePairingCode,
} from './draftSyncCrypto.js';
import { createDraftSyncStore, DRAFT_SYNC_DEVICE_ROLES } from './draftSyncStore.js';

const MAX_ID_LENGTH = 160;
const DRAFT_SYNC_SCHEMA_VERSION = 1;
const PAIRING_RATE_WINDOW_MS = 10 * 60 * 1_000;
const PAIRING_RATE_LIMIT = 12;

function requestError(message, statusCode, kind = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (kind) error.kind = kind;
  return error;
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
    leagueId: normalizeId(input.leagueId ?? input.league_id, 'League ID'),
    season,
    draftId: normalizeId(input.draftId ?? input.draft_id, 'Draft ID'),
  };
}

function bodyHas(body, key) {
  return body != null && Object.prototype.hasOwnProperty.call(body, key);
}

function getBearerToken(req) {
  const authorization = String(req.headers?.authorization ?? '').trim();
  if (/^Bearer\s+/i.test(authorization)) return authorization.replace(/^Bearer\s+/i, '').trim();
  return String(req.headers?.['x-draft-sync-device-token'] ?? '').trim();
}

function sendError(res, error, fallbackMessage = 'Draft Sync request failed.') {
  return res.status(error?.statusCode ?? 400).set('Cache-Control', 'no-store').json({
    ok: false,
    error: error?.message ?? fallbackMessage,
  });
}

function getExpectedRevision(req) {
  const header = req.headers?.['if-match'];
  if (header != null) return parseDraftSyncRevision(header);
  return parseDraftSyncRevision(req.body?.expectedRevision ?? req.body?.revision);
}

function getInitialChoiceAt(req) {
  if (!Object.prototype.hasOwnProperty.call(req.body ?? {}, 'initialChoiceAt')) return null;
  const value = Number(req.body?.initialChoiceAt);
  if (!Number.isSafeInteger(value) || value < 0) throw requestError('Initial Draft Sync choice time is invalid.', 400);
  return value;
}

function ifNoneMatchMatches(req, etag) {
  return String(req.headers?.['if-none-match'] ?? '')
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === etag || value === `W/${etag}`);
}

function assertPayloadSize(value, maxPayloadBytes) {
  const size = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (size > maxPayloadBytes) throw requestError('Draft Sync payload is too large.', 413);
}

function isPlainRecord(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim() || item.length > MAX_ID_LENGTH)) {
    throw requestError(`${label} must be an array of player IDs.`, 400);
  }
}

function assertDraftSyncState(state) {
  if (!isPlainRecord(state)) throw requestError('Draft Sync state must be a JSON object.', 400);
  if (state.schemaVersion !== DRAFT_SYNC_SCHEMA_VERSION) {
    throw requestError('This Draft Sync state schema is not supported by the server.', 400);
  }
  if (!isPlainRecord(state.board) || !isPlainRecord(state.board.byPosition)) {
    throw requestError('Draft Sync state must include a board.', 400);
  }
  assertStringArray(state.board.overall, 'Board overall order');
  for (const [position, ids] of Object.entries(state.board.byPosition)) {
    if (!position.trim() || position.length > MAX_ID_LENGTH) throw requestError('Board position is invalid.', 400);
    assertStringArray(ids, `Board ${position} order`);
  }
  if (!isPlainRecord(state.modelWeights)
    || Object.values(state.modelWeights).some((value) => !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100)) {
    throw requestError('Draft Sync model weights are invalid.', 400);
  }
  assertStringArray(state.keeperIds, 'Keeper IDs');
  return state;
}

function requireScopeForDevice(input, device) {
  const scope = normalizeScope(input);
  if (scope.sleeperUserId !== device.sleeperUserId) {
    throw requestError('This device is not authorized for that Sleeper user.', 403);
  }
  return scope;
}

function isDuplicate(error) {
  return error?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || error?.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

export function createDraftSyncRouter({
  config: injectedConfig,
  env = process.env,
  store: injectedStore,
  storeFactory = createDraftSyncStore,
  now = () => Date.now(),
  randomBytes = crypto.randomBytes,
  randomInt = crypto.randomInt,
} = {}) {
  const config = injectedConfig ?? getDraftSyncConfig({ env });
  const router = express.Router();
  let store = injectedStore ?? null;
  let storeError = null;
  const pairingAttempts = new Map();

  // This parser is mounted before the app-wide parser in server/index.js so
  // Draft Sync can enforce its own configured request limit and 413 response.
  router.use(express.json({ limit: `${config.maxPayloadBytes}b` }));

  function requireReady() {
    if (!config.enabled || !config.ready) {
      throw requestError('Draft Sync is not configured on this server.', 503);
    }
    if (store) return store;
    if (storeError) throw requestError('Draft Sync storage is unavailable.', 503);
    try {
      store = storeFactory({ config, now });
      return store;
    } catch (error) {
      storeError = error;
      throw requestError('Draft Sync storage is unavailable.', 503);
    }
  }

  function requireDevice(req) {
    const token = getBearerToken(req);
    if (!token) throw requestError('A Draft Sync device token is required.', 401);
    const currentStore = requireReady();
    let device;
    try {
      device = currentStore.getDevice(token);
    } catch {
      throw requestError('Draft Sync storage is unavailable.', 503);
    }
    if (!device) throw requestError('The Draft Sync device token is invalid.', 401);
    if (device.revokedAt != null) throw requestError('This Draft Sync device has been revoked.', 403);
    return { device, token, currentStore };
  }

  function enforcePairingRateLimit(req) {
    const forwarded = String(req.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim();
    const key = String(req.ip ?? forwarded ?? 'unknown');
    const currentTime = Number(now());
    const attempts = (pairingAttempts.get(key) ?? []).filter((timestamp) => currentTime - timestamp < PAIRING_RATE_WINDOW_MS);
    if (attempts.length >= PAIRING_RATE_LIMIT) throw requestError('Too many pairing attempts. Try again shortly.', 429);
    attempts.push(currentTime);
    pairingAttempts.set(key, attempts);
  }

  router.get('/status', (_req, res) => res.set('Cache-Control', 'no-store').json({
    ok: true,
    draftSync: {
      enabled: config.enabled,
      ready: config.ready,
      pairingTtlMs: config.pairingTtlMs,
      maxPayloadBytes: config.maxPayloadBytes,
    },
  }));

  router.post('/pairing/start', (req, res) => {
    try {
      enforcePairingRateLimit(req);
      const currentStore = requireReady();
      const sleeperUserId = normalizeId(req.body?.sleeperUserId ?? req.body?.sleeper_user_id, 'Sleeper user ID');
      const createdAt = Number(now());
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const deviceToken = generateDeviceToken(randomBytes);
        const pairingId = generatePairingId(randomBytes);
        const pairingCode = generatePairingCode(randomInt);
        try {
          currentStore.createPairing({
            pairingId,
            sleeperUserId,
            starterTokenHash: hashDraftSyncToken(deviceToken, config.sessionSecret),
            code: pairingCode,
            createdAt,
            expiresAt: createdAt + config.pairingTtlMs,
          });
          return res.set('Cache-Control', 'no-store').json({
            ok: true,
            pairingCode: formatPairingCode(pairingCode),
            pairingId,
            expiresAt: new Date(createdAt + config.pairingTtlMs).toISOString(),
          deviceToken,
          deviceRole: DRAFT_SYNC_DEVICE_ROLES.AUTHORITATIVE,
          sleeperUserId,
          });
        } catch (error) {
          if (!isDuplicate(error) || attempt === 3) throw error;
        }
      }
    } catch (error) {
      return sendError(res, error, 'Could not start Draft Sync pairing.');
    }
  });

  router.get('/pairing/status', (req, res) => {
    try {
      const { device, currentStore } = requireDevice(req);
      const pairingId = String(req.query?.pairingId ?? req.query?.pairing_id ?? '').trim();
      if (!pairingId || pairingId.length > MAX_ID_LENGTH) throw requestError('A valid Draft Sync pairing ID is required.', 400);
      const pairing = currentStore.getPairingStatus({
        pairingId,
        starterTokenHash: device.tokenHash,
        currentTime: Number(now()),
      });
      if (!pairing) throw requestError('This Draft Sync pairing is no longer available.', 404);
      return res.set('Cache-Control', 'no-store').json({ ok: true, ...pairing });
    } catch (error) {
      return sendError(res, error, 'Could not read Draft Sync pairing status.');
    }
  });

  router.post('/pairing/claim', (req, res) => {
    try {
      enforcePairingRateLimit(req);
      const currentStore = requireReady();
      const sleeperUserId = normalizeId(req.body?.sleeperUserId ?? req.body?.sleeper_user_id, 'Sleeper user ID');
      const pairingCode = normalizePairingCode(req.body?.pairingCode ?? req.body?.pairing_code);
      if (!pairingCode) throw requestError('A valid Draft Sync pairing code is required.', 400);
      const deviceToken = generateDeviceToken(randomBytes);
      currentStore.claimPairing({
        sleeperUserId,
        code: pairingCode,
        tokenHash: hashDraftSyncToken(deviceToken, config.sessionSecret),
        claimedAt: Number(now()),
      });
      return res.set('Cache-Control', 'no-store').json({
        ok: true,
        deviceToken,
        deviceRole: DRAFT_SYNC_DEVICE_ROLES.NON_AUTHORITATIVE,
        sleeperUserId,
      });
    } catch (error) {
      if (error?.kind === 'pairing-user-mismatch') return sendError(res, requestError(error.message, 403));
      if (['pairing-unavailable', 'pairing-used', 'pairing-expired'].includes(error?.kind)) {
        return sendError(res, requestError(error.message, 409));
      }
      return sendError(res, error, 'Could not claim Draft Sync pairing.');
    }
  });

  router.get('/device', (req, res) => {
    try {
      const { device } = requireDevice(req);
      return res.set('Cache-Control', 'no-store').json({
        ok: true,
        sleeperUserId: device.sleeperUserId,
        deviceRole: device.role,
      });
    } catch (error) {
      return sendError(res, error, 'Could not read Draft Sync device details.');
    }
  });

  router.get('/state', (req, res) => {
    try {
      const { device, currentStore } = requireDevice(req);
      const scope = requireScopeForDevice(req.query, device);
      const state = currentStore.getState(scope);
      const etag = buildDraftSyncEtag(state.revision);
      if (ifNoneMatchMatches(req, etag)) {
        return res.status(304).set('Cache-Control', 'no-store').set('ETag', etag).end();
      }
      return res.set('Cache-Control', 'no-store').set('ETag', etag).json({
        ok: true,
        scope,
        revision: state.revision,
        state: state.state,
        deviceRole: device.role,
        initialChoiceAt: state.initialChoiceAt,
        updatedAt: state.updatedAt == null ? null : new Date(state.updatedAt).toISOString(),
      });
    } catch (error) {
      return sendError(res, error, 'Could not read Draft Sync state.');
    }
  });

  router.put('/state', (req, res) => {
    try {
      const { device, currentStore } = requireDevice(req);
      const scope = requireScopeForDevice(req.body, device);
      if (!bodyHas(req.body, 'state')) throw requestError('Draft Sync state is required.', 400);
      const expectedRevision = getExpectedRevision(req);
      if (expectedRevision == null) throw requestError('If-Match or an expected revision is required.', 409);
      const initialChoiceAt = getInitialChoiceAt(req);
      assertPayloadSize(req.body.state, config.maxPayloadBytes);
      assertDraftSyncState(req.body.state);
      const result = currentStore.putState(scope, expectedRevision, req.body.state, Number(now()), initialChoiceAt, device.role);
      if (result.conflict) {
        const etag = buildDraftSyncEtag(result.revision);
        return res.status(409).set('Cache-Control', 'no-store').set('ETag', etag).json({
          ok: false,
          error: 'Draft Sync state revision conflict.',
          revision: result.revision,
          state: result.state,
          deviceRole: device.role,
          initialChoiceAt: result.initialChoiceAt,
        });
      }
      const etag = buildDraftSyncEtag(result.revision);
      return res.set('Cache-Control', 'no-store').set('ETag', etag).json({
        ok: true,
        scope,
        revision: result.revision,
        state: result.state,
        deviceRole: device.role,
        initialChoiceAt: result.initialChoiceAt,
        updatedAt: new Date(result.updatedAt).toISOString(),
      });
    } catch (error) {
      return sendError(res, error, 'Could not write Draft Sync state.');
    }
  });

  const revokeDevice = (req, res) => {
    try {
      const { token, currentStore } = requireDevice(req);
      if (!currentStore.revokeDevice(token)) throw requestError('The Draft Sync device token is invalid.', 401);
      return res.set('Cache-Control', 'no-store').json({ ok: true, revoked: true });
    } catch (error) {
      return sendError(res, error, 'Could not revoke Draft Sync device.');
    }
  };
  router.post('/revoke-device', revokeDevice);
  router.delete('/revoke-device', revokeDevice);

  router.use((error, _req, res, next) => {
    if (error?.type === 'entity.too.large') return res.status(413).set('Cache-Control', 'no-store').json({ ok: false, error: 'Draft Sync payload is too large.' });
    if (error) return sendError(res, error, 'Invalid Draft Sync JSON payload.');
    return next();
  });

  return router;
}
