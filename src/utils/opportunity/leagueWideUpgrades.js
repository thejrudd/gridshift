import {
  buildPlayerAsset,
  buildRosterPickAssetsById,
  getPositionPlayers,
  getPositionSurplus,
  isBenchPlayer,
  sumAssetValues,
  toFixedNumber,
} from './opportunityShared';
import { buildProposalContext, buildTradeProposal } from './proposalBuilder';
import {
  buildFallbackTargetCard,
  buildIncomingCompensationChoices,
  buildUpgradeFinderPackageCandidates,
  evaluateUpgradePackage,
  normalizeTradePostureLevel,
  resolveOutgoingPickAssets,
  resolveOutgoingPlayerAssets,
  scoreAllowedOutgoingPicks,
  scoreAllowedOutgoingPlayers,
  selectNeedDrivenTradeProposals,
} from './upgradePackaging';

export function findLeagueWideUpgradeGroups({
  opportunityLayer,
  targetPlayerId,
  allowedOutgoingPlayerIds = null,
  tradePostureLevel = 2,
  allowPackages = false,
  allowOutgoingPicks = false,
  allowIncomingPicks = false,
  rosterPicks = null,
  slots = null,
  league = null,
  drafts = [],
  currentSeason = null,
  pickValueMap = null,
  ktcPlayers = [],
  leagueType = '1qb',
  playerValueMap = null,
}) {
  const normalizedTradePostureLevel = normalizeTradePostureLevel(tradePostureLevel);
  if (!opportunityLayer?.myRosterId || !targetPlayerId) {
    return {
      targetPlayer: null,
      targetCard: null,
      minUpgradeDelta: 0,
      tradePostureLevel: normalizedTradePostureLevel,
      groups: [],
      proposals: [],
    };
  }

  const myRosterAnalysis = opportunityLayer.rosterAnalysesById?.[opportunityLayer.myRosterId] ?? null;
  const targetPlayer = myRosterAnalysis?.rosterPlayers?.find((player) => player.id === targetPlayerId) ?? null;
  if (!myRosterAnalysis || !targetPlayer) {
    return {
      targetPlayer: null,
      targetCard: null,
      minUpgradeDelta: 0,
      tradePostureLevel: normalizedTradePostureLevel,
      groups: [],
      proposals: [],
    };
  }

  const minUpgradeDelta = toFixedNumber(Math.max(0.3, 2.1 - (normalizedTradePostureLevel * 0.25)), 1);
  const myCards = opportunityLayer.allAnalysesByRosterId?.[opportunityLayer.myRosterId]?.cards ?? [];
  const targetCard = buildFallbackTargetCard(
    targetPlayer,
    myCards.find((card) => card.position === targetPlayer.normPos || card.weakStarter?.id === targetPlayer.id) ?? null,
  );

  const hasSelectedOutgoingPlayers = Boolean(allowedOutgoingPlayerIds?.length);
  const pickAssetsByRosterId = buildRosterPickAssetsById(
    [
      opportunityLayer.myRosterId,
      ...(opportunityLayer.rosterAnalyses ?? []).map((roster) => roster.roster_id),
    ],
    rosterPicks,
    slots,
    opportunityLayer.rosters,
    pickValueMap,
    currentSeason ?? opportunityLayer.currentSeason,
    league,
    drafts,
    ktcPlayers,
    leagueType,
  );
  const allowedPlayerAssets = hasSelectedOutgoingPlayers
    ? resolveOutgoingPlayerAssets(
        myRosterAnalysis,
        targetPlayer.id,
        allowedOutgoingPlayerIds,
        playerValueMap,
      )
    : [];
  const allowedPickAssets = resolveOutgoingPickAssets({
    myRosterId: opportunityLayer.myRosterId,
    rosterPickAssets: pickAssetsByRosterId.get(opportunityLayer.myRosterId) ?? [],
    allowOutgoingPicks,
  });

  const groups = [];

  for (const partnerAnalysis of opportunityLayer.rosterAnalyses ?? []) {
    if (partnerAnalysis.roster_id === opportunityLayer.myRosterId) continue;

    const partnerCards = opportunityLayer.allAnalysesByRosterId?.[partnerAnalysis.roster_id]?.cards ?? [];
    const partnerPickAssets = pickAssetsByRosterId.get(partnerAnalysis.roster_id) ?? [];
    const benchmark = opportunityLayer.benchmarkByPos?.[targetCard.position] ?? null;
    const partnerSurplus = getPositionSurplus(partnerAnalysis, targetCard.position, benchmark);
    const partnerPlayers = getPositionPlayers(partnerAnalysis, targetCard.position)
      .filter((player) => player.id !== targetPlayer.id)
      .filter((player) => (player.ppg ?? 0) > ((targetPlayer.ppg ?? 0) + minUpgradeDelta))
      .filter((player) => {
        if (normalizedTradePostureLevel >= 3) return true;
        const isBenchTarget = isBenchPlayer(partnerAnalysis, targetCard.position, player.id);
        return isBenchTarget || partnerSurplus.hasBenchSurplus;
      })
      .slice(0, 8);

    const proposals = [];

    for (const player of partnerPlayers) {
      const incomingAsset = buildPlayerAsset(player, partnerAnalysis.roster_id, playerValueMap);
      const upgradeDelta = Math.max(0, (player.ppg ?? 0) - (targetPlayer.ppg ?? 0));
      const isBenchTarget = isBenchPlayer(partnerAnalysis, targetCard.position, player.id);
      const partnerHasSurplus = isBenchTarget || partnerSurplus.hasBenchSurplus;
      const playerChoices = scoreAllowedOutgoingPlayers({
        allowedPlayerAssets,
        partnerCards,
        avoidPosition: targetCard.position,
        incomingAsset,
        tradePostureLevel: normalizedTradePostureLevel,
      });
      const pickChoices = scoreAllowedOutgoingPicks({
        allowedPickAssets,
        incomingAsset,
        tradePostureLevel: normalizedTradePostureLevel,
      });
      const packageCandidates = buildUpgradeFinderPackageCandidates({
        playerChoices,
        pickChoices,
        allowPackages,
        hasSelectedOutgoingPlayers,
        tradePostureLevel: normalizedTradePostureLevel,
      });

      for (const packageCandidate of packageCandidates) {
        const incomingCompChoices = buildIncomingCompensationChoices({
          partnerPickAssets,
          incomingPlayerAsset: incomingAsset,
          outgoingAssets: packageCandidate.outgoingAssets,
          tradePostureLevel: normalizedTradePostureLevel,
          allowIncomingPicks,
        });
        for (const incomingCompAssets of incomingCompChoices) {
          const allIncomingAssets = [incomingAsset, ...incomingCompAssets];
        const evaluation = evaluateUpgradePackage({
          incomingAssets: allIncomingAssets,
          outgoingAssets: packageCandidate.outgoingAssets,
          partnerNeedCard: packageCandidate.partnerNeedCard,
          partnerHasSurplus,
          tradePostureLevel: normalizedTradePostureLevel,
        });
        if (!evaluation.isViable) continue;

        const packageValueBonus = Math.min(24, sumAssetValues(packageCandidate.outgoingAssets) / 140);
        const proposalContext = buildProposalContext({
          myNeedCard: targetCard,
          partnerNeedCard: packageCandidate.partnerNeedCard,
          incomingAsset,
          incomingAssets: allIncomingAssets,
          outgoingAssets: packageCandidate.outgoingAssets,
          myRosterAnalysis,
          partnerAnalysis,
          benchmarkByPos: opportunityLayer.benchmarkByPos,
          playerValueMap,
        });
        const outgoingPickCount = packageCandidate.outgoingAssets.filter((asset) => asset.type === 'pick').length;
        const weakPartnerStarterGain = (proposalContext?.theirUpgradeDelta ?? 0) < 0.3;
        const comfortablePartnerDepth = Number(proposalContext?.theirNeedDepthCurrent ?? 0) >= 3;
        let partnerBenefitPenalty = 0;
        if (weakPartnerStarterGain) {
          partnerBenefitPenalty += 14;
          if (comfortablePartnerDepth) partnerBenefitPenalty += 10;
          if (outgoingPickCount === 0) partnerBenefitPenalty += 8;
        }
        const proposal = buildTradeProposal({
          myNeedCard: targetCard,
          partnerNeedCard: packageCandidate.partnerNeedCard,
          incomingAsset,
          incomingAssets: allIncomingAssets,
          outgoingAssets: packageCandidate.outgoingAssets,
          partnerRosterId: partnerAnalysis.roster_id,
          plausibilityScore: (upgradeDelta * 13.5)
            + (targetCard.severity * 0.85)
            + ((packageCandidate.partnerNeedCard?.severity ?? 0) * 1.15)
            + (partnerHasSurplus ? 14 : -16)
            + Math.min(18, evaluation.partnerNeedValue / 140)
            + packageValueBonus
            - (evaluation.postureDistance * 74)
            - partnerBenefitPenalty,
          paymentType: packageCandidate.paymentType,
          partnerHasSurplus,
          context: proposalContext,
        });
        proposals.push(proposal);
        }
      }
    }

    const viableProposals = proposals.filter(
      (proposal) => proposal.plausibilityScore >= (26 + ((4 - normalizedTradePostureLevel) * 1.5)),
    );
    const groupedProposals = selectNeedDrivenTradeProposals(
      viableProposals,
      4,
      2,
      allowIncomingPicks ? 1 : 0,
      allowOutgoingPicks ? 1 : 0,
      allowIncomingPicks ? 1 : 0,
      1,
      (allowIncomingPicks || allowOutgoingPicks) ? 2 : 0,
    );

    if (groupedProposals.length) {
      groups.push({
        rosterId: partnerAnalysis.roster_id,
        ownerId: partnerAnalysis.owner_id,
        proposals: groupedProposals,
      });
    }
  }

  groups.sort((a, b) => {
    const aTop = a.proposals[0]?.plausibilityScore ?? -1;
    const bTop = b.proposals[0]?.plausibilityScore ?? -1;
    return bTop - aTop;
  });

  return {
    targetPlayer: buildPlayerAsset(targetPlayer, opportunityLayer.myRosterId, playerValueMap),
    targetCard,
    tradePostureLevel: normalizedTradePostureLevel,
    minUpgradeDelta,
    groups,
    proposals: groups.flatMap((group) => group.proposals),
  };
}
