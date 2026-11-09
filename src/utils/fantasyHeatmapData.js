import { calcPoints } from './scoringEngine.js';
import { isFinalScheduleGame } from './statisticsSchedule.js';

// This is intentionally the same offensive-player set and aggregation that
// powers the Fantasy Heatmap. Completed games retain negative values; the
// active live week also retains negative values and opts into zero values. It
// is keyed by the offense that produced the stat.
const OFFENSE_POS_SET = new Set(['QB', 'RB', 'WR', 'TE', 'K']);
const DIRECT_OFFENSE_STAT_KEYS = new Set(['rec_yd', 'rush_yd', 'pass_td', 'rec_td', 'rush_td', 'pass_sack', 'pass_int']);
const HEATMAP_OFFENSE_TABLE_CACHE = new WeakMap();

/**
 * List games that belong in a Heatmap per-game average. The season schedule
 * intentionally includes future opponents, so schedule-entry presence is not
 * enough evidence that a game should be part of the denominator. A finalized
 * game still counts when the selected stat is zero or missing from the row.
 */
export function getHeatmapCompletedGameWeeks(scheduleMap, team, weeks, matchesLocation = () => true) {
  return (weeks ?? []).filter((week) => {
    if (!matchesLocation(team, week)) return false;
    const weekSchedule = scheduleMap?.[week] ?? scheduleMap?.[String(week)] ?? null;
    const scheduleEntry = weekSchedule?.[team] ?? weekSchedule?.[String(team)] ?? null;
    return isFinalScheduleGame(scheduleEntry);
  });
}

export function getHeatmapCompletedGameCount(scheduleMap, team, weeks, matchesLocation = () => true) {
  return getHeatmapCompletedGameWeeks(scheduleMap, team, weeks, matchesLocation).length;
}

function rankDescendingValues(values) {
  const ranked = [...values.entries()].sort((left, right) => right[1] - left[1]);
  const ranks = new Map();
  let previousValue;
  let previousRank = 0;

  ranked.forEach(([team, value], index) => {
    const rank = index > 0 && value === previousValue ? previousRank : index + 1;
    ranks.set(team, rank);
    previousValue = value;
    previousRank = rank;
  });

  return ranks;
}

function rankAscendingValues(values) {
  const ranked = [...values.entries()].sort((left, right) => left[1] - right[1]);
  const ranks = new Map();
  let previousValue;
  let previousRank = 0;

  ranked.forEach(([team, value], index) => {
    const rank = index > 0 && value === previousValue ? previousRank : index + 1;
    ranks.set(team, rank);
    previousValue = value;
    previousRank = rank;
  });

  return ranks;
}

/**
 * Build team-vs-opponent matchup ranks for future Heatmap cells.
 *
 * The matchup combines the selected team's position scoring rank (more
 * scoring is better) and the opponent's points-allowed rank (more points
 * allowed to that position is better) with equal weight. Matchup ties share a
 * competition rank. `offenseTable` remains supported for existing Heatmap
 * callers; `positionTable` also supports defensive position scoring tables.
 */
export function buildHeatmapMatchupRatings({
  offenseTable,
  positionTable = null,
  allowedTable = null,
  scheduleMap,
  teams,
  positions,
  weeks,
  window = 'season',
  recentGameCount = 4,
} = {}) {
  const scoringTable = positionTable ?? offenseTable;
  const opponentTable = allowedTable ?? scoringTable;
  if (!scoringTable || !opponentTable || Object.keys(opponentTable).length === 0 || !scheduleMap) return {};

  const offenseValuesByPosition = new Map();
  const allowedValuesByPosition = new Map();
  const defenseQualityRanksByPosition = new Map();
  const offenseAveragesByPosition = new Map();
  const allowedAveragesByPosition = new Map();

  for (const position of positions ?? []) {
    const offenseValues = new Map();
    const allowedValues = new Map();
    const offenseAverages = new Map();
    const allowedAverages = new Map();

    for (const team of teams ?? []) {
      const completedWeeks = getHeatmapCompletedGameWeeks(scheduleMap, team, weeks);
      const selectedWeeks = window === 'recent'
        ? completedWeeks.slice(-Math.max(1, recentGameCount))
        : completedWeeks;
      if (!selectedWeeks.length) continue;

      let offenseTotal = 0;
      let allowedTotal = 0;
      let hasOpponentForAllGames = true;

      for (const week of selectedWeeks) {
        offenseTotal += scoringTable[team]?.[position]?.[week] ?? 0;

        const opponent = scheduleMap?.[week]?.[team]?.opp?.toUpperCase();
        if (!opponent) {
          hasOpponentForAllGames = false;
          break;
        }
        allowedTotal += opponentTable[opponent]?.[position]?.[week] ?? 0;
      }

      if (!hasOpponentForAllGames) continue;
      const offenseAverage = offenseTotal / selectedWeeks.length;
      const allowedAverage = allowedTotal / selectedWeeks.length;
      offenseValues.set(team, offenseAverage);
      allowedValues.set(team, allowedAverage);
      offenseAverages.set(team, offenseAverage);
      allowedAverages.set(team, allowedAverage);
    }

    offenseValuesByPosition.set(position, rankDescendingValues(offenseValues));
    allowedValuesByPosition.set(position, rankDescendingValues(allowedValues));
    defenseQualityRanksByPosition.set(position, rankAscendingValues(allowedValues));
    offenseAveragesByPosition.set(position, offenseAverages);
    allowedAveragesByPosition.set(position, allowedAverages);
  }

  const ratings = {};
  for (const week of weeks ?? []) {
    const scheduleWeek = scheduleMap?.[week] ?? scheduleMap?.[String(week)] ?? {};
    const activeMatchups = (teams ?? []).filter((team) => {
      const entry = scheduleWeek?.[team] ?? scheduleWeek?.[String(team)];
      return entry?.opp && !isFinalScheduleGame(entry);
    });
    if (!activeMatchups.length) continue;

    for (const position of positions ?? []) {
      const offenseRanks = offenseValuesByPosition.get(position);
      const favorableDefenseRanks = allowedValuesByPosition.get(position);
      const defenseQualityRanks = defenseQualityRanksByPosition.get(position);
      const composites = new Map();

      for (const team of activeMatchups) {
        const entry = scheduleWeek?.[team] ?? scheduleWeek?.[String(team)];
        const opponent = entry?.opp?.toUpperCase();
        const offenseRank = offenseRanks?.get(team);
        const opponentDefenseRank = favorableDefenseRanks?.get(opponent);
        if (offenseRank == null || opponentDefenseRank == null) continue;
        composites.set(team, (offenseRank + opponentDefenseRank) / 2);
      }

      const matchupRanks = rankAscendingValues(composites);
      for (const [team, rank] of matchupRanks) {
        ratings[week] ??= {};
        ratings[week][team] ??= {};
        ratings[week][team][position] = {
          rank,
          offenseRank: offenseRanks.get(team),
          defenseRank: defenseQualityRanks.get(scheduleWeek[team].opp.toUpperCase()),
          offenseAverage: offenseAveragesByPosition.get(position).get(team),
          defenseAllowedAverage: allowedAveragesByPosition.get(position).get(scheduleWeek[team].opp.toUpperCase()),
          teamRank: offenseRanks.get(team),
          opponentPointsAllowedRank: favorableDefenseRanks.get(scheduleWeek[team].opp.toUpperCase()),
          teamAverage: offenseAveragesByPosition.get(position).get(team),
          opponentPointsAllowedAverage: allowedAveragesByPosition.get(position).get(scheduleWeek[team].opp.toUpperCase()),
          composite: composites.get(team),
          rankedTeamCount: offenseRanks.size,
          rankedOpponentCount: favorableDefenseRanks.size,
          rankedMatchupCount: matchupRanks.size,
        };
      }
    }
  }

  attachUpcomingSchedules(ratings, { scheduleMap, teams, positions, weeks });
  return ratings;
}

/**
 * Attach each team's remaining schedule, built from the same weekly matchup
 * ranks the Heatmap shows, plus a rank of how favorable that schedule is.
 *
 * Weekly ranks are scaled to 0 (best) – 1 (worst) before averaging, because a
 * bye-heavy week ranks fewer teams. 1st is the easiest remaining schedule.
 */
function attachUpcomingSchedules(ratings, { scheduleMap, teams, positions, weeks }) {
  const weekList = (weeks ?? []).map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  const scheduleWeek = week => scheduleMap?.[week] ?? scheduleMap?.[String(week)] ?? {};

  for (const week of weekList) {
    if (!ratings[week]) continue;
    for (const position of positions ?? []) {
      const schedules = new Map();
      const scores = new Map();
      for (const team of teams ?? []) {
        const games = [];
        for (const futureWeek of weekList) {
          if (futureWeek < week) continue;
          const weekGames = scheduleWeek(futureWeek);
          const entry = weekGames?.[team] ?? weekGames?.[String(team)] ?? null;
          if (!entry) {
            if (Object.keys(weekGames ?? {}).length) games.push({ week: futureWeek, bye: true });
            continue;
          }
          if (!entry.opp || isFinalScheduleGame(entry)) continue;
          const rating = ratings[futureWeek]?.[team]?.[position];
          games.push({
            week: futureWeek,
            opponent: entry.opp.toUpperCase(),
            home: entry.home ?? null,
            rank: rating?.rank ?? null,
            rankCount: rating?.rankedMatchupCount ?? null,
          });
        }
        schedules.set(team, games);
        const scaled = games
          .filter(game => game.rank != null && game.rankCount)
          .map(game => (game.rankCount > 1 ? (game.rank - 1) / (game.rankCount - 1) : 0));
        if (scaled.length) scores.set(team, scaled.reduce((total, value) => total + value, 0) / scaled.length);
      }
      const scheduleRanks = rankAscendingValues(scores);
      for (const team of Object.keys(ratings[week])) {
        const rating = ratings[week][team]?.[position];
        if (!rating) continue;
        rating.upcomingMatchups = schedules.get(team) ?? [];
        rating.scheduleRank = scheduleRanks.get(team) ?? null;
        rating.scheduleRankedTeamCount = scheduleRanks.size;
      }
    }
  }
}

export function sortHeatmapRowsByMatchupRank(rows, matchupRatings, week, position, direction = 'asc') {
  const rankFor = team => matchupRatings?.[week]?.[team]?.[position]?.rank ?? null;
  return [...(rows ?? [])].sort((left, right) => {
    const leftRank = rankFor(left.team);
    const rightRank = rankFor(right.team);
    if (leftRank == null && rightRank == null) {
      // Unranked (finished or bye) teams stay below the ranked ones, ordered by what they scored.
      const leftPoints = left.weekPts?.[week];
      const rightPoints = right.weekPts?.[week];
      if (leftPoints == null && rightPoints == null) return 0;
      if (leftPoints == null) return 1;
      if (rightPoints == null) return -1;
      return rightPoints - leftPoints;
    }
    if (leftRank == null) return 1;
    if (rightRank == null) return -1;
    return direction === 'desc' ? rightRank - leftRank : leftRank - rightRank;
  });
}

/** Return the latest in-range week whose listed schedule entries are all final. */
export function getHeatmapLatestCompletedWeek(scheduleMap, weeks) {
  let latestWeek = null;
  for (const week of weeks ?? []) {
    const weekSchedule = scheduleMap?.[week] ?? scheduleMap?.[String(week)] ?? null;
    const games = Object.values(weekSchedule ?? {});
    if (!games.length || !games.every(isFinalScheduleGame)) continue;
    const number = Number(week);
    if (Number.isInteger(number) && number > 0) latestWeek = Math.max(latestWeek ?? number, number);
  }
  return latestWeek;
}

/**
 * Table stat mode for the selected position. Summing every position's Total TD in the ALL
 * view would count each passing TD twice (QB and receiver), so ALL uses 'scored_td'.
 */
export function resolveHeatmapOffenseStatMode(statMode, position) {
  return statMode === 'total_td' && position === 'ALL' ? 'scored_td' : statMode;
}

/**
 * Resolve a Heatmap offense value from either a raw stat mode or the active
 * league scoring profile. Raw modes intentionally stay independent of whether
 * the league assigns fantasy points to that category.
 */
export function getHeatmapOffenseStatValue(wEntry, activeScoringSettings, position, statMode) {
  // Total TD is per position: a QB is credited with their passing TDs, everyone else
  // with the TDs they scored. 'scored_td' is the ALL-view variant that leaves passing out,
  // because each passing TD is already the receiver's rec_td.
  if (statMode === 'scored_td') return (wEntry?.rush_td ?? 0) + (wEntry?.rec_td ?? 0);
  if (statMode === 'total_td') {
    const scored = (wEntry?.rush_td ?? 0) + (wEntry?.rec_td ?? 0);
    return position === 'QB' ? scored + (wEntry?.pass_td ?? 0) : scored;
  }
  if (DIRECT_OFFENSE_STAT_KEYS.has(statMode)) return wEntry?.[statMode] ?? 0;
  return calcPoints(wEntry, activeScoringSettings, position);
}

/**
 * Resolve a player's team for a historical stat row using Heatmap's existing
 * game-time-first rule. ESPN-enriched rows retain a traded player's actual
 * team; unresolved rows retain the legacy current-team fallback.
 */
export function getHeatmapPlayerGameTeam(wEntry, player, playerWeeks = []) {
  let team = wEntry?.team?.toUpperCase() ?? null;
  if (!team) {
    const enhanced = playerWeeks.find(week => week?._teamSource === 'espn' && week.team);
    team = enhanced?.team?.toUpperCase() ?? player?.team?.toUpperCase() ?? null;
  }
  return team;
}

/**
 * Build separate matchup inputs without changing the historical Heatmap table.
 * The positional threshold uses recorded player-games from finalized games,
 * including zeroes, across the season. Roster status is current and applies
 * retrospectively to scoring only; the opponent table always includes all players.
 */
export function buildFilteredHeatmapMatchupTables({
  weeklyStats,
  players,
  scheduleMap,
  getPosition,
  getValue,
  getTeam = getHeatmapPlayerGameTeam,
  capOutliers = false,
  rosteredPlayerIds = null,
} = {}) {
  const rows = [];
  const valuesByPosition = new Map();
  for (const [playerId, playerWeeks] of Object.entries(weeklyStats ?? {})) {
    const player = players?.[playerId];
    if (!player || !Array.isArray(playerWeeks)) continue;
    const position = getPosition?.(player);
    if (!position) continue;
    for (const entry of playerWeeks) {
      const team = getTeam(entry, player, playerWeeks);
      if (!team || !isFinalScheduleGame(scheduleMap?.[entry.week]?.[team])) continue;
      const value = getValue?.(entry, player);
      if (!Number.isFinite(value)) continue;
      rows.push({ playerId: String(playerId), team, position, week: entry.week, value });
      if (capOutliers) {
        if (!valuesByPosition.has(position)) valuesByPosition.set(position, []);
        valuesByPosition.get(position).push(value);
      }
    }
  }

  const caps = new Map();
  for (const [position, values] of valuesByPosition) {
    if (values.length < 2) continue;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    caps.set(position, mean + 2 * Math.sqrt(variance));
  }

  const scoringTable = {};
  const allowedTable = {};
  const add = (table, row, value) => {
    table[row.team] ??= {};
    table[row.team][row.position] ??= {};
    table[row.team][row.position][row.week] = (table[row.team][row.position][row.week] ?? 0) + value;
  };
  for (const row of rows) {
    const cap = caps.get(row.position);
    const value = cap == null ? row.value : Math.min(row.value, cap);
    add(allowedTable, row, value);
    if (!rosteredPlayerIds?.has(row.playerId)) add(scoringTable, row, value);
  }
  return { scoringTable, allowedTable };
}

/**
 * Aggregate offensive Heatmap values by the offense that produced them:
 * completed games retain negative values, and an optional live week also keeps
 * negative and zero values. Shape: { [offenseTeam]: { [position]: { [week]: value } } }.
 *
 * Keep this contract deliberately stable. The Heatmap displays offense output;
 * a defense-allowed view is derived by following the reciprocal schedule entry.
 */
export function getCachedOffenseAllowedTable(
  weeklyStats,
  players,
  scheduleMap,
  activeScoringSettings,
  statMode,
  includeNonPositiveWeek = null,
) {
  let byPlayers = HEATMAP_OFFENSE_TABLE_CACHE.get(weeklyStats);
  if (!byPlayers) {
    byPlayers = new WeakMap();
    HEATMAP_OFFENSE_TABLE_CACHE.set(weeklyStats, byPlayers);
  }

  let bySchedule = byPlayers.get(players);
  if (!bySchedule) {
    bySchedule = new WeakMap();
    byPlayers.set(players, bySchedule);
  }

  let byScoring = bySchedule.get(scheduleMap);
  if (!byScoring) {
    byScoring = new WeakMap();
    bySchedule.set(scheduleMap, byScoring);
  }

  let byStatMode = byScoring.get(activeScoringSettings);
  if (!byStatMode) {
    byStatMode = new Map();
    byScoring.set(activeScoringSettings, byStatMode);
  }

  const cacheKey = JSON.stringify([statMode, includeNonPositiveWeek]);
  if (byStatMode.has(cacheKey)) return byStatMode.get(cacheKey);

  const table = {};
  const fallbackSeasonTeam = {};

  const addVal = (team, position, week, val) => {
    if (!table[team]) table[team] = {};
    if (!table[team][position]) table[team][position] = {};
    table[team][position][week] = (table[team][position][week] ?? 0) + val;
  };

  for (const [playerId, playerWeeks] of Object.entries(weeklyStats)) {
    const player = players[playerId];
    const position = player?.position;
    if (!OFFENSE_POS_SET.has(position)) continue;

    for (const wEntry of playerWeeks) {
      const val = getHeatmapOffenseStatValue(wEntry, activeScoringSettings, position, statMode);
      let team = wEntry.team?.toUpperCase() ?? null;
      if (!team) {
        team = fallbackSeasonTeam[playerId];
        if (team === undefined) {
          const enhanced = playerWeeks.find(w => w._teamSource === 'espn' && w.team);
          team = enhanced?.team?.toUpperCase() ?? player.team?.toUpperCase() ?? null;
          fallbackSeasonTeam[playerId] = team;
        }
      }
      if (!team) continue;
      const scheduleEntry = scheduleMap?.[wEntry.week]?.[team];
      const isCompletedGame = isFinalScheduleGame(scheduleEntry);
      const isIncludedLiveWeek = includeNonPositiveWeek != null
        && Number(wEntry.week) === Number(includeNonPositiveWeek);
      if (
        !Number.isFinite(val)
        || (val < 0 && !isCompletedGame && !isIncludedLiveWeek)
        || (val === 0 && !isIncludedLiveWeek)
      ) continue;
      addVal(team, position, wEntry.week, val);
    }
  }

  byStatMode.set(cacheKey, table);
  return table;
}
