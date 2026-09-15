import { buildFantasyScoringBreakdown, mergeOfficialFantasyTotal } from './fantasyBreakdownRows.js';

const BREAKDOWN_EPSILON = 0.01;

function roundPoints(value) {
  return Math.round(Number(value) * 100) / 100;
}

function getFiniteNumber(value) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getPlayer(players, playerId) {
  return players?.[playerId] ?? players?.[String(playerId)] ?? null;
}

function getPlayerPoints(playerPoints, playerId) {
  if (!playerPoints || !Object.prototype.hasOwnProperty.call(playerPoints, playerId)) return null;
  return getFiniteNumber(playerPoints[playerId]);
}

function getWeekEntry(weeklyStats, playerId, week) {
  return (weeklyStats?.[playerId] ?? weeklyStats?.[String(playerId)] ?? [])
    .find((entry) => Number(entry?.week) === Number(week)) ?? null;
}

function getPlayerName(player, playerId) {
  return player?.full_name
    || `${player?.first_name ?? ''} ${player?.last_name ?? ''}`.trim()
    || String(playerId);
}

function addCategoryRow(rowsByKey, row) {
  const existing = rowsByKey.get(row.key);
  if (!existing) {
    rowsByKey.set(row.key, {
      ...row,
      pts: Number(row.pts),
      statVal: row.statVal == null ? null : Number(row.statVal),
      hasStatValue: row.statVal != null,
    });
    return;
  }

  existing.pts += Number(row.pts) || 0;
  if (row.statVal != null) {
    existing.statVal = (existing.statVal ?? 0) + Number(row.statVal);
    existing.hasStatValue = true;
  }
}

function finalizeCategoryRows(rowsByKey) {
  return Array.from(rowsByKey.values())
    .map(({ hasStatValue, ...row }) => ({
      ...row,
      pts: roundPoints(row.pts),
      statVal: hasStatValue ? roundPoints(row.statVal) : null,
    }))
    .sort((left, right) => Math.abs(right.pts) - Math.abs(left.pts));
}

/**
 * Assemble the two views of a Fantasy Matchups team scoring sheet.
 *
 * Matchup player points are authoritative when available. Raw weekly stats
 * explain those points, with an explicit adjustment row preserving any
 * provider scoring that raw stats cannot represent.
 */
export function buildFantasyMatchupScoringBreakdown({
  playerIds = [],
  playerPoints = null,
  teamTotal = null,
  week,
  weeklyStats = null,
  players = null,
  scoringSettings = null,
  derivedRowsByPlayerId = {},
} = {}) {
  const categories = new Map();
  const playerRows = [];
  let calculatedTotal = 0;
  let hasCalculatedTotal = false;

  for (const playerId of playerIds) {
    const player = getPlayer(players, playerId);
    const officialPoints = getPlayerPoints(playerPoints, playerId);
    const weeklyEntry = getWeekEntry(weeklyStats, playerId, week);
    const derivedEntry = derivedRowsByPlayerId?.[playerId] ?? derivedRowsByPlayerId?.[String(playerId)] ?? null;
    const entry = derivedEntry
      ? mergeOfficialFantasyTotal(weeklyEntry, derivedEntry)
      : weeklyEntry;
    const breakdown = entry
      ? buildFantasyScoringBreakdown(entry, scoringSettings, player?.position ?? null, {
          authoritativeTotal: officialPoints ?? undefined,
          preferRawStats: Boolean(derivedEntry),
          adjustmentKey: 'other_adjustments',
          adjustmentLabel: 'Other Scoring Adjustments',
        })
      : officialPoints != null
        ? buildFantasyScoringBreakdown({ _fantasyPoints: officialPoints, fantasy_points: officialPoints }, scoringSettings, player?.position ?? null, {
            authoritativeTotal: officialPoints,
            adjustmentKey: 'other_adjustments',
            adjustmentLabel: 'Other Scoring Adjustments',
          })
        : null;

    const points = officialPoints ?? breakdown?.total ?? null;
    if (points != null) {
      calculatedTotal += points;
      hasCalculatedTotal = true;
    }

    if (breakdown) {
      for (const row of breakdown.rows) addCategoryRow(categories, row);
    }

    playerRows.push({
      id: playerId,
      name: getPlayerName(player, playerId),
      position: player?.position ?? null,
      team: player?.team ?? null,
      player,
      points,
      breakdown: breakdown?.rows ?? [],
      pointSource: officialPoints != null ? 'reported' : breakdown ? 'calculated' : 'unavailable',
    });
  }

  const reportedTeamTotal = getFiniteNumber(teamTotal);
  const total = reportedTeamTotal ?? (hasCalculatedTotal ? roundPoints(calculatedTotal) : null);
  const categoryRows = finalizeCategoryRows(categories);
  const categoryTotal = roundPoints(categoryRows.reduce((sum, row) => sum + row.pts, 0));
  const categoryAdjustment = total == null ? null : roundPoints(total - categoryTotal);

  if (categoryAdjustment != null && Math.abs(categoryAdjustment) >= BREAKDOWN_EPSILON) {
    addCategoryRow(categories, {
      key: 'other_adjustments',
      label: 'Other Scoring Adjustments',
      statVal: null,
      pts: categoryAdjustment,
    });
  }

  const finalizedCategoryRows = finalizeCategoryRows(categories);
  const playerTotal = roundPoints(playerRows.reduce((sum, row) => sum + (row.points ?? 0), 0));
  const playerAdjustment = total == null ? null : roundPoints(total - playerTotal);
  if (playerAdjustment != null && Math.abs(playerAdjustment) >= BREAKDOWN_EPSILON) {
    playerRows.push({
      id: 'team-scoring-adjustment',
      name: 'Other Scoring Adjustments',
      position: null,
      team: null,
      player: null,
      points: playerAdjustment,
      breakdown: [],
      pointSource: 'adjustment',
      isAdjustment: true,
    });
  }

  playerRows.sort((left, right) => {
    if (left.points == null && right.points == null) return 0;
    if (left.points == null) return 1;
    if (right.points == null) return -1;
    return right.points - left.points;
  });

  return {
    categoryRows: finalizedCategoryRows,
    playerRows,
    total,
    categoryTotal: roundPoints(finalizedCategoryRows.reduce((sum, row) => sum + row.pts, 0)),
    calculatedTotal: hasCalculatedTotal ? roundPoints(calculatedTotal) : null,
  };
}
