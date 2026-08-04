import crypto from 'node:crypto';
import express from 'express';
import { parseCookies } from './sessionCrypto.js';

export const LIVE_SESSION_COOKIE = 'gridshift_live_session';
export const LIVE_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const LIVE_SESSION_SECRET_ERROR = 'GRIDSHIFT_LIVE_COOKIE_SECRET or GRIDSHIFT_SESSION_SECRET is required for live access.';
const BDL_BASE_URL = 'https://api.balldontlie.io';
const LIVE_CACHE = new Map();
const LIVE_IN_FLIGHT = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_BUCKETS = new Map();
const MAX_UPSTREAM_PAGES = 12;
const DEFAULT_PER_PAGE = 100;

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function getLiveCookieSecret() {
  const secret = process.env.GRIDSHIFT_LIVE_COOKIE_SECRET || process.env.GRIDSHIFT_SESSION_SECRET;
  if (!hasValue(secret)) throw new Error(LIVE_SESSION_SECRET_ERROR);
  return secret;
}

function getEncryptionKey(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encryptLiveSession(payload, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.from(JSON.stringify({
    v: 1,
    iv: iv.toString('base64url'),
    tag: tag.toString('base64url'),
    data: encrypted.toString('base64url'),
  })).toString('base64url');
}

function decryptLiveSession(cookieValue, secret, { now = Date.now() } = {}) {
  if (!cookieValue) return null;
  const packed = JSON.parse(Buffer.from(cookieValue, 'base64url').toString('utf8'));
  if (packed?.v !== 1 || !packed.iv || !packed.tag || !packed.data) {
    throw new Error('Invalid live session cookie.');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(secret),
    Buffer.from(packed.iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(packed.tag, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(packed.data, 'base64url')),
    decipher.final(),
  ]);
  const payload = JSON.parse(decrypted.toString('utf8'));

  const createdAt = Date.parse(payload.createdAt);
  if (!Number.isFinite(createdAt) || now - createdAt > LIVE_SESSION_TTL_SECONDS * 1000) {
    throw new Error('Live session expired.');
  }

  return payload;
}

function buildLiveSetCookieHeader(value, { clear = false } = {}) {
  const secure = process.env.NODE_ENV === 'production' && process.env.GRIDSHIFT_COOKIE_SECURE !== 'false';
  const maxAge = clear ? 0 : LIVE_SESSION_TTL_SECONDS;
  const encoded = clear ? '' : encodeURIComponent(value);
  return [
    `${LIVE_SESSION_COOKIE}=${encoded}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    secure ? 'Secure' : null,
  ].filter(Boolean).join('; ');
}

function normalizeLiveLeagueKey(value, provider = 'sleeper') {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const prefixed = raw.includes(':');
  const [rawProvider, ...rest] = prefixed ? raw.split(':') : [provider, raw];
  const normalizedProvider = String(rawProvider || provider).trim().toLowerCase();
  const leagueId = (prefixed ? rest.join(':') : raw).trim();

  if (normalizedProvider !== 'sleeper') {
    throw new Error('Live scoring v8.1 supports Sleeper league IDs only.');
  }
  if (!leagueId) return null;
  return `sleeper:${leagueId}`;
}

function getAllowedLeagueKeys() {
  return String(process.env.GRIDSHIFT_LIVE_ALLOWED_LEAGUE_IDS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => normalizeLiveLeagueKey(entry))
    .filter(Boolean);
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getLiveConfigStatus() {
  const hasApiKey = hasValue(process.env.GRIDSHIFT_BDL_API_KEY);
  const allowedLeagueKeys = getAllowedLeagueKeys();
  const hasAccessCode = hasValue(process.env.GRIDSHIFT_LIVE_ACCESS_CODE);
  const hasCookieSecret = hasValue(process.env.GRIDSHIFT_LIVE_COOKIE_SECRET)
    || hasValue(process.env.GRIDSHIFT_SESSION_SECRET);
  return {
    enabled: hasApiKey && allowedLeagueKeys.length > 0 && hasCookieSecret,
    provider: 'balldontlie',
    leagueProvider: 'sleeper',
    tier: process.env.GRIDSHIFT_BDL_TIER || null,
    allowedLeagueCount: allowedLeagueKeys.length,
    leagueScopeEnabled: allowedLeagueKeys.length > 0,
    accessCodeRequired: hasAccessCode,
    cookieSigningReady: hasCookieSecret,
    mockPlaysEnabled: process.env.NODE_ENV !== 'production'
      && process.env.GRIDSHIFT_LIVE_MOCK_PLAYS === 'true',
    cacheTtlMs: parsePositiveInteger(process.env.GRIDSHIFT_LIVE_CACHE_TTL_MS, 1000),
    finalTtlMs: parsePositiveInteger(process.env.GRIDSHIFT_LIVE_FINAL_TTL_MS, 14_400_000),
    archiveEnabled: process.env.GRIDSHIFT_LIVE_ARCHIVE_ENABLED !== 'false',
    maxRequestsPerMinute: parsePositiveInteger(process.env.GRIDSHIFT_LIVE_MAX_REQ_PER_MIN, 300),
  };
}

function getLiveSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie ?? '');
  const value = cookies[LIVE_SESSION_COOKIE];
  if (!value) return null;
  return decryptLiveSession(value, getLiveCookieSecret());
}

function requireLiveSession(req) {
  const session = getLiveSessionFromRequest(req);
  if (!session?.leagueKey) {
    const error = new Error('GridShift Live session is required.');
    error.statusCode = 401;
    throw error;
  }
  requireAllowedLeague({ leagueKey: session.leagueKey });
  return session;
}

function requireAllowedLeague(input = {}) {
  const leagueKey = normalizeLiveLeagueKey(input.leagueId ?? input.leagueKey, input.provider ?? 'sleeper');
  if (!leagueKey) throw new Error('Sleeper league ID is required.');
  const allowed = new Set(getAllowedLeagueKeys());
  if (!allowed.has(leagueKey)) {
    throw new Error('This Sleeper league is not enabled for GridShift Live.');
  }
  return leagueKey;
}

function getClientRateLimitKey(req, session) {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  const ip = forwarded || req.socket?.remoteAddress || 'unknown';
  return `${session.leagueKey}|${ip}`;
}

function requireRateLimit(req, session) {
  const maxRequests = getLiveConfigStatus().maxRequestsPerMinute;
  if (!Number.isFinite(maxRequests) || maxRequests <= 0) return;

  const now = Date.now();
  const key = getClientRateLimitKey(req, session);
  const bucket = (RATE_LIMIT_BUCKETS.get(key) ?? []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  if (bucket.length >= maxRequests) {
    const error = new Error('GridShift Live is receiving too many requests. Try again in a few seconds.');
    error.statusCode = 429;
    throw error;
  }
  bucket.push(now);
  RATE_LIMIT_BUCKETS.set(key, bucket);
}

function sanitizeIntegerParam(value, { min = 1, max = 999999999, fallback = null } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function sanitizeBooleanParam(value) {
  if (value == null || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'no'].includes(normalized)) return false;
  return null;
}

function appendArrayParam(params, key, values) {
  values
    .map((value) => sanitizeIntegerParam(value))
    .filter((value) => value != null)
    .forEach((value) => params.append(key, String(value)));
}

function splitCsvParam(value) {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildGamesParams(query = {}) {
  const params = new URLSearchParams();
  params.set('per_page', String(DEFAULT_PER_PAGE));
  appendArrayParam(params, 'seasons[]', splitCsvParam(query.seasons ?? query.season));
  appendArrayParam(params, 'weeks[]', splitCsvParam(query.weeks ?? query.week));
  appendArrayParam(params, 'team_ids[]', splitCsvParam(query.teamIds ?? query.team_ids));

  const dateValues = splitCsvParam(query.dates ?? query.date)
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  dateValues.forEach((date) => params.append('dates[]', date));

  const postseason = sanitizeBooleanParam(query.postseason);
  if (postseason != null) params.set('postseason', String(postseason));
  return params;
}

function buildGameScopedParams(gameId, query = {}) {
  const normalizedGameId = sanitizeIntegerParam(gameId);
  if (!normalizedGameId) {
    const error = new Error('A valid BALLDONTLIE game ID is required.');
    error.statusCode = 400;
    throw error;
  }

  const params = new URLSearchParams();
  params.set('per_page', String(DEFAULT_PER_PAGE));
  const cursor = sanitizeIntegerParam(query.cursor);
  if (cursor) params.set('cursor', String(cursor));
  return { normalizedGameId, params };
}

function buildMultiGameStatsParams(query = {}) {
  const gameIds = splitCsvParam(query.gameIds ?? query.game_ids)
    .map((value) => sanitizeIntegerParam(value))
    .filter((value) => value != null);
  if (!gameIds.length) {
    const error = new Error('At least one valid BALLDONTLIE game ID is required.');
    error.statusCode = 400;
    throw error;
  }

  const params = new URLSearchParams();
  params.set('per_page', String(DEFAULT_PER_PAGE));
  gameIds.forEach((gameId) => params.append('game_ids[]', String(gameId)));
  return params;
}

function groupStatsByGameId(rows = []) {
  return rows.reduce((groups, row) => {
    const rawGameId = row?.game?.id ?? row?.game_id ?? row?.gameId;
    if (rawGameId == null) return groups;
    const gameId = String(rawGameId);
    groups[gameId] = groups[gameId] ?? [];
    groups[gameId].push(row);
    return groups;
  }, {});
}

function getCacheTtlMs(payload = null) {
  const status = String(payload?.data?.status ?? payload?.data?.[0]?.status ?? '').toLowerCase();
  const finalTtlMs = getLiveConfigStatus().finalTtlMs;
  if (status.includes('final') || status.includes('complete')) return finalTtlMs;
  return getLiveConfigStatus().cacheTtlMs;
}

function buildCacheKey(endpoint, params) {
  return `${endpoint}?${params.toString()}`;
}

function getCachedPayload(cacheKey) {
  const cached = LIVE_CACHE.get(cacheKey);
  if (!cached) return null;
  const ageMs = Date.now() - cached.storedAt;
  if (ageMs > cached.ttlMs) {
    LIVE_CACHE.delete(cacheKey);
    return null;
  }
  return { ...cached, ageMs };
}

function buildLiveResponse(payload, cacheInfo, session) {
  return {
    ok: true,
    data: payload?.data ?? [],
    meta: payload?.meta ?? null,
    session: { enabled: true, leagueKey: session.leagueKey, provider: session.provider },
    cache: {
      hit: Boolean(cacheInfo?.hit),
      ageMs: cacheInfo?.ageMs ?? 0,
      ttlMs: cacheInfo?.ttlMs ?? getLiveConfigStatus().cacheTtlMs,
      fetchedAt: cacheInfo?.fetchedAt ?? new Date().toISOString(),
    },
  };
}

async function fetchBdlPage(endpoint, params) {
  const apiKey = String(process.env.GRIDSHIFT_BDL_API_KEY ?? '').trim();
  if (!apiKey) {
    const error = new Error('GridShift Live is not configured on this server.');
    error.statusCode = 503;
    throw error;
  }

  const url = new URL(endpoint, BDL_BASE_URL);
  params.forEach((value, key) => url.searchParams.append(key, value));
  const response = await fetch(url, {
    headers: {
      Authorization: apiKey,
      Accept: 'application/json',
    },
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(payload?.error || `BALLDONTLIE returned ${response.status}.`);
    error.statusCode = response.status;
    throw error;
  }
  return payload ?? { data: [], meta: null };
}

async function fetchBdlAllPages(endpoint, initialParams) {
  const data = [];
  let meta = null;
  let params = new URLSearchParams(initialParams);

  for (let page = 0; page < MAX_UPSTREAM_PAGES; page += 1) {
    const payload = await fetchBdlPage(endpoint, params);
    if (Array.isArray(payload?.data)) data.push(...payload.data);
    else if (payload?.data != null) data.push(payload.data);
    meta = payload?.meta ?? null;

    const nextCursor = sanitizeIntegerParam(meta?.next_cursor);
    if (!nextCursor) break;
    params = new URLSearchParams(initialParams);
    params.set('cursor', String(nextCursor));
  }

  return { data, meta };
}

async function fetchCachedBdl(endpoint, params) {
  const cacheKey = buildCacheKey(endpoint, params);
  const cached = getCachedPayload(cacheKey);
  if (cached) {
    return {
      payload: cached.payload,
      cacheInfo: {
        hit: true,
        ageMs: cached.ageMs,
        ttlMs: cached.ttlMs,
        fetchedAt: cached.fetchedAt,
      },
    };
  }

  if (LIVE_IN_FLIGHT.has(cacheKey)) return LIVE_IN_FLIGHT.get(cacheKey);

  const request = fetchBdlAllPages(endpoint, params)
    .then((payload) => {
      const ttlMs = getCacheTtlMs(payload);
      const fetchedAt = new Date().toISOString();
      LIVE_CACHE.set(cacheKey, {
        payload,
        storedAt: Date.now(),
        ttlMs,
        fetchedAt,
      });
      return {
        payload,
        cacheInfo: { hit: false, ageMs: 0, ttlMs, fetchedAt },
      };
    })
    .finally(() => {
      LIVE_IN_FLIGHT.delete(cacheKey);
    });

  LIVE_IN_FLIGHT.set(cacheKey, request);
  return request;
}

function sendLiveError(res, error, fallbackMessage) {
  return res.status(error?.statusCode ?? 400).set('Cache-Control', 'no-store').json({
    ok: false,
    error: error?.message ?? fallbackMessage,
  });
}

export function createLiveRouter() {
  const router = express.Router();

  router.get('/status', (req, res) => {
    let session = null;
    try {
      session = getLiveSessionFromRequest(req);
    } catch {
      session = null;
    }
    res.set('Cache-Control', 'no-store').json({
      ok: true,
      live: getLiveConfigStatus(),
      session: session
        ? { enabled: true, leagueKey: session.leagueKey, provider: session.provider }
        : { enabled: false },
    });
  });

  router.post('/session', (req, res) => {
    try {
      const status = getLiveConfigStatus();
      if (!status.enabled) {
        return res.status(503).set('Cache-Control', 'no-store').json({
          ok: false,
          error: 'GridShift Live is not configured on this server.',
          live: status,
        });
      }

      const leagueKey = requireAllowedLeague(req.body ?? {});
      const requiredAccessCode = String(process.env.GRIDSHIFT_LIVE_ACCESS_CODE ?? '').trim();
      const providedAccessCode = String(req.body?.accessCode ?? '').trim();
      if (requiredAccessCode && providedAccessCode !== requiredAccessCode) {
        return res.status(403).set('Cache-Control', 'no-store').json({
          ok: false,
          error: 'Live access code is invalid.',
        });
      }

      const session = {
        provider: 'sleeper',
        leagueKey,
        leagueId: leagueKey.replace(/^sleeper:/, ''),
        createdAt: new Date().toISOString(),
      };
      const encrypted = encryptLiveSession(session, getLiveCookieSecret());
      return res
        .set('Cache-Control', 'no-store')
        .set('Set-Cookie', buildLiveSetCookieHeader(encrypted))
        .json({ ok: true, session: { enabled: true, leagueKey, provider: 'sleeper' } });
    } catch (error) {
      return res.status(400).set('Cache-Control', 'no-store').json({
        ok: false,
        error: error?.message ?? 'Could not enable GridShift Live.',
      });
    }
  });

  router.delete('/session', (_req, res) => {
    res
      .set('Cache-Control', 'no-store')
      .set('Set-Cookie', buildLiveSetCookieHeader('', { clear: true }))
      .json({ ok: true, session: { enabled: false } });
  });

  router.get('/games', async (req, res) => {
    try {
      const session = requireLiveSession(req);
      requireRateLimit(req, session);
      const params = buildGamesParams(req.query);
      const { payload, cacheInfo } = await fetchCachedBdl('/nfl/v1/games', params);
      return res.set('Cache-Control', 'no-store').json(buildLiveResponse(payload, cacheInfo, session));
    } catch (error) {
      return sendLiveError(res, error, 'Could not load live games.');
    }
  });

  router.get('/game/:gameId/plays', async (req, res) => {
    try {
      const session = requireLiveSession(req);
      requireRateLimit(req, session);
      const { normalizedGameId, params } = buildGameScopedParams(req.params.gameId, req.query);
      params.set('game_id', String(normalizedGameId));
      const { payload, cacheInfo } = await fetchCachedBdl('/nfl/v1/plays', params);
      return res.set('Cache-Control', 'no-store').json(buildLiveResponse(payload, cacheInfo, session));
    } catch (error) {
      return sendLiveError(res, error, 'Could not load live plays.');
    }
  });

  router.get('/player-stats', async (req, res) => {
    try {
      const session = requireLiveSession(req);
      requireRateLimit(req, session);
      const params = buildMultiGameStatsParams(req.query);
      const { payload, cacheInfo } = await fetchCachedBdl('/nfl/v1/stats', params);
      const response = buildLiveResponse(payload, cacheInfo, session);
      return res.set('Cache-Control', 'no-store').json({
        ...response,
        games: groupStatsByGameId(response.data),
      });
    } catch (error) {
      return sendLiveError(res, error, 'Could not load live player stats.');
    }
  });

  router.get('/game/:gameId/player-stats', async (req, res) => {
    try {
      const session = requireLiveSession(req);
      requireRateLimit(req, session);
      const { normalizedGameId, params } = buildGameScopedParams(req.params.gameId, req.query);
      params.append('game_ids[]', String(normalizedGameId));
      const { payload, cacheInfo } = await fetchCachedBdl('/nfl/v1/stats', params);
      return res.set('Cache-Control', 'no-store').json(buildLiveResponse(payload, cacheInfo, session));
    } catch (error) {
      return sendLiveError(res, error, 'Could not load live player stats.');
    }
  });

  return router;
}
