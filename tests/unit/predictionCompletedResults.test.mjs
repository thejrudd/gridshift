import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCompletedGameResults,
  clampRecordToCompletedResults,
  getCompletedGameOutcome,
  getCompletedRecordBounds,
  getCompletedRecordRanges,
} from '../../src/utils/predictionCompletedResults.js';
import { rebalanceCompleteManualRecords } from '../../src/utils/predictionSnapshot.js';

const game = (overrides) => ({
  awayTeam: 'BUF',
  homeTeam: 'MIA',
  awayGameIndex: 0,
  homeGameIndex: 0,
  ...overrides,
});

describe('prediction completed results', () => {
  it('reads wins, losses, and ties from final games only', () => {
    assert.deepEqual(getCompletedGameOutcome(game({ completed: true, awayScore: 24, homeScore: 17 })), { away: 'W', home: 'L' });
    assert.deepEqual(getCompletedGameOutcome(game({ completed: true, awayScore: 10, homeScore: 13 })), { away: 'L', home: 'W' });
    assert.deepEqual(getCompletedGameOutcome(game({ completed: true, awayScore: 20, homeScore: 20 })), { away: 'T', home: 'T' });
    assert.equal(getCompletedGameOutcome(game({ completed: false, status: 'in_progress', awayScore: 7, homeScore: 0 })), null);
    assert.equal(getCompletedGameOutcome(game({ completed: true, awayScore: null, homeScore: null })), null);
  });

  it('maps final games onto each team’s schedule slot', () => {
    const schedule = {
      weeks: [
        { week: 1, games: [game({ completed: true, awayScore: 24, homeScore: 17 })] },
        { week: 2, games: [game({ awayTeam: 'MIA', homeTeam: 'NYJ', awayGameIndex: 1, homeGameIndex: 0, completed: true, awayScore: 30, homeScore: 3 })] },
        { week: 3, games: [game({ awayGameIndex: 1, homeGameIndex: 2 })] },
      ],
    };

    assert.deepEqual(buildCompletedGameResults(schedule), {
      BUF: { 0: 'W' },
      MIA: { 0: 'L', 1: 'W' },
      NYJ: { 0: 'L' },
    });
  });

  describe('record floor from final results', () => {
    const teams = [
      { id: 'BUF', division: 'AFC East', opponents: ['MIA', 'NYJ', 'KC', 'DEN', 'LAC'] },
      { id: 'MIA', division: 'AFC East' },
      { id: 'NYJ', division: 'AFC East' },
      { id: 'KC', division: 'AFC West' },
      { id: 'DEN', division: 'AFC West' },
      { id: 'LAC', division: 'AFC West' },
    ];
    // BUF: beat MIA, lost to NYJ (division); beat KC and DEN, lost to LAC.
    const bounds = getCompletedRecordBounds(teams[0], { 0: 'W', 1: 'L', 2: 'W', 3: 'W', 4: 'L' }, teams);

    it('splits final results into division and other games', () => {
      assert.deepEqual(bounds, {
        divisionWins: 1, divisionLosses: 1, divisionTies: 0,
        otherWins: 2, otherLosses: 1, otherTies: 0,
      });
    });

    it('keeps wins, losses, and division wins inside what already happened', () => {
      const ranges = getCompletedRecordRanges(bounds, { wins: 3, allowTies: false });
      assert.deepEqual(ranges.wins, { min: 3, max: 15 });
      assert.deepEqual(ranges.divisionWins, { min: 1, max: 1 });

      assert.deepEqual(
        clampRecordToCompletedResults({ wins: 1, losses: 16, ties: 0, divisionWins: 0 }, bounds, { allowTies: false }),
        { wins: 3, losses: 14, ties: 0, divisionWins: 1 },
      );
      assert.deepEqual(
        clampRecordToCompletedResults({ wins: 17, losses: 0, ties: 0, divisionWins: 6 }, bounds, { allowTies: false }),
        { wins: 15, losses: 2, ties: 0, divisionWins: 5 },
      );
    });

    it('never balances the league below a team’s final wins', () => {
      const ids = Array.from({ length: 32 }, (_, index) => `T${String(index).padStart(2, '0')}`);
      const leagueTeams = ids.map((id) => ({ id }));
      const records = Object.fromEntries(ids.map((id) => [id, { wins: 9, losses: 8, ties: 0, divisionWins: 3 }]));
      const recordBounds = Object.fromEntries(ids.slice(1).map((id) => [id, {
        divisionWins: 3, divisionLosses: 0, divisionTies: 0, otherWins: 6, otherLosses: 0, otherTies: 0,
      }]));
      const { records: balanced } = rebalanceCompleteManualRecords({
        records, teams: leagueTeams, targetTeamId: 'T00', recordBounds,
      });
      for (const id of ids.slice(1)) assert.ok(balanced[id].wins >= 9, `${id} fell below its final wins`);
    });
  });
});
