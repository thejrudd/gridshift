import { startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react';

// The Matchups replay bar: Live/Replay state, step and play controls, and a
// track laid out on the kickoff-window axis (matchupSlateAxis.js). It opens at
// live (or, for a finished week, the final whistle) and never moves past it.
// Rules: docs/Fantasy Live.md.

const PLAY_RATE = 0.012; // axis units per second of playback
// A drag keeps its own position until the page has caught up with it.
const NO_DRAFT = Symbol('no-draft');
// Long enough for the page to catch up (a few hundred ms on a full slate).
const DRAFT_SETTLE_MS = 800;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function MatchupReplayBar({
  axis,
  livePosition,
  at,
  onSeek,
  playTimes = [],
  liveGameCount = 0,
  updatedAt = null,
  final = false,
}) {
  const trackRef = useRef(null);
  const barRef = useRef(null);
  const [playingRequested, setPlaying] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);
  const draggingRef = useRef(false);
  // While dragging, the thumb follows the pointer from this local position and
  // the page (a full matchup re-render) follows as an interruptible
  // transition, so a slow page render never holds the thumb back.
  const [draft, setDraft] = useState(NO_DRAFT);
  const settleTimerRef = useRef(null);
  const shownAt = draft === NO_DRAFT ? at : draft;
  const position = shownAt ?? livePosition;
  const atLive = shownAt == null;
  // Reaching live ends playback.
  const playing = playingRequested && !atLive;

  // Label rows stick under the bar; publish its height for them.
  useLayoutEffect(() => {
    const node = barRef.current;
    if (!node) return undefined;
    const host = node.closest('.matchup-live') ?? node.parentElement;
    const publish = () => host?.style.setProperty('--matchup-replay-h', `${Math.ceil(node.getBoundingClientRect().height)}px`);
    publish();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Tick labels only where their window has room for them.
  useLayoutEffect(() => {
    const node = trackRef.current;
    if (!node) return undefined;
    const measure = () => setTrackWidth(node.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const seek = (value) => {
    window.clearTimeout(settleTimerRef.current);
    setDraft(NO_DRAFT);
    if (value == null || value >= livePosition - 1e-6) onSeek(null);
    else onSeek(clamp(value, 0, livePosition));
  };

  const dragSeek = (value) => {
    const next = value == null || value >= livePosition - 1e-6 ? null : clamp(value, 0, livePosition);
    setDraft(next);
    startTransition(() => onSeek(next));
  };

  useEffect(() => () => window.clearTimeout(settleTimerRef.current), []);

  useEffect(() => {
    if (!playing) return undefined;
    let frame = 0;
    let last = null;
    const step = (now) => {
      if (last != null) {
        const next = (at ?? 0) + ((now - last) / 1000) * PLAY_RATE;
        if (next >= livePosition) {
          setPlaying(false);
          onSeek(null);
          return;
        }
        onSeek(next);
      }
      last = now;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [at, livePosition, onSeek, playing]);

  const previousPlay = [...playTimes].reverse().find((time) => time < position - 1e-6);
  const nextPlay = playTimes.find((time) => time > position + 1e-6 && time <= livePosition + 1e-6);
  const stepBack = () => {
    setPlaying(false);
    const earlier = playTimes.filter((time) => time < position - 1e-6);
    seek(earlier.length > 1 ? earlier[earlier.length - 2] : 0);
  };
  const stepForward = () => {
    setPlaying(false);
    if (nextPlay != null) seek(nextPlay);
  };

  const positionFromPointer = (event) => {
    const rect = trackRef.current.getBoundingClientRect();
    return clamp((event.clientX - rect.left) / rect.width, 0, 1);
  };
  const onPointerDown = (event) => {
    if (!trackRef.current || event.button !== 0) return;
    // No text selection while dragging; keep keyboard focus on the slider.
    event.preventDefault();
    trackRef.current.focus({ preventScroll: true });
    draggingRef.current = true;
    window.clearTimeout(settleTimerRef.current);
    trackRef.current.setPointerCapture?.(event.pointerId);
    setPlaying(false);
    dragSeek(positionFromPointer(event));
  };
  const endDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => setDraft(NO_DRAFT), DRAFT_SETTLE_MS);
  };
  const onPointerMove = (event) => {
    if (!draggingRef.current) return;
    // The button was released somewhere the pointer-up never reached.
    if (event.pointerType === 'mouse' && event.buttons === 0) { endDrag(); return; }
    dragSeek(positionFromPointer(event));
  };
  const onKeyDown = (event) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); stepBack(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); stepForward(); }
    if (event.key === 'Home') { event.preventDefault(); setPlaying(false); seek(0); }
    if (event.key === 'End') { event.preventDefault(); setPlaying(false); seek(null); }
  };

  const currentWindow = axis.windowAt(position);
  const endLabel = final ? 'Final' : 'Live';
  const whenLabel = atLive ? (final ? 'Final' : 'Now') : currentWindow?.longLabel ?? 'Replay';
  const updatedLabel = updatedAt ? updatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
  const subLabel = atLive && final
    ? 'Every matchup game is over'
    : atLive
    ? `${liveGameCount ? `${liveGameCount} matchup ${liveGameCount === 1 ? 'game' : 'games'} live` : 'No matchup games live'}${updatedLabel ? ` · ${updatedLabel}` : ''}`
    : null;

  return (
    <div className="matchup-replay" ref={barRef} aria-label="Replay" data-tour="matchup-live-replay">
      <span className={`matchup-replay__state${atLive && !final ? ' is-live' : ''}`}>
        {atLive ? (final ? 'Final' : <><i className="matchup-live-dot" aria-hidden="true" />Live</>) : 'Replay'}
      </span>
      <div className="matchup-replay__buttons">
        <button type="button" className="matchup-replay__button" onClick={stepBack} disabled={previousPlay == null && position <= 0} aria-label="Previous scoring play">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14M19 5 9 12l10 7z" /></svg>
        </button>
        <button
          type="button"
          className="matchup-replay__button"
          onClick={() => {
            if (playing) { setPlaying(false); return; }
            if (atLive) return;
            window.clearTimeout(settleTimerRef.current);
            setDraft(NO_DRAFT);
            setPlaying(true);
          }}
          disabled={atLive}
          aria-label={playing ? 'Pause' : `Play to ${endLabel.toLowerCase()}`}
        >
          {playing
            ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg>
            : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z" /></svg>}
        </button>
        <button type="button" className="matchup-replay__button" onClick={stepForward} disabled={nextPlay == null} aria-label="Next scoring play">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 5v14M5 5l10 7-10 7z" /></svg>
        </button>
      </div>
      <div className="matchup-replay__track-wrap">
        <div
          ref={trackRef}
          className="matchup-replay__track"
          role="slider"
          tabIndex={0}
          aria-label="Replay position"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position * 100)}
          aria-valuetext={atLive ? endLabel : `${whenLabel}, replay`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          onKeyDown={onKeyDown}
        >
          <div className="matchup-replay__segments">
            {axis.windows.map((window) => {
              const span = window.p1 - window.p0;
              const fill = (edge) => `${clamp((edge - window.p0) / span, 0, 1) * 100}%`;
              return (
                <div key={window.index} className="matchup-replay__segment" style={{ flexGrow: window.weight }}>
                  <i style={{ width: fill(livePosition) }} />
                  <b style={{ width: fill(position) }} />
                </div>
              );
            })}
          </div>
          {!final && <span className="matchup-replay__live-mark" style={{ left: `${livePosition * 100}%` }} aria-hidden="true" />}
          <span className="matchup-replay__thumb" style={{ left: `${position * 100}%` }} aria-hidden="true" />
        </div>
        <div className="matchup-replay__ticks" aria-hidden="true">
          {axis.windows
            .filter((window) => (window.p1 - window.p0) * trackWidth >= window.label.length * 6 + 8)
            .map((window) => (
              <span key={window.index} style={{ left: `${((window.p0 + window.p1) / 2) * 100}%` }}>
                {window.label}
              </span>
            ))}
        </div>
      </div>
      <div className="matchup-replay__when">
        <strong>{whenLabel}</strong>
        {atLive
          ? <span>{subLabel}</span>
          : <button type="button" className="matchup-replay__live-button" onClick={() => { setPlaying(false); seek(null); }}>{`Back to ${endLabel.toLowerCase()}`}</button>}
      </div>
    </div>
  );
}
