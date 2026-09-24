import { clearAllPlayerData, clearLivePlayerData } from './playerDataCache.js';

const PREFIX = 'nfl_pc_';

export const TTL = {
  roster:     24 * 60 * 60 * 1000,  // 24 hours
  stats:       1 * 60 * 60 * 1000,  // 1 hour (current season)
  bio:        24 * 60 * 60 * 1000,  // 24 hours
  career:     24 * 60 * 60 * 1000,  // 24 hours (totals move during the season)
  historical: Infinity,              // Never expires — past seasons are final
};

/**
 * Fetch with localStorage caching.
 * @param {string} key         Cache key (without prefix)
 * @param {Function} fetchFn   Async function that returns the data to cache
 * @param {number} ttl         TTL in ms; use Infinity to never expire
 * @param {Function} [shouldCache]  Optional predicate — if provided and returns false,
 *                             the result is returned but NOT stored in the cache.
 *                             Useful for conditionally skipping permanent caching of
 *                             empty or incomplete data (e.g. schedule weeks not yet played).
 */
export async function cachedFetch(key, fetchFn, ttl, shouldCache) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw) {
      const { ts, data } = JSON.parse(raw);
      if (ttl === Infinity || Date.now() - ts < ttl) return data;
    }
  } catch {
    // Corrupted entry — fall through and re-fetch
  }

  const data = await fetchFn();

  if (!shouldCache || shouldCache(data)) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify({ ts: Date.now(), data }));
    } catch {
      // localStorage quota exceeded — skip caching silently
    }
  }

  return data;
}

function clearLocalPlayerCache() {
  Object.keys(localStorage)
    .filter(k => k.startsWith(PREFIX))
    .forEach(k => localStorage.removeItem(k));
}

export function clearPlayerCache() {
  clearLocalPlayerCache();
  // Season stats, career stats, and game logs live in IndexedDB.
  void clearAllPlayerData();
}

// Stored outside the nfl_pc_ prefix so it survives clearPlayerCache().
const VERSION_KEY = 'nfl_pc_version';

/**
 * Called once at app startup. If the stored cache version doesn't match the
 * current build version, wipe the localStorage player cache and the live
 * (non-final) IndexedDB payloads so stale data from a prior version is never
 * served. Completed-season payloads are kept. Updates the stored version afterward.
 */
export function checkAndBustCacheIfNeeded() {
  try {
    const stored = localStorage.getItem(VERSION_KEY);
    const current = __APP_VERSION__;
    if (stored !== current) {
      clearLocalPlayerCache();
      // A release must not force every completed season to be refetched, so
      // only live (current-season, career) payloads are wiped from IndexedDB.
      void clearLivePlayerData();
      localStorage.setItem(VERSION_KEY, current);
    }
  } catch { /* ignore — Safari private mode, quota errors, etc. */ }
}
