import crypto from 'node:crypto';
import process from 'node:process';

const BDL_BASE_URL = 'https://api.balldontlie.io';
const DEFAULT_PER_PAGE = 100;
const DEFAULT_MAX_PAGES = 12;
const DEFAULT_CACHE_ENTRIES = 250;
const RATE_WINDOW_MS = 60_000;

const TIER_PROFILES = Object.freeze({
  free: Object.freeze({
    tier: 'free',
    requestsPerMinute: 5,
    capabilities: Object.freeze({ games: true, stats: false, teamStats: false, plays: false, fantasy: false }),
  }),
  'all-star': Object.freeze({
    tier: 'all-star',
    requestsPerMinute: 60,
    capabilities: Object.freeze({ games: true, stats: true, teamStats: true, plays: false, fantasy: false }),
  }),
  goat: Object.freeze({
    tier: 'goat',
    requestsPerMinute: 600,
    capabilities: Object.freeze({ games: true, stats: true, teamStats: true, plays: true, fantasy: true }),
  }),
  trial: Object.freeze({
    tier: 'trial',
    requestsPerMinute: 5,
    capabilities: Object.freeze({ games: true, stats: true, teamStats: true, plays: true, fantasy: true }),
  }),
  unknown: Object.freeze({
    tier: 'unknown',
    requestsPerMinute: 5,
    capabilities: Object.freeze({ games: false, stats: false, teamStats: false, plays: false, fantasy: false }),
  }),
});

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeTier(value) {
  if (value == null) return 'unknown';
  const normalized = String(value).trim().toLowerCase().replace(/[_\s]+/g, '-');
  if (!normalized) return 'unknown';
  if (normalized === 'allstar') return 'all-star';
  if (['goat-trial', 'trial-goat', 'goat-trial-48h'].includes(normalized)) return 'trial';
  return Object.hasOwn(TIER_PROFILES, normalized) ? normalized : 'unknown';
}

function getInternalCeiling(effectiveLimit) {
  if (effectiveLimit <= 5) return Math.max(1, effectiveLimit - 1);
  return Math.max(1, Math.floor(effectiveLimit * 0.75));
}

function getCadence(profile, effectiveLimit, internalCeiling) {
  const canSustainPaidLiveLane = effectiveLimit >= 60
    && (profile.tier === 'goat' || profile.tier === 'all-star');
  const desiredLiveMs = profile.tier === 'goat' ? 1_000 : 5_000;
  const quotaFloorMs = Math.ceil(RATE_WINDOW_MS / Math.max(1, internalCeiling));
  return {
    scoresLiveEnabled: canSustainPaidLiveLane,
    scoresLiveMs: canSustainPaidLiveLane ? Math.max(desiredLiveMs, quotaFloorMs) : 8_000,
    scoresIdleMs: 30_000,
    maxBackoffMs: 120_000,
  };
}

export function getBalldontlieGatewayConfig(env = process.env) {
  const apiKeyReady = hasValue(env.GRIDSHIFT_BDL_API_KEY);
  const tier = normalizeTier(env.GRIDSHIFT_BDL_TIER);
  const profile = TIER_PROFILES[tier];
  const requestedEffectiveLimit = parsePositiveInteger(
    env.GRIDSHIFT_BDL_EFFECTIVE_MAX_REQ_PER_MIN,
    5,
  );
  const effectiveRequestsPerMinute = Math.min(profile.requestsPerMinute, requestedEffectiveLimit);
  const defaultInternalCeiling = getInternalCeiling(effectiveRequestsPerMinute);
  const internalCeilingRequestsPerMinute = Math.min(
    effectiveRequestsPerMinute,
    parsePositiveInteger(env.GRIDSHIFT_BDL_INTERNAL_MAX_REQ_PER_MIN, defaultInternalCeiling),
  );
  const cadence = getCadence(profile, effectiveRequestsPerMinute, internalCeilingRequestsPerMinute);
  const protectedScoresRequestsPerMinute = cadence.scoresLiveEnabled
    ? Math.min(Math.ceil(RATE_WINDOW_MS / cadence.scoresLiveMs), internalCeilingRequestsPerMinute)
    : 0;
  return {
    apiKeyReady,
    tier,
    capabilities: { ...profile.capabilities },
    effectiveRequestsPerMinute,
    internalCeilingRequestsPerMinute,
    reserveRequestsPerMinute: effectiveRequestsPerMinute - internalCeilingRequestsPerMinute,
    protectedScoresRequestsPerMinute,
    cadence,
    maxCacheEntries: parsePositiveInteger(env.GRIDSHIFT_BDL_CACHE_MAX_ENTRIES, DEFAULT_CACHE_ENTRIES),
    maxPages: parsePositiveInteger(env.GRIDSHIFT_BDL_MAX_PAGES, DEFAULT_MAX_PAGES),
  };
}

function canonicalizeParams(input = new URLSearchParams()) {
  const entries = [...new Set(Array.from(new URLSearchParams(input).entries())
    .map(([key, value]) => `${key}\u0000${value}`))]
    .map((entry) => entry.split('\u0000'))
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => (
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
    ));
  const params = new URLSearchParams();
  entries.forEach(([key, value]) => params.append(key, value));
  return params;
}

export function buildBalldontlieRequestKey({
  credentialFingerprint,
  path,
  params,
  paginate = false,
  freshnessKey = 'default',
}) {
  const canonicalParams = canonicalizeParams(params);
  return `${credentialFingerprint}:${paginate ? 'pages' : 'resource'}:${freshnessKey}:${path}?${canonicalParams.toString()}`;
}

function parseRetryAfterMs(response, nowMs) {
  const raw = response?.headers?.get?.('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - nowMs) : null;
}

async function readResponsePayload(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function makeGatewayError(message, {
  statusCode = 502,
  retryAfterMs = null,
  localQuota = false,
} = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (retryAfterMs != null) error.retryAfterMs = retryAfterMs;
  if (localQuota) error.localQuota = true;
  return error;
}

function buildFreshness({ nowMs, fetchedAtMs, stale, refreshAfterMs, backoffUntilMs }) {
  const nextRefreshMs = Math.max(nowMs + refreshAfterMs, backoffUntilMs ?? 0);
  return {
    providerFetchedAt: new Date(fetchedAtMs).toISOString(),
    receivedAt: new Date(nowMs).toISOString(),
    ageMs: Math.max(0, nowMs - fetchedAtMs),
    stale: Boolean(stale),
    refreshAfterMs: Math.max(0, nextRefreshMs - nowMs),
    nextRefreshAt: new Date(nextRefreshMs).toISOString(),
  };
}

export function createBalldontlieGateway({
  fetcher = fetch,
  env = process.env,
  now = () => Date.now(),
} = {}) {
  const config = getBalldontlieGatewayConfig(env);
  const apiKey = String(env.GRIDSHIFT_BDL_API_KEY ?? '').trim();
  const credentialFingerprint = apiKey
    ? crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 16)
    : 'missing';
  const cache = new Map();
  const inFlight = new Map();
  let requestTimestamps = [];
  let backoffUntilMs = 0;
  let consecutiveFailures = 0;
  let totalUpstreamRequests = 0;

  function cleanRequestWindow(nowMs) {
    requestTimestamps = requestTimestamps.filter((timestamp) => nowMs - timestamp < RATE_WINDOW_MS);
  }

  function getQuotaSnapshot(nowMs = now()) {
    cleanRequestWindow(nowMs);
    return {
      windowMs: RATE_WINDOW_MS,
      usedRequests: requestTimestamps.length,
      remainingRequests: Math.max(0, config.internalCeilingRequestsPerMinute - requestTimestamps.length),
      totalUpstreamRequests,
      backoffUntil: backoffUntilMs > nowMs ? new Date(backoffUntilMs).toISOString() : null,
    };
  }

  function consumeQuota(nowMs, lane) {
    cleanRequestWindow(nowMs);
    if (backoffUntilMs > nowMs) {
      throw makeGatewayError('BALLDONTLIE refresh is temporarily backing off.', {
        statusCode: 429,
        retryAfterMs: backoffUntilMs - nowMs,
      });
    }
    const laneCeiling = lane === 'scores-live'
      ? config.internalCeilingRequestsPerMinute
      : Math.max(0, config.internalCeilingRequestsPerMinute - config.protectedScoresRequestsPerMinute);
    if (requestTimestamps.length >= laneCeiling) {
      const oldest = requestTimestamps[0] ?? nowMs;
      const retryAfterMs = Math.max(250, RATE_WINDOW_MS - (nowMs - oldest));
      throw makeGatewayError('BALLDONTLIE request budget is temporarily exhausted.', {
        statusCode: 429,
        retryAfterMs,
        localQuota: true,
      });
    }
    requestTimestamps.push(nowMs);
    totalUpstreamRequests += 1;
  }

  function markFailure(error, nowMs) {
    consecutiveFailures += 1;
    const retryAfterMs = error?.retryAfterMs
      ?? Math.min(30_000, 1_000 * (2 ** Math.min(5, consecutiveFailures - 1)));
    backoffUntilMs = Math.max(backoffUntilMs, nowMs + retryAfterMs);
  }

  function markSuccess() {
    consecutiveFailures = 0;
    backoffUntilMs = 0;
  }

  function cleanupCache(nowMs) {
    for (const [key, entry] of cache) {
      if (nowMs - entry.storedAtMs > entry.staleTtlMs) cache.delete(key);
    }
    if (cache.size <= config.maxCacheEntries) return;
    const oldest = [...cache.entries()]
      .sort(([, left], [, right]) => left.lastAccessedAtMs - right.lastAccessedAtMs);
    oldest.slice(0, cache.size - config.maxCacheEntries).forEach(([key]) => cache.delete(key));
  }

  function readCached(key, { cacheTtlMs, staleTtlMs, nowMs }) {
    const entry = cache.get(key);
    if (!entry) return null;
    const ageMs = nowMs - entry.storedAtMs;
    if (ageMs > staleTtlMs) {
      cache.delete(key);
      return null;
    }
    entry.lastAccessedAtMs = nowMs;
    return { entry, fresh: ageMs <= (entry.cacheTtlMs ?? cacheTtlMs) };
  }

  async function fetchPage(path, params, lane) {
    const requestStartedAt = now();
    consumeQuota(requestStartedAt, lane);
    try {
      const url = new URL(path, BDL_BASE_URL);
      canonicalizeParams(params).forEach((value, key) => url.searchParams.append(key, value));
      const response = await fetcher(url, {
        headers: {
          Authorization: apiKey,
          Accept: 'application/json',
        },
      });
      const payload = await readResponsePayload(response);
      if (!response.ok) {
        const retryAfterMs = response.status === 429 ? parseRetryAfterMs(response, now()) : null;
        throw makeGatewayError(payload?.error || `BALLDONTLIE returned ${response.status}.`, {
          statusCode: response.status,
          retryAfterMs,
        });
      }
      return payload ?? { data: [], meta: null };
    } catch (error) {
      error.upstreamRequests = 1;
      throw error;
    }
  }

  async function fetchPayload({ path, params, paginate, lane }) {
    if (!paginate) {
      const payload = await fetchPage(path, params, lane);
      return { payload, pageCount: 1 };
    }

    const data = [];
    let meta = null;
    let cursor = null;
    let pageCount = 0;
    for (let page = 0; page < config.maxPages; page += 1) {
      const pageParams = new URLSearchParams(params);
      pageParams.set('per_page', String(DEFAULT_PER_PAGE));
      if (cursor) pageParams.set('cursor', String(cursor));
      let payload;
      try {
        payload = await fetchPage(path, pageParams, lane);
      } catch (error) {
        error.upstreamRequests = pageCount + (error.upstreamRequests ?? 0);
        throw error;
      }
      pageCount += 1;
      if (Array.isArray(payload?.data)) data.push(...payload.data);
      else if (payload?.data != null) data.push(payload.data);
      meta = payload?.meta ?? null;
      const nextCursor = String(meta?.next_cursor ?? '').trim();
      if (!nextCursor || nextCursor === String(cursor ?? '')) break;
      cursor = nextCursor;
    }
    return { payload: { data, meta }, pageCount };
  }

  function supports(capability) {
    return config.apiKeyReady && config.capabilities[capability] === true;
  }

  function assertReady(capability = 'games') {
    if (!config.apiKeyReady) {
      throw makeGatewayError('Statistics Scores is not configured with a server-side BALLDONTLIE API key.', {
        statusCode: 503,
      });
    }
    if (!supports(capability)) {
      throw makeGatewayError(`The configured BALLDONTLIE tier does not include ${capability}.`, {
        statusCode: 403,
      });
    }
  }

  function getStatus() {
    const quota = getQuotaSnapshot();
    return {
      tier: config.tier,
      capabilities: {
        ...config.capabilities,
        liveScores: config.apiKeyReady && config.cadence.scoresLiveEnabled,
      },
      cadence: { ...config.cadence },
      rateLimit: {
        effectiveRequestsPerMinute: config.effectiveRequestsPerMinute,
        internalCeilingRequestsPerMinute: config.internalCeilingRequestsPerMinute,
        reserveRequestsPerMinute: config.reserveRequestsPerMinute,
        protectedScoresRequestsPerMinute: config.protectedScoresRequestsPerMinute,
        windowMs: quota.windowMs,
        usedRequests: quota.usedRequests,
        remainingRequests: quota.remainingRequests,
        backoffUntil: quota.backoffUntil,
      },
    };
  }

  async function request({
    path,
    params = new URLSearchParams(),
    capability = 'games',
    paginate = false,
    cacheTtlMs = 30_000,
    staleTtlMs = 120_000,
    refreshAfterMs = cacheTtlMs,
    resolveCacheTtlMs,
    freshnessKey,
    lane = 'background',
  } = {}) {
    assertReady(capability);
    if (typeof path !== 'string' || !path.startsWith('/nfl/v1/')) {
      throw makeGatewayError('A valid BALLDONTLIE NFL path is required.', { statusCode: 400 });
    }
    const safeCacheTtlMs = Math.max(0, Number(cacheTtlMs) || 0);
    const safeStaleTtlMs = Math.max(safeCacheTtlMs, Number(staleTtlMs) || safeCacheTtlMs);
    const resolvedFreshnessKey = freshnessKey
      ?? `fresh:${safeCacheTtlMs}:stale:${safeStaleTtlMs}`;
    const key = buildBalldontlieRequestKey({
      credentialFingerprint,
      path,
      params,
      paginate,
      freshnessKey: resolvedFreshnessKey,
    });
    const requestNow = now();
    cleanupCache(requestNow);
    const cached = readCached(key, {
      cacheTtlMs: safeCacheTtlMs,
      staleTtlMs: safeStaleTtlMs,
      nowMs: requestNow,
    });
    if (cached?.fresh) {
      return {
        payload: cached.entry.payload,
        cache: { hit: true, coalesced: false, stale: false },
        freshness: buildFreshness({
          nowMs: requestNow,
          fetchedAtMs: cached.entry.fetchedAtMs,
          stale: false,
          refreshAfterMs,
          backoffUntilMs,
        }),
        accounting: { pageCount: cached.entry.pageCount, upstreamRequests: 0 },
      };
    }

    if (inFlight.has(key)) {
      return inFlight.get(key).then((result) => ({
        ...result,
        cache: { ...result.cache, coalesced: true },
      }));
    }

    const pending = (async () => {
      try {
        const { payload, pageCount } = await fetchPayload({ path, params, paginate, lane });
        const fetchedAtMs = now();
        const payloadCacheTtlMs = typeof resolveCacheTtlMs === 'function'
          ? Math.max(0, Number(resolveCacheTtlMs(payload, safeCacheTtlMs)) || safeCacheTtlMs)
          : safeCacheTtlMs;
        markSuccess();
        cache.set(key, {
          payload,
          pageCount,
          cacheTtlMs: payloadCacheTtlMs,
          storedAtMs: fetchedAtMs,
          fetchedAtMs,
          lastAccessedAtMs: fetchedAtMs,
          staleTtlMs: safeStaleTtlMs,
        });
        cleanupCache(fetchedAtMs);
        return {
          payload,
          cache: { hit: false, coalesced: false, stale: false },
          freshness: buildFreshness({
            nowMs: fetchedAtMs,
            fetchedAtMs,
            stale: false,
            refreshAfterMs,
            backoffUntilMs,
          }),
          accounting: { pageCount, upstreamRequests: pageCount },
        };
      } catch (error) {
        const failedAtMs = now();
        if (!error?.localQuota) markFailure(error, failedAtMs);
        if (cached?.entry) {
          return {
            payload: cached.entry.payload,
            cache: { hit: true, coalesced: false, stale: true },
            freshness: buildFreshness({
              nowMs: failedAtMs,
              fetchedAtMs: cached.entry.fetchedAtMs,
              stale: true,
              refreshAfterMs,
              backoffUntilMs,
            }),
            accounting: {
              pageCount: cached.entry.pageCount,
              upstreamRequests: error?.upstreamRequests ?? 0,
            },
          };
        }
        throw error;
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, pending);
    return pending;
  }

  return {
    request,
    supports,
    getStatus,
    getQuotaSnapshot,
  };
}
