import { calcPoints } from './scoringEngine.js';

export const DEFENSE_RANKING_POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K'];
const DEFENSE_RANKING_PLAYER_POSITIONS = ['QB', 'RB', 'WR', 'TE'];
const WHOLE_NUMBER_STATS = new Set(['pass_td', 'pass_int', 'rush_td', 'rush_att', 'rec', 'rec_td', 'total_td', 'fgm', 'fgmiss', 'xpm', 'xpmiss']);
const LOW_FREQUENCY_AVERAGE_STATS = new Set(['pass_td', 'pass_int', 'rush_td', 'rec_td']);
const VOLUME_AVERAGE_STATS = new Set(['rush_att', 'rec', 'fgm', 'fgmiss', 'xpm', 'xpmiss']);

export const DEFENSE_RANKING_STAT_OPTIONS = {
  ALL: [
    { id: 'total_yd', label: 'Total Yards', shortLabel: 'Total Yds' },
    { id: 'total_td', label: 'Total TDs', shortLabel: 'Total TD' },
  ],
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
  K: [
    { id: 'fgm', label: 'Field Goals Made', shortLabel: 'FG Made' },
    { id: 'fgmiss', label: 'Field Goals Missed', shortLabel: 'FG Miss' },
    { id: 'xpm', label: 'Extra Points Made', shortLabel: 'XP Made' },
    { id: 'xpmiss', label: 'Extra Points Missed', shortLabel: 'XP Miss' },
  ],
};

export const DEFAULT_DEFENSE_RANKING_STATE = {
  mode: 'stats',
  position: 'ALL',
  stat: 'total_yd',
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

function getDefenseAverageFractionDigits(value, stat) {
  const absValue = Math.abs(value);
  if (absValue === 0) return 0;
  if (LOW_FREQUENCY_AVERAGE_STATS.has(stat)) return absValue < 1 ? 2 : 1;
  if (VOLUME_AVERAGE_STATS.has(stat)) return absValue < 10 ? 1 : 0;
  if (String(stat).endsWith('_yd')) return absValue < 100 ? 1 : 0;
  if (absValue < 1) return 2;
  if (absValue < 10) return 1;
  return 0;
}

export function formatDefenseRankingValue(value, { mode = 'stats', stat = DEFAULT_DEFENSE_RANKING_STATE.stat, scope = 'total' } = {}) {
  if (value == null || !Number.isFinite(value)) return '-';
  if (mode === 'fantasy') {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }
  if (scope === 'avg') {
    const fractionDigits = getDefenseAverageFractionDigits(value, stat);
    return value.toLocaleString(undefined, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  }
  if (WHOLE_NUMBER_STATS.has(stat)) return Math.round(value).toLocaleString();
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

function getPlayerName(player, playerId) {
  return player?.full_name || `${player?.first_name ?? ''} ${player?.last_name ?? ''}`.trim() || playerId;
}

function getDefenseStatValue(wEntry, stat) {
  switch (stat) {
    // Passing is excluded from the ALL totals: each completed pass is already the receiver's
    // rec_yd/rec_td, so adding the QB's pass_yd/pass_td would count it twice.
    case 'total_yd':
      return Number(wEntry.rush_yd ?? 0) + Number(wEntry.rec_yd ?? 0);
    case 'total_td':
      return Number(wEntry.rush_td ?? 0) + Number(wEntry.rec_td ?? 0);
    default:
      return Number(wEntry[stat] ?? 0);
  }
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

function buildPlayedWeeksByTeam(weeklyStats, players, scheduleMap) {
  const playedWeeks = new Map();
  const addPlayedWeek = (team, week) => {
    if (!team) return;
    const normalizedTeam = String(team).toUpperCase();
    if (!playedWeeks.has(normalizedTeam)) playedWeeks.set(normalizedTeam, new Set());
    playedWeeks.get(normalizedTeam).add(week);
  };

  for (const [playerId, playerWeeks] of Object.entries(weeklyStats ?? {})) {
    const player = players?.[playerId];
    for (const wEntry of playerWeeks ?? []) {
      const week = Number(wEntry?.week);
      if (!Number.isFinite(week)) continue;
      const offenseTeam = wEntry.team?.toUpperCase() ?? getFallbackPlayerTeam(player, playerWeeks ?? []);
      if (!offenseTeam) continue;
      addPlayedWeek(offenseTeam, week);
      addPlayedWeek(scheduleMap?.[week]?.[offenseTeam]?.opp ?? wEntry.opp ?? null, week);
    }
  }
  return playedWeeks;
}

function buildGamesByTeam(scheduleMap, teams, playedWeeksByTeam) {
  const gamesByTeam = {};
  for (const team of teams) gamesByTeam[team] = new Set();
  for (const [week, weekData] of Object.entries(scheduleMap ?? {})) {
    const weekNumber = Number(week);
    for (const team of Object.keys(weekData ?? {})) {
      const normalizedTeam = team.toUpperCase();
      if (!playedWeeksByTeam?.get(normalizedTeam)?.has(weekNumber)) continue;
      if (!gamesByTeam[normalizedTeam]) gamesByTeam[normalizedTeam] = new Set();
      gamesByTeam[normalizedTeam].add(weekNumber);
    }
  }
  return gamesByTeam;
}

function buildStrengthRankMap(rows, rankKey) {
  return new Map([...rows]
    .sort((a, b) => {
      const aVal = a[rankKey];
      const bVal = b[rankKey];
      if (aVal == null && bVal == null) return a.team.localeCompare(b.team);
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      return (aVal - bVal) || a.team.localeCompare(b.team);
    })
    .map((row, index) => [row.team, index + 1]));
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
  const gamesByTeam = buildGamesByTeam(scheduleMap, allTeams, buildPlayedWeeksByTeam(weeklyStats, players, scheduleMap));
  const allowedPositions = normalizedPosition === 'ALL'
    ? DEFENSE_RANKING_PLAYER_POSITIONS
    : [normalizedPosition];

  for (const [playerId, playerWeeks] of Object.entries(weeklyStats ?? {})) {
    const player = players?.[playerId];
    if (!player || !allowedPositions.includes(player.position)) continue;

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
        ? calcPoints(wEntry, scoringSettings, player.position)
        : getDefenseStatValue(wEntry, normalizedStat);
      if (!Number.isFinite(value) || value <= 0) continue;

      const row = teamRows.get(defenseTeam);
      const week = Number(wEntry.week);
      const offenseTeam = wEntry.team?.toUpperCase() ?? getFallbackPlayerTeam(player, playerWeeks);
      row.total += value;
      row.weekTotals[week] = (row.weekTotals[week] ?? 0) + value;
      row.contributions.push({
        playerId,
        sleeperId: player.player_id ?? playerId,
        espnId: player.espn_id ?? player.espnId ?? player.sourceIds?.espn ?? null,
        imageUrl: player.imageUrl ?? player.image_url ?? player.playerImageUrl ?? null,
        playerName: getPlayerName(player, playerId),
        position: player.position,
        week,
        value,
        team: offenseTeam,
        opponent: offenseTeam,
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

  const rankKey = normalizedSort === 'avg' ? 'avg' : 'total';
  const strengthRankByTeam = buildStrengthRankMap(rows, rankKey);

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

  return sortedRows.map((row, index) => ({
    ...row,
    rank: index + 1,
    strengthRank: strengthRankByTeam.get(row.team) ?? index + 1,
  }));
}

export function filterDefenseRankingRows(rows, query) {
  const value = String(query ?? '').trim().toUpperCase();
  if (!value) return rows;
  return rows.filter(row => row.team.includes(value));
}


// ── Unit vs unit (Statistics › Schedule NFL matchup drill-in) ────────────────
// Each unit is measured the same way on both sides of the ball: an offense's
// production and the same number a defense allowed, per game played. Offense
// rank 1 = most produced; defense rank 1 = fewest allowed, so #1 is always the
// strongest unit.

const UNIT_SKILL_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

export const MATCHUP_UNITS = Object.freeze([
  { id: 'PASS', label: 'Pass game', sub: 'Pass yds / game', positions: UNIT_SKILL_POSITIONS, value: (w) => Number(w.pass_yd ?? 0), defense: { position: 'QB', stat: 'pass_yd' } },
  { id: 'RUN', label: 'Run game', sub: 'Rush yds / game', positions: UNIT_SKILL_POSITIONS, value: (w) => Number(w.rush_yd ?? 0), defense: { position: 'RB', stat: 'rush_yd' } },
  { id: 'QB', label: 'QB', sub: 'QB pass yds / game', positions: ['QB'], value: (w) => Number(w.pass_yd ?? 0), defense: { position: 'QB', stat: 'pass_yd' } },
  { id: 'RB', label: 'RB', sub: 'RB scrimmage yds / game', positions: ['RB'], value: (w) => Number(w.rush_yd ?? 0) + Number(w.rec_yd ?? 0), defense: { position: 'RB', stat: 'rush_yd' } },
  { id: 'WR', label: 'WR', sub: 'WR rec yds / game', positions: ['WR'], value: (w) => Number(w.rec_yd ?? 0), defense: { position: 'WR', stat: 'rec_yd' } },
  { id: 'TE', label: 'TE', sub: 'TE rec yds / game', positions: ['TE'], value: (w) => Number(w.rec_yd ?? 0), defense: { position: 'TE', stat: 'rec_yd' } },
  { id: 'K', label: 'K', sub: 'FG made / game', positions: ['K'], value: (w) => Number(w.fgm ?? 0), defense: { position: 'K', stat: 'fgm' } },
]);

function rankUnitRows(rows, side, unitId) {
  const ranked = rows
    .filter((row) => row[side][unitId].avg != null)
    .sort((a, b) => {
      const delta = side === 'offense'
        ? b[side][unitId].avg - a[side][unitId].avg
        : a[side][unitId].avg - b[side][unitId].avg;
      return delta || a.team.localeCompare(b.team);
    });
  ranked.forEach((row, index) => { row[side][unitId].rank = index + 1; });
}

/**
 * Per-team offense-produced and defense-allowed averages and ranks for every
 * matchup unit. `throughWeek` (inclusive) limits the sample, so a finished
 * game can compare ranks entering the week with ranks after it.
 */
export function buildUnitMatchupTable({
  weeklyStats,
  players,
  scheduleMap,
  teams = [],
  throughWeek = null,
}) {
  const maxWeek = Number.isFinite(Number(throughWeek)) && throughWeek != null ? Number(throughWeek) : Infinity;
  const inRange = (week) => Number.isFinite(week) && week <= maxWeek;
  const allTeams = teams.map((team) => String(team).toUpperCase());
  const played = buildPlayedWeeksByTeam(weeklyStats, players, scheduleMap);
  for (const weeks of played.values()) {
    for (const week of [...weeks]) if (!inRange(week)) weeks.delete(week);
  }
  const gamesByTeam = buildGamesByTeam(scheduleMap, allTeams, played);
  const emptySide = () => Object.fromEntries(MATCHUP_UNITS.map((unit) => [unit.id, { total: 0, avg: null, rank: null }]));
  const byTeam = new Map(allTeams.map((team) => [team, { team, games: 0, offense: emptySide(), defense: emptySide() }]));
  const ensure = (team) => {
    if (!byTeam.has(team)) byTeam.set(team, { team, games: 0, offense: emptySide(), defense: emptySide() });
    return byTeam.get(team);
  };

  for (const [playerId, playerWeeks] of Object.entries(weeklyStats ?? {})) {
    const player = players?.[playerId];
    if (!player) continue;
    for (const wEntry of playerWeeks ?? []) {
      const week = Number(wEntry?.week);
      if (!inRange(week)) continue;
      const offenseTeam = wEntry.team?.toUpperCase() ?? getFallbackPlayerTeam(player, playerWeeks ?? []);
      const defenseTeam = getDefenseTeamForWeek(wEntry, player, playerWeeks ?? [], scheduleMap);
      for (const unit of MATCHUP_UNITS) {
        if (!unit.positions.includes(player.position)) continue;
        const value = unit.value(wEntry);
        if (!Number.isFinite(value) || value === 0) continue;
        if (offenseTeam) ensure(offenseTeam).offense[unit.id].total += value;
        if (defenseTeam) ensure(defenseTeam).defense[unit.id].total += value;
      }
    }
  }

  const rows = [...byTeam.values()];
  for (const row of rows) {
    row.games = gamesByTeam[row.team]?.size ?? 0;
    for (const side of ['offense', 'defense']) {
      for (const unit of MATCHUP_UNITS) {
        const entry = row[side][unit.id];
        entry.avg = row.games > 0 ? entry.total / row.games : null;
      }
    }
  }
  for (const unit of MATCHUP_UNITS) {
    rankUnitRows(rows, 'offense', unit.id);
    rankUnitRows(rows, 'defense', unit.id);
  }
  return new Map(rows.map((row) => [row.team, row]));
}
