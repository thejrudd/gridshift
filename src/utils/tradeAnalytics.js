import { calcPointsFromTotals } from './scoringEngine';
import {
  computePositionalRanks,
  computePositionalAvgPPG,
  computePositionalValuePerPPG,
  computeLeagueAvgMult,
} from './projectionEngine';
import { detectLeagueDefensiveType, computeIDPValues, computeDSTValues } from './idpEngine';
import { buildRosterOpportunityLayer } from './opportunityEngine';
import { findKtcPlayerFromSleeper, getKtcValue, productionAdjustedValue } from './ktcApi';
import { DYNASTY_FALLBACK_MULT } from './tradeEngine';

function buildPlayerTradeValueDetailsMap({
  rosters,
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
}) {
  if (!players || !rosters?.length) return null;

  const ids = new Set();
  for (const roster of rosters) {
    const rosterIds = [...new Set([...(roster.players ?? []), ...(roster.reserve ?? [])])];
    for (const id of rosterIds) ids.add(id);
  }

  const detailsMap = new Map();
  for (const id of ids) {
    const player = players[id];
    if (!player) continue;

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
    const isIDPDST = isEstimated || player.position === 'DEF' || ['DL', 'LB', 'DB', 'DE', 'DT', 'CB', 'S', 'ILB', 'OLB', 'SS', 'FS'].includes(player.position);

    let value;
    if (isEstimated) {
      value = rawVal;
    } else if (dynastyFallback && gp >= 3 && avgPPG != null && positionalValuePerPPG?.[player.position] != null) {
      value = Math.round(avgPPG * positionalValuePerPPG[player.position]);
    } else {
      value = productionAdjustedValue(rawVal, avgPPG, positionalAvgPPG?.[player.position], 0.50);
    }

    const rankInfo = rankMap?.[id] ?? null;
    if (!isIDPDST && rankInfo?.rank != null && rankInfo?.posCount > 1) {
      const percentile = 1 - (rankInfo.rank - 1) / (rankInfo.posCount - 1);
      value = Math.round(value * (0.88 + 0.24 * percentile));
    }

    if (value != null) {
      detailsMap.set(id, {
        value,
        dynastyFallback,
        isEstimated,
      });
    }
  }

  return detailsMap;
}

export function buildTradeAnalyticsSnapshot({
  league,
  rosters,
  players,
  seasonStats,
  weeklyStats = null,
  scoringSettings,
  scheduleMap = null,
  myRosterId = null,
  targetRosterIds = null,
  adjustedKtcPlayers,
  adjustedDynastyKtcPlayers,
  leagueType,
  includePlayerTradeValues = false,
  includeOpportunityLayer = false,
}) {
  const rankMap = computePositionalRanks(seasonStats, players, scoringSettings);
  const positionalAvgPPG = computePositionalAvgPPG(rosters, seasonStats, players, scoringSettings);
  const positionalValuePerPPG = computePositionalValuePerPPG(
    rosters,
    players,
    adjustedKtcPlayers,
    leagueType,
    seasonStats,
    scoringSettings,
    findKtcPlayerFromSleeper,
    getKtcValue,
    productionAdjustedValue,
  );
  const leagueAvgMult = computeLeagueAvgMult(
    rosters,
    seasonStats,
    players,
    scoringSettings,
    productionAdjustedValue,
  );

  const { hasIDP, hasDST } = detectLeagueDefensiveType(league?.roster_positions);
  const idpComputedMap = hasIDP
    ? computeIDPValues(players, seasonStats, scoringSettings, league?.roster_positions, positionalValuePerPPG)
    : null;
  const dstComputedMap = hasDST
    ? computeDSTValues(players, seasonStats, scoringSettings, positionalValuePerPPG)
    : null;
  const mergedIDPMap = idpComputedMap || dstComputedMap
    ? new Map([...(idpComputedMap ?? []), ...(dstComputedMap ?? [])])
    : null;

  const playerTradeValueDetailsMap = includePlayerTradeValues
    ? buildPlayerTradeValueDetailsMap({
        rosters,
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
      })
    : null;
  const playerTradeValueMap = playerTradeValueDetailsMap
    ? new Map(Array.from(playerTradeValueDetailsMap.entries(), ([id, detail]) => [id, detail.value]))
    : null;

  const opportunityLayer = includeOpportunityLayer
    ? buildRosterOpportunityLayer({
        league,
        rosters,
        players,
        seasonStats,
        weeklyStats,
        scoringSettings,
        scheduleMap,
        myRosterId,
        targetRosterIds,
        rankMap,
      })
    : null;

  return {
    rankMap,
    positionalAvgPPG,
    positionalValuePerPPG,
    leagueAvgMult,
    hasIDP,
    hasDST,
    mergedIDPMap,
    playerTradeValueDetailsMap,
    playerTradeValueMap,
    opportunityLayer,
  };
}
