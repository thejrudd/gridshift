import {
  computePositionalRanks,
  computePositionalAvgPPG,
  computePositionalValuePerPPG,
  computeLeagueAvgMult,
} from './projectionEngine';
import { detectLeagueDefensiveType, computeIDPValues, computeDSTValues, computeKickerValues } from './idpEngine';
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
  ids: requestedIds = null,
}) {
  if (!players || !rosters?.length) return null;

  const ids = requestedIds ? new Set(requestedIds) : new Set();
  if (!requestedIds) {
    for (const roster of rosters) {
      const rosterIds = [...new Set([...(roster.players ?? []), ...(roster.reserve ?? [])])];
      for (const id of rosterIds) ids.add(id);
    }
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
  priorSeasonStats = null,
  valuationSeasonStats = null,
  idpSeasonStats = null,
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
  currentWeek = null,
}) {
  // Keep current-season production as the only input to KTC-backed player
  // adjustments, ranks, and pick calibration. Prior-season production is a
  // per-player fallback for generated IDP/D/ST/kicker values only. The two
  // legacy names remain accepted for callers from the original preseason path.
  const fallbackProductionSeasonStats = priorSeasonStats ?? valuationSeasonStats ?? idpSeasonStats ?? null;
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
  // Generate current values first. Each position helper enforces the shared
  // three-game, positive-league-points threshold.
  const idpProductionStats = seasonStats;
  const idpComputedMap = hasIDP
    ? computeIDPValues(players, idpProductionStats, scoringSettings, league?.roster_positions, positionalValuePerPPG)
    : null;
  const dstComputedMap = hasDST
    ? computeDSTValues(players, seasonStats, scoringSettings, positionalValuePerPPG)
    : null;
  const kickerComputedMap = league?.roster_positions?.includes('K')
    ? computeKickerValues(players, seasonStats, scoringSettings, positionalValuePerPPG)
    : null;
  const currentGeneratedMap = new Map([
    ...(idpComputedMap ?? []),
    ...(dstComputedMap ?? []),
    ...(kickerComputedMap ?? []),
  ]);

  // Prior production is calculated separately with the current league scoring
  // rules. It only fills players that were not currently reliable, never
  // replacing a current generated value or leaking into offensive KTC math.
  const priorRankMap = computePositionalRanks(fallbackProductionSeasonStats, players, scoringSettings);
  const priorPositionalAvgPPG = computePositionalAvgPPG(rosters, fallbackProductionSeasonStats, players, scoringSettings);
  const priorPositionalValuePerPPG = computePositionalValuePerPPG(
    rosters,
    players,
    adjustedKtcPlayers,
    leagueType,
    fallbackProductionSeasonStats,
    scoringSettings,
    findKtcPlayerFromSleeper,
    getKtcValue,
    productionAdjustedValue,
  );
  const priorIdpComputedMap = hasIDP
    ? computeIDPValues(players, fallbackProductionSeasonStats, scoringSettings, league?.roster_positions, priorPositionalValuePerPPG)
    : null;
  const priorDstComputedMap = hasDST
    ? computeDSTValues(players, fallbackProductionSeasonStats, scoringSettings, priorPositionalValuePerPPG)
    : null;
  const priorKickerComputedMap = league?.roster_positions?.includes('K')
    ? computeKickerValues(players, fallbackProductionSeasonStats, scoringSettings, priorPositionalValuePerPPG)
    : null;
  const priorGeneratedMap = new Map([
    ...(priorIdpComputedMap ?? []),
    ...(priorDstComputedMap ?? []),
    ...(priorKickerComputedMap ?? []),
  ]);
  // Preserve the existing consumer contract; this map contains all generated
  // values, including kickers, despite its historical IDP name. Current
  // entries win; prior entries only fill players missing current reliability.
  const mergedIDPMap = hasIDP || hasDST || league?.roster_positions?.includes('K')
    ? new Map([...priorGeneratedMap, ...currentGeneratedMap])
    : null;

  const currentPlayerTradeValueDetailsMap = includePlayerTradeValues
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
  const playerTradeValueDetailsMap = currentPlayerTradeValueDetailsMap
    ? new Map(currentPlayerTradeValueDetailsMap)
    : null;
  if (playerTradeValueDetailsMap && priorGeneratedMap.size) {
    const priorGeneratedDetails = buildPlayerTradeValueDetailsMap({
      rosters,
      players,
      adjustedKtcPlayers,
      adjustedDynastyKtcPlayers,
      leagueType,
      seasonStats: fallbackProductionSeasonStats,
      scoringSettings,
      positionalAvgPPG: priorPositionalAvgPPG,
      positionalValuePerPPG: priorPositionalValuePerPPG,
      rankMap: priorRankMap,
      mergedIDPMap: priorGeneratedMap,
      ids: playerTradeValueDetailsMap.keys(),
    });
    for (const [id, priorDetail] of priorGeneratedDetails ?? []) {
      const currentDetail = playerTradeValueDetailsMap.get(id);
      if (!currentGeneratedMap.has(id) && currentDetail?.isEstimated !== false) {
        playerTradeValueDetailsMap.set(id, priorDetail);
      }
    }
  }
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
        currentWeek,
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


export const EMPTY_TRADE_ANALYTICS_SNAPSHOT = Object.freeze({
  rankMap: null,
  positionalAvgPPG: null,
  positionalValuePerPPG: null,
  leagueAvgMult: 1,
  hasIDP: false,
  hasDST: false,
  mergedIDPMap: null,
  playerTradeValueDetailsMap: null,
  playerTradeValueMap: null,
  opportunityLayer: null,
});
