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
// key -> pending fetch, so concurrent callers for one key share a request.
const inFlight = new Map();

/**
 * `ttl` may also be a function of the cached data returning a TTL, for
 * entries whose lifetime depends on their content (a schedule week whose
 * games are all final never expires).
 */
export async function cachedFetch(key, fetchFn, ttl, shouldCache) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw) {
      const { ts, data } = JSON.parse(raw);
      const entryTtl = typeof ttl === 'function' ? ttl(data) : ttl;
      if (entryTtl === Infinity || Date.now() - ts < entryTtl) return data;
    }
  } catch {
    // Corrupted entry — fall through and re-fetch
  }

  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const data = await fetchFn();
    if (!shouldCache || shouldCache(data)) {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify({ ts: Date.now(), data }));
      } catch {
        // localStorage quota exceeded — skip caching silently
      }
    }
    return data;
  })().finally(() => { inFlight.delete(key); });
  inFlight.set(key, request);
  return request;
}

/**
 * Read a cachedFetch entry without fetching, whatever its age, or null. For
 * readers that must never trigger a request — global search answers from
 * whatever an earlier page load already stored.
 */
export function peekCached(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw)?.data ?? null : null;
  } catch {
    return null;
  }
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
