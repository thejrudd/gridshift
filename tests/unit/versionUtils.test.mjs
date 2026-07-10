import assert from 'node:assert/strict';
import test from 'node:test';

import { parseVersion, compareVersions, collectWhatsNew } from '../../src/utils/versionUtils.js';

test('parseVersion handles full, short, and prefixed versions', () => {
  assert.deepEqual(parseVersion('8.1.0'), { major: 8, minor: 1, patch: 0 });
  assert.deepEqual(parseVersion('8.1'), { major: 8, minor: 1, patch: 0 });
  assert.deepEqual(parseVersion('v7.0.4'), { major: 7, minor: 0, patch: 4 });
  assert.equal(parseVersion('not-a-version'), null);
  assert.equal(parseVersion(null), null);
  assert.equal(parseVersion(undefined), null);
});

test('compareVersions orders semver correctly', () => {
  assert.ok(compareVersions('8.0.1', '8.1.0') < 0);
  assert.ok(compareVersions('8.1.0', '8.0.1') > 0);
  assert.equal(compareVersions('8.1.0', '8.1'), 0);
  assert.ok(compareVersions('7.9.9', '8.0.0') < 0);
  assert.ok(compareVersions('8.10.0', '8.9.0') > 0);
  assert.ok(compareVersions('garbage', '1.0.0') < 0);
});

const ENTRIES = [
  { version: '8.1.0', title: 'A' },
  { version: '8.2.0', title: 'B' },
  { version: '9.0.0', title: 'C' },
];

test('collectWhatsNew returns entries in (lastSeen, current], oldest first', () => {
  assert.deepEqual(
    collectWhatsNew(ENTRIES, '8.0.1', '8.2.0').map((e) => e.version),
    ['8.1.0', '8.2.0'],
  );
});

test('collectWhatsNew aggregates all skipped feature versions', () => {
  assert.deepEqual(
    collectWhatsNew(ENTRIES, '8.0.0', '9.0.0').map((e) => e.version),
    ['8.1.0', '8.2.0', '9.0.0'],
  );
});

test('collectWhatsNew returns nothing for a patch-only jump', () => {
  // 8.1.0 already seen; 8.1.1 is a bug-fix version with no entry
  assert.deepEqual(collectWhatsNew(ENTRIES, '8.1.0', '8.1.1'), []);
});

test('collectWhatsNew excludes the lastSeen version itself', () => {
  assert.deepEqual(
    collectWhatsNew(ENTRIES, '8.1.0', '8.2.0').map((e) => e.version),
    ['8.2.0'],
  );
});

test('collectWhatsNew returns nothing when up to date or downgraded', () => {
  assert.deepEqual(collectWhatsNew(ENTRIES, '9.0.0', '9.0.0'), []);
  assert.deepEqual(collectWhatsNew(ENTRIES, '9.0.0', '8.1.0'), []);
});

test('collectWhatsNew is safe with invalid input', () => {
  assert.deepEqual(collectWhatsNew(ENTRIES, null, '9.0.0'), []);
  assert.deepEqual(collectWhatsNew(ENTRIES, '8.0.0', undefined), []);
  assert.deepEqual(collectWhatsNew(null, '8.0.0', '9.0.0'), []);
});
