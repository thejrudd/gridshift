import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SCORING } from '../../src/utils/scoringEngine.js';

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

test('translates projected raw stats through the connected league scoring', () => {
  const breakdown = buildFantasyScoringBreakdown(
    { pass_yd: 250, pass_td: 2 },
    PPR_SCORING,
    'QB',
    {
      authoritativeTotal: 18,
      includeFallbackTotal: false,
      preferRawStats: true,
      adjustmentLabel: 'Projection Adjustment',
    },
  );

  const byKey = new Map(breakdown.rows.map((row) => [row.key, row]));
  assert.equal(byKey.get('pass_yd')?.statVal, 250);
  assert.equal(byKey.get('pass_yd')?.pts, 10);
  assert.equal(byKey.get('pass_td')?.statVal, 2);
  assert.equal(byKey.get('pass_td')?.pts, 8);
  assert.equal(breakdown.total, 18);
});

test('translates projected D/ST tiers through the connected league scoring', () => {
  const breakdown = buildFantasyScoringBreakdown(
    { sack: 2, int: 1, pts_allow_7_13: 1, yds_allow_200_299: 1 },
    { ...DEFAULT_SCORING, sack: 1, int: 2, pts_allow_7_13: 4, yds_allow_200_299: 2 },
    'DST',
    { includeFallbackTotal: false, preferRawStats: true },
  );

  const byKey = new Map(breakdown.rows.map((row) => [row.key, row]));
  assert.equal(byKey.get('sack')?.pts, 2);
  assert.equal(byKey.get('int')?.pts, 2);
  assert.equal(byKey.get('pts_allow_7_13')?.pts, 4);
  assert.equal(byKey.get('yds_allow_200_299')?.pts, 2);
  assert.equal(breakdown.total, 10);
});

test('excludes IDP rows from D/ST breakdowns while keeping configured return and special-teams scoring', () => {
  const breakdown = buildFantasyScoringBreakdown(
    {
      idp_pd: 4.6,
      idp_sack: 2.4,
      idp_int: 0.5,
      idp_safety: 0.02,
      def_kr_yd: 27,
      def_pr_yd: 13,
      kr_td: 0.1,
      blk_kick: 0.2,
    },
    {
      ...DEFAULT_SCORING,
      idp_pd: 5,
      idp_sack: 4,
      idp_int: 7,
      idp_safety: 9,
      def_kr_yd: 0.1,
      def_pr_yd: 0.2,
      kr_td: 6,
      blk_kick: 2,
    },
    'DST',
    { includeFallbackTotal: false, preferRawStats: true },
  );

  const byKey = new Map(breakdown.rows.map((row) => [row.key, row]));
  assert.equal(breakdown.total, 6.3);
  assert.equal(byKey.get('def_kr_yd')?.pts, 2.7);
  assert.equal(byKey.get('def_pr_yd')?.pts, 2.6);
  assert.equal(byKey.get('kr_td')?.pts, 0.6);
  assert.equal(byKey.get('blk_kick')?.pts, 0.4);
  assert.equal(byKey.has('idp_pd'), false);
  assert.equal(byKey.has('idp_sack'), false);
  assert.equal(byKey.has('idp_int'), false);
  assert.equal(byKey.has('idp_safety'), false);
});
