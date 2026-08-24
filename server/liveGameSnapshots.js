import { getLatestBdlScorePlay } from '../src/utils/balldontlieNflScoreboard.js';

const DEFAULT_PLAY_REFRESH_MS = 8_000;
const DEFAULT_STALE_MS = 5 * 60_000;

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
} = {}) {
  if (!gateway?.request) throw new Error('A BALLDONTLIE gateway is required.');
  const safeRefreshMs = Math.max(1_000, Number(refreshMs) || DEFAULT_PLAY_REFRESH_MS);
  const safeStaleMs = Math.max(safeRefreshMs, Number(staleMs) || DEFAULT_STALE_MS);

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
    const result = await gateway.request({
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
    const plays = Array.isArray(result.payload?.data) ? result.payload.data : [];
    return {
      gameId: parsedGameId,
      seasonType: parsedSeasonType,
      plays,
      latestPlay: getCanonicalLatestPlay(plays),
      meta: result.payload?.meta ?? null,
      cache: result.cache,
      freshness: result.freshness,
      accounting: result.accounting,
    };
  }

  return Object.freeze({ getPlays, refreshMs: safeRefreshMs });
}

export const LIVE_GAME_PLAY_REFRESH_MS = DEFAULT_PLAY_REFRESH_MS;
