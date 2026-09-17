import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getFantasyLeagueCurrentWeek,
  getFantasyLeagueMaxWeek,
  getSleeperCurrentWeek,
} from '../../src/utils/fantasySeasonWeeks.js';

test('active Sleeper league week follows the next leg after the last scored week', () => {
  assert.equal(getFantasyLeagueCurrentWeek({ settings: { last_scored_leg: 1 } }), 2);
});

test('an unscored Sleeper league starts on Week 1', () => {
  assert.equal(getFantasyLeagueCurrentWeek({ settings: { last_scored_leg: 0 } }), 1);
});

test('explicit Sleeper league week wins over the last scored fallback', () => {
  assert.equal(getFantasyLeagueCurrentWeek({ settings: { leg: 2, last_scored_leg: 1 } }), 2);
});

test('live Sleeper state uses the current regular-season leg', () => {
  assert.equal(getSleeperCurrentWeek({ season: '2026', leg: 2, week: 2, display_week: 2 }, '2026'), 2);
});

test('live Sleeper state does not use a stale display week or another season', () => {
  assert.equal(getSleeperCurrentWeek({ season: '2026', leg: 2, week: 2, display_week: 1 }, '2026'), 2);
  assert.equal(getSleeperCurrentWeek({ league_season: '2026', leg: 2 }, '2025'), null);
});

test('sleeper league ends at the final playoff week', () => {
  const league = {
    season: '2025',
    settings: { playoff_week_start: 15, playoff_teams: 6, playoff_round_type: 0, last_scored_leg: 1 },
  };
  assert.equal(getFantasyLeagueMaxWeek(league), 17);
});

test('four-team sleeper bracket ends a week earlier', () => {
  const league = {
    season: '2025',
    settings: { playoff_week_start: 15, playoff_teams: 4 },
  };
  assert.equal(getFantasyLeagueMaxWeek(league), 16);
});

test('two-week-per-round bracket is clamped to the NFL season length', () => {
  const league = {
    season: '2025',
    settings: { playoff_week_start: 15, playoff_teams: 6, playoff_round_type: 2 },
  };
  assert.equal(getFantasyLeagueMaxWeek(league), 18);
});

test('explicit matchup period count wins over the bracket', () => {
  const league = {
    season: '2025',
    settings: { matchup_periods: 17, playoff_week_start: 15, playoff_teams: 4 },
  };
  assert.equal(getFantasyLeagueMaxWeek(league), 17);
});

test('leagues without schedule settings fall back to the NFL season length', () => {
  assert.equal(getFantasyLeagueMaxWeek({ season: '2025', settings: {} }), 18);
  assert.equal(getFantasyLeagueMaxWeek({ season: '2020', settings: {} }), 17);
  assert.equal(getFantasyLeagueMaxWeek(null), 18);
});

test('pre-2021 seasons never report a week 18', () => {
  const league = {
    season: '2019',
    settings: { matchup_periods: 18 },
  };
  assert.equal(getFantasyLeagueMaxWeek(league), 17);
});
