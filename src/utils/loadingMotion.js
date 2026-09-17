/**
 * Loading motion — the named knobs behind every GridShift skeleton and reveal.
 *
 * This is the JS mirror of the `--gs-load-*` custom properties declared in
 * `src/index.css`. CSS owns the animations; this module owns the decisions that
 * have to happen in JavaScript (when a skeleton is allowed to appear, how long
 * it has to stay, which row goes first). `tests/unit/loadingMotion.test.mjs`
 * parses the stylesheet and fails if the two ever drift apart.
 *
 * Full prose glossary, per-surface rollout status, and the rationale for each
 * default: docs/Loading Motion.md. Change a value in BOTH places.
 */

/**
 * The signed-off Fantasy loading profile.
 *
 * duration      ms one row's entrance animation runs, start to settled.
 * stagger       ms between one row starting and the next starting. Row N begins
 *               at N x stagger; 0 means the whole list arrives at once. Tight
 *               on purpose: the cascade should read as one motion sweeping down
 *               the list, not as rows queueing up.
 * staggerCap    row index past which the delay stops growing. Rows beyond this
 *               are below the fold, and trickling them in trails the reveal
 *               after the surface has already settled. They still animate, they
 *               just share the cap's delay.
 * easing        name of the speed curve, keyed into LOADING_EASINGS.
 * entrance      the gesture a row uses to arrive (see LOADING_ENTRANCES).
 * order         which row goes first (see LOADING_ORDERS).
 * texture       what a placeholder does while it waits (see LOADING_TEXTURES).
 * handoff       how the skeleton gives way to content (see LOADING_HANDOFFS).
 * showAfter     ms a surface stays as bare structure before any skeleton shows.
 *               Loads that finish inside this window never flash a placeholder.
 * minimumHold   ms a skeleton stays once it HAS appeared, so a load that
 *               resolves a frame later does not strobe.
 * coalesceGate  ms of grace after the first data fragment lands. Anything
 *               arriving inside it reveals on the same clock; later fragments
 *               come in as their own second wave rather than holding the list.
 * handoffFade   ms the skeleton lingers under arriving content during a
 *               cross-fade or row-by-row handoff.
 * rails         whether a row's leading accent bar grows as its own beat.
 * countUp       whether numeric values tick up to their value on arrival.
 *               Off: on data-dense fantasy rows it reads as instability.
 */
export const LOADING_MOTION = Object.freeze({
  duration: 500,
  stagger: 20,
  staggerCap: 7,
  easing: 'broadcast',
  entrance: 'lift',
  order: 'top-down',
  texture: 'sweep',
  handoff: 'row-by-row',
  showAfter: 120,
  minimumHold: 240,
  coalesceGate: 90,
  handoffFade: 300,
  rails: true,
  countUp: false,
});

/** Named speed curves. `broadcast` is the app standard. */
export const LOADING_EASINGS = Object.freeze({
  broadcast: 'cubic-bezier(0.32, 0.72, 0, 1)',
  overshoot: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
  standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
});

/** How a row arrives. Passed to CSS as [data-gs-entrance]. */
export const LOADING_ENTRANCES = Object.freeze(['lift', 'fade', 'wipe', 'scale', 'slide']);

/** Which row goes first. Applied here, not in CSS — it is an index transform. */
export const LOADING_ORDERS = Object.freeze(['top-down', 'bottom-up', 'center-out']);

/** What a placeholder does while it waits. Passed to CSS as [data-gs-texture]. */
export const LOADING_TEXTURES = Object.freeze(['sweep', 'pulse', 'build', 'static']);

/** How the skeleton gives way. Passed to CSS as [data-gs-handoff]. */
export const LOADING_HANDOFFS = Object.freeze(['cut', 'cross-fade', 'row-by-row']);

/**
 * Turn a document-order index into a reveal index under the chosen order.
 * `center-out` deliberately returns a fractional distance so pairs either side
 * of the middle share a beat.
 */
export function revealIndex(index, count, order = LOADING_MOTION.order) {
  if (!Number.isFinite(index) || index < 0) return 0;
  const n = Number.isFinite(count) && count > 0 ? count : 1;
  if (order === 'bottom-up') return Math.max(0, n - 1 - index);
  if (order === 'center-out') return Math.abs(index - (n - 1) / 2);
  return index;
}

/**
 * Delay in ms before row `index` starts, with the stagger cap applied.
 * Use this when a surface has to hand a delay to inline styles or to a timer;
 * list containers using `.gridshift-reveal--auto` get the same result from CSS.
 */
export function revealDelay(index, count, {
  order = LOADING_MOTION.order,
  stagger = LOADING_MOTION.stagger,
  staggerCap = LOADING_MOTION.staggerCap,
} = {}) {
  const capped = Math.min(revealIndex(index, count, order), staggerCap);
  return Math.round(capped * stagger);
}

/**
 * Total wall time of a staggered reveal: the last row's delay plus one duration.
 * Useful for deciding when a surface has settled (e.g. before capturing an
 * export image, or before announcing to a screen reader).
 */
export function revealTotalDuration(count, {
  duration = LOADING_MOTION.duration,
  stagger = LOADING_MOTION.stagger,
  staggerCap = LOADING_MOTION.staggerCap,
} = {}) {
  const rows = Number.isFinite(count) && count > 0 ? count : 1;
  return Math.min(rows - 1, staggerCap) * stagger + duration;
}

/**
 * The style object a surface hands to a single reveal item when it is NOT using
 * the auto-stagger container (i.e. it knows its own index).
 */
export function revealItemStyle(index, count, options = {}) {
  return { '--gs-reveal-index': Math.min(revealIndex(index, count, options.order ?? LOADING_MOTION.order), options.staggerCap ?? LOADING_MOTION.staggerCap) };
}

/**
 * The data-* attributes a reveal container needs for a non-default profile.
 * Omitting a key leaves the token default in place, which is what nearly every
 * Fantasy surface wants — pass nothing and you get the signed-off profile.
 */
export function loadingMotionAttrs({ entrance, texture, handoff } = {}) {
  const attrs = {};
  if (entrance && entrance !== LOADING_MOTION.entrance) attrs['data-gs-entrance'] = entrance;
  if (texture && texture !== LOADING_MOTION.texture) attrs['data-gs-texture'] = texture;
  if (handoff && handoff !== LOADING_MOTION.handoff) attrs['data-gs-handoff'] = handoff;
  return attrs;
}

export default LOADING_MOTION;
