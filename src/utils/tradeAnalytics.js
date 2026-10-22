import {
  computePositionalRanks,
  computePositionalAvgPPG,
  computePositionalValuePerPPG,
  computeLeagueAvgMult,
} from './projectionEngine';
import { detectLeagueDefensiveType } from './idpEngine';
import { buildRosterOpportunityLayer } from './opportunityEngine';
import { findKtcPlayerFromSleeper, getKtcValue, productionAdjustedValue } from './ktcApi';
import { computeTradePlayerValueDetail } from './tradeValue';
import {
  computeFantasyViabilityTradeValues,
  normalizeKtcMarketValues,
  normalizeTradePositionGroup,
} from './tradeValueScale';

function buildPlayerTradeValueDetailsMap({
  rosters,
  players,
  adjustedKtcPlayers,
  adjustedDynastyKtcPlayers,
  leagueType,
  seasonStats,
  weeklyStats,
  priorSeasonStats,
  priorWeeklyStats,
  format,
  scoringSettings,
  rankMap,
  mergedIDPMap,
  leagueUtilityValueMap,
  ktcMarketValueMap,
  dynastyMarketValueMap,
  currentContextMap,
  ids: requestedIds = null,
}) {
  if (!players || !rosters?.length) return null;

  const ids = requestedIds ? new Set(requestedIds) : new Set();
  if (!requestedIds) {
    for (const id of Object.keys(players)) ids.add(id);
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
      weeklyStats,
      priorSeasonStats,
      priorWeeklyStats,
      format,
      scoringSettings,
      rankMap,
      mergedIDPMap,
      leagueUtilityValueMap,
      ktcMarketValueMap,
      dynastyMarketValueMap,
      currentContextMap,
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
  weeklyStats = null,
  priorWeeklyStats = null,
  scoringSettings,
  scheduleMap = null,
  myRosterId = null,
  targetRosterIds = null,
  adjustedKtcPlayers,
  adjustedDynastyKtcPlayers,
  leagueType,
  format = 'redraft',
  includePlayerTradeValues = false,
  includeOpportunityLayer = false,
  currentWeek = null,
  currentContextMap = null,
}) {
  // Both formats start each player from the prior completed season and let
  // current-season games move that starting point; dynasty weighs it more.
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
  const currentUtilityMap = computeFantasyViabilityTradeValues({
    players,
    seasonStats,
    weeklyStats,
    priorSeasonStats,
    priorWeeklyStats,
    format,
    currentContextMap,
    scoringSettings,
    league,
    rosters,
  });
  const ktcMarketValueMap = normalizeKtcMarketValues(adjustedKtcPlayers, leagueType);
  const dynastyMarketValueMap = normalizeKtcMarketValues(adjustedDynastyKtcPlayers, leagueType);

  // Keep the IDP/DST/kicker compatibility map on the same current-season
  // local values used by the canonical player detail map.
  const generatedGroups = new Set(['DL', 'LB', 'DB', 'DEF', 'K']);
  const currentGeneratedMap = new Map([...currentUtilityMap].filter(([id]) => generatedGroups.has(
    normalizeTradePositionGroup(players?.[id]?.position),
  )));
  const mergedIDPMap = hasIDP || hasDST || league?.roster_positions?.includes('K')
    ? new Map(currentGeneratedMap)
    : null;
  const leagueUtilityValueMap = new Map(currentUtilityMap);

  const currentPlayerTradeValueDetailsMap = includePlayerTradeValues
    ? buildPlayerTradeValueDetailsMap({
        rosters,
        players,
        adjustedKtcPlayers,
        adjustedDynastyKtcPlayers,
        leagueType,
        seasonStats,
        weeklyStats,
        priorSeasonStats,
        priorWeeklyStats,
        format,
        scoringSettings,
        positionalAvgPPG,
        positionalValuePerPPG,
        rankMap,
        mergedIDPMap,
        leagueUtilityValueMap,
        ktcMarketValueMap,
        dynastyMarketValueMap,
        currentContextMap,
      })
    : null;
  const playerTradeValueDetailsMap = currentPlayerTradeValueDetailsMap
    ? new Map(currentPlayerTradeValueDetailsMap)
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
    leagueUtilityValueMap,
    ktcMarketValueMap,
    dynastyMarketValueMap,
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
  leagueUtilityValueMap: null,
  ktcMarketValueMap: null,
  dynastyMarketValueMap: null,
  playerTradeValueDetailsMap: null,
  playerTradeValueMap: null,
  opportunityLayer: null,
});
