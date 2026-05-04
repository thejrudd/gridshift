import { buildPartnerTradeIntelligence } from './opportunity/proposalBuilder';
import { buildRosterOpportunityLayer } from './opportunity/rosterAnalysis';

export {
  getOpportunityPositionLabel,
  normalizeOpportunityPos,
  supportsWaiverOpportunity,
} from './opportunity/opportunityPositions';
export { buildRosterOpportunityLayer } from './opportunity/rosterAnalysis';
export { buildPartnerTradeIntelligence } from './opportunity/proposalBuilder';
export { findLeagueWideUpgradeGroups } from './opportunity/leagueWideUpgrades';

export function analyzeAreasOfOpportunity({
  league,
  rosters,
  players,
  seasonStats,
  weeklyStats,
  scoringSettings,
  scheduleMap,
  myRosterId = null,
  targetRosterIds = null,
  selectedPartnerRosterId = null,
  rosterPicks = null,
  slots = null,
  currentSeason = null,
  pickValueMap = null,
  ktcPlayers = [],
  leagueType = '1qb',
}) {
  const opportunityLayer = buildRosterOpportunityLayer({
    league,
    rosters,
    players,
    seasonStats,
    weeklyStats,
    scoringSettings,
    scheduleMap,
    myRosterId,
    targetRosterIds,
  });

  const { analysesByRosterId, tradeProposals, surplusTradeProposals } = buildPartnerTradeIntelligence({
    opportunityLayer,
    selectedPartnerRosterId,
    rosterPicks,
    slots,
    currentSeason,
    pickValueMap,
    ktcPlayers,
    leagueType,
  });

  return {
    analysisWeek: opportunityLayer.analysisWeek,
    analysesByRosterId,
    positionOrder: opportunityLayer.positionOrder,
    tradeProposals,
    surplusTradeProposals,
  };
}
