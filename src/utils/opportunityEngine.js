import { calcPointsFromTotals, getRecentAvg } from './scoringEngine';
import {
  buildDefenseTable,
  computePositionalRanks,
  getAvgPPG,
  getDefenseStrength,
  getLeagueAvgPPG,
} from './projectionEngine';
import { getPicksForRoster, getPickQuality } from './tradeEngine';

const IGNORED_SLOTS = new Set(['BN', 'IR', 'TAXI']);
const WAIVER_SUPPORTED_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K']);

const POSITION_LABELS = {
  QB: 'QB',
  RB: 'RB',
  WR: 'WR',
  TE: 'TE',
  K: 'K',
  DEF: 'D/ST',
  DL: 'DL',
  LB: 'LB',
  DB: 'DB',
};

const ORDINALS = {
  1: '1st',
  2: '2nd',
  3: '3rd',
  4: '4th',
  5: '5th',
  6: '6th',
  7: '7th',
  8: '8th',
  9: '9th',
  10: '10th',
};

const SLOT_ELIGIBILITY = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  K: ['K'],
  DEF: ['DEF'],
  DL: ['DL'],
  LB: ['LB'],
  DB: ['DB'],
  FLEX: ['RB', 'WR', 'TE'],
  REC_FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  WRTE_FLEX: ['WR', 'TE'],
  WRT_FLEX: ['RB', 'WR', 'TE'],
  RBWR_FLEX: ['RB', 'WR'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  OP: ['QB', 'RB', 'WR', 'TE'],
  IDP_FLEX: ['DL', 'LB', 'DB'],
  FLEX_IDP: ['DL', 'LB', 'DB'],
  DP: ['DL', 'LB', 'DB'],
};

export function normalizeOpportunityPos(pos) {
  if (['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB'].includes(pos)) return pos;
  if (['DE', 'DT'].includes(pos)) return 'DL';
  if (['ILB', 'OLB'].includes(pos)) return 'LB';
  if (['CB', 'S', 'SS', 'FS'].includes(pos)) return 'DB';
  return null;
}

export function getOpportunityPositionLabel(pos) {
  return POSITION_LABELS[normalizeOpportunityPos(pos) ?? pos] ?? pos;
}

export function supportsWaiverOpportunity(pos) {
  return WAIVER_SUPPORTED_POSITIONS.has(normalizeOpportunityPos(pos));
}

function getSlotEligiblePositions(slot) {
  return SLOT_ELIGIBILITY[slot] ?? [];
}

function getRosterPlayerIds(roster) {
  return [...new Set([...(roster?.players ?? []), ...(roster?.reserve ?? [])])];
}

function toFixedNumber(value, digits = 1) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, p) {
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

function comparePlayers(a, b) {
  return (b.ppg - a.ppg)
    || (b.recentAvg - a.recentAvg)
    || (b.seasonPts - a.seasonPts)
    || ((a.rank?.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank?.rank ?? Number.MAX_SAFE_INTEGER));
}

function estimatePlayerTradeValue(player) {
  if (!player) return 0;
  const ppg = Math.max(0, Number(player.ppg) || 0);
  const recentAvg = Math.max(0, Number(player.recentAvg) || 0);
  const seasonPts = Math.max(0, Number(player.seasonPts) || 0);
  const rankPenalty = Math.min(36, Math.max(0, (player.rank?.rank ?? 60) - 1));
  const rankBonus = Math.max(0, 36 - rankPenalty) * 42;
  return Math.round((ppg * 320) + (recentAvg * 95) + (Math.min(320, seasonPts) * 4.5) + rankBonus);
}

function sumAssetValues(assets = []) {
  return assets.reduce((sum, asset) => sum + Math.max(0, Number(asset?.value) || 0), 0);
}

function oxfordJoin(items = []) {
  const list = items.filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

function describePlayerNames(playerAssets = []) {
  return oxfordJoin(playerAssets.map((asset) => asset?.name).filter(Boolean));
}

function describePickLabels(pickAssets = []) {
  return oxfordJoin(pickAssets.map((asset) => asset?.label).filter(Boolean));
}

function groupPlayerAssetsByPosition(playerAssets = []) {
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

function buildGroupedDepthSentence(playerAssets = [], { objectPronoun = null, includeAlso = false } = {}) {
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

function countPositionDepthAfter(rosterAnalysis, position, benchmark, excludedPlayerIds = []) {
  const excludedIds = new Set(excludedPlayerIds);
  return getPositionPlayers(rosterAnalysis, position)
    .filter((player) => !excludedIds.has(player.id))
    .filter((player) => (player.ppg ?? 0) >= (benchmark?.playableThreshold ?? 0))
    .length;
}

function buildTradeAwaySummaries({
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

function buildMoveFromDepthText(summaries = [], { subject = 'You can move', possessive = 'your', objectPronoun = 'you' } = {}) {
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

function buildCombinations(items, minSize = 1, maxSize = 1) {
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

function getAnalysisWeek(league) {
  const playoffStart = league?.settings?.playoff_week_start ?? 18;
  const lastScored = league?.settings?.last_scored_leg;
  if (lastScored) return Math.min(lastScored + 1, playoffStart - 1);
  return Math.max(1, playoffStart - 1);
}

function buildRosterPlayers(roster, players, seasonStats, weeklyStats, scoringSettings, rankMap) {
  return getRosterPlayerIds(roster)
    .map((id) => {
      const player = players?.[id];
      if (!player) return null;

      const normPos = normalizeOpportunityPos(player.position);
      if (!normPos) return null;

      const totals = seasonStats?.[id] ?? null;
      const weekly = weeklyStats?.[id] ?? [];
      const seasonPts = totals ? calcPointsFromTotals(totals, scoringSettings, player.position) : 0;
      const ppg = getAvgPPG(weekly, scoringSettings, player.position);
      const recentAvg = getRecentAvg(weekly, scoringSettings, 4, player.position);

      return {
        id,
        name: player.full_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim(),
        position: player.position,
        normPos,
        team: player.team ?? 'FA',
        seasonPts,
        ppg,
        recentAvg,
        rank: rankMap[id] ?? null,
        byeWeek: player.bye_week ?? null,
      };
    })
    .filter(Boolean)
    .sort(comparePlayers);
}

function assignStarters(rosterPlayers, starterSlots) {
  const assignments = [];
  const usedIds = new Set();
  const sortedSlots = starterSlots
    .map((slot, index) => ({ slot, index, eligible: getSlotEligiblePositions(slot) }))
    .filter(({ eligible }) => eligible.length > 0)
    .sort((a, b) => a.eligible.length - b.eligible.length || a.index - b.index);

  for (const slotInfo of sortedSlots) {
    const player = rosterPlayers.find(
      (candidate) => !usedIds.has(candidate.id) && slotInfo.eligible.includes(candidate.normPos),
    ) ?? null;

    if (player) usedIds.add(player.id);
    assignments.push({ ...slotInfo, player });
  }

  const startersByPos = {};
  const benchByPos = {};

  for (const { player } of assignments) {
    if (!player) continue;
    if (!startersByPos[player.normPos]) startersByPos[player.normPos] = [];
    startersByPos[player.normPos].push(player);
  }

  for (const player of rosterPlayers) {
    if (usedIds.has(player.id)) continue;
    if (!benchByPos[player.normPos]) benchByPos[player.normPos] = [];
    benchByPos[player.normPos].push(player);
  }

  const positionPlayersByPos = {};
  const benchIdSetByPos = {};
  const positions = new Set([
    ...Object.keys(startersByPos),
    ...Object.keys(benchByPos),
  ]);

  for (const position of positions) {
    positionPlayersByPos[position] = [
      ...(startersByPos[position] ?? []),
      ...(benchByPos[position] ?? []),
    ].sort(comparePlayers);
    benchIdSetByPos[position] = new Set((benchByPos[position] ?? []).map((player) => player.id));
  }

  return { assignments, startersByPos, benchByPos, positionPlayersByPos, benchIdSetByPos };
}

function buildLeagueBenchmarks(rosterAnalyses, positions) {
  const result = {};

  for (const pos of positions) {
    const starterPPGs = [];
    const assignedCounts = [];
    const weakestStarterValues = [];

    for (const roster of rosterAnalyses) {
      const starters = roster.startersByPos[pos] ?? [];
      assignedCounts.push(starters.length);
      const rosterValues = starters.map((player) => player.ppg).filter((value) => value > 0);
      const weakestStarter = rosterValues.length ? Math.min(...rosterValues) : 0;
      weakestStarterValues.push(weakestStarter);
      for (const player of starters) {
        if (player.ppg > 0) starterPPGs.push(player.ppg);
      }
    }

    const avgStarterPPG = average(starterPPGs);
    const avgStarterCount = average(assignedCounts);

    result[pos] = {
      avgStarterPPG: toFixedNumber(avgStarterPPG, 1),
      avgStarterCount: toFixedNumber(avgStarterCount, 2),
      playableThreshold: avgStarterPPG > 0 ? avgStarterPPG * 0.6 : 4,
      distribution: {
        min: toFixedNumber(Math.min(...weakestStarterValues), 1),
        q1: toFixedNumber(percentile(weakestStarterValues, 0.25), 1),
        median: toFixedNumber(percentile(weakestStarterValues, 0.5), 1),
        q3: toFixedNumber(percentile(weakestStarterValues, 0.75), 1),
        max: toFixedNumber(Math.max(...weakestStarterValues), 1),
      },
    };
  }

  return result;
}

function buildAvailablePlayersByPos(rosters, players, seasonStats, weeklyStats, scoringSettings) {
  const rosteredIds = new Set();
  for (const roster of rosters ?? []) {
    for (const id of getRosterPlayerIds(roster)) rosteredIds.add(id);
  }

  const availableByPos = {};

  for (const [id, stats] of Object.entries(seasonStats ?? {})) {
    if (rosteredIds.has(id)) continue;

    const player = players?.[id];
    if (!player) continue;

    const normPos = normalizeOpportunityPos(player.position);
    if (!normPos) continue;

    const seasonPts = calcPointsFromTotals(stats, scoringSettings, player.position);
    if (seasonPts <= 0) continue;

    const weekly = weeklyStats?.[id] ?? [];
    const candidate = {
      id,
      name: player.full_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim(),
      position: player.position,
      normPos,
      team: player.team ?? 'FA',
      seasonPts,
      ppg: getAvgPPG(weekly, scoringSettings, player.position),
      recentAvg: getRecentAvg(weekly, scoringSettings, 4, player.position),
    };

    if (!availableByPos[normPos]) availableByPos[normPos] = [];
    availableByPos[normPos].push(candidate);
  }

  for (const pos of Object.keys(availableByPos)) {
    availableByPos[pos].sort(comparePlayers);
  }

  return availableByPos;
}

function getUpcomingPressure(starters, scheduleMap, defenseTable, weeklyStats, players, scoringSettings, analysisWeek) {
  if (!starters?.length || !scheduleMap || !defenseTable || !weeklyStats || !players) return null;

  const factors = [];
  let toughCount = 0;
  let easyCount = 0;
  const leagueAvgCache = {};

  for (const starter of starters) {
    const team = starter.team?.toUpperCase();
    if (!team) continue;

    for (let week = analysisWeek; week < analysisWeek + 3; week += 1) {
      const opp = scheduleMap?.[week]?.[team]?.opp?.toUpperCase();
      if (!opp) continue;

      const defenseStrength = getDefenseStrength(defenseTable, opp, starter.position, analysisWeek);
      if (!defenseStrength?.ptsAllowedPerGame) continue;

      const leagueAvg = leagueAvgCache[starter.normPos]
        ?? getLeagueAvgPPG(starter.normPos, weeklyStats, players, scoringSettings, analysisWeek);
      leagueAvgCache[starter.normPos] = leagueAvg;
      if (!leagueAvg) continue;

      const factor = defenseStrength.ptsAllowedPerGame / leagueAvg;
      factors.push(factor);
      if (factor < 0.92) toughCount += 1;
      if (factor > 1.08) easyCount += 1;
    }
  }

  if (!factors.length) return null;

  return {
    avgFactor: toFixedNumber(average(factors), 2),
    toughCount,
    easyCount,
    sampleSize: factors.length,
  };
}

function getByePressure(starters, analysisWeek) {
  const counts = new Map();

  for (const starter of starters ?? []) {
    const byeWeek = Number(starter.byeWeek);
    if (!byeWeek || byeWeek < analysisWeek) continue;
    counts.set(byeWeek, (counts.get(byeWeek) ?? 0) + 1);
  }

  let worst = null;
  for (const [week, count] of counts.entries()) {
    if (!worst || count > worst.count) worst = { week, count };
  }

  return worst?.count >= 2 ? worst : null;
}

function getSurplusPositions(myRosterAnalysis) {
  if (!myRosterAnalysis) return null;

  return Object.entries(myRosterAnalysis.benchByPos ?? {})
    .filter(([, players]) => (players ?? []).some((player) => player.ppg > 0 || player.seasonPts > 0))
    .sort((a, b) => {
      const aTop = [...(a[1] ?? [])].sort(comparePlayers)[0];
      const bTop = [...(b[1] ?? [])].sort(comparePlayers)[0];
      return comparePlayers(aTop ?? {}, bTop ?? {});
    })
    .map(([pos]) => pos);
}

function findOfferCandidates(position, myRosterAnalysis) {
  if (!myRosterAnalysis) return [];

  const seen = new Set();
  const positionsToTry = [position, ...getSurplusPositions(myRosterAnalysis).filter((pos) => pos !== position)];
  const candidates = [];

  for (const pos of positionsToTry) {
    const benchPlayers = [...(myRosterAnalysis.benchByPos[pos] ?? [])]
      .filter((player) => player.ppg > 0 || player.seasonPts > 0)
      .sort(comparePlayers);

    for (const player of benchPlayers) {
      if (seen.has(player.id)) continue;
      seen.add(player.id);
      candidates.push(player);
      if (candidates.length >= 3) return candidates;
    }
  }

  return candidates;
}

function getBestBackup(benchPlayers, playableThreshold) {
  const playable = [...(benchPlayers ?? [])]
    .filter((player) => player.ppg > 0 || player.seasonPts > 0)
    .sort(comparePlayers);
  const bestBackup = playable[0] ?? null;
  const hasPlayableFallback = !!bestBackup && (bestBackup.ppg >= playableThreshold || bestBackup.seasonPts > 0);
  return { bestBackup, hasPlayableFallback };
}

function getPositionPlayers(rosterAnalysis, position) {
  if (rosterAnalysis?.positionPlayersByPos?.[position]) {
    return rosterAnalysis.positionPlayersByPos[position];
  }
  return [
    ...(rosterAnalysis?.startersByPos?.[position] ?? []),
    ...(rosterAnalysis?.benchByPos?.[position] ?? []),
  ].sort(comparePlayers);
}

function isBenchPlayer(rosterAnalysis, position, playerId) {
  if (!rosterAnalysis || !position || !playerId) return false;
  const benchIdSet = rosterAnalysis.benchIdSetByPos?.[position];
  if (benchIdSet) return benchIdSet.has(playerId);
  return (rosterAnalysis.benchByPos?.[position] ?? []).some((candidate) => candidate.id === playerId);
}

function getPositionSurplus(rosterAnalysis, position, benchmark) {
  const starters = rosterAnalysis.startersByPos[position] ?? [];
  const bench = rosterAnalysis.benchByPos[position] ?? [];
  const playableBench = bench.filter((player) => player.ppg >= (benchmark?.playableThreshold ?? 0));
  return {
    playableBench,
    hasBenchSurplus: playableBench.length > 0,
    starterCount: starters.length,
  };
}

function getPositionDepthCount(rosterAnalysis, position, benchmark, excludedPlayerId = null) {
  return getPositionPlayers(rosterAnalysis, position)
    .filter((player) => player.id !== excludedPlayerId)
    .filter((player) => (player.ppg ?? 0) >= (benchmark?.playableThreshold ?? 0))
    .length;
}

function buildProposalContext({
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
  const outgoingPlayer = outgoingAssets.find((asset) => asset.type === 'player') ?? null;
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
  const needBenchmark = outgoingPlayer?.normPos ? benchmarkByPos?.[outgoingPlayer.normPos] ?? null : null;
  const needDepthCurrent = outgoingPlayer?.normPos
    ? getPositionDepthCount(partnerAnalysis, outgoingPlayer.normPos, needBenchmark)
    : 0;
  const theirTradeAwaySummaryByPos = buildTradeAwaySummaryByPos(partnerAnalysis, resolvedIncomingAssets, benchmarkByPos, playerValueMap);
  const theirPrimarySummary = tradeAwayPos ? theirTradeAwaySummaryByPos[tradeAwayPos] ?? null : null;
  const theirTradeAwayFallback = theirPrimarySummary?.fallbackAssets?.[0] ?? null;
  const theirTradeAwayDepthAfter = theirPrimarySummary?.depthAfter ?? 0;
  const theirTradeAwayDropoff = Math.max(0, (primaryIncomingPlayer?.ppg ?? 0) - (theirTradeAwayFallback?.ppg ?? 0));
  const theirUpgradeDelta = outgoingPlayer && partnerNeedCard?.weakStarter
    ? Math.max(0, (outgoingPlayer.ppg ?? 0) - (partnerNeedCard.weakStarter.ppg ?? 0))
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
    theirUpgradeWith: outgoingPlayer,
    theirUpgradeDelta: toFixedNumber(theirUpgradeDelta, 1),
    theirNeedDepthCurrent: needDepthCurrent,
    theirTradeAwayPosition: tradeAwayPos,
    theirTradeAwayPlayer: primaryIncomingPlayer ?? null,
    theirTradeAwayFallback: theirTradeAwayFallback ? buildPlayerAsset(theirTradeAwayFallback, partnerAnalysis.roster_id, playerValueMap) : null,
    theirTradeAwayDepthAfter,
    theirTradeAwayDropoff: toFixedNumber(theirTradeAwayDropoff, 1),
    theirTradeAwaySummaryByPos,
  };
}

function buildPlayerAsset(player, rosterId, playerValueMap = null) {
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

function buildPickAsset(pick, rosters, pickValueMap, currentSeason) {
  if (!pick) return null;
  const quality = getPickQuality(pick.fromRosterId, rosters);
  const ord = ORDINALS[pick.round] ?? `${pick.round}th`;
  const yearOffset = Math.max(0, Number(pick.year ?? currentSeason) - Number(currentSeason));
  const discount = yearOffset <= 0 ? 1 : Math.pow(0.92, yearOffset);
  const tierVal = pickValueMap?.[pick.round]?.[quality] ?? pickValueMap?.[pick.round]?.Mid ?? 0;
  const value = Math.round((tierVal ?? 0) * discount);
  return {
    type: 'pick',
    id: pick.key,
    label: `${pick.year} ${quality} ${ord}`,
    rosterId: pick.fromRosterId,
    pickData: pick,
    round: pick.round,
    year: pick.year,
    quality,
    value,
    isOwn: !!pick.isOwn,
  };
}

function getRosterPickAssets(rosterId, rosterPicks, slots, rosters, pickValueMap, currentSeason) {
  if (!rosterId || !rosterPicks || !slots) return [];
  return getPicksForRoster(rosterId, rosterPicks, slots)
    .map((pick) => buildPickAsset(pick, rosters, pickValueMap, currentSeason))
    .filter(Boolean)
    .sort((a, b) => {
      const aPriority = (a.isOwn ? 0 : 25) + ((a.round ?? 99) * -3) + ((a.year ?? currentSeason) - Number(currentSeason)) * 2;
      const bPriority = (b.isOwn ? 0 : 25) + ((b.round ?? 99) * -3) + ((b.year ?? currentSeason) - Number(currentSeason)) * 2;
      return bPriority - aPriority;
    });
}

function buildRosterPickAssetsById(rosterIds, rosterPicks, slots, rosters, pickValueMap, currentSeason) {
  const pickAssetsByRosterId = new Map();
  const ids = [...new Set((rosterIds ?? []).filter(Boolean))];
  for (const rosterId of ids) {
    pickAssetsByRosterId.set(
      rosterId,
      getRosterPickAssets(rosterId, rosterPicks, slots, rosters, pickValueMap, currentSeason),
    );
  }
  return pickAssetsByRosterId;
}

function pickSpareDraftCapital(pickAssets, upgradeDelta) {
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

function pickOutgoingPlayerChip(myRosterAnalysis, myCards, partnerCards, myNeedPosition, targetPlayer) {
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

function pickOutgoingPlayerChoices(myRosterAnalysis, myCards, partnerCards, myNeedPosition, targetPlayer, playerValueMap = null, limit = 3) {
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

function pickSpareDraftCapitalOptions(pickAssets, upgradeDelta, limit = 3) {
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

function getOutgoingPickReasonForMe(outgoingPickAssets = [], outgoingPlayerAsset = null) {
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

function getOutgoingPickReasonForThem(outgoingPickAssets = []) {
  if (!outgoingPickAssets.length) return null;
  if (outgoingPickAssets.length === 1) {
    return `They also get ${outgoingPickAssets[0].label} as future draft value.`;
  }
  return `They also get ${formatReasonAssetList(outgoingPickAssets)} as future draft value.`;
}

function getIncomingPickReasonForMe(incomingPickAssets = []) {
  if (!incomingPickAssets.length) return null;
  if (incomingPickAssets.length === 1) {
    return `You also get ${incomingPickAssets[0].label} back to balance the value.`;
  }
  return `You also get ${formatReasonAssetList(incomingPickAssets)} back to balance the value.`;
}

function formatReasonAssetList(assets = []) {
  const labels = assets
    .map((asset) => asset?.label ?? asset?.name ?? '')
    .filter(Boolean);
  if (!labels.length) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

function buildTradeAwaySummaryByPos(rosterAnalysis, tradeAssets = [], benchmarkByPos, playerValueMap) {
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

function hasSustainableTradeAwayDepth(summaryByPos = {}) {
  const summaries = Object.values(summaryByPos ?? {});
  if (!summaries.length) return true;
  return summaries.every((summary) => (summary?.depthAfter ?? 0) > 0);
}

function buildPositionPackageClauses(playerAssets = [], summaryByPos = {}, ownerWord = 'you') {
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
      clauses.push(`${subject} ${moveVerb} from ${possessive} ${label} depth. ${fallbackText} still ${coverVerb} ${objectPronoun} ${label} cover.`);
    } else {
      clauses.push(`${subject} ${moveVerb} from ${possessive} ${label} depth. ${ownerWord === 'they' ? 'This would leave them thin' : 'This would leave you thin'} at ${label}.`);
    }
  }
  return clauses;
}

function buildExtraPlayerClauses(playerAssets = [], primaryAssetId = null, ownerWord = 'you') {
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

function getMyReasonPayload(card, incomingAssets, upgradeDelta, outgoingPickAssets = [], outgoingPlayerAsset = null) {
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

function getThemReasonPayload({
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

function buildTradeProposal({
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
  const extraIncomingPlayers = resolvedIncomingAssets
    .filter((asset) => asset.type === 'player')
    .filter((asset) => asset.id !== primaryIncomingAsset?.id);
  const incomingPickAssets = resolvedIncomingAssets.filter((asset) => asset.type === 'pick');
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

function buildTradeProposalShell({
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

function getPaymentTypeForAssets(assets = []) {
  const playerCount = assets.filter((asset) => asset.type === 'player').length;
  const pickCount = assets.filter((asset) => asset.type === 'pick').length;
  if (playerCount === 1 && pickCount === 0) return 'player';
  if (playerCount === 0 && pickCount === 1) return 'pick';
  if (playerCount === 1 && pickCount === 1) return 'player_plus_pick';
  if (playerCount === 2 && pickCount === 0) return 'player_plus_player';
  return 'multi_asset';
}

function getPrimaryPlayerAsset(assets = []) {
  return [...assets]
    .filter((asset) => asset?.type === 'player')
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || (b.ppg ?? 0) - (a.ppg ?? 0))[0] ?? null;
}

function buildSurplusProposalContext({
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

function getSurplusPickReasonForMe(incomingPickAssets = []) {
  if (!incomingPickAssets.length) return null;
  if (incomingPickAssets.length === 1) return `You also get ${incomingPickAssets[0].label} as future draft value.`;
  return `You also get ${formatReasonAssetList(incomingPickAssets)} as future draft value.`;
}

function getSurplusPickReasonForThem(outgoingPickAssets = []) {
  if (!outgoingPickAssets.length) return null;
  if (outgoingPickAssets.length === 1) {
    return `They send ${outgoingPickAssets[0].label} as the future draft value needed to buy the upgrade.`;
  }
  return `They send ${formatReasonAssetList(outgoingPickAssets)} as the future draft value needed to buy the upgrade.`;
}

function buildSurplusMyReasonPayload({
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

function buildSurplusThemReasonPayload({
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

function buildSurplusTradeProposal({
  myNeedCard,
  partnerNeedCard,
  outgoingAssets,
  incomingAssets,
  partnerRosterId,
  plausibilityScore,
  context,
}) {
  const outgoingPlayerAsset = getPrimaryPlayerAsset(outgoingAssets);
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

function buildSurplusTradeProposalShell({
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

function finalizeDeferredProposal(proposal) {
  return proposal?.deferHydration ? proposal.deferHydration() : proposal;
}

function findMySurplusTradeCandidates({
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

function pickIncomingNeedPlayerChoices({
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

function buildIncomingPlayerPackageChoices({
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

function pickIncomingPickCombos(partnerPickAssets, targetValue, maxAssets = 3, limit = 7) {
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

function evaluateSurplusReturnPackage({
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

function buildSurplusTradeProposals({
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

function buildTradeProposals({
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
        const tradableSurplus = isBenchTarget || partnerSurplus.hasBenchSurplus;
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
    4,
  ).map(finalizeDeferredProposal);
}

function buildOpportunityCards(
  rosterAnalysis,
  benchmarkByPos,
  availableByPos,
  rosterAnalyses,
  myRosterAnalysis,
  isMyRoster,
  scheduleMap,
  defenseTable,
  weeklyStats,
  players,
  scoringSettings,
  analysisWeek,
) {
  const positions = Object.keys(benchmarkByPos);
  const cards = [];

  for (const position of positions) {
    const benchmark = benchmarkByPos[position];
    const starters = rosterAnalysis.startersByPos[position] ?? [];
    const bench = rosterAnalysis.benchByPos[position] ?? [];
    const starterPPGs = starters.map((player) => player.ppg).filter((value) => value > 0);
    const weakestStarter = [...starters]
      .filter((player) => player.ppg > 0 || player.seasonPts > 0)
      .sort((a, b) => a.ppg - b.ppg || a.seasonPts - b.seasonPts)[0] ?? starters[0] ?? null;
    const weakestStarterPPG = weakestStarter?.ppg ?? 0;
    const { bestBackup, hasPlayableFallback } = getBestBackup(bench, benchmark.playableThreshold);
    const starterToBackupGap = toFixedNumber(Math.max(0, weakestStarterPPG - (bestBackup?.ppg ?? 0)), 1);
    const assignedGap = Math.max(0, benchmark.avgStarterCount - starters.length);
    const shortageRatio = benchmark.avgStarterCount > 0 ? assignedGap / benchmark.avgStarterCount : 0;
    const gapRatio = benchmark.distribution?.median > 0
      ? Math.max(0, (benchmark.distribution.median - weakestStarterPPG) / benchmark.distribution.median)
      : 0;
    const playableBenchCount = bench.filter((player) => player.ppg >= benchmark.playableThreshold).length;
    const depthTarget = Math.max(1, Math.min(2, Math.round(benchmark.avgStarterCount)));
    const depthRatio = Math.max(0, (depthTarget - playableBenchCount) / depthTarget);
    const schedulePressure = getUpcomingPressure(
      starters,
      scheduleMap,
      defenseTable,
      weeklyStats,
      players,
      scoringSettings,
      analysisWeek,
    );
    const byePressure = getByePressure(starters, analysisWeek);

    let severity = (gapRatio * 56) + (shortageRatio * 16) + (depthRatio * 16) + ((hasPlayableFallback ? 0 : 10));
    if (schedulePressure?.toughCount >= 2) severity += 5;
    if (byePressure) severity += 4;
    severity = Math.min(100, Math.round(severity));

    if (severity < 12 && starters.length === 0 && bench.length === 0) continue;
    if (severity < 10 && weakestStarterPPG >= (benchmark.distribution?.median ?? benchmark.avgStarterPPG)) continue;

    cards.push({
      key: `${rosterAnalysis.roster_id}-${position}`,
      position,
      label: getOpportunityPositionLabel(position),
      severity,
      starterAvgPPG: toFixedNumber(average(starterPPGs), 1),
      weakStarter: weakestStarter,
      weakStarterPPG: weakestStarterPPG,
      bestBackup,
      hasPlayableFallback,
      starterToBackupGap,
      leagueStarterAvgPPG: benchmark.avgStarterPPG,
      leagueDistribution: benchmark.distribution,
      assignedStarterCount: starters.length,
      expectedStarterCount: benchmark.avgStarterCount,
      playableBenchCount,
      schedulePressure,
      byePressure,
      waiverTarget: availableByPos[position]?.[0] ?? null,
      waiverSupported: supportsWaiverOpportunity(position),
      offerTargets: findOfferCandidates(position, myRosterAnalysis),
      upgradeCandidates: [],
      recommendedIncomingTarget: null,
      recommendedOutgoingChip: null,
      obtainabilityReason: null,
    });
  }

  return cards.sort((a, b) => b.severity - a.severity || b.leagueStarterAvgPPG - a.leagueStarterAvgPPG);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeTradePostureLevel(level) {
  return clamp(Math.round(Number(level) || 2), 0, 4);
}

function getTradePostureSettings(level) {
  switch (normalizeTradePostureLevel(level)) {
    case 0:
      return { level: 0, key: 'underpay', targetRatio: 0.72, minRatio: 0.55, maxRatio: 0.88, minCoverageRatio: 0.82, samePosPenalty: 18, allowPickOnly: false };
    case 1:
      return { level: 1, key: 'lean_under', targetRatio: 0.9, minRatio: 0.8, maxRatio: 0.98, minCoverageRatio: 0.88, samePosPenalty: 16, allowPickOnly: false };
    case 2:
      return { level: 2, key: 'fair', targetRatio: 1.0, minRatio: 0.92, maxRatio: 1.08, minCoverageRatio: 0.94, samePosPenalty: 14, allowPickOnly: false };
    case 3:
      return { level: 3, key: 'lean_over', targetRatio: 1.1, minRatio: 1.02, maxRatio: 1.18, minCoverageRatio: 0.97, samePosPenalty: 12, allowPickOnly: true };
    case 4:
    default:
      return { level: 4, key: 'overpay', targetRatio: 1.26, minRatio: 1.14, maxRatio: 1.42, minCoverageRatio: 1.0, samePosPenalty: 10, allowPickOnly: true };
  }
}

function buildFallbackTargetCard(targetPlayer, existingCard) {
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

function resolveOutgoingPlayerAssets(myRosterAnalysis, targetPlayerId, allowedOutgoingPlayerIds, playerValueMap = null) {
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

function resolveOutgoingPickAssets({
  myRosterId,
  rosterPickAssets = [],
  allowOutgoingPicks,
}) {
  if (!allowOutgoingPicks) return [];
  if (!myRosterId) return [];
  return rosterPickAssets;
}

function scoreAllowedOutgoingPlayers({
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

function scoreAllowedOutgoingPicks({
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

function evaluateUpgradePackage({
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

function getTradeProposalShapeSignature(proposal) {
  const incomingPlayerCount = proposal.incomingAssets.filter((asset) => asset.type === 'player').length;
  const incomingPickCount = proposal.incomingAssets.filter((asset) => asset.type === 'pick').length;
  const outgoingPlayerCount = proposal.outgoingAssets.filter((asset) => asset.type === 'player').length;
  const outgoingPickCount = proposal.outgoingAssets.filter((asset) => asset.type === 'pick').length;
  return `${outgoingPlayerCount}p-${outgoingPickCount}k:${incomingPlayerCount}p-${incomingPickCount}k`;
}

function dedupeTradeProposals(proposals, limit = 4, maxPerShape = Number.POSITIVE_INFINITY) {
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

function proposalHasAnyPicks(proposal) {
  return proposal?.outgoingAssets?.some((asset) => asset.type === 'pick')
    || proposal?.incomingAssets?.some((asset) => asset.type === 'pick');
}

function proposalHasOutgoingPicks(proposal) {
  return proposal?.outgoingAssets?.some((asset) => asset.type === 'pick');
}

function proposalHasIncomingPicks(proposal) {
  return proposal?.incomingAssets?.some((asset) => asset.type === 'pick');
}

function proposalIncomingPlayerCount(proposal) {
  return proposal?.incomingAssets?.filter((asset) => asset.type === 'player').length ?? 0;
}

function needDrivenProposalSortScore(proposal) {
  const incomingPlayers = proposalIncomingPlayerCount(proposal);
  const incomingPicks = proposalHasIncomingPicks(proposal);
  let score = (proposal?.plausibilityScore ?? 0) + ((proposal?.upgradeDelta ?? 0) * 0.35);

  if (incomingPicks && incomingPlayers === 1) score += 10;
  else if (incomingPicks) score += 5;

  if (!incomingPicks && incomingPlayers >= 3) score -= 8;
  else if (!incomingPicks && incomingPlayers === 2) score -= 4;

  return score;
}

function appendUniqueProposals(target, proposals) {
  const seen = new Set(target.map((proposal) => proposal.id));
  for (const proposal of proposals) {
    if (seen.has(proposal.id)) continue;
    seen.add(proposal.id);
    target.push(proposal);
  }
}

function selectNeedDrivenTradeProposals(
  proposals,
  limit = 12,
  maxPerShape = 2,
  minSinglePlayerWithIncomingPicks = 2,
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

function getSurplusReturnShape(proposal) {
  const incomingPlayerCount = proposal?.incomingAssets?.filter((asset) => asset.type === 'player').length ?? 0;
  const incomingPickCount = proposal?.incomingAssets?.filter((asset) => asset.type === 'pick').length ?? 0;
  if (incomingPlayerCount > 0 && incomingPickCount > 0) return 'mixed';
  if (incomingPlayerCount > 0) return 'players_only';
  if (incomingPickCount > 0) return 'picks_only';
  return 'other';
}

function selectSurplusTradeProposals(
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

function buildUpgradeFinderPackageCandidates({
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

function buildIncomingCompensationChoices({
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

export function buildRosterOpportunityLayer({
  league,
  rosters,
  players,
  seasonStats,
  weeklyStats,
  scoringSettings,
  scheduleMap,
  myRosterId = null,
  targetRosterIds = null,
  rankMap: precomputedRankMap = null,
}) {
  if (!league || !rosters?.length || !players || !seasonStats || !weeklyStats) {
    return {
      analysisWeek: getAnalysisWeek(league),
      analysesByRosterId: {},
      allAnalysesByRosterId: {},
      rosterAnalyses: [],
      rosterAnalysesById: {},
      benchmarkByPos: {},
      positionOrder: [],
      myRosterId,
      rosters: rosters ?? [],
      currentSeason: league?.season ?? null,
    };
  }

  const starterSlots = (league.roster_positions ?? [])
    .filter((slot) => !IGNORED_SLOTS.has(slot))
    .filter((slot) => getSlotEligiblePositions(slot).length > 0);

  const positionOrder = [...new Set(starterSlots.flatMap((slot) => getSlotEligiblePositions(slot)))];
  const rankMap = precomputedRankMap ?? computePositionalRanks(seasonStats, players, scoringSettings);
  const defenseTable = buildDefenseTable(weeklyStats, players, scheduleMap, scoringSettings);
  const analysisWeek = getAnalysisWeek(league);
  const availableByPos = buildAvailablePlayersByPos(rosters, players, seasonStats, weeklyStats, scoringSettings);

  const rosterAnalyses = rosters.map((roster) => {
    const rosterPlayers = buildRosterPlayers(roster, players, seasonStats, weeklyStats, scoringSettings, rankMap);
    const assignment = assignStarters(rosterPlayers, starterSlots);

    return {
      roster_id: roster.roster_id,
      owner_id: roster.owner_id,
      rosterPlayers,
      ...assignment,
    };
  });

  const benchmarkByPos = buildLeagueBenchmarks(rosterAnalyses, positionOrder);
  const myRosterAnalysis = rosterAnalyses.find((roster) => roster.roster_id === myRosterId) ?? null;
  const rosterAnalysesById = Object.fromEntries(
    rosterAnalyses.map((roster) => [roster.roster_id, roster]),
  );
  const analysesByRosterId = {};
  const allAnalysesByRosterId = {};
  const requestedIds = targetRosterIds?.length ? new Set(targetRosterIds.filter(Boolean)) : null;

  for (const roster of rosterAnalyses) {
    const isMyRoster = roster.roster_id === myRosterId;
    const cards = buildOpportunityCards(
      roster,
      benchmarkByPos,
      availableByPos,
      rosterAnalyses,
      myRosterAnalysis,
      isMyRoster,
      scheduleMap,
      defenseTable,
      weeklyStats,
      players,
      scoringSettings,
      analysisWeek,
    );

    const analysis = {
      rosterId: roster.roster_id,
      ownerId: roster.owner_id,
      cards,
      topNeeds: cards.slice(0, 3).map((card) => card.label),
      strengths: Object.keys(roster.benchByPos)
        .filter((pos) => (roster.benchByPos[pos] ?? []).some((player) => player.ppg > 0))
        .slice(0, 3)
        .map(getOpportunityPositionLabel),
    };

    allAnalysesByRosterId[roster.roster_id] = analysis;
    if (!requestedIds || requestedIds.has(roster.roster_id)) {
      analysesByRosterId[roster.roster_id] = analysis;
    }
  }

  return {
    analysisWeek,
    positionOrder,
    benchmarkByPos,
    rosterAnalyses,
    rosterAnalysesById,
    analysesByRosterId,
    allAnalysesByRosterId,
    myRosterId: myRosterAnalysis?.roster_id ?? myRosterId,
    rosters,
    currentSeason: league?.season ?? null,
  };
}

export function buildPartnerTradeIntelligence({
  opportunityLayer,
  selectedPartnerRosterId = null,
  rosterPicks = null,
  slots = null,
  currentSeason = null,
  pickValueMap = null,
  playerValueMap = null,
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
  );

  const tradeProposals = selectedPartnerAnalysis && myRosterAnalysis
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
  const surplusTradeProposals = selectedPartnerAnalysis && myRosterAnalysis
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

  return { analysesByRosterId, tradeProposals, surplusTradeProposals };
}

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
  currentSeason = null,
  pickValueMap = null,
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
            - (evaluation.postureDistance * 74),
          paymentType: packageCandidate.paymentType,
          partnerHasSurplus,
          context: buildProposalContext({
            myNeedCard: targetCard,
            partnerNeedCard: packageCandidate.partnerNeedCard,
            incomingAsset,
            incomingAssets: allIncomingAssets,
            outgoingAssets: packageCandidate.outgoingAssets,
            myRosterAnalysis,
            partnerAnalysis,
            benchmarkByPos: opportunityLayer.benchmarkByPos,
            playerValueMap,
          }),
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
  });

  return {
    analysisWeek: opportunityLayer.analysisWeek,
    analysesByRosterId,
    positionOrder: opportunityLayer.positionOrder,
    tradeProposals,
    surplusTradeProposals,
  };
}
