import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getCompanionPositionColor,
  getPositionTextColor,
  getSleeperPlayerImageUrl,
} from '../../utils/companionAssetVisuals.js';

const TICKS = [0, 25, 50, 75, 100];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getInitials(name) {
  return String(name ?? 'P')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'P';
}

function clampView(view, width, height) {
  if (!view) return { k: 1, tx: 0, ty: 0 };
  if (view.k <= 1.001) return { k: 1, tx: 0, ty: 0 };
  const minVisible = 0.35;
  const contentW = width * view.k;
  const contentH = height * view.k;
  return {
    k: view.k,
    tx: clamp(view.tx, -(contentW - width * minVisible), width * (1 - minVisible)),
    ty: clamp(view.ty, -(contentH - height * minVisible), height * (1 - minVisible)),
  };
}

function getPointColor(point) {
  if (point?.focused) return 'var(--color-signature)';
  if (point?.pinned) return 'var(--color-accent)';
  return getCompanionPositionColor(point?.position) ?? 'var(--color-label-tertiary)';
}

function getPointTextColor(point, background) {
  if (point?.focused) return 'var(--color-signature-fg)';
  const positionColor = getCompanionPositionColor(point?.position);
  return positionColor && background === positionColor
    ? getPositionTextColor(positionColor)
    : 'var(--color-label)';
}

function PlayerFace({ point, size, ring }) {
  const [failed, setFailed] = useState(false);
  const imageUrl = getSleeperPlayerImageUrl(point?.id);
  const background = getPointColor(point);

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  if (imageUrl && !failed) {
    return (
      <img
        src={imageUrl}
        alt=""
        className="draft-analytics-scatter__face draft-analytics-scatter__face--image"
        style={{
          width: size,
          height: size,
          boxShadow: `0 0 0 2px ${ring}, 0 4px 10px rgba(0,0,0,0.32)`,
          background,
        }}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className="draft-analytics-scatter__face"
      style={{
        width: size,
        height: size,
        boxShadow: `0 0 0 2px ${ring}, 0 4px 10px rgba(0,0,0,0.32)`,
        background,
        color: getPointTextColor(point, background),
      }}
      aria-hidden="true"
    >
      {getInitials(point?.name)}
    </span>
  );
}

function ZoomIcon({ type }) {
  if (type === 'reset') {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v6h6" />
      </svg>
    );
  }
  return <span aria-hidden="true">{type === 'in' ? '+' : '-'}</span>;
}

function ExpandIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export default function DraftAnalyticsScatterChart({
  scatter,
  compact = false,
  fullscreen = false,
  onRequestFullscreen,
  onExitFullscreen,
  onTogglePin,
  onSelectPlayer,
  pinLimitReached = false,
}) {
  const wrapRef = useRef(null);
  const drag = useRef(null);
  const pinch = useRef(null);
  const moved = useRef(false);
  const hoverHideTimer = useRef(null);
  const lastPointPointerType = useRef('');
  const [size, setSize] = useState({ w: 520, h: 320 });
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  const [hoverId, setHoverId] = useState(null);
  const [inspectId, setInspectId] = useState(null);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      setSize({
        w: Math.max(220, rect.width),
        h: Math.max(180, rect.height),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setView({ k: 1, tx: 0, ty: 0 });
    setHoverId(null);
    setInspectId(null);
  }, [scatter?.xAxis?.id, scatter?.yAxis?.id, scatter?.renderedCount]);

  useEffect(() => () => {
    if (hoverHideTimer.current) window.clearTimeout(hoverHideTimer.current);
  }, []);

  const pad = {
    left: compact ? 32 : 38,
    right: compact ? 34 : 58,
    top: compact ? 30 : 38,
    bottom: compact ? 28 : 34,
  };
  const innerW = Math.max(80, size.w - pad.left - pad.right);
  const innerH = Math.max(80, size.h - pad.top - pad.bottom);

  const points = useMemo(() => {
    return [...(scatter?.points ?? [])].sort((a, b) => {
      const aPriority = a.focused ? 2 : a.pinned ? 1 : 0;
      const bPriority = b.focused ? 2 : b.pinned ? 1 : 0;
      return aPriority - bPriority;
    });
  }, [scatter?.points]);

  const pointById = useMemo(() => new Map(points.map((point) => [String(point.id), point])), [points]);
  const activePoint = pointById.get(String(hoverId ?? inspectId ?? '')) ?? null;
  const focusedPoint = points.find((point) => point.focused) ?? null;

  const getX = useCallback((point) => (
    pad.left + (clamp(Number(point?.x) || 0, 0, 100) / 100) * innerW * view.k + view.tx
  ), [innerW, pad.left, view.k, view.tx]);

  const getY = useCallback((point) => (
    pad.top + ((100 - clamp(Number(point?.y) || 0, 0, 100)) / 100) * innerH * view.k + view.ty
  ), [innerH, pad.top, view.k, view.ty]);

  const zoomAt = useCallback((factor, cx = innerW / 2, cy = innerH / 2) => {
    setView((current) => {
      const nextK = clamp(current.k * factor, 1, 8);
      const ratio = nextK / current.k;
      const next = {
        k: nextK,
        tx: cx - (cx - current.tx) * ratio,
        ty: cy - (cy - current.ty) * ratio,
      };
      return clampView(next, innerW, innerH);
    });
  }, [innerH, innerW]);

  const handleWheel = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAt(event.deltaY < 0 ? 1.14 : 1 / 1.14, event.clientX - rect.left - pad.left, event.clientY - rect.top - pad.top);
  }, [pad.left, pad.top, zoomAt]);

  const clearHoverHide = useCallback(() => {
    if (!hoverHideTimer.current) return;
    window.clearTimeout(hoverHideTimer.current);
    hoverHideTimer.current = null;
  }, []);

  const scheduleHoverHide = useCallback(() => {
    clearHoverHide();
    hoverHideTimer.current = window.setTimeout(() => {
      setHoverId(null);
      hoverHideTimer.current = null;
    }, 180);
  }, [clearHoverHide]);

  const handlePointerDown = (event) => {
    if (event.pointerType === 'touch') return;
    moved.current = false;
    drag.current = { x: event.clientX, y: event.clientY, tx: view.tx, ty: view.ty };
    wrapRef.current?.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const dragState = drag.current;
    if (!dragState) return;
    const dx = event.clientX - dragState.x;
    const dy = event.clientY - dragState.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved.current = true;
    setView((current) => clampView({ k: current.k, tx: dragState.tx + dx, ty: dragState.ty + dy }, innerW, innerH));
  };

  const stopDrag = () => {
    drag.current = null;
  };

  const handleTouchStart = (event) => {
    moved.current = false;
    if (event.touches.length === 2) {
      const [a, b] = event.touches;
      pinch.current = {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        k: view.k,
        tx: view.tx,
        ty: view.ty,
        midX: (a.clientX + b.clientX) / 2,
        midY: (a.clientY + b.clientY) / 2,
      };
    } else if (event.touches.length === 1) {
      const touch = event.touches[0];
      drag.current = { x: touch.clientX, y: touch.clientY, tx: view.tx, ty: view.ty };
    }
  };

  const handleTouchMove = (event) => {
    if (pinch.current && event.touches.length === 2) {
      event.preventDefault();
      const [a, b] = event.touches;
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const nextK = clamp(pinch.current.k * (dist / pinch.current.dist), 1, 8);
      const ratio = nextK / pinch.current.k;
      const cx = pinch.current.midX - rect.left - pad.left;
      const cy = pinch.current.midY - rect.top - pad.top;
      moved.current = true;
      setView(clampView({
        k: nextK,
        tx: cx - (cx - pinch.current.tx) * ratio,
        ty: cy - (cy - pinch.current.ty) * ratio,
      }, innerW, innerH));
    } else if (drag.current && event.touches.length === 1 && (view.k > 1 || fullscreen)) {
      const dragState = drag.current;
      const touch = event.touches[0];
      const dx = touch.clientX - dragState.x;
      const dy = touch.clientY - dragState.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        moved.current = true;
        event.preventDefault();
      }
      setView((current) => clampView({ k: current.k, tx: dragState.tx + dx, ty: dragState.ty + dy }, innerW, innerH));
    }
  };

  const handleTouchEnd = (event) => {
    if (event.touches.length === 0) {
      drag.current = null;
      pinch.current = null;
    }
  };

  const selectPoint = (point) => {
    if (moved.current) return false;
    setInspectId((current) => (current === point.id ? null : point.id));
    return true;
  };

  const handlePointClick = (event, point) => {
    event.preventDefault();
    event.stopPropagation();
    if (moved.current) return;
    const keyboardClick = event.detail === 0;
    const desktopClick = keyboardClick || lastPointPointerType.current === 'mouse';
    if (desktopClick && onSelectPlayer && !point.focused) {
      clearHoverHide();
      setHoverId(null);
      setInspectId(null);
      onSelectPlayer(point.id);
      return;
    }
    selectPoint(point);
  };

  const gridX = TICKS.map((tick) => pad.left + (tick / 100) * innerW * view.k + view.tx);
  const gridY = TICKS.map((tick) => pad.top + ((100 - tick) / 100) * innerH * view.k + view.ty);
  const referenceLine = scatter?.referenceLine ?? null;
  const canUseFullscreen = Boolean(onRequestFullscreen) && compact && !fullscreen;
  const focusedX = focusedPoint ? getX(focusedPoint) : null;
  const focusedY = focusedPoint ? getY(focusedPoint) : null;

  return (
    <div className="draft-analytics-scatter__interactive-shell">
      <div
        ref={wrapRef}
        className="draft-analytics-scatter__interactive"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onPointerLeave={() => {
          stopDrag();
          scheduleHoverHide();
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: fullscreen || view.k > 1 ? 'none' : 'pan-y' }}
        role="img"
        aria-label={`${scatter?.xAxis?.label ?? 'X'} by ${scatter?.yAxis?.label ?? 'Y'} scatter plot`}
      >
        <svg width={size.w} height={size.h} className="draft-analytics-scatter__grid" aria-hidden="true">
          {gridX.map((x, index) => (
            <line key={`x-${TICKS[index]}`} x1={x} x2={x} y1={pad.top} y2={pad.top + innerH * view.k} />
          ))}
          {gridY.map((y, index) => (
            <line key={`y-${TICKS[index]}`} x1={pad.left} x2={pad.left + innerW * view.k} y1={y} y2={y} />
          ))}
          {referenceLine ? (
            <line
              className={referenceLine.kind === 'trend' ? 'draft-analytics-scatter__trend-line' : 'draft-analytics-scatter__fair-line'}
              x1={pad.left + (clamp(referenceLine.x1, 0, 100) / 100) * innerW * view.k + view.tx}
              y1={pad.top + ((100 - clamp(referenceLine.y1, 0, 100)) / 100) * innerH * view.k + view.ty}
              x2={pad.left + (clamp(referenceLine.x2, 0, 100) / 100) * innerW * view.k + view.tx}
              y2={pad.top + ((100 - clamp(referenceLine.y2, 0, 100)) / 100) * innerH * view.k + view.ty}
            />
          ) : null}
          {focusedPoint ? (
            <>
              <line className="draft-analytics-scatter__focus-line" x1={pad.left} x2={focusedX} y1={focusedY} y2={focusedY} />
              <line className="draft-analytics-scatter__focus-line" x1={focusedX} x2={focusedX} y1={pad.top + innerH * view.k + view.ty} y2={focusedY} />
            </>
          ) : null}
          <line className="draft-analytics-scatter__frame" x1={pad.left} x2={pad.left} y1={pad.top} y2={pad.top + innerH} />
          <line className="draft-analytics-scatter__frame" x1={pad.left} x2={pad.left + innerW} y1={pad.top + innerH} y2={pad.top + innerH} />
        </svg>

        {points.length ? points.map((point) => {
          const x = getX(point);
          const y = getY(point);
          if (x < pad.left - 40 || x > size.w + 40 || y < pad.top - 40 || y > size.h + 40) return null;
          const active = activePoint?.id === point.id;
          const face = point.focused || point.pinned;
          return (
            <button
              key={point.id}
              type="button"
              className={[
                'draft-analytics-scatter__dot',
                point.focused ? 'is-focused' : '',
                point.pinned ? 'is-pinned' : '',
                active ? 'is-active' : '',
                face ? 'has-face' : '',
              ].filter(Boolean).join(' ')}
              style={{ left: x, top: y, background: getPointColor(point) }}
              onPointerDown={(event) => {
                event.stopPropagation();
                moved.current = false;
                lastPointPointerType.current = event.pointerType;
              }}
              onPointerEnter={() => {
                clearHoverHide();
                setHoverId(point.id);
              }}
              onPointerLeave={scheduleHoverHide}
              onClick={(event) => handlePointClick(event, point)}
              aria-label={`${point.name}: ${scatter?.xAxis?.label} ${point.xLabel}, ${scatter?.yAxis?.label} ${point.yLabel}`}
            >
              {face ? <PlayerFace point={point} size={point.focused ? 34 : 28} ring={point.focused ? 'var(--color-signature)' : 'var(--color-accent)'} /> : null}
            </button>
          );
        }) : (
          <div className="draft-analytics-scatter__empty-state">No plottable players</div>
        )}

        <span className="draft-analytics-scatter__tick draft-analytics-scatter__tick--x-min" style={{ left: pad.left }}>{scatter?.xAxis?.minLabel ?? '0'}</span>
        <span className="draft-analytics-scatter__tick draft-analytics-scatter__tick--x-max" style={{ right: pad.right }}>{scatter?.xAxis?.maxLabel ?? '100'}</span>
        <span className="draft-analytics-scatter__tick draft-analytics-scatter__tick--y-min" style={{ left: 4, bottom: pad.bottom }}>{scatter?.yAxis?.minLabel ?? '0'}</span>
        <span className="draft-analytics-scatter__tick draft-analytics-scatter__tick--y-max" style={{ left: 4, top: pad.top }}>{scatter?.yAxis?.maxLabel ?? '100'}</span>
        {focusedPoint ? (
          <>
            <span
              className="draft-analytics-scatter__selected-value draft-analytics-scatter__selected-value--x"
              style={{
                left: clamp(focusedX ?? pad.left, pad.left + 18, size.w - pad.right - 18),
                top: pad.top + innerH * view.k + view.ty,
              }}
            >
              {focusedPoint.xLabel}
            </span>
            <span
              className="draft-analytics-scatter__selected-value draft-analytics-scatter__selected-value--y"
              style={{
                left: pad.left,
                top: clamp(focusedY ?? pad.top, pad.top + 12, size.h - pad.bottom - 12),
              }}
            >
              {focusedPoint.yLabel}
            </span>
          </>
        ) : null}

        {activePoint ? (
          <div
            className="draft-analytics-scatter__tooltip"
            style={{
              left: clamp(getX(activePoint) + (getX(activePoint) > size.w * 0.58 ? -172 : 12), 8, Math.max(8, size.w - 166)),
              top: clamp(getY(activePoint) + (getY(activePoint) < 92 ? 12 : -86), 8, Math.max(8, size.h - 98)),
            }}
            onPointerEnter={() => {
              clearHoverHide();
              setHoverId(activePoint.id);
            }}
            onPointerLeave={scheduleHoverHide}
          >
            <div className="draft-analytics-scatter__tooltip-head">
              <PlayerFace point={activePoint} size={28} ring={getPointColor(activePoint)} />
              <span>
                <strong>{activePoint.name}</strong>
                <small>{[activePoint.position, activePoint.team || 'FA'].filter(Boolean).join(' / ')}</small>
              </span>
            </div>
            <div className="draft-analytics-scatter__tooltip-metrics">
              <span>{scatter?.xAxis?.label} <b>{activePoint.xLabel}</b></span>
              <span>{scatter?.yAxis?.label} <b>{activePoint.yLabel}</b></span>
            </div>
            {onTogglePin && !activePoint.focused ? (
              <button
                type="button"
                className="draft-analytics-scatter__tooltip-pin"
                disabled={!activePoint.pinned && pinLimitReached}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  clearHoverHide();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  clearHoverHide();
                  onTogglePin(activePoint.id);
                  setHoverId(activePoint.id);
                  setInspectId(null);
                }}
              >
                {activePoint.pinned ? 'Unpin' : pinLimitReached ? 'Compare full' : 'Pin to compare'}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <span className="draft-analytics-scatter__axis-title draft-analytics-scatter__axis-title--x">X: {scatter?.xAxis?.label}</span>
      <span className="draft-analytics-scatter__axis-title draft-analytics-scatter__axis-title--y">Y: {scatter?.yAxis?.label}</span>

      {(fullscreen || !compact) ? (
        <div className="draft-analytics-scatter__zoom" aria-label="Chart zoom controls">
          <button type="button" onClick={() => zoomAt(1.3)} aria-label="Zoom in"><ZoomIcon type="in" /></button>
          <button type="button" onClick={() => zoomAt(1 / 1.3)} aria-label="Zoom out"><ZoomIcon type="out" /></button>
          {view.k > 1.01 ? (
            <button type="button" onClick={() => setView({ k: 1, tx: 0, ty: 0 })} aria-label="Reset zoom"><ZoomIcon type="reset" /></button>
          ) : null}
        </div>
      ) : null}

      {canUseFullscreen ? (
        <button type="button" className="draft-analytics-scatter__expand" onClick={onRequestFullscreen}>
          <ExpandIcon />
          Expand chart
        </button>
      ) : null}

      {fullscreen && onExitFullscreen ? (
        <button type="button" className="draft-analytics-scatter__exit" onClick={onExitFullscreen} aria-label="Close expanded chart">
          <CloseIcon />
        </button>
      ) : null}
    </div>
  );
}
