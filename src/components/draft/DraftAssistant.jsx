import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getDraft, getDraftPicks, getDraftTradedPicks, getLeagueDrafts } from '../../api/sleeperApi.js';
import { useSleeperBase } from '../../context/SleeperContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { fetchLeagueLogsMarketForLeague } from '../../api/leagueLogsApi.js';
import CompanionPlayerRow, {
  CompanionPlayerAction,
  CompanionPlayerMetric,
  CompanionPlayerStatus,
} from '../companion/CompanionPlayerRow.jsx';
import {
  DEFAULT_DRAFT_MODEL_WEIGHTS,
  buildDraftAssistantViewModel,
  buildPickOrder,
  getDraftStatsSeason,
  normalizeDraftModelWeights,
  normalizeDraftPick,
  rebalanceDraftModelWeights,
} from '../../utils/draftAssistant/index.js';

const BOARD_STORAGE_PREFIX = 'draft_assistant_position_board_v2';
const LEGACY_BOARD_STORAGE_PREFIX = 'draft_assistant_board_v1';
const MODEL_STORAGE_PREFIX = 'draft_assistant_model_weights_v2';
const POLL_MS = 15_000;
const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB'];
const MODEL_WEIGHT_CONTROLS = [
  { key: 'marketRank', label: 'Market', description: 'How much the model follows external draft cost and market rank. Higher values keep recommendations closer to external market signals.' },
  { key: 'pastProduction', label: 'PPG', description: 'How much recent fantasy points per game matter. Higher values favor players who already produced efficient weekly scoring.' },
  { key: 'scoringFit', label: 'Scoring', description: 'How much your league scoring settings matter. Higher values favor players whose position and stat profile fit the active scoring rules.' },
  { key: 'rosterNeed', label: 'Need', description: 'How much your roster construction matters. Higher values push recommendations toward positions where your team needs depth or starters.' },
];
const MODEL_WEIGHT_MIN = 0;
const MODEL_WEIGHT_MAX = 100;
const BOARD_SCOPE_OPTIONS = [
  { id: 'available', label: 'Available' },
  { id: 'all', label: 'All Players' },
];
const MY_BOARD_SORT_OPTIONS = [
  { id: 'position', label: 'Position' },
  { id: 'overall', label: 'Overall' },
];
const BIG_BOARD_SORT_COLUMNS = [
  { key: 'player', label: 'Player', defaultDirection: 'asc' },
  { key: 'rank', label: 'Rank', defaultDirection: 'asc' },
  { key: 'rating', label: 'Rating', defaultDirection: 'desc' },
  { key: 'ppg', label: 'PPG', defaultDirection: 'desc' },
  { key: 'volume', label: 'Vol', defaultDirection: 'desc' },
  { key: 'tier', label: 'Tier', defaultDirection: 'asc' },
  { key: 'trend', label: 'Trend', defaultDirection: 'desc' },
];
const BIG_BOARD_ROW_GRID_TEMPLATE = '34px 32px minmax(220px,1.2fr) 32px minmax(390px,2fr) 16px 76px';
const BIG_BOARD_COMPACT_ROW_GRID_TEMPLATE = BIG_BOARD_ROW_GRID_TEMPLATE;
const BIG_BOARD_METRIC_GRID_TEMPLATE = 'repeat(6, minmax(50px, 1fr))';
const FUTURE_VIEW_LABELS = {
  gauntlet: 'Gauntlet',
  'tiers-runs': 'Tiers/Runs',
};

function normalizePosition(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'DST') return 'DEF';
  if (normalized === 'DE' || normalized === 'DT') return 'DL';
  if (normalized === 'CB' || normalized === 'S' || normalized === 'SS' || normalized === 'FS') return 'DB';
  if (normalized === 'ILB' || normalized === 'OLB') return 'LB';
  return normalized || 'FLEX';
}

function normalizeDraftType(draft) {
  return String(draft?.type ?? draft?.settings?.type ?? 'snake').toLowerCase();
}

function isLiveDraftStatus(status) {
  const normalized = String(status ?? '').toLowerCase();
  return normalized === 'drafting' || normalized === 'in_progress';
}

function isPreDraftStatus(status) {
  return String(status ?? '').toLowerCase() === 'pre_draft';
}

function getDraftPollingStatus(draft) {
  return String(draft?.status ?? '').toLowerCase();
}

function getBoardStorageKey({ leagueId, season, draftId }) {
  return `${BOARD_STORAGE_PREFIX}:${leagueId ?? 'none'}:${season ?? 'unknown'}:${draftId ?? 'none'}`;
}

function getLegacyBoardStorageKey(leagueId, season) {
  return `${LEGACY_BOARD_STORAGE_PREFIX}:${leagueId ?? 'none'}:${season ?? 'unknown'}`;
}

function emptyBoard() {
  return {};
}

function normalizeBoardByPosition(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyBoard();
  return Object.fromEntries(
    Object.entries(value)
      .map(([position, ids]) => [
        normalizePosition(position),
        Array.isArray(ids) ? ids.map((id) => String(id)).filter(Boolean) : [],
      ])
      .filter(([, ids]) => ids.length > 0),
  );
}

function flattenBoardIds(boardByPosition) {
  return Object.values(boardByPosition ?? {}).flatMap((ids) => ids ?? []);
}

function buildPositionLookup(players = {}) {
  return new Map(Object.entries(players).map(([id, player]) => [
    String(id),
    normalizePosition(player?.fantasy_positions?.[0] ?? player?.position),
  ]));
}

function groupLegacyBoard(ids, players = {}) {
  const positionLookup = buildPositionLookup(players);
  return ids.reduce((acc, id) => {
    const playerId = String(id);
    const position = positionLookup.get(playerId) ?? 'FLEX';
    acc[position] = acc[position] ?? [];
    if (!acc[position].includes(playerId)) acc[position].push(playerId);
    return acc;
  }, {});
}

function loadBoard({ leagueId, season, draftId, players }) {
  try {
    const raw = localStorage.getItem(getBoardStorageKey({ leagueId, season, draftId }));
    if (raw) return normalizeBoardByPosition(JSON.parse(raw));

    const legacyRaw = localStorage.getItem(getLegacyBoardStorageKey(leagueId, season));
    const legacy = legacyRaw ? JSON.parse(legacyRaw) : [];
    if (Array.isArray(legacy)) return groupLegacyBoard(legacy, players);
  } catch {
    return emptyBoard();
  }
  return emptyBoard();
}

function saveBoard({ leagueId, season, draftId, boardByPosition }) {
  try {
    localStorage.setItem(
      getBoardStorageKey({ leagueId, season, draftId }),
      JSON.stringify(normalizeBoardByPosition(boardByPosition)),
    );
  } catch {
    // Local board persistence is best-effort only.
  }
}

function getModelStorageKey({ leagueId, season, draftId }) {
  return `${MODEL_STORAGE_PREFIX}:${leagueId ?? 'none'}:${season ?? 'unknown'}:${draftId ?? 'none'}`;
}

function loadModelWeights({ leagueId, season, draftId }) {
  try {
    const raw = localStorage.getItem(getModelStorageKey({ leagueId, season, draftId }));
    if (raw) return normalizeDraftModelWeights(JSON.parse(raw));
  } catch {
    // Model persistence is best-effort only.
  }
  return normalizeDraftModelWeights(DEFAULT_DRAFT_MODEL_WEIGHTS);
}

function saveModelWeights({ leagueId, season, draftId, weights }) {
  try {
    localStorage.setItem(
      getModelStorageKey({ leagueId, season, draftId }),
      JSON.stringify(normalizeDraftModelWeights(weights)),
    );
  } catch {
    // Model persistence is best-effort only.
  }
}

function resolveLeagueDraft(league, drafts) {
  const leagueDraftId = league?.draft_id ? String(league.draft_id) : null;
  if (!drafts?.length) return leagueDraftId;

  const ranked = [...drafts].sort((a, b) => {
    const statusRank = (draft) => {
      const status = String(draft?.status ?? '').toLowerCase();
      if (status === 'drafting' || status === 'in_progress') return 0;
      if (status === 'pre_draft') return 1;
      if (String(draft?.draft_id) === leagueDraftId) return 2;
      return 3;
    };
    return statusRank(a) - statusRank(b);
  });

  return String(ranked[0]?.draft_id ?? leagueDraftId ?? '');
}

function formatPickLabel(pick) {
  if (!pick) return 'Pick';
  const roundPick = pick.roundPick != null
    ? String(pick.roundPick).padStart(2, '0')
    : String(pick.overall ?? '').padStart(2, '0');
  return `${pick.round}.${roundPick}`;
}

function formatRankMetric(value) {
  if (value == null) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatIntegerMetric(value) {
  if (value == null || value === 0) return '—';
  return String(Math.round(value));
}

function formatDecimalMetric(value) {
  if (value == null || value === 0) return '—';
  return Number(value).toFixed(1);
}

function formatTrendMetric(trend) {
  if (trend?.direction === 'up') return '▲';
  if (trend?.direction === 'down') return '▼';
  return '—';
}

function getTrendSortValue(trend) {
  if (trend?.direction === 'up') return 2;
  if (trend?.direction === 'flat') return 1;
  if (trend?.direction === 'down') return 0;
  return null;
}

function getMarketMetric(player) {
  const marketRank = player?.rank?.overallRank ?? player?.projection?.marketRank;
  if (marketRank != null) return { key: 'market', value: formatRankMetric(marketRank), label: 'Overall' };
  const searchRank = player?.projection?.searchRank;
  if (searchRank != null) return { key: 'sleeper-search', value: formatRankMetric(searchRank), label: 'Search' };
  return { key: 'market', value: '—', label: 'Overall' };
}

function formatPositionRank(player) {
  if (player?.rank?.positionRankLabel) return player.rank.positionRankLabel;
  const marketPositionRank = player?.rank?.positionRank ?? player?.projection?.marketPositionRank;
  if (marketPositionRank != null && player?.position) return `${player.position}${formatRankMetric(marketPositionRank)}`;
  return player?.positionRankLabel ?? '—';
}

function getByeWeek(player) {
  return player?.teamContext?.byeWeek ?? player?.raw?.bye_week ?? player?.raw?.metadata?.bye_week ?? player?.raw?.metadata?.bye ?? player?.bye ?? null;
}

function getPlayerName(player) {
  return player?.name || player?.raw?.full_name || `${player?.raw?.first_name ?? ''} ${player?.raw?.last_name ?? ''}`.trim() || 'Player';
}

function sortCandidates(candidates) {
  return [...(candidates ?? [])].sort((a, b) => {
    const aScore = a?.draftModel?.score ?? null;
    const bScore = b?.draftModel?.score ?? null;
    if (aScore != null || bScore != null) {
      if (aScore == null) return 1;
      if (bScore == null) return -1;
      if (aScore !== bScore) return bScore - aScore;
    }
    const aRank = getMarketSortValue(a);
    const bRank = getMarketSortValue(b);
    if (aRank !== bRank) return aRank - bRank;
    return getPlayerName(a).localeCompare(getPlayerName(b));
  });
}

function getBigBoardSortValue(player, sortKey, originalIndex = 0) {
  switch (sortKey) {
    case 'board':
      return originalIndex;
    case 'player':
      return getPlayerName(player).toLowerCase();
    case 'rank':
      return player?.rank?.overallRank ?? player?.projection?.fallbackRank ?? player?.projection?.searchRank ?? null;
    case 'rating':
      return player?.draftModel?.score ?? null;
    case 'ppg':
      return player?.scoringFit?.pastPpg ?? player?.workload?.ppg ?? null;
    case 'volume':
      return player?.workload?.primaryVolume ?? null;
    case 'tier':
      return player?.rank?.tier ?? null;
    case 'trend':
      return getTrendSortValue(player?.rank?.trend ?? player?.workload?.trend);
    default:
      return null;
  }
}

function compareBigBoardValues(a, b, direction) {
  const multiplier = direction === 'desc' ? -1 : 1;
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'string' || typeof b === 'string') {
    return String(a).localeCompare(String(b)) * multiplier;
  }
  return (Number(a) - Number(b)) * multiplier;
}

function sortBigBoardRows(rows, sortState) {
  const sortKey = sortState?.key ?? 'rating';
  const direction = sortState?.direction ?? 'desc';
  return [...(rows ?? [])]
    .map((player, index) => ({ player, index }))
    .sort((a, b) => {
      const primary = compareBigBoardValues(
        getBigBoardSortValue(a.player, sortKey, a.index),
        getBigBoardSortValue(b.player, sortKey, b.index),
        direction,
      );
      if (primary !== 0) return primary;
      return a.index - b.index;
    })
    .map((item) => item.player);
}

function getMarketSortValue(player) {
  return player?.rank?.overallRank
    ?? player?.projection?.marketRank
    ?? player?.projection?.fallbackRank
    ?? player?.projection?.searchRank
    ?? Infinity;
}

function getBigBoardMetrics(player) {
  return [
    {
      key: 'overall-rank',
      value: formatRankMetric(player?.rank?.overallRank ?? player?.projection?.fallbackRank),
      label: player?.rank?.sourceLabel === 'Sleeper search rank' ? 'Search' : 'Rank',
      title: player?.rank?.sourceLabel ?? 'Overall or market rank',
      align: 'center',
    },
    {
      key: 'model-score',
      value: formatDecimalMetric(player?.draftModel?.score),
      label: 'Rating',
      title: 'GridShift Draft Rating from market rank, past PPG, scoring fit, and roster need',
      align: 'center',
    },
    {
      key: 'past-ppg',
      value: formatDecimalMetric(player?.scoringFit?.pastPpg ?? player?.workload?.ppg),
      label: 'PPG',
      title: 'Past-season fantasy points per game in this league scoring',
      align: 'center',
    },
    {
      key: 'workload',
      value: formatIntegerMetric(player?.workload?.primaryVolume),
      label: player?.position === 'QB' ? 'Att' : player?.position === 'RB' ? 'Touch' : 'Vol',
      title: 'Primary workload volume from available season stats',
      align: 'center',
    },
    {
      key: 'tier',
      value: player?.rank?.tier ? `T${player.rank.tier}` : '—',
      label: 'Tier',
      title: 'Rank-derived tier',
      align: 'center',
    },
    {
      key: 'trend',
      value: formatTrendMetric(player?.rank?.trend ?? player?.workload?.trend),
      label: 'Trend',
      title: player?.rank?.trend?.label ?? player?.workload?.trend?.label ?? 'Trend',
      align: 'center',
    },
  ];
}

function sortRowsByMarket(rows) {
  return [...(rows ?? [])].sort((a, b) => {
    const aRank = getMarketSortValue(a);
    const bRank = getMarketSortValue(b);
    if (aRank !== bRank) return aRank - bRank;
    return getPlayerName(a).localeCompare(getPlayerName(b));
  });
}

function buildPositionRankMap(players) {
  const byPosition = new Map();
  for (const player of players ?? []) {
    const position = normalizePosition(player?.position);
    if (!position) continue;
    if (!byPosition.has(position)) byPosition.set(position, []);
    byPosition.get(position).push(player);
  }

  const positionRanks = new Map();
  for (const [position, rows] of byPosition.entries()) {
    sortRowsByMarket(rows).forEach((player, index) => {
      positionRanks.set(String(player.id), `${position}${index + 1}`);
    });
  }
  return positionRanks;
}

function decoratePositionRanks(rows, positionRankMap) {
  return (rows ?? []).map((row) => ({
    ...row,
    positionRankLabel: positionRankMap.get(String(row.id)) ?? null,
  }));
}

function getNormalizedDraftPicks(draftPicks) {
  return (draftPicks ?? [])
    .map((pick, index) => normalizeDraftPick(pick, index))
    .filter(Boolean)
    .sort((a, b) => a.overall - b.overall);
}

function buildDraftOrderContext({ draft, rosters, draftTradedPicks, draftPicks, myRosterData }) {
  const normalizedPicks = getNormalizedDraftPicks(draftPicks);
  const pickOrder = buildPickOrder(draft, rosters, draftTradedPicks);
  const currentOverall = normalizedPicks.length + 1;
  const myRosterId = myRosterData?.roster_id != null ? String(myRosterData.roster_id) : null;
  const currentPick = pickOrder.find((pick) => pick.overall === currentOverall) ?? null;
  const nextMyPick = myRosterId
    ? pickOrder.find((pick) => pick.overall >= currentOverall && pick.rosterId === myRosterId) ?? null
    : null;
  const upcomingPicks = pickOrder.filter((pick) => pick.overall >= currentOverall);
  const picksBeforeUser = nextMyPick
    ? pickOrder.filter((pick) => pick.overall >= currentOverall && pick.overall < nextMyPick.overall)
    : [];

  return {
    normalizedPicks,
    pickOrder,
    currentOverall,
    currentPick,
    nextMyPick,
    upcomingPicks,
    picksBeforeUser,
  };
}

function filterCandidates(candidates, position, query) {
  const normalizedQuery = query.trim().toLowerCase();
  return candidates.filter((player) => {
    if (position !== 'ALL' && player.position !== position) return false;
    if (!normalizedQuery) return true;
    const haystack = `${getPlayerName(player)} ${player.team} ${player.position}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

function getAvailablePositions(candidates, boardRows) {
  const found = new Set(['ALL']);
  for (const player of [...(candidates ?? []), ...(boardRows ?? [])]) {
    if (player?.position) found.add(normalizePosition(player.position));
  }
  return ['ALL', ...POSITION_ORDER.filter((position) => found.has(position))];
}

function moveWithinPosition(boardByPosition, position, playerId, direction) {
  const normalizedPosition = normalizePosition(position);
  const ids = [...(boardByPosition?.[normalizedPosition] ?? [])];
  const index = ids.indexOf(String(playerId));
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return boardByPosition;
  [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
  return {
    ...boardByPosition,
    [normalizedPosition]: ids,
  };
}

function removePlayerFromBoard(boardByPosition, playerId) {
  const id = String(playerId);
  const next = {};
  for (const [position, ids] of Object.entries(boardByPosition ?? {})) {
    const filtered = (ids ?? []).filter((item) => item !== id);
    if (filtered.length > 0) next[position] = filtered;
  }
  return next;
}

function addPlayerToBoard(boardByPosition, player) {
  const position = normalizePosition(player?.position);
  const playerId = String(player?.id ?? '');
  if (!playerId) return boardByPosition;
  const cleaned = removePlayerFromBoard(boardByPosition, playerId);
  const ids = [...(cleaned[position] ?? []), playerId];
  return {
    ...cleaned,
    [position]: ids,
  };
}

function EmptyState({ title, description = null }) {
  return (
    <div
      className="draft-empty-state"
      style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-separator)' }}
    >
      <p>{title}</p>
      {description ? <span>{description}</span> : null}
    </div>
  );
}

function FutureDraftView({ view }) {
  const label = FUTURE_VIEW_LABELS[view] ?? 'Draft view';
  return (
    <div className="draft-page">
      <EmptyState
        title={`${label} is staged for future work.`}
        description="The route and navigation slot are in place, but War Room is the only active Draft view in this implementation."
      />
    </div>
  );
}

function DraftStatusBanner({ draft, viewModel, getUserDisplayName }) {
  const status = String(draft?.status ?? 'unknown').toLowerCase();
  const live = isLiveDraftStatus(status);
  const preDraft = isPreDraftStatus(status);
  if (!live && !preDraft) return null;

  const currentPick = viewModel?.currentPick ?? null;
  const owner = currentPick?.roster?.owner_id ? getUserDisplayName(currentPick.roster.owner_id) : 'Draft room';
  const nextMyPick = viewModel?.nextMyPick ? `Your next pick: ${formatPickLabel(viewModel.nextMyPick)}` : 'Your next pick is not available yet';
  const upcomingPicks = live ? (viewModel?.upcomingPicks ?? []).slice(0, 4) : [];

  return (
    <section
      className={`draft-status-banner${live ? ' is-live' : ' is-pre-draft'}`}
      aria-live={live ? 'polite' : undefined}
    >
      <div>
        <span>{live ? 'On the Clock' : 'Draft Setup'}</span>
        <strong>{live ? owner : (draft?.metadata?.name ?? draft?.name ?? 'War Room board')}</strong>
      </div>
      <div className="draft-status-banner__meta">
        <span>{live && currentPick ? `Pick ${formatPickLabel(currentPick)} · ${currentPick.overall} overall` : 'Build your board before the draft starts'}</span>
        <span>{nextMyPick}</span>
        {live && viewModel?.picksBeforeUser ? <span>{viewModel.picksBeforeUser.length} before you</span> : null}
      </div>
      {upcomingPicks.length > 0 ? (
        <div className="draft-status-banner__queue" aria-label="Upcoming picks">
          {upcomingPicks.map((pick) => (
            <span key={pick.overall} className={pick.overall === viewModel?.currentOverall ? 'is-current' : ''}>
              <strong>{formatPickLabel(pick)}</strong>
              {pick.roster?.owner_id ? getUserDisplayName(pick.roster.owner_id) : `Pick ${pick.overall}`}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function PositionFilter({ positions, activePosition, onChange }) {
  return (
    <div className="draft-position-filter" role="tablist" aria-label="Draft player positions">
      {positions.map((position) => (
        <button
          key={position}
          type="button"
          role="tab"
          aria-selected={activePosition === position}
          onClick={() => onChange(position)}
          className={activePosition === position ? 'is-active' : ''}
        >
          {position}
        </button>
      ))}
    </div>
  );
}

function DraftSegmentedControl({ label, options, value, onChange }) {
  return (
    <div className="draft-segmented-control" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={value === option.id ? 'is-active' : ''}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function clampDraftModelWeightInput(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return MODEL_WEIGHT_MIN;
  return Math.min(MODEL_WEIGHT_MAX, Math.max(MODEL_WEIGHT_MIN, Math.round(parsed)));
}

function DraftModelWeightInfo({ label, description }) {
  const buttonRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const tooltipId = `draft-model-weight-info-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  useEffect(() => {
    if (!open || !buttonRef.current) return undefined;

    const updatePosition = () => {
      const rect = buttonRef.current.getBoundingClientRect();
      const tooltipWidth = Math.min(280, window.innerWidth - 16);
      const left = Math.max(8, Math.min(window.innerWidth - tooltipWidth - 8, rect.left + rect.width / 2 - tooltipWidth / 2));
      const top = Math.min(window.innerHeight - 12, rect.bottom + 8);
      setPosition({ left, top, width: tooltipWidth });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  return (
    <span className="draft-model-weight-info">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`${label} weight info`}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
      >
        i
      </button>
      {open && position && createPortal(
        <div
          id={tooltipId}
          role="tooltip"
          className="draft-model-weight-tooltip"
          style={{
            left: position.left,
            top: position.top,
            width: position.width,
          }}
        >
          <strong>{label}</strong>
          <span>{description}</span>
        </div>,
        document.body,
      )}
    </span>
  );
}

function DraftModelWeights({ weights, onChange, onReset }) {
  const [draftWeights, setDraftWeights] = useState(() => normalizeDraftModelWeights(weights));
  const draftWeightsRef = useRef(draftWeights);

  useEffect(() => {
    const nextWeights = normalizeDraftModelWeights(weights);
    draftWeightsRef.current = nextWeights;
    setDraftWeights(nextWeights);
  }, [weights]);

  const getDisplayValue = (key) => draftWeights?.[key] ?? DEFAULT_DRAFT_MODEL_WEIGHTS[key];

  const setLocalWeight = (key, value) => {
    setDraftWeights((current) => {
      const nextWeights = rebalanceDraftModelWeights(
        current,
        key,
        clampDraftModelWeightInput(value),
      );
      draftWeightsRef.current = nextWeights;
      return nextWeights;
    });
  };

  const commitWeight = (key, value) => {
    const nextWeights = rebalanceDraftModelWeights(
      draftWeightsRef.current,
      key,
      clampDraftModelWeightInput(value),
    );
    draftWeightsRef.current = nextWeights;
    setDraftWeights(nextWeights);
    onChange(nextWeights);
  };

  const totalWeight = MODEL_WEIGHT_CONTROLS.reduce((sum, item) => {
    const value = Number(getDisplayValue(item.key));
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  return (
    <details className="draft-model-weights">
      <summary>
        <span className="draft-model-weights__summary-title">
          <span className="draft-model-weights__chevron" aria-hidden="true" />
          <span>Model weights</span>
        </span>
        <strong>{totalWeight}</strong>
      </summary>
      <div className="draft-model-weights__grid">
        {MODEL_WEIGHT_CONTROLS.map((item) => {
          const value = getDisplayValue(item.key);
          const rangeValue = value === '' ? MODEL_WEIGHT_MIN : value;
          const labelId = `draft-model-weight-label-${item.key}`;

          return (
            <div key={item.key} className="draft-model-weights__control">
              <span id={labelId} className="draft-model-weights__label">
                <span>{item.label}</span>
                <DraftModelWeightInfo label={item.label} description={item.description} />
              </span>
              <input
                type="range"
                aria-labelledby={labelId}
                min={MODEL_WEIGHT_MIN}
                max={MODEL_WEIGHT_MAX}
                step="1"
                value={rangeValue}
                style={{ '--draft-weight-progress': `${rangeValue}%` }}
                onChange={(event) => setLocalWeight(item.key, event.target.value)}
                onPointerUp={(event) => commitWeight(item.key, event.currentTarget.value)}
                onBlur={(event) => commitWeight(item.key, event.currentTarget.value)}
              />
              <input
                type="number"
                aria-labelledby={labelId}
                min={MODEL_WEIGHT_MIN}
                max={MODEL_WEIGHT_MAX}
                step="1"
                inputMode="numeric"
                value={value}
                onChange={(event) => setLocalWeight(item.key, event.target.value)}
                onBlur={(event) => commitWeight(item.key, event.currentTarget.value)}
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
                aria-label={`${item.label} weight`}
              />
            </div>
          );
        })}
      </div>
      <button type="button" onClick={onReset}>Reset model</button>
    </details>
  );
}

function DraftBoardMetricValue({ label, value }) {
  return (
    <span className="draft-board-metric-value">
      {label ? <span className="draft-board-metric-value__label">{label}</span> : null}
      <span className="draft-board-metric-value__number">{value}</span>
    </span>
  );
}

function DraftPlayerRow({
  player,
  darkMode,
  onViewPlayer,
  actions,
  status = null,
  disabled = false,
  metrics = null,
  metricColumnGridTemplate = null,
  rowGridTemplate = null,
  compactRowGridTemplate = null,
  leading = null,
  className = '',
}) {
  const bye = getByeWeek(player);
  const rowMetrics = metrics ?? [
    getMarketMetric(player),
  ];
  const metricSlot = rowMetrics.length > 1 ? `minmax(${Math.min(280, Math.max(96, rowMetrics.length * 52))}px,auto)` : 'minmax(54px,auto)';
  const compactMetricSlot = rowMetrics.length > 1 ? `minmax(${Math.min(240, Math.max(82, rowMetrics.length * 44))}px,auto)` : 'minmax(44px,auto)';
  const gridTemplate = status
    ? `${leading ? '34px ' : ''}40px 30px minmax(0,1fr) 30px ${metricSlot} auto auto`
    : `${leading ? '34px ' : ''}40px 30px minmax(0,1fr) 30px ${metricSlot} auto`;
  const compactGridTemplate = status
    ? `${leading ? '30px ' : ''}34px 28px minmax(0,1fr) 28px ${compactMetricSlot} auto auto`
    : `${leading ? '30px ' : ''}34px 28px minmax(0,1fr) 28px ${compactMetricSlot} auto`;
  const resolvedGridTemplate = rowGridTemplate ?? gridTemplate;
  const resolvedCompactGridTemplate = compactRowGridTemplate ?? rowGridTemplate ?? compactGridTemplate;
  const metaSegments = [
    player.team,
    bye ? `Bye ${bye}` : null,
    player?.schedule?.label && player.schedule.label !== 'Unavailable' ? `${player.schedule.label} schedule` : null,
  ].filter(Boolean);

  return (
    <CompanionPlayerRow
      player={{
        id: player.id,
        name: getPlayerName(player),
        team: player.team,
        position: player.position,
        raw: player.raw,
      }}
      darkMode={darkMode}
      disabled={disabled}
      interactive
      compact
      onClick={() => onViewPlayer?.(player.id)}
      leading={leading}
      metaSegments={metaSegments}
      columns={rowMetrics.map((metric) => (
        <CompanionPlayerMetric
          key={metric.key}
          value={metric.value}
          label={metric.label}
          title={metric.title}
          align={metric.align}
          compact
        />
      ))}
      status={status}
      actions={actions}
      gridTemplate={resolvedGridTemplate}
      compactGridTemplate={resolvedCompactGridTemplate}
      columnGridTemplate={metricColumnGridTemplate ?? (rowMetrics.length > 1 ? `repeat(${rowMetrics.length}, minmax(40px,auto))` : 'minmax(44px,auto)')}
      className={['draft-player-row', className].filter(Boolean).join(' ')}
    />
  );
}

function LeagueLogsAttribution({ attribution, profileKey, lastRefreshed }) {
  if (!attribution?.text || !attribution?.url) return null;
  const details = [
    profileKey ? `Market profile: ${profileKey}` : null,
    lastRefreshed ? `Updated ${new Date(lastRefreshed).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="draft-market-attribution">
      <a href={attribution.url} target="_blank" rel="noopener noreferrer">{attribution.text}</a>
      {details ? <span>{details}</span> : null}
    </div>
  );
}

function BigBoard({
  candidates,
  boardIds,
  activePosition,
  query,
  setQuery,
  positions,
  onPositionChange,
  onAdd,
  onViewPlayer,
  darkMode,
  boardScope,
  onBoardScopeChange,
  dataSourceLabel,
  statsLoading,
  modelWeights,
  onModelWeightChange,
  onResetModelWeights,
}) {
  const [sortState, setSortState] = useState({ key: 'rating', direction: 'desc' });
  const filtered = filterCandidates(candidates, activePosition, query);
  const sorted = useMemo(
    () => sortBigBoardRows(filtered, sortState).slice(0, 140),
    [filtered, sortState],
  );
  const setSortColumn = (column) => {
    setSortState((current) => {
      if (current.key === column.key) {
        return {
          key: column.key,
          direction: current.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return {
        key: column.key,
        direction: column.defaultDirection,
      };
    });
  };
  const renderSortButton = (column, className = '') => {
    const active = sortState.key === column.key;
    const direction = active ? sortState.direction : column.defaultDirection;
    const nextDirection = active
      ? (direction === 'asc' ? 'descending' : 'ascending')
      : (column.defaultDirection === 'asc' ? 'ascending' : 'descending');
    const currentDirection = direction === 'asc' ? 'ascending' : 'descending';
    return (
      <button
        key={column.key}
        type="button"
        className={[className, active ? 'is-active' : ''].filter(Boolean).join(' ')}
        onClick={() => setSortColumn(column)}
        aria-label={active
          ? `${column.label}, sorted ${currentDirection}. Activate to sort ${nextDirection}.`
          : `Sort by ${column.label} ${nextDirection}.`}
        aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
        title={active ? `Sorted ${currentDirection}` : `Sort by ${column.label}`}
      >
        <span className="draft-big-board-header__label">{column.label}</span>
        <span aria-hidden="true" className="draft-big-board-header__sort">
          {direction === 'asc' ? '↑' : '↓'}
        </span>
      </button>
    );
  };

  return (
    <section className="draft-panel draft-big-board">
      <div className="draft-panel__header">
        <div>
          <h2>Big Board</h2>
          <span>{sorted.length} visible players{dataSourceLabel ? ` · ${dataSourceLabel}` : ''}{statsLoading ? ' · loading stats' : ''}</span>
        </div>
        <div className="draft-panel__header-controls">
          <DraftSegmentedControl
            label="Big Board player scope"
            options={BOARD_SCOPE_OPTIONS}
            value={boardScope}
            onChange={onBoardScopeChange}
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search players"
            aria-label="Search draft players"
          />
        </div>
      </div>
      <DraftModelWeights
        weights={modelWeights}
        onChange={onModelWeightChange}
        onReset={onResetModelWeights}
      />
      <PositionFilter positions={positions} activePosition={activePosition} onChange={onPositionChange} />
      <div className="draft-big-board-header" role="row">
        <span className="draft-big-board-header__avatar-spacer" aria-hidden="true" />
        <span className="draft-big-board-header__position-spacer" aria-hidden="true" />
        {renderSortButton(BIG_BOARD_SORT_COLUMNS[0], 'draft-big-board-header__player')}
        <span className="draft-big-board-header__logo-spacer" aria-hidden="true" />
        <div className="draft-big-board-header__metrics">
          {BIG_BOARD_SORT_COLUMNS.slice(1).map((column) => renderSortButton(column))}
        </div>
        <span className="draft-big-board-header__action-spacer" aria-hidden="true" />
      </div>
      <div className="draft-player-list">
        {sorted.length === 0 ? (
          <EmptyState title="No players match this filter." />
        ) : sorted.map((player, index) => {
          const included = boardIds.has(player.id);
          return (
            <DraftPlayerRow
              key={player.id}
              player={player}
              darkMode={darkMode}
              className="draft-player-row--big-board"
              onViewPlayer={onViewPlayer}
              metrics={getBigBoardMetrics(player)}
              metricColumnGridTemplate={BIG_BOARD_METRIC_GRID_TEMPLATE}
              rowGridTemplate={BIG_BOARD_ROW_GRID_TEMPLATE}
              compactRowGridTemplate={BIG_BOARD_COMPACT_ROW_GRID_TEMPLATE}
              actions={[
                <CompanionPlayerAction
                  key="add"
                  label={included ? `${getPlayerName(player)} is already on your board` : `Add ${getPlayerName(player)} to board`}
                  selected={included}
                  disabled={included}
                  className={included ? 'draft-player-row__add-action is-added-icon' : 'draft-player-row__add-action'}
                  onClick={() => onAdd(player)}
                >
                  {included ? <CheckIcon /> : 'Add'}
                </CompanionPlayerAction>,
              ]}
            />
          );
        })}
      </div>
    </section>
  );
}

function PositionBoardGroup({
  position,
  rows,
  darkMode,
  onMove,
  onRemove,
  onViewPlayer,
  allowReorder = true,
}) {
  const liveRows = rows.filter((row) => row.available);

  return (
    <section className={`draft-position-group is-${position.toLowerCase()}`}>
      <div className="draft-position-group__header">
        <strong>{position}</strong>
        <span>{liveRows.length} live · {rows.length} targets</span>
      </div>
      {rows.length === 0 ? (
        <div className="draft-position-group__empty">No {position} targets yet.</div>
      ) : (
        <div className="draft-player-list">
          {rows.map((player, index) => (
            <DraftPlayerRow
              key={player.id}
              player={player}
              darkMode={darkMode}
              className="draft-player-row--board"
              disabled={!player.available}
              onViewPlayer={onViewPlayer}
              metrics={[
                {
                  key: 'pos-rank',
                  value: (
                    <DraftBoardMetricValue
                      label={null}
                      value={player.available ? formatPositionRank(player) : '—'}
                    />
                  ),
                  label: null,
                  title: 'Position rank',
                },
                {
                  key: 'market',
                  value: (
                    <DraftBoardMetricValue
                      label={getMarketMetric(player).label}
                      value={getMarketMetric(player).value}
                    />
                  ),
                  label: null,
                  title: 'LeagueLogs Market Index overall rank',
                },
              ]}
              status={!player.available ? <CompanionPlayerStatus label="Gone" /> : null}
              actions={[
                allowReorder ? (
                  <CompanionPlayerAction
                    key="up"
                    label={`Move ${getPlayerName(player)} up`}
                    disabled={index === 0}
                    onClick={() => onMove(position, player.id, -1)}
                  >
                    <ArrowIcon direction="up" />
                  </CompanionPlayerAction>
                ) : null,
                allowReorder ? (
                  <CompanionPlayerAction
                    key="down"
                    label={`Move ${getPlayerName(player)} down`}
                    disabled={index === rows.length - 1}
                    onClick={() => onMove(position, player.id, 1)}
                  >
                    <ArrowIcon direction="down" />
                  </CompanionPlayerAction>
                ) : null,
                <CompanionPlayerAction
                  key="remove"
                  label={`Remove ${getPlayerName(player)} from board`}
                  onClick={() => onRemove(player.id)}
                >
                  <CloseIcon />
                </CompanionPlayerAction>,
              ].filter(Boolean)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MyBoard({
  boardByPosition,
  boardRows,
  darkMode,
  onMove,
  onRemove,
  onViewPlayer,
  sortMode,
  onSortModeChange,
}) {
  const rowsByPosition = new Map(boardRows.map((row) => [row.id, row]));
  const positions = Object.keys(boardByPosition ?? {});
  const orderedPositions = [
    ...POSITION_ORDER.filter((position) => positions.includes(position)),
    ...positions.filter((position) => !POSITION_ORDER.includes(position)).sort(),
  ];
  const overallRows = sortRowsByMarket(boardRows);

  return (
    <section className="draft-panel draft-my-board">
      <div className="draft-panel__header">
        <div>
          <h2>My Board</h2>
          <span>{flattenBoardIds(boardByPosition).length} ranked targets</span>
        </div>
        {orderedPositions.length > 0 ? (
          <DraftSegmentedControl
            label="My Board sorting"
            options={MY_BOARD_SORT_OPTIONS}
            value={sortMode}
            onChange={onSortModeChange}
          />
        ) : null}
      </div>
      {orderedPositions.length === 0 ? (
        <EmptyState
          title="No players on your board yet."
          description="Add players from the Big Board, then rank them within each position."
        />
      ) : (
        <div className="draft-position-board">
          {sortMode === 'overall' ? (
            <PositionBoardGroup
              position="Overall"
              rows={overallRows}
              darkMode={darkMode}
              onMove={onMove}
              onRemove={onRemove}
              onViewPlayer={onViewPlayer}
              allowReorder={false}
            />
          ) : orderedPositions.map((position) => {
            const rows = (boardByPosition[position] ?? [])
              .map((id) => rowsByPosition.get(id))
              .filter(Boolean);
            return (
              <PositionBoardGroup
                key={position}
                position={position}
                rows={rows}
                darkMode={darkMode}
                onMove={onMove}
                onRemove={onRemove}
                onViewPlayer={onViewPlayer}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function getDraftedPlayerLabel(pick, players) {
  if (!pick?.playerId) return 'Pending';
  const metadataName = pick.metadata?.first_name || pick.metadata?.last_name
    ? `${pick.metadata?.first_name ?? ''} ${pick.metadata?.last_name ?? ''}`.trim()
    : null;
  const player = players?.[pick.playerId];
  return metadataName || player?.full_name || `${player?.first_name ?? ''} ${player?.last_name ?? ''}`.trim() || `Player ${pick.playerId}`;
}

function DraftOrderView() {
  const {
    players,
    loadPlayers,
    league,
    rosters,
    selectedLeagueId,
    myRoster,
    getUserDisplayName,
  } = useSleeperBase();

  const [draftMeta, setDraftMeta] = useState(null);
  const [draftPicks, setDraftPicks] = useState([]);
  const [draftTradedPicks, setDraftTradedPicks] = useState([]);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState('');

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  useEffect(() => {
    if (!selectedLeagueId || !league) return undefined;
    let cancelled = false;
    let timeoutId = null;
    let hasLoadedDraft = false;

    const loadDraft = async () => {
      const initialLoad = !hasLoadedDraft;
      if (initialLoad) {
        setDraftLoading(true);
        setDraftError('');
      }

      try {
        const drafts = await getLeagueDrafts(selectedLeagueId).catch(() => []);
        const draftId = resolveLeagueDraft(league, drafts);
        if (!draftId) {
          if (!cancelled) {
            setDraftMeta(null);
            setDraftPicks([]);
            setDraftTradedPicks([]);
            hasLoadedDraft = true;
          }
          return;
        }

        const [nextDraft, nextPicks, nextTradedPicks] = await Promise.all([
          getDraft(draftId),
          getDraftPicks(draftId).catch(() => []),
          getDraftTradedPicks(draftId).catch(() => []),
        ]);

        if (cancelled) return;
        setDraftMeta(nextDraft);
        setDraftPicks(Array.isArray(nextPicks) ? nextPicks : []);
        setDraftTradedPicks(Array.isArray(nextTradedPicks) ? nextTradedPicks : []);
        setDraftError('');
        hasLoadedDraft = true;

        const status = getDraftPollingStatus(nextDraft);
        if (status === 'drafting' || status === 'pre_draft' || status === 'in_progress') {
          timeoutId = window.setTimeout(loadDraft, POLL_MS);
        }
      } catch (error) {
        if (!cancelled && initialLoad) {
          setDraftError(error?.message ?? 'Could not load Sleeper draft state.');
          setDraftMeta(null);
          setDraftPicks([]);
          setDraftTradedPicks([]);
          hasLoadedDraft = true;
        }
      } finally {
        if (!cancelled && initialLoad) setDraftLoading(false);
      }
    };

    loadDraft();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [selectedLeagueId, league]);

  const myRosterData = useMemo(() => myRoster(), [myRoster]);
  const draftOrderContext = useMemo(() => buildDraftOrderContext({
    draft: draftMeta,
    rosters,
    draftTradedPicks,
    draftPicks,
    myRosterData,
  }), [draftMeta, rosters, draftTradedPicks, draftPicks, myRosterData]);
  const picksByOverall = useMemo(
    () => new Map(draftOrderContext.normalizedPicks.map((pick) => [pick.overall, pick])),
    [draftOrderContext.normalizedPicks],
  );
  const draftType = normalizeDraftType(draftMeta);
  const unsupportedDraft = draftMeta && draftType !== 'snake' && draftType !== 'linear';

  if (!league) {
    return (
      <div className="draft-page">
        <EmptyState title="Connect a league to view the draft order." />
      </div>
    );
  }

  if (!myRosterData) {
    return (
      <div className="draft-page">
        <EmptyState title="Could not find your roster in this league." />
      </div>
    );
  }

  if (!players || draftLoading) {
    return (
      <div className="draft-page">
        <EmptyState title="Loading draft order" description="Fetching Sleeper draft metadata, picks, and traded picks." />
      </div>
    );
  }

  if (draftError) {
    return (
      <div className="draft-page">
        <EmptyState title="Draft order unavailable" description={draftError} />
      </div>
    );
  }

  if (!draftMeta) {
    return (
      <div className="draft-page">
        <EmptyState title="No Sleeper draft found for this league." />
      </div>
    );
  }

  if (unsupportedDraft) {
    return (
      <div className="draft-page">
        <EmptyState
          title="Auction drafts are not supported yet."
          description="Sleeper's public draft endpoints support pick data well for snake and linear drafts, but live auction nomination and bid state are not exposed clearly enough for this pass."
        />
      </div>
    );
  }

  return (
    <div className="draft-page">
      <DraftStatusBanner draft={draftMeta} viewModel={draftOrderContext} getUserDisplayName={getUserDisplayName} />
      <section className="draft-panel draft-order-panel">
        <div className="draft-panel__header">
          <div>
            <h2>Draft Order</h2>
            <span>{draftOrderContext.pickOrder.length} picks · {draftOrderContext.normalizedPicks.length} made</span>
          </div>
        </div>
        <div className="draft-order-table">
          {draftOrderContext.pickOrder.map((pick) => {
            const madePick = picksByOverall.get(pick.overall) ?? null;
            const ownerLabel = pick.rosterId === String(myRosterData?.roster_id)
              ? 'You'
              : getUserDisplayName(pick.roster?.owner_id);
            return (
              <div
                key={pick.overall}
                className={[
                  pick.overall === draftOrderContext.currentOverall ? 'is-current' : '',
                  madePick ? 'is-picked' : '',
                  pick.rosterId === String(myRosterData?.roster_id) ? 'is-mine' : '',
                ].filter(Boolean).join(' ')}
              >
                <strong>{formatPickLabel(pick)}</strong>
                <span>{ownerLabel}</span>
                <small>{pick.acquired && pick.originalRoster ? `from ${getUserDisplayName(pick.originalRoster.owner_id)}` : `${pick.overall} overall`}</small>
                <em>{getDraftedPlayerLabel(madePick, players)}</em>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ArrowIcon({ direction }) {
  const points = direction === 'up' ? '12 5 5 12 7 14 12 9 17 14 19 12' : '12 19 5 12 7 10 12 15 17 10 19 12';
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points={points} />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function WarRoom({ onViewPlayer }) {
  const {
    players,
    loadPlayers,
    league,
    rosters,
    selectedLeagueId,
    season,
    loadStatsForSeason,
    activeScoringSettings,
    myRoster,
    getUserDisplayName,
  } = useSleeperBase();
  const { darkMode } = useTheme();

  const [boardByPosition, setBoardByPosition] = useState(emptyBoard);
  const [boardReady, setBoardReady] = useState(false);
  const [draftMeta, setDraftMeta] = useState(null);
  const [draftPicks, setDraftPicks] = useState([]);
  const [draftTradedPicks, setDraftTradedPicks] = useState([]);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [positionFilter, setPositionFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [boardScope, setBoardScope] = useState('available');
  const [myBoardSortMode, setMyBoardSortMode] = useState('position');
  const [modelWeights, setModelWeights] = useState(() => normalizeDraftModelWeights(DEFAULT_DRAFT_MODEL_WEIGHTS));
  const [modelWeightsReady, setModelWeightsReady] = useState(false);
  const [draftStats, setDraftStats] = useState(null);
  const [draftStatsLoading, setDraftStatsLoading] = useState(false);
  const [draftStatsError, setDraftStatsError] = useState('');
  const [marketState, setMarketState] = useState({
    loading: false,
    error: '',
    attribution: null,
    profileKey: null,
    profile: null,
    lastRefreshed: null,
    valuesByPlayerId: new Map(),
  });
  const marketDraftContext = useMemo(() => ({
    metadata: { scoring_type: draftMeta?.metadata?.scoring_type },
    settings: { slots_qb: draftMeta?.settings?.slots_qb },
  }), [draftMeta?.metadata?.scoring_type, draftMeta?.settings?.slots_qb]);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  useEffect(() => {
    if (!selectedLeagueId || !league) return undefined;
    let cancelled = false;
    let timeoutId = null;
    let hasLoadedDraft = false;

    const loadDraft = async () => {
      const initialLoad = !hasLoadedDraft;
      if (initialLoad) {
        setDraftLoading(true);
        setDraftError('');
      }

      try {
        const drafts = await getLeagueDrafts(selectedLeagueId).catch(() => []);
        const draftId = resolveLeagueDraft(league, drafts);
        if (!draftId) {
          if (!cancelled) {
            setDraftMeta(null);
            setDraftPicks([]);
            setDraftTradedPicks([]);
            hasLoadedDraft = true;
          }
          return;
        }

        const [nextDraft, nextPicks, nextTradedPicks] = await Promise.all([
          getDraft(draftId),
          getDraftPicks(draftId).catch(() => []),
          getDraftTradedPicks(draftId).catch(() => []),
        ]);

        if (cancelled) return;
        setDraftMeta(nextDraft);
        setDraftPicks(Array.isArray(nextPicks) ? nextPicks : []);
        setDraftTradedPicks(Array.isArray(nextTradedPicks) ? nextTradedPicks : []);
        setDraftError('');
        hasLoadedDraft = true;

        const status = getDraftPollingStatus(nextDraft);
        if (status === 'drafting' || status === 'pre_draft' || status === 'in_progress') {
          timeoutId = window.setTimeout(loadDraft, POLL_MS);
        }
      } catch (error) {
        if (!cancelled && initialLoad) {
          setDraftError(error?.message ?? 'Could not load Sleeper draft state.');
          setDraftMeta(null);
          setDraftPicks([]);
          setDraftTradedPicks([]);
          hasLoadedDraft = true;
        }
      } finally {
        if (!cancelled && initialLoad) setDraftLoading(false);
      }
    };

    loadDraft();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [selectedLeagueId, league]);

  useEffect(() => {
    setBoardReady(false);
    if (!selectedLeagueId || !season || !draftMeta?.draft_id || !players) {
      setBoardByPosition(emptyBoard());
      return;
    }
    setBoardByPosition(loadBoard({
      leagueId: selectedLeagueId,
      season,
      draftId: draftMeta.draft_id,
      players,
    }));
    setBoardReady(true);
  }, [selectedLeagueId, season, draftMeta?.draft_id, players]);

  useEffect(() => {
    if (!boardReady || !selectedLeagueId || !season || !draftMeta?.draft_id) return;
    saveBoard({
      leagueId: selectedLeagueId,
      season,
      draftId: draftMeta.draft_id,
      boardByPosition,
    });
  }, [boardReady, selectedLeagueId, season, draftMeta?.draft_id, boardByPosition]);

  useEffect(() => {
    setModelWeightsReady(false);
    if (!selectedLeagueId || !season || !draftMeta?.draft_id) {
      setModelWeights(normalizeDraftModelWeights(DEFAULT_DRAFT_MODEL_WEIGHTS));
      return;
    }
    setModelWeights(loadModelWeights({
      leagueId: selectedLeagueId,
      season,
      draftId: draftMeta.draft_id,
    }));
    setModelWeightsReady(true);
  }, [selectedLeagueId, season, draftMeta?.draft_id]);

  useEffect(() => {
    if (!modelWeightsReady || !selectedLeagueId || !season || !draftMeta?.draft_id) return;
    saveModelWeights({
      leagueId: selectedLeagueId,
      season,
      draftId: draftMeta.draft_id,
      weights: modelWeights,
    });
  }, [modelWeightsReady, selectedLeagueId, season, draftMeta?.draft_id, modelWeights]);

  const draftStatsSeason = useMemo(
    () => getDraftStatsSeason(draftMeta?.season ?? season),
    [draftMeta?.season, season],
  );

  useEffect(() => {
    if (!draftStatsSeason || !loadStatsForSeason) {
      setDraftStats(null);
      setDraftStatsError('');
      setDraftStatsLoading(false);
      return undefined;
    }

    let cancelled = false;
    setDraftStatsLoading(true);
    setDraftStatsError('');

    loadStatsForSeason(draftStatsSeason).then((statsPackage) => {
      if (cancelled) return;
      setDraftStats(statsPackage);
      setDraftStatsError('');
    }).catch((error) => {
      if (cancelled) return;
      setDraftStats(null);
      setDraftStatsError(error?.message ?? 'Past-season stats unavailable.');
    }).finally(() => {
      if (!cancelled) setDraftStatsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [draftStatsSeason, loadStatsForSeason]);

  useEffect(() => {
    if (!league) {
      setMarketState({
        loading: false,
        error: '',
        attribution: null,
        profileKey: null,
        profile: null,
        lastRefreshed: null,
        valuesByPlayerId: new Map(),
      });
      return undefined;
    }

    let cancelled = false;
    setMarketState((current) => ({ ...current, loading: true, error: '' }));

    fetchLeagueLogsMarketForLeague({
      league,
      draft: marketDraftContext,
      scoringSettings: activeScoringSettings,
    }).then((market) => {
      if (cancelled) return;
      setMarketState({
        loading: false,
        error: '',
        attribution: market?.attribution ?? null,
        profileKey: market?.profileKey ?? null,
        profile: market?.profile ?? null,
        lastRefreshed: market?.lastRefreshed ?? null,
        valuesByPlayerId: market?.valuesByPlayerId ?? new Map(),
      });
    }).catch((error) => {
      if (cancelled) return;
      setMarketState({
        loading: false,
        error: error?.message ?? 'Market data unavailable.',
        attribution: null,
        profileKey: null,
        profile: null,
        lastRefreshed: null,
        valuesByPlayerId: new Map(),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    league,
    activeScoringSettings,
    marketDraftContext,
  ]);

  const myRosterData = useMemo(() => myRoster(), [myRoster]);
  const boardIds = useMemo(() => flattenBoardIds(boardByPosition), [boardByPosition]);
  const viewModel = useMemo(() => {
    if (!players || !league || !myRosterData || !draftMeta) return null;
    return buildDraftAssistantViewModel({
      players,
      rosters,
      league,
      draft: draftMeta,
      draftPicks,
      draftTradedPicks,
      myRoster: myRosterData,
      scoringSettings: activeScoringSettings,
      season,
      boardIds,
      marketValuesByPlayerId: marketState.valuesByPlayerId,
      seasonStats: draftStats?.seasonStats ?? null,
      weeklyStats: draftStats?.weeklyStats ?? null,
      scheduleMap: draftStats?.scheduleMap ?? null,
      modelWeights,
    });
  }, [players, rosters, league, draftMeta, draftPicks, draftTradedPicks, myRosterData, activeScoringSettings, season, boardIds, marketState.valuesByPlayerId, draftStats, modelWeights]);

  const draftType = normalizeDraftType(draftMeta);
  const unsupportedDraft = draftMeta && draftType !== 'snake' && draftType !== 'linear';
  const activePlayers = useMemo(() => sortCandidates(
    (viewModel?.allCandidates ?? []).filter((player) => player?.raw?.active !== false),
  ), [viewModel]);
  const positionRankMap = useMemo(() => buildPositionRankMap(activePlayers), [activePlayers]);
  const activePlayersWithRanks = useMemo(
    () => decoratePositionRanks(activePlayers, positionRankMap),
    [activePlayers, positionRankMap],
  );
  const boardRowsWithRanks = useMemo(
    () => decoratePositionRanks(viewModel?.boardRows ?? [], positionRankMap),
    [viewModel, positionRankMap],
  );
  const bigBoardPlayers = useMemo(() => (
    boardScope === 'all'
      ? activePlayersWithRanks
      : activePlayersWithRanks.filter((player) => !player.rostered)
  ), [activePlayersWithRanks, boardScope]);
  const boardIdSet = useMemo(() => new Set(boardIds), [boardIds]);
  const positions = useMemo(
    () => getAvailablePositions(bigBoardPlayers, boardRowsWithRanks),
    [bigBoardPlayers, boardRowsWithRanks],
  );

  useEffect(() => {
    if (!positions.includes(positionFilter)) setPositionFilter('ALL');
  }, [positions, positionFilter]);

  const addToBoard = (player) => {
    setBoardByPosition((current) => addPlayerToBoard(current, player));
  };

  const removeFromBoard = (playerId) => {
    setBoardByPosition((current) => removePlayerFromBoard(current, playerId));
  };

  const moveBoardPlayer = (position, playerId, direction) => {
    setBoardByPosition((current) => moveWithinPosition(current, position, playerId, direction));
  };

  const changeModelWeight = (weights) => {
    setModelWeights(normalizeDraftModelWeights(weights));
  };

  const resetModelWeights = () => {
    setModelWeights(normalizeDraftModelWeights(DEFAULT_DRAFT_MODEL_WEIGHTS));
  };

  const dataSourceLabel = draftStatsError
    ? 'Past stats unavailable'
    : draftStats?.season
      ? `Data: ${draftStats.season} season + market rank`
      : draftStatsSeason
        ? `Data: ${draftStatsSeason} season + market rank`
        : 'Data: market rank';

  if (!league) {
    return (
      <div className="draft-page">
        <EmptyState title="Connect a league to open the Draft War Room." />
      </div>
    );
  }

  if (!myRosterData) {
    return (
      <div className="draft-page">
        <EmptyState title="Could not find your roster in this league." />
      </div>
    );
  }

  if (!players || draftLoading) {
    return (
      <div className="draft-page">
        <EmptyState title="Loading draft room" description="Fetching Sleeper players, draft metadata, and live picks." />
      </div>
    );
  }

  if (draftError) {
    return (
      <div className="draft-page">
        <EmptyState title="Draft War Room unavailable" description={draftError} />
      </div>
    );
  }

  if (!draftMeta) {
    return (
      <div className="draft-page">
        <EmptyState
          title="No Sleeper draft found for this league."
          description="The War Room needs a Sleeper draft room so it can track picks and remove drafted players from your board."
        />
      </div>
    );
  }

  if (unsupportedDraft) {
    return (
      <div className="draft-page">
        <EmptyState
          title="Auction drafts are not supported yet."
          description="Sleeper's public draft endpoints support pick data well for snake and linear drafts, but live auction nomination and bid state are not exposed clearly enough for this War Room pass."
        />
      </div>
    );
  }

  return (
    <div className="draft-page">
      <DraftStatusBanner draft={draftMeta} viewModel={viewModel} getUserDisplayName={getUserDisplayName} />
      <LeagueLogsAttribution
        attribution={marketState.valuesByPlayerId.size > 0 ? marketState.attribution : null}
        profileKey={marketState.profileKey}
        lastRefreshed={marketState.lastRefreshed}
      />
      <div className="draft-war-room">
        <BigBoard
          candidates={bigBoardPlayers}
          boardIds={boardIdSet}
          activePosition={positionFilter}
          query={query}
          setQuery={setQuery}
          positions={positions}
          onPositionChange={setPositionFilter}
          onAdd={addToBoard}
          onViewPlayer={onViewPlayer}
          darkMode={darkMode}
          boardScope={boardScope}
          onBoardScopeChange={setBoardScope}
          dataSourceLabel={dataSourceLabel}
          statsLoading={draftStatsLoading}
          modelWeights={modelWeights}
          onModelWeightChange={changeModelWeight}
          onResetModelWeights={resetModelWeights}
        />
        <MyBoard
          boardByPosition={boardByPosition}
          boardRows={boardRowsWithRanks}
          darkMode={darkMode}
          onMove={moveBoardPlayer}
          onRemove={removeFromBoard}
          onViewPlayer={onViewPlayer}
          sortMode={myBoardSortMode}
          onSortModeChange={setMyBoardSortMode}
        />
      </div>
    </div>
  );
}

export default function DraftAssistant({ view = 'war-room', onViewPlayer = null }) {
  if (view === 'draft-order') return <DraftOrderView />;
  if (view !== 'war-room') return <FutureDraftView view={view} />;
  return <WarRoom onViewPlayer={onViewPlayer} />;
}
