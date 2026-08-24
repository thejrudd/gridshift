import test from 'node:test';
import assert from 'node:assert/strict';

import {
  completeReplay,
  getClockState,
  resetClock,
  setProgress,
  setSpeed,
  subscribeToRewind,
  REPLAY_SPEEDS,
} from '../../src/dev/liveSandbox/liveSandboxClock.js';

function collectRewinds(run) {
  const seen = [];
  const unsubscribe = subscribeToRewind(() => seen.push(getClockState().progress));
  try {
    run();
  } finally {
    unsubscribe();
  }
  return seen;
}

test('moving forward does not signal a rewind', () => {
  resetClock();
  const seen = collectRewinds(() => {
    setProgress(0.2);
    setProgress(0.6);
  });
  assert.deepEqual(seen, []);
  assert.equal(getClockState().progress, 0.6);
});

test('moving backward signals a rewind at the new position', () => {
  resetClock();
  setProgress(0.6);
  const seen = collectRewinds(() => setProgress(0.15));
  // Consumers read the clock when signalled, so the new position must already
  // be in place by the time the rewind fires.
  assert.deepEqual(seen, [0.15]);
});

test('resetting signals a rewind back to the start', () => {
  setProgress(0.8);
  const seen = collectRewinds(() => resetClock());
  assert.deepEqual(seen, [0]);
});

test('re-setting the same position signals nothing', () => {
  resetClock();
  setProgress(0.4);
  const seen = collectRewinds(() => setProgress(0.4));
  assert.deepEqual(seen, []);
});

test('progress is clamped to the 0..1 range', () => {
  resetClock();
  setProgress(5);
  assert.equal(getClockState().progress, 1);
  setProgress(-3);
  assert.equal(getClockState().progress, 0);
});

test('unsubscribing stops rewind notifications', () => {
  resetClock();
  setProgress(0.5);
  let count = 0;
  const unsubscribe = subscribeToRewind(() => { count += 1; });
  unsubscribe();
  setProgress(0.1);
  assert.equal(count, 0);
});

test('speed selection updates the replay window', () => {
  const fast = REPLAY_SPEEDS.find((entry) => entry.id === 'fast');
  setSpeed('fast');
  assert.equal(getClockState().speedId, 'fast');
  assert.equal(getClockState().windowMs, fast.windowMs);
  // An unknown id must be ignored rather than clearing the current speed.
  setSpeed('nonsense');
  assert.equal(getClockState().speedId, 'fast');
});

test('completing the replay jumps directly to the full week without signalling a rewind', () => {
  resetClock();
  setProgress(0.4);
  const seen = collectRewinds(completeReplay);

  assert.equal(getClockState().progress, 1);
  assert.equal(getClockState().playing, false);
  assert.deepEqual(seen, []);
});
