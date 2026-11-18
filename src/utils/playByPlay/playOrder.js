// playOrder.js — the one chronological order for a game's plays.
//
// Game clock first (period + time left), then wallclock, then the order the
// plays arrived in. The game clock is the only key every row carries on the
// same scale; wallclock is missing on some rows, and comparing a wallclock
// epoch against a period/clock number (Fantasy Live's old key) sorted every
// row without a wallclock ahead of every row with one.
//
// Works on provider rows (`clock_display`), Fantasy Live feed plays (`clock`),
// and Statistics Scores plays (`time`). Returns a new array; the input order
// is the final tie-break.

import { getElapsedSeconds, readPlayClock } from './gameClock.js';

function readWallclock(play) {
  const value = play?.wallclock;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : null;
}

/** Seconds since kickoff for ordering; null when the play has no readable period and clock. */
export function getPlayOrderSeconds(play) {
  return getElapsedSeconds(play?.period, readPlayClock(play));
}

export function comparePlaysChronologically(left, right) {
  if (left.seconds != null && right.seconds != null && left.seconds !== right.seconds) {
    return left.seconds - right.seconds;
  }
  if (left.wallclock != null && right.wallclock != null && left.wallclock !== right.wallclock) {
    return left.wallclock - right.wallclock;
  }
  return left.index - right.index;
}

/** Oldest first. */
export function sortPlaysChronologically(plays = []) {
  return (plays ?? [])
    .map((play, index) => ({ play, index, seconds: getPlayOrderSeconds(play), wallclock: readWallclock(play) }))
    .sort(comparePlaysChronologically)
    .map(({ play }) => play);
}
