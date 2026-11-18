import assert from 'node:assert/strict';
import test from 'node:test';
import { isFinalGame, isLiveGame } from '../../src/utils/liveScoringFeed.js';
import { normalizeBdlScoreboardGame } from '../../src/utils/balldontlieNflScoreboard.js';
import { classifyNflGameStatus, isNflGameActive } from '../../src/utils/nflGameStatus.js';

const scores = (game) => normalizeBdlScoreboardGame({ id: 1, visitor_team: { abbreviation: 'A' }, home_team: { abbreviation: 'B' }, ...game }).status;

test('one classifier names every lifecycle state', () => {
  assert.equal(classifyNflGameStatus({ status: 'Sun, 09/07 - 1:00 PM EDT', status_state: 'scheduled' }), 'scheduled');
  assert.equal(classifyNflGameStatus({ status: '11:27 - 3rd' }), 'live');
  assert.equal(classifyNflGameStatus({ status: 'Halftime', status_state: 'in_progress' }), 'halftime');
  assert.equal(classifyNflGameStatus({ status: 'Weather Delay', status_state: 'delayed' }), 'delayed');
  assert.equal(classifyNflGameStatus({ status: 'Postponed' }), 'postponed');
  assert.equal(classifyNflGameStatus({ status: 'Final/OT' }), 'final');
});

test('a final game is never live, whatever its text adds', () => {
  for (const status of ['Final', 'Final/OT', 'Final - Overtime']) {
    assert.equal(isLiveGame({ status }), false, status);
    assert.equal(isFinalGame({ status }), true, status);
    assert.equal(isNflGameActive({ status }), false, status);
  }
  // `isLiveGame` used to read "Final - Overtime" as live too.
  assert.equal(isLiveGame({ status: 'Final - Overtime', status_state: 'in_progress' }), false);
});

test('isFinalGame still waits for the provider\'s final text', () => {
  assert.equal(isFinalGame({ status: '0:00 - 4th', status_state: 'completed' }), false);
  assert.equal(scores({ status: '0:00 - 4th', status_state: 'completed' }), 'final');
  assert.equal(isFinalGame({ status: 'Completed' }), true);
});

test('halftime is in progress; a delay is in progress only while the provider says so', () => {
  assert.equal(isLiveGame({ status: 'Halftime' }), true);
  assert.equal(isLiveGame({ status: '', status_state: 'halftime' }), true);
  assert.equal(isLiveGame({ status: 'Delayed', status_state: 'in_progress' }), true);
  assert.equal(isLiveGame({ status: 'Delayed' }), false);
  assert.equal(isNflGameActive({ status: 'Delayed' }), true);
});

test('Scores reads quarter and overtime text the way Fantasy Live does', () => {
  assert.equal(scores({ status: '2nd Qtr' }), 'live');
  assert.equal(scores({ status: 'Overtime' }), 'live');
  assert.equal(isLiveGame({ status: 'Q3' }), true);
});
