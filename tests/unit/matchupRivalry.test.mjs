import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMatchupRivalry } from '../../src/utils/matchupRivalry.js';

const game = (id, season, week, a, b) => ({ id, season, week, margin: Math.abs(a - b), tied: a === b, winnerId: a === b ? null : a > b ? 'a' : 'b', left: { identity: { id: 'a' }, points: a }, right: { identity: { id: 'b' }, points: b } });

const playerGame = (id, left, right) => ({
  id, season: '2025', week: 3, margin: Math.abs(left.points - right.points), tied: false, winnerId: 'a',
  left: { identity: { id: 'a' }, rosterId: 11, ...left },
  right: { identity: { id: 'b' }, rosterId: 22, ...right },
});

test('orients meetings and highlights for reversed manager IDs', () => {
  const model = { rivalries: [{ id: 'a:b', games: 3, ties: 1, winsByParticipantId: { a: 1, b: 1 }, meetings: [game('old', '2024', 2, 100, 90), game('tie', '2025', 1, 80, 80), game('new', '2025', 2, 70, 120)] }] };
  const result = buildMatchupRivalry(model, 'b', 'a');
  assert.deepEqual(result.meetings.map((m) => [m.id, m.leftPoints, m.rightPoints, m.winner]), [['new', 120, 70, 'left'], ['tie', 80, 80, null], ['old', 90, 100, 'right']]);
  assert.equal(result.closestMeeting.id, 'tie');
  assert.equal(result.biggestWin.id, 'new');
  assert.equal(result.highestScore.side, 'left');
  assert.equal(result.highestScore.points, 120);
});

test('returns null for absent, empty, or same manager history', () => {
  assert.equal(buildMatchupRivalry(null, 'a', 'b'), null);
  assert.equal(buildMatchupRivalry({ rivalries: [{ id: 'a:b', meetings: [] }] }, 'a', 'b'), null);
  assert.equal(buildMatchupRivalry({ rivalries: [] }, 'a', 'a'), null);
});

test('derives clickable starter highlights with roster IDs, ties, and zero or negative scores', () => {
  const model = {
    rivalries: [{ id: 'a:b', meetings: [playerGame('highlight', {
      starters: ['p1', 'p2', 'p3', '0'], playerPoints: { p1: 0, p2: -4, p3: 0 },
    }, {
      starters: ['p4', 'p5'], playerPoints: { p4: 9, p5: 9 },
    })] }],
  };
  const players = {
    p1: { full_name: 'One Player', team: 'OLD' },
    p2: { first_name: 'Two', last_name: 'Player' },
    p3: { full_name: 'Three Player' },
    p4: { full_name: 'Four Player' },
    p5: { full_name: 'Five Player' },
  };
  const result = buildMatchupRivalry(model, 'b', 'a', players);
  const meeting = result.meetings[0];
  assert.equal(meeting.leftRosterId, 22);
  assert.equal(meeting.rightRosterId, 11);
  assert.deepEqual(meeting.leftPerformers.highest.map(({ id, points }) => ({ id, points })), [{ id: 'p4', points: 9 }, { id: 'p5', points: 9 }]);
  assert.deepEqual(meeting.leftPerformers.lowest.map(({ id, points }) => ({ id, points })), [{ id: 'p4', points: 9 }, { id: 'p5', points: 9 }]);
  assert.deepEqual(meeting.rightPerformers.highest.map(({ id, points }) => ({ id, points })), [{ id: 'p1', points: 0 }, { id: 'p3', points: 0 }]);
  assert.deepEqual(meeting.rightPerformers.lowest.map(({ id, points }) => ({ id, points })), [{ id: 'p2', points: -4 }]);
  assert.equal(meeting.rightPerformers.highest[0].name, 'One Player');
  assert.equal(meeting.rightPerformers.highest[0].player, players.p1);
});

test('marks a side unavailable and suppresses highlights when a nonempty starter score is missing', () => {
  const model = {
    rivalries: [{ id: 'a:b', meetings: [playerGame('missing', {
      starters: ['p1', 'p2'], playerPoints: { p1: 4 },
    }, {
      starters: ['p3'], playerPoints: { p3: 0 },
    })] }],
  };
  const meeting = buildMatchupRivalry(model, 'a', 'b').meetings[0];
  assert.deepEqual(meeting.leftPerformers, { highest: [], lowest: [], available: false });
  assert.deepEqual(meeting.rightPerformers.highest.map((entry) => entry.id), ['p3']);
  assert.equal(meeting.rightPerformers.available, true);
});

test('excludes bench players from starter highlights', () => {
  const model = {
    rivalries: [{ id: 'a:b', meetings: [playerGame('bench', {
      starters: ['starter'], playerPoints: { starter: 1, bench: 999 },
    }, {
      starters: ['opponent'], playerPoints: { opponent: 2, reserve: -99 },
    })] }],
  };
  const meeting = buildMatchupRivalry(model, 'a', 'b').meetings[0];
  assert.deepEqual(meeting.leftPerformers.highest.map((entry) => entry.id), ['starter']);
  assert.deepEqual(meeting.rightPerformers.lowest.map((entry) => entry.id), ['opponent']);
});

test('raw missing scores remain unavailable even when legacy normalized points contain zero', () => {
  const meeting = game('missing-raw', '2025', 1, 10, 20);
  meeting.left.starters = ['p1', 'p2'];
  meeting.left.playerPoints = { p1: 10, p2: 0 };
  meeting.left.recordedPlayerPoints = { p1: 10, p2: null };
  const model = { rivalries: [{ id: 'a:b', games: 1, ties: 0, winsByParticipantId: { b: 1 }, meetings: [meeting] }] };
  assert.equal(buildMatchupRivalry(model, 'a', 'b').meetings[0].leftPerformers.available, false);
});
