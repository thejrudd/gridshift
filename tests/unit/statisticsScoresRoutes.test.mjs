import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAppPath, normalizeAppRoute, parseAppRoute } from '../../src/utils/appRoutes.js';

test('Statistics Scores routes preserve season, phase, week, matchup, tab, and player category', () => {
  const path = '/statistics/scores?season=2026&phase=preseason&week=2&game=1393548&tab=players&group=rushing';
  const route = parseAppRoute('/statistics/scores', '?season=2026&phase=preseason&week=2&game=1393548&tab=players&group=rushing');

  assert.equal(route.statisticsScoresSeason, 2026);
  assert.equal(route.statisticsScoresPhase, 'preseason');
  assert.equal(route.statisticsScoresWeek, 2);
  assert.equal(route.statisticsScoresGameId, '1393548');
  assert.equal(route.statisticsScoresSection, 'players');
  assert.equal(route.statisticsScoresPlayerGroup, 'rushing');
  assert.equal(buildAppPath(route), path);
});

test('Statistics Scores routes preserve an explicit regular phase and ignore a player category outside Players', () => {
  const route = normalizeAppRoute({
    activeTab: 'statistics',
    statisticsView: 'scores',
    statisticsScoresSeason: '2026',
    statisticsScoresPhase: 'regular',
    statisticsScoresWeek: 'reg-07',
    statisticsScoresGameId: 'fixture-live-favorite',
    statisticsScoresSection: 'overview',
    statisticsScoresPlayerGroup: 'rushing',
  });

  assert.equal(route.statisticsScoresPhase, 'regular');
  assert.equal(route.statisticsScoresWeek, 7);
  assert.equal(route.statisticsScoresPlayerGroup, null);
  assert.equal(
    buildAppPath(route),
    '/statistics/scores?season=2026&phase=regular&week=7&game=fixture-live-favorite',
  );
});

test('Statistics Scores drops drilldown-only state when no matchup is selected', () => {
  const route = parseAppRoute('/statistics/scores', '?season=2026&week=7&game=&tab=plays&group=passing');

  assert.equal(route.statisticsScoresGameId, null);
  assert.equal(route.statisticsScoresSection, 'overview');
  assert.equal(route.statisticsScoresPlayerGroup, null);
  assert.equal(buildAppPath(route), '/statistics/scores?season=2026&week=7');
});
