import { useEffect, useRef } from 'react';

let sheetCounter = 0;
// Cleanup defers its history.back() one macrotask so a StrictMode remount
// (cleanup + immediate re-run) can cancel it and reclaim the same entry
// instead of pushing a second one.
let pendingBack = null; // { id, timer }

/**
 * Makes browser back close an open sheet/modal instead of leaving the page,
 * matching how routed views (player/team pages) already behave.
 *
 * On open: pushes a same-URL history entry tagged `_sheet`. Pressing back pops
 * that entry — the popstate listener sees the tag is gone and calls onClose.
 * On programmatic close (X, Escape, selection): the cleanup consumes the
 * still-present tagged entry with history.back() so the stack stays balanced.
 * If the app navigated while the sheet was open, do not consume the entry on
 * cleanup. This includes route updates made with replaceState: they preserve
 * the sheet tag but change the URL, so going back would otherwise undo the
 * selection that closed the sheet.
 */
export default function useSheetHistory(isOpen, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return undefined;

    let id;
    if (pendingBack && window.history.state?._sheet === pendingBack.id) {
      // Remount before the deferred back fired — keep the existing entry.
      window.clearTimeout(pendingBack.timer);
      id = pendingBack.id;
      pendingBack = null;
    } else {
      sheetCounter += 1;
      id = `sheet-${sheetCounter}`;
      const baseState = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
      window.history.pushState({ ...baseState, _sheet: id }, '', window.location.href);
    }
    const openedLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    const tracker = { poppedByBack: false };
    const onPopState = () => {
      if (window.history.state?._sheet === id) return; // still on our entry
      tracker.poppedByBack = true;
      closeRef.current?.();
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
      const locationChanged = `${window.location.pathname}${window.location.search}${window.location.hash}` !== openedLocation;
      if (!tracker.poppedByBack && !locationChanged && window.history.state?._sheet === id) {
        const timer = window.setTimeout(() => {
          pendingBack = null;
          window.history.back();
        }, 0);
        pendingBack = { id, timer };
      }
    };
  }, [isOpen]);
}
