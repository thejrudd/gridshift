import express from 'express';
import process from 'node:process';
import { createBalldontlieGateway } from './balldontlieGateway.js';

const ADP_PATH = '/nfl/v1/fantasy/adp';
const ADP_PER_PAGE = 100;
export const FANTASY_ADP_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
export const FANTASY_ADP_STALE_TTL_MS = 24 * 60 * 60 * 1_000;
const GATEWAYS_BY_FETCHER = new WeakMap();

export const FANTASY_ADP_SOURCE = Object.freeze({
  provider: 'balldontlie',
  providerLabel: 'BALLDONTLIE',
  dataset: 'fantasy-adp',
});

function parseSeason(value) {
  const season = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(season) && season >= 2002 && season <= 2100 ? season : null;
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

export function validateFantasyAdpQuery(query = {}) {
  const rawSeason = String(query.season ?? '').trim();
  const season = /^\d{4}$/.test(rawSeason) ? parseSeason(rawSeason) : null;
  if (!season) {
    const error = new Error('A valid four-digit NFL season query parameter is required.');
    error.statusCode = 400;
    throw error;
  }
  return { season };
}

export function buildFantasyAdpParams(season) {
  return new URLSearchParams({
    season: String(season),
    per_page: String(ADP_PER_PAGE),
  });
}

export async function fetchFantasyAdp({
  season,
  fetcher = fetch,
  env = process.env,
  gateway,
} = {}) {
  const { season: parsedSeason } = validateFantasyAdpQuery({ season });
  const resolvedGateway = resolveGateway({ gateway, fetcher, env });
  const result = await resolvedGateway.request({
    path: ADP_PATH,
    params: buildFantasyAdpParams(parsedSeason),
    capability: 'fantasy',
    paginate: true,
    cacheTtlMs: FANTASY_ADP_CACHE_TTL_MS,
    staleTtlMs: FANTASY_ADP_STALE_TTL_MS,
    refreshAfterMs: FANTASY_ADP_CACHE_TTL_MS,
    freshnessKey: 'fantasy-adp:v1',
    lane: 'background',
  });

  return {
    season: parsedSeason,
    data: Array.isArray(result.payload?.data) ? result.payload.data : [],
    meta: result.payload?.meta ?? null,
    source: { ...FANTASY_ADP_SOURCE },
    cache: toCompatCache(result),
    freshness: result.freshness,
    accounting: result.accounting,
  };
}

function sendFantasyAdpError(res, error) {
  const response = res.status(error?.statusCode ?? 502).set('Cache-Control', 'no-store');
  if (error?.retryAfterMs != null) {
    response.set('Retry-After', String(Math.max(1, Math.ceil(error.retryAfterMs / 1_000))));
  }
  return response.json({
    ok: false,
    source: { ...FANTASY_ADP_SOURCE },
    error: error?.message ?? 'Could not load BALLDONTLIE fantasy ADP.',
  });
}

export function createFantasyAdpRouter({
  fetcher = fetch,
  env = process.env,
  gateway: injectedGateway,
} = {}) {
  const router = express.Router();
  const gateway = injectedGateway ?? resolveGateway({ fetcher, env });

  router.get('/adp', async (req, res) => {
    try {
      const { season } = validateFantasyAdpQuery(req.query);
      const payload = await fetchFantasyAdp({ season, fetcher, env, gateway });
      return res.set('Cache-Control', 'no-store').json({ ok: true, ...payload });
    } catch (error) {
      return sendFantasyAdpError(res, error);
    }
  });

  return router;
}
