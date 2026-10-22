/* SVG charts for the player drilldown. Every chart is drawn at its
   container's real pixel width (labels keep their size instead of scaling)
   and falls back to a fixed width for the server render and first paint. */

import { useLayoutEffect, useRef, useState } from 'react';
import { fmt, r1, sgn, useChartWidth } from './drilldownChartUtils.js';

/* Text labels drop out by priority instead of overlapping. */
function placeLabels(list) {
  const kept = [];
  list.slice().sort((a, b) => (b.pri ?? 0) - (a.pri ?? 0)).forEach((label) => {
    const charWidth = label.cls === 'b' ? 7.6 : label.cls === 's' || label.cls === 'sb' ? 6.9 : 6.2;
    const width = String(label.t).length * charWidth + 6;
    const anchor = label.a ?? 'middle';
    const x0 = anchor === 'middle' ? label.x - width / 2 : anchor === 'end' ? label.x - width : label.x;
    if (kept.some(other => Math.abs(other.y - label.y) < 14 && x0 < other.x1 && x0 + width > other.x0)) return;
    kept.push({ ...label, a: anchor, x0, x1: x0 + width });
  });
  return kept;
}

function Labels({ items }) {
  return placeLabels(items).map((label, index) => (
    <text key={`${label.t}-${index}`} x={r1(label.x)} y={r1(label.y)} textAnchor={label.a} className={label.cls} style={label.fill ? { fill: label.fill } : undefined}>{label.t}</text>
  ));
}

/* Hover/tap tooltip. It sits above its anchor, flips below when the
   dialog's scroll area has no room above, and is kept inside the chart's
   width so it is never clipped. Placement is measured before paint. */
function Tip({ tip, width }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !tip) return;
    const chart = el.parentElement.getBoundingClientRect();
    const scroller = el.closest('.pmd-body')?.getBoundingClientRect() ?? { top: 0 };
    const half = el.offsetWidth / 2;
    el.style.left = `${Math.max(half, Math.min(width - half, tip.x))}px`;
    const roomAbove = chart.top + tip.above - Math.max(0, scroller.top);
    const below = roomAbove < el.offsetHeight + 4;
    el.style.top = `${below ? tip.below : tip.above}px`;
    el.style.transform = below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)';
  }, [tip, width]);
  if (!tip) return null;
  return (
    <div ref={ref} className="pdd-tip" role="status" style={{ left: tip.x, top: tip.above }}>
      <b>{tip.title}</b>
      {tip.value && <span className="pdd-tip__p">{tip.value}</span>}
      {tip.lines?.map(line => <span key={line}>{line}</span>)}
    </div>
  );
}

/* Likely outcome: past games, likely range, season average and projection on
   one scale. With `onSelect`, a past game is also a week filter. */
export function OutlookChart({ games = [], projected, average, low, high, selectedWeek = null, onSelect, ariaLabel }) {
  const [ref, width, compact] = useChartWidth();
  const [active, setActive] = useState(null);
  const H = compact ? 76 : 100;
  const L = 10;
  const R = 10;
  const iw = Math.max(40, width - L - R);
  const values = [projected, average, high, ...games.map(game => game.points)].filter(value => Number.isFinite(value));
  const max = Math.max(10, Math.ceil(Math.max(...values, 0) * 1.1 / 5) * 5);
  const x = value => L + Math.max(0, Math.min(max, value)) / max * iw;
  const ty = compact ? 38 : 58;
  const band = Number.isFinite(low) && Number.isFinite(high) && high > low;
  const activeGame = games.find(game => game.week === active) ?? null;
  const selectedGame = games.find(game => game.week === selectedWeek) ?? null;
  return (
    <div className="pdd-chart" ref={ref} role="figure" aria-label={ariaLabel}>
      <svg className="pdd-svg" width={width} height={H} viewBox={`0 0 ${width} ${H}`} role={games.length ? 'group' : undefined}>
        <rect x={L} y={ty - 2} width={iw} height={4} rx={2} fill="var(--color-fill)" />
        {band && <rect x={x(low)} y={ty - 9} width={x(high) - x(low)} height={18} rx={5} fill="var(--color-drilldown-band)" />}
        {games.map(game => (
          <g
            key={game.week}
            className={`pdd-hit${active === game.week ? ' is-on' : ''}`}
            tabIndex={0}
            role="button"
            aria-label={game.ariaLabel}
            aria-pressed={onSelect ? game.week === selectedWeek : undefined}
            aria-expanded={onSelect ? undefined : active === game.week}
            onPointerEnter={event => { if (event.pointerType === 'mouse') setActive(game.week); }}
            onPointerLeave={event => { if (event.pointerType === 'mouse') setActive(null); }}
            onFocus={(event) => { if (event.currentTarget.matches?.(':focus-visible')) setActive(game.week); }}
            onBlur={() => setActive(null)}
            onClick={() => { setActive(game.week); onSelect?.(game.week); }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setActive(null);
              else if (onSelect && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(game.week); }
            }}
          >
            <circle cx={x(game.points)} cy={ty} r={14} fill="transparent" />
            {game.week !== selectedWeek && <circle className="v" cx={x(game.points)} cy={ty} r={6} fill="var(--color-label-tertiary)" />}
          </g>
        ))}
        {Number.isFinite(average) && <line x1={x(average)} x2={x(average)} y1={ty - 14} y2={ty + 14} stroke="var(--color-label)" strokeWidth={1.5} strokeDasharray="3 3" />}
        {Number.isFinite(projected) && <line x1={x(projected)} x2={x(projected)} y1={ty - 16} y2={ty + 16} stroke="var(--color-signature)" strokeWidth={5} strokeLinecap="round" />}
        {selectedGame && <circle cx={x(selectedGame.points)} cy={ty} r={8} fill="var(--color-accent)" stroke="var(--color-bg)" strokeWidth={2} pointerEvents="none" />}
        <Labels items={[
          Number.isFinite(projected) && { x: x(projected), y: compact ? 11 : 13, t: `Proj ${fmt(projected)}`, cls: 'b', pri: 9 },
          selectedGame && { x: x(selectedGame.points), y: ty - 16, t: `W${selectedGame.week} ${fmt(selectedGame.points)}`, cls: 'b', pri: 7, fill: 'var(--color-accent)' },
          Number.isFinite(average) && { x: x(average), y: H - 4, t: `Avg ${fmt(average)}`, pri: 8, fill: 'var(--color-label)' },
          band && { x: x(low), y: H - 4, t: fmt(low), pri: 6 },
          band && { x: x(high), y: H - 4, t: fmt(high), pri: 6 },
          { x: L, y: H - 4, t: '0', a: 'start', pri: 1 },
          { x: L + iw, y: H - 4, t: `${max} pts`, a: 'end', pri: 1 },
        ].filter(Boolean)} />
      </svg>
      {activeGame && <Tip width={width} tip={{ x: x(activeGame.points), above: ty - 10, below: ty + 10, title: activeGame.title, value: `${fmt(activeGame.points)} pts`, lines: activeGame.lines }} />}
    </div>
  );
}

function niceTicks(lo, hi) {
  const span = hi - lo;
  const step = span <= 4 ? 1 : span <= 10 ? 2 : span <= 25 ? 5 : 10;
  const ticks = [];
  for (let value = Math.ceil(lo / step) * step; value <= hi + 1e-9; value += step) ticks.push(r1(value));
  return ticks;
}

/* Projection bridge: season average → adjustments → projection. */
export function BridgeChart({ steps = [], ariaLabel }) {
  const [ref, width, compact] = useChartWidth();
  const rh = compact ? 28 : 34;
  const top = 4;
  const H = steps.length * rh + top + 22;
  const LW = Math.min(118, width * 0.34);
  const RW = 48;
  const geometry = [];
  for (let index = 0, running = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const from = running;
    running = step.kind === 'base' || step.kind === 'total' ? step.value : running + step.value;
    geometry.push({ from, to: running });
  }
  const positions = geometry.map(item => item.to);
  const lo0 = Math.min(...positions, steps[0]?.value ?? 0);
  const hi0 = Math.max(...positions, steps[0]?.value ?? 0);
  const pad = Math.max(0.5, (hi0 - lo0) * 0.15);
  const lo = Math.max(0, lo0 - pad);
  const hi = hi0 + pad;
  const x0 = LW;
  const x1 = Math.max(x0 + 40, width - RW);
  const x = value => x0 + (value - lo) / (hi - lo || 1) * (x1 - x0);
  return (
    <div className="pdd-chart" ref={ref} role="figure" aria-label={ariaLabel}>
      <svg className="pdd-svg" width={width} height={H} viewBox={`0 0 ${width} ${H}`} aria-hidden="true">
        {niceTicks(lo, hi).map(value => (
          <g key={value}>
            <line x1={x(value)} x2={x(value)} y1={top} y2={H - 20} stroke="var(--color-separator)" />
            <text x={x(value)} y={H - 4} textAnchor="middle">{value}</text>
          </g>
        ))}
        {steps.map((step, index) => {
          const cy = top + rh * index + rh / 2;
          const total = step.kind === 'total';
          const { from, to: run } = geometry[index];
          let fill = 'var(--color-label)';
          let mark;
          let valueText;
          if (step.kind === 'base') {
            mark = <circle cx={x(run)} cy={cy} r={6} fill="var(--color-label-secondary)" />;
            valueText = fmt(step.value);
          } else if (total) {
            mark = <circle cx={x(step.value)} cy={cy} r={8} fill="var(--color-signature)" />;
            valueText = fmt(step.value);
          } else if (Math.abs(step.value) < 0.05) {
            mark = <circle cx={x(run)} cy={cy} r={4} fill="var(--color-label-tertiary)" />;
            valueText = '0.0';
            fill = 'var(--color-label-tertiary)';
          } else {
            const a = x(Math.min(from, run));
            const b = x(Math.max(from, run));
            fill = step.value > 0 ? 'var(--color-accent-green)' : 'var(--color-accent-red)';
            mark = <rect x={a} y={cy - 8} width={Math.max(2, b - a)} height={16} rx={3} fill={fill} />;
            valueText = sgn(step.value);
          }
          return (
            <g key={step.id ?? step.label}>
              <text x={0} y={cy + 5} className={total ? 'sb' : 's'}>{step.label}</text>
              {mark}
              {index < steps.length - 1 && <line x1={x(run)} x2={x(run)} y1={cy + 9} y2={cy + rh - 9} stroke="var(--color-label-tertiary)" strokeDasharray="2 3" />}
              <text x={width} y={cy + 5} textAnchor="end" className="b" style={{ fill }}>{valueText}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* Projection by scoring category: each row runs from the season-average
   points to the projected points on one scale with zero marked, so a
   deduction stays left of zero on both ends. The total is a numbers row. */
export function CategoryShiftChart({ categories = [], average = null, projected = null, columns = { average: 'Avg', projected: 'Proj' }, ariaLabel }) {
  const [ref, width, compact] = useChartWidth();
  const rh = compact ? 26 : 30;
  const top = compact ? 18 : 22;
  const H = top + categories.length * rh + (compact ? 30 : 40);
  const LW = Math.min(104, width * 0.3);
  const NW = 44;
  const x0 = LW;
  const x1 = Math.max(x0 + 40, width - NW * 2 - 12);
  const values = categories.flatMap(category => [category.average, category.projected]);
  const lo = Math.min(0, ...values);
  const hi = Math.max(1, ...values);
  const pad = (hi - lo) * 0.06;
  const x = value => x0 + (value - lo + pad) / (hi - lo + pad * 2) * (x1 - x0);
  const toneOf = change => (Math.abs(change) < 0.05 ? 'var(--color-label-tertiary)' : change > 0 ? 'var(--color-accent-green)' : 'var(--color-accent-red)');
  const totalY = top + categories.length * rh + (compact ? 18 : 22);
  return (
    <div className="pdd-chart" ref={ref} role="figure" aria-label={ariaLabel}>
      <svg className="pdd-svg" width={width} height={H} viewBox={`0 0 ${width} ${H}`} aria-hidden="true">
        <text x={width - NW} y={top - 8} textAnchor="end">{columns.average}</text>
        <text x={width} y={top - 8} textAnchor="end">{columns.projected}</text>
        {lo < 0 && <>
          <line x1={x(0)} x2={x(0)} y1={top} y2={top + categories.length * rh} stroke="var(--color-separator)" />
          <text x={x(0)} y={top - 8} textAnchor="middle">0</text>
        </>}
        {categories.map((category, index) => {
          const cy = top + rh * index + rh / 2;
          const tone = toneOf(category.change);
          const a = x(category.average);
          const b = x(category.projected);
          return (
            <g key={category.id}>
              <text x={0} y={cy + 5} className="s">{category.label}</text>
              <line x1={x0} x2={x1} y1={cy} y2={cy} stroke="var(--color-fill)" strokeWidth={2} />
              {Math.abs(b - a) > 1 && <line x1={a} x2={b} y1={cy} y2={cy} stroke={tone} strokeWidth={4} strokeLinecap="round" />}
              <circle cx={a} cy={cy} r={5} fill="var(--color-label-secondary)" />
              <circle cx={b} cy={cy} r={6} fill={tone} />
              <text x={width - NW} y={cy + 5} textAnchor="end" className="s">{fmt(category.average)}</text>
              <text x={width} y={cy + 5} textAnchor="end" className="b" style={{ fill: tone === 'var(--color-label-tertiary)' ? 'var(--color-label)' : tone }}>{fmt(category.projected)}</text>
            </g>
          );
        })}
        <line x1={0} x2={width} y1={totalY - 17} y2={totalY - 17} stroke="var(--color-separator)" />
        <text x={0} y={totalY + 5} className="sb">Total</text>
        <text x={width - NW} y={totalY + 5} textAnchor="end" className="s">{fmt(average)}</text>
        <text x={width} y={totalY + 5} textAnchor="end" className="b">{fmt(projected)}</text>
      </svg>
    </div>
  );
}

/* Points per game by opponent defense tier. Each column opens the games
   behind its average on hover, focus or tap. */
export function TierChart({ buckets = [], highlight = null, highlightTeam = null, ariaLabel }) {
  const [ref, width, compact] = useChartWidth();
  const [active, setActive] = useState(null);
  const H = compact ? 128 : 168;
  const T = compact ? 22 : 26;
  const B = compact ? 36 : 40;
  const ih = H - T - B;
  const colW = width / Math.max(1, buckets.length);
  const bw = Math.min(64, colW * 0.56);
  const max = Math.max(10, ...buckets.map(bucket => bucket.ppg ?? 0)) * 1.1;
  const barHeight = bucket => (bucket.ppg == null ? 0 : bucket.ppg / max * ih);
  const labels = [];
  const activeIndex = buckets.findIndex(bucket => bucket.id === active);
  const activeBucket = buckets[activeIndex] ?? null;
  return (
    <div className="pdd-chart" ref={ref} role="figure" aria-label={ariaLabel}>
      <svg className="pdd-svg" width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="group">
        <line x1={0} x2={width} y1={T + ih} y2={T + ih} stroke="var(--color-separator)" />
        {buckets.map((bucket, index) => {
          const cx = colW * (index + 0.5);
          const on = bucket.id === highlight;
          const h = barHeight(bucket);
          labels.push({ x: cx, y: T + ih - h - 8, t: bucket.ppg == null ? '—' : fmt(bucket.ppg), cls: 'b', pri: 9 });
          labels.push({ x: cx, y: H - (compact ? 19 : 20), t: bucket.label + (on && highlightTeam ? ` · ${highlightTeam}` : ''), pri: 8, fill: on ? 'var(--color-accent)' : 'var(--color-label-secondary)' });
          labels.push({ x: cx, y: H - 4, t: bucket.games ? `${bucket.games} ${bucket.games === 1 ? 'game' : 'games'}` : 'No games yet', pri: 5 });
          if (bucket.ppg == null) return null;
          return (
            <g
              key={bucket.id}
              className={`pdd-bar${active === bucket.id ? ' is-on' : ''}`}
              tabIndex={0}
              role="button"
              aria-label={bucket.ariaLabel}
              aria-expanded={active === bucket.id}
              onPointerEnter={event => { if (event.pointerType === 'mouse') setActive(bucket.id); }}
              onPointerLeave={event => { if (event.pointerType === 'mouse') setActive(null); }}
              onFocus={(event) => { if (event.currentTarget.matches?.(':focus-visible')) setActive(bucket.id); }}
              onBlur={() => setActive(null)}
              onClick={() => setActive(bucket.id)}
              onKeyDown={(event) => { if (event.key === 'Escape') setActive(null); }}
            >
              <rect x={cx - colW / 2} y={0} width={colW} height={H} fill="transparent" />
              <rect className="v" x={cx - bw / 2} y={T + ih - h} width={bw} height={h} rx={3} fill={on ? 'var(--color-accent)' : 'var(--color-label-tertiary)'} opacity={on ? 1 : 0.55} />
            </g>
          );
        })}
        <Labels items={labels} />
      </svg>
      {activeBucket && <Tip width={width} tip={{
        x: colW * (activeIndex + 0.5),
        above: T + ih - barHeight(activeBucket) - 22,
        below: T + ih + 4,
        title: activeBucket.tipTitle ?? activeBucket.label,
        value: activeBucket.tipValue,
        lines: activeBucket.lines,
      }} />}
    </div>
  );
}

/* Week columns linked to the stat line: bars scale (animated) to whatever the
   current filter measures, against the season-average line. */
export function WeekColumns({ columns = [], average = null, format = fmt, selectedWeek = null, onSelect, ariaLabel, yMax: fixedMax = null }) {
  const [ref, width, compact] = useChartWidth();
  const R = compact ? 52 : 60;
  const iw = Math.max(60, width - R);
  const slot = iw / Math.max(1, columns.length);
  // The opponent row is reserved only when there is room for it and an opponent to show.
  const opponentRow = slot >= 38 && columns.some(column => column.opp);
  const H = (compact ? 148 : 184) - (opponentRow ? 0 : 16);
  const T = compact ? 22 : 26;
  const B = (compact ? 38 : 42) - (opponentRow ? 0 : 16);
  const ih = H - T - B;
  const bw = Math.min(38, slot * 0.62);
  // Deductions (sacks, interceptions, fumbles) plot below a zero line; the
  // bottom keeps room for the value label under the lowest bar.
  const values = columns.map(column => column.value ?? 0);
  const low = fixedMax == null ? Math.min(...values, average ?? 0, 0) * 1.15 : 0;
  const high = fixedMax ?? Math.max(...values, average ?? 0, 0) * 1.15;
  const span = high - low || 1;
  const base = T + ih;
  const plotH = ih - (low < 0 ? 14 : 0);
  const zeroY = high - low ? T + high / span * plotH : base;
  const yAt = value => zeroY - (value ?? 0) / span * plotH;
  const shift = y => `translateY(${r1(y - base)}px)`;
  const labelShift = value => shift((value ?? 0) < 0 ? yAt(value) + 13 : yAt(value) - 8);
  const bar = (value) => {
    const scale = (value ?? 0) / span * plotH / ih;
    return `${shift(zeroY)} scaleY(${Math.abs(scale) < 0.004 ? 0.004 : Math.round(scale * 1000) / 1000})`;
  };
  return (
    <div className="pdd-chart" ref={ref} role="figure" aria-label={ariaLabel}>
      <svg className="pdd-svg" width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="group">
        <line className="pdd-anim" x1={0} x2={iw} y1={base} y2={base} stroke="var(--color-separator)" style={{ transform: shift(zeroY) }} />
        {columns.map((column, index) => {
          const cx = slot * (index + 0.5);
          const value = column.value;
          const above = average == null || value == null ? null : value >= average;
          const fill = column.ghost ? 'var(--color-drilldown-band)' : above == null ? 'var(--color-accent)' : above ? 'var(--color-accent-green)' : 'var(--color-accent-red)';
          const select = () => onSelect?.(column.week);
          return (
            <g
              key={column.week}
              className={`pdd-pick${column.week === selectedWeek ? ' is-sel' : ''}`}
              tabIndex={onSelect ? 0 : undefined}
              role={onSelect ? 'button' : undefined}
              aria-pressed={onSelect ? column.week === selectedWeek : undefined}
              aria-label={column.ariaLabel}
              onClick={select}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } }}
            >
              <rect x={cx - slot / 2} y={0} width={slot} height={H} fill="transparent" />
              <rect
                className="v pdd-anim"
                x={cx - bw / 2}
                y={T}
                width={bw}
                height={ih}
                rx={3}
                vectorEffect="non-scaling-stroke"
                style={{ transform: bar(value), fill }}
                {...(column.ghost ? { stroke: 'var(--color-signature)', strokeWidth: 2, strokeDasharray: '4 3' } : column.current ? { stroke: 'var(--color-signature)', strokeWidth: 3 } : {})}
              />
              {slot >= 26 && value != null && <text className="pdd-anim" x={cx} y={base} textAnchor="middle" style={{ fill: 'var(--color-label)', transform: labelShift(value) }}>{format(value)}</text>}
              <text className="wl" x={cx} y={H - (opponentRow ? (compact ? 21 : 22) : (compact ? 5 : 6))} textAnchor="middle">W{column.week}</text>
              {opponentRow && column.opp && <text x={cx} y={H - (compact ? 5 : 6)} textAnchor="middle">{column.opp}</text>}
            </g>
          );
        })}
        {average != null && <>
          <line className="pdd-anim" x1={0} x2={iw} y1={base} y2={base} stroke="var(--color-label)" strokeWidth={1.5} strokeDasharray="4 4" pointerEvents="none" style={{ transform: shift(yAt(average)) }} />
          <text className="pdd-anim" x={iw + 8} y={base + 4} style={{ fill: 'var(--color-label)', transform: shift(yAt(average)) }}>Avg {format(average)}</text>
        </>}
      </svg>
    </div>
  );
}

const SNAP = 14;
const clockAt = (minute) => {
  const quarter = Math.min(4, Math.floor(minute / 15) + 1);
  const left = Math.max(0, quarter * 15 - minute);
  const mm = Math.floor(left);
  const ss = Math.round((left - mm) * 60);
  return `Q${quarter} ${mm}:${String(ss === 60 ? 0 : ss).padStart(2, '0')}`;
};

/* Scoring pace (live) and game flow (final): cumulative estimated play points
   on the game clock with a scrub readout that snaps only near a play. */
export function PaceChart({ pace, ariaLabel }) {
  const [ref, width, compact] = useChartWidth();
  const [scrub, setScrub] = useState(null);
  const capture = useRef(false);
  if (!pace) return null;
  const H = compact ? 176 : width < 520 ? 210 : 250;
  const L = 26;
  const R = 52;
  const T = compact ? 18 : 24;
  const B = compact ? 24 : 26;
  const iw = Math.max(60, width - L - R);
  const ih = H - T - B;
  const { final, now, marks, total, estimate, projected, low, high, unexplained } = pace;
  const yMax = Math.max(10, Math.ceil(Math.max(final ? projected ?? 0 : high ?? projected ?? 0, total ?? 0, estimate ?? 0, ...marks.map(mark => mark.cum)) * 1.08 / 10) * 10);
  const x = minute => L + minute / 60 * iw;
  const y = value => T + ih - Math.max(0, value) / yMax * ih;
  const points = marks.map(mark => ({ ...mark, px: r1(x(mark.minute)), py: r1(y(mark.cum)) }));
  const path = [
    `M${x(0)},${y(0)}`,
    ...points.map(point => `H${point.px} V${point.py}`),
    `H${r1(x(now))}`,
    unexplained ? `V${r1(y(total))}` : '',
  ].join(' ');
  const grid = [];
  for (let value = 0; value <= yMax; value += 10) grid.push(value);
  let yp = y(projected ?? 0) + 4;
  let ye = y(estimate ?? 0) + 4;
  if (Math.abs(yp - ye) < 16) {
    const mid = (yp + ye) / 2;
    const upward = ye < yp;
    ye = mid + (upward ? -8 : 8);
    yp = mid + (upward ? 8 : -8);
  }

  const read = (px, py, index = null) => {
    let mark = index != null ? points[index] : null;
    if (!mark && py != null) {
      let best = SNAP;
      points.forEach((candidate) => {
        const distance = Math.hypot(candidate.px - px, candidate.py - py);
        if (distance <= best) { best = distance; mark = candidate; }
      });
    }
    const minute = mark ? mark.minute : Math.max(0, Math.min(60, (px - L) / iw * 60));
    let value;
    let projectedPart = false;
    if (mark) value = mark.cum;
    else if (minute <= now) value = points.filter(point => point.minute <= minute).reduce((sum, point) => sum + point.pts, 0);
    else { projectedPart = true; value = total + (estimate - total) * (minute - now) / Math.max(0.01, 60 - now); }
    setScrub({ minute, value, mark, projected: projectedPart, index: mark ? points.indexOf(mark) : null });
  };
  const local = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  };
  const head = scrub
    ? scrub.mark ? `${scrub.mark.clock ?? clockAt(scrub.mark.minute)} · ${scrub.mark.desc}` : scrub.projected ? `${clockAt(scrub.minute)} · Projected` : clockAt(scrub.minute)
    : null;
  const cx = scrub ? (scrub.mark ? scrub.mark.px : x(scrub.minute)) : 0;
  const cy = scrub ? (scrub.mark ? scrub.mark.py : y(scrub.value)) : 0;

  return (
    <div className="pdd-chart" ref={ref}>
      <svg
        className="pdd-svg pdd-scrub"
        width={width}
        height={H}
        viewBox={`0 0 ${width} ${H}`}
        tabIndex={0}
        role="slider"
        aria-label={`${ariaLabel}. Use arrow keys to step through scoring plays.`}
        aria-valuemin={0}
        aria-valuemax={60}
        aria-valuenow={r1(scrub?.minute ?? now)}
        aria-valuetext={scrub ? `${head}, ${fmt(scrub.value)} points` : `${fmt(total)} points`}
        onPointerMove={(event) => {
          if (event.pointerType === 'mouse' || capture.current) read(...local(event));
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== 'mouse') { capture.current = true; event.currentTarget.setPointerCapture?.(event.pointerId); }
          read(...local(event));
        }}
        onPointerUp={() => { capture.current = false; }}
        onPointerCancel={() => { capture.current = false; }}
        onPointerLeave={(event) => { if (event.pointerType === 'mouse') setScrub(null); }}
        onBlur={() => setScrub(null)}
        onKeyDown={(event) => {
          const count = points.length;
          if (!count) return;
          const current = scrub?.index;
          let to = null;
          if (event.key === 'ArrowRight') to = current == null ? 0 : Math.min(count - 1, current + 1);
          else if (event.key === 'ArrowLeft') to = current == null ? count - 1 : Math.max(0, current - 1);
          else if (event.key === 'Home') to = 0;
          else if (event.key === 'End') to = count - 1;
          else if (event.key === 'Escape') { setScrub(null); return; }
          if (to != null) { event.preventDefault(); read(0, null, to); }
        }}
      >
        {grid.map(value => (
          <g key={value}>
            <line x1={L} x2={L + iw} y1={y(value)} y2={y(value)} stroke="var(--color-separator)" />
            <text x={L - 8} y={y(value) + 4} textAnchor="end">{value}</text>
          </g>
        ))}
        {[1, 2, 3].map(quarter => <line key={quarter} x1={x(quarter * 15)} x2={x(quarter * 15)} y1={T} y2={T + ih} stroke="var(--color-separator)" strokeDasharray="2 4" />)}
        {[0, 1, 2, 3].map(quarter => <text key={quarter} x={x(quarter * 15 + 7.5)} y={H - 6} textAnchor="middle">Q{quarter + 1}</text>)}
        {!final && Number.isFinite(low) && Number.isFinite(high) && <polygon points={`${x(0)},${y(0)} ${x(60)},${y(high)} ${x(60)},${y(low)}`} fill="var(--color-drilldown-band)" />}
        {Number.isFinite(projected) && <line x1={x(0)} y1={y(0)} x2={x(60)} y2={y(projected)} stroke="var(--color-label-secondary)" strokeWidth={1.5} strokeDasharray="5 4" />}
        {!final && <>
          <line x1={x(now)} x2={x(now)} y1={T} y2={T + ih} stroke="var(--color-accent-red)" strokeWidth={1.5} />
          <text x={x(now)} y={T - 10} textAnchor="middle" style={{ fill: 'var(--color-accent-red)' }}>NOW</text>
          <line x1={x(now)} y1={y(total)} x2={x(60)} y2={y(estimate)} stroke="var(--color-signature)" strokeWidth={2.5} strokeDasharray="2 5" strokeLinecap="round" />
          <circle cx={x(60)} cy={y(estimate)} r={5} fill="var(--color-bg)" stroke="var(--color-signature)" strokeWidth={2.5} />
        </>}
        <path d={path} fill="none" stroke="var(--color-signature)" strokeWidth={3.5} strokeLinejoin="round" />
        {points.map(point => <circle key={point.id} cx={point.px} cy={point.py} r={point.td ? 6 : 3} fill={point.td ? 'var(--color-accent)' : 'var(--color-signature)'} stroke="var(--color-bg)" strokeWidth={2} />)}
        <circle cx={x(now)} cy={y(total)} r={7} fill="var(--color-signature)" stroke="var(--color-bg)" strokeWidth={2.5} />
        {Number.isFinite(projected) && <text x={x(60) + 10} y={yp} style={{ fill: 'var(--color-label-secondary)' }}>{fmt(projected)}</text>}
        <text x={x(60) + 10} y={ye + 1} className="b">{fmt(estimate)}</text>
        {scrub && <g className={`pdd-scrub-l${scrub.mark ? ' is-snap' : ''}${scrub.projected ? ' is-proj' : ''}`} pointerEvents="none">
          <line className="pdd-scrub-x" x1={cx} x2={cx} y1={T} y2={T + ih} />
          <circle className="pdd-scrub-ring" cx={cx} cy={cy} r={10} />
          <circle className="pdd-scrub-m" cx={cx} cy={cy} r={5} />
        </g>}
      </svg>
      {scrub && <div className="pdd-scrub-read" aria-hidden="true" style={{ left: Math.max(0, Math.min(width - 220, cx - 110)) }}>
        <span className="pdd-scrub-read__c">{head}</span>
        <b>{fmt(scrub.value)}<small>pts</small></b>
        {scrub.mark && <span className="pdd-scrub-read__d">{sgn(scrub.mark.pts)}</span>}
      </div>}
    </div>
  );
}

export function Ring({ value, max, text, tone, size = 64 }) {
  const radius = 27;
  const circumference = 2 * Math.PI * radius;
  const share = max > 0 ? Math.max(0, Math.min(1, (value ?? 0) / max)) : 0;
  return (
    <svg className="pdd-ring" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx={32} cy={32} r={radius} fill="none" stroke="var(--color-fill)" strokeWidth={7} />
      {share > 0 && <circle className="arc" cx={32} cy={32} r={radius} fill="none" stroke={tone} strokeWidth={7} strokeLinecap="round" strokeDasharray={`${r1(share * circumference)} ${r1(circumference)}`} transform="rotate(-90 32 32)" />}
      <text x={32} y={38} textAnchor="middle">{text}</text>
    </svg>
  );
}

/* Stat rows that double as filters for the linked week chart. */
export function StatLineBars({ rows = [], total, max, selected = null, onSelect, ticks = false, ariaLabel }) {
  const all = [...rows, { ...total, key: '', label: 'Total', tone: 'var(--color-signature)', isTotal: true }];
  const scale = max > 0 ? max : 1;
  return (
    <div className={`pdd-hbs${selected ? ' is-filtered' : ''}`} role="group" aria-label={ariaLabel}>
      {all.map((row) => {
        const pressed = (row.key || '') === (selected || '');
        const content = <>
          <span className="pdd-hb__l">{row.label}{row.small != null && <small className="pmd-num">{row.small}</small>}</span>
          <span className="pdd-hb__t" aria-hidden="true">
            <i style={{ width: `${Math.max(1.5, Math.abs(row.pts ?? 0) / scale * 100)}%`, background: row.pts < 0 ? 'var(--color-accent-red)' : row.tone }} />
            {ticks && row.ref != null && <u style={{ left: `${Math.max(0, Math.min(100, row.ref / scale * 100))}%` }} />}
          </span>
          <b className="pdd-hb__v pmd-num">{fmt(row.pts)}</b>
        </>;
        const className = `pdd-hb${row.isTotal ? ' is-total' : ''}`;
        return onSelect && row.key !== 'other'
          ? <button key={row.key || 'total'} type="button" className={`${className} pdd-hb--btn`} aria-pressed={pressed} onClick={() => onSelect(row.key || null)}>{content}</button>
          : <div key={row.key || 'total'} className={className}>{content}</div>;
      })}
    </div>
  );
}

/* Where one defense sits in the league: rank 1 is the toughest. */
export function RankStrip({ rank, teamCount, caption, ariaLabel }) {
  if (!rank || !teamCount) return null;
  const edge = Math.ceil(teamCount / 4);
  return (
    <div className="pdd-ds">
      <div className="pdd-ds__c" role="img" aria-label={ariaLabel} style={{ gridTemplateColumns: `repeat(${teamCount}, 1fr)` }}>
        {Array.from({ length: teamCount }, (unused, index) => (
          <i key={index} className={index + 1 === rank ? 'is-on' : index < edge || index >= teamCount - edge ? 'is-t' : undefined} />
        ))}
      </div>
      <div className="pdd-ds__e"><span>Toughest</span><span className="pdd-ds__me">{caption}</span><span>Easiest</span></div>
    </div>
  );
}
