import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTeamScoringDrilldownModel } from '../../src/utils/teamScoringDrilldownModel.js';
import { buildMatchupWinProbability } from '../../src/utils/matchupWinProbability.js';

const SCORING = {
  pass_yd: 0.04, pass_td: 4, pass_int: -2,
  rush_yd: 0.1, rush_td: 6,
  rec: 1, rec_yd: 0.1, rec_td: 6,
  fgm: 3, xpm: 1, fum_lost: -2,
};
const NOW = Date.parse('2025-11-23T20:00:00Z');
const PLAYERS = {
  qb: { full_name: 'Test Quarterback', position: 'QB', team: 'NYG' },
  rb: { full_name: 'Test Runner', position: 'RB', team: 'DET' },
  k: { full_name: 'Test Kicker', position: 'K', team: 'KC' },
};
const sum = (rows, key) => Math.round(rows.reduce((total, row) => total + row[key], 0) * 100) / 100;

function starters({ qb = {}, rb = {}, k = {} } = {}) {
  return {
    qb: {
      id: 'qb', name: 'Test Quarterback', position: 'QB', avgPPG: 11.04,
      // A one-game stat line worth 11.04 behind a 15-point projection.
      projection: { projected: 15, projectedStats: { pass_yd: 201, pass_int: 1, rush_yd: 10, rush_td: 1, fum_lost: 1 }, factors: { source: 'sleeper' } },
      scheduleEntry: { kickoff: '2025-11-23T18:00:00Z' },
      ...qb,
    },
    rb: {
      id: 'rb', name: 'Test Runner', position: 'RB', avgPPG: 18,
      projection: { projected: 18, projectedStats: { rush_yd: 80, rush_td: 0.5, rec: 4, rec_yd: 30 }, factors: { source: 'balldontlie' } },
      scheduleEntry: { kickoff: '2025-11-23T18:00:00Z' },
      ...rb,
    },
    k: {
      id: 'k', name: 'Test Kicker', position: 'K', avgPPG: 7.2, projection: null,
      scheduleEntry: { kickoff: '2025-11-25T01:15:00Z' },
      ...k,
    },
  };
}

function spotsFor(lineup) {
  return [
    { slotPos: 'QB', slotLabel: 'QB', player: lineup.qb },
    { slotPos: 'RB', slotLabel: 'RB', player: lineup.rb },
    { slotPos: 'FLEX', slotLabel: 'W/R/T', player: null },
    { slotPos: 'K', slotLabel: 'K', player: lineup.k },
  ];
}

test('pregame: every lineup spot in roster order, projected total equals the masthead projection', () => {
  const lineup = starters();
  const players = Object.values(lineup);
  const model = buildTeamScoringDrilldownModel({ spots: spotsFor(lineup), scoringSettings: SCORING, players: PLAYERS, week: 12, now: NOW });

  assert.equal(model.phase, 'pregame');
  assert.deepEqual(model.spots.map((spot) => spot.label), ['QB', 'RB', 'W/R/T', 'K']);
  assert.equal(model.spots[2].empty, true);
  assert.equal(model.totals.projected, 40.2);

  const masthead = buildMatchupWinProbability({ myPlayers: players, opponentPlayers: players, now: NOW });
  assert.equal(model.totals.projected, masthead.expectedA);

  // Categories add up to each starter's projection; the gap is a visible Model row.
  assert.equal(sum(model.categories, 'projectedPts'), 40.2);
  const qbRows = model.categories.filter((row) => row.playerId === 'qb');
  assert.equal(sum(qbRows, 'projectedPts'), 15);
  assert.ok(qbRows.some((row) => row.group === 'model' && Math.abs(row.projectedPts - 3.96) < 0.001));
  // No stat line: the season average stands in, labelled as an estimate.
  assert.deepEqual(model.categories.filter((row) => row.playerId === 'k').map((row) => [row.label, row.projectedPts]), [['Season average estimate', 7.2]]);

  const groups = Object.fromEntries(model.groups.map((group) => [group.id, group.projected]));
  assert.equal(groups.negative, -4);
  assert.equal(model.groups.find((group) => group.id === 'model').label, 'Other');
  assert.equal(groups.rushing, 18);
  assert.equal(groups.receiving, 7);
  assert.equal(model.spots[0].projectedByGroup.negative, -4);
  assert.deepEqual(model.projectionSources.sort(), ['BALLDONTLIE', 'Season average', 'Sleeper']);
});

test('live: points so far reconcile to displayed points and pace matches the Matchups pace total', () => {
  const lineup = starters({
    qb: { gameStarted: true, weekPts: 12.5 },
    rb: { gameStarted: true, weekPts: 20, scheduleEntry: { kickoff: '2025-11-23T18:00:00Z', completed: true } },
  });
  const players = Object.values(lineup);
  const weeklyStats = {
    qb: [{ week: 12, pass_yd: 200, pass_td: 1 }],
    rb: [{ week: 12, rush_yd: 100, rec: 5, rec_yd: 50 }],
  };
  const spots = spotsFor(lineup).map((spot) => ({ ...spot, points: spot.player?.weekPts ?? null }));
  const model = buildTeamScoringDrilldownModel({ spots, scoringSettings: SCORING, players: PLAYERS, weeklyStats, week: 12, now: NOW });

  assert.equal(model.phase, 'live');
  assert.deepEqual(model.spots.map((spot) => spot.state), ['live', 'final', 'empty', 'pre']);
  assert.equal(model.totals.actual, 32.5);
  assert.equal(sum(model.categories, 'actualPts'), 32.5);
  // 12.00 from the stat line; the other 0.50 is shown, not hidden.
  assert.ok(model.categories.some((row) => row.playerId === 'qb' && row.group === 'model' && Math.abs(row.actualPts - 0.5) < 0.001));

  const masthead = buildMatchupWinProbability({ myPlayers: players, opponentPlayers: players, now: NOW });
  assert.ok(Math.abs(model.totals.paceFinal - masthead.paceExpectedA) <= 0.15, `${model.totals.paceFinal} vs ${masthead.paceExpectedA}`);
  assert.equal(model.spots[1].remaining, 0);
  assert.equal(model.spots[3].remaining, 7.2);
});

test('final: uses the recorded pregame projection and shows a league adjustment to the official total', () => {
  const lineup = starters({
    qb: { gameStarted: true, weekPts: 12, scheduleEntry: { completed: true } },
    rb: { gameStarted: true, weekPts: 20, scheduleEntry: { completed: true } },
    k: { gameStarted: true, weekPts: 9, scheduleEntry: { completed: true } },
  });
  const weeklyStats = {
    qb: [{ week: 12, pass_yd: 200, pass_td: 1 }],
    rb: [{ week: 12, rush_yd: 100, rec: 5, rec_yd: 50 }],
    k: [{ week: 12, fgm: 2, xpm: 3 }],
  };
  const baselines = { qb: { projection: { projected: 14, projectedStats: { pass_yd: 250, pass_td: 1 }, factors: { source: 'sleeper' } } } };
  const spots = spotsFor(lineup).map((spot) => ({ ...spot, points: spot.player?.weekPts ?? null }));
  const model = buildTeamScoringDrilldownModel({
    spots, settled: true, teamPoints: 41.5, baselines, scoringSettings: SCORING, players: PLAYERS, weeklyStats, week: 12, now: NOW,
  });

  assert.equal(model.phase, 'final');
  assert.equal(model.spots[0].projected, 14);
  assert.equal(model.totals.projected, 39.2);
  assert.equal(model.totals.actual, 41.5);
  assert.equal(model.totals.teamAdjustment, 0.5);
  assert.equal(model.totals.diff, 2.3);
  const passYards = model.categories.find((row) => row.playerId === 'qb' && row.key === 'pass_yd');
  assert.equal(passYards.diff, -2);
  assert.equal(sum(model.categories, 'diff'), 2.3);
});

test('D/ST and IDP are their own groups, after offence, whatever the stat key', () => {
  const scoring = { ...SCORING, sack: 1, int: 2, idp_tkl_solo: 1, idp_pd: 1, idp_sack: 2 };
  const players = {
    ...PLAYERS,
    def: { full_name: 'Test Defense', position: 'DEF', team: 'BUF' },
    lb: { full_name: 'Test Linebacker', position: 'LB', team: 'BUF' },
  };
  const spots = [
    { slotPos: 'QB', slotLabel: 'QB', player: starters().qb },
    { slotPos: 'DEF', slotLabel: 'DST', player: { id: 'def', name: 'Test Defense', position: 'DEF', avgPPG: 8, projection: { projected: 8, projectedStats: { sack: 3, int: 1, fum_rec: 0 }, factors: { source: 'sleeper' } } } },
    { slotPos: 'IDP_FLEX', slotLabel: 'IDP', player: { id: 'lb', name: 'Test Linebacker', position: 'LB', avgPPG: 9, projection: { projected: 9, projectedStats: { idp_tkl_solo: 5, idp_pass_def: 1, idp_sack: 0.5 }, factors: { source: 'sleeper' } } } },
  ];
  const model = buildTeamScoringDrilldownModel({ spots, scoringSettings: scoring, players, week: 12, now: NOW });
  const ids = model.groups.map((group) => group.id);
  assert.ok(ids.includes('dst') && ids.includes('idp'));
  assert.ok(ids.indexOf('passing') < ids.indexOf('dst') && ids.indexOf('dst') < ids.indexOf('idp'));
  assert.equal(model.groups.find((group) => group.id === 'dst').label, 'D/ST');
  // A linebacker's pass defended is IDP scoring, never passing.
  assert.deepEqual([...new Set(model.categories.filter((row) => row.playerId === 'lb').map((row) => row.group))].filter((group) => group !== 'model'), ['idp']);
  assert.deepEqual([...new Set(model.categories.filter((row) => row.playerId === 'def').map((row) => row.group))].filter((group) => group !== 'model'), ['dst']);
});
