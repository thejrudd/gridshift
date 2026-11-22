import { useEffect, useRef, useState } from 'react';
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

  const handlePointerDown = (event) => {
    if (!mobileSheet || dismissingRef.current || !event.isPrimary) return;
    // Catching a sheet that is still springing back picks it up where it is.
    cancelMotion();
    dragRef.current = {
      pointerId: event.pointerId,
      grabOffset: event.clientY - offsetRef.current,
      peak: offsetRef.current,
      samples: [{ t: inputTime(event), y: offsetRef.current }],
    };
    setHasEntered(true);
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!mobileSheet || drag.pointerId !== event.pointerId) return;
    const offset = Math.max(0, event.clientY - drag.grabOffset);
    setOffset(offset);
    drag.peak = Math.max(drag.peak, offset);
    drag.samples.push({ t: inputTime(event), y: offset });
    if (drag.samples.length > MAX_VELOCITY_SAMPLES) drag.samples.shift();
  };

  const finishDrag = (event) => {
    const drag = dragRef.current;
    if (!mobileSheet || drag.pointerId !== event.pointerId) return;
    const velocity = estimateReleaseVelocity(drag.samples, inputTime(event));
    const { peak } = drag;
    dragRef.current = { pointerId: null, grabOffset: 0, peak: 0, samples: [] };
    dragEndedAtRef.current = performance.now();
    setIsDragging(false);

    if (event.type !== 'pointercancel' && shouldDismissSheet({
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
