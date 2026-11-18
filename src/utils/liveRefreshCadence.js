// How often the Matchups live layer refreshes its snapshot (games, player
// stats, Sleeper matchup points). Fast only while a game that matters to the
// matchup is live or about to kick off; otherwise a slow keep-alive. The page
// pauses entirely while hidden or offline (visiblePolling.js). Rules:
// docs/Fantasy Live.md (Polling).
import { getTeamAbbr, isFinalGame, isLiveGame } from './liveScoringFeed.js';

/** Slow keep-alive when no matchup game is live or near kickoff. */
export const LIVE_IDLE_REFRESH_MS = 180_000;
/**
 * Fast polling starts this long before a matchup game's kickoff. At least the
 * idle interval, so an idle tick always lands inside the window before the
 * game starts and no separate wake-up timer is needed.
 */
export const LIVE_KICKOFF_LEAD_MS = 15 * 60_000;
/**
 * A non-final game keeps fast polling this long after its kickoff even when
 * the provider has not flipped it to in progress yet (a late start, a weather
 * delay), so the first live snapshot is never minutes late.
 */
export const LIVE_KICKOFF_TAIL_MS = 4.5 * 60 * 60_000;

export const LIVE_CADENCE = Object.freeze({
  PAUSED: 'paused',
  LOADING: 'loading',
  LIVE: 'live',
  KICKOFF: 'kickoff',
  IDLE: 'idle',
});

function getRelevantGames(games, teams) {
  if (!teams || !teams.size) return [];
  return (games ?? []).filter((game) => (
    teams.has(getTeamAbbr(game?.visitor_team)) || teams.has(getTeamAbbr(game?.home_team))
  ));
}

function isNearKickoff(game, now) {
  if (isFinalGame(game)) return false;
  const kickoff = Date.parse(game?.date ?? '');
  if (!Number.isFinite(kickoff)) return false;
  return now >= kickoff - LIVE_KICKOFF_LEAD_MS && now <= kickoff + LIVE_KICKOFF_TAIL_MS;
}

/**
 * @param {object} options
 * @param {Array} options.games  This feed's game list (BALLDONTLIE shape).
 * @param {Set<string>} options.teams  NFL teams of the matchup's starters.
 * @param {number} options.fastMs  The tier's live cadence (5s paid, 60s free).
 * @param {boolean} [options.loaded]  False until this context's games arrive.
 * @param {boolean} [options.errored]  The last snapshot failed.
 * @param {boolean} [options.always]  Keep the fast cadence (dev sandbox).
 * @param {boolean} [options.active]  Page visible and online.
 * @returns {{ mode: string, delayMs: number|null }}
 */
export function getMatchupLiveCadence({
  games = [],
  teams = null,
  fastMs,
  loaded = true,
  errored = false,
  always = false,
  active = true,
  now = Date.now(),
} = {}) {
  if (!active) return { mode: LIVE_CADENCE.PAUSED, delayMs: null };
  const fast = Number.isFinite(Number(fastMs)) && Number(fastMs) > 0 ? Number(fastMs) : 5000;
  const idle = Math.max(fast, LIVE_IDLE_REFRESH_MS);
  if (always) return { mode: LIVE_CADENCE.LIVE, delayMs: fast };
  // Until this context's games arrive (or after a failed snapshot) retry at
  // the fast cadence rather than waiting minutes for the next idle tick.
  if (!loaded || errored) return { mode: LIVE_CADENCE.LOADING, delayMs: fast };
  const relevant = getRelevantGames(games, teams);
  if (relevant.some((game) => isLiveGame(game))) return { mode: LIVE_CADENCE.LIVE, delayMs: fast };
  if (relevant.some((game) => isNearKickoff(game, now))) return { mode: LIVE_CADENCE.KICKOFF, delayMs: fast };
  return { mode: LIVE_CADENCE.IDLE, delayMs: idle };
}

/** Structural equality for JSON-shaped payloads (plain objects, arrays, primitives). */
export function isDeepEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!isDeepEqual(left[index], right[index])) return false;
    }
    return true;
  }
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key) || !isDeepEqual(left[key], right[key])) return false;
  }
  return true;
}
