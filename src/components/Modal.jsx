import { useEffect, useRef, useState } from 'react';
import useBodyScrollLock from '../hooks/useBodyScrollLock';

const DISMISS_DISTANCE = 80;
const DISMISS_VELOCITY = 0.65;
const MIN_DISMISS_DURATION = 150;
const MAX_DISMISS_DURATION = 320;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
  const panelRef = useRef(null);
  const dragRef = useRef({ pointerId: null, startY: 0, lastY: 0, startTime: 0 });
  const closeTimerRef = useRef(null);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [dismissDuration, setDismissDuration] = useState(220);
  const [hasEntered, setHasEntered] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
  }, []);

  const dismissWithAnimation = (distance, velocity) => {
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight ?? 900;
    const panelHeight = panelRef.current?.getBoundingClientRect().height ?? viewportHeight;
    const targetY = Math.max(viewportHeight, panelHeight + 80);
    const remaining = Math.max(1, targetY - distance);
    const projectedVelocity = Math.max(0.85, velocity * 1.35);
    const duration = clamp(Math.round(remaining / projectedVelocity), MIN_DISMISS_DURATION, MAX_DISMISS_DURATION);

    setDismissDuration(duration);
    setDragY(distance);
    setIsDismissing(true);

    requestAnimationFrame(() => {
      setDragY(targetY);
    });

    closeTimerRef.current = window.setTimeout(onClose, duration + 60);
  };

  const handlePointerDown = (event) => {
    if (!mobileSheet || isDismissing || !event.isPrimary) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      startTime: performance.now(),
    };
    setIsDragging(true);
    setDragY(0);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!mobileSheet || drag.pointerId !== event.pointerId) return;
    const nextY = Math.max(0, event.clientY - drag.startY);
    drag.lastY = event.clientY;
    setDragY(nextY);
  };

  const finishDrag = (event) => {
    const drag = dragRef.current;
    if (!mobileSheet || drag.pointerId !== event.pointerId) return;
    const distance = Math.max(0, drag.lastY - drag.startY);
    const elapsed = Math.max(1, performance.now() - drag.startTime);
    const velocity = distance / elapsed;
    dragRef.current = { pointerId: null, startY: 0, lastY: 0, startTime: 0 };
    setIsDragging(false);

    if (distance >= DISMISS_DISTANCE || velocity >= DISMISS_VELOCITY) {
      dismissWithAnimation(distance, velocity);
      return;
    }

    setDragY(0);
  };

  if (mobileSheet) {
    return (
      <div
        className="modal-overlay modal-overlay--mobile-sheet"
        onClick={onClose}
      >
        <div
          ref={panelRef}
          className={`modal-panel modal-panel--mobile-sheet w-full overflow-hidden ${containerClassName}`}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          style={{
            background: 'var(--color-bg-secondary)',
            animation: isDragging || isDismissing || dragY > 0 || hasEntered ? 'none' : undefined,
            transform: `translate3d(0, ${dragY}px, 0)`,
            transition: isDragging
              ? 'none'
              : isDismissing
                ? `transform ${dismissDuration}ms cubic-bezier(0.22, 0.72, 0, 1)`
                : undefined,
            ...containerStyle,
          }}
          onClick={(e) => e.stopPropagation()}
          onAnimationEnd={() => setHasEntered(true)}
          onTransitionEnd={(event) => {
            if (isDismissing && event.propertyName === 'transform') onClose();
          }}
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
        className={`w-full rounded-2xl overflow-hidden ${containerClassName}`}
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
