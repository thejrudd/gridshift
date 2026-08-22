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
  if (difference === 0) return targetSeconds;

  // A live game clock cannot count upward within the same period. Hold any
  // provider correction that would move the visible value forward until a
  // later anchor catches up. If the provider moves backward, recover by at
  // most two seconds per visual tick unless the correction is large enough to
  // be an authoritative snap.
  if (difference > 0) return previousSeconds;
  if (difference < -5) return targetSeconds;
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
  providerClockFrozen = false,
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
  const elapsedSeconds = statusFrozen || boundary || providerClockFrozen
    ? 0
    : Math.floor(Math.min(elapsedMs, staleWindowMs) / 1000);
  let targetSeconds = Math.max(0, providerSeconds - elapsedSeconds);

  // Do not animate through the two-minute warning or a period boundary. A
  // later provider anchor is required to move the display past either point.
  if (providerSeconds > 120 && targetSeconds <= 120) targetSeconds = 120;

  const previousSeconds = parseProviderGameClock(previousDisplayClock);
  const samePeriod = previousPeriod == null || period == null
    || String(previousPeriod) === String(period);
  const displaySeconds = previousSeconds == null || !samePeriod || statusFrozen || boundary || providerClockFrozen
    ? targetSeconds
    : feedStale
      ? previousSeconds
      : gentlyCorrectClock(previousSeconds, targetSeconds);

  let frozenReason = null;
  if (statusFrozen) frozenReason = normalizedStatus || 'not-live';
  else if (providerClockFrozen) frozenReason = 'provider-stoppage';
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
  providerFetchedAt,
  feedStale = false,
  providerClockFrozen = false,
  staleAfterMs = PROVIDER_CLOCK_STALE_AFTER_MS,
} = {}) {
  if (!nextGame?.live?.clock || nextGame.status !== 'live') return nextGame;

  const previousAnchor = previousGame?.live?.providerClockAnchor ?? null;
  const observedAtMs = asTimestamp(observedAt);
  const providerFetchedAtMs = asTimestamp(providerFetchedAt);
  const effectiveProviderFetchedAtMs = providerFetchedAtMs != null && observedAtMs != null
    ? Math.min(providerFetchedAtMs, observedAtMs)
    : providerFetchedAtMs;
  const anchorAtMs = effectiveProviderFetchedAtMs ?? observedAtMs ?? asTimestamp(previousAnchor?.changedAt);
  if (anchorAtMs == null && !previousAnchor) return nextGame;

  const anchorKey = `${nextGame.live.period ?? ''}|${nextGame.live.clock}`;
  const anchorChanged = previousAnchor?.key !== anchorKey;
  const changedAt = anchorChanged
    ? anchorAtMs
    : asTimestamp(previousAnchor?.changedAt) ?? anchorAtMs;

  return {
    ...nextGame,
    live: {
      ...nextGame.live,
      providerClockAnchor: {
        key: anchorKey,
        changedAt,
        observedAt: observedAtMs ?? anchorAtMs,
        providerFetchedAt: providerFetchedAtMs
          ?? asTimestamp(previousAnchor?.providerFetchedAt)
          ?? anchorAtMs,
        staleAfterMs: Math.min(
          PROVIDER_CLOCK_STALE_AFTER_MS,
          Math.max(0, Number(staleAfterMs) || PROVIDER_CLOCK_STALE_AFTER_MS),
        ),
        feedStale: Boolean(feedStale),
        providerClockFrozen: Boolean(providerClockFrozen),
      },
    },
  };
}
