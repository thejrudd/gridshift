import assert from 'node:assert/strict';
import test from 'node:test';

import { isEspnFantasyGameLogPosition } from '../../src/utils/espnFantasyGameLogRows.js';
import {
  buildFantasyRowsFromGameLog,
  buildFantasyStatsFromGameLogStats,
} from '../../src/utils/fantasyGameLogRows.js';
import { buildFantasyScoringBreakdown } from '../../src/utils/fantasyBreakdownRows.js';

function statsJson(stats) {
  return {
    splits: {
      categories: [{
        name: 'Game',
        stats: Object.entries(stats).map(([name, value]) => ({
          name,
          value,
          displayValue: String(value),
        })),
      }],
    },
  };
}

test('ESPN fantasy game-log fallback supports kickers and team defense', () => {
  assert.equal(isEspnFantasyGameLogPosition('K'), true);
  assert.equal(isEspnFantasyGameLogPosition('DEF'), true);
  assert.equal(isEspnFantasyGameLogPosition('D/ST'), true);
});

test('builds kicker fantasy rows from ESPN game-log stats', () => {
  const entry = buildFantasyStatsFromGameLogStats(statsJson({
    fieldGoalsMade: 4,
    fieldGoalAttempts: 5,
    fieldGoalsMade40_49: 1,
    fieldGoalsMade50_59: 2,
    extraPointsMade: 2,
    extraPointAttempts: 3,
  }), 'K');

  assert.equal(entry.fgm, 4);
  assert.equal(entry.fgmiss, 1);
  assert.equal(entry.fgm_40_49, 1);
  assert.equal(entry.fgm_50_59, 2);
  assert.equal(entry.xpm, 2);
  assert.equal(entry.xpmiss, 1);

  const breakdown = buildFantasyScoringBreakdown(entry, {
    fgm_40_49: 4,
    fgm_50_59: 5,
    xpm: 1,
    xpmiss: -1,
  }, 'K', {
    preferRawStats: true,
  });
  const byKey = new Map(breakdown.rows.map((row) => [row.key, row]));

  assert.equal(byKey.get('fgm_40_49')?.pts, 4);
  assert.equal(byKey.get('fgm_50_59')?.pts, 10);
  assert.equal(byKey.get('xpm')?.pts, 2);
  assert.equal(byKey.get('xpmiss')?.pts, -1);
});

test('builds D/ST fantasy rows and allowance buckets from ESPN team-defense game logs', () => {
  const rows = buildFantasyRowsFromGameLog([{
    eventId: '401',
    meta: { week: 6, result: 'W', score: '24-10' },
    statsJson: statsJson({
      pts_allow: 10,
      yds_allow: 315,
      sack: 4,
      int: 2,
      fum_rec: 1,
      def_td: 1,
      def_kr_yd: 42,
    }),
  }], 'DEF');

  assert.equal(rows.length, 1);
  assert.equal(rows[0].pts_allow_7_13, 1);
  assert.equal(rows[0].yds_allow_300_349, 1);
  assert.equal(rows[0].def_kr_yd_10, 4);
  assert.equal(rows[0].team_win, 1);

  const breakdown = buildFantasyScoringBreakdown(rows[0], {
    pts_allow_7_13: 4,
    yds_allow_300_349: 1,
    sack: 1,
    int: 2,
    fum_rec: 2,
    def_td: 6,
    def_kr_yd_10: 1,
    team_win: 3,
  }, 'DEF', {
    preferRawStats: true,
  });
  const byKey = new Map(breakdown.rows.map((row) => [row.key, row]));

  assert.equal(byKey.get('pts_allow_7_13')?.pts, 4);
  assert.equal(byKey.get('yds_allow_300_349')?.pts, 1);
  assert.equal(byKey.get('sack')?.pts, 4);
  assert.equal(byKey.get('int')?.pts, 4);
  assert.equal(byKey.get('fum_rec')?.pts, 2);
  assert.equal(byKey.get('def_td')?.pts, 6);
  assert.equal(byKey.get('def_kr_yd_10')?.pts, 4);
  assert.equal(byKey.get('team_win')?.pts, 3);
});
