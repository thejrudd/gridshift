import { getOpportunityPositionLabel } from './opportunityPositions';
import {
  buildCombinations,
  buildExtraPlayerClauses,
  buildPlayerAsset,
  buildPositionPackageClauses,
  buildRosterPickAssetsById,
  buildTradeAwaySummaryByPos,
  comparePlayers,
  finalizeDeferredProposal,
  formatReasonAssetList,
  getPaymentTypeForAssets,
  getPositionDepthCount,
  getPositionPlayers,
  getPositionSurplus,
  getPrimaryPlayerAsset,
  getRosterPickAssets,
  groupPlayerAssetsByPosition,
  hasSustainableTradeAwayDepth,
  isBenchPlayer,
  sumAssetValues,
  toFixedNumber,
} from './opportunityShared';
import {
  buildIncomingCompensationChoices,
  buildUpgradeFinderPackageCandidates,
  evaluateUpgradePackage,
  selectNeedDrivenTradeProposals,
  selectSurplusTradeProposals,
} from './upgradePackaging';

export function buildProposalContext({
  myNeedCard,
  partnerNeedCard,
  incomingAsset,
  incomingAssets = [],
  outgoingAssets,
  myRosterAnalysis,
  partnerAnalysis,
  benchmarkByPos,
  playerValueMap,
}) {
  const outgoingPlayerAssets = (outgoingAssets ?? []).filter((asset) => asset.type === 'player');
  const outgoingPlayer = outgoingPlayerAssets[0] ?? null;
  const resolvedIncomingAssets = incomingAssets?.length ? incomingAssets : (incomingAsset ? [incomingAsset] : []);
  const primaryIncomingPlayer = resolvedIncomingAssets.find((asset) => asset.type === 'player') ?? incomingAsset ?? null;
  const tradeAwayPos = primaryIncomingPlayer?.normPos ?? primaryIncomingPlayer?.position ?? null;
  const myNeedBenchmark = myNeedCard?.position ? benchmarkByPos?.[myNeedCard.position] ?? null : null;
  const myFallbackPlayers = myNeedCard?.position
    ? getPositionPlayers(myRosterAnalysis, myNeedCard.position)
      .filter((player) => player.id !== myNeedCard?.weakStarter?.id)
      .filter((player) => (player.ppg ?? 0) >= (myNeedBenchmark?.playableThreshold ?? 0))
    : [];
  const myNeedFallback = myFallbackPlayers[0] ?? null;
  const myNeedDepthCurrent = myFallbackPlayers.length;
  const theirNeedPosition = partnerNeedCard?.position ?? outgoingPlayer?.normPos ?? null;
  const needBenchmark = theirNeedPosition ? benchmarkByPos?.[theirNeedPosition] ?? null : null;
  const samePosOutgoingPlayers = theirNeedPosition
    ? outgoingPlayerAssets.filter((asset) => (asset.normPos ?? asset.position) === theirNeedPosition)
    : outgoingPlayerAssets;
  const primaryOutgoingForNeed = [...samePosOutgoingPlayers]
    .sort((a, b) => (b.ppg ?? 0) - (a.ppg ?? 0) || (b.value ?? 0) - (a.value ?? 0))[0] ?? outgoingPlayer ?? null;
  const needDepthCurrent = theirNeedPosition
    ? getPositionDepthCount(partnerAnalysis, theirNeedPosition, needBenchmark)
    : 0;
  const needRoomSizeBefore = theirNeedPosition
    ? getPositionPlayers(partnerAnalysis, theirNeedPosition).length
    : 0;
  const addedPlayableNeedPlayers = samePosOutgoingPlayers.filter((asset) => (asset.ppg ?? 0) >= (needBenchmark?.playableThreshold ?? 0)).length;
  const needDepthAfter = needDepthCurrent + addedPlayableNeedPlayers;
  const needRoomSizeAfter = needRoomSizeBefore + samePosOutgoingPlayers.length;
  const theirTradeAwaySummaryByPos = buildTradeAwaySummaryByPos(partnerAnalysis, resolvedIncomingAssets, benchmarkByPos, playerValueMap);
  const theirPrimarySummary = tradeAwayPos ? theirTradeAwaySummaryByPos[tradeAwayPos] ?? null : null;
  const theirTradeAwayFallback = theirPrimarySummary?.fallbackAssets?.[0] ?? null;
  const theirTradeAwayDepthAfter = theirPrimarySummary?.depthAfter ?? 0;
  const theirTradeAwayDeltaVsOutgoing = theirTradeAwayFallback
    ? (Number(theirTradeAwayFallback.ppg ?? 0) - Number(primaryIncomingPlayer?.ppg ?? 0))
    : null;
  const theirUpgradeDelta = primaryOutgoingForNeed && partnerNeedCard?.weakStarter
    ? Math.max(0, (primaryOutgoingForNeed.ppg ?? 0) - (partnerNeedCard.weakStarter.ppg ?? 0))
    : 0;
  const myUpgradeDelta = Math.max(0, (incomingAsset?.ppg ?? 0) - (myNeedCard?.weakStarter?.ppg ?? 0));

  return {
    myUpgradeFrom: myNeedCard?.weakStarter ?? null,
    myUpgradeTo: incomingAsset ?? null,
    myUpgradeDelta: toFixedNumber(myUpgradeDelta, 1),
    myNeedPosition: myNeedCard?.position ?? null,
    myNeedFallback: myNeedFallback ? buildPlayerAsset(myNeedFallback, myRosterAnalysis?.roster_id, playerValueMap) : null,
    myNeedDepthCurrent,
    theirNeedPosition: partnerNeedCard?.position ?? null,
    theirNeedStarter: partnerNeedCard?.weakStarter ?? null,
    theirUpgradeWith: primaryOutgoingForNeed,
    theirUpgradeDelta: toFixedNumber(theirUpgradeDelta, 1),
    theirNeedDepthCurrent: needDepthCurrent,
    theirNeedDepthAfter: needDepthAfter,
    theirNeedRoomSizeBefore: needRoomSizeBefore,
    theirNeedRoomSizeAfter: needRoomSizeAfter,
    theirNeedIncomingPlayerCount: samePosOutgoingPlayers.length,
    theirNeedAdditionalPlayers: Math.max(0, samePosOutgoingPlayers.length - 1),
    theirTradeAwayPosition: tradeAwayPos,
    theirTradeAwayPlayer: primaryIncomingPlayer ?? null,
    theirTradeAwayFallback: theirTradeAwayFallback ? buildPlayerAsset(theirTradeAwayFallback, partnerAnalysis.roster_id, playerValueMap) : null,
    theirTradeAwayDepthAfter,
    theirTradeAwayDeltaVsOutgoing: theirTradeAwayDeltaVsOutgoing == null ? null : toFixedNumber(theirTradeAwayDeltaVsOutgoing, 1),
    theirTradeAwaySummaryByPos,
  };
}

export function pickOutgoingPlayerChip(myRosterAnalysis, myCards, partnerCards, myNeedPosition, targetPlayer) {
  if (!myRosterAnalysis || !partnerCards?.length) return null;

  const myCardsByPos = Object.fromEntries((myCards ?? []).map((card) => [card.position, card]));
  const scored = [];
  for (const partnerNeed of partnerCards) {
    const needPos = partnerNeed.position;
    if (needPos === myNeedPosition) continue;
    const myCardAtNeed = myCardsByPos[needPos] ?? null;
    const mySeverityAtNeed = myCardAtNeed?.severity ?? 0;
    const benchPlayers = [...(myRosterAnalysis.benchByPos[needPos] ?? [])]
      .filter((player) => (player.ppg > 0 || player.seasonPts > 0))
      .sort(comparePlayers);

    for (const candidate of benchPlayers) {
      const benefitDelta = partnerNeed.weakStarter
        ? Math.max(0, (candidate.ppg ?? 0) - (partnerNeed.weakStarter.ppg ?? 0))
        : Math.max(0, candidate.ppg ?? 0);
      const myLossPenalty = mySeverityAtNeed * 0.75;
      const score = (partnerNeed.severity * 1.8) + (benefitDelta * 10) - myLossPenalty - Math.abs((candidate.ppg ?? 0) - (targetPlayer?.ppg ?? 0));
      scored.push({
        candidate,
        partnerNeed,
        benefitDelta,
        myLossPenalty,
        score,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored[0] ?? null;
}

export function pickOutgoingPlayerChoices(myRosterAnalysis, myCards, partnerCards, myNeedPosition, targetPlayer, playerValueMap = null, limit = 3) {
  if (!myRosterAnalysis || !partnerCards?.length) return [];

  const myCardsByPos = Object.fromEntries((myCards ?? []).map((card) => [card.position, card]));
  const scored = [];
  for (const partnerNeed of partnerCards) {
    const needPos = partnerNeed.position;
    if (needPos === myNeedPosition) continue;
    const myCardAtNeed = myCardsByPos[needPos] ?? null;
    const mySeverityAtNeed = myCardAtNeed?.severity ?? 0;
    const benchPlayers = [...(myRosterAnalysis.benchByPos[needPos] ?? [])]
      .filter((player) => (player.ppg > 0 || player.seasonPts > 0))
      .sort(comparePlayers);

    for (const candidate of benchPlayers) {
      const benefitDelta = partnerNeed.weakStarter
        ? Math.max(0, (candidate.ppg ?? 0) - (partnerNeed.weakStarter.ppg ?? 0))
        : Math.max(0, candidate.ppg ?? 0);
      const myLossPenalty = mySeverityAtNeed * 0.75;
      const score = (partnerNeed.severity * 1.8) + (benefitDelta * 10) - myLossPenalty - Math.abs((candidate.ppg ?? 0) - (targetPlayer?.ppg ?? 0));
      scored.push({
        asset: buildPlayerAsset(candidate, myRosterAnalysis.roster_id, playerValueMap),
        partnerNeed,
        benefitDelta,
        myLossPenalty,
        score,
      });
    }
  }

  const unique = [];
  const seen = new Set();
  for (const item of scored.sort((a, b) => b.score - a.score)) {
    if (seen.has(item.asset.id)) continue;
    seen.add(item.asset.id);
    unique.push(item);
    if (unique.length >= limit) break;
  }
  return unique;
}

export function pickSpareDraftCapitalOptions(pickAssets, upgradeDelta, limit = 3) {
  if (!pickAssets?.length) return [];
  const sorted = [...pickAssets].sort((a, b) => {
    const aPenalty = (a.isOwn ? 10 : 0) + ((a.round ?? 99) * 8) + ((a.year ?? 0) - 2020);
    const bPenalty = (b.isOwn ? 10 : 0) + ((b.round ?? 99) * 8) + ((b.year ?? 0) - 2020);
    return bPenalty - aPenalty;
  });

  const filtered = upgradeDelta >= 3.5
    ? sorted.filter((pick) => (pick.round ?? 99) <= 2)
    : sorted.filter((pick) => (pick.round ?? 99) >= 2);

  return (filtered.length ? filtered : sorted).slice(0, limit);
}

export function getOutgoingPickReasonForMe(outgoingPickAssets = [], outgoingPlayerAsset = null) {
  if (!outgoingPickAssets.length) return null;
  if (outgoingPickAssets.length === 1) {
    if (outgoingPlayerAsset) {
      return `You send ${outgoingPickAssets[0].label} to close the value gap without giving up another current player.`;
    }
    return `You send ${outgoingPickAssets[0].label} as the future draft value needed to buy the upgrade without giving up another player.`;
  }

  if (outgoingPlayerAsset) {
    return `You send ${formatReasonAssetList(outgoingPickAssets)} to close the value gap without giving up another current player.`;
  }
  return `You send ${formatReasonAssetList(outgoingPickAssets)} as the future draft value needed to buy the upgrade without giving up another player.`;
}

export function getOutgoingPickReasonForThem(outgoingPickAssets = []) {
  if (!outgoingPickAssets.length) return null;
  if (outgoingPickAssets.length === 1) {
    return `They also get ${outgoingPickAssets[0].label} as future draft value.`;
  }
  return `They also get ${formatReasonAssetList(outgoingPickAssets)} as future draft value.`;
}

export function getIncomingPickReasonForMe(incomingPickAssets = []) {
  if (!incomingPickAssets.length) return null;
  if (incomingPickAssets.length === 1) {
    return `You also get ${incomingPickAssets[0].label} back to balance the value.`;
  }
  return `You also get ${formatReasonAssetList(incomingPickAssets)} back to balance the value.`;
}

export function getMyReasonPayload(card, incomingAssets, upgradeDelta, outgoingPickAssets = [], outgoingPlayerAsset = null) {
  const context = arguments[5] ?? null;
  const incomingPlayerAssets = (incomingAssets ?? []).filter((asset) => asset?.type === 'player');
  const incomingPickAssets = (incomingAssets ?? []).filter((asset) => asset?.type === 'pick');
  const primaryIncomingAsset = incomingPlayerAssets.find((asset) => asset.normPos === card?.position)
    ?? incomingPlayerAssets[0]
    ?? incomingAssets?.[0]
    ?? null;
  if (!card?.weakStarter || !primaryIncomingAsset) return { type: null, text: null };

  const delta = upgradeDelta.toFixed(1);
  const positionLabel = card.label ?? getOpportunityPositionLabel(card.position);
  const weakStarterName = card.weakStarter.name;
  const pickReason = getOutgoingPickReasonForMe(outgoingPickAssets, outgoingPlayerAsset);
  const extraIncomingPlayerReason = buildExtraPlayerClauses(incomingPlayerAssets, primaryIncomingAsset?.id, 'you');
  const incomingPickReason = getIncomingPickReasonForMe(incomingPickAssets);
  const primaryLabel = formatReasonAssetList([primaryIncomingAsset]);
  const fallbackPlayer = context?.myNeedFallback ?? card?.bestBackup ?? null;
  const fallbackDepth = context?.myNeedDepthCurrent ?? null;
  const hasPlayableFallback = fallbackDepth != null ? fallbackDepth > 0 : !!card?.hasPlayableFallback;

  if ((card.assignedStarterCount ?? 0) < (card.expectedStarterCount ?? 0)) {
    return {
      type: outgoingPickAssets.length ? 'shortage_upgrade_with_pick' : 'shortage_upgrade',
      text: `${primaryLabel} upgrades ${weakStarterName} by ${delta} PPG and helps stabilize a thin ${positionLabel} group for you.${extraIncomingPlayerReason.length ? ` ${extraIncomingPlayerReason.join(' ')}` : ''}${incomingPickReason ? ` ${incomingPickReason}` : ''}${pickReason ? ` ${pickReason}` : ''}`,
    };
  }

  if (!hasPlayableFallback) {
    return {
      type: outgoingPickAssets.length ? 'no_playable_fallback_with_pick' : 'no_playable_fallback',
      text: `${primaryLabel} upgrades ${weakStarterName} by ${delta} PPG, and you do not currently have a playable fallback behind that ${positionLabel} spot.${extraIncomingPlayerReason.length ? ` ${extraIncomingPlayerReason.join(' ')}` : ''}${incomingPickReason ? ` ${incomingPickReason}` : ''}${pickReason ? ` ${pickReason}` : ''}`,
    };
  }

  if (fallbackPlayer) {
    return {
      type: outgoingPickAssets.length ? 'depth_gap_with_pick' : 'depth_gap',
      text: `${primaryLabel} upgrades ${weakStarterName} by ${delta} PPG, and your closest fallback at ${positionLabel} would be ${fallbackPlayer.name}.${extraIncomingPlayerReason.length ? ` ${extraIncomingPlayerReason.join(' ')}` : ''}${incomingPickReason ? ` ${incomingPickReason}` : ''}${pickReason ? ` ${pickReason}` : ''}`,
    };
  }

  if (card.schedulePressure?.toughCount >= 2) {
    return {
      type: outgoingPickAssets.length ? 'schedule_pressure_with_pick' : 'schedule_pressure',
      text: `${primaryLabel} upgrades ${weakStarterName} by ${delta} PPG, and your ${positionLabel} group has a tough upcoming schedule.${extraIncomingPlayerReason.length ? ` ${extraIncomingPlayerReason.join(' ')}` : ''}${incomingPickReason ? ` ${incomingPickReason}` : ''}${pickReason ? ` ${pickReason}` : ''}`,
    };
  }

  if (card.byePressure) {
    return {
      type: outgoingPickAssets.length ? 'bye_pressure_with_pick' : 'bye_pressure',
      text: `${primaryLabel} upgrades ${weakStarterName} by ${delta} PPG and gives you more cover through upcoming bye weeks.${extraIncomingPlayerReason.length ? ` ${extraIncomingPlayerReason.join(' ')}` : ''}${incomingPickReason ? ` ${incomingPickReason}` : ''}${pickReason ? ` ${pickReason}` : ''}`,
    };
  }

  return {
    type: outgoingPickAssets.length ? 'starter_upgrade_with_pick' : 'starter_upgrade',
    text: `${primaryLabel} would improve your weakest ${positionLabel} starter by ${delta} PPG.${extraIncomingPlayerReason.length ? ` ${extraIncomingPlayerReason.join(' ')}` : ''}${incomingPickReason ? ` ${incomingPickReason}` : ''}${pickReason ? ` ${pickReason}` : ''}`,
  };
}

export function getThemReasonPayload({
  partnerNeed,
  outgoingAssets,
  outgoingPickAssets = [],
  partnerHasSurplus,
  incomingAssets = [],
  context,
}) {
  const playerAssets = (outgoingAssets ?? []).filter((asset) => asset?.type === 'player');
  const tradeAwayPlayers = (incomingAssets ?? []).filter((asset) => asset?.type === 'player');
  const pickReason = getOutgoingPickReasonForThem(outgoingPickAssets);
  const receivedClauses = [];
  const matchingGroups = groupPlayerAssetsByPosition(playerAssets);

  for (const group of matchingGroups) {
    const subject = formatReasonAssetList(group.assets);
    const needLabel = group.position === partnerNeed?.position
      ? (partnerNeed?.label ?? getOpportunityPositionLabel(partnerNeed?.position ?? group.position))
      : getOpportunityPositionLabel(group.position);
    const leadAsset = group.assets[0] ?? null;
    const delta = partnerNeed?.weakStarter && group.position === partnerNeed.position
      ? Math.max(0, (leadAsset?.ppg ?? 0) - (partnerNeed.weakStarter.ppg ?? 0))
      : 0;

    if (delta >= 0.3) {
      receivedClauses.push(`${leadAsset?.name ?? subject} would improve their weakest ${needLabel} starter by ${delta.toFixed(1)} PPG.`);
      const extras = group.assets.slice(1);
      if (extras.length) {
        receivedClauses.push(`${formatReasonAssetList(extras)} also ${extras.length === 1 ? 'adds' : 'add'} more ${needLabel} depth.`);
      }
    } else {
      receivedClauses.push(group.assets.length === 1
        ? `${subject} adds depth to a thin ${needLabel} room.`
        : `${subject} add depth to a thin ${needLabel} room.`);
    }
  }

  const tradeAwayClauses = partnerHasSurplus
    ? buildPositionPackageClauses(tradeAwayPlayers, context?.theirTradeAwaySummaryByPos ?? {}, 'they')
    : [];

  if (receivedClauses.length || tradeAwayClauses.length || pickReason) {
    return {
      type: outgoingPickAssets.length
        ? (partnerHasSurplus ? 'need_plus_surplus_plus_pick' : 'need_upgrade_plus_pick')
        : (partnerHasSurplus ? 'need_plus_surplus' : 'need_upgrade'),
      text: [...receivedClauses, ...tradeAwayClauses, pickReason].filter(Boolean).join(' '),
    };
  }

  return { type: outgoingPickAssets.length ? 'draft_capital' : null, text: pickReason };
}

export function buildTradeProposal({
  myNeedCard,
  partnerNeedCard,
  incomingAsset,
  incomingAssets = null,
  outgoingAssets,
  partnerRosterId,
  plausibilityScore,
  paymentType,
  partnerHasSurplus,
  context = null,
}) {
  const resolvedIncomingAssets = incomingAssets?.length ? incomingAssets : (incomingAsset ? [incomingAsset] : []);
  const primaryIncomingAsset = incomingAsset ?? resolvedIncomingAssets.find((asset) => asset.type === 'player') ?? resolvedIncomingAssets[0] ?? null;
  const playerOutgoing = outgoingAssets.find((asset) => asset.type === 'player') ?? null;
  const pickOutgoingAssets = outgoingAssets.filter((asset) => asset.type === 'pick');
  const upgradeDelta = Math.max(0, (primaryIncomingAsset?.ppg ?? 0) - (myNeedCard?.weakStarter?.ppg ?? 0));
  const incomingValue = Math.round(sumAssetValues(resolvedIncomingAssets));
  const outgoingValue = Math.round(sumAssetValues(outgoingAssets));
  const myReason = getMyReasonPayload(myNeedCard, resolvedIncomingAssets, upgradeDelta, pickOutgoingAssets, playerOutgoing, context);
  const theirReason = getThemReasonPayload({
    partnerNeed: partnerNeedCard,
    outgoingAssets,
    outgoingPickAssets: pickOutgoingAssets,
    partnerHasSurplus,
    incomingAssets: resolvedIncomingAssets,
    context,
  });
  const myReasonText = myReason.text;
  return {
    id: [
      partnerRosterId,
      myNeedCard?.position,
      ...resolvedIncomingAssets.map((asset) => asset.id),
      ...outgoingAssets.map((asset) => asset.id),
    ].filter(Boolean).join(':'),
    targetRosterId: partnerRosterId,
    incomingAssets: resolvedIncomingAssets,
    outgoingAssets,
    myNeedPosition: myNeedCard?.position ?? null,
    theirNeedPosition: partnerNeedCard?.position ?? null,
    myCurrentStarter: myNeedCard?.weakStarter ?? null,
    theirCurrentNeedStarter: partnerNeedCard?.weakStarter ?? null,
    upgradeDelta: toFixedNumber(upgradeDelta, 1),
    plausibilityScore: Math.round(plausibilityScore),
    incomingValue,
    outgoingValue,
    valueGap: outgoingValue - incomingValue,
    context,
    myReasonType: myReason.type,
    theirReasonType: theirReason.type,
    whyItHelpsMe: myReasonText,
    whyItHelpsThem: theirReason.text,
    paymentType,
  };
}

export function buildTradeProposalShell({
  myNeedCard,
  partnerNeedCard,
  incomingAsset,
  incomingAssets = null,
  outgoingAssets,
  partnerRosterId,
  plausibilityScore,
  paymentType,
}) {
  const resolvedIncomingAssets = incomingAssets?.length ? incomingAssets : (incomingAsset ? [incomingAsset] : []);
  const primaryIncomingAsset = incomingAsset ?? resolvedIncomingAssets.find((asset) => asset.type === 'player') ?? resolvedIncomingAssets[0] ?? null;
  const upgradeDelta = Math.max(0, (primaryIncomingAsset?.ppg ?? 0) - (myNeedCard?.weakStarter?.ppg ?? 0));
  const incomingValue = Math.round(sumAssetValues(resolvedIncomingAssets));
  const outgoingValue = Math.round(sumAssetValues(outgoingAssets));
  return {
    id: [
      partnerRosterId,
      myNeedCard?.position,
      ...resolvedIncomingAssets.map((asset) => asset.id),
      ...outgoingAssets.map((asset) => asset.id),
    ].filter(Boolean).join(':'),
    targetRosterId: partnerRosterId,
    incomingAssets: resolvedIncomingAssets,
    outgoingAssets,
    myNeedPosition: myNeedCard?.position ?? null,
    theirNeedPosition: partnerNeedCard?.position ?? null,
    myCurrentStarter: myNeedCard?.weakStarter ?? null,
    theirCurrentNeedStarter: partnerNeedCard?.weakStarter ?? null,
    upgradeDelta: toFixedNumber(upgradeDelta, 1),
    plausibilityScore: Math.round(plausibilityScore),
    incomingValue,
    outgoingValue,
    valueGap: outgoingValue - incomingValue,
    context: null,
    myReasonType: 'pending',
    theirReasonType: 'pending',
    whyItHelpsMe: 'pending',
    whyItHelpsThem: 'pending',
    paymentType,
  };
}

export function buildSurplusProposalContext({
  myNeedCard,
  partnerNeedCard,
  outgoingAssets,
  incomingAssets,
  myRosterAnalysis,
  partnerAnalysis,
  benchmarkByPos,
  playerValueMap,
}) {
  const outgoingPlayerAsset = getPrimaryPlayerAsset(outgoingAssets);
  const incomingPlayerAsset = (incomingAssets ?? []).find((asset) => asset?.type === 'player') ?? null;
  const myTradeAwayPos = outgoingPlayerAsset?.normPos ?? outgoingPlayerAsset?.position ?? null;
  const theirTradeAwayPos = incomingPlayerAsset?.normPos ?? incomingPlayerAsset?.position ?? null;
  const myTradeAwaySummaryByPos = buildTradeAwaySummaryByPos(myRosterAnalysis, outgoingAssets, benchmarkByPos, playerValueMap);
  const theirTradeAwaySummaryByPos = buildTradeAwaySummaryByPos(partnerAnalysis, incomingAssets, benchmarkByPos, playerValueMap);
  const myPrimarySummary = myTradeAwayPos ? myTradeAwaySummaryByPos[myTradeAwayPos] ?? null : null;
  const theirPrimarySummary = theirTradeAwayPos ? theirTradeAwaySummaryByPos[theirTradeAwayPos] ?? null : null;
  const myTradeAwayFallback = myPrimarySummary?.fallbackAssets?.[0] ?? null;
  const myTradeAwayDepthAfter = myPrimarySummary?.depthAfter ?? 0;
  const myTradeAwayDropoff = Math.max(0, (outgoingPlayerAsset?.ppg ?? 0) - (myTradeAwayFallback?.ppg ?? 0));
  const theirTradeAwayFallback = theirPrimarySummary?.fallbackAssets?.[0] ?? null;
  const theirTradeAwayDepthAfter = theirPrimarySummary?.depthAfter ?? 0;

  const myUpgradeDelta = myNeedCard?.weakStarter && incomingPlayerAsset
    ? Math.max(0, (incomingPlayerAsset.ppg ?? 0) - (myNeedCard.weakStarter.ppg ?? 0))
    : 0;
  const theirUpgradeDelta = partnerNeedCard?.weakStarter && outgoingPlayerAsset
    ? Math.max(0, (outgoingPlayerAsset.ppg ?? 0) - (partnerNeedCard.weakStarter.ppg ?? 0))
    : 0;

  return {
    myTradeAwayPosition: myTradeAwayPos,
    myTradeAwayFallback: myTradeAwayFallback ? buildPlayerAsset(myTradeAwayFallback, myRosterAnalysis.roster_id, playerValueMap) : null,
    myTradeAwayDepthAfter,
    myTradeAwayDropoff: toFixedNumber(myTradeAwayDropoff, 1),
    theirTradeAwayPosition: theirTradeAwayPos,
    theirTradeAwayFallback: theirTradeAwayFallback ? buildPlayerAsset(theirTradeAwayFallback, partnerAnalysis.roster_id, playerValueMap) : null,
    theirTradeAwayDepthAfter,
    myUpgradeDelta: toFixedNumber(myUpgradeDelta, 1),
    theirUpgradeDelta: toFixedNumber(theirUpgradeDelta, 1),
    myTradeAwaySummaryByPos,
    theirTradeAwaySummaryByPos,
  };
}

export function getSurplusPickReasonForMe(incomingPickAssets = []) {
  if (!incomingPickAssets.length) return null;
  if (incomingPickAssets.length === 1) return `You also get ${incomingPickAssets[0].label} as future draft value.`;
  return `You also get ${formatReasonAssetList(incomingPickAssets)} as future draft value.`;
}

export function getSurplusPickReasonForThem(outgoingPickAssets = []) {
  if (!outgoingPickAssets.length) return null;
  if (outgoingPickAssets.length === 1) {
    return `They send ${outgoingPickAssets[0].label} as the future draft value needed to buy the upgrade.`;
  }
  return `They send ${formatReasonAssetList(outgoingPickAssets)} as the future draft value needed to buy the upgrade.`;
}

export function buildSurplusMyReasonPayload({
  outgoingAssets,
  incomingAssets,
  myNeedCard,
  context,
}) {
  const outgoingPlayers = outgoingAssets.filter((asset) => asset.type === 'player');
  const outgoingPicks = outgoingAssets.filter((asset) => asset.type === 'pick');
  const incomingPlayers = incomingAssets.filter((asset) => asset.type === 'player');
  const incomingPicks = incomingAssets.filter((asset) => asset.type === 'pick');
  const outgoingLeadParts = [];
  if (outgoingPlayers.length) outgoingLeadParts.push(formatReasonAssetList(outgoingPlayers));
  if (outgoingPicks.length) outgoingLeadParts.push(formatReasonAssetList(outgoingPicks));
  const outgoingPackageLead = outgoingLeadParts.length
    ? `You can move ${outgoingLeadParts.join(', plus ')}`
    : 'You can move this package';
  const depthClauses = buildPositionPackageClauses(outgoingPlayers, context?.myTradeAwaySummaryByPos ?? {}, 'you');
  const primaryIncomingPlayer = incomingPlayers.find((asset) => asset.normPos === myNeedCard?.position) ?? incomingPlayers[0] ?? null;
  const extraIncomingPlayerClauses = buildExtraPlayerClauses(incomingPlayers, primaryIncomingPlayer?.id ?? null, 'you');
  const pickReason = getSurplusPickReasonForMe(incomingPicks);

  if (primaryIncomingPlayer && myNeedCard?.weakStarter) {
    const myNeedLabel = myNeedCard.label ?? getOpportunityPositionLabel(myNeedCard.position);
    const delta = Math.max(0, (primaryIncomingPlayer.ppg ?? 0) - (myNeedCard.weakStarter.ppg ?? 0)).toFixed(1);
    return {
      type: incomingPicks.length ? 'surplus_to_need_plus_pick' : 'surplus_to_need',
      text: `${outgoingPackageLead} from a position of strength. ${depthClauses.join(' ')} ${primaryIncomingPlayer.name} improves your weakest ${myNeedLabel} starter by ${delta} PPG.${extraIncomingPlayerClauses.length ? ` ${extraIncomingPlayerClauses.join(' ')}` : ''}${pickReason ? ` ${pickReason}` : ''}`,
    };
  }

  return {
    type: 'surplus_for_picks',
    text: `${outgoingPackageLead} from a position of strength.${depthClauses.length ? ` ${depthClauses.join(' ')}` : ''}${extraIncomingPlayerClauses.length ? ` ${extraIncomingPlayerClauses.join(' ')}` : ''}${pickReason ? ` ${pickReason}` : ''}`,
  };
}

export function buildSurplusThemReasonPayload({
  outgoingAssets,
  incomingAssets,
  partnerNeedCard,
  context,
}) {
  const receivedPlayers = outgoingAssets.filter((asset) => asset.type === 'player');
  const receivedPicks = outgoingAssets.filter((asset) => asset.type === 'pick');
  const tradeAwayPlayers = incomingAssets.filter((asset) => asset.type === 'player');
  const tradeAwayPicks = incomingAssets.filter((asset) => asset.type === 'pick');
  const pickReason = getSurplusPickReasonForThem(tradeAwayPicks);
  const depthClauses = buildPositionPackageClauses(tradeAwayPlayers, context?.theirTradeAwaySummaryByPos ?? {}, 'they');
  const receivedClauses = [];

  for (const group of groupPlayerAssetsByPosition(receivedPlayers)) {
    const needLabel = group.position === partnerNeedCard?.position
      ? (partnerNeedCard?.label ?? getOpportunityPositionLabel(partnerNeedCard?.position ?? group.position))
      : getOpportunityPositionLabel(group.position);
    const leadAsset = group.assets[0] ?? null;
    const delta = partnerNeedCard?.weakStarter && group.position === partnerNeedCard.position
      ? Math.max(0, (leadAsset?.ppg ?? 0) - (partnerNeedCard.weakStarter.ppg ?? 0))
      : 0;

    if (delta >= 0.3) {
      receivedClauses.push(`${leadAsset?.name ?? formatReasonAssetList(group.assets)} would improve their weakest ${needLabel} starter by ${delta.toFixed(1)} PPG.`);
      const extras = group.assets.slice(1);
      if (extras.length) {
        receivedClauses.push(`${formatReasonAssetList(extras)} also ${extras.length === 1 ? 'adds' : 'add'} more ${needLabel} depth.`);
      }
    } else if ((partnerNeedCard?.severity ?? 0) >= 18) {
      receivedClauses.push(`${formatReasonAssetList(group.assets)} ${group.assets.length === 1 ? 'adds' : 'add'} depth to a thin ${needLabel} room.`);
    } else {
      receivedClauses.push(`${formatReasonAssetList(group.assets)} ${group.assets.length === 1 ? 'gives' : 'give'} them another playable option at ${needLabel}.`);
    }
  }

  if (receivedPlayers.length) {
    return {
      type: receivedPicks.length ? 'need_upgrade_for_player_plus_pick' : 'need_upgrade_for_player',
      text: `${receivedClauses.join(' ')}${depthClauses.length ? ` ${depthClauses.join(' ')}` : ''}${pickReason ? ` ${pickReason}` : ''}`,
    };
  }

  if (receivedPicks.length) {
    const needLabel = partnerNeedCard?.label ?? getOpportunityPositionLabel(partnerNeedCard?.position ?? '');
    return {
      type: receivedPicks.length ? 'need_upgrade_for_picks' : 'need_upgrade',
      text: `${formatReasonAssetList(receivedPicks)} ${receivedPicks.length === 1 ? 'gives' : 'give'} them future draft value while they still address ${needLabel} depth.${depthClauses.length ? ` ${depthClauses.join(' ')}` : ''}${pickReason ? ` ${pickReason}` : ''}`,
    };
  }

  return { type: null, text: null };
}

export function buildSurplusTradeProposal({
  myNeedCard,
  partnerNeedCard,
  outgoingAssets,
  incomingAssets,
  partnerRosterId,
  plausibilityScore,
  context,
}) {
  const incomingPlayer = incomingAssets.find((asset) => asset.type === 'player') ?? null;
  const incomingValue = Math.round(sumAssetValues(incomingAssets));
  const outgoingValue = Math.round(sumAssetValues(outgoingAssets));
  const myReason = buildSurplusMyReasonPayload({
    outgoingAssets,
    incomingAssets,
    myNeedCard,
    context,
  });
  const theirReason = buildSurplusThemReasonPayload({
    outgoingAssets,
    incomingAssets,
    partnerNeedCard,
    context,
  });
  const upgradeDelta = myNeedCard?.weakStarter && incomingPlayer
    ? Math.max(0, (incomingPlayer.ppg ?? 0) - (myNeedCard.weakStarter.ppg ?? 0))
    : 0;

  return {
    id: [
      partnerRosterId,
      'surplus',
      ...outgoingAssets.map((asset) => asset.id),
      ...incomingAssets.map((asset) => asset.id),
    ].filter(Boolean).join(':'),
    targetRosterId: partnerRosterId,
    incomingAssets,
    outgoingAssets,
    myNeedPosition: myNeedCard?.position ?? null,
    theirNeedPosition: partnerNeedCard?.position ?? null,
    myCurrentStarter: myNeedCard?.weakStarter ?? null,
    theirCurrentNeedStarter: partnerNeedCard?.weakStarter ?? null,
    upgradeDelta: toFixedNumber(upgradeDelta, 1),
    plausibilityScore: Math.round(plausibilityScore),
    incomingValue,
    outgoingValue,
    valueGap: outgoingValue - incomingValue,
    context,
    myReasonType: myReason.type,
    theirReasonType: theirReason.type,
    whyItHelpsMe: myReason.text,
    whyItHelpsThem: theirReason.text,
    paymentType: outgoingAssets.length > 1
      ? getPaymentTypeForAssets(outgoingAssets)
      : getPaymentTypeForAssets(incomingAssets),
  };
}

export function buildSurplusTradeProposalShell({
  myNeedCard,
  partnerNeedCard,
  outgoingAssets,
  incomingAssets,
  partnerRosterId,
  plausibilityScore,
}) {
  const incomingPlayer = incomingAssets.find((asset) => asset.type === 'player') ?? null;
  const incomingValue = Math.round(sumAssetValues(incomingAssets));
  const outgoingValue = Math.round(sumAssetValues(outgoingAssets));
  const upgradeDelta = myNeedCard?.weakStarter && incomingPlayer
    ? Math.max(0, (incomingPlayer.ppg ?? 0) - (myNeedCard.weakStarter.ppg ?? 0))
    : 0;

  return {
    id: [
      partnerRosterId,
      'surplus',
      ...outgoingAssets.map((asset) => asset.id),
      ...incomingAssets.map((asset) => asset.id),
    ].filter(Boolean).join(':'),
    targetRosterId: partnerRosterId,
    incomingAssets,
    outgoingAssets,
    myNeedPosition: myNeedCard?.position ?? null,
    theirNeedPosition: partnerNeedCard?.position ?? null,
    myCurrentStarter: myNeedCard?.weakStarter ?? null,
    theirCurrentNeedStarter: partnerNeedCard?.weakStarter ?? null,
    upgradeDelta: toFixedNumber(upgradeDelta, 1),
    plausibilityScore: Math.round(plausibilityScore),
    incomingValue,
    outgoingValue,
    valueGap: outgoingValue - incomingValue,
    context: null,
    myReasonType: 'pending',
    theirReasonType: 'pending',
    whyItHelpsMe: 'pending',
    whyItHelpsThem: 'pending',
    paymentType: outgoingAssets.length > 1
      ? getPaymentTypeForAssets(outgoingAssets)
      : getPaymentTypeForAssets(incomingAssets),
  };
}

export function findMySurplusTradeCandidates({
  myRosterAnalysis,
  myCards,
  benchmarkByPos,
  playerValueMap,
}) {
  if (!myRosterAnalysis) return [];

  const startersById = new Set(
    Object.values(myRosterAnalysis.startersByPos ?? {}).flat().map((player) => player.id),
  );
  const scored = [];

  for (const card of myCards ?? []) {
    const position = card.position;
    const benchmark = benchmarkByPos?.[position] ?? null;
    const players = getPositionPlayers(myRosterAnalysis, position).slice(0, 3);

    for (const [index, player] of players.entries()) {
      const isStarter = startersById.has(player.id);
      const depthAfter = getPositionDepthCount(myRosterAnalysis, position, benchmark, player.id);
      const alternatives = getPositionPlayers(myRosterAnalysis, position).filter((candidate) => candidate.id !== player.id);
      const fallback = alternatives[0] ?? null;
      const severity = card.severity ?? 50;
      const hasFallback = depthAfter > 0;
      const canMoveStarter = isStarter
        ? hasFallback && severity <= 38
        : true;
      const canMoveBench = !isStarter && (severity <= 50 || (card.playableBenchCount ?? 0) >= 1);

      if (!canMoveStarter && !canMoveBench) continue;

      const asset = buildPlayerAsset(player, myRosterAnalysis.roster_id, playerValueMap);
      const score = ((asset?.value ?? 0) / 180)
        + (depthAfter * 18)
        + Math.max(0, 42 - severity)
        + (fallback ? 10 : 0)
        + (isStarter ? 8 : 0)
        - (index * 6);

      scored.push({
        asset,
        position,
        severity,
        depthAfter,
        fallback,
        isStarter,
        score,
      });
    }
  }

  const unique = [];
  const seen = new Set();
  for (const item of scored.sort((a, b) => b.score - a.score)) {
    if (!item.asset || seen.has(item.asset.id)) continue;
    seen.add(item.asset.id);
    unique.push(item);
    if (unique.length >= 6) break;
  }

  return unique;
}

export function pickIncomingNeedPlayerChoices({
  partnerAnalysis,
  myCards,
  benchmarkByPos,
  outgoingPlayerAsset,
  playerValueMap,
}) {
  if (!partnerAnalysis || !myCards?.length) return [];

  const scored = [];
  for (const myNeedCard of myCards.slice(0, 4)) {
    if (!myNeedCard?.weakStarter) continue;

    const position = myNeedCard.position;
    const benchmark = benchmarkByPos?.[position] ?? null;
    const partnerSurplus = getPositionSurplus(partnerAnalysis, position, benchmark);
    const players = getPositionPlayers(partnerAnalysis, position).slice(0, 5);

    for (const player of players) {
      const isBenchTarget = isBenchPlayer(partnerAnalysis, position, player.id);
      const depthAfter = getPositionDepthCount(partnerAnalysis, position, benchmark, player.id);
      const canMove = isBenchTarget || partnerSurplus.hasBenchSurplus || depthAfter > 0;
      if (!canMove) continue;

      const asset = buildPlayerAsset(player, partnerAnalysis.roster_id, playerValueMap);
      const upgradeDelta = myNeedCard.weakStarter
        ? Math.max(0, (player.ppg ?? 0) - (myNeedCard.weakStarter.ppg ?? 0))
        : Math.max(0, player.ppg ?? 0);
      const samePosPenalty = position === outgoingPlayerAsset?.normPos ? 10 : 0;
      const score = (myNeedCard.severity * 1.7)
        + (upgradeDelta * 13)
        + (canMove ? 16 : -12)
        - Math.abs((asset?.value ?? 0) - (outgoingPlayerAsset?.value ?? 0)) / 210
        - samePosPenalty;

      scored.push({
        asset,
        myNeedCard,
        score,
      });
    }
  }

  const unique = [];
  const seen = new Set();
  for (const item of scored.sort((a, b) => b.score - a.score)) {
    if (!item.asset || seen.has(item.asset.id)) continue;
    seen.add(item.asset.id);
    unique.push(item);
    if (unique.length >= 5) break;
  }
  return unique;
}

export function buildIncomingPlayerPackageChoices({
  primaryChoice = null,
  extraChoices = [],
  maxAssets = 3,
  limit = 6,
}) {
  const maxCount = Math.max(1, Math.min(3, maxAssets));
  const seen = new Set();
  const baseChoices = [];

  if (primaryChoice?.asset?.id) {
    seen.add(primaryChoice.asset.id);
    baseChoices.push(primaryChoice);
  }

  const extras = [];
  for (const choice of extraChoices ?? []) {
    const assetId = choice?.asset?.id;
    if (!assetId || seen.has(assetId)) continue;
    seen.add(assetId);
    extras.push(choice);
  }

  const combos = primaryChoice ? [[]] : [];
  const maxExtraCount = Math.max(0, maxCount - baseChoices.length);
  if (!primaryChoice && maxExtraCount <= 0) return [];

  for (let size = 1; size <= Math.min(maxExtraCount, extras.length); size += 1) {
    combos.push(...buildCombinations(extras, size, size));
  }

  return combos
    .map((extraCombo) => {
      const choices = [...baseChoices, ...extraCombo];
      if (!choices.length || choices.length > maxCount) return null;

      const primary = primaryChoice ?? [...choices].sort((a, b) => {
        const aPriority = (a?.myNeedCard?.severity ?? 0) * 2 + (a?.score ?? 0);
        const bPriority = (b?.myNeedCard?.severity ?? 0) * 2 + (b?.score ?? 0);
        return bPriority - aPriority;
      })[0] ?? null;

      const score = choices.reduce((sum, choice) => sum + (choice?.score ?? 0), 0)
        - Math.max(0, choices.length - 1) * 7;

      return {
        choices,
        assets: choices.map((choice) => choice.asset).filter(Boolean),
        score,
        primaryChoice: primary,
        primaryNeedCard: primary?.myNeedCard ?? null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || sumAssetValues(b.assets) - sumAssetValues(a.assets))
    .slice(0, limit);
}

export function pickIncomingPickCombos(partnerPickAssets, targetValue, maxAssets = 3, limit = 7) {
  if (!partnerPickAssets?.length) return [];

  const topPicks = [...partnerPickAssets]
    .sort((a, b) => {
      const aPenalty = Math.abs((a.value ?? 0) - targetValue) + (a.isOwn ? 18 : 0) + Math.max(0, 3 - (a.round ?? 99)) * 18;
      const bPenalty = Math.abs((b.value ?? 0) - targetValue) + (b.isOwn ? 18 : 0) + Math.max(0, 3 - (b.round ?? 99)) * 18;
      return aPenalty - bPenalty;
    })
    .slice(0, 7);

  return buildCombinations(topPicks, 1, Math.min(maxAssets, topPicks.length))
    .map((assets) => ({
      assets,
      diff: Math.abs(sumAssetValues(assets) - targetValue),
    }))
    .sort((a, b) => a.diff - b.diff)
    .slice(0, limit)
    .map((entry) => entry.assets);
}

export function evaluateSurplusReturnPackage({
  outgoingAssets,
  incomingAssets,
  myNeedCard,
  partnerNeedCard,
}) {
  const incomingPlayer = incomingAssets.find((asset) => asset.type === 'player') ?? null;
  const incomingPicks = incomingAssets.filter((asset) => asset.type === 'pick');
  const incomingValue = sumAssetValues(incomingAssets);
  const outgoingValue = Math.max(1, sumAssetValues(outgoingAssets));
  const directRatio = incomingValue / outgoingValue;
  const myUpgradeDelta = myNeedCard?.weakStarter && incomingPlayer
    ? Math.max(0, (incomingPlayer.ppg ?? 0) - (myNeedCard.weakStarter.ppg ?? 0))
    : 0;
  const partnerUpgradeDelta = partnerNeedCard?.weakStarter
    ? outgoingAssets
      .filter((asset) => asset.normPos === partnerNeedCard.position)
      .reduce((sum, asset) => sum + Math.max(0, (asset.ppg ?? 0) - (partnerNeedCard.weakStarter.ppg ?? 0)), 0)
    : 0;
  const myNeedValue = (myNeedCard?.severity ?? 0) * 28 + (myUpgradeDelta * 170);
  const partnerNeedValue = (partnerNeedCard?.severity ?? 0) * 32 + (partnerUpgradeDelta * 185);
  const effectiveIncomingValue = incomingValue + myNeedValue;
  const minCoverageRatio = incomingPlayer ? 0.58 : 0.72;
  const coversOutgoing = effectiveIncomingValue >= (outgoingValue * minCoverageRatio);
  const addressesMySide = incomingPlayer
    ? Boolean((myNeedCard?.severity ?? 0) >= 14 || myUpgradeDelta >= 0.3 || incomingPicks.length > 0)
    : incomingPicks.length > 0;
  const addressesTheirSide = Boolean(
    partnerNeedCard && ((partnerNeedCard.severity ?? 0) >= 16 || partnerUpgradeDelta >= 0.3)
  );
  const postureDistance = Math.abs(directRatio - (incomingPlayer ? 0.78 : 0.84));
  const ratioFloor = incomingPlayer ? 0.22 : 0.38;
  const ratioCeiling = incomingPlayer ? 1.18 : 1.08;

  return {
    incomingValue,
    outgoingValue,
    directRatio,
    myNeedValue,
    partnerNeedValue,
    postureDistance,
    coversOutgoing,
    addressesMySide,
    addressesTheirSide,
    isViable: coversOutgoing && addressesMySide && addressesTheirSide && directRatio >= ratioFloor && directRatio <= ratioCeiling,
  };
}

export function buildSurplusTradeProposals({
  myCards,
  partnerCards,
  myRosterAnalysis,
  partnerAnalysis,
  benchmarkByPos,
  rosterPicks,
  slots,
  rosters,
  currentSeason,
  pickValueMap,
  playerValueMap,
  pickAssetsByRosterId = null,
}) {
  if (!myCards?.length || !partnerCards?.length || !myRosterAnalysis || !partnerAnalysis) return [];

  const partnerPickAssets = pickAssetsByRosterId?.get(partnerAnalysis.roster_id)
    ?? getRosterPickAssets(
      partnerAnalysis.roster_id,
      rosterPicks,
      slots,
      rosters,
      pickValueMap,
      currentSeason,
    );

  const surplusCandidates = findMySurplusTradeCandidates({
    myRosterAnalysis,
    myCards,
    benchmarkByPos,
    playerValueMap,
  });

  const proposals = [];
  const outgoingCombos = buildCombinations(surplusCandidates, 1, Math.min(3, surplusCandidates.length))
    .filter((combo) => combo.length > 0)
    .map((combo) => ({
      combo,
      outgoingAssets: combo.map((item) => item.asset),
      score: combo.reduce((sum, item) => sum + (item.score ?? 0), 0) - Math.max(0, combo.length - 1) * 8,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  for (const outgoingCombo of outgoingCombos) {
    const outgoingAssets = outgoingCombo.outgoingAssets;
    const primaryOutgoingPlayerAsset = getPrimaryPlayerAsset(outgoingAssets);
    if (!primaryOutgoingPlayerAsset) continue;
    const outgoingDepthSummary = buildTradeAwaySummaryByPos(
      myRosterAnalysis,
      outgoingAssets,
      benchmarkByPos,
      playerValueMap,
    );
    if (!hasSustainableTradeAwayDepth(outgoingDepthSummary)) continue;

    const partnerNeedOptions = (partnerCards ?? [])
      .filter((card) => card?.weakStarter)
      .map((card) => ({
        card,
        benefitDelta: outgoingAssets
          .filter((asset) => asset.normPos === card.position)
          .reduce((sum, asset) => sum + Math.max(0, (asset.ppg ?? 0) - (card.weakStarter?.ppg ?? 0)), 0),
      }))
      .filter(({ card, benefitDelta }) => benefitDelta >= 0.3 || (card.severity ?? 0) >= 18)
      .sort((a, b) => ((b.card?.severity ?? 0) * 1.5 + (b.benefitDelta * 14)) - ((a.card?.severity ?? 0) * 1.5 + (a.benefitDelta * 14)))
      .slice(0, 3);

    const incomingPlayerChoices = pickIncomingNeedPlayerChoices({
      partnerAnalysis,
      myCards,
      benchmarkByPos,
      outgoingPlayerAsset: primaryOutgoingPlayerAsset,
      playerValueMap,
    });
    const incomingPlayerPackages = buildIncomingPlayerPackageChoices({
      extraChoices: incomingPlayerChoices,
      maxAssets: 3,
      limit: 8,
    });
    const pickOnlyCombos = pickIncomingPickCombos(partnerPickAssets, Math.max(180, sumAssetValues(outgoingAssets) * 0.84), 3, 5);

    for (const { card: partnerNeedCard } of partnerNeedOptions) {
      for (const pickCombo of pickOnlyCombos) {
        const evaluation = evaluateSurplusReturnPackage({
          outgoingAssets,
          incomingAssets: pickCombo,
          myNeedCard: null,
          partnerNeedCard,
        });
        if (!evaluation.isViable) continue;

        const proposalShell = buildSurplusTradeProposalShell({
          myNeedCard: null,
          partnerNeedCard,
          outgoingAssets,
          incomingAssets: pickCombo,
          partnerRosterId: partnerAnalysis.roster_id,
          plausibilityScore: ((partnerNeedCard.severity ?? 0) * 1.2)
            + Math.min(24, evaluation.partnerNeedValue / 130)
            + Math.min(18, evaluation.incomingValue / 180)
            + Math.min(10, pickCombo.length * 4)
            - (evaluation.postureDistance * 58)
            + Math.min(18, outgoingCombo.score / 14),
        });
        proposals.push({
          ...proposalShell,
          deferHydration: () => buildSurplusTradeProposal({
            myNeedCard: null,
            partnerNeedCard,
            outgoingAssets,
            incomingAssets: pickCombo,
            partnerRosterId: partnerAnalysis.roster_id,
            plausibilityScore: proposalShell.plausibilityScore,
            context: buildSurplusProposalContext({
              myNeedCard: null,
              partnerNeedCard,
              outgoingAssets,
              incomingAssets: pickCombo,
              myRosterAnalysis,
              partnerAnalysis,
              benchmarkByPos,
              playerValueMap,
            }),
          }),
        });
      }

      for (const incomingPlayerPackage of incomingPlayerPackages) {
        const remainingPickSlots = Math.max(0, 3 - incomingPlayerPackage.assets.length);
        const targetPickValue = Math.max(
          0,
          Math.max(180, sumAssetValues(outgoingAssets) * 0.84) - sumAssetValues(incomingPlayerPackage.assets),
        );
        const incomingPickCombos = remainingPickSlots > 0 && targetPickValue > 100
          ? pickIncomingPickCombos(partnerPickAssets, targetPickValue, remainingPickSlots, 5)
          : [];
        const pickCombosWithEmpty = [[], ...incomingPickCombos];

        for (const pickCombo of pickCombosWithEmpty) {
          const incomingAssets = [...incomingPlayerPackage.assets, ...pickCombo].slice(0, 3);
          const evaluation = evaluateSurplusReturnPackage({
            outgoingAssets,
            incomingAssets,
            myNeedCard: incomingPlayerPackage.primaryNeedCard,
            partnerNeedCard,
          });
          if (!evaluation.isViable) continue;

          const proposalShell = buildSurplusTradeProposalShell({
            myNeedCard: incomingPlayerPackage.primaryNeedCard,
            partnerNeedCard,
            outgoingAssets,
            incomingAssets,
            partnerRosterId: partnerAnalysis.roster_id,
            plausibilityScore: ((partnerNeedCard.severity ?? 0) * 1.15)
              + ((incomingPlayerPackage.primaryNeedCard?.severity ?? 0) * 1.1)
              + Math.min(20, evaluation.myNeedValue / 135)
              + Math.min(20, evaluation.partnerNeedValue / 135)
              + Math.min(16, evaluation.incomingValue / 220)
              + Math.min(12, incomingPlayerPackage.score / 18)
              + Math.min(8, pickCombo.length * 3.5)
              - (evaluation.postureDistance * 62)
              + Math.min(18, outgoingCombo.score / 14)
              - Math.max(0, incomingAssets.length - 2) * 1.25,
          });
          proposals.push({
            ...proposalShell,
            deferHydration: () => buildSurplusTradeProposal({
              myNeedCard: incomingPlayerPackage.primaryNeedCard,
              partnerNeedCard,
              outgoingAssets,
              incomingAssets,
              partnerRosterId: partnerAnalysis.roster_id,
              plausibilityScore: proposalShell.plausibilityScore,
              context: buildSurplusProposalContext({
                myNeedCard: incomingPlayerPackage.primaryNeedCard,
                partnerNeedCard,
                outgoingAssets,
                incomingAssets,
                myRosterAnalysis,
                partnerAnalysis,
                benchmarkByPos,
                playerValueMap,
              }),
            }),
          });
        }
      }
    }
  }

  return selectSurplusTradeProposals(
    proposals.filter((proposal) => proposal.plausibilityScore >= 28 && proposal.whyItHelpsMe && proposal.whyItHelpsThem),
    12,
    2,
    3,
    3,
    3,
  ).map(finalizeDeferredProposal);
}

export function buildTradeProposals({
  myCards,
  partnerCards,
  myRosterAnalysis,
  partnerAnalysis,
  benchmarkByPos,
  rosterPicks,
  slots,
  rosters,
  currentSeason,
  pickValueMap,
  playerValueMap,
  pickAssetsByRosterId = null,
}) {
  if (!myCards?.length || !partnerAnalysis || !myRosterAnalysis) return [];

  const myPickAssets = pickAssetsByRosterId?.get(myRosterAnalysis.roster_id)
    ?? getRosterPickAssets(
      myRosterAnalysis.roster_id,
      rosterPicks,
      slots,
      rosters,
      pickValueMap,
      currentSeason,
    );
  const partnerPickAssets = pickAssetsByRosterId?.get(partnerAnalysis.roster_id)
    ?? getRosterPickAssets(
      partnerAnalysis.roster_id,
      rosterPicks,
      slots,
      rosters,
      pickValueMap,
      currentSeason,
    );

  const proposals = [];

  for (const myNeedCard of myCards.slice(0, 4)) {
    if (!myNeedCard?.weakStarter) continue;

    const benchmark = benchmarkByPos[myNeedCard.position];
    const partnerPlayers = getPositionPlayers(partnerAnalysis, myNeedCard.position);
    const partnerSurplus = getPositionSurplus(partnerAnalysis, myNeedCard.position, benchmark);

    const targets = partnerPlayers
      .filter((player) => (player.ppg ?? 0) > ((myNeedCard.weakStarter?.ppg ?? 0) + 0.6))
      .map((player) => {
        const incomingAsset = buildPlayerAsset(player, partnerAnalysis.roster_id, playerValueMap);
        const upgradeDelta = Math.max(0, (player.ppg ?? 0) - (myNeedCard.weakStarter?.ppg ?? 0));
        const isBenchTarget = isBenchPlayer(partnerAnalysis, myNeedCard.position, player.id);
        const partnerDepthAfter = getPositionDepthCount(partnerAnalysis, myNeedCard.position, benchmark, player.id);
        const tradableSurplus = isBenchTarget || partnerSurplus.hasBenchSurplus || partnerDepthAfter > 0;
        const outgoingPlayerChoices = pickOutgoingPlayerChoices(
          myRosterAnalysis,
          myCards,
          partnerCards,
          myNeedCard.position,
          player,
          playerValueMap,
          4,
        );
        const pickChoices = pickSpareDraftCapitalOptions(myPickAssets, upgradeDelta, 3)
          .map((asset) => ({
            asset,
            ratio: Math.max(0, Number(asset.value ?? 0)) / Math.max(1, Number(incomingAsset.value ?? 0)),
            score: 110
              + Math.min(22, (asset.value ?? 0) / 140)
              + ((asset.isOwn || (asset.round ?? 99) <= 1) ? -8 : 4),
          }));
        const extraIncomingChoices = pickIncomingNeedPlayerChoices({
          partnerAnalysis,
          myCards,
          benchmarkByPos,
          outgoingPlayerAsset: incomingAsset,
          playerValueMap,
        }).filter((choice) => choice.asset?.id !== incomingAsset.id);
        const incomingPlayerPackages = buildIncomingPlayerPackageChoices({
          primaryChoice: {
            asset: incomingAsset,
            myNeedCard,
            score: (myNeedCard.severity * 1.9) + (upgradeDelta * 14) + Math.min(18, (incomingAsset.value ?? 0) / 200),
          },
          extraChoices: extraIncomingChoices,
          maxAssets: 3,
          limit: 6,
        });
        const packageCandidates = buildUpgradeFinderPackageCandidates({
          playerChoices: outgoingPlayerChoices.filter((choice) => choice.score > 0),
          pickChoices,
          allowPackages: true,
          hasSelectedOutgoingPlayers: false,
          tradePostureLevel: 4,
        });

        const packages = [];
        for (const packageCandidate of packageCandidates) {
          for (const incomingPlayerPackage of incomingPlayerPackages) {
            const incomingCompChoices = buildIncomingCompensationChoices({
              partnerPickAssets,
              incomingAssets: incomingPlayerPackage.assets,
              outgoingAssets: packageCandidate.outgoingAssets,
              tradePostureLevel: 4,
              allowIncomingPicks: true,
              maxIncomingPickCount: Math.max(0, 3 - incomingPlayerPackage.assets.length),
            });

            for (const incomingCompAssets of incomingCompChoices) {
              const allIncomingAssets = [...incomingPlayerPackage.assets, ...incomingCompAssets];
              const evaluation = evaluateUpgradePackage({
                incomingAssets: allIncomingAssets,
                outgoingAssets: packageCandidate.outgoingAssets,
                partnerNeedCard: packageCandidate.partnerNeedCard,
                partnerHasSurplus: tradableSurplus,
                tradePostureLevel: 4,
              });
              if (!evaluation.isViable) continue;

              const primaryIncomingAsset = incomingPlayerPackage.primaryChoice?.asset ?? incomingAsset;
              const primaryUpgradeDelta = Math.max(0, (primaryIncomingAsset?.ppg ?? 0) - (myNeedCard.weakStarter?.ppg ?? 0));
              const packageValueBonus = Math.min(24, sumAssetValues(packageCandidate.outgoingAssets) / 150);
              const extraIncomingPlayers = Math.max(0, incomingPlayerPackage.assets.length - 1);
              const incomingPlayerPackagePenalty = extraIncomingPlayers * (incomingCompAssets.length ? 2.5 : 5.5);
              const plausibilityScore = (primaryUpgradeDelta * 13.5)
                + (myNeedCard.severity * 0.9)
                + ((packageCandidate.partnerNeedCard?.severity ?? 0) * 1.1)
                + (tradableSurplus ? 16 : -14)
                + Math.min(18, evaluation.partnerNeedValue / 145)
                + packageValueBonus
                + Math.min(12, incomingPlayerPackage.score / 20)
                + Math.min(10, incomingCompAssets.length * 4)
                + (packageCandidate.outgoingAssets.every((asset) => asset.type === 'pick') ? 6 : 0)
                - (evaluation.postureDistance * 68)
                - incomingPlayerPackagePenalty
                - Math.max(0, packageCandidate.outgoingAssets.length - 2) * 1.5
                - Math.max(0, allIncomingAssets.length - 2) * 1.25;
              const proposalShell = buildTradeProposalShell({
                myNeedCard,
                partnerNeedCard: packageCandidate.partnerNeedCard,
                incomingAsset: primaryIncomingAsset,
                incomingAssets: allIncomingAssets,
                outgoingAssets: packageCandidate.outgoingAssets,
                partnerRosterId: partnerAnalysis.roster_id,
                plausibilityScore,
                paymentType: packageCandidate.paymentType,
              });
              packages.push({
                ...proposalShell,
                deferHydration: () => buildTradeProposal({
                  myNeedCard,
                  partnerNeedCard: packageCandidate.partnerNeedCard,
                  incomingAsset: primaryIncomingAsset,
                  incomingAssets: allIncomingAssets,
                  outgoingAssets: packageCandidate.outgoingAssets,
                  partnerRosterId: partnerAnalysis.roster_id,
                  plausibilityScore: proposalShell.plausibilityScore,
                  paymentType: packageCandidate.paymentType,
                  partnerHasSurplus: tradableSurplus,
                  context: buildProposalContext({
                    myNeedCard,
                    partnerNeedCard: packageCandidate.partnerNeedCard,
                    incomingAsset: primaryIncomingAsset,
                    incomingAssets: allIncomingAssets,
                    outgoingAssets: packageCandidate.outgoingAssets,
                    myRosterAnalysis,
                    partnerAnalysis,
                    benchmarkByPos,
                    playerValueMap,
                  }),
                }),
              });
            }
          }
        }

        return packages;
      })
      .flat()
      .filter((proposal) => proposal.plausibilityScore >= 30 && proposal.whyItHelpsMe && proposal.whyItHelpsThem);

    proposals.push(...targets);
  }

  return selectNeedDrivenTradeProposals(
    proposals.filter((proposal) => proposal.whyItHelpsMe && proposal.whyItHelpsThem),
    12,
    2,
    2,
    2,
    2,
    2,
    2,
    4,
  ).map(finalizeDeferredProposal);
}

export function buildPartnerTradeIntelligence({
  opportunityLayer,
  selectedPartnerRosterId = null,
  rosterPicks = null,
  slots = null,
  league = null,
  drafts = [],
  currentSeason = null,
  pickValueMap = null,
  ktcPlayers = [],
  leagueType = '1qb',
  playerValueMap = null,
  includeTradeProposals = true,
  includeSurplusTradeProposals = true,
}) {
  if (!opportunityLayer) {
    return { analysesByRosterId: {}, tradeProposals: [], surplusTradeProposals: [] };
  }

  const analysesByRosterId = opportunityLayer.analysesByRosterId ?? {};
  const myRosterAnalysis = opportunityLayer.myRosterId != null
    ? (opportunityLayer.rosterAnalysesById?.[opportunityLayer.myRosterId] ?? null)
    : null;
  const selectedPartnerAnalysis = selectedPartnerRosterId != null
    ? (opportunityLayer.rosterAnalysesById?.[selectedPartnerRosterId] ?? null)
    : null;
  const myCards = myRosterAnalysis
    ? (opportunityLayer.allAnalysesByRosterId?.[myRosterAnalysis.roster_id]?.cards ?? [])
    : [];
  const partnerCards = selectedPartnerAnalysis
    ? (opportunityLayer.allAnalysesByRosterId?.[selectedPartnerAnalysis.roster_id]?.cards ?? [])
    : [];
  const pickAssetsByRosterId = buildRosterPickAssetsById(
    [myRosterAnalysis?.roster_id, selectedPartnerAnalysis?.roster_id],
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

  const tradeProposals = includeTradeProposals && selectedPartnerAnalysis && myRosterAnalysis
    ? buildTradeProposals({
      myCards,
      partnerCards,
      myRosterAnalysis,
      partnerAnalysis: selectedPartnerAnalysis,
      benchmarkByPos: opportunityLayer.benchmarkByPos,
      rosterPicks,
      slots,
      rosters: opportunityLayer.rosters,
      currentSeason: currentSeason ?? opportunityLayer.currentSeason,
      pickValueMap,
      playerValueMap,
      pickAssetsByRosterId,
    })
    : [];
  const surplusTradeProposals = includeSurplusTradeProposals && selectedPartnerAnalysis && myRosterAnalysis
    ? buildSurplusTradeProposals({
      myCards,
      partnerCards,
      myRosterAnalysis,
      partnerAnalysis: selectedPartnerAnalysis,
      benchmarkByPos: opportunityLayer.benchmarkByPos,
      rosterPicks,
      slots,
      rosters: opportunityLayer.rosters,
      currentSeason: currentSeason ?? opportunityLayer.currentSeason,
      pickValueMap,
      playerValueMap,
      pickAssetsByRosterId,
    })
    : [];

  return { analysesByRosterId, tradeProposals, surplusTradeProposals, resolvedNeeds: includeTradeProposals, resolvedSurplus: includeSurplusTradeProposals };
}
