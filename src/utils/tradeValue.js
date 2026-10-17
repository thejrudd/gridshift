import { findKtcPlayerFromSleeper, getKtcValue } from './ktcApi.js';
import { calcPointsFromTotals } from './scoringEngine.js';
import { combineTradeValueSignals, normalizeKtcMarketValues, TRADE_VALUE_SCALE_ID } from './tradeValueScale.js';

// When a player has no redraft (fantasy) KTC value, we fall back to their
// dynasty value and apply this discount. Dynasty values are inflated by
// age/upside; a ~0.60 factor brings them roughly in line with redraft scale.
export const DYNASTY_FALLBACK_MULT = 0.60;

// An empty side is worth zero; a side containing an unknown asset has no total.
export function sumTradeValues(values) {
  return values.every(Number.isFinite) ? values.reduce((sum, value) => sum + value, 0) : null;
}

// KTC does not publish market values for these roster positions. Some payloads
// can still contain a name-matched placeholder row with value 0, which must not
// short-circuit the league-scored production estimate.
const GENERATED_VALUE_POSITIONS = new Set([
  'DL', 'LB', 'DB', 'DE', 'DT', 'EDG', 'EDGE', 'ILB', 'OLB', 'CB', 'S', 'SS', 'FS',
  'DEF', 'DST', 'D/ST', 'K', 'PK', 'KICKER',
]);

function isGeneratedValuePosition(position) {
  return GENERATED_VALUE_POSITIONS.has(String(position ?? '').trim().toUpperCase());
}

export function computeTradePlayerValueDetail({
  id,
  players,
  adjustedKtcPlayers,
  adjustedDynastyKtcPlayers,
  leagueType,
  seasonStats,
  weeklyStats,
  scoringSettings,
  rankMap,
  mergedIDPMap,
  leagueUtilityValueMap,
  ktcMarketValueMap,
  dynastyMarketValueMap,
  currentContextMap,
}) {
  const player = players?.[id];
  if (!player) return null;

  const usesGeneratedValue = isGeneratedValuePosition(player.position);
  const ktc = usesGeneratedValue
    ? null
    : findKtcPlayerFromSleeper(id, players, adjustedKtcPlayers ?? []);
  let rawVal = usesGeneratedValue ? null : getKtcValue(ktc, leagueType);
  // KTC's zero is also used as an unvalued placeholder. Treat it as missing
  // so a redraft player can use the existing dynasty fallback and so a
  // placeholder never becomes a real 0 Trade value.
  if (rawVal != null && Number(rawVal) <= 0) rawVal = null;
  let dynastyFallback = false;

  if (!usesGeneratedValue && rawVal == null && adjustedDynastyKtcPlayers?.length) {
    const dynastyKtc = findKtcPlayerFromSleeper(id, players, adjustedDynastyKtcPlayers);
    const dynastyVal = getKtcValue(dynastyKtc, leagueType);
    if (dynastyVal != null && Number(dynastyVal) > 0) {
      rawVal = Math.round(dynastyVal * DYNASTY_FALLBACK_MULT);
      dynastyFallback = true;
    }
  }

  const stats = seasonStats?.[id];
  const pts = stats ? calcPointsFromTotals(stats, scoringSettings, player.position) : null;
  const gp = Number(stats?.gp ?? stats?.games_played ?? weeklyStats?.[id]?.length ?? 0);
  const avgPPG = pts != null && gp ? pts / gp : null;
  const rankInfo = rankMap?.[id] ?? null;
  const localUtilityScore = leagueUtilityValueMap?.get(id) ?? mergedIDPMap?.get(id) ?? null;
  const selectedKtcMarketMap = ktcMarketValueMap ?? normalizeKtcMarketValues(adjustedKtcPlayers, leagueType);
  const selectedDynastyMarketMap = dynastyMarketValueMap ?? normalizeKtcMarketValues(adjustedDynastyKtcPlayers, leagueType);
  const directMarketScore = selectedKtcMarketMap?.get(ktc) ?? null;
  const dynastyMarketScore = dynastyFallback
    ? selectedDynastyMarketMap?.get(findKtcPlayerFromSleeper(id, players, adjustedDynastyKtcPlayers ?? []))
    : null;
  const marketScore = usesGeneratedValue
    ? null
    : (directMarketScore ?? (Number.isFinite(dynastyMarketScore)
      ? Math.round(dynastyMarketScore * DYNASTY_FALLBACK_MULT)
      : null));
  const value = combineTradeValueSignals(localUtilityScore, marketScore);
  if (value == null) return null;
  const isEstimated = !Number.isFinite(localUtilityScore) || !Number.isFinite(marketScore);
  if (usesGeneratedValue && Number.isFinite(localUtilityScore)) rawVal = localUtilityScore;

  return {
    value,
    rawVal,
    marketScore,
    utilityScore: Number.isFinite(localUtilityScore) ? localUtilityScore : null,
    valueScale: TRADE_VALUE_SCALE_ID,
    pts,
    avgPPG,
    rankInfo,
    dynastyFallback,
    isEstimated,
    valueSource: Number.isFinite(localUtilityScore)
      ? (Number.isFinite(marketScore) ? 'fantasy-viability+market' : 'fantasy-viability')
      : (Number.isFinite(marketScore) ? 'market-estimate' : 'unavailable'),
    currentContext: currentContextMap?.get(String(id)) ?? null,
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
