import { getLatestBdlScorePlay } from '../src/utils/balldontlieNflScoreboard.js';
import { isFinalGame } from '../src/utils/liveScoringFeed.js';

const DEFAULT_PLAY_REFRESH_MS = 8_000;
const DEFAULT_STALE_MS = 5 * 60_000;
// Finished games: how often the server rechecks a game's status before it is
// known final (cheap, cached), and how long after a game ends the NFL may
// still correct plays. A finished game archived inside that window is served
// from the archive and refetched once after it; after that it is permanent.
const GAME_STATUS_TTL_MS = 60_000;
const GAME_STATUS_STALE_MS = 4 * 60 * 60_000;
export const PLAY_CORRECTION_WINDOW_MS = 48 * 60 * 60_000;
// Kickoff to final whistle, for estimating when a finished game ended.
const GAME_LENGTH_ESTIMATE_MS = 4 * 60 * 60_000;

function parseGameId(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeSeasonType(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return [1, 2, 3].includes(parsed) ? parsed : null;
}

export function getCanonicalLatestPlay(plays = []) {
  return getLatestBdlScorePlay(plays);
}

/**
 * One sidecar-wide source for a game's provider play snapshot. Every product
 * surface uses the same parameters, freshness class, cache entry, and in-flight
 * request. Authorization remains in the product router; this service owns only
 * the provider snapshot.
 */
export function createLiveGameSnapshotStore({
  gateway,
  refreshMs = DEFAULT_PLAY_REFRESH_MS,
  staleMs = DEFAULT_STALE_MS,
  // Optional finished-game archive (livePlaysArchive.js). Without it every
  // request follows the short-lived provider cache, as before.
  archive = null,
  now = () => Date.now(),
} = {}) {
  if (!gateway?.request) throw new Error('A BALLDONTLIE gateway is required.');
  const safeRefreshMs = Math.max(1_000, Number(refreshMs) || DEFAULT_PLAY_REFRESH_MS);
  const safeStaleMs = Math.max(safeRefreshMs, Number(staleMs) || DEFAULT_STALE_MS);

  function snapshotFrom({ parsedGameId, parsedSeasonType, payload, cache, freshness, accounting = null }) {
    const plays = Array.isArray(payload?.data) ? payload.data : [];
    return {
      gameId: parsedGameId,
      seasonType: parsedSeasonType,
      plays,
      latestPlay: getCanonicalLatestPlay(plays),
      meta: payload?.meta ?? null,
      cache,
      freshness,
      accounting,
    };
  }

  // The server decides whether a game is over from the provider's game record,
  // never from the caller, so a request cannot freeze a live game's plays.
  async function getFinishedGame(parsedGameId) {
    try {
      const result = await gateway.request({
        path: `/nfl/v1/games/${parsedGameId}`,
        capability: 'games',
        cacheTtlMs: GAME_STATUS_TTL_MS,
        staleTtlMs: GAME_STATUS_STALE_MS,
        refreshAfterMs: GAME_STATUS_TTL_MS,
        lane: 'details',
      });
      const game = result.payload?.data ?? null;
      if (!game || Array.isArray(game) || !isFinalGame(game)) return null;
      const kickoff = Date.parse(game.date ?? '');
      return { endedAt: Number.isFinite(kickoff) ? kickoff + GAME_LENGTH_ESTIMATE_MS : now() };
    } catch {
      return null;
    }
  }

  function archivedSnapshot(row, { parsedGameId, parsedSeasonType }) {
    const t = now();
    return snapshotFrom({
      parsedGameId,
      parsedSeasonType,
      payload: row.payload,
      cache: { hit: true, coalesced: false, stale: false, archived: true },
      freshness: {
        providerFetchedAt: new Date(row.fetchedAt).toISOString(),
        receivedAt: new Date(t).toISOString(),
        ageMs: Math.max(0, t - row.fetchedAt),
        stale: false,
        refreshAfterMs: 0,
        nextRefreshAt: null,
      },
      // Served from disk: no provider page was read. Callers sum this across
      // a game's requests, so it must never be missing.
      accounting: { pageCount: 0, upstreamRequests: 0 },
    });
  }

  async function fetchPlays({ params }) {
    return gateway.request({
      path: '/nfl/v1/plays',
      params,
      capability: 'plays',
      paginate: true,
      cacheTtlMs: safeRefreshMs,
      staleTtlMs: safeStaleMs,
      refreshAfterMs: safeRefreshMs,
      freshnessKey: `live-game-plays:${safeRefreshMs}`,
      lane: 'details',
    });
  }

  async function getPlays({ gameId, seasonType } = {}) {
    const parsedGameId = parseGameId(gameId);
    if (!parsedGameId) {
      const error = new Error('A valid BALLDONTLIE game ID is required.');
      error.statusCode = 400;
      throw error;
    }
    const parsedSeasonType = normalizeSeasonType(seasonType);
    const params = new URLSearchParams({ game_id: String(parsedGameId) });
    if (parsedSeasonType) params.set('season_type', String(parsedSeasonType));
    const ids = { parsedGameId, parsedSeasonType };

    if (archive) {
      const key = `${parsedGameId}:${parsedSeasonType ?? ''}`;
      let row = null;
      try { row = archive.get(key); } catch { row = null; }
      // Verified rows are permanent: no provider call at all.
      if (row?.verified) return archivedSnapshot(row, ids);
      const finished = await getFinishedGame(parsedGameId);
      if (finished) {
        const correctionsSettled = now() - finished.endedAt >= PLAY_CORRECTION_WINDOW_MS;
        // Archived inside the correction window: serve it until the window
        // closes, then refetch once and mark it permanent.
        if (row && !correctionsSettled) return archivedSnapshot(row, ids);
        const result = await fetchPlays({ ...ids, params });
        const plays = Array.isArray(result.payload?.data) ? result.payload.data : [];
        // An empty answer for a finished game is not archived; it is retried.
        if (plays.length) {
          try {
            archive.put(key, result.payload, { gameEndedAt: finished.endedAt, verified: correctionsSettled });
          } catch {
            // The archive is an optimization; a failed write still serves the plays.
          }
        }
        return snapshotFrom({ ...ids, payload: result.payload, cache: result.cache, freshness: result.freshness, accounting: result.accounting });
      }
      // Status unknown (lookup failed) but a copy exists: better than nothing
      // only if the provider is also unreachable, so try the provider first.
      if (row) {
        try {
          const result = await fetchPlays({ ...ids, params });
          return snapshotFrom({ ...ids, payload: result.payload, cache: result.cache, freshness: result.freshness, accounting: result.accounting });
        } catch {
          return archivedSnapshot(row, ids);
        }
      }
    }

    const result = await fetchPlays({ ...ids, params });
    return snapshotFrom({ ...ids, payload: result.payload, cache: result.cache, freshness: result.freshness, accounting: result.accounting });
  }

  return Object.freeze({ getPlays, refreshMs: safeRefreshMs });
}

export const LIVE_GAME_PLAY_REFRESH_MS = DEFAULT_PLAY_REFRESH_MS;
