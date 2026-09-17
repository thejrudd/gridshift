import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_SCORING } from '../../src/utils/scoringEngine.js';
import { getCachedOffenseAllowedTable, getHeatmapOffenseStatValue } from '../../src/utils/fantasyHeatmapData.js';
import { buildPlayerDefensePerformance } from '../../src/utils/playerDefensePerformance.js';

function twoTeamSchedule(weeks) {
  return Object.fromEntries(weeks.map((week) => [week, {
    OFF: { opp: 'DEF', home: false },
    DEF: { opp: 'OFF', home: true },
  }]));
}

describe('Fantasy Heatmap shared offense aggregation', () => {
  it('aggregates QB sacks taken and interceptions thrown as raw stat modes', () => {
    const players = {
      qbA: { position: 'QB', team: 'BUF' },
      qbB: { position: 'QB', team: 'LAC' },
    };
    const weeklyStats = {
      qbA: [{ week: 1, team: 'BUF', pass_sack: 3, pass_int: 1 }],
      qbB: [{ week: 1, team: 'LAC', pass_sack: 0, pass_int: 2 }],
    };
    const scheduleMap = {};

    assert.equal(getHeatmapOffenseStatValue(weeklyStats.qbA[0], { pass_sack: 0 }, 'QB', 'pass_sack'), 3);
    assert.equal(getHeatmapOffenseStatValue(weeklyStats.qbA[0], { pass_int: 0 }, 'QB', 'pass_int'), 1);
    assert.deepEqual(
      getCachedOffenseAllowedTable(weeklyStats, players, scheduleMap, DEFAULT_SCORING, 'pass_sack'),
      { BUF: { QB: { 1: 3 } } },
    );
    assert.deepEqual(
      getCachedOffenseAllowedTable(weeklyStats, players, scheduleMap, DEFAULT_SCORING, 'pass_int'),
      { BUF: { QB: { 1: 1 } }, LAC: { QB: { 1: 2 } } },
    );
  });

  it('preserves Heatmap’s positive-only values and traded-player fallback team', () => {
    const players = {
      traded: { position: 'WR', team: 'NEW' },
      zero: { position: 'RB', team: 'OLD' },
    };
    const weeklyStats = {
      traded: [
        { week: 1, team: 'OLD', _teamSource: 'espn', rec_yd: 80 },
        { week: 2, rec_yd: 40 },
      ],
      zero: [
        { week: 1, team: 'OLD', rush_yd: 0 },
        { week: 2, team: 'OLD', rush_yd: -4 },
      ],
    };
    const table = getCachedOffenseAllowedTable(weeklyStats, players, {}, DEFAULT_SCORING, 'rec_yd');

    assert.deepEqual(table, { OLD: { WR: { 1: 80, 2: 40 } } });
    assert.deepEqual(getCachedOffenseAllowedTable(weeklyStats, players, {}, DEFAULT_SCORING, 'rush_yd'), {});
  });
});

describe('player defense performance', () => {
  it('includes the selected week once at least one game has finished', () => {
    const players = { target: { position: 'RB', team: 'OFF' } };
    const weeklyStats = { target: [{ week: 2, team: 'OFF', rush_yd: 40 }] };
    const scheduleMap = {
      2: {
        OFF: { opp: 'DEF', completed: true, home: false },
        DEF: { opp: 'OFF', completed: true, home: true },
        OTHER: { opp: 'THIRD', completed: false },
      },
    };
    const result = buildPlayerDefensePerformance({ playerId: 'target', weeklyStats, players, scheduleMap, currentWeek: 2, scoringSettings: DEFAULT_SCORING });
    assert.equal(result.completedThroughWeek, 2);
    assert.equal(result.overall.games, 1);
    assert.equal(result.overall.gameRows[0].isHome, false);
  });

  it('uses only supplied fully completed weeks and retains negative actual fantasy performances', () => {
    const players = {
      target: { position: 'RB', team: 'OFF' },
      peer: { position: 'RB', team: 'OFF' },
    };
    const weeklyStats = {
      target: [
        { week: 1, team: 'OFF', rush_yd: -10 },
        { week: 2, team: 'OFF', rush_yd: 50 },
      ],
      peer: [
        { week: 1, team: 'OFF', rush_yd: 10 },
        { week: 2, team: 'OFF', rush_yd: 10 },
      ],
    };
    const scheduleMap = twoTeamSchedule([1, 2]);

    const partialSlate = buildPlayerDefensePerformance({
      playerId: 'target',
      weeklyStats,
      players,
      scheduleMap,
      scoringSettings: DEFAULT_SCORING,
      completedWeeks: [1],
    });
    assert.equal(partialSlate.completedThroughWeek, 1);
    assert.equal(partialSlate.overall.games, 1);
    assert.equal(partialSlate.overall.points, -1);

    const result = buildPlayerDefensePerformance({
      playerId: 'target',
      weeklyStats: {
        ...weeklyStats,
        target: [
          { week: 1, team: 'OFF', rush_yd: -10 },
          { week: 2, team: 'OFF', rush_yd: 0 },
        ],
      },
      players,
      scheduleMap,
      scoringSettings: DEFAULT_SCORING,
      completedWeeks: [1, 2],
    });
    assert.equal(result.overall.games, 2);
    assert.equal(result.overall.points, -1);
    assert.equal(result.overall.ppg, -0.5);
    assert.equal(result.overall.rank, null);
    assert.match(result.overall.rankingUnavailableReason, /3 qualifying games/);
  });

  it('uses tied defense ranks and ranks a three-game bucket by fantasy PPG', () => {
    const scheduleMap = {};
    for (const week of [1, 2, 3]) {
      scheduleMap[week] = {
        OFFA: { opp: 'DSTRONG', home: false },
        DSTRONG: { opp: 'OFFA', home: true },
        OFFB: { opp: 'DWEAK', home: false },
        DWEAK: { opp: 'OFFB', home: true },
      };
    }
    const repeat = (statLine) => [1, 2, 3].map((week) => ({ week, team: 'OFFA', rec_yd: 0, ...statLine }));
    const players = {
      target: { position: 'RB', team: 'OFFA' },
      tiedPeer: { position: 'RB', team: 'OFFA' },
      lowerPeer: { position: 'RB', team: 'OFFA' },
      receiver: { position: 'WR', team: 'OFFB' },
      strongOffense: { position: 'WR', team: 'DSTRONG' },
      weakOffense: { position: 'WR', team: 'DWEAK' },
    };
    const weeklyStats = {
      target: repeat({ rush_yd: 200 }),
      tiedPeer: repeat({ rush_yd: 200 }),
      lowerPeer: repeat({ rush_yd: 100 }),
      receiver: [1, 2, 3].map((week) => ({ week, team: 'OFFB', rec_yd: 100, rush_yd: 0 })),
      strongOffense: [1, 2, 3].map(week => ({ week, team: 'DSTRONG', rec_yd: 60, rush_yd: 10 })),
      weakOffense: [1, 2, 3].map(week => ({ week, team: 'DWEAK', rec_yd: 80, rush_yd: 20 })),
    };

    const result = buildPlayerDefensePerformance({
      playerId: 'target',
      oppTeam: 'DSTRONG',
      weeklyStats,
      players,
      scheduleMap,
      scoringSettings: DEFAULT_SCORING,
      completedWeeks: [1, 2, 3],
    });
    const receiving = result.metrics.find((metric) => metric.id === 'receiving');
    const strong = receiving.buckets.find((bucket) => bucket.id === 'strong');

    assert.equal(receiving.opponent.rank, 1);
    assert.equal(receiving.opponent.bucket, 'strong');
    assert.equal(strong.games, 3);
    assert.equal(strong.ppg, 20);
    assert.equal(strong.rank, 1);
    assert.equal(strong.peerCount, 3);
  });

  it('keeps QB results visible but withholds a starter-only rank without verified metadata', () => {
    const players = {
      target: { position: 'QB', team: 'OFF' },
      peer: { position: 'QB', team: 'DEF' },
    };
    const weeklyStats = {
      target: [{ week: 1, team: 'OFF', pass_yd: 250, gs: null }],
      peer: [{ week: 1, team: 'DEF', pass_yd: 220, games_started: null }],
    };
    const result = buildPlayerDefensePerformance({
      playerId: 'target',
      weeklyStats,
      players,
      scheduleMap: twoTeamSchedule([1]),
      scoringSettings: DEFAULT_SCORING,
      completedWeeks: [1],
      minPlayerGamesForRank: 1,
    });

    assert.equal(result.overall.games, 1);
    assert.equal(result.overall.ppg, 10);
    assert.equal(result.overall.rank, null);
    assert.match(result.overall.rankingUnavailableReason, /Starting-quarterback eligibility is not verified/);
  });
});


describe('defense performance completeness and eligibility boundaries', () => {
  const teams = Array.from({ length: 32 }, (_, i) => `T${i}`);
  const slate = (complete = true) => Object.fromEntries(teams.map((team, i) => [team, { opp: teams[i ^ 1], completed: complete, home: i % 2 === 0 }]));
  const players = Object.fromEntries(teams.map(team => [team, { position: 'RB', team }]));
  const stats = () => Object.fromEntries(teams.map((team, index) => [team, [1, 2, 3].map(week => ({ week, team, rec_yd: index * 10, rush_yd: index * 5, gp: 1 }))]));

  it('derives the completed period from the full NFL slate and rejects partial finality', () => {
    const result = buildPlayerDefensePerformance({ playerId: 'T0', players, weeklyStats: stats(), scheduleMap: { 1: slate(), 2: { ...slate(), T31: { ...slate().T31, completed: false } }, 3: slate(false) }, scoringSettings: DEFAULT_SCORING });
    assert.equal(result.completedThroughWeek, 1);
    assert.equal(result.overall.games, 1);
    assert.equal(result.overall.rank, null);
  });

  it('preserves explicit zero allowed but withholds classification for missing yard data', () => {
    const weeklyStats = stats();
    const args = { playerId: 'T1', oppTeam: 'T1', players, weeklyStats, scheduleMap: { 1: slate(), 2: slate(), 3: slate() }, scoringSettings: DEFAULT_SCORING };
    const complete = buildPlayerDefensePerformance(args);
    assert.equal(complete.metrics[0].opponent.perGame, 0);
    assert.equal(complete.metrics[0].opponent.rank, 1);
    const missing = { ...weeklyStats, T0: weeklyStats.T0.map(({ rec_yd: _missing, ...row }) => row) };
    const incomplete = buildPlayerDefensePerformance({ ...args, weeklyStats: missing });
    assert.equal(incomplete.metrics[0].opponent.perGame, null);
    assert.equal(incomplete.metrics[0].opponent.rank, null);
    assert.ok(incomplete.metrics[0].coverageReason);
    assert.equal(incomplete.metrics[0].buckets[0].rank, null);
    assert.equal(incomplete.overall.games, 3);
  });

  it('does not count bye rows, string zero games, or unknown schedule opponents', () => {
    const weeklyStats = stats();
    weeklyStats.T0 = [{ week: 1, team: 'T0', rush_yd: 0, gp: '0' }, { week: 2, team: 'BYE', rush_yd: 200 }, { week: 3, team: 'T0', rush_yd: -5, gp: 1 }];
    const result = buildPlayerDefensePerformance({ playerId: 'T0', players, weeklyStats, scheduleMap: { 1: slate(), 2: slate(), 3: slate() }, scoringSettings: DEFAULT_SCORING });
    assert.equal(result.overall.games, 1);
    assert.equal(result.overall.ppg, -0.5);
  });

  it('handles loading nulls and suppresses offense-defense splits for defensive players', () => {
    assert.equal(buildPlayerDefensePerformance({ playerId: 'missing', weeklyStats: null, players: null, scheduleMap: null, scoringSettings: null }).overall.ppg, null);
    const result = buildPlayerDefensePerformance({ playerId: 'defender', players: { defender: { position: 'CB', team: 'T0' } }, weeklyStats: null, scheduleMap: { 1: slate() } });
    assert.equal(result.position, 'DB');
    assert.deepEqual(result.metrics, []);
  });

  it('never promotes a selected backup or a future start into the starter peer pool', () => {
    const qbs = Object.fromEntries(teams.map(team => [team, { position: 'QB', team, depth_chart_order: 1, depth_chart_position: 'QB' }]));
    qbs.backup = { position: 'QB', team: 'T0', depth_chart_order: 2, depth_chart_position: 'QB' };
    const weeklyStats = stats();
    weeklyStats.backup = [1, 2, 3].map(week => ({ week, team: 'T0', pass_yd: 50, gs: 0 }));
    weeklyStats.backup.push({ week: 4, team: 'T0', pass_yd: 400, gs: 1 });
    const result = buildPlayerDefensePerformance({ playerId: 'backup', players: qbs, weeklyStats, scheduleMap: { 1: slate(), 2: slate(), 3: slate(), 4: slate(false) }, scoringSettings: DEFAULT_SCORING });
    assert.equal(result.overall.games, 3);
    assert.equal(result.overall.rank, null);
    assert.match(result.overall.rankingUnavailableReason, /eligibility is not verified/);
  });
});
