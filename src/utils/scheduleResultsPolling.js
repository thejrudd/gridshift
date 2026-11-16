// Refresh rules for the app-wide season schedule results
// (useSeasonScheduleResults.js): a settled week is fetched once and kept on
// this device; only weeks still holding an unfinished game are polled, fast
// only around their games' kickoff windows.
import { NFL_SEASON_PHASES, normalizeEspnScoreboardEvent } from './espnNflScoreboard.js';

export const SCHEDULE_LIVE_REFRESH_MS = 60_000;
/** Polling starts this long before an unfinished game's kickoff. */
export const SCHEDULE_KICKOFF_LEAD_MS = 15 * 60_000;
/** An unfinished game keeps the fast poll this long after kickoff. */
export const SCHEDULE_GAME_WINDOW_MS = 4.5 * 60 * 60_000;
/** Keep-alive for an unsettled week outside any game window (a result the
 * scoreboard has not published yet, a postponed game). */
export const SCHEDULE_UNSETTLED_KEEPALIVE_MS = 30 * 60_000;
/** Longest wait for the next week's first kickoff before re-checking. */
export const SCHEDULE_IDLE_MAX_MS = 6 * 60 * 60_000;

function kickoffMs(game) {
  const parsed = typeof game?.kickoff === 'string' ? Date.parse(game.kickoff) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Milliseconds until the next results request, from the hydrated schedule.
 * Null when nothing will ever need refreshing (no unfinished game left).
 */
export function getScheduleResultsRefreshMs(schedule, now = Date.now()) {
  let nextWindowStart = null;
  let hasUnfinishedStarted = false;
  for (const week of schedule?.weeks ?? []) {
    for (const game of week?.games ?? []) {
      if (game?.completed === true) continue;
      const kickoff = kickoffMs(game);
      if (kickoff == null) continue;
      const windowStart = kickoff - SCHEDULE_KICKOFF_LEAD_MS;
      if (now >= windowStart && now <= kickoff + SCHEDULE_GAME_WINDOW_MS) return SCHEDULE_LIVE_REFRESH_MS;
      if (kickoff <= now) hasUnfinishedStarted = true;
      else if (nextWindowStart == null || windowStart < nextWindowStart) nextWindowStart = windowStart;
    }
  }
  const untilNext = nextWindowStart == null ? null : Math.max(SCHEDULE_LIVE_REFRESH_MS, nextWindowStart - now);
  if (hasUnfinishedStarted) {
    return Math.min(SCHEDULE_UNSETTLED_KEEPALIVE_MS, untilNext ?? SCHEDULE_UNSETTLED_KEEPALIVE_MS);
  }
  return untilNext == null ? null : Math.min(SCHEDULE_IDLE_MAX_MS, untilNext);
}

/**
 * A week's scoreboard may be stored for good once every game in it is final
 * and it covers every game the schedule lists for that week.
 */
export function isSettledScheduleScoreboard(scoreboard, expectedGames = 0) {
  const events = Array.isArray(scoreboard?.events) ? scoreboard.events : [];
  if (!events.length || events.length < expectedGames) return false;
  return events.every((event) => (
    normalizeEspnScoreboardEvent(event, { phase: NFL_SEASON_PHASES.REGULAR })?.status === 'final'
  ));
}

/** The result fields the schedule merge reads, so an unchanged poll is skipped. */
export function getScheduleScoreboardFingerprint(scoreboard) {
  return (scoreboard?.events ?? []).map((event) => {
    const normalized = normalizeEspnScoreboardEvent(event, { phase: NFL_SEASON_PHASES.REGULAR });
    return normalized
      ? [normalized.espnEventId, normalized.awayTeam, normalized.homeTeam, normalized.status, normalized.statusLabel, normalized.awayScore, normalized.homeScore].join(':')
      : '';
  }).join('|');
}
