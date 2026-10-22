import { useLayoutEffect, useRef } from 'react';

// Desktop hover/focus card for a masthead scorecard: where the side's points
// come from, by position. Pregame it splits the projected total
// (buildMatchupPointSources()); live and final it splits the score the header
// shows (buildMatchupScoredSources()), so the rows always add up to the
// header number. Clicking the scorecard still opens the full team scoring
// drilldown.

const EDGE_MARGIN = 8;
const ANCHOR_GAP = 6;

const TITLES = {
  pregame: 'Where the points come from',
  live: 'Points so far',
  final: 'Where the points came from',
};

const STATE_LABELS = { live: 'playing', pre: 'yet to play', final: 'finished' };

const formatSigned = (value) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`;

function PlayerEntry({ player, phase }) {
  if (phase === 'live' && player.state === 'pre') {
    return <span className="is-pre">{player.name} <b>—</b></span>;
  }
  return (
    <span className={phase === 'live' && player.state === 'live' ? 'is-live' : undefined}>
      {player.name} <b className="tabular-nums">{player.points.toFixed(1)}</b>
      {player.estimated && <sup aria-label="estimate">*</sup>}
      {phase === 'live' && player.state === 'live' && <span className="sr-only"> (playing)</span>}
    </span>
  );
}

export default function MatchupPointSourcesCard({ id, sources, side, anchorRef, frameRef, accent }) {
  const cardRef = useRef(null);
  const phase = sources.phase ?? 'pregame';

  // Below the scorecard, aligned to its outer edge and kept inside the frame.
  useLayoutEffect(() => {
    const card = cardRef.current;
    const anchor = anchorRef?.current;
    const frame = frameRef?.current;
    if (!card || !anchor || !frame) return;
    const frameRect = frame.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const width = card.offsetWidth;
    const preferred = side === 'opponent' ? anchorRect.right - width : anchorRect.left + EDGE_MARGIN;
    const left = Math.max(EDGE_MARGIN, Math.min(frameRect.width - width - EDGE_MARGIN, preferred - frameRect.left));
    card.style.left = `${left}px`;
    card.style.top = `${anchorRect.bottom - frameRect.top + ANCHOR_GAP}px`;
    card.style.visibility = 'visible';
  });

  const maxShare = Math.max(0.01, ...sources.rows.map((row) => row.share));
  const stateSummary = phase === 'live'
    ? ['live', 'pre', 'final']
      .filter((state) => sources.counts?.[state] > 0)
      .map((state) => `${sources.counts[state]} ${STATE_LABELS[state]}`)
      .join(' · ')
    : null;

  return (
    <div
      ref={cardRef}
      id={id}
      role="tooltip"
      className={`matchup-sources-card is-${phase}`}
      style={{ '--matchup-sources-side': accent, left: -9999, top: 0, visibility: 'hidden' }}
    >
      <div className="matchup-sources-card__top">
        <span className="matchup-sources-card__title">{TITLES[phase]}</span>
        <strong className="matchup-sources-card__total tabular-nums">{sources.total.toFixed(1)}</strong>
      </div>
      {stateSummary && <p className="matchup-sources-card__note">{stateSummary}</p>}
      <ul className="matchup-sources-card__rows">
        {sources.rows.map((row) => (
          <li key={row.position} className="matchup-sources-card__row">
            <span className="matchup-sources-card__position">{row.label}</span>
            <span className="matchup-sources-card__players">
              {row.players.map((player, index) => (
                <span key={player.id ?? index}>
                  {index > 0 && <i aria-hidden="true"> · </i>}
                  <PlayerEntry player={player} phase={phase} />
                </span>
              ))}
            </span>
            <strong className="matchup-sources-card__points tabular-nums">
              {row.points.toFixed(1)}
              {row.delta != null && (
                <span
                  className={`matchup-sources-card__delta ${row.delta >= 0 ? 'is-up' : 'is-down'}`}
                  aria-label={`${Math.abs(row.delta).toFixed(1)} ${row.delta >= 0 ? 'above' : 'below'} projection`}
                >
                  {formatSigned(row.delta)}
                </span>
              )}
            </strong>
            <span className="matchup-sources-card__bar" aria-hidden="true">
              <i style={{ width: `${Math.round((row.share / maxShare) * 100)}%` }} />
            </span>
          </li>
        ))}
        {sources.adjustment !== 0 && (
          <li className="matchup-sources-card__row is-adjustment">
            <span className="matchup-sources-card__position">League</span>
            <span className="matchup-sources-card__players">League adjustments</span>
            <strong className="matchup-sources-card__points tabular-nums">
              {formatSigned(sources.adjustment)}
            </strong>
          </li>
        )}
      </ul>
      {sources.estimatedCount > 0 && (
        <p className="matchup-sources-card__note">
          * No projection yet; uses a season average or position estimate.
        </p>
      )}
      {sources.projectedFinal != null && (
        <p className="matchup-sources-card__note">
          Projected final <b className="tabular-nums">{sources.projectedFinal.toFixed(1)}</b>
          {sources.toGo > 0 && <> · <b className="tabular-nums">{sources.toGo.toFixed(1)}</b> to go</>}
        </p>
      )}
      {phase === 'final' && sources.rows.some((row) => row.delta != null) && (
        <p className="matchup-sources-card__note">+/− compares each position with its projection.</p>
      )}
      {sources.topBench && (
        <p className="matchup-sources-card__note">
          Top bench scorer: {sources.topBench.name} <b className="tabular-nums">{sources.topBench.points.toFixed(1)}</b>
        </p>
      )}
      <p className="matchup-sources-card__note">Click for the full scoring breakdown.</p>
    </div>
  );
}
