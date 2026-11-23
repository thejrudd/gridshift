import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyClockStoppage,
  formatProviderGameClock,
  isTwoMinuteWarningPeriod,
  latestPlayExplainsSample,
  parseProviderGameClock,
  reconcileProviderClockAnchor,
  resolveClockAgeCapMs,
  resolveProviderAnchoredGameClock,
  resolveSampleStoppage,
} from '../../src/utils/providerAnchoredGameClock.js';

const START = Date.parse('2026-09-13T17:00:00.000Z');

function resolve(overrides = {}) {
  return resolveProviderAnchoredGameClock({
    status: 'live',
    period: '1',
    providerClock: '13:42',
    anchorChangedAt: START,
    anchorKey: '1|13:42',
    now: START,
    ...overrides,
  });
}

test('parses and formats provider clocks without consulting wall-clock time', () => {
  assert.equal(parseProviderGameClock('13:42'), 822);
  assert.equal(parseProviderGameClock('03:52'), 232);
  assert.equal(parseProviderGameClock('1:05'), 65);
  assert.equal(parseProviderGameClock('1:60'), null);
  assert.equal(formatProviderGameClock(65), '1:05');
});

test('counts down from the provider anchor using the explicit now value', () => {
  assert.equal(resolve({ now: START + 3_000 }).clock, '13:39');
  assert.equal(resolve({ now: START + 3_000 }).frozen, false);
});

test('holds once the sample is older than the age cap', () => {
  const atLimit = resolve({ now: START + 10_000 });
  const afterLimit = resolve({ now: START + 24_000 });
  assert.equal(atLimit.clock, '13:32');
  assert.equal(atLimit.frozenReason, 'stale');
  assert.equal(afterLimit.clock, '13:32');
  assert.equal(afterLimit.stale, true);
});

test('age cap is 1.5x the sample interval, floored at 10s and capped at 15s', () => {
  assert.equal(resolveClockAgeCapMs(), 10_000);
  assert.equal(resolveClockAgeCapMs(1_000), 10_000);
  assert.equal(resolveClockAgeCapMs(8_000), 12_000);
  assert.equal(resolveClockAgeCapMs(30_000), 15_000);
  assert.equal(resolve({ now: START + 14_000, ageCapMs: 12_000 }).clock, '13:30');
});

test('holds for halftime, delay, final, and an explicitly stale feed', () => {
  ['halftime', 'delayed', 'final'].forEach((status) => {
    assert.equal(resolve({ status, now: START + 5_000 }).clock, '13:42');
  });
  assert.equal(resolve({
    feedStale: true,
    now: START + 5_000,
    previousDisplayClock: '13:39',
    previousAnchorKey: '1|13:42',
  }).clock, '13:39');
});

test('two-minute warning applies to Q2, Q4, and overtime only', () => {
  assert.equal(isTwoMinuteWarningPeriod(1), false);
  assert.equal(isTwoMinuteWarningPeriod(3), false);
  assert.equal(isTwoMinuteWarningPeriod(2), true);
  assert.equal(isTwoMinuteWarningPeriod(4), true);
  assert.equal(isTwoMinuteWarningPeriod(5), true);
});

test('Q1 and Q3 tick straight through 2:00', () => {
  assert.equal(resolve({ period: '1', providerClock: '2:03', now: START + 5_000 }).clock, '1:58');
  assert.equal(resolve({ period: '3', providerClock: '2:00', now: START + 4_000 }).clock, '1:56');
});

test('Q2, Q4, and overtime hold at 2:00 until a provider sample moves past it', () => {
  ['2', '4', '5'].forEach((period) => {
    const resolved = resolve({ period, providerClock: '2:03', now: START + 6_000 });
    assert.equal(resolved.clock, '2:00');
    assert.equal(resolved.frozenReason, 'boundary');
    assert.equal(resolve({ period, providerClock: '2:00', now: START + 8_000 }).clock, '2:00');
  });
  assert.equal(resolve({ period: '4', providerClock: '1:58', now: START + 3_000 }).clock, '1:55');
});

test('never ticks below 0:00', () => {
  assert.equal(resolve({ providerClock: '0:03', now: START + 8_000 }).clock, '0:00');
  const zero = resolve({ providerClock: '0:00', now: START + 8_000 });
  assert.equal(zero.clock, '0:00');
  assert.equal(zero.frozen, true);
});

test('a period change snaps to the sample', () => {
  assert.equal(resolve({
    period: '2',
    providerClock: '15:00',
    anchorKey: '2|15:00',
    previousPeriod: '1',
    previousDisplayClock: '0:02',
    previousAnchorKey: '1|0:02',
  }).clock, '15:00');
});

test('a new sample above a display that ran ahead snaps up once', () => {
  const snapped = resolve({
    providerClock: '13:40',
    anchorKey: '1|13:40',
    previousDisplayClock: '13:35',
    previousAnchorKey: '1|13:42',
  });
  assert.equal(snapped.clock, '13:40');
});

test('without a new sample the display never moves up', () => {
  // Same sample; a stoppage arrives without a new clock value.
  assert.equal(resolve({
    providerClock: '13:42',
    previousDisplayClock: '13:38',
    previousAnchorKey: '1|13:42',
    stopped: true,
    now: START + 4_000,
  }).clock, '13:38');
  // Same sample; the page was paused.
  assert.equal(resolve({
    previousDisplayClock: '13:38',
    previousAnchorKey: '1|13:42',
    paused: true,
    now: START + 4_000,
  }).clock, '13:38');
  // Legacy callers that pass no anchor key never count up.
  assert.equal(resolveProviderAnchoredGameClock({
    status: 'live',
    period: '1',
    providerClock: '14:55',
    anchorChangedAt: START,
    now: START,
    previousDisplayClock: '12:27',
  }).clock, '12:27');
});

test('a display behind the sample eases down quickly, and snaps beyond ten seconds', () => {
  assert.equal(resolve({
    providerClock: '13:38',
    anchorKey: '1|13:38',
    previousDisplayClock: '13:42',
    previousAnchorKey: '1|13:42',
  }).clock, '13:40');
  assert.equal(resolve({
    providerClock: '13:36',
    anchorKey: '1|13:36',
    previousDisplayClock: '13:42',
    previousAnchorKey: '1|13:42',
  }).clock, '13:39');
  assert.equal(resolve({
    providerClock: '13:30',
    anchorKey: '1|13:30',
    previousDisplayClock: '13:42',
    previousAnchorKey: '1|13:42',
  }).clock, '13:30');
  assert.equal(resolve({
    providerClock: '13:41',
    previousDisplayClock: '13:42',
    previousAnchorKey: '1|13:42',
  }).clock, '13:41');
});

test('a stopped sample holds at the provider value', () => {
  const held = resolve({
    providerClock: '12:48',
    anchorKey: '1|12:48',
    previousDisplayClock: '12:44',
    previousAnchorKey: '1|12:55',
    stopped: true,
    now: START + 6_000,
  });
  assert.equal(held.clock, '12:48');
  assert.equal(held.frozenReason, 'stoppage');
  assert.equal(resolve({ providerClockFrozen: true, now: START + 6_000 }).clock, '13:42');
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

test('anchors changed clocks to provider fetch time while retaining browser receipt time', () => {
  const fetchedAt = START - 3_000;
  const anchored = reconcileProviderClockAnchor(null, {
    status: 'live',
    live: { period: '1', clock: '8:14' },
  }, {
    observedAt: START,
    providerFetchedAt: fetchedAt,
  });

  assert.equal(anchored.live.providerClockAnchor.changedAt, fetchedAt);
  assert.equal(anchored.live.providerClockAnchor.providerFetchedAt, fetchedAt);
  assert.equal(anchored.live.providerClockAnchor.observedAt, START);
  assert.equal('sampleAgeMs' in anchored.live.providerClockAnchor, false);
});

test('a server sample age anchors in device time, immune to clock skew', () => {
  // The server's clock reads 40s ahead of this device.
  const skewedFetchedAt = START + 40_000 - 2_000;
  const anchored = reconcileProviderClockAnchor(null, {
    status: 'live',
    live: { period: '1', clock: '8:14' },
  }, {
    observedAt: START,
    providerFetchedAt: skewedFetchedAt,
    ageMs: 2_000,
  });

  assert.equal(anchored.live.providerClockAnchor.changedAt, START - 2_000);
  assert.equal(anchored.live.providerClockAnchor.providerFetchedAt, skewedFetchedAt);
  assert.equal(anchored.live.providerClockAnchor.sampleAgeMs, 2_000);
});

test('retains whether an anchor represents a provider clock stoppage', () => {
  const anchored = reconcileProviderClockAnchor(null, {
    status: 'live',
    live: { period: '3', clock: '12:48' },
  }, {
    observedAt: START,
    providerClockFrozen: true,
  });

  assert.equal(anchored.live.providerClockAnchor.providerClockFrozen, true);
});

test('does not anchor a provider timestamp in the future relative to browser receipt', () => {
  const anchored = reconcileProviderClockAnchor(null, {
    status: 'live',
    live: { period: '1', clock: '8:14' },
  }, {
    observedAt: START,
    providerFetchedAt: START + 5_000,
  });

  assert.equal(anchored.live.providerClockAnchor.changedAt, START);
  assert.equal(anchored.live.providerClockAnchor.providerFetchedAt, START + 5_000);
});

// Stoppage classifier.

function play(typeSlug, text = '', extra = {}) {
  return { typeSlug, rawText: text, description: text, period: 1, time: '8:00', ...extra };
}

test('classifies clock-stopping play types with short broadcast reasons', () => {
  const cases = [
    [play('timeout', 'Timeout #1 by DAL'), 'Timeout'],
    [play('official-timeout', 'OFFICIAL TIMEOUT'), 'Timeout'],
    [play('two-minute-warning', 'Two-Minute Warning'), '2-min warning'],
    [play('end-period', 'END QUARTER 1'), 'End of quarter'],
    [play('end-of-half', 'END OF 2ND HALF'), 'End of half'],
    [play('end-of-game', 'END GAME'), 'End of game'],
    [play('coin-toss', 'Coin toss'), 'Coin toss'],
    [play('pass-incompletion', 'J.Allen pass incomplete short left'), 'Incomplete'],
    [play('pass', 'J.Allen spiked the ball to stop the clock'), 'Spike'],
    [play('passing-touchdown', 'pass for TOUCHDOWN'), 'Touchdown'],
    [play('rushing-touchdown', 'run for TOUCHDOWN'), 'Touchdown'],
    [play('field-goal-good', '45 yard field goal is GOOD'), 'Field goal'],
    [play('extra-point-good', 'extra point is GOOD'), 'Extra point'],
    [play('two-point-pass', 'TWO-POINT CONVERSION ATTEMPT'), '2-pt try'],
    [play('safety', 'SAFETY'), 'Safety'],
    [play('punt', 'punts 45 yards'), 'Punt'],
    [play('kickoff', 'kicks 65 yards'), 'Kickoff'],
    [play('field-goal-missed', '52 yard field goal is No Good'), 'No good'],
    [play('pass-interception-return', 'INTERCEPTED'), 'Turnover'],
    [play('rush', 'Fumble lost to the defense.', { narrative: { turnover: true } }), 'Turnover'],
    [play('fumble-recovery-opponent', 'FUMBLES, recovered by'), 'Turnover'],
    [play('sack-opp-fumble-recovery', 'sacked, FUMBLES'), 'Turnover'],
    [play('penalty', 'PENALTY on SF, Defensive Holding'), 'Flag'],
    [play('rush', 'run for 4 yards. PENALTY on KC, Holding, 10 yards'), 'Flag'],
    [play('rush', 'The Replay Official reviewed the runner was down. The ruling was upheld.'), 'Review'],
    [play('rush', 'The Replay Official reviewed the play (J.Jeudy).'), 'Review'],
    [play('rush', 'The ruling on the field stands.'), 'Review'],
    [play('pass-reception', 'Pass complete. DAL challenged the pass completion ruling'), 'Review'],
    [play('rush', 'Walk-off touchdown.', { narrative: { playKind: 'touchdown' } }), 'Touchdown'],
  ];
  cases.forEach(([input, reason]) => {
    assert.deepEqual(classifyClockStoppage(input), { stopped: true, reason }, input.typeSlug);
  });
});

test('a scoring play without a specific slug still stops the clock without a label', () => {
  assert.deepEqual(classifyClockStoppage(play('other', 'Something', { scoring: true })), { stopped: true, reason: null });
});

test('a turnover on downs stops the clock', () => {
  const turnover = play('rush', 'run for 1 yard', { startDown: 4, endDown: 1, startDistance: 3, statYardage: 1 });
  assert.deepEqual(classifyClockStoppage(turnover), { stopped: true, reason: 'Turnover' });
});

test('ordinary in-bounds plays keep the clock running', () => {
  ['rush', 'pass-reception', 'sack'].forEach((slug) => {
    assert.deepEqual(classifyClockStoppage(play(slug, 'gain of 6')), { stopped: false, reason: null });
  });
  assert.deepEqual(classifyClockStoppage(null), { stopped: false, reason: null });
});

test('out of bounds holds the clock in any quarter until the feed advances', () => {
  const oob = play('rush', 'runs to the 30, ran ob at DAL 30 for 6 yards', { period: 1, time: '1:30' });
  assert.deepEqual(resolveSampleStoppage(oob, { period: 1, clock: '1:28' }), { stopped: true, reason: 'Out of bounds' });
  assert.deepEqual(resolveSampleStoppage(oob, { period: 1, clock: '1:20' }), { stopped: false, reason: null });
  assert.deepEqual(classifyClockStoppage(play('rush', 'pushed out of bounds', { period: 4, time: '3:00' })), {
    stopped: true,
    reason: 'Out of bounds',
  });
});

test('a stopping play explains the sample only from its period and near its clock', () => {
  const flag = play('penalty', 'PENALTY on SF', { period: 1, time: '03:52' });
  assert.equal(latestPlayExplainsSample(flag, { period: '1', clockSeconds: 232 }), true);
  assert.equal(latestPlayExplainsSample(flag, { period: '1', clockSeconds: 226 }), true);
  assert.equal(latestPlayExplainsSample(flag, { period: '1', clockSeconds: 224 }), true);
  // The game clock has run on since the flag.
  assert.equal(latestPlayExplainsSample(flag, { period: '1', clockSeconds: 223 }), false);
  assert.equal(latestPlayExplainsSample(flag, { period: '1', clockSeconds: 240 }), false);
  assert.equal(latestPlayExplainsSample(flag, { period: '2', clockSeconds: 232 }), false);
  assert.deepEqual(resolveSampleStoppage(flag, { period: '1', clock: '3:52' }), { stopped: true, reason: 'Flag' });
  assert.deepEqual(resolveSampleStoppage(flag, { period: '1', clock: '3:42' }), { stopped: false, reason: null });
});

test('a timeout is cleared by a more recent game-clock reading or quarter', () => {
  const timeout = play('timeout', 'Timeout #1 by DAL', { period: 3, time: '9:34' });
  assert.deepEqual(resolveSampleStoppage(timeout, { period: 3, clock: '9:34' }), { stopped: true, reason: 'Timeout' });
  assert.deepEqual(resolveSampleStoppage(timeout, { period: 3, clock: '9:33' }), { stopped: false, reason: null });
  assert.deepEqual(resolveSampleStoppage(timeout, { period: 4, clock: '15:00' }), { stopped: false, reason: null });
});
