import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_SCORING } from '../../src/utils/scoringEngine.js';
import {
  buildDefenseRankingRows,
  filterDefenseRankingRows,
  formatDefenseRankingValue,
  getDefaultDefenseRankingStat,
  getDefenseRankingStatOptions,
} from '../../src/utils/defenseRankings.js';

const players = {
  qb1: { player_id: 'qb1', full_name: 'Road QB', position: 'QB', team: 'BUF' },
  rb1: { player_id: 'rb1', full_name: 'Road RB', position: 'RB', team: 'BUF', espn_id: '1234' },
  rb2: { player_id: 'rb2', full_name: 'Home RB', position: 'RB', team: 'KC' },
};

const weeklyStats = {
  qb1: [
    { week: 1, team: 'BUF', opp: 'KC', pass_yd: 250, pass_td: 2, rush_yd: 33 },
    { week: 2, team: 'BUF', opp: 'MIA', pass_yd: 200, rush_yd: 12 },
  ],
  rb1: [
    { week: 1, team: 'BUF', opp: 'KC', rush_att: 18, rush_yd: 100, rush_td: 1, rec: 2, rec_yd: 14 },
    { week: 2, team: 'BUF', opp: 'MIA', rush_att: 12, rush_yd: 40, rec: 1, rec_yd: 5 },
  ],
  rb2: [
    { week: 1, team: 'KC', opp: 'BUF', rush_att: 10, rush_yd: 50, rec: 3, rec_yd: 24 },
  ],
};

const scheduleMap = {
  1: {
    BUF: { opp: 'KC', home: false },
    KC: { opp: 'BUF', home: true },
  },
  2: {
    BUF: { opp: 'MIA', home: true },
    MIA: { opp: 'BUF', home: false },
  },
};

describe('defense rankings', () => {
  it('attributes stat totals to the opposing defense and averages by games played', () => {
    const rows = buildDefenseRankingRows({
      weeklyStats,
      players,
      scheduleMap,
      scoringSettings: DEFAULT_SCORING,
      position: 'RB',
      mode: 'stats',
      stat: 'rush_yd',
      teams: ['BUF', 'KC', 'MIA'],
    });

    const kc = rows.find(row => row.team === 'KC');
    assert.equal(kc.total, 100);
    assert.equal(kc.games, 1);
    assert.equal(kc.avg, 100);
    assert.equal(kc.contributions[0].opponent, 'BUF');
    assert.equal(kc.contributions[0].espnId, '1234');

    const mia = rows.find(row => row.team === 'MIA');
    assert.equal(mia.total, 40);
    assert.equal(mia.games, 1);
  });

  it('passes position into fantasy scoring', () => {
    const scoringSettings = { ...DEFAULT_SCORING, rec: 1, bonus_rec_rb: 0.5 };
    const rows = buildDefenseRankingRows({
      weeklyStats,
      players,
      scheduleMap,
      scoringSettings,
      position: 'RB',
      mode: 'fantasy',
      teams: ['BUF', 'KC', 'MIA'],
    });

    const kc = rows.find(row => row.team === 'KC');
    assert.equal(kc.total, 20.4);
  });

  it('preserves full-list display rank and inverted strength rank after team search filtering', () => {
    const rows = buildDefenseRankingRows({
      weeklyStats,
      players,
      scheduleMap,
      scoringSettings: DEFAULT_SCORING,
      position: 'RB',
      mode: 'stats',
      stat: 'rush_yd',
      teams: ['BUF', 'KC', 'MIA'],
    });
    const filtered = filterDefenseRankingRows(rows, 'MIA');

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].team, 'MIA');
    assert.equal(filtered[0].rank, 3);
    assert.equal(filtered[0].strengthRank, 1);
  });

  it('honors team sort direction', () => {
    const rowsAsc = buildDefenseRankingRows({
      weeklyStats,
      players,
      scheduleMap,
      scoringSettings: DEFAULT_SCORING,
      position: 'RB',
      mode: 'stats',
      stat: 'rush_yd',
      sort: 'team',
      dir: 'asc',
      teams: ['BUF', 'KC', 'MIA'],
    });
    const rowsDesc = buildDefenseRankingRows({
      weeklyStats,
      players,
      scheduleMap,
      scoringSettings: DEFAULT_SCORING,
      position: 'RB',
      mode: 'stats',
      stat: 'rush_yd',
      sort: 'team',
      dir: 'desc',
      teams: ['BUF', 'KC', 'MIA'],
    });

    assert.deepEqual(rowsAsc.map(row => row.team), ['BUF', 'KC', 'MIA']);
    assert.deepEqual(rowsDesc.map(row => row.team), ['MIA', 'KC', 'BUF']);
  });

  it('supports per-game average as a sortable metric', () => {
    const avgWeeklyStats = {
      ...weeklyStats,
      rb2: [
        { week: 1, team: 'KC', opp: 'BUF', rush_att: 10, rush_yd: 75, rec: 3, rec_yd: 24 },
      ],
    };
    const avgScheduleMap = {
      ...scheduleMap,
      2: {
        ...scheduleMap[2],
        KC: { opp: 'DEN', home: false },
        DEN: { opp: 'KC', home: true },
      },
    };

    const totalRows = buildDefenseRankingRows({
      weeklyStats: avgWeeklyStats,
      players,
      scheduleMap: avgScheduleMap,
      scoringSettings: DEFAULT_SCORING,
      position: 'RB',
      mode: 'stats',
      stat: 'rush_yd',
      sort: 'total',
      dir: 'desc',
      teams: ['BUF', 'DEN', 'KC', 'MIA'],
    });
    const avgRows = buildDefenseRankingRows({
      weeklyStats: avgWeeklyStats,
      players,
      scheduleMap: avgScheduleMap,
      scoringSettings: DEFAULT_SCORING,
      position: 'RB',
      mode: 'stats',
      stat: 'rush_yd',
      sort: 'avg',
      dir: 'desc',
      teams: ['BUF', 'DEN', 'KC', 'MIA'],
    });

    assert.deepEqual(totalRows.slice(0, 3).map(row => row.team), ['KC', 'BUF', 'MIA']);
    assert.deepEqual(totalRows.slice(0, 3).map(row => row.strengthRank), [4, 3, 2]);
    assert.deepEqual(avgRows.slice(0, 3).map(row => row.team), ['KC', 'MIA', 'BUF']);
    assert.deepEqual(avgRows.slice(0, 3).map(row => row.strengthRank), [4, 3, 2]);
  });

  it('defaults each position to the first visible stat option', () => {
    assert.equal(getDefaultDefenseRankingStat('QB'), 'pass_yd');
    assert.equal(getDefaultDefenseRankingStat('RB'), 'rush_att');
    assert.equal(getDefaultDefenseRankingStat('WR'), 'rec');
    assert.equal(getDefaultDefenseRankingStat('TE'), 'rec');
  });

  it('keeps QB defense stats focused on allowed yardage and touchdowns', () => {
    assert.deepEqual(getDefenseRankingStatOptions('QB').map(option => option.id), [
      'pass_yd',
      'pass_td',
      'rush_yd',
      'rush_td',
    ]);
  });

  it('formats per-game averages with adaptive precision by stat scale', () => {
    assert.equal(formatDefenseRankingValue(8 / 17, { mode: 'stats', stat: 'rush_td', scope: 'avg' }), '0.47');
    assert.equal(formatDefenseRankingValue(22 / 17, { mode: 'stats', stat: 'rush_td', scope: 'avg' }), '1.3');
    assert.equal(formatDefenseRankingValue(87.44, { mode: 'stats', stat: 'rush_yd', scope: 'avg' }), '87.4');
    assert.equal(formatDefenseRankingValue(125.44, { mode: 'stats', stat: 'rush_yd', scope: 'avg' }), '125');
    assert.equal(formatDefenseRankingValue(13.56, { mode: 'stats', stat: 'rush_att', scope: 'avg' }), '14');
    assert.equal(formatDefenseRankingValue(8, { mode: 'stats', stat: 'rush_td' }), '8');
    assert.equal(formatDefenseRankingValue(8 / 17, { mode: 'fantasy', stat: 'rush_td', scope: 'avg' }), '0.5');
  });
});
