import { useState, useCallback, useMemo } from 'react';

/**
 * Mouse-tracking border glow effect for cards.
 * Returns event handlers, an overlay element, and a box-shadow string.
 *
 * Dark mode: masked border glow that intensifies near the cursor.
 * Light mode: same border glow (stronger) + directional colored box-shadow
 *   that shifts toward the mouse, creating a soft outer glow.
 *
 * @param {Object} opts
 * @param {boolean} opts.enabled   — only track when true
 * @param {string}  opts.color     — desired glow color (hex)
 * @param {string}  opts.cardColor — card's dominant bg color (hex) for similarity check
 * @param {boolean} opts.darkMode  — adjusts intensity and strategy per theme
 */
export default function useCardGlow({
  enabled = true,
  color = '#5AADFF',
  cardColor = null,
  darkMode = true,
  coreColor = null,
  outerColor = null,
} = {}) {
  const [glow, setGlow] = useState(null); // { x, y, w, h } or null

  const resolvedColor = useMemo(() => {
    if (!color || !cardColor) return color;
    if (colorsAreSimilar(color, cardColor)) {
      return darkMode ? '#FFFFFF' : '#1A1A2E';
    }
    return color;
  }, [color, cardColor, darkMode]);

  const resolvedCoreColor = coreColor ?? resolvedColor;
  const resolvedOuterColor = outerColor ?? resolvedColor;

  const onMouseMove = useCallback((e) => {
    if (!enabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setGlow({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      w: rect.width,
      h: rect.height,
    });
  }, [enabled]);

  const onMouseEnter = useCallback(() => {
    if (!enabled) return;
  }, [enabled]);

  const onMouseLeave = useCallback(() => {
    setGlow(null);
  }, []);

  // Border glow overlay (both modes)
  const borderOverlay = (enabled && glow) ? (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: -1,
        borderRadius: 'inherit',
        pointerEvents: 'none',
        zIndex: 21,
        border: '2px solid transparent',
        background: `radial-gradient(
          400px circle at ${glow.x}px ${glow.y}px,
          ${resolvedCoreColor}dd 0%,
          ${resolvedCoreColor}66 24%,
          ${resolvedOuterColor}44 48%,
          ${resolvedOuterColor}18 68%,
          transparent 80%
        ) border-box`,
        WebkitMask: 'linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)',
        WebkitMaskComposite: 'xor',
        maskComposite: 'exclude',
        transition: 'opacity 200ms ease-out',
      }}
    />
  ) : null;

  // Directional box-shadow for light mode — shifts toward the mouse
  const glowShadow = useMemo(() => {
    if (!enabled || !glow) return null;
    if (darkMode) {
      // Dark mode: subtle ambient colored shadow
      return [
        `0 0 12px 1px ${resolvedCoreColor}33`,
        `0 0 22px 3px ${resolvedOuterColor}33`,
      ].join(', ');
    }
    // Light mode: compute directional offset from card center
    const dx = glow.w ? (glow.x - glow.w / 2) / (glow.w / 2) : 0; // -1 to 1
    const dy = glow.h ? (glow.y - glow.h / 2) / (glow.h / 2) : 0;
    const offsetX = Math.round(dx * 5);  // max ±5px shift
    const offsetY = Math.round(dy * 5);
    return [
      `${offsetX}px ${offsetY}px 16px 4px ${resolvedOuterColor}33`,
      `0 0 12px 2px ${resolvedCoreColor}1f`,
      `0 0 22px 4px ${resolvedOuterColor}22`,
    ].join(', ');
  }, [enabled, glow, darkMode, resolvedCoreColor, resolvedOuterColor]);

  return {
    isGlowing: !!glow,
    glowHandlers: enabled ? { onMouseMove, onMouseEnter, onMouseLeave } : {},
    borderOverlay,
    glowShadow,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace('#', '').slice(0, 6);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function colorsAreSimilar(a, b, threshold = 80) {
  const c1 = hexToRgb(a);
  const c2 = hexToRgb(b);
  const dist = Math.sqrt(
    (c1.r - c2.r) ** 2 +
    (c1.g - c2.g) ** 2 +
    (c1.b - c2.b) ** 2,
  );
  return dist < threshold;
}
