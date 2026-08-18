import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFantasyStatsFromGameLogStats } from '../../src/utils/fantasyGameLogRows.js';
import { calcPoints, calcPointsFromTotals } from '../../src/utils/scoringEngine.js';

const TIER_SCORING = {
  pass_yd: 0.04,
  pass_td: 4,
  bonus_pass_yd_300: 3,
  bonus_pass_yd_400: 5,
  rush_yd: 0.1,
  bonus_rush_yd_100: 2,
  bonus_rush_yd_200: 4,
  rec_yd: 0.1,
  bonus_rec_yd_100: 2,
  bonus_rec_yd_200: 4,
  bonus_rush_rec_yd_100: 1,
  bonus_rush_rec_yd_200: 2,
};

function qbGameLogStats(passingYards) {
  return {
    splits: {
      categories: [
        {
          name: 'passing',
          stats: [{ name: 'passingYards', value: passingYards }],
        },
      ],
    },
  };
}

test('derived yardage-tier bonuses are exclusive, matching Sleeper convention', () => {
  const over400 = buildFantasyStatsFromGameLogStats(qbGameLogStats(457), 'QB');
  assert.equal(over400.bonus_pass_yd_400, 1, '457-yard game earns the 400 tier');
  assert.equal(over400.bonus_pass_yd_300, 0, '457-yard game must not also earn the 300 tier');

  const midTier = buildFantasyStatsFromGameLogStats(qbGameLogStats(342), 'QB');
  assert.equal(midTier.bonus_pass_yd_300, 1, '342-yard game earns the 300 tier');
  assert.equal(midTier.bonus_pass_yd_400, 0);

  const below = buildFantasyStatsFromGameLogStats(qbGameLogStats(299), 'QB');
  assert.equal(below.bonus_pass_yd_300, 0);
  assert.equal(below.bonus_pass_yd_400, 0);
});

test('weekly calcPoints sum equals calcPointsFromTotals on the season aggregate', () => {
  // Sleeper convention: weekly rows carry only the highest cleared tier.
  const weeks = [
    { pass_yd: 457, pass_td: 3, bonus_pass_yd_400: 1 },
    { pass_yd: 342, pass_td: 2, bonus_pass_yd_300: 1 },
    { pass_yd: 305, pass_td: 1, bonus_pass_yd_300: 1 },
    { pass_yd: 188, pass_td: 2 },
    { rush_yd: 112, rec_yd: 96, bonus_rush_yd_100: 1, bonus_rush_rec_yd_200: 1 },
  ];

  const totals = {};
  for (const week of weeks) {
    for (const [key, value] of Object.entries(week)) {
      totals[key] = (totals[key] ?? 0) + value;
    }
  }

  const weeklySum = weeks.reduce((sum, week) => sum + calcPoints(week, TIER_SCORING, 'QB'), 0);
  const totalsPoints = calcPointsFromTotals(totals, TIER_SCORING, 'QB');

  assert.ok(
    Math.abs(weeklySum - totalsPoints) < 0.005,
    `weekly sum ${weeklySum} must equal season-total points ${totalsPoints}`,
  );
});
