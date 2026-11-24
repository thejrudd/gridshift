import { useEffect, useEffectEvent, useRef, useState } from 'react';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import useSheetHistory from '../hooks/useSheetHistory';
import { createSpring, estimateReleaseVelocity, shouldDismissSheet } from '../utils/sheetSpring.js';

const DISMISS_DISTANCE = 80;
const DISMISS_VELOCITY = 650; // px/s at release
const SNAP_BACK_SECONDS = 0.45;
const DISMISS_SECONDS = 0.38;
const OFFSCREEN_MARGIN = 40; // clears the sheet's upward shadow
const MAX_VELOCITY_SAMPLES = 8;
const OVERLAY_CLICK_GUARD_MS = 400; // the click that trails a drag is not a backdrop tap
const TOUCH_DRAG_SLOP = 6;

const REST_TRANSFORM = 'translate3d(0, 0px, 0)';

// When the finger moved, not when a busy main thread got to the handler:
// queued moves delivered in one burst must not read as a flick.
function inputTime(event) {
  return event.timeStamp > 0 ? event.timeStamp : performance.now();
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function canPullFromContent(target, panel) {
  if (!(target instanceof Element) || target.closest('.modal-panel--mobile-sheet') !== panel) return false;
  if (target.closest('.mobile-sheet-drag-handle, input, textarea, select, [contenteditable]')) return false;

  let insideScrollArea = false;
  for (let element = target; element && element !== panel; element = element.parentElement) {
    if (!/^(auto|scroll|overlay)$/.test(window.getComputedStyle(element).overflowY)) continue;
    insideScrollArea = true;
    if (element.scrollTop > 0) return false;
  }
  return insideScrollArea;
}

export default function Modal({
  onClose,
  containerClassName = '',
  containerStyle = {},
  children,
  mobileSheet = false,
  ariaLabel,
}) {
  useBodyScrollLock();
  useSheetHistory(true, onClose);
  const panelRef = useRef(null);
  // The panel's transform is written straight to the element: a drag or a
  // spring frame is a style write, not a React render.
  const offsetRef = useRef(0);
  const dragRef = useRef({ pointerId: null, grabOffset: 0, peak: 0, samples: [] });
  const frameRef = useRef(null);
  const closeTimerRef = useRef(null);
  const dismissingRef = useRef(false);
  const dragEndedAtRef = useRef(-Infinity);
  const closedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const [isDragging, setIsDragging] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const cancelMotion = () => {
    if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  useEffect(() => cancelMotion, []);

  const setOffset = (offset) => {
    offsetRef.current = offset;
    if (panelRef.current) panelRef.current.style.transform = `translate3d(0, ${offset}px, 0)`;
  };

  // Spring the panel from where the finger left it, at the speed it left.
  const runSpring = ({ to, velocity, seconds, isDone, onDone }) => {
    cancelMotion();
    const spring = createSpring({ from: offsetRef.current, to, velocity, duration: seconds });
    const startedAt = performance.now();
    const step = (now) => {
      const elapsed = (now - startedAt) / 1000;
      const offset = spring.position(elapsed);
      setOffset(Math.max(0, offset));
      if (isDone(offset, spring.velocity(elapsed))) {
        frameRef.current = null;
        onDone();
        return;
      }
      frameRef.current = window.requestAnimationFrame(step);
    };
    frameRef.current = window.requestAnimationFrame(step);
  };

  const finishClose = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    cancelMotion();
    onCloseRef.current();
  };

  const dismissWithSpring = (velocity) => {
    dismissingRef.current = true;
    setIsDismissing(true);
    if (prefersReducedMotion()) {
      finishClose();
      return;
    }

    const viewportHeight = window.visualViewport?.height ?? window.innerHeight ?? 900;
    const panelHeight = panelRef.current?.getBoundingClientRect().height ?? viewportHeight;
    const target = Math.max(viewportHeight, panelHeight + 80);
    const offscreen = panelHeight + OFFSCREEN_MARGIN;

    runSpring({
      to: target,
      velocity: Math.max(0, velocity),
      seconds: DISMISS_SECONDS,
      isDone: (offset) => offset >= offscreen,
      onDone: finishClose,
    });
    // A hidden tab pauses animation frames; never leave the sheet open.
    closeTimerRef.current = window.setTimeout(finishClose, DISMISS_SECONDS * 1000 + 400);
  };

  const snapBackWithSpring = (velocity) => {
    if (prefersReducedMotion() || offsetRef.current <= 0) {
      setOffset(0);
      return;
    }
    runSpring({
      to: 0,
      velocity,
      seconds: SNAP_BACK_SECONDS,
      isDone: (offset, speed) => Math.abs(offset) < 0.5 && Math.abs(speed) < 20,
      onDone: () => setOffset(0),
    });
  };

  const startDrag = (pointerId, clientY, time) => {
    // Catching a sheet that is still springing back picks it up where it is.
    cancelMotion();
    dragRef.current = {
      pointerId,
      grabOffset: clientY - offsetRef.current,
      peak: offsetRef.current,
      samples: [{ t: time, y: offsetRef.current }],
    };
    setHasEntered(true);
    setIsDragging(true);
  };

  const updateDrag = (clientY, time) => {
    const drag = dragRef.current;
    const offset = Math.max(0, clientY - drag.grabOffset);
    setOffset(offset);
    drag.peak = Math.max(drag.peak, offset);
    drag.samples.push({ t: time, y: offset });
    if (drag.samples.length > MAX_VELOCITY_SAMPLES) drag.samples.shift();
  };

  const endDrag = (cancelled, time) => {
    const drag = dragRef.current;
    const velocity = estimateReleaseVelocity(drag.samples, time);
    const { peak } = drag;
    dragRef.current = { pointerId: null, grabOffset: 0, peak: 0, samples: [] };
    dragEndedAtRef.current = performance.now();
    setIsDragging(false);

    if (!cancelled && shouldDismissSheet({
      offset: offsetRef.current,
      peak,
      velocity,
      distance: DISMISS_DISTANCE,
      flickVelocity: DISMISS_VELOCITY,
    })) {
      dismissWithSpring(velocity);
      return;
    }

    snapBackWithSpring(velocity);
  };

  const handlePointerDown = (event) => {
    if (!mobileSheet || dismissingRef.current || !event.isPrimary || dragRef.current.pointerId != null) return;
    startDrag(event.pointerId, event.clientY, inputTime(event));
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (dragRef.current.pointerId === event.pointerId) updateDrag(event.clientY, inputTime(event));
  };

  const finishDrag = (event) => {
    if (dragRef.current.pointerId === event.pointerId) endDrag(event.type === 'pointercancel', inputTime(event));
  };

  const startContentDrag = useEffectEvent((y, time) => startDrag('content', y, time));
  const updateContentDrag = useEffectEvent((y, time) => updateDrag(y, time));
  const endContentDrag = useEffectEvent((cancelled, time) => endDrag(cancelled, time));

  useEffect(() => {
    if (!mobileSheet || !panelRef.current) return undefined;
    const panel = panelRef.current;
    let gesture = null;

    const onTouchStart = (event) => {
      if (event.touches.length !== 1) {
        if (gesture?.dragging) endContentDrag(true, inputTime(event));
        gesture = null;
        return;
      }
      if (dismissingRef.current || dragRef.current.pointerId != null
        || !window.matchMedia('(max-width: 1023px)').matches || !canPullFromContent(event.target, panel)) return;

      // Decide at touchstart, so reaching the top mid-scroll never takes over this gesture.
      const { identifier, clientX, clientY } = event.touches[0];
      gesture = { identifier, clientX, clientY, time: inputTime(event), dragging: false };
    };

    const onTouchMove = (event) => {
      if (!gesture || event.touches.length !== 1 || event.touches[0].identifier !== gesture.identifier) return;
      const { clientX, clientY } = event.touches[0];
      const time = inputTime(event);
      if (!gesture.dragging) {
        const dx = Math.abs(clientX - gesture.clientX);
        const dy = clientY - gesture.clientY;
        if (Math.max(dx, Math.abs(dy)) < TOUCH_DRAG_SLOP) return;
        if (dy <= dx || !event.cancelable) {
          gesture = null;
          return;
        }
        gesture.dragging = true;
        startContentDrag(gesture.clientY, gesture.time);
      }
      event.preventDefault();
      updateContentDrag(clientY, time);
    };

    const onTouchEnd = (event) => {
      if (!gesture || !Array.from(event.changedTouches).some(touch => touch.identifier === gesture.identifier)) return;
      if (gesture.dragging) endContentDrag(event.type === 'touchcancel', inputTime(event));
      gesture = null;
    };

    panel.addEventListener('touchstart', onTouchStart, { passive: true });
    panel.addEventListener('touchmove', onTouchMove, { passive: false });
    panel.addEventListener('touchend', onTouchEnd);
    panel.addEventListener('touchcancel', onTouchEnd);
    return () => {
      panel.removeEventListener('touchstart', onTouchStart);
      panel.removeEventListener('touchmove', onTouchMove);
      panel.removeEventListener('touchend', onTouchEnd);
      panel.removeEventListener('touchcancel', onTouchEnd);
      if (gesture?.dragging) {
        dragRef.current.pointerId = null;
        offsetRef.current = 0;
      }
    };
  }, [mobileSheet]);

  if (mobileSheet) {
    return (
      <div
        className="modal-overlay modal-overlay--mobile-sheet"
        onClick={() => {
          // iOS delivers a click to the backdrop right after a handle drag ends.
          if (performance.now() - dragEndedAtRef.current < OVERLAY_CLICK_GUARD_MS) return;
          onClose();
        }}
      >
        <div
          ref={panelRef}
          className={`modal-panel modal-panel--mobile-sheet w-full overflow-hidden ${containerClassName}`}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          style={{
            background: 'var(--color-bg-secondary)',
            animation: isDragging || isDismissing || hasEntered ? 'none' : undefined,
            transform: REST_TRANSFORM,
            ...containerStyle,
          }}
          onClick={(e) => e.stopPropagation()}
          onAnimationEnd={() => setHasEntered(true)}
        >
          <div
            className="mobile-sheet-drag-handle"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          >
            <div className="mobile-sheet-drag-handle__bar" />
          </div>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className={`modal-panel w-full rounded-2xl overflow-hidden ${containerClassName}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        style={{ background: 'var(--color-bg-secondary)', ...containerStyle }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
