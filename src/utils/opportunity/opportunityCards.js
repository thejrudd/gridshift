import { getDefenseStrength, getLeagueAvgPPG } from '../projectionEngine';
import { getOpportunityPositionLabel, supportsWaiverOpportunity } from './opportunityPositions';
import { average, comparePlayers, getBestBackup, toFixedNumber } from './opportunityShared';

export function getUpcomingPressure(starters, scheduleMap, defenseTable, weeklyStats, players, scoringSettings, analysisWeek) {
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

export function getByePressure(starters, analysisWeek) {
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

export function getSurplusPositions(myRosterAnalysis) {
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

export function findOfferCandidates(position, myRosterAnalysis) {
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

export function buildOpportunityCards(
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
