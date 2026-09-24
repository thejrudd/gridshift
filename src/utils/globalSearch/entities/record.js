// ── Search record helpers ──────────────────────────────────────────────────
// Every entity adapter emits records in this shape. Records must stay
// JSON-serializable: the same objects are written to the static build-time index
// and to IndexedDB.

import { initialismOf, normalizeText, tokenizeText } from '../tokenIndex.js';

export const KIND_PLAYER = 'player';
export const KIND_NFL_TEAM = 'nflTeam';
export const KIND_GAME = 'game';
export const KIND_FANTASY_TEAM = 'fantasyTeam';
export const KIND_APP_VIEW = 'appView';
export const KIND_COMMAND = 'command';

/**
 * Build the token set for a display name: each word, the whole normalized name,
 * and the initialism.
 *
 * The full normalized name is included so a multi-word exact match scores as one
 * strong hit rather than several weak ones.
 */
export function nameTokens(name) {
  const normalized = normalizeText(name);
  if (!normalized) return [];
  const tokens = tokenizeText(name);
  if (tokens.length > 1) {
    tokens.push(normalized);
    const initials = initialismOf(name);
    if (initials.length >= 2) tokens.push(initials);
  }
  return tokens;
}

export function makeRecord({
  kind,
  id,
  label,
  sublabel = '',
  tokens = [],
  route = null,
  command = null,
  weight = 0,
  meta = null,
}) {
  const unique = [];
  const seen = new Set();
  for (const raw of tokens) {
    const token = String(raw ?? '').toLowerCase().trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    unique.push(token);
  }

  const record = {
    kind,
    id: String(id),
    label,
    sublabel,
    tokens: unique,
    weight,
  };
  if (route) record.route = route;
  if (command) record.command = command;
  if (meta) record.meta = meta;
  return record;
}
