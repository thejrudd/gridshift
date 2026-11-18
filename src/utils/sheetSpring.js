// Velocity-carrying spring for mobile sheets (Modal.jsx).
//
// A critically damped spring (bounce 0) has a closed form, so there is no
// per-frame integration and no dependency: the sheet leaves the finger at the
// speed it was released at, then settles without overshoot. `duration` is the
// perceptual settle time in seconds, the same meaning as `duration` on a
// `type: "spring"` animation in Motion (stiffness = (2π / duration)²).

const TWO_PI = Math.PI * 2;

/**
 * @param {{ from: number, to: number, velocity?: number, duration: number }} options
 *   from / to in px, velocity in px/s (positive = toward larger values), duration in s
 * @returns {{ position(t: number): number, velocity(t: number): number }}
 *   t is seconds since the spring started
 */
export function createSpring({ from, to, velocity = 0, duration }) {
  const omega = TWO_PI / Math.max(duration, 0.05);
  const offset = from - to;
  const carry = velocity + omega * offset;
  return {
    position(t) {
      return to + (offset + carry * t) * Math.exp(-omega * t);
    },
    velocity(t) {
      return (carry - omega * (offset + carry * t)) * Math.exp(-omega * t);
    },
  };
}

/**
 * Release velocity (px/s) from recent pointer samples `{ t, y }` (t in ms).
 * Only the last `windowMs` count, so a flick after a slow drag keeps its real
 * speed. A pointer that rested before release (`staleMs`) leaves at zero.
 */
export function estimateReleaseVelocity(samples, now, { windowMs = 100, staleMs = 80 } = {}) {
  if (!samples || samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  if (now - last.t > staleMs) return 0;
  let first = last;
  for (let index = samples.length - 2; index >= 0; index -= 1) {
    if (last.t - samples[index].t > windowMs) break;
    first = samples[index];
  }
  const elapsed = last.t - first.t;
  if (elapsed <= 0) return 0;
  return ((last.y - first.y) / elapsed) * 1000;
}

/**
 * Whether releasing the handle dismisses the sheet. The last direction of
 * travel decides: a flick down dismisses at any distance, but swiping back up
 * (by release velocity, or by having retreated from the lowest point of the
 * drag) cancels even when the sheet is still far down. Only a release that
 * is neither fast nor retreating falls back to distance.
 *
 * offset / peak in px, velocity in px/s (positive = down).
 */
export function shouldDismissSheet({
  offset,
  peak = offset,
  velocity = 0,
  distance = 80,
  flickVelocity = 650,
  cancelVelocity = 200,
  retreat = 16,
}) {
  if (velocity >= flickVelocity) return true;
  if (velocity <= -cancelVelocity) return false;
  if (peak - offset >= retreat) return false;
  return offset >= distance;
}
