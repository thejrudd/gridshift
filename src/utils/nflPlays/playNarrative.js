// playNarrative.js — turns a BALLDONTLIE play row into a plain-language
// sentence plus the ordered list of players involved.
//
// Two text fields do the work. `short_text` is the reliable one: it uses full
// player names in a small, regular grammar ("Dak Prescott Pass Complete for 6
// Yds to George Pickens"). `text` is the official NFL description — it only
// abbreviates names ("D.Prescott"), but it is the only place tacklers,
// penalties, and play direction appear.
//
// The parser is deliberately conservative. Anything that does not match a known
// grammar returns `confident: false`, and the UI falls back to the raw NFL text
// rather than showing an invented sentence or a wrong name.

import { TEAM_NAMES } from '../../data/teamColors.js';
import { canonicalTeam, FIELD_SPOT_PATTERN } from './fieldSpots.js';

export const PLAY_ROLES = Object.freeze({
  PASSER: 'passer',
  RECEIVER: 'receiver',
  RUSHER: 'rusher',
  KICKER: 'kicker',
  PUNTER: 'punter',
  RETURNER: 'returner',
  TACKLER: 'tackler',
  SACKER: 'sacker',
  INTERCEPTER: 'intercepter',
  FORCER: 'forcer',
  FUMBLER: 'fumbler',
  RECOVERER: 'recoverer',
  PASS_DEFENDER: 'pass-defender',
  QB_HITTER: 'qb-hitter',
  SAFETY: 'safety',
  KICK_BLOCKER: 'kick-blocker',
  PENALIZED: 'penalized',
});

const ROLE_LABELS = Object.freeze({
  passer: 'Pass',
  receiver: 'Catch',
  rusher: 'Rush',
  kicker: 'Kick',
  punter: 'Punt',
  returner: 'Return',
  tackler: 'Tackle',
  sacker: 'Sack',
  intercepter: 'Intercept',
  forcer: 'Forced fumble',
  fumbler: 'Fumble',
  recoverer: 'Recovery',
  'pass-defender': 'Pass defended',
  'qb-hitter': 'QB hit',
  safety: 'Safety',
  'kick-blocker': 'Blocked kick',
  penalized: 'Penalty',
});

export function getRoleLabel(role) {
  return ROLE_LABELS[role] ?? 'Play';
}

const ADMINISTRATIVE_SLUGS = new Set([
  'timeout',
  'official-timeout',
  'two-minute-warning',
  'end-period',
  'end-of-half',
  'end-of-regulation',
  'end-of-game',
]);

// One or more capitalized tokens. Allows the punctuation real names carry:
// "Adoree' Jackson", "John Metchie III", "Amon-Ra St. Brown".
// "Fumble" is never part of a name: the compact text runs it straight on from
// the ball carrier ("Jalen Coker Fumble"), and a greedy name swallowed it.
const NAME_TOKEN = "(?!Fumble\\b)[A-Z][A-Za-z.'’-]*";
const NAME = `${NAME_TOKEN}(?: ${NAME_TOKEN})*`;
const rx = (body) => new RegExp(`^${body}$`);

const GRAMMARS = [
  {
    kind: 'pass',
    pattern: rx(`(${NAME}) Pass Complete for (-?\\d+) Yds to (${NAME})`),
    build: ([, passer, yards, receiver]) => ({
      yards: Number(yards),
      actors: [
        { role: PLAY_ROLES.PASSER, name: passer },
        { role: PLAY_ROLES.RECEIVER, name: receiver },
      ],
    }),
  },
  {
    kind: 'incompletion',
    pattern: rx(`(${NAME}) Incomplete Pass, Intended For (${NAME})`),
    build: ([, passer, receiver]) => ({
      yards: 0,
      actors: [
        { role: PLAY_ROLES.PASSER, name: passer },
        { role: PLAY_ROLES.RECEIVER, name: receiver },
      ],
    }),
  },
  {
    kind: 'incompletion',
    pattern: rx(`(${NAME}) Incomplete Pass`),
    build: ([, passer]) => ({ yards: 0, actors: [{ role: PLAY_ROLES.PASSER, name: passer }] }),
  },
  {
    kind: 'rush',
    pattern: rx(`(${NAME}) (-?\\d+) Yd (?:Rush|Run)(?: \\((${NAME}) (Kick|PAT [Ff]ailed|PAT [Bb]locked)\\))?`),
    build: ([, rusher, yards, kicker, patResult]) => ({
      yards: Number(yards),
      patResult: kicker ? patResult : null,
      actors: [
        { role: PLAY_ROLES.RUSHER, name: rusher },
        ...(kicker ? [{ role: PLAY_ROLES.KICKER, name: kicker, detail: patResult === 'Kick' ? 'extra point good' : 'extra point failed' }] : []),
      ],
    }),
  },
  {
    kind: 'passing-touchdown',
    pattern: rx(`(${NAME}) (\\d+) Yd pass from (${NAME})(?: \\((${NAME}) (Kick|PAT [Ff]ailed|PAT [Bb]locked)\\))?`),
    build: ([, receiver, yards, passer, kicker, patResult]) => ({
      yards: Number(yards),
      patResult: kicker ? patResult : null,
      actors: [
        { role: PLAY_ROLES.PASSER, name: passer },
        { role: PLAY_ROLES.RECEIVER, name: receiver },
        ...(kicker ? [{ role: PLAY_ROLES.KICKER, name: kicker, detail: patResult === 'Kick' ? 'extra point good' : 'extra point failed' }] : []),
      ],
    }),
  },
  {
    kind: 'sack',
    pattern: rx(`(${NAME}) Sacked by (${NAME}) For (\\d+) Yd Loss`),
    build: ([, passer, sacker, yards]) => ({
      yards: -Number(yards),
      actors: [
        { role: PLAY_ROLES.PASSER, name: passer },
        { role: PLAY_ROLES.SACKER, name: sacker },
      ],
    }),
  },
  {
    // The compact text names only the passer; the sacker and the yardage come
    // from the official description (see parsePlayNarrative).
    kind: 'sack',
    pattern: rx(`(${NAME}) Sacked`),
    build: ([, passer]) => ({ yards: null, actors: [{ role: PLAY_ROLES.PASSER, name: passer }] }),
  },
  {
    // Only ever seen ahead of a fumble clause: "Caleb Williams Aborted Snap
    // Caleb Williams Fumble Caleb Williams 0 Yd Fumble Recovery".
    kind: 'aborted-snap',
    pattern: rx(`(${NAME}) Aborted Snap`),
    build: ([, fumbler]) => ({ yards: 0, actors: [{ role: PLAY_ROLES.FUMBLER, name: fumbler }] }),
  },
  {
    kind: 'field-goal',
    pattern: rx(`(${NAME}) (\\d+) Yd Field Goal`),
    build: ([, kicker, distance]) => ({
      distance: Number(distance),
      good: true,
      actors: [{ role: PLAY_ROLES.KICKER, name: kicker }],
    }),
  },
  {
    kind: 'field-goal',
    pattern: rx(`(${NAME}) Missed (\\d+) Yd FG (.+)`),
    build: ([, kicker, distance, miss]) => ({
      distance: Number(distance),
      good: false,
      missDetail: miss.trim().toLowerCase(),
      actors: [{ role: PLAY_ROLES.KICKER, name: kicker }],
    }),
  },
  {
    kind: 'interception',
    pattern: rx(`(${NAME}) (-?\\d+) Yd Interception Return`),
    build: ([, defender, yards]) => ({
      yards: Number(yards),
      actors: [{ role: PLAY_ROLES.INTERCEPTER, name: defender }],
    }),
  },
  {
    kind: 'fumble',
    pattern: rx(`(${NAME}) (-?\\d+) Yd Rush (${NAME}) Fumble (${NAME}) (-?\\d+) Yd Fumble Recovery`),
    build: ([, rusher, yards, fumbler, recoverer, returnYards]) => ({
      yards: Number(yards),
      returnYards: Number(returnYards),
      actors: [
        { role: PLAY_ROLES.RUSHER, name: rusher },
        { role: PLAY_ROLES.FUMBLER, name: fumbler },
        { role: PLAY_ROLES.RECOVERER, name: recoverer },
      ],
    }),
  },
  {
    kind: 'punt',
    pattern: rx(`(${NAME}) (\\d+) Yd Punt (${NAME}) (-?\\d+) Yd Punt Return`),
    build: ([, punter, distance, returner, returnYards]) => ({
      distance: Number(distance),
      returnYards: Number(returnYards),
      outcome: null,
      actors: [
        { role: PLAY_ROLES.PUNTER, name: punter },
        { role: PLAY_ROLES.RETURNER, name: returner },
      ],
    }),
  },
  {
    kind: 'punt',
    pattern: rx(`(${NAME}) (\\d+) Yd Punt(?:, (.*))?`),
    build: ([, punter, distance, outcome]) => ({
      distance: Number(distance),
      outcome: normalizeKickOutcome(outcome),
      actors: [{ role: PLAY_ROLES.PUNTER, name: punter }],
    }),
  },
  {
    // Scoring-summary rows with no play of their own: the touchdown return
    // ("Dylan Laube 95 Yd Kickoff Return (Matt Gay Kick)"), a defensive
    // recovery score, a safety, and a defensive return of a try.
    kind: 'return-touchdown',
    pattern: rx(`(${NAME}) (\\d+) Yd (Kickoff|Punt) Return(?: \\((${NAME}) (Kick|PAT [Ff]ailed|PAT [Bb]locked)\\))?`),
    build: ([, returner, yards, kick, kicker, patResult]) => ({
      returnYards: Number(yards),
      kick: kick.toLowerCase(),
      patResult: kicker ? patResult : null,
      actors: [
        { role: PLAY_ROLES.RETURNER, name: returner },
        ...(kicker ? [{ role: PLAY_ROLES.KICKER, name: kicker, detail: patResult === 'Kick' ? 'extra point good' : 'extra point failed' }] : []),
      ],
    }),
  },
  {
    // "Oluwafemi Oladejo 14 Yd return of blocked punt (J.Slye kick)".
    kind: 'blocked-kick-return',
    pattern: rx(`(${NAME}) (\\d+) Yd return of blocked (punt|field goal|FG|kick)(?: \\([^)]*\\))?`),
    build: ([, returner, yards, kick]) => ({
      returnYards: Number(yards),
      kick: /punt/i.test(kick) ? 'punt' : 'field goal',
      actors: [{ role: PLAY_ROLES.RECOVERER, name: returner }],
    }),
  },
  {
    kind: 'fumble-return',
    pattern: rx(`(${NAME}) (-?\\d+) Yd Fumble (?:Return|Recovery)`),
    build: ([, recoverer, yards]) => ({
      returnYards: Number(yards),
      actors: [{ role: PLAY_ROLES.RECOVERER, name: recoverer }],
    }),
  },
  {
    kind: 'safety',
    pattern: rx(`(${NAME}) Safety`),
    build: ([, defender]) => ({ actors: [{ role: PLAY_ROLES.SAFETY, name: defender }] }),
  },
  {
    // A defensive return of a try is worth two points but credits no stat any
    // fantasy league scores, so it names the player without an actor.
    kind: 'defensive-conversion',
    pattern: rx(`(${NAME}) Defensive (?:PAT|Two-Point|2-Point) Conversion`),
    build: ([, defender]) => ({ scorer: defender, actors: [] }),
  },
  {
    // The distance and who came up with it are in the official description.
    kind: 'onside-kick',
    pattern: rx(`(${NAME}) Onside Kick,?(?: .*)?`),
    build: ([, kicker]) => ({ actors: [{ role: PLAY_ROLES.KICKER, name: kicker }] }),
  },
  {
    kind: 'kickoff',
    pattern: rx(`(${NAME}) (\\d+) Yd Kickoff(, Touchback)?(?: (${NAME}) (-?\\d+) Yd Kickoff Return)?`),
    build: ([, kicker, distance, touchback, returner, returnYards]) => ({
      distance: Number(distance),
      touchback: Boolean(touchback),
      returnYards: returner ? Number(returnYards) : null,
      actors: [
        { role: PLAY_ROLES.KICKER, name: kicker },
        ...(returner ? [{ role: PLAY_ROLES.RETURNER, name: returner }] : []),
      ],
    }),
  },
];

function normalizeKickOutcome(outcome) {
  const text = String(outcome ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return null;
  if (/^fair catch by$/i.test(text)) return 'fair catch';
  if (/^fair catch by /i.test(text)) return 'fair catch';
  if (/^OB at/i.test(text)) return 'out of bounds';
  if (/touchback/i.test(text)) return 'touchback';
  return text.toLowerCase();
}

const SPOT_TEXT = FIELD_SPOT_PATTERN;
const ABBREV = "[A-Z][A-Za-z.'’-]*\\.[A-Za-z.'’-]+";

/**
 * The part of the description that actually stands.
 *
 * A play the replay official reversed is written out in full twice, with the
 * ruling between them and the corrected version last — the same interception is
 * described as a 7-yard return and then as a 2-yard one. Parsing the whole
 * string takes the overturned version, because it comes first.
 */
export function authoritativeText(rawText) {
  const text = String(rawText ?? '');
  const reversal = /(?:play was REVERSED|ruling on the field was REVERSED)[^\n.]*[.]?/i;
  const match = reversal.exec(text);
  if (!match) return text;
  const after = text.slice(match.index + match[0].length).trim();
  return after || text;
}

/**
 * The penalty clause from the official description, or null.
 *
 * Format: "PENALTY on PHI-A.Jackson, Defensive Pass Interference, 34 yards,
 * enforced at DAL 12 - No Play". Team-level penalties with no named player are
 * reported with a null name rather than being dropped.
 *
 * `noPlay` is what separates a flag that wiped the down out from one enforced
 * on top of a play that counted — they need different choreography, because one
 * has an action to show first and the other only ever had a walk-off.
 */
export function parsePenaltyClause(rawText) {
  // A play can carry several flags ("PENALTY on NE-Dr.Jones, Roughing the
  // Passer, 15 yards, enforced at NYJ 37.Penalty on NE-Dr.Jones, Defensive
  // Offside, declined."). Each clause is read on its own; the one that stands
  // is the flag the play is about, and a declined flag only when it is all
  // there was. Reading the play as a whole marked an accepted flag declined
  // whenever any other flag on the snap was.
  const text = String(rawText ?? '');
  const clauses = [...text.matchAll(/PENALTY on [^]*?(?=PENALTY on |$)/gi)].map((match) => match[0]);
  const flags = clauses.map(parseOneFlag).filter(Boolean);
  if (!flags.length) return null;
  // Flags on both teams that cancel out: no yards, the down is replayed.
  const offsetting = flags.filter((flag) => flag.offsetting);
  if (offsetting.length > 1) return { ...offsetting[0], offsetting };
  return flags.find((flag) => !flag.declined) ?? flags[0];
}

function parseOneFlag(clause) {
  // Most flags report a yardage and say where it was "enforced". The dynamic
  // kickoff landing-zone rule is different: the provider supplies no yardage
  // and says the ball was "placed" at a fixed spot instead. Keep both shapes
  // in one contract so playback can choreograph the kick before the placement.
  const match = /PENALTY on ([A-Z]{2,3})(?:-([^,]+))?, ([^,.\n]+)(?:,\s*(\d+) yards?)?/i.exec(clause);
  if (!match) return null;
  const enforcement = new RegExp(`(?:enforced|placed) at ${SPOT_TEXT}`, 'i').exec(clause);
  return {
    // The description spells a handful of clubs the league's own way — a
    // Cleveland foul is written "on CLV". That belongs nowhere near a sentence
    // a reader sees, so it is folded to the spelling the rest of the app uses.
    team: canonicalTeam(match[1]),
    name: match[2]?.trim() || null,
    infraction: match[3].trim(),
    yards: match[4] == null ? null : Number(match[4]),
    // "…, Penalty declined" or "…, Offensive Holding, declined."
    declined: /,\s*(?:Penalty\s+)?declined\b/i.test(clause),
    enforcedAt: enforcement?.[1] ?? null,
    noPlay: /-\s*No Play/i.test(clause),
    offsetting: /,\s*offsetting\b/i.test(clause),
  };
}

/**
 * An interception from the official description, or null.
 *
 * Format: "J.Flacco pass deep middle intended for J.Jeudy INTERCEPTED by
 * J.Battle at CLV 36. J.Battle to CLV 34 for 2 yards (J.Jeudy)." Nothing else
 * carries the spot the ball was picked off at — `short_text` only reports the
 * return — and that spot is where the play turns around, so without it the
 * throw and the return cannot be drawn as two separate things.
 *
 * Every name here is abbreviated, as they always are in this field; the caller
 * expands them through the participant index.
 */
export function parseInterception(rawText) {
  const text = authoritativeText(rawText);
  // The gamebook may insert a bracketed or parenthesized defensive attribution
  // between the interceptor and the spot ("by J.Jobe [D.Lawrence] at SEA -3"
  // or "by N.Pritchett (R.Thomas) at SEA 3"). It is not the interceptor and
  // must not make the otherwise-complete play unparseable.
  // Some feeds also prefix every player with their jersey number ("28-J.Jobe").
  const picked = new RegExp(`INTERCEPTED by (?:\\d+-)?(${ABBREV})(?:\\s+(?:\\[[^\\]]+\\]|\\([^)]*\\)))* at ${SPOT_TEXT}`, 'i').exec(text);
  if (!picked) return null;
  const tail = text.slice(picked.index + picked[0].length);
  const returned = new RegExp(`\\bto ${SPOT_TEXT} for (-?\\d+) yards?`, 'i').exec(tail);
  return {
    passer: new RegExp(`(?:\\d+-)?(${ABBREV}) pass`, 'i').exec(text)?.[1] ?? null,
    // "A.St. Brown": an abbreviation ending in a period runs on to the surname.
    intendedFor: new RegExp(`intended for (?:\\d+-)?(${ABBREV}(?:(?<=\\.) [A-Z][A-Za-z'’-]+)?)`, 'i').exec(text)?.[1] ?? null,
    depth: /\b(short|deep) (left|middle|right)\b/i.exec(text)?.[0]?.toLowerCase() ?? null,
    defender: picked[1],
    at: picked[2],
    returnTo: returned?.[1] ?? null,
    returnYards: returned ? Number(returned[2]) : 0,
  };
}

/**
 * A fumble and its recovery from the official description, or null.
 *
 * Format: "M.Sanders left guard to PHI 10 for 1 yard (J.Campbell; B.Young).
 * FUMBLES (J.Campbell), RECOVERED by PHI-Q.Mitchell at PHI 10. Q.Mitchell to
 * PHI 16 for 6 yards (D.Prescott)."
 *
 * `forcedBy` is optional: a ball that came loose on its own names no one.
 */
// What the gamebook can put between "FUMBLES" and the recovery: who forced it,
// a bracketed quarterback hit, and a "touched at" spot.
const FUMBLE_FORCE = '(?:\\s*\\(([^)]+)\\))?(?:\\s*\\[[^\\]]*\\])?';
const FUMBLE_BETWEEN = '(?:,\\s*touched at [A-Z]{2,3} \\d+)?';

function firstAbbreviatedName(text) {
  // The carrier is the first name in the description, once the formation note
  // that sometimes opens it is out of the way.
  return new RegExp(`(${ABBREV})`).exec(text.replace(/^\s*\([^)]*\)\s*/, ''))?.[1] ?? null;
}

/**
 * Any fumble in the official description, recovered or not: who had the ball,
 * who forced it, and which team came up with it (null when it went out of
 * bounds or the text does not say). parseFumble below is the narrower reading,
 * a recovery with its spot and return.
 */
export function parseFumbleCredit(rawText) {
  const text = authoritativeText(rawText);
  const fumble = new RegExp(`FUMBLES${FUMBLE_FORCE}`, 'i').exec(text);
  if (!fumble) return null;
  const recovery = /RECOVERED by ([A-Z]{2,3})-/i.exec(text.slice(fumble.index));
  // The ball carrier opens the sentence that ends in FUMBLES — on a kick that
  // is the returner ("W.Lutz kicks ... R.Shaheed to SEA 44 ... FUMBLES"), not
  // the kicker who opens the description — unless that sentence is a
  // completed pass, where it is the receiver.
  const before = text.slice(0, fumble.index);
  // A lateral transfers possession to another offensive player, even when
  // the original pass receiver still opens the preceding sentence.
  const lateral = [...before.matchAll(new RegExp(`\\blateral to (${ABBREV})\\b`, 'gi'))].at(-1);
  const sentenceStarts = [...before.matchAll(new RegExp(`(?:^|\\.\\s+)(?:\\([^)]*\\)\\s*)?(${ABBREV})`, 'g'))];
  const sentence = before.slice(sentenceStarts.at(-1)?.index ?? 0);
  const receiver = /\bsacked\b/i.test(sentence)
    ? null
    : new RegExp(`\\bpass\\b[^.]*?\\bto (${ABBREV})`, 'i').exec(sentence)?.[1] ?? null;
  return {
    fumbledBy: (lateral && lateral.index > (sentenceStarts.at(-1)?.index ?? 0) ? lateral[1] : null)
      ?? receiver ?? sentenceStarts.at(-1)?.[1] ?? firstAbbreviatedName(text),
    forcedBy: fumble[1]?.trim() || null,
    recoveredByTeam: recovery ? canonicalTeam(recovery[1]) : null,
  };
}

export function parseFumble(rawText) {
  const text = authoritativeText(rawText);
  const lost = new RegExp(`FUMBLES${FUMBLE_FORCE}${FUMBLE_BETWEEN},?\\s*RECOVERED by ([A-Z]{2,3})-(${ABBREV}) at ${SPOT_TEXT}`, 'i').exec(text);
  if (!lost) return null;
  const tail = text.slice(lost.index + lost[0].length);
  const returned = new RegExp(`\\bto ${SPOT_TEXT} for (?:(-?\\d+) yards?|no gain)`, 'i').exec(tail);
  return {
    // Use the same carrier resolution as fantasy scoring, including laterals.
    fumbledBy: parseFumbleCredit(text)?.fumbledBy ?? firstAbbreviatedName(text),
    forcedBy: lost[1]?.trim() || null,
    recoveredByTeam: lost[2],
    recoveredBy: lost[3],
    at: lost[4],
    returnTo: returned?.[1] ?? null,
    returnYards: returned ? Number(returned[2] ?? 0) : 0,
  };
}

/** A fully described completion and lateral chain. Unknown clauses fail closed. */
export function parsePassLaterals(rawText) {
  const text = authoritativeText(rawText).trim();
  if (!/\blateral to\b/i.test(text) || /\bPENALTY\b|\bNo Play\b/i.test(text)) return null;
  const stop = `(?:\\s*\\((?:${ABBREV})(?:[;,]\\s*${ABBREV})*\\))?`;
  const gain = '(?:(-?\\d+) yards?|no gain)';
  const completion = new RegExp(`^(?:\\([^)]*\\)\\s*)?(${ABBREV}) pass(?: (short|deep) (left|middle|right))? to (${ABBREV}) to ${SPOT_TEXT} for ${gain}${stop}\\.\\s*`, 'i').exec(text);
  if (!completion) return null;
  const carriers = [{ name: completion[4], to: completion[5], yards: Number(completion[6] ?? 0) }];
  const lateralPattern = new RegExp(`^Lateral to (${ABBREV}) to ${SPOT_TEXT} for ${gain}${stop}(,? TOUCHDOWN)?\\.\\s*`, 'i');
  let tail = text.slice(completion[0].length);
  let touchdown = false;
  while (/^Lateral to\b/i.test(tail)) {
    const lateral = lateralPattern.exec(tail);
    if (!lateral || touchdown) return null;
    carriers.push({ name: lateral[1], to: lateral[2], yards: Number(lateral[3] ?? 0) });
    touchdown = Boolean(lateral[4]);
    tail = tail.slice(lateral[0].length);
  }
  if (carriers.length < 2) return null;
  let fumble = null;
  let tacklers = parseTacklers(text);
  if (tail) {
    if (touchdown) return null;
    const recovery = new RegExp(`^FUMBLES${FUMBLE_FORCE},?\\s*RECOVERED by ([A-Z]{2,3})-(${ABBREV}) at ${SPOT_TEXT}\\.\\s*`, 'i').exec(tail);
    if (!recovery) return null;
    const returnText = tail.slice(recovery[0].length);
    const returned = returnText
      ? new RegExp(`^(${ABBREV}) to ${SPOT_TEXT} for ${gain}${stop}(,? TOUCHDOWN)?\\.\\s*$`, 'i').exec(returnText)
      : null;
    if (returnText && (!returned || returned[1] !== recovery[3])) return null;
    fumble = {
      fumbledBy: carriers.at(-1).name,
      forcedBy: recovery[1] ?? null,
      recoveredByTeam: canonicalTeam(recovery[2]),
      recoveredBy: recovery[3],
      at: recovery[4],
      returnTo: returned?.[2] ?? recovery[4],
      returnYards: Number(returned?.[3] ?? 0),
    };
    touchdown = Boolean(returned?.[4]);
    // The pre-fumble tackle and forced-fumble attribution do not stop the return.
    tacklers = returned ? parseTacklers(returnText) : [];
  }
  return {
    passer: completion[1],
    depth: completion[2] ? `${completion[2]} ${completion[3]}` : null,
    carriers, fumble, touchdown, tacklers,
  };
}

const TACKLER_PART = /^[A-Z][A-Za-z.'’-]*\.[A-Za-z.'’-]+$/;

/**
 * Tacklers from the official description.
 *
 * They appear as a trailing parenthetical of abbreviated names —
 * "(Q.Mitchell)" or "(T.Martin; K.Robichaux)". Formation notes like
 * "(Shotgun)" and "(No Huddle, Shotgun)" sit in the same syntax, so a group
 * only qualifies when every part looks like "X.Surname". Names in square
 * brackets are pressure/hit credits, not tackles, and are ignored.
 */
export function parseTacklers(rawText) {
  // Plays often carry trailing clauses after the action — replay reviews,
  // injury updates, the penalty summary. Their parentheticals are not tackles,
  // so cut the description at the first one before scanning backwards.
  const action = String(rawText ?? '').split(
    /\n|\*\* Injury Update|The Replay Official|PENALTY on| was injured during the play/i,
  )[0];
  const groups = [...action.matchAll(/\(([^)]+)\)/g)];
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const before = action.slice(0, groups[i].index);
    // The parenthetical immediately after FUMBLES identifies who forced it;
    // it is not a generic tackle group even though it uses the same initials.
    if (/FUMBLES\s*$/i.test(before)) continue;
    // "field goal is BLOCKED (G.Stewart)" names the blocker, not a tackler.
    if (/BLOCKED\s*$/i.test(before)) continue;
    // "(A; B)" is an assisted tackle and "(A, B)" a shared one (a split
    // sack, say). Both name two defenders.
    const parts = groups[i][1].split(/[;,]/).map((part) => part.trim()).filter(Boolean);
    if (parts.length && parts.every((part) => TACKLER_PART.test(part))) return parts;
  }
  return [];
}

/**
 * Quarterback hits from the official description: the gamebook writes the
 * defender who hit the passer in square brackets ("... for 2 yards (Y.Diaby)
 * [T.Smith]."). Read from the action itself, before any trailing clause.
 */
export function parseQuarterbackHitters(rawText) {
  const action = String(rawText ?? '').split(
    /\n|\*\* Injury Update|The Replay Official|PENALTY on| was injured during the play/i,
  )[0];
  return [...action.matchAll(/\[([^\]]+)\]/g)]
    .flatMap((group) => group[1].split(/[;,]/))
    .map((part) => part.trim())
    .filter((part) => TACKLER_PART.test(part));
}

const DEFENSIVE_NAME = new RegExp(`^(?:\\d+-)?(?:${ABBREV}|${NAME})$`);

function cleanDefensiveName(value) {
  const name = String(value ?? '')
    .trim()
    .replace(/^[A-Z]{2,3}-/, '')
    .replace(/^\d+-/, '')
    .replace(/[.,;:]+$/, '')
    .trim();
  return DEFENSIVE_NAME.test(name) ? name : null;
}

/**
 * Defensive credits that the official gamebook text states explicitly.
 *
 * This is deliberately separate from the compact-play grammar. A provider can
 * introduce a new `short_text` shape while its official sentence still says
 * exactly who made the sack, tackle, interception, force, or recovery. Only
 * role-bearing clauses qualify; a defender who is merely mentioned elsewhere
 * in an unfamiliar sentence is not returned.
 */
export function parseDefensiveActors(rawText, { typeSlug = null } = {}) {
  const text = authoritativeText(rawText);
  if (!text.trim()) return [];

  const actors = [];
  const seen = new Set();
  const add = (role, rawName, extra = {}) => {
    const name = cleanDefensiveName(rawName);
    if (!name) return;
    const key = `${role}:${name.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    actors.push({
      role,
      name,
      abbreviated: name.includes('.'),
      detail: null,
      ...extra,
    });
  };

  const interception = parseInterception(text);
  if (interception?.defender) add(PLAY_ROLES.INTERCEPTER, interception.defender);
  const summaryInterception = /^(.+?)\s+-?\d+\s+Yd Interception Return\b/i.exec(text.trim());
  if (!interception && summaryInterception) {
    add(PLAY_ROLES.INTERCEPTER, summaryInterception[1]);
  }

  const fumble = parseFumble(text);
  const fumbleCredit = parseFumbleCredit(text);
  if (fumbleCredit) {
    String(fumbleCredit.forcedBy ?? '')
      .split(';')
      .map((name) => name.trim())
      // "FUMBLES (Aborted)" is a botched snap, not a defender.
      .filter((name) => TACKLER_PART.test(name))
      .forEach((name) => add(PLAY_ROLES.FORCER, name));
  }
  if (fumble) add(PLAY_ROLES.RECOVERER, fumble.recoveredBy, { team: canonicalTeam(fumble.recoveredByTeam) });

  const tacklers = parseTacklers(text);
  const sack = /\bsack(?:ed)?\b/i.test(`${typeSlug ?? ''} ${text}`);
  // On an incomplete pass the parenthetical names the defender who broke it
  // up ("... incomplete short right to C.Otton (K.Benton)."), not a tackler.
  const incomplete = !sack && (/incompletion/i.test(String(typeSlug ?? '')) || /\bpass incomplete\b/i.test(text));
  if (incomplete) {
    tacklers.forEach((name) => add(PLAY_ROLES.PASS_DEFENDER, name));
  } else if (sack) {
    const byClause = /\bsacked by (.+?)(?:\s+for\b|\s+at\b|[.,]|$)/i.exec(text)?.[1] ?? null;
    const subjectClause = /^(?:\([^)]*\)\s*)?(.+?)\s+sacked\s+(?!at\b|for\b|ob\b)/i.exec(text)?.[1] ?? null;
    const explicit = cleanDefensiveName(byClause) ?? cleanDefensiveName(subjectClause);
    // "(sack split by Z.Allen and N.Bonitto)": a half sack each.
    const split = new RegExp(`sack split by (${ABBREV}) and (${ABBREV})`, 'i').exec(text);
    if (split) [split[1], split[2]].forEach((name) => add(PLAY_ROLES.SACKER, name));
    else if (explicit) add(PLAY_ROLES.SACKER, explicit);
    // A sack-fumble's last tackle group can be the one that stopped the
    // recovery return; the sack's own is the one before FUMBLES.
    else {
      const fumbleAt = text.search(/\bFUMBLES\b/i);
      (fumbleAt >= 0 ? parseTacklers(text.slice(0, fumbleAt)) : tacklers).forEach((name) => add(PLAY_ROLES.SACKER, name));
    }
  } else {
    tacklers.forEach((name) => add(PLAY_ROLES.TACKLER, name));
  }

  const tackledBy = /\btackled by (.+?)(?:[.,;]|$)/i.exec(text)?.[1] ?? null;
  if (!tacklers.length && tackledBy && !incomplete) add(PLAY_ROLES.TACKLER, tackledBy);

  const defendedBy = /(?:pass (?:defended|defensed|broken up)|broken up) by (.+?)(?:[.,;]|$)/i.exec(text)?.[1] ?? null;
  if (defendedBy) add(PLAY_ROLES.PASS_DEFENDER, defendedBy);

  const hitBy = /\b(?:quarterback|QB) hit by (.+?)(?:[.,;]|$)/i.exec(text)?.[1] ?? null;
  if (hitBy) add(PLAY_ROLES.QB_HITTER, hitBy);
  parseQuarterbackHitters(text).forEach((name) => add(PLAY_ROLES.QB_HITTER, name));

  const blockedBy = new RegExp(`\\b(?:kick|punt|field goal|extra point)(?: is)? blocked by (${ABBREV})`, 'i').exec(text)?.[1]
    ?? /\b(?:kick|punt|field goal|extra point)(?: is)? blocked by ([^.,;]+?)(?:[.,;]|$)/i.exec(text)?.[1]
    ?? new RegExp(`\\bBLOCKED \\((${ABBREV})\\)`).exec(text)?.[1]
    ?? null;
  if (blockedBy) add(PLAY_ROLES.KICK_BLOCKER, blockedBy);

  if (/\bsafety\b/i.test(text)) {
    tacklers.forEach((name) => add(PLAY_ROLES.SAFETY, name));
  }

  return actors;
}

// Plays whose sentence names a passer who can be hit on the throw. A sack is
// already the hit.
const QB_HIT_KINDS = new Set(['pass', 'passing-touchdown', 'incompletion']);

// An aborted snap is a carry for no gain in Sleeper's lines; the yards the
// ball rolled back are not the quarterback's rushing yards.
const SCRIMMAGE_KINDS = new Set(['pass', 'rush', 'passing-touchdown', 'fumble', 'snap-lateral', 'aborted-snap']);

const DIRECTION = /\b(?:scrambles )?(?:up the middle|left end|right end|left tackle|right tackle|left guard|right guard|(?:short|deep) (?:left|middle|right))\b/i;

function parseDirection(rawText) {
  return DIRECTION.exec(String(rawText ?? ''))?.[0]?.toLowerCase() ?? null;
}

/**
 * Fold short_text's yardage spellings into one shape before matching.
 *
 * The same outcome is written several ways — "Rush, Loss of 1 Yd",
 * "Rush, No Gain", "for Loss of 3 Yds to", "for 1 Yd to". Normalizing them to a
 * signed number keeps the grammar table small instead of doubling every rule.
 */
/**
 * A touchdown's try written into the same row: short_text appends it in
 * parentheses ("Kyle Pitts Sr. 10 Yd pass from Michael Penix Jr. (Michael
 * Penix Jr. Pass to Zachariah Branch for Two-Point Conversion)", "... 1 Yd Rush
 * (Two-Point Pass Conversion Failed)"). It is a separate down with its own
 * players, so it is taken out before the base grammar runs and returned on its
 * own. `good` is null for a shape this parser does not know.
 */
const TWO_POINT_CLAUSE = /\s*\(([^()]*Two-Point[^()]*)\)/i;

function splitTwoPointClause(shortText) {
  const match = TWO_POINT_CLAUSE.exec(shortText);
  if (!match) return { base: shortText, conversion: null };
  const base = `${shortText.slice(0, match.index)}${shortText.slice(match.index + match[0].length)}`.trim();
  const clause = match[1].trim();
  if (/\bfailed\b/i.test(clause)) return { base, conversion: { good: false, actors: [] } };
  const pass = rx(`(${NAME}) Pass to (${NAME}) for Two-Point Conversion`).exec(clause);
  if (pass) {
    return {
      base,
      conversion: {
        good: true,
        actors: [
          { role: PLAY_ROLES.PASSER, name: pass[1], abbreviated: false, detail: null },
          { role: PLAY_ROLES.RECEIVER, name: pass[2], abbreviated: false, detail: null },
        ],
      },
    };
  }
  const run = rx(`(${NAME}) (?:Run|Rush) for Two-Point Conversion`).exec(clause);
  if (run) {
    return {
      base,
      conversion: { good: true, actors: [{ role: PLAY_ROLES.RUSHER, name: run[1], abbreviated: false, detail: null }] },
    };
  }
  return { base, conversion: { good: null, actors: [] } };
}

function canonicalizeShortText(shortText) {
  return shortText
    // ESPN/BDL replace some defensive-touchdown play descriptions with the
    // scoring-summary form and append the ensuing conversion in parentheses:
    // "Wade Woodaz 80 Yd Interception Return (Ka'imi Fairbairn Kick)".
    // The kick is a separate snap and must not become an actor in this play.
    .replace(/((?:Interception|Fumble) (?:Return|Recovery))\s+\([^)]+\s+(?:Kick|Extra Point)\)$/i, '$1')
    // A return stopped where it was caught: "Kris Abrams-Draine Interception
    // Return, No Gain", "Alex Bachman Punt Return, No Gain".
    .replace(/ (Interception|Punt|Kickoff) Return, No Gain\b/gi, (_, kind) => ` 0 Yd ${kind} Return`)
    .replace(/ Rush, Loss of (\d+)(?: Yds?)?\b/i, (_, yards) => ` -${yards} Yd Rush`)
    .replace(/ Rush, No Gain\b/i, ' 0 Yd Rush')
    .replace(/ for Loss of (\d+) Yds?\b/i, (_, yards) => ` for -${yards} Yds`)
    .replace(/ for No Gain\b/i, ' for 0 Yds')
    .replace(/ for (-?\d+) Yd to /i, (_, yards) => ` for ${yards} Yds to `);
}

/**
 * Strip a trailing "{Penalized Player} {N} Yd Pnlty" from short_text.
 *
 * The penalty summary is appended to whatever the base play was, with no
 * delimiter, and the player's name can be one to four tokens. Rather than guess,
 * try each split and keep the first remainder that fully matches a base
 * grammar — the grammar match is the validation.
 */
const GENERATIONAL = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

// The surname is the last token that isn't a generational suffix — the
// abbreviated form in the official description drops those ("Harold Fannin Jr."
// is written "H.Fannin").
function lastNameToken(tokens) {
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    if (!GENERATIONAL.has(letters(tokens[i]))) return tokens[i];
  }
  return tokens[tokens.length - 1];
}

function letters(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z]/g, '');
}

function stripPenaltySuffix(shortText, penalty) {
  const tail = /\s+(\d+) Yd Pnlty\s*$/.exec(shortText);
  if (!tail) return shortText;
  const head = shortText.slice(0, tail.index);
  const tokens = head.split(' ');

  // The official description abbreviates the penalized player as "A.Jackson",
  // which pins both ends of their name in short_text: the dropped span must
  // start with that initial and end with that surname. Checking only the
  // surname is not enough — a shorter split can still satisfy a grammar and
  // silently absorb half the name into the previous one ("CeeDee Lamb Adoree'").
  const abbreviated = /^([A-Za-z])[^.]*\.\s*(.+)$/.exec(penalty?.name ?? '');
  const initial = abbreviated?.[1]?.toLowerCase() ?? null;
  const surname = letters(abbreviated?.[2] ?? '');

  // A full name first (two to four words), then a lone surname: "… Antonio
  // Williams Osa Odighizuwa" drops "Osa Odighizuwa", not just "Odighizuwa".
  for (const drop of [2, 3, 4, 1]) {
    if (drop >= tokens.length) continue;
    const dropped = tokens.slice(tokens.length - drop);
    if (initial && dropped[0][0].toLowerCase() !== initial) continue;
    if (surname && letters(lastNameToken(dropped)) !== surname) continue;
    const candidate = tokens.slice(0, tokens.length - drop).join(' ').trim();
    // Validate the canonical form: "Rush, No Gain" only matches once rewritten.
    if (GRAMMARS.some((grammar) => grammar.pattern.test(canonicalizeShortText(candidate)))) return candidate;
  }
  return head.trim();
}

function administrativeNarrative(play) {
  const slug = play.typeSlug;
  const text = String(play.rawText ?? play.description ?? '').trim();
  if (slug === 'two-minute-warning') return { label: 'Two-minute warning', sentence: 'Two-minute warning.' };
  if (slug === 'end-of-game') return { label: 'End of game', sentence: 'End of game.' };
  if (slug === 'end-of-half') return { label: 'End of half', sentence: 'End of the half.' };
  if (slug === 'end-of-regulation') return { label: 'End of regulation', sentence: 'End of regulation.' };
  if (slug === 'end-period') {
    const quarter = /QUARTER (\d)/i.exec(text)?.[1];
    return { label: 'End of quarter', sentence: quarter ? `End of the ${ordinal(Number(quarter))} quarter.` : 'End of the quarter.' };
  }
  if (slug === 'official-timeout') return { label: 'Official timeout', sentence: 'Official timeout.' };
  const team = /Timeout #\d+ by ([A-Z]{2,3})/i.exec(text)?.[1];
  return { label: 'Timeout', sentence: team ? `Timeout, ${team.toUpperCase()}.` : 'Timeout.' };
}

function ordinal(value) {
  return ['', '1st', '2nd', '3rd', '4th'][value] ?? `${value}th`;
}

function yardPhrase(yards) {
  const magnitude = Math.abs(yards);
  return `${magnitude} yard${magnitude === 1 ? '' : 's'}`;
}

// "an 8-yard touchdown", not "a 8-yard touchdown". English takes "an" before
// the numerals that are spoken with a leading vowel: 8, 11, 18, and the 80s.
function article(value) {
  const magnitude = Math.abs(value);
  return [8, 11, 18].includes(magnitude) || (magnitude >= 80 && magnitude <= 89) ? 'an' : 'a';
}

// Attributive form: "an 8-yard touchdown" rather than "an 8 yards touchdown".
function yardModifier(yards) {
  return `${article(yards)} ${Math.abs(yards)}-yard`;
}

function buildSentence(kind, parsed, { touchdown, tacklerNames, penalty, kneel = false, passDefenderNames = [], forcerNames = [] }) {
  const [first, second] = parsed.actors;
  const gain = parsed.yards;
  const tackle = tacklerNames.length
    ? `, tackled by ${listNames(tacklerNames)}`
    : '';

  switch (kind) {
    case 'pass':
      if (touchdown) return `${first.name} found ${second.name} for ${yardModifier(gain)} touchdown.`;
      if (gain === 0) return `${first.name} found ${second.name} for no gain${tackle}.`;
      return `${first.name} found ${second.name} for ${gain < 0 ? 'a loss of ' : ''}${yardPhrase(gain)}${tackle}.`;
    case 'passing-touchdown':
      return `${first.name} found ${second.name} for ${yardModifier(parsed.yards)} touchdown.`;
    case 'incompletion': {
      const brokenUp = passDefenderNames.length ? `, broken up by ${listNames(passDefenderNames)}` : '';
      return second
        ? `${first.name} incomplete, intended for ${second.name}${brokenUp}.`
        : brokenUp ? `${first.name} incomplete${brokenUp}.` : `${first.name} threw it away incomplete.`;
    }
    case 'rush':
      if (touchdown) return `${first.name} ran it in from ${yardPhrase(gain)} out.`;
      // A kneel-down is scored as a run, but it is a deliberate clock play.
      if (kneel) return `${first.name} took a knee${gain < 0 ? ` for a loss of ${yardPhrase(gain)}` : ''}.`;
      // "Stopped", not "dropped": a lost-yardage run must not read as a dropped pass.
      if (gain < 0) return `${first.name} was stopped for a loss of ${yardPhrase(gain)}${tackle}.`;
      if (gain === 0) return `${first.name} was stopped for no gain${tackle}.`;
      return `${first.name} ran for ${yardPhrase(gain)}${tackle}.`;
    case 'sack': {
      const sackers = parsed.actors.filter((actor) => actor.role === PLAY_ROLES.SACKER).map((actor) => actor.name);
      const loss = gain < 0 ? ` for a loss of ${yardPhrase(gain)}` : gain === 0 ? ' for no loss' : '';
      return sackers.length ? `${listNames(sackers)} sacked ${first.name}${loss}.` : `${first.name} was sacked${loss}.`;
    }
    case 'aborted-snap':
      return `${first.name} fumbled the snap.`;
    case 'return-touchdown':
      return `${first.name} returned ${parsed.kick === 'punt' ? 'a punt' : 'a kickoff'} ${yardPhrase(parsed.returnYards)}${touchdown ? ' for a touchdown' : ''}.`;
    case 'blocked-kick-return': {
      const blocked = parsed.blocker && parsed.kicker
        ? `${parsed.blocker} blocked ${possessive(parsed.kicker)} ${parsed.kick}, and `
        : parsed.blocker ? `${parsed.blocker} blocked the ${parsed.kick}, and ` : '';
      const lead = blocked ? `${blocked}${first.name} returned it` : `${first.name} returned a blocked ${parsed.kick}`;
      return `${lead} ${yardPhrase(parsed.returnYards)}${touchdown ? ' for a touchdown' : ''}.`;
    }
    case 'fumble-return':
      if (parsed.lead) {
        return `${parsed.lead} ${first.name} returned it ${yardPhrase(parsed.returnYards)}${touchdown ? ' for a touchdown' : ''}.`;
      }
      return `${first.name} recovered a fumble${parsed.returnYards > 0 ? ` and returned it ${yardPhrase(parsed.returnYards)}` : ''}${touchdown ? ' for a touchdown' : ''}.`;
    case 'safety':
      return `${first.name} recorded a safety.`;
    case 'snap-lateral': {
      const forced = parsed.forcer ? `${parsed.forcer} forced a fumble` : `${first.name} fumbled`;
      return `${parsed.holder} fumbled the snap and recovered it, then lateraled to ${first.name}, who gained ${gainWords(parsed.yards)}. ${forced}${parsed.outcome}.`;
    }
    case 'lateral-pass': {
      // "Bryce Young found Tetairoa McMillan, who lateraled to Jalen Coker."
      // Each carrier's share is in their own scoring line; the sentence keeps
      // the chain readable inside the feed's row length.
      const [catcher, ...rest] = parsed.carriers;
      const chain = rest.map((carrier) => `, who lateraled to ${carrier.name}`).join('');
      return `${parsed.passer} found ${catcher.name}${chain}${touchdown ? ' for a touchdown' : ''}.`;
    }
    case 'defensive-conversion':
      return `${parsed.scorer} returned the try for a defensive two-point conversion.`;
    case 'onside-kick': {
      const distance = parsed.distance ? ` ${parsed.distance} yards` : '';
      const outcome = parsed.outOfBounds ? ', out of bounds' : parsed.recoveredBy ? `, recovered by ${parsed.recoveredBy}` : '';
      // An onside kick's flag usually decides it (an illegal touch), so it is said.
      const flag = penalty && !penalty.declined ? ` Penalty on ${penalty.team}, ${penalty.infraction.toLowerCase()}.` : '';
      return `${first.name} kicked onside${distance}${outcome}.${flag}`;
    }
    case 'field-goal':
      if (!parsed.good && parsed.missDetail === 'blocked' && parsed.blocker) {
        return `${possessive(first.name)} ${parsed.distance} yard field goal was blocked by ${parsed.blocker}.`;
      }
      return parsed.good
        ? `${first.name} made a ${parsed.distance} yard field goal.`
        : `${first.name} missed a ${parsed.distance} yard field goal, ${parsed.missDetail}.`;
    case 'interception':
      if (parsed.pick) {
        // "Sam Darnold's pass for Tory Horton was intercepted by Kris
        // Abrams-Draine at the Denver 31."
        const { passer, target, spot, touchback } = parsed.pick;
        const thrown = passer ? `${possessive(passer)} pass${target ? ` for ${target}` : ''}` : 'The pass';
        const where = spot ? ` ${spot}` : '';
        const after = touchback && !(parsed.yards > 0) ? ' for a touchback'
          : parsed.yards > 0 ? ` and returned ${yardPhrase(parsed.yards)}${touchdown ? ' for a touchdown' : ''}`
            : touchdown ? ' for a touchdown' : '';
        return `${thrown} was intercepted by ${first.name}${where}${after}.`;
      }
      if (touchdown) {
        return `${first.name} intercepted the pass and returned it ${yardPhrase(parsed.yards)} for a touchdown.`;
      }
      return parsed.yards > 0
        ? `${first.name} intercepted the pass and returned it ${yardPhrase(parsed.yards)}.`
        : `${first.name} intercepted the pass.`;
    case 'fumble': {
      const recoverer = parsed.actors[2];
      const forced = forcerNames.length ? `, forced by ${listNames(forcerNames)}` : '';
      return `${first.name} fumbled${forced}, recovered by ${recoverer.name}${parsed.returnYards ? ` for ${yardPhrase(parsed.returnYards)}` : ''}.`;
    }
    case 'punt': {
      if (second) return `${first.name} punted ${parsed.distance} yards${returnPhrase(parsed.returnYards, second.name)}${tackle}.`;
      const outcome = parsed.outcome ? `, ${parsed.outcome}` : '';
      return `${first.name} punted ${parsed.distance} yards${outcome}.`;
    }
    case 'kickoff':
      if (parsed.touchback) return `${first.name} kicked off ${parsed.distance} yards for a touchback.`;
      if (second) return `${first.name} kicked off ${parsed.distance} yards${returnPhrase(parsed.returnYards, second.name)}${tackle}.`;
      return `${first.name} kicked off ${parsed.distance} yards.`;
    default:
      return penalty ? `Penalty: ${penalty.infraction}.` : null;
  }
}

function returnPhrase(yards, returner) {
  if (yards === 0) return `, returned for no gain by ${returner}`;
  if (yards < 0) return `, returned for a loss of ${yardPhrase(yards)} by ${returner}`;
  return `, returned ${yardPhrase(yards)} by ${returner}`;
}

/**
 * A fumble written after (or, on a kick, before) the play it ended:
 * "Trevor Lawrence Pass Complete for Loss of 1 Yd to Travis Hunter Travis
 * Hunter Fumble Teddye Buchanan 0 Yd Fumble Recovery". The play itself is
 * whatever base grammar the text reads as once the fumble clause is lifted out.
 *
 * The fumbler's name runs straight into the play before it, so each split is
 * tried and the base grammar match is the validation — as with penalties. The
 * fumbler must also be the player holding the ball in that play (the carrier,
 * the catch, the sacked passer, the returner); a fumble by anyone else (a
 * botched snap the quarterback then threw from) stays unparsed.
 */
const FUMBLE_CLAUSE = new RegExp(`^(.+?) Fumble(?: (${NAME}) (-?\\d+) Yd Fumble Recovery)?(?: (.+))?$`);
// Who can be holding the ball when it comes loose, by the kind of play. A
// passer named as the fumbler of a pass play fumbled the snap before throwing,
// which is a different order of events from the one the sentence would tell.
const BALL_CARRIER_ROLES = Object.freeze({
  pass: PLAY_ROLES.RECEIVER,
  rush: PLAY_ROLES.RUSHER,
  sack: PLAY_ROLES.PASSER,
  kickoff: PLAY_ROLES.RETURNER,
  punt: PLAY_ROLES.RETURNER,
  'aborted-snap': PLAY_ROLES.FUMBLER,
});

function matchGrammar(text) {
  for (const grammar of GRAMMARS) {
    const result = grammar.pattern.exec(text);
    if (result) return { kind: grammar.kind, parsed: grammar.build(result) };
  }
  return null;
}

function splitFumbleClause(text, rawText = '') {
  const clause = FUMBLE_CLAUSE.exec(text);
  if (!clause) return null;
  const snapFirst = isSnapFumbleFirst(rawText);
  const fumbledBy = snapFirst ? parseFumbleCredit(authoritativeText(rawText))?.fumbledBy : null;
  const [, head, recoverer, recoveryYards] = clause;
  let tail = clause[4]?.trim() ?? '';
  // The recoverer's own advance is written as a separate run after the
  // recovery ("Luke Farrell Rush, No Gain", already canonicalized to "0 Yd Rush").
  if (recoverer && tail.startsWith(`${recoverer} `) && /^-?\d+ Yd Rush$/.test(tail.slice(recoverer.length + 1))) tail = '';
  const tokens = head.split(' ');
  for (let drop = 1; drop <= 4 && drop <= tokens.length; drop += 1) {
    const fumbler = tokens.slice(tokens.length - drop).join(' ');
    const candidate = [tokens.slice(0, tokens.length - drop).join(' '), tail].filter(Boolean).join(' ');
    const matched = candidate ? matchGrammar(candidate) : null;
    if (!matched) continue;
    if (snapFirst) {
      // The snap came loose before the play: whoever the gamebook says fumbled
      // (a center, a quarterback, a running back taking the exchange), and the
      // play that followed is told after it.
      if (matched.kind === 'punt' || matched.kind === 'kickoff' || !sameAbbreviatedName(fumbler, fumbledBy)) continue;
    } else {
      const carrierRole = BALL_CARRIER_ROLES[matched.kind];
      if (!carrierRole || !matched.parsed.actors.some((actor) => actor.name === fumbler && actor.role === carrierRole)) continue;
    }
    return {
      ...matched,
      fumble: { fumbler, recoverer: recoverer ?? null, returnYards: recoverer ? Number(recoveryYards) : null, snap: snapFirst },
    };
  }
  return null;
}

/**
 * A muffed punt: the compact text adds the recovery to the punt
 * ("Tory Taylor 50 Yd Punt Zachariah Branch Punt Return, No Gain Josh Blackwell
 * 0 Yd Fumble Recovery"). Only when the official description says MUFFS — a
 * muff is not a fumble, and the returner is not charged with one.
 */
const MUFF_RECOVERY = / -?\d+ Yd Fumble Recovery(?= |$)/;

function splitMuffedPunt(text, rawText) {
  if (!/\bMUFFS\b/.test(authoritativeText(rawText))) return null;
  const recovery = MUFF_RECOVERY.exec(text);
  if (!recovery) return null;
  const head = text.slice(0, recovery.index).split(' ');
  const tail = text.slice(recovery.index + recovery[0].length).trim();
  // The recoverer's name runs on from the punt; each split is tried and the
  // punt grammar on the remainder is the validation.
  for (let drop = 1; drop <= 4 && drop < head.length; drop += 1) {
    const recoverer = head.slice(head.length - drop).join(' ');
    const matched = matchGrammar([head.slice(0, head.length - drop).join(' '), tail].filter(Boolean).join(' '));
    const returner = matched?.kind === 'punt' ? matched.parsed.actors.find((actor) => actor.role === PLAY_ROLES.RETURNER) : null;
    if (returner) return { ...matched, fumble: { fumbler: returner.name, recoverer, returnYards: 0, muff: true } };
  }
  return null;
}

function muffSentence(parsed, fumble, tackle) {
  const lead = `${parsed.actors[0].name} punted ${parsed.distance} yards. ${fumble.fumbler} muffed the catch`;
  if (fumble.recoverer !== fumble.fumbler) return `${lead}, recovered by ${fumble.recoverer}.`;
  const yards = parsed.returnYards;
  const advance = !yards ? '' : yards < 0 ? `, then lost ${yardPhrase(yards)}` : `, then returned it ${yardPhrase(yards)}`;
  return `${lead} and recovered it${advance}${tackle}.`;
}

// The fumbler picked the ball back up and kept the play going ("B.Mayfield to
// ATL 38 for -6 yards. FUMBLES, and recovers at ATL 42. B.Mayfield ran ob at
// ATL 27 for 15 yards"): a botched snap ahead of the real play.
function fumbleContinues(rawText) {
  const text = authoritativeText(rawText);
  const at = text.search(/\bFUMBLES\b/i);
  const fumbledBy = parseFumbleCredit(text)?.fumbledBy;
  if (at < 0 || !fumbledBy) return false;
  const name = fumbledBy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${name}\\s+(?:pass|ran|scrambles|to [A-Z]{2,3}\\b|(?:left|right|up)\\b)`, 'i').test(text.slice(at));
}

// "C.Humphrey" for "Creed Humphrey": first initial and surname, suffix ignored.
// "Ca.Jones" and "Bry.Thomas" carry more than one letter of the first name to
// tell teammates apart; a jersey prefix ("28-J.Jobe") is dropped.
function sameAbbreviatedName(full, abbreviated) {
  const short = /^(?:\d+-)?([A-Za-z]+)\.\s*(.+)$/.exec(abbreviated ?? '');
  if (!short || !full) return false;
  const tokens = full.split(' ');
  if (!letters(tokens[0]).startsWith(short[1].toLowerCase())) return false;
  // "A.St. Brown" carries a two-word surname.
  const surname = letters(short[2]);
  const core = tokens.filter((token) => !GENERATIONAL.has(letters(token)));
  return letters(core.at(-1)) === surname || letters(core.slice(-2).join('')) === surname;
}

/**
 * Every full name the game's compact texts spell out. The official description
 * only abbreviates ("S.Darnold"), so a sentence built from it reads the full
 * name back from here — the same person is written in full on their other
 * snaps. Pass the result to `parsePlayNarrative` as `nameHints`.
 */
export function collectPlayNames(rows = []) {
  const names = new Set();
  rows.forEach((row) => {
    const short = String(row?.short_text ?? row?.shortText ?? '').trim().replace(/\s+/g, ' ');
    if (!short) return;
    const text = canonicalizeShortText(splitTwoPointClause(short).base);
    const matched = matchGrammar(text) ?? splitFumbleClause(text) ?? null;
    matched?.parsed?.actors?.forEach((actor) => { if (actor.name && !actor.abbreviated) names.add(actor.name); });
    if (matched?.fumble?.fumbler) names.add(matched.fumble.fumbler);
    if (matched?.fumble?.recoverer) names.add(matched.fumble.recoverer);
  });
  return [...names];
}

/** The one full name in `names` an abbreviation can mean, else the abbreviation. */
export function resolvePlayerName(abbreviated, names = []) {
  if (!abbreviated) return null;
  const candidates = (names ?? []).filter((name) => sameAbbreviatedName(name, abbreviated));
  return candidates.length === 1 ? candidates[0] : abbreviated;
}

// "SEA 16" → "the Seattle 16". Cities two teams share read as the nickname.
const SHARED_CITY_TEAMS = new Set(['NYG', 'NYJ', 'LAC', 'LAR']);
const TEAM_NAME_KEYS = new Map([['WAS', 'wsh'], ['LAR', 'la']]);

export function spotPhrase(spot) {
  const match = /^([A-Z]{2,3})\s+(-?\d{1,2})$/.exec(String(spot ?? '').trim());
  if (!match) return null;
  const team = canonicalTeam(match[1]);
  const yard = Number(match[2]);
  if (yard <= 0) return 'in the end zone';
  if (yard === 50) return 'at midfield';
  const full = TEAM_NAMES[TEAM_NAME_KEYS.get(team) ?? team.toLowerCase()];
  if (!full) return `at the ${team} ${yard}`;
  const words = full.split(' ');
  const label = SHARED_CITY_TEAMS.has(team) ? words.at(-1) : words.slice(0, -1).join(' ');
  return `at the ${label} ${yard}`;
}

function possessive(name) {
  return `${name}${/s$/i.test(name) ? "'" : "'s"}`;
}

// The gamebook opens with the loose snap, before any play was run: "T.McKee
// Aborted. J.Majors FUMBLES …", "C.Humphrey to KC 28 for -5 yards. FUMBLES …",
// "B.Nix FUMBLES (Aborted) …". A run or catch names a direction or a pass first.
function isSnapFumbleFirst(rawText) {
  const text = authoritativeText(rawText);
  const at = text.search(/\bFUMBLES\b/);
  if (at < 0) return false;
  const before = text.slice(0, at)
    .replace(/^\s*(?:\([^)]*\)\s*)?/, '')
    .replace(/^(?:[^.]*\breported in as eligible\.\s*)+/i, '');
  return new RegExp(`^(?:${ABBREV})(?: Aborted\\.\\s*(?:${ABBREV}))?\\s*(?:to ${SPOT_TEXT} for (?:-?\\d+ yards?|no gain)\\.\\s*)?$`).test(before.trim());
}

// Follows the play's own sentence, so the carrier is already named: a forced
// fumble leads with the defender ("M.Starks forced a fumble, recovered by
// Teddye Buchanan."), which also keeps the pair inside the feed's row length.
function fumbleSentence(fumble, forcerNames, { snap = false, outOfBounds = false } = {}) {
  const lead = forcerNames.length && !snap
    ? `${listNames(forcerNames)} forced a fumble`
    : `${fumble.fumbler} ${snap ? 'fumbled the snap' : 'fumbled'}`;
  // No recovery in the compact text: the ball went out of bounds and stays
  // with the offense.
  if (!fumble.recoverer) return `${lead}${outOfBounds ? ' out of bounds' : ''}.`;
  if (fumble.recoverer === fumble.fumbler) {
    return lead.startsWith(fumble.fumbler) ? `${lead} and recovered it.` : `${lead}; ${fumble.fumbler} recovered it.`;
  }
  const advance = fumble.returnYards > 0 ? `, who returned it ${yardPhrase(fumble.returnYards)}` : '';
  return `${lead}, recovered by ${fumble.recoverer}${advance}.`;
}

// Names carrying their own trailing period ("Harold Fannin Jr.") would
// otherwise end a sentence with two.
function finishSentence(sentence) {
  return sentence.replace(/\.\.+/g, '.');
}

function listNames(names) {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

const KIND_LABELS = Object.freeze({
  pass: 'Pass',
  'passing-touchdown': 'Touchdown',
  incompletion: 'Incomplete',
  rush: 'Rush',
  sack: 'Sack',
  'field-goal': 'Field goal',
  'onside-kick': 'Onside kick',
  'return-touchdown': 'Kick return',
  'fumble-return': 'Fumble',
  'blocked-kick-return': 'Blocked kick',
  'lateral-pass': 'Lateral',
  safety: 'Safety',
  'defensive-conversion': 'Defensive conversion',
  interception: 'Interception',
  fumble: 'Fumble',
  punt: 'Punt',
  kickoff: 'Kickoff',
  penalty: 'Penalty',
});

// The full name this row's own compact text gives an abbreviation: "J.Coker"
// in "… Tetairoa McMillan Jalen Coker Fumble …" is "Jalen Coker".
function fullNameInText(abbreviated, text) {
  const short = /^(?:\d+-)?([A-Za-z]+)\.\s*(.+)$/.exec(abbreviated ?? '');
  if (!short || !text) return null;
  const surname = short[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // A two-word name first: "J.Coker" is "Jalen Coker", not "… Odunze Ozzy
  // Trapilo" when the name runs on from the one before it.
  const suffix = '(?: (?:Jr\\.|Sr\\.|II|III|IV|V))?';
  const plain = new RegExp(`(?:^| )(${short[1]}[A-Za-z'’.-]* ${surname}${suffix})(?= |$)`).exec(text);
  if (plain) return plain[1];
  const middle = new RegExp(`(?:^| )(${short[1]}[A-Za-z'’.-]* [A-Z][A-Za-z'’.-]* ${surname}${suffix})(?= |$)`).exec(text);
  return middle ? middle[1] : null;
}

function nameFor(abbreviated, play, shortText) {
  if (!abbreviated) return null;
  const resolved = resolvePlayerName(abbreviated, play.nameHints ?? []);
  return resolved !== abbreviated ? resolved : fullNameInText(abbreviated, shortText) ?? abbreviated;
}

// A kick row the provider sent without compact text (a reversed ruling left it
// empty): its compact form is rebuilt from the standing official description
// so the ordinary grammars read it.
function shortTextFromGamebook(rawText, play) {
  const text = authoritativeText(rawText);
  const punt = new RegExp(`^\\s*(${ABBREV}) punts (\\d+) yards? to ${SPOT_TEXT}(?:, Center-${ABBREV})?\\.\\s*(?:(${ABBREV}) (?:to|pushed ob at|ran ob at) ${SPOT_TEXT} for (?:(-?\\d+) yards?|no gain)[^.]*\\.)?`).exec(text);
  if (!punt) return null;
  const name = (value) => nameFor(value, play, '');
  const kick = `${name(punt[1])} ${punt[2]} Yd Punt${punt[4] ? ` ${name(punt[4])} ${Number(punt[6] ?? 0)} Yd Punt Return` : ''}`;
  const fumble = new RegExp(`FUMBLES[^,]*,\\s*(?:touched at [A-Z]{2,3} \\d+,\\s*)?RECOVERED by [A-Z]{2,3}-(${ABBREV})`).exec(text);
  return fumble && punt[4] ? `${name(punt[4])} Fumble ${name(fumble[1])} 0 Yd Fumble Recovery ${kick}` : kick;
}

// "… Punt Return Micah McFadden Penalty Declined": a declined flag's player is
// appended like an accepted one. Each split is tried; the grammar validates.
function stripDeclinedPenalty(shortText) {
  const tail = /\s+Penalty Declined\s*$/.exec(shortText);
  if (!tail) return shortText;
  const tokens = shortText.slice(0, tail.index).split(' ');
  for (let drop = 1; drop <= 4 && drop < tokens.length; drop += 1) {
    const candidate = tokens.slice(0, tokens.length - drop).join(' ');
    if (matchGrammar(canonicalizeShortText(candidate))) return candidate;
  }
  return shortText;
}

/**
 * A completed pass with laterals, read from the official description
 * (`parsePassLaterals`). Names are filled from the row's compact text and the
 * game's other plays.
 */
function lateralNarrative(play, rawText, shortText) {
  const chain = parsePassLaterals(rawText);
  if (!chain) return null;
  const name = (value) => nameFor(value, play, shortText);
  const carriers = chain.carriers.map((carrier) => ({ ...carrier, name: name(carrier.name) }));
  const fumble = chain.fumble
    ? { fumbler: carriers.at(-1).name, recoverer: name(chain.fumble.recoveredBy), returnYards: chain.fumble.returnYards }
    : null;
  return {
    kind: 'lateral-pass',
    parsed: {
      passer: name(chain.passer),
      carriers,
      forcer: chain.fumble?.forcedBy ?? null,
      touchdown: chain.touchdown,
      actors: [
        { role: PLAY_ROLES.PASSER, name: name(chain.passer) },
        ...carriers.map((carrier) => ({ role: PLAY_ROLES.RECEIVER, name: carrier.name })),
      ],
    },
    fumble,
  };
}

/**
 * A loose snap the quarterback recovered and pitched on, ending in a second
 * fumble: "B.Mayfield to ATL 17 for -2 yards. FUMBLES, and recovers at ATL 18.
 * B.Mayfield to ATL 16 for 2 yards. Lateral to B.Irving to ATL 1 for 15 yards
 * (J.Bates). FUMBLES (J.Bates), ball out of bounds in End Zone, Touchback."
 * The compact text credits the carrier's run ("Bucky Irving 14 Yd Rush").
 */
function snapLateralNarrative(play, rawText, shortText) {
  const text = authoritativeText(rawText).trim();
  const spot = SPOT_TEXT;
  const chain = new RegExp(`^(?:\\([^)]*\\)\\s*)?(${ABBREV}) to ${spot} for -?\\d+ yards?\\.\\s*FUMBLES(?: \\([^)]*\\))?, and recovers at ${spot}\\.\\s*(${ABBREV}) to ${spot} for -?\\d+ yards?\\.\\s*Lateral to (${ABBREV}) to ${spot} for -?\\d+ yards?(?: \\(([^)]*)\\))?\\.\\s*FUMBLES(?: \\((${ABBREV})\\))?, (.+?)\\.?$`).exec(text);
  const run = new RegExp(`^(${NAME}) (-?\\d+) Yd Rush\\b`).exec(shortText ?? '');
  if (!chain || !run || chain[1] !== chain[4]) return null;
  const name = (value) => nameFor(value, play, shortText);
  const holder = name(chain[1]);
  const carrier = run[1];
  // Groups: holder, spot, spot, holder again, spot, lateral carrier, spot,
  // tacklers, forcer, outcome (SPOT_TEXT captures its own group).
  if (!sameAbbreviatedName(carrier, chain[6])) return null;
  const outcome = chain[10];
  const recovered = new RegExp(`RECOVERED by [A-Z]{2,3}-(${ABBREV})`).exec(outcome)?.[1] ?? null;
  const touchback = /touchback/i.test(outcome);
  if (!recovered && !touchback && !/out of bounds/i.test(outcome)) return null;
  return {
    kind: 'snap-lateral',
    parsed: {
      holder,
      yards: Number(run[2]),
      forcer: chain[9] ?? null,
      outcome: recovered ? `, recovered by ${name(recovered)}` : touchback ? ' out of the end zone for a touchback' : ' out of bounds',
      turnover: Boolean(recovered) || touchback,
      actors: [
        { role: PLAY_ROLES.RUSHER, name: carrier },
        // The gamebook's fumble reader only sees the first (unforced) fumble.
        ...(chain[9] ? [{ role: PLAY_ROLES.FORCER, name: chain[9], abbreviated: true }] : []),
      ],
    },
    fumbles: [
      { fumbler: holder, lost: false },
      { fumbler: carrier, lost: Boolean(recovered) || touchback },
    ],
  };
}

function gainWords(yards) {
  if (yards === 0) return 'no gain';
  return yards < 0 ? `a loss of ${yardPhrase(yards)}` : yardPhrase(yards);
}

// ── Penalties ───────────────────────────────────────────────────────────────
// "Byron Murphy II (Seattle, #91) was flagged for a face mask, 15 yards. Ball
// at the Denver 44." The number comes from roster data the surface supplies
// (`playerNumbers`, built with `buildPlayerNumbers`); the provider has none.

function numberKey(team, name) {
  const tokens = String(name ?? '').split(' ').filter((token) => !GENERATIONAL.has(letters(token)));
  return `${canonicalTeam(team)}|${tokens.map(letters).join(' ')}`;
}

/** `{ team, name, number }` rows → the lookup `parsePlayNarrative` reads as `playerNumbers`. */
export function buildPlayerNumbers(rows = []) {
  const numbers = {};
  rows.forEach(({ team, name, number }) => {
    if (!team || !name || number == null || String(number).trim() === '') return;
    numbers[numberKey(team, name)] = String(number).trim();
  });
  return numbers;
}

export function teamPlace(team) {
  const abbreviation = canonicalTeam(team);
  const full = TEAM_NAMES[TEAM_NAME_KEYS.get(abbreviation) ?? abbreviation.toLowerCase()];
  if (!full) return abbreviation;
  const words = full.split(' ');
  return SHARED_CITY_TEAMS.has(abbreviation) ? words.at(-1) : words.slice(0, -1).join(' ');
}

// Fouls read with an article ("a face mask", "an illegal block"); the rest
// are mass nouns ("holding", "pass interference", "offside").
const COUNTABLE_FOUL = /^(?:face mask|false start|delay of game|low block|chop block|horse collar tackle|personal foul|illegal (?:block|blindside block|forward pass|forward handoff|touch kick|bat|substitution|crackback block|peelback block|double-team block|shift|formation|motion|snap|kick)|kickoff out of bounds|kickoff short of landing zone|disqualification)/;

function foulWords(infraction) {
  const foul = String(infraction ?? '').toLowerCase().replace(/^(?:offensive|defensive) (?!too many)/, '').trim();
  return COUNTABLE_FOUL.test(foul) ? `${/^[aeiou]/.test(foul) ? 'an' : 'a'} ${foul}` : foul;
}

function flaggedWho(penalty, play, shortText) {
  const team = teamPlace(penalty.team);
  const name = penalty.name ? nameFor(penalty.name, play, shortText) : null;
  const number = name ? play.playerNumbers?.[numberKey(penalty.team, name)] ?? null : null;
  return name ? `${name} (${team}${number ? `, #${number}` : ''})` : team;
}

function flagClause(penalty, play, shortText) {
  if (penalty.offsetting?.length > 1) {
    const each = penalty.offsetting.map((flag) => `${flaggedWho(flag, play, shortText)} for ${foulWords(flag.infraction)}`);
    return `offsetting penalties were called on ${listNames(each)}`;
  }
  const yards = penalty.yards != null ? `, ${yardPhrase(penalty.yards)}` : '';
  return `${flaggedWho(penalty, play, shortText)} was flagged for ${foulWords(penalty.infraction)}${yards}`;
}

function capitalize(text) {
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

// Where the next snap is, from the provider's own end-of-play spot.
function ballSpot(play, penalty = null) {
  if (penalty?.offsetting?.length > 1) return ' The down is replayed.';
  const spot = String(play.endPossessionText ?? '').trim();
  const phrase = /^50$/.test(spot) ? 'at midfield' : spotPhrase(spot);
  return phrase && phrase !== 'in the end zone' ? ` Ball ${phrase}.` : '';
}

function withoutPeriod(sentence) {
  return String(sentence ?? '').replace(/\.\s*$/, '');
}

function wipedOutSentence({ kind, parsed, built, flag, spotAfter, touchdown, rawText }) {
  const actor = (role) => parsed.actors.find((entry) => entry.role === role)?.name ?? null;
  const butFlag = `, but ${flag}.${spotAfter}`;
  if (touchdown && kind !== 'field-goal') return `Touchdown called back: ${withoutPeriod(built)}${butFlag}`;
  if (kind === 'field-goal' && parsed.good) return `Field goal called back: ${withoutPeriod(built)}${butFlag}`;
  if (kind === 'interception') return `Interception erased: ${withoutPeriod(built)}${butFlag}`;
  if (/\bRECOVERED by\b/.test(rawText) && /\bFUMBLES\b/.test(rawText)) return `Fumble erased: ${withoutPeriod(built)}${butFlag}`;
  const after = ` ${capitalize(flag)}.${spotAfter}`;
  const gain = Number(parsed.yards);
  if (kind === 'rush' && gain > 0) return `${possessive(actor(PLAY_ROLES.RUSHER))} ${gain}-yard run didn't count.${after}`;
  if (kind === 'pass' && gain > 0) {
    return `${possessive(actor(PLAY_ROLES.PASSER))} ${gain}-yard pass to ${actor(PLAY_ROLES.RECEIVER)} didn't count.${after}`;
  }
  if (kind === 'sack') {
    const sackers = parsed.actors.filter((entry) => entry.role === PLAY_ROLES.SACKER).map((entry) => entry.name);
    if (sackers.length) return `${possessive(listNames(sackers))} sack of ${actor(PLAY_ROLES.PASSER)} didn't count.${after}`;
  }
  if ((kind === 'punt' || kind === 'kickoff') && Number(parsed.returnYards) > 0) {
    return `${possessive(actor(PLAY_ROLES.RETURNER))} ${parsed.returnYards}-yard return didn't count.${after}`;
  }
  return `${built}${after}`;
}


/**
 * Parse one normalized play into `{ confident, sentence, actors, ... }`.
 *
 * `confident: false` means the caller must render `play.rawText` verbatim —
 * `sentence` and `actors` are empty in that case.
 */
export function parsePlayNarrative(play) {
  if (!play) return { confident: false, actors: [], sentence: null, playKind: null, administrative: false };

  const slug = String(play.typeSlug ?? '').toLowerCase();
  if (ADMINISTRATIVE_SLUGS.has(slug)) {
    const { label, sentence } = administrativeNarrative(play);
    return { confident: true, administrative: true, playKind: slug, label, sentence, actors: [], yards: null, penalty: null };
  }

  // The provider has sent the literal string "null" for a missing compact text.
  const providedShort = String(play.shortText ?? '').trim().replace(/\s+/g, ' ');
  const { base: playShortText, conversion } = splitTwoPointClause(/^(?:null|undefined)$/i.test(providedShort) ? '' : providedShort);
  const shortText = playShortText;
  const rawText = String(play.rawText ?? play.description ?? '');
  const penalty = parsePenaltyClause(rawText);
  const compact = shortText || shortTextFromGamebook(rawText, play);
  if (!compact) return { confident: false, actors: [], sentence: null, playKind: slug, administrative: false, penalty };

  const base = canonicalizeShortText(penalty
    ? stripPenaltySuffix(stripDeclinedPenalty(compact), penalty)
    : stripDeclinedPenalty(compact));

  const split = matchGrammar(base) ? null : splitFumbleClause(base, rawText);
  // A fumbler who kept the play going after recovering is a loose snap told
  // in the wrong order, unless the gamebook shows the snap came first.
  const matched = matchGrammar(base)
    ?? (split && (split.fumble.snap || !fumbleContinues(rawText)) ? split : null)
    ?? splitMuffedPunt(base, rawText)
    ?? lateralNarrative(play, rawText, compact)
    ?? snapLateralNarrative(play, rawText, compact);

  if (!matched) {
    // A penalty that wiped out the play has no base grammar of its own. It is
    // still fully describable from the penalty clause alone. A declined flag
    // changed nothing, so it never stands in for the play.
    if (penalty && !penalty.declined) {
      const placed = penalty.yards == null && penalty.enforcedAt ? ` Ball placed ${spotPhrase(penalty.enforcedAt) ?? `at ${penalty.enforcedAt}`}.` : ballSpot(play);
      return {
        confident: true,
        administrative: false,
        playKind: 'penalty',
        label: KIND_LABELS.penalty,
        sentence: finishSentence(`${capitalize(flagClause(penalty, play, compact))}.${penalty.offsetting?.length > 1 ? ' The down is replayed.' : placed}`),
        actors: penalty.name
          ? [{ role: PLAY_ROLES.PENALIZED, name: penalty.name, abbreviated: true, detail: penalty.infraction }]
          : [],
        yards: null,
        penalty,
      };
    }
    return { confident: false, actors: [], sentence: null, playKind: slug, administrative: false, penalty };
  }

  const { kind, parsed, fumble = null, fumbles = null } = matched;
  // A defensive recovery read from its summary line only stands when the row
  // is that summary alone; with an official description the fumble's own
  // players (the sacked passer, say) would go unnamed.
  if (kind === 'fumble-return' && letters(rawText) !== letters(play.shortText)) {
    // A defensive score whose summary line replaced the play: told from the
    // gamebook when the fumble came on a sack, otherwise left to it.
    const standingText = authoritativeText(rawText);
    const sack = new RegExp(`(${ABBREV}) sacked at ${SPOT_TEXT} for (-?\\d+) yards? \\((${ABBREV})(?:[;,] (${ABBREV}))?\\)`).exec(standingText);
    if (!sack || !/\bFUMBLES\b/.test(standingText)) {
      return { confident: false, actors: [], sentence: null, playKind: slug, administrative: false, penalty };
    }
    const passer = nameFor(sack[1], play, compact);
    const sackers = [sack[4], sack[5]].filter(Boolean);
    const forcer = parseFumbleCredit(standingText)?.forcedBy?.split(';')[0]?.trim() ?? null;
    const forced = forcer && sackers.includes(forcer) ? ' and forced a fumble.' : forcer ? `. ${forcer} forced a fumble.` : ', and the ball came loose.';
    parsed.lead = `${listNames(sackers)} sacked ${passer} for ${gainWords(Number(sack[3]))}${forced}`;
    parsed.actors.push({ role: PLAY_ROLES.PASSER, name: passer, abbreviated: passer === sack[1] });
  }
  if (kind === 'onside-kick') {
    const standingText = authoritativeText(rawText);
    parsed.distance = Number(/\bkicks onside (\d+) yards?/i.exec(standingText)?.[1]) || null;
    parsed.outOfBounds = /\bout of bounds\b/i.test(standingText);
    parsed.recoveredBy = new RegExp(`RECOVERED by [A-Z]{2,3}-(${ABBREV})`, 'i').exec(standingText)?.[1]
      ?? new RegExp(`(${ABBREV}) \\(didn't try to advance\\)`, 'i').exec(standingText)?.[1]
      ?? null;
  }
  const touchdown = slug.includes('touchdown') || /TOUCHDOWN/.test(rawText);
  // The compact text spells a kneel-down as an ordinary "-1 Yd Rush"; only the
  // gamebook sentence ("J.Love kneels to GB 34 for -1 yards.") says otherwise.
  const kneel = kind === 'rush' && !touchdown && /\bkneels?\b/i.test(rawText);
  // With a fumble written after the play, the last tackle group may be the one
  // that stopped the recovery return — an offensive player. The play's own
  // tackle comes before FUMBLES.
  const standing = authoritativeText(rawText);
  const fumbleAt = fumble ? standing.search(/\bFUMBLES\b/i) : -1;
  // A loose snap comes first, so the play's own tackle follows it.
  const tackleText = fumbleAt < 0 ? rawText : fumble.snap ? standing.slice(fumbleAt) : standing.slice(0, fumbleAt);
  const tacklerNames = kind === 'incompletion' || kind === 'sack' || kind === 'aborted-snap' || kneel ? [] : parseTacklers(tackleText);
  // Defenders the official text credits beyond the tackle: who broke up the
  // pass, forced the fumble, or hit the quarterback. Every credited player
  // should be visible in the sentence, as tacklers already are.
  const defensiveActors = parseDefensiveActors(rawText, { typeSlug: slug });
  const defensiveNames = (role) => defensiveActors.filter((actor) => actor.role === role).map((actor) => actor.name);
  // The compact sack text without a sacker ("Deshaun Watson Sacked") leaves
  // the sacker and the yardage to the official description.
  if (kind === 'sack' && !parsed.actors.some((actor) => actor.role === PLAY_ROLES.SACKER)) {
    defensiveNames(PLAY_ROLES.SACKER).forEach((name) => parsed.actors.push({ role: PLAY_ROLES.SACKER, name, abbreviated: true }));
  }
  if (kind === 'sack' && parsed.yards == null) {
    // The sack's own clause first: on a sack-fumble the provider's yardage can
    // be the recovery, not the sack.
    const described = /\bsacked\b[^.]*?\bfor (-?\d+) yards?/i.exec(authoritativeText(tackleText))?.[1];
    parsed.yards = described != null ? Number(described) : Number.isFinite(play.statYardage) ? play.statYardage : null;
  }
  // Fumble actors join the list after the play's own, never `parsed.actors`:
  // the sentence builders read that positionally ("intended for <second>").
  const fumbleActors = [];
  if (fumble) {
    // The fumbler is already in the play as its carrier, catch, sacked passer,
    // or returner, and keeps that role: a second FUMBLER entry would be checked
    // against a different roster on a kick and credit the returner as a rusher.
    if (!parsed.actors.some((actor) => actor.name === fumble.fumbler)) {
      fumbleActors.push({ role: PLAY_ROLES.FUMBLER, name: fumble.fumbler });
    }
    // The compact text states the gain the catch or run is officially
    // credited with; the gamebook's "for N yards" is where the carrier was
    // when the ball came out, before the official adjustment for where it
    // went ("Pass Complete for No Gain" against "for 2 yards … touched at",
    // "9 Yd Rush" against "for 8 yards … and recovers"). Checked against
    // official stat lines for every scrimmage fumble in weeks 1–8 of 2026.
    // The gamebook stands in only when the compact text gives no yardage.
    if (SCRIMMAGE_KINDS.has(kind) && !fumble.snap && !fumble.muff && !Number.isFinite(parsed.yards)) {
      const gains = [...authoritativeText(tackleText).matchAll(/\bfor (?:(-?\d+) yards?|(no gain))/gi)];
      const last = gains.at(-1);
      if (last) parsed.yards = last[2] ? 0 : Number(last[1]);
    }
    if (fumble.recoverer && ![...parsed.actors, ...fumbleActors].some((actor) => actor.name === fumble.recoverer)) {
      fumbleActors.push({ role: PLAY_ROLES.RECOVERER, name: fumble.recoverer });
    }
  }
  // The compact interception text names only the defender. The thrower is in
  // the official description, and is charged with the interception.
  if (kind === 'interception') {
    const pick = parseInterception(rawText);
    const nameHints = play.nameHints ?? [];
    const passer = pick?.passer ? resolvePlayerName(pick.passer, nameHints) : null;
    if (pick) {
      parsed.pick = {
        passer,
        target: pick.intendedFor ? resolvePlayerName(pick.intendedFor, nameHints) : null,
        spot: spotPhrase(pick.at),
        touchback: /\btouchback\b/i.test(authoritativeText(rawText)),
      };
    }
    if (passer && !parsed.actors.some((actor) => actor.role === PLAY_ROLES.PASSER)) {
      parsed.actors.push({ role: PLAY_ROLES.PASSER, name: passer, abbreviated: passer === pick.passer });
    }
  }
  if (kind === 'blocked-kick-return' || (kind === 'field-goal' && parsed.missDetail === 'blocked')) {
    const blocker = defensiveNames(PLAY_ROLES.KICK_BLOCKER)[0] ?? null;
    parsed.blocker = blocker ? resolvePlayerName(blocker, play.nameHints ?? []) : null;
    const kicker = new RegExp(`(${ABBREV}) (?:punt|\\d+ yard field goal) is BLOCKED`).exec(authoritativeText(rawText))?.[1];
    parsed.kicker = kicker ? resolvePlayerName(kicker, play.nameHints ?? []) : null;
  }
  const passDefenderNames = kind === 'incompletion' ? defensiveNames(PLAY_ROLES.PASS_DEFENDER) : [];
  const forcerNames = kind === 'lateral-pass'
    ? [parsed.forcer].filter(Boolean)
    : kind === 'fumble' || fumble ? defensiveNames(PLAY_ROLES.FORCER) : [];
  const passerName = QB_HIT_KINDS.has(kind)
    ? parsed.actors.find((actor) => actor.role === PLAY_ROLES.PASSER)?.name ?? null
    : null;
  const qbHitterNames = passerName ? defensiveNames(PLAY_ROLES.QB_HITTER) : [];
  const direction = parseDirection(rawText);

  const actors = [
    ...[...parsed.actors, ...fumbleActors].map((actor) => ({ abbreviated: false, detail: null, ...actor })),
    ...tacklerNames.map((name) => ({ role: PLAY_ROLES.TACKLER, name, abbreviated: true, detail: null })),
    ...(penalty?.name ? [{ role: PLAY_ROLES.PENALIZED, name: penalty.name, abbreviated: true, detail: penalty.infraction }] : []),
  ];

  if (direction) {
    const carrier = actors.find((actor) => actor.role === PLAY_ROLES.RUSHER || actor.role === PLAY_ROLES.RECEIVER);
    if (carrier && !carrier.detail) carrier.detail = direction;
  }

  const outOfBounds = fumbleAt >= 0 && /\bout of bounds\b/i.test(standing.slice(fumbleAt));
  const sentenceTacklers = fumble ? tacklerNames.filter((name) => !forcerNames.includes(name)) : tacklerNames;
  const built = kind === 'aborted-snap' && fumble
    ? fumbleSentence(fumble, forcerNames, { snap: true })
    : fumble?.muff
      ? muffSentence(parsed, fumble, sentenceTacklers.length ? `, tackled by ${listNames(sentenceTacklers)}` : '')
      : fumble?.snap
        ? `${fumbleSentence(fumble, [], { snap: true })} ${buildSentence(kind, parsed, { touchdown, tacklerNames, penalty, kneel, passDefenderNames, forcerNames })}`
        : [
        // A tackler who forced the fumble is named once, in the fumble clause.
        buildSentence(kind, parsed, {
          touchdown,
          tacklerNames: sentenceTacklers,
          penalty,
          kneel,
          passDefenderNames,
          forcerNames,
        }),
        fumble ? fumbleSentence(fumble, forcerNames, { outOfBounds }) : null,
      ].filter(Boolean).join(' ');
  if (!built) return { confident: false, actors: [], sentence: null, playKind: slug, administrative: false, penalty };

  // A flag that wipes the play out entirely has to be said out loud — the
  // action sentence on its own would read as though the yards counted.
  const negated = penalty && /No Play/i.test(rawText);
  const tryResult = conversion?.good === true ? ' Two-point try good.'
    : conversion?.good === false ? ' Two-point try failed.'
      : '';
  const qbHit = qbHitterNames.length ? ` ${passerName} was hit by ${listNames(qbHitterNames)} on the throw.` : '';
  // An accepted flag is told after the play, with the next spot. A flag that
  // wiped the play out leads with what it cost — a score, a turnover, a gain —
  // and a play that lost nothing (an incompletion) just gains the flag.
  const flag = penalty && !penalty.declined ? flagClause(penalty, play, compact) : null;
  const spotAfter = flag ? ballSpot(play, penalty) : '';
  const sentence = finishSentence(negated
    ? wipedOutSentence({ kind, parsed, built, flag, spotAfter, touchdown, rawText })
    : `${built}${qbHit}${tryResult}${flag ? ` ${capitalize(flag)}.${spotAfter}` : ''}`);

  // The scoring summary appends the extra point to the touchdown row
  // ("Cam Skattebo 16 Yd Run (Dominic Zvada Kick)"). The kicker is credited
  // from this row, so they need their own sentence: the play sentence names
  // only the scorer.
  const kicker = parsed.patResult ? actors.find((actor) => actor.role === PLAY_ROLES.KICKER) : null;
  const scorerRole = kind === 'rush' ? PLAY_ROLES.RUSHER : kind === 'return-touchdown' ? PLAY_ROLES.RETURNER : PLAY_ROLES.RECEIVER;
  const scorer = actors.find((actor) => actor.role === scorerRole);
  const extraPoint = kicker && !negated
    ? {
        good: parsed.patResult === 'Kick',
        kicker: kicker.name,
        sentence: finishSentence(`${kicker.name} ${parsed.patResult === 'Kick' ? 'made the extra point' : /blocked/i.test(parsed.patResult) ? 'had the extra point blocked' : 'missed the extra point'}${scorer ? ` after a ${scorer.name} touchdown` : ''}.`),
      }
    : null;

  return {
    confident: true,
    administrative: false,
    playKind: touchdown && kind !== 'field-goal' ? 'touchdown' : kind,
    label: touchdown && kind !== 'field-goal' ? 'Touchdown' : kneel ? 'Kneel' : fumble ? KIND_LABELS.fumble : (KIND_LABELS[kind] ?? 'Play'),
    sentence,
    actors,
    yards: negated ? null : (play.statYardage ?? parsed.yards ?? null),
    // The yards the ball carrier or receiver is credited with. The provider's
    // stat_yardage nets in an accepted penalty ("ran for 8, holding enforced
    // behind the run" credits 2 but reads -18); short_text states the credit.
    creditedYards: negated || !SCRIMMAGE_KINDS.has(kind) || !Number.isFinite(parsed.yards) ? null : parsed.yards,
    conversion: negated ? null : conversion,
    distance: parsed.distance ?? null,
    // A kick return's yards stay here; a fumble written after the play keeps
    // its recovery advance apart, so it is never read as the kick return.
    returnYards: parsed.returnYards ?? null,
    fumble: negated ? null : fumble,
    // Every fumble on a snap that had more than one, in order, each with who
    // lost it; the matcher charges each fumbler (see livePlaysFeed).
    fumbles: negated ? null : fumbles,
    // The other side ended with the ball, so a new first down is theirs.
    turnover: Boolean(parsed.turnover),
    // A chain of carriers (laterals): the field animation draws it only from
    // confirmed lateral geometry, never as a plain catch.
    chain: kind === 'lateral-pass' || kind === 'snap-lateral',
    good: parsed.good ?? null,
    outcome: parsed.outcome ?? null,
    patResult: parsed.patResult ?? null,
    extraPoint,
    negated: Boolean(negated),
    penalty,
  };
}
