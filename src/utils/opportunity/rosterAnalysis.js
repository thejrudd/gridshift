import { calcPointsFromTotals, getRecentAvg } from '../scoringEngine';
import { buildDefenseTable, computePositionalRanks, getAvgPPG } from '../projectionEngine';
import {
  IGNORED_SLOTS,
  getOpportunityPositionLabel,
  getSlotEligiblePositions,
  normalizeOpportunityPos,
  supportsWaiverOpportunity,
} from './opportunityPositions';
import { average, comparePlayers, getRosterPlayerIds, percentile, toFixedNumber } from './opportunityShared';
import { buildOpportunityCards } from './opportunityCards';

export function getAnalysisWeek(league) {
  const playoffStart = league?.settings?.playoff_week_start ?? 18;
  const lastScored = league?.settings?.last_scored_leg;
  if (lastScored) return Math.min(lastScored + 1, playoffStart - 1);
  return Math.max(1, playoffStart - 1);
}

export function buildRosterPlayers(roster, players, seasonStats, weeklyStats, scoringSettings, rankMap) {
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

export function assignStarters(rosterPlayers, starterSlots) {
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

export function buildLeagueBenchmarks(rosterAnalyses, positions) {
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

export function buildAvailablePlayersByPos(rosters, players, seasonStats, weeklyStats, scoringSettings) {
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
    if (!supportsWaiverOpportunity(normPos)) continue;

    const seasonPts = calcPointsFromTotals(stats, scoringSettings, player.position);
    if (seasonPts <= 0) continue;

    const gamesPlayed = Number(stats.gp ?? stats.games_played ?? stats.games ?? 0)
      || (weeklyStats?.[id]?.length ?? 0)
      || 1;
    const candidate = {
      id,
      name: player.full_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim(),
      position: player.position,
      normPos,
      team: player.team ?? 'FA',
      seasonPts,
      ppg: toFixedNumber(seasonPts / gamesPlayed, 1),
      recentAvg: 0,
    };

    const currentBest = availableByPos[normPos]?.[0] ?? null;
    if (!currentBest || comparePlayers(candidate, currentBest) < 0) {
      availableByPos[normPos] = [candidate];
    }
  }

  return availableByPos;
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
  const defenseTable = scheduleMap
    ? buildDefenseTable(weeklyStats, players, scheduleMap, scoringSettings)
    : null;
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
  const rosterAnalysesById = Object.fromEntries(rosterAnalyses.map((roster) => [roster.roster_id, roster]));
  const requestedIds = targetRosterIds?.length ? new Set(targetRosterIds.filter(Boolean)) : null;

  const analysesByRosterId = {};
  const allAnalysesByRosterId = {};

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
