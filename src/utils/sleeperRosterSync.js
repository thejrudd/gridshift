export const SLEEPER_ROSTER_REFRESH_INTERVAL_MS = 30_000;

/**
 * Keeps the selected Sleeper league's roster collection fresh without tying
 * polling behavior to a particular screen. Dependencies are injectable so the
 * lifecycle can be verified without mounting the React app.
 */
export function createSleeperRosterSync({
  leagueId,
  fetchRosters,
  applyRosters,
  intervalMs = SLEEPER_ROSTER_REFRESH_INTERVAL_MS,
  documentTarget = typeof document === 'undefined' ? null : document,
  windowTarget = typeof window === 'undefined' ? null : window,
  navigatorTarget = typeof navigator === 'undefined' ? null : navigator,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancelSchedule = (timerId) => clearTimeout(timerId),
}) {
  let stopped = true;
  let timerId = null;
  let inFlight = null;

  const isVisible = () => documentTarget?.visibilityState !== 'hidden';
  const isOnline = () => navigatorTarget?.onLine !== false;

  const clearTimer = () => {
    if (timerId == null) return;
    cancelSchedule(timerId);
    timerId = null;
  };

  const scheduleNext = () => {
    clearTimer();
    if (stopped || !isVisible() || !isOnline()) return;
    timerId = schedule(() => {
      timerId = null;
      void refresh();
    }, intervalMs);
  };

  const refresh = () => {
    if (stopped || !isVisible() || !isOnline()) return Promise.resolve(null);
    if (inFlight) return inFlight;

    clearTimer();
    const request = Promise.resolve()
      .then(() => fetchRosters(leagueId))
      .then((nextRosters) => {
        if (!stopped && Array.isArray(nextRosters)) applyRosters(nextRosters);
        return nextRosters;
      })
      .catch(() => null)
      .finally(() => {
        if (inFlight === request) inFlight = null;
        scheduleNext();
      });
    inFlight = request;
    return request;
  };

  const handleVisibilityChange = () => {
    if (!isVisible()) {
      clearTimer();
      return;
    }
    void refresh();
  };

  const handleFocus = () => {
    void refresh();
  };

  const handleOnline = () => {
    void refresh();
  };

  const start = () => {
    if (!stopped) return;
    stopped = false;
    documentTarget?.addEventListener?.('visibilitychange', handleVisibilityChange);
    windowTarget?.addEventListener?.('focus', handleFocus);
    windowTarget?.addEventListener?.('online', handleOnline);
    void refresh();
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimer();
    documentTarget?.removeEventListener?.('visibilitychange', handleVisibilityChange);
    windowTarget?.removeEventListener?.('focus', handleFocus);
    windowTarget?.removeEventListener?.('online', handleOnline);
  };

  return { start, stop, refresh };
}
