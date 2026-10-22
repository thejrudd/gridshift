/* Shared helpers for the drilldown charts. */

import { useEffect, useRef, useState } from 'react';

export const r1 = value => Math.round(value * 10) / 10;
export const fmt = (value, digits = 1) => (value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toFixed(digits));
export const sgn = (value, digits = 1) => (value > 0 ? '+' : value < 0 ? '−' : '') + Math.abs(Number(value) || 0).toFixed(digits);
const STAT_TONES = ['var(--color-drilldown-stat-1)', 'var(--color-drilldown-stat-2)', 'var(--color-drilldown-stat-3)', 'var(--color-drilldown-stat-4)'];
export const statTone = (index, pts = 0) => (pts < 0 ? 'var(--color-accent-red)' : STAT_TONES[index % STAT_TONES.length]);

// A phone-width dialog (the same 560px container break the stylesheet uses)
// draws its charts with tighter heights and padding. It keys off the dialog,
// not the chart, because desktop's packed columns also give charts a narrow
// width without being a held-close phone screen.
const COMPACT_DIALOG_WIDTH = 560;

/** `[ref, width, compact]` for a chart drawn at its container's pixel width. */
export function useChartWidth(fallback = 360) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const update = () => {
      const next = Math.floor(element.clientWidth);
      if (next > 0) setWidth(current => (current === next ? current : next));
      const dialog = element.closest('.matchup-breakdown-dialog');
      setCompact(Boolean(dialog && dialog.clientWidth <= COMPACT_DIALOG_WIDTH));
    };
    update();
    const observer = new ResizeObserver(() => requestAnimationFrame(update));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width, compact];
}

