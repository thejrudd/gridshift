import test from 'node:test';
import assert from 'node:assert/strict';

import {
  matchesJerseyNumber,
  normalizeJerseyNumber,
  parseSearchQuery,
} from '../../src/utils/parseSearchQuery.js';

test('parses jersey numbers alongside team and position in any order', () => {
  const raiders = parseSearchQuery('Raiders 29');
  assert.deepEqual([...raiders.team], ['lv']);
  assert.deepEqual([...raiders.number], ['29']);
  assert.deepEqual([...raiders.pos], []);

  const tightEnd = parseSearchQuery('29 TE');
  assert.deepEqual([...tightEnd.number], ['29']);
  assert.deepEqual([...tightEnd.pos], ['TE']);
});

test('parses NFL team abbreviations alongside positions', () => {
  const filters = parseSearchQuery('gb rb');

  assert.deepEqual([...filters.team], ['gb']);
  assert.deepEqual([...filters.pos], ['RB']);
  assert.deepEqual(filters.name, []);
});

test('parses full team and position phrases with a jersey number', () => {
  const filters = parseSearchQuery('Green Bay Tight End 31');

  assert.deepEqual([...filters.team], ['gb']);
  assert.deepEqual([...filters.pos], ['TE']);
  assert.deepEqual([...filters.number], ['31']);
  assert.deepEqual(filters.name, []);
});

test('accepts hash-prefixed and leading-zero jersey numbers', () => {
  assert.equal(normalizeJerseyNumber('#29'), '29');
  assert.equal(normalizeJerseyNumber('00'), '0');
  assert.equal(normalizeJerseyNumber('100'), '');

  assert.equal(matchesJerseyNumber('29', '29'), true);
  assert.equal(matchesJerseyNumber('#00', '0'), true);
  assert.equal(matchesJerseyNumber('31', '29'), false);
});

test('ignores jersey-number labels and still supports spaced hash notation', () => {
  const filters = parseSearchQuery('Raiders jersey number # 29');

  assert.deepEqual([...filters.team], ['lv']);
  assert.deepEqual([...filters.number], ['29']);
  assert.deepEqual(filters.name, []);
});
