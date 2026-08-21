// Live data source for the Fantasy Live sandbox.
//
// Fetches the replayed week's real games, box scores, and play-by-play through
// the normal server routes exactly once, then serves time-sliced views of that
// data based on the replay clock. Because the slicing happens at the API
// boundary, every downstream code path — stat index, scoring, delta feed, pace
// chart, win probability — runs completely unmodified.

import {
  getLiveGamePlays as fetchLiveGamePlays,
  getLiveGames as fetchLiveGames,
  getLivePlayerStatsForGames as fetchLivePlayerStats,
} from '../../api/liveApi';
import { getClockState } from './liveSandboxClock';
import {
  getGameProgress,
  getReplayInstant,
  getSlateProgressForGameProgress,
  projectGamesAtProgress,
  projectStatsAtProgress,
} from './liveSandboxReplay';

// The completed week is immutable, so one fetch per resource is enough for the
// whole session no matter how often the clock is scrubbed.
const cache = {
  games: null,
  gamesPromise: null,
  stats: new Map(),
  statsPromises: new Map(),
  plays: new Map(),
  playsPromises: new Map(),
  playsRetryAt: new Map(),
};

// The live routes are rate limited per client. Warming the play cache needs one
// request per game, so a failed fetch must wait before trying again — retrying
// on every clock tick would hold the limiter open and never recover.
const PLAYS_RETRY_COOLDOWN_MS = 8000;

function currentProgress() {
  return getClockState().progress;
}

async function loadFinalGames(season, week) {
  if (cache.games) return cache.games;
  cache.gamesPromise ??= fetchLiveGames({ season, week }).then((payload) => {
    cache.games = Array.isArray(payload?.data) ? payload.data : [];
    return cache.games;
  }).catch((error) => {
    cache.gamesPromise = null;
    throw error;
  });
  return cache.gamesPromise;
}

async function loadFinalStats(gameIds) {
  const missing = gameIds.filter((id) => !cache.stats.has(String(id)) && !cache.statsPromises.has(String(id)));
  if (missing.length) {
    const promise = fetchLivePlayerStats(missing).then((payload) => {
      const grouped = payload?.games && typeof payload.games === 'object' ? payload.games : {};
      missing.forEach((id) => cache.stats.set(String(id), grouped[String(id)] ?? []));
      return grouped;
    }).catch((error) => {
      missing.forEach((id) => cache.statsPromises.delete(String(id)));
      throw error;
    });
    missing.forEach((id) => cache.statsPromises.set(String(id), promise));
  }
  await Promise.all(gameIds.map((id) => cache.statsPromises.get(String(id))).filter(Boolean));
  return Object.fromEntries(gameIds.map((id) => [String(id), cache.stats.get(String(id)) ?? []]));
}

export async function getLiveGames({ season, week } = {}) {
  const games = await loadFinalGames(season, week);
  return {
    data: projectGamesAtProgress(games, currentProgress()),
    cache: { source: 'live-sandbox', replayProgress: currentProgress() },
  };
}

export async function getLivePlayerStatsForGames(gameIds = []) {
  const games = cache.games ?? [];
  const finalStats = await loadFinalStats(gameIds);
  return { games: projectStatsAtProgress(finalStats, games, currentProgress()) };
}

export async function getLiveGamePlays(gameId, options) {
  const key = String(gameId);
  if (!cache.plays.has(key) && !cache.playsPromises.has(key)) {
    const retryAt = cache.playsRetryAt.get(key) ?? 0;
    // Still cooling down from a rejected request. Report an empty slate rather
    // than queueing another one; a later tick will pick it up.
    if (Date.now() < retryAt) return { data: [] };
    cache.playsPromises.set(key, fetchLiveGamePlays(gameId, options).then((payload) => {
      cache.plays.set(key, payload);
      cache.playsRetryAt.delete(key);
      return payload;
    }).catch((error) => {
      cache.playsPromises.delete(key);
      cache.playsRetryAt.set(key, Date.now() + PLAYS_RETRY_COOLDOWN_MS);
      throw error;
    }));
  }
  let payload = null;
  try {
    payload = cache.plays.get(key) ?? await cache.playsPromises.get(key);
  } catch {
    // A rate-limited or failed game simply has no plays yet this tick.
    return { data: [] };
  }
  const plays = Array.isArray(payload?.data) ? payload.data : [];

  const game = (cache.games ?? []).find((entry) => String(entry.id) === key);
  const progress = game
    ? getGameProgress(game, getReplayInstant(cache.games ?? [], currentProgress()))
    : currentProgress();

  // Play-by-play is already chronological, so the leading slice is exactly the
  // set of plays that had happened by this point in the game.
  return { ...payload, data: plays.slice(0, Math.floor(plays.length * progress)) };
}

export function resetSandboxCache() {
  cache.games = null;
  cache.gamesPromise = null;
  cache.stats.clear();
  cache.statsPromises.clear();
  cache.plays.clear();
  cache.playsPromises.clear();
  cache.playsRetryAt.clear();
}

// Lets the sandbox panel describe the current replay instant without
// triggering a fetch of its own.
export function getCachedGames() {
  return cache.games ?? [];
}

// Exact replay progress for one game at the current clock position.
//
// The live view normally infers this from a game's status and clock, which is
// coarse at the edges: a scheduled game reports 0 and a final game reports 1.
// During a replay that collapses every stat delta onto those two x positions,
// drawing vertical walls at kickoff and at the current moment. The sandbox
// knows the real value, so it supplies it directly.
export function getReplayGameProgress(gameId) {
  const games = cache.games ?? [];
  const game = games.find((entry) => String(entry.id) === String(gameId));
  if (!game) return null;
  return getGameProgress(game, getReplayInstant(games, currentProgress()));
}

// Preseason mode reads live data straight from the real routes; it only needs
// the request scoped to the preseason, since preseason and regular-season weeks
// share numbering and an unscoped week returns both.
export function getPreseasonLiveGames(args = {}) {
  return fetchLiveGames({ ...args, seasonType: 'pre' });
}

// The real instant a slate position corresponds to. Feed events are stamped
// with this instead of the wall clock so that ordering them by time matches
// ordering them by position on the chart.
export function getReplayInstantAt(progress) {
  return getReplayInstant(cache.games ?? [], progress);
}

// A position inside one game, expressed on the shared slate axis.
export function toSlateProgress(gameId, gameProgress) {
  return getSlateProgressForGameProgress(cache.games ?? [], gameId, gameProgress);
}
