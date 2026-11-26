import { parseClockSeconds } from './playByPlay/gameClock.js';
import { isNonSnapPlay, isKickFiledUnderFumble, isKickPossessionPlay, isTurnoverOnDowns } from './nflPlays/fieldGeometry.js';
import { replayReviewLabel } from './nflPlays/playNarrative.js';
import { canonicalTeam } from './nflPlays/fieldSpots.js';

// Legacy name kept for the anchor's `staleAfterMs` field and existing callers.
export const PROVIDER_CLOCK_STALE_AFTER_MS = 10_000;
// How long the display can keep running without a fresh provider response.
// The provider may repeat the same game-clock value between snaps.
export const PROVIDER_CLOCK_AGE_CAP_DEFAULT_MS = 10_000;
export const PROVIDER_CLOCK_AGE_CAP_MAX_MS = 15_000;
// A stopping play only explains the current sample when its own clock is the
// sample's clock or at most this far above it (the play's duration). Below
// that the clock has visibly run since the play, so the play no longer says
// why the clock is held.
export const STOPPAGE_SAMPLE_TOLERANCE_SECONDS = 8;
// How long the display may run past one provider clock reading. The provider
// reports the clock only with a new play, and between real snaps the clock
// rarely runs longer than the 40-second play clock plus the play itself. Past
// this, a play the provider has not posted yet (a score under review, an
// injury, a long stoppage) is likelier than a running clock, so the display
// holds and says it is waiting instead of guessing minutes ahead.
export const PROVIDER_CLOCK_QUIET_LIMIT_SECONDS = 45;
// A same-period display that is behind the sample by more than this snaps;
// smaller gaps ease down over a few ticks.
const EASE_DOWN_SNAP_SECONDS = 10;
const TWO_MINUTES = 120;

const FROZEN_GAME_STATUSES = new Set(['halftime', 'delayed', 'final']);

export function parseProviderGameClock(value) {
  if (Number.isFinite(value)) return Math.max(0, Math.floor(Number(value)));
  return parseClockSeconds(value, { strict: true });
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

function periodNumber(period) {
  const value = Number(period);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * NFL two-minute warning: the second and fourth quarters, and overtime.
 */
export function isTwoMinuteWarningPeriod(period) {
  const value = periodNumber(period);
  return value === 2 || value === 4 || (value != null && value >= 5);
}

export function resolveClockAgeCapMs(sampleIntervalMs = null) {
  const interval = Number(sampleIntervalMs);
  if (!Number.isFinite(interval) || interval <= 0) return PROVIDER_CLOCK_AGE_CAP_DEFAULT_MS;
  return Math.min(
    PROVIDER_CLOCK_AGE_CAP_MAX_MS,
    Math.max(PROVIDER_CLOCK_AGE_CAP_DEFAULT_MS, Math.round(interval * 1.5)),
  );
}

/**
 * Does this play stop the game clock, and if so, what short broadcast label
 * says why? Reads the play's type, text, and normalized outcome.
 *
 * Returns `{ stopped, reason }`. `reason` is null when the play stops the clock
 * for a reason that has no label, and whenever the play does not stop it.
 */
export function classifyClockStoppage(play) {
  if (!play) return { stopped: false, reason: null };
  const slug = String(play.typeSlug ?? '').toLowerCase();
  const text = String(play.rawText ?? play.description ?? play.shortText ?? '').trim();
  const kind = play.narrative?.playKind;
  const stop = (reason) => ({ stopped: true, reason });

  const marker = [slug, play.type, text].map((value) => String(value ?? '').trim()).join('\n');
  if (/^two[- ]minute[- ]warning\b/im.test(marker)) return stop('2-min warning');
  if (/^end[- ](?:of[- ])?half\b/im.test(marker)) return stop('End of half');
  if (/^end[- ](?:of[- ])?game\b/im.test(marker)) return stop('End of game');
  if (/^end[- ](?:of[- ])?(?:period|quarter)\b/im.test(marker)) return stop('End of quarter');
  // Officials' stoppages (TV breaks, injuries, measurements) and team
  // timeouts read differently so a stop is never charged to the wrong side.
  if (slug === 'official-timeout' || /^official[- ]time ?out\b/im.test(marker)) return stop('Official timeout');
  if (/(?:^|-)timeout(?:$|-)/.test(slug) || /^(?:team[- ])?time ?out\b/im.test(marker)) {
    const team = /\btime ?out #\d+ by ([A-Z]{2,3})\b/i.exec(text)?.[1];
    return stop(team ? `${canonicalTeam(team)} timeout` : 'Timeout');
  }
  if (/^coin[- ]toss\b/im.test(marker)) return stop('Coin toss');
  if (isNonSnapPlay(play)) return stop(null);

  if (replayReviewLabel(play)) return stop('Review');
  if (/penalty|^flag$/.test(slug) || /\bpenalt(?:y|ies)\b|^flag\b/i.test(text)) return stop('Flag');

  if (/two.?point|2.?pt/.test(slug) || /\btwo-point\b/i.test(text)) return stop('2-pt try');
  if (/extra.?point|\bpat\b/.test(slug)) return stop('Extra point');
  if (/touchdown/.test(slug) || kind === 'touchdown') return stop('Touchdown');
  if (/field.?goal.?good/.test(slug) || (kind === 'field-goal' && play.narrative.good === true)) return stop('Field goal');
  if (/safety/.test(slug) || kind === 'safety') return stop('Safety');
  if (play.scoring === true) return stop(null);

  if (/kickoff/.test(slug) || kind === 'kickoff') return stop('Kickoff');
  if (/punt/.test(slug) || kind === 'punt') return stop('Punt');
  if (isKickPossessionPlay(play)) return stop('No good');
  if (isKickFiledUnderFumble(play)) return stop(null);
  if (/interception|fumble.?recovery.?opp|opp.?fumble.?recovery/.test(slug)
    || play.narrative?.turnover === true || isTurnoverOnDowns(play)) {
    return stop('Turnover');
  }

  if (/incompletion|incomplete/.test(slug) || /\bpass incomplete\b|\bincomplete\b/i.test(text)) {
    return stop('Incomplete');
  }
  if (/spike/.test(slug) || /\bspiked?\b/i.test(text)) return stop('Spike');

  if (/out.?of.?bounds/.test(slug) || /\bout of bounds\b|\b(?:ran|pushed|stepped|forced) ob\b/i.test(text)) {
    return stop('Out of bounds');
  }

  return { stopped: false, reason: null };
}

/**
 * The latest play explains the current provider sample only when it is from
 * the sample's period and its clock is the sample's clock or slightly above it.
 * A game clock already lower than that has run since the play.
 */
export function latestPlayExplainsSample(play, { period, clockSeconds } = {}) {
  if (!play || clockSeconds == null) return false;
  const playPeriod = periodNumber(play.period);
  const samplePeriod = periodNumber(period);
  if (playPeriod == null || samplePeriod == null || playPeriod !== samplePeriod) return false;
  const playSeconds = parseProviderGameClock(play.time);
  if (playSeconds == null) return false;
  const elapsed = playSeconds - clockSeconds;
  // A timeout has its own clock reading; a snap's timestamp may precede
  // the dead ball by a few seconds.
  const tolerance = isNonSnapPlay(play) ? 0 : STOPPAGE_SAMPLE_TOLERANCE_SECONDS;
  return elapsed >= 0 && elapsed <= tolerance;
}

/**
 * Stoppage for the current sample: `{ stopped, reason }` from the latest play,
 * only when that play explains the sample.
 */
export function resolveSampleStoppage(play, { period, clock } = {}) {
  const clockSeconds = parseProviderGameClock(clock);
  if (!latestPlayExplainsSample(play, { period, clockSeconds })) return { stopped: false, reason: null };
  return classifyClockStoppage(play);
}

function easeDown(previousSeconds, targetSeconds) {
  const difference = previousSeconds - targetSeconds;
  if (difference <= 1 || difference > EASE_DOWN_SNAP_SECONDS) return targetSeconds;
  return Math.max(targetSeconds, previousSeconds - Math.max(2, Math.ceil(difference / 2)));
}

/**
 * Resolve the visible clock for one provider sample at time `now`.
 *
 * - Ticks down one second per second from `anchorChangedAt` only while the
 *   clock is running (live, feed fresh, not stopped, not paused, above 0:00).
 * - Holds `ageCapMs` after the last verified feed response.
 * - Holds `PROVIDER_CLOCK_QUIET_LIMIT_SECONDS` after the reading last changed
 *   (`frozenReason: 'awaiting-update'`).
 * - Never crosses 2:00 in Q2/Q4/OT or 0:00, and never changes period locally.
 * - With a remembered display for the same period:
 *   - a new sample above the display (it ran ahead) snaps up once;
 *   - otherwise the display never moves up (holds);
 *   - a new sample below the display eases it down quickly (snaps beyond 10s);
 *     on the same sample the display simply follows the running estimate.
 * - A period change, a new stoppage, or no memory shows the sample directly.
 */
export function resolveProviderAnchoredGameClock({
  status,
  period,
  providerClock,
  anchorChangedAt,
  verifiedAt = anchorChangedAt,
  anchorKey = null,
  now,
  previousDisplayClock = null,
  previousPeriod = null,
  previousAnchorKey = null,
  feedStale = false,
  providerClockFrozen = false,
  stopped = false,
  paused = false,
  resumedAtWarning = false,
  ageCapMs = PROVIDER_CLOCK_AGE_CAP_DEFAULT_MS,
} = {}) {
  const providerSeconds = parseProviderGameClock(providerClock);
  const changedAt = asTimestamp(anchorChangedAt);
  const lastVerifiedAt = asTimestamp(verifiedAt) ?? changedAt;
  const nowMs = asTimestamp(now);
  if (providerSeconds == null || changedAt == null || nowMs == null) return null;

  const normalizedStatus = String(status ?? '').trim().toLowerCase();
  const capMs = Math.min(
    PROVIDER_CLOCK_AGE_CAP_MAX_MS,
    Math.max(0, Number(ageCapMs) || PROVIDER_CLOCK_AGE_CAP_DEFAULT_MS),
  );
  const deadline = lastVerifiedAt + capMs;
  const capped = nowMs >= deadline;
  const statusFrozen = FROZEN_GAME_STATUSES.has(normalizedStatus) || normalizedStatus !== 'live';
  const holdsAtTwoMinutes = isTwoMinuteWarningPeriod(period) && providerSeconds > TWO_MINUTES;
  const atBoundary = providerSeconds === 0
    || (isTwoMinuteWarningPeriod(period) && providerSeconds === TWO_MINUTES && !resumedAtWarning);
  const running = !statusFrozen && !feedStale && !providerClockFrozen && !stopped && !paused && !atBoundary;

  const runSeconds = running ? Math.floor(Math.max(0, Math.min(nowMs, deadline) - changedAt) / 1000) : 0;
  const awaitingUpdate = runSeconds > PROVIDER_CLOCK_QUIET_LIMIT_SECONDS;
  const elapsedSeconds = Math.min(runSeconds, PROVIDER_CLOCK_QUIET_LIMIT_SECONDS);
  let targetSeconds = Math.max(0, providerSeconds - elapsedSeconds);
  if (holdsAtTwoMinutes && targetSeconds < TWO_MINUTES) targetSeconds = TWO_MINUTES;

  const previousSeconds = parseProviderGameClock(previousDisplayClock);
  const samePeriod = previousPeriod == null || period == null
    || String(previousPeriod) === String(period);
  const newSample = anchorKey != null && previousAnchorKey != null && anchorKey !== previousAnchorKey;

  let displaySeconds;
  if (previousSeconds == null || !samePeriod || statusFrozen || (newSample && (stopped || providerClockFrozen))) {
    displaySeconds = targetSeconds;
  } else if (targetSeconds > previousSeconds) {
    // The display ran ahead of the provider. Only a new sample may move it up,
    // and then in one jump; holds on the same sample keep what is shown.
    displaySeconds = newSample ? targetSeconds : previousSeconds;
  } else if (targetSeconds < previousSeconds) {
    // On the same sample a lower target is just time passing. A new sample
    // below the display eases it down over a tick or two.
    if (newSample) displaySeconds = easeDown(previousSeconds, targetSeconds);
    else displaySeconds = feedStale ? previousSeconds : targetSeconds;
  } else {
    displaySeconds = targetSeconds;
  }
  if (holdsAtTwoMinutes && displaySeconds < TWO_MINUTES) displaySeconds = TWO_MINUTES;

  let frozenReason = null;
  if (statusFrozen) frozenReason = normalizedStatus || 'not-live';
  else if (feedStale) frozenReason = 'stale';
  else if (providerClockFrozen || stopped) frozenReason = 'stoppage';
  else if (paused) frozenReason = 'paused';
  else if (atBoundary || (holdsAtTwoMinutes && displaySeconds === TWO_MINUTES) || displaySeconds === 0) frozenReason = 'boundary';
  else if (awaitingUpdate) frozenReason = 'awaiting-update';
  else if (capped) frozenReason = 'stale';

  return {
    clock: formatProviderGameClock(displaySeconds),
    seconds: displaySeconds,
    providerClock: formatProviderGameClock(providerSeconds),
    providerSeconds,
    period: period == null ? null : String(period),
    anchorKey,
    stale: Boolean(feedStale || capped),
    frozen: Boolean(frozenReason),
    frozenReason,
  };
}

export function reconcileProviderClockAnchor(previousGame, nextGame, {
  observedAt,
  providerFetchedAt,
  ageMs = null,
  feedStale = false,
  providerClockFrozen = false,
  playId = null,
  staleAfterMs = PROVIDER_CLOCK_STALE_AFTER_MS,
} = {}) {
  if (!nextGame?.live?.clock || nextGame.status !== 'live') return nextGame;

  const previousAnchor = previousGame?.live?.providerClockAnchor ?? null;
  const observedAtMs = asTimestamp(observedAt);
  // With the server's own sample age, the fetch moment is expressed in this
  // device's clock (receipt minus age), immune to device/server clock skew.
  const sampleAgeMs = Number(ageMs);
  const skewFreeFetchedAtMs = observedAtMs != null && ageMs != null && Number.isFinite(sampleAgeMs) && sampleAgeMs >= 0
    ? observedAtMs - sampleAgeMs
    : null;
  // `providerFetchedAt` stays in the provider's clock: other code compares it
  // with provider-side timestamps. Only the anchor moment uses the skew-free value.
  const providerFetchedAtMs = asTimestamp(providerFetchedAt);
  const effectiveProviderFetchedAtMs = providerFetchedAtMs != null && observedAtMs != null
    ? Math.min(providerFetchedAtMs, observedAtMs)
    : providerFetchedAtMs;
  const anchorAtMs = skewFreeFetchedAtMs
    ?? effectiveProviderFetchedAtMs
    ?? observedAtMs
    ?? asTimestamp(previousAnchor?.changedAt);
  if (anchorAtMs == null && !previousAnchor) return nextGame;

  const clockKey = `${nextGame.live.period ?? ''}|${nextGame.live.clock}`;
  const anchorKey = playId == null ? clockKey : `${clockKey}|${playId}`;
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
        verifiedAt: anchorAtMs,
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
        ...(skewFreeFetchedAtMs != null ? { sampleAgeMs } : null),
      },
    },
  };
}
