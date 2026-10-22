import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildReplayFrame,
  filterScoringPlays,
  getGameStateAt,
  getHoverCardMode,
  getSeriesPointAt,
} from '../../src/utils/matchupReplay.js';
import { buildSlateAxis } from '../../src/utils/matchupSlateAxis.js';

const series = [
  { x: 0, a: 0, b: 0, p: 60, expectedA: 120, expectedB: 110 },
  { x: 0.1, a: 6, b: 0, p: 66, expectedA: 124, expectedB: 110 },
  { x: 0.4, a: 6, b: 7.5, p: 58, expectedA: 124, expectedB: 113 },
  { x: 0.4, a: 6, b: 7.5, p: 57, expectedA: 123, expectedB: 113 }, // live close at NOW
];
const events = [
  { id: 'e1', progress: 0.1, pts: 6, playerId: '10', kind: 'td' },
  { id: 'e2', progress: 0.4, pts: 7.5, playerId: '20', contributors: [{ playerId: '20', pts: 4.5 }, { playerId: '21', pts: 3 }] },
];

describe('Matchups replay frame', () => {
  it('returns the live close when at is null', () => {
    assert.equal(getSeriesPointAt(series, null).p, 57);
    const frame = buildReplayFrame({ series, events, mineKey: 'a', at: null });
    assert.equal(frame.mine, 6);
    assert.equal(frame.opp, 7.5);
    assert.equal(frame.winMine, 57);
    assert.equal(frame.pointsByPlayer.get('21'), 3);
  });

  it('rewinds scores, win chance and player points to the moment after a play', () => {
    const frame = buildReplayFrame({ series, events, mineKey: 'a', at: 0.1 });
    assert.equal(frame.mine, 6);
    assert.equal(frame.opp, 0);
    assert.equal(frame.winMine, 66);
    assert.equal(frame.expectedMine, 124);
    assert.equal(frame.pointsByPlayer.get('10'), 6);
    assert.equal(frame.pointsByPlayer.has('20'), false);
  });

  it('orients everything to the viewer when they are side b', () => {
    const frame = buildReplayFrame({ series, events, mineKey: 'b', at: 0.1 });
    assert.equal(frame.mine, 0);
    assert.equal(frame.opp, 6);
    assert.equal(frame.winMine, 34);
    assert.equal(frame.expectedMine, 110);
  });

  it('player totals at a moment add up to the side totals there', () => {
    const frame = buildReplayFrame({ series, events, mineKey: 'a', at: 0.4 });
    const oppPlayers = (frame.pointsByPlayer.get('20') ?? 0) + (frame.pointsByPlayer.get('21') ?? 0);
    assert.equal(oppPlayers, frame.opp);
  });
});

describe('Matchups replay game state', () => {
  const axis = buildSlateAxis([
    { id: 'thu', date: '2025-11-21T01:15:00.000Z' },
    { id: 'sun', date: '2025-11-23T18:00:00.000Z' },
  ]);
  const sun = axis.windowByGameId.get('sun');

  it('is pre before the window, live inside it, final at its end', () => {
    assert.equal(getGameStateAt({ axis, gameId: 'sun', at: sun.p0 - 0.01, liveState: 'final' }).state, 'pre');
    const mid = getGameStateAt({ axis, gameId: 'sun', at: (sun.p0 + sun.p1) / 2, liveState: 'final' });
    assert.equal(mid.state, 'live');
    assert.ok(Math.abs(mid.progress - 0.5) < 1e-9);
    assert.equal(getGameStateAt({ axis, gameId: 'sun', at: sun.p1, liveState: 'final' }).state, 'final');
  });

  it('uses the live state when not replaying', () => {
    assert.deepEqual(getGameStateAt({ axis, gameId: 'sun', at: null, liveState: 'live', liveProgress: 0.3 }), { state: 'live', progress: 0.3 });
  });
});

describe('Matchups scoring plays filter', () => {
  const sideOf = (event) => (event.playerId === '10' ? 'mine' : 'opp');
  const plays = [
    { playerId: '10', pts: 1.2 },
    { playerId: '10', pts: 6, kind: 'td' },
    { playerId: '20', pts: -2 },
    { playerId: '20', pts: 2.1 },
  ];

  it('filters by side', () => {
    assert.equal(filterScoringPlays(plays, { side: 'mine', sideOf }).length, 2);
    assert.equal(filterScoringPlays(plays, { side: 'opp', sideOf }).length, 2);
    assert.equal(filterScoringPlays(plays, { side: 'all', sideOf }).length, 4);
  });

  it('big plays are touchdowns, swings at the league threshold, and negatives', () => {
    const big = filterScoringPlays(plays, { bigOnly: true, bigPlayThreshold: 4, sideOf });
    assert.deepEqual(big.map((play) => play.pts), [6, -2]);
  });
});

describe('Matchups hover card mode', () => {
  it('maps game state to season, live and final views', () => {
    assert.equal(getHoverCardMode('pre'), 'season');
    assert.equal(getHoverCardMode('scheduled'), 'season');
    assert.equal(getHoverCardMode('live'), 'live');
    assert.equal(getHoverCardMode('final'), 'final');
  });
});
