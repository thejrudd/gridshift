// ── Search token index ─────────────────────────────────────────────────────
// Exact / prefix / trigram inverted indexes over record tokens. Pure data
// structures: this module knows nothing about players, teams, or routes.
//
// Only the record array is ever persisted or shipped. The maps are rebuilt in
// memory at load, which keeps the wire payload to the records themselves and
// costs a few tens of milliseconds for the whole corpus.

import { normalizePlayerName } from '../playerDrilldown.js';

const PREFIX_MAX_LENGTH = 6;
const TRIGRAM_PAD = '~';
const MIN_TRIGRAM_TOKEN_LENGTH = 3;

// Match quality tiers. Exact beats prefix beats fuzzy by a wide enough margin
// that no amount of fuzzy overlap can outrank a real prefix hit.
export const MATCH_EXACT = 6;
export const MATCH_PREFIX = 3;
export const MATCH_FUZZY_MAX = 2;

// Below this share of shared trigrams a match is noise rather than a typo.
const MIN_TRIGRAM_SIMILARITY = 0.4;

/**
 * Normalize free text for tokenizing: lowercase, strip accents and generational
 * suffixes, reduce punctuation to spaces. Shared with player drilldown matching
 * so an indexed name and a resolved name agree on identity.
 */
export function normalizeText(value) {
  return normalizePlayerName(value);
}

export function tokenizeText(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(' ').filter(Boolean) : [];
}

/**
 * Build the initialism for a name: "Jaxon Smith-Njigba" gives "jsn".
 *
 * This is how people actually type well-known players, and it is not reachable
 * by prefix or fuzzy matching from the full name.
 */
export function initialismOf(value) {
  const words = tokenizeText(value);
  if (words.length < 2) return '';
  return words.map((word) => word[0]).join('');
}

export function trigramsOf(token) {
  const padded = `${TRIGRAM_PAD}${token}${TRIGRAM_PAD}`;
  const grams = [];
  for (let i = 0; i + 3 <= padded.length; i++) grams.push(padded.slice(i, i + 3));
  return grams;
}

function addTo(map, key, recordIndex) {
  const bucket = map.get(key);
  if (bucket) bucket.add(recordIndex);
  else map.set(key, new Set([recordIndex]));
}

/**
 * Build the inverted indexes for a record array.
 *
 * Each record supplies `tokens`: the strings it should be findable by. Callers
 * are expected to have already added names, abbreviations, and initialisms.
 */
export function createIndex(records = []) {
  const exact = new Map();
  const prefix = new Map();
  const trigram = new Map();
  const firstChar = new Map();

  records.forEach((record, recordIndex) => {
    const seen = new Set();
    for (const rawToken of record.tokens ?? []) {
      const token = String(rawToken ?? '').toLowerCase();
      if (!token || seen.has(token)) continue;
      seen.add(token);

      addTo(exact, token, recordIndex);
      addTo(firstChar, token[0], recordIndex);

      const prefixLimit = Math.min(token.length, PREFIX_MAX_LENGTH);
      for (let length = 1; length <= prefixLimit; length++) {
        addTo(prefix, token.slice(0, length), recordIndex);
      }

      if (token.length >= MIN_TRIGRAM_TOKEN_LENGTH) {
        for (const gram of trigramsOf(token)) addTo(trigram, gram, recordIndex);
      }
    }
  });

  return { records, exact, prefix, trigram, firstChar };
}

/**
 * Score every record matching a single search term.
 *
 * Returns Map of record index to score. A record matching the term several ways
 * keeps its best score rather than accumulating, so a record with many tokens
 * does not outrank a better match simply by having more surface area.
 *
 * `fuzzy: false` restricts matching to exact and prefix hits. Callers use it for
 * terms already known to be spelled correctly, where trigram overlap only adds
 * noise.
 */
export function scoreTerm(index, term, { fuzzy = true } = {}) {
  const token = String(term ?? '').toLowerCase();
  const scores = new Map();
  if (!token) return scores;

  const keepBest = (recordIndex, score) => {
    const current = scores.get(recordIndex);
    if (current === undefined || score > current) scores.set(recordIndex, score);
  };

  for (const recordIndex of index.exact.get(token) ?? []) keepBest(recordIndex, MATCH_EXACT);

  const prefixKey = token.slice(0, PREFIX_MAX_LENGTH);
  for (const recordIndex of index.prefix.get(prefixKey) ?? []) keepBest(recordIndex, MATCH_PREFIX);

  if (fuzzy && token.length >= MIN_TRIGRAM_TOKEN_LENGTH) {
    const grams = trigramsOf(token);
    const overlap = new Map();
    for (const gram of grams) {
      for (const recordIndex of index.trigram.get(gram) ?? []) {
        overlap.set(recordIndex, (overlap.get(recordIndex) ?? 0) + 1);
      }
    }
    // A fuzzy match must also share the term's first letter. Similarity alone
    // cannot separate a typo from an unrelated word: "lamr"/"lamar" and
    // "wire"/"zaire" score identically. What separates them is that people
    // mistype the middle of a word, not its first letter.
    // An absent bucket means *no* record starts with this letter, so every fuzzy
    // candidate fails the gate. Treating an absent bucket as "no constraint"
    // would disable the gate exactly when it matters most.
    const hasFirstCharIndex = index.firstChar instanceof Map;
    const sameFirstChar = index.firstChar?.get(token[0]);
    for (const [recordIndex, shared] of overlap) {
      if (hasFirstCharIndex && !sameFirstChar?.has(recordIndex)) continue;
      const similarity = shared / grams.length;
      if (similarity < MIN_TRIGRAM_SIMILARITY) continue;
      keepBest(recordIndex, similarity * MATCH_FUZZY_MAX);
    }
  }

  return scores;
}

/**
 * Score records against every term, requiring all terms to match.
 *
 * AND across terms is what makes "seattle jaxon" narrow rather than widen: a
 * record has to account for each thing the user typed.
 */
export function scoreTerms(index, terms = []) {
  const usable = terms.map((term) => String(term ?? '').toLowerCase()).filter(Boolean);
  if (!usable.length) return new Map();

  let combined = null;
  for (const term of usable) {
    const termScores = scoreTerm(index, term);
    if (!termScores.size) return new Map();

    if (combined === null) {
      combined = termScores;
      continue;
    }
    const next = new Map();
    for (const [recordIndex, score] of termScores) {
      const previous = combined.get(recordIndex);
      if (previous !== undefined) next.set(recordIndex, previous + score);
    }
    if (!next.size) return new Map();
    combined = next;
  }

  return combined ?? new Map();
}
