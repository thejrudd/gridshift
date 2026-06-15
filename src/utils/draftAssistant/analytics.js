const COMPARE_LIMIT = 4;
const SCATTER_LIMIT = 180;

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

export const DRAFT_ANALYTICS_AXIS_OPTIONS = [
  { id: 'rating', label: 'Rating' },
  { id: 'market', label: 'Market' },
  { id: 'ppg', label: 'PPG' },
  { id: 'workload', label: 'Workload' },
  { id: 'rosterNeed', label: 'Need' },
];

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
    getValue: (player) => toFiniteNumber(player?.workload?.ppg ?? player?.scoringFit?.pastPpg),
    formatValue: (value) => formatNumber(value, 1),
  },
  workload: {
    label: 'Workload',
    higherIsBetter: true,
    getValue: (player) => toFiniteNumber(player?.workload?.primaryVolume),
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

export function buildDraftAnalyticsSnapshot(player) {
  if (!player) return [];
  return [
    {
      key: 'rating',
      label: 'Rating',
      value: formatNumber(player?.draftModel?.score, 1),
      detail: 'GridShift',
      score: clamp(player?.draftModel?.score),
    },
    {
      key: 'market',
      label: 'Market',
      value: formatRank(getMarketRank(player)),
      detail: player?.rank?.sourceLabel ?? player?.projection?.fallbackLabel ?? 'Rank',
      score: getComponentScore(player, 'marketRank'),
    },
    {
      key: 'ppg',
      label: 'PPG',
      value: formatNumber(player?.workload?.ppg ?? player?.scoringFit?.pastPpg, 1),
      detail: 'Past season',
      score: getComponentScore(player, 'pastProduction'),
    },
    {
      key: 'workload',
      label: getWorkloadLabel(player),
      value: formatNumber(player?.workload?.primaryVolume, 0),
      detail: 'Volume',
      score: getComponentScore(player, 'workload'),
    },
    {
      key: 'need',
      label: 'Need',
      value: formatPercent(getRosterNeedPercent(player)),
      detail: 'Roster fit',
      score: getComponentScore(player, 'rosterNeed'),
    },
  ];
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
  const pinnedIds = new Set((pinnedPlayerIds ?? []).map((id) => String(id)));
  const focusedPosition = String(focused?.position ?? '').toUpperCase();
  const samePositionPeers = uniquePlayers(candidates).filter((player) => {
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
  const xDef = getDraftAnalyticsAxisDefinition(xAxis);
  const yDef = getDraftAnalyticsAxisDefinition(yAxis);
  const xDomain = buildDomain(plottedCandidates.map((player) => xDef.getValue(player)));
  const yDomain = buildDomain(plottedCandidates.map((player) => yDef.getValue(player)));
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
    xAxis: { id: xAxis, label: xDef.label, domain: xDomain },
    yAxis: { id: yAxis, label: yDef.label, domain: yDomain },
    points,
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
        value: formatNumber(player?.workload?.ppg ?? player?.scoringFit?.pastPpg, 1),
        score: getComponentScore(player, 'pastProduction'),
      }),
    },
    {
      key: 'workload',
      label: 'Workload',
      getCell: (player) => ({
        value: formatNumber(player?.workload?.primaryVolume, 0),
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
