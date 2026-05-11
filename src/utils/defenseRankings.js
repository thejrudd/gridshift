import { calcPoints } from './scoringEngine.js';

export const DEFENSE_RANKING_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

export const DEFENSE_RANKING_STAT_OPTIONS = {
  QB: [
    { id: 'pass_yd', label: 'Passing Yards', shortLabel: 'Pass Yds' },
    { id: 'pass_td', label: 'Passing TDs', shortLabel: 'Pass TD' },
    { id: 'rush_yd', label: 'Rushing Yards', shortLabel: 'Rush Yds' },
    { id: 'rush_td', label: 'Rushing TDs', shortLabel: 'Rush TD' },
  ],
  RB: [
    { id: 'rush_att', label: 'Rushing Attempts', shortLabel: 'Carries' },
    { id: 'rush_yd', label: 'Rushing Yards', shortLabel: 'Rush Yds' },
    { id: 'rush_td', label: 'Rushing TDs', shortLabel: 'Rush TD' },
    { id: 'rec', label: 'Receptions', shortLabel: 'Rec' },
    { id: 'rec_yd', label: 'Receiving Yards', shortLabel: 'Rec Yds' },
    { id: 'rec_td', label: 'Receiving TDs', shortLabel: 'Rec TD' },
  ],
  WR: [
    { id: 'rec', label: 'Receptions', shortLabel: 'Rec' },
    { id: 'rec_yd', label: 'Receiving Yards', shortLabel: 'Rec Yds' },
    { id: 'rec_td', label: 'Receiving TDs', shortLabel: 'Rec TD' },
    { id: 'rush_yd', label: 'Rushing Yards', shortLabel: 'Rush Yds' },
    { id: 'rush_td', label: 'Rushing TDs', shortLabel: 'Rush TD' },
  ],
  TE: [
    { id: 'rec', label: 'Receptions', shortLabel: 'Rec' },
    { id: 'rec_yd', label: 'Receiving Yards', shortLabel: 'Rec Yds' },
    { id: 'rec_td', label: 'Receiving TDs', shortLabel: 'Rec TD' },
    { id: 'rush_yd', label: 'Rushing Yards', shortLabel: 'Rush Yds' },
    { id: 'rush_td', label: 'Rushing TDs', shortLabel: 'Rush TD' },
  ],
};

export const DEFAULT_DEFENSE_RANKING_STATE = {
  mode: 'stats',
  position: 'QB',
  stat: 'pass_yd',
  sort: 'total',
  dir: 'desc',
  query: '',
};

export function getDefenseRankingStatOptions(position) {
  return DEFENSE_RANKING_STAT_OPTIONS[position] ?? DEFENSE_RANKING_STAT_OPTIONS.RB;
}

export function getDefaultDefenseRankingStat(position) {
  return getDefenseRankingStatOptions(position)[0]?.id ?? DEFAULT_DEFENSE_RANKING_STATE.stat;
}

export function normalizeDefenseRankingPosition(position) {
  const value = String(position ?? '').trim().toUpperCase();
  return DEFENSE_RANKING_POSITIONS.includes(value) ? value : DEFAULT_DEFENSE_RANKING_STATE.position;
}

export function normalizeDefenseRankingMode(mode) {
  return mode === 'fantasy' ? 'fantasy' : 'stats';
}

export function normalizeDefenseRankingSort(sort) {
  return ['total', 'avg', 'team'].includes(sort) ? sort : 'total';
}

export function normalizeDefenseRankingDir(dir) {
  return dir === 'asc' ? 'asc' : 'desc';
}

export function normalizeDefenseRankingStat(stat, position) {
  const options = getDefenseRankingStatOptions(position);
  return options.some(option => option.id === stat) ? stat : getDefaultDefenseRankingStat(position);
}

export function getDefenseRankingStatOption(position, stat) {
  const options = getDefenseRankingStatOptions(position);
  return options.find(option => option.id === stat) ?? options[0];
}

function getPlayerName(player, playerId) {
  return player?.full_name || `${player?.first_name ?? ''} ${player?.last_name ?? ''}`.trim() || playerId;
}

function getFallbackPlayerTeam(player, playerWeeks) {
  const enhanced = playerWeeks.find(week => week._teamSource === 'espn' && week.team);
  return enhanced?.team?.toUpperCase() ?? player?.team?.toUpperCase() ?? null;
}

function getDefenseTeamForWeek(wEntry, player, playerWeeks, scheduleMap) {
  const gameTeam = wEntry.team?.toUpperCase();
  if (gameTeam && scheduleMap?.[wEntry.week]?.[gameTeam]?.opp) {
    return scheduleMap[wEntry.week][gameTeam].opp.toUpperCase();
  }

  const entryOpp = wEntry.opp?.toUpperCase();
  if (entryOpp) return entryOpp;

  const fallbackTeam = getFallbackPlayerTeam(player, playerWeeks);
  return fallbackTeam ? scheduleMap?.[wEntry.week]?.[fallbackTeam]?.opp?.toUpperCase() ?? null : null;
}

function buildStatWeeks(weeklyStats) {
  const weeks = new Set();
  for (const playerWeeks of Object.values(weeklyStats ?? {})) {
    for (const wEntry of playerWeeks ?? []) {
      if (wEntry?.week != null) weeks.add(Number(wEntry.week));
    }
  }
  return weeks;
}

function buildGamesByTeam(scheduleMap, teams, activeWeeks) {
  const gamesByTeam = {};
  for (const team of teams) gamesByTeam[team] = new Set();
  for (const [week, weekData] of Object.entries(scheduleMap ?? {})) {
    const weekNumber = Number(week);
    if (activeWeeks?.size && !activeWeeks.has(weekNumber)) continue;
    for (const team of Object.keys(weekData ?? {})) {
      const normalizedTeam = team.toUpperCase();
      if (!gamesByTeam[normalizedTeam]) gamesByTeam[normalizedTeam] = new Set();
      gamesByTeam[normalizedTeam].add(weekNumber);
    }
  }
  return gamesByTeam;
}

export function buildDefenseRankingRows({
  weeklyStats,
  players,
  scheduleMap,
  scoringSettings,
  position = DEFAULT_DEFENSE_RANKING_STATE.position,
  mode = DEFAULT_DEFENSE_RANKING_STATE.mode,
  stat = DEFAULT_DEFENSE_RANKING_STATE.stat,
  sort = DEFAULT_DEFENSE_RANKING_STATE.sort,
  dir = DEFAULT_DEFENSE_RANKING_STATE.dir,
  teams = [],
}) {
  const normalizedPosition = normalizeDefenseRankingPosition(position);
  const normalizedMode = normalizeDefenseRankingMode(mode);
  const normalizedStat = normalizeDefenseRankingStat(stat, normalizedPosition);
  const normalizedSort = normalizeDefenseRankingSort(sort);
  const normalizedDir = normalizeDefenseRankingDir(dir);
  const allTeams = teams.map(team => String(team).toUpperCase()).sort();
  const teamRows = new Map(allTeams.map(team => [team, {
    team,
    total: 0,
    avg: null,
    games: 0,
    weekTotals: {},
    contributions: [],
  }]));
  const gamesByTeam = buildGamesByTeam(scheduleMap, allTeams, buildStatWeeks(weeklyStats));

  for (const [playerId, playerWeeks] of Object.entries(weeklyStats ?? {})) {
    const player = players?.[playerId];
    if (!player || player.position !== normalizedPosition) continue;

    for (const wEntry of playerWeeks ?? []) {
      const defenseTeam = getDefenseTeamForWeek(wEntry, player, playerWeeks, scheduleMap);
      if (!defenseTeam) continue;
      if (!teamRows.has(defenseTeam)) {
        teamRows.set(defenseTeam, {
          team: defenseTeam,
          total: 0,
          avg: null,
          games: 0,
          weekTotals: {},
          contributions: [],
        });
      }

      const value = normalizedMode === 'fantasy'
        ? calcPoints(wEntry, scoringSettings, normalizedPosition)
        : Number(wEntry[normalizedStat] ?? 0);
      if (!Number.isFinite(value) || value <= 0) continue;

      const row = teamRows.get(defenseTeam);
      const week = Number(wEntry.week);
      row.total += value;
      row.weekTotals[week] = (row.weekTotals[week] ?? 0) + value;
      row.contributions.push({
        playerId,
        playerName: getPlayerName(player, playerId),
        position: player.position,
        week,
        value,
        team: wEntry.team?.toUpperCase() ?? getFallbackPlayerTeam(player, playerWeeks),
      });
    }
  }

  const rows = [...teamRows.values()].map(row => {
    const games = gamesByTeam[row.team]?.size || Object.keys(row.weekTotals).length;
    const contributions = row.contributions
      .sort((a, b) => a.week - b.week || b.value - a.value || a.playerName.localeCompare(b.playerName));
    return {
      ...row,
      games,
      avg: games > 0 ? row.total / games : null,
      contributions,
    };
  });

  const sortedRows = rows.sort((a, b) => {
    if (normalizedSort === 'team') {
      const delta = a.team.localeCompare(b.team);
      return normalizedDir === 'asc' ? delta : -delta;
    }
    const valueKey = normalizedSort === 'avg' ? 'avg' : 'total';
    const aVal = a[valueKey];
    const bVal = b[valueKey];
    if (aVal == null && bVal == null) return a.team.localeCompare(b.team);
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    const delta = normalizedDir === 'asc' ? aVal - bVal : bVal - aVal;
    return delta || a.team.localeCompare(b.team);
  });

  return sortedRows.map((row, index) => ({ ...row, rank: index + 1 }));
}

export function filterDefenseRankingRows(rows, query) {
  const value = String(query ?? '').trim().toUpperCase();
  if (!value) return rows;
  return rows.filter(row => row.team.includes(value));
}
