import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEVICE_SYNC_TOKEN_STORAGE_KEY,
  readDeviceSyncToken,
  readDeviceSyncTokenMap,
  writeDeviceSyncToken,
} from '../../src/utils/deviceSyncCredentials.js';

function createStorage(initialValue = null) {
  const values = new Map();
  if (initialValue != null) values.set(DEVICE_SYNC_TOKEN_STORAGE_KEY, initialValue);
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test('Device Sync credentials preserve each Sleeper user during identity hydration and switching', () => {
  const storage = createStorage(JSON.stringify({
    'user-a': 'token-a',
    'user-b': 'token-b',
  }));

  assert.equal(readDeviceSyncToken(null, storage), '');
  assert.equal(readDeviceSyncToken('user-a', storage), 'token-a');
  assert.equal(readDeviceSyncToken('user-b', storage), 'token-b');
  assert.deepEqual(readDeviceSyncTokenMap(storage), {
    'user-a': 'token-a',
    'user-b': 'token-b',
  });
});

test('Device Sync setup and revocation update only the active Sleeper user', () => {
  const storage = createStorage(JSON.stringify({ 'user-a': 'token-a' }));

  writeDeviceSyncToken('user-b', 'token-b', storage);
  assert.equal(readDeviceSyncToken('user-a', storage), 'token-a');
  assert.equal(readDeviceSyncToken('user-b', storage), 'token-b');

  writeDeviceSyncToken('user-b', '', storage);
  assert.equal(readDeviceSyncToken('user-a', storage), 'token-a');
  assert.equal(readDeviceSyncToken('user-b', storage), '');
});

test('Device Sync credentials fail closed for malformed or unavailable storage', () => {
  const malformedStorage = createStorage('{bad json');
  assert.deepEqual(readDeviceSyncTokenMap(malformedStorage), {});
  assert.equal(readDeviceSyncToken('user-a', malformedStorage), '');
  assert.doesNotThrow(() => writeDeviceSyncToken('', 'token', malformedStorage));
  assert.equal(readDeviceSyncToken('user-a', null), '');
});
