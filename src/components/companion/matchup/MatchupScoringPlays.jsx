import { useEffect, useRef, useState } from 'react';
import { filterScoringPlays } from '../../../utils/matchupReplay.js';
import { buildPlayPointsBreakdown } from '../../../utils/matchupPlayBreakdown.js';
import MatchupPlayPointsCard from './MatchupPlayPointsCard.jsx';

// The Matchups scoring plays list: newest first, up to the replay moment.
// Clicking a play rewinds the page to it. Rules: docs/Fantasy Live.md.

// Hover card timing, matching the starter-row cards: 120ms to open, instant
// between rows.
const POINTS_CARD_OPEN_MS = 120;
const POINTS_CARD_ID = 'matchup-play-points';

const SIDE_OPTIONS = [
  { id: 'all', label: 'Both' },
  { id: 'mine', label: 'Mine' },
  { id: 'opp', label: 'Theirs' },
];

function signed(value, digits = 2) {
  const numeric = Number(value) || 0;
  return `${numeric >= 0 ? '+' : '−'}${Math.abs(numeric).toFixed(digits)}`;
}

// Every play shows its change in your win chance: whole points from 1% up, a
// tenth below that (most single plays move it by less than 1%), and 0% when
// it did not move.
function formatSwing(value) {
  const magnitude = Math.abs(value);
  if (magnitude < 0.05) return 'Win 0%';
  return `Win ${signed(value, magnitude < 1 ? 1 : 0)}%`;
}

export default function MatchupScoringPlays({
  events,
  at,
  axis,
  side,
  bigOnly,
  bigPlayThreshold,
  selectedPlayId,
  onSideChange,
  onBigOnlyChange,
  onSelectPlay,
  scrollRequest = 0,
  sideColors,
  // True only during the page's reveal window: rows stagger in with the rest
  // of Matchups, and rows that mount later (scrubbing, new plays) do not move.
  revealing = false,
  // The league's scoring, for the per-play points breakdown.
  scoringSettings = null,
}) {
  const listRef = useRef(null);
  const handledScrollRef = useRef(scrollRequest);
  // `{ id, anchor, point }`: the play, the points cell the card sits under from
  // keyboard focus, and where the mouse opened it (the card then follows it).
  const [pointsTarget, setPointsTarget] = useState(null);
  const pointsOpenRef = useRef(null);
  const pointsTimerRef = useRef(null);
  // Every play up to live stays listed while replaying, so a selected play
  // never becomes a ceiling: the ones after the replay moment are dimmed and
  // still reachable by scrolling up.
  const shown = filterScoringPlays(
    events,
    { side, bigOnly, bigPlayThreshold, sideOf: (event) => event.side },
  ).slice().sort((left, right) => (Number(right.progress) || 0) - (Number(left.progress) || 0));
  const isAfter = (event) => at != null && Number(event.progress) > at + 1e-6;
  const soFar = at == null ? shown.length : shown.filter((event) => !isAfter(event)).length;

  // A selection made on the chart jumps the list to its row (centred, clear of
  // the sticky bars) when the Scoring plays tab is open. A click in the list
  // itself never moves the page.
  useEffect(() => {
    if (scrollRequest === handledScrollRef.current) return;
    handledScrollRef.current = scrollRequest;
    const list = listRef.current;
    if (!selectedPlayId || !list || list.closest('.is-inactive')) return;
    const row = list.querySelector(`[data-play-id="${CSS.escape(String(selectedPlayId))}"]`);
    row?.scrollIntoView({ block: 'center' });
  }, [scrollRequest, selectedPlayId]);

  // Points breakdown card. Mouse and keyboard only, like every Matchups hover
  // card: gated on the event's pointer type (not a hover media query), never
  // opened by touch, pen or a tap's focus, and closed by a click or a scroll.
  const showPoints = (playId, row, point = null) => {
    globalThis.clearTimeout(pointsTimerRef.current);
    if (pointsOpenRef.current === playId) return;
    const target = { id: playId, anchor: row.querySelector('.matchup-play__points') ?? row, point };
    if (pointsOpenRef.current) {
      pointsOpenRef.current = playId;
      setPointsTarget(target);
      return;
    }
    pointsTimerRef.current = globalThis.setTimeout(() => {
      pointsOpenRef.current = playId;
      setPointsTarget(target);
    }, POINTS_CARD_OPEN_MS);
  };
  const hidePoints = () => {
    globalThis.clearTimeout(pointsTimerRef.current);
    pointsOpenRef.current = null;
    setPointsTarget(null);
  };
  useEffect(() => () => globalThis.clearTimeout(pointsTimerRef.current), []);
  useEffect(() => {
    if (!pointsTarget) return undefined;
    const close = () => {
      pointsOpenRef.current = null;
      setPointsTarget(null);
    };
    globalThis.addEventListener('scroll', close, { capture: true, passive: true });
    return () => globalThis.removeEventListener('scroll', close, { capture: true });
  }, [pointsTarget]);
  // A filter change can take the hovered play out of the list.
  const pointsEvent = pointsTarget ? shown.find((event) => event.id === pointsTarget.id) ?? null : null;

  return (
    <section className="matchup-live-section" id="matchup-scoring-plays" data-panel="plays" aria-labelledby="matchup-scoring-plays-title">
      <div className="matchup-live-label">
        <h2 id="matchup-scoring-plays-title">Scoring plays</h2>
        <span className="matchup-live-label__scope">
          {at == null
            ? `${shown.length} ${shown.length === 1 ? 'play' : 'plays'}`
            : `${soFar} of ${shown.length} ${shown.length === 1 ? 'play' : 'plays'} so far`}
        </span>
        <div className="matchup-live-label__controls" role="group" aria-label="Filter plays">
          {SIDE_OPTIONS.map((option) => (
            <button key={option.id} type="button" className="matchup-live-chip" aria-pressed={side === option.id} onClick={() => onSideChange(option.id)}>
              {option.label}
            </button>
          ))}
          <button type="button" className="matchup-live-chip" aria-pressed={bigOnly} onClick={() => onBigOnlyChange(!bigOnly)}>
            Big plays
          </button>
        </div>
      </div>
      <ul className={`matchup-plays${revealing ? ' gridshift-reveal gridshift-reveal--auto' : ''}`} ref={listRef}>
        {shown.length === 0 && (
          <li className="matchup-plays__empty">{events.length ? 'No plays match these filters.' : 'No scoring plays yet.'}</li>
        )}
        {shown.map((event) => {
          const window = axis.windowAt(Number(event.progress));
          const selected = selectedPlayId === event.id;
          const after = isAfter(event);
          const negative = Number(event.pts) < 0;
          const meta = [window?.label, event.glance?.clock, Number.isFinite(Number(event.runningTotal)) ? `${Number(event.runningTotal).toFixed(1)} total` : null]
            .filter(Boolean)
            .join(' · ');
          return (
            <li key={event.id}>
              <button
                type="button"
                className={`matchup-play${selected ? ' is-selected' : ''}${after ? ' is-after' : ''}${negative ? ' is-negative' : ''}${event.kind === 'td' ? ' is-td' : ''}`}
                style={{ '--matchup-play-side': sideColors[event.side] }}
                data-play-id={event.id}
                aria-pressed={selected}
                aria-label={`${event.playerName}, ${event.description ?? ''}, ${signed(event.pts)} points${after ? ', after this moment' : ''}. Replay from this play.`}
                aria-describedby={pointsEvent?.id === event.id ? POINTS_CARD_ID : undefined}
                onClick={() => {
                  hidePoints();
                  onSelectPlay(event.id, 'list');
                }}
                onPointerEnter={(pointer) => {
                  if (pointer.pointerType === 'mouse') showPoints(event.id, pointer.currentTarget, { x: pointer.clientX, y: pointer.clientY });
                }}
                onPointerLeave={(pointer) => { if (pointer.pointerType === 'mouse') hidePoints(); }}
                onFocus={(focus) => { if (focus.currentTarget.matches?.(':focus-visible')) showPoints(event.id, focus.currentTarget); }}
                onBlur={hidePoints}
              >
                <span className="matchup-play__main">
                  <span className="matchup-play__who">
                    <span className="matchup-play__name">{event.playerName}</span>
                    <span className="matchup-play__desc">{event.description}</span>
                    {event.status === 'pending' && <span className="matchup-play__tag">Pending</span>}
                    {event.source === 'stat-update' && <span className="matchup-play__tag">Stat update</span>}
                  </span>
                  <span className="matchup-play__meta">{meta}</span>
                </span>
                <span className="matchup-play__points">
                  {signed(event.pts)}
                  {Number.isFinite(Number(event.swingMine)) && (
                    <small>{formatSwing(Number(event.swingMine))}</small>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {pointsEvent && (
        <MatchupPlayPointsCard
          id={POINTS_CARD_ID}
          breakdown={buildPlayPointsBreakdown(pointsEvent, scoringSettings)}
          anchor={pointsTarget.anchor}
          point={pointsTarget.point}
          accent={sideColors[pointsEvent.side]}
        />
      )}
    </section>
  );
}
