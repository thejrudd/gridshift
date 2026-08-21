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

import { canonicalTeam } from './fieldGeometry.js';

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
  FUMBLER: 'fumbler',
  RECOVERER: 'recoverer',
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
  fumbler: 'Fumble',
  recoverer: 'Recovery',
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
  'end-of-game',
]);

// One or more capitalized tokens. Allows the punctuation real names carry:
// "Adoree' Jackson", "John Metchie III", "Amon-Ra St. Brown".
const NAME = "[A-Z][A-Za-z.'’-]*(?: [A-Z][A-Za-z.'’-]*)*";
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
    pattern: rx(`(${NAME}) (-?\\d+) Yd Rush(?: \\((${NAME}) (Kick|PAT Failed)\\))?`),
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
    pattern: rx(`(${NAME}) (\\d+) Yd pass from (${NAME})(?: \\((${NAME}) (Kick|PAT Failed)\\))?`),
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
    pattern: rx(`(${NAME}) (\\d+) Yd Interception Return`),
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
    pattern: rx(`(${NAME}) (\\d+) Yd Punt (${NAME}) (\\d+) Yd Punt Return`),
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
    kind: 'kickoff',
    pattern: rx(`(${NAME}) (\\d+) Yd Kickoff(, Touchback)?(?: (${NAME}) (\\d+) Yd Kickoff Return)?`),
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

const SPOT_TEXT = '([A-Z]{2,3}\\s+\\d{1,2})';
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
  const text = String(rawText ?? '');
  const match = /PENALTY on ([A-Z]{2,3})(?:-([^,]+))?, ([^,]+), (\d+) yards?/i.exec(text);
  if (!match) return null;
  return {
    // The description spells a handful of clubs the league's own way — a
    // Cleveland foul is written "on CLV". That belongs nowhere near a sentence
    // a reader sees, so it is folded to the spelling the rest of the app uses.
    team: canonicalTeam(match[1]),
    name: match[2]?.trim() || null,
    infraction: match[3].trim(),
    yards: Number(match[4]),
    declined: /, ?Penalty declined/i.test(text),
    enforcedAt: new RegExp(`enforced at ${SPOT_TEXT}`, 'i').exec(text)?.[1] ?? null,
    noPlay: /-\s*No Play/i.test(text),
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
  const picked = new RegExp(`INTERCEPTED by (${ABBREV}) at ${SPOT_TEXT}`, 'i').exec(text);
  if (!picked) return null;
  const tail = text.slice(picked.index + picked[0].length);
  const returned = new RegExp(`\\bto ${SPOT_TEXT} for (-?\\d+) yards?`, 'i').exec(tail);
  return {
    passer: new RegExp(`(${ABBREV}) pass`, 'i').exec(text)?.[1] ?? null,
    intendedFor: new RegExp(`intended for (${ABBREV})`, 'i').exec(text)?.[1] ?? null,
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
export function parseFumble(rawText) {
  const text = authoritativeText(rawText);
  const lost = new RegExp(`FUMBLES(?:\\s*\\(([^)]+)\\))?,?\\s*RECOVERED by ([A-Z]{2,3})-(${ABBREV}) at ${SPOT_TEXT}`, 'i').exec(text);
  if (!lost) return null;
  const tail = text.slice(lost.index + lost[0].length);
  const returned = new RegExp(`\\bto ${SPOT_TEXT} for (?:(-?\\d+) yards?|no gain)`, 'i').exec(tail);
  return {
    // The carrier is the first name in the description, once the formation note
    // that sometimes opens it is out of the way. Scanning the whole string
    // instead picked up a tackler out of the parenthetical before "FUMBLES".
    fumbledBy: new RegExp(`(${ABBREV})`).exec(text.replace(/^\s*\([^)]*\)\s*/, ''))?.[1] ?? null,
    forcedBy: lost[1]?.trim() || null,
    recoveredByTeam: lost[2],
    recoveredBy: lost[3],
    at: lost[4],
    returnTo: returned?.[1] ?? null,
    returnYards: returned ? Number(returned[2] ?? 0) : 0,
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
  const groups = action.match(/\(([^)]+)\)/g) ?? [];
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const parts = groups[i].slice(1, -1).split(';').map((part) => part.trim()).filter(Boolean);
    if (parts.length && parts.every((part) => TACKLER_PART.test(part))) return parts;
  }
  return [];
}

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
function canonicalizeShortText(shortText) {
  return shortText
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

  for (let drop = 1; drop <= 4 && drop < tokens.length; drop += 1) {
    const dropped = tokens.slice(tokens.length - drop);
    if (initial && dropped[0][0].toLowerCase() !== initial) continue;
    if (surname && letters(lastNameToken(dropped)) !== surname) continue;
    const candidate = tokens.slice(0, tokens.length - drop).join(' ').trim();
    if (GRAMMARS.some((grammar) => grammar.pattern.test(candidate))) return candidate;
  }
  return head.trim();
}

function administrativeNarrative(play) {
  const slug = play.typeSlug;
  const text = String(play.rawText ?? play.description ?? '').trim();
  if (slug === 'two-minute-warning') return { label: 'Two-minute warning', sentence: 'Two-minute warning.' };
  if (slug === 'end-of-game') return { label: 'End of game', sentence: 'End of game.' };
  if (slug === 'end-of-half') return { label: 'End of half', sentence: 'End of the half.' };
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

function buildSentence(kind, parsed, { touchdown, tacklerNames, penalty }) {
  const [first, second] = parsed.actors;
  const gain = parsed.yards;
  const tackle = tacklerNames.length
    ? `, tackled by ${listNames(tacklerNames)}`
    : '';

  switch (kind) {
    case 'pass':
      return touchdown
        ? `${first.name} found ${second.name} for ${yardModifier(gain)} touchdown.`
        : `${first.name} found ${second.name} for ${gain < 0 ? 'a loss of ' : ''}${yardPhrase(gain)}${tackle}.`;
    case 'passing-touchdown':
      return `${first.name} found ${second.name} for ${yardModifier(parsed.yards)} touchdown.`;
    case 'incompletion':
      return second
        ? `${first.name} incomplete, intended for ${second.name}.`
        : `${first.name} threw it away incomplete.`;
    case 'rush':
      if (touchdown) return `${first.name} ran it in from ${yardPhrase(gain)} out.`;
      if (gain < 0) return `${first.name} was dropped for a loss of ${yardPhrase(gain)}${tackle}.`;
      if (gain === 0) return `${first.name} was stopped for no gain${tackle}.`;
      return `${first.name} ran for ${yardPhrase(gain)}${tackle}.`;
    case 'sack':
      return `${second.name} sacked ${first.name} for a loss of ${yardPhrase(gain)}.`;
    case 'field-goal':
      return parsed.good
        ? `${first.name} made a ${parsed.distance} yard field goal.`
        : `${first.name} missed a ${parsed.distance} yard field goal, ${parsed.missDetail}.`;
    case 'interception':
      return parsed.yards > 0
        ? `${first.name} intercepted the pass and returned it ${yardPhrase(parsed.yards)}.`
        : `${first.name} intercepted the pass.`;
    case 'fumble': {
      const recoverer = parsed.actors[2];
      return `${first.name} fumbled, recovered by ${recoverer.name}${parsed.returnYards ? ` for ${yardPhrase(parsed.returnYards)}` : ''}.`;
    }
    case 'punt': {
      if (second) return `${first.name} punted ${parsed.distance} yards, returned ${yardPhrase(parsed.returnYards)} by ${second.name}${tackle}.`;
      const outcome = parsed.outcome ? `, ${parsed.outcome}` : '';
      return `${first.name} punted ${parsed.distance} yards${outcome}.`;
    }
    case 'kickoff':
      if (parsed.touchback) return `${first.name} kicked off ${parsed.distance} yards for a touchback.`;
      if (second) return `${first.name} kicked off ${parsed.distance} yards, returned ${yardPhrase(parsed.returnYards)} by ${second.name}${tackle}.`;
      return `${first.name} kicked off ${parsed.distance} yards.`;
    default:
      return penalty ? `Penalty: ${penalty.infraction}.` : null;
  }
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
  interception: 'Interception',
  fumble: 'Fumble',
  punt: 'Punt',
  kickoff: 'Kickoff',
  penalty: 'Penalty',
});

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

  const shortText = String(play.shortText ?? '').trim().replace(/\s+/g, ' ');
  const rawText = String(play.rawText ?? play.description ?? '');
  const penalty = parsePenaltyClause(rawText);
  if (!shortText) return { confident: false, actors: [], sentence: null, playKind: slug, administrative: false, penalty };

  const base = canonicalizeShortText(penalty ? stripPenaltySuffix(shortText, penalty) : shortText);

  let matched = null;
  for (const grammar of GRAMMARS) {
    const result = grammar.pattern.exec(base);
    if (result) {
      matched = { kind: grammar.kind, parsed: grammar.build(result) };
      break;
    }
  }

  if (!matched) {
    // A penalty that wiped out the play has no base grammar of its own. It is
    // still fully describable from the penalty clause alone.
    if (penalty) {
      return {
        confident: true,
        administrative: false,
        playKind: 'penalty',
        label: KIND_LABELS.penalty,
        sentence: `Penalty on ${penalty.team}, ${penalty.infraction.toLowerCase()}, ${yardPhrase(penalty.yards)}.`,
        actors: penalty.name
          ? [{ role: PLAY_ROLES.PENALIZED, name: penalty.name, abbreviated: true, detail: penalty.infraction }]
          : [],
        yards: null,
        penalty,
      };
    }
    return { confident: false, actors: [], sentence: null, playKind: slug, administrative: false, penalty };
  }

  const { kind, parsed } = matched;
  const touchdown = slug.includes('touchdown') || /TOUCHDOWN/.test(rawText);
  const tacklerNames = kind === 'incompletion' || kind === 'sack' ? [] : parseTacklers(rawText);
  const direction = parseDirection(rawText);

  const actors = [
    ...parsed.actors.map((actor) => ({ abbreviated: false, detail: null, ...actor })),
    ...tacklerNames.map((name) => ({ role: PLAY_ROLES.TACKLER, name, abbreviated: true, detail: null })),
    ...(penalty?.name ? [{ role: PLAY_ROLES.PENALIZED, name: penalty.name, abbreviated: true, detail: penalty.infraction }] : []),
  ];

  if (direction) {
    const carrier = actors.find((actor) => actor.role === PLAY_ROLES.RUSHER || actor.role === PLAY_ROLES.RECEIVER);
    if (carrier && !carrier.detail) carrier.detail = direction;
  }

  const built = buildSentence(kind, parsed, { touchdown, tacklerNames, penalty });
  if (!built) return { confident: false, actors: [], sentence: null, playKind: slug, administrative: false, penalty };

  // A flag that wipes the play out entirely has to be said out loud — the
  // action sentence on its own would read as though the yards counted.
  const negated = penalty && /No Play/i.test(rawText);
  const sentence = finishSentence(negated
    ? `${built} Wiped out by ${penalty.infraction.toLowerCase()} on ${penalty.team}.`
    : built);

  return {
    confident: true,
    administrative: false,
    playKind: touchdown && kind !== 'field-goal' ? 'touchdown' : kind,
    label: touchdown && kind !== 'field-goal' ? 'Touchdown' : (KIND_LABELS[kind] ?? 'Play'),
    sentence,
    actors,
    yards: negated ? null : (play.statYardage ?? parsed.yards ?? null),
    negated: Boolean(negated),
    penalty,
  };
}
