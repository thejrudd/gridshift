import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyObservedPointFallback,
  buildObservedPlayerPoints,
  buildPaceSeries,
  preservePaceSeriesScores,
} from '../../src/utils/livePace.js';
import { resolveCurrentPlayerPoints } from '../../src/utils/liveScoringFeed.js';

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

test('production score paths follow game progress while probability keeps timestamp context', () => {
  const { points } = build(scrambled, {
    snapshotAt: () => ({ a: 99, b: 88, p: 61 }),
    scoreAxisIsAuthoritative: true,
  });

  assert.deepEqual(points.slice(1, -1).map((point) => point.a), [10, 20, 30, 40]);
  assert.deepEqual(points.slice(1, -1).map((point) => point.p), [61, 61, 61, 61]);
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

test('unmatched replay fixture points cannot create a vertical close at NOW', () => {
  const events = [
    { id: 'a1', playerId: 'mapped-a', pts: 3.4, progress: 0.03, at: 100 },
    { id: 'b1', playerId: 'mapped-b', pts: 2.1, progress: 0.05, at: 200 },
  ];
  const totals = {
    a: resolveCurrentPlayerPoints({ hasMappedStats: true, livePoints: 3.4, suppressFallback: true })
      + resolveCurrentPlayerPoints({ sleeperPoints: 241.44, suppressFallback: true }),
    b: resolveCurrentPlayerPoints({ hasMappedStats: true, livePoints: 2.1, suppressFallback: true })
      + resolveCurrentPlayerPoints({ sleeperPoints: 187.46, suppressFallback: true }),
  };
  const { points } = buildPaceSeries({
    events,
    sideKeyOf: (event) => event.playerId.endsWith('-a') ? 'a' : 'b',
    totals,
    slateProgress: 0.05,
    accumulateInOrder: true,
  });
  const beforeClose = points.at(-2);
  const close = points.at(-1);

  assert.deepEqual(totals, { a: 3.4, b: 2.1 });
  assert.equal(beforeClose.x, close.x);
  assert.equal(beforeClose.a, close.a);
  assert.equal(beforeClose.b, close.b);
});

test('a grouped play moves the side once while preserving each starter contribution', () => {
  let playerTotals = null;
  const result = buildPaceSeries({
    events: [{
      id: 'shared-pass-td',
      playerId: 'qb',
      pts: 16.5,
      progress: 0.4,
      at: 400,
      contributors: [
        { playerId: 'qb', pts: 5.6 },
        { playerId: 'wr', pts: 10.9 },
      ],
    }],
    sideKeyOf: () => 'a',
    totals: { a: 16.5, b: 0 },
    slateProgress: 0.4,
    snapshotAt: (_point, context) => {
      if (context?.event) playerTotals = context.currentByPlayer;
      return {};
    },
    accumulateInOrder: true,
  });

  assert.equal(result.marks.length, 1);
  assert.equal(result.marks[0].y, 16.5);
  assert.equal(playerTotals.get('qb'), 5.6);
  assert.equal(playerTotals.get('wr'), 10.9);
});

test('hidden replay reconciliation adjusts the curve without creating a selectable play', () => {
  const result = buildPaceSeries({
    events: [
      { id: 'provider-play', playerId: 'wr', pts: 2.1, progress: 0.4, at: 400 },
      {
        id: 'reconciliation',
        playerId: 'wr',
        pts: -2,
        progress: 0.4,
        at: 400,
        hiddenFromFeed: true,
        hiddenFromMilestones: true,
      },
    ],
    sideKeyOf: () => 'a',
    totals: { a: 0.1, b: 0 },
    slateProgress: 0.4,
    accumulateInOrder: true,
  });

  assert.equal(result.points.at(-2).a, 0.1);
  assert.deepEqual(result.marks.map((mark) => mark.event.id), ['provider-play']);
});

test('observed grouped plays retain each contributor share without duplicating the side swing', () => {
  const observed = buildObservedPlayerPoints([{
    playerId: 'qb',
    pts: 16.5,
    contributors: [
      { playerId: 'qb', pts: 5.6 },
      { playerId: 'wr', pts: 10.9 },
    ],
  }]);

  assert.deepEqual(Object.fromEntries(observed), { qb: 5.6, wr: 10.9 });
});

test('preseason observed points fill unmatched starters while mapped box stats remain authoritative', () => {
  const sides = [{
    key: 'a',
    pace: { total: 0, liveProjected: 20, vsPace: -10 },
    entries: [
      { id: 'unmatched', row: { mappedStats: null }, pace: { points: 0, pace: 6, liveProjected: 10, vsPace: -6 } },
      { id: 'mapped', row: { mappedStats: { pass_yd: 0 } }, pace: { points: 0, pace: 4, liveProjected: 10, vsPace: -4 } },
    ],
  }];
  const result = applyObservedPointFallback(
    sides,
    new Map([['unmatched', 7.2], ['mapped', 8.4]]),
    true,
  );

  assert.equal(result[0].entries[0].pace.points, 7.2);
  assert.equal(result[0].entries[1].pace.points, 0);
  assert.equal(result[0].pace.total, 7.2);
  assert.equal(result[0].pace.liveProjected, 27.2);
  assert.equal(result[0].pace.vsPace, -2.8);
});

test('axis accumulation preserves a genuine negative fantasy event', () => {
  const result = buildPaceSeries({
    events: [
      { id: 'gain', playerId: 'qb', pts: 4, progress: 0.2, at: 900 },
      { id: 'turnover', playerId: 'qb', pts: -2, progress: 0.3, at: 100 },
      { id: 'recovery', playerId: 'qb', pts: 3, progress: 0.4, at: 700 },
    ],
    sideKeyOf: () => 'a',
    totals: { a: 5, b: 0 },
    slateProgress: 0.4,
    accumulateInOrder: true,
  });

  assert.deepEqual(result.points.slice(1, -1).map((point) => point.a), [4, 2, 5]);
});

test('an event-authoritative chart keeps probability metadata without snapshot score rewrites', () => {
  const snapshotAt = preservePaceSeriesScores(
    () => ({ a: 99, b: 88, p: 64, expectedA: 23, expectedB: 19 }),
    true,
  );
  const result = buildPaceSeries({
    events: [{ id: 'score', playerId: 'qb', pts: 4, progress: 0.2, at: 900 }],
    sideKeyOf: () => 'a',
    totals: { a: 4, b: 0 },
    slateProgress: 0.2,
    snapshotAt,
    accumulateInOrder: true,
  });

  assert.equal(result.points[1].a, 4);
  assert.equal(result.points[1].b, 0);
  assert.equal(result.points[1].p, 64);
  assert.equal(result.points[1].expectedA, 23);
});

test('observed preseason fallback supplies the chart close without a zero-point cliff', () => {
  const events = [{ id: 'score', playerId: 'qb', pts: 4.2, progress: 0.35, at: 300 }];
  const observed = buildObservedPlayerPoints(events);
  const [side] = applyObservedPointFallback([{
    key: 'a',
    pace: { total: 0, liveProjected: 10, vsPace: -5 },
    entries: [{
      id: 'qb',
      row: { mappedStats: null },
      pace: { points: 0, pace: 5, projected: 10, liveProjected: 10, vsPace: -5 },
    }],
  }], observed, true);
  const result = buildPaceSeries({
    events,
    sideKeyOf: () => 'a',
    totals: { a: side.pace.total, b: 0 },
    slateProgress: 0.35,
    accumulateInOrder: true,
  });

  assert.equal(result.points.at(-2).a, 4.2);
  assert.equal(result.points.at(-1).a, 4.2);
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
