import { startTransition, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getSeriesPointAt, isNotablePlay } from '../../../utils/matchupReplay.js';

// Win chance (default) or Lead over the week, on the kickoff-window axis.
// Tap or drag to replay; tap a scoring dot to rewind to that play. Hand-drawn
// SVG, sized from the container. Rules: docs/Fantasy Live.md.

// Hovering or dragging within this distance of a notable play's dot snaps the
// crosshair (and the replay) onto that play; a click there selects it.
const SNAP_RADIUS = 20;

function niceStep(extent) {
  if (extent <= 12) return 5;
  if (extent <= 30) return 10;
  if (extent <= 60) return 20;
  if (extent <= 150) return 50;
  return 100;
}

function signed(value, digits = 1) {
  const numeric = Number(value) || 0;
  return `${numeric >= 0 ? '+' : '−'}${Math.abs(numeric).toFixed(digits)}`;
}

export default function MatchupLiveChart({
  view = 'wp',
  axis,
  series,
  events,
  mineKey,
  livePosition,
  // A finished week: no live marker at the end of the axis.
  final = false,
  at,
  selectedPlayId,
  mineColor,
  oppColor,
  mineName,
  oppName,
  onSeek,
  onSelectPlay,
}) {
  const boxRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState(null);
  const clipId = useId().replace(/:/g, '');
  const draggingRef = useRef(false);

  useLayoutEffect(() => {
    const node = boxRef.current;
    if (!node) return undefined;
    const measure = () => setWidth(Math.round(node.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const position = at ?? livePosition;
  const oppKey = mineKey === 'a' ? 'b' : 'a';
  const isLead = view === 'lead';
  const valueOf = (point) => {
    if (!point) return 0;
    if (isLead) return (Number(point[mineKey]) || 0) - (Number(point[oppKey]) || 0);
    const p = Number(point.p);
    return Number.isFinite(p) ? (mineKey === 'a' ? p : 100 - p) : 50;
  };

  const model = useMemo(() => {
    if (!width || !series.length) return null;
    const W = width;
    const H = W < 480 ? 210 : Math.round(Math.min(300, Math.max(220, W * 0.46)));
    const current = getSeriesPointAt(series, at);
    const visible = series.filter((point) => Number(point.x) <= position + 1e-6);
    const path = [...visible, { ...current, x: position }];
    let domain;
    let ticks;
    let label;
    if (isLead) {
      const seen = Math.max(0, ...path.map((point) => Math.abs(valueOf(point))));
      const projected = Math.abs((Number(current?.[mineKey === 'a' ? 'expectedA' : 'expectedB']) || 0)
        - (Number(current?.[mineKey === 'a' ? 'expectedB' : 'expectedA']) || 0));
      const raw = Math.max(10, seen, projected) * 1.12;
      const step = niceStep(raw);
      const ext = Math.ceil(raw / step) * step;
      domain = [-ext, ext];
      ticks = [];
      for (let value = -ext; value <= ext + 1e-9; value += step) ticks.push(value);
      if (ticks.length > 7) ticks = ticks.filter((_, index) => index % 2 === 0 || ticks[index] === 0);
      label = (value) => (value === 0 ? 'TIED' : `${value > 0 ? '+' : '−'}${Math.abs(value)}`);
    } else {
      domain = [0, 100];
      ticks = [0, 25, 50, 75, 100];
      label = (value) => `${value}%`;
    }
    const longest = Math.max(...ticks.map((value) => label(value).length));
    const m = { t: 12, r: 8, b: 26, l: longest * 7 + 12 };
    const plotW = W - m.l - m.r;
    const x = (p) => m.l + Math.min(1, Math.max(0, p)) * plotW;
    const y = (value) => m.t + (1 - (value - domain[0]) / (domain[1] - domain[0])) * (H - m.t - m.b);
    const mid = isLead ? 0 : 50;
    const points = path.map((point) => [x(Number(point.x) || 0), y(valueOf(point))]);
    let line = '';
    points.forEach(([px, py], index) => {
      if (!index) { line += `M${px},${py}`; return; }
      if (isLead) line += `H${px}V${py}`; // scores move in steps
      else line += `L${px},${py}`;
    });
    const area = points.length
      ? `${line}V${y(mid)}H${points[0][0]}Z`
      : '';
    const pointByEvent = new Map(series.filter((point) => point.eventId).map((point) => [point.eventId, point]));
    const dots = events
      // Every play moves the line; only notable ones get a dot.
      .filter((event) => Number(event.progress) <= position + 1e-6 && isNotablePlay(event))
      .map((event) => {
        const point = pointByEvent.get(event.id);
        if (!point) return null;
        return { id: event.id, p: Number(point.x), event, cx: x(Number(point.x)), cy: y(valueOf(point)), side: event.side, negative: Number(event.pts) < 0 };
      })
      .filter(Boolean);
    const projection = isLead && at == null && position < 1
      ? {
          x1: x(position),
          y1: y(valueOf(current)),
          x2: x(1),
          y2: y(Math.max(domain[0], Math.min(domain[1],
            (Number(current?.[mineKey === 'a' ? 'expectedA' : 'expectedB']) || 0)
            - (Number(current?.[mineKey === 'a' ? 'expectedB' : 'expectedA']) || 0)))),
          value: (Number(current?.[mineKey === 'a' ? 'expectedA' : 'expectedB']) || 0)
            - (Number(current?.[mineKey === 'a' ? 'expectedB' : 'expectedA']) || 0),
        }
      : null;
    const selectedEvent = selectedPlayId ? events.find((event) => event.id === selectedPlayId) : null;
    const selectedPoint = selectedEvent ? pointByEvent.get(selectedEvent.id) : null;
    const selected = selectedEvent && selectedPoint && Number(selectedPoint.x) <= position + 1e-6
      ? { event: selectedEvent, cx: x(Number(selectedPoint.x)), cy: y(valueOf(selectedPoint)), point: selectedPoint }
      : null;
    return { W, H, m, x, y, mid, ticks, label, line, area, dots, projection, current, selected, plotW };
    // valueOf depends only on view and mineKey, both listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, events, isLead, mineKey, position, selectedPlayId, series, width]);

  const positionFromEvent = (event) => {
    const svg = event.currentTarget.ownerSVGElement ?? event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const px = (event.clientX - rect.left) * (model.W / rect.width);
    return { px, py: (event.clientY - rect.top) * (model.W / rect.width), p: Math.max(0, Math.min(1, (px - model.m.l) / model.plotW)) };
  };
  const hitDot = (px, py) => {
    let best = null;
    let bestDistance = SNAP_RADIUS;
    model.dots.forEach((dot) => {
      const distance = Math.hypot(dot.cx - px, dot.cy - py);
      if (distance < bestDistance) { bestDistance = distance; best = dot; }
    });
    return best;
  };

  // Scrubbing re-renders the whole matchup page; as a transition it never
  // holds back the hover line, which follows the pointer directly.
  const dragSeek = (p) => startTransition(() => onSeek(p >= livePosition - 1e-6 ? null : p));
  const onPointerDown = (event) => {
    if (!model || event.button !== 0) return;
    const { px, py, p } = positionFromEvent(event);
    const dot = hitDot(px, py);
    if (dot) { onSelectPlay(dot.id); return; }
    event.preventDefault();
    draggingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragSeek(p);
  };
  const onPointerMove = (event) => {
    if (!model) return;
    const { px, py, p } = positionFromEvent(event);
    const snap = hitDot(px, py);
    const clamped = snap ? snap.p : Math.min(p, livePosition);
    const point = getSeriesPointAt(series, clamped);
    const lastPlay = snap?.event ?? [...events].filter((candidate) => Number(candidate.progress) <= clamped + 1e-6)
      .sort((left, right) => Number(right.progress) - Number(left.progress))[0] ?? null;
    setHover({ px: snap ? snap.cx : model.x(clamped), p: clamped, point, lastPlay, clientPx: px, snap: snap ? { id: snap.id, cx: snap.cx, cy: snap.cy } : null });
    if (!draggingRef.current) return;
    // The button was released somewhere the pointer-up never reached.
    if (event.pointerType === 'mouse' && event.buttons === 0) { draggingRef.current = false; return; }
    dragSeek(clamped);
  };
  const endDrag = () => { draggingRef.current = false; };

  const winMine = (point) => {
    const p = Number(point?.p);
    return Number.isFinite(p) ? Math.round(mineKey === 'a' ? p : 100 - p) : null;
  };

  return (
    <div className="matchup-live-chart" ref={boxRef}>
      {model && (
        <svg
          width="100%"
          viewBox={`0 0 ${model.W} ${model.H}`}
          role="img"
          aria-label={isLead ? 'How far ahead you are over the week' : 'Your chance to win over the week'}
        >
          <defs>
            <clipPath id={`${clipId}-above`}><rect x="0" y="0" width={model.W} height={model.y(model.mid)} /></clipPath>
            <clipPath id={`${clipId}-below`}><rect x="0" y={model.y(model.mid)} width={model.W} height={model.H} /></clipPath>
          </defs>
          {axis.windows.map((window) => {
            const x0 = model.x(window.p0);
            const x1 = model.x(window.p1);
            return (
              <g key={window.index}>
                {window.index % 2 === 1 && <rect x={x0} y={model.m.t} width={x1 - x0} height={model.H - model.m.t - model.m.b} className="matchup-live-chart__band" />}
                {x1 - x0 >= window.label.length * 6 + 8 && (
                  <text x={(x0 + x1) / 2} y={model.H - 8} textAnchor="middle" className="matchup-live-chart__tick">{window.label.toUpperCase()}</text>
                )}
              </g>
            );
          })}
          {model.ticks.map((value) => (
            <g key={value}>
              <line x1={model.m.l} x2={model.W - model.m.r} y1={model.y(value)} y2={model.y(value)} className={value === model.mid ? 'matchup-live-chart__mid' : 'matchup-live-chart__grid'} />
              <text x={model.m.l - 8} y={model.y(value)} dy="0.32em" textAnchor="end" className="matchup-live-chart__tick">{model.label(value)}</text>
            </g>
          ))}
          <rect x={model.x(position)} y={model.m.t} width={Math.max(0, model.x(1) - model.x(position))} height={model.H - model.m.t - model.m.b} className="matchup-live-chart__future" />
          {[['above', mineColor], ['below', oppColor]].map(([part, color]) => (
            <g key={part} clipPath={`url(#${clipId}-${part})`}>
              <path d={model.area} fill={color} className="matchup-live-chart__area" />
              <path d={model.line} stroke={color} className="matchup-live-chart__line" />
            </g>
          ))}
          {model.projection && (
            <g>
              <line {...model.projection} className="matchup-live-chart__projection" />
              {model.x(1) - model.x(position) > 90 && (
                <text x={model.x(1) - 4} y={model.projection.y2 + (model.projection.value >= 0 ? -7 : 15)} textAnchor="end" className="matchup-live-chart__tick">
                  {`PROJ. ${signed(model.projection.value, 0)}`}
                </text>
              )}
            </g>
          )}
          {model.dots.map((dot) => (
            <circle
              key={dot.id}
              cx={dot.cx}
              cy={dot.cy}
              r={3.5}
              className={`matchup-live-chart__dot${dot.negative ? ' is-negative' : ''}`}
              fill={dot.negative ? undefined : (dot.side === 'mine' ? mineColor : oppColor)}
            />
          ))}
          {!final && <line x1={model.x(livePosition)} x2={model.x(livePosition)} y1={model.m.t} y2={model.H - model.m.b} className="matchup-live-chart__live" />}
          {at != null && <line x1={model.x(position)} x2={model.x(position)} y1={model.m.t} y2={model.H - model.m.b} className="matchup-live-chart__replay" />}
          <circle cx={model.x(position)} cy={model.y(valueOf(model.current))} r={4.5} className="matchup-live-chart__now" />
          {model.selected && (() => {
            const { cx, cy, event, point } = model.selected;
            const value = isLead
              ? `${valueOf(point) >= 0 ? 'UP' : 'DOWN'} ${Math.abs(valueOf(point)).toFixed(1)}`
              : `${winMine(point)}% TO WIN`;
            const lines = [
              `${String(event.playerName ?? '').toUpperCase()} ${signed(event.pts, 2)}`,
              Number.isFinite(Number(event.swingMine)) && Math.abs(Number(event.swingMine)) >= 0.5
                ? `${value} · ${signed(event.swingMine, 0)}% WIN`
                : value,
            ];
            const boxW = Math.max(...lines.map((text) => text.length)) * 6.4 + 16;
            const right = cx + 14 + boxW <= model.W - model.m.r;
            const bx = right ? cx + 14 : cx - 14 - boxW;
            const by = Math.max(model.m.t, Math.min(model.H - model.m.b - 38, cy - 19));
            return (
              <g className="matchup-live-chart__selected" pointerEvents="none">
                <line x1={cx} x2={cx} y1={model.m.t} y2={model.H - model.m.b} />
                <circle cx={cx} cy={cy} r={8} />
                <rect x={bx} y={by} width={boxW} height={38} rx={8} />
                {lines.map((text, index) => (
                  <text key={text} x={bx + 8} y={by + 15 + index * 14}>{text}</text>
                ))}
              </g>
            );
          })()}
          {hover && (
            <line x1={hover.px} x2={hover.px} y1={model.m.t} y2={model.H - model.m.b} className="matchup-live-chart__hover" />
          )}
          {hover?.snap && (
            <circle cx={hover.snap.cx} cy={hover.snap.cy} r={7} className="matchup-live-chart__snap" pointerEvents="none" />
          )}
          <rect
            x={model.m.l}
            y={0}
            width={model.plotW}
            height={model.H}
            fill="transparent"
            className={`matchup-live-chart__overlay${hover?.snap ? ' is-snapped' : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
            onPointerLeave={() => { if (!draggingRef.current) setHover(null); }}
          />
        </svg>
      )}
      {model && hover?.point && (
        <div
          className="matchup-live-chart__tip"
          style={{
            left: `${Math.max(4, Math.min(model.W - 244, hover.clientPx + 252 > model.W ? hover.clientPx - 252 : hover.clientPx + 12))}px`,
          }}
          role="presentation"
        >
          <div className="matchup-live-chart__tip-title">{axis.windowAt(hover.p)?.longLabel ?? ''}</div>
          {[[mineColor, mineName, hover.point[mineKey], winMine(hover.point)], [oppColor, oppName, hover.point[oppKey], winMine(hover.point) == null ? null : 100 - winMine(hover.point)]]
            .map(([color, name, score, win]) => (
              <div className="matchup-live-chart__tip-row" key={name}>
                <i style={{ background: color }} />
                <span>{name}</span>
                <b>{(Number(score) || 0).toFixed(2)}{win == null ? '' : ` · ${win}%`}</b>
              </div>
            ))}
          {hover.lastPlay && (
            <div className="matchup-live-chart__tip-last">
              {`${hover.lastPlay.playerName ?? ''}: ${hover.lastPlay.description ?? ''} (${signed(hover.lastPlay.pts, 2)})`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
