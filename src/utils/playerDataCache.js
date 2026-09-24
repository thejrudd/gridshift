// Durable per-device cache for ESPN player payloads (season stats, career
// stats, game logs), backed by IndexedDB.
//
// One player-season game log is ~1 MB of ESPN JSON, so these payloads cannot
// live in the ~5 MB localStorage cache next to rosters and bios. IndexedDB
// stores structured clones without a main-thread JSON.stringify and has a far
// larger quota. Semantics:
//   - "final" entries (completed seasons) never expire and survive the
//     app-version bust; only live entries are wiped on a release.
//   - When a refetch fails (offline, ESPN or the GridShift API down), the last
//     stored copy is served instead of an error, even if it has expired.
//   - Incomplete or stale-fallback responses are returned but never stored.

const DB_NAME = 'gridshift-player-data';
const DB_VERSION = 1;
const STORE = 'payloads';

// Bump when a stored payload's shape changes independently of the app version.
export const PLAYER_DATA_SCHEMA_VERSION = 1;

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

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function readEntry(key) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const entry = await requestToPromise(tx.objectStore(STORE).get(key));
    if (!entry || entry.schema !== PLAYER_DATA_SCHEMA_VERSION) return null;
    return entry;
  } catch {
    return null;
  }
}

async function writeEntry(key, entry) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ ...entry, schema: PLAYER_DATA_SCHEMA_VERSION }, key);
    await transactionDone(tx);
  } catch { /* ignore — the cache is best-effort (private mode, quota, blocked upgrade) */ }
}

const inflight = new Map();

/**
 * Return a cached payload, or fetch and store it.
 *
 * @param {string} key
 * @param {(stale: any) => Promise<{ data: any, incomplete?: boolean }>} fetchFn
 *   Receives the previously stored (possibly expired) data so a refresh can be
 *   incremental. `incomplete: true` marks data that must not be stored.
 * @param {object} options
 * @param {number} options.ttl               Freshness window for live entries.
 * @param {boolean} [options.final]          Store as a permanent, bust-exempt entry.
 * @param {(data: any) => boolean} [options.shouldCache]
 */
export function cachedPlayerData(key, fetchFn, { ttl, final = false, shouldCache } = {}) {
  const pending = inflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const entry = await readEntry(key);
    if (entry && (entry.final || Date.now() - entry.ts < ttl)) return entry.data;

    try {
      const { data, incomplete = false } = await fetchFn(entry?.data ?? null);
      if (!incomplete && (!shouldCache || shouldCache(data))) {
        await writeEntry(key, { ts: Date.now(), final, data });
      }
      return data;
    } catch (err) {
      if (entry) return entry.data;
      throw err;
    }
  })().finally(() => inflight.delete(key));

  inflight.set(key, request);
  return request;
}

async function deleteEntries(shouldDelete) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const cursorRequest = store.openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      if (shouldDelete(cursor.value)) cursor.delete();
      cursor.continue();
    };
    await transactionDone(tx);
  } catch { /* ignore */ }
}

/** Wipe live (current-season, career) entries; completed-season entries stay. */
export function clearLivePlayerData() {
  return deleteEntries((entry) => !entry?.final);
}

/** Wipe everything, including completed-season entries (sign-out / reset). */
export function clearAllPlayerData() {
  return deleteEntries(() => true);
}
