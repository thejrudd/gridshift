// Dev-only y-axis scaling choice for the pace chart.
//
// The chart normally reserves headroom for each side's full-week projection,
// so early in a week the actual scoring sits in a thin band at the bottom.
// That is deliberate in production — the projection is the point of reference
// — but it makes score progression hard to read while testing. This lets the
// two be compared side by side without touching production behaviour.
//
//   projection — production behaviour: scale includes the projected totals
//   scoring    — scale follows actual points, so progression fills the chart

import { useEffect, useState } from 'react';

export const CHART_SCALES = Object.freeze([
  { id: 'projection', label: 'Proj scale' },
  { id: 'scoring', label: 'Score scale' },
]);

const listeners = new Set();
let current = 'projection';

export function getChartScale() {
  return current;
}

export function setChartScale(scale) {
  if (!CHART_SCALES.some((entry) => entry.id === scale) || scale === current) return;
  current = scale;
  listeners.forEach((listener) => listener(current));
}

export function useChartScale() {
  const [scale, setScale] = useState(getChartScale);
  useEffect(() => {
    listeners.add(setScale);
    return () => listeners.delete(setScale);
  }, []);
  return scale;
}
