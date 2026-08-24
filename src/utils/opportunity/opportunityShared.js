import { getPicksForRoster, valueDraftPick } from '../tradeEngine';
import { getOpportunityPositionLabel, normalizeOpportunityPos } from './opportunityPositions';

export function getRosterPlayerIds(roster) {
  return [...new Set([...(roster?.players ?? []), ...(roster?.reserve ?? [])])];
}

export function toFixedNumber(value, digits = 1) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}

export function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function comparePlayers(a, b) {
  return (b.ppg - a.ppg)
    || (b.recentAvg - a.recentAvg)
    || (b.seasonPts - a.seasonPts)
    || ((a.rank?.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank?.rank ?? Number.MAX_SAFE_INTEGER));
}

export function estimatePlayerTradeValue(player) {
  if (!player) return 0;
  const ppg = Math.max(0, Number(player.ppg) || 0);
  const recentAvg = Math.max(0, Number(player.recentAvg) || 0);
  const seasonPts = Math.max(0, Number(player.seasonPts) || 0);
  const rankPenalty = Math.min(36, Math.max(0, (player.rank?.rank ?? 60) - 1));
  const rankBonus = Math.max(0, 36 - rankPenalty) * 42;
  return Math.round((ppg * 320) + (recentAvg * 95) + (Math.min(320, seasonPts) * 4.5) + rankBonus);
}

export function sumAssetValues(assets = []) {
  return assets.reduce((sum, asset) => sum + Math.max(0, Number(asset?.value) || 0), 0);
}

export function oxfordJoin(items = []) {
  const list = items.filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

export function describePlayerNames(playerAssets = []) {
  return oxfordJoin(playerAssets.map((asset) => asset?.name).filter(Boolean));
}

export function describePickLabels(pickAssets = []) {
  return oxfordJoin(pickAssets.map((asset) => asset?.label).filter(Boolean));
}

export function groupPlayerAssetsByPosition(playerAssets = []) {
  const groups = new Map();

  for (const asset of playerAssets ?? []) {
    if (asset?.type !== 'player') continue;
    const position = asset.normPos ?? normalizeOpportunityPos(asset.position) ?? asset.position ?? '';
    const key = position || 'UNKNOWN';
    if (!groups.has(key)) {
      groups.set(key, {
        position,
        label: getOpportunityPositionLabel(position),
        assets: [],
      });
    }
    groups.get(key).assets.push(asset);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      assets: [...group.assets].sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || (b.ppg ?? 0) - (a.ppg ?? 0)),
    }))
    .sort((a, b) => b.assets.length - a.assets.length || (b.assets[0]?.value ?? 0) - (a.assets[0]?.value ?? 0));
}

export function buildGroupedDepthSentence(playerAssets = [], { objectPronoun = null, includeAlso = false } = {}) {
  const groups = groupPlayerAssetsByPosition(playerAssets);
  if (!groups.length) return null;

  const clauses = groups.map((group, index) => {
    const names = describePlayerNames(group.assets);
    const verb = group.assets.length === 1 ? 'adds' : 'add';
    const prefix = includeAlso && index === 0 ? 'also ' : '';
    if (objectPronoun) {
      return `${names} ${prefix}${verb} ${objectPronoun} ${group.label} depth`;
    }
    return `${names} ${prefix}${verb} ${group.label} depth`;
  });

  return `${oxfordJoin(clauses)}.`;
}

export function countPositionDepthAfter(rosterAnalysis, position, benchmark, excludedPlayerIds = []) {
  const excludedIds = new Set(excludedPlayerIds);
  return getPositionPlayers(rosterAnalysis, position)
    .filter((player) => !excludedIds.has(player.id))
    .filter((player) => (player.ppg ?? 0) >= (benchmark?.playableThreshold ?? 0))
    .length;
}

export function buildTradeAwaySummaries({
  rosterAnalysis,
  playerAssets,
  benchmarkByPos,
}) {
  const groups = groupPlayerAssetsByPosition(playerAssets);
  if (!rosterAnalysis || !groups.length) return [];

  return groups.map((group) => {
    const benchmark = benchmarkByPos?.[group.position] ?? null;
    const excludedIds = group.assets.map((asset) => asset.id);
    const alternatives = getPositionPlayers(rosterAnalysis, group.position)
      .filter((player) => !excludedIds.includes(player.id));
    const fallback = alternatives[0] ?? null;
    const depthAfter = countPositionDepthAfter(rosterAnalysis, group.position, benchmark, excludedIds);

    return {
      position: group.position,
      label: group.label,
      assets: group.assets,
      fallbackName: fallback?.name ?? null,
      depthAfter,
    };
  });
}

export function buildMoveFromDepthText(summaries = [], { subject = 'You can move', possessive = 'your', objectPronoun = 'you' } = {}) {
  if (!summaries.length) return null;

  const moveClauses = summaries.map((summary) => {
    const names = describePlayerNames(summary.assets);
    return `${names} from ${possessive} ${summary.label} depth`;
  });

  const coverClauses = summaries.map((summary) => {
    if (summary.fallbackName) {
      return `${summary.fallbackName} still gives ${objectPronoun} ${summary.label} cover`;
    }
    if ((summary.depthAfter ?? 0) > 0) {
      return `${objectPronoun === 'you' ? 'you still have' : 'they still have'} playable ${summary.label} depth`;
    }
    return null;
  }).filter(Boolean);

  const sentences = [`${subject} ${oxfordJoin(moveClauses)}.`];
  if (coverClauses.length) {
    sentences.push(`${oxfordJoin(coverClauses)}.`);
  }
  return sentences.join(' ');
}

export function buildCombinations(items, minSize = 1, maxSize = 1) {
  const results = [];
  const list = items ?? [];

  function walk(start, combo) {
    if (combo.length >= minSize && combo.length <= maxSize) {
      results.push([...combo]);
    }
    if (combo.length === maxSize) return;
    for (let i = start; i < list.length; i += 1) {
      combo.push(list[i]);
      walk(i + 1, combo);
      combo.pop();
    }
  }

  walk(0, []);
  return results;
}

export function getBestBackup(benchPlayers, playableThreshold) {
  const playable = [...(benchPlayers ?? [])]
    .filter((player) => player.ppg > 0 || player.seasonPts > 0)
    .sort(comparePlayers);
  const bestBackup = playable[0] ?? null;
  const hasPlayableFallback = !!bestBackup && (bestBackup.ppg >= playableThreshold || bestBackup.seasonPts > 0);
  return { bestBackup, hasPlayableFallback };
}

export function getPositionPlayers(rosterAnalysis, position) {
  if (rosterAnalysis?.positionPlayersByPos?.[position]) {
    return rosterAnalysis.positionPlayersByPos[position];
  }
  return [
    ...(rosterAnalysis?.startersByPos?.[position] ?? []),
    ...(rosterAnalysis?.benchByPos?.[position] ?? []),
  ].sort(comparePlayers);
}

export function isBenchPlayer(rosterAnalysis, position, playerId) {
  if (!rosterAnalysis || !position || !playerId) return false;
  const benchIdSet = rosterAnalysis.benchIdSetByPos?.[position];
  if (benchIdSet) return benchIdSet.has(playerId);
  return (rosterAnalysis.benchByPos?.[position] ?? []).some((candidate) => candidate.id === playerId);
}

export function getPositionSurplus(rosterAnalysis, position, benchmark) {
  const starters = rosterAnalysis.startersByPos[position] ?? [];
  const bench = rosterAnalysis.benchByPos[position] ?? [];
  const playableBench = bench.filter((player) => player.ppg >= (benchmark?.playableThreshold ?? 0));
  return {
    playableBench,
    hasBenchSurplus: playableBench.length > 0,
    starterCount: starters.length,
  };
}

export function getPositionDepthCount(rosterAnalysis, position, benchmark, excludedPlayerId = null) {
  return getPositionPlayers(rosterAnalysis, position)
    .filter((player) => player.id !== excludedPlayerId)
    .filter((player) => (player.ppg ?? 0) >= (benchmark?.playableThreshold ?? 0))
    .length;
}

export function buildPlayerAsset(player, rosterId, playerValueMap = null) {
  if (!player) return null;
  return {
    type: 'player',
    id: player.id,
    name: player.name,
    label: player.name,
    rosterId,
    position: player.position,
    normPos: player.normPos,
    team: player.team ?? '',
    ppg: player.ppg ?? 0,
    recentAvg: player.recentAvg ?? 0,
    seasonPts: player.seasonPts ?? 0,
    rank: player.rank ?? null,
    value: playerValueMap?.get(player.id) ?? estimatePlayerTradeValue(player),
  };
}

export function buildPickAsset(pick, rosters, pickValueMap, currentSeason, league = null, drafts = [], ktcPlayers = [], leagueType = '1qb') {
  if (!pick) return null;
  const { value, displayInfo, quality, valueQuality } = valueDraftPick(pick, {
    rosters,
    ktcPlayers,
    leagueType,
    pickValueMap,
    currentSeason,
    league,
    drafts,
  });
  return {
    type: 'pick',
    id: pick.key,
    label: displayInfo.label,
    rosterId: pick.fromRosterId,
    pickData: pick,
    round: pick.round,
    year: pick.year,
    quality,
    valueQuality,
    displayMode: displayInfo.displayMode,
    lockedSlot: displayInfo.lockedSlot ?? null,
    pickNumberLabel: displayInfo.pickNumberLabel ?? null,
    pickRangeLabel: displayInfo.pickRangeLabel ?? null,
    cardHeadline: displayInfo.cardHeadline ?? null,
    cardMetaLabel: displayInfo.cardMetaLabel ?? null,
    sortSlot: displayInfo.sortSlot ?? null,
    value,
    isOwn: !!pick.isOwn,
  };
}

export function getRosterPickAssets(rosterId, rosterPicks, slots, rosters, pickValueMap, currentSeason, league = null, drafts = [], ktcPlayers = [], leagueType = '1qb') {
  if (!rosterId || !rosterPicks || !slots) return [];
  return getPicksForRoster(rosterId, rosterPicks, slots)
    .map((pick) => buildPickAsset(pick, rosters, pickValueMap, currentSeason, league, drafts, ktcPlayers, leagueType))
    .filter(Boolean)
    .sort((a, b) => {
      const aPriority = (a.isOwn ? 0 : 25) + ((a.round ?? 99) * -3) + ((a.year ?? currentSeason) - Number(currentSeason)) * 2;
      const bPriority = (b.isOwn ? 0 : 25) + ((b.round ?? 99) * -3) + ((b.year ?? currentSeason) - Number(currentSeason)) * 2;
      return bPriority - aPriority;
    });
}

export function buildRosterPickAssetsById(rosterIds, rosterPicks, slots, rosters, pickValueMap, currentSeason, league = null, drafts = [], ktcPlayers = [], leagueType = '1qb') {
  const pickAssetsByRosterId = new Map();
  const ids = [...new Set((rosterIds ?? []).filter(Boolean))];
  for (const rosterId of ids) {
    pickAssetsByRosterId.set(
      rosterId,
      getRosterPickAssets(rosterId, rosterPicks, slots, rosters, pickValueMap, currentSeason, league, drafts, ktcPlayers, leagueType),
    );
  }
  return pickAssetsByRosterId;
}

export function pickSpareDraftCapital(pickAssets, upgradeDelta) {
  if (!pickAssets?.length) return null;
  const sorted = [...pickAssets].sort((a, b) => {
    const aPenalty = (a.isOwn ? 10 : 0) + ((a.round ?? 99) * 8) + ((a.year ?? 0) - 2020);
    const bPenalty = (b.isOwn ? 10 : 0) + ((b.round ?? 99) * 8) + ((b.year ?? 0) - 2020);
    return bPenalty - aPenalty;
  });

  if (upgradeDelta >= 3.5) {
    return sorted.find((pick) => (pick.round ?? 99) <= 2) ?? sorted[0];
  }
  return sorted.find((pick) => (pick.round ?? 99) >= 2) ?? sorted[0];
}

export function formatReasonAssetList(assets = []) {
  const labels = assets
    .map((asset) => asset?.label ?? asset?.name ?? '')
    .filter(Boolean);
  if (!labels.length) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

export function buildTradeAwaySummaryByPos(rosterAnalysis, tradeAssets = [], benchmarkByPos, playerValueMap) {
  const summaryByPos = {};
  if (!rosterAnalysis) return summaryByPos;

  const playerAssets = tradeAssets.filter((asset) => asset?.type === 'player');
  const excludedPlayerIds = new Set(playerAssets.map((asset) => asset.id));

  for (const group of groupPlayerAssetsByPosition(playerAssets)) {
    const benchmark = benchmarkByPos?.[group.position] ?? null;
    const remainingPlayers = getPositionPlayers(rosterAnalysis, group.position)
      .filter((player) => !excludedPlayerIds.has(player.id));
    const playablePlayers = remainingPlayers.filter((player) => (player.ppg ?? 0) >= (benchmark?.playableThreshold ?? 0));
    const fallbackAssets = playablePlayers.slice(0, 2)
      .map((player) => buildPlayerAsset(player, rosterAnalysis.roster_id, playerValueMap))
      .filter(Boolean);

    summaryByPos[group.position] = {
      position: group.position,
      label: group.label,
      assets: group.assets,
      depthAfter: playablePlayers.length,
      fallbackAssets,
      hasPlayableFallback: playablePlayers.length > 0,
    };
  }

  return summaryByPos;
}

export function hasSustainableTradeAwayDepth(summaryByPos = {}) {
  const summaries = Object.values(summaryByPos ?? {});
  if (!summaries.length) return true;
  return summaries.every((summary) => (summary?.depthAfter ?? 0) > 0);
}

export function buildPositionPackageClauses(playerAssets = [], summaryByPos = {}, ownerWord = 'you') {
  const clauses = [];
  const possessive = ownerWord === 'they' ? 'their' : 'your';
  const objectPronoun = ownerWord === 'they' ? 'them' : 'you';
  for (const group of groupPlayerAssetsByPosition(playerAssets)) {
    const summary = summaryByPos?.[group.position] ?? null;
    const subject = formatReasonAssetList(group.assets);
    const label = group.label;
    const fallbackAssets = summary?.fallbackAssets ?? [];
    const moveVerb = group.assets.length === 1 ? 'comes' : 'come';
    if (fallbackAssets.length) {
      const fallbackText = formatReasonAssetList(fallbackAssets);
      const coverVerb = fallbackAssets.length === 1 ? 'gives' : 'give';
      clauses.push(`${subject} ${moveVerb} from ${possessive} ${label} depth. After the deal, ${fallbackText} still ${coverVerb} ${objectPronoun} ${label} cover.`);
    } else {
      clauses.push(`${subject} ${moveVerb} from ${possessive} ${label} depth. ${ownerWord === 'they' ? 'This would leave them thin' : 'This would leave you thin'} at ${label}.`);
    }
  }
  return clauses;
}

export function buildExtraPlayerClauses(playerAssets = [], primaryAssetId = null) {
  const extraAssets = playerAssets.filter((asset) => asset?.id !== primaryAssetId);
  const clauses = [];
  for (const group of groupPlayerAssetsByPosition(extraAssets)) {
    const subject = formatReasonAssetList(group.assets);
    const label = group.label;
    clauses.push(group.assets.length === 1
      ? `${subject} also adds ${label} depth.`
      : `${subject} also add ${label} depth.`);
  }
  return clauses;
}

export function getPaymentTypeForAssets(assets = []) {
  const playerCount = assets.filter((asset) => asset.type === 'player').length;
  const pickCount = assets.filter((asset) => asset.type === 'pick').length;
  if (playerCount === 1 && pickCount === 0) return 'player';
  if (playerCount === 0 && pickCount === 1) return 'pick';
  if (playerCount === 1 && pickCount === 1) return 'player_plus_pick';
  if (playerCount === 2 && pickCount === 0) return 'player_plus_player';
  return 'multi_asset';
}

export function getPrimaryPlayerAsset(assets = []) {
  return [...assets]
    .filter((asset) => asset?.type === 'player')
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || (b.ppg ?? 0) - (a.ppg ?? 0))[0] ?? null;
}

export function finalizeDeferredProposal(proposal) {
  return proposal?.deferHydration ? proposal.deferHydration() : proposal;
}
