/**
 * Which keys this pairing already saw.
 *
 * The detector engine demotes a detector that fired for the same two teams in
 * recent weeks, so a pairing that meets twice in a season does not read the
 * same way both times. History is per-device convenience only — a cleared or
 * unavailable store simply means no demotion, never a broken panel.
 */

export const MATCHUP_PREVIEW_KEY_HISTORY_PREFIX = 'gridshift-matchup-preview-keys-v1:';
const RETAINED_WEEKS = 3;

const memoryStore = new Map();

function getStorage(storage) {
  try { return storage ?? globalThis.localStorage ?? null; } catch { return null; }
}

function storageKey({ leagueId, pairingId }) {
  return `${MATCHUP_PREVIEW_KEY_HISTORY_PREFIX}${encodeURIComponent(String(leagueId ?? ''))}:${encodeURIComponent(String(pairingId ?? ''))}`;
}

export function pairingId(seasonA, seasonB) {
  return [String(seasonA ?? ''), String(seasonB ?? '')].sort().join('|');
}

function readEntries(key, storage) {
  const target = getStorage(storage);
  if (target?.getItem) {
    try {
      const parsed = JSON.parse(target.getItem(key) ?? 'null');
      if (Array.isArray(parsed)) return parsed.filter((entry) => Number.isFinite(Number(entry?.week)) && Array.isArray(entry?.ids));
    } catch { /* fall through to memory */ }
  }
  return memoryStore.get(key) ?? [];
}

/** Detector ids used in recent, earlier weeks — most recent first. */
export function readRecentKeyIds({ leagueId, pairingId: pairing, week, storage } = {}) {
  const entries = readEntries(storageKey({ leagueId, pairingId: pairing }), storage);
  return entries
    .filter((entry) => Number(entry.week) !== Number(week))
    .sort((left, right) => Number(right.week) - Number(left.week))
    .slice(0, RETAINED_WEEKS)
    .flatMap((entry) => entry.ids.map(String));
}

export function recordKeyIds({ leagueId, pairingId: pairing, week, ids, storage } = {}) {
  if (!Number.isFinite(Number(week)) || !Array.isArray(ids) || !ids.length) return;
  const key = storageKey({ leagueId, pairingId: pairing });
  const next = [
    { week: Number(week), ids: ids.map(String) },
    ...readEntries(key, storage).filter((entry) => Number(entry.week) !== Number(week)),
  ]
    .sort((left, right) => Number(right.week) - Number(left.week))
    .slice(0, RETAINED_WEEKS + 1);
  memoryStore.set(key, next);
  const target = getStorage(storage);
  if (!target?.setItem) return;
  try { target.setItem(key, JSON.stringify(next)); } catch { /* memory store still holds it */ }
}
