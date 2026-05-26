import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { reconcileFantasyScore } from '../../src/utils/fantasyScoreDiagnostics.js';
import { importEspnScoringProfile } from '../../src/utils/scoringEngine.js';

const bakerWeekOneStats = {
  week: 1,
  pass_cmp: 17,
  pass_inc: 15,
  pass_yd: 167,
  pass_td: 3,
  pass_sack: 1,
  rush_att: 5,
  rush_yd: 39,
  gp: 1,
};

const scoringProfile = importEspnScoringProfile({
  scoringItems: [
    { statId: 1, points: 0.5 },
    { statId: 2, points: -0.5 },
    { statId: 3, points: 0.2 },
    { statId: 4, points: 4 },
    { statId: 15, points: 3 },
    { statId: 20, points: -3 },
    { statId: 23, points: 0.1 },
    { statId: 24, points: 0.5 },
    { statId: 64, points: -2 },
  ],
});

const teamResultScoringProfile = importEspnScoringProfile({
  scoringItems: [
    { statId: 1, points: 0.5 },
    { statId: 2, points: -0.5 },
    { statId: 3, points: 0.2 },
    { statId: 4, points: 4 },
    { statId: 20, points: -3 },
    { statId: 23, points: 0.1 },
    { statId: 24, points: 0.5 },
    { statId: 64, points: -2 },
    { statId: 155, points: 3 },
    { statId: 156, points: -3 },
  ],
});

describe('fantasy score diagnostics', () => {
  it('identifies likely missing ESPN scoring items from an expected total', () => {
    const result = reconcileFantasyScore({
      players: {
        'espn:3918298': { full_name: 'Baker Mayfield', position: 'QB' },
      },
      weeklyStats: {
        'espn:3918298': [bakerWeekOneStats],
      },
      scoringSettings: scoringProfile,
      player: 'Baker Mayfield',
      week: 1,
      expected: 67.4,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'mismatch');
    assert.equal(result.gridshiftTotal, 64.4);
    assert.equal(result.delta, 3);
    assert.equal(result.missingCandidates[0].scoringKey, 'bonus_pass_td_40p');
    assert.equal(result.missingCandidates[0].unitsNeeded, 1);
  });

  it('confirms the score once the missing ESPN bonus stat is present', () => {
    const result = reconcileFantasyScore({
      players: {
        'espn:3918298': { full_name: 'Baker Mayfield', position: 'QB' },
      },
      weeklyStats: {
        'espn:3918298': [{ ...bakerWeekOneStats, pass_td_40p: 1 }],
      },
      scoringSettings: scoringProfile,
      playerId: '3918298',
      week: 1,
      expected: 67.4,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'match');
    assert.equal(result.gridshiftTotal, 67.4);
    assert.deepEqual(result.missingCandidates, []);
  });

  it('identifies ESPN Team Win as a likely missing scoring item', () => {
    const result = reconcileFantasyScore({
      players: {
        'espn:3918298': { full_name: 'Baker Mayfield', position: 'QB' },
      },
      weeklyStats: {
        'espn:3918298': [bakerWeekOneStats],
      },
      scoringSettings: teamResultScoringProfile,
      player: 'Baker Mayfield',
      week: 1,
      expected: 67.4,
    });

    assert.equal(result.ok, true);
    assert.equal(result.delta, 3);
    assert.equal(result.missingCandidates[0].scoringKey, 'team_win');
    assert.equal(result.missingCandidates[0].unitsNeeded, 1);
  });

  it('confirms the score once ESPN Team Win is present', () => {
    const result = reconcileFantasyScore({
      players: {
        'espn:3918298': { full_name: 'Baker Mayfield', position: 'QB' },
      },
      weeklyStats: {
        'espn:3918298': [{ ...bakerWeekOneStats, team_win: 1 }],
      },
      scoringSettings: teamResultScoringProfile,
      playerId: '3918298',
      week: 1,
      expected: 67.4,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'match');
    assert.equal(result.gridshiftTotal, 67.4);
  });

  it('can reconcile by ESPN player id when the player map is missing the player', () => {
    const result = reconcileFantasyScore({
      players: {},
      weeklyStats: {
        'espn:3918298': [{ ...bakerWeekOneStats, team_win: 1 }],
      },
      scoringSettings: teamResultScoringProfile,
      playerId: 'espn:3918298',
      player: 'Baker Mayfield',
      week: 1,
      expected: 67.4,
    });

    assert.equal(result.ok, true);
    assert.equal(result.player.matchType, 'weekly-id');
    assert.equal(result.player.position, 'QB');
    assert.equal(result.status, 'match');
    assert.equal(result.gridshiftTotal, 67.4);
  });
});
