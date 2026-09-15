import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SCORING } from '../../src/utils/scoringEngine.js';
import { buildFantasyScoringBreakdown } from '../../src/utils/fantasyBreakdownRows.js';
import {
  buildProjectionContext,
  getProjectionScoreTone,
  isStarterGameStarted,
  projectFromGameInfo,
} from '../../src/utils/starterProjections.js';

function playerInfo() {
  return {
    playerId: 'qb-1',
    id: 'qb-1',
    position: 'QB',
    team: 'BUF',
    weekly: [],
    weekEntry: null,
    oppTeam: 'HOU',
    isHome: true,
    isIndoor: false,
    homeTeam: 'BUF',
  };
}

test('shared starter projections use BDL when current-season history is unavailable', () => {
  const context = buildProjectionContext({
    weeklyStats: {},
    players: { 'qb-1': { full_name: 'Josh Allen', position: 'QB', team: 'BUF' } },
    scheduleMap: null,
    scoringSettings: DEFAULT_SCORING,
    week: 1,
    providerProjections: new Map([['qb-1', {
      projected: 21.4,
      min: null,
      max: null,
      factors: { source: 'balldontlie' },
    }]]),
  });

  const projection = projectFromGameInfo(playerInfo(), context);
  assert.equal(projection.projected, 21.4);
  assert.equal(projection.factors.source, 'balldontlie');
});

test('shared starter projections prefer BDL over the local current-season model when both are available', () => {
  const context = buildProjectionContext({
    weeklyStats: {
      'qb-1': [
        { week: 1, pass_yd: 300, pass_td: 3 },
        { week: 2, pass_yd: 270, pass_td: 2 },
      ],
    },
    players: { 'qb-1': { full_name: 'Josh Allen', position: 'QB', team: 'BUF' } },
    scheduleMap: null,
    scoringSettings: DEFAULT_SCORING,
    week: 3,
    providerProjections: new Map([['qb-1', {
      projected: 19.6,
      min: null,
      max: null,
      factors: { source: 'balldontlie' },
    }]]),
  });

  const projection = projectFromGameInfo({
    ...playerInfo(),
    weekly: context.weeklyStats['qb-1'],
  }, context);
  assert.equal(projection.projected, 19.6);
  assert.equal(projection.factors.source, 'balldontlie');
});

test('shared starter projections fall back to two positive prior-season games without BDL', () => {
  const historicalWeeklyStats = {
    'qb-1': [
      { week: 1, pass_yd: 250, pass_td: 2 },
      { week: 2, pass_yd: 220, pass_td: 1 },
    ],
  };
  const context = buildProjectionContext({
    weeklyStats: {},
    players: { 'qb-1': { full_name: 'Josh Allen', position: 'QB', team: 'BUF' } },
    scheduleMap: null,
    scoringSettings: DEFAULT_SCORING,
    week: 1,
    historicalWeeklyStats,
  });

  const projection = projectFromGameInfo(playerInfo(), context);
  assert.ok(projection);
  assert.equal(projection.factors.source, 'prior-season');
  assert.ok(projection.projected > 0);
});

test('game-start state distinguishes pre-kickoff zeroes from live and final games', () => {
  const nowMs = Date.parse('2026-09-07T12:00:00.000Z');
  assert.equal(isStarterGameStarted({
    scheduleEntry: { kickoff: '2026-09-08T12:00:00.000Z', completed: false },
    fallbackPoints: 0,
    nowMs,
  }), false);
  assert.equal(isStarterGameStarted({
    scheduleEntry: { kickoff: '2026-09-07T11:00:00.000Z', completed: false },
    fallbackPoints: 0,
    nowMs,
  }), true);
  assert.equal(isStarterGameStarted({
    scheduleEntry: { completed: true },
    fallbackPoints: 0,
    nowMs,
  }), true);
  assert.equal(isStarterGameStarted({
    scheduleEntry: { kickoff: '2026-09-08T12:00:00.000Z', completed: false },
    fallbackPoints: 12.5,
    nowMs,
  }), false);
  assert.equal(isStarterGameStarted({
    scheduleEntry: null,
    weekEntry: { week: 1, pass_yd: 0 },
    fallbackPoints: 0,
    nowMs,
  }), true);
});

test('projection score tone ignores rounding noise and marks meaningful deltas', () => {
  assert.equal(getProjectionScoreTone(16.9, 16.9), 'default');
  assert.equal(getProjectionScoreTone(16.86, 16.9), 'default');
  assert.equal(getProjectionScoreTone(17.0, 16.9), 'positive');
  assert.equal(getProjectionScoreTone(16.8, 16.9), 'negative');
  assert.equal(getProjectionScoreTone(null, 16.9), 'default');
});

test('availability scaling keeps projected D/ST tier flags meaningful', () => {
  const context = buildProjectionContext({
    weeklyStats: {},
    players: {
      'dst-1': {
        full_name: 'Buffalo D/ST',
        position: 'DEF',
        team: 'BUF',
        injury_status: 'Questionable',
      },
    },
    scheduleMap: null,
    scoringSettings: { ...DEFAULT_SCORING, sack: 1, pts_allow_7_13: 4 },
    week: 1,
    providerProjections: new Map([['dst-1', {
      projected: 10,
      min: null,
      max: null,
      projectedStats: { sack: 2, pts_allow_7_13: 1 },
      factors: { source: 'balldontlie' },
    }]]),
  });

  const projection = projectFromGameInfo({
    playerId: 'dst-1',
    id: 'dst-1',
    position: 'DEF',
    team: 'BUF',
    weekly: [],
    weekEntry: null,
    oppTeam: 'HOU',
    isHome: true,
    isIndoor: false,
    homeTeam: 'BUF',
  }, context);

  assert.equal(projection.projected, 8.5);
  assert.equal(projection.projectedStats.sack, 1.7);
  assert.equal(projection.projectedStats.pts_allow_7_13, 1);

  const breakdown = buildFantasyScoringBreakdown(
    projection.projectedStats,
    { ...DEFAULT_SCORING, sack: 1, pts_allow_7_13: 4 },
    'DST',
    {
      authoritativeTotal: projection.projected,
      includeFallbackTotal: false,
      preferRawStats: true,
      adjustmentLabel: 'Projection Adjustment',
    },
  );
  assert.equal(breakdown.total, projection.projected);
  assert.equal(breakdown.rows.find(row => row.key === 'scoring_adjustment')?.pts, 2.8);
});
