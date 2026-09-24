import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

// A minimal in-memory IndexedDB: enough of open / objectStore get, put and
// openCursor for playerDataCache.js. Requests resolve on timers, like the real
// thing, so the module's async flow is exercised.
function installFakeIndexedDb() {
  const stores = new Map();

  const request = (work) => {
    const req = { result: undefined, error: null, onsuccess: null, onerror: null };
    setTimeout(() => {
      try {
        req.result = work();
        req.onsuccess?.();
      } catch (error) {
        req.error = error;
        req.onerror?.();
      }
    }, 0);
    return req;
  };

  globalThis.indexedDB = {
    open() {
      const req = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
      setTimeout(() => {
        const db = {
          objectStoreNames: { contains: (name) => stores.has(name) },
          createObjectStore: (name) => stores.set(name, new Map()),
          transaction: (name) => {
            const map = stores.get(name);
            const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
            tx.objectStore = () => ({
              get: (key) => request(() => map.get(key)),
              put: (value, key) => request(() => { map.set(key, structuredClone(value)); }),
              openCursor: () => {
                const keys = [...map.keys()];
                let index = 0;
                const cursorReq = { result: null, error: null, onsuccess: null };
                const step = () => setTimeout(() => {
                  if (index >= keys.length) {
                    cursorReq.result = null;
                  } else {
                    const key = keys[index];
                    index += 1;
                    cursorReq.result = {
                      value: map.get(key),
                      delete: () => map.delete(key),
                      continue: step,
                    };
                  }
                  cursorReq.onsuccess?.();
                }, 0);
                step();
                return cursorReq;
              },
            });
            setTimeout(() => tx.oncomplete?.(), 40);
            return tx;
          },
        };
        req.result = db;
        if (!stores.size) req.onupgradeneeded?.();
        req.onsuccess?.();
      }, 0);
      return req;
    },
  };
  return stores;
}

const stores = installFakeIndexedDb();
const {
  cachedPlayerData,
  clearAllPlayerData,
  clearLivePlayerData,
} = await import('../../src/utils/playerDataCache.js');

const HOUR = 60 * 60 * 1000;
const stored = () => stores.get('payloads');

beforeEach(async () => {
  await clearAllPlayerData();
});

describe('cachedPlayerData', () => {
  it('serves a fresh entry without fetching again', async () => {
    let fetches = 0;
    const load = async () => { fetches += 1; return { data: { n: fetches } }; };

    assert.deepEqual(await cachedPlayerData('k1', load, { ttl: HOUR }), { n: 1 });
    assert.deepEqual(await cachedPlayerData('k1', load, { ttl: HOUR }), { n: 1 });
    assert.equal(fetches, 1);
  });

  it('refetches a live entry once its TTL has passed', async () => {
    let fetches = 0;
    const load = async () => { fetches += 1; return { data: { n: fetches } }; };

    await cachedPlayerData('k2', load, { ttl: HOUR });
    const entry = stored().get('k2');
    entry.ts -= 2 * HOUR;
    stored().set('k2', entry);

    assert.deepEqual(await cachedPlayerData('k2', load, { ttl: HOUR }), { n: 2 });
  });

  it('never expires a final entry', async () => {
    let fetches = 0;
    const load = async () => { fetches += 1; return { data: { n: fetches } }; };

    await cachedPlayerData('k3', load, { ttl: Infinity, final: true });
    const entry = stored().get('k3');
    entry.ts = 0;
    stored().set('k3', entry);

    assert.deepEqual(await cachedPlayerData('k3', load, { ttl: HOUR }), { n: 1 });
    assert.equal(fetches, 1);
  });

  it('serves the expired copy when the refresh fails (offline)', async () => {
    await cachedPlayerData('k4', async () => ({ data: { season: 'live' } }), { ttl: HOUR });
    const entry = stored().get('k4');
    entry.ts -= 5 * HOUR;
    stored().set('k4', entry);

    const offline = await cachedPlayerData('k4', async () => { throw new Error('offline'); }, { ttl: HOUR });
    assert.deepEqual(offline, { season: 'live' });
  });

  it('rejects when the fetch fails and nothing is stored', async () => {
    await assert.rejects(
      cachedPlayerData('k5', async () => { throw new Error('offline'); }, { ttl: HOUR }),
      /offline/,
    );
  });

  it('returns incomplete data without storing it', async () => {
    const data = await cachedPlayerData('k6', async () => ({ data: [1], incomplete: true }), { ttl: HOUR });
    assert.deepEqual(data, [1]);
    assert.equal(stored().has('k6'), false);
  });

  it('honours shouldCache', async () => {
    await cachedPlayerData('k7', async () => ({ data: [] }), { ttl: HOUR, shouldCache: (rows) => rows.length > 0 });
    assert.equal(stored().has('k7'), false);
  });

  it('hands the previously stored copy to the fetcher so a refresh can be incremental', async () => {
    await cachedPlayerData('k8', async () => ({ data: ['old'] }), { ttl: HOUR });
    const entry = stored().get('k8');
    entry.ts -= 5 * HOUR;
    stored().set('k8', entry);

    let seen = null;
    await cachedPlayerData('k8', async (stale) => { seen = stale; return { data: ['new'] }; }, { ttl: HOUR });
    assert.deepEqual(seen, ['old']);
  });

  it('shares one in-flight request between concurrent callers', async () => {
    let fetches = 0;
    const load = async () => {
      fetches += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { data: 'shared' };
    };
    const results = await Promise.all([
      cachedPlayerData('k9', load, { ttl: HOUR }),
      cachedPlayerData('k9', load, { ttl: HOUR }),
    ]);
    assert.deepEqual(results, ['shared', 'shared']);
    assert.equal(fetches, 1);
  });

  it('treats an entry from another schema version as a miss', async () => {
    await cachedPlayerData('k10', async () => ({ data: 'v1' }), { ttl: HOUR });
    const entry = stored().get('k10');
    entry.schema = 999;
    stored().set('k10', entry);

    assert.equal(await cachedPlayerData('k10', async () => ({ data: 'fresh' }), { ttl: HOUR }), 'fresh');
  });
});

describe('clearing the cache', () => {
  it('clearLivePlayerData keeps completed-season entries (a release must not refetch them)', async () => {
    await cachedPlayerData('past', async () => ({ data: 'final' }), { ttl: Infinity, final: true });
    await cachedPlayerData('live', async () => ({ data: 'live' }), { ttl: HOUR });
    assert.equal(stored().size, 2);

    await clearLivePlayerData();
    assert.equal(stored().has('past'), true);
    assert.equal(stored().has('live'), false);
  });

  it('clearAllPlayerData removes everything', async () => {
    await cachedPlayerData('past', async () => ({ data: 'final' }), { ttl: Infinity, final: true });
    await cachedPlayerData('live', async () => ({ data: 'live' }), { ttl: HOUR });
    await clearAllPlayerData();
    assert.equal(stored().size, 0);
  });
});
