import express from 'express';

export const STORY_STATS_PHASES = Object.freeze([
  'pregame',
  'live',
  'postgame',
]);

export const STORY_STATS_AUDIENCE = 'stats';
export const STORY_STATS_TONE = 'editorial';
export const STORY_STATS_BASE_PATH = '/stories/nfl/games';
export const DEFAULT_STORY_STATS_DAILY_LIMIT = 10;

const DEFAULT_CACHE_TTL_MS = Object.freeze({
  pregame: 5 * 60_000,
  live: 30_000,
  postgame: 24 * 60 * 60_000,
});
const DEFAULT_STALE_TTL_MS = 24 * 60 * 60_000;
const DEFAULT_MAX_CACHE_ENTRIES = 250;
const DEFAULT_SOURCE = Object.freeze({
  provider: 'storystats',
  sport: 'nfl',
  audience: STORY_STATS_AUDIENCE,
  tone: STORY_STATS_TONE,
});

const STORES_BY_GATEWAY = new WeakMap();

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNonNegativeInteger(value) {
  return Number.isInteger(value) && Number.isFinite(value) && value >= 0;
}

function parseGameId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const gameId = Number(value.trim());
  return Number.isSafeInteger(gameId) && gameId > 0 ? gameId : null;
}

function parsePhase(value) {
  if (typeof value !== 'string') return null;
  const phase = value.trim().toLowerCase();
  return STORY_STATS_PHASES.includes(phase) ? phase : null;
}

function makeError(message, statusCode, extra = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  Object.assign(error, extra);
  return error;
}

function normalizeDailyLimit(value) {
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit > 0
    ? limit
    : DEFAULT_STORY_STATS_DAILY_LIMIT;
}

function normalizeCacheDuration(value, fallback) {
  const duration = Number(value);
  return Number.isFinite(duration) && duration >= 0 ? duration : fallback;
}

function getCacheTtlMs(phase, cacheTtlMs) {
  if (typeof cacheTtlMs === 'function') {
    return normalizeCacheDuration(cacheTtlMs(phase), DEFAULT_CACHE_TTL_MS[phase]);
  }
  if (isRecord(cacheTtlMs)) {
    return normalizeCacheDuration(cacheTtlMs[phase], DEFAULT_CACHE_TTL_MS[phase]);
  }
  return normalizeCacheDuration(cacheTtlMs, DEFAULT_CACHE_TTL_MS[phase]);
}

function getUtcDayKey(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function getNextUtcDayMs(nowMs) {
  const date = new Date(nowMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

function cloneJsonValue(value, depth = 0) {
  if (depth > 8) return null;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    return value.slice(0, 500).map((item) => cloneJsonValue(item, depth + 1));
  }
  if (!isRecord(value)) return null;
  const clone = {};
  Object.entries(value).slice(0, 500).forEach(([key, child]) => {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return;
    clone[key] = cloneJsonValue(child, depth + 1);
  });
  return clone;
}

function getProviderPayload(response) {
  if (isRecord(response?.payload)) return response.payload;
  return isRecord(response) ? response : {};
}

function getStoryCandidates(payload) {
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data != null) return [payload.data];
  if (payload.story != null) return [payload.story];
  return [];
}

function getFirstText(...values) {
  return values.find((value) => typeof value === 'string' && value.trim()) ?? null;
}

function normalizeStory(story, { gameId, phase }) {
  const raw = isRecord(story) ? cloneJsonValue(story) : {};
  const createdAt = raw.created_at ?? null;
  const content = raw.content ?? null;
  return {
    // These aliases are intentionally additive. The documented provider keys
    // below remain available to callers that need the original response shape.
    id: hasOwn(raw, 'id') ? raw.id : null,
    phase,
    title: getFirstText(raw.title, raw.headline),
    body: content ?? (hasOwn(raw, 'body') ? raw.body : null),
    generatedAt: createdAt ?? (hasOwn(raw, 'generated_at') ? raw.generated_at : null),

    // Preserve the exact documented StoryStats fields without making clients
    // depend on the normalized aliases above.
    created_at: createdAt,
    content,
    type: hasOwn(raw, 'type') ? raw.type : null,
    entity_tags: hasOwn(raw, 'entity_tags') ? raw.entity_tags : null,
    game_snapshot: hasOwn(raw, 'game_snapshot') ? raw.game_snapshot : null,

    gameId,
    source: {
      ...DEFAULT_SOURCE,
      type: hasOwn(raw, 'type') ? raw.type : null,
      entityTags: hasOwn(raw, 'entity_tags') ? raw.entity_tags : null,
      gameSnapshot: hasOwn(raw, 'game_snapshot') ? raw.game_snapshot : null,
    },
    raw,
  };
}

function compareStories(left, right) {
  const leftTime = Date.parse(left.generatedAt ?? '');
  const rightTime = Date.parse(right.generatedAt ?? '');
  const leftHasTime = Number.isFinite(leftTime);
  const rightHasTime = Number.isFinite(rightTime);
  if (leftHasTime && rightHasTime && leftTime !== rightTime) return leftTime - rightTime;
  if (leftHasTime !== rightHasTime) return leftHasTime ? -1 : 1;
  return 0;
}

function deduplicateStories(stories) {
  const seenIds = new Set();
  return stories.filter((story) => {
    if (story.id == null) return true;
    const key = String(story.id);
    if (seenIds.has(key)) return false;
    seenIds.add(key);
    return true;
  });
}

function buildFreshness({ nowMs, providerFetchedAt, stale, refreshAfterMs }) {
  const fetchedAtMs = Date.parse(providerFetchedAt ?? '') || nowMs;
  const ageMs = Math.max(0, nowMs - fetchedAtMs);
  const resolvedRefreshAfterMs = Math.max(0, Number(refreshAfterMs) || 0);
  return {
    providerFetchedAt: new Date(fetchedAtMs).toISOString(),
    receivedAt: new Date(nowMs).toISOString(),
    ageMs,
    stale: Boolean(stale),
    refreshAfterMs: resolvedRefreshAfterMs,
    nextRefreshAt: new Date(nowMs + resolvedRefreshAfterMs).toISOString(),
  };
}

function getProviderUpstreamRequests(result) {
  const accountingValue = Number(result?.accounting?.upstreamRequests);
  if (isFiniteNonNegativeInteger(accountingValue)) return accountingValue;
  return result?.cache?.hit === true ? 0 : 1;
}

function getErrorUpstreamRequests(error) {
  const accountingValue = Number(error?.upstreamRequests);
  return isFiniteNonNegativeInteger(accountingValue) ? accountingValue : 0;
}

function buildStoryStatsRequest(gameId, phase) {
  return {
    method: 'GET',
    path: buildStoryStatsPath(gameId, phase),
    params: {
      audience: STORY_STATS_AUDIENCE,
      tone: STORY_STATS_TONE,
    },
  };
}

function assertGateway(storyStatsGateway) {
  if (!storyStatsGateway || typeof storyStatsGateway.request !== 'function') {
    throw new TypeError('A StoryStats gateway with a request function is required.');
  }
  if (typeof storyStatsGateway.supports !== 'function') {
    throw new TypeError('A StoryStats gateway with a supports function is required.');
  }
}

function createDailyLedger({ now, dailyLimit }) {
  const usageByDay = new Map();

  function getUsed(dayKey) {
    return usageByDay.get(dayKey) ?? 0;
  }

  function getStatus(nowMs = now()) {
    const dayKey = getUtcDayKey(nowMs);
    const used = getUsed(dayKey);
    const resetAtMs = getNextUtcDayMs(nowMs);
    return {
      day: dayKey,
      dailyLimit,
      dailyUsed: used,
      dailyRemaining: Math.max(0, dailyLimit - used),
      dailyResetAt: new Date(resetAtMs).toISOString(),
    };
  }

  function reserve(nowMs) {
    const dayKey = getUtcDayKey(nowMs);
    const used = getUsed(dayKey);
    if (used >= dailyLimit) {
      throw makeError('StoryStats daily beta request limit is exhausted. Try again after the UTC day resets.', 429, {
        retryAfterMs: Math.max(1, getNextUtcDayMs(nowMs) - nowMs),
        localQuota: true,
      });
    }
    usageByDay.set(dayKey, used + 1);
    return { day: dayKey };
  }

  function settle(reservation, actualRequests) {
    if (!reservation || typeof reservation.day !== 'string') return;
    const resolvedActualRequests = Math.max(0, Number(actualRequests) || 0);
    const used = getUsed(reservation.day);
    const nextUsed = Math.max(0, used - 1 + resolvedActualRequests);
    if (nextUsed > 0) usageByDay.set(reservation.day, nextUsed);
    else usageByDay.delete(reservation.day);
  }

  return { getStatus, reserve, settle };
}

function cleanupCache(state, nowMs) {
  for (const [key, entry] of state.cache) {
    if (nowMs - entry.storedAtMs > entry.staleTtlMs) state.cache.delete(key);
  }
  if (state.cache.size <= state.maxCacheEntries) return;
  [...state.cache.entries()]
    .sort(([, left], [, right]) => left.lastAccessedAtMs - right.lastAccessedAtMs)
    .slice(0, state.cache.size - state.maxCacheEntries)
    .forEach(([key]) => state.cache.delete(key));
}

function buildCacheKey(gameId, phase) {
  return `${gameId}:${phase}:${STORY_STATS_AUDIENCE}:${STORY_STATS_TONE}`;
}

function getCacheEntry(state, key, nowMs, cacheTtlMs) {
  const entry = state.cache.get(key);
  if (!entry) return null;
  if (nowMs - entry.storedAtMs > entry.staleTtlMs) {
    state.cache.delete(key);
    return null;
  }
  entry.lastAccessedAtMs = nowMs;
  return {
    ...entry,
    fresh: nowMs - entry.storedAtMs < cacheTtlMs,
  };
}

function getGatewayFreshness(result, nowMs, fallbackFetchedAt, refreshAfterMs) {
  const providerFetchedAt = result?.freshness?.providerFetchedAt
    ?? result?.cache?.fetchedAt
    ?? fallbackFetchedAt;
  return buildFreshness({
    nowMs,
    providerFetchedAt,
    stale: result?.freshness?.stale === true || result?.cache?.stale === true,
    refreshAfterMs: result?.freshness?.refreshAfterMs ?? refreshAfterMs,
  });
}

function buildNotReadyResult(parsed, { nowMs, cache = null, source = 'scheduler' } = {}) {
  const request = buildStoryStatsRequest(parsed.gameId, parsed.phase);
  const freshness = buildFreshness({
    nowMs,
    providerFetchedAt: new Date(nowMs).toISOString(),
    stale: false,
    refreshAfterMs: getCacheTtlMs(parsed.phase),
  });
  const normalized = normalizeStoryStatsResponse({ data: [] }, parsed);
  return {
    ...normalized,
    availability: 'not-ready',
    request,
    cache: cache ?? {
      hit: false,
      coalesced: false,
      stale: false,
      ageMs: 0,
      fetchedAt: freshness.providerFetchedAt,
      source,
    },
    freshness,
  };
}

export function validateStoryStatsQuery({ gameId, phase } = {}) {
  const parsedGameId = parseGameId(gameId);
  const parsedPhase = parsePhase(phase);
  if (!parsedGameId || !parsedPhase) {
    throw makeError('A valid numeric game ID and phase (pregame, live, or postgame) are required.', 400);
  }
  return { gameId: parsedGameId, phase: parsedPhase };
}

export function buildStoryStatsPath(gameId, phase) {
  const { gameId: parsedGameId, phase: parsedPhase } = validateStoryStatsQuery({ gameId, phase });
  return `${STORY_STATS_BASE_PATH}/${parsedGameId}/${parsedPhase}`;
}

export function buildStoryStatsParams() {
  return new URLSearchParams({
    audience: STORY_STATS_AUDIENCE,
    tone: STORY_STATS_TONE,
  });
}

export function normalizeStoryStatsResponse(response, { gameId, phase } = {}) {
  const parsed = validateStoryStatsQuery({ gameId, phase });
  const payload = getProviderPayload(response);
  const normalizedStories = deduplicateStories(
    getStoryCandidates(payload)
      .filter(isRecord)
      .map((story) => normalizeStory(story, parsed))
      .sort(compareStories),
  );
  return {
    gameId: parsed.gameId,
    phase: parsed.phase,
    game: cloneJsonValue(payload.game) ?? null,
    stories: normalizedStories,
    data: normalizedStories,
    meta: cloneJsonValue(payload.meta) ?? null,
  };
}

export function createStoryStatsStore({
  now = () => Date.now(),
  dailyLimit = DEFAULT_STORY_STATS_DAILY_LIMIT,
  cacheTtlMs,
  staleTtlMs = DEFAULT_STALE_TTL_MS,
  maxCacheEntries = DEFAULT_MAX_CACHE_ENTRIES,
} = {}) {
  return {
    now,
    dailyLimit: normalizeDailyLimit(dailyLimit),
    cacheTtlMs,
    staleTtlMs: normalizeCacheDuration(staleTtlMs, DEFAULT_STALE_TTL_MS),
    maxCacheEntries: Math.max(1, Number.parseInt(String(maxCacheEntries), 10) || DEFAULT_MAX_CACHE_ENTRIES),
    cache: new Map(),
    inFlight: new Map(),
    ledger: createDailyLedger({ now, dailyLimit: normalizeDailyLimit(dailyLimit) }),
  };
}

function resolveStore({ storyStatsGateway, store, ...options }) {
  if (store) return store;
  if (!storyStatsGateway || (typeof storyStatsGateway !== 'object' && typeof storyStatsGateway !== 'function')) {
    return createStoryStatsStore(options);
  }
  let resolved = STORES_BY_GATEWAY.get(storyStatsGateway);
  if (!resolved) {
    resolved = createStoryStatsStore(options);
    STORES_BY_GATEWAY.set(storyStatsGateway, resolved);
  }
  return resolved;
}

async function fetchStoryStatsWithStore({
  gameId,
  phase,
  storyStatsGateway,
  store,
  allowUpstream = true,
} = {}) {
  assertGateway(storyStatsGateway);
  const parsed = validateStoryStatsQuery({ gameId, phase });
  if (!storyStatsGateway.supports('storyStats')) {
    throw makeError('The configured StoryStats gateway does not include NFL stories.', 503);
  }

  const nowMs = store.now();
  cleanupCache(store, nowMs);
  const cacheTtlMs = getCacheTtlMs(parsed.phase, store.cacheTtlMs);
  const cacheKey = buildCacheKey(parsed.gameId, parsed.phase);
  const cached = getCacheEntry(store, cacheKey, nowMs, cacheTtlMs);
  if (cached?.fresh) {
    const freshness = buildFreshness({
      nowMs,
      providerFetchedAt: cached.providerFetchedAt,
      stale: false,
      refreshAfterMs: Math.max(0, cacheTtlMs - (nowMs - cached.storedAtMs)),
    });
    return {
      ...cached.payload,
      request: cached.request,
      cache: {
        hit: true,
        coalesced: false,
        stale: false,
        ageMs: nowMs - cached.storedAtMs,
        fetchedAt: freshness.providerFetchedAt,
        source: 'handler',
      },
      freshness,
      accounting: {
        ...cached.accounting,
        upstreamRequests: 0,
        ...store.ledger.getStatus(nowMs),
      },
    };
  }

  if (!allowUpstream) {
    if (cached) {
      const freshness = buildFreshness({
        nowMs,
        providerFetchedAt: cached.providerFetchedAt,
        stale: true,
        refreshAfterMs: 0,
      });
      return {
        ...cached.payload,
        request: cached.request,
        cache: {
          hit: true,
          coalesced: false,
          stale: true,
          ageMs: nowMs - cached.storedAtMs,
          fetchedAt: freshness.providerFetchedAt,
          source: 'handler-cache-only',
        },
        freshness,
        accounting: {
          ...cached.accounting,
          upstreamRequests: 0,
          ...store.ledger.getStatus(nowMs),
        },
      };
    }

    return {
      ...buildNotReadyResult(parsed, { nowMs }),
      accounting: {
        upstreamRequests: 0,
        ...store.ledger.getStatus(nowMs),
      },
    };
  }

  if (store.inFlight.has(cacheKey)) {
    return store.inFlight.get(cacheKey).then((result) => ({
      ...result,
      cache: { ...result.cache, coalesced: true },
    }));
  }

  const requestPath = buildStoryStatsPath(parsed.gameId, parsed.phase);
  const requestParams = buildStoryStatsParams();
  const reservation = store.ledger.reserve(nowMs);
  const pending = (async () => {
    let providerResult;
    try {
      providerResult = await storyStatsGateway.request({
        path: requestPath,
        params: requestParams,
        capability: 'storyStats',
        paginate: false,
        cacheTtlMs,
        staleTtlMs: store.staleTtlMs,
        refreshAfterMs: cacheTtlMs,
        freshnessKey: `story-stats:v1:${parsed.phase}:${STORY_STATS_AUDIENCE}:${STORY_STATS_TONE}`,
        lane: 'background',
      });
    } catch (error) {
      const failedAtMs = store.now();
      const upstreamRequests = getErrorUpstreamRequests(error);
      store.ledger.settle(reservation, upstreamRequests, failedAtMs);
      if (error?.statusCode === 404) {
        const request = buildStoryStatsRequest(parsed.gameId, parsed.phase);
        const freshness = buildFreshness({
          nowMs: failedAtMs,
          providerFetchedAt: new Date(failedAtMs).toISOString(),
          stale: false,
          refreshAfterMs: cacheTtlMs,
        });
        const normalized = normalizeStoryStatsResponse({ data: [] }, parsed);
        return {
          ...normalized,
          availability: 'not-ready',
          request,
          cache: {
            hit: false,
            coalesced: false,
            stale: false,
            ageMs: 0,
            fetchedAt: freshness.providerFetchedAt,
            source: 'upstream',
          },
          freshness,
          accounting: {
            upstreamRequests,
            ...store.ledger.getStatus(failedAtMs),
          },
        };
      }
      throw error;
    }

    const upstreamRequests = getProviderUpstreamRequests(providerResult);
    store.ledger.settle(reservation, upstreamRequests, store.now());
    const receivedAtMs = store.now();
    const normalized = normalizeStoryStatsResponse(providerResult, parsed);
    const freshness = getGatewayFreshness(providerResult, receivedAtMs, new Date(receivedAtMs).toISOString(), cacheTtlMs);
    const providerAccounting = isRecord(providerResult?.accounting) ? providerResult.accounting : {};
    const accounting = {
      ...providerAccounting,
      upstreamRequests,
      ...store.ledger.getStatus(receivedAtMs),
    };
    const request = buildStoryStatsRequest(parsed.gameId, parsed.phase);
    const result = {
      ...normalized,
      request,
      cache: {
        hit: providerResult?.cache?.hit === true,
        coalesced: false,
        stale: freshness.stale,
        ageMs: freshness.ageMs,
        fetchedAt: freshness.providerFetchedAt,
        source: providerResult?.cache?.hit === true ? 'gateway' : 'upstream',
      },
      freshness,
      accounting,
    };
    if (!freshness.stale) {
      store.cache.set(cacheKey, {
        payload: normalized,
        request,
        accounting,
        providerFetchedAt: freshness.providerFetchedAt,
        storedAtMs: receivedAtMs,
        lastAccessedAtMs: receivedAtMs,
        staleTtlMs: store.staleTtlMs,
      });
    }
    cleanupCache(store, receivedAtMs);
    return result;
  })().finally(() => {
    store.inFlight.delete(cacheKey);
  });

  store.inFlight.set(cacheKey, pending);
  return pending;
}

export function createStoryStatsService({ storyStatsGateway, ...options } = {}) {
  assertGateway(storyStatsGateway);
  const store = createStoryStatsStore(options);
  return {
    store,
    fetch: (request) => fetchStoryStatsWithStore({ ...request, storyStatsGateway, store }),
  };
}

export async function fetchStoryStats({
  gameId,
  phase,
  storyStatsGateway,
  store,
  allowUpstream = true,
  ...options
} = {}) {
  assertGateway(storyStatsGateway);
  const resolvedStore = resolveStore({ storyStatsGateway, store, ...options });
  return fetchStoryStatsWithStore({
    gameId,
    phase,
    storyStatsGateway,
    store: resolvedStore,
    allowUpstream,
  });
}

function sendStoryStatsError(res, error) {
  const response = res.status(error?.statusCode ?? 502).set('Cache-Control', 'no-store');
  if (error?.retryAfterMs != null) {
    response.set('Retry-After', String(Math.max(1, Math.ceil(error.retryAfterMs / 1_000))));
  }
  return response.json({
    ok: false,
    provider: 'storystats',
    error: error?.message ?? 'Could not load StoryStats.',
  });
}

export function createStoryStatsRouter({
  storyStatsGateway,
  service,
  now = () => Date.now(),
  dailyLimit = DEFAULT_STORY_STATS_DAILY_LIMIT,
  allowUpstream = true,
  cacheTtlMs,
  staleTtlMs = DEFAULT_STALE_TTL_MS,
  maxCacheEntries = DEFAULT_MAX_CACHE_ENTRIES,
} = {}) {
  assertGateway(storyStatsGateway);
  const resolvedService = service ?? createStoryStatsService({
    storyStatsGateway,
    now,
    dailyLimit,
    cacheTtlMs,
    staleTtlMs,
    maxCacheEntries,
  });
  const router = express.Router();

  router.get('/game/:gameId/story', async (req, res) => {
    try {
      const payload = await resolvedService.fetch({
        gameId: req.params.gameId,
        phase: req.query.phase,
        allowUpstream,
      });
      return res.set('Cache-Control', 'no-store').json({
        ok: true,
        provider: 'storystats',
        ...payload,
      });
    } catch (error) {
      return sendStoryStatsError(res, error);
    }
  });

  return router;
}
