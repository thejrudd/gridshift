// Matchup forecast adapter. Fantasy Matchups owns its UI, but probability
// math remains in liveWinProbability so its pregame and live estimates use
// the same model as Fantasy Live.

import {
  computeSideOutlook,
  computeWinProbability,
  explainWinProbability,
  getStarterOutlook,
} from './liveWinProbability.js';
import { getFallbackRemainingGameFraction } from './liveScoringFeed.js';

const round1 = (value) => Math.round((Number(value) || 0) * 10) / 10;
const HISTORICAL_FINALITY_GRACE_MS = 6 * 60 * 60 * 1000;

function isExplicitlyFinalScheduleEntry(scheduleEntry) {
  if (scheduleEntry?.completed === true || scheduleEntry?.isFinal === true) return true;
  return [
    scheduleEntry?.status,
    scheduleEntry?.statusType,
    scheduleEntry?.state,
    scheduleEntry?.gameStatus,
  ].some((value) => /\b(?:final(?:ized)?|complete(?:d)?|post(?:-?game)?)\b/i.test(String(value ?? '')));
}

function hasPassedHistoricalFinalityGrace(scheduleEntry, now) {
  const status = [
    scheduleEntry?.status,
    scheduleEntry?.statusType,
    scheduleEntry?.state,
    scheduleEntry?.gameStatus,
  ].map((value) => String(value ?? '').toLowerCase()).join(' ');
  if (/postpon|suspend|cancel|scheduled|upcoming|pre[- ]?game|pregame|not started|live|progress|quarter|half|overtime/.test(status)) {
    return false;
  }
  const kickoff = Date.parse(String(scheduleEntry?.kickoff ?? ''));
  const observedAt = Number(now);
  return Number.isFinite(kickoff)
    && Number.isFinite(observedAt)
    && observedAt - kickoff >= HISTORICAL_FINALITY_GRACE_MS;
}

/**
 * A matchup can finish before the fantasy week does. Every non-bye starter
 * needs explicit final game metadata, or an old kickoff as a bounded fallback
 * for stale schedule metadata. A missing/partial schedule remains unresolved
 * unless the whole week's slate is officially final (`scheduleWeekFinal`);
 * the caller separately proves that the fantasy provider returned both final
 * team totals and every starter's official points before settling the result.
 */
export function hasFinalMatchupGameEvidence(
  players = [],
  { scheduleWeekComplete = false, scheduleWeekFinal = false, now = Date.now() } = {},
) {
  const starters = (players ?? []).filter((player) => player?.id && player?.name !== 'Empty');
  if (!starters.length) return false;
  // Every game of a complete schedule week is official, so no starter can
  // still be playing, even one with no schedule row of their own. Starters are
  // matched to games by their *current* NFL team, which a past-season lineup
  // often no longer has (free agents, retirees, players who moved).
  if (scheduleWeekFinal) return true;
  return starters.every((player) => (
    (scheduleWeekComplete && player?.isBye === true)
    || isExplicitlyFinalScheduleEntry(player?.scheduleEntry)
    || hasPassedHistoricalFinalityGrace(player?.scheduleEntry, now)
  ));
}

function hasUsableProjection(player) {
  return Number.isFinite(Number(player?.projection?.projected));
}

function resolveStarterState(player, now) {
  if (player?.isBye) return { state: 'confirmedBye', fraction: 0, settled: true };
  if (player?.scheduleEntry?.completed === true) return { state: 'officialFinal', fraction: 0, settled: true };
  if (player?.gameStarted) {
    return {
      state: hasUsableProjection(player) ? 'liveEstimate' : 'unresolved',
      fraction: getFallbackRemainingGameFraction({
        scheduleEntry: player?.scheduleEntry ?? null,
        currentPoints: player?.weekPts ?? null,
        now,
      }),
      settled: false,
    };
  }
  return {
    state: hasUsableProjection(player) ? 'scheduled' : 'unresolved',
    fraction: 1,
    settled: false,
  };
}

function buildSide(players, customPoints, now, { settledConfirmed = false, officialPoints = null } = {}) {
  const starters = (players ?? []).filter((player) => player?.id && player?.name !== 'Empty');
  const starterState = starters.map((player) => ({ player, ...resolveStarterState(player, now) }));
  const outlook = computeSideOutlook(starterState.map(({ player, state, fraction }) => getStarterOutlook({
    current: player.weekPts,
    position: player.position,
    projection: player.projection ?? null,
    fallbackAvg: player.avgPPG,
    fraction,
    playerId: player.id,
    playerName: player.name,
    state,
  })));
  const numericCustomPoints = Number(customPoints);
  const adjustedOutlook = Number.isFinite(numericCustomPoints) && numericCustomPoints !== 0
    ? { ...outlook, current: outlook.current + numericCustomPoints }
    : outlook;
  const numericOfficialPoints = officialPoints == null || officialPoints === '' ? null : Number(officialPoints);
  const finalOutlook = settledConfirmed
    ? {
        ...adjustedOutlook,
        current: Number.isFinite(numericOfficialPoints) ? numericOfficialPoints : adjustedOutlook.current,
        remainingProj: 0,
        remainingVar: 0,
        playersRemaining: 0,
        unresolvedPlayers: 0,
        keyMovers: [],
        outlooks: adjustedOutlook.outlooks.map((entry) => ({
          ...entry,
          expectedAtNow: entry.current,
          paceDelta: 0,
          baseRemaining: 0,
          paceCarryover: 0,
          remainingProj: 0,
          remainingVar: 0,
          fraction: 0,
          state: 'officialFinal',
        })),
      }
    : adjustedOutlook;
  const projectedStarters = starterState.filter(({ player }) => hasUsableProjection(player));
  const sources = [...new Set(projectedStarters
    .map(({ player }) => player.projection?.factors?.source)
    .filter(Boolean))];
  const projectionCollectionTimes = projectedStarters
    .filter(({ player }) => ['balldontlie', 'sleeper'].includes(player.projection?.factors?.source))
    .map(({ player }) => Date.parse(player.projection?.factors?.providerCollectedAt ?? ''))
    .filter(Number.isFinite);

  return {
    outlook: finalOutlook,
    starterCount: starters.length,
    explicitProjectionCount: projectedStarters.length,
    unresolvedCount: starterState.filter(({ state }) => state === 'unresolved').length,
    allSettled: Boolean(settledConfirmed) || (starterState.length > 0 && starterState.every(({ settled }) => settled)),
    anyStarted: starterState.some(({ state }) => state === 'liveEstimate' || state === 'officialFinal'),
    sources,
    // Use the oldest external projection row as the freshness signal, which is
    // the honest bound when a lineup is assembled from independently collected rows.
    providerCollectedAt: projectionCollectionTimes.length ? new Date(Math.min(...projectionCollectionTimes)).toISOString() : null,
    usesLeagueScoring: projectedStarters.some(({ player }) => (
      player.projection?.factors?.scoringSource === 'gridshift-custom-scoring'
    )),
  };
}

/**
 * Builds a Matchup-ready view model around the canonical Fantasy Live
 * probability engine. Missing player projections still receive that engine's
 * season-average/position-default fallback, whose larger variance naturally
 * lowers certainty; the returned completeness fields make this visible.
 */
export function buildMatchupWinProbability({
  myPlayers = [],
  opponentPlayers = [],
  myCustomPoints = 0,
  opponentCustomPoints = 0,
  settledConfirmed = false,
  officialPoints = null,
  now = Date.now(),
} = {}) {
  const mine = buildSide(myPlayers, myCustomPoints, now, {
    settledConfirmed,
    officialPoints: officialPoints?.mine,
  });
  const opponent = buildSide(opponentPlayers, opponentCustomPoints, now, {
    settledConfirmed,
    officialPoints: officialPoints?.opponent,
  });
  if (!mine.starterCount || !opponent.starterCount) return null;

  const result = computeWinProbability(mine.outlook, opponent.outlook, {
    // A zero remaining-game count is only a state hint. The caller must pair
    // it with authoritative fantasy totals before exact certainty is allowed.
    settledConfirmed: Boolean(settledConfirmed),
  });
  const explanation = explainWinProbability(result, mine.outlook, opponent.outlook);
  const projectedCount = mine.explicitProjectionCount + opponent.explicitProjectionCount;
  const starterCount = mine.starterCount + opponent.starterCount;
  const unresolvedCount = mine.unresolvedCount + opponent.unresolvedCount;
  const allSources = [...new Set([...mine.sources, ...opponent.sources])];
  const primarySource = allSources.length === 1 ? allSources[0] : allSources.length > 1 ? 'mixed' : null;
  const providerCollectionTimes = [mine.providerCollectedAt, opponent.providerCollectedAt]
    .map((value) => Date.parse(value ?? ''))
    .filter(Number.isFinite);
  const live = mine.anyStarted || opponent.anyStarted;

  return {
    ...result,
    explanation,
    mine,
    opponent,
    mode: result.settled ? 'final' : live ? 'live' : 'pregame',
    projectedCount,
    starterCount,
    unresolvedCount,
    complete: projectedCount === starterCount && unresolvedCount === 0,
    primarySource,
    sources: allSources,
    providerCollectedAt: providerCollectionTimes.length
      ? new Date(Math.min(...providerCollectionTimes)).toISOString()
      : null,
    usesLeagueScoring: mine.usesLeagueScoring || opponent.usesLeagueScoring,
    expectedA: round1(result.expectedA),
    expectedB: round1(result.expectedB),
  };
}
