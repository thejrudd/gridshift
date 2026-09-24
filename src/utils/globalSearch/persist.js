// Persistent search-record cache backed by IndexedDB.
//
// Global search has to work on a cold offline start, so the record set is stored
// rather than rebuilt from the network each session. Records are plain objects,
// so IndexedDB stores them as a structured clone with no main-thread
// JSON.stringify — the same reason statsCache.js exists for season packages.
//
// Only records are persisted. The inverted indexes are rebuilt at load, which is
// far cheaper than storing and re-reading them.

const DB_NAME = 'gridshift-search';
const DB_VERSION = 1;
const STORE = 'records';

// Bump when the record shape or its *content contract* changes independently of
// the app version. Version 2 busts caches built before ESPN ids were backfilled
// at build time: a persisted v1 slice would keep routing most players nowhere,
// because the app version alone would not invalidate it. Version 3 does the same
// for game records, which gained `espnEventId` so a played game can open its
// Scores page.
export const SEARCH_CACHE_SCHEMA_VERSION = 3;

// Slice keys. Each is written and read independently so the live player slice
// can supersede the static one without touching the rest.
export const SLICE_STATIC = 'static';
export const SLICE_PLAYERS = 'players';

// The player slice is rebuilt from live data when it is older than this. Rosters
// change weekly, so a day-old slice is fine for finding a player by name; it is
// refreshed in the background rather than blocking a search.
export const PLAYER_SLICE_TTL = 24 * 60 * 60 * 1000;

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
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function appVersion() {
  // Injected by Vite; absent in tests and in the build script.
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
}

/**
 * Read a persisted slice, or null on a miss, a version mismatch, or any storage
 * failure.
 *
 * Search must never break because storage is unavailable — a private window, a
 * cleared origin, or a blocked database all just mean the caller rebuilds.
 */
export async function readSlice(key) {
  try {
    const db = await openDb();
    const transaction = db.transaction(STORE, 'readonly');
    const entry = await requestToPromise(transaction.objectStore(STORE).get(key));
    if (!entry) return null;
    if (entry.schemaVersion !== SEARCH_CACHE_SCHEMA_VERSION) return null;
    if (entry.appVersion !== appVersion()) return null;
    if (!Array.isArray(entry.records)) return null;
    return entry;
  } catch {
    return null;
  }
}

/**
 * Persist a slice. Failures are swallowed: a slice that cannot be written is a
 * slower next start, not an error the user should see.
 */
export async function writeSlice(key, records) {
  if (!Array.isArray(records) || !records.length) return false;
  try {
    const db = await openDb();
    const transaction = db.transaction(STORE, 'readwrite');
    await requestToPromise(transaction.objectStore(STORE).put({
      ts: Date.now(),
      schemaVersion: SEARCH_CACHE_SCHEMA_VERSION,
      appVersion: appVersion(),
      records,
    }, key));
    return true;
  } catch {
    return false;
  }
}

export function isSliceStale(entry, ttl = PLAYER_SLICE_TTL) {
  if (!entry?.ts) return true;
  return Date.now() - entry.ts > ttl;
}

/**
 * Drop everything. Used when the record shape changes under a cache the version
 * check cannot distinguish.
 */
export async function clearSlices() {
  try {
    const db = await openDb();
    const transaction = db.transaction(STORE, 'readwrite');
    await requestToPromise(transaction.objectStore(STORE).clear());
    return true;
  } catch {
    return false;
  }
}
