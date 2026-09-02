import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isStatisticsScoresDrilldownStatus,
  STATISTICS_SCORES_DRILLDOWN_STATUSES,
} from '../../src/utils/statisticsScoresDrilldown.js';

test('Statistics Scores drilldown includes scheduled games for pregame stories', () => {
  assert.deepEqual(STATISTICS_SCORES_DRILLDOWN_STATUSES, [
    'scheduled',
    'final',
    'live',
    'halftime',
    'delayed',
  ]);

  for (const status of STATISTICS_SCORES_DRILLDOWN_STATUSES) {
    assert.equal(isStatisticsScoresDrilldownStatus(status), true, `${status} should open detail`);
  }

  for (const status of ['postponed', 'partial', 'offline', 'unavailable', '', null]) {
    assert.equal(isStatisticsScoresDrilldownStatus(status), false, `${status} should not open detail`);
  }
});
