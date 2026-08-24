import { getOpportunityPositionLabel } from './opportunityPositions';
import { buildCombinations, buildPlayerAsset, comparePlayers, sumAssetValues } from './opportunityShared';

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeTradePostureLevel(level) {
  return clamp(Number.isFinite(Number(level)) ? Number(level) : 2, 0, 4);
}

export const TRADE_POSTURE_SETTING_POINTS = [
  { level: 0, key: 'underpay', targetRatio: 0.72, minRatio: 0.55, maxRatio: 0.88, minCoverageRatio: 0.82, samePosPenalty: 18, allowPickOnly: false },
  { level: 1, key: 'lean_under', targetRatio: 0.9, minRatio: 0.8, maxRatio: 0.98, minCoverageRatio: 0.88, samePosPenalty: 16, allowPickOnly: false },
  { level: 2, key: 'fair', targetRatio: 1.0, minRatio: 0.92, maxRatio: 1.08, minCoverageRatio: 0.94, samePosPenalty: 14, allowPickOnly: false },
  { level: 3, key: 'lean_over', targetRatio: 1.1, minRatio: 1.02, maxRatio: 1.18, minCoverageRatio: 0.97, samePosPenalty: 12, allowPickOnly: true },
  { level: 4, key: 'overpay', targetRatio: 1.26, minRatio: 1.14, maxRatio: 1.42, minCoverageRatio: 1.0, samePosPenalty: 10, allowPickOnly: true },
];

export function interpolateNumber(left, right, amount) {
  return left + ((right - left) * amount);
}

export function getTradePostureSettings(level) {
  const normalizedLevel = normalizeTradePostureLevel(level);
  const lowerIndex = Math.floor(normalizedLevel);
  const upperIndex = Math.ceil(normalizedLevel);
  const lower = TRADE_POSTURE_SETTING_POINTS[lowerIndex] ?? TRADE_POSTURE_SETTING_POINTS[2];
  const upper = TRADE_POSTURE_SETTING_POINTS[upperIndex] ?? lower;
  const amount = normalizedLevel - lower.level;
  const nearest = amount >= 0.5 ? upper : lower;

  if (lower === upper) return { ...lower };

  return {
    level: normalizedLevel,
    key: nearest.key,
    targetRatio: interpolateNumber(lower.targetRatio, upper.targetRatio, amount),
    minRatio: interpolateNumber(lower.minRatio, upper.minRatio, amount),
    maxRatio: interpolateNumber(lower.maxRatio, upper.maxRatio, amount),
    minCoverageRatio: interpolateNumber(lower.minCoverageRatio, upper.minCoverageRatio, amount),
    samePosPenalty: interpolateNumber(lower.samePosPenalty, upper.samePosPenalty, amount),
    allowPickOnly: normalizedLevel >= 2.5,
  };
}

export function buildFallbackTargetCard(targetPlayer, existingCard) {
  if (existingCard) {
    return {
      ...existingCard,
      weakStarter: targetPlayer,
      weakStarterPPG: targetPlayer?.ppg ?? 0,
    };
  }

  return {
    position: targetPlayer?.normPos ?? null,
    label: getOpportunityPositionLabel(targetPlayer?.normPos ?? targetPlayer?.position ?? ''),
    severity: 45,
    weakStarter: targetPlayer ?? null,
    weakStarterPPG: targetPlayer?.ppg ?? 0,
    bestBackup: null,
    starterToBackupGap: 0,
  };
}

export function resolveOutgoingPlayerAssets(myRosterAnalysis, targetPlayerId, allowedOutgoingPlayerIds, playerValueMap = null) {
  if (!myRosterAnalysis) return [];

  const benchAssets = Object.values(myRosterAnalysis.benchByPos ?? {})
    .flat()
    .filter((player) => player.id !== targetPlayerId)
    .map((player) => buildPlayerAsset(player, myRosterAnalysis.roster_id, playerValueMap))
    .filter(Boolean)
    .sort((a, b) => comparePlayers(a, b));

  if (!allowedOutgoingPlayerIds?.length) return benchAssets;

  const allowedSet = new Set(allowedOutgoingPlayerIds);
  return (myRosterAnalysis.rosterPlayers ?? [])
    .filter((player) => player.id !== targetPlayerId && allowedSet.has(player.id))
    .map((player) => buildPlayerAsset(player, myRosterAnalysis.roster_id, playerValueMap))
    .filter(Boolean)
    .sort((a, b) => comparePlayers(a, b));
}

export function resolveOutgoingPickAssets({
  myRosterId,
  rosterPickAssets = [],
  allowOutgoingPicks,
}) {
  if (!allowOutgoingPicks) return [];
  if (!myRosterId) return [];
  return rosterPickAssets;
}

export function scoreAllowedOutgoingPlayers({
  allowedPlayerAssets,
  partnerCards,
  avoidPosition,
  incomingAsset,
  tradePostureLevel,
}) {
  if (!allowedPlayerAssets?.length) return [];
  const posture = getTradePostureSettings(tradePostureLevel);
  const partnerNeedByPos = Object.fromEntries((partnerCards ?? []).map((card) => [card.position, card]));
  const scored = [];
  for (const asset of allowedPlayerAssets) {
    const matchingNeed = partnerNeedByPos[asset.normPos] ?? null;
    const helpsNeed = matchingNeed?.weakStarter
      ? Math.max(0, (asset.ppg ?? 0) - (matchingNeed.weakStarter.ppg ?? 0))
      : 0;
    const samePosPenalty = asset.normPos === avoidPosition ? posture.samePosPenalty : 0;
    const ratio = Math.max(0, Number(asset.value ?? 0)) / Math.max(1, Number(incomingAsset?.value ?? 0));
    const posturePenalty = Math.abs(ratio - posture.targetRatio) * 80;
    const score = (matchingNeed?.severity ?? 0) * 1.5
      + (helpsNeed * 8)
      - samePosPenalty
      - posturePenalty;

    scored.push({
      asset,
      partnerNeed: matchingNeed,
      ratio,
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function scoreAllowedOutgoingPicks({
  allowedPickAssets,
  incomingAsset,
  tradePostureLevel,
}) {
  if (!allowedPickAssets?.length) return [];

  const posture = getTradePostureSettings(tradePostureLevel);
  const incomingValue = Math.max(180, Number(incomingAsset?.value) || 0);
  const targetValue = Math.max(140, incomingValue * posture.targetRatio);

  const scored = allowedPickAssets.map((asset) => {
    const distance = Math.abs((asset.value ?? 0) - targetValue);
    const premiumPenalty = asset.isOwn ? 18 : 0;
    const roundPenalty = Math.max(0, 24 - ((asset.round ?? 99) * 5));
    return {
      asset,
      ratio: Math.max(0, Number(asset.value ?? 0)) / incomingValue,
      score: 120 - (distance / 8) - premiumPenalty - roundPenalty,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function evaluateUpgradePackage({
  incomingAssets,
  outgoingAssets,
  partnerNeedCard,
  partnerHasSurplus,
  tradePostureLevel,
}) {
  const posture = getTradePostureSettings(tradePostureLevel);
  const incomingValue = Math.max(0, sumAssetValues(incomingAssets));
  const outgoingValue = sumAssetValues(outgoingAssets);
  const outgoingAssetCount = outgoingAssets.length;
  const outgoingPlayers = outgoingAssets.filter((asset) => asset.type === 'player');
  const outgoingPicks = outgoingAssets.filter((asset) => asset.type === 'pick');
  const partnerNeedSeverity = partnerNeedCard?.severity ?? 0;
  const partnerNeedDelta = outgoingPlayers.length && partnerNeedCard?.weakStarter
    ? outgoingPlayers
      .filter((asset) => !partnerNeedCard?.position || asset.normPos === partnerNeedCard.position)
      .reduce((sum, asset) => sum + Math.max(0, (asset.ppg ?? 0) - (partnerNeedCard.weakStarter.ppg ?? 0)), 0)
    : 0;
  const partnerNeedValue = (partnerNeedSeverity * 36) + (partnerNeedDelta * 185) + (partnerHasSurplus ? 180 : -160);
  const effectiveOfferValue = outgoingValue + Math.max(0, partnerNeedValue);
  const directRatio = outgoingValue / Math.max(1, incomingValue);
  const overpayValue = Math.max(0, outgoingValue - incomingValue);
  const packageFlex = Math.max(0, outgoingAssetCount - 1) * 0.16;
  const adjustedTargetRatio = posture.targetRatio + (packageFlex * 0.45);
  const adjustedMaxRatio = posture.maxRatio + packageFlex;
  const coversIncoming = effectiveOfferValue >= (incomingValue * posture.minCoverageRatio);
  const matchesPosture = directRatio >= posture.minRatio && directRatio <= adjustedMaxRatio;
  const postureDistance = Math.abs(directRatio - adjustedTargetRatio);
  const addressesNeed = Boolean(
    (outgoingPlayers.length && partnerNeedCard && (partnerNeedSeverity >= 18 || partnerNeedDelta >= 0.8))
    || (outgoingPicks.length && partnerHasSurplus && posture.allowPickOnly),
  );

  return {
    incomingValue,
    outgoingValue,
    partnerNeedValue,
    effectiveOfferValue,
    directRatio,
    overpayValue,
    postureDistance,
    addressesNeed,
    matchesPosture,
    isViable: coversIncoming && matchesPosture && addressesNeed,
  };
}

export function getTradeProposalShapeSignature(proposal) {
  const incomingPlayerCount = proposal.incomingAssets.filter((asset) => asset.type === 'player').length;
  const incomingPickCount = proposal.incomingAssets.filter((asset) => asset.type === 'pick').length;
  const outgoingPlayerCount = proposal.outgoingAssets.filter((asset) => asset.type === 'player').length;
  const outgoingPickCount = proposal.outgoingAssets.filter((asset) => asset.type === 'pick').length;
  return `${outgoingPlayerCount}p-${outgoingPickCount}k:${incomingPlayerCount}p-${incomingPickCount}k`;
}

export function dedupeTradeProposals(proposals, limit = 4, maxPerShape = Number.POSITIVE_INFINITY) {
  const sorted = [...(proposals ?? [])]
    .sort((a, b) => b.plausibilityScore - a.plausibilityScore || b.upgradeDelta - a.upgradeDelta);
  const deduped = [];
  const seen = new Set();
  const shapeCounts = new Map();
  const overflow = [];

  for (const proposal of sorted) {
    const key = [
      proposal.targetRosterId,
      proposal.incomingAssets.map((asset) => asset.id).join(','),
      proposal.outgoingAssets.map((asset) => asset.id).join(','),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const shapeKey = getTradeProposalShapeSignature(proposal);
    const usedForShape = shapeCounts.get(shapeKey) ?? 0;
    if (usedForShape >= maxPerShape) {
      overflow.push(proposal);
      continue;
    }
    shapeCounts.set(shapeKey, usedForShape + 1);
    deduped.push(proposal);
    if (deduped.length >= limit) break;
  }

  if (deduped.length < limit) {
    for (const proposal of overflow) {
      deduped.push(proposal);
      if (deduped.length >= limit) break;
    }
  }

  return deduped;
}

export function proposalHasAnyPicks(proposal) {
  return proposal?.outgoingAssets?.some((asset) => asset.type === 'pick')
    || proposal?.incomingAssets?.some((asset) => asset.type === 'pick');
}

export function proposalHasOutgoingPicks(proposal) {
  return proposal?.outgoingAssets?.some((asset) => asset.type === 'pick');
}

export function proposalHasIncomingPicks(proposal) {
  return proposal?.incomingAssets?.some((asset) => asset.type === 'pick');
}

export function proposalOutgoingPlayerCount(proposal) {
  return proposal?.outgoingAssets?.filter((asset) => asset.type === 'player').length ?? 0;
}

export function proposalIncomingPlayerCount(proposal) {
  return proposal?.incomingAssets?.filter((asset) => asset.type === 'player').length ?? 0;
}

export function needDrivenProposalSortScore(proposal) {
  const incomingPlayers = proposalIncomingPlayerCount(proposal);
  const incomingPicks = proposalHasIncomingPicks(proposal);
  const outgoingPlayers = proposalOutgoingPlayerCount(proposal);
  const outgoingPicks = proposalHasOutgoingPicks(proposal);
  let score = (proposal?.plausibilityScore ?? 0) + ((proposal?.upgradeDelta ?? 0) * 0.35);

  if (incomingPicks && incomingPlayers === 1) score += 10;
  else if (incomingPicks) score += 5;

  if (outgoingPicks && outgoingPlayers === 0) score += 12;
  else if (outgoingPicks) score += 4;

  if (!incomingPicks && incomingPlayers >= 3) score -= 8;
  else if (!incomingPicks && incomingPlayers === 2) score -= 4;

  return score;
}

export function appendUniqueProposals(target, proposals) {
  const seen = new Set(target.map((proposal) => proposal.id));
  for (const proposal of proposals) {
    if (seen.has(proposal.id)) continue;
    seen.add(proposal.id);
    target.push(proposal);
  }
}

export function selectNeedDrivenTradeProposals(
  proposals,
  limit = 12,
  maxPerShape = 2,
  minSinglePlayerWithIncomingPicks = 2,
  minOutgoingPickOnly = 2,
  minOutgoingPickInclusive = 2,
  minIncomingPickInclusive = 2,
  minSinglePlayerNoPicks = 2,
  minAnyPickInclusive = 4,
) {
  const viable = [...(proposals ?? [])]
    .filter((proposal) => proposal?.whyItHelpsMe && proposal?.whyItHelpsThem)
    .sort((a, b) => needDrivenProposalSortScore(b) - needDrivenProposalSortScore(a)
      || b.plausibilityScore - a.plausibilityScore
      || b.upgradeDelta - a.upgradeDelta);

  const pickInclusive = viable.filter((proposal) => proposalHasAnyPicks(proposal));
  if (!pickInclusive.length) return dedupeTradeProposals(viable, limit, maxPerShape);

  const reserved = [];
  const reserveFromSubset = (subset, count) => {
    if (!subset.length || count <= 0 || reserved.length >= limit) return;
    const picks = dedupeTradeProposals(
      subset.filter((proposal) => !reserved.some((item) => item.id === proposal.id)),
      Math.min(limit - reserved.length, count, subset.length),
      maxPerShape,
    );
    appendUniqueProposals(reserved, picks);
  };

  reserveFromSubset(
    pickInclusive.filter((proposal) => proposalHasIncomingPicks(proposal) && proposalIncomingPlayerCount(proposal) === 1),
    minSinglePlayerWithIncomingPicks,
  );
  reserveFromSubset(
    pickInclusive.filter((proposal) => proposalHasOutgoingPicks(proposal) && proposalOutgoingPlayerCount(proposal) === 0),
    minOutgoingPickOnly,
  );
  reserveFromSubset(pickInclusive.filter((proposal) => proposalHasIncomingPicks(proposal)), minIncomingPickInclusive);
  reserveFromSubset(pickInclusive.filter((proposal) => proposalHasOutgoingPicks(proposal)), minOutgoingPickInclusive);
  reserveFromSubset(
    viable.filter((proposal) => !proposalHasAnyPicks(proposal) && proposalIncomingPlayerCount(proposal) === 1),
    minSinglePlayerNoPicks,
  );
  const remainingPickNeeded = Math.max(0, minAnyPickInclusive - reserved.filter((proposal) => proposalHasAnyPicks(proposal)).length);
  reserveFromSubset(pickInclusive, remainingPickNeeded);

  const reservedIds = new Set(reserved.map((proposal) => proposal.id));
  const remainder = dedupeTradeProposals(
    viable.filter((proposal) => !reservedIds.has(proposal.id)),
    Math.max(0, limit - reserved.length),
    maxPerShape,
  );

  return [...reserved, ...remainder];
}

export function getSurplusReturnShape(proposal) {
  const incomingPlayerCount = proposal?.incomingAssets?.filter((asset) => asset.type === 'player').length ?? 0;
  const incomingPickCount = proposal?.incomingAssets?.filter((asset) => asset.type === 'pick').length ?? 0;
  if (incomingPlayerCount > 0 && incomingPickCount > 0) return 'mixed';
  if (incomingPlayerCount > 0) return 'players_only';
  if (incomingPickCount > 0) return 'picks_only';
  return 'other';
}

export function selectSurplusTradeProposals(
  proposals,
  limit = 12,
  maxPerShape = 2,
  minPlayersOnly = 3,
  minPicksOnly = 3,
  minMixed = 3,
) {
  const viable = [...(proposals ?? [])]
    .filter((proposal) => proposal?.whyItHelpsMe && proposal?.whyItHelpsThem)
    .sort((a, b) => b.plausibilityScore - a.plausibilityScore || b.upgradeDelta - a.upgradeDelta);

  const reserved = [];
  const reserveFromShape = (shape, count) => {
    if (count <= 0 || reserved.length >= limit) return;
    const subset = viable.filter(
      (proposal) => getSurplusReturnShape(proposal) === shape && !reserved.some((item) => item.id === proposal.id),
    );
    if (!subset.length) return;
    appendUniqueProposals(
      reserved,
      dedupeTradeProposals(subset, Math.min(limit - reserved.length, count, subset.length), maxPerShape),
    );
  };

  reserveFromShape('players_only', minPlayersOnly);
  reserveFromShape('picks_only', minPicksOnly);
  reserveFromShape('mixed', minMixed);

  const reservedIds = new Set(reserved.map((proposal) => proposal.id));
  const remainder = dedupeTradeProposals(
    viable.filter((proposal) => !reservedIds.has(proposal.id)),
    Math.max(0, limit - reserved.length),
    maxPerShape,
  );

  return [...reserved, ...remainder];
}

export function buildUpgradeFinderPackageCandidates({
  playerChoices,
  pickChoices,
  allowPackages,
  hasSelectedOutgoingPlayers,
  tradePostureLevel,
}) {
  const candidates = [];
  const topPlayers = (playerChoices ?? []).slice(0, allowPackages ? 6 : 1);
  const topPicks = (pickChoices ?? []).slice(0, allowPackages ? 4 : 1);
  const posture = getTradePostureSettings(tradePostureLevel);
  const maxAssetCount = allowPackages ? 3 : 1;
  const seen = new Set();

  function addCandidate(playerCombo = [], pickCombo = []) {
    const outgoingAssets = [...playerCombo.map((choice) => choice.asset), ...pickCombo.map((choice) => choice.asset)];
    if (!outgoingAssets.length || outgoingAssets.length > 3) return;
    const key = outgoingAssets.map((asset) => asset.id).sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);

    const sortedPlayerChoices = [...playerCombo].sort((a, b) => (b.partnerNeed?.severity ?? 0) - (a.partnerNeed?.severity ?? 0));
    const playerCount = playerCombo.length;
    const pickCount = pickCombo.length;
    let paymentType = 'multi_asset';
    if (playerCount === 1 && pickCount === 0) paymentType = 'player';
    else if (playerCount === 0 && pickCount === 1) paymentType = 'pick';
    else if (playerCount === 1 && pickCount === 1) paymentType = 'player_plus_pick';
    else if (playerCount === 2 && pickCount === 0) paymentType = 'player_plus_player';

    candidates.push({
      outgoingAssets,
      partnerNeedCard: sortedPlayerChoices[0]?.partnerNeed ?? null,
      paymentType,
    });
  }

  const playerCombos = buildCombinations(topPlayers, 1, Math.min(maxAssetCount, topPlayers.length));
  const pickCombos = buildCombinations(topPicks, 1, Math.min(maxAssetCount, topPicks.length));

  for (const playerCombo of playerCombos) addCandidate(playerCombo, []);

  if (!hasSelectedOutgoingPlayers || posture.allowPickOnly) {
    for (const pickCombo of pickCombos) addCandidate([], pickCombo);
  }

  for (const playerCombo of playerCombos) {
    for (const pickCombo of pickCombos) {
      if ((playerCombo.length + pickCombo.length) > 3) continue;
      addCandidate(playerCombo, pickCombo);
    }
  }

  return candidates;
}

export function buildIncomingCompensationChoices({
  partnerPickAssets,
  incomingAssets = null,
  incomingPlayerAsset,
  outgoingAssets,
  tradePostureLevel,
  allowIncomingPicks,
  maxIncomingPickCount = 2,
}) {
  if (!allowIncomingPicks || !partnerPickAssets?.length || maxIncomingPickCount <= 0) return [[]];

  const posture = getTradePostureSettings(tradePostureLevel);

  const outgoingValue = sumAssetValues(outgoingAssets);
  const resolvedIncomingAssets = incomingAssets?.length ? incomingAssets : (incomingPlayerAsset ? [incomingPlayerAsset] : []);
  const baseIncomingValue = Math.max(1, sumAssetValues(resolvedIncomingAssets));
  const targetIncomingValue = outgoingValue / posture.targetRatio;
  const neededCompValue = Math.max(0, targetIncomingValue - baseIncomingValue);
  if (neededCompValue <= 120) return [[]];

  const topPartnerPicks = [...partnerPickAssets]
    .sort((a, b) => Math.abs((a.value ?? 0) - neededCompValue) - Math.abs((b.value ?? 0) - neededCompValue))
    .slice(0, 4);

  const combos = buildCombinations(topPartnerPicks, 1, Math.min(maxIncomingPickCount, topPartnerPicks.length))
    .map((combo) => ({
      assets: combo,
      diff: Math.abs(sumAssetValues(combo) - neededCompValue),
    }))
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 3)
    .map((entry) => entry.assets);

  return [[], ...combos];
}
