import assert from 'node:assert/strict';
import test from 'node:test';
import { STATISTICS_SCORES_PRESEASON_FIXTURE } from '../../src/data/statisticsScoresFixtures.js';
import { NFL_SEASON_PHASES } from '../../src/utils/espnNflScoreboard.js';
import { resolveStatisticsScoresCurrentWeekId } from '../../src/utils/statisticsScoresWeek.js';

function makeWeek(id, phase, kickoffs) {
  return {
    id,
    phase,
    games: kickoffs.map((kickoff) => ({ kickoff })),
  };
}

const preseasonWeeks = [
  makeWeek('pre-1', NFL_SEASON_PHASES.PRESEASON, ['2026-08-07T00:00:00.000Z']),
  makeWeek('pre-2', NFL_SEASON_PHASES.PRESEASON, ['2026-08-13T23:00:00.000Z']),
  makeWeek('pre-3', NFL_SEASON_PHASES.PRESEASON, ['2026-08-20T23:00:00.000Z']),
];

test('selects Preseason Week 1 at the start of its NFL calendar day before kickoff', () => {
  const currentWeekId = resolveStatisticsScoresCurrentWeekId(preseasonWeeks, {
    phase: NFL_SEASON_PHASES.PRESEASON,
    now: '2026-08-13T17:00:00.000Z',
  });

  assert.equal(currentWeekId, 'pre-2');
});

test('the local preseason fixture reproduces the Hall of Fame to Preseason Week 1 rollover', () => {
  const currentWeekId = resolveStatisticsScoresCurrentWeekId(STATISTICS_SCORES_PRESEASON_FIXTURE.weeks, {
    phase: NFL_SEASON_PHASES.PRESEASON,
    now: '2026-08-13T17:00:00.000Z',
  });

  assert.equal(currentWeekId, 'pre-2');
});

test('keeps Hall of Fame Weekend current until Preseason Week 1 calendar day begins', () => {
  const currentWeekId = resolveStatisticsScoresCurrentWeekId(preseasonWeeks, {
    phase: NFL_SEASON_PHASES.PRESEASON,
    now: '2026-08-13T03:59:59.000Z',
  });

  assert.equal(currentWeekId, 'pre-1');
});

test('preserves kickoff-based rollover for regular-season weeks', () => {
  const regularWeeks = [
    makeWeek('reg-1', NFL_SEASON_PHASES.REGULAR, ['2026-09-11T00:20:00.000Z']),
    makeWeek('reg-2', NFL_SEASON_PHASES.REGULAR, ['2026-09-18T00:15:00.000Z']),
  ];

  assert.equal(resolveStatisticsScoresCurrentWeekId(regularWeeks, {
    phase: NFL_SEASON_PHASES.REGULAR,
    now: '2026-09-17T16:00:00.000Z',
  }), 'reg-1');
});

test('falls back to the first available week when no games have valid kickoff dates', () => {
  const weeks = [
    makeWeek('pre-1', NFL_SEASON_PHASES.PRESEASON, ['not-a-date']),
    makeWeek('pre-2', NFL_SEASON_PHASES.PRESEASON, []),
  ];

  assert.equal(resolveStatisticsScoresCurrentWeekId(weeks), 'pre-1');
});
