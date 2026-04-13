import {
  computePositionalRanks,
  computePositionalAvgPPG,
  computePositionalValuePerPPG,
  computeLeagueAvgMult,
} from './projectionEngine';
import { detectLeagueDefensiveType, computeIDPValues, computeDSTValues } from './idpEngine';
import { buildRosterOpportunityLayer } from './opportunityEngine';
import { findKtcPlayerFromSleeper, getKtcValue, productionAdjustedValue } from './ktcApi';
import { computeTradePlayerValueDetail } from './tradeValue';

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
    const detail = computeTradePlayerValueDetail({
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
      blendWeight: 0.50,
    });
    if (detail) detailsMap.set(id, detail);
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
