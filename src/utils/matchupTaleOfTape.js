import { calcPoints, calcPointsFromTotals } from './scoringEngine.js';
import { resolveStarterProjection } from './liveWinProbability.js';
import { isCompleteScheduleWeek } from './liveScoringFeed.js';

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 1) {
  const number = numberOrNull(value);
  if (number == null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function buildWeeklyScores(player, scoringSettings, beforeWeek) {
  return (player?.weekly ?? [])
    .map((entry) => ({
      week: numberOrNull(entry?.week),
      points: round(calcPoints(entry, scoringSettings, player?.position), 2),
    }))
    .filter((entry) => entry.week != null && entry.week < beforeWeek)
    .sort((left, right) => left.week - right.week);
}

function getRankLabel(rank) {
  if (!rank?.rank) return null;
  return `${rank.posLabel ?? rank.position ?? ''}${rank.rank}`;
}

function isFinalScheduleEntry(scheduleEntry) {
  if (scheduleEntry?.completed === true || scheduleEntry?.isFinal === true) return true;
  if (scheduleEntry?.completed === false || scheduleEntry?.isFinal === false) return false;
  const status = [
    scheduleEntry?.status,
    scheduleEntry?.statusType,
    scheduleEntry?.state,
    scheduleEntry?.gameStatus,
  ].map((value) => String(value ?? '').toLowerCase()).join(' ');
  if (/\b(?:final(?:ized)?|complete(?:d)?|post(?:-?game)?)\b/.test(status)) return true;
  return false;
}

/**
 * A weekly positional rank is only meaningful after the entire NFL slate has
 * settled. Missing or partial completion metadata stays unavailable instead
 * of inferring finality from elapsed kickoff time.
 */
export function isFullGameWeekComplete(scheduleWeek) {
  if (!isCompleteScheduleWeek(scheduleWeek)) return false;
  const entries = Object.values(scheduleWeek ?? {});
  return entries.length > 0 && entries.every((entry) => isFinalScheduleEntry(entry));
}

/**
 * Builds the fantasy-facing data used by the Matchup position-chip comparison.
 * The shape intentionally stays independent from React so it can be checked
 * without rendering the full Companion view.
 */
export function buildTaleOfTapePlayer({
  player,
  seasonStats = null,
  scoringSettings = null,
  beforeWeek = Infinity,
  week = null,
  weeklyFormAvailable = false,
} = {}) {
  if (!player?.id || player.name === 'Empty') return null;

  const weeklyScores = buildWeeklyScores(player, scoringSettings, Number(beforeWeek));
  const weekKey = numberOrNull(week);
  const currentWeekEntry = weekKey == null
    ? null
    : (player?.weekly ?? []).find((entry) => numberOrNull(entry?.week) === weekKey) ?? null;
  const currentWeekPoints = currentWeekEntry
    ? round(calcPoints(currentWeekEntry, scoringSettings, player?.position), 2)
    : null;
  const seasonTotals = seasonStats?.[player.id] ?? null;
  const weeklyTotal = weeklyScores.reduce((total, entry) => total + (entry.points ?? 0), 0);
  const hasSeasonSample = Number(seasonTotals?.gp) > 0 || weeklyScores.length > 0;
  const seasonPoints = hasSeasonSample
    ? seasonTotals
      ? calcPointsFromTotals(seasonTotals, scoringSettings, player.position)
      : weeklyTotal
    : null;
  const recentScores = weeklyScores.slice(-4).map((entry) => entry.points).filter((value) => value != null);
  const recentAverage = recentScores.length
    ? recentScores.reduce((total, value) => total + value, 0) / recentScores.length
    : null;
  const scoreValues = weeklyScores.map((entry) => entry.points).filter((value) => value != null);
  const forecast = resolveStarterProjection({
    position: player.position,
    projection: player.projection ?? null,
    fallbackAvg: player.avgPPG,
  });

  return {
    id: String(player.id),
    name: player.name,
    position: player.position,
    team: player.team,
    player,
    currentPoints: player.gameStarted ? numberOrNull(player.weekPts) : null,
    forecast: round(forecast.projected),
    forecastSource: forecast.source,
    seasonPoints: round(seasonPoints, 2),
    seasonAverage: round(player.avgPPG),
    recentAverage: round(recentAverage),
    seasonHigh: scoreValues.length ? round(Math.max(...scoreValues), 2) : null,
    seasonLow: scoreValues.length ? round(Math.min(...scoreValues), 2) : null,
    gamesPlayed: numberOrNull(seasonTotals?.gp) ?? (weeklyScores.length || null),
    seasonRank: getRankLabel(player.rank),
    seasonRankNumber: numberOrNull(player.rank?.rank),
    weeklyPoints: weeklyFormAvailable
      ? currentWeekPoints ?? (player.gameStarted ? numberOrNull(player.weekPts) : null)
      : null,
    weeklyRank: weeklyFormAvailable ? getRankLabel(player.weekRank) : null,
    weeklyRankNumber: weeklyFormAvailable ? numberOrNull(player.weekRank?.rank) : null,
    weeklyScores: weeklyScores.slice(-4).reverse(),
  };
}

export function findTaleOfTapeRivalry(model, leftManagerId, rightManagerId) {
  const leftId = leftManagerId == null ? null : String(leftManagerId);
  const rightId = rightManagerId == null ? null : String(rightManagerId);
  if (!leftId || !rightId || leftId === rightId) return null;
  const rivalryId = [leftId, rightId].sort().join(':');
  const rivalry = (model?.rivalries ?? []).find((item) => item.id === rivalryId);
  if (!rivalry) return null;
  return {
    games: rivalry.games,
    ties: rivalry.ties,
    leftWins: rivalry.winsByParticipantId?.[leftId] ?? 0,
    rightWins: rivalry.winsByParticipantId?.[rightId] ?? 0,
  };
}
