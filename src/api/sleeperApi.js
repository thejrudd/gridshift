// ── Sleeper API ───────────────────────────────────────────────────────────────
// https://docs.sleeper.com

import { getSeasonStats, setSeasonStats } from '../utils/statsCache.js';
import { toWeekStatMap } from '../utils/sleeperWeekTeams.js';

const BASE = 'https://api.sleeper.app/v1';
const STATS_BASE = 'https://api.sleeper.com/stats/nfl';
const WEEK_FETCH_CONCURRENCY = 6;
let liveRequestCacheBustCounter = 0;

async function get(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) throw new Error(`Sleeper API error: ${res.status} ${path}`);
  return res.json();
}

function withCacheBust(path) {
  const separator = path.includes('?') ? '&' : '?';
  liveRequestCacheBustCounter += 1;
  return `${path}${separator}_gridshift=${Date.now()}-${liveRequestCacheBustCounter}`;
}

function getLive(path) {
  return get(withCacheBust(path), { cache: 'no-store' });
}

// ── Users ────────────────────────────────────────────────────────────────────

export function getUserByUsername(username) {
  return get(`/user/${encodeURIComponent(username)}`);
}

export function getUserById(userId) {
  return get(`/user/${encodeURIComponent(userId)}`);
}

// ── Leagues ──────────────────────────────────────────────────────────────────

export function getLeaguesForUser(userId, season) {
  return get(`/user/${userId}/leagues/nfl/${season}`);
}

export function getLeague(leagueId) {
  return get(`/league/${leagueId}`);
}

/**
 * Bypasses browser/intermediary caches for current league snapshots used by
 * historical reconciliation.
 */
export function getLiveLeague(leagueId) {
  return getLive(`/league/${leagueId}`);
}

export function getLeagueRosters(leagueId) {
  return getLive(`/league/${leagueId}/rosters`);
}

export function getLeagueUsers(leagueId) {
  return get(`/league/${leagueId}/users`);
}

export function getNflState() {
  return getLive('/state/nfl');
}

export function getMatchups(leagueId, week) {
  return get(`/league/${leagueId}/matchups/${week}`);
}

/**
 * Bypasses browser/intermediary caches for post-final score reconciliation.
 */
export function getLiveMatchups(leagueId, week) {
  return getLive(`/league/${leagueId}/matchups/${week}`);
}

export function getTransactions(leagueId, round) {
  return get(`/league/${leagueId}/transactions/${round}`);
}

export function getWinnersBracket(leagueId) {
  return get(`/league/${leagueId}/winners_bracket`);
}

export function getLosersBracket(leagueId) {
  return get(`/league/${leagueId}/losers_bracket`);
}

export function getTradedPicks(leagueId) {
  return get(`/league/${leagueId}/traded_picks`);
}

export function getLeagueDrafts(leagueId) {
  return getLive(`/league/${leagueId}/drafts`);
}

export function getDraft(draftId) {
  return getLive(`/draft/${draftId}`);
}

export function getDraftPicks(draftId) {
  return getLive(`/draft/${draftId}/picks`);
}

export function getDraftTradedPicks(draftId) {
  return getLive(`/draft/${draftId}/traded_picks`);
}

// ── Players ──────────────────────────────────────────────────────────────────

// The players DB is ~5MB and changes a few times a day. It is held in module
// scope, persisted in IndexedDB (statsCache.js store, key below) for a day,
// and served stale-while-revalidate: a stale copy answers at once while one
// background download replaces it; subscribePlayersUpdates() listeners (the
// Fantasy context) receive the fresh copy. Concurrent callers share one
// in-flight request.
export const PLAYERS_DB_CACHE_KEY = 'sleeper:players:nfl';
export const PLAYERS_DB_TTL = 24 * 60 * 60 * 1000;

let playersCache = null;
let playersCacheAt = 0;
let playersRequest = null;
let playersRevalidation = null;
const playersListeners = new Set();

/** Listen for a refreshed players DB replacing a stale one. Returns unsubscribe. */
export function subscribePlayersUpdates(listener) {
  playersListeners.add(listener);
  return () => playersListeners.delete(listener);
}

function downloadPlayers() {
  if (playersRevalidation) return playersRevalidation;
  playersRevalidation = get('/players/nfl')
    .then((data) => {
      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        const replaced = playersCache != null;
        playersCache = data;
        playersCacheAt = Date.now();
        void setSeasonStats(PLAYERS_DB_CACHE_KEY, { players: data });
        if (replaced) for (const listener of playersListeners) listener(data);
      }
      return data;
    })
    .finally(() => { playersRevalidation = null; });
  return playersRevalidation;
}

function revalidatePlayersIfStale() {
  if (Date.now() - playersCacheAt < PLAYERS_DB_TTL) return;
  downloadPlayers().catch(() => { /* keep the stale copy */ });
}

export function getAllPlayers() {
  if (playersCache) {
    revalidatePlayersIfStale();
    return Promise.resolve(playersCache);
  }
  if (playersRequest) return playersRequest;
  playersRequest = (async () => {
    const stored = await getSeasonStats(PLAYERS_DB_CACHE_KEY);
    if (!playersCache && stored?.players && Object.keys(stored.players).length > 0) {
      playersCache = stored.players;
      playersCacheAt = Number(stored.ts) || 0;
    }
    if (playersCache) {
      revalidatePlayersIfStale();
      return playersCache;
    }
    return downloadPlayers();
  })().finally(() => { playersRequest = null; });
  return playersRequest;
}

/** Test hook: forget the in-memory players DB and any in-flight request. */
export function resetPlayersCacheForTests() {
  playersCache = null;
  playersCacheAt = 0;
  playersRequest = null;
  playersRevalidation = null;
}

// ── Stats ────────────────────────────────────────────────────────────────────

/**
 * Fetch player stats for one week.
 * Returns { [player_id]: { stat_key: value, ... } }
 */
export function getWeeklyStats(season, week) {
  return get(`/stats/nfl/regular/${season}/${week}`);
}

/**
 * Fetch the current week's player stats without browser or intermediary cache
 * reuse. Live fantasy surfaces share this snapshot through SleeperContext.
 */
export function getLiveWeeklyStats(season, week) {
  return getLive(`/stats/nfl/regular/${season}/${week}`);
}

/**
 * Fetch per-player weekly stats for a full season.
 * Unlike the bulk endpoint, this per-player response includes game-time
 * metadata: opp, team, home, gp — making it reliable for defense table builds.
 * Returns an array or object of weekly stat entries.
 */
export function getPlayerSeasonStats(playerId, season) {
  return get(`/stats/nfl/player/${playerId}?season_type=regular&season=${season}&grouping=week`);
}

/**
 * Fetch the public Sleeper weekly projection snapshot. Unlike the player
 * directory, this endpoint carries the projected stat line for each player;
 * callers score that line against the connected league's settings.
 */
export function getWeeklyProjections(season, week, signal) {
  const params = new URLSearchParams({ season_type: 'regular' });
  return fetch(
    `https://api.sleeper.com/projections/nfl/${encodeURIComponent(season)}/${encodeURIComponent(week)}?${params}`,
    { signal, headers: { Accept: 'application/json' }, cache: 'no-store' },
  ).then((res) => {
    if (!res.ok) throw new Error(`Sleeper projection API error: ${res.status}`);
    return res.json();
  });
}


/**
 * Fetch all weekly stats for a season, weeks 1–totalWeeks.
 * Returns { [player_id]: Array<{ week, ...stats }> }
 * Calls onProgress(completedWeek, totalWeeks) after each week resolves.
 * Failed week numbers are pushed into `failedWeeks` when provided, so callers
 * can tell a complete package from one with silently-skipped weeks.
 */
export async function getAllWeeklyStats(season, totalWeeks = 18, onProgress, failedWeeks) {
  const weeks = Array.from({ length: totalWeeks }, (_, i) => i + 1);
  const byPlayer = {};
  let completed = 0;

  // Fetch all weeks in parallel, process as they settle
  await Promise.all(
    weeks.map(week =>
      getWeeklyStats(season, week)
        .then(statsMap => {
          if (!statsMap) return;
          for (const [playerId, stats] of Object.entries(statsMap)) {
            if (!byPlayer[playerId]) byPlayer[playerId] = [];
            byPlayer[playerId].push({ week, ...stats });
          }
        })
        .catch(() => { failedWeeks?.push(week); /* skip failed weeks silently */ })
        .finally(() => {
          completed += 1;
          onProgress?.(completed, totalWeeks);
        })
    )
  );

  return byPlayer;
}

/**
 * Fetch one week's stat rows with each player's game-time team and opponent
 * (api.sleeper.com). Same players and stat values as getWeeklyStats(), but
 * offensive and IDP rows also carry `team`, `opp` and `_teamSource`; see
 * src/utils/sleeperWeekTeams.js. Returns { [player_id]: { week, ...stats } }.
 */
export async function getWeeklyStatsWithTeams(season, week) {
  const params = new URLSearchParams({ season_type: 'regular' });
  const res = await fetch(
    `${STATS_BASE}/${encodeURIComponent(season)}/${encodeURIComponent(week)}?${params}`,
    // Revalidate (ETag) rather than reuse a browser-cached copy: the fetch
    // that marks a week final is its last, so it must be current.
    { headers: { Accept: 'application/json' }, cache: 'no-cache' },
  );
  if (!res.ok) throw new Error(`Sleeper stats API error: ${res.status}`);
  return toWeekStatMap(await res.json(), week);
}

/**
 * Fetch several weeks with getWeeklyStatsWithTeams, at most
 * WEEK_FETCH_CONCURRENCY at a time. Returns { [week]: { [player_id]: row } }
 * for the weeks that succeeded; failed week numbers go into `failedWeeks`.
 */
export async function getWeeksWithTeams(season, weeks, { onProgress, failedWeeks } = {}) {
  const list = [...(weeks ?? [])];
  const byWeek = {};
  let next = 0;
  let completed = 0;
  const worker = async () => {
    while (next < list.length) {
      const week = list[next++];
      try {
        byWeek[week] = await getWeeklyStatsWithTeams(season, week);
      } catch {
        failedWeeks?.push(week);
      } finally {
        completed += 1;
        onProgress?.(completed, list.length);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(WEEK_FETCH_CONCURRENCY, list.length) }, worker));
  return byWeek;
}

/**
 * Aggregate per-week stat arrays into season totals.
 * Input:  { [player_id]: Array<{ week, stat_key: value }> }
 * Output: { [player_id]: { stat_key: seasonTotal } }
 */
export function aggregateSeasonStats(weeklyStats) {
  const season = {};
  for (const [playerId, weeks] of Object.entries(weeklyStats)) {
    const totals = {};
    let inferredGamesPlayed = 0;
    for (const { week: _w, ...stats } of weeks) {
      const explicitGp = stats.gp ?? stats.games_played ?? stats.gamesPlayed;
      const numericGp = Number(explicitGp);
      const hasExplicitGp = explicitGp !== undefined && Number.isFinite(numericGp);
      if (hasExplicitGp) {
        inferredGamesPlayed += Math.max(0, numericGp);
      } else if (Object.entries(stats).some(([key, val]) => (
        key !== 'week'
        && !key.startsWith('_')
        && typeof val === 'number'
        && Math.abs(val) > 0
      ))) {
        inferredGamesPlayed += 1;
      }
      for (const [key, val] of Object.entries(stats)) {
        if (typeof val === 'number') {
          totals[key] = (totals[key] ?? 0) + val;
        }
      }
    }
    // Sleeper defensive weekly rows do not always include gp. Infer games only
    // from rows without explicit gp so inactive rows with gp: 0 stay excluded.
    const existingGamesPlayed = Number(totals.gp ?? totals.games_played ?? totals.gamesPlayed);
    if (inferredGamesPlayed > 0 || existingGamesPlayed > 0) {
      totals.gp = inferredGamesPlayed > 0 ? inferredGamesPlayed : existingGamesPlayed;
    }
    season[playerId] = totals;
  }
  return season;
}
