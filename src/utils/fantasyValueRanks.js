import { positionGroup } from './playerMetrics.js';

// Ranks are compared on rounded points so display ties share a rank.
const RANK_EPSILON = 0.005;

// A season needs a real player pool before a rank number means anything.
const MIN_RANK_POOL_SIZE = 5;

function createDistribution() {
  return { all: [], byPosition: new Map() };
}

function pushDistributionValue(distribution, posKey, value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return;
  distribution.all.push(numericValue);
  if (!posKey || posKey === 'OTHER') return;
  if (!distribution.byPosition.has(posKey)) distribution.byPosition.set(posKey, []);
  distribution.byPosition.get(posKey).push(numericValue);
}

function sortDistribution(distribution) {
  distribution.all.sort((left, right) => right - left);
  for (const values of distribution.byPosition.values()) {
    values.sort((left, right) => right - left);
  }
  return distribution;
}

// Descending array → count of entries strictly better than `value`.
function countBetter(sortedDesc, value) {
  let low = 0;
  let high = sortedDesc.length;
  const threshold = value + RANK_EPSILON;

  while (low < high) {
    const mid = (low + high) >> 1;
    if (sortedDesc[mid] > threshold) low = mid + 1;
    else high = mid;
  }

  return low;
}

/**
 * Build per-stat and total fantasy point distributions for a single season's
 * player pool, so a player's values can be ranked overall and within position.
 *
 * The subject player is excluded from the pool (`excludeIds`) and ranked by
 * inserting the value actually displayed, which keeps the rank consistent with
 * the number on screen even when the subject's totals come from a different
 * source (ESPN applied stats) than the pool.
 *
 * @param {Object} params
 * @param {Object} params.seasonStats - { [playerId]: aggregated season stats }
 * @param {Object} [params.weeklyStats] - { [playerId]: weekly stat rows }
 * @param {Object} params.players - { [playerId]: { position } }
 * @param {(totals: Object, position: string|null) => {key: string, points: number}[]} params.buildOptionRows
 * @param {(weeks: Object[]|null, totals: Object, position: string|null) => number} params.calcTotalPoints
 * @param {string[]} [params.excludeIds]
 * @returns {{ option: Map<string, Object>, total: Object }}
 */
export function buildFantasyRankDistributions({
  seasonStats,
  weeklyStats = null,
  players = null,
  buildOptionRows,
  calcTotalPoints,
  excludeIds = [],
}) {
  const option = new Map();
  const total = createDistribution();
  if (!seasonStats || typeof buildOptionRows !== 'function') {
    return { option, total: sortDistribution(total) };
  }

  const excluded = new Set(excludeIds.filter(Boolean).map(String));

  for (const [candidateId, totals] of Object.entries(seasonStats)) {
    if (excluded.has(String(candidateId))) continue;
    const candidatePosition = players?.[candidateId]?.position ?? null;
    const posKey = positionGroup(candidatePosition);

    for (const row of buildOptionRows(totals, candidatePosition)) {
      if (!option.has(row.key)) option.set(row.key, createDistribution());
      pushDistributionValue(option.get(row.key), posKey, row.points);
    }

    if (typeof calcTotalPoints === 'function') {
      pushDistributionValue(
        total,
        posKey,
        calcTotalPoints(weeklyStats?.[candidateId] ?? null, totals, candidatePosition),
      );
    }
  }

  for (const distribution of option.values()) sortDistribution(distribution);
  sortDistribution(total);

  return { option, total };
}

/**
 * Rank a single value inside a distribution.
 *
 * @returns {{ rank: number|null, positionRank: {rank: number, posLabel: string}|null }}
 */
export function getFantasyRankForValue(distribution, value, subjectPosition) {
  const numericValue = Number(value);
  if (!distribution || !Number.isFinite(numericValue)) return { rank: null, positionRank: null };

  const rank = distribution.all.length >= MIN_RANK_POOL_SIZE
    ? countBetter(distribution.all, numericValue) + 1
    : null;

  const posLabel = positionGroup(subjectPosition);
  const positionValues = posLabel === 'OTHER' ? null : distribution.byPosition.get(posLabel);
  const positionRank = positionValues && positionValues.length >= MIN_RANK_POOL_SIZE
    ? { rank: countBetter(positionValues, numericValue) + 1, posLabel }
    : null;

  return { rank, positionRank };
}
