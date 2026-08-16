export const PROVIDER_CLOCK_STALE_AFTER_MS = 10_000;

const FROZEN_GAME_STATUSES = new Set(['halftime', 'delayed', 'final']);

export function parseProviderGameClock(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isInteger(minutes) || !Number.isInteger(seconds) || seconds > 59) return null;
  return (minutes * 60) + seconds;
}

export function formatProviderGameClock(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function asTimestamp(value) {
  if (Number.isFinite(value)) return Number(value);
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : null;
}

function gentlyCorrectClock(previousSeconds, targetSeconds) {
  const difference = targetSeconds - previousSeconds;
  if (difference === 0 || Math.abs(difference) > 5) return targetSeconds;

  // If the provider moves the clock backward by a few seconds, hold the
  // display until its authoritative clock catches up. This avoids showing an
  // NFL clock count upward. If the provider moves forward, recover by at most
  // one extra second per tick instead of making a conspicuous multi-second jump.
  if (difference > 0) return previousSeconds;
  return Math.max(targetSeconds, previousSeconds - 2);
}

export function resolveProviderAnchoredGameClock({
  status,
  period,
  providerClock,
  anchorChangedAt,
  now,
  previousDisplayClock = null,
  previousPeriod = null,
  feedStale = false,
  staleAfterMs = PROVIDER_CLOCK_STALE_AFTER_MS,
} = {}) {
  const providerSeconds = parseProviderGameClock(providerClock);
  const observedAt = asTimestamp(anchorChangedAt);
  const nowMs = asTimestamp(now);
  if (providerSeconds == null || observedAt == null || nowMs == null) return null;

  const normalizedStatus = String(status ?? '').trim().toLowerCase();
  const staleWindowMs = Math.min(
    PROVIDER_CLOCK_STALE_AFTER_MS,
    Math.max(0, Number(staleAfterMs) || PROVIDER_CLOCK_STALE_AFTER_MS),
  );
  const elapsedMs = Math.max(0, nowMs - observedAt);
  const stale = feedStale || elapsedMs >= staleWindowMs;
  const boundary = providerSeconds === 120 || providerSeconds === 0;
  const statusFrozen = FROZEN_GAME_STATUSES.has(normalizedStatus) || normalizedStatus !== 'live';
  const elapsedSeconds = statusFrozen || boundary
    ? 0
    : Math.floor(Math.min(elapsedMs, staleWindowMs) / 1000);
  let targetSeconds = Math.max(0, providerSeconds - elapsedSeconds);

  // Do not animate through the two-minute warning or a period boundary. A
  // later provider anchor is required to move the display past either point.
  if (providerSeconds > 120 && targetSeconds <= 120) targetSeconds = 120;

  const previousSeconds = parseProviderGameClock(previousDisplayClock);
  const samePeriod = previousPeriod == null || period == null
    || String(previousPeriod) === String(period);
  const displaySeconds = previousSeconds == null || !samePeriod || statusFrozen || boundary
    ? targetSeconds
    : feedStale
      ? previousSeconds
      : gentlyCorrectClock(previousSeconds, targetSeconds);

  let frozenReason = null;
  if (statusFrozen) frozenReason = normalizedStatus || 'not-live';
  else if (boundary || displaySeconds === 120 || displaySeconds === 0) frozenReason = 'boundary';
  else if (stale) frozenReason = 'stale';

  return {
    clock: formatProviderGameClock(displaySeconds),
    seconds: displaySeconds,
    providerClock: formatProviderGameClock(providerSeconds),
    providerSeconds,
    period: period == null ? null : String(period),
    stale,
    frozen: Boolean(frozenReason),
    frozenReason,
  };
}

export function reconcileProviderClockAnchor(previousGame, nextGame, {
  observedAt,
  feedStale = false,
  staleAfterMs = PROVIDER_CLOCK_STALE_AFTER_MS,
} = {}) {
  if (!nextGame?.live?.clock || nextGame.status !== 'live') return nextGame;

  const observedAtMs = asTimestamp(observedAt) ?? 0;
  const previousAnchor = previousGame?.live?.providerClockAnchor ?? null;
  const anchorKey = `${nextGame.live.period ?? ''}|${nextGame.live.clock}`;
  const anchorChanged = previousAnchor?.key !== anchorKey;
  const changedAt = anchorChanged
    ? observedAtMs
    : asTimestamp(previousAnchor?.changedAt) ?? observedAtMs;

  return {
    ...nextGame,
    live: {
      ...nextGame.live,
      providerClockAnchor: {
        key: anchorKey,
        changedAt,
        observedAt: observedAtMs,
        staleAfterMs: Math.min(
          PROVIDER_CLOCK_STALE_AFTER_MS,
          Math.max(0, Number(staleAfterMs) || PROVIDER_CLOCK_STALE_AFTER_MS),
        ),
        feedStale: Boolean(feedStale),
      },
    },
  };
}
