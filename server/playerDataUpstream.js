const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class UpstreamUnavailableError extends Error {
  constructor(retryAt) {
    super('ESPN is temporarily unavailable; the player data cache is backing off.');
    this.name = 'UpstreamUnavailableError';
    this.retryAt = retryAt;
  }
}

/**
 * The only path server-side player-data requests take to ESPN. It exists to
 * keep GridShift's server well below anything that looks like abuse:
 *   - a small global concurrency limit with a minimum gap between request starts,
 *   - a circuit breaker that stops all calls after a 429/403 or a run of
 *     5xx/timeouts, and backs off exponentially before trying again.
 *
 * `request(url, { background })` resolves to { ok, status, json() } for any HTTP response and
 * rejects for network failures, timeouts, and an open breaker.
 */
export function createUpstreamClient({
  fetchImpl = fetch,
  concurrency = 2,
  spacingMs = 150,
  timeoutMs = 15_000,
  breakerFailureThreshold = 5,
  breakerBaseCooldownMs = 60_000,
  breakerMaxCooldownMs = 15 * 60_000,
  now = () => Date.now(),
  sleep = defaultSleep,
} = {}) {
  let active = 0;
  // Background requests (for example the career repair's per-season lookups)
  // queue behind foreground ones so they never delay what the page is waiting on.
  const waiters = [];
  const backgroundWaiters = [];
  let nextStartAt = 0;
  let consecutiveFailures = 0;
  let trips = 0;
  let openUntil = 0;

  function assertClosed() {
    if (now() < openUntil) throw new UpstreamUnavailableError(openUntil);
  }

  function trip(minCooldownMs = 0) {
    trips += 1;
    const cooldown = Math.max(
      minCooldownMs,
      Math.min(breakerMaxCooldownMs, breakerBaseCooldownMs * 2 ** (trips - 1)),
    );
    openUntil = now() + Math.min(cooldown, breakerMaxCooldownMs);
    consecutiveFailures = 0;
  }

  function recordFailure() {
    consecutiveFailures += 1;
    if (consecutiveFailures >= breakerFailureThreshold) trip();
  }

  function recordSuccess() {
    consecutiveFailures = 0;
    // A success after the cooldown elapsed proves ESPN is answering again.
    if (now() >= openUntil) trips = 0;
  }

  async function acquire(background) {
    if (active < concurrency) {
      active += 1;
      return;
    }
    // The releasing request hands its slot straight to the next waiter.
    await new Promise((resolve) => (background ? backgroundWaiters : waiters).push(resolve));
  }

  function release() {
    const next = waiters.shift() ?? backgroundWaiters.shift();
    if (next) next();
    else active -= 1;
  }

  async function request(url, { background = false } = {}) {
    assertClosed();
    await acquire(background);
    try {
      // The breaker may have opened while this request was queued.
      assertClosed();

      const startAt = Math.max(now(), nextStartAt);
      nextStartAt = startAt + spacingMs;
      const delay = startAt - now();
      if (delay > 0) await sleep(delay);

      let response;
      let text;
      try {
        response = await fetchImpl(url, {
          headers: { Accept: 'application/json', 'User-Agent': 'GridShift Player Data Cache' },
          signal: AbortSignal.timeout(timeoutMs),
        });
        text = await response.text();
      } catch (error) {
        recordFailure();
        throw error;
      }

      const status = Number(response.status);
      if (status === 429 || status === 403) {
        const retryAfterSeconds = Number.parseInt(response.headers?.get?.('retry-after') ?? '', 10);
        trip(Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 0);
      } else if (status >= 500) {
        recordFailure();
      } else {
        recordSuccess();
      }

      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => JSON.parse(text),
      };
    } finally {
      release();
    }
  }

  return {
    request,
    getStatus() {
      const t = now();
      return {
        open: t < openUntil,
        retryAt: t < openUntil ? openUntil : null,
        trips,
        active,
        queued: waiters.length + backgroundWaiters.length,
      };
    },
  };
}
