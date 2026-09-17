import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  LOADING_EASINGS,
  LOADING_MOTION,
  revealDelay,
  revealIndex,
  revealItemStyle,
  revealTotalDuration,
  loadingMotionAttrs,
} from '../../src/utils/loadingMotion.js';

const CSS = readFileSync(fileURLToPath(new URL('../../src/index.css', import.meta.url)), 'utf8');

function cssToken(name) {
  const match = CSS.match(new RegExp(`^\\s*--${name}:\\s*([^;]+);`, 'm'));
  assert.ok(match, `expected --${name} to be declared in src/index.css`);
  return match[1].trim();
}

function cssMs(name) {
  const raw = cssToken(name);
  const match = raw.match(/^(\d+(?:\.\d+)?)ms$/);
  assert.ok(match, `expected --${name} to be an ms value, got "${raw}"`);
  return Number(match[1]);
}

// The stylesheet and this module are two copies of the same profile. If a knob
// is retuned in one and not the other, the app animates on one set of values
// and times its phases on the other — this test is the tripwire for that.
test('loading motion tokens match the stylesheet', () => {
  assert.equal(cssMs('gs-load-duration'), LOADING_MOTION.duration);
  assert.equal(cssMs('gs-load-stagger'), LOADING_MOTION.stagger);
  assert.equal(cssMs('gs-load-show-after'), LOADING_MOTION.showAfter);
  assert.equal(cssMs('gs-load-min-hold'), LOADING_MOTION.minimumHold);
  assert.equal(cssMs('gs-load-gate'), LOADING_MOTION.coalesceGate);
  assert.equal(cssMs('gs-load-handoff-fade'), LOADING_MOTION.handoffFade);
  assert.equal(Number(cssToken('gs-load-stagger-cap')), LOADING_MOTION.staggerCap);
  assert.equal(cssToken('gs-load-ease'), LOADING_EASINGS.broadcast);
  assert.equal(cssToken('gs-load-ease-overshoot'), LOADING_EASINGS.overshoot);
  assert.equal(cssToken('gs-load-ease-decelerate'), LOADING_EASINGS.decelerate);
  assert.equal(cssToken('gs-load-ease-standard'), LOADING_EASINGS.standard);
});

test('the auto-stagger cap in CSS matches staggerCap', () => {
  // `.gridshift-reveal--auto > *:nth-child(n+8)` is where the delay freezes;
  // the multiplier in its delay must equal the cap. Every row past it still
  // animates — it just shares that delay.
  const match = CSS.match(/\.gridshift-reveal--auto > \*:nth-child\(n\+(\d+)\)\s*\{\s*animation-delay:\s*calc\((\d+) \* var\(--gs-load-stagger\)\);/);
  assert.ok(match, 'expected the auto-stagger cap rule to be present');
  assert.equal(Number(match[2]), LOADING_MOTION.staggerCap);
  assert.equal(Number(match[1]), LOADING_MOTION.staggerCap + 1);
  assert.doesNotMatch(
    CSS,
    /\.gridshift-reveal--auto > \*:nth-child\(n\+\d+\)\s*\{\s*animation:\s*none;/,
    'rows past the cap must still animate — skipping them leaves a pre-painted tail',
  );
});

test('reveal entrances fill backwards, never forwards', () => {
  // `opacity: 0` + `forwards` makes a filling animation the permanent owner of
  // the element's visible state, so any frame that re-creates it paints the
  // element invisible. Regression guard for the cascading row flicker.
  const rules = [
    /\.gridshift-reveal__item\s*\{([^}]*)\}/,
    /\.gridshift-reveal--auto > \*\s*\{([^}]*)\}/,
    /\.gs-section-skeleton\s*\{([^}]*)\}/,
  ];
  for (const pattern of rules) {
    const match = CSS.match(pattern);
    assert.ok(match, `expected ${pattern} to be present`);
    const body = match[1];
    assert.match(body, /backwards/, `${pattern} should fill backwards`);
    assert.doesNotMatch(body, /forwards/, `${pattern} should not fill forwards`);
    assert.doesNotMatch(body, /opacity:\s*0\b/, `${pattern} should not set a base opacity of 0`);
  }
});

test('revealIndex applies the chosen order', () => {
  assert.equal(revealIndex(0, 5, 'top-down'), 0);
  assert.equal(revealIndex(4, 5, 'top-down'), 4);
  assert.equal(revealIndex(0, 5, 'bottom-up'), 4);
  assert.equal(revealIndex(4, 5, 'bottom-up'), 0);
  // Centre-out: the middle row leads, and the pairs either side share a beat.
  assert.equal(revealIndex(2, 5, 'center-out'), 0);
  assert.equal(revealIndex(1, 5, 'center-out'), 1);
  assert.equal(revealIndex(3, 5, 'center-out'), 1);
  assert.equal(revealIndex(0, 5, 'center-out'), 2);
  // Defensive: a bad index never produces a negative delay.
  assert.equal(revealIndex(-3, 5, 'top-down'), 0);
  assert.equal(revealIndex(0, 0, 'bottom-up'), 0);
});

test('revealDelay caps the stagger so long lists settle', () => {
  assert.equal(revealDelay(0, 30), 0);
  assert.equal(revealDelay(3, 30), 3 * LOADING_MOTION.stagger);
  assert.equal(revealDelay(LOADING_MOTION.staggerCap, 30), LOADING_MOTION.staggerCap * LOADING_MOTION.stagger);
  // Every row past the cap shares the cap's delay rather than trailing further.
  assert.equal(revealDelay(29, 30), LOADING_MOTION.staggerCap * LOADING_MOTION.stagger);
});

test('revealTotalDuration reports when a reveal has settled', () => {
  assert.equal(revealTotalDuration(1), LOADING_MOTION.duration);
  assert.equal(revealTotalDuration(3), 2 * LOADING_MOTION.stagger + LOADING_MOTION.duration);
  assert.equal(
    revealTotalDuration(100),
    LOADING_MOTION.staggerCap * LOADING_MOTION.stagger + LOADING_MOTION.duration,
  );
});

test('revealItemStyle hands CSS a capped index', () => {
  assert.deepEqual(revealItemStyle(2, 10), { '--gs-reveal-index': 2 });
  assert.deepEqual(revealItemStyle(40, 50), { '--gs-reveal-index': LOADING_MOTION.staggerCap });
});

test('loadingMotionAttrs only emits attributes that differ from the default', () => {
  assert.deepEqual(loadingMotionAttrs(), {});
  assert.deepEqual(
    loadingMotionAttrs({ entrance: LOADING_MOTION.entrance, texture: LOADING_MOTION.texture, handoff: LOADING_MOTION.handoff }),
    {},
  );
  assert.deepEqual(loadingMotionAttrs({ entrance: 'fade', texture: 'pulse' }), {
    'data-gs-entrance': 'fade',
    'data-gs-texture': 'pulse',
  });
});
