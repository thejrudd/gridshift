import assert from 'node:assert/strict';
import test from 'node:test';
import { getElapsedSeconds, getGameProgress, parseClockSeconds } from '../../src/utils/playByPlay/gameClock.js';

test('strict clocks reject what a loose reading accepts', () => {
  assert.equal(parseClockSeconds('7:12'), 432);
  assert.equal(parseClockSeconds('7:75'), null);
  assert.equal(parseClockSeconds('Q3 7:12'), null);
  assert.equal(parseClockSeconds('Q3 7:12', { strict: false }), 432);
});

test('a missing clock is unknown unless the caller supplies a stand-in', () => {
  assert.equal(getElapsedSeconds(2, null), null);
  assert.equal(getElapsedSeconds(2, null, { missingClockSecondsLeft: 450 }), 1350);
  assert.equal(getElapsedSeconds(null, '7:00'), null);
});

test('overtime is measured as asked', () => {
  assert.equal(getElapsedSeconds(5, '10:00'), 3600 + 900 - 600);
  assert.equal(getElapsedSeconds(5, '10:00', { overtimePeriodSeconds: 600 }), 3600);
  assert.equal(getGameProgress(5, '5:00', { overtime: 'clamp' }), 1);
  assert.ok(getGameProgress(5, '5:00', { overtime: 'extend' }) > 1);
  assert.equal(getGameProgress(3, '7:30', { overtime: 'clamp' }), 0.625);
});
