import { useEffect, useState } from 'react';

function getCssVar(style, name, fallback = '') {
  return style.getPropertyValue(name).trim() || fallback;
}

function getSubtleForForeground(foreground) {
  return foreground === '#FFFFFF'
    ? 'rgba(255,255,255,0.16)'
    : 'rgba(12,15,20,0.12)';
}

function getBorderForForeground(foreground) {
  return foreground === '#FFFFFF'
    ? 'rgba(255,255,255,0.26)'
    : 'rgba(12,15,20,0.18)';
}

function getShadowForForeground(foreground) {
  return foreground === '#FFFFFF'
    ? '0 1px 2px rgba(0,0,0,0.28)'
    : '0 1px 2px rgba(255,255,255,0.16)';
}

function calculateGradientProgress(rowRect, elementRect) {
  if (!rowRect.width || !rowRect.height) return 0.5;
  const centerX = ((elementRect.left + elementRect.right) / 2 - rowRect.left) / rowRect.width;
  const centerY = ((elementRect.top + elementRect.bottom) / 2 - rowRect.top) / rowRect.height;
  return Math.min(1, Math.max(0, (centerX * 0.78) + (centerY * 0.22)));
}

function pickLocalForeground(row, element) {
  const rowStyle = getComputedStyle(row);
  const rowRect = row.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const progress = calculateGradientProgress(rowRect, elementRect);
  if (progress < 0.34) return getCssVar(rowStyle, '--companion-player-start-fg', getCssVar(rowStyle, '--companion-player-fg'));
  if (progress < 0.68) return getCssVar(rowStyle, '--companion-player-mid-fg', getCssVar(rowStyle, '--companion-player-fg'));
  return getCssVar(rowStyle, '--companion-player-end-fg', getCssVar(rowStyle, '--companion-player-value-fg'));
}

export default function useCompanionPlayerLocalContrast(ref, enabled = true) {
  const [contrast, setContrast] = useState(null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    const element = ref.current;
    const row = element?.closest?.('.companion-player-row');
    if (!element || !row) return undefined;

    let frame = null;
    const update = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const color = pickLocalForeground(row, element);
        setContrast({
          color,
          background: getSubtleForForeground(color),
          borderColor: getBorderForForeground(color),
          textShadow: getShadowForForeground(color),
        });
      });
    };

    update();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(row);
    observer?.observe(element);
    window.addEventListener('resize', update);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [enabled, ref]);

  return contrast;
}
