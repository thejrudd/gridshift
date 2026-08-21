// DrivePlayback.jsx — the drive played back one snap at a time.
//
// The drive field above stacks every play as a lane, which answers "what shape
// was this drive" at a glance. This answers a different question: what actually
// happened, in order. One play holds the field at a time, the ball travels its
// real path, and the text underneath assembles itself beat by beat as the ball
// reaches each moment — the throw as it leaves the hand, the catch as it
// arrives, the tackle where the play was blown dead.
//
// The field never moves. Everything is drawn on the same 120-yard canvas the
// drive field and the play strips use, so a play here sits on exactly the yard
// line it sits on up there, and field position stays readable across the whole
// drive rather than being rescaled per play.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fieldX, teamLogo } from '../../utils/nflPlays/fieldGeometry.js';
import { ballAt, beatsThrough, getDriveTimelines } from '../../utils/nflPlays/playBeats.js';
import { lookupPlayerByName } from '../../utils/nflPlays/playerNameIndex.js';
import {
  buildPartialPlayStats,
  getYardageProgress,
} from '../../utils/nflPlays/playRecapFraming.js';
import { calcPoints } from '../../utils/scoringEngine.js';
import { mixHex, pickReadableForeground } from '../../utils/teamVisualTheme.js';
import { PlayerAvatar } from '../shared/PlayerAvatar.jsx';
import { EndZone, FieldLines, RedZones, YardAxis } from './fieldPrimitives.jsx';
import './NflPlays.css';

const VIEW_W = 1200;
const VIEW_H = 100;
// The ball at rest sits on the vertical centre of the field, not down at a
// ground line. Centring it keeps the thing you are actually watching in the
// middle of the graphic and frees the strip underneath for the down-and-distance
// flag, which then obscures nothing.
const GROUND_Y = 50;
// View units the ball rises for one unit of `lift`.
//
// The binding case is a made field goal: it ends at a lift of 1.5 and carries an
// apex of 1.1 on top of that, which peaks near 1.95 partway through the flight.
// At 30 that put the ball nearly nine units above the top of the canvas — the
// kick left the picture on the way through the uprights. 23 keeps the whole
// flight on the field with room to spare.
//
// Every play advances along the centre line. Which third of the field a play
// went to is reported and is said in the beat text, but it is deliberately not
// drawn: the vertical axis is height, and the hash a play started from is never
// reported, so a lateral position would have to be invented from the middle of
// the field on every snap.
const LIFT_SCALE = 23;

const SPEEDS = [0.5, 1, 2];
const TRACE_SAMPLES = 90;

const viewX = (yard, flipped) => (fieldX(yard, flipped) / 100) * VIEW_W;
const viewY = (lift) => GROUND_Y - lift * LIFT_SCALE;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return undefined;
    const onChange = (event) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * @param plays        The drive's plays, chronological.
 * @param homeTeam     Home abbreviation — fixes the field orientation.
 * @param awayTeam     Away abbreviation.
 * @param awayTheme    Team visual themes for the two end zones.
 * @param homeTheme
 * @param barColor     The attacking team's colour.
 * @param participants Name index from the game's box score, for expanding the
 *                     abbreviated tackler names and attaching headshots.
 * @param flipped      Mirror the canvas — the quarter's teams changed ends.
 */
export function DrivePlayback({
  plays = [], homeTeam, awayTeam, awayTheme, homeTheme, barColor, participants = null, flipped = false,
  // Fantasy Live rides the same playback but asks a different question: not
  // "what happened" but "what did this earn me". Given a points total, the
  // running value travels with the ball. Statistics passes none of these and
  // renders exactly as before.
  fantasyStats = null,
  fantasyScoring = null,
  fantasyPosition = null,
}) {
  const reducedMotion = usePrefersReducedMotion();

  // The official description abbreviates everyone it names outside the primary
  // action ("K.Murray"). The box-score index is the only thing that can expand
  // those, and when it can't the abbreviated form is shown as-is rather than
  // guessed at.
  const resolveName = useCallback((name) => {
    const player = participants ? lookupPlayerByName(participants, name) : null;
    return player?.name ?? name;
  }, [participants]);

  const timelines = useMemo(
    () => getDriveTimelines(plays, { homeTeam, awayTeam, resolveName }),
    [plays, homeTeam, awayTeam, resolveName],
  );

  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  // Playback only mounts when the drive field's toggle is switched to it, and
  // asking for playback is asking to watch — so it starts running rather than
  // waiting on a second click.
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);

  // Clamped on read rather than corrected in an effect: a live game appending
  // or replacing plays can shrink the drive underneath playback, and deriving
  // the position keeps that from rendering a frame against a play that no
  // longer exists.
  const active = Math.min(index, Math.max(timelines.length - 1, 0));
  const current = timelines[active] ?? null;
  const total = current ? current.timeline.duration + current.timeline.hold : 0;
  const atLastPlay = active >= timelines.length - 1;

  // The animation loop reads and writes the clock through a ref so it can run
  // without re-subscribing on every frame. `seek` is the one way the clock
  // moves, which keeps the ref in step with the jumps that come from outside
  // it — a chip click, a step button, the handoff to the next play.
  const elapsedRef = useRef(0);
  const seek = useCallback((ms) => {
    elapsedRef.current = ms;
    setElapsed(ms);
  }, []);

  const goTo = useCallback((next) => {
    setIndex(Math.min(Math.max(next, 0), Math.max(timelines.length - 1, 0)));
    seek(0);
  }, [timelines.length, seek]);

  // The clock.
  //
  // Everything that ends a play — stopping on the last one, advancing to the
  // next — happens in the body of the frame, never inside a state updater. An
  // updater must be a pure function of the previous value: React is free to
  // call it more than once, and StrictMode deliberately does. Advancing the
  // play index from inside one therefore ran it twice and played every other
  // play — 1, 3, 5. The clock lives in a ref for the same reason, so the loop
  // reads the current time without depending on a value that changes every
  // frame and tearing the subscription down with it.
  const frame = useRef(0);
  useEffect(() => {
    if (!playing || !current || reducedMotion) return undefined;

    let last = performance.now();
    const step = (now) => {
      const delta = (now - last) * speed;
      last = now;
      const next = elapsedRef.current + delta;

      if (next < total) {
        seek(next);
        frame.current = requestAnimationFrame(step);
        return;
      }
      if (atLastPlay) {
        seek(total);
        setPlaying(false);
        return;
      }
      // No new frame is scheduled here: changing the play re-runs this effect,
      // which starts the loop again against the next timeline.
      seek(0);
      setIndex((position) => position + 1);
    };

    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [playing, current, total, speed, atLastPlay, reducedMotion, seek]);

  // Reduced motion gets the same timeline sampled only at its beats: the text
  // advances on exactly the schedule it would otherwise animate to, and the
  // ball jumps between positions instead of gliding between them.
  useEffect(() => {
    if (!playing || !current || !reducedMotion) return undefined;

    const next = current.timeline.beats.find((beat) => beat.at > elapsed);
    const target = next ? next.at : total;
    const timer = setTimeout(() => {
      if (elapsed >= total) {
        if (atLastPlay) setPlaying(false);
        else goTo(active + 1);
      } else {
        seek(target);
      }
    }, Math.max(120, (target - elapsed) / speed));
    return () => clearTimeout(timer);
  }, [playing, current, total, speed, atLastPlay, reducedMotion, elapsed, active, goTo, seek]);

  if (!timelines.length || !current) return null;

  const { timeline: line, play } = current;
  const clock = Math.min(elapsed, line.duration);
  const ball = ballAt(line.segments, clock);

  const fired = beatsThrough(line.beats, elapsed);
  const geometry = line.geometry;

  const x = (yard) => fieldX(yard, flipped);

  // The trail the ball has covered so far, sampled off the same function that
  // positions it — the two can never disagree about where it went.
  //
  // It is drawn in runs rather than as one line, because the trail changes
  // colour partway through a play: the moment an interception is caught or a
  // fumble is recovered, the rest of it belongs to the other team. A single
  // stroke in the offense's colour made a pick read as that same offense running
  // backwards, which is the opposite of what happened.
  const strokes = [];
  for (let i = 0; i <= TRACE_SAMPLES; i += 1) {
    const at = (clock * i) / TRACE_SAMPLES;
    const point = ballAt(line.segments, at);
    const px = `${viewX(point.yard, flipped).toFixed(1)},${viewY(point.lift).toFixed(1)}`;
    const open = strokes[strokes.length - 1];
    if (!open || open.tone !== point.tone) {
      // The boundary sample belongs to both runs, or the trail breaks at every
      // change of colour.
      if (open) open.points.push(px);
      strokes.push({ tone: point.tone, points: [px] });
    } else {
      open.points.push(px);
    }
    if (at >= clock) break;
  }

  // One dot per named actor that has entered the play, in the order they did.
  // Only the newest is labelled: on a whole-field view three name plates
  // collide long before three dots do.
  const markers = [];
  fired.forEach((beat) => {
    if (!beat.name) return;
    const existing = markers.findIndex((marker) => marker.name === beat.name);
    if (existing >= 0) markers.splice(existing, 1);
    markers.push({ name: beat.name, yard: beat.marker, role: beat.role, kind: beat.kind });
  });
  const latest = markers[markers.length - 1] ?? null;

  // Scoring the stat line as it stands — rather than interpolating the play's
  // final points — is what makes each unit land whole: a tenth per yard as the
  // ball advances, the reception's full point at the catch, the touchdown at
  // the score. Yardage is read off the ball, so it stops when the ball stops
  // rather than drifting on through the beats after the whistle.
  const fantasyTicker = fantasyStats
    ? (() => {
      const totalYards = Math.abs(Number(geometry?.gained) || 0);
      const covered = getYardageProgress(geometry, ball.yard);
      const partial = buildPartialPlayStats(fantasyStats, {
        yardsSoFar: totalYards * covered,
        totalYards,
        fired: new Set(fired.map((beat) => beat.kind)),
      });
      return Math.round(calcPoints(partial, fantasyScoring, fantasyPosition) * 10) / 10;
    })()
    : 0;
  const latestPlayer = latest && participants ? lookupPlayerByName(participants, latest.name) : null;

  // Points get a burst where they were scored. It mounts when the score beat
  // fires and is keyed to the play, so it plays once per scoring snap rather
  // than restarting on every animation frame.
  const scoreBeat = fired.find((beat) => beat.kind === 'score') ?? null;

  // The team that ends up with the ball on a turnover, and the colour its half
  // of the play is drawn in.
  const defenseTheme = geometry.defendingTeam === homeTeam ? homeTheme : awayTheme;
  const defenseColor = defenseTheme?.accentColor ?? defenseTheme?.color ?? 'var(--color-accent-red)';
  const toneColor = (tone) => (tone === 'turnover' ? defenseColor
    : tone === 'loss' ? 'var(--color-accent-red)'
    : tone === 'score' ? 'var(--color-signature)'
    : barColor);

  /**
   * A team colour turned into a readable chip: `{ plate, ink }`.
   *
   * The ink is picked against the colour by the same helper the team gradients
   * use. A fixed white fails on the clubs whose accent is a near-white — that
   * swap is deliberate, it keeps their dark palette readable on the app's own
   * dark surfaces — and it put white text on a white chip here.
   *
   * Picking the better of black and white still leaves the mid-tone palettes
   * around 4.4:1, just under the bar for text this small, so the plate is also
   * nudged away from the ink. Worst case across all 32 clubs in both modes goes
   * from 4.46:1 to 5.36:1.
   */
  const chipFor = (color) => {
    if (!/^#[0-9a-f]{6}$/i.test(String(color))) return { plate: color, ink: '#FFF' };
    const ink = pickReadableForeground([color]);
    return { plate: mixHex(color, ink === '#FFFFFF' ? '#0C0F14' : '#FFFFFF', 0.12), ink };
  };

  // The last thing that went wrong for the offense, called out on the field at
  // the spot it happened. It stays up for the rest of the play: a turnover is
  // the fact the play is remembered by, not a moment that passes.
  const alertBeat = [...fired].reverse().find((beat) => beat.alert) ?? null;
  // A kick that missed is marked where it came down. The alert says so in words
  // and the trail says so in red, but the cross is what reads at a glance from
  // across the field — it is the one outcome with no ball left to look at.
  const missBeat = fired.find((beat) => beat.kind === 'miss') ?? null;

  // The down-and-distance graphic a telecast paints onto the turf: a banner
  // sitting behind the line of scrimmage with chevrons pointing the way the
  // offense is going. It is anchored to the snap spot rather than parked in a
  // corner, so it reads as part of the field the ball is crossing.
  //
  // Only downs get one. A kickoff or an extra point has no down and distance to
  // paint, and a broadcast doesn't put the graphic down for them either.
  const drawDir = flipped ? -geometry.dir : geometry.dir;
  const losPct = fieldX(geometry.start, flipped);
  const offense = geometry.offenseTeam ?? play.team ?? null;
  // The flag wears the offense's identity — their gradient and their mark — so
  // possession is readable off the graphic itself rather than only off the
  // header above the field.
  const offenseTheme = offense === homeTeam ? homeTheme : awayTheme;
  // The flag is sized by its own contents, not by a share of the field. Giving
  // it a fixed width in canvas percent made it thirty yards long and left the
  // text floating in the middle of an empty plate; a flag hugs what it says.
  // Only its leading edge is placed — pinned to the line of scrimmage, so the
  // arrowheads sit on the spot and the plate trails back over ground the
  // offense has already covered.
  const banner = Number(play.startDown) > 0 ? { dir: drawDir, losPct } : null;

  const leftTeam = flipped ? homeTeam : awayTeam;
  const rightTeam = flipped ? awayTeam : homeTeam;
  const leftTheme = flipped ? homeTheme : awayTheme;
  const rightTheme = flipped ? awayTheme : homeTheme;

  const progress = total ? Math.min(1, elapsed / total) : 0;

  return (
    <section className="dpb" aria-label="Drive playback">
      <header className="dpb-head">
        <div className="dpb-count">
          <strong>Play {active + 1}</strong>
          <span>of {timelines.length}</span>
        </div>
        <span className="dpb-when">{play.quarter} {play.time}</span>
      </header>

      <div className="dpb-fieldwrap">
        <div className="dpb-field">
          <RedZones />
          <FieldLines />
          <EndZone side="left" team={leftTeam} theme={leftTheme} />
          <EndZone side="right" team={rightTeam} theme={rightTheme} />

          {banner && (
            <div
              className="dpb-banner"
              data-dir={banner.dir > 0 ? 'r' : 'l'}
              style={{
                ...(banner.dir > 0
                  ? { right: `${100 - banner.losPct}%` }
                  : { left: `${banner.losPct}%` }),
                '--c': barColor,
              }}
              aria-hidden="true"
            >
              <span
                className="dpb-banner__plate"
                style={{
                  background: offenseTheme?.gradient ?? barColor,
                  color: offenseTheme?.gradientFullForeground ?? '#FFF',
                }}
              >
                {offense && <img src={teamLogo(offense)} alt="" loading="lazy" />}
                <b>{play.down}</b>
              </span>
              <i className="dpb-banner__chev" />
              <i className="dpb-banner__chev" />
            </div>
          )}

          <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="dpb-svg" aria-hidden="true">
            <line
              x1={viewX(geometry.start, flipped)} y1={4}
              x2={viewX(geometry.start, flipped)} y2={96}
              className="dpb-los" vectorEffect="non-scaling-stroke"
            />
            {geometry.firstDown != null && (
              <line
                x1={viewX(geometry.firstDown, flipped)} y1={4}
                x2={viewX(geometry.firstDown, flipped)} y2={96}
                className="dpb-fd" vectorEffect="non-scaling-stroke"
              />
            )}
            <line x1={0} y1={GROUND_Y} x2={VIEW_W} y2={GROUND_Y} className="dpb-ground" vectorEffect="non-scaling-stroke" />
            {/* Halos first, so no trail is ever drawn over another's outline. */}
            {strokes.map((stroke, position) => (
              <polyline
                key={`halo-${position}`}
                className="dpb-trace-halo"
                points={stroke.points.join(' ')}
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {strokes.map((stroke, position) => (
              <polyline
                key={position}
                className="dpb-trace"
                data-tone={stroke.tone ?? 'offense'}
                points={stroke.points.join(' ')}
                fill="none"
                style={{ stroke: toneColor(stroke.tone) }}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {markers.map((marker, position) => (
            <i
              key={`${marker.name}-${marker.yard}`}
              className="dpb-marker"
              data-role={marker.role ?? 'actor'}
              data-latest={position === markers.length - 1 ? 'true' : 'false'}
              style={{ left: `${x(marker.yard)}%`, '--c': barColor }}
              title={marker.name}
            />
          ))}

          <i
            className="dpb-ball"
            data-air={ball.lift > 0.05 ? 'true' : 'false'}
            style={{
              left: `${x(ball.yard)}%`,
              bottom: `${VIEW_H - viewY(ball.lift)}%`,
              '--c': barColor,
            }}
          />

          {fantasyStats && (
            <span
              className="dpb-fantasy"
              style={{
                left: `${Math.min(92, Math.max(8, x(ball.yard)))}%`,
                bottom: `${VIEW_H - viewY(ball.lift)}%`,
                '--c': barColor,
              }}
            >
              {fantasyTicker >= 0 ? '+' : ''}{fantasyTicker.toFixed(1)}
            </span>
          )}

          {missBeat && (
            <i className="dpb-miss" style={{ left: `${x(missBeat.marker)}%` }} aria-hidden="true" />
          )}

          {alertBeat && (
            <span
              className="dpb-alert"
              data-kind={alertBeat.kind}
              style={(() => {
                // The two token-coloured plates carry their own paired ink; a
                // team colour has to have one picked for it.
                if (alertBeat.kind === 'flag') {
                  return {
                    left: `${Math.min(84, Math.max(16, x(alertBeat.marker)))}%`,
                    '--c': 'var(--color-signature)',
                    '--ink': 'var(--color-signature-fg)',
                  };
                }
                const { plate, ink } = alertBeat.kind === 'turnover'
                  ? chipFor(defenseColor)
                  : { plate: 'var(--color-accent-red)', ink: '#FFF' };
                return {
                  left: `${Math.min(84, Math.max(16, x(alertBeat.marker)))}%`,
                  '--c': plate,
                  '--ink': ink,
                };
              })()}
            >
              {alertBeat.alert}
            </span>
          )}

          {scoreBeat && !reducedMotion && (
            <ScoreBurst
              key={`${active}-burst`}
              left={Math.min(88, Math.max(12, x(scoreBeat.marker)))}
              color={barColor}
            />
          )}

          {latest && (
            // The plate is centred on the actor, so near a goal line half of it
            // would fall outside the field and be clipped away. Held inside the
            // canvas instead, still pointing at the right stretch of field.
            <span className="dpb-nameplate" style={{ left: `${Math.min(86, Math.max(14, x(latest.yard)))}%` }}>
              {latestPlayer && <PlayerAvatar player={latestPlayer} name={latest.name} size={18} />}
              {latest.name}
            </span>
          )}
        </div>
        <YardAxis leftTeam={leftTeam} rightTeam={rightTeam} />
      </div>

      <div className="dpb-controls">
        <button
          type="button" className="dpb-btn" onClick={() => goTo(active - 1)}
          disabled={active === 0} aria-label="Previous play"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          type="button" className="dpb-btn is-primary"
          onClick={() => {
            if (!playing && atLastPlay && elapsed >= total) goTo(0);
            setPlaying((value) => !value);
          }}
          aria-label={playing ? 'Pause' : 'Play drive'}
        >
          <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
        </button>
        <button
          type="button" className="dpb-btn" onClick={() => goTo(active + 1)}
          disabled={atLastPlay} aria-label="Next play"
        >
          <span aria-hidden="true">›</span>
        </button>

        <div className="dpb-progress" aria-hidden="true">
          <i style={{ width: `${progress * 100}%`, background: barColor }} />
        </div>

        <div className="dpb-speed" role="group" aria-label="Playback speed">
          {SPEEDS.map((value) => (
            <button
              key={value} type="button" aria-pressed={speed === value}
              onClick={() => setSpeed(value)}
            >
              {value}×
            </button>
          ))}
        </div>
      </div>

      <div className="dpb-scrub" role="group" aria-label="Jump to a play">
        {timelines.map((entry, position) => (
          <button
            key={entry.play.id ?? position}
            type="button"
            className="dpb-chip"
            data-state={position === active ? 'current' : position < active ? 'past' : 'future'}
            data-kind={entry.timeline.geometry.scoring ? 'score' : entry.timeline.geometry.flag ?? ''}
            aria-current={position === active ? 'true' : undefined}
            aria-label={`Play ${position + 1}: ${entry.play.description}`}
            title={`${entry.play.down} · ${entry.play.description}`}
            // Picking a play is asking to watch it, the same way switching the
            // drive field into playback is. Jumping used to pause, which meant
            // every jump cost a second click to do the obvious thing.
            onClick={() => { goTo(position); setPlaying(true); }}
          >
            {position + 1}
          </button>
        ))}
      </div>

      <ol className="dpb-log" aria-live="polite">
        {fired.map((beat, position) => (
          <li key={`${beat.at}-${position}`} data-kind={beat.kind} data-latest={position === fired.length - 1 ? 'true' : 'false'}>
            {beat.text}
          </li>
        ))}
      </ol>

      {!line.bespoke && (
        <p className="dpb-note">This play type doesn’t have its own animation yet — the ball follows its real path.</p>
      )}
    </section>
  );
}

// Confetti for points. Deterministic rather than random: the angles and
// distances come from the particle's own index, so a burst looks the same every
// time the play is replayed and nothing re-randomises mid-animation.
//
// The particles fly out radially, then fall — the second half of the keyframe
// adds gravity, which is what separates confetti from a starburst.
const BURST_PARTICLES = 20;

function ScoreBurst({ left, color }) {
  return (
    <span className="dpb-burst" style={{ left: `${left}%` }} aria-hidden="true">
      {Array.from({ length: BURST_PARTICLES }, (_, i) => {
        // Offsetting by the index's own remainder breaks up the perfect ring a
        // plain even division would produce.
        const angle = (i / BURST_PARTICLES) * Math.PI * 2 + (i % 3) * 0.22;
        const distance = 32 + (i % 5) * 12;
        return (
          <i
            key={i}
            style={{
              '--dx': `${(Math.cos(angle) * distance).toFixed(1)}px`,
              '--dy': `${(Math.sin(angle) * distance).toFixed(1)}px`,
              '--dur': `${1100 + (i % 4) * 260}ms`,
              '--delay': `${(i % 5) * 45}ms`,
              '--spin': `${i % 2 ? 300 : -260}deg`,
              // The team's colour and the signature yellow, with a light
              // neutral between them so the burst reads on any team palette.
              '--c': i % 3 === 0 ? color : i % 3 === 1 ? 'var(--color-signature)' : 'var(--color-label-quaternary)',
            }}
          />
        );
      })}
    </span>
  );
}

export default DrivePlayback;
