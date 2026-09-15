import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GAME_DURATION_MS,
  getSleeperStreamLagProgress,
  projectSleeperReplaySlice,
} from '../../src/dev/liveSandbox/liveSandboxReplay.js';

const KICKOFF = '2025-11-23T18:00:00.000Z';

function makeGame(overrides = {}) {
  return {
    id: 1,
    date: KICKOFF,
    home_team: { abbreviation: 'CHI' },
    visitor_team: { abbreviation: 'PIT' },
    home_team_score: 14,
    visitor_team_score: 0,
    ...overrides,
  };
}

// One receiver, one game, one starter — receptions/yards/TDs are all
// positive-scoring so the running total can only ever climb, which is what
// the monotonicity assertions below rely on.
function makeFixture() {
  return {
    season: '2025',
    week: 12,
    league: {
      league_id: 'test-league',
      scoring_settings: { rec: 1, rec_yd: 0.1, rec_td: 6 },
    },
    players: {
      100: {
        player_id: '100',
        full_name: 'Test Player',
        first_name: 'Test',
        last_name: 'Player',
        position: 'WR',
        team: 'CHI',
      },
    },
    matchups: [
      {
        roster_id: 1,
        matchup_id: 1,
        starters: ['100'],
        players: ['100'],
        // Deliberately different from what the box score derives, so a test
        // below can confirm the synthesized stream never reads these back.
        players_points: { 100: 999 },
        points: 999,
      },
    ],
  };
}

// 8 receptions over 80 yards (10 yds/catch) and 2 TDs, so counts advance in
// clean, easily predicted steps as progress moves — see
// quantizeToPlays()/projectStatRowAtProgress() in liveSandboxReplay.js.
const FINAL_STATS_BY_GAME = {
  1: [{
    player: { first_name: 'Test', last_name: 'Player' },
    team: 'CHI',
    receptions: 8,
    receiving_yards: 80,
    receiving_touchdowns: 2,
  }],
};

function slice(progress, lagProgress = 0) {
  return projectSleeperReplaySlice({
    progress,
    lagProgress,
    games: [makeGame()],
    finalStatsByGame: FINAL_STATS_BY_GAME,
    fixture: makeFixture(),
  });
}

function playerStats(result) {
  return result.weeklyStats[100];
}

function playerPoints(result) {
  return result.matchups[0].players_points[100];
}

test('weekly stats and points are monotone non-decreasing as progress advances', () => {
  let previousStats = { receptions: 0, receiving_yards: 0, receiving_touchdowns: 0 };
  let previousPoints = 0;
  for (let step = 0; step <= 100; step += 1) {
    const result = slice(step / 100);
    const stats = playerStats(result);
    const points = playerPoints(result);
    assert.ok(stats.rec >= previousStats.receptions, `rec dropped at step ${step}`);
    assert.ok(stats.rec_yd >= previousStats.receiving_yards, `rec_yd dropped at step ${step}`);
    assert.ok(stats.rec_td >= previousStats.receiving_touchdowns, `rec_td dropped at step ${step}`);
    assert.ok(points >= previousPoints, `points dropped at step ${step}`);
    previousStats = { receptions: stats.rec, receiving_yards: stats.rec_yd, receiving_touchdowns: stats.rec_td };
    previousPoints = points;
  }
});

test('the synthesized stream lags the unlagged slice', () => {
  const unlagged = slice(0.5, 0);
  const lagged = slice(0.5, 0.1);
  const unlaggedStats = playerStats(unlagged);
  const laggedStats = playerStats(lagged);
  assert.equal(unlaggedStats.rec, 4);
  assert.equal(laggedStats.rec, 3);
  assert.ok(laggedStats.rec_yd < unlaggedStats.rec_yd);
  assert.ok(laggedStats.rec_td < unlaggedStats.rec_td);
  assert.ok(playerPoints(lagged) < playerPoints(unlagged));
});

test('points round to the nearest cent', () => {
  const fixture = makeFixture();
  fixture.league.scoring_settings = { rec: 0, rec_yd: 1 / 3, rec_td: 0 };
  const result = projectSleeperReplaySlice({
    progress: 0.5,
    lagProgress: 0,
    games: [makeGame()],
    finalStatsByGame: FINAL_STATS_BY_GAME,
    fixture,
  });
  // 40 receiving yards at progress 0.5 (see the lag test above) times 1/3
  // yields a repeating decimal; it must come out rounded to two places.
  const points = result.matchups[0].players_points[100];
  assert.equal(points, Math.round(points * 100) / 100);
  assert.equal(points, 13.33);
});

test('the stream equals the box-score-derived final at progress 1, regardless of lag', () => {
  const noLag = slice(1, 0);
  const withLag = slice(1, 0.5);
  assert.deepEqual(noLag, withLag);
  const stats = playerStats(noLag);
  assert.equal(stats.rec, 8);
  assert.equal(stats.rec_yd, 80);
  assert.equal(stats.rec_td, 2);
  // 8 + 8 + 12 = 28, and it must come from the box score, never the fixture's
  // own (deliberately different, see makeFixture) stored players_points/points.
  assert.equal(playerPoints(noLag), 28);
  assert.equal(noLag.matchups[0].points, 28);
});

test('the stream is deterministic for the same inputs', () => {
  const first = slice(0.37, 0.05);
  const second = slice(0.37, 0.05);
  assert.deepEqual(first, second);
});

test('lag in progress units is derived from the active-game duration, not wall-clock span', () => {
  const games = [makeGame()];
  const lagProgress = getSleeperStreamLagProgress(games, 20);
  assert.ok(Math.abs(lagProgress - (20_000 / GAME_DURATION_MS)) < 1e-9);
  assert.equal(getSleeperStreamLagProgress([], 20), 0);
});
