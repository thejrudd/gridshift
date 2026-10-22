import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { calcPoints } from '../../../utils/scoringEngine';
import { getHoverCardMode } from '../../../utils/matchupReplay.js';

// Desktop hover card for a Matchups starter. Before kickoff it shows the
// season, while the game is live this game, and once final a summary of that
// game. Clicking the row still opens the existing player breakdown.
// Rules: docs/Fantasy Live.md.

const STAT_KEYS = [
  'pass_yd', 'pass_td', 'pass_int', 'rush_yd', 'rush_td', 'rec', 'rec_yd', 'rec_td', 'fgm', 'xpm', 'fum_lost',
  // Individual defenders (IDP) and team defense.
  'idp_tkl', 'idp_tkl_solo', 'idp_tkl_ast', 'idp_tkl_loss', 'idp_sack', 'idp_int', 'idp_ff', 'idp_pd', 'idp_pass_def', 'idp_def_td',
  'sack', 'int', 'fum_rec', 'def_td', 'pts_allow',
];
const IDP_POSITIONS = new Set(['DL', 'DE', 'DT', 'LB', 'ILB', 'OLB', 'DB', 'CB', 'S', 'SS', 'FS']);

function sumStats(rows) {
  const totals = Object.fromEntries(STAT_KEYS.map((key) => [key, 0]));
  rows.forEach((row) => STAT_KEYS.forEach((key) => { totals[key] += Number(row?.[key]) || 0; }));
  return totals;
}

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

// Chips only name stats the position records: a defender never shows
// receiving yards and a kicker never shows tackles.
function buildStatChips(position, line, games = 1) {
  const pos = String(position ?? '').toUpperCase();
  const chips = [];
  const round = (value) => Math.round(Number(value) || 0);
  if (IDP_POSITIONS.has(pos)) {
    const tackles = round(line.idp_tkl) || round(line.idp_tkl_solo) + round(line.idp_tkl_ast);
    const sacks = Math.round((Number(line.idp_sack) || 0) * 10) / 10;
    chips.push(plural(tackles, 'tackle'));
    if (sacks || ['DL', 'DE', 'DT'].includes(pos)) chips.push(plural(sacks, 'sack'));
    if (line.idp_tkl_loss) chips.push(`${round(line.idp_tkl_loss)} TFL`);
    if (line.idp_int) chips.push(`${round(line.idp_int)} INT`);
    // Sleeper reports passes defended as idp_pass_def; scoring settings call it idp_pd.
    const passesDefended = round(line.idp_pd) + round(line.idp_pass_def);
    if (passesDefended) chips.push(plural(passesDefended, 'pass defended', 'passes defended'));
    if (line.idp_ff) chips.push(plural(round(line.idp_ff), 'forced fumble'));
    if (line.idp_def_td) chips.push(`${round(line.idp_def_td)} TD`);
    return chips.slice(0, 4);
  }
  if (pos === 'DEF' || pos === 'DST' || pos === 'D/ST') {
    const sacks = Math.round((Number(line.sack) || 0) * 10) / 10;
    chips.push(plural(sacks, 'sack'), plural(round(line.int) + round(line.fum_rec), 'takeaway'));
    if (line.def_td) chips.push(`${round(line.def_td)} TD`);
    if (games > 0 && line.pts_allow) chips.push(games === 1 ? `${round(line.pts_allow)} pts allowed` : `${(line.pts_allow / games).toFixed(1)} pts allowed a game`);
    return chips;
  }
  if (pos === 'QB') {
    chips.push(`${round(line.pass_yd)} pass yds`, `${round(line.pass_td)} pass TD`);
    if (line.pass_int) chips.push(`${round(line.pass_int)} INT`);
    if (line.rush_yd) chips.push(`${round(line.rush_yd)} rush yds`);
  } else if (pos === 'K') {
    chips.push(`${round(line.fgm)} FG`, `${round(line.xpm)} XP`);
  } else {
    if (pos === 'RB' || line.rush_yd) chips.push(`${round(line.rush_yd)} rush yds`);
    if (pos !== 'RB' || line.rec) chips.push(`${round(line.rec)} rec · ${round(line.rec_yd)} yds`);
    const touchdowns = round(line.rush_td) + round(line.rec_td);
    if (touchdowns) chips.push(`${touchdowns} TD`);
  }
  if (line.fum_lost) chips.push(`${round(line.fum_lost)} fumble lost`);
  return chips;
}

function signed(value, digits = 2) {
  const numeric = Number(value) || 0;
  return `${numeric >= 0 ? '+' : '−'}${Math.abs(numeric).toFixed(digits)}`;
}

// Gap between the pointer and the card's nearest corner.
const POINTER_OFFSET = 16;
const EDGE_MARGIN = 8;

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
  scoringSettings,
  sideColor,
}) {
  const cardRef = useRef(null);
  const pointerRef = useRef(point);
  // The `point` prop is where the pointer opened the card; it only changes when
  // the card opens for another row. Re-renders (live ticks, content updates)
  // must not snap the card back to it, so it is adopted once per new value.
  const adoptedPointRef = useRef(point);
  // Which side of the pointer the card sits on. Chosen when the card opens and
  // kept while it still fits, so small moves near an edge never flip it back
  // and forth.
  const sideRef = useRef({ x: null, y: null });
  const frameRequestRef = useRef(0);
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

  // This game's line: summed from its plays while the live layer has them,
  // otherwise the week's stat row (past weeks, or no play-by-play).
  const gameLine = useMemo(() => {
    if (mode === 'season') return null;
    if (plays.length) return sumStats(plays.map((play) => play.stats ?? {}));
    const weekRow = (weeklyRows ?? []).find((row) => Number(row?.week) === Number(week));
    return weekRow ? sumStats([weekRow]) : null;
  }, [mode, plays, week, weeklyRows]);

  // With a mouse the card follows the pointer: below-right of it, flipped left
  // or above near the page frame's right edge or the window's bottom. Moves
  // write the position straight to the card, so following the pointer never
  // re-renders the matchup. From keyboard focus it sits below (or above) the
  // row, aligned to the row's outer edge.
  const place = () => {
    const card = cardRef.current;
    const container = containerRef?.current;
    if (!card || !container) return;
    const frame = container.getBoundingClientRect();
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    let left;
    let top;
    const pointer = pointerRef.current;
    if (pointer) {
      const fitsRight = pointer.x + POINTER_OFFSET + width <= frame.right - EDGE_MARGIN;
      const fitsLeft = pointer.x - POINTER_OFFSET - width >= frame.left + EDGE_MARGIN;
      const fitsBelow = pointer.y + POINTER_OFFSET + height <= window.innerHeight - EDGE_MARGIN;
      const fitsAbove = pointer.y - POINTER_OFFSET - height >= EDGE_MARGIN;
      const sides = sideRef.current;
      if (sides.x === 'right' ? !fitsRight && fitsLeft : sides.x === 'left' ? !fitsLeft && fitsRight : true) {
        sides.x = fitsRight || !fitsLeft ? 'right' : 'left';
      }
      if (sides.y === 'below' ? !fitsBelow && fitsAbove : sides.y === 'above' ? !fitsAbove && fitsBelow : true) {
        sides.y = fitsBelow || !fitsAbove ? 'below' : 'above';
      }
      left = sides.x === 'right' ? pointer.x + POINTER_OFFSET : pointer.x - POINTER_OFFSET - width;
      top = sides.y === 'below' ? pointer.y + POINTER_OFFSET : pointer.y - POINTER_OFFSET - height;
      top = Math.max(EDGE_MARGIN, top);
    } else if (anchor) {
      const row = anchor.getBoundingClientRect();
      left = side === 'opp' ? row.right - width : row.left;
      top = row.bottom + 6 + height <= window.innerHeight ? row.bottom + 6 : row.top - 6 - height;
    } else {
      return;
    }
    left = Math.max(EDGE_MARGIN, Math.min(frame.width - width - EDGE_MARGIN, left - frame.left));
    card.style.left = `${left}px`;
    card.style.top = `${top - frame.top}px`;
    card.style.visibility = 'visible';
  };

  // Re-place when the card opens for another row or its content changes size.
  useLayoutEffect(() => {
    if (point && point !== adoptedPointRef.current) {
      adoptedPointRef.current = point;
      pointerRef.current = point;
      sideRef.current = { x: null, y: null };
    }
    place();
  });

  useEffect(() => {
    if (!point) return undefined;
    const onMove = (event) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      pointerRef.current = { x: event.clientX, y: event.clientY };
      // One placement per frame, however fast pointer events arrive.
      if (frameRequestRef.current) return;
      frameRequestRef.current = window.requestAnimationFrame(() => {
        frameRequestRef.current = 0;
        place();
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.cancelAnimationFrame(frameRequestRef.current);
      frameRequestRef.current = 0;
    };
    // `place` reads refs and props at call time; resubscribing per render is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(point)]);

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
