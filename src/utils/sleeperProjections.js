import { calcPoints, STAT_TO_SCORING_KEY } from './scoringEngine.js';

const PRECOMPUTED_POINT_KEYS = new Set(['pts_ppr', 'pts_half_ppr', 'pts_std']);

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hasProjectedStats(stats) {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return false;
  return Object.entries(stats).some(([key, value]) => (
    (STAT_TO_SCORING_KEY[key] || PRECOMPUTED_POINT_KEYS.has(key)) && finite(value) != null
  ));
}

/**
 * Convert one Sleeper projection row into GridShift's shared projection shape.
 * Raw projected stats are preferred so custom league scoring, including IDP,
 * remains authoritative. Rows containing only ADP/search metadata are not
 * projections and are intentionally omitted.
 */
export function buildSleeperProjection(row, scoringSettings, player = null) {
  const stats = row?.stats;
  if (!hasProjectedStats(stats)) return null;

  const position = row?.player?.position ?? player?.position ?? null;
  const projected = calcPoints(stats, scoringSettings, position);
  if (!Number.isFinite(Number(projected))) return null;

  return {
    projected: Math.round(Math.max(0, Number(projected)) * 10) / 10,
    min: null,
    max: null,
    projectedStats: stats,
    factors: {
      source: 'sleeper',
      provider: 'sleeper',
      providerId: row?.player_id ?? null,
      providerCollectedAt: row?.updated_at ?? row?.last_modified ?? null,
      scoringSource: 'gridshift-custom-scoring',
    },
  };
}

/**
 * Map Sleeper's weekly projection rows to the player directory. The player ID
 * is the authoritative identity boundary; no name/team crosswalk is needed.
 */
export function mapSleeperProjectionsToPlayers({ players, projectionRows, scoringSettings } = {}) {
  const mapped = new Map();
  const rows = Array.isArray(projectionRows)
    ? projectionRows
    : Array.isArray(projectionRows?.data) ? projectionRows.data : [];
  for (const row of rows) {
    const playerId = String(row?.player_id ?? '').trim();
    if (!playerId || !players?.[playerId] || mapped.has(playerId)) continue;
    const projection = buildSleeperProjection(row, scoringSettings, players[playerId]);
    if (projection) mapped.set(playerId, projection);
  }
  return mapped;
}
