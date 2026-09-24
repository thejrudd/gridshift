// ── ESPN Smart Search Parser ───────────────────────────────────────────────
// Token-based approach: split query into words, match phrases against word
// sequences. Multi-word phrases (longer word count) tried before single words.
//
// The team/position/division phrase table now lives in the shared search
// vocabulary so the player browser and global search stay in agreement. It is
// re-exported here because existing call sites import it from this module.

export { SEARCH_PATTERNS } from './globalSearch/vocabulary.js';

import { SEARCH_PATTERNS } from './globalSearch/vocabulary.js';
// Stopwords stripped before name matching (natural language support)
const STOPWORDS = new Set([
  'in','on','the','a','an','for','at','from','who','are','is','playing',
  'plays','play','with','and','or','my','our','their','us','them','me',
  'number','jersey',
]);

/**
 * Parse a free-text query into structured filters.
 *
 * Tokenizes by whitespace/punctuation, then at each word position tries the
 * longest matching phrase first (greedy, position-first). Stopwords are
 * consumed and ignored, enabling natural-language queries like "RBs in Detroit".
 * Unrecognized tokens become name search terms.
 *
 * AND logic between categories; OR within a category.
 * Returns { pos: Set, team: Set, div: Set, conf: Set, number: Set, name: string[] }
 */
export function parseSearchQuery(q) {
  const filters = {
    pos: new Set(),
    team: new Set(),
    div: new Set(),
    conf: new Set(),
    number: new Set(),
    name: [],
  };
  const words = q.toLowerCase().trim().split(/[\s,#+&]+/).filter(Boolean);
  if (!words.length) return filters;

  const consumed = new Array(words.length).fill(false);
  const MAX_PHRASE_LEN = 3; // "san francisco 49ers" is 3 words

  for (let i = 0; i < words.length; i++) {
    if (consumed[i]) continue;

    // Consume stopwords without adding to name[]
    if (STOPWORDS.has(words[i])) { consumed[i] = true; continue; }

    // Jersey numbers are not part of the phrase table because they are
    // player data rather than a fixed vocabulary. Accept both "29" and
    // "#29", including leading-zero forms such as "00".
    const jerseyNumber = normalizeJerseyNumber(words[i]);
    if (jerseyNumber) {
      consumed[i] = true;
      filters.number.add(jerseyNumber);
      continue;
    }

    // Try longest phrase starting at i, down to 1 word
    for (let len = Math.min(MAX_PHRASE_LEN, words.length - i); len >= 1; len--) {
      const phrase = words.slice(i, i + len).join(' ');
      const entry = SEARCH_PATTERNS.find(([pat]) => pat === phrase);
      if (entry) {
        const [, tag] = entry;
        for (let j = 0; j < len; j++) consumed[i + j] = true;
        const vals = Array.isArray(tag.val) ? tag.val : [tag.val];
        for (const v of vals) filters[tag.type].add(v);
        break;
      }
    }
  }

  // Unconsumed tokens with ≥2 chars become name search terms
  filters.name = words.filter((_, i) => !consumed[i] && words[i].length >= 2);
  return filters;
}

/**
 * Normalize an NFL jersey number for query/player comparison.
 * NFL jersey numbers are 0–99; leading zeroes are equivalent ("00" → "0").
 */
export function normalizeJerseyNumber(value) {
  const raw = String(value ?? '').trim().replace(/^#/, '');
  if (!/^\d{1,2}$/.test(raw)) return '';

  const numeric = Number(raw);
  return numeric >= 0 && numeric <= 99 ? String(numeric) : '';
}

/**
 * Does a player jersey number match a parsed number filter.
 */
export function matchesJerseyNumber(playerNumber, filter) {
  const normalizedPlayerNumber = normalizeJerseyNumber(playerNumber);
  return Boolean(normalizedPlayerNumber) && normalizedPlayerNumber === String(filter);
}

/**
 * Does an ESPN position string match a filter group?
 * Used by both the Statistics player browser and the Compare tab.
 */
export function matchesFilter(position, filter) {
  if (filter === 'ALL') return true;
  if (filter === 'OL') return ['OT', 'OG', 'C', 'OL', 'G', 'T'].includes(position);
  if (filter === 'DL') return ['DE', 'DT', 'NT', 'DL', 'ED'].includes(position);
  if (filter === 'LB') return ['LB', 'ILB', 'OLB', 'MLB'].includes(position);
  if (filter === 'DB') return ['CB', 'S', 'SS', 'FS', 'DB'].includes(position);
  return position === filter;
}
