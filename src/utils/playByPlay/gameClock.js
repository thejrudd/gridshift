// gameClock.js — the one owner of NFL game-clock arithmetic for play-by-play
// and live games: read a "M:SS" clock, turn period + clock into seconds since
// kickoff, and into 0..1 progress through regulation.
//
// Callers disagree on three choices, so each is an explicit argument rather
// than a shared guess:
//   - `strict`: a whole-string "M:SS" with seconds <= 59 (provider fields), or
//     the first "M:SS" anywhere in the text (a rendered "Q3 7:12" glance).
//   - `missingClockSecondsLeft`: what a period with no readable clock means —
//     null (unknown, the default), 450 (mid-quarter, Fantasy Live's pace axis),
//     or 0 (end of the period, the season dashboards).
//   - `overtimePeriodSeconds`: 900 (an overtime period measured like a quarter,
//     the default) or 600 (the regular-season ten-minute period).
// `getGameProgress` also takes `overtime`: 'clamp' caps progress at 1.
//
// See docs/Play-By-Play Normalization.md ("Game clock and ordering").

export const QUARTER_SECONDS = 15 * 60;
export const REGULATION_SECONDS = 4 * QUARTER_SECONDS;

const STRICT_CLOCK = /^(\d{1,2}):(\d{2})$/;
const LOOSE_CLOCK = /(\d{1,2}):(\d{2})/;

/** Seconds left on a "M:SS" clock, or null when it cannot be read. */
export function parseClockSeconds(value, { strict = true } = {}) {
  const text = String(value ?? '').trim();
  const match = (strict ? STRICT_CLOCK : LOOSE_CLOCK).exec(text);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (strict && seconds > 59) return null;
  return (minutes * 60) + seconds;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Seconds of game time elapsed at `period` with `clock` left (a "M:SS" string,
 * or seconds left as a number). Null for an unreadable period, or for an
 * unreadable clock when `missingClockSecondsLeft` is null.
 */
export function getElapsedSeconds(period, clock, {
  strict = true,
  missingClockSecondsLeft = null,
  overtimePeriodSeconds = QUARTER_SECONDS,
  clampClock = true,
} = {}) {
  const periodNumber = Number(period);
  if (period == null || period === '' || !Number.isInteger(periodNumber) || periodNumber < 1) return null;
  const parsed = typeof clock === 'number' && Number.isFinite(clock) ? clock : parseClockSeconds(clock, { strict });
  const secondsLeft = parsed ?? missingClockSecondsLeft;
  if (secondsLeft == null) return null;
  const overtime = periodNumber > 4 && overtimePeriodSeconds !== QUARTER_SECONDS;
  const length = overtime ? overtimePeriodSeconds : QUARTER_SECONDS;
  const left = clampClock ? clamp(secondsLeft, 0, length) : secondsLeft;
  if (overtime) return REGULATION_SECONDS + ((periodNumber - 5) * length) + (length - left);
  return ((periodNumber - 1) * QUARTER_SECONDS) + (QUARTER_SECONDS - left);
}

/**
 * How far through regulation, 0..1 (`overtime: 'clamp'`), or past 1 into
 * overtime (`overtime: 'extend'`). Null when `getElapsedSeconds` is.
 */
export function getGameProgress(period, clock, { overtime = 'clamp', ...options } = {}) {
  const elapsed = getElapsedSeconds(period, clock, options);
  if (elapsed == null) return null;
  const progress = Math.max(0, elapsed / REGULATION_SECONDS);
  return overtime === 'clamp' ? Math.min(1, progress) : progress;
}

/** A play's own clock field, across the provider row and both adapters. */
export function readPlayClock(play) {
  return play?.clock_display ?? play?.clock ?? play?.time ?? null;
}
