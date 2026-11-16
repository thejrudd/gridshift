// A polling timer that only runs while the page can use the answer: the
// document is visible and the browser is online. A hidden or offline tab makes
// no requests; returning to it (visibilitychange or `online`) runs one refresh
// right away and then resumes the cadence, without a burst when both events
// fire together. The delay is re-read before every tick, so a caller can widen
// or narrow its cadence from current data (see liveRefreshCadence.js), and
// `reschedule()` re-times the pending tick from the last one without pushing it
// back (or, for a countdown delay, re-arms it from now). Framework-free with injectable globals so it can be unit tested.
// Server contract: docs/Live Data Server Architecture.md (hidden or offline
// tabs stop requesting).

export function isPageActive({
  documentTarget = typeof document === 'undefined' ? null : document,
  navigatorTarget = typeof navigator === 'undefined' ? null : navigator,
} = {}) {
  return documentTarget?.visibilityState !== 'hidden' && navigatorTarget?.onLine !== false;
}

/**
 * @param {object} options
 * @param {() => unknown} options.run  The refresh; its result is not awaited, so
 *   the cadence is measured from tick to tick. Callers guard their own overlap.
 * @param {() => number|null} options.getDelay  Milliseconds to the next tick
 *   (see `rescheduleFrom` for how `reschedule()` reads it);
 *   null (or a non-positive / non-finite value) stops ticking until
 *   `reschedule()` is called.
 */
export function createVisiblePoller({
  run,
  getDelay,
  documentTarget = typeof document === 'undefined' ? null : document,
  windowTarget = typeof window === 'undefined' ? null : window,
  navigatorTarget = typeof navigator === 'undefined' ? null : navigator,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancelSchedule = (timerId) => clearTimeout(timerId),
  now = () => Date.now(),
  // 'lastTick' when getDelay is an interval (re-timing never postpones the
  // pending tick); 'now' when it is a countdown to a moment (the delay is
  // already measured from the current time).
  rescheduleFrom = 'lastTick',
}) {
  let stopped = true;
  let paused = false;
  let timerId = null;
  let lastTickAt = 0;

  const active = () => isPageActive({ documentTarget, navigatorTarget });

  const clearTimer = () => {
    if (timerId == null) return;
    cancelSchedule(timerId);
    timerId = null;
  };

  const readDelay = () => {
    const delay = Number(getDelay?.());
    return Number.isFinite(delay) && delay > 0 ? delay : null;
  };

  const invoke = () => {
    lastTickAt = now();
    try {
      const result = run();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // A failed refresh keeps the cadence; the caller reports its own error.
    }
  };

  const arm = (delay) => {
    clearTimer();
    timerId = schedule(tick, delay);
  };

  function scheduleNext() {
    clearTimer();
    if (stopped) return;
    if (!active()) {
      paused = true;
      return;
    }
    const delay = readDelay();
    if (delay != null) arm(delay);
  }

  function tick() {
    timerId = null;
    if (stopped) return;
    if (!active()) {
      paused = true;
      return;
    }
    invoke();
    scheduleNext();
  }

  const resume = () => {
    if (stopped) return;
    if (!active()) {
      clearTimer();
      paused = true;
      return;
    }
    if (!paused) return;
    paused = false;
    invoke();
    scheduleNext();
  };

  const handleOffline = () => {
    if (stopped) return;
    clearTimer();
    paused = true;
  };

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      lastTickAt = now();
      paused = !active();
      documentTarget?.addEventListener?.('visibilitychange', resume);
      windowTarget?.addEventListener?.('online', resume);
      windowTarget?.addEventListener?.('offline', handleOffline);
      scheduleNext();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clearTimer();
      documentTarget?.removeEventListener?.('visibilitychange', resume);
      windowTarget?.removeEventListener?.('online', resume);
      windowTarget?.removeEventListener?.('offline', handleOffline);
    },
    // Re-time the pending tick after the delay changed: due `delay` after the
    // last tick (now, if that has passed). Repeated calls never postpone it.
    reschedule() {
      if (stopped || paused) return;
      if (!active()) {
        clearTimer();
        paused = true;
        return;
      }
      const delay = readDelay();
      if (delay == null) {
        clearTimer();
        return;
      }
      arm(rescheduleFrom === 'now' ? delay : Math.max(0, lastTickAt + delay - now()));
    },
    isPaused: () => paused,
  };
}
