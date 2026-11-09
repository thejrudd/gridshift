import { useMemo, useRef } from 'react';
import { usePointerFollow } from './usePointerFollow.js';
import { calcPoints } from '../../../utils/scoringEngine';
import { getHoverCardMode } from '../../../utils/matchupReplay.js';
import { buildStatChips, getGameStatLine, sumStats } from '../../../utils/matchupStatChips.js';

// Desktop hover card for a Matchups starter. Before kickoff it shows the
// season, while the game is live this game, and once final a summary of that
// game. Clicking the row still opens the existing player breakdown.
// Rules: docs/Fantasy Live.md.

function signed(value, digits = 2) {
  const numeric = Number(value) || 0;
  return `${numeric >= 0 ? '+' : '−'}${Math.abs(numeric).toFixed(digits)}`;
}

export default function MatchupPlayerHoverCard({
  anchor,
  point = null,
  containerRef,
  player,
  side,
  state,
  gameProgress = 0,
  clockLabel = '',
  points = 0,
  plays = [],
  weeklyRows = [],
  week,
  replaying = false,
  boxLine = null,
  scoringSettings,
  sideColor,
}) {
  const cardRef = useRef(null);
  const mode = getHoverCardMode(state);
  const projected = Number(player?.projection?.projected);
  const hasProjection = Number.isFinite(projected);

  const season = useMemo(() => {
    if (mode !== 'season') return null;
    const rows = (weeklyRows ?? [])
      .filter((row) => Number(row?.week) < Number(week))
      .sort((left, right) => Number(left.week) - Number(right.week))
      .map((row) => ({ ...row, pts: Math.round(calcPoints(row, scoringSettings, player?.position) * 100) / 100 }));
    if (!rows.length) return { rows };
    const best = rows.reduce((top, row) => (row.pts > top.pts ? row : top), rows[0]);
    return {
      rows,
      average: rows.reduce((sum, row) => sum + row.pts, 0) / rows.length,
      best,
      totals: sumStats(rows),
      max: Math.max(...rows.map((row) => row.pts), hasProjection ? projected : 0, 1),
    };
  }, [hasProjection, mode, player?.position, projected, scoringSettings, week, weeklyRows]);

  // This game's line: the live box line now, the plays up to a replayed
  // moment, otherwise the week's stat row (getGameStatLine).
  const gameLine = useMemo(() => {
    if (mode === 'season') return null;
    return getGameStatLine({ boxLine, plays, weeklyRows, week, replaying });
  }, [boxLine, mode, plays, replaying, week, weeklyRows]);

  // With a mouse the card follows the pointer (usePointerFollow); from
  // keyboard focus it sits below (or above) the row, aligned to the row's
  // outer edge.
  usePointerFollow({
    cardRef,
    point,
    getFrame: () => containerRef?.current?.getBoundingClientRect() ?? null,
    placeWithoutPointer: ({ width, height }) => {
      if (!anchor) return null;
      const row = anchor.getBoundingClientRect();
      return {
        left: side === 'opp' ? row.right - width : row.left,
        top: row.bottom + 6 + height <= window.innerHeight ? row.bottom + 6 : row.top - 6 - height,
      };
    },
  });

  const target = mode === 'live' && hasProjection ? projected * Math.max(0, Math.min(1, gameProgress)) : projected;
  const difference = hasProjection && mode !== 'season' ? points - target : null;
  const bestPlay = mode === 'final' && plays.length
    ? plays.reduce((top, play) => (Number(play.pts) > Number(top.pts) ? play : top), plays[0])
    : null;

  return (
    <div
      ref={cardRef}
      id="matchup-hover-card"
      role="tooltip"
      className="matchup-hover-card"
      style={{ '--matchup-hover-side': sideColor, left: -9999, top: 0, visibility: 'hidden' }}
    >
      <div className="matchup-hover-card__top">
        <span className="matchup-hover-card__name">{player?.name}</span>
        <span className={`matchup-hover-card__state${mode === 'live' ? ' is-live' : ''}`}>
          {mode === 'live' && <i className="matchup-live-dot" aria-hidden="true" />}
          {mode === 'live' ? `Live · ${clockLabel}` : mode === 'final' ? `Final · ${clockLabel}` : `Season · ${clockLabel}`}
        </span>
      </div>

      {mode === 'season' && (
        season?.rows?.length ? (
          <>
            <div className="matchup-hover-card__big">
              <strong>{season.average.toFixed(1)}</strong>
              <span>{`points a game · ${season.rows.length} ${season.rows.length === 1 ? 'game' : 'games'}${hasProjection ? ` · projected ${projected.toFixed(1)} this week` : ''}`}</span>
            </div>
            <div className="matchup-hover-card__sub">Points by week{hasProjection ? ' · dashed line is this week’s projection' : ''}</div>
            <svg className="matchup-hover-card__weeks" viewBox="0 0 290 54" width="100%" aria-hidden="true">
              {season.rows.map((row, index) => {
                const band = 290 / season.rows.length;
                const height = Math.max(1, (Math.max(0, row.pts) / season.max) * 40);
                return (
                  <g key={row.week}>
                    <rect
                      x={index * band + band * 0.11}
                      width={band * 0.78}
                      y={40 - height}
                      height={height}
                      rx={2}
                      fill={sideColor}
                      className={hasProjection && row.pts < projected ? 'is-under' : undefined}
                    />
                    <text x={index * band + band / 2} y={52} textAnchor="middle">{`W${row.week}`}</text>
                  </g>
                );
              })}
              {hasProjection && <line x1="0" x2="290" y1={40 - (projected / season.max) * 40} y2={40 - (projected / season.max) * 40} className="matchup-hover-card__proj" />}
            </svg>
            <div className="matchup-hover-card__sub">{`Season totals · best week ${season.best.pts.toFixed(1)} (W${season.best.week})`}</div>
            <div className="matchup-hover-card__chips">
              {buildStatChips(player?.position, season.totals, season.rows.length).map((chip) => <span key={chip}>{chip}</span>)}
            </div>
          </>
        ) : (
          <p className="matchup-hover-card__hint">No games played yet this season.</p>
        )
      )}

      {mode !== 'season' && (
        <>
          <div className="matchup-hover-card__big">
            <strong>{(Number(points) || 0).toFixed(2)}</strong>
            {difference != null && (
              <span className={Math.abs(difference) < 0.05 ? '' : difference > 0 ? 'is-up' : 'is-down'}>
                {Math.abs(difference) < 0.05
                  ? `right on ${mode === 'live' ? 'pace' : 'projection'}`
                  : `${Math.abs(difference).toFixed(1)} ${difference > 0 ? 'above' : 'below'} ${mode === 'live' ? 'pace' : 'projection'}`}
              </span>
            )}
            {mode === 'live' && hasProjection && <span>{`projected ${projected.toFixed(1)}`}</span>}
          </div>
          {gameLine && (
            <div className="matchup-hover-card__chips">
              {buildStatChips(player?.position, gameLine).map((chip) => <span key={chip}>{chip}</span>)}
            </div>
          )}
          {plays.length > 0 && (
            <>
              <div className="matchup-hover-card__sub">
                {mode === 'live' ? 'Latest plays' : `Best play · ${plays.length} scoring ${plays.length === 1 ? 'play' : 'plays'}`}
              </div>
              <ul className="matchup-hover-card__plays">
                {(mode === 'live' ? plays.slice(-3).reverse() : [bestPlay]).map((play) => (
                  <li key={play.id}>
                    <span>{[play.glance?.clock, play.description].filter(Boolean).join(' · ')}</span>
                    <b>{signed(play.pts)}</b>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <p className="matchup-hover-card__hint">Click for the full breakdown</p>
    </div>
  );
}
