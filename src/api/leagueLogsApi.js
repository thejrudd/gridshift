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

function toTitleCase(value) {
  return String(value ?? '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function parseLeagueLogsProfileKey(profileKey) {
  const parsed = {};
  const tokens = String(profileKey ?? '').toLowerCase().split('-').filter(Boolean);

  for (const token of tokens) {
    if (token === 'redraft' || token === 'dynasty') {
      parsed.format = token;
      continue;
    }

    const qbMatch = token.match(/^(\d+)qb$/);
    if (qbMatch) {
      parsed.numQbs = Number(qbMatch[1]);
      continue;
    }

    if (token === 'sf' || token === 'superflex') {
      parsed.qbLabel = 'Superflex';
      continue;
    }

    const teamMatch = token.match(/^(\d+)t$/);
    if (teamMatch) {
      parsed.numTeams = Number(teamMatch[1]);
      continue;
    }

    if (token === 'standard' || token === 'nonppr') {
      parsed.ppr = 0;
      continue;
    }

    if (token === 'half_ppr' || token === 'halfppr') {
      parsed.ppr = 0.5;
      continue;
    }

    const pprMatch = token.match(/^ppr(?:(\d+(?:_\d+)?))?$/);
    if (pprMatch) {
      parsed.ppr = pprMatch[1] == null ? 1 : Number(pprMatch[1].replace('_', '.'));
    }
  }

  return parsed;
}

function formatLeagueFormat(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'redraft') return 'Redraft League';
  if (normalized === 'dynasty') return 'Dynasty League';
  return `${toTitleCase(normalized)} League`;
}

function formatQbSetup(profile, parsed) {
  const explicitLabel = profile?.qbLabel ?? parsed.qbLabel;
  if (explicitLabel) return explicitLabel;

  const numQbs = toFiniteNumber(profile?.numQbs ?? parsed.numQbs);
  if (numQbs == null) return null;
  return `${numQbs}QB`;
}

function formatTeamCount(profile, parsed) {
  const numTeams = toFiniteNumber(profile?.numTeams ?? parsed.numTeams);
  if (numTeams == null) return null;
  return `${numTeams}+ ${numTeams === 1 ? 'Team' : 'Teams'}`;
}

function formatPprScoring(profile, parsed) {
  const ppr = toFiniteNumber(profile?.ppr ?? parsed.ppr);
  if (ppr == null) return null;
  if (ppr === 0) return 'Standard Scoring';
  if (ppr === 0.5) return 'Half-PPR';
  if (ppr === 1) return 'PPR';
  return `${Number.isInteger(ppr) ? ppr : String(ppr).replace(/0+$/, '').replace(/\.$/, '')} PPR`;
}

export function formatLeagueLogsMarketProfile({ profile = null, profileKey = '' } = {}) {
  const parsed = parseLeagueLogsProfileKey(profileKey);
  const parts = [
    formatLeagueFormat(profile?.format ?? parsed.format),
    formatQbSetup(profile, parsed),
    formatTeamCount(profile, parsed),
    formatPprScoring(profile, parsed),
  ].filter(Boolean);

  if (parts.length > 0) return parts.join(' - ');
  return profileKey ? `Market profile: ${profileKey}` : '';
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
