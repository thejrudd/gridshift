import { fmt } from '../../../utils/playerSeason/dashboardModel.js';
import { TeamMark } from '../player/DashboardParts.jsx';
import { tipAttrs } from '../player/dashboardUi.js';

const SPARK_W = 240;
const SPARK_H = 56;

/** Per-game bars with a dashed season-average line. */
export function SparkBars({ points, format, label, subject, onSelect, selectHint = 'Select to open this game' }) {
  if (!points.length) return null;
  const gap = 2;
  const width = Math.max(2, (SPARK_W - gap * (points.length - 1)) / points.length);
  const values = points.map((point) => point.v);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const zero = SPARK_H - ((0 - min) / range) * SPARK_H;
  const average = values.reduce((total, value) => total + value, 0) / points.length;
  const averageY = SPARK_H - ((average - min) / range) * SPARK_H;
  return (
    <svg className="team-dash-spark" viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" role="img" aria-label={`${label} by game`}>
      <line x1="0" x2={SPARK_W} y1={averageY} y2={averageY} className="team-dash-spark__avg" vectorEffect="non-scaling-stroke" />
      {points.map((point, index) => {
        const y = SPARK_H - ((point.v - min) / range) * SPARK_H;
        const top = Math.min(y, zero);
        const height = Math.max(1.5, Math.abs(y - zero));
        return (
          <rect
            key={point.game.id}
            x={index * (width + gap)}
            y={top}
            width={width}
            height={height}
            rx="1.5"
            className={point.v < 0 ? 'is-negative' : ''}
            style={onSelect ? { cursor: 'pointer' } : undefined}
            // Bars can sit inside a clickable card; the bar's own game wins.
            onClick={onSelect ? (event) => { event.stopPropagation(); onSelect(point.game); } : undefined}
            {...tipAttrs(
              `${subject ? `${subject} · ` : ''}Week ${point.game.week} ${point.game.home ? 'vs' : '@'} ${point.game.opp}`,
              [`${label}: ${format(point.v)}`, onSelect ? selectHint : null],
            )}
          />
        );
      })}
    </svg>
  );
}

/** Final margin of every game, wins up and losses down, then upcoming games. */
export function ResultsTape({ games, schedule, teamName, darkMode, onOpenGame }) {
  const maxWin = Math.max(...games.map((game) => game.pf - game.pa), 14);
  const maxLoss = Math.max(...games.map((game) => game.pa - game.pf), 1);
  const up = 150;
  const down = Math.max(26, Math.round((up * Math.max(maxLoss, 8)) / maxWin));
  return (
    <div className="team-dash-tape" style={{ '--tape-up': `${up}px`, '--tape-down': `${down}px` }}>
      <div className="team-dash-tape__grid" style={{ '--tape-played': games.length, '--tape-left': schedule.length }}>
        {games.map((game) => {
          const margin = game.pf - game.pa;
          const won = margin > 0;
          const height = Math.round((Math.abs(margin) / maxWin) * up);
          return (
            <button
              key={game.id}
              type="button"
              className="team-dash-tape__col"
              onClick={() => onOpenGame(game, 'team')}
              aria-label={`Week ${game.week}: ${won ? 'won' : margin < 0 ? 'lost' : 'tied'} ${game.pf} to ${game.pa} ${game.home ? 'versus' : 'at'} ${game.opp}. Open the game`}
              {...tipAttrs(`Week ${game.week} · ${game.home ? 'vs' : '@'} ${game.opp}`, [`${won ? 'Won' : margin < 0 ? 'Lost' : 'Tied'} ${game.pf}–${game.pa}${game.ot ? ' (OT)' : ''}`, `Margin ${margin > 0 ? '+' : margin < 0 ? '−' : ''}${Math.abs(margin)}`])}
            >
              <span className="team-dash-tape__up">
                {won && <><i className="is-win" style={{ height }} /><em style={{ bottom: height + 3 }}>+{margin}</em></>}
              </span>
              <span className="team-dash-tape__down">
                {margin < 0 && <><i className="is-loss" style={{ height }} /><em style={{ top: height + 3 }}>−{-margin}</em></>}
              </span>
              <span className="team-dash-tape__label">
                <TeamMark abbr={game.opp} darkMode={darkMode} size={18} />
                <b>{game.opp}</b>
                <small>W{game.week}</small>
                <small>{game.home ? 'home' : 'away'}</small>
              </span>
            </button>
          );
        })}
        {schedule.length > 0 && <span className="team-dash-tape__divider" aria-hidden="true" />}
        {schedule.map((game) => (
          <span
            key={game.id}
            className="team-dash-tape__col is-upcoming"
            tabIndex={0}
            {...tipAttrs(`Week ${game.week} · upcoming`, `${teamName} ${game.home ? 'vs' : 'at'} ${game.opp}`)}
          >
            <span className="team-dash-tape__up"><i className="is-ghost" /></span>
            <span className="team-dash-tape__down" />
            <span className="team-dash-tape__label">
              <TeamMark abbr={game.opp} darkMode={darkMode} size={18} />
              <b>{game.opp}</b>
              <small>W{game.week}</small>
              <small>{game.home ? 'home' : 'away'}</small>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Points per quarter for the team and its opponents. Selecting a quarter filters How they scored. */
export function QuarterBars({ quarters, teamName, selected, onSelect, filter }) {
  const max = Math.max(...quarters.map((quarter) => Math.max(quarter.f, quarter.a)), 1);
  return (
    <div className="player-dash-surface">
      <div className="player-dash-legend team-dash-filter-row">
        <span><i />{teamName}</span>
        <span><i className="is-gave" />Opponents</span>
        {filter}
      </div>
      <div className="team-dash-qbars">
        {quarters.map((quarter) => (
          <button
            key={quarter.q}
            type="button"
            className={`team-dash-qbars__col team-dash-pick ${selected === quarter.q ? 'is-picked' : selected ? 'is-dim' : ''}`}
            aria-pressed={selected === quarter.q}
            aria-label={`${quarter.q}: ${teamName} ${quarter.f}, opponents ${quarter.a}`}
            onClick={() => onSelect?.(quarter.q)}
          >
            <div className="team-dash-qbars__pair">
              <div className="is-me" style={{ height: `${(quarter.f / max) * 100}%` }}><span>{quarter.f}</span></div>
              <div className="is-opp" style={{ height: `${(quarter.a / max) * 100}%` }}><span>{quarter.a}</span></div>
            </div>
            <span className="team-dash-qbars__label">{quarter.q}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const DRIVE_OUTCOMES = [['Touchdown', 'is-c1'], ['Field goal', 'is-c2'], ['Downs', 'is-c3'], ['Punt', 'is-c4'], ['Turnover', 'is-c5'], ['Other', 'is-c6']];

export function DriveBars({ rows }) {
  return (
    <div className="player-dash-surface team-dash-stack">
      {rows.map((row) => (
        <div key={row.label} className="team-dash-stack__row">
          <div className="team-dash-stack__head">
            <b>{row.label}</b>
            <span className="player-dash-meta">{row.n} drives · {row.n ? fmt((100 * (row.counts.Touchdown ?? 0)) / row.n) : 0}% touchdowns</span>
          </div>
          <div className="team-dash-stack__bar">
            {DRIVE_OUTCOMES.map(([outcome, tone]) => (row.counts[outcome] ? (
              <div
                key={outcome}
                className={tone}
                style={{ flex: row.counts[outcome] }}
                {...tipAttrs(row.label, `${outcome}: ${row.counts[outcome]} (${fmt((100 * row.counts[outcome]) / row.n)}%)`)}
              >
                {row.counts[outcome] / row.n >= 0.08 ? `${Math.round((100 * row.counts[outcome]) / row.n)}%` : ''}
              </div>
            ) : null))}
          </div>
        </div>
      ))}
      <div className="player-dash-legend">
        {DRIVE_OUTCOMES.map(([outcome, tone]) => <span key={outcome}><i className={tone} />{outcome}</span>)}
      </div>
      <p className="player-dash-coverage">Drives are rebuilt from play-by-play. &quot;Other&quot; covers missed field goals, safeties, and drives cut off by halftime or the final whistle.</p>
    </div>
  );
}

export function TrendTiles({ trends, onOpenGame }) {
  return (
    <div className="team-dash-trends">
      {trends.map((trend) => (
        <div key={trend.label} className="team-dash-trend">
          <span className="team-dash-trend__label">{trend.label} <span className="player-dash-faint">· {trend.mode === 'sum' ? 'total' : 'per game'}</span></span>
          <span className="team-dash-trend__value">{trend.head == null ? '–' : trend.format(trend.head)}</span>
          <SparkBars points={trend.points} format={trend.format} label={trend.label} onSelect={(game) => onOpenGame(game, 'team')} />
        </div>
      ))}
    </div>
  );
}

