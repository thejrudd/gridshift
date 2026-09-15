import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFantasyMatchupScoringBreakdown } from '../../src/utils/fantasyMatchupBreakdown.js';

const SCORING = {
  pass_yd: 0.04,
  pass_td: 4,
  rush_yd: 0.1,
  rec: 1,
  rec_yd: 0.1,
};

test('keeps the team total authoritative while exposing all reported starter points', () => {
  const result = buildFantasyMatchupScoringBreakdown({
    playerIds: ['qb', 'rb'],
    playerPoints: { qb: 20.4, rb: 16.2 },
    teamTotal: 36.6,
    week: 1,
    weeklyStats: {
      qb: [{ week: 1, pass_yd: 250, pass_td: 2 }],
      rb: [{ week: 1, rush_yd: 82, rec: 3, rec_yd: 24 }],
    },
    players: {
      qb: { full_name: 'Pocket Commander', position: 'QB', team: 'BUF' },
      rb: { full_name: 'Volume Runner', position: 'RB', team: 'KC' },
    },
    scoringSettings: SCORING,
  });

  assert.equal(result.total, 36.6);
  assert.deepEqual(result.playerRows.slice(0, 2).map((row) => [row.name, row.points]), [
    ['Pocket Commander', 20.4],
    ['Volume Runner', 16.2],
  ]);
  assert.equal(result.categoryRows.find((row) => row.key === 'pass_yd')?.pts, 10);
  assert.equal(result.categoryRows.find((row) => row.key === 'rush_yd')?.pts, 8.2);
  assert.equal(result.categoryRows.find((row) => row.key === 'other_adjustments')?.pts, 5);
  assert.equal(result.categoryTotal, 36.6);
});

test('keeps a reported player visible when its raw weekly stat row is unavailable', () => {
  const result = buildFantasyMatchupScoringBreakdown({
    playerIds: ['missing-player'],
    playerPoints: { 'missing-player': 12.32 },
    teamTotal: 12.32,
    week: 1,
    weeklyStats: {},
    players: { 'missing-player': { full_name: 'Unavailable Stat Line', position: 'RB' } },
    scoringSettings: SCORING,
  });

  assert.deepEqual(result.playerRows.map((row) => [row.name, row.points]), [['Unavailable Stat Line', 12.32]]);
  assert.deepEqual(result.categoryRows.map((row) => [row.key, row.pts]), [['fantasy_points_total', 12.32]]);
  assert.equal(result.categoryTotal, 12.32);
});

test('preserves unavailable player and team totals as unknown', () => {
  const result = buildFantasyMatchupScoringBreakdown({
    playerIds: ['unknown-player'],
    playerPoints: { 'unknown-player': null },
    teamTotal: null,
    week: 1,
    weeklyStats: {},
    players: { 'unknown-player': { full_name: 'Unknown Player', position: 'RB' } },
    scoringSettings: SCORING,
  });

  assert.equal(result.total, null);
  assert.equal(result.playerRows[0]?.points, null);
  assert.deepEqual(result.categoryRows, []);
});
