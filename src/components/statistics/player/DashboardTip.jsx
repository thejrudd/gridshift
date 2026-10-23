import { useCallback, useEffect, useMemo, useRef } from 'react';
import { DashboardTipContext } from './dashboardUi.js';

// One tooltip for the whole player dashboard. Elements opt in with
// `data-tip-title` and `data-tip` (plain text; "\n" starts a new line); see
// `tipAttrs` in dashboardUi.js.
//
// Mouse: follows the pointer on hover. Keyboard: shows on focus-visible.
// Touch: tapping an element that only carries details pins the tooltip above
// it; tapping it again, tapping elsewhere, scrolling, or Escape closes it.
// Elements that also act (buttons, links, switches) keep acting on tap.

const ACTION_SELECTOR = 'button, a, select, input, label, [role="button"], [role="switch"]';

export function DashboardTipProvider({ rootRef, children }) {
  const tipRef = useRef(null);
  const pinnedRef = useRef(null);
  const pointerRef = useRef('mouse');

  const render = useCallback((title, body) => {
    const tip = tipRef.current;
    if (!tip) return;
    tip.replaceChildren();
    if (title) {
      const heading = document.createElement('span');
      heading.className = 'player-dash-tip__title';
      heading.textContent = title;
      tip.appendChild(heading);
    }
    String(body ?? '').split('\n').filter(Boolean).forEach((line) => {
      const row = document.createElement('span');
      row.className = 'player-dash-tip__line';
      row.textContent = line;
      tip.appendChild(row);
    });
  }, []);

  const place = useCallback((x, y, above) => {
    const tip = tipRef.current;
    if (!tip) return;
    const rect = tip.getBoundingClientRect();
    let left;
    let top;
    if (above) {
      left = Math.min(x - rect.width / 2, window.innerWidth - rect.width - 8);
      top = y - rect.height - 18;
      if (top < 8) top = y + 26;
    } else {
      left = x + 14;
      top = y + 14;
      if (left + rect.width > window.innerWidth - 8) left = x - rect.width - 14;
      if (top + rect.height > window.innerHeight - 8) top = y - rect.height - 14;
    }
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  }, []);

  const show = useCallback((title, body, x, y, above = false) => {
    render(title, body);
    tipRef.current?.classList.add('is-visible');
    place(x, y, above);
  }, [place, render]);

  const hide = useCallback(() => {
    tipRef.current?.classList.remove('is-visible');
    const pinned = pinnedRef.current;
    if (pinned) {
      pinned.el.classList.remove('is-tip-pinned');
      pinned.onRelease?.();
      pinnedRef.current = null;
    }
  }, []);

  const pin = useCallback((el, title, body, x, y, onRelease) => {
    hide();
    pinnedRef.current = { el, onRelease };
    el.classList.add('is-tip-pinned');
    show(title, body, x, y, true);
  }, [hide, show]);

  const isTouch = useCallback(() => pointerRef.current !== 'mouse', []);
  const pinnedElement = useCallback(() => pinnedRef.current?.el ?? null, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const read = (el) => [el.getAttribute('data-tip-title'), el.getAttribute('data-tip')];

    const onPointerDown = (event) => { pointerRef.current = event.pointerType || 'mouse'; };
    const onPointerOver = (event) => {
      if (event.pointerType !== 'mouse') return;
      const el = event.target.closest?.('[data-tip], [data-tip-title]');
      if (!el || !root.contains(el)) return;
      const [title, body] = read(el);
      const move = (moveEvent) => show(title, body, moveEvent.clientX, moveEvent.clientY);
      move(event);
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerleave', () => { hide(); el.removeEventListener('pointermove', move); }, { once: true });
    };
    const onFocusIn = (event) => {
      const el = event.target.closest?.('[data-tip], [data-tip-title]');
      if (!el || !el.matches(':focus-visible')) return;
      const rect = el.getBoundingClientRect();
      const [title, body] = read(el);
      show(title, body, rect.left + rect.width / 2, rect.bottom);
      el.addEventListener('focusout', hide, { once: true });
    };
    const onClick = (event) => {
      if (pointerRef.current === 'mouse' || !event.detail) return;
      const el = event.target.closest?.('[data-tip], [data-tip-title]');
      if (el && root.contains(el) && !el.closest(ACTION_SELECTOR)) {
        if (pinnedRef.current?.el === el) hide();
        else {
          const [title, body] = read(el);
          pin(el, title, body, event.clientX, event.clientY);
        }
        return;
      }
      if (pinnedRef.current && !pinnedRef.current.el.contains(event.target)) hide();
    };
    const onScroll = () => { if (pinnedRef.current) hide(); };
    const onKey = (event) => { if (event.key === 'Escape') hide(); };

    window.addEventListener('pointerdown', onPointerDown, true);
    root.addEventListener('pointerover', onPointerOver);
    root.addEventListener('focusin', onFocusIn);
    document.addEventListener('click', onClick);
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', hide);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      root.removeEventListener('pointerover', onPointerOver);
      root.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('click', onClick);
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', hide);
      document.removeEventListener('keydown', onKey);
      hide();
    };
  }, [hide, pin, rootRef, show]);

  const value = useMemo(() => ({ show, hide, pin, isTouch, pinnedElement }), [hide, isTouch, pin, pinnedElement, show]);

  return (
    <DashboardTipContext.Provider value={value}>
      {children}
      <div ref={tipRef} className="player-dash-tip" role="status" aria-live="polite" />
    </DashboardTipContext.Provider>
  );
}
