// fieldGeometry.js — turns a play's field position into coordinates a field
// graphic can draw.
//
// BALLDONTLIE reports position as `yards_to_endzone`, measured from whichever
// team has the ball. That flips frame every time possession changes, so it has
// to be converted to one absolute frame before anything can be plotted.
//
// The frame here is a percentage across the field with the away team's own
// endzone at 0 and the home team's own endzone at 100. The away team therefore
// always drives left to right and the home team right to left, which is how
// broadcast field graphics are read.

/** Absolute field percentage, or null when the play doesn't report position. */
export function toFieldPercent(yardsToEndzone, { possessionTeam, homeTeam } = {}) {
  if (yardsToEndzone == null || !Number.isFinite(Number(yardsToEndzone))) return null;
  if (!possessionTeam || !homeTeam) return null;
  const yards = clamp(Number(yardsToEndzone), 0, 100);
  return possessionTeam === homeTeam ? yards : 100 - yards;
}

/**
 * Teams the play-by-play text spells differently from the team feed.
 *
 * The official NFL description uses the league's own gamebook abbreviations,
 * which disagree with the ones the team records carry for a handful of clubs —
 * a Cleveland game reports `CLE` on the team but writes "CLV 10" in the
 * description. Comparing the two directly reads the spot as the *other* team's
 * end of the field, which mirrors it: a punt to the Cleveland 10 was drawn
 * landing at the Cincinnati 10, at the opposite end of the field.
 *
 * Both sides are folded to one canonical form so the comparison works whichever
 * spelling each source happens to use.
 */
const TEAM_ALIASES = new Map([
  ['ARZ', 'ARI'], ['BLT', 'BAL'], ['CLV', 'CLE'], ['HST', 'HOU'], ['WSH', 'WAS'],
  ['JAC', 'JAX'], ['LA', 'LAR'], ['LVR', 'LV'], ['SD', 'LAC'], ['SL', 'LAR'],
]);

/** A team abbreviation in the one spelling everything compares against. */
export function canonicalTeam(team) {
  const value = String(team ?? '').trim().toUpperCase();
  return TEAM_ALIASES.get(value) ?? value;
}

/**
 * A team's mark, for the end zones and the down-and-distance flag.
 *
 * Lives here rather than in `fieldPrimitives.jsx` because that file may only
 * export components — anything else in it breaks Fast Refresh — and both the
 * end zones and playback need the same one.
 */
export const teamLogo = (teamId) => `https://a.espncdn.com/i/teamlogos/nfl/500/${String(teamId).toLowerCase()}.png`;

/**
 * Absolute field percentage from a possession string like "PHI 36".
 *
 * This is the provider's own rendering of the spot and is authoritative when
 * present — it survives the possession changes that make the numeric fields
 * ambiguous on kicks and turnovers.
 */
export function possessionTextToPercent(text, { homeTeam } = {}) {
  const match = /^([A-Z]{2,3})\s+(\d{1,2})$/.exec(String(text ?? '').trim());
  if (!match || !homeTeam) return null;
  const [, team, yardLine] = match;
  const yards = clamp(Number(yardLine), 0, 50);
  return canonicalTeam(team) === canonicalTeam(homeTeam) ? 100 - yards : yards;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Absolute field percentage from the provider's own yard line.
 *
 * `start_yard_line` and `end_yard_line` are measured from the home team's goal
 * line and never change frame, which makes them the only position source that
 * survives a punt, a turnover or a clock stoppage. The `*_yards_to_endzone`
 * fields are written from whoever holds the ball at that moment and mirror
 * themselves the instant possession moves, and on a stoppage the provider
 * leaves the start at 0 — which is what drew a drive from the wrong goal line.
 *
 * Verified against `end_possession_text` on every play of two full games: the
 * two agree on all 306 plays that carry both.
 */
export function yardLineToPercent(yardLine) {
  if (yardLine == null || !Number.isFinite(Number(yardLine))) return null;
  return clamp(100 - Number(yardLine), 0, 100);
}

/**
 * Rows the provider files as plays that no offense ran: clock stoppages, the
 * two-minute warning, and the end-of-period markers.
 *
 * They carry a yard line but no snap, and their `start_yards_to_endzone` is a
 * flat 0, so anything that treats them as a play draws a bar from the goal
 * line to wherever the ball actually is — and poisons the drive's net yards,
 * because the drive is measured from its first play's start spot.
 */
export const NON_SNAP_SLUGS = new Set([
  'timeout',
  'official-timeout',
  'two-minute-warning',
  'end-period',
  'end-of-half',
  'end-of-game',
  'coin-toss',
]);

export function isNonSnapPlay(play) {
  const slug = String(play?.typeSlug ?? '').toLowerCase();
  if (NON_SNAP_SLUGS.has(slug)) return true;
  if (slug) return false;
  const text = String(play?.description ?? play?.rawText ?? '').trim();
  return /^(?:official\s+)?timeout\b|^timeout\s*#|two.?minute warning|^end (?:of )?(?:quarter|half|game)/i.test(text);
}

/**
 * Does the ball change hands during this play?
 *
 * Every yardage field is measured from whoever holds the ball at that moment:
 * `start_yards_to_endzone` from the offense that ran the play,
 * `end_yards_to_endzone` from whoever ends up with it. On these plays those are
 * different teams, and `team` names the second one — the team that ends up with
 * the ball, not the offense. Reading `team` as the offense mirrors the play
 * down the field and files the possession under the wrong side.
 *
 * Matched by pattern rather than against a list of exact slugs. The provider's
 * vocabulary is compound and open-ended: the same lost fumble arrives as
 * `fumble-recovery-opponent` on one play and `sack-opp-fumble-recovery` on the
 * next. An exact list caught the first and quietly missed the second, which
 * filed a Houston possession under the Chargers and left the drive it ended
 * labelled "Drive" rather than "Fumble".
 *
 * A fumble the offense fell on itself keeps the ball, so a fumble only counts
 * when the slug says an opponent came up with it.
 *
 * A made field goal is deliberately not here. Possession does change after it,
 * but the provider already files the play under the kicking team, and the ball
 * flies at the goal line rather than to a spot — `getKickGeometry` owns it.
 */
function isPossessionChangingPlay(play) {
  const slug = String(play?.typeSlug ?? '').toLowerCase();
  if (!slug) return false;
  if (/kickoff|punt/.test(slug)) return true;
  if (/field.?goal.?(?:missed|blocked)|blocked.?field.?goal/.test(slug)) return true;
  if (/interception/.test(slug)) return true;
  // `opp` covers both `-opp-` and `-opponent`; a slug uses one or the other.
  return /fumble/.test(slug) && /opp/.test(slug);
}

/**
 * The team that actually ran the play.
 *
 * This is the single owner of the correction. `team` is the team in possession
 * when the play is over, which on a kick or a turnover is the team that
 * received it — the punting team's punt is reported under the returner. Both
 * the field graphics and the drive grouping ask this rather than reading
 * `team` directly, so they cannot disagree about whose play it was.
 */
export function getOffenseTeam(play, { homeTeam, awayTeam } = {}) {
  const team = play?.team ?? null;
  if (team == null || homeTeam == null || awayTeam == null) return team;
  if (!isPossessionChangingPlay(play) && !isTurnoverOnDowns(play)) return team;
  return team === homeTeam ? awayTeam : homeTeam;
}

/**
 * A fourth down the offense came up short on.
 *
 * The provider has no slug for a turnover on downs — the play stays a `rush`
 * or a `pass-incompletion` — so `team` quietly names the side that took over
 * with nothing else marking the change. Left uncorrected the play reads as the
 * new offense's, opens their drive, and draws itself mirrored down the field.
 *
 * A converted fourth down looks identical in every field but this one: the
 * yardage gained against the yardage needed is what separates them. Kicks
 * carry their own slugs and are settled above.
 */
export function isTurnoverOnDowns(play) {
  const slug = String(play?.typeSlug ?? '').toLowerCase();
  if (/punt|field.?goal|kickoff|extra.?point/.test(slug)) return false;
  // A penalty is never a turnover on downs, however the down and distance move
  // around it. A flag on fourth down that awards a first down looks exactly like
  // a stop in these fields — fourth down in, first down out, fewer yards gained
  // than were needed — so without this the offense is handed to the other team.
  // That correction is shared with `groupBdlPlaysIntoDrives`, so the drive broke
  // in two at the flag and every play after it was filed under, and drawn
  // attacking toward, the wrong end of the field.
  if (/penalty/.test(slug)) return false;
  // Nor is a play that put points on the board, whatever the down fields say.
  if (play?.scoring === true) return false;
  const gained = Number(play?.statYardage);
  const needed = Number(play?.startDistance);
  if (!Number.isFinite(gained) || !Number.isFinite(needed) || needed <= 0) return false;
  return Number(play?.startDown) === 4 && Number(play?.endDown) === 1 && gained < needed;
}

const SCORING_END_SLUGS = new Set(['field-goal-good']);

/**
 * `{ startPct, endPct, gained, direction, drawable }` for one play.
 *
 * `drawable` is false whenever the geometry can't be trusted — a missing spot,
 * or a possession-changing play whose end spot the provider didn't spell out.
 * Callers must skip the field graphic in that case rather than draw a guess.
 */
export function getPlaySegment(play, { homeTeam, awayTeam } = {}) {
  const possessionTeam = play?.team ?? null;
  const offenseTeam = getOffenseTeam(play, { homeTeam, awayTeam });
  const context = { possessionTeam, homeTeam };

  // Position comes from the frame-free sources first and the possession fields
  // only as a last resort. The provider's own spot text and yard lines are
  // absolute; `*_yards_to_endzone` is measured from whoever holds the ball, so
  // it needs the offense guessed correctly to mean anything at all.
  const startPct = possessionTextToPercent(play?.startPossessionText, context)
    ?? yardLineToPercent(play?.startYardLine)
    ?? toFieldPercent(play?.startYardsToEndzone, { possessionTeam: offenseTeam, homeTeam });

  const changesPossession = isPossessionChangingPlay(play);
  const towardHomeEndzone = offenseTeam != null && offenseTeam !== homeTeam;
  const attackingEndzonePct = towardHomeEndzone ? 100 : 0;

  // A score has no end spot on the field — the provider reports null because
  // the ball left the field of play. The endzone is the answer, not a gap.
  const scored = SCORING_END_SLUGS.has(String(play?.typeSlug ?? ''))
    || String(play?.typeSlug ?? '').includes('touchdown');

  const endPct = possessionTextToPercent(play?.endPossessionText, context)
    ?? yardLineToPercent(play?.endYardLine)
    ?? (changesPossession ? null : toFieldPercent(play?.endYardsToEndzone, context))
    ?? (scored && startPct != null ? attackingEndzonePct : null);

  // A stoppage has a spot but no snap. It must never draw and never count, or
  // it becomes the drive's first play and measures the drive from its own
  // phantom start.
  const drawable = !isNonSnapPlay(play) && startPct != null && endPct != null;
  const signedGain = drawable ? (towardHomeEndzone ? endPct - startPct : startPct - endPct) : null;

  return {
    startPct,
    endPct,
    drawable,
    // Yards toward the attacking endzone: negative on a sack or a loss.
    gained: signedGain == null ? null : Math.round(signedGain),
    direction: towardHomeEndzone ? 'right' : 'left',
    attackingEndzonePct,
    scored,
    possessionTeam,
    offenseTeam,
    defendingTeam: offenseTeam === homeTeam ? awayTeam : homeTeam,
  };
}

/**
 * Where the first-down marker sits, or null. Absent on kicks and on downs the
 * provider doesn't report.
 */
export function getFirstDownMarkerPercent(play, { homeTeam, awayTeam } = {}) {
  const distance = Number(play?.startDistance);
  const offenseTeam = getOffenseTeam(play, { homeTeam, awayTeam }) ?? play?.team ?? null;
  const startPct = possessionTextToPercent(play?.startPossessionText, { possessionTeam: offenseTeam, homeTeam })
    ?? toFieldPercent(play?.startYardsToEndzone, { possessionTeam: offenseTeam, homeTeam });
  if (startPct == null || !Number.isFinite(distance) || distance <= 0) return null;
  if (!play?.startDown || play.startDown < 1) return null;

  const marker = offenseTeam === homeTeam ? startPct - distance : startPct + distance;
  if (marker < 0 || marker > 100) return null;
  return marker;
}

/**
 * Field extent to draw a whole drive within, padded so the first and last
 * spots aren't flush against the edges of the graphic.
 */
export function getDriveExtent(plays = [], { homeTeam, awayTeam, padding = 6 } = {}) {
  const points = plays
    .flatMap((play) => {
      const segment = getPlaySegment(play, { homeTeam, awayTeam });
      return [segment.startPct, segment.endPct];
    })
    .filter((value) => value != null);
  if (!points.length) return null;
  return {
    min: clamp(Math.min(...points) - padding, 0, 100),
    max: clamp(Math.max(...points) + padding, 0, 100),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The 120-yard canvas.
//
// Everything above works in absolute yardline space: 0 is the away team's goal
// line, 100 the home team's. The drawn canvas is wider than that — it carries
// both 10-yard end zones — so a play strip and the drive field above it line up
// yard for yard only if both map through the same function.

/**
 * Absolute yardline (0–100) → percent across the 120-yard canvas.
 *
 * `flipped` mirrors the canvas end for end. Nothing upstream of here changes:
 * every yardline stays in the one absolute frame the geometry computes, and
 * only the drawing is reversed. See `isFieldFlipped`.
 */
export function fieldX(absoluteYardline, flipped = false) {
  const yard = flipped ? 100 - absoluteYardline : absoluteYardline;
  return ((10 + yard) / 120) * 100;
}

/**
 * Does this period's field face the other way?
 *
 * Teams change ends at the end of every quarter, so a drive in the second or
 * fourth quarter was played toward the opposite end zone from one in the first
 * or third. Drawing every quarter the same way is legible but slightly untrue;
 * mirroring the canvas puts each drive on screen pointing the way it was
 * actually played. Overtime starts with a fresh choice of ends and takes the
 * odd-period orientation.
 *
 * A drive that runs across a quarter break keeps the orientation of the
 * quarter it opened in, so the drive field and the play strips under it can
 * never disagree with each other.
 */
export function isFieldFlipped(period) {
  const quarter = Number(period);
  return Number.isFinite(quarter) && quarter > 0 && quarter % 2 === 0;
}

/** Width of one end zone as a percentage of the canvas. */
export const END_ZONE_WIDTH_PCT = fieldX(0);

/**
 * `{ type, flag }` — the play's silhouette and its outcome mark.
 *
 * The slug is the provider's own classification and settles both on its own.
 * The description is consulted only when the slug says nothing, because free
 * text carries the extra point, the injury update and the penalty enforcement
 * alongside the play itself — a touchdown whose description ends "extra point
 * is GOOD" must not come out as a kick.
 */
export function classifyPlay(play) {
  // A stoppage is not a play type. Naming it one made every timeout fall
  // through to the `rush` default and show up in the drive's play mix.
  if (isNonSnapPlay(play)) return { type: 'stoppage', flag: null };
  const slug = String(play?.typeSlug ?? '').toLowerCase();
  const text = String(play?.description ?? play?.rawText ?? '').toLowerCase();

  const typeOf = (value) => (/punt|field.?goal|kickoff|extra.?point/.test(value) ? 'kick'
    : /penalty/.test(value) ? 'penalty'
    : /pass|sack|interception/.test(value) ? 'pass'
    : /rush|\brun\b|scramble|kneel|sneak|fumble/.test(value) ? 'rush'
    : null);

  const flagOf = (value) => (/penalty/.test(value) ? 'penalty'
    : /interception/.test(value) ? 'int'
    : /fumble/.test(value) ? 'fumble'
    : /touchdown/.test(value) ? 'td'
    : /\bsack(ed)?\b/.test(value) ? 'sack'
    : /incompletion|incomplete/.test(value) ? 'incomplete'
    : /field.?goal/.test(value) ? 'fg'
    : /\bpunt/.test(value) ? 'punt'
    : null);

  const slugType = typeOf(slug);
  const slugFlag = flagOf(slug);
  const classified = slugType != null || slugFlag != null;

  return {
    type: slugType ?? typeOf(text) ?? 'rush',
    flag: slugFlag ?? (classified ? null : flagOf(text)),
  };
}


const SPOT = '([A-Z]{2,3}\\s+\\d{1,2})';

/**
 * Did this play put points on the board?
 *
 * `scoring_play` is the provider's own answer and is trusted first — it is the
 * only thing that separates a made field goal from a missed one, and it
 * correctly says no when a touchdown is wiped out by a penalty. The slug is a
 * fallback for feeds that omit the flag.
 */
export function isScoringPlay(play, flag) {
  if (typeof play?.scoring === 'boolean') return play.scoring;
  const slug = String(play?.typeSlug ?? '').toLowerCase();
  if (/touchdown|safety/.test(slug)) return true;
  if (/field.?goal|extra.?point|two.?point/.test(slug)) return /good|made|success/.test(slug);
  return flag === 'td';
}

/**
 * Kick and return geometry for one kicking play, or null when it can't be
 * trusted.
 *
 * Kicks can't use the possession fields the rest of the field graphics run on.
 * On a punt or a kickoff the feed reports `team` as the *receiving* team, so
 * both the direction and — on kickoffs — the start spot come out mirrored, and
 * the play draws itself backwards down the field.
 *
 * The description is authoritative instead: the provider always spells the
 * kick out in full ("kicks 60 yards from PHI 35 to DAL 5"), and those named
 * spots fix the direction without needing to know who had the ball. When they
 * can't be read, the kick doesn't draw at all — a punt pointing the wrong way
 * is worse than no punt.
 *
 * Field goals are exempt: their possession fields are already correct, and the
 * ball flies at the goal line rather than the stated distance, which measures
 * from the holder's spot through the back of the end zone.
 */
export function getKickGeometry(play, { dir, start, flag, homeTeam }) {
  const text = String(play?.description ?? play?.rawText ?? '');
  const clamp01 = (value) => Math.min(100, Math.max(0, value));

  // A field goal keeps the offense's frame, and the ball flies at the goal line
  // rather than the stated distance — that number measures from the holder's
  // spot through the back of the end zone and would overshoot the canvas.
  if (flag === 'fg') {
    const goalLine = dir > 0 ? 100 : 0;
    return { start, dir, kickYards: Math.abs(goalLine - start), returnYards: 0, land: goalLine, finish: goalLine };
  }

  // `dir` is already the kicking team's direction: getOffenseTeam corrected it
  // before the segment was built.
  const kickDir = dir;

  const kickYards = Number((/(?:punts?|kicks?)\s+(\d+)\s*yards?/i.exec(text) ?? [])[1]) || 0;
  const landing = new RegExp(`\\bto\\s+${SPOT}`, 'i').exec(text);
  const touchback = !landing && /to (?:the )?end zone|touchback/i.test(text);

  // The spot the ball came down on, and the spot it was kicked from. The
  // description names at least one of them; the stated distance supplies the
  // other. Nothing here reads the possession yardage, which is mirrored on
  // these plays and would draw the kick backwards down the field.
  const from = possessionTextToPercent((new RegExp(`\\bfrom\\s+${SPOT}`, 'i').exec(text) ?? [])[1], { homeTeam });
  let land = landing ? possessionTextToPercent(landing[1], { homeTeam }) : touchback ? (kickDir > 0 ? 100 : 0) : null;
  let origin = from;
  if (origin == null && land != null && kickYards) origin = clamp01(land - kickYards * kickDir);
  if (land == null && origin != null && kickYards) land = clamp01(origin + kickYards * kickDir);
  if (origin == null || land == null || land === origin) return null;

  // Everything after the landing spot is the return. A touchback has none, and
  // reading past it would pick up the penalty-enforcement spot instead.
  const tail = landing ? text.slice(landing.index + landing[0].length) : '';
  const returnSpot = possessionTextToPercent((new RegExp(`\\b(?:at|to)\\s+${SPOT}`, 'i').exec(tail) ?? [])[1], { homeTeam });
  const returnYards = returnSpot != null
    ? Math.abs(returnSpot - land)
    : Number((/\bfor\s+(\d+)\s+yards?/i.exec(tail) ?? [])[1]) || 0;

  return {
    start: origin,
    dir: kickDir,
    kickYards: Math.abs(land - origin),
    returnYards,
    land,
    finish: returnSpot ?? clamp01(land - returnYards * kickDir),
  };
}

/**
 * Everything one play needs to draw itself on the 120-yard canvas.
 *
 * `drawable` is false whenever the geometry can't be trusted. Callers skip the
 * graphic entirely in that case — a field diagram of a guessed spot is worse
 * than no diagram, because it looks just as authoritative as a real one.
 */
export function getPlayTrajectory(play, { homeTeam, awayTeam } = {}) {
  const segment = getPlaySegment(play, { homeTeam, awayTeam });
  const { type, flag } = classifyPlay(play);
  const dir = segment.direction === 'right' ? 1 : -1;
  const start = segment.startPct;

  const distance = Number(play?.startDistance);
  const dist = Number.isFinite(distance) && distance > 0 && Number(play?.startDown) > 0 ? distance : 0;
  const firstDown = start == null || !dist ? null : clamp(start + dist * dir, 0, 100);

  const kick = type === 'kick' ? getKickGeometry(play, { dir, start, flag, homeTeam }) : null;

  // A kick reads its own frame off the description, because the possession
  // fields it would otherwise use are reported from the receiving team.
  const drawable = type === 'kick' ? kick != null && kick.kickYards > 0 : segment.drawable;
  const yards = kick ? kick.kickYards : segment.gained;

  return {
    ...segment,
    drawable,
    type,
    flag,
    // `scored` (from the segment) is geometry: the ball reached the end zone.
    // `scoring` is the scoreboard: this play put points up.
    scoring: isScoringPlay(play, flag),
    dir: kick ? kick.dir : dir,
    start: kick ? kick.start : start,
    end: kick ? kick.finish : segment.endPct,
    yards,
    dist,
    firstDown: kick ? null : firstDown,
    kick,
    zero: yards != null && Math.abs(yards) < 0.5,
  };
}

/**
 * Net yards for a drive: where it ended minus where it started, toward the
 * attacking end zone. Kicks are excluded — a punt is how the drive ended, not
 * ground the offense gave back — and so is anything undrawable, which is what
 * keeps a clock stoppage from opening the drive at a goal line it never saw.
 */
export function getDriveNetYards(plays = [], context = {}) {
  const moved = plays
    .map((play) => ({ play, geometry: getPlayTrajectory(play, context) }))
    .filter(({ geometry }) => geometry.drawable && geometry.type !== 'kick');
  if (!moved.length) return null;
  const first = moved[0].geometry;
  const last = moved.at(-1);
  // A turnover's end spot is where the defense finished its return, which is
  // not ground this offense covered — counting it read a drive that reached the
  // Houston 24 and threw a pick there as 25 yards rather than 53. The drive is
  // measured to the last line of scrimmage instead. On a sack-fumble that
  // ignores the sack itself, because the spot the quarterback went down is only
  // ever named in the description, never in a field of its own.
  const end = isPossessionChangingPlay(last.play) ? last.geometry.start : last.geometry.end;
  return Math.round((end - first.start) * first.dir);
}

export const PLAY_TYPE_LABEL = { rush: 'Rush', pass: 'Pass', kick: 'Kick', penalty: 'Penalty', stoppage: 'Stoppage' };

/**
 * The colour of a play's body. Penalties and scores take the signature yellow,
 * losses the accent red, and everything else the attacking team's colour — so
 * the field never needs a key to say who has the ball.
 *
 * Points read gold whatever put them up: touchdowns, made field goals, extra
 * points, two-point tries and defensive returns alike. A kick that missed is
 * not a score and keeps the neutral treatment.
 */
export function playColor(trajectory, barColor) {
  if (trajectory.scoring) return 'var(--color-signature)';
  // Penalties keep the signature yellow the design froze them at. They share it
  // with scores now, but never the fill: a penalty is hatched on the drive field
  // and dashed on a play strip, and carries its own square outcome mark. Moving
  // them to orange was tried and is worse — it collides with the team colour on
  // Cleveland, Cincinnati, Chicago, Denver and Miami.
  if (trajectory.type === 'penalty' || trajectory.flag === 'penalty') return 'var(--color-signature)';
  if (trajectory.yards != null && trajectory.yards < 0) return 'var(--color-accent-red)';
  return barColor;
}

/** An absolute yardline as the broadcast writes it: "DAL 35", "PHI 12", "50". */
export function formatFieldSpot(absoluteYardline, { homeTeam, awayTeam } = {}) {
  if (absoluteYardline == null || !Number.isFinite(absoluteYardline)) return null;
  const yard = Math.round(absoluteYardline);
  if (yard === 50) return '50';
  if (yard <= 0) return `${awayTeam} Goal`;
  if (yard >= 100) return `${homeTeam} Goal`;
  return yard < 50 ? `${awayTeam} ${yard}` : `${homeTeam} ${100 - yard}`;
}
