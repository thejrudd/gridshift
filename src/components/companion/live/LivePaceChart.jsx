// LivePaceChart.jsx — pace lines. Each team's live scoring drawn as a filled
// area against the ghost of its own projected pace. The gap at NOW is the
// story. Drag to scrub the day: the hero rewinds and the feed jumps with you.
//
// The series is built from the matchup's own scoring plays (buildPaceSeries in
// livePace.js), so each play is a step in the line and the big ones — the
// touchdowns and long field goals — are drawn as selectable milestones. Pick
// one and it opens that play in the scoring player's card.
//
// Production uses shared game progress. Mock play-by-play uses consecutive
// schedule-aware game segments so inactive weekdays do not consume chart room.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatGameClock, getLiveEventLabel } from './liveVisuals.js';
import { formatDemoTimelinePoint } from '../../../utils/liveDemoTimeline.js';
import { formatWinProbabilityPair } from '../../../utils/liveWinProbability.js';
import {
  buildTeamLinePoints,
  findClosestMark,
  sampleLineValue,
} from '../../../utils/livePaceChartGeometry.js';

const PAD_LEFT = 2;
const PAD_RIGHT = 74;
const PAD_TOP = 14;
const PAD_BOTTOM = 18;
const MARK_HIT_RADIUS = 12;
const MARK_SNAP_RADIUS = 14;
const MOBILE_CHART_HEIGHT = 128;
const DESKTOP_CHART_MIN_HEIGHT = 240;
const DESKTOP_CHART_MAX_HEIGHT = 420;
const DESKTOP_CHART_ASPECT = 0.34;
const DESKTOP_CHART_VIEWPORT_RATIO = 0.42;
const ZOOM_LEVELS = [1, 1.5, 2, 3];
const MIN_ZOOM = ZOOM_LEVELS[0];
const MAX_ZOOM = ZOOM_LEVELS.at(-1);

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value) || MIN_ZOOM));
}

function formatZoom(value) {
  return Number(clampZoom(value).toFixed(2)).toString();
}

// The chart builds its geometry from the plot's real pixel width so text and
// scrub maths never render through a stretched coordinate space.
function useElementSize(initialWidth = 360) {
  const [size, setSize] = useState({ width: initialWidth, height: 0 });
  const observerRef = useRef(null);
  const ref = useCallback((node) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    setSize({ width: node.clientWidth || initialWidth, height: node.clientHeight || 0 });
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const bounds = entries[0]?.contentRect;
      if (!bounds?.width) return;
      setSize({ width: bounds.width, height: bounds.height });
    });
    observer.observe(node);
    observerRef.current = observer;
  }, [initialWidth]);
  useEffect(() => () => observerRef.current?.disconnect(), []);
  return [ref, size];
}

function useChartHeight(width, availableHeight) {
  const [desktop, setDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)').matches,
  );
  const [viewportHeight, setViewportHeight] = useState(
    () => (typeof window !== 'undefined' ? (window.visualViewport?.height ?? window.innerHeight) : 900),
  );
  useEffect(() => {
    const query = window.matchMedia?.('(min-width: 1024px)');
    const viewport = window.visualViewport;
    const apply = () => {
      if (query) setDesktop(query.matches);
      setViewportHeight(viewport?.height ?? window.innerHeight);
    };
    apply();
    query?.addEventListener('change', apply);
    window.addEventListener('resize', apply);
    viewport?.addEventListener('resize', apply);
    return () => {
      query?.removeEventListener('change', apply);
      window.removeEventListener('resize', apply);
      viewport?.removeEventListener('resize', apply);
    };
  }, []);
  if (!desktop) return MOBILE_CHART_HEIGHT;
  if (availableHeight > 0) return Math.max(1, Math.round(availableHeight));
  const viewportCap = Math.max(MOBILE_CHART_HEIGHT, viewportHeight * DESKTOP_CHART_VIEWPORT_RATIO);
  return Math.round(Math.min(
    DESKTOP_CHART_MAX_HEIGHT,
    viewportCap,
    Math.max(DESKTOP_CHART_MIN_HEIGHT, width * DESKTOP_CHART_ASPECT),
  ));
}

export default function LivePaceChart({
  left,
  right,
  series = [],
  marks = [],
  progress = 0,
  hover = null,
  selection = null,
  selectedEventId = null,
  onHover,
  onScrub,
  onSelectMark,
  onReturnLive,
  collapsedSummary = false,
  // 'projection' reserves headroom for each side's projected total; 'scoring'
  // scales to points actually on the board. Only the dev sandbox passes
  // anything but the default.
  scaleMode = 'projection',
  liveWinProbA = 50,
  liveSettled = false,
  timelineMode = 'game',
  timeline = null,
}) {
  const viewportNode = useRef(null);
  const pendingScrollFocus = useRef(null);
  const [measureViewport, viewportSize] = useElementSize();
  const setViewportRef = useCallback((node) => {
    viewportNode.current = node;
    measureViewport(node);
  }, [measureViewport]);
  const [zoom, setZoomValue] = useState(MIN_ZOOM);
  const zoomRef = useRef(MIN_ZOOM);
  const width = Math.max(1, Math.round(viewportSize.width * zoom));
  const height = useChartHeight(viewportSize.width, viewportSize.height);
  const [dragging, setDragging] = useState(false);
  const [activeMark, setActiveMark] = useState(null);
  const scrubbedTo = useRef(null);
  const formatTimelinePoint = timelineMode === 'schedule'
    ? (value) => formatDemoTimelinePoint(value, timeline)
    : formatGameClock;

  const slateProgress = Math.min(1, Math.max(0, Number(progress) || 0));
  // Points carry their own x when the series came from plays. The odds-history
  // fallback has no game clock, so those points spread evenly across the slate.
  const points = useMemo(() => {
    const last = Math.max(1, series.length - 1);
    return series.map((point, index) => ({
      ...point,
      index,
      x: Number.isFinite(Number(point.x)) ? Number(point.x) : (index / last) * slateProgress,
    }));
  }, [series, slateProgress]);

  const innerWidth = Math.max(60, width - PAD_LEFT - PAD_RIGHT);
  const innerHeight = Math.max(40, height - PAD_TOP - PAD_BOTTOM);
  // The x-axis always represents the complete week. Live scoring ends at NOW,
  // leaving the rest of the plot open so the chart fills from left to right as
  // games are played instead of stretching partial data across the full width.
  const xMax = 1;
  const plottedMax = points.reduce((highest, point) => Math.max(
    highest,
    Number.isFinite(Number(point.a)) ? Number(point.a) : 0,
    Number.isFinite(Number(point.b)) ? Number(point.b) : 0,
  ), 0);
  const markedMax = marks.reduce((highest, mark) => (
    Math.max(highest, Number.isFinite(Number(mark.y)) ? Number(mark.y) : 0)
  ), 0);
  // Actual scoring always has to fit, whichever way the axis is anchored.
  const scoredCeiling = Math.max(
    left.pace.total,
    right.pace.total,
    plottedMax,
    markedMax,
    1,
  );
  // The leading projection is the chart's reference point, so it is pinned to
  // the top of the plot: its ray lands in the top-right corner and stays there
  // while its value moves. Adding headroom above it, or letting the axis grow
  // past it, means a rising projection silently shrinks everything already
  // drawn — the scoring history appears to flatten even though nothing about
  // it changed.
  // The gutter label reads liveProjected — current points plus what is still
  // expected — so the ray and the ceiling must use the same number, or the ray
  // cannot sit where the label says it lands.
  const projectedCeiling = Math.max(left.pace.liveProjected, right.pace.liveProjected);
  const maxY = scaleMode === 'scoring'
    // Scoring scale ignores projections entirely; the rays run off the top.
    ? scoredCeiling * 1.2
    : Math.max(projectedCeiling, scoredCeiling);
  const xAt = (value) => PAD_LEFT + (value / xMax) * innerWidth;
  const yAt = (value) => PAD_TOP + innerHeight - (Math.max(0, value) / maxY) * innerHeight;
  const nowX = xAt(slateProgress);
  const baseY = yAt(0);

  const teams = [
    { key: 'a', side: left, value: (point) => point.a },
    { key: 'b', side: right, value: (point) => point.b },
  ];
  const teamLinePoints = {
    a: buildTeamLinePoints(points, 'a'),
    b: buildTeamLinePoints(points, 'b'),
  };
  const linePath = (key, value) => teamLinePoints[key]
    .map((point, index) => `${index ? 'L' : 'M'}${xAt(point.x).toFixed(1)} ${yAt(value(point)).toFixed(1)}`)
    .join(' ');
  const areaPath = (key, value) => (
    `${linePath(key, value)} L${nowX.toFixed(1)} ${baseY.toFixed(1)} L${xAt(0).toFixed(1)} ${baseY.toFixed(1)} Z`
  );

  // Projection labels sit in the right gutter; nudge them apart when the two
  // pace rays finish close together.
  let labelA = yAt(left.pace.liveProjected);
  let labelB = yAt(right.pace.liveProjected);
  if (Math.abs(labelA - labelB) < 15) {
    const push = (15 - Math.abs(labelA - labelB)) / 2;
    if (labelA <= labelB) { labelA -= push; labelB += push; } else { labelA += push; labelB -= push; }
  }
  labelA = Math.max(PAD_TOP + 9, labelA);
  labelB = Math.max(PAD_TOP + 9, labelB);
  // Clamping can collapse both labels onto the ceiling when the pace rays
  // finish above the plotted area — the symmetric nudge above cannot separate
  // them there, so push the lower one clear instead.
  if (Math.abs(labelA - labelB) < 15) {
    if (labelA <= labelB) labelB = labelA + 15;
    else labelA = labelB + 15;
  }
  const labelY = { a: labelA, b: labelB };

  // Track the pointer continuously along the visible paths. A score dot only
  // captures the tracker when the pointer enters its two-dimensional radius;
  // passing above or below a dot at the same x remains smooth.
  const pickPoint = (clientX, clientY, element) => {
    const rect = element.getBoundingClientRect();
    const scaleX = rect.width ? width / rect.width : 1;
    const scaleY = rect.height ? height / rect.height : 1;
    const pointerX = (clientX - rect.left) * scaleX;
    const pointerY = (clientY - rect.top) * scaleY;
    const target = Math.min(slateProgress, Math.max(0, ((pointerX - PAD_LEFT) / innerWidth) * xMax));
    const snappedMark = findClosestMark(marks, {
      pointerX,
      pointerY,
      xAt,
      yAt,
      radius: MARK_SNAP_RADIUS,
    });
    if (snappedMark) {
      return points.find((point) => point.eventId === snappedMark.event.id)
        ?? {
          x: snappedMark.x,
          a: sampleLineValue(teamLinePoints.a, 'a', snappedMark.x),
          b: sampleLineValue(teamLinePoints.b, 'b', snappedMark.x),
        };
    }

    const nearest = points.reduce(
      (best, point) => (Math.abs(point.x - target) < Math.abs(best.x - target) ? point : best),
      points[0],
    );
    return {
      ...nearest,
      x: target,
      progress: target,
      eventId: null,
      at: null,
      a: sampleLineValue(teamLinePoints.a, 'a', target),
      b: sampleLineValue(teamLinePoints.b, 'b', target),
      p: sampleLineValue(points, 'p', target),
    };
  };

  const displayPoint = hover ?? selection;
  const isLive = displayPoint ? displayPoint.x >= slateProgress - 0.005 : false;
  const margin = Math.abs(left.pace.total - right.pace.total);
  const gapPx = Math.abs(yAt(left.pace.total) - yAt(right.pace.total));
  const selectedMark = selectedEventId
    ? marks.find((mark) => mark.event.id === selectedEventId) ?? null
    : null;
  const readoutSource = activeMark ?? selectedMark;
  const readoutMark = readoutSource
    ? `${getLiveEventLabel(readoutSource.event)} · ${readoutSource.event.pts >= 0 ? '+' : '−'}${Math.abs(Number(readoutSource.event.pts) || 0).toFixed(1)}`
    : null;
  const summaryScoreA = Number(displayPoint?.a ?? left.pace.total).toFixed(1);
  const summaryScoreB = Number(displayPoint?.b ?? right.pace.total).toFixed(1);
  const summaryProbA = Number(displayPoint?.p ?? liveWinProbA);
  const probabilityLabels = formatWinProbabilityPair(summaryProbA, {
    settled: Boolean(displayPoint?.settled ?? liveSettled),
  });

  const setZoom = (nextZoom, focusOverride = null) => {
    const boundedZoom = clampZoom(nextZoom);
    if (Math.abs(boundedZoom - zoom) < 0.001) return;
    const viewport = viewportNode.current;
    if (boundedZoom <= MIN_ZOOM) {
      pendingScrollFocus.current = { ratio: 0, offset: 0 };
    } else if (focusOverride != null) {
      pendingScrollFocus.current = focusOverride;
    } else if (zoom <= MIN_ZOOM) {
      pendingScrollFocus.current = {
        ratio: Math.min(1, Math.max(
          0,
          Number(selection?.x ?? hover?.x ?? slateProgress) || 0,
        )),
        offset: (viewport?.clientWidth ?? viewportSize.width) / 2,
      };
    } else if (viewport?.scrollWidth) {
      pendingScrollFocus.current = {
        ratio: (viewport.scrollLeft + viewport.clientWidth / 2) / viewport.scrollWidth,
        offset: viewport.clientWidth / 2,
      };
    }
    zoomRef.current = boundedZoom;
    setZoomValue(boundedZoom);
  };

  // Chromium exposes trackpad pinch as a cancelable ctrl+wheel gesture. Safari
  // uses gesturestart/change instead. Handle both natively so preventDefault
  // stops browser-page zoom while ordinary two-finger scrolling remains owned
  // by the chart viewport.
  useEffect(() => {
    const viewport = viewportNode.current;
    if (!viewport) return undefined;
    let gestureStart = null;
    let requestedZoom = zoomRef.current;
    let requestedFocus = 0.5;
    let zoomFrame = null;

    const focusAt = (clientX) => {
      if (!viewport.scrollWidth) return { ratio: 0.5, offset: viewport.clientWidth / 2 };
      const rect = viewport.getBoundingClientRect();
      const offset = Math.min(viewport.clientWidth, Math.max(0, clientX - rect.left));
      return {
        ratio: Math.min(1, Math.max(
          0,
          (viewport.scrollLeft + offset) / viewport.scrollWidth,
        )),
        offset,
      };
    };
    const requestZoom = (nextZoom, focus) => {
      requestedZoom = clampZoom(nextZoom);
      requestedFocus = focus;
      if (zoomFrame != null) return;
      zoomFrame = window.requestAnimationFrame(() => {
        zoomFrame = null;
        if (Math.abs(requestedZoom - zoomRef.current) < 0.001) return;
        pendingScrollFocus.current = requestedZoom <= MIN_ZOOM
          ? { ratio: 0, offset: 0 }
          : requestedFocus;
        zoomRef.current = requestedZoom;
        setZoomValue(requestedZoom);
      });
    };
    const onWheel = (event) => {
      if ((!event.ctrlKey && !event.metaKey) || event.deltaY === 0) return;
      event.preventDefault();
      if (zoomFrame == null) requestedZoom = zoomRef.current;
      const boundedDelta = Math.min(24, Math.max(-24, event.deltaY));
      requestZoom(
        requestedZoom * Math.exp(-boundedDelta * 0.012),
        focusAt(event.clientX),
      );
    };
    const onGestureStart = (event) => {
      event.preventDefault();
      setDragging(false);
      scrubbedTo.current = null;
      gestureStart = {
        zoom: zoomRef.current,
        focus: focusAt(event.clientX ?? (viewport.getBoundingClientRect().left + viewport.clientWidth / 2)),
      };
    };
    const onGestureChange = (event) => {
      if (!gestureStart) return;
      event.preventDefault();
      requestZoom(gestureStart.zoom * (Number(event.scale) || 1), gestureStart.focus);
    };
    const onGestureEnd = (event) => {
      event.preventDefault();
      gestureStart = null;
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport.addEventListener('gesturestart', onGestureStart, { passive: false });
    viewport.addEventListener('gesturechange', onGestureChange, { passive: false });
    viewport.addEventListener('gestureend', onGestureEnd, { passive: false });
    return () => {
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('gesturestart', onGestureStart);
      viewport.removeEventListener('gesturechange', onGestureChange);
      viewport.removeEventListener('gestureend', onGestureEnd);
      if (zoomFrame != null) window.cancelAnimationFrame(zoomFrame);
    };
  }, []);

  useEffect(() => {
    if (pendingScrollFocus.current == null) return;
    const viewport = viewportNode.current;
    if (!viewport) return;
    const focus = pendingScrollFocus.current;
    pendingScrollFocus.current = null;
    if (zoom <= MIN_ZOOM) {
      viewport.scrollLeft = 0;
      return;
    }
    viewport.scrollLeft = Math.max(
      0,
      Math.min(
        viewport.scrollWidth - viewport.clientWidth,
        focus.ratio * viewport.scrollWidth - focus.offset,
      ),
    );
  }, [zoom, width]);

  const selectMark = (mark) => {
    setActiveMark(mark);
    onSelectMark?.(mark);
  };

  const isZoomed = zoom > MIN_ZOOM + 0.001;
  const previousZoom = [...ZOOM_LEVELS].reverse().find((level) => level < zoom - 0.01) ?? MIN_ZOOM;
  const nextZoom = ZOOM_LEVELS.find((level) => level > zoom + 0.01) ?? MAX_ZOOM;
  const zoomLabel = formatZoom(zoom);

  return (
    <div className={`fl-chart${isZoomed ? ' is-zoomed' : ''}`}>
      <div className={`fl-chart__head${collapsedSummary ? ' is-collapsed' : ''}`}>
        <div className="fl-chart__head-view is-context" aria-hidden={collapsedSummary}>
          <span className="fl-chart__title">
            Pace · {timelineMode === 'schedule' ? 'active games' : 'game day'}
          </span>
          {readoutMark ? (
            <span className="fl-chart__readout is-play">
              <span className="fl-chart__play-line">
                <span className="fl-chart__t">{formatTimelinePoint(readoutSource.x)}</span>
                <span style={{ color: (readoutSource.side === 'a' ? left : right).palette[0] }}>{readoutMark}</span>
              </span>
              {readoutSource.playerName && (
                <span className="fl-chart__player">{readoutSource.playerName}</span>
              )}
            </span>
          ) : displayPoint ? (
            <span className="fl-chart__readout">
              <span className="fl-chart__t">{isLive ? 'Now' : formatTimelinePoint(displayPoint.x)}</span>
              <span style={{ color: left.palette[0] }}>{Number(displayPoint.a ?? 0).toFixed(1)}</span>
              <span className="fl-chart__dash" aria-hidden="true">–</span>
              <span style={{ color: right.palette[0] }}>{Number(displayPoint.b ?? 0).toFixed(1)}</span>
              {Number.isFinite(Number(displayPoint.p)) && (
                <span className="fl-chart__t is-strong">{probabilityLabels.a} {left.initials}</span>
              )}
            </span>
          ) : (
            <span className="fl-chart__readout">
              <span className="fl-chart__t">
                {isZoomed
                  ? 'Tap a play to rewind'
                  : marks.length ? 'Drag to rewind · tap a play' : 'Scored vs pace · drag to rewind'}
              </span>
            </span>
          )}
          {selection && !collapsedSummary && (
            <button type="button" className="fl-chart__live" onClick={onReturnLive}>
              Back to live
            </button>
          )}
        </div>

        <div className="fl-chart__head-view is-summary" aria-hidden={!collapsedSummary}>
          <span className="fl-chart-summary__state">
            {selection ? 'Looking back' : 'Live matchup'}
          </span>
          <span className="fl-chart-summary__team is-a">
            <i style={{ background: left.palette[0] }} aria-hidden="true" />
            <span>{left.isMine ? 'You' : left.initials}</span>
            <b>{summaryScoreA}</b>
          </span>
          <span className="fl-chart-summary__divider" aria-hidden="true">–</span>
          <span className="fl-chart-summary__team is-b">
            <b>{summaryScoreB}</b>
            <span>{right.isMine ? 'You' : right.initials}</span>
            <i style={{ background: right.palette[0] }} aria-hidden="true" />
          </span>
          <span className="fl-chart-summary__odds">
            {probabilityLabels.a} {left.initials}
          </span>
          {selection && collapsedSummary && (
            <button type="button" className="fl-chart__live" onClick={onReturnLive}>
              Back to live
            </button>
          )}
        </div>
      </div>
      <div className="fl-chart__tools" aria-label="Chart zoom controls">
        <span className="fl-chart__zoom-label">View</span>
        <div className="fl-chart__zoom" role="group" aria-label="Chart zoom">
          <button
            type="button"
            onClick={() => setZoom(previousZoom)}
            disabled={!isZoomed}
            aria-label="Zoom chart out"
            title="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            className="fl-chart__zoom-level"
            onClick={() => setZoom(MIN_ZOOM)}
            disabled={!isZoomed}
            aria-label={!isZoomed ? 'Chart fit to width' : `Reset chart zoom from ${zoomLabel} times`}
            title="Fit chart to width"
          >
            {!isZoomed ? 'Fit' : `${zoomLabel}×`}
          </button>
          <button
            type="button"
            onClick={() => setZoom(nextZoom)}
            disabled={zoom >= MAX_ZOOM - 0.001}
            aria-label="Zoom chart in"
            title="Zoom in"
          >
            +
          </button>
        </div>
        <span className="fl-chart__pan-hint" aria-live="polite">
          {!isZoomed ? 'Pinch to zoom' : 'Scroll to pan'}
        </span>
      </div>
      <div
        className="fl-chart__viewport"
        ref={setViewportRef}
        role="region"
        tabIndex={isZoomed ? 0 : -1}
        aria-label={isZoomed
          ? `Zoomed scoring pace chart, ${zoomLabel} times. Scroll horizontally to pan or pinch to zoom.`
          : 'Scoring pace chart. Pinch to zoom.'}
        onWheel={(event) => {
          if (!event.shiftKey || !isZoomed || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
          event.preventDefault();
          event.currentTarget.scrollLeft += event.deltaY;
        }}
      >
        <svg
          width={width}
          height={height}
          style={{ height: `${height}px`, width: `${width}px` }}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Scoring pace. ${left.name} ${left.pace.total.toFixed(1)}, ${right.name} ${right.pace.total.toFixed(1)}.`}
          onPointerMove={(event) => {
            const point = pickPoint(event.clientX, event.clientY, event.currentTarget);
            onHover?.(point);
            if (dragging) scrubbedTo.current = point;
          }}
          onPointerDown={(event) => {
            try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* capture is best-effort */ }
            setDragging(true);
            setActiveMark(null);
            const point = pickPoint(event.clientX, event.clientY, event.currentTarget);
            onHover?.(point);
            scrubbedTo.current = point;
          }}
          // The feed only jumps when the drag ends: moving it mid-drag would
          // scroll the chart out from under the finger.
          onPointerUp={() => {
            setDragging(false);
            if (scrubbedTo.current != null) onScrub?.(scrubbedTo.current);
            scrubbedTo.current = null;
          }}
          onPointerCancel={() => {
            setDragging(false);
            scrubbedTo.current = null;
          }}
          onPointerLeave={() => { setDragging(false); onHover?.(null); setActiveMark(null); }}
        >
        <defs>
          {teams.map(({ key, side }) => (
            <linearGradient key={key} id={`fl-pace-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={side.palette[0]} stopOpacity="0.38" />
              <stop offset="100%" stopColor={side.palette[0]} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>

        {slateProgress < 1 && (
          <rect
            x={nowX}
            y={PAD_TOP - 6}
            width={Math.max(0, xAt(xMax) - nowX)}
            height={innerHeight + 6}
            className="fl-chart__future"
          />
        )}

        {teams.map(({ key, value }) => (
          <path key={`area-${key}`} d={areaPath(key, value)} fill={`url(#fl-pace-${key})`} />
        ))}
        <line x1={PAD_LEFT} y1={baseY} x2={xAt(xMax)} y2={baseY} className="fl-chart__axis" />

        {teams.map(({ key, side }) => (
          <line
            key={`pace-${key}`}
            x1={xAt(0)}
            y1={baseY}
            x2={xAt(xMax)}
            y2={yAt(side.pace.liveProjected)}
            stroke={side.palette[0]}
            strokeWidth="1.2"
            strokeDasharray="2 4"
            opacity="0.45"
          />
        ))}
        {teams.map(({ key, side, value }) => (
          <path
            key={`line-${key}`}
            className="fl-chart__line"
            data-side={key}
            d={linePath(key, value)}
            fill="none"
            stroke={side.palette[0]}
            strokeWidth="2.6"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* Milestones: the plays that actually moved this matchup. */}
        {marks.map((mark) => {
          const colour = (mark.side === 'a' ? left : right).palette[0];
          const isSelected = selectedEventId === mark.event.id;
          const isActive = activeMark?.event.id === mark.event.id || isSelected;
          const markerRadius = isActive ? 5 : mark.emphasized ? 3.2 : 2.5;
          return (
            <g
              key={mark.event.id}
              className={`fl-chart__mark${mark.negative ? ' is-negative' : ''}${isActive ? ' is-active' : ''}${isSelected ? ' is-selected' : ''}`}
              data-side={mark.side}
              role="button"
              tabIndex={0}
              aria-label={[
                mark.playerName,
                getLiveEventLabel(mark.event),
                mark.event.desc,
                formatTimelinePoint(mark.x),
              ].filter(Boolean).join(', ')}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerEnter={() => setActiveMark(mark)}
              onPointerLeave={() => setActiveMark(null)}
              onClick={(event) => { event.stopPropagation(); selectMark(mark); }}
              onFocus={() => setActiveMark(mark)}
              onBlur={() => setActiveMark(null)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                selectMark(mark);
              }}
            >
              <circle cx={xAt(mark.x)} cy={yAt(mark.y)} r={MARK_HIT_RADIUS} fill="transparent" />
              <circle
                cx={xAt(mark.x)}
                cy={yAt(mark.y)}
                r={markerRadius}
                fill={mark.negative ? 'var(--color-accent-red)' : isActive ? colour : 'var(--color-bg)'}
                stroke={mark.negative ? 'var(--color-accent-red)' : colour}
                strokeWidth="1.8"
              />
            </g>
          );
        })}

        <line x1={nowX} y1={yAt(left.pace.total)} x2={nowX} y2={yAt(right.pace.total)} className="fl-chart__gap" />
        {gapPx > 16 && (
          <text x={nowX - 7} y={(yAt(left.pace.total) + yAt(right.pace.total)) / 2 + 4} textAnchor="end" className="fl-chart__margin">
            {left.pace.total >= right.pace.total ? '+' : '−'}{margin.toFixed(1)}
          </text>
        )}

        {teams.map(({ key, side }) => (
          <g key={`cap-${key}`}>
            <circle cx={nowX} cy={yAt(side.pace.total)} r="4.4" fill={side.palette[0]} className="fl-chart__cap" />
            <text x={xAt(xMax) + 7} y={labelY[key] - 6} className="fl-chart__axis-label">Proj</text>
            <text x={xAt(xMax) + 7} y={labelY[key] + 6} fill={side.palette[0]} className="fl-chart__proj">
              {side.pace.liveProjected.toFixed(1)}
            </text>
          </g>
        ))}

        <line x1={nowX} y1={PAD_TOP - 6} x2={nowX} y2={PAD_TOP + innerHeight} className="fl-chart__now" />
        {displayPoint && !isLive && (
          <g className={selection && !hover ? 'is-selected' : undefined}>
            <line x1={xAt(displayPoint.x)} y1={PAD_TOP - 6} x2={xAt(displayPoint.x)} y2={PAD_TOP + innerHeight} className="fl-chart__scrub" />
            <circle cx={xAt(displayPoint.x)} cy={yAt(displayPoint.a)} r="3.6" fill={left.palette[0]} className="fl-chart__cap" />
            <circle cx={xAt(displayPoint.x)} cy={yAt(displayPoint.b)} r="3.6" fill={right.palette[0]} className="fl-chart__cap" />
          </g>
        )}

        {timelineMode === 'schedule' ? (
          timeline?.ticks?.map((tick, index) => (
            <text
              key={tick.dayKey}
              x={index === 0 ? PAD_LEFT : xAt(tick.x)}
              y={height - 4}
              textAnchor={index === 0 ? 'start' : 'middle'}
              className="fl-chart__axis-label"
            >
              {tick.label}
            </text>
          ))
        ) : (
          <text x={PAD_LEFT} y={height - 4} className="fl-chart__axis-label">Kickoff</text>
        )}
        {timelineMode !== 'schedule' && (
          <text x={nowX} y={height - 4} textAnchor="middle" className="fl-chart__axis-label is-strong">Now</text>
        )}
        </svg>
      </div>
    </div>
  );
}
