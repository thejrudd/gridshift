import { memo, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { getDraft, getDraftPicks, getDraftTradedPicks, getLeagueDrafts } from '../../api/sleeperApi.js';
import { useSleeperBase } from '../../context/SleeperContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { fetchLeagueLogsMarketForLeague, formatLeagueLogsMarketProfile } from '../../api/leagueLogsApi.js';
import CompanionPlayerRow, {
  CompanionPlayerAction,
  CompanionPlayerMetric,
  CompanionPlayerStatus,
} from '../companion/CompanionPlayerRow.jsx';
import {
  POSITION_COLORS,
  getCompanionInitials,
  getPositionTextColor,
  getSleeperPlayerImageUrl,
} from '../../utils/companionAssetVisuals.js';
import {
  DEFAULT_DRAFT_MODEL_WEIGHTS,
  buildDraftAssistantViewModel,
  buildDraftResultsViewModel,
  buildPickOrder,
  getDraftStatsSeason,
  getScheduledDraftCountdownParts,
  getSleeperDraftStartMs,
  getSleeperDraftPicksSignature,
  getSleeperDraftSemanticSignature,
  getSleeperDraftTradedPicksSignature,
  isSleeperDraftPollable,
  isSleeperDraftPreDraft,
  normalizeDraftModelWeights,
  normalizeDraftPick,
  rebalanceDraftModelWeights,
  resolveLeagueDraftId,
  shouldRefreshSleeperDraftPicks,
  shouldRefreshSleeperDraftTradedPicks,
} from '../../utils/draftAssistant/index.js';
import {
  DRAFT_POSITION_ORDER as POSITION_ORDER,
  emptyBoard,
  flattenBoardIds,
  addPlayerToOrderedBoard,
  createOrderedBoardState,
  moveOverallBoardPlayer,
  playerCanSlotIntoBoardPosition,
  moveOrderedBoardPlayerWithinPosition,
  movePlayerToOrderedBoardPosition,
  normalizeBoardByPosition,
  normalizeOverallBoardIds,
  orderBoardByOverall,
  normalizeBoardPosition as normalizePosition,
  removePlayerFromOrderedBoard,
} from '../../utils/draftAssistant/board.js';

const BOARD_STORAGE_PREFIX = 'draft_assistant_position_board_v2';
const LEGACY_BOARD_STORAGE_PREFIX = 'draft_assistant_board_v1';
const MODEL_STORAGE_PREFIX = 'draft_assistant_model_weights_v2';
const KEEPER_STORAGE_PREFIX = 'draft_assistant_roster_keepers_v1';
const POLL_MS = 15_000;
const LIVE_DRAFT_POLL_MS = 5_000;
const LIVE_DRAFT_TRADED_PICK_POLL_MS = 30_000;
const LIVE_DRAFT_STATUS_POLL_MS = 1_000;
const RUNNING_DRAFT_CLOCK_POLL_MS = 1_000;
const CLOCK_RESYNC_THRESHOLD_MS = 1_200;
const DEV_DRAFT_OVERRIDE_PARAM_KEYS = ['sleeperDraftId', 'draftId'];
const EMPTY_VIEW_MODEL_BOARD_IDS = Object.freeze([]);
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
  { id: 'rookies', label: 'Rookies' },
];
const MY_BOARD_SORT_OPTIONS = [
  { id: 'position', label: 'Positional' },
  { id: 'overall', label: 'Overall' },
];
const DRAFT_BOARD_CARD_METRIC_OPTIONS = [
  { id: 'none', label: 'None' },
  { id: 'sleeper', label: 'Sleeper' },
  { id: 'rating', label: 'Rating' },
  { id: 'ppg', label: 'PPG' },
  { id: 'volume', label: 'Volume' },
  { id: 'tier', label: 'Tier' },
];
const DRAFT_RESULTS_SORT_OPTIONS = [
  { id: 'asc', label: 'First to Last' },
  { id: 'desc', label: 'Last to First' },
];
const DRAFT_MODEL_BUILD_DELAY_MS = 24;
const DRAFT_SYNC_CACHE_LIMIT = 6;
const DRAFT_VIEW_MODEL_CACHE_LIMIT = 4;
const draftSyncCache = new Map();
const draftViewModelCache = new Map();
const draftObjectCacheTokens = new WeakMap();
let draftObjectCacheTokenCounter = 0;
const BIG_BOARD_SORT_COLUMNS = [
  { key: 'player', label: 'Player', defaultDirection: 'asc' },
  { key: 'rank', label: 'Sleeper', defaultDirection: 'asc' },
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

function normalizeDraftType(draft) {
  return String(draft?.type ?? draft?.settings?.type ?? 'snake').toLowerCase();
}

function isLiveDraftStatus(status) {
  const normalized = String(status ?? '').toLowerCase();
  return normalized === 'drafting' || normalized === 'in_progress';
}

function isActiveDraftRoomStatus(status) {
  const normalized = String(status ?? '').toLowerCase();
  return normalized === 'drafting' || normalized === 'in_progress' || normalized === 'paused';
}

function getDraftPollIntervalMs(draft) {
  const status = String(draft?.status ?? '').toLowerCase();
  if (isLiveDraftStatus(status)) return RUNNING_DRAFT_CLOCK_POLL_MS;
  if (isActiveDraftRoomStatus(status)) return LIVE_DRAFT_STATUS_POLL_MS;
  return POLL_MS;
}

function scheduleDraftModelBuild(callback) {
  if (typeof window === 'undefined') return null;
  if (typeof window.requestIdleCallback === 'function') {
    const idleId = window.requestIdleCallback(callback, { timeout: 500 });
    return () => window.cancelIdleCallback?.(idleId);
  }
  const timeoutId = window.setTimeout(callback, DRAFT_MODEL_BUILD_DELAY_MS);
  return () => window.clearTimeout(timeoutId);
}

function getDraftObjectCacheToken(value) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return String(value ?? '');
  if (value instanceof Map) {
    if (value.size === 0) return 'map:0';
    const sample = [...value.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))).slice(0, 12).map(([key, entry]) => {
      const rank = entry?.overallRank ?? entry?.rank ?? entry?.searchRank ?? entry?.value ?? '';
      return `${String(key)}=${String(rank)}`;
    }).join('|');
    return `map:${value.size}:${sample}`;
  }
  const existing = draftObjectCacheTokens.get(value);
  if (existing) return existing;
  draftObjectCacheTokenCounter += 1;
  const nextToken = `obj:${draftObjectCacheTokenCounter}`;
  draftObjectCacheTokens.set(value, nextToken);
  return nextToken;
}

function trimMapToLimit(map, limit) {
  while (map.size > limit) {
    const oldestKey = map.keys().next().value;
    map.delete(oldestKey);
  }
}

function getDraftSyncCacheKey({ selectedLeagueId, league, sleeperDraftId = '' }) {
  const leagueId = String(selectedLeagueId ?? league?.league_id ?? '').trim();
  const explicitDraftId = extractSleeperDraftId(sleeperDraftId);
  const leagueDraftId = extractSleeperDraftId(league?.draft_id ?? '');
  return `${leagueId}:${explicitDraftId || leagueDraftId || 'active'}`;
}

function readDraftSyncCache(cacheKey) {
  if (!cacheKey) return null;
  return draftSyncCache.get(cacheKey) ?? null;
}

function rememberDraftSyncCache(cacheKey, snapshot) {
  if (!cacheKey || !snapshot?.draftMeta) return;
  draftSyncCache.delete(cacheKey);
  draftSyncCache.set(cacheKey, {
    draftMeta: snapshot.draftMeta,
    draftPicks: Array.isArray(snapshot.draftPicks) ? snapshot.draftPicks : [],
    draftTradedPicks: Array.isArray(snapshot.draftTradedPicks) ? snapshot.draftTradedPicks : [],
    loadedAt: Date.now(),
  });
  trimMapToLimit(draftSyncCache, DRAFT_SYNC_CACHE_LIMIT);
}

function getDraftViewModelCacheKey({
  players,
  rosters,
  league,
  draft,
  draftPicks,
  draftTradedPicks,
  myRoster,
  scoringSettings,
  season,
  boardIds,
  marketValuesByPlayerId,
  seasonStats,
  weeklyStats,
  scheduleMap,
  modelWeights,
}) {
  return [
    getDraftObjectCacheToken(players),
    getDraftObjectCacheToken(rosters),
    getDraftObjectCacheToken(league),
    getSleeperDraftSemanticSignature(draft),
    getSleeperDraftPicksSignature(draftPicks),
    getSleeperDraftTradedPicksSignature(draftTradedPicks),
    String(myRoster?.roster_id ?? ''),
    JSON.stringify(scoringSettings ?? {}),
    String(season ?? ''),
    (boardIds ?? []).map((id) => String(id)).join(','),
    getDraftObjectCacheToken(marketValuesByPlayerId),
    getDraftObjectCacheToken(seasonStats),
    getDraftObjectCacheToken(weeklyStats),
    getDraftObjectCacheToken(scheduleMap),
    JSON.stringify(normalizeDraftModelWeights(modelWeights)),
  ].join('::');
}

function readDraftViewModelCache(cacheKey) {
  if (!cacheKey) return null;
  const cached = draftViewModelCache.get(cacheKey);
  if (!cached) return null;
  draftViewModelCache.delete(cacheKey);
  draftViewModelCache.set(cacheKey, cached);
  return cached;
}

function rememberDraftViewModelCache(cacheKey, model) {
  if (!cacheKey || !model) return;
  draftViewModelCache.delete(cacheKey);
  draftViewModelCache.set(cacheKey, model);
  trimMapToLimit(draftViewModelCache, DRAFT_VIEW_MODEL_CACHE_LIMIT);
}

function extractSleeperDraftId(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const numericId = raw.match(/\d{10,}/)?.[0];
  return numericId ?? raw;
}

function getDevSleeperDraftIdOverride(sleeperDraftId = '') {
  if (!import.meta.env.DEV) return '';

  const explicitDraftId = extractSleeperDraftId(sleeperDraftId);
  if (explicitDraftId) return explicitDraftId;

  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    for (const key of DEV_DRAFT_OVERRIDE_PARAM_KEYS) {
      const value = extractSleeperDraftId(params.get(key));
      if (value) return value;
    }
  }

  return extractSleeperDraftId(import.meta.env.VITE_SLEEPER_DRAFT_ID_OVERRIDE);
}

async function resolveActiveDraftId({ league, leagueId, sleeperDraftId = '' }) {
  const overrideDraftId = getDevSleeperDraftIdOverride(sleeperDraftId);
  if (overrideDraftId) return overrideDraftId;

  const drafts = await getLeagueDrafts(leagueId).catch(() => []);
  return resolveLeagueDraftId(league, drafts);
}

function createDraftClockStore() {
  let snapshot = null;
  const listeners = new Set();

  return {
    getSnapshot: () => snapshot,
    setSnapshot: (nextSnapshot) => {
      snapshot = nextSnapshot;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function useDraftClockMeta(draftClockStore, fallbackDraft = null) {
  const clockDraft = useSyncExternalStore(
    draftClockStore.subscribe,
    draftClockStore.getSnapshot,
    draftClockStore.getSnapshot,
  );
  return clockDraft ?? fallbackDraft;
}

function useSleeperDraftSync({ selectedLeagueId, league, sleeperDraftId = '' }) {
  const draftSyncCacheKey = getDraftSyncCacheKey({ selectedLeagueId, league, sleeperDraftId });
  const cachedDraftSync = readDraftSyncCache(draftSyncCacheKey);
  const [draftMeta, setDraftMeta] = useState(() => cachedDraftSync?.draftMeta ?? null);
  const [draftPicks, setDraftPicks] = useState(() => cachedDraftSync?.draftPicks ?? []);
  const [draftTradedPicks, setDraftTradedPicks] = useState(() => cachedDraftSync?.draftTradedPicks ?? []);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState('');
  const refreshDraftRef = useRef(() => {});
  const draftClockStoreRef = useRef(null);
  if (!draftClockStoreRef.current) {
    draftClockStoreRef.current = createDraftClockStore();
  }

  useEffect(() => {
    if (!selectedLeagueId || !league) {
      setDraftMeta(null);
      setDraftPicks([]);
      setDraftTradedPicks([]);
      setDraftError('');
      setDraftLoading(false);
      draftClockStoreRef.current?.setSnapshot(null);
      return undefined;
    }
    const draftClockStore = draftClockStoreRef.current;
    const cachedSnapshot = readDraftSyncCache(draftSyncCacheKey);

    let cancelled = false;
    let timeoutId = null;
    let inFlight = false;
    let pendingForcePicks = false;
    let pendingForceTradedPicks = false;
    let cachedDraftPicks = cachedSnapshot?.draftPicks ?? [];
    let cachedDraftTradedPicks = cachedSnapshot?.draftTradedPicks ?? [];
    let hasLoadedDraft = Boolean(cachedSnapshot?.draftMeta);
    let lastPollableDraft = cachedSnapshot?.draftMeta ? isSleeperDraftPollable(cachedSnapshot.draftMeta) : false;
    let lastDraftMeta = cachedSnapshot?.draftMeta ?? null;
    let lastPicksPollAt = cachedSnapshot?.loadedAt ?? 0;
    let lastTradedPicksPollAt = cachedSnapshot?.loadedAt ?? 0;
    let draftSemanticSignature = cachedSnapshot?.draftMeta ? getSleeperDraftSemanticSignature(cachedSnapshot.draftMeta) : '';
    let draftPicksSignature = getSleeperDraftPicksSignature(cachedDraftPicks);
    let draftTradedPicksSignature = getSleeperDraftTradedPicksSignature(cachedDraftTradedPicks);

    if (cachedSnapshot?.draftMeta) {
      draftClockStore.setSnapshot(cachedSnapshot.draftMeta);
      setDraftMeta(cachedSnapshot.draftMeta);
      setDraftPicks(cachedDraftPicks);
      setDraftTradedPicks(cachedDraftTradedPicks);
      setDraftError('');
      setDraftLoading(false);
    } else {
      setDraftMeta(null);
      draftClockStore.setSnapshot(null);
      setDraftPicks([]);
      setDraftTradedPicks([]);
    }

    const clearPollTimeout = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = null;
    };

    const resetDraftState = () => {
      setDraftMeta(null);
      draftClockStore.setSnapshot(null);
      setDraftPicks([]);
      setDraftTradedPicks([]);
      draftSemanticSignature = '';
      draftPicksSignature = '';
      draftTradedPicksSignature = '';
      lastPicksPollAt = 0;
      lastTradedPicksPollAt = 0;
    };

    const scheduleNextPoll = () => {
      clearPollTimeout();
      if (!cancelled && lastPollableDraft) {
        timeoutId = window.setTimeout(loadDraft, getDraftPollIntervalMs(lastDraftMeta));
      }
    };

    const loadDraft = async ({ forcePicks = false, forceTradedPicks = false } = {}) => {
      if (inFlight) {
        pendingForcePicks = pendingForcePicks || forcePicks;
        pendingForceTradedPicks = pendingForceTradedPicks || forceTradedPicks;
        return;
      }

      inFlight = true;
      clearPollTimeout();
      const initialLoad = !hasLoadedDraft;
      const shouldForcePicks = forcePicks || pendingForcePicks;
      const shouldForceTradedPicks = forceTradedPicks || pendingForceTradedPicks;
      pendingForcePicks = false;
      pendingForceTradedPicks = false;

      if (initialLoad) {
        setDraftLoading(true);
        setDraftError('');
      }

      try {
        const draftId = await resolveActiveDraftId({ league, leagueId: selectedLeagueId, sleeperDraftId });
        if (!draftId) {
          if (!cancelled) {
            resetDraftState();
            hasLoadedDraft = true;
            lastPollableDraft = false;
            lastDraftMeta = null;
          }
          return;
        }

        const nextDraft = await getDraft(draftId);
        const pollReceivedAt = Date.now();
        const shouldFetchPicks = shouldForcePicks || shouldRefreshSleeperDraftPicks({
          initialLoad,
          nextDraft,
          previousDraft: lastDraftMeta,
          now: pollReceivedAt,
          lastPicksPollAt,
          liveRefreshMs: LIVE_DRAFT_POLL_MS,
          idleRefreshMs: POLL_MS,
        });
        const shouldFetchTradedPicks = shouldForceTradedPicks || shouldRefreshSleeperDraftTradedPicks({
          initialLoad,
          nextDraft,
          previousDraft: lastDraftMeta,
          now: pollReceivedAt,
          lastTradedPicksPollAt,
          refreshMs: LIVE_DRAFT_TRADED_PICK_POLL_MS,
        });
        const [nextPicks, nextTradedPicks] = await Promise.all([
          shouldFetchPicks ? getDraftPicks(draftId).catch(() => null) : Promise.resolve(null),
          shouldFetchTradedPicks ? getDraftTradedPicks(draftId).catch(() => null) : Promise.resolve(null),
        ]);

        if (cancelled) return;

        const nextSemanticSignature = getSleeperDraftSemanticSignature(nextDraft);
        draftClockStore.setSnapshot(nextDraft);
        if (nextSemanticSignature !== draftSemanticSignature) {
          draftSemanticSignature = nextSemanticSignature;
          startTransition(() => setDraftMeta(nextDraft));
        }

        if (Array.isArray(nextPicks)) {
          lastPicksPollAt = pollReceivedAt;
          cachedDraftPicks = nextPicks;
          const nextPicksSignature = getSleeperDraftPicksSignature(nextPicks);
          if (nextPicksSignature !== draftPicksSignature) {
            draftPicksSignature = nextPicksSignature;
            startTransition(() => setDraftPicks(nextPicks));
          }
        }

        if (Array.isArray(nextTradedPicks)) {
          lastTradedPicksPollAt = pollReceivedAt;
          cachedDraftTradedPicks = nextTradedPicks;
          const nextTradedPicksSignature = getSleeperDraftTradedPicksSignature(nextTradedPicks);
          if (nextTradedPicksSignature !== draftTradedPicksSignature) {
            draftTradedPicksSignature = nextTradedPicksSignature;
            startTransition(() => setDraftTradedPicks(nextTradedPicks));
          }
        }

        setDraftError('');
        hasLoadedDraft = true;
        lastPollableDraft = isSleeperDraftPollable(nextDraft);
        lastDraftMeta = nextDraft;
        rememberDraftSyncCache(draftSyncCacheKey, {
          draftMeta: nextDraft,
          draftPicks: cachedDraftPicks,
          draftTradedPicks: cachedDraftTradedPicks,
        });
      } catch (error) {
        if (!cancelled && initialLoad) {
          setDraftError(error?.message ?? 'Could not load Sleeper draft state.');
          resetDraftState();
          hasLoadedDraft = true;
        }
      } finally {
        inFlight = false;
        if (!cancelled && initialLoad) setDraftLoading(false);
        if (!cancelled && (pendingForcePicks || pendingForceTradedPicks)) {
          const nextForcePicks = pendingForcePicks;
          const nextForceTradedPicks = pendingForceTradedPicks;
          timeoutId = window.setTimeout(() => loadDraft({
            forcePicks: nextForcePicks,
            forceTradedPicks: nextForceTradedPicks,
          }), 0);
        } else {
          scheduleNextPoll();
        }
      }
    };

    const refreshNow = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      clearPollTimeout();
      loadDraft();
    };
    refreshDraftRef.current = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      clearPollTimeout();
      loadDraft({ forcePicks: true });
    };

    loadDraft();

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', refreshNow);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', refreshNow);
    }

    return () => {
      cancelled = true;
      clearPollTimeout();
      refreshDraftRef.current = () => {};
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', refreshNow);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', refreshNow);
      }
    };
  }, [selectedLeagueId, league, sleeperDraftId, draftSyncCacheKey]);

  const refreshDraft = useCallback(() => {
    refreshDraftRef.current();
  }, []);

  return {
    draftMeta,
    draftClockStore: draftClockStoreRef.current,
    draftPicks,
    draftTradedPicks,
    draftLoading,
    draftError,
    refreshDraft,
  };
}

function getBoardStorageKey({ leagueId, season, draftId }) {
  return `${BOARD_STORAGE_PREFIX}:${leagueId ?? 'none'}:${season ?? 'unknown'}:${draftId ?? 'none'}`;
}

function getLegacyBoardStorageKey(leagueId, season) {
  return `${LEGACY_BOARD_STORAGE_PREFIX}:${leagueId ?? 'none'}:${season ?? 'unknown'}`;
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

function filterBoardByEligibility(boardByPosition, players = {}) {
  if (!players || Object.keys(players).length === 0) return boardByPosition;
  const next = {};
  for (const [position, ids] of Object.entries(boardByPosition ?? {})) {
    const filtered = (ids ?? []).filter((id) => {
      const player = players[String(id)];
      return !player || playerCanSlotIntoBoardPosition(player, position);
    });
    if (filtered.length > 0) next[position] = filtered;
  }
  return next;
}

function normalizeStoredBoard(value, players = {}) {
  const rawByPosition = value?.byPosition && typeof value.byPosition === 'object'
    ? value.byPosition
    : value;
  const boardByPosition = filterBoardByEligibility(normalizeBoardByPosition(rawByPosition), players);
  const overallIds = Array.isArray(value?.overall)
    ? value.overall
    : flattenBoardIds(boardByPosition);
  return createOrderedBoardState(boardByPosition, overallIds);
}

function loadBoard({ leagueId, season, draftId, players }) {
  try {
    const raw = localStorage.getItem(getBoardStorageKey({ leagueId, season, draftId }));
    if (raw) return normalizeStoredBoard(JSON.parse(raw), players);

    const legacyRaw = localStorage.getItem(getLegacyBoardStorageKey(leagueId, season));
    const legacy = legacyRaw ? JSON.parse(legacyRaw) : [];
    if (Array.isArray(legacy)) return createOrderedBoardState(filterBoardByEligibility(groupLegacyBoard(legacy, players), players), legacy);
  } catch {
    return createOrderedBoardState(emptyBoard(), []);
  }
  return createOrderedBoardState(emptyBoard(), []);
}

function saveBoard({ leagueId, season, draftId, boardByPosition, overallIds }) {
  const boardState = createOrderedBoardState(boardByPosition, overallIds);
  try {
    localStorage.setItem(
      getBoardStorageKey({ leagueId, season, draftId }),
      JSON.stringify({
        byPosition: boardState.boardByPosition,
        overall: boardState.overallIds,
      }),
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

function getKeeperStorageKey({ leagueId, season, draftId }) {
  return `${KEEPER_STORAGE_PREFIX}:${leagueId ?? 'none'}:${season ?? 'unknown'}:${draftId ?? 'none'}`;
}

function loadKeeperIds({ leagueId, season, draftId }) {
  try {
    const raw = localStorage.getItem(getKeeperStorageKey({ leagueId, season, draftId }));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map((id) => String(id)).filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function saveKeeperIds({ leagueId, season, draftId, keeperIds }) {
  try {
    localStorage.setItem(
      getKeeperStorageKey({ leagueId, season, draftId }),
      JSON.stringify([...keeperIds].map((id) => String(id)).filter(Boolean)),
    );
  } catch {
    // Keeper persistence is best-effort only.
  }
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

function getDraftProjectionReason(player) {
  const components = player?.draftModel?.components ?? {};
  const weightedSignals = [
    { key: 'rosterNeed', label: 'Need fit', value: components.rosterNeed, weight: DEFAULT_DRAFT_MODEL_WEIGHTS.rosterNeed },
    { key: 'marketRank', label: 'Market value', value: components.marketRank, weight: DEFAULT_DRAFT_MODEL_WEIGHTS.marketRank },
    { key: 'pastProduction', label: 'PPG edge', value: components.pastProduction, weight: DEFAULT_DRAFT_MODEL_WEIGHTS.pastProduction },
    { key: 'scoringFit', label: 'Scoring fit', value: components.scoringFit, weight: DEFAULT_DRAFT_MODEL_WEIGHTS.scoringFit },
  ]
    .filter((signal) => Number.isFinite(signal.value) && signal.weight > 0)
    .map((signal) => ({ ...signal, weightedValue: signal.value * signal.weight }))
    .sort((a, b) => b.weightedValue - a.weightedValue);

  const primary = weightedSignals[0];
  const secondary = weightedSignals.find((signal) => signal.key !== primary?.key && signal.value >= 72);
  if (primary && secondary) return `${primary.label} + ${secondary.label.toLowerCase()}`;
  if (primary) return primary.label;
  return 'Best model fit';
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

function isDraftRookie(player, draftSeason) {
  const raw = player?.raw ?? player ?? {};
  const metadata = raw?.metadata ?? {};
  const yearsExp = firstDraftInteger(
    raw.years_exp,
    raw.yearsExp,
    raw.experience,
    metadata.years_exp,
    metadata.yearsExp,
    metadata.experience,
    player?.years_exp,
    player?.yearsExp,
  );
  if (yearsExp === 0) return true;

  const season = parseDraftInteger(draftSeason);
  if (season == null) return false;

  const rookieYear = firstDraftInteger(
    raw.rookie_year,
    raw.rookieYear,
    raw.rookie_season,
    raw.draft_year,
    metadata.rookie_year,
    metadata.rookieYear,
    metadata.rookie_season,
    metadata.draft_year,
  );

  return rookieYear === season;
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

function getDraftBoardCardMetric(player, metricKey) {
  switch (metricKey) {
    case 'sleeper':
      return {
        key: 'sleeper',
        value: (
          <DraftBoardMetricValue
            label="Sleeper"
            value={formatRankMetric(player?.rank?.overallRank ?? player?.projection?.fallbackRank ?? player?.projection?.searchRank)}
          />
        ),
        label: null,
        title: player?.rank?.sourceLabel ?? 'Sleeper search / market overall rank',
      };
    case 'rating':
      return {
        key: 'rating',
        value: (
          <DraftBoardMetricValue
            label="Rating"
            value={formatDecimalMetric(player?.draftModel?.score)}
          />
        ),
        label: null,
        title: 'GridShift Draft Rating from market rank, past PPG, scoring fit, and roster need',
      };
    case 'ppg':
      return {
        key: 'ppg',
        value: (
          <DraftBoardMetricValue
            label="PPG"
            value={formatDecimalMetric(player?.scoringFit?.pastPpg ?? player?.workload?.ppg)}
          />
        ),
        label: null,
        title: 'Past-season fantasy points per game in this league scoring',
      };
    case 'volume':
      return {
        key: 'volume',
        value: (
          <DraftBoardMetricValue
            label={player?.position === 'QB' ? 'Att' : player?.position === 'RB' ? 'Touch' : 'Vol'}
            value={formatIntegerMetric(player?.workload?.primaryVolume)}
          />
        ),
        label: null,
        title: 'Primary workload volume from available season stats',
      };
    case 'tier':
      return {
        key: 'tier',
        value: (
          <DraftBoardMetricValue
            label="Tier"
            value={player?.rank?.tier ? `T${player.rank.tier}` : '—'}
          />
        ),
        label: null,
        title: 'Rank-derived tier',
      };
    case 'none':
    default:
      return null;
  }
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

function getNormalizedDraftPicks(draftPicks, draft) {
  return (draftPicks ?? [])
    .map((pick, index) => normalizeDraftPick(pick, index, draft))
    .filter(Boolean)
    .sort((a, b) => a.overall - b.overall);
}

function buildDraftOrderContext({ draft, rosters, draftTradedPicks, draftPicks, myRosterData }) {
  const normalizedPicks = getNormalizedDraftPicks(draftPicks, draft);
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

function buildFastBoardRows({
  boardIds,
  candidatesById,
  players,
  rosters,
  normalizedPicks = [],
  pickOrder = [],
  myRosterId = null,
  getUserDisplayName = null,
}) {
  const rosteredIds = new Set();
  for (const roster of rosters ?? []) {
    for (const playerId of [
      ...(roster?.players ?? []),
      ...(roster?.reserve ?? []),
      ...(roster?.taxi ?? []),
      ...(roster?.starters ?? []),
    ]) {
      if (playerId != null) rosteredIds.add(String(playerId));
    }
  }
  const pickOrderByOverall = new Map((pickOrder ?? []).map((pick) => [pick.overall, pick]));
  const draftedByPlayerId = new Map();
  for (const pick of normalizedPicks ?? []) {
    if (!pick?.playerId) continue;
    const orderPick = pickOrderByOverall.get(pick.overall) ?? null;
    const rosterId = pick.rosterId != null ? String(pick.rosterId) : null;
    const roster = orderPick?.roster
      ?? rosters.find((item) => String(item.roster_id) === String(rosterId))
      ?? null;
    const ownerId = orderPick?.roster?.owner_id ?? roster?.owner_id ?? pick.pickedBy ?? null;
    const ownerLabel = rosterId && rosterId === String(myRosterId)
      ? 'You'
      : (ownerId && getUserDisplayName ? getUserDisplayName(ownerId) : null);
    draftedByPlayerId.set(String(pick.playerId), {
      rosterId,
      ownerId,
      label: ownerLabel && ownerLabel !== 'Unknown' ? ownerLabel : (rosterId ? `Roster ${rosterId}` : 'Unknown'),
      isMine: Boolean(rosterId && myRosterId && rosterId === String(myRosterId)),
      overall: pick.overall,
      round: pick.round,
    });
  }

  return (boardIds ?? []).map((playerId, index) => {
    const id = String(playerId);
    const matched = candidatesById.get(id);
    if (matched) {
      return {
        ...matched,
        boardRank: index + 1,
        available: true,
        draftRoom: {
          ...(matched.draftRoom ?? {}),
          boardRank: index + 1,
        },
      };
    }

    const rawPlayer = players?.[id] ?? null;
    const draftedBy = draftedByPlayerId.get(id) ?? null;
    return {
      id,
      name: rawPlayer?.full_name || `${rawPlayer?.first_name ?? ''} ${rawPlayer?.last_name ?? ''}`.trim() || `Player ${id}`,
      team: String(rawPlayer?.team ?? '—').toUpperCase(),
      position: normalizePosition(rawPlayer?.fantasy_positions?.[0] ?? rawPlayer?.position),
      projection: null,
      rank: null,
      scoringFit: null,
      workload: null,
      teamContext: null,
      schedule: null,
      draftRoom: { boardRank: index + 1 },
      boardRank: index + 1,
      available: false,
      rostered: rosteredIds.has(id),
      draftedBy,
      raw: rawPlayer,
    };
  });
}

function EmptyState({ title, description = null, variant = 'inline' }) {
  const isPage = variant === 'page';
  return (
    <div
      className={['draft-empty-state', isPage ? 'draft-empty-state--page' : ''].filter(Boolean).join(' ')}
      style={isPage ? undefined : { background: 'var(--color-bg-secondary)', borderColor: 'var(--color-separator)' }}
    >
      <p>{title}</p>
      {description ? <span>{description}</span> : null}
    </div>
  );
}

function DraftPageState({ title, description = null }) {
  return <EmptyState title={title} description={description} variant="page" />;
}

function FutureDraftView({ view }) {
  const label = FUTURE_VIEW_LABELS[view] ?? 'Draft view';
  return (
    <div className="draft-page">
      <DraftPageState
        title={`${label} is staged for future work.`}
        description="The route and navigation slot are in place, but War Room, Board, and Results are the active Draft views in this implementation."
      />
    </div>
  );
}

function normalizeSleeperElapsedPickTimer(value, pickTimer) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw < 0) return null;
  return raw > pickTimer ? raw : raw * 1000;
}

function getMonotonicNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function getDraftClockSnapshot(draft, live, paused, receivedAt = Date.now(), receivedAtMonotonic = getMonotonicNow()) {
  const pickTimer = Number(draft?.settings?.pick_timer ?? 0);
  const lastPicked = Number(draft?.last_picked ?? 0);
  if (!(pickTimer > 0) || (!live && !paused)) return null;

  const pickTimerMs = pickTimer * 1000;
  const elapsedMs = normalizeSleeperElapsedPickTimer(draft?.metadata?.elapsed_pick_timer, pickTimer);
  const fallbackElapsedMs = live && lastPicked > 0 ? Math.max(0, receivedAt - lastPicked) : null;
  const serverElapsedMs = elapsedMs ?? fallbackElapsedMs ?? 0;
  const remainingMs = Math.max(0, pickTimerMs - serverElapsedMs);

  return {
    draftId: String(draft?.draft_id ?? ''),
    status: String(draft?.status ?? '').toLowerCase(),
    lastPicked,
    pickTimer,
    remainingMs,
    receivedAt,
    receivedAtMonotonic,
    running: live,
  };
}

function getLocalClockRemainingMs(clockState, now = getMonotonicNow()) {
  if (!clockState) return null;
  if (!clockState.running) return clockState.remainingMs;
  const baseline = clockState.receivedAtMonotonic ?? clockState.receivedAt;
  return Math.max(0, clockState.remainingMs - Math.max(0, now - baseline));
}

function formatClockRemainingMs(remainingMs) {
  if (remainingMs == null) return null;
  const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return { label: `${minutes}:${String(seconds).padStart(2, '0')}`, expired: remaining === 0 };
}

function formatScheduledDraftCountdown(parts) {
  if (!parts) return null;
  const segments = [
    ['M', parts.months],
    ['W', parts.weeks],
    ['D', parts.days],
    ['H', parts.hours],
  ].filter(([, value]) => value > 0);
  if (parts.minutes > 0) segments.push(['m', parts.minutes]);
  segments.push(['S', parts.seconds]);
  return segments.map(([unit, value]) => `${value}${unit}`).join(' ');
}

function formatScheduledDraftDate(startMs) {
  if (!Number.isFinite(startMs)) return '';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(startMs));
}

function useScheduledDraftCountdown(draft) {
  const startMs = getSleeperDraftStartMs(draft);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());
    if (!isSleeperDraftPreDraft(draft) || startMs == null || startMs <= Date.now()) return undefined;

    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [draft?.draft_id, draft?.status, startMs]);

  if (!isSleeperDraftPreDraft(draft) || startMs == null) return null;
  const countdownParts = getScheduledDraftCountdownParts(startMs, nowMs);
  if (!countdownParts) return null;

  return {
    countdownLabel: formatScheduledDraftCountdown(countdownParts),
    dateLabel: formatScheduledDraftDate(startMs),
  };
}

// Sleeper polling validates the draft clock, while the browser owns the visible countdown between
// polls. This avoids the timer stutter caused by rebuilding the display directly from every poll.
function useDraftPickCountdown(draft, live, paused = false) {
  const [now, setNow] = useState(() => getMonotonicNow());
  const [clockState, setClockState] = useState(() => getDraftClockSnapshot(draft, live, paused));

  useEffect(() => {
    const nextSnapshot = getDraftClockSnapshot(draft, live, paused);
    if (!nextSnapshot) {
      setClockState(null);
      return;
    }

    setNow(nextSnapshot.receivedAtMonotonic);
    setClockState((previous) => {
      if (!previous) return nextSnapshot;
      const sameClock =
        previous.draftId === nextSnapshot.draftId
        && previous.status === nextSnapshot.status
        && previous.lastPicked === nextSnapshot.lastPicked
        && previous.pickTimer === nextSnapshot.pickTimer;
      const previousRemaining = getLocalClockRemainingMs(previous, nextSnapshot.receivedAtMonotonic);
      const driftMs = previousRemaining == null
        ? Infinity
        : Math.abs(previousRemaining - nextSnapshot.remainingMs);
      if (sameClock && driftMs <= CLOCK_RESYNC_THRESHOLD_MS) return previous;
      return nextSnapshot;
    });
  }, [
    draft?.draft_id,
    draft?.status,
    draft?.last_picked,
    draft?.settings?.pick_timer,
    draft?.metadata?.elapsed_pick_timer,
    live,
    paused,
  ]);

  useEffect(() => {
    if (!clockState?.running) return undefined;
    let timeoutId = null;

    const tick = () => {
      setNow(getMonotonicNow());
      timeoutId = window.setTimeout(tick, 1000);
    };

    timeoutId = window.setTimeout(tick, 1000);
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [clockState?.draftId, clockState?.lastPicked, clockState?.pickTimer, clockState?.running, clockState?.status]);

  return formatClockRemainingMs(getLocalClockRemainingMs(clockState, now));
}

// Live rooms show the full clock banner. Pre-draft rooms show only the scheduled start when
// Sleeper exposes one; completed or unscheduled rooms lead straight into their board / pick list.
function DraftStatusBanner({ draft, viewModel, getUserDisplayName, onClockExpired = null }) {
  const status = String(draft?.status ?? 'unknown').toLowerCase();
  const live = isLiveDraftStatus(status);
  const paused = status === 'paused';
  const activeRoom = live || paused;
  const countdown = useDraftPickCountdown(draft, live, paused);
  const scheduledDraft = useScheduledDraftCountdown(draft);
  const expiredRefreshKeyRef = useRef('');

  useEffect(() => {
    const clockKey = [
      draft?.draft_id ?? '',
      status,
      draft?.last_picked ?? '',
      draft?.settings?.pick_timer ?? '',
    ].join(':');
    if (!countdown?.expired || !live) {
      expiredRefreshKeyRef.current = '';
      return;
    }
    if (expiredRefreshKeyRef.current === clockKey) return;
    expiredRefreshKeyRef.current = clockKey;
    onClockExpired?.();
  }, [
    countdown?.expired,
    draft?.draft_id,
    draft?.last_picked,
    draft?.settings?.pick_timer,
    live,
    onClockExpired,
    status,
  ]);

  if (!activeRoom) {
    if (!scheduledDraft) return null;
    return (
      <div className="draft-status-banner-shell" aria-live="polite">
        <section className="draft-status-banner draft-status-banner--scheduled">
          <div className="draft-status-banner__scheduled-date">
            <span className="draft-status-banner__label">Draft Starts</span>
            <strong>{scheduledDraft.dateLabel}</strong>
          </div>
          <div className="draft-status-banner__scheduled-countdown" aria-label={`Draft countdown ${scheduledDraft.countdownLabel}`}>
            <span className="draft-status-banner__label">Countdown</span>
            <strong>{scheduledDraft.countdownLabel}</strong>
          </div>
        </section>
      </div>
    );
  }

  const currentPick = viewModel?.currentPick ?? null;
  const onClockTeam = currentPick?.roster?.owner_id
    ? getUserDisplayName(currentPick.roster.owner_id)
    : (currentPick?.rosterId ? `Team ${currentPick.rosterId}` : 'Unknown');
  const nextPick = (viewModel?.upcomingPicks ?? []).find((pick) => pick.overall > (viewModel?.currentOverall ?? 0)) ?? null;
  const nextPickTeam = nextPick?.roster?.owner_id
    ? getUserDisplayName(nextPick.roster.owner_id)
    : (nextPick?.rosterId ? `Team ${nextPick.rosterId}` : null);
  const nextMyPickLabel = viewModel?.nextMyPick ? formatPickLabel(viewModel.nextMyPick) : '—';
  const nextMyPickDetail = viewModel?.nextMyPick
    ? `Round ${viewModel.nextMyPick.round}, Pick ${viewModel.nextMyPick.roundPick}`
    : 'No upcoming pick found';
  const picksBeforeUserCount = viewModel?.picksBeforeUser?.length ?? null;
  const likelyPick = viewModel?.onClockRecommendation ?? null;
  const likelyPickName = likelyPick ? getPlayerName(likelyPick) : 'Unavailable';
  const likelyPickMeta = likelyPick
    ? [likelyPick.position, likelyPick.team].filter(Boolean).join(' · ')
    : 'Waiting for draft model';
  const likelyPickRating = likelyPick?.draftModel?.score != null ? formatDecimalMetric(likelyPick.draftModel.score) : '—';
  const likelyPickRank = likelyPick?.rank?.overallRank != null ? `#${formatRankMetric(likelyPick.rank.overallRank)}` : '—';
  const likelyPickReason = likelyPick ? getDraftProjectionReason(likelyPick) : 'Waiting for draft model';
  const likelyPickPhotoUrl = getSleeperPlayerImageUrl(likelyPick?.id);
  const statusLabel = paused ? 'Paused' : 'Live';

  return (
    <div className="draft-status-banner-shell" aria-live="polite">
      <section className={`draft-status-banner ${paused ? 'is-paused' : 'is-live'}`}>
        <div className="draft-status-banner__live-state">
          <div className="draft-status-banner__heading">
            <span className="draft-live-pill">
              <span className="draft-live-dot" aria-hidden="true" />
              {statusLabel}
            </span>
          </div>
          <div className="draft-status-banner__clock-card">
            <div className="draft-status-banner__clock-card-team">
              <span className="draft-status-banner__label">On Clock</span>
              <strong>{onClockTeam}</strong>
            </div>
            <div>
              <span className="draft-status-banner__label">Pick</span>
              <strong>{currentPick ? formatPickLabel(currentPick) : '—'}</strong>
            </div>
            <div>
              <span className="draft-status-banner__label">Clock</span>
              <strong className={`draft-status-banner__clock${countdown?.expired ? ' is-expired' : ''}`} aria-label="Time remaining on the clock">
                {countdown?.label ?? '—'}
              </strong>
            </div>
          </div>
          {nextPick ? (
            <span className="draft-status-banner__next-pick">
              {`Up next: ${nextPickTeam ?? 'Unknown'}`}
            </span>
          ) : null}
        </div>
        <div className="draft-status-banner__projection">
          <div className="draft-status-banner__projection-copy">
            <span className="draft-status-banner__label">Projected Selection</span>
            <div className="draft-status-banner__projection-player">
              <strong>{likelyPickName}</strong>
              <span className="draft-status-banner__projection-meta">{likelyPickMeta}</span>
            </div>
            <div className="draft-status-banner__projection-metrics">
              <span>Rating {likelyPickRating}</span>
              <span>Rank {likelyPickRank}</span>
              <span>{likelyPickReason}</span>
            </div>
          </div>
          <div className="draft-status-banner__projection-photo" aria-hidden="true">
            <span>{getCompanionInitials(likelyPickName)}</span>
            {likelyPickPhotoUrl ? (
              <img
                src={likelyPickPhotoUrl}
                alt=""
                width="64"
                height="64"
                loading="lazy"
                onError={(event) => { event.currentTarget.hidden = true; }}
              />
            ) : null}
          </div>
        </div>
      </section>
      <div className="draft-status-banner__user-pick-summary">
        <span>Your next pick</span>
        <strong>{nextMyPickLabel}</strong>
        {picksBeforeUserCount != null ? <em>{picksBeforeUserCount} picks away</em> : null}
        <span>{nextMyPickDetail}</span>
      </div>
    </div>
  );
}

const LiveDraftStatusBanner = memo(function LiveDraftStatusBanner({
  draftClockStore,
  fallbackDraft,
  viewModel,
  getUserDisplayName,
  onClockExpired = null,
}) {
  const draft = useDraftClockMeta(draftClockStore, fallbackDraft);
  return (
    <DraftStatusBanner
      draft={draft}
      viewModel={viewModel}
      getUserDisplayName={getUserDisplayName}
      onClockExpired={onClockExpired}
    />
  );
});

function PositionFilter({ positions, activePosition, onChange }) {
  const filterRef = useRef(null);

  return (
    <div className="draft-position-filter-shell draft-scroll-region">
      <div ref={filterRef} className="draft-position-filter" role="tablist" aria-label="Draft player positions">
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
      <DraftScrollControls targetRef={filterRef} axis="x" label="draft positions" />
    </div>
  );
}

function DraftSegmentedControl({ label, options, value, onChange, className = '' }) {
  return (
    <div className={['draft-segmented-control', className].filter(Boolean).join(' ')} role="group" aria-label={label}>
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
  identityMetaSegments = null,
  className = '',
  compact = true,
  showPosition = true,
  showTeamLogo = true,
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
  const defaultMetaSegments = [
    player.team,
    bye ? `Bye ${bye}` : null,
    player?.schedule?.label && player.schedule.label !== 'Unavailable' ? `${player.schedule.label} schedule` : null,
  ].filter(Boolean);
  const metaSegments = identityMetaSegments ?? defaultMetaSegments;

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
      compact={compact}
      showPosition={showPosition}
      showTeamLogo={showTeamLogo}
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

function getBoardRowMetrics(player) {
  return [
    {
      key: 'pos-rank',
      value: (
        <DraftBoardMetricValue
          label={null}
          value={player.available === false ? '—' : formatPositionRank(player)}
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
  ];
}

function getDraftBoardStatus(player) {
  if (player?.available !== false) return null;
  const draftedBy = player?.draftedBy ?? null;
  if (!draftedBy) return <CompanionPlayerStatus label="Gone" />;
  const label = draftedBy.isMine ? 'Drafted by You' : `Drafted by ${draftedBy.label}`;
  return (
    <CompanionPlayerStatus
      label={label}
      className={['draft-board-owner-status', draftedBy.isMine ? 'is-user-team' : ''].filter(Boolean).join(' ')}
    />
  );
}

function LeagueLogsAttribution({ attribution, profileKey, profile, lastRefreshed }) {
  if (!attribution?.text || !attribution?.url) return null;
  const details = [
    formatLeagueLogsMarketProfile({ profile, profileKey }),
    lastRefreshed ? `Updated ${new Date(lastRefreshed).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="draft-market-attribution">
      <a href={attribution.url} target="_blank" rel="noopener noreferrer">{attribution.text}</a>
      {details ? <span>{details}</span> : null}
    </div>
  );
}

function haveSameSetValues(previousSet, nextSet) {
  if (previousSet === nextSet) return true;
  if (!previousSet || !nextSet || previousSet.size !== nextSet.size) return false;
  for (const value of previousSet) {
    if (!nextSet.has(value)) return false;
  }
  return true;
}

function haveSameStringArray(previousArray = [], nextArray = []) {
  if (previousArray === nextArray) return true;
  if (previousArray.length !== nextArray.length) return false;
  for (let index = 0; index < previousArray.length; index += 1) {
    if (String(previousArray[index]) !== String(nextArray[index])) return false;
  }
  return true;
}

const BigBoard = memo(function BigBoard({
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
          <span>{sorted.length} players{statsLoading ? ' · refreshing' : ''}</span>
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
      <PositionFilter positions={positions} activePosition={activePosition} onChange={onPositionChange} />
      <DraftModelWeights
        weights={modelWeights}
        onChange={onModelWeightChange}
        onReset={onResetModelWeights}
      />
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
}, (previous, next) => (
  previous.candidates === next.candidates
  && haveSameSetValues(previous.boardIds, next.boardIds)
  && previous.activePosition === next.activePosition
  && previous.query === next.query
  && previous.setQuery === next.setQuery
  && haveSameStringArray(previous.positions, next.positions)
  && previous.onPositionChange === next.onPositionChange
  && previous.onAdd === next.onAdd
  && previous.onViewPlayer === next.onViewPlayer
  && previous.darkMode === next.darkMode
  && previous.boardScope === next.boardScope
  && previous.onBoardScopeChange === next.onBoardScopeChange
  && previous.statsLoading === next.statsLoading
  && previous.modelWeights === next.modelWeights
  && previous.onModelWeightChange === next.onModelWeightChange
  && previous.onResetModelWeights === next.onResetModelWeights
));

const PositionBoardGroup = memo(function PositionBoardGroup({
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
              className={[
                'draft-player-row--board',
                player?.draftedBy?.isMine ? 'is-drafted-by-user' : '',
                player?.available === false && !player?.draftedBy?.isMine ? 'is-drafted-by-other' : '',
              ].filter(Boolean).join(' ')}
              disabled={!player.available}
              onViewPlayer={onViewPlayer}
              metrics={getBoardRowMetrics(player)}
              status={getDraftBoardStatus(player)}
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
}, (previous, next) => (
  previous.position === next.position
  && previous.darkMode === next.darkMode
  && previous.allowReorder === next.allowReorder
  && previous.onMove === next.onMove
  && previous.onRemove === next.onRemove
  && previous.onViewPlayer === next.onViewPlayer
  && haveSamePlayerRows(previous.rows, next.rows)
));

function MyBoard({
  boardByPosition,
  overallBoardIds,
  boardRows,
  darkMode,
  onMove,
  onRemove,
  onViewPlayer,
  sortMode,
  onSortModeChange,
}) {
  const [visibleBoardState, setVisibleBoardState] = useState(() => createOrderedBoardState(boardByPosition, overallBoardIds));

  useEffect(() => {
    setVisibleBoardState(createOrderedBoardState(boardByPosition, overallBoardIds));
  }, [boardByPosition, overallBoardIds]);

  const moveVisibleBoardPlayer = useCallback((position, playerId, direction) => {
    flushSync(() => {
      setVisibleBoardState((current) => (
        position === 'Overall'
          ? moveOverallBoardPlayer(current, playerId, direction)
          : moveOrderedBoardPlayerWithinPosition(current, position, playerId, direction)
      ));
    });
    onMove(position, playerId, direction);
  }, [onMove]);

  const removeVisibleBoardPlayer = useCallback((playerId) => {
    flushSync(() => {
      setVisibleBoardState((current) => removePlayerFromOrderedBoard(current, playerId));
    });
    onRemove(playerId);
  }, [onRemove]);

  const rowsByPosition = new Map(boardRows.map((row) => [String(row.id), row]));
  const positions = Object.keys(visibleBoardState.boardByPosition ?? {});
  const orderedPositions = [
    ...POSITION_ORDER.filter((position) => positions.includes(position)),
    ...positions.filter((position) => !POSITION_ORDER.includes(position)).sort(),
  ];
  const overallRows = visibleBoardState.overallIds
    .map((id) => rowsByPosition.get(String(id)))
    .filter(Boolean);

  return (
    <section className="draft-panel draft-my-board">
      <div className="draft-panel__header">
        <div>
          <h2>Board</h2>
          <span>{visibleBoardState.overallIds.length} ranked targets</span>
        </div>
        {orderedPositions.length > 0 ? (
          <div className="draft-my-board__controls">
            <DraftSegmentedControl
              label="Board view"
              options={MY_BOARD_SORT_OPTIONS}
              value={sortMode}
              onChange={onSortModeChange}
            />
          </div>
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
              onMove={moveVisibleBoardPlayer}
              onRemove={removeVisibleBoardPlayer}
              onViewPlayer={onViewPlayer}
            />
          ) : orderedPositions.map((position) => {
            const rows = (visibleBoardState.boardByPosition[position] ?? [])
              .map((id) => rowsByPosition.get(String(id)))
              .filter(Boolean);
            return (
              <PositionBoardGroup
                key={position}
                position={position}
                rows={rows}
                darkMode={darkMode}
                onMove={moveVisibleBoardPlayer}
                onRemove={removeVisibleBoardPlayer}
                onViewPlayer={onViewPlayer}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function getWorkspaceLanePositions(positions, boardByPosition) {
  const found = new Set();
  for (const position of positions ?? []) {
    const normalized = normalizePosition(position);
    if (normalized && normalized !== 'ALL') found.add(normalized);
  }
  for (const position of Object.keys(boardByPosition ?? {})) {
    const normalized = normalizePosition(position);
    if (normalized && normalized !== 'ALL') found.add(normalized);
  }
  const ordered = POSITION_ORDER.filter((position) => found.has(position));
  const extras = [...found].filter((position) => !POSITION_ORDER.includes(position)).sort();
  return ordered.length || extras.length ? [...ordered, ...extras] : ['QB', 'RB', 'WR', 'TE'];
}

function normalizeRosterSlot(slot) {
  const value = String(slot ?? '').trim().toUpperCase();
  if (value === 'DST') return 'DEF';
  if (value === 'BE' || value === 'BENCH') return 'BN';
  return value || 'BN';
}

const ROSTER_FLEX_SLOT_POSITIONS = {
  FLEX: ['RB', 'WR', 'TE'],
  REC_FLEX: ['RB', 'WR', 'TE'],
  WRT_FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  RBWR_FLEX: ['RB', 'WR'],
  RB_WR: ['RB', 'WR'],
  WRTE_FLEX: ['WR', 'TE'],
  WR_TE: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  SUPERFLEX: ['QB', 'RB', 'WR', 'TE'],
  OP: ['QB', 'RB', 'WR', 'TE'],
  IDP_FLEX: ['DL', 'LB', 'DB'],
  FLEX_IDP: ['DL', 'LB', 'DB'],
  DP: ['DL', 'LB', 'DB'],
};

function formatRosterSlotLabel(slot) {
  const normalized = normalizeRosterSlot(slot);
  if (ROSTER_FLEX_SLOT_POSITIONS[normalized]) return ROSTER_FLEX_SLOT_POSITIONS[normalized].join('/');
  return normalized;
}

function getRosterSlotEligibilities(slot) {
  const normalized = normalizeRosterSlot(slot);
  if (ROSTER_FLEX_SLOT_POSITIONS[normalized]) return new Set(ROSTER_FLEX_SLOT_POSITIONS[normalized]);
  if (normalized === 'BN' || normalized === 'IR' || normalized === 'TAXI') return null;
  return new Set([normalizePosition(normalized)]);
}

function slotAcceptsPosition(slot, position) {
  const eligibilities = getRosterSlotEligibilities(slot);
  if (!eligibilities) return true;
  return eligibilities.has(normalizePosition(position));
}

function getSleeperPlayerName(player, fallback = 'Player') {
  return player?.full_name
    || `${player?.first_name ?? ''} ${player?.last_name ?? ''}`.trim()
    || player?.metadata?.full_name
    || fallback;
}

function buildRosterTrayPlayer({ playerId, rawPlayer, sourceLabel = null, sortOrder = 0 }) {
  const id = String(playerId ?? '');
  if (!id) return null;
  const position = normalizePosition(rawPlayer?.fantasy_positions?.[0] ?? rawPlayer?.position);
  return {
    id,
    name: getSleeperPlayerName(rawPlayer, `Player ${id}`),
    position,
    team: String(rawPlayer?.team ?? '').toUpperCase(),
    sourceLabel,
    sortOrder,
  };
}

function buildMyDraftRosterTray({ league, draftOrderContext, myRosterData, players, keeperIds = new Set() }) {
  const myRosterId = myRosterData?.roster_id != null ? String(myRosterData.roster_id) : null;
  const slots = (league?.roster_positions ?? [])
    .filter((slot) => normalizeRosterSlot(slot) !== 'IR' && normalizeRosterSlot(slot) !== 'TAXI')
    .map((slot, index) => ({
      id: `${slot}-${index}`,
      slot: normalizeRosterSlot(slot),
      originalSlot: slot,
      player: null,
    }));

  if (!myRosterId || slots.length === 0) return slots;

  const rosterEntries = [];
  const seenPlayerIds = new Set();
  const starterIds = Array.isArray(myRosterData?.starters)
    ? myRosterData.starters.map((id) => String(id)).filter((id) => id && id !== '0')
    : [];
  const rosterPlayerIds = Array.isArray(myRosterData?.players)
    ? myRosterData.players.map((id) => String(id)).filter(Boolean)
    : [];
  const orderedRosterIds = [
    ...starterIds,
    ...rosterPlayerIds.filter((id) => !starterIds.includes(id)),
  ];

  orderedRosterIds.forEach((playerId, index) => {
    if (seenPlayerIds.has(playerId)) return;
    const player = buildRosterTrayPlayer({
      playerId,
      rawPlayer: players?.[playerId] ?? null,
      sourceLabel: 'Roster',
      sortOrder: index,
    });
    if (!player) return;
    seenPlayerIds.add(playerId);
    rosterEntries.push(player);
  });

  const myPicks = (draftOrderContext?.normalizedPicks ?? [])
    .filter((pick) => pick.playerId && pick.rosterId === myRosterId)
    .slice()
    .sort((a, b) => a.overall - b.overall);

  myPicks.forEach((pick, index) => {
    const playerId = String(pick.playerId);
    if (seenPlayerIds.has(playerId)) return;
    const rawPlayer = players?.[playerId] ?? null;
    const player = buildRosterTrayPlayer({
      playerId,
      rawPlayer,
      sourceLabel: formatPickLabel(pick),
      sortOrder: 10_000 + index,
    });
    if (!player) return;
    player.name = getDraftedPlayerLabel(pick, players);
    seenPlayerIds.add(playerId);
    rosterEntries.push(player);
  });

  const findSlotIndex = (position, exactOnly = false) => slots.findIndex((slot) => {
    if (slot.player) return false;
    const slotName = normalizeRosterSlot(slot.slot);
    if (exactOnly) return slotName === normalizePosition(position);
    return slotAcceptsPosition(slotName, position);
  });

  const assignPlayer = (player, exactOnly) => {
    const slotIndex = findSlotIndex(player.position, exactOnly);
    if (slotIndex < 0) return false;
    slots[slotIndex] = {
      ...slots[slotIndex],
      player: {
        ...player,
        isKeeper: keeperIds.has(player.id),
      },
    };
    return true;
  };

  const unassigned = [];
  for (const player of rosterEntries.sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!assignPlayer(player, true)) unassigned.push(player);
  }

  const overflow = [];
  for (const player of unassigned) {
    if (!assignPlayer(player, false)) overflow.push(player);
  }

  for (const player of overflow) {
    slots.push({
      id: `overflow-${player.id}`,
      slot: 'BN',
      originalSlot: 'BN',
      player: {
        ...player,
        isKeeper: keeperIds.has(player.id),
      },
    });
  }

  return slots;
}

function DraftBoardCardShell({
  player,
  darkMode,
  index = null,
  isLast = false,
  metricKey = 'none',
  onViewPlayer,
  onDragStart,
  onDragEnd = null,
  onDropBefore = null,
  onMove = null,
  onRemove = null,
  onAdd = null,
  position = null,
  allowReorder = false,
  allowDrag = true,
  disabled = false,
}) {
  const isGone = player?.available === false;
  const isDraftedByUser = Boolean(player?.draftedBy?.isMine);
  const canDrag = allowDrag && !disabled && !isGone;
  const cardMetric = getDraftBoardCardMetric(player, metricKey);
  const actions = [];

  if (onAdd) {
    actions.push(
      <CompanionPlayerAction
        key="add"
        label={`Add ${getPlayerName(player)} to board`}
        onClick={() => onAdd(player)}
      >
        Add
      </CompanionPlayerAction>,
    );
  }

  if (allowReorder && onMove && position) {
    actions.push(
      <CompanionPlayerAction
        key="up"
        label={`Move ${getPlayerName(player)} up`}
        disabled={index === 0}
        onClick={() => onMove(position, player.id, -1)}
      >
        <ArrowIcon direction="up" />
      </CompanionPlayerAction>,
      <CompanionPlayerAction
        key="down"
        label={`Move ${getPlayerName(player)} down`}
        disabled={index === null || isLast}
        onClick={() => onMove(position, player.id, 1)}
      >
        <ArrowIcon direction="down" />
      </CompanionPlayerAction>,
    );
  }

  if (onRemove) {
    actions.push(
      <CompanionPlayerAction
        key="remove"
        label={`Remove ${getPlayerName(player)} from board`}
        onClick={() => onRemove(player.id)}
      >
        <CloseIcon />
      </CompanionPlayerAction>,
    );
  }

  return (
    <div
      className={[
        'draft-board-card-shell',
        canDrag ? 'is-draggable' : '',
        isGone ? 'is-gone' : '',
        isDraftedByUser ? 'is-drafted-by-user' : '',
        isGone && !isDraftedByUser ? 'is-drafted-by-other' : '',
      ].filter(Boolean).join(' ')}
      draggable={canDrag}
      onDragStart={canDrag ? (event) => onDragStart?.(event, player, position) : undefined}
      onDragEnd={canDrag ? onDragEnd : undefined}
      onDragOver={onDropBefore ? (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      } : undefined}
      onDrop={onDropBefore ? (event) => {
        event.preventDefault();
        event.stopPropagation();
        onDropBefore(player.id);
      } : undefined}
    >
      <DraftPlayerRow
        player={player}
        darkMode={darkMode}
        className={[
          'draft-player-row--board-card',
          index != null ? 'draft-player-row--ranked-card' : 'draft-player-row--available-card',
          cardMetric ? 'has-board-card-metric' : '',
          isDraftedByUser ? 'is-drafted-by-user' : '',
          isGone && !isDraftedByUser ? 'is-drafted-by-other' : '',
        ].filter(Boolean).join(' ')}
        disabled={disabled || isGone}
        onViewPlayer={onViewPlayer}
        metrics={cardMetric ? [cardMetric] : []}
        metricColumnGridTemplate={null}
        rowGridTemplate={cardMetric ? 'var(--draft-board-card-grid-with-metric)' : 'var(--draft-board-card-grid)'}
        compactRowGridTemplate={cardMetric ? 'var(--draft-board-card-grid-with-metric)' : 'var(--draft-board-card-grid-compact)'}
        identityMetaSegments={[[player.position, player.team || 'FA'].filter(Boolean).join(' · ')]}
        compact={false}
        showPosition={false}
        status={getDraftBoardStatus(player)}
        actions={actions}
        showTeamLogo={false}
      />
    </div>
  );
}

function getScrollMetrics(element, axis) {
  if (!element) return { scrollable: false, atStart: true, atEnd: true };
  const scrollPos = axis === 'x' ? element.scrollLeft : element.scrollTop;
  const clientSize = axis === 'x' ? element.clientWidth : element.clientHeight;
  const scrollSize = axis === 'x' ? element.scrollWidth : element.scrollHeight;
  const maxScroll = Math.max(0, scrollSize - clientSize);
  return {
    scrollable: maxScroll > 2,
    atStart: scrollPos <= 1,
    atEnd: scrollPos >= maxScroll - 1,
  };
}

function DraftScrollIcon({ axis, direction }) {
  const horizontal = axis === 'x';
  const points = horizontal
    ? (direction === 'start' ? '15 18 9 12 15 6' : '9 18 15 12 9 6')
    : (direction === 'start' ? '6 15 12 9 18 15' : '6 9 12 15 18 9');
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points={points} />
    </svg>
  );
}

function DraftScrollControls({ targetRef, axis = 'x', label }) {
  const [scrollState, setScrollState] = useState(() => ({ scrollable: false, atStart: true, atEnd: true }));

  useEffect(() => {
    const element = targetRef.current;
    if (!element) return undefined;

    const update = () => setScrollState(getScrollMetrics(element, axis));
    update();

    element.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    resizeObserver?.observe(element);

    return () => {
      element.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      resizeObserver?.disconnect();
    };
  }, [axis, targetRef]);

  if (!scrollState.scrollable) return null;

  const scroll = (direction) => {
    const element = targetRef.current;
    if (!element) return;
    const distance = axis === 'x'
      ? Math.max(160, Math.floor(element.clientWidth * 0.72))
      : Math.max(96, Math.floor(element.clientHeight * 0.72));
    element.scrollBy({
      left: axis === 'x' ? (direction === 'start' ? -distance : distance) : 0,
      top: axis === 'y' ? (direction === 'start' ? -distance : distance) : 0,
      behavior: 'smooth',
    });
  };

  return (
    <div
      className={[
        'draft-scroll-controls',
        `is-${axis}`,
        !scrollState.atStart ? 'can-scroll-start' : '',
        !scrollState.atEnd ? 'can-scroll-end' : '',
      ].filter(Boolean).join(' ')}
      aria-label={`${label} scroll controls`}
    >
      {!scrollState.atStart ? (
        <button
          type="button"
          className="draft-scroll-arrow is-start"
          onClick={() => scroll('start')}
          aria-label={`Scroll ${label} ${axis === 'x' ? 'left' : 'up'}`}
        >
          <DraftScrollIcon axis={axis} direction="start" />
        </button>
      ) : null}
      {!scrollState.atEnd ? (
        <button
          type="button"
          className="draft-scroll-arrow is-end"
          onClick={() => scroll('end')}
          aria-label={`Scroll ${label} ${axis === 'x' ? 'right' : 'down'}`}
        >
          <DraftScrollIcon axis={axis} direction="end" />
        </button>
      ) : null}
    </div>
  );
}

function haveSamePlayerRows(previousRows = [], nextRows = []) {
  if (previousRows === nextRows) return true;
  if (previousRows.length !== nextRows.length) return false;
  for (let index = 0; index < previousRows.length; index += 1) {
    const previous = previousRows[index];
    const next = nextRows[index];
    if (
      String(previous?.id) !== String(next?.id)
      || previous?.available !== next?.available
      || previous?.isKeeper !== next?.isKeeper
    ) {
      return false;
    }
  }
  return true;
}

const DraftAvailablePlayerList = memo(function DraftAvailablePlayerList({
  players,
  darkMode,
  metricKey,
  onAdd,
  onDragStart,
  onDragEnd,
  onViewPlayer,
  emptyTitle = 'No available players match this filter.',
}) {
  const listRef = useRef(null);
  if (players.length === 0) return <EmptyState title={emptyTitle} />;
  return (
    <div className="draft-scroll-region draft-board-available-list-shell">
      <div ref={listRef} className="draft-board-available-list">
        {players.map((player) => (
          <DraftBoardCardShell
            key={player.id}
            player={player}
            darkMode={darkMode}
            metricKey={metricKey}
            onAdd={onAdd}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onViewPlayer={onViewPlayer}
            allowDrag
          />
        ))}
      </div>
      <DraftScrollControls targetRef={listRef} axis="y" label="available players" />
    </div>
  );
}, (previous, next) => (
  previous.darkMode === next.darkMode
  && previous.metricKey === next.metricKey
  && previous.onAdd === next.onAdd
  && previous.onDragStart === next.onDragStart
  && previous.onDragEnd === next.onDragEnd
  && previous.onViewPlayer === next.onViewPlayer
  && previous.emptyTitle === next.emptyTitle
  && haveSamePlayerRows(previous.players, next.players)
));

const DraftBoardLane = memo(function DraftBoardLane({
  position,
  rows,
  darkMode,
  metricKey,
  onDragStart,
  onDragEnd,
  onDropPlayer,
  onMove,
  onRemove,
  onViewPlayer,
  allowDrop = true,
  allowReorder = true,
  canAcceptDrop = true,
  activeMobile = false,
}) {
  const liveRows = rows.filter((row) => row.available !== false);
  const stackRef = useRef(null);
  const normalizedPosition = normalizePosition(position);
  const companionPositionColor = POSITION_COLORS[normalizedPosition] ?? null;
  const isOverallLane = position === 'Overall';
  const positionColor = isOverallLane
    ? 'var(--color-signature)'
    : companionPositionColor ?? 'var(--color-fill-secondary)';
  const positionTextColor = isOverallLane
    ? 'var(--color-signature-fg)'
    : (companionPositionColor ? getPositionTextColor(companionPositionColor) : 'var(--color-label)');
  const isDroppable = allowDrop && canAcceptDrop;
  const drop = (event, beforePlayerId = null) => {
    if (!isDroppable) return;
    event.preventDefault();
    event.stopPropagation();
    onDropPlayer(position, beforePlayerId);
  };

  return (
    <section
      className={[
        'draft-board-lane',
        activeMobile ? 'is-active-mobile' : '',
        position === 'Overall' ? 'is-overall' : '',
        isDroppable ? 'can-drop' : '',
        allowDrop && !canAcceptDrop ? 'cannot-drop' : '',
      ].filter(Boolean).join(' ')}
      style={{
        '--draft-board-lane-color': positionColor,
        '--draft-board-lane-fg': positionTextColor,
      }}
      onDragOver={isDroppable ? (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      } : undefined}
      onDrop={isDroppable ? (event) => drop(event) : undefined}
    >
      <div className="draft-board-lane__header">
        <strong>{position}</strong>
        <span>{liveRows.length} live · {rows.length} targets</span>
      </div>
      <div className="draft-scroll-region draft-board-lane__stack-shell">
        <div ref={stackRef} className="draft-board-lane__stack">
          {rows.map((player, index) => (
            <DraftBoardCardShell
              key={player.id}
              player={player}
              darkMode={darkMode}
              metricKey={metricKey}
              index={index}
              isLast={index === rows.length - 1}
              position={position}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDropBefore={isDroppable ? (beforePlayerId) => onDropPlayer(position, beforePlayerId) : null}
              onMove={allowReorder ? onMove : null}
              onRemove={onRemove}
              onViewPlayer={onViewPlayer}
              allowReorder={allowReorder}
              allowDrag={allowDrop}
            />
          ))}
          {rows.length === 0 ? (
            <div className="draft-board-lane__empty">
              {allowDrop ? `Drop ${position} targets here.` : 'Add players from Available to sort this view.'}
            </div>
          ) : (
            allowDrop ? <div className="draft-board-lane__drop">Drop to add at bottom</div> : null
          )}
        </div>
        <DraftScrollControls targetRef={stackRef} axis="y" label={`${position} lane`} />
      </div>
    </section>
  );
}, (previous, next) => (
  previous.position === next.position
  && previous.darkMode === next.darkMode
  && previous.metricKey === next.metricKey
  && previous.allowDrop === next.allowDrop
  && previous.allowReorder === next.allowReorder
  && previous.canAcceptDrop === next.canAcceptDrop
  && previous.activeMobile === next.activeMobile
  && previous.onDragStart === next.onDragStart
  && previous.onDragEnd === next.onDragEnd
  && previous.onDropPlayer === next.onDropPlayer
  && previous.onMove === next.onMove
  && previous.onRemove === next.onRemove
  && previous.onViewPlayer === next.onViewPlayer
  && haveSamePlayerRows(previous.rows, next.rows)
));

function DraftRosterTray({ slots, onToggleKeeper }) {
  const slotsRef = useRef(null);
  return (
    <section className="draft-board-roster-tray" aria-label="My roster">
      <div className="draft-board-roster-tray__label">My Roster</div>
      <div className="draft-scroll-region draft-board-roster-tray__slots-shell">
        <div ref={slotsRef} className="draft-board-roster-tray__slots">
          {slots.map((slot) => (
            <div
              key={slot.id}
              className={[
                'draft-board-roster-slot',
                slot.player ? 'is-filled' : '',
                slot.player?.isKeeper ? 'is-keeper' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="draft-board-roster-slot__slot">{formatRosterSlotLabel(slot.slot)}</span>
              {slot.player ? (
                <>
                  <button
                    type="button"
                    className="draft-board-roster-slot__keeper"
                    aria-pressed={slot.player.isKeeper}
                    aria-label={`${slot.player.isKeeper ? 'Unmark' : 'Mark'} ${slot.player.name} as keeper`}
                    onClick={() => onToggleKeeper?.(slot.player.id)}
                  >
                    <CheckIcon />
                    <span>{slot.player.isKeeper ? 'Keeper' : 'Keep'}</span>
                  </button>
                  <strong>{slot.player.name}</strong>
                  <span>{[slot.player.team, slot.player.position, slot.player.sourceLabel].filter(Boolean).join(' · ')}</span>
                </>
              ) : (
                <span>Open</span>
              )}
            </div>
          ))}
        </div>
        <DraftScrollControls targetRef={slotsRef} axis="x" label="roster tray" />
      </div>
    </section>
  );
}

function MyBoardWorkspace({
  boardByPosition,
  overallBoardIds,
  boardRows,
  availablePlayers,
  boardIds,
  positions,
  darkMode,
  onAdd,
  onDropPlayer,
  onMove,
  onRemove,
  onViewPlayer,
  boardViewMode,
  onBoardViewModeChange,
  activePosition,
  onPositionChange,
  query,
  setQuery,
  boardScope,
  onBoardScopeChange,
  rosterSlots,
  onToggleKeeper,
  cardMetricKey,
}) {
  const boardRowsById = useMemo(() => new Map(boardRows.map((row) => [String(row.id), row])), [boardRows]);
  const workspacePlayersById = useMemo(() => new Map(
    [...boardRows, ...availablePlayers].map((row) => [String(row.id), row]),
  ), [boardRows, availablePlayers]);
  const workspacePlayersByIdRef = useRef(workspacePlayersById);
  workspacePlayersByIdRef.current = workspacePlayersById;
  const boardMembershipKey = useMemo(
    () => [...boardIds].map((id) => String(id)).sort().join('|'),
    [boardIds],
  );
  const deferredBoardIds = useDeferredValue(boardIds);
  const deferredBoardMembershipKey = useDeferredValue(boardMembershipKey);
  const boardIdSet = useMemo(() => new Set(deferredBoardIds), [deferredBoardMembershipKey]);
  const lanePositions = useMemo(
    () => getWorkspaceLanePositions(positions, boardByPosition),
    [positions, boardByPosition],
  );
  const overallRows = useMemo(
    () => overallBoardIds.map((id) => boardRowsById.get(String(id))).filter(Boolean),
    [overallBoardIds, boardRowsById],
  );
  const [activeLane, setActiveLane] = useState(() => lanePositions[0] ?? 'QB');
  const [draggingPlayerId, setDraggingPlayerId] = useState(null);
  const [availableRailWidth, setAvailableRailWidth] = useState(300);
  const lanesRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    if (!lanePositions.includes(activeLane)) setActiveLane(lanePositions[0] ?? 'QB');
  }, [lanePositions, activeLane]);

  const visibleAvailablePlayers = useMemo(() => (
    filterCandidates(
      availablePlayers.filter((player) => !boardIdSet.has(player.id) && player.available !== false),
      activePosition,
      query,
    ).slice(0, 120)
  ), [availablePlayers, boardIdSet, activePosition, query]);

  const rowsByPosition = useMemo(() => {
    const result = new Map();
    for (const position of lanePositions) {
      result.set(position, (boardByPosition[position] ?? [])
        .map((id) => boardRowsById.get(String(id)))
        .filter(Boolean));
    }
    return result;
  }, [lanePositions, boardByPosition, boardRowsById]);

  const handleDragStart = useCallback((event, player, sourcePosition = null) => {
    dragRef.current = {
      playerId: String(player.id),
      sourcePosition,
    };
    flushSync(() => {
      setDraggingPlayerId(String(player.id));
    });
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(player.id));
  }, []);

  const handleDragEnd = useCallback(() => {
    dragRef.current = null;
    setDraggingPlayerId(null);
  }, []);

  const canDropPlayerIntoPosition = useCallback((playerId, position) => {
    const player = workspacePlayersByIdRef.current.get(String(playerId));
    return playerCanSlotIntoBoardPosition(player, position);
  }, []);

  const handleDropPlayer = useCallback((position, beforePlayerId = null) => {
    const playerId = dragRef.current?.playerId;
    if (!playerId) return;
    if (!canDropPlayerIntoPosition(playerId, position)) {
      dragRef.current = null;
      setDraggingPlayerId(null);
      return;
    }
    onDropPlayer(position, playerId, beforePlayerId);
    dragRef.current = null;
    setDraggingPlayerId(null);
  }, [canDropPlayerIntoPosition, onDropPlayer]);

  const startRailResize = useCallback((event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = availableRailWidth;

    const resize = (moveEvent) => {
      const viewportMax = Math.max(260, Math.min(460, window.innerWidth * 0.38));
      const nextWidth = Math.min(viewportMax, Math.max(220, startWidth + moveEvent.clientX - startX));
      setAvailableRailWidth(Math.round(nextWidth));
    };

    const stopResize = () => {
      window.removeEventListener('pointermove', resize);
      window.removeEventListener('pointerup', stopResize);
    };

    window.addEventListener('pointermove', resize);
    window.addEventListener('pointerup', stopResize, { once: true });
  }, [availableRailWidth]);

  const resizeRailWithKeyboard = useCallback((event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    const viewportMax = Math.max(260, Math.min(460, window.innerWidth * 0.38));
    setAvailableRailWidth((current) => Math.min(viewportMax, Math.max(220, current + direction * 16)));
  }, []);

  return (
    <div className="draft-board-workspace-shell">
      <div
        className={['draft-board-workspace', draggingPlayerId ? 'is-dragging' : ''].filter(Boolean).join(' ')}
        style={{ '--draft-board-rail-width': `${availableRailWidth}px` }}
      >
        <aside className="draft-board-available-rail" aria-label="Available players">
          <div className="draft-board-workspace__controls">
            <DraftSegmentedControl
              label="Available player scope"
              options={BOARD_SCOPE_OPTIONS}
              value={boardScope}
              onChange={onBoardScopeChange}
              className="draft-segmented-control--split"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search players"
              aria-label="Search available draft players"
            />
            <PositionFilter positions={positions} activePosition={activePosition} onChange={onPositionChange} />
          </div>
          <DraftAvailablePlayerList
            players={visibleAvailablePlayers}
            darkMode={darkMode}
            metricKey={cardMetricKey}
            onAdd={onAdd}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onViewPlayer={onViewPlayer}
          />
        </aside>

        <button
          type="button"
          className="draft-board-rail-resizer"
          aria-label="Resize available players panel"
          onPointerDown={startRailResize}
          onKeyDown={resizeRailWithKeyboard}
        />

        <section className="draft-board-main" aria-label="My draft board">
          <details className="draft-board-mobile-available">
            <summary>Available Players</summary>
            <div className="draft-board-workspace__controls">
              <DraftSegmentedControl
                label="Available player scope"
                options={BOARD_SCOPE_OPTIONS}
                value={boardScope}
                onChange={onBoardScopeChange}
                className="draft-segmented-control--split"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search players"
                aria-label="Search available draft players"
              />
              <PositionFilter positions={positions} activePosition={activePosition} onChange={onPositionChange} />
            </div>
            <DraftAvailablePlayerList
              players={visibleAvailablePlayers}
              darkMode={darkMode}
              metricKey={cardMetricKey}
              onAdd={onAdd}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onViewPlayer={onViewPlayer}
            />
          </details>

          <div className="draft-board-main__view-control">
            <DraftSegmentedControl
              label="Board view"
              options={MY_BOARD_SORT_OPTIONS}
              value={boardViewMode}
              onChange={onBoardViewModeChange}
            />
          </div>

          <div className="draft-board-mobile-lane-filter">
            {boardViewMode === 'position' ? (
              <PositionFilter positions={lanePositions} activePosition={activeLane} onChange={setActiveLane} />
            ) : null}
          </div>

          <div className="draft-scroll-region draft-board-lanes-shell">
            <div
              ref={lanesRef}
              className={['draft-board-lanes', boardViewMode === 'overall' ? 'is-overall-view' : ''].filter(Boolean).join(' ')}
            >
              {boardViewMode === 'overall' ? (
                <DraftBoardLane
                  position="Overall"
                  rows={overallRows}
                  darkMode={darkMode}
                  metricKey={cardMetricKey}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDropPlayer={handleDropPlayer}
                  onMove={onMove}
                  onRemove={onRemove}
                  onViewPlayer={onViewPlayer}
                  allowDrop={false}
                  allowReorder
                  activeMobile
                />
              ) : lanePositions.map((position) => (
                <DraftBoardLane
                  key={position}
                  position={position}
                  rows={rowsByPosition.get(position) ?? []}
                  darkMode={darkMode}
                  metricKey={cardMetricKey}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDropPlayer={handleDropPlayer}
                  onMove={onMove}
                  onRemove={onRemove}
                  onViewPlayer={onViewPlayer}
                  canAcceptDrop={draggingPlayerId ? canDropPlayerIntoPosition(draggingPlayerId, position) : true}
                  activeMobile={position === activeLane}
                />
              ))}
            </div>
            <DraftScrollControls targetRef={lanesRef} axis="x" label="board lanes" />
          </div>
        </section>

        <DraftRosterTray slots={rosterSlots} onToggleKeeper={onToggleKeeper} />
      </div>
    </div>
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

function DraftOrderTable({
  draftOrderContext,
  myRosterData,
  getUserDisplayName,
  players,
}) {
  const picksByOverall = useMemo(
    () => new Map(draftOrderContext.normalizedPicks.map((pick) => [pick.overall, pick])),
    [draftOrderContext.normalizedPicks],
  );

  return (
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
              <em>{madePick ? getDraftedPlayerLabel(madePick, players) : 'Pending'}</em>
            </div>
          );
        })}
      </div>
    </section>
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

function DraftBoardDataView({ mode = 'war-room', onViewPlayer, sleeperDraftId = '' }) {
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
  const isStandaloneBoard = mode === 'my-board';
  const viewLabel = isStandaloneBoard ? 'Board' : 'Draft War Room';

  const [boardState, setBoardState] = useState(() => createOrderedBoardState(emptyBoard(), []));
  const [boardReady, setBoardReady] = useState(false);
  const [modelBoardIds, setModelBoardIds] = useState(EMPTY_VIEW_MODEL_BOARD_IDS);
  const [keeperIds, setKeeperIds] = useState(() => new Set());
  const [keepersReady, setKeepersReady] = useState(false);
  const dropPlayerLookupRef = useRef(new Map());
  const {
    draftMeta,
    draftClockStore,
    draftPicks,
    draftTradedPicks,
    draftLoading,
    draftError,
    refreshDraft,
  } = useSleeperDraftSync({ selectedLeagueId, league, sleeperDraftId });
  const [positionFilter, setPositionFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [boardScope, setBoardScope] = useState('available');
  const [myBoardSortMode, setMyBoardSortMode] = useState('position');
  const [draftBoardCardMetric, setDraftBoardCardMetric] = useState('none');
  const [modelWeights, setModelWeights] = useState(() => normalizeDraftModelWeights(DEFAULT_DRAFT_MODEL_WEIGHTS));
  const [modelWeightsReady, setModelWeightsReady] = useState(false);
  const [draftViewModelState, setDraftViewModelState] = useState({
    building: false,
    model: null,
  });
  const [draftStats, setDraftStats] = useState(null);
  const [draftStatsLoading, setDraftStatsLoading] = useState(false);
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
  const boardByPosition = boardState.boardByPosition;
  const overallBoardIds = boardState.overallIds;

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  useEffect(() => {
    setBoardReady(false);
    if (!selectedLeagueId || !season || !draftMeta?.draft_id || !players) {
      setBoardState(createOrderedBoardState(emptyBoard(), []));
      return;
    }
    setBoardState(loadBoard({
      leagueId: selectedLeagueId,
      season,
      draftId: draftMeta.draft_id,
      players,
    }));
    setBoardReady(true);
  }, [selectedLeagueId, season, draftMeta?.draft_id, players]);

  useEffect(() => {
    if (!boardReady || !selectedLeagueId || !season || !draftMeta?.draft_id) return;
    const timeoutId = window.setTimeout(() => {
      saveBoard({
        leagueId: selectedLeagueId,
        season,
        draftId: draftMeta.draft_id,
        boardByPosition: boardState.boardByPosition,
        overallIds: boardState.overallIds,
      });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [boardReady, selectedLeagueId, season, draftMeta?.draft_id, boardState]);

  useEffect(() => {
    setKeepersReady(false);
    if (!selectedLeagueId || !season || !draftMeta?.draft_id) {
      setKeeperIds(new Set());
      return;
    }
    setKeeperIds(loadKeeperIds({
      leagueId: selectedLeagueId,
      season,
      draftId: draftMeta.draft_id,
    }));
    setKeepersReady(true);
  }, [selectedLeagueId, season, draftMeta?.draft_id]);

  useEffect(() => {
    if (!keepersReady || !selectedLeagueId || !season || !draftMeta?.draft_id) return;
    saveKeeperIds({
      leagueId: selectedLeagueId,
      season,
      draftId: draftMeta.draft_id,
      keeperIds,
    });
  }, [keepersReady, selectedLeagueId, season, draftMeta?.draft_id, keeperIds]);

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
      setDraftStatsLoading(false);
      return undefined;
    }

    let cancelled = false;
    setDraftStatsLoading(true);

    loadStatsForSeason(draftStatsSeason).then((statsPackage) => {
      if (cancelled) return;
      setDraftStats(statsPackage);
    }).catch(() => {
      if (cancelled) return;
      setDraftStats(null);
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
  const orderedBoardByPosition = useMemo(
    () => orderBoardByOverall(boardByPosition, overallBoardIds),
    [boardByPosition, overallBoardIds],
  );
  const boardIds = useMemo(
    () => normalizeOverallBoardIds(overallBoardIds, orderedBoardByPosition),
    [overallBoardIds, orderedBoardByPosition],
  );
  const boardMembershipKey = useMemo(
    () => [...boardIds].map((id) => String(id)).sort().join('|'),
    [boardIds],
  );
  useEffect(() => {
    if (isStandaloneBoard) {
      setModelBoardIds(EMPTY_VIEW_MODEL_BOARD_IDS);
      return;
    }
    startTransition(() => {
      setModelBoardIds(boardIds);
    });
  }, [isStandaloneBoard, boardIds]);
  const viewModelBoardIds = useMemo(
    () => (isStandaloneBoard ? EMPTY_VIEW_MODEL_BOARD_IDS : modelBoardIds),
    [isStandaloneBoard, modelBoardIds],
  );
  const draftOrderContext = useMemo(() => buildDraftOrderContext({
    draft: draftMeta,
    rosters,
    draftTradedPicks,
    draftPicks,
    myRosterData,
  }), [draftMeta, rosters, draftTradedPicks, draftPicks, myRosterData]);
  const draftType = normalizeDraftType(draftMeta);
  const unsupportedDraft = draftMeta && draftType !== 'snake' && draftType !== 'linear';
  const fullDraftModelAllowed = Boolean(
    draftMeta
    && !unsupportedDraft
    && (
      isStandaloneBoard
        ? isSleeperDraftPreDraft(draftMeta) || isActiveDraftRoomStatus(draftMeta?.status)
        : isSleeperDraftPreDraft(draftMeta)
    ),
  );

  useEffect(() => {
    if (!players || !league || !myRosterData || !draftMeta || !fullDraftModelAllowed) {
      setDraftViewModelState({ building: false, model: null });
      return undefined;
    }

    const cacheKey = getDraftViewModelCacheKey({
      players,
      rosters,
      league,
      draft: draftMeta,
      draftPicks,
      draftTradedPicks,
      myRoster: myRosterData,
      scoringSettings: activeScoringSettings,
      season,
      boardIds: viewModelBoardIds,
      marketValuesByPlayerId: marketState.valuesByPlayerId,
      seasonStats: draftStats?.seasonStats ?? null,
      weeklyStats: draftStats?.weeklyStats ?? null,
      scheduleMap: draftStats?.scheduleMap ?? null,
      modelWeights,
    });
    const cachedModel = readDraftViewModelCache(cacheKey);
    if (cachedModel) {
      setDraftViewModelState({ building: false, model: cachedModel });
      return undefined;
    }

    let cancelled = false;
    setDraftViewModelState((current) => ({ ...current, building: true }));

    const cancelBuild = scheduleDraftModelBuild(() => {
      const nextModel = buildDraftAssistantViewModel({
        players,
        rosters,
        league,
        draft: draftMeta,
        draftPicks,
        draftTradedPicks,
        myRoster: myRosterData,
        scoringSettings: activeScoringSettings,
        season,
        boardIds: viewModelBoardIds,
        marketValuesByPlayerId: marketState.valuesByPlayerId,
        seasonStats: draftStats?.seasonStats ?? null,
        weeklyStats: draftStats?.weeklyStats ?? null,
        scheduleMap: draftStats?.scheduleMap ?? null,
        modelWeights,
      });
      if (cancelled) return;
      rememberDraftViewModelCache(cacheKey, nextModel);
      startTransition(() => {
        setDraftViewModelState({ building: false, model: nextModel });
      });
    });

    return () => {
      cancelled = true;
      cancelBuild?.();
    };
  }, [players, rosters, league, draftMeta, draftPicks, draftTradedPicks, myRosterData, activeScoringSettings, season, viewModelBoardIds, marketState.valuesByPlayerId, draftStats, modelWeights, fullDraftModelAllowed]);

  const viewModel = draftViewModelState.model;
  const viewModelBuilding = draftViewModelState.building;

  const activePlayers = useMemo(() => sortCandidates(
    (viewModel?.allCandidates ?? []).filter((player) => player?.raw?.active !== false),
  ), [viewModel]);
  const positionRankMap = useMemo(() => buildPositionRankMap(activePlayers), [activePlayers]);
  const activePlayersWithRanks = useMemo(
    () => decoratePositionRanks(activePlayers, positionRankMap),
    [activePlayers, positionRankMap],
  );
  const candidatesById = useMemo(
    () => new Map((viewModel?.allCandidates ?? []).map((player) => [String(player.id), player])),
    [viewModel],
  );
  const boardRows = useMemo(
    () => buildFastBoardRows({
      boardIds,
      candidatesById,
      players,
      rosters,
      normalizedPicks: draftOrderContext.normalizedPicks,
      pickOrder: draftOrderContext.pickOrder,
      myRosterId: myRosterData?.roster_id,
      getUserDisplayName,
    }),
    [boardIds, candidatesById, players, rosters, draftOrderContext.normalizedPicks, draftOrderContext.pickOrder, myRosterData?.roster_id, getUserDisplayName],
  );
  const boardRowsWithRanks = useMemo(
    () => decoratePositionRanks(boardRows, positionRankMap),
    [boardRows, positionRankMap],
  );
  const bigBoardPlayers = useMemo(() => {
    if (boardScope === 'all') return activePlayersWithRanks;
    if (boardScope === 'rookies') {
      return activePlayersWithRanks.filter((player) => isDraftRookie(player, draftMeta?.season ?? season));
    }
    return activePlayersWithRanks.filter((player) => !player.rostered);
  }, [activePlayersWithRanks, boardScope, draftMeta?.season, season]);
  const dropPlayerLookup = useMemo(() => new Map(
    [...bigBoardPlayers, ...boardRowsWithRanks].map((player) => [String(player.id), player]),
  ), [bigBoardPlayers, boardRowsWithRanks]);
  dropPlayerLookupRef.current = dropPlayerLookup;
  const boardIdSet = useMemo(() => new Set(boardIds), [boardMembershipKey]);
  const positions = useMemo(
    () => getAvailablePositions(bigBoardPlayers, boardRowsWithRanks),
    [bigBoardPlayers, boardRowsWithRanks],
  );

  useEffect(() => {
    if (!positions.includes(positionFilter)) setPositionFilter('ALL');
  }, [positions, positionFilter]);

  const updateBoardState = useCallback((updater) => {
    if (isStandaloneBoard) {
      flushSync(() => {
        setBoardState(updater);
      });
      return;
    }
    setBoardState(updater);
  }, [isStandaloneBoard]);

  const addToBoard = useCallback((player) => {
    updateBoardState((current) => addPlayerToOrderedBoard(current, player));
  }, [updateBoardState]);

  const dropBoardPlayer = useCallback((position, playerId, beforePlayerId = null) => {
    const player = dropPlayerLookupRef.current.get(String(playerId)) ?? null;
    updateBoardState((current) => movePlayerToOrderedBoardPosition(current, position, playerId, beforePlayerId, player));
  }, [updateBoardState]);

  const removeFromBoard = useCallback((playerId) => {
    updateBoardState((current) => removePlayerFromOrderedBoard(current, playerId));
  }, [updateBoardState]);

  const moveBoardPlayer = useCallback((position, playerId, direction) => {
    updateBoardState((current) => (
      position === 'Overall'
        ? moveOverallBoardPlayer(current, playerId, direction)
        : moveOrderedBoardPlayerWithinPosition(current, position, playerId, direction)
    ));
  }, [updateBoardState]);

  const toggleKeeper = (playerId) => {
    const id = String(playerId ?? '');
    if (!id) return;
    setKeeperIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const changeModelWeight = (weights) => {
    setModelWeights(normalizeDraftModelWeights(weights));
  };

  const resetModelWeights = () => {
    setModelWeights(normalizeDraftModelWeights(DEFAULT_DRAFT_MODEL_WEIGHTS));
  };

  const rosterSlots = useMemo(() => buildMyDraftRosterTray({
    league,
    draftOrderContext,
    myRosterData,
    players,
    keeperIds,
  }), [league, draftOrderContext, myRosterData, players, keeperIds]);


  if (!league) {
    return (
      <div className="draft-page">
        <DraftPageState title={`Connect a league to open ${viewLabel}.`} />
      </div>
    );
  }

  if (!myRosterData) {
    return (
      <div className="draft-page">
        <DraftPageState title="Could not find your roster in this league." />
      </div>
    );
  }

  if (!players || draftLoading) {
    return (
      <div className="draft-page">
        <DraftPageState title={`Loading ${viewLabel}`} description="Fetching Sleeper players, draft metadata, and live picks." />
      </div>
    );
  }

  if (draftError) {
    return (
      <div className="draft-page">
        <DraftPageState title={`${viewLabel} unavailable`} description={draftError} />
      </div>
    );
  }

  if (!draftMeta) {
    return (
      <div className="draft-page">
        <DraftPageState
          title="No Sleeper draft found for this league."
          description={`${viewLabel} needs a Sleeper draft room so it can track picks and remove drafted players from your board.`}
        />
      </div>
    );
  }

  if (unsupportedDraft) {
    return (
      <div className="draft-page">
        <DraftPageState
          title="Auction drafts are not supported yet."
          description={`Sleeper's public draft endpoints support pick data well for snake and linear drafts, but live auction nomination and bid state are not exposed clearly enough for this ${viewLabel} pass.`}
        />
      </div>
    );
  }

  if (!isStandaloneBoard && !isSleeperDraftPreDraft(draftMeta)) {
    return (
      <div className="draft-page">
        <LiveDraftStatusBanner draftClockStore={draftClockStore} fallbackDraft={draftMeta} viewModel={draftOrderContext} getUserDisplayName={getUserDisplayName} onClockExpired={refreshDraft} />
        <DraftPageState
          title="War Room is only available before the draft."
          description="Use Results to review the order and completed picks after it starts."
        />
      </div>
    );
  }

  if (isStandaloneBoard && !isSleeperDraftPreDraft(draftMeta) && !isActiveDraftRoomStatus(draftMeta?.status)) {
    return (
      <div className="draft-page">
        <LiveDraftStatusBanner draftClockStore={draftClockStore} fallbackDraft={draftMeta} viewModel={draftOrderContext} getUserDisplayName={getUserDisplayName} onClockExpired={refreshDraft} />
        <DraftPageState
          title="Board is available before and during the draft."
          description="Use Results to review completed drafts."
        />
      </div>
    );
  }

  if (!viewModel) {
    return (
      <div className="draft-page">
        <LiveDraftStatusBanner draftClockStore={draftClockStore} fallbackDraft={draftMeta} viewModel={draftOrderContext} getUserDisplayName={getUserDisplayName} onClockExpired={refreshDraft} />
        <DraftPageState
          title={`Preparing ${viewLabel}`}
          description={viewModelBuilding ? 'Building draft rankings, roster context, and board state.' : 'Waiting for draft data.'}
        />
      </div>
    );
  }

  if (isStandaloneBoard) {
    return (
      <div className="draft-page">
        <LiveDraftStatusBanner draftClockStore={draftClockStore} fallbackDraft={draftMeta} viewModel={viewModel} getUserDisplayName={getUserDisplayName} onClockExpired={refreshDraft} />
        <LeagueLogsAttribution
          attribution={marketState.valuesByPlayerId.size > 0 ? marketState.attribution : null}
          profileKey={marketState.profileKey}
          profile={marketState.profile}
          lastRefreshed={marketState.lastRefreshed}
        />
        <div className="draft-board-page-controls">
          <DraftSegmentedControl
            label="Board card metric"
            options={DRAFT_BOARD_CARD_METRIC_OPTIONS}
            value={draftBoardCardMetric}
            onChange={setDraftBoardCardMetric}
            className="draft-board-card-metric-control"
          />
        </div>
        <MyBoardWorkspace
          boardByPosition={orderedBoardByPosition}
          overallBoardIds={boardIds}
          boardRows={boardRowsWithRanks}
          availablePlayers={bigBoardPlayers}
          boardIds={boardIds}
          positions={positions}
          darkMode={darkMode}
          onAdd={addToBoard}
          onDropPlayer={dropBoardPlayer}
          onMove={moveBoardPlayer}
          onRemove={removeFromBoard}
          onViewPlayer={onViewPlayer}
          boardViewMode={myBoardSortMode}
          onBoardViewModeChange={setMyBoardSortMode}
          activePosition={positionFilter}
          onPositionChange={setPositionFilter}
          query={query}
          setQuery={setQuery}
          boardScope={boardScope}
          onBoardScopeChange={setBoardScope}
          rosterSlots={rosterSlots}
          onToggleKeeper={toggleKeeper}
          cardMetricKey={draftBoardCardMetric}
        />
      </div>
    );
  }

  return (
    <div className="draft-page">
      <LiveDraftStatusBanner draftClockStore={draftClockStore} fallbackDraft={draftMeta} viewModel={viewModel} getUserDisplayName={getUserDisplayName} onClockExpired={refreshDraft} />
      <LeagueLogsAttribution
        attribution={marketState.valuesByPlayerId.size > 0 ? marketState.attribution : null}
        profileKey={marketState.profileKey}
        profile={marketState.profile}
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
          statsLoading={draftStatsLoading}
          modelWeights={modelWeights}
          onModelWeightChange={changeModelWeight}
          onResetModelWeights={resetModelWeights}
        />
        <MyBoard
          boardByPosition={orderedBoardByPosition}
          overallBoardIds={boardIds}
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

function DraftResultRow({ row, darkMode, onViewPlayer }) {
  const metrics = [
    { key: 'rating', value: formatDecimalMetric(row.rating), label: 'Rating', title: 'GridShift Draft Rating from market rank, past PPG, scoring fit, and roster need', align: 'center' },
    { key: 'sleeper', value: formatRankMetric(row.sleeperRank), label: 'Sleeper', title: 'Sleeper search / market overall rank', align: 'center' },
    { key: 'tier', value: row.tier != null ? `T${row.tier}` : '—', label: 'Tier', title: 'Rank-derived tier', align: 'center' },
  ];
  return (
    <DraftPlayerRow
      player={row.player}
      darkMode={darkMode}
      onViewPlayer={onViewPlayer}
      metrics={metrics}
      metricColumnGridTemplate="var(--draft-results-metrics-grid)"
      rowGridTemplate="var(--draft-results-row-grid)"
      compactRowGridTemplate="var(--draft-results-row-grid)"
      leading={<span className="draft-results-pick" title={`${row.overall} overall`}>{row.pickLabel}</span>}
      status={(
        <CompanionPlayerStatus
          label={row.ownerLabel}
          className={['draft-results-owner-status', row.isMine ? 'is-user-team' : ''].filter(Boolean).join(' ')}
          localContrast={!row.isMine}
          title={row.isMine ? `${row.ownerLabel} is your fantasy team` : row.ownerLabel}
        >
          {row.isMine ? (
            <>
              <span className="draft-results-owner-status__name">{row.ownerLabel}</span>
              {' '}
              <span className="draft-results-owner-status__marker">Your Team</span>
            </>
          ) : null}
        </CompanionPlayerStatus>
      )}
      className={['draft-player-row--results', row.isMine ? 'is-mine' : ''].filter(Boolean).join(' ')}
    />
  );
}

function DraftFantasyTeamFilter({ options, selectedIds, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedOption = selectedIds.length === 1
    ? options.find((option) => option.id === selectedIds[0])
    : null;
  const buttonLabel = selectedIds.length === 0
    ? 'All Fantasy Teams'
    : selectedOption
      ? selectedOption.label
      : `${selectedIds.length} Teams`;

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const toggleOption = (optionId) => {
    onChange(selectedSet.has(optionId)
      ? selectedIds.filter((id) => id !== optionId)
      : [...selectedIds, optionId]);
  };

  return (
    <div className="draft-results-team-filter" ref={rootRef}>
      <button
        type="button"
        className="draft-results-team-filter__button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{buttonLabel}</span>
        <ArrowIcon direction="down" />
      </button>
      {open && (
        <div className="draft-results-team-filter__menu">
          <div className="draft-results-team-filter__menu-head">
            <span>Fantasy Teams</span>
            {selectedIds.length > 0 && (
              <button type="button" onClick={() => onChange([])}>
                Clear
              </button>
            )}
          </div>
          <div className="draft-results-team-filter__options">
            {options.map((option) => (
              <label key={option.id} className="draft-results-team-filter__option">
                <input
                  type="checkbox"
                  checked={selectedSet.has(option.id)}
                  onChange={() => toggleOption(option.id)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DraftResultsView({ onViewPlayer, sleeperDraftId = '' }) {
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

  const {
    draftMeta,
    draftClockStore,
    draftPicks,
    draftTradedPicks,
    draftLoading,
    draftError,
    refreshDraft,
  } = useSleeperDraftSync({ selectedLeagueId, league, sleeperDraftId });
  const [draftStats, setDraftStats] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [positionFilter, setPositionFilter] = useState('All');
  const [selectedFantasyTeamIds, setSelectedFantasyTeamIds] = useState([]);
  const [modelWeights, setModelWeights] = useState(() => normalizeDraftModelWeights(DEFAULT_DRAFT_MODEL_WEIGHTS));
  const [marketState, setMarketState] = useState({
    attribution: null,
    profileKey: null,
    lastRefreshed: null,
    valuesByPlayerId: new Map(),
  });
  const hasCompletedDraftPicks = useMemo(
    () => (draftPicks ?? []).some((pick) => pick?.player_id || pick?.playerId || pick?.metadata?.player_id),
    [draftPicks],
  );

  const marketDraftContext = useMemo(() => ({
    metadata: { scoring_type: draftMeta?.metadata?.scoring_type },
    settings: { slots_qb: draftMeta?.settings?.slots_qb },
  }), [draftMeta?.metadata?.scoring_type, draftMeta?.settings?.slots_qb]);

  useEffect(() => {
    if (!hasCompletedDraftPicks) return;
    loadPlayers();
  }, [hasCompletedDraftPicks, loadPlayers]);

  // Reuse the user's saved model weights so the GridShift Rating shown here matches War Room.
  useEffect(() => {
    if (!selectedLeagueId || !season || !draftMeta?.draft_id) {
      setModelWeights(normalizeDraftModelWeights(DEFAULT_DRAFT_MODEL_WEIGHTS));
      return;
    }
    setModelWeights(loadModelWeights({ leagueId: selectedLeagueId, season, draftId: draftMeta.draft_id }));
  }, [selectedLeagueId, season, draftMeta?.draft_id]);

  const draftStatsSeason = useMemo(
    () => getDraftStatsSeason(draftMeta?.season ?? season),
    [draftMeta?.season, season],
  );

  useEffect(() => {
    if (!hasCompletedDraftPicks || !draftStatsSeason || !loadStatsForSeason) {
      setDraftStats(null);
      return undefined;
    }
    let cancelled = false;
    loadStatsForSeason(draftStatsSeason)
      .then((statsPackage) => { if (!cancelled) setDraftStats(statsPackage); })
      .catch(() => { if (!cancelled) setDraftStats(null); });
    return () => { cancelled = true; };
  }, [hasCompletedDraftPicks, draftStatsSeason, loadStatsForSeason]);

  useEffect(() => {
    if (!hasCompletedDraftPicks || !league) {
      setMarketState({ attribution: null, profileKey: null, lastRefreshed: null, valuesByPlayerId: new Map() });
      return undefined;
    }
    let cancelled = false;
    fetchLeagueLogsMarketForLeague({
      league,
      draft: marketDraftContext,
      scoringSettings: activeScoringSettings,
    }).then((market) => {
      if (cancelled) return;
      setMarketState({
        attribution: market?.attribution ?? null,
        profileKey: market?.profileKey ?? null,
        lastRefreshed: market?.lastRefreshed ?? null,
        valuesByPlayerId: market?.valuesByPlayerId ?? new Map(),
      });
    }).catch(() => {
      if (!cancelled) setMarketState({ attribution: null, profileKey: null, lastRefreshed: null, valuesByPlayerId: new Map() });
    });
    return () => { cancelled = true; };
  }, [hasCompletedDraftPicks, league, activeScoringSettings, marketDraftContext]);

  const myRosterData = useMemo(() => myRoster(), [myRoster]);

  const resultsViewModel = useMemo(() => {
    if (!hasCompletedDraftPicks || !league || !myRosterData || !draftMeta) return null;
    return buildDraftResultsViewModel({
      players: players ?? {},
      rosters,
      league,
      draft: draftMeta,
      draftPicks,
      draftTradedPicks,
      myRoster: myRosterData,
      scoringSettings: activeScoringSettings,
      season,
      boardIds: [],
      marketValuesByPlayerId: marketState.valuesByPlayerId,
      seasonStats: draftStats?.seasonStats ?? null,
      weeklyStats: draftStats?.weeklyStats ?? null,
      scheduleMap: draftStats?.scheduleMap ?? null,
      modelWeights,
    });
  }, [hasCompletedDraftPicks, players, rosters, league, draftMeta, draftPicks, draftTradedPicks, myRosterData, activeScoringSettings, season, marketState.valuesByPlayerId, draftStats, modelWeights]);

  const draftOrderContext = useMemo(() => (
    resultsViewModel ?? buildDraftOrderContext({
      draft: draftMeta,
      rosters,
      draftTradedPicks,
      draftPicks,
      myRosterData,
    })
  ), [resultsViewModel, draftMeta, rosters, draftTradedPicks, draftPicks, myRosterData]);

  const orderByOverall = useMemo(
    () => new Map((draftOrderContext.pickOrder ?? []).map((pick) => [pick.overall, pick])),
    [draftOrderContext.pickOrder],
  );

  const myRosterId = myRosterData?.roster_id != null ? String(myRosterData.roster_id) : null;
  const getFantasyTeamLabel = useCallback((rosterId, ownerId = null) => {
    const roster = rosters.find((item) => String(item.roster_id) === String(rosterId)) ?? null;
    const resolvedOwnerId = ownerId ?? roster?.owner_id ?? null;
    const label = resolvedOwnerId ? getUserDisplayName(resolvedOwnerId) : '';
    if (label && label !== 'Unknown') return label;
    return rosterId ? `Roster ${rosterId}` : 'Unknown';
  }, [rosters, getUserDisplayName]);

  const fantasyTeamOptions = useMemo(() => {
    const optionsByRosterId = new Map();
    for (const pick of draftOrderContext.pickOrder ?? []) {
      if (!pick.rosterId || optionsByRosterId.has(pick.rosterId)) continue;
      const ownerId = pick.roster?.owner_id ?? null;
      optionsByRosterId.set(pick.rosterId, {
        id: pick.rosterId,
        label: getFantasyTeamLabel(pick.rosterId, ownerId),
      });
    }
    for (const roster of rosters ?? []) {
      const rosterId = roster?.roster_id != null ? String(roster.roster_id) : null;
      if (!rosterId || optionsByRosterId.has(rosterId)) continue;
      optionsByRosterId.set(rosterId, {
        id: rosterId,
        label: getFantasyTeamLabel(rosterId, roster.owner_id),
      });
    }
    return [...optionsByRosterId.values()].sort((a, b) => {
      if (a.id === myRosterId) return -1;
      if (b.id === myRosterId) return 1;
      return a.label.localeCompare(b.label);
    });
  }, [draftOrderContext.pickOrder, rosters, myRosterId, getFantasyTeamLabel]);

  useEffect(() => {
    const availableIds = new Set(fantasyTeamOptions.map((option) => option.id));
    setSelectedFantasyTeamIds((current) => {
      const next = current.filter((id) => availableIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [fantasyTeamOptions]);

  // Completed picks only, first pick first — each joined to its enriched card for metrics.
  const resultRows = useMemo(() => {
    const completed = (draftOrderContext.normalizedPicks ?? []).filter((pick) => pick.playerId);
    return completed
      .slice()
      .sort((a, b) => a.overall - b.overall)
      .map((pick) => {
        const orderPick = orderByOverall.get(pick.overall) ?? null;
        const card = resultsViewModel?.draftedCardsById?.get(String(pick.playerId)) ?? null;
        const rawPlayer = players?.[pick.playerId] ?? null;
        const ownerId = orderPick?.roster?.owner_id
          ?? rosters.find((roster) => String(roster.roster_id) === pick.rosterId)?.owner_id
          ?? null;
        const isMine = pick.rosterId === myRosterId;
        const fallbackName = getDraftedPlayerLabel(pick, players ?? {});
        const rawFallbackPosition = rawPlayer?.fantasy_positions?.[0] ?? rawPlayer?.position ?? pick.metadata?.position ?? null;
        const fallbackPosition = rawFallbackPosition ? normalizePosition(rawFallbackPosition) : '';
        const fallbackTeam = String(rawPlayer?.team ?? pick.metadata?.team ?? '—').toUpperCase();
        const player = card ? {
          ...card,
          name: card.raw ? getPlayerName(card) : fallbackName,
          position: card.position ?? fallbackPosition,
          team: card.team ?? fallbackTeam,
          raw: card.raw ?? rawPlayer,
        } : {
          id: String(pick.playerId),
          name: fallbackName,
          position: fallbackPosition,
          team: fallbackTeam,
          raw: rawPlayer,
        };
        return {
          key: pick.id,
          pickLabel: formatPickLabel(orderPick ?? pick),
          overall: pick.overall,
          fantasyTeamId: pick.rosterId,
          ownerLabel: getFantasyTeamLabel(pick.rosterId, ownerId),
          isMine,
          player,
          rating: card?.draftModel?.score ?? null,
          sleeperRank: card?.rank?.overallRank ?? card?.projection?.fallbackRank ?? null,
          tier: card?.rank?.tier ?? null,
        };
      });
  }, [draftOrderContext.normalizedPicks, orderByOverall, resultsViewModel, players, rosters, myRosterId, getFantasyTeamLabel]);

  const positionOptions = useMemo(() => {
    const available = new Set(resultRows.map((row) => row.player?.position).filter(Boolean));
    const ordered = POSITION_ORDER.filter((position) => available.has(position));
    const extras = [...available].filter((position) => !POSITION_ORDER.includes(position)).sort();
    return ['All', ...ordered, ...extras];
  }, [resultRows]);

  useEffect(() => {
    if (!positionOptions.includes(positionFilter)) setPositionFilter('All');
  }, [positionOptions, positionFilter]);

  const visibleRows = useMemo(() => {
    const selectedTeamSet = new Set(selectedFantasyTeamIds);
    const filtered = resultRows.filter((row) => {
      if (positionFilter !== 'All' && row.player?.position !== positionFilter) return false;
      if (selectedTeamSet.size > 0 && !selectedTeamSet.has(row.fantasyTeamId)) return false;
      return true;
    });
    return sortDirection === 'desc' ? [...filtered].reverse() : filtered;
  }, [resultRows, positionFilter, selectedFantasyTeamIds, sortDirection]);

  const draftType = normalizeDraftType(draftMeta);
  const unsupportedDraft = draftMeta && draftType !== 'snake' && draftType !== 'linear';

  if (!league) {
    return (
      <div className="draft-page">
        <DraftPageState title="Connect a league to view draft results." />
      </div>
    );
  }

  if (!myRosterData) {
    return (
      <div className="draft-page">
        <DraftPageState title="Could not find your roster in this league." />
      </div>
    );
  }

  if (draftLoading) {
    return (
      <div className="draft-page">
        <DraftPageState title="Loading results" description="Fetching Sleeper draft metadata and picks." />
      </div>
    );
  }

  if (draftError) {
    return (
      <div className="draft-page">
        <DraftPageState title="Draft results unavailable" description={draftError} />
      </div>
    );
  }

  if (!draftMeta) {
    return (
      <div className="draft-page">
        <DraftPageState title="No Sleeper draft found for this league." />
      </div>
    );
  }

  if (unsupportedDraft) {
    return (
      <div className="draft-page">
        <DraftPageState
          title="Auction drafts are not supported yet."
          description="Sleeper's public draft endpoints expose pick data well for snake and linear drafts, but live auction nomination and bid state are not available for the results board."
        />
      </div>
    );
  }

  return (
    <div className="draft-page">
      <LiveDraftStatusBanner draftClockStore={draftClockStore} fallbackDraft={draftMeta} viewModel={draftOrderContext} getUserDisplayName={getUserDisplayName} onClockExpired={refreshDraft} />
      {resultRows.length === 0 ? (
        <DraftOrderTable
          draftOrderContext={draftOrderContext}
          myRosterData={myRosterData}
          getUserDisplayName={getUserDisplayName}
          players={players ?? {}}
        />
      ) : (
        <section className="draft-panel draft-results-panel">
          <div className="draft-results-controls">
            <div className="draft-results-control-row draft-results-control-row--positions">
              <span className="draft-results-control-row__label">Position</span>
              <PositionFilter positions={positionOptions} activePosition={positionFilter} onChange={setPositionFilter} />
            </div>
            <div className="draft-results-control-row draft-results-control-row--sort">
              <span className="draft-results-control-row__label">Sort</span>
              <DraftSegmentedControl
                label="Sort draft results"
                options={DRAFT_RESULTS_SORT_OPTIONS}
                value={sortDirection}
                onChange={setSortDirection}
              />
              <DraftFantasyTeamFilter
                options={fantasyTeamOptions}
                selectedIds={selectedFantasyTeamIds}
                onChange={setSelectedFantasyTeamIds}
              />
            </div>
          </div>
          {visibleRows.length === 0 ? (
            <EmptyState title="No picks match these filters." />
          ) : (
            <div className="draft-results-list">
              {visibleRows.map((row) => (
                <DraftResultRow key={row.key} row={row} darkMode={darkMode} onViewPlayer={onViewPlayer} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default function DraftAssistant({ view = 'war-room', sleeperDraftId = '', onViewPlayer = null }) {
  if (view === 'draft-order') return <DraftResultsView sleeperDraftId={sleeperDraftId} onViewPlayer={onViewPlayer} />;
  if (view === 'results') return <DraftResultsView sleeperDraftId={sleeperDraftId} onViewPlayer={onViewPlayer} />;
  if (view === 'my-board') return <DraftBoardDataView mode="my-board" sleeperDraftId={sleeperDraftId} onViewPlayer={onViewPlayer} />;
  if (view !== 'war-room') return <FutureDraftView view={view} />;
  return <DraftBoardDataView mode="war-room" sleeperDraftId={sleeperDraftId} onViewPlayer={onViewPlayer} />;
}
