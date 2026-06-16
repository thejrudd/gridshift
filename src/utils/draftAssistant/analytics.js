const COMPARE_LIMIT = 4;
const SCATTER_LIMIT = 180;
const POSITIONAL_MAP_MAX_MARKET_RANK = 300;
const POSITIONAL_MAP_SENTINEL_RANK = 999;
const POSITIONAL_MAP_MIN_MARKET_VALUE = 2;
const POSITIONAL_MAP_MIN_MODEL_SCORE = 40;
const POSITIONAL_MAP_MIN_SIGNAL_SCORE = 35;
const POSITIONAL_MAP_MIN_PPG = 3;
const POSITIONAL_MAP_MIN_VOLUME = 20;

function toFiniteNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min = 0, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.min(max, parsed));
}

function roundTo(value, precision = 1) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const factor = 10 ** precision;
  return Math.round(parsed * factor) / factor;
}

function formatNumber(value, precision = 1) {
  const rounded = roundTo(value, precision);
  if (rounded == null) return '—';
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(precision);
}

function formatRank(value) {
  const rank = toFiniteNumber(value);
  if (rank == null) return '—';
  return `#${Math.round(rank)}`;
}

function formatPercent(value) {
  const rounded = roundTo(value, 0);
  return rounded == null ? '—' : `${rounded}%`;
}

function getMarketRank(player) {
  return toFiniteNumber(
    player?.projection?.marketRank
    ?? player?.rank?.overallRank
    ?? player?.projection?.fallbackRank
    ?? player?.projection?.searchRank,
  );
}

function getAnyMarketRank(player) {
  return toFiniteNumber(
    player?.projection?.marketRank
    ?? player?.rank?.overallRank
    ?? player?.projection?.fallbackRank
    ?? player?.projection?.searchRank
    ?? player?.raw?.search_rank,
  );
}

function getWorkloadLabel(player) {
  const position = String(player?.position ?? '').toUpperCase();
  if (position === 'QB') return 'Attempts';
  if (position === 'RB') return 'Touches';
  if (position === 'WR' || position === 'TE') return 'Targets';
  if (position === 'DL' || position === 'LB' || position === 'DB') return 'Tackles';
  return 'Volume';
}

function getTrendLabel(player) {
  const trend = player?.rank?.trend ?? player?.workload?.trend ?? null;
  return trend?.label ?? 'Flat';
}

function getTierLabel(player) {
  const tier = toFiniteNumber(player?.rank?.tier);
  return tier == null ? '—' : `T${Math.round(tier)}`;
}

function getRosterNeedPercent(player) {
  const value = toFiniteNumber(player?.draftRoom?.teamNeed);
  return value == null ? null : value * 100;
}

function parseDraftInteger(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function firstDraftInteger(...values) {
  for (const value of values) {
    const parsed = parseDraftInteger(value);
    if (parsed != null) return parsed;
  }
  return null;
}

export function isDraftAnalyticsRookie(player) {
  const raw = player?.raw ?? player ?? {};
  const metadata = raw?.metadata ?? {};
  const rookieFlag = player?.rookie ?? player?.isRookie ?? raw?.rookie ?? raw?.isRookie ?? metadata?.rookie;
  if (rookieFlag === true || normalizeStatusValue(rookieFlag) === 'true') return true;

  const yearsExp = firstDraftInteger(
    raw.years_exp,
    raw.yearsExp,
    raw.experience,
    metadata.years_exp,
    metadata.yearsExp,
    metadata.experience,
    player?.years_exp,
    player?.yearsExp,
    player?.experience,
  );
  return yearsExp === 0;
}

function getPastPpg(player) {
  return isDraftAnalyticsRookie(player)
    ? null
    : toFiniteNumber(player?.workload?.ppg ?? player?.scoringFit?.pastPpg);
}

function getPrimaryVolume(player) {
  return isDraftAnalyticsRookie(player)
    ? null
    : toFiniteNumber(player?.workload?.primaryVolume);
}

function formatPastProductionValue(player) {
  return isDraftAnalyticsRookie(player) ? 'N/A' : formatNumber(getPastPpg(player), 1);
}

function formatPrimaryVolumeValue(player) {
  return isDraftAnalyticsRookie(player) ? 'N/A' : formatNumber(getPrimaryVolume(player), 0);
}

const POSITIONAL_MAP_EXCLUDED_STATUS_PATTERNS = [
  'inactive',
  'practice squad',
  'practice-squad',
  'retired',
  'reserve',
  'injured reserve',
  'reserve/injured',
  'physically unable',
  'pup',
  'non football',
  'nfi',
  'exempt',
  'suspend',
];

function normalizeStatusValue(value) {
  return String(value ?? '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function collectStatusValues(player) {
  return [
    player?.status,
    player?.injury_status,
    player?.injuryStatus,
    player?.metadata?.status,
    player?.raw?.status,
    player?.raw?.injury_status,
    player?.raw?.injuryStatus,
    player?.raw?.metadata?.status,
  ].map(normalizeStatusValue).filter(Boolean);
}

function isFalseLike(value) {
  return value === false || normalizeStatusValue(value) === 'false';
}

function isPositionalMapEligible(player) {
  if (!player) return false;
  if (isFalseLike(player?.active) || isFalseLike(player?.raw?.active)) return false;
  const statuses = collectStatusValues(player);
  if (statuses.some((status) => (
    POSITIONAL_MAP_EXCLUDED_STATUS_PATTERNS.some((pattern) => status.includes(pattern))
  ))) return false;

  const marketRank = getAnyMarketRank(player);
  if (marketRank != null) {
    return marketRank > 0
      && marketRank < POSITIONAL_MAP_SENTINEL_RANK
      && marketRank <= POSITIONAL_MAP_MAX_MARKET_RANK;
  }

  const marketValue = toFiniteNumber(player?.projection?.marketValue);
  if (marketValue != null) return marketValue >= POSITIONAL_MAP_MIN_MARKET_VALUE;

  const modelScore = toFiniteNumber(player?.draftModel?.score);
  if (modelScore != null && modelScore >= POSITIONAL_MAP_MIN_MODEL_SCORE) return true;

  const productionScore = toFiniteNumber(player?.draftModel?.components?.pastProduction);
  const workloadScore = toFiniteNumber(player?.draftModel?.components?.workload);
  if (
    (productionScore != null && productionScore >= POSITIONAL_MAP_MIN_SIGNAL_SCORE)
    || (workloadScore != null && workloadScore >= POSITIONAL_MAP_MIN_SIGNAL_SCORE)
  ) return true;

  const ppg = getPastPpg(player);
  const volume = getPrimaryVolume(player);
  return (ppg != null && ppg >= POSITIONAL_MAP_MIN_PPG)
    || (volume != null && volume >= POSITIONAL_MAP_MIN_VOLUME);
}

export const DRAFT_ANALYTICS_AXIS_OPTIONS = [
  { id: 'rating', label: 'Rating' },
  { id: 'market', label: 'Market' },
  { id: 'ppg', label: 'PPG' },
  { id: 'workload', label: 'Workload' },
  { id: 'rosterNeed', label: 'Need' },
];

const ROOKIE_UNAVAILABLE_AXIS_IDS = new Set(['ppg', 'workload']);

export function getDraftAnalyticsAxisOptions(player) {
  if (!isDraftAnalyticsRookie(player)) return DRAFT_ANALYTICS_AXIS_OPTIONS;
  return DRAFT_ANALYTICS_AXIS_OPTIONS.filter((option) => !ROOKIE_UNAVAILABLE_AXIS_IDS.has(option.id));
}

export function normalizeDraftAnalyticsAxisPair(player, xAxis = 'market', yAxis = 'rating') {
  const availableIds = new Set(getDraftAnalyticsAxisOptions(player).map((option) => option.id));
  let nextXAxis = availableIds.has(xAxis) ? xAxis : 'market';
  let nextYAxis = availableIds.has(yAxis) ? yAxis : 'rating';

  if (!availableIds.has(nextXAxis)) nextXAxis = DRAFT_ANALYTICS_AXIS_OPTIONS.find((option) => availableIds.has(option.id))?.id ?? 'rating';
  if (!availableIds.has(nextYAxis)) nextYAxis = DRAFT_ANALYTICS_AXIS_OPTIONS.find((option) => availableIds.has(option.id) && option.id !== nextXAxis)?.id ?? nextXAxis;
  if (nextXAxis === nextYAxis) {
    nextYAxis = DRAFT_ANALYTICS_AXIS_OPTIONS.find((option) => availableIds.has(option.id) && option.id !== nextXAxis)?.id ?? nextYAxis;
  }

  return { xAxis: nextXAxis, yAxis: nextYAxis };
}

const AXIS_DEFINITIONS = {
  rating: {
    label: 'Rating',
    higherIsBetter: true,
    getValue: (player) => toFiniteNumber(player?.draftModel?.score),
    formatValue: (value) => formatNumber(value, 1),
  },
  market: {
    label: 'Market',
    higherIsBetter: false,
    getValue: getMarketRank,
    formatValue: formatRank,
  },
  ppg: {
    label: 'PPG',
    higherIsBetter: true,
    getValue: getPastPpg,
    formatValue: (value) => formatNumber(value, 1),
  },
  workload: {
    label: 'Workload',
    higherIsBetter: true,
    getValue: getPrimaryVolume,
    formatValue: (value) => formatNumber(value, 0),
  },
  rosterNeed: {
    label: 'Need',
    higherIsBetter: true,
    getValue: (player) => {
      const value = toFiniteNumber(player?.draftRoom?.teamNeed);
      return value == null ? null : value * 100;
    },
    formatValue: formatPercent,
  },
};

export function getDraftAnalyticsAxisDefinition(axisId) {
  return AXIS_DEFINITIONS[axisId] ?? AXIS_DEFINITIONS.rating;
}

function getComponentScore(player, key) {
  if (isDraftAnalyticsRookie(player) && (key === 'pastProduction' || key === 'workload')) return null;
  return clamp(player?.draftModel?.components?.[key]);
}

function buildDomain(values) {
  const finite = values.map(toFiniteNumber).filter((value) => value != null);
  if (!finite.length) return null;
  return {
    min: Math.min(...finite),
    max: Math.max(...finite),
  };
}

function normalizeToAxis(value, domain, higherIsBetter = true) {
  const parsed = toFiniteNumber(value);
  if (parsed == null || !domain) return null;
  if (domain.max === domain.min) return 50;
  const ratio = (parsed - domain.min) / (domain.max - domain.min);
  return clamp((higherIsBetter ? ratio : 1 - ratio) * 100);
}

function buildAxisEndpointLabels(domain, definition) {
  if (!domain) {
    return {
      minLabel: '0',
      maxLabel: '100',
    };
  }
  const lowEndValue = definition.higherIsBetter ? domain.min : domain.max;
  const highEndValue = definition.higherIsBetter ? domain.max : domain.min;
  return {
    minLabel: definition.formatValue(lowEndValue),
    maxLabel: definition.formatValue(highEndValue),
  };
}

function uniquePlayers(players) {
  const seen = new Set();
  const result = [];
  for (const player of players ?? []) {
    const id = String(player?.id ?? '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(player);
  }
  return result;
}

function rankWithinPool(player, pool, getValue, higherIsBetter = true) {
  const playerId = String(player?.id ?? '');
  const ranked = uniquePlayers(pool)
    .map((candidate) => ({ player: candidate, value: toFiniteNumber(getValue(candidate)) }))
    .filter((item) => item.value != null)
    .sort((a, b) => (higherIsBetter ? b.value - a.value : a.value - b.value));
  const index = ranked.findIndex((item) => String(item.player?.id ?? '') === playerId);
  return index >= 0 ? index + 1 : null;
}

function isFairValueAxisPair(xAxis, yAxis) {
  const pair = new Set([xAxis, yAxis]);
  return pair.has('market') && pair.has('rating');
}

function buildScatterReferenceLine(points, xAxis, yAxis) {
  if (isFairValueAxisPair(xAxis, yAxis)) {
    return {
      kind: 'fair',
      label: 'Fair value',
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 100,
    };
  }

  const peerPoints = points.filter((point) => !point.focused && !point.pinned);
  const regressionPoints = peerPoints.length >= 3 ? peerPoints : points;
  if (regressionPoints.length < 3) return null;

  const sample = regressionPoints
    .map((point) => ({ x: toFiniteNumber(point.x), y: toFiniteNumber(point.y) }))
    .filter((point) => point.x != null && point.y != null);
  if (sample.length < 3) return null;

  const meanX = sample.reduce((sum, point) => sum + point.x, 0) / sample.length;
  const meanY = sample.reduce((sum, point) => sum + point.y, 0) / sample.length;
  const denominator = sample.reduce((sum, point) => sum + ((point.x - meanX) ** 2), 0);
  if (denominator <= 0.0001) return null;

  const slope = sample.reduce((sum, point) => sum + ((point.x - meanX) * (point.y - meanY)), 0) / denominator;
  const intercept = meanY - (slope * meanX);
  const minX = Math.min(...sample.map((point) => point.x));
  const maxX = Math.max(...sample.map((point) => point.x));
  if (maxX - minX <= 0.0001) return null;

  return {
    kind: 'trend',
    label: 'Trend',
    x1: clamp(minX),
    y1: clamp((slope * minX) + intercept),
    x2: clamp(maxX),
    y2: clamp((slope * maxX) + intercept),
  };
}

export function buildDraftAnalyticsSnapshot(player, candidates = []) {
  if (!player) return [];
  const position = String(player?.position ?? '').toUpperCase();
  const peerPool = uniquePlayers(candidates).filter((candidate) => {
    if (!isPositionalMapEligible(candidate)) return false;
    if (!position) return true;
    return String(candidate?.position ?? '').toUpperCase() === position;
  });
  const rows = [
    {
      key: 'rating',
      label: 'Rating',
      value: formatNumber(player?.draftModel?.score, 1),
      detail: 'GridShift',
      score: clamp(player?.draftModel?.score),
      rankValue: AXIS_DEFINITIONS.rating.getValue,
      higherIsBetter: AXIS_DEFINITIONS.rating.higherIsBetter,
    },
    {
      key: 'market',
      label: 'Market',
      value: formatRank(getMarketRank(player)),
      detail: player?.rank?.sourceLabel ?? player?.projection?.fallbackLabel ?? 'Rank',
      score: getComponentScore(player, 'marketRank'),
      rankValue: AXIS_DEFINITIONS.market.getValue,
      higherIsBetter: AXIS_DEFINITIONS.market.higherIsBetter,
    },
    {
      key: 'ppg',
      label: 'PPG',
      value: formatPastProductionValue(player),
      detail: 'Past season',
      score: getComponentScore(player, 'pastProduction'),
      rankValue: AXIS_DEFINITIONS.ppg.getValue,
      higherIsBetter: AXIS_DEFINITIONS.ppg.higherIsBetter,
    },
    {
      key: 'workload',
      label: getWorkloadLabel(player),
      value: formatPrimaryVolumeValue(player),
      detail: 'Volume',
      score: getComponentScore(player, 'workload'),
      rankValue: AXIS_DEFINITIONS.workload.getValue,
      higherIsBetter: AXIS_DEFINITIONS.workload.higherIsBetter,
    },
    {
      key: 'need',
      label: 'Need',
      value: formatPercent(getRosterNeedPercent(player)),
      detail: 'Roster fit',
      score: getComponentScore(player, 'rosterNeed'),
      rankValue: AXIS_DEFINITIONS.rosterNeed.getValue,
      higherIsBetter: AXIS_DEFINITIONS.rosterNeed.higherIsBetter,
    },
  ];

  return rows.map(({ rankValue, higherIsBetter, ...row }) => ({
    ...row,
    rank: peerPool.length ? rankWithinPool(player, peerPool, rankValue, higherIsBetter) : null,
    peerCount: peerPool.length,
  }));
}

export function buildDraftAnalyticsScatter({
  candidates = [],
  focusedPlayerId,
  pinnedPlayerIds = [],
  xAxis = 'market',
  yAxis = 'rating',
  limit = SCATTER_LIMIT,
} = {}) {
  const playersById = new Map(uniquePlayers(candidates).map((player) => [String(player.id), player]));
  const focused = playersById.get(String(focusedPlayerId ?? '')) ?? null;
  const normalizedAxisPair = normalizeDraftAnalyticsAxisPair(focused, xAxis, yAxis);
  const normalizedXAxis = normalizedAxisPair.xAxis;
  const normalizedYAxis = normalizedAxisPair.yAxis;
  const pinnedIds = new Set((pinnedPlayerIds ?? []).map((id) => String(id)));
  const focusedPosition = String(focused?.position ?? '').toUpperCase();
  const samePositionPeers = uniquePlayers(candidates).filter((player) => {
    if (!isPositionalMapEligible(player)) return false;
    if (!focusedPosition) return true;
    return String(player?.position ?? '').toUpperCase() === focusedPosition;
  });
  const priorityPlayers = uniquePlayers([
    focused,
    ...(pinnedPlayerIds ?? []).map((id) => playersById.get(String(id))).filter(Boolean),
  ].filter(Boolean));
  const priorityIds = new Set(priorityPlayers.map((player) => String(player.id)));
  const peerLimit = Math.max(0, limit - priorityPlayers.length);
  const limitedPeers = samePositionPeers
    .filter((player) => !priorityIds.has(String(player.id)))
    .slice(0, peerLimit);
  const plottedCandidates = uniquePlayers([...priorityPlayers, ...limitedPeers]);
  const xDef = getDraftAnalyticsAxisDefinition(normalizedXAxis);
  const yDef = getDraftAnalyticsAxisDefinition(normalizedYAxis);
  const xDomain = buildDomain(plottedCandidates.map((player) => xDef.getValue(player)));
  const yDomain = buildDomain(plottedCandidates.map((player) => yDef.getValue(player)));
  const xEndpointLabels = buildAxisEndpointLabels(xDomain, xDef);
  const yEndpointLabels = buildAxisEndpointLabels(yDomain, yDef);
  let unavailableCount = 0;
  const points = plottedCandidates.map((player) => {
    const xValue = xDef.getValue(player);
    const yValue = yDef.getValue(player);
    const x = normalizeToAxis(xValue, xDomain, xDef.higherIsBetter);
    const y = normalizeToAxis(yValue, yDomain, yDef.higherIsBetter);
    if (x == null || y == null) {
      unavailableCount += 1;
      return null;
    }
    const id = String(player.id);
    return {
      id,
      name: player.name ?? 'Player',
      position: player.position ?? '',
      team: player.team ?? '',
      x,
      y,
      xRaw: xValue,
      yRaw: yValue,
      xLabel: xDef.formatValue(xValue),
      yLabel: yDef.formatValue(yValue),
      focused: focused ? id === String(focused.id) : false,
      pinned: pinnedIds.has(id),
    };
  }).filter(Boolean);

  return {
    xAxis: {
      id: normalizedXAxis,
      label: xDef.label,
      domain: xDomain,
      minLabel: xEndpointLabels.minLabel,
      maxLabel: xEndpointLabels.maxLabel,
    },
    yAxis: {
      id: normalizedYAxis,
      label: yDef.label,
      domain: yDomain,
      minLabel: yEndpointLabels.minLabel,
      maxLabel: yEndpointLabels.maxLabel,
    },
    points,
    referenceLine: buildScatterReferenceLine(points, normalizedXAxis, normalizedYAxis),
    unavailableCount,
    peerCount: samePositionPeers.length,
    renderedCount: plottedCandidates.length,
  };
}

export function buildDraftAnalyticsCompareRows(players = []) {
  const comparePlayers = uniquePlayers(players).slice(0, COMPARE_LIMIT);
  const rows = [
    {
      key: 'rating',
      label: 'Rating',
      getCell: (player) => ({
        value: formatNumber(player?.draftModel?.score, 1),
        score: clamp(player?.draftModel?.score),
      }),
    },
    {
      key: 'market',
      label: 'Market',
      getCell: (player) => ({
        value: formatRank(getMarketRank(player)),
        score: getComponentScore(player, 'marketRank'),
      }),
    },
    {
      key: 'ppg',
      label: 'PPG',
      getCell: (player) => ({
        value: formatPastProductionValue(player),
        score: getComponentScore(player, 'pastProduction'),
      }),
    },
    {
      key: 'workload',
      label: 'Workload',
      getCell: (player) => ({
        value: formatPrimaryVolumeValue(player),
        score: getComponentScore(player, 'workload'),
      }),
    },
    {
      key: 'need',
      label: 'Need',
      getCell: (player) => ({
        value: formatPercent(getRosterNeedPercent(player)),
        score: getComponentScore(player, 'rosterNeed'),
      }),
    },
    {
      key: 'schedule',
      label: 'Schedule',
      getCell: (player) => ({
        value: player?.schedule?.label && player.schedule.label !== 'Unavailable' ? player.schedule.label : '—',
        score: getComponentScore(player, 'schedule'),
      }),
    },
    {
      key: 'tier',
      label: 'Tier',
      getCell: (player) => {
        const tier = toFiniteNumber(player?.rank?.tier);
        return {
          value: getTierLabel(player),
          score: tier == null ? null : clamp(((6 - tier) / 5) * 100),
        };
      },
    },
    {
      key: 'trend',
      label: 'Trend',
      getCell: (player) => {
        const direction = player?.rank?.trend?.direction ?? player?.workload?.trend?.direction;
        return {
          value: getTrendLabel(player),
          score: direction === 'up' ? 76 : direction === 'down' ? 28 : 50,
        };
      },
    },
  ];

  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    cells: comparePlayers.map((player) => ({
      playerId: String(player.id),
      ...row.getCell(player),
    })),
  }));
}

export function getDraftAnalyticsCompareLimit() {
  return COMPARE_LIMIT;
}
