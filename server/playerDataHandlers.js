import express from 'express';
import { Buffer } from 'node:buffer';
import { gunzip, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import {
  fetchPlayerCareerStatsRaw,
  fetchPlayerGameLogRaw,
  fetchPlayerSeasonStatsRaw,
  getCurrentSeason,
} from '../src/utils/espnPlayerFetch.js';
import { UpstreamUnavailableError } from './playerDataUpstream.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const NEGATIVE_CACHE_PRUNE_SIZE = 2_000;
const SHARED_RESPONSE_MAX_ENTRIES = 300;
const LIVE_SCHEDULE_TTL_MS = 5 * 60 * 1000;
const FINAL_CACHE_CONTROL = 'public, max-age=604800, immutable';
const LIVE_CACHE_CONTROL = 'public, max-age=300';

function readJson(result) {
  return gunzipAsync(result.body).then((buffer) => JSON.parse(buffer.toString('utf8')));
}

/**
 * Serves ESPN player payloads from SQLite, fetching from ESPN only when a row
 * is missing or stale. Rows for completed seasons are final and never refetched;
 * live rows expire on a TTL. If ESPN fails, an expired row is served (marked
 * stale) rather than an error. Nothing is fetched ahead of a request.
 */
export function createPlayerDataService({ store, upstream, config, now = () => Date.now() }) {
  const inflight = new Map();
  const negative = new Map();

  const currentSeason = () => getCurrentSeason(new Date(now()));

  // Team abbreviations and team schedules are the same for every player on a
  // team, and a Fantasy roster is full of teammates, so they are fetched once
  // and shared. Only successful responses are kept. A team lookup never
  // changes; a completed season's schedule never changes; the current season's
  // schedule is kept briefly because scores and completion flags move.
  const shared = new Map();
  const sharedPending = new Map();

  function sharedTtlMs(url) {
    if (/\/teams\/\d+\?/.test(url)) return Infinity;
    const schedule = url.match(/\/schedule\?season=(\d+)&/);
    if (!schedule) return null;
    return Number(schedule[1]) < currentSeason() ? Infinity : LIVE_SCHEDULE_TTL_MS;
  }

  function sharedResponse(text) {
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
  }

  // Requests for one player's page are foreground; the career repair's
  // per-season lookups are background so they never hold up the page.
  function createFetcher({ background = false } = {}) {
    return async function fetchImpl(url) {
      const ttl = sharedTtlMs(url);
      if (ttl == null) return upstream.request(url, { background });

      const hit = shared.get(url);
      if (hit && hit.until > now()) return sharedResponse(hit.text);

      const pending = sharedPending.get(url);
      if (pending) return pending;

      const work = (async () => {
        const res = await upstream.request(url, { background });
        if (!res.ok) return res;
        const text = JSON.stringify(await res.json());
        if (shared.size >= SHARED_RESPONSE_MAX_ENTRIES) shared.delete(shared.keys().next().value);
        shared.set(url, { text, until: ttl === Infinity ? Infinity : now() + ttl });
        return sharedResponse(text);
      })().finally(() => sharedPending.delete(url));
      sharedPending.set(url, work);
      return work;
    };
  }

  const fetchImpl = createFetcher();
  const backgroundFetchImpl = createFetcher({ background: true });

  function served(row, { stale = false } = {}) {
    return { kind: 'ok', body: row.body, final: row.final && !stale, stale, incomplete: false };
  }

  function remember(key, result, ttlMs) {
    if (negative.size >= NEGATIVE_CACHE_PRUNE_SIZE) {
      const t = now();
      for (const [entryKey, entry] of negative) if (entry.until <= t) negative.delete(entryKey);
    }
    negative.set(key, { result, until: now() + ttlMs });
  }

  async function resolve({ key, season = null, ttlMs, produce, isEmpty = () => false }) {
    const t = now();
    const isPastSeason = season != null && season < currentSeason();
    const row = store.get(key);
    if (row?.missing) {
      // ESPN reported no data for a completed season; trust that for a while.
      if (t - row.fetchedAt < config.missingTtlMs) return { kind: 'notFound' };
    } else if (row && (row.final || (!isPastSeason && t - row.fetchedAt < ttlMs))) {
      return served(row);
    }

    const remembered = negative.get(key);
    if (remembered && remembered.until > t) {
      return row && !row.missing ? served(row, { stale: true }) : remembered.result;
    }

    const pending = inflight.get(key);
    if (pending) return pending;

    const work = run().finally(() => inflight.delete(key));
    inflight.set(key, work);
    return work;

    async function run() {
      let produced;
      try {
        produced = await produce(row);
      } catch (error) {
        const unavailable = {
          kind: 'unavailable',
          retryAt: error instanceof UpstreamUnavailableError ? error.retryAt : null,
        };
        if (!(error instanceof UpstreamUnavailableError)) remember(key, unavailable, config.failureTtlMs);
        return row && !row.missing ? served(row, { stale: true }) : unavailable;
      }

      if (produced.notFound) {
        const notFound = { kind: 'notFound' };
        if (isPastSeason) {
          store.put(key, Buffer.alloc(0), { missing: true });
        } else {
          remember(key, notFound, config.emptyTtlMs);
        }
        return row && !row.missing ? served(row, { stale: true }) : notFound;
      }

      const body = await gzipAsync(Buffer.from(JSON.stringify(produced.data)));

      // Partial data is returned for this request only, and never replaces a
      // stored copy: it could be missing games or built on the wrong team.
      if (produced.incomplete) {
        return row
          ? served(row, { stale: true })
          : { kind: 'ok', body, final: false, stale: false, incomplete: true };
      }

      if (isEmpty(produced.data)) {
        const empty = { kind: 'ok', body, final: false, stale: false, incomplete: false };
        remember(key, empty, config.emptyTtlMs);
        return row && !row.missing ? served(row, { stale: true }) : empty;
      }

      // Only a completed season is final; the current season keeps refreshing.
      store.put(key, body, { final: isPastSeason });
      return { kind: 'ok', body, final: isPastSeason, stale: false, incomplete: false };
    }
  }

  async function getStats(playerId, season, { background = false } = {}) {
    return resolve({
      key: `stats_v2_${playerId}_${season}`,
      season,
      ttlMs: config.liveTtlMs,
      produce: async () => {
        const res = await fetchPlayerSeasonStatsRaw(background ? backgroundFetchImpl : fetchImpl, playerId, season);
        if (res.ok) return { data: res.data };
        if (res.status === 404) return { notFound: true };
        throw new Error(`ESPN season stats responded ${res.status}`);
      },
    });
  }

  async function getCareer(playerId) {
    return resolve({
      key: `stats_v2_${playerId}_career`,
      ttlMs: config.careerTtlMs,
      produce: async () => {
        const res = await fetchPlayerCareerStatsRaw(fetchImpl, playerId, {
          currentSeason: currentSeason(),
          // The tackles-for-loss repair reads one stats payload per season, so
          // it goes through the same store instead of hitting ESPN again.
          getSeasonStats: async (id, season) => {
            const result = await getStats(id, season, { background: true });
            if (result.kind !== 'ok') throw new Error('season stats unavailable');
            return readJson(result);
          },
        });
        if (res.ok) return { data: res.data };
        if (res.status === 404) return { notFound: true };
        throw new Error(`ESPN career stats responded ${res.status}`);
      },
    });
  }

  async function getGameLog(playerId, season, teamId) {
    return resolve({
      key: `gamelog_v11_${playerId}_${season}`,
      season,
      ttlMs: config.liveTtlMs,
      isEmpty: (games) => !Array.isArray(games) || games.length === 0,
      produce: async (row) => {
        // A stored copy lets a refresh skip games that are already final.
        let existingGames = null;
        if (row) {
          try { existingGames = await readJson(row); } catch { existingGames = null; }
        }
        const { games, incomplete } = await fetchPlayerGameLogRaw(fetchImpl, {
          playerId,
          teamId,
          season,
          existingGames: Array.isArray(existingGames) ? existingGames : null,
        });
        // Nothing usable and ESPN misbehaved: report unavailable so the browser
        // can fall back, instead of presenting an empty log as real.
        if (incomplete && games.length === 0) throw new Error('ESPN game log unavailable');
        return { data: games, incomplete };
      },
    });
  }

  return {
    getStats,
    getCareer,
    getGameLog,
    getStatus() {
      return {
        enabled: true,
        ...store.getStats(),
        inflight: inflight.size,
        upstream: upstream.getStatus(),
      };
    },
  };
}

const PLAYER_ID_PATTERN = /^\d{1,10}$/;
const SEASON_PATTERN = /^\d{4}$/;
const TEAM_PATTERN = /^[A-Za-z]{2,4}$/;

function sendError(res, status, error, extraHeaders = {}) {
  res.set({ 'Cache-Control': 'no-store', ...extraHeaders });
  res.status(status).json({ error });
}

async function sendResult(req, res, result) {
  if (result.kind === 'notFound') return sendError(res, 404, 'not_found');
  if (result.kind === 'unavailable') {
    const retryAfter = result.retryAt
      ? { 'Retry-After': String(Math.max(1, Math.ceil((result.retryAt - Date.now()) / 1000))) }
      : {};
    return sendError(res, 503, 'unavailable', retryAfter);
  }

  const cacheable = result.final && !result.stale && !result.incomplete;
  res.set({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': result.stale || result.incomplete ? 'no-store' : (cacheable ? FINAL_CACHE_CONTROL : LIVE_CACHE_CONTROL),
    Vary: 'Accept-Encoding',
  });
  if (result.stale) res.set('X-GridShift-Stale', '1');
  if (result.incomplete) res.set('X-GridShift-Incomplete', '1');

  if (req.acceptsEncodings('gzip')) {
    res.set('Content-Encoding', 'gzip');
    return res.send(result.body);
  }
  return res.send(await gunzipAsync(result.body));
}

export function createPlayerDataRouter({ service, config }) {
  const router = express.Router();

  // Seasons outside what the cache serves get a 400 so the browser falls back
  // to fetching ESPN directly, exactly as it did before this cache existed.
  function parseSeason(value, res) {
    if (!SEASON_PATTERN.test(String(value))) {
      sendError(res, 400, 'invalid_season');
      return null;
    }
    const season = Number(value);
    if (season < config.minSeason || season > getCurrentSeason()) {
      sendError(res, 400, 'unsupported_season');
      return null;
    }
    return season;
  }

  function parsePlayerId(value, res) {
    if (!PLAYER_ID_PATTERN.test(String(value))) {
      sendError(res, 400, 'invalid_player');
      return null;
    }
    return String(value);
  }

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      console.error('[player-data] request failed:', error?.message ?? error);
      if (!res.headersSent) sendError(res, 500, 'internal_error');
    }
  };

  router.get('/:playerId/stats/:season', handle(async (req, res) => {
    const playerId = parsePlayerId(req.params.playerId, res);
    if (playerId == null) return;
    const season = parseSeason(req.params.season, res);
    if (season == null) return;
    await sendResult(req, res, await service.getStats(playerId, season));
  }));

  router.get('/:playerId/career', handle(async (req, res) => {
    const playerId = parsePlayerId(req.params.playerId, res);
    if (playerId == null) return;
    await sendResult(req, res, await service.getCareer(playerId));
  }));

  router.get('/:playerId/gamelog/:season', handle(async (req, res) => {
    const playerId = parsePlayerId(req.params.playerId, res);
    if (playerId == null) return;
    const season = parseSeason(req.params.season, res);
    if (season == null) return;
    const team = req.query.team;
    if (team !== undefined && !(typeof team === 'string' && TEAM_PATTERN.test(team))) {
      return sendError(res, 400, 'invalid_team');
    }
    await sendResult(req, res, await service.getGameLog(playerId, season, team ?? null));
  }));

  return router;
}
