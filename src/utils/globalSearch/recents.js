// ── Recent searches ────────────────────────────────────────────────────────
// What the palette remembers between openings: the last queries typed and the
// last results opened. Stored on this device only (see persist.js) and never
// sent anywhere.
//
// Picks store a record's identity, not the record. Labels are read back from the
// live index when the palette renders, so a traded player or a renamed fantasy
// team never shows stale text, and a pick whose record has left the index is
// dropped rather than rendered as a row that opens nothing.

export const RECENTS_LIMIT = 8;

const MAX_QUERY_LENGTH = 120;

export function emptyRecents() {
  return { queries: [], picks: [] };
}

function pickKey(pick) {
  return `${pick.kind}:${pick.id}`;
}

function cleanQuery(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH);
}

/**
 * Coerce anything read from storage into a valid recents document. Storage is
 * outside the app's control, so a corrupt or foreign value yields empty recents
 * rather than an exception in the palette.
 */
export function normalizeRecents(raw) {
  if (!raw || typeof raw !== 'object') return emptyRecents();

  const queries = [];
  const seenQueries = new Set();
  for (const entry of Array.isArray(raw.queries) ? raw.queries : []) {
    const text = cleanQuery(entry?.text);
    const key = text.toLowerCase();
    if (!text || seenQueries.has(key)) continue;
    seenQueries.add(key);
    queries.push({ text, at: Number(entry.at) || 0 });
    if (queries.length >= RECENTS_LIMIT) break;
  }

  const picks = [];
  const seenPicks = new Set();
  for (const entry of Array.isArray(raw.picks) ? raw.picks : []) {
    if (!entry || typeof entry.kind !== 'string' || entry.id == null) continue;
    const pick = { kind: entry.kind, id: String(entry.id), at: Number(entry.at) || 0 };
    const key = pickKey(pick);
    if (seenPicks.has(key)) continue;
    seenPicks.add(key);
    picks.push(pick);
    if (picks.length >= RECENTS_LIMIT) break;
  }

  return { queries, picks };
}

/**
 * Move a query to the front. Case and spacing differences are the same query.
 */
export function addRecentQuery(recents, text, at = Date.now()) {
  const current = normalizeRecents(recents);
  const clean = cleanQuery(text);
  if (!clean) return current;
  const key = clean.toLowerCase();
  return {
    ...current,
    queries: [
      { text: clean, at },
      ...current.queries.filter((entry) => entry.text.toLowerCase() !== key),
    ].slice(0, RECENTS_LIMIT),
  };
}

/**
 * Move an opened result to the front.
 */
export function addRecentPick(recents, record, at = Date.now()) {
  const current = normalizeRecents(recents);
  if (!record?.kind || record.id == null) return current;
  const pick = { kind: record.kind, id: String(record.id), at };
  const key = pickKey(pick);
  return {
    ...current,
    picks: [pick, ...current.picks.filter((entry) => pickKey(entry) !== key)]
      .slice(0, RECENTS_LIMIT),
  };
}

export function hasRecents(recents) {
  return Boolean(recents?.queries?.length || recents?.picks?.length);
}

/**
 * Look recent picks up in the current index, newest first. Picks with no record
 * are skipped.
 */
export function resolveRecentPicks(recents, index) {
  const records = index?.records;
  if (!Array.isArray(records) || !recents?.picks?.length) return [];

  const wanted = new Map(recents.picks.map((pick, order) => [pickKey(pick), order]));
  const found = [];
  for (const record of records) {
    const order = wanted.get(`${record.kind}:${record.id}`);
    if (order === undefined) continue;
    found.push({ order, record });
    if (found.length === wanted.size) break;
  }
  return found.sort((a, b) => a.order - b.order).map(({ record }) => record);
}
