// ── Global search intent parser ────────────────────────────────────────────
// Turns a free-text query into structured slots. This is slot filling, not
// language understanding: every supported query is entities plus qualifiers,
// so a phrase table with typo tolerance covers the whole surface without a model.
//
// Strategy, per token position, longest phrase first:
//   1. week expressions ("week 3", "wk3") are lifted out in a pre-pass, so a
//      bare number after "week" is never mistaken for a jersey number
//   2. exact phrase lookup against the vocabulary
//   3. phrase lookup again with each word typo-corrected
//   4. standalone typo correction, then lookup
//   5. stopword, jersey number, season year
//   6. anything left is a name term

import {
  CORRECTION_DICTIONARY,
  MAX_PHRASE_LEN,
  PHRASE_WORD_DICTIONARY,
  STOPWORDS,
  lookupPhrase,
} from './vocabulary.js';
import { correctToken } from './correct.js';
import { normalizeJerseyNumber } from '../parseSearchQuery.js';

const WEEK_TRIGGERS = new Set(['week', 'wk', 'w']);
const MIN_SEASON = 1970;
const MAX_SEASON = 2100;

// Slot names by tag type, for the tags that accumulate into a list.
const LIST_SLOT_BY_TYPE = {
  team: 'teams',
  pos: 'positions',
  div: 'divisions',
  conf: 'conferences',
  stat: 'stats',
  intent: 'intents',
  command: 'commands',
};

// Slot names by tag type, for the tags where the last value wins.
const SINGLE_SLOT_BY_TYPE = {
  timeframe: 'timeframe',
  superlative: 'superlative',
  scope: 'scope',
  operator: 'operator',
  week: 'week',
};

function createSlots(raw) {
  return {
    raw,
    teams: [],
    positions: [],
    divisions: [],
    conferences: [],
    stats: [],
    intents: [],
    commands: [],
    jersey: [],
    nameTerms: [],
    softTerms: [],
    timeframe: null,
    superlative: null,
    scope: null,
    operator: null,
    week: null,
    season: null,
    // Words that were read as a team ("washington"), kept so ranking can try the
    // other reading — a player's surname — when the team reading finds nobody.
    teamWords: [],
    corrections: [],
    // Slot types that only exist because a token was typo-corrected. Consumers
    // that make a strong claim from a slot — an answer card, say — can require a
    // directly-typed one instead of a guess.
    correctedTypes: [],
  };
}

function pushUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}

// Tags whose words are also worth matching against record text. "standings" is
// an intent *and* the name of a destination; "matchup" likewise. Keeping the
// words as soft terms lets those destinations surface, while keeping them out of
// nameTerms means they never become a required term that filters real entities
// out of the results.
const SOFT_TERM_TYPES = new Set(['intent', 'superlative', 'command']);

function applyTag(slots, tag, words = []) {
  if (SOFT_TERM_TYPES.has(tag.type)) {
    for (const word of words) if (!slots.softTerms.includes(word)) slots.softTerms.push(word);
  }
  const values = Array.isArray(tag.val) ? tag.val : [tag.val];
  if (tag.type === 'team' && words.length) slots.teamWords.push({ words: [...words], teams: values });
  const listSlot = LIST_SLOT_BY_TYPE[tag.type];
  if (listSlot) {
    for (const value of values) pushUnique(slots[listSlot], value);
    return;
  }
  const singleSlot = SINGLE_SLOT_BY_TYPE[tag.type];
  if (singleSlot) slots[singleSlot] = values[0];
}

/**
 * Split "week3"/"wk3"/"w3" into separate tokens so the week pre-pass sees them.
 * Left alone otherwise, so a name like "w3" that is not a week stays intact only
 * when it fails the strict shape below.
 */
function expandGluedWeekTokens(text) {
  return text.replace(/\b(week|wk|w)(\d{1,2})\b/g, '$1 $2');
}

/**
 * Consume "week N" pairs before anything else looks at the tokens.
 *
 * This ordering is what makes "cardinals week 4" and "sea 11" both work: without
 * it the bare number is claimed as a jersey number by whichever rule runs first.
 */
function consumeWeekExpressions(words, consumed, slots) {
  for (let i = 0; i < words.length - 1; i++) {
    if (consumed[i] || !WEEK_TRIGGERS.has(words[i])) continue;
    const next = words[i + 1];
    if (!/^\d{1,2}$/.test(next)) continue;
    const week = Number(next);
    if (week < 1 || week > 22) continue;
    slots.week = week;
    consumed[i] = true;
    consumed[i + 1] = true;
  }
}

/**
 * Try the vocabulary at position `i`, longest phrase first, correcting typos
 * only after the exact form fails.
 *
 * Returns the number of words consumed, or 0.
 */
function matchPhraseAt(words, i, slots) {
  const limit = Math.min(MAX_PHRASE_LEN, words.length - i);

  for (let len = limit; len >= 1; len--) {
    const phraseWords = words.slice(i, i + len);
    const exact = lookupPhrase(phraseWords.join(' '));
    if (exact) {
      applyTag(slots, exact, phraseWords);
      return len;
    }

    if (len === 1) continue;
    // Multi-word phrase with a typo in one of its words. The surrounding words
    // constrain the correction, so a wider dictionary is safe here.
    const corrected = phraseWords.map((word) => correctToken(word, PHRASE_WORD_DICTIONARY) ?? word);
    if (corrected.every((word, index) => word === phraseWords[index])) continue;
    const tag = lookupPhrase(corrected.join(' '));
    if (!tag) continue;
    applyTag(slots, tag, corrected);
    phraseWords.forEach((word, index) => {
      if (word !== corrected[index]) slots.corrections.push({ from: word, to: corrected[index] });
    });
    return len;
  }

  return 0;
}

/**
 * Parse a query into search slots.
 *
 * A standalone token that only matches after correction is recorded in its slot
 * *and* kept as a name term. "moss" is one edit from the superlative "most", and
 * the parser has no way to know which was meant — so it emits both readings and
 * lets ranking decide on the evidence: a real player named Moss outscores a
 * superlative with no stat attached to it.
 */
export function parseGlobalQuery(query) {
  const raw = String(query ?? '');
  const slots = createSlots(raw);
  const words = expandGluedWeekTokens(raw.toLowerCase().trim())
    .split(/[\s,#+&]+/)
    .filter(Boolean);
  if (!words.length) return slots;

  const consumed = new Array(words.length).fill(false);
  consumeWeekExpressions(words, consumed, slots);

  for (let i = 0; i < words.length; i++) {
    if (consumed[i]) continue;

    const matched = matchPhraseAt(words, i, slots);
    if (matched) {
      for (let j = 0; j < matched; j++) consumed[i + j] = true;
      continue;
    }

    const word = words[i];

    if (STOPWORDS.has(word)) {
      consumed[i] = true;
      continue;
    }

    const jersey = normalizeJerseyNumber(word);
    if (jersey) {
      consumed[i] = true;
      pushUnique(slots.jersey, jersey);
      continue;
    }

    if (/^\d{4}$/.test(word)) {
      const year = Number(word);
      if (year >= MIN_SEASON && year <= MAX_SEASON) {
        consumed[i] = true;
        slots.season = year;
        continue;
      }
    }

    const correction = correctToken(word, CORRECTION_DICTIONARY);
    const tag = correction ? lookupPhrase(correction) : null;
    if (tag) {
      applyTag(slots, tag, [correction]);
      slots.corrections.push({ from: word, to: correction });
      if (!slots.correctedTypes.includes(tag.type)) slots.correctedTypes.push(tag.type);
      consumed[i] = true;
      // Keep the typo as a name reading where the correction can also identify
      // a record. A corrected position is a filter by itself; also requiring
      // "qaterback" in the player's name would exclude every quarterback.
      if (word.length >= 2 && tag.type !== 'pos') pushUnique(slots.nameTerms, word);
      continue;
    }

    if (word.length >= 2) pushUnique(slots.nameTerms, word);
  }

  return slots;
}

/**
 * True when the query carries no usable signal, so callers can show the guide
 * instead of an empty result list.
 */
export function isEmptyQuery(slots) {
  return !slots.teams.length
    && !slots.positions.length
    && !slots.divisions.length
    && !slots.conferences.length
    && !slots.stats.length
    && !slots.intents.length
    && !slots.commands.length
    && !slots.jersey.length
    && !slots.nameTerms.length
    && !slots.softTerms.length
    && slots.week == null
    && slots.season == null
    && slots.timeframe == null
    && slots.superlative == null;
}
