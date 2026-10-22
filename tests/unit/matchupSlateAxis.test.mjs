import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSlateAxis, MIN_WINDOW_WEIGHT } from '../../src/utils/matchupSlateAxis.js';

const at = (iso) => ({ date: iso });
const regularWeek = [
  { id: 'thu', ...at('2025-11-21T01:15:00.000Z') }, // Thu 8:15p ET
  ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((suffix) => ({ id: `early-${suffix}`, ...at('2025-11-23T18:00:00.000Z') })),
  { id: 'late-1', ...at('2025-11-23T21:05:00.000Z') },
  { id: 'late-2', ...at('2025-11-23T21:05:00.000Z') },
  { id: 'late-3', ...at('2025-11-23T21:25:00.000Z') }, // 4:25 joins the 4:05 window
  { id: 'snf', ...at('2025-11-24T01:20:00.000Z') },
  { id: 'mnf', ...at('2025-11-25T01:15:00.000Z') },
];

describe('Matchups slate axis', () => {
  it('groups games that kick off together into one window, in kickoff order', () => {
    const axis = buildSlateAxis(regularWeek);
    assert.deepEqual(axis.windows.map((window) => window.gameIds.length), [1, 7, 3, 1, 1]);
    assert.deepEqual(axis.windows.map((window) => window.label), ['Thu', 'Sun 1p', 'Sun 4:05p', 'Sun 8:20p', 'Mon']);
  });

  it('gives single-game windows a floor, so Thursday and Monday get less room than Sunday', () => {
    const axis = buildSlateAxis(regularWeek);
    const [thu, early, , , mon] = axis.windows;
    assert.equal(thu.weight, MIN_WINDOW_WEIGHT);
    assert.equal(mon.weight, MIN_WINDOW_WEIGHT);
    assert.ok(early.p1 - early.p0 > 4 * (thu.p1 - thu.p0));
    assert.equal(axis.windows[0].p0, 0);
    assert.equal(axis.windows.at(-1).p1, 1);
  });

  it('handles Thanksgiving: three Thursday windows plus Black Friday', () => {
    const axis = buildSlateAxis([
      { id: 'thu-1', ...at('2025-11-27T17:30:00.000Z') },
      { id: 'thu-2', ...at('2025-11-27T21:30:00.000Z') },
      { id: 'thu-3', ...at('2025-11-28T01:20:00.000Z') },
      { id: 'fri', ...at('2025-11-28T20:00:00.000Z') },
      { id: 'sun', ...at('2025-11-30T18:00:00.000Z') },
    ]);
    assert.deepEqual(axis.windows.map((window) => window.label), ['Thu 12:30p', 'Thu 4:30p', 'Thu 8:20p', 'Fri', 'Sun']);
  });

  it('labels a Saturday slate by time when Saturday has several windows', () => {
    const axis = buildSlateAxis([
      { id: 'sat-1', ...at('2025-12-20T18:00:00.000Z') },
      { id: 'sat-2', ...at('2025-12-20T21:30:00.000Z') },
      { id: 'sun', ...at('2025-12-21T18:00:00.000Z') },
    ]);
    assert.deepEqual(axis.windows.map((window) => window.label), ['Sat 1p', 'Sat 4:30p', 'Sun']);
  });

  it('places a play inside its window by game progress and finds the window back', () => {
    const axis = buildSlateAxis(regularWeek);
    const early = axis.windowByGameId.get('early-c');
    assert.equal(axis.gamePosition('early-c', 0), early.p0);
    assert.equal(axis.gamePosition('early-c', 1), early.p1);
    const mid = axis.gamePosition('early-c', 0.5);
    assert.ok(mid > early.p0 && mid < early.p1);
    assert.equal(axis.windowAt(mid), early);
    assert.equal(axis.gamePosition('early-c', 3), early.p1);
    assert.equal(axis.gamePosition('missing', 0.5), null);
    assert.equal(axis.gamePosition('early-c', null), null);
  });

  it('returns an empty axis when no game has a kickoff', () => {
    const axis = buildSlateAxis([{ id: 'x' }]);
    assert.equal(axis.isEmpty, true);
    assert.equal(axis.windowAt(0.5), null);
  });
});
