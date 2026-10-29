import { useRef } from 'react';

/**
 * Tabs (Stage 5.1): the editorial tab rail with the gold underline on the
 * selected tab. Arrow keys, Home, and End move between tabs (roving
 * tabindex); hover, focus, active, and disabled states come from `.gs-tab`.
 * `variant="secondary"` is the smaller rail used inside a page.
 */
export default function Tabs({ items, value, onChange, ariaLabel, variant = 'primary', className = '', idPrefix = undefined }) {
  const ref = useRef(null);
  const enabled = items.filter((item) => !item.disabled);

  const move = (event, item) => {
    const index = enabled.findIndex((candidate) => candidate.value === item.value);
    let next = null;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = enabled.length - 1;
    if (event.key === 'ArrowRight') next = Math.min(enabled.length - 1, index + 1);
    if (event.key === 'ArrowLeft') next = Math.max(0, index - 1);
    if (next == null || next === index) return;
    event.preventDefault();
    const target = enabled[next];
    onChange?.(target.value);
    window.requestAnimationFrame(() => {
      ref.current?.querySelector(`[data-tab-value="${CSS.escape(String(target.value))}"]`)?.focus();
    });
  };

  return (
    <div
      ref={ref}
      className={`season-tabs gs-tabs${variant === 'secondary' ? ' gs-tabs--secondary' : ''} ${className}`.trim()}
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={idPrefix ? `${idPrefix}-${item.value}` : undefined}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            data-tab-value={item.value}
            className={`season-tab gs-tab${selected ? ' active' : ''}`}
            onClick={() => onChange?.(item.value)}
            onKeyDown={(event) => move(event, item)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
