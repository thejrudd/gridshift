import { getPositionNeedScore } from './rosterNeed.js';

function round(value) {
  return Math.round(value * 100) / 100;
}

function getBoardBoost(boardRank) {
  if (boardRank == null) return 0;
  return Math.max(0, 1.35 - (boardRank - 1) * 0.14);
}

function getMarketRankScore(rank) {
  if (rank == null) return 0;
  const normalizedRank = Math.max(1, Number(rank));
  if (!Number.isFinite(normalizedRank)) return 0;
  return Math.max(0, (350 - normalizedRank) / 35);
}

function formatRank(rank) {
  return Number.isInteger(rank) ? String(rank) : rank.toFixed(1);
}

function buildWhyLine({ boardRank, teamNeed, projectedPoints, fallbackRank, fallbackLabel, workload, schedule, modelScore }) {
  const reasons = [];
  if (modelScore != null) reasons.push(`${modelScore.toFixed(1)} Draft Rating`);
  if (workload?.ppg != null) reasons.push(`${workload.ppg.toFixed(1)} past PPG`);
  else if (projectedPoints != null) reasons.push(`${projectedPoints.toFixed(1)} projected pts in your scoring`);
  else if (fallbackRank != null) {
    const rankLabel = fallbackLabel ?? 'Sleeper search rank';
    reasons.push(`${rankLabel} #${formatRank(fallbackRank)}`);
  }
  if (workload?.recentPpg && workload?.ppg && workload.recentPpg > workload.ppg + 1) reasons.push('recent usage is up');
  if (schedule?.label === 'Favorable') reasons.push('favorable schedule context');
  if (boardRank != null) reasons.push(`ranked #${boardRank} on your board`);
  if (teamNeed > 0.65) reasons.push('fills an open starter need');
  return reasons.slice(0, 3).join(' • ');
}

export function rankDraftCandidates({
  candidates = [],
  boardIndex = new Map(),
  myNeedProfile = null,
  picksUntilUser = 0,
}) {
  const ranked = candidates.map((candidate) => {
    const boardRank = boardIndex.get(candidate.id) ?? null;
    const teamNeed = getPositionNeedScore(myNeedProfile, candidate.position);
    const projectedPoints = candidate.projection?.projectedPoints ?? null;
    const fallbackRank = candidate.projection?.fallbackRank ?? null;
    const fallbackLabel = candidate.projection?.fallbackLabel ?? null;
    const draftModel = candidate.draftModel ?? null;
    const modelScore = draftModel?.score ?? null;

    const score = round(
      (modelScore != null ? modelScore / 10 : (projectedPoints != null ? projectedPoints / 15 : getMarketRankScore(fallbackRank)))
      + getBoardBoost(boardRank)
      + (teamNeed * 1.15)
    );

    return {
      ...candidate,
      boardRank,
      teamNeed,
      draftModel,
      recommendationScore: score,
      draftRoom: {
        ...(candidate.draftRoom ?? {}),
        boardRank,
        teamNeed,
        recommendationScore: score,
        modelScore,
        picksUntilUser,
      },
      why: buildWhyLine({
        boardRank,
        teamNeed,
        projectedPoints,
        fallbackRank,
        fallbackLabel,
        workload: candidate.workload,
        schedule: candidate.schedule,
        modelScore,
      }),
    };
  });

  return ranked.sort((a, b) => {
    if (a.recommendationScore !== b.recommendationScore) return b.recommendationScore - a.recommendationScore;
    const aProjected = a.projection?.projectedPoints ?? -Infinity;
    const bProjected = b.projection?.projectedPoints ?? -Infinity;
    if (aProjected !== bProjected) return bProjected - aProjected;
    const aRank = a.projection?.fallbackRank ?? Infinity;
    const bRank = b.projection?.fallbackRank ?? Infinity;
    if (aRank !== bRank) return aRank - bRank;
    return String(a.name ?? '').localeCompare(String(b.name ?? ''));
  });
}
