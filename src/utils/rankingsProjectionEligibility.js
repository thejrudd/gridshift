import { getAvailabilityProjectionFactor } from './starterProjections.js';
import { isWaiverEligiblePlayerRecord } from './playerEligibility.js';

/**
 * Resolves the known reasons a player should not receive a weekly Rankings
 * projection. Missing schedule or depth-chart data stays unknown rather than
 * being treated as a bye or a backup role.
 */
export function getRankingsProjectionEligibility({ player, position, week, scheduleMap } = {}) {
  if (!player) return { eligible: false, reason: 'missing-player', availabilityFactor: 0 };

  const team = String(player.team ?? '').trim().toUpperCase();
  const weekSchedule = scheduleMap?.[week];
  const weekHasGames = weekSchedule && Object.keys(weekSchedule).length > 0;
  if (weekHasGames && team && team !== 'FA' && !weekSchedule[team]) {
    return { eligible: false, reason: 'bye', availabilityFactor: 0 };
  }

  if (!isWaiverEligiblePlayerRecord(player)) {
    return { eligible: false, reason: 'inactive-player', availabilityFactor: 0 };
  }

  const availability = getAvailabilityProjectionFactor(player);
  if (availability.factor === 0) {
    return {
      eligible: false,
      reason: 'unavailable',
      availabilityFactor: 0,
      availabilityStatus: availability.status,
    };
  }

  const depthChartOrder = player.depth_chart_order == null || String(player.depth_chart_order).trim() === ''
    ? NaN
    : Number(player.depth_chart_order);
  if (String(position ?? player.position ?? '').trim().toUpperCase() === 'QB'
    && Number.isFinite(depthChartOrder)
    && depthChartOrder > 1) {
    return { eligible: false, reason: 'backup-qb', availabilityFactor: 0 };
  }

  return {
    eligible: true,
    reason: null,
    availabilityFactor: availability.factor,
    availabilityStatus: availability.status,
  };
}
