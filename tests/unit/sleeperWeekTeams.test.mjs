import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  capSeasonPackages,
  fillScheduleWeekTeams,
  mergeFetchedWeeks,
  planSeasonWeekFetch,
  resolveStatsWeekRange,
  toWeekStatMap,
} from '../../src/utils/sleeperWeekTeams.js';
import { getHeatmapPlayerGameTeam } from '../../src/utils/fantasyHeatmapData.js';

// Shaped like api.sleeper.com/stats/nfl/{season}/{week} rows (trimmed).
function sleeperRow(playerId, { team, opponent, position = 'QB', stats = {} }) {
  return {
    player_id: playerId,
    team,
    opponent,
    game_id: 'g',
    date: '2025-10-05',
    company: 'sportradar',
    player: { position, first_name: 'Test', last_name: playerId },
    stats: { gp: 1, ...stats },
  };
}

describe('Sleeper team-by-week rows', () => {
  // Flacco-shaped: CLE through week 5, traded, CIN from week 6. CLE's bye
  // and CIN's bye leave no row at all.
  const weeks = {
    4: [sleeperRow('19', { team: 'CLE', opponent: 'DET', stats: { pass_yd: 210 } })],
    5: [sleeperRow('19', { team: 'CLE', opponent: 'MIN', stats: { pass_yd: 180 } })],
    6: [sleeperRow('19', { team: 'CIN', opponent: 'GB', stats: { pass_yd: 260 } })],
    7: [sleeperRow('19', { team: 'CIN', opponent: 'PIT', stats: { pass_yd: 340 } })],
    9: [sleeperRow('19', { team: 'CIN', opponent: 'CHI', stats: { pass_yd: 470 } })],
  };
  const fetched = Object.fromEntries(Object.entries(weeks).map(([week, rows]) => [week, toWeekStatMap(rows, week)]));
  const { weeklyStats } = mergeFetchedWeeks(null, fetched, { throughWeek: 9, currentWeek: 10, known: true });
  const rows = weeklyStats['19'];

  it('keeps a traded player on the team he played for each week', () => {
    assert.deepEqual(rows.map((row) => [row.week, row.team, row.opp]), [
      [4, 'CLE', 'DET'], [5, 'CLE', 'MIN'], [6, 'CIN', 'GB'], [7, 'CIN', 'PIT'], [9, 'CIN', 'CHI'],
    ]);
    assert.ok(rows.every((row) => row._teamSource === 'espn'));
  });

  it('has no row for a bye week', () => {
    assert.equal(rows.some((row) => row.week === 8), false);
  });

  it('keeps the stat line flat and drops Sleeper row metadata', () => {
    assert.equal(rows[0].pass_yd, 210);
    assert.equal(rows[0].gp, 1);
    for (const key of ['player', 'stats', 'game_id', 'date', 'company', 'opponent']) {
      assert.equal(key in rows[0], false, key);
    }
  });

  it('gives heatmap readers the game-time team, not the current one', () => {
    const player = { team: 'CIN', position: 'QB' };
    assert.equal(getHeatmapPlayerGameTeam(rows[0], player, rows), 'CLE');
    assert.equal(getHeatmapPlayerGameTeam(rows[2], player, rows), 'CIN');
  });

  it('leaves team defense and lineman rows without a team, as before', () => {
    const map = toWeekStatMap([
      sleeperRow('BUF', { team: 'BUF', opponent: 'NE', position: 'DEF', stats: { def_td: 1 } }),
      sleeperRow('9', { team: 'BUF', opponent: 'NE', position: 'OT' }),
    ], 5);
    assert.deepEqual(map.BUF, { week: 5, gp: 1, def_td: 1 });
    assert.equal('team' in map['9'], false);
  });
});

describe('Season week range from Sleeper NFL state', () => {
  it('fetches only through the current week in season', () => {
    assert.deepEqual(resolveStatsWeekRange({ season: '2026', season_type: 'regular', week: 10 }, '2026'),
      { throughWeek: 10, currentWeek: 10, known: true });
  });
  it('fetches every week of a past or completed season', () => {
    assert.equal(resolveStatsWeekRange({ season: '2026', season_type: 'regular', week: 10 }, '2025').throughWeek, 18);
    assert.deepEqual(resolveStatsWeekRange(null, '2019', { completed: true }), { throughWeek: 17, currentWeek: null, known: true });
  });
  it('fetches nothing in preseason and everything, unfinalised, without a state', () => {
    assert.equal(resolveStatsWeekRange({ season: '2026', season_type: 'pre', week: 0 }, '2026').throughWeek, 0);
    assert.deepEqual(resolveStatsWeekRange(null, '2026'), { throughWeek: 18, currentWeek: null, known: false });
  });
});

describe('Incremental season package', () => {
  const now = 10_000_000;
  const hour = 60 * 60 * 1000;
  const range = { throughWeek: 10, currentWeek: 10, known: true };

  it('fetches every week on a cold load', () => {
    assert.deepEqual(planSeasonWeekFetch(null, range, { now }), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('keeps completed weeks and refreshes only a stale current week', () => {
    const fetched = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, {}]));
    const cached = mergeFetchedWeeks(null, fetched, range, { now });
    assert.equal(cached.weeks[9].final, true);
    assert.equal(cached.weeks[10].final, false);
    assert.deepEqual(planSeasonWeekFetch(cached, range, { now: now + 10, ttl: hour }), []);
    assert.deepEqual(planSeasonWeekFetch(cached, range, { now: now + hour, ttl: hour }), [10]);
    // Slate rolls over: week 10 is fetched once more to become final, week 11 is new.
    assert.deepEqual(planSeasonWeekFetch(cached, { throughWeek: 11, currentWeek: 11, known: true }, { now: now + 10, ttl: hour }), [10, 11]);
  });

  it('replaces a refetched week for every player without touching other weeks', () => {
    const base = mergeFetchedWeeks(null, {
      9: { a: { week: 9, pts: 1 }, b: { week: 9, pts: 2 } },
      10: { a: { week: 10, pts: 3 }, b: { week: 10, pts: 4 } },
    }, range, { now });
    const next = mergeFetchedWeeks(base, { 10: { a: { week: 10, pts: 30 } } }, range, { now: now + hour });
    assert.deepEqual(next.weeklyStats.a.map((row) => row.pts), [1, 30]);
    assert.deepEqual(next.weeklyStats.b.map((row) => row.pts), [2]);
  });
});

test('schedule fallback fills only players with no game-time row', () => {
  const scheduleMap = { 3: { KC: { opp: 'buf' } } };
  const players = { a: { team: 'KC', position: 'WR' }, b: { team: 'KC', position: 'WR' } };
  const weeklyStats = {
    a: [{ week: 3, rec: 2 }],
    b: [{ week: 2, team: 'NYJ', _teamSource: 'espn' }, { week: 3, rec: 4 }],
  };
  const filled = fillScheduleWeekTeams(weeklyStats, players, scheduleMap);
  assert.deepEqual(filled.a[0], { week: 3, rec: 2, team: 'KC', opp: 'BUF', _teamSource: 'schedule' });
  assert.equal(filled.b, weeklyStats.b);
  assert.equal(fillScheduleWeekTeams(filled, players, scheduleMap), null);
});

test('season packages are capped at three, never evicting the selected season', () => {
  let packages = {};
  let recency = [];
  for (const key of ['2026', '2025', '2024', '2023']) {
    ({ packages, recency } = capSeasonPackages({ ...packages, [key]: { key } }, recency, key, { keep: ['2026'] }));
  }
  // 2025 was the least recently stored season that is not selected.
  assert.deepEqual(Object.keys(packages).sort(), ['2023', '2024', '2026']);
  // Storing 2024 again makes 2023 the oldest evictable season.
  ({ packages, recency } = capSeasonPackages({ ...packages, 2024: { key: '2024' } }, recency, '2024', { keep: ['2026'] }));
  ({ packages, recency } = capSeasonPackages({ ...packages, 2022: { key: '2022' } }, recency, '2022', { keep: ['2026'] }));
  assert.deepEqual(Object.keys(packages).sort(), ['2022', '2024', '2026']);
});
