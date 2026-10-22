import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGameWeekExport,
  toSerializable,
} from '../../src/utils/gameWeekExport.js';

const league = {
  league_id: 'league-1',
  name: 'Test League',
  roster_positions: ['QB'],
  settings: { last_scored_leg: 1 },
};

const rosters = [
  { roster_id: 1, owner_id: 'user-1', players: ['player-1'], starters: ['player-1'] },
  { roster_id: 2, owner_id: 'user-2', players: ['player-2'], starters: ['player-2'] },
];

const users = [
  { user_id: 'user-1', display_name: 'Manager One', metadata: { team_name: 'The Winners' } },
  { user_id: 'user-2', display_name: 'Manager Two', metadata: { team_name: 'The Losers' } },
];

test('builds an LLM-ready selected-week bundle with authoritative zeroes and records', () => {
  const bundle = buildGameWeekExport({
    season: '2026',
    fantasyWeek: 1,
    league,
    rosters,
    leagueUsers: users,
    players: {
      'player-1': { full_name: 'Player One', position: 'QB', team: 'BUF' },
      'player-2': { full_name: 'Player Two', position: 'QB', team: 'NYJ' },
    },
    weeklyStatsByPlayer: {
      'player-1': [{ week: 1, pass_yd: 0, gp: 1 }],
      'player-2': [{ week: 1, pass_yd: 100, gp: 1 }],
    },
    rawWeeklyStatsByPlayer: {
      'player-1': { week: 1, pass_yd: 0, gp: 1 },
      'player-2': { week: 1, pass_yd: 100, gp: 1 },
    },
    seasonStatsByPlayer: {
      'player-1': { pass_yd: 0, gp: 1 },
      'player-2': { pass_yd: 100, gp: 1 },
    },
    scoringSettings: { pass_yd: 0.04 },
    matchupRows: [
      { roster_id: 1, matchup_id: 1, players: ['player-1'], starters: ['player-1'], players_points: { 'player-1': 0 }, points: 0 },
      { roster_id: 2, matchup_id: 1, players: ['player-2'], starters: ['player-2'], players_points: { 'player-2': 4 }, points: 4 },
    ],
    coverage: {
      weeklyPlayerStats: { status: 'complete', players: 2, scope: 'selected_week' },
      fantasyMatchups: { status: 'complete', rows: 2 },
    },
  });

  const player = bundle.fantasy.weeklyPlayerStats.find((row) => row.playerId === 'player-1');
  assert.equal(bundle.format, 'gridshift-stats-export');
  assert.equal(bundle.schemaVersion, 2);
  assert.equal(bundle.scope.mode, 'full_stats');
  assert.equal(player.fantasyPoints, 0);
  assert.equal(player.fantasyPointsSource, 'sleeper.players_points');
  assert.equal(player.weeklyRank, 2);
  assert.equal(bundle.fantasy.outcomes[0].winnerRosterId, '2');
  assert.equal(bundle.fantasy.records.selectedWeek.highestScoreInLoss.score, 0);
  assert.equal(bundle.coverage.weeklyPlayerStats.status, 'complete');
  assert.equal(bundle.raw.sleeper.seasonStats['player-1'].pass_yd, 0);
  assert.equal(JSON.stringify(bundle).includes('[Circular]'), false);
});

test('uses Sleeper custom_points as the official team-score override in weekly exports', () => {
  const bundle = buildGameWeekExport({
    season: '2026',
    fantasyWeek: 1,
    league,
    rosters,
    leagueUsers: users,
    matchupRows: [
      { roster_id: 1, matchup_id: 1, points: 212.515, custom_points: 212.515, players: [], starters: [] },
      { roster_id: 2, matchup_id: 1, points: 172.46, custom_points: 172.46, players: [], starters: [] },
    ],
    includeRaw: false,
  });

  const teamsByRosterId = Object.fromEntries(bundle.fantasy.teamPerformances.map((team) => [team.rosterId, team]));
  assert.deepEqual([teamsByRosterId['1'].score, teamsByRosterId['2'].score], [212.52, 172.46]);
  assert.deepEqual(bundle.fantasy.outcomes[0].scores, { 1: 212.52, 2: 172.46 });
  assert.equal(teamsByRosterId['1'].scoreSource, 'sleeper.matchups.custom_points');
  assert.equal(bundle.fantasy.records.selectedWeek.highestCombinedScore.combinedScore, 384.98);
});

test('builds a fantasy-points-only export with player totals, individual scores, and matchup results', () => {
  const bundle = buildGameWeekExport({
    season: '2026',
    fantasyWeek: 1,
    league,
    rosters,
    leagueUsers: users,
    players: {
      'player-1': { full_name: 'Player One', position: 'QB', team: 'BUF' },
      'player-2': { full_name: 'Player Two', position: 'QB', team: 'NYJ' },
    },
    weeklyStatsByPlayer: {
      'player-1': [{ week: 1, pass_yd: 0, gp: 1 }],
      'player-2': [{ week: 1, pass_yd: 100, gp: 1 }],
    },
    rawWeeklyStatsByPlayer: {
      'player-1': { week: 1, pass_yd: 0, gp: 1 },
      'player-2': { week: 1, pass_yd: 100, gp: 1 },
    },
    seasonStatsByPlayer: {
      'player-1': { pass_yd: 0, gp: 1 },
      'player-2': { pass_yd: 100, gp: 1 },
    },
    scoringSettings: { pass_yd: 0.04 },
    matchupRows: [
      { roster_id: 1, matchup_id: 1, players: ['player-1'], starters: ['player-1'], players_points: { 'player-1': 0 }, points: 0 },
      { roster_id: 2, matchup_id: 1, players: ['player-2'], starters: ['player-2'], players_points: { 'player-2': 4 }, points: 4 },
    ],
    exportMode: 'fantasy_points_only',
  });

  assert.equal(bundle.format, 'gridshift-stats-export');
  assert.equal(bundle.schemaVersion, 2);
  assert.equal(bundle.scope.mode, 'fantasy_points_only');
  assert.equal(bundle.fantasy.playerTotals.find((row) => row.playerId === 'player-1').weeklyFantasyPoints, 0);
  assert.equal(bundle.fantasy.playerTotals.find((row) => row.playerId === 'player-1').seasonToDate.fantasyPoints, 0);
  assert.equal(bundle.fantasy.individualScores.find((row) => row.playerId === 'player-2').points, 4);
  assert.equal(bundle.fantasy.teamScores.find((row) => row.rosterId === '1').score, 0);
  assert.equal(bundle.fantasy.teamScores.find((row) => row.rosterId === '2').result, 'win');
  assert.equal(bundle.fantasy.matchupOutcomes[0].winnerRosterId, '2');
  assert.equal('raw' in bundle, false);
  assert.equal('nfl' in bundle, false);
  assert.equal('storylineSignals' in bundle, false);
});

test('serializes repeated references without mistaking them for cycles', () => {
  const shared = { value: 7 };
  assert.deepEqual(toSerializable({ left: shared, right: shared }), {
    left: { value: 7 },
    right: { value: 7 },
  });
});
