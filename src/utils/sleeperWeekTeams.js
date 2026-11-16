// sleeperWeekTeams.js — Sleeper weekly stat rows with the player's game-time
// team, and the incremental season package built from them.
//
// Sleeper's api.sleeper.com/stats/nfl/{season}/{week} rows carry the team a
// player actually played for that week and his opponent, so a traded player's
// old weeks stay on his old team and a bye week simply has no row. These rows
// replace the per-player ESPN eventlog lookup the Fantasy stats pass used to
// run. Pure: no fetching or storage.

// Positions whose weekly rows get a game-time team, the same set the ESPN
// eventlog pass covered. Team defenses, punters, linemen and TEAM_ rows keep
// their bare stat line so their row shape is unchanged.
export const TEAM_BY_WEEK_POSITIONS = new Set([
  'QB', 'RB', 'WR', 'TE', 'K',
  'DL', 'DE', 'DT', 'LB', 'ILB', 'OLB', 'DB', 'CB', 'S', 'SS', 'FS',
]);

// Legacy value: heatmap, defense rankings and the projection engine read
// `_teamSource === 'espn'` as "this row's team is the confirmed game-time
// team". Sleeper rows now provide that confirmation; the value is kept so
// those readers keep the same meaning without a rename.
export const GAME_TIME_TEAM_SOURCE = 'espn';
export const SCHEDULE_TEAM_SOURCE = 'schedule';

const REGULAR_SEASON_WEEKS = 18;

const upper = (value) => (value ? String(value).toUpperCase() : null);

/**
 * One api.sleeper.com weekly row → the weekly stat entry Fantasy stores:
 * `{ week, ...stats }`, plus `team`, `opp` and `_teamSource` for the positions
 * above. The nested player object, dates and game ids are dropped.
 */
export function toWeeklyStatRow(row, week) {
  const entry = { week: Number(week), ...(row?.stats ?? {}) };
  const team = upper(row?.team);
  if (team && TEAM_BY_WEEK_POSITIONS.has(row?.player?.position)) {
    entry.team = team;
    entry.opp = upper(row?.opponent);
    entry._teamSource = GAME_TIME_TEAM_SOURCE;
  }
  return entry;
}

/**
 * api.sleeper.com week payload (an array of rows) → `{ [playerId]: entry }`.
 */
export function toWeekStatMap(payload, week) {
  const map = {};
  for (const row of Array.isArray(payload) ? payload : []) {
    if (row?.player_id == null) continue;
    map[String(row.player_id)] = toWeeklyStatRow(row, week);
  }
  return map;
}

function regularSeasonWeekCount(season) {
  return Number(season) < 2021 ? 17 : REGULAR_SEASON_WEEKS;
}

/**
 * Which weeks of `season` can have stats, from Sleeper's /state/nfl.
 * - a past season: every regular-season week, none current
 * - the current season in the regular season: weeks 1..state.week, with
 *   state.week current (its games may still be in progress)
 * - the current season in the postseason: every week, none current
 * - preseason, or a future season: no weeks
 * - offseason of the same season, or no usable state: every week, none final
 *   (the old behaviour: open weeks are refetched once they go stale)
 * `completed: true` marks a season known to be over without asking the state.
 */
export function resolveStatsWeekRange(nflState, season, { completed = false } = {}) {
  const seasonNumber = Number(season);
  const allWeeks = regularSeasonWeekCount(season);
  if (completed) return { throughWeek: allWeeks, currentWeek: null, known: true };
  const stateSeason = Number(nflState?.season);
  if (!Number.isFinite(stateSeason) || !nflState) {
    return { throughWeek: allWeeks, currentWeek: null, known: false };
  }
  if (seasonNumber < stateSeason) return { throughWeek: allWeeks, currentWeek: null, known: true };
  if (seasonNumber > stateSeason) return { throughWeek: 0, currentWeek: null, known: true };
  const type = String(nflState.season_type ?? '');
  if (type === 'post') return { throughWeek: allWeeks, currentWeek: null, known: true };
  if (type === 'pre') return { throughWeek: 0, currentWeek: null, known: true };
  if (type !== 'regular') return { throughWeek: allWeeks, currentWeek: null, known: false };
  const week = Math.min(allWeeks, Math.max(0, Math.floor(Number(nflState.week) || 0)));
  return { throughWeek: week, currentWeek: week || null, known: true };
}

/**
 * Weeks to fetch for a season package. A week stored as final is never
 * fetched again. A non-final week (the current week, or a week stored before
 * the slate rolled past it) is refetched once it is older than `ttl`, and a
 * week stored before rollover is refetched once afterwards to become final.
 * @param {object|null} cached  stored package with `weeks: { [week]: { fetchedAt, final } }`
 * @param {{ throughWeek: number, currentWeek: number|null, known?: boolean }} range
 */
export function planSeasonWeekFetch(cached, range, { now = Date.now(), ttl = 60 * 60 * 1000 } = {}) {
  const meta = cached?.weeks ?? {};
  const weeks = [];
  for (let week = 1; week <= (range?.throughWeek ?? 0); week += 1) {
    const stored = meta[week];
    if (!stored) { weeks.push(week); continue; }
    if (stored.final) continue;
    const becameFinal = isFinalWeek(week, range);
    if (becameFinal || now - Number(stored.fetchedAt ?? 0) >= ttl) weeks.push(week);
  }
  return weeks;
}

function isFinalWeek(week, range) {
  if (range?.known === false) return false;
  return range?.currentWeek == null || week < range.currentWeek;
}

/**
 * Replace `fetched` weeks in a season's weekly stats. Every player's row for a
 * refetched week is removed first, so a stat line Sleeper withdrew does not
 * linger; weeks that were not refetched are kept as stored.
 * @param {object} weeklyStats   { [playerId]: Array<{ week, ... }> }
 * @param {object} fetched       { [week]: { [playerId]: entry } }
 */
export function replaceWeeksInWeeklyStats(weeklyStats = {}, fetched = {}) {
  const replaced = new Set(Object.keys(fetched).map(Number));
  if (replaced.size === 0) return weeklyStats ?? {};
  const next = {};
  for (const [playerId, rows] of Object.entries(weeklyStats ?? {})) {
    const kept = (rows ?? []).filter((row) => !replaced.has(Number(row?.week)));
    if (kept.length) next[playerId] = kept;
  }
  for (const [week, map] of Object.entries(fetched)) {
    for (const [playerId, entry] of Object.entries(map ?? {})) {
      (next[playerId] ??= []).push({ ...entry, week: Number(week) });
    }
  }
  for (const rows of Object.values(next)) rows.sort((a, b) => Number(a.week) - Number(b.week));
  return next;
}

/**
 * Merge freshly fetched weeks into a stored package's weekly stats and week
 * metadata. Returns `{ weeklyStats, weeks }`.
 */
export function mergeFetchedWeeks(cached, fetched, range, { now = Date.now() } = {}) {
  const weeks = { ...(cached?.weeks ?? {}) };
  for (const week of Object.keys(fetched ?? {})) {
    weeks[week] = { fetchedAt: now, final: isFinalWeek(Number(week), range) };
  }
  return {
    weeklyStats: replaceWeeksInWeeklyStats(cached?.weeklyStats ?? {}, fetched ?? {}),
    weeks,
  };
}

/**
 * Schedule fallback for players whose rows carry no game-time team (a row
 * merged from the live stats feed for a player with no earlier row, or a
 * package from a source without teams). Each row whose player's current team
 * played that week is attributed there with `_teamSource: 'schedule'`, as the
 * old Pass 3 did. Players with any game-time row are left alone: readers
 * already fall back to that team. Returns a new map, or null when nothing
 * changes.
 */
export function fillScheduleWeekTeams(weeklyStats, players, scheduleMap) {
  if (!weeklyStats || !players || !scheduleMap) return null;
  let next = null;
  for (const [playerId, rows] of Object.entries(weeklyStats)) {
    const player = players[playerId];
    if (!player || !TEAM_BY_WEEK_POSITIONS.has(player.position)) continue;
    const team = upper(player.team);
    if (!team || !rows?.length) continue;
    if (rows.some((row) => row?._teamSource === GAME_TIME_TEAM_SOURCE)) continue;
    let changed = false;
    const filled = rows.map((row) => {
      if (row?.team) return row;
      const game = scheduleMap?.[row?.week]?.[team];
      if (!game) return row;
      changed = true;
      return { ...row, team, opp: upper(game.opp), _teamSource: SCHEDULE_TEAM_SOURCE };
    });
    if (!changed) continue;
    next ??= { ...weeklyStats };
    next[playerId] = filled;
  }
  return next;
}

/**
 * Keep at most `limit` season packages. Season keys are integer-like, so an
 * object's own key order is numeric, not insertion order; recency is tracked
 * in a separate array (oldest first) that this returns updated. The touched
 * season and any `keep` season (the selected one) are never evicted.
 * @returns {{ packages: object, recency: string[] }}
 */
export function capSeasonPackages(packages, recency, touchedKey, { limit = 3, keep = [] } = {}) {
  const touched = touchedKey == null ? null : String(touchedKey);
  const present = new Set(Object.keys(packages ?? {}));
  const order = (recency ?? []).map(String).filter((key) => present.has(key) && key !== touched);
  for (const key of present) if (!order.includes(key) && key !== touched) order.unshift(key);
  if (touched && present.has(touched)) order.push(touched);
  const protectedKeys = new Set([...keep, touched].filter((key) => key != null).map(String));
  const next = { ...(packages ?? {}) };
  while (order.length > limit) {
    const index = order.findIndex((key) => !protectedKeys.has(key));
    if (index < 0) break;
    delete next[order[index]];
    order.splice(index, 1);
  }
  return { packages: next, recency: order };
}
