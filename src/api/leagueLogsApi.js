const BASE = 'https://developer.leaguelogs.com/v1';

let marketProfilesCache = null;
const marketSnapshotCache = new Map();

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`LeagueLogs API error: ${res.status} ${path}`);
  return res.json();
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getLeagueFormat(league) {
  return Number(league?.settings?.type) === 2 ? 'dynasty' : 'redraft';
}

function getPprValue({ league, scoringSettings }) {
  const rec = toFiniteNumber(scoringSettings?.rec ?? league?.scoring_settings?.rec);
  if (rec == null) return 1;
  if (rec >= 0.75) return 1;
  if (rec >= 0.25) return 0.5;
  return 0;
}

function getRosterPositions(league, draft) {
  const candidates = [
    league?.roster_positions,
    draft?.metadata?.roster_positions,
    draft?.roster_positions,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.map((item) => String(item).toUpperCase());
  }
  return [];
}

function getQbProfile({ league, draft }) {
  const rosterPositions = getRosterPositions(league, draft);
  const qbSlots = rosterPositions.filter((position) => position === 'QB').length;
  const hasSuperflex = rosterPositions.some((position) => (
    position === 'SUPER_FLEX'
    || position === 'OP'
    || position === 'QB_RB_WR_TE'
    || position === 'QB_WR_RB_TE'
  ));
  const explicitTwoQb = String(draft?.metadata?.scoring_type ?? '').toUpperCase() === '2QB';
  const extraDraftQbs = Number(draft?.settings?.slots_qb ?? 0) > 1;
  return qbSlots >= 2 || hasSuperflex || explicitTwoQb || extraDraftQbs ? 2 : 1;
}

export async function getLeagueLogsMarketProfiles() {
  if (marketProfilesCache) return marketProfilesCache;
  marketProfilesCache = await get('/market');
  return marketProfilesCache;
}

export async function getLeagueLogsMarketSnapshot(profileKey) {
  if (!profileKey) throw new Error('LeagueLogs market profile is required.');
  if (marketSnapshotCache.has(profileKey)) return marketSnapshotCache.get(profileKey);
  const snapshot = await get(`/market/${encodeURIComponent(profileKey)}`);
  marketSnapshotCache.set(profileKey, snapshot);
  return snapshot;
}

export function selectLeagueLogsMarketProfile(profiles, { league = null, draft = null, scoringSettings = null } = {}) {
  const entries = Array.isArray(profiles?.profiles) ? profiles.profiles : [];
  if (entries.length === 0) return null;

  const targetFormat = getLeagueFormat(league);
  const targetQbs = getQbProfile({ league, draft });
  const targetPpr = getPprValue({ league, scoringSettings });

  return [...entries].sort((a, b) => {
    const score = (entry) => {
      const profile = entry.profile ?? {};
      const formatScore = profile.format === targetFormat ? 1000 : 0;
      const qbScore = profile.numQbs === targetQbs ? 200 : -Math.abs(Number(profile.numQbs ?? 1) - targetQbs) * 50;
      const pprScore = -Math.abs(Number(profile.ppr ?? 1) - targetPpr) * 40;
      return formatScore + qbScore + pprScore;
    };
    return score(b) - score(a);
  })[0] ?? null;
}

export function buildLeagueLogsMarketMap(snapshot) {
  return new Map((snapshot?.data ?? [])
    .filter((item) => item?.sleeperPlayerId != null)
    .map((item) => [String(item.sleeperPlayerId), item]));
}

export async function fetchLeagueLogsMarketForLeague({ league = null, draft = null, scoringSettings = null } = {}) {
  const profiles = await getLeagueLogsMarketProfiles();
  const selectedProfile = selectLeagueLogsMarketProfile(profiles, { league, draft, scoringSettings });
  if (!selectedProfile?.key) return null;
  const snapshot = await getLeagueLogsMarketSnapshot(selectedProfile.key);
  return {
    attribution: snapshot?._attribution ?? profiles?._attribution ?? null,
    profileKey: selectedProfile.key,
    profile: selectedProfile.profile ?? snapshot?.meta?.profile ?? null,
    lastRefreshed: snapshot?.meta?.lastRefreshed ?? selectedProfile.lastRefreshed ?? null,
    valuesByPlayerId: buildLeagueLogsMarketMap(snapshot),
  };
}
