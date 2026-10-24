// finishedGameArchive.js — read-through escrow for provider data about games
// that are over.
//
// Once every game a response covers is final, the response is written to the
// on-disk archive (livePlaysArchive.js) and served from there: inside the NFL's
// correction window as it was stored, then refetched once after the window
// closes and kept permanently, with no provider call ever again. The same rule
// liveGameSnapshots.js applies to play-by-play, for responses that carry their
// games' status themselves (a week's game list, a game's player stats).

import { PLAY_CORRECTION_WINDOW_MS } from './liveGameSnapshots.js';
import { isFinalGame } from '../src/utils/liveScoringFeed.js';

// Kickoff to final whistle, for estimating when a finished game ended.
const GAME_LENGTH_ESTIMATE_MS = 4 * 60 * 60_000;

/**
 * When the last game a provider payload covers ended, or null unless the
 * payload is non-empty and every game in it is final. Rows are either games
 * (`status`) or per-game records that embed their game (`row.game`).
 */
export function getFinishedPayloadEndedAt(payload) {
  const data = payload?.data;
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  if (!rows.length) return null;
  const games = rows.map((row) => (row?.status != null ? row : row?.game));
  if (!games.every((game) => game && isFinalGame(game))) return null;
  const kickoffs = games.map((game) => Date.parse(game.date ?? '')).filter(Number.isFinite);
  return kickoffs.length ? Math.max(...kickoffs) + GAME_LENGTH_ESTIMATE_MS : null;
}

function archivedResult(row, now) {
  const t = now();
  return {
    payload: row.payload,
    cacheInfo: {
      hit: true,
      coalesced: false,
      stale: false,
      archived: true,
      providerRequests: 0,
      ageMs: Math.max(0, t - row.fetchedAt),
      ttlMs: 0,
      fetchedAt: new Date(row.fetchedAt).toISOString(),
    },
  };
}

/**
 * `fetchFresh()` resolves `{ payload, cacheInfo }` from the provider gateway.
 * Without an archive this is just `fetchFresh()`.
 */
export async function readThroughFinishedArchive({ archive, key, fetchFresh, now = () => Date.now() }) {
  if (!archive) return fetchFresh();
  let row = null;
  try { row = archive.get(key); } catch { row = null; }
  // Only finished data is ever archived, so a stored row needs no status check.
  if (row?.verified) return archivedResult(row, now);
  if (row && now() - row.gameEndedAt < PLAY_CORRECTION_WINDOW_MS) return archivedResult(row, now);

  let fresh;
  try {
    fresh = await fetchFresh();
  } catch (error) {
    if (row) return archivedResult(row, now);
    throw error;
  }
  const endedAt = getFinishedPayloadEndedAt(fresh.payload);
  if (endedAt != null) {
    try {
      archive.put(key, fresh.payload, {
        gameEndedAt: endedAt,
        verified: now() - endedAt >= PLAY_CORRECTION_WINDOW_MS,
      });
    } catch {
      // The archive is an optimization; a failed write still serves the data.
    }
  }
  return fresh;
}
