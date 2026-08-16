import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatProviderGameClock,
  parseProviderGameClock,
  reconcileProviderClockAnchor,
  resolveProviderAnchoredGameClock,
} from '../../src/utils/providerAnchoredGameClock.js';

const START = Date.parse('2026-09-13T17:00:00.000Z');

function resolve(overrides = {}) {
  return resolveProviderAnchoredGameClock({
    status: 'live',
    period: '1',
    providerClock: '13:42',
    anchorChangedAt: START,
    now: START,
    ...overrides,
  });
}

test('parses and formats provider clocks without consulting wall-clock time', () => {
  assert.equal(parseProviderGameClock('13:42'), 822);
  assert.equal(parseProviderGameClock('1:05'), 65);
  assert.equal(parseProviderGameClock('1:60'), null);
  assert.equal(formatProviderGameClock(65), '1:05');
});

test('counts down from the provider anchor using the explicit now value', () => {
  assert.equal(resolve({ now: START + 3_000 }).clock, '13:39');
});

test('freezes after ten seconds without a changed provider anchor', () => {
  const atLimit = resolve({ now: START + 10_000 });
  const afterLimit = resolve({ now: START + 24_000 });

  assert.equal(atLimit.clock, '13:32');
  assert.equal(atLimit.frozenReason, 'stale');
  assert.equal(afterLimit.clock, '13:32');
  assert.equal(afterLimit.stale, true);
});

test('freezes for halftime, delay, final, and an explicitly stale feed', () => {
  ['halftime', 'delayed', 'final'].forEach((status) => {
    assert.equal(resolve({ status, now: START + 5_000 }).clock, '13:42');
  });
  assert.equal(resolve({
    feedStale: true,
    now: START + 5_000,
    previousDisplayClock: '13:39',
  }).clock, '13:39');
});

test('does not animate through 2:00 or 0:00 without a new provider anchor', () => {
  assert.equal(resolve({ providerClock: '2:03', now: START + 4_000 }).clock, '2:00');
  assert.equal(resolve({ providerClock: '2:00', now: START + 8_000 }).clock, '2:00');
  assert.equal(resolve({ providerClock: '0:00', now: START + 8_000 }).clock, '0:00');
});

test('snaps to provider corrections above five seconds', () => {
  assert.equal(resolve({
    providerClock: '13:30',
    previousDisplayClock: '13:40',
  }).clock, '13:30');
});

test('gently applies one-to-five-second provider corrections without counting upward', () => {
  assert.equal(resolve({
    providerClock: '13:38',
    previousDisplayClock: '13:42',
  }).clock, '13:40');
  assert.equal(resolve({
    providerClock: '13:45',
    previousDisplayClock: '13:42',
  }).clock, '13:42');
});

test('provider period changes bypass gentle correction', () => {
  assert.equal(resolve({
    period: '2',
    providerClock: '15:00',
    previousPeriod: '1',
    previousDisplayClock: '0:02',
  }).clock, '15:00');
});

test('preserves anchor age for unchanged snapshots and resets it when provider clock changes', () => {
  const first = reconcileProviderClockAnchor(null, {
    status: 'live',
    live: { period: '2', clock: '8:14' },
  }, { observedAt: START });
  const unchanged = reconcileProviderClockAnchor(first, {
    status: 'live',
    live: { period: '2', clock: '8:14' },
  }, { observedAt: START + 1_000 });
  const changed = reconcileProviderClockAnchor(unchanged, {
    status: 'live',
    live: { period: '2', clock: '8:07' },
  }, { observedAt: START + 2_000 });

  assert.equal(unchanged.live.providerClockAnchor.changedAt, START);
  assert.equal(unchanged.live.providerClockAnchor.observedAt, START + 1_000);
  assert.equal(changed.live.providerClockAnchor.changedAt, START + 2_000);
});
