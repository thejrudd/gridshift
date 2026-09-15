import { calcPoints } from './scoringEngine.js';

// This is intentionally the same offensive-player set and positive-only
// aggregation that powers the Fantasy Heatmap. It is keyed by the offense that
// produced the stat; callers that need what a defense conceded reverse the
// completed schedule rather than changing this source contract.
const OFFENSE_POS_SET = new Set(['QB', 'RB', 'WR', 'TE', 'K']);
const HEATMAP_OFFENSE_TABLE_CACHE = new WeakMap();

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
      let val;
      if (statMode === 'rec_yd') val = wEntry.rec_yd ?? 0;
      else if (statMode === 'rush_yd') val = wEntry.rush_yd ?? 0;
      else val = calcPoints(wEntry, activeScoringSettings, position);
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
