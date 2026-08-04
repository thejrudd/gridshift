import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDemoTimeline,
  formatDemoTimelinePoint,
  mapGameProgressToDemoTimeline,
} from '../../src/utils/liveDemoTimeline.js';

const thanksgivingWeek = [
  { id: 'thu-early', date: '2025-11-27T17:30:00.000Z' },
  { id: 'thu-late', date: '2025-11-27T21:30:00.000Z' },
  { id: 'fri', date: '2025-11-28T20:00:00.000Z' },
  { id: 'sun-early', date: '2025-11-30T18:00:00.000Z' },
  { id: 'sun-late', date: '2025-11-30T21:25:00.000Z' },
  { id: 'mon', date: '2025-12-02T01:15:00.000Z' },
];

describe('Fantasy Live demo timeline', () => {
  it('uses the actual NFL game days, including holiday Friday games', () => {
    const timeline = buildDemoTimeline(thanksgivingWeek);
    assert.deepEqual(timeline.ticks.map((tick) => tick.label), ['Thu', 'Fri', 'Sun', 'Mon']);
  });

  it('adapts to Christmas weeks with Wednesday and Saturday games', () => {
    const timeline = buildDemoTimeline([
      { id: 'wed', date: '2025-12-25T01:15:00.000Z' },
      { id: 'thu', date: '2025-12-25T18:00:00.000Z' },
      { id: 'sat', date: '2025-12-28T01:15:00.000Z' },
      { id: 'sun', date: '2025-12-28T18:00:00.000Z' },
    ]);
    assert.deepEqual(timeline.ticks.map((tick) => tick.label), ['Wed', 'Thu', 'Sat', 'Sun']);
  });

  it('removes inactive days and gives every game equal, contiguous space', () => {
    const { gameWindows } = buildDemoTimeline(thanksgivingWeek);
    const windows = thanksgivingWeek.map((game) => gameWindows.get(game.id));

    assert.equal(windows[0].start, 0);
    assert.equal(windows.at(-1).end, 1);
    windows.slice(1).forEach((window, index) => {
      assert.equal(window.start, windows[index].end);
      assert.ok(Math.abs(
        (window.end - window.start) - (windows[0].end - windows[0].start),
      ) < Number.EPSILON);
    });
  });

  it('preserves play order inside each game segment', () => {
    const { gameWindows } = buildDemoTimeline(thanksgivingWeek);
    const window = gameWindows.get('sun-late');
    assert.equal(mapGameProgressToDemoTimeline(0, window), window.start);
    assert.equal(mapGameProgressToDemoTimeline(1, window), window.end);
    assert.equal(
      mapGameProgressToDemoTimeline(0.5, window),
      window.start + ((window.end - window.start) / 2),
    );
  });

  it('describes a scrub position by scheduled day and in-game clock', () => {
    const timeline = buildDemoTimeline(thanksgivingWeek);
    const window = timeline.gameWindows.get('fri');
    const midpoint = mapGameProgressToDemoTimeline(0.5, window);
    assert.equal(formatDemoTimelinePoint(midpoint, timeline), 'Fri · Q3 15:00');
  });
});
