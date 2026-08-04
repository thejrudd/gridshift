const finite = (value) => Number.isFinite(Number(value));

/**
 * Returns the points that define one team's visible score path.
 *
 * Play-built series identify the side that scored at each point, so opponent
 * timestamps never introduce flat kinks. Fallback history has no side metadata
 * and continues to infer score changes from adjacent totals.
 *
 * Points that share an x-coordinate are retained when their score differs.
 * Collapsing those points would leave their score dots detached from the path.
 */
export function buildTeamLinePoints(points = [], sideKey) {
  const valueAt = (point) => Number(point?.[sideKey]) || 0;
  const valid = points.filter((point) => finite(point?.x));
  if (!valid.length) return [];

  const lastIndex = valid.length - 1;
  const hasSideMetadata = valid.some((point) => point?.side === 'a' || point?.side === 'b');
  const selected = valid.filter((point, index) => (
    index === 0
    || index === lastIndex
    || (hasSideMetadata
      ? point.side === sideKey
      : valueAt(point) !== valueAt(valid[index - 1]))
  ));

  return selected.reduce((result, point) => {
    const previous = result.at(-1);
    if (previous?.x === point.x && valueAt(previous) === valueAt(point)) {
      result[result.length - 1] = point;
    } else {
      result.push(point);
    }
    return result;
  }, []);
}

/** Samples the straight SVG path at an arbitrary x-coordinate. */
export function sampleLineValue(points = [], valueKey, targetX) {
  const valid = points.filter((point) => finite(point?.x) && finite(point?.[valueKey]));
  if (!valid.length) return undefined;

  const x = Number(targetX) || 0;
  const exact = [...valid].reverse().find((point) => Number(point.x) === x);
  if (exact) return Number(exact[valueKey]);

  const rightIndex = valid.findIndex((point) => Number(point.x) > x);
  if (rightIndex <= 0) {
    return Number((rightIndex === 0 ? valid[0] : valid.at(-1))[valueKey]);
  }

  const left = valid[rightIndex - 1];
  const right = valid[rightIndex];
  const span = Number(right.x) - Number(left.x);
  if (span <= 0) return Number(right[valueKey]);
  const ratio = (x - Number(left.x)) / span;
  return Number(left[valueKey]) + (Number(right[valueKey]) - Number(left[valueKey])) * ratio;
}

/** Finds a score dot only when the pointer is close in both dimensions. */
export function findClosestMark(marks = [], {
  pointerX,
  pointerY,
  xAt,
  yAt,
  radius,
}) {
  const limit = Math.max(0, Number(radius) || 0);
  let closest = null;
  let closestDistance = limit;

  marks.forEach((mark) => {
    const x = xAt(mark.x);
    const y = yAt(mark.y);
    const distance = Math.hypot(pointerX - x, pointerY - y);
    if (distance > closestDistance) return;
    closest = mark;
    closestDistance = distance;
  });

  return closest;
}
