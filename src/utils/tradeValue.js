import { findKtcPlayerFromSleeper, getKtcValue, productionAdjustedValue } from './ktcApi.js';
import { calcPointsFromTotals } from './scoringEngine.js';

// When a player has no redraft (fantasy) KTC value, we fall back to their
// dynasty value and apply this discount. Dynasty values are inflated by
// age/upside; a ~0.60 factor brings them roughly in line with redraft scale.
export const DYNASTY_FALLBACK_MULT = 0.60;

const IDP_POSITIONS = new Set(['DL', 'LB', 'DB', 'DE', 'DT', 'CB', 'S', 'ILB', 'OLB', 'SS', 'FS', 'EDG', 'EDGE']);

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
  // KTC does not publish IDP market values. Until GridShift has trustworthy
  // production to calculate one, leave the player unavailable instead of
  // presenting an invented zero value.
  rawVal = rawVal ?? (adjustedKtcPlayers?.length > 0 && !IDP_POSITIONS.has(player.position) ? 0 : null);

  const stats = seasonStats?.[id];
  const pts = stats ? calcPointsFromTotals(stats, scoringSettings, player.position) : null;
  const gp = stats?.gp ?? 0;
  const avgPPG = pts != null && gp ? pts / gp : null;
  const rankInfo = rankMap?.[id] ?? null;

  let value;
  if (isEstimated) {
    value = rawVal;
  } else if (dynastyFallback && gp >= 3 && avgPPG != null && positionalValuePerPPG?.[player.position] != null) {
    value = Math.round(avgPPG * positionalValuePerPPG[player.position]);
  } else {
    value = productionAdjustedValue(rawVal, avgPPG, positionalAvgPPG?.[player.position], blendWeight);
  }

  // Every position receives the same light positional-finish adjustment.
  // Generated IDP/DST values already originate in league-scored PPG; applying
  // the shared rank modifier keeps their relative finish treatment aligned
  // with KTC-backed offensive players.
  if (rankInfo?.rank != null && rankInfo?.posCount > 1) {
    const percentile = 1 - (rankInfo.rank - 1) / (rankInfo.posCount - 1);
    value = Math.round(value * (0.88 + 0.24 * percentile));
  }

  if (value == null) return null;

  return {
    value,
    rawVal,
    pts,
    avgPPG,
    rankInfo,
    dynastyFallback,
    isEstimated,
    ktcEntry: ktc ?? null,
  };
}

export function resolveTradePlayerValueDetail({
  id,
  playerTradeValueDetailsMap,
  ...detailOptions
}) {
  return playerTradeValueDetailsMap?.get(id) ?? computeTradePlayerValueDetail({ id, ...detailOptions });
}
