import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useBodyScrollLock from '../../hooks/useBodyScrollLock';

const ANCHOR_TIMEOUT_MS = 10000;
const SPOTLIGHT_PADDING = 6;
const TOOLTIP_GAP = 12;
const TOOLTIP_WIDTH = 300;
const VIEWPORT_MARGIN = 8;

// Among all elements matching the selector, return the one that's actually
// visible (nav targets exist twice: bottom tab bar on mobile, sidebar on desktop).
function findVisibleAnchor(selector) {
  if (!selector) return null;
  let matches;
  try { matches = document.querySelectorAll(selector); } catch { return null; }
  for (const el of matches) {
    if (el.getClientRects().length > 0) return el;
  }
  return null;
}

function materializeTourCopy(copy, context) {
  if (!copy) return null;
  const interpolate = (value) => String(value ?? '').replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (token, key) => (
    context[key] == null || context[key] === '' ? token : String(context[key])
  ));
  return {
    title: interpolate(copy.title),
    body: interpolate(copy.body),
  };
}

function pickPlacement(rect, preferred) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const space = {
    top: rect.top,
    bottom: vh - rect.bottom,
    left: rect.left,
    right: vw - rect.right,
  };
  if (preferred && preferred !== 'auto' && space[preferred] > 140) return preferred;
  if (space.bottom > 160) return 'bottom';
  if (space.top > 160) return 'top';
  return space.right >= space.left ? 'right' : 'left';
}

function computeTooltipPosition(rect, placement) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(TOOLTIP_WIDTH, vw - VIEWPORT_MARGIN * 2);
  let top;
  let left;

  if (placement === 'bottom' || placement === 'top') {
    left = rect.left + rect.width / 2 - width / 2;
    top = placement === 'bottom'
      ? rect.bottom + SPOTLIGHT_PADDING + TOOLTIP_GAP
      : undefined;
    return {
      width,
      left: Math.max(VIEWPORT_MARGIN, Math.min(left, vw - width - VIEWPORT_MARGIN)),
      ...(placement === 'bottom'
        ? { top: Math.min(top, vh - 120) }
        : { bottom: Math.min(vh - rect.top + SPOTLIGHT_PADDING + TOOLTIP_GAP, vh - 120) }),
    };
  }

  top = Math.max(VIEWPORT_MARGIN, Math.min(rect.top, vh - 180));
  if (placement === 'right') {
    left = Math.min(rect.right + SPOTLIGHT_PADDING + TOOLTIP_GAP, vw - width - VIEWPORT_MARGIN);
  } else {
    left = Math.max(VIEWPORT_MARGIN, rect.left - SPOTLIGHT_PADDING - TOOLTIP_GAP - width);
  }
  return { width, top, left };
}

// Full-screen guided tour: spotlights one anchor element per step, navigates
// the app between steps via the provided `navigate(route)` callback, and lets
// the user skip everything at any point.
export default function TourOverlay({ entries, navigate, currentRoute, context = {}, onStepChange, onFinish }) {
  useBodyScrollLock();

  // Flatten entries → ordered steps, tagging each with its feature name.
  const steps = useMemo(() => {
    const flat = [];
    for (const entry of entries) {
      for (const feature of entry.features) {
        for (const step of feature.steps) {
          flat.push({ ...step, featureName: feature.name, version: entry.version });
        }
      }
    }
    return flat;
  }, [entries]);

  const [stepIndex, setStepIndex] = useState(0);
  const [anchorRect, setAnchorRect] = useState(null); // null = resolving
  const [timedOut, setTimedOut] = useState(false);
  const anchorElRef = useRef(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;

  const rawStep = steps[stepIndex];
  const routeReady = !rawStep?.route || Object.entries(rawStep.route)
    .every(([key, value]) => currentRoute?.[key] === value);
  const contextualCopy = rawStep?.contextKey
    ? rawStep.copyByContext?.[context[rawStep.contextKey]] ?? rawStep.copyByContext?.default
    : null;
  const materializedCopy = useMemo(
    () => materializeTourCopy(contextualCopy, context),
    [contextualCopy, context.selectedLeagueSeason, context.currentLeagueSeason],
  );
  const demoEnabled = rawStep?.demoMode && Object.entries(rawStep.demoWhen ?? {})
    .every(([key, value]) => context[key] === value);
  const step = useMemo(() => (rawStep ? {
    ...rawStep,
    ...materializedCopy,
    demoMode: demoEnabled ? rawStep.demoMode : null,
  } : null), [rawStep, materializedCopy, demoEnabled]);
  const total = steps.length;

  const finish = useCallback(() => {
    onStepChange?.(null);
    onFinish();
  }, [onFinish, onStepChange]);

  const advance = useCallback(() => {
    setStepIndex((i) => {
      if (i + 1 >= steps.length) {
        onStepChange?.(null);
        onFinish();
        return i;
      }
      return i + 1;
    });
  }, [steps.length, onFinish, onStepChange]);

  useEffect(() => {
    onStepChange?.(step);
  }, [stepIndex, step?.demoMode, onStepChange]);

  // Navigate for the current step when its route differs from the app's.
  useEffect(() => {
    if (!step?.route) return;
    const differs = Object.entries(step.route)
      .some(([key, value]) => currentRoute?.[key] !== value);
    if (differs) navigate(step.route, { replace: true });
    // Only re-run when the step changes — currentRoute updating to match
    // the requested route must not re-trigger navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  // Resolve the anchor element by polling each frame (covers lazy-loaded
  // views appearing after navigation), with a timeout that skips the step.
  useEffect(() => {
    if (!step) return undefined;
    let cancelled = false;
    let rafId = null;
    let timeoutId = null;
    setAnchorRect(null);
    setTimedOut(false);
    anchorElRef.current = null;

    const selector = (isMobile && step.anchorMobile) ? step.anchorMobile : step.anchor;

    const tryResolve = () => {
      if (cancelled) return;
      if (!routeReady) {
        rafId = requestAnimationFrame(tryResolve);
        return;
      }
      const el = findVisibleAnchor(selector);
      if (el) {
        anchorElRef.current = el;
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        // Measure after scroll settles.
        rafId = requestAnimationFrame(() => {
          if (!cancelled && anchorElRef.current) {
            setAnchorRect(anchorElRef.current.getBoundingClientRect());
          }
        });
        return;
      }
      rafId = requestAnimationFrame(tryResolve);
    };

    if (routeReady) {
      timeoutId = window.setTimeout(() => {
        if (!cancelled && !anchorElRef.current) {
          cancelled = true;
          if (rafId) cancelAnimationFrame(rafId);
          setTimedOut(true);
        }
      }, ANCHOR_TIMEOUT_MS);
    }

    tryResolve();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
    };
    // isMobile intentionally read fresh per step; breakpoint changes are
    // handled by the reposition effect below re-running measurement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeReady, stepIndex, step]);

  // Skip a step whose anchor never appeared.
  useEffect(() => {
    if (timedOut) advance();
  }, [timedOut, advance]);

  // Keep the spotlight glued to the anchor on resize / scroll / element resize.
  useEffect(() => {
    if (!anchorRect) return undefined;
    const remeasure = () => {
      const el = anchorElRef.current;
      if (!el || el.getClientRects().length === 0) {
        // Element vanished (e.g. breakpoint crossed) — re-resolve.
        const selector = (window.innerWidth < 1024 && steps[stepIndex]?.anchorMobile)
          ? steps[stepIndex].anchorMobile
          : steps[stepIndex]?.anchor;
        const next = findVisibleAnchor(selector);
        if (next) {
          anchorElRef.current = next;
          setAnchorRect(next.getBoundingClientRect());
        }
        return;
      }
      setAnchorRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', remeasure);
    window.addEventListener('scroll', remeasure, true);
    window.visualViewport?.addEventListener('resize', remeasure);
    const ro = new ResizeObserver(remeasure);
    if (anchorElRef.current) ro.observe(anchorElRef.current);
    return () => {
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('scroll', remeasure, true);
      window.visualViewport?.removeEventListener('resize', remeasure);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorRect === null, stepIndex]);

  // Escape skips the whole tour.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [finish]);

  if (!step) return null;

  const isLast = stepIndex === total - 1;
  const placement = anchorRect ? pickPlacement(anchorRect, step.placement) : null;
  const tooltipPos = anchorRect ? computeTooltipPosition(anchorRect, placement) : null;

  return (
    <div className="fixed inset-0 z-[95]" role="dialog" aria-modal="true" aria-label="Feature tour">
      {anchorRect ? (
        <>
          {/* Spotlight cutout — the giant box-shadow forms the dimmed scrim. */}
          <div
            className="absolute rounded-xl pointer-events-none"
            style={{
              top: anchorRect.top - SPOTLIGHT_PADDING,
              left: anchorRect.left - SPOTLIGHT_PADDING,
              width: anchorRect.width + SPOTLIGHT_PADDING * 2,
              height: anchorRect.height + SPOTLIGHT_PADDING * 2,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
              border: '2px solid var(--color-signature)',
            }}
          />
          <div
            className="absolute rounded-2xl p-4 shadow-xl"
            style={{
              ...tooltipPos,
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-separator)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
            }}
          >
            <div
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: 'var(--color-label-secondary)' }}
            >
              {step.featureName} · Step {stepIndex + 1} of {total}
            </div>
            <div className="mt-1 text-base font-bold" style={{ color: 'var(--color-label)' }}>
              {step.title}
            </div>
            <div className="mt-1 text-sm leading-snug" style={{ color: 'var(--color-label-secondary)' }}>
              {step.body}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={finish}
                className="rounded-lg px-3 py-2 text-sm font-semibold"
                style={{ color: 'var(--color-label-secondary)' }}
              >
                Skip tour
              </button>
              <button
                type="button"
                onClick={advance}
                className="rounded-lg px-4 py-2 text-sm font-semibold"
                style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}
              >
                {isLast ? 'Finish' : 'Next'}
              </button>
            </div>
          </div>
        </>
      ) : (
        /* Anchor still resolving (view may be lazy-loading): plain scrim with an escape hatch. */
        <div
          className="absolute inset-0 flex items-end justify-center pb-24"
          style={{ background: 'rgba(0, 0, 0, 0.4)' }}
        >
          <button
            type="button"
            onClick={finish}
            className="rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-label)', border: '1px solid var(--color-separator)' }}
          >
            Skip tour
          </button>
        </div>
      )}
    </div>
  );
}
