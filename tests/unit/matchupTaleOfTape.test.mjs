import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTaleOfTapePlayer,
  findTaleOfTapeRivalry,
  isFullGameWeekComplete,
} from '../../src/utils/matchupTaleOfTape.js';

const scoring = { rec: 1, rec_yd: 0.1, rec_td: 6 };

test('tale of tape builds fantasy-facing season and recent-form metrics', () => {
  const result = buildTaleOfTapePlayer({
    beforeWeek: 5,
    scoringSettings: scoring,
    seasonStats: { p1: { rec: 12, rec_yd: 150, rec_td: 2, gp: 4 } },
    player: {
      id: 'p1',
      name: 'Player One',
      position: 'WR',
      team: 'AAA',
      avgPPG: 14.5,
      rank: { posLabel: 'WR', rank: 3 },
      weekly: [
        { week: 1, rec: 3, rec_yd: 30, rec_td: 0 },
        { week: 2, rec: 4, rec_yd: 50, rec_td: 1 },
        { week: 3, rec: 2, rec_yd: 20, rec_td: 0 },
        { week: 4, rec: 3, rec_yd: 50, rec_td: 1 },
      ],
      projection: { projected: 16, min: 10, max: 22 },
      gameStarted: false,
    },
  });

  assert.equal(result.seasonPoints, 39);
  assert.equal(result.seasonAverage, 14.5);
  assert.equal(result.recentAverage, 9.8);
  assert.equal(result.seasonRank, 'WR3');
  assert.equal(result.gamesPlayed, 4);
  assert.equal(result.forecast, 16);
  assert.equal(result.forecastSource, 'projection');
  assert.deepEqual(result.weeklyScores.map((row) => row.week), [4, 3, 2, 1]);
});

test('tale of tape keeps fallback forecast provenance explicit', () => {
  const result = buildTaleOfTapePlayer({
    beforeWeek: 1,
    player: {
      id: 'p2', name: 'Player Two', position: 'TE', team: 'BBB', avgPPG: 8,
      projection: null, weekly: [], gameStarted: false,
    },
  });

  assert.equal(result.forecast, 8);
  assert.equal(result.forecastSource, 'seasonAvg');
});

test('tale of tape keeps unavailable early-season stats null instead of rendering zeroes', () => {
  const result = buildTaleOfTapePlayer({
    beforeWeek: 1,
    seasonStats: { p3: { rec: null, rec_yd: null, rec_td: null, gp: null } },
    player: {
      id: 'p3', name: 'Player Three', position: 'WR', team: 'CCC', avgPPG: null,
      projection: { projected: 11 }, weekly: [], gameStarted: false,
    },
  });

  assert.equal(result.seasonPoints, null);
  assert.equal(result.seasonAverage, null);
  assert.equal(result.recentAverage, null);
  assert.equal(result.seasonHigh, null);
  assert.equal(result.gamesPlayed, null);
  assert.equal(result.currentPoints, null);
});

test('tale of tape exposes weekly points and rank only after the full week is complete', () => {
  const player = {
    id: 'p4',
    name: 'Player Four',
    position: 'WR',
    team: 'DDD',
    avgPPG: 10,
    weekPts: 11,
    gameStarted: true,
    weekRank: { posLabel: 'WR', rank: 17 },
    weekly: [{ week: 3, rec: 5, rec_yd: 60, rec_td: 0 }],
  };

  const beforeCompletion = buildTaleOfTapePlayer({
    player,
    week: 3,
    scoringSettings: scoring,
    weeklyFormAvailable: false,
  });
  assert.equal(beforeCompletion.weeklyPoints, null);
  assert.equal(beforeCompletion.weeklyRank, null);

  const afterCompletion = buildTaleOfTapePlayer({
    player,
    week: 3,
    scoringSettings: scoring,
    weeklyFormAvailable: true,
  });
  assert.equal(afterCompletion.weeklyPoints, 11);
  assert.equal(afterCompletion.weeklyRank, 'WR17');
  assert.equal(afterCompletion.weeklyRankNumber, 17);
});

function buildScheduleWeek({ completed = true, kickoff = '2026-09-01T00:00:00.000Z' } = {}) {
  const teams = Array.from({ length: 28 }, (_, index) => `T${String(index + 1).padStart(2, '0')}`);
  return Object.fromEntries(Array.from({ length: 14 }, (_, index) => {
    const away = teams[index * 2];
    const home = teams[index * 2 + 1];
    return [
      [away, { opp: home, home: false, completed, kickoff }],
      [home, { opp: away, home: true, completed, kickoff }],
    ];
  }).flat());
}

test('full-week completion requires every scheduled game to be final', () => {
  const completedWeek = buildScheduleWeek();
  assert.equal(isFullGameWeekComplete(completedWeek), true);

  const inProgressWeek = buildScheduleWeek();
  inProgressWeek.T28.completed = false;
  assert.equal(isFullGameWeekComplete(inProgressWeek), false);

  const unknownCompletionWeek = buildScheduleWeek();
  Object.values(unknownCompletionWeek).forEach((entry) => delete entry.completed);
  assert.equal(isFullGameWeekComplete(unknownCompletionWeek), false);
});

test('tale of tape finds the manager rivalry from linked league history', () => {
  const result = findTaleOfTapeRivalry({
    rivalries: [{
      id: 'manager-a:manager-b',
      games: 6,
      ties: 1,
      winsByParticipantId: { 'manager-a': 4, 'manager-b': 1 },
    }],
  }, 'manager-b', 'manager-a');

  assert.deepEqual(result, { games: 6, ties: 1, leftWins: 1, rightWins: 4 });
});
