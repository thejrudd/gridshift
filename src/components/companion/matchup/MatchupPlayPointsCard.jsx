import { useRef } from 'react';
import { usePointerFollow } from './usePointerFollow.js';

// Desktop hover/focus card for a scoring play: the stats the play is scored
// on, each with its points through the league's settings, plus the adjustment
// that matched the player's plays to the official total. Rows always add up to
// the points the play row shows (buildPlayPointsBreakdown()). A combined row
// passes one section per player instead.

const EDGE_MARGIN = 8;
const ANCHOR_GAP = 6;

// The card is fixed to the viewport, so the window is its frame.
const getViewportFrame = () => ({ left: 0, top: 0, right: window.innerWidth, width: window.innerWidth });

const formatSigned = (value) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`;

function formatStat(value) {
  if (value == null) return null;
  // A signed official correction ("+2") arrives already formatted.
  if (typeof value === 'string') return value;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function PointsRows({ rows }) {
  return (
    <ul className="matchup-play-points-card__rows">
      {rows.map((row) => (
        <li key={row.key} className={`matchup-play-points-card__row${row.key.startsWith('official_adjustment') ? ' is-adjustment' : ''}`}>
          <span className="matchup-play-points-card__label">{row.label}</span>
          <span className="matchup-play-points-card__stat tabular-nums">{formatStat(row.statVal)}</span>
          <strong className={`matchup-play-points-card__points tabular-nums${row.pts < 0 ? ' is-negative' : ''}`}>
            {formatSigned(row.pts)}
          </strong>
        </li>
      ))}
    </ul>
  );
}

export default function MatchupPlayPointsCard({ id, breakdown, anchor, point = null, accent }) {
  const cardRef = useRef(null);

  // With a mouse the card follows the pointer (usePointerFollow, as the
  // starter-row cards do). From keyboard focus it sits below the play's
  // points, right-aligned to the row, or above them without room below. A
  // scroll closes it (MatchupScoringPlays) rather than leaving it behind.
  usePointerFollow({
    cardRef,
    point,
    getFrame: getViewportFrame,
    placeWithoutPointer: ({ width, height }) => {
      if (!anchor) return null;
      const rect = anchor.getBoundingClientRect();
      const below = rect.bottom + ANCHOR_GAP;
      return {
        left: rect.right - width,
        top: below + height > window.innerHeight - EDGE_MARGIN ? Math.max(EDGE_MARGIN, rect.top - height - ANCHOR_GAP) : below,
      };
    },
  });

  return (
    <div
      ref={cardRef}
      id={id}
      role="tooltip"
      className="matchup-play-points-card"
      style={{ '--matchup-play-points-side': accent, left: -9999, top: 0, visibility: 'hidden' }}
    >
      <div className="matchup-play-points-card__top">
        <span className="matchup-play-points-card__title">Where the points came from</span>
        <strong className="matchup-play-points-card__total tabular-nums">{formatSigned(breakdown.total)}</strong>
      </div>
      {breakdown.sections?.length
        ? breakdown.sections.map((section) => (
          <div key={section.key} className="matchup-play-points-card__section">
            <div className="matchup-play-points-card__player">
              <span>{section.name}</span>
              <strong className="tabular-nums">{formatSigned(section.total)}</strong>
            </div>
            <PointsRows rows={section.rows} />
          </div>
        ))
        : <PointsRows rows={breakdown.rows} />}
    </div>
  );
}
