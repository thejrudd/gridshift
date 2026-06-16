import { calcPointsFromTotals } from '../scoringEngine.js';

const OFFENSIVE_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K']);
const DEFENSIVE_POSITIONS = new Set(['DEF', 'DST']);
const IDP_POSITIONS = new Set(['DL', 'DE', 'DT', 'LB', 'ILB', 'OLB', 'DB', 'CB', 'S', 'SS', 'FS']);
const MAX_USABLE_SEARCH_RANK = 5000;

function toFiniteNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getSeasonCandidates(season) {
  const numeric = Number.parseInt(String(season ?? ''), 10);
  if (!Number.isFinite(numeric)) return [];
  return [
    String(numeric),
    `${numeric}`,
    `${numeric}_regular`,
    `${numeric}regular`,
    `${numeric}_proj`,
    `${numeric}_projection`,
  ];
}

function getProjectionBuckets(player) {
  return [
    player?.projected,
    player?.projections,
    player?.projection,
    player?.stats_projected,
    player?.stats_projected_by_season,
    player?.stats_by_season?.projected,
    player?.stats_by_week?.projected,
    player?.metadata?.projected,
    player?.metadata?.projections,
  ].filter(Boolean);
}

function extractSeasonProjectionStats(player, season) {
  const seasonKeys = getSeasonCandidates(season);
  const buckets = getProjectionBuckets(player);

  for (const bucket of buckets) {
    if (!bucket || typeof bucket !== 'object') continue;
    for (const key of seasonKeys) {
      const candidate = bucket[key];
      if (candidate && typeof candidate === 'object') return candidate;
    }
    if (bucket.stats && typeof bucket.stats === 'object') return bucket.stats;
    if (bucket.total && typeof bucket.total === 'object') return bucket.total;
  }

  return null;
}

function getFallbackRankProfile(player) {
  const candidates = [
    { value: normalizeSearchRank(player?.search_rank), label: 'Sleeper search rank', source: 'search_rank' },
  ];

  for (const candidate of candidates) {
    const rank = toFiniteNumber(candidate.value);
    if (rank != null && rank > 0) return { ...candidate, value: rank };
  }

  return null;
}

function normalizeSearchRank(value) {
  const rank = toFiniteNumber(value);
  if (rank == null || rank <= 0 || rank > MAX_USABLE_SEARCH_RANK) return null;
  return rank;
}

function normalizeFantasyPosition(player) {
  const fantasyPosition = player?.fantasy_positions?.[0];
  const position = player?.position ?? fantasyPosition ?? null;
  if (!position) return null;
  const normalized = String(position).toUpperCase();
  if (normalized === 'DST') return 'DEF';
  return normalized;
}

export function playerSupportsDraftAssistant(player) {
  const position = normalizeFantasyPosition(player);
  if (!position) return false;
  return OFFENSIVE_POSITIONS.has(position) || DEFENSIVE_POSITIONS.has(position) || IDP_POSITIONS.has(position);
}

export function getPlayerProjectionProfile(player, scoringSettings, season) {
  const position = normalizeFantasyPosition(player);
  if (!position || !playerSupportsDraftAssistant(player)) return null;

  const projectionStats = extractSeasonProjectionStats(player, season);
  const projectedPoints = projectionStats
    ? calcPointsFromTotals(projectionStats, scoringSettings, position)
    : null;
  const searchRank = normalizeSearchRank(player?.search_rank);
  const fallbackRankProfile = getFallbackRankProfile(player);
  const source = projectedPoints != null ? 'sleeper_projection' : (fallbackRankProfile?.source ?? 'unavailable');

  return {
    playerId: String(player?.player_id ?? ''),
    position,
    projectedPoints: projectedPoints != null ? Math.round(projectedPoints * 10) / 10 : null,
    projectionStats,
    searchRank,
    fallbackRank: fallbackRankProfile?.value ?? null,
    fallbackLabel: fallbackRankProfile?.label ?? null,
    source,
  };
}

export function sortDraftPlayersByProjection(items) {
  return [...(items ?? [])].sort((a, b) => {
    const aProjected = a?.projection?.projectedPoints ?? -Infinity;
    const bProjected = b?.projection?.projectedPoints ?? -Infinity;
    if (aProjected !== bProjected) return bProjected - aProjected;

    const aRank = a?.projection?.fallbackRank ?? Infinity;
    const bRank = b?.projection?.fallbackRank ?? Infinity;
    if (aRank !== bRank) return aRank - bRank;

    return String(a?.name ?? '').localeCompare(String(b?.name ?? ''));
  });
}
