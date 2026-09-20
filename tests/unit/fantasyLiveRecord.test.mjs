import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFantasyLiveRosterResults } from '../../src/utils/fantasyLiveRecord.js';

const teams = Array.from({ length: 26 }, (_, index) => `T${String(index + 1).padStart(2, '0')}`);

function schedule(completed = true) {
  const result = {};
  for (let index = 0; index < teams.length; index += 2) {
    const away = teams[index];
    const home = teams[index + 1];
    result[away] = { opp: home, completed };
    result[home] = { opp: away, completed };
  }
  return result;
}

const players = {
  p1: { full_name: 'Player One', team: 'T01' },
  p2: { full_name: 'Player Two', team: 'T02' },
  q1: { full_name: 'Player Three', team: 'T03' },
  q2: { full_name: 'Player Four', team: 'T04' },
};

function matchupRows(matchupId, leftPoints, rightPoints) {
  return [
    {
      matchup_id: matchupId,
      roster_id: 1,
      starters: ['p1'],
      players_points: { p1: leftPoints },
      points: leftPoints,
    },
    {
      matchup_id: matchupId,
      roster_id: 2,
      starters: ['p2'],
      players_points: { p2: rightPoints },
      points: rightPoints,
    },
  ];
}

test('Live record excludes a partially scored current week', () => {
  const results = buildFantasyLiveRosterResults({
    matchupsByWeek: {
      1: matchupRows(1, 30, 20),
      2: matchupRows(2, 8, 4),
    },
    throughWeek: 2,
    scheduleMap: {
      1: schedule(true),
      2: schedule(false),
    },
    players,
  });

  assert.equal(results.get(1).wins, 1);
  assert.equal(results.get(1).losses, 0);
  assert.equal(results.get(1).pointsFor, 30);
  assert.equal(results.get(2).wins, 0);
});

test('Live record includes the current matchup after final evidence arrives', () => {
  const results = buildFantasyLiveRosterResults({
    matchupsByWeek: {
      1: matchupRows(1, 30, 20),
      2: matchupRows(2, 8, 8),
    },
    throughWeek: 2,
    scheduleMap: {
      1: schedule(true),
      2: schedule(true),
    },
    players,
  });

  assert.deepEqual(results.get(1), {
    pointsFor: 38,
    pointsAgainst: 28,
    wins: 1,
    losses: 0,
    ties: 1,
  });
  assert.deepEqual(results.get(2), {
    pointsFor: 28,
    pointsAgainst: 38,
    wins: 0,
    losses: 1,
    ties: 1,
  });
});

test('Live record stays unresolved when official starter points are incomplete', () => {
  const rows = matchupRows(1, 30, 20);
  delete rows[0].players_points.p1;

  const results = buildFantasyLiveRosterResults({
    matchupsByWeek: { 1: rows },
    throughWeek: 1,
    scheduleMap: { 1: schedule(true) },
    players,
  });

  assert.equal(results.size, 0);
});
