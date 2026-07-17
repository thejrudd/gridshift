import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_DISPLAY_SIZE,
  DISPLAY_SIZE_STORAGE_KEY,
  applyDisplaySize,
  normalizeDisplaySize,
  persistDisplaySize,
  readDisplaySize,
} from '../../src/utils/displayPreferences.js';

function createStorage(initialValue = null) {
  const values = new Map();
  if (initialValue != null) values.set(DISPLAY_SIZE_STORAGE_KEY, initialValue);
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
}

test('display size defaults and invalid values normalize to comfortable', () => {
  assert.equal(normalizeDisplaySize(null), DEFAULT_DISPLAY_SIZE);
  assert.equal(normalizeDisplaySize('unexpected'), DEFAULT_DISPLAY_SIZE);
  assert.equal(normalizeDisplaySize('compact'), 'compact');
  assert.equal(normalizeDisplaySize('large'), 'large');
});

test('display size reads and persists the supported storage contract', () => {
  const storage = createStorage('large');
  assert.equal(readDisplaySize(storage), 'large');
  assert.equal(persistDisplaySize('compact', storage), 'compact');
  assert.equal(readDisplaySize(storage), 'compact');
  assert.equal(persistDisplaySize('invalid', storage), DEFAULT_DISPLAY_SIZE);
  assert.equal(readDisplaySize(storage), DEFAULT_DISPLAY_SIZE);
});

test('display size applies the normalized root attribute before rendering', () => {
  const attributes = new Map();
  const root = { setAttribute(name, value) { attributes.set(name, value); } };

  assert.equal(applyDisplaySize('large', root), 'large');
  assert.equal(attributes.get('data-display-size'), 'large');
  assert.equal(applyDisplaySize('invalid', root), DEFAULT_DISPLAY_SIZE);
  assert.equal(attributes.get('data-display-size'), DEFAULT_DISPLAY_SIZE);
});

test('storage failures remain non-fatal', () => {
  const failingStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };

  assert.equal(readDisplaySize(failingStorage), DEFAULT_DISPLAY_SIZE);
  assert.equal(persistDisplaySize('large', failingStorage), 'large');
});
