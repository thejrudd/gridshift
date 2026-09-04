export const TRADE_DRAFT_STORAGE_VERSION = 1;
export const TRADE_DRAFT_STORAGE_PREFIX = 'gridshift:trade-agent-draft';

function cleanToken(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeRosterId(value) {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanToken).filter(Boolean))];
}

function normalizePick(pick) {
  if (!pick || typeof pick !== 'object') return null;
  const year = cleanToken(pick.year);
  const round = Number(pick.round);
  const fromRosterId = normalizeRosterId(pick.fromRosterId);
  if (!year || !Number.isInteger(round) || round < 1 || fromRosterId == null) return null;

  const isOwn = pick.isOwn === true;
  return {
    year,
    round,
    fromRosterId,
    isOwn,
    key: cleanToken(pick.key) ?? `${year}|${round}${isOwn ? '' : `|from${fromRosterId}`}`,
  };
}

function normalizePicks(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const picks = [];
  for (const pick of value.map(normalizePick).filter(Boolean)) {
    if (seen.has(pick.key)) continue;
    seen.add(pick.key);
    picks.push(pick);
  }
  return picks;
}

export function getTradeDraftStorageKey({ leagueId, season, sleeperUserId } = {}) {
  const parts = [leagueId, season, sleeperUserId].map(cleanToken);
  if (parts.some((part) => !part)) return null;
  return `${TRADE_DRAFT_STORAGE_PREFIX}:${parts.map((part) => encodeURIComponent(part)).join(':')}`;
}

export function normalizeTradeDraftState(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.version !== TRADE_DRAFT_STORAGE_VERSION) return null;

  return {
    partnerRosterId: normalizeRosterId(value.partnerRosterId),
    yourPlayers: normalizeIds(value.yourPlayers),
    yourPicks: normalizePicks(value.yourPicks),
    theirPlayers: normalizeIds(value.theirPlayers),
    theirPicks: normalizePicks(value.theirPicks),
  };
}

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function readTradeDraftState(storageKey, storage) {
  if (!storageKey) return null;
  try {
    const raw = resolveStorage(storage)?.getItem(storageKey);
    return raw ? normalizeTradeDraftState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeTradeDraftState(storageKey, state, storage) {
  if (!storageKey) return false;
  try {
    const resolvedStorage = resolveStorage(storage);
    if (!resolvedStorage) return false;
    resolvedStorage.setItem(storageKey, JSON.stringify({
      version: TRADE_DRAFT_STORAGE_VERSION,
      partnerRosterId: normalizeRosterId(state?.partnerRosterId),
      yourPlayers: normalizeIds(state?.yourPlayers),
      yourPicks: normalizePicks(state?.yourPicks),
      theirPlayers: normalizeIds(state?.theirPlayers),
      theirPicks: normalizePicks(state?.theirPicks),
    }));
    return true;
  } catch {
    // Trade drafting remains usable when browser storage is unavailable.
    return false;
  }
}
