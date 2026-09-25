import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatPlayerHeight,
  formatPlayerMeasurements,
  formatPlayerWeight,
  normalizePlayerMeasurements,
} from '../../src/utils/playerMeasurements.js';

test('formats common feet-and-inches height values', () => {
  assert.equal(formatPlayerHeight(`6' 2\"`), '6′ 2″');
  assert.equal(formatPlayerHeight('6-2'), '6′ 2″');
  assert.equal(formatPlayerHeight('74'), '6′ 2″');
});

test('formats pounds and omits unavailable measurements', () => {
  assert.equal(formatPlayerWeight('205 lbs'), '205 lb');
  assert.equal(formatPlayerWeight(205), '205 lb');
  assert.equal(formatPlayerWeight('205.5'), '205.5 lb');
  assert.equal(formatPlayerHeight('—'), null);
  assert.equal(formatPlayerWeight('0'), null);
});

test('formats only the measurements that are available', () => {
  assert.deepEqual(normalizePlayerMeasurements({ height: `6' 2\"`, weight: null }), {
    height: '6′ 2″',
    weight: null,
  });
  assert.equal(formatPlayerMeasurements({ height: `6' 2\"`, weight: '205' }), 'Height 6′ 2″ · Weight 205 lb');
  assert.equal(formatPlayerMeasurements({ weight: '205 lbs' }, { compact: true }), 'WT 205 lb');
  assert.equal(formatPlayerMeasurements({}), null);
});
