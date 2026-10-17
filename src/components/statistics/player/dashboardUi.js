// Non-component helpers shared by the player dashboard components.
import { createContext, useContext, useEffect, useState } from 'react';

export const ZONES = ['deep-left', 'deep-middle', 'deep-right', 'short-left', 'short-middle', 'short-right'];

export const LANES = [['le', 'Left end'], ['lt', 'Left side'], ['mid', 'Middle'], ['rt', 'Right side'], ['re', 'Right end']];

export const DashboardTipContext = createContext(null);

/** The dashboard tooltip controller: show, hide, pin, isTouch, pinnedElement. */
export function useDashboardTip() {
  return useContext(DashboardTipContext);
}

/** Props that attach a tooltip to any element. Plain text; array items become lines. */
export function tipAttrs(title, body) {
  return {
    'data-tip-title': title || undefined,
    'data-tip': Array.isArray(body) ? body.filter(Boolean).join('\n') : body || undefined,
  };
}

/**
 * Content width of an element, tracked across resizes and rotation. Returns a
 * callback ref, so it measures whichever node actually mounts.
 */
export function useMeasuredWidth() {
  const [el, setEl] = useState(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return undefined;
    const measure = () => {
      const style = getComputedStyle(el);
      const next = Math.floor(el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
      if (next > 0) setWidth((previous) => (Math.abs(previous - next) >= 2 ? next : previous));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(el);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [el]);
  return [setEl, width];
}
