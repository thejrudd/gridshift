import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildGameProgressTimelines,
  buildPaceSeries,
  getStarterPace,
  getStarterReplayRemainingFraction,
} from '../../src/utils/livePace.js';
import { getPlayProgress, parseGlanceProgress } from '../../src/utils/livePlaysFeed.js';

const event = (id, side, progress, pts, kind = 'rush', extra = {}) => ({
  id, playerId: `p-${side}`, progress, pts, kind, desc: `${kind} play`, ...extra,
});

const sideKeyOf = (item) => (item.playerId.endsWith('a') ? 'a' : 'b');

describe('getStarterPace', () => {
  it('uses the canonical ahead-or-behind outlook for its live projection', () => {
    const pace = getStarterPace({
      current: 12,
      position: 'RB',
      projection: { projected: 16, min: 8, max: 24 },
      remainingFraction: 0.5,
      model: {
        mean: { paceCarryover: 0.5, carryoverClamp: 0.25 },
        variance: {
          remainingExponent: 1,
          positionScale: { RB: 1, FLEX: 1 },
          sourceScale: { projection: 1 },
        },
      },
    });

    assert.equal(pace.pace, 8);
    assert.equal(pace.vsPace, 4);
    assert.equal(pace.liveProjected, 21);
  });
});

describe('getPlayProgress', () => {
  it('reads a play position from period and clock', () => {
    assert.equal(getPlayProgress({ period: 1, clock: '15:00' }), 0);
    assert.equal(getPlayProgress({ period: 3, clock: '15:00' }), 0.5);
    assert.equal(getPlayProgress({ period: 4, clock: '0:00' }), 1);
  });

  it('clamps overtime to the end and gives up without a period', () => {
    assert.equal(getPlayProgress({ period: 5, clock: '10:00' }), 1);
    assert.equal(getPlayProgress({ period: null, clock: '10:00' }), null);
  });

  it('reads the same position back from a rendered glance clock', () => {
    assert.equal(parseGlanceProgress('Q3 15:00'), 0.5);
    assert.equal(parseGlanceProgress('nonsense'), null);
  });
});

describe('buildPaceSeries', () => {
  const events = [
    event('e1', 'a', 0.1, 6, 'td'),
    event('e2', 'b', 0.3, 3),
    event('e3', 'a', 0.45, 2),
    event('e4', 'b', 0.5, 6, 'td'),
  ];

  it('keeps historical estimates unscaled and lands only the live close on authoritative totals', () => {
    const { points } = buildPaceSeries({
      events, sideKeyOf, totals: { a: 16, b: 18 }, slateProgress: 0.6,
    });

    // Kickoff, one step per play, then the close at NOW.
    assert.equal(points.length, 6);
    assert.deepEqual([points[0].x, points[0].a, points[0].b], [0, 0, 0]);
    assert.ok(points.every((point, index) => index === 0 || point.x >= points[index - 1].x));

    const last = points[points.length - 1];
    assert.equal(last.x, 0.6);
    assert.equal(last.a, 16);
    assert.equal(last.b, 18);

    // A later authoritative total must not rewrite what the first play was
    // worth when it happened.
    assert.equal(points[1].a, 6);
    assert.equal(points[1].b, 0);
    assert.equal(points[4].a, 8);
    assert.equal(points[4].b, 9);
  });

  it('fits illustrative demo scoring to authoritative totals without a closing-point cliff', () => {
    const { points } = buildPaceSeries({
      events: [
        event('e1', 'a', 0.1, 120, 'td'),
        event('e2', 'b', 0.2, 140, 'td'),
        event('e3', 'a', 0.4, 180, 'td'),
        event('e4', 'b', 0.6, 210, 'td'),
      ],
      sideKeyOf,
      totals: { a: 160, b: 150 },
      slateProgress: 0.7,
      reconcileToTotals: true,
    });

    assert.ok(points.every((point) => point.a >= 0 && point.a <= 160));
    assert.ok(points.every((point) => point.b >= 0 && point.b <= 150));
    assert.deepEqual(
      [points.at(-2).a, points.at(-2).b],
      [points.at(-1).a, points.at(-1).b],
    );
    assert.deepEqual([points.at(-1).a, points.at(-1).b], [160, 150]);
  });

  it('marks every score change while emphasizing touchdowns and larger swings', () => {
    const { marks } = buildPaceSeries({
      events, sideKeyOf, totals: { a: 16, b: 18 }, slateProgress: 0.6,
    });
    assert.deepEqual(marks.map((mark) => mark.event.id), ['e1', 'e2', 'e3', 'e4']);
    assert.deepEqual(
      marks.filter((mark) => mark.emphasized).map((mark) => mark.event.id),
      ['e1', 'e4'],
    );
    // A mark sits on its own side's running total at that moment.
    assert.equal(marks[0].y, 6);
  });

  it('keeps a visible mark for a negative scoring event', () => {
    const { marks } = buildPaceSeries({
      events: [event('penalty', 'a', 0.2, -2, 'to')],
      sideKeyOf,
      totals: { a: -2, b: 0 },
      slateProgress: 0.3,
    });

    assert.equal(marks.length, 1);
    assert.equal(marks[0].event.pts, -2);
    assert.equal(marks[0].negative, true);
    assert.equal(marks[0].emphasized, false);
  });

  it('uses snapshots produced by the canonical probability model', () => {
    const { points } = buildPaceSeries({
      events,
      sideKeyOf,
      totals: { a: 30, b: 10 },
      slateProgress: 1,
      snapshotAt: (point) => ({ p: point.a === point.b ? 50 : 75, settled: false }),
      liveSnapshot: { p: 100, settled: true },
    });
    const last = points[points.length - 1];
    assert.equal(points[0].p, 50);
    assert.equal(last.p, 100);
    assert.equal(last.settled, true);
  });

  it('prefers a complete persisted snapshot from before the play and ignores future snapshots', () => {
    const completeSnapshot = (t, p, a) => ({
      t,
      p,
      a,
      b: 4,
      expectedA: a + 10,
      expectedB: 14,
      sigma: 8,
      explain: { a: { current: a }, b: { current: 4 } },
    });
    const { points } = buildPaceSeries({
      events: [event('e1', 'a', 0.25, 6, 'td', { timelineAt: 100 })],
      sideKeyOf,
      totals: { a: 20, b: 4 },
      slateProgress: 0.4,
      historicalSnapshots: [
        completeSnapshot(90, 61, 5),
        completeSnapshot(110, 99, 20),
      ],
      snapshotAt: () => ({ p: 45, a: 6, b: 0 }),
      liveSnapshot: { p: 80, settled: false },
    });

    assert.equal(points[1].p, 61);
    assert.equal(points[1].a, 5);
    assert.equal(points[1].b, 4);
    assert.equal(points.at(-1).p, 80);
    assert.equal(points.at(-1).a, 20);
  });

  it('passes only event-time player scoring into fallback snapshot reconstruction', () => {
    const seen = [];
    buildPaceSeries({
      events: [
        event('e1', 'a', 0.1, 6, 'td', { playerId: 'a-one', timelineAt: 100 }),
        event('e2', 'a', 0.2, 4, 'rush', { playerId: 'a-two', timelineAt: 200 }),
      ],
      sideKeyOf: () => 'a',
      totals: { a: 30, b: 0 },
      slateProgress: 0.3,
      snapshotAt: (point, context) => {
        if (point.eventId) seen.push(new Map(context.currentByPlayer));
        return {};
      },
    });

    assert.equal(seen[0].get('a-one'), 6);
    assert.equal(seen[0].has('a-two'), false);
    assert.equal(seen[1].get('a-one'), 6);
    assert.equal(seen[1].get('a-two'), 4);
  });

  it('returns nothing to draw when no play carries a game clock', () => {
    const result = buildPaceSeries({
      events: [event('e1', 'a', null, 6, 'td')], sideKeyOf, totals: { a: 6, b: 0 }, slateProgress: 0.5,
    });
    assert.deepEqual(result, { points: [], marks: [] });
  });
});

describe('starter replay progress', () => {
  it('uses the selected game exactly and reconstructs other games from their own timelines', () => {
    const timelines = buildGameProgressTimelines([
      { gameId: 'g2', timelineAt: 100, progress: 0.25 },
      { gameId: 'g2', timelineAt: 200, progress: 0.75 },
    ]);
    const moment = { at: 150, gameId: 'g1', gameProgress: 0.4 };

    assert.equal(
      getStarterReplayRemainingFraction({ gameId: 'g1', kickoffAt: 0 }, moment, timelines),
      0.6,
    );
    assert.equal(
      getStarterReplayRemainingFraction({ gameId: 'g2', kickoffAt: 50 }, moment, timelines),
      0.5,
    );
    assert.equal(
      getStarterReplayRemainingFraction({ gameId: 'g3', kickoffAt: 300 }, moment, timelines),
      1,
    );
    assert.equal(
      getStarterReplayRemainingFraction({ state: 'confirmedBye' }, moment, timelines),
      0,
    );
  });
});
