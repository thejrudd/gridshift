// ── Sleeper API ───────────────────────────────────────────────────────────────
// https://docs.sleeper.com

const BASE = 'https://api.sleeper.app/v1';

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`Sleeper API error: ${res.status} ${path}`);
  return res.json();
}

// ── Users ────────────────────────────────────────────────────────────────────

export function getUserByUsername(username) {
  return get(`/user/${encodeURIComponent(username)}`);
}

// ── Leagues ──────────────────────────────────────────────────────────────────

export function getLeaguesForUser(userId, season) {
  return get(`/user/${userId}/leagues/nfl/${season}`);
}

export function getLeague(leagueId) {
  return get(`/league/${leagueId}`);
}

export function getLeagueRosters(leagueId) {
  return get(`/league/${leagueId}/rosters`);
}

export function getLeagueUsers(leagueId) {
  return get(`/league/${leagueId}/users`);
}

export function getMatchups(leagueId, week) {
  return get(`/league/${leagueId}/matchups/${week}`);
}

export function getTradedPicks(leagueId) {
  return get(`/league/${leagueId}/traded_picks`);
}

export function getLeagueDrafts(leagueId) {
  return get(`/league/${leagueId}/drafts`);
}

// ── Players ──────────────────────────────────────────────────────────────────

// Cache in module scope — the players DB is ~5MB and rarely changes
let playersCache = null;

export async function getAllPlayers() {
  if (playersCache) return playersCache;
  playersCache = await get('/players/nfl');
  return playersCache;
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
 * Fetch per-player weekly stats for a full season.
 * Unlike the bulk endpoint, this per-player response includes game-time
 * metadata: opp, team, home, gp — making it reliable for defense table builds.
 * Returns an array or object of weekly stat entries.
 */
export function getPlayerSeasonStats(playerId, season) {
  return get(`/stats/nfl/player/${playerId}?season_type=regular&season=${season}&grouping=week`);
}


/**
 * Fetch all weekly stats for a season, weeks 1–totalWeeks.
 * Returns { [player_id]: Array<{ week, ...stats }> }
 * Calls onProgress(completedWeek, totalWeeks) after each week resolves.
 */
export async function getAllWeeklyStats(season, totalWeeks = 18, onProgress) {
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
        .catch(() => { /* skip failed weeks silently */ })
        .finally(() => {
          completed += 1;
          onProgress?.(completed, totalWeeks);
        })
    )
  );

  return byPlayer;
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
