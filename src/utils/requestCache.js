// requestCache.js — a small in-memory cache for page payloads that are
// expensive to build and safe to show again (the Statistics player and team
// dashboards).
//
//   - Entries live in a module-level Map for the life of the tab, bounded to
//     `maxEntries` and evicted least recently used first.
//   - Concurrent loads of one key share a single request.
//   - `peek` is synchronous, so a hook can render a cached payload on its first
//     render instead of a loading state, then revalidate in the background.
//   - Only successful results are stored; a failed load leaves any earlier
//     entry in place.
//
// Requests run without the caller's AbortSignal: a load that outlives the
// component that started it still fills the cache for the next view, and one
// caller unmounting never cancels a request another caller shares.

export function createRequestCache({ maxEntries = 50, now = () => Date.now() } = {}) {
  const entries = new Map(); // key -> { value, at }
  const inFlight = new Map(); // key -> Promise

  function store(key, value) {
    entries.delete(key);
    entries.set(key, { value, at: now() });
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
  }

  return {
    /** The cached `{ value, at }` for a key, or null. Marks it recently used. */
    peek(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      entries.delete(key);
      entries.set(key, entry);
      return entry;
    },

    /**
     * Resolve a key's value: the cached one unless `force`, else a shared
     * in-flight request, else a new `fetcher()` call whose result is stored.
     */
    load(key, fetcher, { force = false } = {}) {
      if (inFlight.has(key)) return inFlight.get(key);
      if (!force) {
        const entry = this.peek(key);
        if (entry) return Promise.resolve(entry.value);
      }
      const pending = Promise.resolve()
        .then(fetcher)
        .then((value) => {
          store(key, value);
          return value;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
      return pending;
    },

    clear() {
      entries.clear();
    },

    get size() {
      return entries.size;
    },
  };
}
