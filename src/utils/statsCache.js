// Persistent per-season stats cache backed by IndexedDB.
//
// Sleeper weekly-stat packages are multiple MB per season (all NFL players ×
// 18 weeks), so they can't live in localStorage alongside the nfl_pc_ player
// cache — IndexedDB stores structured clones without a main-thread
// JSON.stringify and has a far larger quota. Semantics mirror playerCache.js:
// permanent entries for completed seasons, TTL for the current season, and a
// version bust at startup.

const DB_NAME = 'gridshift-stats';
const DB_VERSION = 1;
const STORE = 'seasonStats';
const VERSION_KEY = 'gs_stats_cache_version';

// Bump when the cached package shape changes independently of the app version.
export const STATS_CACHE_SCHEMA_VERSION = 1;

// Current-season packages go stale as games are played; matches playerCache TTL.stats.
export const CURRENT_SEASON_TTL = 1 * 60 * 60 * 1000; // 1 hour

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('indexedDB open blocked'));
  }).catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Read a cached season package. Returns the stored entry
 * `{ ts, schemaVersion, season, enhanced, weeklyStats, seasonStats, scheduleMap }`
 * or null on miss/any storage failure. TTL/staleness is the caller's decision
 * (the caller knows whether the season is completed).
 */
export async function getSeasonStats(key) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const entry = await requestToPromise(tx.objectStore(STORE).get(key));
    if (!entry || entry.schemaVersion !== STATS_CACHE_SCHEMA_VERSION) return null;
    return entry;
  } catch {
    return null;
  }
}

/**
 * Persist a season package. Silently no-ops on storage failure
 * (Safari private mode, quota, blocked upgrades).
 */
export async function setSeasonStats(key, pkg) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ ts: Date.now(), schemaVersion: STATS_CACHE_SCHEMA_VERSION, ...pkg }, key);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch { /* ignore — cache is best-effort */ }
}

export async function clearStatsCache() {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch { /* ignore */ }
}

/**
 * Called once at app startup, next to checkAndBustCacheIfNeeded(). Wipes the
 * stats store when the app version changes so a build with different scoring
 * or enhancement logic never serves stale packages.
 */
export function checkAndBustStatsCacheIfNeeded() {
  try {
    const stored = localStorage.getItem(VERSION_KEY);
    const current = __APP_VERSION__;
    if (stored !== current) {
      void clearStatsCache();
      localStorage.setItem(VERSION_KEY, current);
    }
  } catch { /* ignore — Safari private mode, quota errors, etc. */ }
}

/**
 * A weekly-stats package ({ [player_id]: Array<{week, ...}> }) is cacheable
 * when no week fetch failed and at least one player has data. Guards against
 * permanently caching a package produced during a network failure.
 */
export function isCacheableWeeklyStats(weeklyStats, failedWeekCount = 0) {
  return failedWeekCount === 0
    && weeklyStats != null
    && typeof weeklyStats === 'object'
    && Object.keys(weeklyStats).length > 0;
}
