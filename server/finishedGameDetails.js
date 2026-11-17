// finishedGameDetails.js — one in-memory copy of each finished game's full
// Statistics Scores detail, shared by the player and team season dashboards.
//
// Every player and team view of a game reads the same detail (game, box
// scores, play-by-play), so it is fetched once per game, not once per viewer
// or subject, and concurrent requests for the same game share one build. Only
// a final game whose plays have landed is kept; anything else is refetched on
// the next request. Behind this the game and box scores read through the
// finished-games archive and the plays through the snapshot store, so a miss
// here (eviction, restart) costs disk reads rather than provider requests
// once the archive holds the game.

import process from 'node:process';
import { isFinalGame } from '../src/utils/liveScoringFeed.js';
import { fetchStatisticsScoresGameDetail, BOX_SCORE_REVALIDATE_MS } from './statisticsScoresHandlers.js';

const DEFAULT_MAX_ENTRIES = 160;

/**
 * A finished game whose detail can be cached and counted as complete: final,
 * its plays landed, and every box score the provider plan offers is present
 * (team stats often trail the final whistle).
 */
export function isSettledFinalDetail(detail) {
  if (!detail?.game || !isFinalGame(detail.game)) return false;
  const coverage = detail.coverage ?? {};
  const capabilities = detail.capabilities ?? {};
  return coverage.plays === true
    && (capabilities.stats === false || coverage.playerStats === true)
    && (capabilities.teamStats === false || coverage.teamStats === true);
}

/**
 * The player and team dashboards' per-subject built games: least recently used
 * eviction, entries expire with the archive's recheck interval so stat
 * corrections reach the dashboards, and concurrent builds of one key share a
 * single promise.
 */
export function createBuiltGameCache({ maxEntries, maxAgeMs = BOX_SCORE_REVALIDATE_MS, now = () => Date.now() } = {}) {
  const entries = new Map();
  const inFlight = new Map();
  return {
    get(key) {
      const entry = entries.get(key);
      if (entry && now() - entry.at < maxAgeMs) return entry.value;
      if (entry) entries.delete(key);
      return undefined;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { value, at: now() });
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    },
    coalesce(key, task) {
      if (inFlight.has(key)) return inFlight.get(key);
      const pending = task().finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
      return pending;
    },
  };
}

export function createFinishedGameDetailStore({
  gateway,
  snapshotStore,
  archive = null,
  env = process.env,
  maxEntries = DEFAULT_MAX_ENTRIES,
  // Kept no longer than the archive's recheck interval, so a stat correction
  // the archive picks up reaches the dashboards too.
  maxAgeMs = BOX_SCORE_REVALIDATE_MS,
  now = () => Date.now(),
  fetchDetail = fetchStatisticsScoresGameDetail,
} = {}) {
  const cache = new Map(); // `${phase}:${gameId}` -> { detail, storedAt }, least recently used first
  const inFlight = new Map();

  function remember(key, entry) {
    cache.delete(key);
    cache.set(key, entry);
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
  }

  return {
    get({ gameId, phase = 'regular' }) {
      const key = `${phase}:${gameId}`;
      const entry = cache.get(key);
      if (entry && now() - entry.storedAt < maxAgeMs) {
        remember(key, entry);
        return Promise.resolve(entry.detail);
      }
      if (entry) cache.delete(key);
      if (inFlight.has(key)) return inFlight.get(key);
      const pending = fetchDetail({ gameId, phase, gateway, env, snapshotStore, archive })
        .then((detail) => {
          if (isSettledFinalDetail(detail)) remember(key, { detail, storedAt: now() });
          return detail;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
      return pending;
    },
    get size() {
      return cache.size;
    },
  };
}
