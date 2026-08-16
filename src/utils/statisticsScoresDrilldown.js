export const STATISTICS_SCORES_DRILLDOWN_STATUSES = Object.freeze([
  'final',
  'live',
  'halftime',
  'delayed',
]);

const DRILLDOWN_STATUS_SET = new Set(STATISTICS_SCORES_DRILLDOWN_STATUSES);

export function isStatisticsScoresDrilldownStatus(status) {
  return DRILLDOWN_STATUS_SET.has(String(status ?? '').trim().toLowerCase());
}
