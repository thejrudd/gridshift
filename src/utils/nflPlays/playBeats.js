// playBeats.js — one play as a timeline the drive playback can scrub through.
//
// A play strip draws the finished play all at once. Playback needs the same
// play unrolled in time: where the ball is at any moment, and which sentence is
// true by then. That is the whole job here — take the geometry
// (`getPlayTrajectory`) and the sentence (`parsePlayNarrative`) that already
// exist, and interleave them into segments the ball travels and beats that fire
// as it passes.
//
// Positions stay in the one absolute yardline frame the rest of the field
// graphics use (0 = away goal line, 100 = home goal line). Nothing here knows
// about the canvas or about a flipped quarter; the component owns the drawing.
//
// ── On the catch point ───────────────────────────────────────────────────────
// The feed reports no air yards, no catch spot and no yards after catch. A
// completed pass carries a start yard line, an end yard line, and the phrase
// "short left" / "deep middle" inside the official description — nothing else.
// So the moment the ball is caught can only ever be estimated, and this file is
// careful about what it does with that estimate: the catch is a place the ball
// visibly arrives at, and the catch beat never states a yard line or a yards-
// after-catch figure. Every number spoken in a beat is one the feed actually
// reported. When the description gives no depth at all, the pass collapses to a
// single arc onto the real end spot and no catch beat fires — an invented
// moment is worse than a missing one.

import {
  classifyPlay,
  formatFieldSpot,
  getPlayTrajectory,
  isNonSnapPlay,
  isTurnoverOnDowns,
  possessionTextToPercent,
} from './fieldGeometry.js';
import {
  PLAY_ROLES,
  parseFumble,
  parseInterception,
  parsePenaltyClause,
  parsePlayNarrative,
} from './playNarrative.js';

// Milliseconds at 1x. Travel time grows with distance but sub-linearly, so a
// 60-yard bomb reads as longer than a 3-yard dive without taking twenty times
// as long to watch.
// Playback runs on two clocks, deliberately not the same one.
//
// The ball's travel is the animation. The stationary pauses around it are
// reading time. Scaling both together to slow playback down was the wrong dial:
// it produced a play that darted across the field and then sat frozen for
// several seconds while the log caught up, so you could watch the ball or read
// the sentence but never both, and most of the drive's length was dead air.
//
// Travel is the dominant term instead. It is slow enough that the beats fire
// *during* motion — the sentence lands while the ball is still moving toward
// the spot it describes — and the dead pauses are trimmed back to roughly what
// it takes to read one line.
//
// `MOTION_SCALE` is the dial for how slowly the ball moves; raise it to slow
// the animation without adding dead air. The `DEAD_*` group is time the field
// is frozen and should stay small. The transport's 0.5x/1x/2x multiplies both.
const MOTION_SCALE = 1000;
// Even a one-yard plunge crawls: this is a slow-motion replay, and a beat that
// fires while the ball is still creeping toward the spot is the whole point.
const MIN_TRAVEL_MS = 1900;
const MAX_TRAVEL_MS = 7000;
// The drop back is motion, not a pause: the ball drifts back off the line.
const DROPBACK_MS = 1500;

// Dead time. Every millisecond here is a millisecond nothing moves.
//
// `OUTCOME_MS` is only the beat of stillness that lets the last line land; the
// gap before the next snap belongs to `holdFor` below. Padding both was what
// made the end of every play feel like a stall.
const PRESNAP_MS = 1000;
const SNAP_MS = 1000;
const SETTLE_MS = 400;
const OUTCOME_MS = 900;
// What a beat needs when there is no motion under it. Two beats that describe
// two different moments must never land close enough together to read as one.
const READ_MS = 1400;

/**
 * Travel time for a distance in yards.
 *
 * Square-rooted so a 60-yard bomb reads as longer than a 3-yard dive without
 * taking twenty times as long to watch. `rate` is the per-play-type feel,
 * relative to the 26 the default is written against: higher is slower.
 */
function travelMs(yards, rate = 26) {
  const distance = Math.abs(Number(yards) || 0);
  const natural = Math.sqrt(distance) * MOTION_SCALE * (rate / 26);
  return Math.round(Math.min(MAX_TRAVEL_MS, Math.max(MIN_TRAVEL_MS, natural)));
}

// The drawable canvas is 120 yards, not 100: it carries both end zones, and a
// score has to be able to travel past the goal line into one of them.
const clampYard = (yard) => Math.min(110, Math.max(-10, yard));

// How far past the goal line a score is carried.
const END_ZONE_DEPTH = 5;

/**
 * What the ball's trail is drawn in.
 *
 * `TONE.turnover` is the important one: after a change of possession the trail
 * takes the other team's colour, so an interception reads as the ball changing
 * hands rather than as the same offense running backwards. The drive field above
 * already draws possession this way; playback was the odd one out.
 */
export const TONE = Object.freeze({
  loss: 'loss',
  turnover: 'turnover',
  kick: 'kick',
  score: 'score',
});

/**
 * Where a scoring play actually finishes.
 *
 * `end` is the goal line, because that is where the field of play stops and the
 * geometry stops with it. A touchdown is caught or carried past it, and a ball
 * that halts exactly on the line reads as though it were stopped short — the
 * score gets announced by the text while the picture shows the ball at the
 * boundary. Everything that scores finishes inside the end zone instead.
 */
function finishYard(end, dir, scoring) {
  if (!scoring) return end;
  // A turnover return scores in the opposite direction from the offense that
  // snapped the ball. Its geometry therefore retains the original offense's
  // `dir` while `end` sits on the other goal line. The boundary is the
  // authority for which end zone the scorer entered.
  if (end <= 0) return -END_ZONE_DEPTH;
  if (end >= 100) return 100 + END_ZONE_DEPTH;
  return clampYard(end + END_ZONE_DEPTH * dir);
}

/**
 * A timeline under construction.
 *
 * `move` appends a stretch of ball travel; `beat` marks a moment on the clock
 * as it stands. Because both write to the same running total, a beat always
 * fires exactly where it was declared relative to the motion around it.
 */
function timeline(startYard) {
  const segments = [];
  const beats = [];
  // `tone` is what the ball's trail is drawn in from this point on: whose play
  // it is now, and whether it is going the wrong way. It rides with the position
  // so the trail changes hands exactly where the ball does.
  const state = { ms: 0, yard: startYard, lift: 0, tone: null };

  return {
    get ms() { return state.ms; },
    get yard() { return state.yard; },

    /** Fire a beat at the current instant. */
    beat(text, { role = null, name = null, marker = null, kind = 'info', alert = null } = {}) {
      if (!text) return;
      // `alert` is the word that gets shouted on the field at this spot. Only
      // the moments that change who has the ball, or cost the offense ground,
      // carry one.
      beats.push({ at: state.ms, text, role, name, kind, alert, marker: marker ?? state.yard });
    },

    /**
     * Travel to a yardline. `apex` lifts the ball off the ground at the midpoint
     * (a pass or a kick); `lift` is where it ends up, which is above the ground
     * only for a kick that leaves the field of play.
     */
    move(toYard, ms, { apex = 0, lift = 0, tone = state.tone } = {}) {
      const from = { yard: state.yard, lift: state.lift };
      const to = { yard: clampYard(toYard), lift };
      segments.push({ start: state.ms, ms: Math.max(1, Math.round(ms)), from, to, apex, tone });
      state.ms += Math.max(1, Math.round(ms));
      state.yard = to.yard;
      state.lift = lift;
      state.tone = tone;
    },

    /** Hold the ball still — a beat needs a moment to be read. */
    wait(ms) {
      const from = { yard: state.yard, lift: state.lift };
      segments.push({ start: state.ms, ms: Math.max(1, Math.round(ms)), from, to: { ...from }, apex: 0, tone: state.tone });
      state.ms += Math.max(1, Math.round(ms));
    },

    build(extra) {
      return { segments, beats, duration: state.ms, ...extra };
    },
  };
}

/** Ball position at `ms` into a timeline: `{ yard, lift, tone }`. */
export function ballAt(segments, ms) {
  if (!segments.length) return { yard: 0, lift: 0, tone: null };
  const clock = Math.max(0, ms);
  for (const segment of segments) {
    if (clock >= segment.start + segment.ms) continue;
    const u = Math.min(1, Math.max(0, (clock - segment.start) / segment.ms));
    return {
      yard: segment.from.yard + (segment.to.yard - segment.from.yard) * u,
      lift: segment.from.lift + (segment.to.lift - segment.from.lift) * u + segment.apex * Math.sin(Math.PI * u),
      tone: segment.tone ?? null,
    };
  }
  const last = segments[segments.length - 1];
  return { yard: last.to.yard, lift: last.to.lift, tone: last.tone ?? null };
}

/** Every beat that has fired by `ms`, oldest first. */
export function beatsThrough(beats, ms) {
  return beats.filter((beat) => beat.at <= ms);
}

/**
 * The football instant at which a touchdown becomes true in playback.
 *
 * A runner scores at the goal-line plane. A completed pass must also have been
 * caught, so a throw that crosses the plane in flight waits for the catch while
 * a catch short of the end zone waits for the receiver to cross it. The later
 * narrative beat can still provide reading time after the ball carries through
 * the end zone; it no longer owns the scoring instant.
 */
export function getTouchdownMoment(playTimeline) {
  const geometry = playTimeline?.geometry;
  if (!geometry?.scoring || geometry.flag === 'fg') return null;

  const segments = playTimeline.segments ?? [];
  const finish = Number(segments.at(-1)?.to?.yard);
  const geometryEnd = Number(geometry.end);
  const goalLine = finish < 0 || geometryEnd <= 0
    ? 0
    : finish > 100 || geometryEnd >= 100
      ? 100
      : null;
  if (goalLine == null) return null;

  let crossingAt = null;
  for (const segment of segments) {
    const from = Number(segment?.from?.yard);
    const to = Number(segment?.to?.yard);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) continue;
    const reachesPlane = Math.min(from, to) <= goalLine && Math.max(from, to) >= goalLine;
    if (!reachesPlane) continue;
    const progress = (goalLine - from) / (to - from);
    crossingAt = segment.start + segment.ms * Math.min(1, Math.max(0, progress));
    break;
  }
  if (!Number.isFinite(crossingAt)) return null;
  // An ordinary passing touchdown cannot score until it is caught. A pick-six
  // has already changed hands at its turnover beat and needs no catch gate.
  if (geometry.type === 'pass' && geometry.flag === 'td') {
    const catchAt = playTimeline.beats?.find((beat) => beat.kind === 'catch')?.at;
    return Number.isFinite(catchAt) ? Math.max(crossingAt, catchAt) : null;
  }
  return crossingAt;
}

/**
 * Beats visible at one playback instant, with a touchdown's later narrative
 * beat promoted to the football scoring moment. The same beat replaces the
 * original once it fires, preventing a duplicate touchdown line or burst.
 */
export function getDisplayedPlaybackBeats(playTimeline, elapsed) {
  const fired = beatsThrough(playTimeline?.beats ?? [], elapsed);
  const touchdownAt = getTouchdownMoment(playTimeline);
  const scoreBeat = playTimeline?.beats?.find((beat) => beat.kind === 'score') ?? null;
  if (touchdownAt == null || elapsed < touchdownAt || !scoreBeat) return fired;

  const promotedScore = {
    ...scoreBeat,
    at: touchdownAt,
    marker: ballAt(playTimeline.segments ?? [], touchdownAt).yard,
  };
  return fired.some((beat) => beat.kind === 'score')
    ? fired.map((beat) => (beat.kind === 'score' ? promotedScore : beat))
    : [...fired, promotedScore];
}

/**
 * How far the ball travelled in the air before it was caught, or null.
 *
 * Derived from the only depth signal the feed carries — the "short"/"deep"
 * qualifier in the official description. It is an estimate and is treated as
 * one: it positions the catch on the field and nothing more. Null means the
 * description said nothing about depth, and the caller must draw one arc onto
 * the real end spot rather than invent a catch.
 */
export function estimateAirYards(direction, gained) {
  const depth = String(direction ?? '').toLowerCase();
  const gain = Number(gained);
  if (!Number.isFinite(gain) || gain <= 0) return null;
  if (/\bdeep\b/.test(depth)) return Math.min(gain, Math.max(15, Math.round(gain * 0.7)));
  if (/\bshort\b/.test(depth)) return Math.min(gain, 7);
  return null;
}

function actorsBy(narrative) {
  const find = (role) => narrative.actors?.find((actor) => actor.role === role) ?? null;
  return {
    passer: find(PLAY_ROLES.PASSER),
    receiver: find(PLAY_ROLES.RECEIVER),
    rusher: find(PLAY_ROLES.RUSHER),
    kicker: find(PLAY_ROLES.KICKER),
    punter: find(PLAY_ROLES.PUNTER),
    returner: find(PLAY_ROLES.RETURNER),
    sacker: find(PLAY_ROLES.SACKER),
    intercepter: find(PLAY_ROLES.INTERCEPTER),
    tacklers: narrative.actors?.filter((actor) => actor.role === PLAY_ROLES.TACKLER) ?? [],
  };
}

function joinNames(names) {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function yardPhrase(yards) {
  const magnitude = Math.abs(Math.round(yards));
  return `${magnitude} yard${magnitude === 1 ? '' : 's'}`;
}

function officialKickActor(play) {
  const text = String(play?.rawText ?? play?.description ?? '');
  return /\b([A-Z][A-Za-z.'’-]*\.[A-Za-z.'’-]+)\s+(?:kicks?|punts?)\b/i.exec(text)?.[1] ?? null;
}

/**
 * The closing beat of a play that ended with the ball in someone's hands.
 *
 * Every number here is reported: `gained` is the play's real yardage and the
 * spot is the real end spot. Nothing derived from the estimated catch point
 * reaches this sentence.
 */
function endingBeat(track, { scoring, flag, gained, tacklers, spot, carrier, scoreText, role = PLAY_ROLES.RECEIVER }) {
  if (scoring || flag === 'td') {
    // The parsed sentence says how the score happened ("ran it in from 4 yards
    // out") where a bare "Touchdown." only says that it did.
    track.beat(scoreText ?? 'Touchdown.', { kind: 'score', role, name: carrier });
    return;
  }
  const distance = gained == null ? null : `${gained < 0 ? 'a loss of ' : ''}${yardPhrase(gained)}`;
  const where = spot ? ` at the ${spot}` : '';
  if (tacklers.length) {
    track.beat(
      `Tackled by ${joinNames(tacklers)}${where}${distance ? ` — ${distance}.` : '.'}`,
      { kind: 'stop', role: PLAY_ROLES.TACKLER, name: tacklers[0] },
    );
    return;
  }
  track.beat(`Down${where}${distance ? ` — ${distance}.` : '.'}`, { kind: 'stop' });
}

/**
 * The beat that says a fourth down came up short, when it did.
 *
 * The provider has no slug for it — the play stays a rush or an incompletion —
 * so without this the drive's last snap animates as an ordinary tackle and the
 * possession changing hands is never said out loud.
 */
function downsBeat(track, play) {
  if (!isTurnoverOnDowns(play)) return;
  track.wait(READ_MS);
  track.beat('Turned over on downs.', { kind: 'turnover', alert: 'Turnover on downs' });
}

const DEPTH_PHRASE = /\b(short|deep)\s+(left|middle|right)\b/;

function passDepth(receiver) {
  return DEPTH_PHRASE.exec(String(receiver?.detail ?? ''))?.[0] ?? null;
}

/**
 * `{ segments, beats, duration, hold, bespoke }` for one play, or null when the
 * play has no trustworthy geometry to animate.
 *
 * `resolveName` maps a name as the feed wrote it to the name to show — the
 * official description abbreviates tacklers to "K.Murray", and the caller has
 * the participant index that can expand them.
 */
export function getPlayTimeline(play, { homeTeam, awayTeam, resolveName = (name) => name } = {}) {
  if (!play || isNonSnapPlay(play)) return null;

  const geometry = getPlayTrajectory(play, { homeTeam, awayTeam });
  if (!geometry.drawable) return null;

  const narrative = parsePlayNarrative(play);
  const who = actorsBy(narrative);
  const named = (actor) => (actor ? resolveName(actor.name, actor.role) : null);
  const tacklerNames = who.tacklers.map((actor) => resolveName(actor.name, actor.role));
  const spotOf = (yard) => formatFieldSpot(yard, { homeTeam, awayTeam });

  const { type, flag } = classifyPlay(play);
  const { start, end, dir, dist, scoring, yards } = geometry;
  const track = timeline(start);
  const rawText = String(play.rawText ?? play.description ?? '');
  const kickPenalty = type === 'kick' ? parsePenaltyClause(rawText) : null;
  const placedKickPenalty = kickPenalty?.enforcedAt && /\bplaced at\b/i.test(rawText)
    ? kickPenalty
    : null;

  // Anything the first pass doesn't choreograph — turnovers, penalties,
  // anything the narrative parser wasn't confident about — still animates and
  // still speaks its full sentence. It travels its real path with no bespoke
  // staging, which is honest about the play without dropping it from the drive.
  const generic = () => {
    track.beat(`${play.down} at the ${spotOf(start)}`, { kind: 'setup' });
    track.wait(PRESNAP_MS);
    const genericEnd = finishYard(end, dir, geometry.scoring);
    track.move(genericEnd, travelMs(genericEnd - start));
    track.beat(narrative.confident ? narrative.sentence : play.description, { kind: scoring ? 'score' : 'stop' });
    track.wait(OUTCOME_MS);
    return track.build({ geometry, narrative, bespoke: false, hold: holdFor(geometry, play) });
  };

  const bespokePass = type === 'pass' && (flag == null || flag === 'td');
  const bespokeKick = type === 'kick'
    && (flag !== 'penalty' || placedKickPenalty)
    && (narrative.confident || placedKickPenalty);

  if (!narrative.confident && !bespokeKick) return generic();

  if (bespokePass) {
    track.beat(`${play.down} at the ${spotOf(start)}`, { kind: 'setup' });
    track.wait(PRESNAP_MS);
    track.beat(`${named(who.passer)} drops back.`, { role: PLAY_ROLES.PASSER, name: named(who.passer) });
    // Drifting back off the line is what makes the throw read as a throw: the
    // ball has to visibly leave a pocket rather than start moving downfield.
    track.move(start - 3 * dir, DROPBACK_MS);

    const depth = passDepth(who.receiver);
    const air = estimateAirYards(depth, yards);
    const endYard = finishYard(end, dir, scoring);
    const airYard = air == null ? null : start + air * dir;
    // A ball thrown into the end zone is caught in the end zone. The estimate
    // measures from the snap and knows nothing about the goal line, so on a
    // touchdown it can land exactly on it — which draws the catch at the
    // boundary and leaves the end zone empty behind it.
    const caughtInEndZone = airYard != null && scoring
      && (dir > 0 ? airYard >= end : airYard <= end);
    const catchYard = airYard == null || caughtInEndZone ? endYard : clampYard(airYard);

    track.beat(
      `${named(who.passer)} throws${depth ? ` ${depth}` : ''}${who.receiver ? ` for ${named(who.receiver)}` : ''}.`,
      { kind: 'release', role: PLAY_ROLES.PASSER, name: named(who.passer) },
    );
    track.move(catchYard, travelMs(catchYard - track.yard, 22), { apex: 0.9 });

    // The catch beat names the receiver and nothing else. The yard line it
    // happened at is an estimate, so it is never spoken.
    if (who.receiver) {
      track.beat(`Caught by ${named(who.receiver)}.`, { kind: 'catch', role: PLAY_ROLES.RECEIVER, name: named(who.receiver) });
      // How much ground the receiver covered after the catch. Zero whenever the
      // depth couldn't be estimated, and zero again when the estimate lands on
      // the spot the play ended — a ball caught at the sticks and tackled
      // immediately.
      const afterCatch = air == null ? 0 : Math.abs(endYard - catchYard);
      if (afterCatch > 0.5) {
        track.wait(SETTLE_MS);
        track.move(endYard, travelMs(endYard - catchYard, 20));
      } else {
        // Nothing moves between the catch and the whistle, so the pause is the
        // only thing separating the two beats. A settle-length gap here put the
        // catch and the tackle on screen together.
        track.wait(READ_MS);
      }
    }

    endingBeat(track, {
      scoring, flag, gained: yards, tacklers: tacklerNames, scoreText: narrative.sentence,
      spot: spotOf(end), carrier: named(who.receiver),
    });
    downsBeat(track, play);
    track.wait(OUTCOME_MS);
    return track.build({ geometry, narrative, bespoke: true, hold: holdFor(geometry, play) });
  }

  if (type === 'pass' && flag === 'incomplete') {
    track.beat(`${play.down} at the ${spotOf(start)}`, { kind: 'setup' });
    track.wait(PRESNAP_MS);
    track.beat(`${named(who.passer)} drops back.`, { role: PLAY_ROLES.PASSER, name: named(who.passer) });
    track.move(start - 3 * dir, DROPBACK_MS);
    // No end spot exists on an incompletion — the ball came back to the line of
    // scrimmage. The target is where the strip already throws it: the sticks,
    // or a default when the down and distance aren't reported.
    const target = clampYard(start + Math.max(6, dist || 8) * dir);
    const depth = passDepth(who.receiver);
    track.beat(
      `${named(who.passer)} throws${depth ? ` ${depth}` : ''}${who.receiver ? ` for ${named(who.receiver)}` : ''}.`,
      { kind: 'release', role: PLAY_ROLES.PASSER, name: named(who.passer) },
    );
    track.move(target, travelMs(target - track.yard, 22), { apex: 0.85 });
    track.beat(who.receiver ? `Incomplete, intended for ${named(who.receiver)}.` : 'Incomplete.', { kind: 'incomplete' });
    downsBeat(track, play);
    track.wait(OUTCOME_MS);
    return track.build({ geometry, narrative, bespoke: true, hold: holdFor(geometry, play) });
  }

  if (flag === 'sack') {
    track.beat(`${play.down} at the ${spotOf(start)}`, { kind: 'setup' });
    track.wait(PRESNAP_MS);
    track.beat(`${named(who.passer)} drops back.`, { role: PLAY_ROLES.PASSER, name: named(who.passer) });
    track.move(start - 2 * dir, DROPBACK_MS);
    track.beat(`${named(who.sacker)} breaks through.`, { kind: 'pressure', role: PLAY_ROLES.SACKER, name: named(who.sacker) });
    track.move(end, travelMs(end - track.yard, 30), { tone: TONE.loss });
    track.beat(
      `Sacked for a loss of ${yardPhrase(yards ?? 0)} at the ${spotOf(end)}.`,
      { kind: 'stop', role: PLAY_ROLES.SACKER, name: named(who.sacker), alert: 'Sack' },
    );
    downsBeat(track, play);
    track.wait(OUTCOME_MS);
    return track.build({ geometry, narrative, bespoke: true, hold: holdFor(geometry, play) });
  }

  if (bespokeKick && geometry.kick) {
    const { kick } = geometry;
    const isKickoff = /kickoff/.test(String(play.typeSlug ?? '').toLowerCase());
    const fallbackKicker = officialKickActor(play);
    const kicker = named(who.kicker) ?? named(who.punter)
      ?? (fallbackKicker ? resolveName(fallbackKicker, isKickoff ? PLAY_ROLES.KICKER : PLAY_ROLES.PUNTER) : null)
      ?? (isKickoff ? 'The kicker' : 'The punter');
    track.beat(`${play.down} at the ${spotOf(start)}`, { kind: 'setup' });
    track.wait(SNAP_MS);

    if (flag === 'fg') {
      track.beat(`${kicker} lines up the kick.`, { kind: 'info', role: PLAY_ROLES.KICKER, name: kicker });
      // A make and a miss used to differ only in how high the ball was at the
      // very end of the flight, which is the last thing anybody looks at — the
      // two came out looking the same. They now differ for the whole flight: a
      // make climbs away in the signature gold, a miss falls to the turf in
      // red and is marked where it came down.
      track.move(kick.land, travelMs(kick.kickYards, 20), {
        apex: scoring ? 1.1 : 0.75,
        lift: scoring ? 1.5 : 0,
        tone: scoring ? TONE.score : TONE.loss,
      });
      // The parsed sentence already carries the distance and, on a miss, which
      // way it went — both of which are reported, not inferred.
      track.beat(
        narrative.sentence ?? (scoring ? "It's good." : 'No good.'),
        {
          kind: scoring ? 'score' : 'miss',
          role: PLAY_ROLES.KICKER,
          name: kicker,
          alert: scoring ? null : 'No good',
        },
      );
      track.wait(OUTCOME_MS);
      return track.build({ geometry, narrative, bespoke: true, hold: holdFor(geometry, play) });
    }

    track.beat(
      `${kicker} ${isKickoff ? 'kicks off' : 'punts'} ${yardPhrase(kick.kickYards)}.`,
      { kind: 'release', role: isKickoff ? PLAY_ROLES.KICKER : PLAY_ROLES.PUNTER, name: kicker },
    );
    // A punt and a kickoff hang. At a pass's apex they came out as deep throws,
    // which is the one shape they must not share — the ball going up this much
    // higher, on a dashed trail, is what says the offense gave it away on
    // purpose.
    track.move(kick.land, travelMs(kick.kickYards, 18), { apex: 1.9, tone: TONE.kick });

    if (kick.returnYards > 0 && who.returner) {
      track.beat(`Fielded by ${named(who.returner)}.`, { kind: 'catch', role: PLAY_ROLES.RETURNER, name: named(who.returner) });
      track.wait(SETTLE_MS);
      const returnEnd = finishYard(kick.finish, -kick.dir, scoring);
      track.move(returnEnd, travelMs(returnEnd - kick.land, 22), { tone: TONE.turnover });
      endingBeat(track, {
        scoring, flag: null, gained: kick.returnYards, tacklers: tacklerNames,
        spot: spotOf(kick.finish), carrier: named(who.returner),
        scoreText: narrative.sentence, role: PLAY_ROLES.RETURNER,
      });
    } else if (placedKickPenalty) {
      track.beat(`The kick lands at the ${spotOf(kick.land)}, short of the landing zone.`, { kind: 'stop' });
    } else {
      track.beat(narrative.sentence ?? 'The kick is down.', { kind: 'stop' });
    }

    if (placedKickPenalty) {
      const placement = possessionTextToPercent(placedKickPenalty.enforcedAt, { homeTeam });
      const offender = placedKickPenalty.name
        ? resolveName(placedKickPenalty.name, PLAY_ROLES.PENALIZED)
        : null;
      track.wait(SETTLE_MS);
      track.beat('Flag on the kickoff.', { kind: 'flag', marker: kick.land });
      track.wait(READ_MS);
      track.beat(
        `${placedKickPenalty.infraction} on ${placedKickPenalty.team}${offender ? `, ${offender}` : ''}.`,
        {
          kind: 'flag', role: PLAY_ROLES.PENALIZED, name: offender,
          alert: 'Penalty', marker: kick.land,
        },
      );
      if (placement != null && Math.abs(placement - track.yard) > 0.5) {
        track.move(placement, travelMs(placement - track.yard, 40));
      } else {
        track.wait(READ_MS);
      }
      track.beat(`Ball placed at the ${spotOf(placement ?? track.yard)}.`, { kind: 'stop' });
    }
    track.wait(OUTCOME_MS);
    return track.build({ geometry, narrative, bespoke: true, hold: holdFor(geometry, play) });
  }

  if (type === 'rush' && (flag == null || flag === 'td')) {
    const carrier = named(who.rusher);
    // The direction phrase arrives in two grammars: a bare gap ("left tackle")
    // that needs a verb in front of it, and a scramble ("scrambles right end")
    // that already carries its own. Treating them alike read "takes it
    // scrambles right end".
    const lane = String(who.rusher?.detail ?? '');
    const carry = /^scrambles\b/.test(lane) ? `${carrier} ${lane}.`
      : lane ? `${carrier} takes it ${lane}.`
      : `${carrier} takes the handoff.`;
    track.beat(`${play.down} at the ${spotOf(start)}`, { kind: 'setup' });
    track.wait(SNAP_MS);
    track.beat(carry, { kind: 'release', role: PLAY_ROLES.RUSHER, name: carrier });
    const rushEnd = finishYard(end, dir, scoring);
    track.move(rushEnd, travelMs(rushEnd - start, 30), { tone: (yards ?? 0) < 0 ? TONE.loss : null });
    endingBeat(track, {
      scoring, flag, gained: yards, tacklers: tacklerNames, spot: spotOf(end), carrier,
      scoreText: narrative.sentence, role: PLAY_ROLES.RUSHER,
    });
    downsBeat(track, play);
    track.wait(OUTCOME_MS);
    return track.build({ geometry, narrative, bespoke: true, hold: holdFor(geometry, play) });
  }

  // ── Interception ──────────────────────────────────────────────────────────
  // The one play that reverses direction mid-flight. Drawn as one thing it is
  // just a long gain with the wrong colour; the whole point is the turn, so the
  // throw, the moment it is picked off, and the return the other way are three
  // separate movements around a spot only the description reports.
  if (flag === 'int') {
    const officialPick = parseInterception(play.rawText ?? play.description);
    const officialAt = officialPick && possessionTextToPercent(officialPick.at, { homeTeam });
    // Some scoring plays contain only the scoreboard summary. It still gives
    // us the defender, return distance, authoritative endpoint, and original
    // line of scrimmage. The interception spot is therefore exact: walk the
    // reported return distance back from its endpoint in the original
    // offense's direction. For the HOU pick-six from the LV-facing goal line,
    // 0 + 80 yards = HOU 20 (absolute yard 80).
    const summaryReturnYards = Number(narrative.yards);
    const summaryAt = Number.isFinite(summaryReturnYards)
      ? clampYard(end + summaryReturnYards * dir)
      : null;
    const summaryDefender = named(who.intercepter);
    const hasSummaryPick = !officialPick && summaryDefender && summaryAt != null;
    const pick = officialPick ?? (hasSummaryPick ? {
      passer: play.inferredPasserName ?? null,
      intendedFor: null,
      depth: null,
      defender: summaryDefender,
      at: null,
      returnTo: null,
      returnYards: summaryReturnYards,
    } : null);
    const at = officialAt ?? summaryAt;
    if (pick && at != null) {
      // A forward pass is thrown forward. The feed sometimes reports the ball
      // picked off behind the line of scrimmage — a tipped ball, or simply where
      // the defender was credited with it — and drawing the throw to that spot
      // sends it the way the offense came from, which reads as the whole play
      // running backwards. Only the return may reverse direction.
      //
      // When the reported spot is behind the line, the ball is thrown to an
      // estimated target instead and the spot stops being spoken: the same rule
      // the catch point follows, for the same reason. The return still finishes
      // where the feed says it did, so field position stays true.
      const downfield = (at - start) * dir >= 0;
      // The description states the depth of the throw, so the estimate uses it
      // rather than the sticks — on 2nd and 20 the sticks would send a ball the
      // feed called "short right" twenty yards downfield.
      const depthGuess = /\bdeep\b/.test(pick.depth ?? '') ? 18
        : /\bshort\b/.test(pick.depth ?? '') ? 7
        : Math.max(6, Math.min(dist || 8, 15));
      const caughtAt = downfield ? at : clampYard(start + depthGuess * dir);
      const defender = named(who.intercepter) ?? resolveName(pick.defender, PLAY_ROLES.INTERCEPTER);
      const passer = pick.passer ? resolveName(pick.passer, PLAY_ROLES.PASSER) : null;
      const passerText = passer ?? 'The quarterback';
      const target = pick.intendedFor ? resolveName(pick.intendedFor, PLAY_ROLES.RECEIVER) : null;
      const back = possessionTextToPercent(pick.returnTo, { homeTeam }) ?? end;

      track.beat(`${play.down} at the ${spotOf(start)}`, { kind: 'setup' });
      track.wait(PRESNAP_MS);
      track.beat(`${passerText} drops back.`, { role: PLAY_ROLES.PASSER, name: passer });
      track.move(start - 3 * dir, DROPBACK_MS);
      track.beat(
        `${passerText} throws${pick.depth ? ` ${pick.depth}` : ''}${target ? ` for ${target}` : ''}.`,
        { kind: 'release', role: PLAY_ROLES.PASSER, name: passer },
      );
      track.move(caughtAt, travelMs(caughtAt - track.yard, 22), { apex: 0.9 });
      track.beat(
        downfield ? `Intercepted by ${defender} at the ${spotOf(at)}.` : `Intercepted by ${defender}.`,
        { kind: 'turnover', role: PLAY_ROLES.INTERCEPTER, name: defender, alert: 'Intercepted' },
      );
      track.wait(SETTLE_MS);
      const returnEnd = finishYard(back, -dir, scoring);
      if (Math.abs(returnEnd - caughtAt) > 0.5) {
        track.move(returnEnd, travelMs(returnEnd - caughtAt, 24), { tone: TONE.turnover });
      }
      endingBeat(track, {
        scoring, flag: null, gained: pick.returnYards, tacklers: tacklerNames,
        spot: spotOf(back), carrier: defender, scoreText: narrative.sentence,
        role: PLAY_ROLES.INTERCEPTER,
      });
      track.wait(OUTCOME_MS);
      return track.build({ geometry, narrative, bespoke: true, hold: holdFor(geometry, play) });
    }
  }

  // ── Fumble the defense recovered ──────────────────────────────────────────
  // Three moments the generic path collapses into one: the carrier going down,
  // the ball coming loose where he was hit, and somebody else carrying it back.
  if (flag === 'fumble') {
    const lost = parseFumble(play.rawText ?? play.description);
    const at = lost && possessionTextToPercent(lost.at, { homeTeam });
    if (lost && at != null) {
      const carrier = resolveName(lost.fumbledBy, PLAY_ROLES.FUMBLER);
      const forcer = lost.forcedBy ? resolveName(lost.forcedBy, PLAY_ROLES.TACKLER) : null;
      const recoverer = resolveName(lost.recoveredBy, PLAY_ROLES.RECOVERER);
      const back = possessionTextToPercent(lost.returnTo, { homeTeam }) ?? end;

      track.beat(`${play.down} at the ${spotOf(start)}`, { kind: 'setup' });
      track.wait(SNAP_MS);
      track.beat(`${carrier} carries to the ${spotOf(at)}.`, { kind: 'release', role: PLAY_ROLES.RUSHER, name: carrier });
      track.move(at, travelMs(at - start, 30));
      // The ball pops loose: a short hop, which is the only moment in playback
      // where the ball leaves the ground without anyone having thrown it.
      track.beat(
        forcer ? `Fumbled, forced by ${forcer}.` : `${carrier} fumbled.`,
        { kind: 'turnover', role: PLAY_ROLES.FUMBLER, name: carrier, alert: 'Fumble' },
      );
      // Long enough to read the ball coming loose before it is claimed — the
      // bounce is the moment the play turns over, not a transition between two
      // other moments.
      track.move(at, READ_MS, { apex: 0.35 });
      track.beat(`Recovered by ${recoverer} at the ${spotOf(at)}.`, {
        kind: 'turnover', role: PLAY_ROLES.RECOVERER, name: recoverer, alert: 'Recovered',
      });
      track.wait(SETTLE_MS);
      const returnEnd = finishYard(back, -dir, scoring);
      if (Math.abs(returnEnd - at) > 0.5) track.move(returnEnd, travelMs(returnEnd - at, 24), { tone: TONE.turnover });
      endingBeat(track, {
        scoring, flag: null, gained: lost.returnYards, tacklers: tacklerNames,
        spot: spotOf(back), carrier: recoverer, scoreText: narrative.sentence,
        role: PLAY_ROLES.RECOVERER,
      });
      track.wait(OUTCOME_MS);
      return track.build({ geometry, narrative, bespoke: true, hold: holdFor(geometry, play) });
    }
  }

  // ── Penalty ───────────────────────────────────────────────────────────────
  // A flag has no action to trace, so the movement is the walk-off itself: the
  // ball goes back to the spot the foul was enforced at and is marched from
  // there. On a play that was wiped out entirely that is the only movement, and
  // drawing the down that never counted would say the opposite of what happened.
  if (type === 'penalty' || flag === 'penalty') {
    const penalty = parsePenaltyClause(play.rawText ?? play.description);
    const spot = penalty && possessionTextToPercent(penalty.enforcedAt, { homeTeam });
    if (penalty && !penalty.declined) {
      const from = spot ?? start;
      const offender = penalty.name ? resolveName(penalty.name, PLAY_ROLES.PENALIZED) : null;

      track.beat(`${play.down} at the ${spotOf(start)}`, { kind: 'setup' });
      track.wait(PRESNAP_MS);
      track.beat('Flag on the play.', { kind: 'flag' });
      track.wait(READ_MS);
      track.beat(
        `${penalty.infraction} on ${penalty.team}${offender ? `, ${offender}` : ''} — ${yardPhrase(penalty.yards)}.`,
        { kind: 'flag', role: PLAY_ROLES.PENALIZED, name: offender, alert: 'Penalty' },
      );
      // Marched off deliberately rather than travelled: nobody ran this.
      if (Math.abs(end - from) > 0.5) {
        if (Math.abs(from - track.yard) > 0.5) track.move(from, travelMs(from - track.yard, 34));
        track.move(end, travelMs(end - from, 40));
      } else {
        // A flag that costs no ground — a spot foul at the one, a penalty that
        // only changes the down — has nothing to march off, so the pause is the
        // only thing left between the call and its result.
        track.wait(READ_MS);
      }
      track.beat(
        penalty.noPlay
          ? `No play. ${play.endDownDistanceText ?? `Repeat ${play.down}`}.`
          : `${play.endDownDistanceText ?? 'Penalty enforced'}.`,
        { kind: 'stop' },
      );
      track.wait(OUTCOME_MS);
      return track.build({ geometry, narrative, bespoke: true, hold: holdFor(geometry, play) });
    }
  }

  return generic();
}

/**
 * Extra time to sit on a play once it has finished.
 *
 * A score, a turnover or a converted third down is the reason the drive is
 * worth watching, so playback holds on it rather than rolling straight into the
 * next snap.
 */
function holdFor(geometry, play) {
  // The gap between plays, on top of the pause the play already ends with. A
  // score keeps the longest one because the confetti needs room to land.
  if (geometry.scoring || geometry.flag === 'td') return 2600;
  if (geometry.flag === 'int' || geometry.flag === 'fumble') return 1700;
  if (gainedFirstDown(play, geometry)) return 800;
  return 600;
}

/** Did the play move the chains? Mirrors the tag rule the play cards use. */
export function gainedFirstDown(play, geometry) {
  const startDown = Number(play?.startDown);
  const distance = Number(play?.startDistance);
  if (geometry.flag || !Number.isFinite(startDown) || startDown < 1) return false;
  if (Number(play?.endDown) !== 1) return false;
  return Number.isFinite(distance) && geometry.yards != null && geometry.yards >= distance;
}

/**
 * The whole drive as an ordered list of timelines, skipping the plays that
 * can't be trusted to draw. Returns `[]` when nothing in the drive is playable.
 */
export function getDriveTimelines(plays = [], context = {}) {
  return plays
    .map((play) => ({ play, timeline: getPlayTimeline(play, context) }))
    .filter(({ timeline: line }) => line != null);
}
