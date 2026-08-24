import assert from 'node:assert/strict';
import test from 'node:test';

import { getFantasyLeagueMaxWeek } from '../../src/utils/fantasySeasonWeeks.js';

test('sleeper league ends at the final playoff week', () => {
  const league = {
    season: '2025',
    settings: { playoff_week_start: 15, playoff_teams: 6, playoff_round_type: 0 },
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
