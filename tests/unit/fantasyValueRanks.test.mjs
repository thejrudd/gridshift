import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFantasyRankDistributions,
  getFantasyRankForValue,
} from '../../src/utils/fantasyValueRanks.js';

// Six players per position keeps every pool above the minimum rank pool size.
const RB_IDS = ['rb1', 'rb2', 'rb3', 'rb4', 'rb5', 'rb6'];
const WR_IDS = ['wr1', 'wr2', 'wr3', 'wr4', 'wr5', 'wr6'];

function buildPool({ rbTotals, wrTotals }) {
  const players = {};
  const seasonStats = {};

  RB_IDS.forEach((id, index) => {
    players[id] = { position: 'RB' };
    seasonStats[id] = { rush_yd: rbTotals[index] };
  });
  WR_IDS.forEach((id, index) => {
    players[id] = { position: 'WR' };
    seasonStats[id] = { rush_yd: wrTotals[index] };
  });

  return { players, seasonStats };
}

// Stand-in for the component's option-row builder: one option keyed 'rush_yd'.
function buildOptionRows(totals) {
  const points = Number(totals?.rush_yd ?? 0) * 0.1;
  return points ? [{ key: 'rush_yd', points }] : [];
}

function calcTotalPoints(weeks, totals) {
  if (Array.isArray(weeks) && weeks.length > 0) {
    return weeks.reduce((sum, week) => sum + Number(week.rush_yd ?? 0) * 0.1, 0);
  }
  return Number(totals?.rush_yd ?? 0) * 0.1;
}

test('ranks a value overall and within its position group', () => {
  const { players, seasonStats } = buildPool({
    rbTotals: [1000, 900, 800, 700, 600, 500],
    wrTotals: [1200, 1100, 300, 200, 100, 50],
  });

  const distributions = buildFantasyRankDistributions({
    seasonStats,
    players,
    buildOptionRows,
    calcTotalPoints,
  });

  // 95.0 points (950 yards) trails the two WRs and the top RB.
  const { rank, positionRank } = getFantasyRankForValue(distributions.option.get('rush_yd'), 95, 'RB');
  assert.equal(rank, 4);
  assert.deepEqual(positionRank, { rank: 2, posLabel: 'RB' });
});

test('excludes the subject from the pool so its own value is not double counted', () => {
  const { players, seasonStats } = buildPool({
    rbTotals: [1000, 900, 800, 700, 600, 500],
    wrTotals: [1200, 1100, 300, 200, 100, 50],
  });

  const distributions = buildFantasyRankDistributions({
    seasonStats,
    players,
    buildOptionRows,
    calcTotalPoints,
    excludeIds: ['rb1'],
  });

  // rb1 (100.0) is ranked back in: still 3rd overall, 1st among RBs.
  const { rank, positionRank } = getFantasyRankForValue(distributions.option.get('rush_yd'), 100, 'RB');
  assert.equal(rank, 3);
  assert.deepEqual(positionRank, { rank: 1, posLabel: 'RB' });
});

test('shares a rank across ties', () => {
  const { players, seasonStats } = buildPool({
    rbTotals: [1000, 1000, 800, 700, 600, 500],
    wrTotals: [400, 300, 200, 100, 50, 25],
  });

  const distributions = buildFantasyRankDistributions({
    seasonStats,
    players,
    buildOptionRows,
    calcTotalPoints,
    excludeIds: ['rb2'],
  });

  const { rank, positionRank } = getFantasyRankForValue(distributions.option.get('rush_yd'), 100, 'RB');
  assert.equal(rank, 1);
  assert.deepEqual(positionRank, { rank: 1, posLabel: 'RB' });
});

test('ranks season totals from weekly rows when they are available', () => {
  const players = {};
  const seasonStats = {};
  const weeklyStats = {};

  RB_IDS.forEach((id, index) => {
    players[id] = { position: 'RB' };
    // Aggregated totals disagree with the weekly rows on purpose; the weekly
    // rows are the source the pool should score from.
    seasonStats[id] = { rush_yd: 10 };
    weeklyStats[id] = [
      { week: 1, rush_yd: 100 - index * 10 },
      { week: 2, rush_yd: 100 - index * 10 },
    ];
  });

  const distributions = buildFantasyRankDistributions({
    seasonStats,
    weeklyStats,
    players,
    buildOptionRows,
    calcTotalPoints,
    excludeIds: ['rb3'],
  });

  // rb3 scores 2 × 80 yards = 16.0 points → 3rd of the six RBs.
  const { rank, positionRank } = getFantasyRankForValue(distributions.total, 16, 'RB');
  assert.equal(rank, 3);
  assert.deepEqual(positionRank, { rank: 3, posLabel: 'RB' });
});

test('withholds ranks when the season pool is too small to be meaningful', () => {
  const distributions = buildFantasyRankDistributions({
    seasonStats: {
      rb1: { rush_yd: 1000 },
      rb2: { rush_yd: 500 },
    },
    players: { rb1: { position: 'RB' }, rb2: { position: 'RB' } },
    buildOptionRows,
    calcTotalPoints,
  });

  const { rank, positionRank } = getFantasyRankForValue(distributions.option.get('rush_yd'), 100, 'RB');
  assert.equal(rank, null);
  assert.equal(positionRank, null);
});

test('returns no ranks without a season pool or a numeric value', () => {
  const empty = buildFantasyRankDistributions({ seasonStats: null, buildOptionRows, calcTotalPoints });
  assert.deepEqual(getFantasyRankForValue(empty.total, 25, 'RB'), { rank: null, positionRank: null });
  assert.deepEqual(getFantasyRankForValue(empty.total, null, 'RB'), { rank: null, positionRank: null });
});
