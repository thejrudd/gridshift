import { useId } from 'react';

const WIDTH = 640;
const HEIGHT = 360;
const PADDING = {
  top: 22,
  right: 22,
  bottom: 38,
  left: 42,
};
const TICKS = [0, 25, 50, 75, 100];

function clampPoint(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function getPointX(point) {
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  return PADDING.left + (clampPoint(point.x) / 100) * plotWidth;
}

function getPointY(point) {
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  return PADDING.top + ((100 - clampPoint(point.y)) / 100) * plotHeight;
}

function getScatterPointClassName(point) {
  return [
    'draft-analytics-scatter__point',
    point?.focused ? 'is-focused' : '',
    point?.pinned ? 'is-pinned' : '',
  ].filter(Boolean).join(' ');
}

function ScatterPointSymbol({ point }) {
  const radius = point.focused ? 6 : point.pinned ? 5 : 3.25;
  return (
    <g className={getScatterPointClassName(point)} transform={`translate(${getPointX(point)} ${getPointY(point)})`}>
      {point.focused ? <circle r={radius + 3.4} className="draft-analytics-scatter__point-ring" /> : null}
      {point.pinned && !point.focused ? <circle r={radius + 2.4} className="draft-analytics-scatter__point-ring" /> : null}
      <circle r={radius} className="draft-analytics-scatter__point-core" />
      <title>{`${point.name ?? 'Player'} - ${point.xLabel ?? '--'} - ${point.yLabel ?? '--'}`}</title>
    </g>
  );
}

export default function DraftAnalyticsScatterChart({ scatter }) {
  const chartId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const points = [...scatter.points].sort((a, b) => {
    const aPriority = a.focused ? 2 : a.pinned ? 1 : 0;
    const bPriority = b.focused ? 2 : b.pinned ? 1 : 0;
    return aPriority - bPriority;
  });

  return (
    <svg
      id={`draft-analytics-scatter-${chartId}`}
      className="draft-analytics-scatter__svg"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`${scatter.xAxis.label} by ${scatter.yAxis.label} scatter plot`}
      preserveAspectRatio="none"
    >
      <rect
        className="draft-analytics-scatter__plot-bg"
        x={PADDING.left}
        y={PADDING.top}
        width={plotWidth}
        height={plotHeight}
        rx="4"
      />

      {TICKS.map((tick) => {
        const x = PADDING.left + (tick / 100) * plotWidth;
        const y = PADDING.top + ((100 - tick) / 100) * plotHeight;
        return (
          <g key={tick}>
            <line className="draft-analytics-scatter__gridline" x1={x} x2={x} y1={PADDING.top} y2={PADDING.top + plotHeight} />
            <line className="draft-analytics-scatter__gridline" x1={PADDING.left} x2={PADDING.left + plotWidth} y1={y} y2={y} />
            <text className="draft-analytics-scatter__tick" x={x} y={HEIGHT - 14} textAnchor="middle">{tick}</text>
            <text className="draft-analytics-scatter__tick" x={22} y={y + 4} textAnchor="middle">{tick}</text>
          </g>
        );
      })}

      {points.length ? (
        points.map((point) => <ScatterPointSymbol key={point.id} point={point} />)
      ) : (
        <text className="draft-analytics-scatter__empty" x={WIDTH / 2} y={HEIGHT / 2} textAnchor="middle">
          No plottable players
        </text>
      )}
    </svg>
  );
}
