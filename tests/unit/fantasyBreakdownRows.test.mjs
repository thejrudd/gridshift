import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFantasyScoringBreakdown,
  mergeOfficialFantasyTotal,
} from '../../src/utils/fantasyBreakdownRows.js';

const PPR_SCORING = {
  pass_yd: 0.04,
  pass_td: 4,
  pass_int: -2,
  rush_yd: 0.1,
  rush_td: 6,
  rec: 1,
  rec_yd: 0.1,
  rec_td: 6,
};

test('keeps an applied-total-only weekly row as a single fantasy points line', () => {
  const breakdown = buildFantasyScoringBreakdown(
    { week: 1, _fantasyPoints: 67.4, fantasy_points: 67.4 },
    PPR_SCORING,
    'QB',
  );

  assert.equal(breakdown.total, 67.4);
  assert.deepEqual(breakdown.rows.map((row) => [row.key, row.label, row.pts]), [
    ['fantasy_points_total', 'Fantasy Points', 67.4],
  ]);
});

test('uses derived raw stats while preserving the official ESPN fantasy total', () => {
  const officialRow = { week: 1, _fantasyPoints: 67.4, fantasy_points: 67.4 };
  const derivedRow = {
    week: 1,
    pass_yd: 289,
    pass_td: 4,
    pass_int: 1,
    rush_yd: 24,
  };
  const merged = mergeOfficialFantasyTotal(officialRow, derivedRow);
  const breakdown = buildFantasyScoringBreakdown(merged, PPR_SCORING, 'QB', {
    preferRawStats: true,
    adjustmentLabel: 'Official Scoring Adjustment',
  });

  const byKey = new Map(breakdown.rows.map((row) => [row.key, row]));
  assert.equal(breakdown.total, 67.4);
  assert.equal(byKey.get('pass_yd')?.pts, 11.56);
  assert.equal(byKey.get('pass_td')?.pts, 16);
  assert.equal(byKey.get('pass_int')?.pts, -2);
  assert.equal(byKey.get('rush_yd')?.pts, 2.4);
  assert.equal(byKey.get('scoring_adjustment')?.label, 'Official Scoring Adjustment');
  assert.equal(byKey.get('scoring_adjustment')?.pts, 39.44);
});
