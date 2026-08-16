import express from 'express';
import process from 'node:process';
import { createBalldontlieGateway } from './balldontlieGateway.js';
import { createPublicRequestGuard } from './publicRequestGuard.js';

const ESPN_NFL_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const DEFAULT_PER_PAGE = 100;
const SCORE_CACHE_TTL_MS = 30_000;
const ESPN_SCORE_CACHE_TTL_MS = 6_000;
const ESPN_SCORE_CACHE = new Map();
const ESPN_SCORE_IN_FLIGHT = new Map();
const GATEWAYS_BY_FETCHER = new WeakMap();
const STATISTICS_SCORES_SOURCES = Object.freeze({
  FIXTURE: 'fixture',
  ESPN: 'espn',
  BALLDONTLIE: 'balldontlie',
});
const STATISTICS_SCORES_SOURCE_VALUES = new Set(Object.values(STATISTICS_SCORES_SOURCES));
const STATISTICS_SCORES_PHASES = Object.freeze({
  PRESEASON: 'preseason',
  REGULAR: 'regular',
});

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseSeason(value) {
  const season = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(season) && season >= 1999 && season <= 2200 ? season : null;
}

function normalizeSource(value) {
  const source = String(value ?? '').trim().toLowerCase();
  return STATISTICS_SCORES_SOURCE_VALUES.has(source) ? source : null;
}

function normalizePhase(value) {
  return String(value ?? '').trim().toLowerCase() === STATISTICS_SCORES_PHASES.PRESEASON
    ? STATISTICS_SCORES_PHASES.PRESEASON
    : STATISTICS_SCORES_PHASES.REGULAR;
}

function parseWeek(value) {
  const week = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(week) && week >= 1 && week <= 22 ? week : null;
}

function parseGameId(value) {
  const gameId = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(gameId) && gameId > 0 ? gameId : null;
}

function getBdlSeasonType(phase) {
  return normalizePhase(phase) === STATISTICS_SCORES_PHASES.PRESEASON ? 1 : 2;
}

function resolveGateway({ gateway, fetcher = fetch, env = process.env } = {}) {
  if (gateway) return gateway;
  let byEnv = GATEWAYS_BY_FETCHER.get(fetcher);
  if (!byEnv) {
    byEnv = new WeakMap();
    GATEWAYS_BY_FETCHER.set(fetcher, byEnv);
  }
  let resolved = byEnv.get(env);
  if (!resolved) {
    resolved = createBalldontlieGateway({ fetcher, env });
    byEnv.set(env, resolved);
  }
  return resolved;
}

function toCompatCache(result) {
  return {
    ...result.cache,
    ageMs: result.freshness.ageMs,
    fetchedAt: result.freshness.providerFetchedAt,
  };
}

function getProviderLabel(provider, overrideApplied) {
  if (provider === STATISTICS_SCORES_SOURCES.FIXTURE) return 'Fixture';
  if (provider === STATISTICS_SCORES_SOURCES.BALLDONTLIE) return 'BALLDONTLIE';
  return overrideApplied ? 'ESPN live' : 'ESPN fallback';
}

function buildBdlGamesParams(season, phase, cursor = null) {
  const params = new URLSearchParams({
    per_page: String(DEFAULT_PER_PAGE),
    'seasons[]': String(season),
  });
  if (phase === STATISTICS_SCORES_PHASES.PRESEASON) {
    params.append('season_type[]', '1');
  } else {
    params.append('season_type[]', '2');
    params.append('season_type[]', '3');
  }
  if (cursor) params.set('cursor', String(cursor));
  return params;
}

export function buildBdlLiveWeekParams(season, phase, week) {
  const params = new URLSearchParams({
    per_page: String(DEFAULT_PER_PAGE),
    'seasons[]': String(season),
    'weeks[]': String(week),
  });
  params.append('season_type[]', phase === STATISTICS_SCORES_PHASES.PRESEASON ? '1' : '2');
  return params;
}

export function validateStatisticsScoresLiveWeekQuery(query = {}) {
  const rawSeason = String(query.season ?? '').trim();
  const rawWeek = String(query.week ?? '').trim();
  const season = /^\d{4}$/.test(rawSeason) ? parseSeason(rawSeason) : null;
  const week = /^\d{1,2}$/.test(rawWeek) ? parseWeek(rawWeek) : null;
  const phase = String(query.phase ?? '').trim().toLowerCase();
  if (!season || !week || !Object.values(STATISTICS_SCORES_PHASES).includes(phase)) {
    const error = new Error('Valid season, phase, and week query parameters are required.');
    error.statusCode = 400;
    throw error;
  }
  return { season, phase, week };
}

export function getStatisticsScoresConfigStatus(env = process.env, { source, gateway } = {}) {
  const apiKeyReady = hasValue(env.GRIDSHIFT_BDL_API_KEY);
  const gatewayStatus = (gateway ?? resolveGateway({ env })).getStatus();
  const runtime = String(env.NODE_ENV ?? '').trim().toLowerCase();
  const overrideAllowed = runtime === 'development' || runtime === 'test';
  const requestedSource = normalizeSource(source);
  const overrideApplied = overrideAllowed && requestedSource !== null;
  const gamesCapabilityReady = gatewayStatus.capabilities?.games === true;
  const automaticBdlReady = apiKeyReady && gamesCapabilityReady;
  const provider = overrideApplied
    ? requestedSource
    : automaticBdlReady
      ? STATISTICS_SCORES_SOURCES.BALLDONTLIE
      : STATISTICS_SCORES_SOURCES.ESPN;
  const available = provider !== STATISTICS_SCORES_SOURCES.BALLDONTLIE || (apiKeyReady && gamesCapabilityReady);
  const selectionReason = overrideApplied
    ? available ? 'developer-override' : 'developer-override-missing-key'
    : automaticBdlReady ? 'configured-key' : apiKeyReady ? 'unsupported-capability' : 'no-api-key';
  const message = overrideApplied
    ? provider === STATISTICS_SCORES_SOURCES.FIXTURE
      ? 'Statistics Scores is using the local fixture developer source.'
      : provider === STATISTICS_SCORES_SOURCES.ESPN
        ? 'Statistics Scores is using the ESPN live developer source.'
        : available
          ? 'Statistics Scores is using the BALLDONTLIE API developer source.'
          : 'The BALLDONTLIE API developer source requires a server-side API key.'
    : automaticBdlReady
      ? 'Statistics Scores is using BALLDONTLIE. Fantasy Live league enablement does not control this source.'
      : apiKeyReady
        ? 'The configured BALLDONTLIE profile cannot provide Scores games. Showing ESPN fallback.'
      : 'Statistics Scores is using ESPN fallback because no server-side BALLDONTLIE key is configured.';
  return {
    provider,
    providerLabel: getProviderLabel(provider, overrideApplied),
    apiKeyReady,
    available,
    overrideAllowed,
    overrideApplied,
    requestedSource: overrideApplied ? requestedSource : null,
    selectionReason,
    message,
    tier: gatewayStatus.tier,
    capabilities: gatewayStatus.capabilities,
    cadence: gatewayStatus.cadence,
    rateLimit: gatewayStatus.rateLimit,
  };
}

export async function fetchStatisticsScoresGames({
  season,
  phase,
  source,
  fetcher = fetch,
  env = process.env,
  gateway,
} = {}) {
  const parsedSeason = parseSeason(season);
  if (!parsedSeason) throw new Error('A valid NFL season is required.');
  const resolvedPhase = normalizePhase(phase);

  const resolvedGateway = resolveGateway({ gateway, fetcher, env });
  const status = getStatisticsScoresConfigStatus(env, { source, gateway: resolvedGateway });
  if (status.provider !== STATISTICS_SCORES_SOURCES.BALLDONTLIE) {
    return { ...status, season: parsedSeason, phase: resolvedPhase, games: [], meta: null };
  }
  const result = await resolvedGateway.request({
    path: '/nfl/v1/games',
    params: buildBdlGamesParams(parsedSeason, resolvedPhase),
    capability: 'games',
    paginate: true,
    cacheTtlMs: SCORE_CACHE_TTL_MS,
    staleTtlMs: 5 * 60_000,
    refreshAfterMs: SCORE_CACHE_TTL_MS,
  });
  return {
    ...status,
    season: parsedSeason,
    phase: resolvedPhase,
    games: result.payload.data,
    meta: result.payload.meta,
    cache: toCompatCache(result),
    freshness: result.freshness,
    accounting: result.accounting,
  };
}

export async function fetchStatisticsScoresGamePlays({
  gameId,
  phase,
  fetcher = fetch,
  env = process.env,
  gateway,
} = {}) {
  const parsedGameId = parseGameId(gameId);
  if (!parsedGameId) {
    const error = new Error('A valid BALLDONTLIE game ID is required.');
    error.statusCode = 400;
    throw error;
  }
  const resolvedGateway = resolveGateway({ gateway, fetcher, env });
  const resolvedPhase = normalizePhase(phase);
  const seasonType = getBdlSeasonType(resolvedPhase);
  const params = new URLSearchParams({
    game_id: String(parsedGameId),
    season_type: String(seasonType),
  });
  const result = await resolvedGateway.request({
    path: '/nfl/v1/plays',
    params,
    capability: 'plays',
    paginate: true,
    cacheTtlMs: SCORE_CACHE_TTL_MS,
    staleTtlMs: 5 * 60_000,
    refreshAfterMs: SCORE_CACHE_TTL_MS,
  });
  return {
    provider: STATISTICS_SCORES_SOURCES.BALLDONTLIE,
    gameId: parsedGameId,
    phase: resolvedPhase,
    seasonType,
    data: result.payload.data,
    meta: result.payload.meta,
    cache: toCompatCache(result),
    freshness: result.freshness,
    accounting: result.accounting,
  };
}

export async function fetchStatisticsScoresGameDetail({
  gameId,
  phase,
  fetcher = fetch,
  env = process.env,
  gateway,
} = {}) {
  const parsedGameId = parseGameId(gameId);
  if (!parsedGameId) {
    const error = new Error('A valid BALLDONTLIE game ID is required.');
    error.statusCode = 400;
    throw error;
  }
  const resolvedGateway = resolveGateway({ gateway, fetcher, env });
  const resolvedPhase = normalizePhase(phase);
  const seasonType = getBdlSeasonType(resolvedPhase);
  const seasonParams = new URLSearchParams({ season_type: String(seasonType) });
  const playerParams = new URLSearchParams(seasonParams);
  playerParams.append('game_ids[]', String(parsedGameId));
  const teamParams = new URLSearchParams(seasonParams);
  teamParams.append('game_ids[]', String(parsedGameId));
  const playParams = new URLSearchParams(seasonParams);
  playParams.set('game_id', String(parsedGameId));
  const requestResource = (options) => resolvedGateway.request({
    cacheTtlMs: SCORE_CACHE_TTL_MS,
    staleTtlMs: 5 * 60_000,
    refreshAfterMs: SCORE_CACHE_TTL_MS,
    ...options,
  });

  const gameRequest = requestResource({
    path: `/nfl/v1/games/${parsedGameId}`,
    capability: 'games',
  });
  const playerRequest = resolvedGateway.supports('stats')
    ? requestResource({ path: '/nfl/v1/stats', params: playerParams, capability: 'stats', paginate: true })
    : Promise.resolve(null);
  const teamRequest = resolvedGateway.supports('teamStats')
    ? requestResource({ path: '/nfl/v1/team_stats', params: teamParams, capability: 'teamStats', paginate: true })
    : Promise.resolve(null);
  const playRequest = resolvedGateway.supports('plays')
    ? requestResource({ path: '/nfl/v1/plays', params: playParams, capability: 'plays', paginate: true })
    : Promise.resolve(null);

  const [gameResult, playerResult, teamResult, playResult] = await Promise.all([
    gameRequest,
    playerRequest,
    teamRequest,
    playRequest,
  ]);
  const game = gameResult.payload?.data ?? null;
  const playerStats = playerResult?.payload?.data ?? [];
  const teamStats = teamResult?.payload?.data ?? [];
  const plays = playResult?.payload?.data ?? [];
  const scoringPlays = plays.filter((play) => play?.scoring_play === true);
  const freshnessResults = [gameResult, playerResult, teamResult, playResult].filter(Boolean);
  const oldestFreshness = freshnessResults
    .map((result) => result.freshness)
    .sort((left, right) => Date.parse(left.providerFetchedAt) - Date.parse(right.providerFetchedAt))[0];
  const stale = freshnessResults.some((result) => result.freshness.stale);
  const gatewayStatus = resolvedGateway.getStatus();
  return {
    provider: STATISTICS_SCORES_SOURCES.BALLDONTLIE,
    gameId: parsedGameId,
    phase: resolvedPhase,
    seasonType,
    game,
    teamStats,
    playerStats,
    plays,
    scoringPlays,
    coverage: {
      game: game !== null,
      teamStats: teamStats.length > 0,
      playerStats: playerStats.length > 0,
      plays: plays.length > 0,
      scoring: scoringPlays.length > 0,
    },
    capabilities: gatewayStatus.capabilities,
    meta: {
      teamStats: teamResult?.payload?.meta ?? null,
      playerStats: playerResult?.payload?.meta ?? null,
      plays: playResult?.payload?.meta ?? null,
    },
    cache: {
      hit: freshnessResults.every((result) => result.cache.hit),
      coalesced: freshnessResults.some((result) => result.cache.coalesced),
      stale,
      ageMs: oldestFreshness?.ageMs ?? 0,
      fetchedAt: oldestFreshness?.providerFetchedAt ?? new Date().toISOString(),
    },
    freshness: oldestFreshness ? { ...oldestFreshness, stale } : null,
    accounting: {
      pageCount: freshnessResults.reduce((sum, result) => sum + result.accounting.pageCount, 0),
      upstreamRequests: freshnessResults.reduce((sum, result) => sum + result.accounting.upstreamRequests, 0),
    },
  };
}

export async function fetchStatisticsScoresEspnWeek({
  season,
  phase,
  week,
  fetcher = fetch,
} = {}) {
  const parsedSeason = parseSeason(season);
  const parsedWeek = parseWeek(week);
  if (!parsedSeason || !parsedWeek) throw new Error('A valid NFL season and week are required.');
  const resolvedPhase = normalizePhase(phase);
  const seasonType = resolvedPhase === STATISTICS_SCORES_PHASES.PRESEASON ? 1 : 2;
  const cacheKey = `${parsedSeason}:${resolvedPhase}:${parsedWeek}`;
  const cached = ESPN_SCORE_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.storedAt < ESPN_SCORE_CACHE_TTL_MS) {
    return {
      season: parsedSeason,
      phase: resolvedPhase,
      week: parsedWeek,
      scoreboard: cached.scoreboard,
      cache: { hit: true, ageMs: Date.now() - cached.storedAt, fetchedAt: cached.fetchedAt },
    };
  }

  if (ESPN_SCORE_IN_FLIGHT.has(cacheKey)) return ESPN_SCORE_IN_FLIGHT.get(cacheKey);

  const request = (async () => {
    const url = new URL(ESPN_NFL_SCOREBOARD_URL);
    url.searchParams.set('seasontype', String(seasonType));
    url.searchParams.set('week', String(parsedWeek));
    url.searchParams.set('dates', String(parsedSeason));
    const response = await fetcher(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    let scoreboard = null;
    try {
      scoreboard = await response.json();
    } catch {
      scoreboard = null;
    }
    if (!response.ok) {
      const error = new Error(`ESPN scoreboard returned ${response.status}.`);
      error.statusCode = response.status;
      throw error;
    }
    const fetchedAt = new Date().toISOString();
    ESPN_SCORE_CACHE.set(cacheKey, { scoreboard, storedAt: Date.now(), fetchedAt });
    return {
      season: parsedSeason,
      phase: resolvedPhase,
      week: parsedWeek,
      scoreboard,
      cache: { hit: false, ageMs: 0, fetchedAt },
    };
  })().finally(() => {
    ESPN_SCORE_IN_FLIGHT.delete(cacheKey);
  });

  ESPN_SCORE_IN_FLIGHT.set(cacheKey, request);
  return request;
}

function buildEspnFreshness(payload, refreshAfterMs) {
  const nowMs = Date.now();
  const fetchedAtMs = Date.parse(payload.cache?.fetchedAt ?? '') || nowMs;
  const ageMs = Math.max(0, nowMs - fetchedAtMs);
  const remainingMs = Math.max(0, refreshAfterMs - ageMs);
  return {
    providerFetchedAt: new Date(fetchedAtMs).toISOString(),
    receivedAt: new Date(nowMs).toISOString(),
    ageMs,
    stale: false,
    refreshAfterMs: remainingMs,
    nextRefreshAt: new Date(nowMs + remainingMs).toISOString(),
  };
}

function buildEspnCompatCache(payload, freshness) {
  return {
    hit: Boolean(payload.cache?.hit),
    coalesced: false,
    stale: false,
    ageMs: freshness.ageMs,
    fetchedAt: freshness.providerFetchedAt,
  };
}

export async function fetchStatisticsScoresLiveWeek({
  season,
  phase,
  week,
  source,
  fetcher = fetch,
  env = process.env,
  gateway,
} = {}) {
  const parsedSeason = parseSeason(season);
  const parsedWeek = parseWeek(week);
  if (!parsedSeason || !parsedWeek) {
    const error = new Error('A valid NFL season and week are required.');
    error.statusCode = 400;
    throw error;
  }
  const resolvedPhase = normalizePhase(phase);
  const resolvedGateway = resolveGateway({ gateway, fetcher, env });
  const gatewayStatus = resolvedGateway.getStatus();
  const providerStatus = getStatisticsScoresConfigStatus(env, {
    source,
    gateway: resolvedGateway,
  });
  const useBdl = providerStatus.provider === STATISTICS_SCORES_SOURCES.BALLDONTLIE
    && gatewayStatus.capabilities.liveScores === true;

  if (useBdl) {
    try {
      const result = await resolvedGateway.request({
        path: '/nfl/v1/games',
        params: buildBdlLiveWeekParams(parsedSeason, resolvedPhase, parsedWeek),
        capability: 'games',
        paginate: false,
        cacheTtlMs: gatewayStatus.cadence.scoresLiveMs,
        staleTtlMs: gatewayStatus.cadence.maxBackoffMs,
        refreshAfterMs: gatewayStatus.cadence.scoresLiveMs,
        freshnessKey: `scores-live:${gatewayStatus.cadence.scoresLiveMs}`,
        lane: 'scores-live',
      });
      return {
        provider: STATISTICS_SCORES_SOURCES.BALLDONTLIE,
        season: parsedSeason,
        phase: resolvedPhase,
        week: parsedWeek,
        games: Array.isArray(result.payload?.data) ? result.payload.data : [],
        meta: result.payload?.meta ?? null,
        capabilities: gatewayStatus.capabilities,
        cadence: gatewayStatus.cadence,
        rateLimit: resolvedGateway.getStatus().rateLimit,
        freshness: result.freshness,
        cache: toCompatCache(result),
        accounting: result.accounting,
      };
    } catch (error) {
      const fallback = await fetchStatisticsScoresEspnWeek({
        season: parsedSeason,
        phase: resolvedPhase,
        week: parsedWeek,
        fetcher,
      });
      const freshness = buildEspnFreshness(fallback, 8_000);
      return {
        provider: STATISTICS_SCORES_SOURCES.ESPN,
        ...fallback,
        capabilities: gatewayStatus.capabilities,
        cadence: gatewayStatus.cadence,
        rateLimit: resolvedGateway.getStatus().rateLimit,
        freshness,
        cache: buildEspnCompatCache(fallback, freshness),
        fallbackReason: error?.statusCode === 429 ? 'balldontlie-rate-limited' : 'balldontlie-unavailable',
      };
    }
  }

  const fallback = await fetchStatisticsScoresEspnWeek({
    season: parsedSeason,
    phase: resolvedPhase,
    week: parsedWeek,
    fetcher,
  });
  const freshness = buildEspnFreshness(fallback, 8_000);
  return {
    provider: STATISTICS_SCORES_SOURCES.ESPN,
    ...fallback,
    capabilities: gatewayStatus.capabilities,
    cadence: gatewayStatus.cadence,
    rateLimit: gatewayStatus.rateLimit,
    freshness,
    cache: buildEspnCompatCache(fallback, freshness),
    fallbackReason: providerStatus.apiKeyReady ? 'balldontlie-live-lane-disabled' : 'no-balldontlie-key',
  };
}

function sendScoresError(res, error) {
  const response = res.status(error?.statusCode ?? 502).set('Cache-Control', 'no-store');
  if (error?.retryAfterMs != null) {
    response.set('Retry-After', String(Math.max(1, Math.ceil(error.retryAfterMs / 1_000))));
  }
  return response.json({
    ok: false,
    provider: 'balldontlie',
    providerLabel: 'BALLDONTLIE',
    error: error?.message ?? 'Could not load BALLDONTLIE Scores data.',
  });
}

export function createStatisticsScoresRouter({
  fetcher = fetch,
  env = process.env,
  gateway: injectedGateway,
  liveWeekGuard = createPublicRequestGuard(),
} = {}) {
  const router = express.Router();
  const gateway = injectedGateway ?? resolveGateway({ fetcher, env });

  router.get('/status', (req, res) => {
    res.set('Cache-Control', 'no-store').json({
      ok: true,
      ...getStatisticsScoresConfigStatus(env, { source: req.query.source, gateway }),
    });
  });

  router.get('/espn-week', async (req, res) => {
    try {
      const payload = await fetchStatisticsScoresEspnWeek({
        season: req.query.season,
        phase: req.query.phase,
        week: req.query.week,
        fetcher,
      });
      return res.set('Cache-Control', 'no-store').json({ ok: true, provider: 'espn', ...payload });
    } catch (error) {
      return res.status(error?.statusCode ?? 502).set('Cache-Control', 'no-store').json({
        ok: false,
        provider: 'espn',
        error: error?.message ?? 'Could not load ESPN live scores.',
      });
    }
  });

  router.get('/live-week', liveWeekGuard, async (req, res) => {
    try {
      const { season, phase, week } = validateStatisticsScoresLiveWeekQuery(req.query);
      const payload = await fetchStatisticsScoresLiveWeek({
        season,
        phase,
        week,
        source: req.query.source,
        fetcher,
        env,
        gateway,
      });
      return res.set('Cache-Control', 'no-store').json({ ok: true, ...payload });
    } catch (error) {
      return sendScoresError(res, error);
    }
  });

  const sendGames = async (req, res) => {
    try {
      const payload = await fetchStatisticsScoresGames({
        season: req.query.season,
        phase: req.query.phase ?? (req.path === '/preseason' ? STATISTICS_SCORES_PHASES.PRESEASON : undefined),
        source: req.query.source,
        fetcher,
        env,
        gateway,
      });
      return res.set('Cache-Control', 'no-store').json({ ok: true, ...payload });
    } catch (error) {
      return sendScoresError(res, error);
    }
  };

  router.get('/games', sendGames);
  // Keep the completed worktree's preseason route as a compatible alias.
  router.get('/preseason', sendGames);
  router.get('/game/:gameId/plays', async (req, res) => {
    try {
      const payload = await fetchStatisticsScoresGamePlays({
        gameId: req.params.gameId,
        phase: req.query.phase,
        fetcher,
        env,
        gateway,
      });
      return res.set('Cache-Control', 'no-store').json({ ok: true, ...payload });
    } catch (error) {
      return sendScoresError(res, error);
    }
  });
  router.get('/game/:gameId/detail', async (req, res) => {
    try {
      const payload = await fetchStatisticsScoresGameDetail({
        gameId: req.params.gameId,
        phase: req.query.phase,
        fetcher,
        env,
        gateway,
      });
      return res.set('Cache-Control', 'no-store').json({ ok: true, ...payload });
    } catch (error) {
      return sendScoresError(res, error);
    }
  });

  return router;
}
