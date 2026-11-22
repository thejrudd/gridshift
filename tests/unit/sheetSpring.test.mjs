import assert from 'node:assert/strict';
import test from 'node:test';

import { createSpring, estimateReleaseVelocity, shouldDismissSheet } from '../../src/utils/sheetSpring.js';

test('spring starts at the release position and velocity', () => {
  const spring = createSpring({ from: 120, to: 0, velocity: 900, duration: 0.45 });
  assert.equal(spring.position(0), 120);
  assert.ok(Math.abs(spring.velocity(0) - 900) < 1e-9);
});

test('spring velocity is the derivative of its position', () => {
  const spring = createSpring({ from: 200, to: 0, velocity: -400, duration: 0.5 });
  const t = 0.12;
  const h = 1e-6;
  const numeric = (spring.position(t + h) - spring.position(t - h)) / (2 * h);
  assert.ok(Math.abs(numeric - spring.velocity(t)) < 1e-3);
});

test('a released spring with no velocity settles without overshoot', () => {
  const spring = createSpring({ from: 160, to: 0, velocity: 0, duration: 0.45 });
  let previous = spring.position(0);
  for (let t = 0.01; t <= 1.2; t += 0.01) {
    const value = spring.position(t);
    assert.ok(value >= -1e-9, 'never crosses the resting position');
    assert.ok(value <= previous + 1e-9, 'moves monotonically toward the target');
    previous = value;
  }
  assert.ok(spring.position(1.2) < 0.01);
});

test('settle time tracks duration', () => {
  const fast = createSpring({ from: 100, to: 0, duration: 0.3 });
  const slow = createSpring({ from: 100, to: 0, duration: 0.6 });
  assert.ok(fast.position(0.4) < slow.position(0.4));
});

test('a fast fling keeps its speed instead of restarting from rest', () => {
  const fling = createSpring({ from: 40, to: 800, velocity: 3000, duration: 0.38 });
  const rest = createSpring({ from: 40, to: 800, velocity: 0, duration: 0.38 });
  assert.ok(fling.position(0.05) > rest.position(0.05) + 60);
  assert.ok(fling.velocity(0) >= 3000 - 1e-9);
});

test('release velocity uses the last 100ms, not the whole drag', () => {
  const samples = [
    { t: 0, y: 0 },
    { t: 400, y: 10 },
    { t: 800, y: 20 },
    { t: 900, y: 40 },
    { t: 950, y: 90 },
  ];
  const velocity = estimateReleaseVelocity(samples, 955);
  assert.ok(velocity > 700 && velocity < 1200, `got ${velocity}`);
});

test('release velocity is zero after the pointer rested', () => {
  const samples = [{ t: 0, y: 0 }, { t: 50, y: 80 }];
  assert.equal(estimateReleaseVelocity(samples, 400), 0);
});

test('release velocity is zero with too few samples', () => {
  assert.equal(estimateReleaseVelocity([], 0), 0);
  assert.equal(estimateReleaseVelocity([{ t: 0, y: 0 }], 10), 0);
});

test('upward drags report a negative velocity', () => {
  const samples = [{ t: 0, y: 100 }, { t: 40, y: 60 }];
  assert.ok(estimateReleaseVelocity(samples, 45) < 0);
});

test('a flick down dismisses even over a short distance', () => {
  assert.equal(shouldDismissSheet({ offset: 30, peak: 30, velocity: 900 }), true);
});

test('a pause past the distance dismisses', () => {
  assert.equal(shouldDismissSheet({ offset: 120, peak: 120, velocity: 0 }), true);
});

test('a short slow drag does not dismiss', () => {
  assert.equal(shouldDismissSheet({ offset: 40, peak: 40, velocity: 100 }), false);
});

test('swiping back up cancels a drag that is still past the distance', () => {
  assert.equal(shouldDismissSheet({ offset: 140, peak: 200, velocity: -50 }), false);
  assert.equal(shouldDismissSheet({ offset: 150, peak: 150, velocity: -400 }), false);
});

test('a small wobble at the bottom of the drag still dismisses', () => {
  assert.equal(shouldDismissSheet({ offset: 118, peak: 124, velocity: 0 }), true);
});
