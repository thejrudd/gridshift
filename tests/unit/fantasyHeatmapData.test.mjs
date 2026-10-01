import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildHeatmapMatchupRatings,
  getHeatmapCompletedGameCount,
  sortHeatmapRowsByMatchupRank,
} from '../../src/utils/fantasyHeatmapData.js';

describe('Fantasy Heatmap game averages', () => {
  it('counts finalized games only, including a finalized zero-stat game', () => {
    const scheduleMap = {
      1: { LV: { opp: 'MIA', completed: true } },
      2: { LV: { opp: 'LAC', completed: true } },
      3: { LV: { opp: 'BUF', completed: false } },
      4: { LV: { opp: 'DEN', status: 'scheduled' } },
    };

    assert.equal(getHeatmapCompletedGameCount(scheduleMap, 'LV', [1, 2, 3, 4]), 2);
  });

  it('respects the active location filter without treating future games as played', () => {
    const scheduleMap = {
      1: { LV: { opp: 'MIA', completed: true, home: true } },
      2: { LV: { opp: 'LAC', completed: true, home: false } },
      3: { LV: { opp: 'BUF', completed: false, home: true } },
    };

    assert.equal(
      getHeatmapCompletedGameCount(scheduleMap, 'LV', [1, 2, 3], (team, week) => (
        team === 'LV' && week !== 2
      )),
      1,
    );
  });
});

describe('Fantasy Heatmap future matchup ratings', () => {
  const teams = ['A', 'B', 'C', 'D'];
  const positions = ['TE'];
  const scheduleMap = {
    1: {
      A: { opp: 'B', completed: true },
      B: { opp: 'A', completed: true },
      C: { opp: 'D', completed: true },
      D: { opp: 'C', completed: true },
    },
    2: {
      A: { opp: 'B', status: 'scheduled' },
      B: { opp: 'A', status: 'scheduled' },
      C: { opp: 'D', status: 'scheduled' },
      D: { opp: 'C', status: 'scheduled' },
    },
  };

  it('combines offensive production and opposing points allowed with equal weight', () => {
    const ratings = buildHeatmapMatchupRatings({
      offenseTable: {
        A: { TE: { 1: 30 } },
        B: { TE: { 1: 10 } },
        C: { TE: { 1: 20 } },
        D: { TE: { 1: 0 } },
      },
      scheduleMap,
      teams,
      positions,
      weeks: [1, 2],
    });

    assert.deepEqual(
      Object.fromEntries(teams.map(team => [team, ratings[2][team].TE.rank])),
      { A: 1, B: 3, C: 2, D: 4 },
    );
    assert.deepEqual(
      Object.fromEntries(teams.map(team => [team, ratings[2][team].TE.composite])),
      { A: 1, B: 3, C: 2, D: 4 },
    );
    assert.equal(ratings[2].A.TE.rank, 1);
    assert.equal(ratings[2].A.TE.defenseRank, 4);
    assert.equal(ratings[2].D.TE.defenseRank, 1);
  });

  it('ranks D/ST and IDP matchups from their own scoring and opposing points allowed', () => {
    const ratings = buildHeatmapMatchupRatings({
      positionTable: {
        A: { DEF: { 1: 30 }, DL: { 1: 0 } },
        B: { DEF: { 1: 10 }, DL: { 1: 30 } },
        C: { DEF: { 1: 20 }, DL: { 1: 10 } },
        D: { DEF: { 1: 0 }, DL: { 1: 20 } },
      },
      scheduleMap,
      teams,
      positions: ['DEF', 'DL'],
      weeks: [1, 2],
    });

    assert.deepEqual(
      Object.fromEntries(teams.map(team => [team, ratings[2][team].DEF.rank])),
      { A: 1, B: 3, C: 2, D: 4 },
    );
    assert.deepEqual(
      Object.fromEntries(teams.map(team => [team, ratings[2][team].DL.rank])),
      { A: 4, B: 1, C: 3, D: 2 },
    );
    assert.equal(ratings[2].A.DEF.teamAverage, 30);
    assert.equal(ratings[2].A.DEF.opponentPointsAllowedAverage, 30);
    assert.equal(ratings[2].A.DL.teamAverage, 0);
    assert.equal(ratings[2].A.DL.opponentPointsAllowedAverage, 0);
  });

  it('shares ranks when matchup composites tie', () => {
    const recentSchedule = {
      1: { A: { opp: 'B', completed: true }, B: { opp: 'A', completed: true } },
      2: { A: { opp: 'B', completed: true }, B: { opp: 'A', completed: true } },
      3: { A: { opp: 'B', status: 'scheduled' }, B: { opp: 'A', status: 'scheduled' } },
    };
    const ratings = buildHeatmapMatchupRatings({
      offenseTable: {
        A: { TE: { 1: 10, 2: 10 } },
        B: { TE: { 1: 10, 2: 10 } },
      },
      scheduleMap: recentSchedule,
      teams: ['A', 'B'],
      positions,
      weeks: [1, 2, 3],
      window: 'recent',
    });

    assert.equal(ratings[3].A.TE.rank, 1);
    assert.equal(ratings[3].B.TE.rank, 1);
    assert.equal(ratings[3].A.TE.composite, ratings[3].B.TE.composite);
  });

  it('uses the last four completed games and excludes bye weeks in recent mode', () => {
    const recentSchedule = {};
    for (const week of [1, 2, 3, 4, 5, 6]) {
      recentSchedule[week] = week === 3
        ? { A: { bye: true }, B: { bye: true } }
        : {
            A: { opp: 'B', completed: true },
            B: { opp: 'A', completed: true },
          };
    }
    recentSchedule[7] = {
      A: { opp: 'B', status: 'scheduled' },
      B: { opp: 'A', status: 'scheduled' },
    };

    const ratings = buildHeatmapMatchupRatings({
      offenseTable: {
        A: { TE: { 1: 10, 2: 10, 4: 10, 5: 10, 6: 100 } },
        B: { TE: { 1: 20, 2: 20, 4: 20, 5: 20, 6: 0 } },
      },
      scheduleMap: recentSchedule,
      teams: ['A', 'B'],
      positions,
      weeks: [1, 2, 3, 4, 5, 6, 7],
      window: 'recent',
    });

    assert.equal(ratings[7].A.TE.offenseAverage, 32.5);
    assert.equal(ratings[7].A.TE.defenseAllowedAverage, 32.5);
    assert.equal(ratings[7].B.TE.offenseAverage, 15);
    assert.equal(ratings[7].B.TE.defenseAllowedAverage, 15);
  });

  it('does not rank future matchups when required stats or played-game history are unavailable', () => {
    const noStats = buildHeatmapMatchupRatings({
      offenseTable: {},
      scheduleMap,
      teams,
      positions,
      weeks: [1, 2],
    });
    const noHistoryForA = buildHeatmapMatchupRatings({
      offenseTable: { B: { TE: { 1: 10 } } },
      scheduleMap: {
        1: { A: { bye: true }, B: { opp: 'C', completed: true }, C: { opp: 'B', completed: true } },
        2: {
          A: { opp: 'B', status: 'scheduled' },
          B: { opp: 'A', status: 'scheduled' },
        },
      },
      teams: ['A', 'B'],
      positions,
      weeks: [1, 2],
    });

    assert.deepEqual(noStats, {});
    assert.equal(noHistoryForA[2]?.A?.TE, undefined);
  });

  it('sorts future matchup columns in both rank directions and keeps unavailable ranks last', () => {
    const rows = ['A', 'B', 'C'].map(team => ({ team }));
    const ratings = {
      8: {
        A: { TE: { rank: 1 } },
        B: { TE: { rank: 32 } },
      },
    };

    assert.deepEqual(
      sortHeatmapRowsByMatchupRank(rows, ratings, 8, 'TE', 'asc').map(row => row.team),
      ['A', 'B', 'C'],
    );
    assert.deepEqual(
      sortHeatmapRowsByMatchupRank(rows, ratings, 8, 'TE', 'desc').map(row => row.team),
      ['B', 'A', 'C'],
    );
  });
});
