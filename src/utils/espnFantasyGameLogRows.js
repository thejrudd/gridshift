import { fetchEventScoringPlays, fetchGameLog, fetchTeamDefenseGameLog } from './playerApi.js';
import {
  applyScoringPlayBonusesToFantasyRows,
  buildFantasyRowsFromGameLog,
  PROFILE_FANTASY_PLAYER_ID,
} from './fantasyGameLogRows.js';
import {
  getEspnScoringPlayBigPlayBonuses,
  hasEspnBigPlayTouchdownScoring,
} from './espnBigPlayBonuses.js';

const ESPN_FANTASY_GAME_LOG_CACHE = new Map();
const ESPN_OFFENSE_FANTASY_GAME_LOG_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

function normalizeFantasyGameLogPosition(position) {
  const normalized = String(position ?? '').toUpperCase();
  if (normalized === 'DST' || normalized === 'D/ST') return 'DEF';
  return normalized;
}

export function isEspnFantasyGameLogPosition(position) {
  const normalized = normalizeFantasyGameLogPosition(position);
  return ESPN_OFFENSE_FANTASY_GAME_LOG_POSITIONS.has(normalized)
    || normalized === 'K'
    || normalized === 'DEF';
}

export function getEspnFantasyPlayerId(player, fallbackId = null) {
  const value = player?.espn_id ?? player?.sourceIds?.espn ?? fallbackId;
  const match = String(value ?? '').match(/(\d+)$/);
  return match ? match[1] : null;
}

function getScoringCacheKey(scoringSettings) {
  return JSON.stringify({
    settings: scoringSettings?.settings ?? scoringSettings ?? {},
    positionOverrides: scoringSettings?.positionOverrides ?? {},
  });
}

function escapeRegExp(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPlayerNamePatterns(playerName) {
  const parts = String(playerName ?? '').trim().split(/\s+/).filter(Boolean);
  const fullName = parts.join(' ');
  const lastName = parts.length > 1 ? parts.at(-1) : null;
  return [fullName, lastName]
    .filter(Boolean)
    .map(escapeRegExp);
}

function noteFieldGoalBucket(target, yards) {
  if (!Number.isFinite(yards)) return;
  target.fgm_yds = (target.fgm_yds ?? 0) + yards;
  target.fgm_yds_over_30 = (target.fgm_yds_over_30 ?? 0) + Math.max(0, yards - 30);
  if (yards < 20) {
    target.fgm_0_19 = (target.fgm_0_19 ?? 0) + 1;
    target.fgm_0_39 = (target.fgm_0_39 ?? 0) + 1;
  } else if (yards < 30) {
    target.fgm_20_29 = (target.fgm_20_29 ?? 0) + 1;
    target.fgm_0_39 = (target.fgm_0_39 ?? 0) + 1;
  } else if (yards < 40) {
    target.fgm_30_39 = (target.fgm_30_39 ?? 0) + 1;
    target.fgm_0_39 = (target.fgm_0_39 ?? 0) + 1;
  } else if (yards < 50) {
    target.fgm_40_49 = (target.fgm_40_49 ?? 0) + 1;
  } else if (yards < 60) {
    target.fgm_50_59 = (target.fgm_50_59 ?? 0) + 1;
  } else {
    target.fgm_60p = (target.fgm_60p ?? 0) + 1;
  }
}

function getKickerScoringPlayStats(scoringPlays, playerName) {
  const patterns = getPlayerNamePatterns(playerName);
  if (!patterns.length) return {};
  const namePattern = patterns.join('|');
  const fieldGoalPattern = new RegExp(`\\b(?:${namePattern})\\s+(\\d+)\\s+Yd\\s+Field Goal\\b`, 'i');
  const stats = {};

  for (const play of scoringPlays ?? []) {
    const text = String(play?.text ?? play?.displayText ?? '');
    const fieldGoalMatch = text.match(fieldGoalPattern);
    if (fieldGoalMatch) noteFieldGoalBucket(stats, Number(fieldGoalMatch[1]));
  }

  return stats;
}

async function applyKickerScoringPlayStats(rows, gameLog, playerName) {
  if (!rows.length) return rows;
  const statsByWeek = {};
  const results = await Promise.all(rows.map(async (row) => {
    const game = gameLog.find((candidate) => Number(candidate?.meta?.week) === Number(row.week));
    if (!game?.eventId || String(game.eventId).startsWith('bye_')) return null;
    const scoringPlays = await fetchEventScoringPlays(game.eventId).catch(() => []);
    const stats = getKickerScoringPlayStats(scoringPlays, playerName);
    return Object.keys(stats).length > 0 ? { week: row.week, stats } : null;
  }));

  for (const result of results) {
    if (result) statsByWeek[result.week] = result.stats;
  }

  if (!Object.keys(statsByWeek).length) return rows;
  return rows.map((row) => ({
    ...row,
    ...(statsByWeek[row.week] ?? {}),
  }));
}

export async function loadEspnFantasyGameLogRows({
  playerId,
  player,
  season,
  scoringSettings,
}) {
  const position = normalizeFantasyGameLogPosition(player?.position);
  const espnId = getEspnFantasyPlayerId(player, playerId);
  if (!season || !isEspnFantasyGameLogPosition(position)) return [];
  if (position === 'DEF' && !player?.team) return [];
  if (position !== 'DEF' && !espnId) return [];

  const cacheSubject = position === 'DEF'
    ? `${position}:${String(player.team).toUpperCase()}`
    : `${position}:${espnId}`;
  const cacheKey = `${season}:${cacheSubject}:${getScoringCacheKey(scoringSettings)}`;
  if (ESPN_FANTASY_GAME_LOG_CACHE.has(cacheKey)) return ESPN_FANTASY_GAME_LOG_CACHE.get(cacheKey);

  const loadRows = (async () => {
    const playerName = player?.full_name || `${player?.first_name ?? ''} ${player?.last_name ?? ''}`.trim();
    const gameLog = position === 'DEF'
      ? await fetchTeamDefenseGameLog(player.team, Number(season))
      : await fetchGameLog(espnId, player?.team, Number(season));
    let rows = buildFantasyRowsFromGameLog(gameLog, position);

    if (position === 'K') {
      rows = await applyKickerScoringPlayStats(rows, gameLog, playerName);
    }

    if (
      rows.length
      && ESPN_OFFENSE_FANTASY_GAME_LOG_POSITIONS.has(position)
      && hasEspnBigPlayTouchdownScoring(scoringSettings)
    ) {
      const scorer = {
        [PROFILE_FANTASY_PLAYER_ID]: {
          full_name: playerName,
          position,
        },
      };
      const bonusesByWeek = {};
      const scoringPlayResults = await Promise.all(rows.map(async (row) => {
        const game = gameLog.find((candidate) => Number(candidate?.meta?.week) === Number(row.week));
        if (!game?.eventId || String(game.eventId).startsWith('bye_')) return null;
        const scoringPlays = await fetchEventScoringPlays(game.eventId).catch(() => []);
        const bonuses = getEspnScoringPlayBigPlayBonuses(scoringPlays, scorer)[PROFILE_FANTASY_PLAYER_ID];
        return bonuses && Object.keys(bonuses).length > 0 ? { week: row.week, bonuses } : null;
      }));
      for (const result of scoringPlayResults) {
        if (result) bonusesByWeek[result.week] = result.bonuses;
      }
      rows = applyScoringPlayBonusesToFantasyRows(rows, bonusesByWeek);
    }

    return rows;
  })();

  ESPN_FANTASY_GAME_LOG_CACHE.set(cacheKey, loadRows);
  try {
    const rows = await loadRows;
    ESPN_FANTASY_GAME_LOG_CACHE.set(cacheKey, rows);
    return rows;
  } catch (error) {
    ESPN_FANTASY_GAME_LOG_CACHE.delete(cacheKey);
    throw error;
  }
}

export async function loadEspnFantasyGameLogWeekRow(args) {
  const rows = await loadEspnFantasyGameLogRows(args);
  const week = Number(args?.week);
  if (!Number.isFinite(week)) return null;
  return rows.find((row) => Number(row?.week) === week && !row?._isPostseason) ?? null;
}
