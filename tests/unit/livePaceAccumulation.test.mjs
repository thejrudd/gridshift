import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPaceSeries } from '../../src/utils/livePace.js';

// Positions are in order; timestamps deliberately are not. A replay
// reconstructs the clock, so the two can disagree — the chart must not care.
const scrambled = [
  { id: 'e1', pts: 10, progress: 0.1, at: 900 },
  { id: 'e2', pts: 10, progress: 0.2, at: 100 },
  { id: 'e3', pts: 10, progress: 0.3, at: 700 },
  { id: 'e4', pts: 10, progress: 0.4, at: 200 },
];

const build = (events, options) => buildPaceSeries({
  events,
  sideKeyOf: () => 'a',
  totals: { a: 40, b: 0 },
  slateProgress: 0.5,
  ...options,
});

test('accumulating in order rises monotonically however the clock is scrambled', () => {
  const { points } = build(scrambled, { accumulateInOrder: true });
  const values = points.map((point) => point.a);
  values.forEach((value, index) => {
    if (index > 0) assert.ok(value >= values[index - 1], `total fell at ${index}: ${values}`);
  });
});

test('the last plotted point holds every event, so the close is not a jump', () => {
  const { points } = build(scrambled, { accumulateInOrder: true });
  // The closing point is the authoritative total; the event before it must
  // already be there, or the line draws a wall straight up at NOW.
  const beforeClose = points[points.length - 2];
  assert.equal(beforeClose.a, 40);
});

test('ordering by timestamp is what produced the wall', () => {
  // The same events accumulated by clock: an early position holds a late
  // timestamp's total, and the point before the close is nowhere near it.
  const { points } = build(scrambled, { accumulateInOrder: false });
  const beforeClose = points[points.length - 2];
  assert.notEqual(beforeClose.a, 40);
});

test('events in agreement give the same answer either way', () => {
  const ordered = scrambled.map((event, index) => ({ ...event, at: index * 100 }));
  const byOrder = build(ordered, { accumulateInOrder: true }).points.map((p) => p.a);
  const byClock = build(ordered, { accumulateInOrder: false }).points.map((p) => p.a);
  assert.deepEqual(byOrder, byClock);
});

test('the default is unchanged, so live scoring keeps its clock ordering', () => {
  const withDefault = build(scrambled, {}).points.map((point) => point.a);
  const byClock = build(scrambled, { accumulateInOrder: false }).points.map((point) => point.a);
  assert.deepEqual(withDefault, byClock);
});

// ── Spreading a batch across the interval it covers ──────────────────────
// The wall this chart kept drawing was not an accumulation problem at all:
// every event in a batch was landing on the same x, stacking into a vertical
// line at NOW. Positions collapse when the interval has no width.
import { spreadEventsAcrossInterval } from '../../src/dev/liveSandbox/liveSandboxReplay.js';

test('a batch spread across a real interval gets distinct positions', () => {
  const batch = Array.from({ length: 8 }, (_, i) => ({ id: i }));
  const spread = spreadEventsAcrossInterval(batch, 0.3, 0.55);
  const distinct = new Set(spread.map((event) => event.slateProgress));
  assert.equal(distinct.size, 8, 'events shared a position');
});

test('a zero-width interval is what stacks them', () => {
  // Reproduces the failure: the baseline had already been moved to the current
  // position, so the batch had nowhere to spread.
  const batch = Array.from({ length: 8 }, (_, i) => ({ id: i }));
  const spread = spreadEventsAcrossInterval(batch, 0.55, 0.55);
  const distinct = new Set(spread.map((event) => event.slateProgress));
  assert.equal(distinct.size, 1);
  assert.equal(spread[0].slateProgress, 0.55);
});
