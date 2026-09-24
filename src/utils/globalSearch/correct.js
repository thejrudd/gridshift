// ── Bounded fuzzy correction ───────────────────────────────────────────────
// Corrects misspelled vocabulary words ("seahwaks" → "seahawks") before the
// parser gives up on a token. Player and team *names* are not corrected here —
// the trigram index handles those, because a name dictionary is far larger and
// changes with rosters.

import { CORRECTION_DICTIONARY } from './vocabulary.js';

// Tokens shorter than this are never corrected. NFL shorthand is dense with
// 2–3 character words that are one edit apart ("sea"/"sf", "lv"/"la", "wr"/"rb"),
// so correcting them turns a precise query into the wrong one.
const MIN_CORRECTABLE_LENGTH = 4;

function maxDistanceFor(length) {
  return length <= 7 ? 1 : 2;
}

/**
 * Optimal string alignment distance (Damerau-Levenshtein restricted to adjacent
 * transpositions), bounded by `max`.
 *
 * Transpositions matter here because they are the most common real typo:
 * "seahwaks" is one transposition from "seahawks" but two substitutions under
 * plain Levenshtein, which would put it out of range.
 *
 * Returns the distance when it is ≤ max, otherwise max + 1. Callers only ever
 * compare against max, so the exact distance beyond the bound is not computed.
 */
export function editDistanceWithin(a, b, max) {
  const source = String(a ?? '');
  const target = String(b ?? '');
  if (source === target) return 0;
  if (!Number.isFinite(max) || max < 0) return 1;
  if (Math.abs(source.length - target.length) > max) return max + 1;
  if (!source.length) return target.length <= max ? target.length : max + 1;
  if (!target.length) return source.length <= max ? source.length : max + 1;

  let previous = new Array(target.length + 1);
  let current = new Array(target.length + 1);
  let beforePrevious = new Array(target.length + 1);

  for (let j = 0; j <= target.length; j++) previous[j] = j;

  for (let i = 1; i <= source.length; i++) {
    current[0] = i;
    // Only the diagonal band within `max` can yield an in-bound distance;
    // everything outside it is already too far to recover.
    const from = Math.max(1, i - max);
    const to = Math.min(target.length, i + max);
    if (from > 1) current[from - 1] = max + 1;

    let rowBest = max + 1;
    for (let j = from; j <= to; j++) {
      const cost = source[i - 1] === target[j - 1] ? 0 : 1;
      let value = Math.min(
        previous[j] + 1,        // deletion
        current[j - 1] + 1,     // insertion
        previous[j - 1] + cost, // substitution
      );
      if (
        i > 1 && j > 1
        && source[i - 1] === target[j - 2]
        && source[i - 2] === target[j - 1]
      ) {
        value = Math.min(value, beforePrevious[j - 2] + 1); // transposition
      }
      current[j] = value;
      if (value < rowBest) rowBest = value;
    }
    if (to < target.length) current[to + 1] = max + 1;
    if (rowBest > max) return max + 1;

    const spent = beforePrevious;
    beforePrevious = previous;
    previous = current;
    current = spent;
  }

  return previous[target.length] <= max ? previous[target.length] : max + 1;
}

/**
 * Find the best vocabulary term for a token, or null when the token is already
 * valid, too short to risk correcting, or nothing is close enough.
 *
 * A two-edit correction additionally requires a matching first character. Long
 * tokens have many neighbours at distance 2, and people rarely mistype the first
 * letter of a word they know.
 */
export function correctToken(token, dictionary = CORRECTION_DICTIONARY) {
  const word = String(token ?? '').toLowerCase();
  if (word.length < MIN_CORRECTABLE_LENGTH) return null;

  const max = maxDistanceFor(word.length);
  let best = null;
  let bestDistance = max + 1;

  for (const candidate of dictionary) {
    if (candidate === word) return null; // already a known term
    // The candidate is held to the same length floor as the token. Correcting
    // *into* a short abbreviation is as destructive as correcting one: "lamr"
    // is one edit from the Rams' "lar", and treating it as a team abbreviation
    // buries the player the user was actually typing.
    if (candidate.length < MIN_CORRECTABLE_LENGTH) continue;
    if (Math.abs(candidate.length - word.length) > max) continue;

    const distance = editDistanceWithin(word, candidate, max);
    if (distance > max) continue;
    if (distance > 1 && candidate[0] !== word[0]) continue;

    if (
      distance < bestDistance
      // Deterministic tie-break so the same query always corrects the same way.
      || (distance === bestDistance && best !== null && candidate < best)
    ) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}
