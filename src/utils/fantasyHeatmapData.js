import { calcPoints } from './scoringEngine.js';
import { isFinalScheduleGame } from './statisticsSchedule.js';

// This is intentionally the same offensive-player set and positive-only
// aggregation that powers the Fantasy Heatmap. It is keyed by the offense that
// produced the stat; callers that need what a defense conceded reverse the
// completed schedule rather than changing this source contract.
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
  scheduleMap,
  teams,
  positions,
  weeks,
  window = 'season',
  recentGameCount = 4,
} = {}) {
  const scoringTable = positionTable ?? offenseTable;
  if (!scoringTable || Object.keys(scoringTable).length === 0 || !scheduleMap) return {};

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
        allowedTotal += scoringTable[opponent]?.[position]?.[week] ?? 0;
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
        };
      }
    }
  }

  return ratings;
}

export function sortHeatmapRowsByMatchupRank(rows, matchupRatings, week, position, direction = 'asc') {
  const rankFor = team => matchupRatings?.[week]?.[team]?.[position]?.rank ?? null;
  return [...(rows ?? [])].sort((left, right) => {
    const leftRank = rankFor(left.team);
    const rightRank = rankFor(right.team);
    if (leftRank == null && rightRank == null) return 0;
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
 * Aggregate positive offensive Heatmap values by the offense that produced
 * them: { [offenseTeam]: { [position]: { [week]: value } } }.
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

  if (byStatMode.has(statMode)) return byStatMode.get(statMode);

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
      if (val <= 0) continue;

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
      addVal(team, position, wEntry.week, val);
    }
  }

  byStatMode.set(statMode, table);
  return table;
}
