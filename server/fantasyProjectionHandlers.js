import express from 'express';
import process from 'node:process';
import { createBalldontlieGateway } from './balldontlieGateway.js';

const PROJECTIONS_PATH = '/nfl/v1/fantasy/projections';
const PROJECTIONS_PER_PAGE = 100;
export const FANTASY_PROJECTIONS_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
export const FANTASY_PROJECTIONS_STALE_TTL_MS = 24 * 60 * 60 * 1_000;
const GATEWAYS_BY_FETCHER = new WeakMap();

export const FANTASY_PROJECTIONS_SOURCE = Object.freeze({
  provider: 'balldontlie',
  providerLabel: 'BALLDONTLIE',
  dataset: 'fantasy-projections',
});

function parseSeason(value) {
  const season = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(season) && season >= 2002 && season <= 2100 ? season : null;
}

function parseWeek(value) {
  const week = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(week) && week >= 1 && week <= 18 ? week : null;
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

export function validateFantasyProjectionsQuery(query = {}) {
  const rawSeason = String(query.season ?? '').trim();
  const season = /^\d{4}$/.test(rawSeason) ? parseSeason(rawSeason) : null;
  const rawWeek = String(query.week ?? '').trim();
  const week = /^\d{1,2}$/.test(rawWeek) ? parseWeek(rawWeek) : null;
  if (!season || !week) {
    const error = new Error('A valid four-digit NFL season and week 1–18 are required.');
    error.statusCode = 400;
    throw error;
  }
  return { season, week };
}

export function buildFantasyProjectionsParams(season, week) {
  return new URLSearchParams({
    season: String(season),
    week: String(week),
    per_page: String(PROJECTIONS_PER_PAGE),
  });
}

function pickTeam(team) {
  if (!team || typeof team !== 'object') return null;
  return {
    id: Number.isFinite(Number(team.id)) ? Number(team.id) : null,
    abbreviation: team.abbreviation ?? null,
    name: team.name ?? null,
    full_name: team.full_name ?? null,
  };
}

function pickPlayer(player) {
  if (!player || typeof player !== 'object') return null;
  return {
    id: Number.isFinite(Number(player.id)) ? Number(player.id) : null,
    first_name: player.first_name ?? null,
    last_name: player.last_name ?? null,
    position: player.position ?? null,
    position_abbreviation: player.position_abbreviation ?? null,
  };
}

function pickGame(game) {
  if (!game || typeof game !== 'object') return null;
  return {
    id: Number.isFinite(Number(game.id)) ? Number(game.id) : null,
    date: game.date ?? null,
    status: game.status ?? null,
    status_state: game.status_state ?? null,
    visitor_team: pickTeam(game.visitor_team),
    home_team: pickTeam(game.home_team),
  };
}

function normalizeStats(stats) {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return {};
  return Object.fromEntries(
    Object.entries(stats)
      .map(([key, value]) => [key, Number(value)])
      .filter(([, value]) => Number.isFinite(value)),
  );
}

function normalizeProviderProjection(row) {
  return {
    id: Number.isFinite(Number(row?.id)) ? Number(row.id) : null,
    season: row?.season ?? null,
    week: row?.week ?? null,
    date: row?.date ?? null,
    collected_at: row?.collected_at ?? null,
    player: pickPlayer(row?.player),
    team: pickTeam(row?.team),
    game: pickGame(row?.game),
    position: row?.position ?? null,
    projected_games: Number.isFinite(Number(row?.projected_games)) ? Number(row.projected_games) : null,
    stats: normalizeStats(row?.stats),
    projections: Array.isArray(row?.projections)
      ? row.projections.map((projection) => ({
          total_points: Number(projection?.total_points),
          points_per_game: Number(projection?.points_per_game),
          scoring_format: {
            key: projection?.scoring_format?.key ?? null,
            name: projection?.scoring_format?.name ?? null,
          },
        })).filter((projection) => Number.isFinite(projection.total_points))
      : [],
  };
}

export async function fetchFantasyProjections({
  season,
  week,
  fetcher = fetch,
  env = process.env,
  gateway,
} = {}) {
  const parsed = validateFantasyProjectionsQuery({ season, week });
  const resolvedGateway = resolveGateway({ gateway, fetcher, env });
  const result = await resolvedGateway.request({
    path: PROJECTIONS_PATH,
    params: buildFantasyProjectionsParams(parsed.season, parsed.week),
    capability: 'fantasy',
    paginate: true,
    cacheTtlMs: FANTASY_PROJECTIONS_CACHE_TTL_MS,
    staleTtlMs: FANTASY_PROJECTIONS_STALE_TTL_MS,
    refreshAfterMs: FANTASY_PROJECTIONS_CACHE_TTL_MS,
    freshnessKey: 'fantasy-projections:v1',
    lane: 'background',
  });

  return {
    season: parsed.season,
    week: parsed.week,
    data: Array.isArray(result.payload?.data)
      ? result.payload.data.map(normalizeProviderProjection)
      : [],
    meta: result.payload?.meta ?? null,
    source: { ...FANTASY_PROJECTIONS_SOURCE },
    cache: toCompatCache(result),
    freshness: result.freshness,
    accounting: result.accounting,
  };
}

function sendFantasyProjectionsError(res, error) {
  const response = res.status(error?.statusCode ?? 502).set('Cache-Control', 'no-store');
  if (error?.retryAfterMs != null) {
    response.set('Retry-After', String(Math.max(1, Math.ceil(error.retryAfterMs / 1_000))));
  }
  return response.json({
    ok: false,
    source: { ...FANTASY_PROJECTIONS_SOURCE },
    error: error?.message ?? 'Could not load BALLDONTLIE fantasy projections.',
  });
}

export function createFantasyProjectionsRouter({
  fetcher = fetch,
  env = process.env,
  gateway: injectedGateway,
} = {}) {
  const router = express.Router();
  const gateway = injectedGateway ?? resolveGateway({ fetcher, env });

  router.get('/projections', async (req, res) => {
    try {
      const { season, week } = validateFantasyProjectionsQuery(req.query);
      const payload = await fetchFantasyProjections({ season, week, fetcher, env, gateway });
      return res.set('Cache-Control', 'no-store').json({ ok: true, ...payload });
    } catch (error) {
      return sendFantasyProjectionsError(res, error);
    }
  });

  return router;
}
