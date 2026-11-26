import {
  formatProviderGameClock,
  parseProviderGameClock,
  resolveClockAgeCapMs,
  resolveProviderAnchoredGameClock,
  resolveSampleStoppage,
} from './providerAnchoredGameClock.js';
import { QUARTER_SECONDS } from './playByPlay/gameClock.js';
import { createVisiblePoller, isPageActive } from './visiblePolling.js';

/**
 * One shared live game clock for every surface (Scores cards, Scores
 * drilldown, Fantasy Matchups). A module store for `useSyncExternalStore`:
 *
 * - one 1s timer, started by the first subscriber and stopped with the last;
 * - paused while the page is hidden or offline, with one immediate tick on
 *   return (`createVisiblePoller` in visiblePolling.js);
 * - per-game display memory, so every surface prints the same second and
 *   corrections stay monotonic across surfaces.
 *
 * Each game is resolved once per tick and input; every caller in that tick
 * reads the cached result. The ticked value is presentation only: win
 * probability, pace, progress, replay, and charts read provider samples.
 */

const BALLDONTLIE = 'balldontlie';
const MEMORY_TTL_MS = 10 * 60_000;
// Clock label while the countdown holds because the feed has gone quiet.
export const AWAITING_UPDATE_REASON = 'Waiting for update';

export function getLiveClockGameKey(game) {
  const id = game?.bdlGameId ?? game?.providerGameId ?? game?.id;
  return id == null ? null : `bdl:${String(id).replace(/^bdl-/, '')}`;
}

/** BALLDONTLIE-sourced scoreboard clock, live, with a provider anchor. */
export function isTickingClockGame(game) {
  if (!game || game.status !== 'live') return false;
  const source = game.scoreboardProvider ?? game.provider;
  if (source !== BALLDONTLIE) return false;
  // Only a game with a play-by-play sample can tell when the clock stops; any
  // other game keeps the stepped provider clock rather than run through a
  // stoppage it cannot see.
  if (!game.latestPlay?.play) return false;
  const anchor = game.live?.providerClockAnchor;
  return Boolean(anchor && game.live?.clock && parseProviderGameClock(game.live.clock) != null);
}

export function formatLiveClockLabel(period, clock) {
  if (!clock) return null;
  return period ? `Q${period} · ${clock}` : clock;
}

/**
 * `environment` is injectable for tests: `now`, `schedule`/`cancelSchedule`
 * (timer), and `documentTarget`/`windowTarget`/`navigatorTarget` (visibility
 * and online state). Pausing while hidden or offline, and the one immediate
 * tick on return, come from the shared `createVisiblePoller`.
 */
export function createLiveClockTicker({
  now = () => Date.now(),
  schedule,
  cancelSchedule,
  documentTarget = typeof document === 'undefined' ? null : document,
  windowTarget = typeof window === 'undefined' ? null : window,
  navigatorTarget = typeof navigator === 'undefined' ? null : navigator,
} = {}) {
  const listeners = new Set();
  // One entry per game keeps its display and device-local anchor for the current sample.
  const memory = new Map();
  let tick = 0;
  let tickAt = now();
  let running = false;

  const isActive = () => isPageActive({ documentTarget, navigatorTarget });

  const prune = () => {
    const cutoff = now() - MEMORY_TTL_MS;
    memory.forEach((entry, key) => {
      if (entry.seenAt < cutoff) memory.delete(key);
    });
  };

  const emit = () => {
    tick += 1;
    tickAt = now();
    if (tick % 60 === 0) prune();
    listeners.forEach((listener) => listener());
  };

  const poller = createVisiblePoller({
    run: emit,
    getDelay: () => 1000,
    documentTarget,
    windowTarget,
    navigatorTarget,
    now,
    ...(schedule ? { schedule } : null),
    ...(cancelSchedule ? { cancelSchedule } : null),
  });

  const start = () => {
    if (running) return;
    running = true;
    poller.start();
  };

  const stop = () => {
    if (!running) return;
    running = false;
    poller.stop();
  };

  const subscribe = (listener) => {
    listeners.add(listener);
    if (listeners.size === 1) {
      // Fresh time for the first surface; React re-reads the changed snapshot.
      tick += 1;
      tickAt = now();
      start();
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        stop();
      }
    };
  };

  const getSnapshot = () => tick;

  /**
   * Resolve one game's clock for the current tick. Same tick and input return
   * the cached result, so StrictMode double renders and several surfaces agree.
   */
  const resolveGame = (game, { sampleIntervalMs = null } = {}) => {
    const gameKey = getLiveClockGameKey(game);
    const anchor = game?.live?.providerClockAnchor;
    if (!gameKey || !anchor) return null;
    const period = game.live.period ?? null;
    const clock = game.live.clock;
    const latestPlay = game.latestPlay;
    const stoppage = resolveSampleStoppage(latestPlay?.play, { period, clock });
    const clockSeconds = parseProviderGameClock(clock);
    const playPeriod = Number(latestPlay?.play?.period);
    const resumedAtWarning = !stoppage.stopped
      && playPeriod === Number(period) && parseProviderGameClock(latestPlay?.play?.time) === clockSeconds;
    // The scoreboard may set the next period at full time during the break.
    const betweenPeriods = playPeriod > 0 && playPeriod < Number(period) && (
      clockSeconds === QUARTER_SECONDS || (Number(period) > 4 && clockSeconds === 10 * 60)
    );
    const active = isActive();
    const feedStale = anchor.feedStale === true || latestPlay?.stale === true;
    const ageCapMs = resolveClockAgeCapMs(sampleIntervalMs);
    const inputKey = [
      game.status, anchor.key, period, clock, anchor.changedAt, anchor.verifiedAt, anchor.feedStale,
      anchor.providerClockFrozen, latestPlay?.verifiedAt, latestPlay?.stale,
      stoppage.stopped, stoppage.reason, resumedAtWarning, betweenPeriods, active, sampleIntervalMs,
    ].join('|');

    let entry = memory.get(gameKey);
    if (entry && entry.tick === tick && entry.inputKey === inputKey) {
      entry.seenAt = now();
      return entry.result;
    }
    if (!entry) {
      entry = { tick: -1, base: null, value: null, inputKey: null, result: null, anchorKey: null, seenAt: 0 };
      memory.set(gameKey, entry);
    }
    // A later input in the same tick re-resolves from the value before this tick.
    const base = entry.tick === tick ? entry.base : entry.value;
    if (entry.anchorKey !== anchor.key) {
      // Bound device/server skew when this value first arrives. A later fetch
      // can verify the same value without moving the origin of the estimate.
      const sampleAgeMs = Number.isFinite(anchor.sampleAgeMs) ? anchor.sampleAgeMs : 0;
      entry.anchorKey = anchor.key;
      entry.firstSeenAt = now();
      entry.changedAt = Math.max(Number(anchor.changedAt) || 0, entry.firstSeenAt - sampleAgeMs);
      entry.lastVerifiedAt = null;
    }
    const verifiedAt = Math.min(
      Math.max(entry.changedAt, anchor.verifiedAt ?? entry.changedAt),
      latestPlay?.verifiedAt ?? Infinity,
    );
    if (!feedStale && (entry.lastVerifiedAt == null || verifiedAt > entry.lastVerifiedAt)) {
      // Fresh data can resume the same reading after the countdown held.
      // Skip the elapsed time we could not verify during that hold.
      if (entry.lastVerifiedAt != null) {
        entry.changedAt += Math.max(0, verifiedAt - entry.lastVerifiedAt - ageCapMs);
      }
      entry.lastVerifiedAt = verifiedAt;
    }

    const resolved = resolveProviderAnchoredGameClock({
      status: game.status,
      period,
      providerClock: clock,
      anchorChangedAt: entry.changedAt,
      verifiedAt,
      anchorKey: anchor.key,
      now: Math.max(tickAt, entry.firstSeenAt),
      previousDisplayClock: base?.seconds ?? null,
      previousPeriod: base?.period ?? null,
      previousAnchorKey: base?.anchorKey ?? null,
      feedStale,
      providerClockFrozen: anchor.providerClockFrozen === true,
      stopped: stoppage.stopped,
      paused: !active || betweenPeriods,
      resumedAtWarning,
      ageCapMs,
    });
    if (!resolved) return null;

    // A second input for the same sample within one tick (a stoppage flag
    // arriving mid-second) never shows more time than this tick already did.
    let seconds = resolved.seconds;
    if (entry.tick === tick
      && base?.anchorKey === anchor.key
      && entry.value?.anchorKey === anchor.key
      && entry.value.period === resolved.period) {
      seconds = Math.min(seconds, entry.value.seconds);
    }
    const displayClock = formatProviderGameClock(seconds);
    const result = {
      label: formatLiveClockLabel(period, displayClock),
      clock: displayClock,
      period: resolved.period,
      frozen: resolved.frozen,
      stopReason: resolved.frozen && stoppage.stopped
        ? stoppage.reason
        : resolved.frozenReason === 'awaiting-update' ? AWAITING_UPDATE_REASON : null,
      stale: resolved.stale,
    };
    entry.base = base;
    entry.value = { seconds, period: resolved.period, anchorKey: anchor.key };
    entry.tick = tick;
    entry.inputKey = inputKey;
    entry.result = result;
    entry.seenAt = now();
    return result;
  };

  return {
    subscribe,
    getSnapshot,
    resolveGame,
    // Test and diagnostics hooks.
    isTicking: () => running && !poller.isPaused() && isActive(),
    subscriberCount: () => listeners.size,
    reset: () => {
      stop();
      listeners.clear();
      memory.clear();
      tick = 0;
      tickAt = now();
    },
  };
}

export const liveClockTicker = createLiveClockTicker();
