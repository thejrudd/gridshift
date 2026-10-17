import { fmt } from '../../../utils/playerSeason/dashboardModel.js';
import { tipAttrs, useMeasuredWidth } from './dashboardUi.js';

// Gap positions across the field. Phones spread the five gaps evenly so their labels have room.
const laneX = (width) => (width >= 480
  ? { le: width * 0.153, lt: width * 0.37, mid: width / 2, rt: width * 0.63, re: width * 0.847 }
  : { le: width * 0.13, lt: width * 0.315, mid: width / 2, rt: width * 0.685, re: width * 0.87 });
const lineX = (width) => [-2, -1, 0, 1, 2].map((index) => width / 2 + index * Math.min(45, width * 0.085));

function LaneLabel({ label, x, y, width }) {
  const upper = label.toUpperCase();
  if (width >= 480 || !upper.includes(' ')) {
    return <text x={x} y={y} textAnchor="middle" className="player-dash-field__lane">{upper}</text>;
  }
  const [first, second] = upper.split(' ');
  return (
    <text x={x} y={y} textAnchor="middle" className="player-dash-field__lane">
      <tspan x={x} dy="-13">{first}</tspan>
      <tspan x={x} dy="13">{second}</tspan>
    </text>
  );
}

/**
 * Offense moving up the field. `mode="routes"` draws one route per gap for a
 * ball carrier (width = carries, arrow depth = yards per carry); `mode="stops"`
 * draws one circle per gap for a defender (size = tackles, height = yards
 * gained before his stop).
 */
export function FieldMap({ mode, lanes, selected, onSelect, jersey, ariaLabel }) {
  const [measureRef, width] = useMeasuredWidth();
  return (
    <div ref={measureRef} className="player-dash-field">
      {width > 0 && (mode === 'routes'
        ? <RoutesSvg width={width} lanes={lanes} selected={selected} onSelect={onSelect} jersey={jersey} ariaLabel={ariaLabel} />
        : <StopsSvg width={width} lanes={lanes} selected={selected} onSelect={onSelect} ariaLabel={ariaLabel} />)}
    </div>
  );
}

function laneHandlers(key, selected, onSelect) {
  const toggle = () => onSelect(selected === key ? null : key);
  return {
    role: 'button',
    tabIndex: 0,
    'aria-pressed': selected === key,
    onClick: toggle,
    onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } },
  };
}

function RoutesSvg({ width, lanes, selected, onSelect, jersey, ariaLabel }) {
  const height = 300;
  const los = 196;
  const carrier = { x: width / 2, y: 250 };
  const tx = laneX(width);
  const yardY = (yards) => los - yards * 7;
  const max = Math.max(...lanes.map((lane) => lane.n), 1);
  const scale = Math.max(0.6, Math.min(1, width / 600));
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={ariaLabel}>
      <rect width={width} height={height} className="player-dash-field__turf" />
      {[-5, 0, 5, 10, 15, 20, 25].map((yards) => (
        <g key={yards}>
          <line x1="0" x2={width} y1={yardY(yards)} y2={yardY(yards)} className="player-dash-field__yard" strokeWidth={yards % 10 === 0 ? 2 : 1} />
          {yards > 0 && <text x="10" y={yardY(yards) - 4} className="player-dash-field__num">+{yards}</text>}
        </g>
      ))}
      <line x1="0" x2={width} y1={los} y2={los} className="player-dash-field__los" />
      {lineX(width).map((x) => <rect key={x} x={x - 13} y={los + 4} width="26" height="16" rx="5" className="player-dash-field__lineman" />)}
      <circle cx={carrier.x} cy={carrier.y} r="12" className="player-dash-field__carrier" />
      <text x={carrier.x} y={carrier.y + 4} textAnchor="middle" className="player-dash-field__jersey">{jersey}</text>
      {lanes.map((lane) => {
        const x = tx[lane.k];
        const average = lane.n ? lane.y / lane.n : 0;
        const end = yardY(Math.max(3, Math.min(24, average)));
        const stroke = (lane.n ? 5 + (lane.n / max) * 20 : 2.5) * scale;
        const dim = selected && selected !== lane.k;
        const d = `M${carrier.x},${carrier.y - 12} C${carrier.x + (x - carrier.x) * 0.15},${los + 30} ${x},${los + 34} ${x},${los - 6} L${x},${end + 8}`;
        return (
          <g
            key={lane.k}
            className={`player-dash-field__route ${selected === lane.k ? 'is-selected' : ''}`}
            style={{ opacity: dim ? 0.3 : 1 }}
            aria-label={`${lane.l}: ${lane.n} carries, ${lane.y} yards, ${lane.td} touchdowns`}
            {...laneHandlers(lane.k, selected, onSelect)}
            {...tipAttrs(lane.l, [`${lane.n} carries · ${lane.y} yds${lane.n ? ` · ${fmt(average, 1)} per carry` : ''} · ${lane.td} TD`, 'Select to filter carries'])}
          >
            <path d={d} fill="none" stroke="transparent" strokeWidth="34" />
            <path d={d} fill="none" className={`player-dash-field__path ${lane.n ? '' : 'is-empty'}`} strokeWidth={stroke} strokeLinecap="round" />
            {lane.n > 0 && <path d={`M${x - stroke / 2 - 6},${end + 12} L${x},${end - 6} L${x + stroke / 2 + 6},${end + 12} Z`} className="player-dash-field__arrow" />}
            <text x={x} y={end - 14} textAnchor="middle" className="player-dash-field__count">{lane.n}</text>
            <text x={x} y={end - 36} textAnchor="middle" className="player-dash-field__yards">
              {lane.n ? `${lane.y} yds` : ''}{lane.td && width >= 480 ? ` · ${lane.td} TD` : ''}
            </text>
            {Array.from({ length: lane.td }, (_, index) => (
              <circle key={index} cx={x - (lane.td - 1) * 6 + index * 12} cy={end - 58} r="4.5" className="player-dash-field__td" />
            ))}
            <LaneLabel label={lane.l} x={x} y={height - 8} width={width} />
          </g>
        );
      })}
    </svg>
  );
}

function StopsSvg({ width, lanes, selected, onSelect, ariaLabel }) {
  const height = 260;
  const los = 160;
  const tx = laneX(width);
  const yardY = (yards) => los - yards * 9;
  const max = Math.max(...lanes.map((lane) => lane.n), 1);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={ariaLabel}>
      <rect width={width} height={height} className="player-dash-field__turf" />
      {[-5, 5, 10].map((yards) => (
        <g key={yards}>
          <line x1="0" x2={width} y1={yardY(yards)} y2={yardY(yards)} className="player-dash-field__yard" />
          <text x="10" y={yardY(yards) - 4} className="player-dash-field__num">{yards > 0 ? '+' : ''}{yards}</text>
        </g>
      ))}
      <line x1="0" x2={width} y1={los} y2={los} className="player-dash-field__los" />
      {lineX(width).map((x) => <rect key={x} x={x - 13} y={los + 4} width="26" height="14" rx="5" className="player-dash-field__lineman is-faint" />)}
      {lanes.map((lane) => {
        const average = lane.n ? lane.y / lane.n : 0;
        const cy = yardY(Math.max(-4, Math.min(9, average)));
        const radius = lane.n ? 8 + (lane.n / max) * 16 : 4;
        const dim = selected && selected !== lane.k;
        const loss = average < 0;
        return (
          <g
            key={lane.k}
            className={`player-dash-field__route ${selected === lane.k ? 'is-selected' : ''}`}
            style={{ opacity: dim ? 0.3 : 1 }}
            aria-label={`${lane.l}: ${lane.n} run tackles, ${fmt(average, 1)} yards gained before his stop`}
            {...laneHandlers(lane.k, selected, onSelect)}
            {...tipAttrs(`Runs at ${lane.l.toLowerCase()}`, [`${lane.n} tackles · ${lane.n ? fmt(average, 1) : '–'} yards before his stop · ${lane.tfl} for loss`, 'Select to filter'])}
          >
            <circle cx={tx[lane.k]} cy={cy} r={radius + 10} fill="transparent" />
            <circle cx={tx[lane.k]} cy={cy} r={radius} className={`player-dash-field__stop ${loss ? 'is-loss' : ''} ${lane.n ? '' : 'is-empty'}`} />
            <text x={tx[lane.k]} y={cy + 5} textAnchor="middle" className={`player-dash-field__stopcount ${loss ? 'is-loss' : ''}`}>{lane.n || ''}</text>
            <LaneLabel label={lane.l} x={tx[lane.k]} y={height - 8} width={width} />
          </g>
        );
      })}
    </svg>
  );
}
