import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SCORING } from '../../src/utils/scoringEngine.js';
import {
  mapBdlProjectionStats,
  mapFantasyProjectionsToSleeperPlayers,
} from '../../src/utils/fantasyProjections.js';

test('maps BDL projected stat names into GridShift scoring keys', () => {
  const mapped = mapBdlProjectionStats({
    passing_yards: 250,
    passing_touchdowns: 2,
    passing_interceptions: 0.5,
    rushing_yards: 24,
    receptions: 6,
    receiving_yards: 72,
    receiving_touchdowns: 0.4,
  }, 'QB');
  assert.equal(mapped.pass_yd, 250);
  assert.equal(mapped.pass_td, 2);
  assert.equal(mapped.pass_int, 0.5);
  assert.equal(mapped.rush_yd, 24);
  assert.equal(mapped.rec, 6);
  assert.equal(mapped.rec_yd, 72);
  assert.equal(mapped.rec_td, 0.4);
});

test('maps BDL D/ST points-allowed and yards-allowed probability tiers', () => {
  const mapped = mapBdlProjectionStats({
    points_allowed: 10,
    yards_allowed: 248,
    points_allowed_7_to_13: 0.82,
    points_allowed_14_to_17: 0.1,
    yards_allowed_200_to_299: 0.73,
    yards_allowed_300_to_349: 0.2,
  }, 'DST');

  assert.equal(mapped.pts_allow, 10);
  assert.equal(mapped.pts_allow_7_13, 0.82);
  assert.equal(mapped.pts_allow_14_17, 0.1);
  assert.equal(mapped.yds_allow, 248);
  assert.equal(mapped.yds_allow_200_299, 0.73);
  assert.equal(mapped.yds_allow_300_349, 0.2);
});

test('maps unique offensive and team-defense BDL projections to Sleeper players', () => {
  const players = {
    allen: { full_name: 'Josh Allen', position: 'QB', team: 'BUF' },
    billsDefense: { full_name: 'Buffalo D/ST', position: 'DEF', team: 'BUF' },
  };
  const mapped = mapFantasyProjectionsToSleeperPlayers({
    players,
    scoringSettings: { ...DEFAULT_SCORING, sack: 1 },
    projectionRows: [
      {
        id: 1,
        player: { first_name: 'Josh', last_name: 'Allen', position_abbreviation: 'QB' },
        team: { abbreviation: 'BUF' },
        position: 'QB',
        stats: { passing_yards: 250, passing_touchdowns: 2 },
      },
      {
        id: 2,
        player: null,
        team: { abbreviation: 'BUF' },
        position: 'DST',
        stats: { defensive_sacks: 2 },
        projections: [{ total_points: 5, scoring_format: { key: 'half_ppr' } }],
      },
    ],
  });
  assert.equal(mapped.size, 2);
  assert.equal(mapped.get('allen').factors.source, 'balldontlie');
  assert.ok(mapped.get('allen').projected > 0);
  assert.equal(mapped.get('allen').projectedStats.pass_yd, 250);
  assert.equal(mapped.get('allen').projectedStats.pass_td, 2);
  assert.equal(mapped.get('billsDefense').projectedStats.sack, 2);
  assert.equal(mapped.get('billsDefense').projected, 2);
});

test('keeps D/ST projections in team-defense scoring when a league also scores IDP', () => {
  const mapped = mapFantasyProjectionsToSleeperPlayers({
    players: {
      commandersDefense: { full_name: 'Washington Commanders', position: 'DEF', team: 'WAS' },
    },
    scoringSettings: {
      ...DEFAULT_SCORING,
      idp_pd: 5,
      idp_sack: 4,
      idp_int: 7,
      idp_safety: 9,
      positionOverrides: {
        DEF: {
          def_kr_yd: 0.1,
          def_pr_yd: 0.2,
          kr_td: 6,
          blk_kick: 2,
        },
      },
    },
    projectionRows: [{
      id: 3,
      team: { abbreviation: 'WAS' },
      position: 'DST',
      stats: {
        passes_defended: 4.6,
        defensive_sacks: 2.4,
        defensive_interceptions: 0.5,
        defensive_safeties: 0.02,
        kick_return_yards: 27,
        punt_return_yards: 13,
        kick_return_touchdowns: 0.1,
        blocked_kicks: 0.2,
      },
      projections: [{ total_points: 37.1, scoring_format: { key: 'half_ppr' } }],
    }],
  });

  const projection = mapped.get('commandersDefense');
  assert.equal(projection.projected, 6.3);
  assert.equal(projection.projectedStats.def_kr_yd, 27);
  assert.equal(projection.projectedStats.def_pr_yd, 13);
  assert.equal(projection.projectedStats.idp_pd, undefined);
  assert.equal(projection.projectedStats.idp_sack, undefined);
  assert.equal(projection.projectedStats.idp_int, undefined);
  assert.equal(projection.projectedStats.idp_safety, undefined);
});

test('does not substitute a provider D/ST total when the active league scores no D/ST categories', () => {
  const mapped = mapFantasyProjectionsToSleeperPlayers({
    players: {
      commandersDefense: { full_name: 'Washington Commanders', position: 'DEF', team: 'WAS' },
    },
    scoringSettings: {
      ...DEFAULT_SCORING,
      idp_pd: 5,
      idp_sack: 4,
      idp_int: 7,
      idp_safety: 9,
    },
    projectionRows: [{
      id: 4,
      team: { abbreviation: 'WAS' },
      position: 'DST',
      stats: {
        passes_defended: 4.6,
        defensive_sacks: 2.4,
        defensive_interceptions: 0.5,
        defensive_safeties: 0.02,
      },
      projections: [{ total_points: 37.1, scoring_format: { key: 'half_ppr' } }],
    }],
  });

  const projection = mapped.get('commandersDefense');
  assert.equal(projection.projected, 0);
  assert.equal(projection.factors.scoringSource, 'gridshift-custom-scoring');
  assert.equal(projection.projectedStats.idp_pd, undefined);
  assert.equal(projection.projectedStats.idp_sack, undefined);
});

test('does not substitute a provider offensive total when custom scoring returns zero', () => {
  const mapped = mapFantasyProjectionsToSleeperPlayers({
    players: {
      receiver: { full_name: 'Zero Scoring Receiver', position: 'WR', team: 'BUF' },
    },
    scoringSettings: {
      ...DEFAULT_SCORING,
      rec: 0,
      rec_yd: 0,
      rec_td: 0,
    },
    projectionRows: [{
      id: 5,
      player: { first_name: 'Zero Scoring', last_name: 'Receiver', position_abbreviation: 'WR' },
      team: { abbreviation: 'BUF' },
      position: 'WR',
      stats: { receptions: 8, receiving_yards: 90, receiving_touchdowns: 1 },
      projections: [{ total_points: 19.2, scoring_format: { key: 'ppr' } }],
    }],
  });

  const projection = mapped.get('receiver');
  assert.equal(projection.projected, 0);
  assert.equal(projection.factors.scoringSource, 'gridshift-custom-scoring');
});

test('rejects ambiguous provider or Sleeper identity matches', () => {
  const mapped = mapFantasyProjectionsToSleeperPlayers({
    players: {
      one: { full_name: 'Jordan Reed', position: 'TE', team: 'WAS' },
      two: { full_name: 'Jordan Reed', position: 'TE', team: 'WAS' },
    },
    scoringSettings: DEFAULT_SCORING,
    projectionRows: [{
      id: 1,
      player: { first_name: 'Jordan', last_name: 'Reed', position_abbreviation: 'TE' },
      team: { abbreviation: 'WAS' },
      position: 'TE',
      stats: { receptions: 4, receiving_yards: 40 },
    }],
  });
  assert.equal(mapped.size, 0);
});

test('supports individual defensive-player projections through league scoring', () => {
  const mapped = mapFantasyProjectionsToSleeperPlayers({
    players: {
      linebacker: { full_name: 'Production Linebacker', position: 'LB', team: 'BUF' },
    },
    scoringSettings: { ...DEFAULT_SCORING, idp_tkl: 1.5 },
    projectionRows: [{
      id: 9,
      player: { first_name: 'Production', last_name: 'Linebacker', position_abbreviation: 'LB' },
      team: { abbreviation: 'BUF' },
      position: 'LB',
      stats: { total_tackles: 8 },
    }],
  });
  assert.equal(mapped.get('linebacker').projected, 12);
});
