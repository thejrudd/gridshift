import test from 'node:test';
import assert from 'node:assert/strict';
import { getRankingsProjectionEligibility } from '../../src/utils/rankingsProjectionEligibility.js';

const eligible = (player = {}, options = {}) => getRankingsProjectionEligibility({
  player: { team: 'BUF', status: 'Active', active: true, ...player },
  position: player.position ?? 'WR',
  week: 7,
  ...options,
});

test('suppresses a bye only when a populated weekly schedule confirms the team has no game', () => {
  const scheduleMap = {
    7: {
      BUF: { opp: 'MIA', home: true },
      MIA: { opp: 'BUF', home: false },
    },
  };

  assert.deepEqual(eligible({ team: 'GB' }, { scheduleMap }), {
    eligible: false,
    reason: 'bye',
    availabilityFactor: 0,
  });
  assert.equal(eligible({ team: 'BUF' }, { scheduleMap }).eligible, true);
  assert.equal(eligible({ team: 'GB' }, { scheduleMap: null }).eligible, true);
  assert.equal(eligible({ team: 'GB' }, { scheduleMap: { 7: {} } }).eligible, true);
});

test('suppresses unavailable or inactive players but preserves the existing doubtful and questionable adjustments', () => {
  for (const injury_status of ['Out', 'IR', 'PUP', 'NFI', 'Suspended', 'Inactive', 'DNP']) {
    const result = eligible({ injury_status });
    assert.equal(result.eligible, false, injury_status);
    assert.equal(result.reason, 'unavailable', injury_status);
  }
  assert.equal(eligible({ active: false }).reason, 'inactive-player');
  assert.equal(eligible({ injury_status: 'Doubtful' }).availabilityFactor, 0.25);
  assert.equal(eligible({ injury_status: 'Questionable' }).availabilityFactor, 0.85);
});

test('suppresses backup quarterbacks when depth-chart order is known and above one', () => {
  assert.equal(eligible({ position: 'QB', depth_chart_order: 2 }).reason, 'backup-qb');
  assert.equal(eligible({ position: 'QB', depth_chart_order: '3' }).reason, 'backup-qb');
  assert.equal(eligible({ position: 'QB', depth_chart_order: 1 }).eligible, true);
  assert.equal(eligible({ position: 'QB' }).eligible, true);
  assert.equal(eligible({ position: 'RB', depth_chart_order: 2 }).eligible, true);
});
