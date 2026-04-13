import { findKtcPlayerFromSleeper, getKtcValue, productionAdjustedValue } from './ktcApi';
import { calcPointsFromTotals } from './scoringEngine';

// When a player has no redraft (fantasy) KTC value, we fall back to their
// dynasty value and apply this discount. Dynasty values are inflated by
// age/upside; a ~0.60 factor brings them roughly in line with redraft scale.
export const DYNASTY_FALLBACK_MULT = 0.60;

const IDP_DST_POSITIONS = new Set(['DEF', 'DL', 'LB', 'DB', 'DE', 'DT', 'CB', 'S', 'ILB', 'OLB', 'SS', 'FS']);

export function computeTradePlayerValueDetail({
  id,
  players,
  adjustedKtcPlayers,
  adjustedDynastyKtcPlayers,
  leagueType,
  seasonStats,
  scoringSettings,
  positionalAvgPPG,
  positionalValuePerPPG,
  rankMap,
  mergedIDPMap,
  blendWeight = 0.50,
}) {
  const player = players?.[id];
  if (!player) return null;

  const ktc = findKtcPlayerFromSleeper(id, players, adjustedKtcPlayers ?? []);
  let rawVal = getKtcValue(ktc, leagueType);
  let dynastyFallback = false;

  if (rawVal == null && adjustedDynastyKtcPlayers?.length) {
    const dynastyKtc = findKtcPlayerFromSleeper(id, players, adjustedDynastyKtcPlayers);
    const dynastyVal = getKtcValue(dynastyKtc, leagueType);
    if (dynastyVal != null) {
      rawVal = Math.round(dynastyVal * DYNASTY_FALLBACK_MULT);
      dynastyFallback = true;
    }
  }

  const isEstimated = rawVal == null && mergedIDPMap?.has(id);
  if (isEstimated) rawVal = mergedIDPMap.get(id);
  rawVal = rawVal ?? (adjustedKtcPlayers?.length > 0 ? 0 : null);

  const stats = seasonStats?.[id];
  const pts = stats ? calcPointsFromTotals(stats, scoringSettings, player.position) : null;
  const gp = stats?.gp ?? 0;
  const avgPPG = pts != null && gp ? pts / gp : null;
  const rankInfo = rankMap?.[id] ?? null;
  const isIDPDST = isEstimated || IDP_DST_POSITIONS.has(player.position);

  let value;
  if (isEstimated) {
    value = rawVal;
  } else if (dynastyFallback && gp >= 3 && avgPPG != null && positionalValuePerPPG?.[player.position] != null) {
    value = Math.round(avgPPG * positionalValuePerPPG[player.position]);
  } else {
    value = productionAdjustedValue(rawVal, avgPPG, positionalAvgPPG?.[player.position], blendWeight);
  }

  if (!isIDPDST && rankInfo?.rank != null && rankInfo?.posCount > 1) {
    const percentile = 1 - (rankInfo.rank - 1) / (rankInfo.posCount - 1);
    value = Math.round(value * (0.88 + 0.24 * percentile));
  }

  if (value == null) return null;

  return {
    value,
    rawVal,
    avgPPG,
    rankInfo,
    dynastyFallback,
    isEstimated,
  };
}
