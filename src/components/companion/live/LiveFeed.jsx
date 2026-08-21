// LiveFeed.jsx — the side filter and the play feed. Every row opens in place
// to show the scoring math that produced it, the counting stats behind it, and
// a way through to the player's full breakdown.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import HorizontalScrollCue from '../../HorizontalScrollCue.jsx';
import useHorizontalScrollCue from '../../../hooks/useHorizontalScrollCue.js';
import { LiveAvatar, LiveGlyphBadge, LivePosChip } from './LiveAtoms.jsx';
import { firstWordOf, getLiveEventLabel, getLiveKindMeta } from './liveVisuals.js';
import { buildFantasyScoringBreakdown } from '../../../utils/fantasyBreakdownRows.js';
import { getSleeperPlayerName } from '../../../utils/liveScoringFeed.js';
import { toggleFilterValue } from '../../../utils/liveFeedFilters.js';
import { DrivePlayback } from '../../nflPlays/DrivePlayback.jsx';
import { normalizeBdlScorePlay } from '../../../utils/balldontlieNflScoreboard.js';
import { withAlpha } from '../../../utils/fantasyTeamIdentity.js';

// The counting stats worth surfacing under a play's scoring math, in the order
// a reader wants them. Anything not listed stays in the scoring rows above.
const PLAY_STAT_LABELS = [
  ['pass_yd', 'Pass yds'],
  ['pass_td', 'Pass TD'],
  ['rush_yd', 'Rush yds'],
  ['rush_td', 'Rush TD'],
  ['rec', 'Rec'],
  ['rec_yd', 'Rec yds'],
  ['rec_td', 'Rec TD'],
  ['fgm', 'FG made'],
  ['xpm', 'XP made'],
  ['sack', 'Sacks'],
  ['int', 'Int'],
  ['fum_lost', 'Fumbles lost'],
  ['def_ff', 'Forced fum'],
  ['def_pass_def', 'Pass def'],
];

function formatSigned(value) {
  const numeric = Number(value) || 0;
  return `${numeric >= 0 ? '+' : '−'}${Math.abs(numeric).toFixed(1)}`;
}

function scrollRowToFeedTop(row, behavior = 'auto') {
  if (!row) return;
  const scroller = row.closest('.fl-feed-scroll');
  const overflowY = scroller ? window.getComputedStyle(scroller).overflowY : '';
  const hasIndependentScroll = scroller
    && (overflowY === 'auto' || overflowY === 'scroll')
    && scroller.scrollHeight > scroller.clientHeight;

  if (!hasIndependentScroll) {
    row.scrollIntoView({ block: 'start', behavior });
    return;
  }

  const filterHeight = scroller.querySelector('.fl-filter-wrap')?.getBoundingClientRect().height ?? 0;
  const targetTop = (
    row.getBoundingClientRect().top
    - scroller.getBoundingClientRect().top
    + scroller.scrollTop
    - filterHeight
  );
  scroller.scrollTo({ top: Math.max(0, targetTop), behavior });
}

/**
 * Play-type tiers. The group row is always present; type chips appear only
 * once a group is chosen, so the resting state costs one row. Both tiers come
 * from the league's own scoring, so a chip never offers a filter that cannot
 * match — see buildFeedFilterModel().
 */
export function LiveFeedPlayFilter({ model = [], value, onChange, positions = [], counts = {} }) {
  const groupRowRef = useRef(null);
  const typeRowRef = useRef(null);
  const activeGroup = model.find((group) => group.id === value.group) ?? null;
  // Cues track the rails they describe, so they appear only where there is
  // more to reach in that direction.
  const groupCue = useHorizontalScrollCue(groupRowRef, [model, positions, counts]);
  const typeCue = useHorizontalScrollCue(typeRowRef, [activeGroup?.id, value.types]);

  if (!model.length) return null;
  const setGroup = (groupId) => onChange({
    ...value,
    // Types belong to the group that offered them.
    group: value.group === groupId ? 'all' : groupId,
    types: [],
  });

  return (
    <div className="fl-playfilter">
      <div className="fl-playfilter__rail">
      <div className="fl-playfilter__row" ref={groupRowRef} role="group" aria-label="Play type">
        {model.map((group) => (
          <button
            key={group.id}
            type="button"
            className={`fl-playfilter__chip${value.group === group.id ? ' is-active' : ''}`}
            onClick={() => setGroup(group.id)}
            aria-pressed={value.group === group.id}
          >
            {group.label}
            {counts[group.id] != null && <span className="fl-playfilter__count">{counts[group.id]}</span>}
          </button>
        ))}
        {positions.length > 0 && (
          <span className="fl-playfilter__divider" aria-hidden="true" />
        )}
        {positions.map((position) => (
          <button
            key={position}
            type="button"
            className={`fl-playfilter__chip is-position${value.positions.includes(position) ? ' is-active' : ''}`}
            onClick={() => onChange({ ...value, positions: toggleFilterValue(value.positions, position) })}
            aria-pressed={value.positions.includes(position)}
            aria-label={`${position} only`}
          >
            {position}
          </button>
        ))}
      </div>
      <HorizontalScrollCue
        left={groupCue.left}
        right={groupCue.right}
        targetRef={groupRowRef}
        label="play type filters"
      />
      </div>

      {activeGroup?.types.length > 0 && (
        <div className="fl-playfilter__rail">
        <div className="fl-playfilter__row is-types" ref={typeRowRef} role="group" aria-label={`${activeGroup.label} play types`}>
          {activeGroup.types.map((type) => (
            <button
              key={type.id}
              type="button"
              className={`fl-playfilter__chip is-type${value.types.includes(type.id) ? ' is-active' : ''}`}
              onClick={() => onChange({ ...value, types: toggleFilterValue(value.types, type.id) })}
              aria-pressed={value.types.includes(type.id)}
            >
              {type.label}
            </button>
          ))}
        </div>
        <HorizontalScrollCue
          left={typeCue.left}
          right={typeCue.right}
          targetRef={typeRowRef}
          label={`${activeGroup.label} play types`}
        />
        </div>
      )}
    </div>
  );
}

export function LiveFeedFilter({ left, right, value, counts, onChange, focusName, onClearFocus }) {
  const options = [
    { id: 'a', label: left?.isMine ? 'Mine' : (firstWordOf(left?.name) || 'Team A'), color: left?.palette?.[0], count: counts.a, side: left },
    { id: 'both', label: 'Both', color: 'var(--color-label)', count: counts.a + counts.b, side: null },
    { id: 'b', label: right?.isMine ? 'Mine' : (firstWordOf(right?.name) || 'Team B'), color: right?.palette?.[0], count: counts.b, side: right },
  ];
  return (
    <div className="fl-filter-wrap">
      <div className="fl-filter" role="group" aria-label="Feed side filter">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`fl-filter__f${value === option.id ? ' is-active' : ''}`}
            style={{ '--fl-filter-color': option.color }}
            onClick={() => onChange?.(option.id)}
            aria-pressed={value === option.id}
            aria-label={option.side ? option.side.name : 'Both teams'}
          >
            {option.id !== 'both' && <i style={{ background: option.color }} aria-hidden="true" />}
            {option.label}
            <span className="fl-filter__count">{option.count}</span>
          </button>
        ))}
        {focusName ? (
          <button type="button" className="fl-filter__clear" onClick={onClearFocus}>
            {focusName} only ✕
          </button>
        ) : (
          <span className="fl-filter__spacer" />
        )}
      </div>
      <div className="fl-filter__rule" aria-hidden="true" />
    </div>
  );
}

/**
 * The play drawn on a field, reusing the Statistics play-by-play visual.
 *
 * Only rendered when the event carries the provider's own play row — the feed's
 * normalisation keeps a sentence, while the field needs down, distance and
 * yards to the end zone. An event reconstructed from stat deltas has no such
 * row and simply shows no field, rather than a fabricated one.
 */
function PlayFieldVisual({ event, side, scoringSettings, position }) {
  const raw = event?.play?.raw;
  const game = raw?.game ?? null;
  const strip = useMemo(() => {
    if (!raw) return null;
    const normalized = normalizeBdlScorePlay(raw, game);
    if (!normalized) return null;
    const home = game?.home_team?.abbreviation ?? null;
    const away = game?.visitor_team?.abbreviation ?? null;
    if (!home || !away) return null;
    return { normalized, home, away };
  }, [game, raw]);

  if (!strip) return null;
  // A touchdown's points land when the ball is in, not along the way, so the
  // ticker is told how much of the total is the score itself.
  return (
    <div className="fl-exp__field">
      <DrivePlayback
        plays={[strip.normalized]}
        homeTeam={strip.home}
        awayTeam={strip.away}
        barColor={side.palette[0]}
        fantasyStats={event.stats ?? null}
        fantasyScoring={scoringSettings}
        fantasyPosition={position}
      />
    </div>
  );
}

function PlayDetail({ event, entry, side, scoringSettings, onOpenPlayer, showPlayField = false }) {
  const position = String(entry.row.player?.position ?? 'FLEX').toUpperCase();
  const meta = getLiveKindMeta(event.kind);
  const breakdown = useMemo(() => (
    event.stats
      ? buildFantasyScoringBreakdown(event.stats, scoringSettings, position, {
          authoritativeTotal: Number(event.pts) || 0,
          adjustmentLabel: 'Play scoring adjustment',
          fallbackTotalLabel: 'Play fantasy impact',
        })
      : { rows: [], total: Number(event.pts) || 0 }
  ), [event.pts, event.stats, position, scoringSettings]);

  const stats = PLAY_STAT_LABELS
    .map(([key, label]) => [label, Number(event.stats?.[key]) || 0])
    .filter(([, value]) => value !== 0);

  return (
    <div className="fl-exp" style={{ '--fl-team': side.palette[0] }}>
      {showPlayField && (
        <PlayFieldVisual
          event={event}
          side={side}
          scoringSettings={scoringSettings}
          position={position}
        />
      )}
      <div className="fl-exp__head">
        <span className="fl-exp__kind" style={{ color: meta.color }}>{getLiveEventLabel(event)}</span>
        {event.glance && (
          <span className="fl-exp__ctx">
            {[event.glance.clock, event.glance.score].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>

      {breakdown.rows.length > 0 ? (
        <div className="fl-exp__lines">
          {breakdown.rows.map((row) => (
            <div className="fl-exp__ln" key={row.key}>
              <span>
                {row.label}
                {row.statVal ? <span className="fl-exp__dtl">{row.statVal}</span> : null}
              </span>
              <span className="fl-exp__lv" style={{ color: row.pts < 0 ? 'var(--color-accent-red)' : 'var(--color-label)' }}>
                {formatSigned(row.pts)}
              </span>
            </div>
          ))}
          <div className="fl-exp__ln is-total">
            <span>This play</span>
            <span
              className="fl-exp__lv"
              style={{ color: (Number(event.pts) || 0) >= 0 ? 'var(--color-accent-green)' : 'var(--color-accent-red)' }}
            >
              {formatSigned(event.pts)}
            </span>
          </div>
        </div>
      ) : (
        <p className="fl-exp__note">
          This play is credited to {getSleeperPlayerName(entry.row.player)} but no scoring stats were reported with it.
        </p>
      )}

      {stats.length > 0 && (
        <div className="fl-exp__statrow">
          {stats.map(([label, value]) => (
            <span className="fl-exp__stat" key={label}>
              <b>{Number.isInteger(value) ? value : value.toFixed(1)}</b>
              <span>{label}</span>
            </span>
          ))}
        </div>
      )}

      {event.estimated && (
        <p className="fl-exp__note">Estimated from the play description — the official stat line settles it.</p>
      )}

      <button type="button" className="fl-exp__more" onClick={() => onOpenPlayer?.(entry, event)}>
        Full player breakdown →
      </button>
    </div>
  );
}

export function LiveFeedList({
  events = [],
  entriesById,
  sidesByKey,
  scoringSettings,
  anchorProgress = null,
  selectedEventId = null,
  selectionRequest = 0,
  onOpenPlayer,
  emptyMessage = 'No scoring plays yet.',
  // The field visual is proven in the dev replay first; live scoring keeps its
  // existing expanded row until it has been reviewed there.
  showPlayField = false,
}) {
  const [openId, setOpenId] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const rowRefs = useRef({});
  const handledSelectionRef = useRef(null);

  // Scrubbing the pace chart drops the feed at the play that was on screen at
  // that moment. The chart's axis is game progress, so the anchor is too: the
  // latest play at or before that point of the games is what a viewer would
  // have been looking at.
  let anchorId = null;
  if (anchorProgress != null && events.length) {
    let latest = -1;
    events.forEach((event) => {
      const point = Number(event.progress);
      if (!Number.isFinite(point) || point > anchorProgress || point <= latest) return;
      latest = point;
      anchorId = event.id;
    });
    anchorId = anchorId ?? events[events.length - 1].id;
  }

  useEffect(() => {
    if (!anchorId) return undefined;
    const frame = window.requestAnimationFrame(() => {
      setFlashId(anchorId);
      scrollRowToFeedTop(rowRefs.current[anchorId]);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [anchorProgress, anchorId]);

  useEffect(() => {
    if (!selectedEventId) return undefined;
    const selectionKey = `${selectedEventId}:${selectionRequest}`;
    if (handledSelectionRef.current === selectionKey) return undefined;
    if (!events.some((event) => event.id === selectedEventId)) return undefined;
    handledSelectionRef.current = selectionKey;
    let scrollFrame = null;
    const stateFrame = window.requestAnimationFrame(() => {
      setOpenId(selectedEventId);
      setFlashId(selectedEventId);
      scrollFrame = window.requestAnimationFrame(() => {
        const row = rowRefs.current[selectedEventId];
        if (!row) return;
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        scrollRowToFeedTop(row, reduceMotion ? 'auto' : 'smooth');
        row.focus({ preventScroll: true });
      });
    });
    return () => {
      window.cancelAnimationFrame(stateFrame);
      if (scrollFrame != null) window.cancelAnimationFrame(scrollFrame);
    };
  }, [events, selectedEventId, selectionRequest]);

  useEffect(() => {
    if (!flashId) return undefined;
    const timer = window.setTimeout(() => setFlashId(null), 1100);
    return () => window.clearTimeout(timer);
  }, [flashId]);

  if (!events.length) {
    return <div className="fl-empty">{emptyMessage}</div>;
  }

  return (
    <div className="fl-feed">
      {events.map((event) => {
        const entry = entriesById.get(event.playerId);
        if (!entry) return null;
        const side = sidesByKey[entry.sideKey];
        const color = side.palette[0];
        const name = getSleeperPlayerName(entry.row.player);
        const isOpen = openId === event.id;
        const isSelected = selectedEventId === event.id;
        return (
          <Fragment key={event.id}>
            <button
              type="button"
              ref={(node) => { rowRefs.current[event.id] = node; }}
              className={`fl-play${isOpen ? ' is-open' : ''}${isSelected ? ' is-selected' : ''}${flashId === event.id ? ' is-flash' : ''}`}
              style={{ '--fl-team': color, '--fl-wash': withAlpha(color, 0.13) }}
              onClick={() => setOpenId(isOpen ? null : event.id)}
              aria-expanded={isOpen}
            >
              <span className="fl-play__figure">
                <LiveAvatar player={entry.row.player} size={46} className="fl-play__av" />
                <LiveGlyphBadge kind={event.kind} />
              </span>
              <span className="fl-play__body">
                <span className="fl-play__l1">
                  <span className="fl-play__nm">{name}</span>
                  <LivePosChip position={entry.row.player?.position} />
                </span>
                <span className="fl-play__desc">{event.desc}</span>
                {event.glance && (
                  <span className="fl-play__l3">
                    {event.glance.live && <i className="fl-live-dot" aria-hidden="true" />}
                    <span>{event.glance.clock}</span>
                    <span className="fl-play__sep" aria-hidden="true">·</span>
                    <span>{event.glance.score}</span>
                  </span>
                )}
              </span>
              <span className="fl-play__delta">
                <span className={`fl-play__dv${(Number(event.pts) || 0) >= 0 ? ' is-up' : ' is-down'}`}>
                  {formatSigned(event.pts)}
                </span>
                <span className="fl-play__dt">{entry.pace.points.toFixed(1)} total</span>
              </span>
            </button>
            {isOpen && (
              <PlayDetail
                showPlayField={showPlayField}
                event={event}
                entry={entry}
                side={side}
                scoringSettings={scoringSettings}
                onOpenPlayer={onOpenPlayer}
              />
            )}
          </Fragment>
        );
      })}
      <div className="fl-feed__tail" aria-hidden="true" />
    </div>
  );
}
