// ── CompanionTrade ────────────────────────────────────────────────────────────
// Trade workflow: build and evaluate trade proposals using KTC values.
// Lives under the Trade section; uses Sleeper rosters and draft pick data.
//
// === FILE SECTIONS ===
// Main component owns data loading, trade state, and handlers.
// Leaf trade UI lives in src/components/companion/trade/.

import { useState, useEffect, useMemo, useCallback, useDeferredValue, useRef, useTransition } from 'react';
import { useSleeperLeague, useSleeperStats } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { fetchKtcPlayers, computeKtcMultipliers, applyKtcMultipliers, findKtcPlayerFromSleeper } from '../../utils/ktcApi';
import { fetchLeagueLogsMarketForLeague } from '../../api/leagueLogsApi';
import { getFantasyAdp } from '../../api/fantasyAdpApi';
import { buildDraftAssistantViewModel } from '../../utils/draftAssistant';
import { mapFantasyAdpToSleeperPlayers } from '../../utils/fantasyAdp';
import { getFantasyRankingsDataMode } from '../../utils/seasonAvailability';
import {
  buildRosterPicks,
  valueSide,
  evaluateTrade,
  suggestPackage,
  buildCandidatePool,
  computeRedraftPickValues,
  detectLeagueType,
} from '../../utils/tradeEngine';
import { buildPartnerTradeIntelligence, buildRosterOpportunityLayer, findLeagueWideUpgradeGroups } from '../../utils/opportunityEngine';
import { buildTradeAnalyticsSnapshot } from '../../utils/tradeAnalytics';
import { computeTradePlayerValueDetail } from '../../utils/tradeValue';
import TradeRosterPicker from './TradeRosterPicker';
import TradePickPicker from './TradePickPicker';
import PlayerStatsModal from '../PlayerStatsModal';
import TradeProposalBuilder from './trade/TradeProposalBuilder';
import TradeProposalPanel, { DEFAULT_PROPOSAL_FILTERS } from './trade/TradeProposalPanel';
import UpgradeFinderPage from './trade/UpgradeFinderPage';
import ValuationInfoSheet from './trade/ValuationInfoSheet';
import RosterBrowseModal from './trade/RosterBrowseModal';
import TradeShareSheet from './trade/TradeShareSheet';
import { buildTradeProposalSnapshot, buildTradeProposalSnapshotFromCurrentPerspective } from '../../utils/tradeProposal';
import { getTradeDraftStorageKey, readTradeDraftState, writeTradeDraftState } from '../../utils/tradeDraftState';
import { UPGRADE_TRADE_POSTURES, normalizeRosterId, scheduleDeferredTradeTask } from './trade/tradeUiHelpers';

// Derive league format and type from Sleeper league settings
function detectLeagueFormat(league) {
  // Sleeper settings.type: 0 = redraft, 2 = dynasty/keeper
  const isDynasty = league?.settings?.type === 2;
  return isDynasty ? 'dynasty' : 'redraft';
}

const TRADE_OPPORTUNITY_LAYER_CACHE_LIMIT = 8;
const TRADE_PICK_CALIBRATION_ROUNDS = 25;
// Pick assets have a league-wide value, not a manager-specific recommendation.
// Reuse Draft's market/production/scoring blend while excluding personal roster
// need, board placement, and on-the-clock behavior. Any unavailable signal
// follows Draft's normal null propagation instead of being treated as zero.
const NEUTRAL_TRADE_DRAFT_MODEL_WEIGHTS = Object.freeze({
  marketRank: 30,
  pastProduction: 25,
  scoringFit: 20,
  rosterNeed: 0,
  schedule: 10,
  // ADP is useful context for supported positions, but it is intentionally
  // absent for most IDPs. Draft's weighted-signal calculation removes a
  // missing signal from the denominator, so it can never penalize an IDP.
  adp: 15,
});
const tradeOpportunityLayerCache = new Map();

function stableShallowObjectSignature(value) {
  if (!value || typeof value !== 'object') return '';
  return Object.keys(value)
    .sort()
    .map((key) => `${key}:${value[key]}`)
    .join(',');
}

function buildRosterSignature(rosters) {
  return (rosters ?? [])
    .map((roster) => [
      roster.roster_id,
      roster.owner_id ?? '',
      ...(roster.players ?? []),
      '|',
      ...(roster.reserve ?? []),
    ].join(':'))
    .join(';');
}

function buildTradeOpportunityLayerCacheKey({
  selectedLeagueId,
  season,
  league,
  rosters,
  players,
  seasonStats,
  weeklyStats,
  scoringSettings,
  myRosterId,
}) {
  return [
    selectedLeagueId ?? league?.league_id ?? '',
    season ?? league?.season ?? '',
    myRosterId ?? '',
    (league?.roster_positions ?? []).join(','),
    buildRosterSignature(rosters),
    players ? Object.keys(players).length : 0,
    seasonStats ? Object.keys(seasonStats).length : 0,
    weeklyStats ? Object.keys(weeklyStats).length : 0,
    stableShallowObjectSignature(scoringSettings),
  ].join('||');
}

function getCachedTradeOpportunityLayer(cacheKey, buildLayer) {
  if (tradeOpportunityLayerCache.has(cacheKey)) {
    const cached = tradeOpportunityLayerCache.get(cacheKey);
    tradeOpportunityLayerCache.delete(cacheKey);
    tradeOpportunityLayerCache.set(cacheKey, cached);
    return cached;
  }

  const layer = buildLayer();
  tradeOpportunityLayerCache.set(cacheKey, layer);

  while (tradeOpportunityLayerCache.size > TRADE_OPPORTUNITY_LAYER_CACHE_LIMIT) {
    const oldestKey = tradeOpportunityLayerCache.keys().next().value;
    tradeOpportunityLayerCache.delete(oldestKey);
  }

  return layer;
}

function buildUpgradeSearchRequest({
  targetPlayerId,
  allowedOutgoingPlayerIds,
  tradePostureLevel,
  allowPackages,
  allowOutgoingPicks,
  allowIncomingPicks,
}) {
  const normalizedOutgoingPlayerIds = [...(allowedOutgoingPlayerIds ?? [])].sort();
  if (!targetPlayerId || (normalizedOutgoingPlayerIds.length === 0 && !allowOutgoingPicks)) return null;
  return {
    targetPlayerId,
    allowedOutgoingPlayerIds: normalizedOutgoingPlayerIds,
    tradePostureLevel,
    allowPackages: Boolean(allowPackages),
    allowOutgoingPicks: Boolean(allowOutgoingPicks),
    allowIncomingPicks: Boolean(allowIncomingPicks),
  };
}

function areUpgradeSearchRequestsEqual(left, right) {
  if (left === right) return true;
  if (!left || !right) return false;
  if (left.targetPlayerId !== right.targetPlayerId) return false;
  if (left.tradePostureLevel !== right.tradePostureLevel) return false;
  if (left.allowPackages !== right.allowPackages) return false;
  if (left.allowOutgoingPicks !== right.allowOutgoingPicks) return false;
  if (left.allowIncomingPicks !== right.allowIncomingPicks) return false;
  const leftIds = left.allowedOutgoingPlayerIds ?? [];
  const rightIds = right.allowedOutgoingPlayerIds ?? [];
  if (leftIds.length !== rightIds.length) return false;
  return leftIds.every((id, index) => id === rightIds[index]);
}

function buildUpgradeSearchCacheKey(request, leagueId, season) {
  if (!request?.targetPlayerId) return null;
  return JSON.stringify({
    ...request,
    leagueId,
    season,
  });
}

function hasRecordedSeasonProduction(seasonStats) {
  return Object.values(seasonStats ?? {}).some((stats) => {
    const gamesPlayed = Number(stats?.gp ?? stats?.games_played ?? stats?.gamesPlayed);
    return Number.isFinite(gamesPlayed) && gamesPlayed > 0;
  });
}

function getPreviousSeasonKey(season) {
  const seasonYear = Number(season);
  return Number.isInteger(seasonYear) && seasonYear > 0 ? String(seasonYear - 1) : null;
}

function hasCompletedScoredLeg(league) {
  const lastScoredLeg = Number(league?.settings?.last_scored_leg);
  return Number.isFinite(lastScoredLeg) && lastScoredLeg > 0;
}

function getTradePickCalibrationDraft(drafts, season) {
  const seasonKey = String(season ?? '');
  const matchingDrafts = (drafts ?? []).filter((draft) => String(draft?.season ?? '') === seasonKey);
  return matchingDrafts.find((draft) => draft?.status !== 'complete') ?? matchingDrafts[0] ?? null;
}

function getFantasyAdpRows(response) {
  const payload = response?.data ?? response;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(response?.rows)) return response.rows;
  return [];
}
// ── Main component ───────────────────────────────────────────────────────────

export default function CompanionTrade({ initialPlayer, onConsumeInitialPlayer, initialTradeProposal = null, onConsumeInitialTradeProposal, tradeProposalActions = null, view = 'agent', onViewChange, onViewPlayer, prewarmAnalytics = false }) {
  const {
    platform,
    rosters, leagueUsers, myRoster,
    selectedLeagueId, league, season, getUserDisplayName,
    sleeperUser,
    scoringSettings,
    getTradedPicksForLeague,
    getLeagueDraftsForLeague,
  } = useSleeperLeague();
  const {
    players: sleeperPlayers, seasonStats, weeklyStats,
    statsBySeason, loadPlayers, loadSeasonStats, loadStatsForSeason, statsLoading, espnIdOverrides,
  } = useSleeperStats();
  const { darkMode } = useTheme();

  const myRosterData = myRoster();
  const rosterById = useMemo(
    () => new Map((rosters ?? []).map((roster) => [roster.roster_id, roster])),
    [rosters],
  );
  const ownerNameByRosterId = useMemo(() => {
    const next = new Map();
    for (const roster of rosters ?? []) {
      next.set(roster.roster_id, getUserDisplayName(roster.owner_id ?? ''));
    }
    return next;
  }, [getUserDisplayName, rosters]);
  const leagueUserById = useMemo(
    () => new Map((leagueUsers ?? []).map((user) => [user.user_id, user])),
    [leagueUsers],
  );

  // Derive format and league type from league settings
  const format = detectLeagueFormat(league);
  const leagueType = detectLeagueType(league);
  const picksEnabled = platform !== 'espn';
  const tradeDraftStorageKey = getTradeDraftStorageKey({
    leagueId: selectedLeagueId,
    season,
    sleeperUserId: sleeperUser?.user_id,
  });
  const tradeAdpEligible = getFantasyRankingsDataMode(season) === 'adp';
  const hasCurrentSeasonProduction = hasRecordedSeasonProduction(seasonStats);
  const usePriorSeasonProduction = !hasCurrentSeasonProduction
    && !hasCompletedScoredLeg(league);
  const previousSeasonKey = getPreviousSeasonKey(season);
  const preseasonValuationStats = usePriorSeasonProduction && previousSeasonKey
    ? statsBySeason?.[previousSeasonKey]?.seasonStats ?? null
    : null;
  const preseasonValuationWeeklyStats = usePriorSeasonProduction && previousSeasonKey
    ? statsBySeason?.[previousSeasonKey]?.weeklyStats ?? null
    : null;
  const valuationSeasonStats = preseasonValuationStats ?? seasonStats;
  const valuationWeeklyStats = preseasonValuationWeeklyStats ?? weeklyStats;

  const [persistedTradeDraft] = useState(() => readTradeDraftState(tradeDraftStorageKey));

  // Trade partner
  const [partnerRosterId, setPartnerRosterId] = useState(() => persistedTradeDraft?.partnerRosterId ?? null);

  // Trade contents
  const [yourPlayers, setYourPlayers]   = useState(() => persistedTradeDraft?.yourPlayers ?? []);   // sleeper IDs
  const [yourPicks, setYourPicks]       = useState(() => persistedTradeDraft?.yourPicks ?? []);   // { year, round, fromRosterId, key }
  const [theirPlayers, setTheirPlayers] = useState(() => persistedTradeDraft?.theirPlayers ?? []);
  const [theirPicks, setTheirPicks]     = useState(() => persistedTradeDraft?.theirPicks ?? []);
  const tradeDraftHydrationRef = useRef({ key: tradeDraftStorageKey, pending: false });

  // KTC data
  const [ktcPlayers, setKtcPlayers]             = useState(null);
  const [dynastyKtcPlayers, setDynastyKtcPlayers] = useState(null); // full dynasty list for fallback
  const [ktcLoading, setKtcLoading] = useState(false);
  const [ktcError, setKtcError]     = useState(null);

  // Draft picks data
  const [tradedPicks, setTradedPicks] = useState(null);
  const [leagueDrafts, setLeagueDrafts] = useState([]);
  const [draftRounds, setDraftRounds] = useState(null);
  const [draftPickMarketValues, setDraftPickMarketValues] = useState(() => new Map());
  const [draftPickAdpValues, setDraftPickAdpValues] = useState(() => new Map());
  const [draftPickCalibrationCandidates, setDraftPickCalibrationCandidates] = useState(null);

  // Picker state
  const [pickerOpen, setPickerOpen] = useState(null); // { side: 'yours'|'theirs', type: 'player'|'pick' }
  const [rosterModalRosterId, setRosterModalRosterId] = useState(null); // roster browsing modal (team chip tap)

  // Suggestion state
  const [suggestions, setSuggestions]   = useState(null);
  const [showTrends, setShowTrends]     = useState(false);
  const [showValInfo, setShowValInfo]   = useState(false);
  const [upgradeTargetId, setUpgradeTargetId] = useState(null);
  const [upgradeOfferPlayerIds, setUpgradeOfferPlayerIds] = useState([]);
  const [upgradeTradePostureLevel, setUpgradeTradePostureLevel] = useState(2);
  const [upgradeAllowPackages, setUpgradeAllowPackages] = useState(true);
  const [upgradeAllowOutgoingPicks, setUpgradeAllowOutgoingPicks] = useState(false);
  const [upgradeAllowIncomingPicks, setUpgradeAllowIncomingPicks] = useState(false);
  const [submittedUpgradeSearch, setSubmittedUpgradeSearch] = useState(null);
  const [tradeProposalMode, setTradeProposalMode] = useState('needs');
  const [proposalFilters, setProposalFilters] = useState(DEFAULT_PROPOSAL_FILTERS);
  const [statsModalPlayer, setStatsModalPlayer] = useState(null);
  const [statsRequested, setStatsRequested] = useState(() => view === 'intelligence' || view === 'upgrade');
  const [tradeAnalyticsRequested, setTradeAnalyticsRequested] = useState(() => view === 'intelligence' || view === 'upgrade');
  const [tradeShareRequest, setTradeShareRequest] = useState(null);
  const [tradeShareResult, setTradeShareResult] = useState(null);
  const [tradeShareError, setTradeShareError] = useState('');
  const [tradeShareSubmitting, setTradeShareSubmitting] = useState(false);
  const [counterTarget, setCounterTarget] = useState(null);
  const [tradeIntelligence, setTradeIntelligence] = useState(null);
  const [tradeIntelligencePartnerId, setTradeIntelligencePartnerId] = useState(null);
  const [upgradeSearchResults, setUpgradeSearchResults] = useState(null);
  const tradeIntelligenceCacheRef = useRef(new Map());
  const upgradeSearchCacheRef = useRef(new Map());
  const shelfDragRef = useRef(null);
  const [isTradeIntelligencePending, startTradeIntelligenceTransition] = useTransition();
  const [isUpgradeSearchPending, startUpgradeSearchTransition] = useTransition();
  const [isUpgradeResultsPending, startUpgradeResultsTransition] = useTransition();
  const [isPartnerSwitchPending, startPartnerSwitchTransition] = useTransition();
  const deferredPartnerRosterId = useDeferredValue(partnerRosterId);

  useEffect(() => {
    if (!tradeDraftStorageKey) {
      tradeDraftHydrationRef.current = { key: null, pending: false };
      return;
    }
    if (tradeDraftHydrationRef.current.key === tradeDraftStorageKey) return;

    tradeDraftHydrationRef.current = { key: tradeDraftStorageKey, pending: true };
    const savedDraft = readTradeDraftState(tradeDraftStorageKey);
    setPartnerRosterId(savedDraft?.partnerRosterId ?? null);
    setYourPlayers(savedDraft?.yourPlayers ?? []);
    setYourPicks(savedDraft?.yourPicks ?? []);
    setTheirPlayers(savedDraft?.theirPlayers ?? []);
    setTheirPicks(savedDraft?.theirPicks ?? []);
  }, [tradeDraftStorageKey]);

  useEffect(() => {
    if (!tradeDraftStorageKey || tradeDraftHydrationRef.current.key !== tradeDraftStorageKey) return;
    if (tradeDraftHydrationRef.current.pending) {
      // The first effect after a league/account switch still has the previous
      // context's state. Wait for the hydrated setters to render before saving.
      tradeDraftHydrationRef.current.pending = false;
      return;
    }
    writeTradeDraftState(tradeDraftStorageKey, {
      partnerRosterId,
      yourPlayers,
      yourPicks,
      theirPlayers,
      theirPicks,
    });
  }, [partnerRosterId, theirPicks, theirPlayers, tradeDraftStorageKey, yourPicks, yourPlayers]);

  const setTradePickerOpen = useCallback((request) => {
    if (request?.type === 'pick' && !picksEnabled) return;
    setPickerOpen(request);
  }, [picksEnabled]);

  useEffect(() => {
    if (picksEnabled) return;
    setYourPicks([]);
    setTheirPicks([]);
    setUpgradeAllowOutgoingPicks(false);
    setUpgradeAllowIncomingPicks(false);
    setPickerOpen((current) => (current?.type === 'pick' ? null : current));
  }, [picksEnabled]);

  const switchPartnerTradeContext = useCallback((nextPartnerRosterId, { nextTheirPlayers = [], nextTheirPicks = [] } = {}) => {
    const normalizedPartnerRosterId = normalizeRosterId(nextPartnerRosterId);
    startPartnerSwitchTransition(() => {
      setPartnerRosterId(normalizedPartnerRosterId);
      setTheirPlayers(nextTheirPlayers);
      setTheirPicks(nextTheirPicks);
      setSuggestions(null);
    });
  }, [startPartnerSwitchTransition]);

  const showUpgrade = view === 'upgrade';
  const showIntelligence = view === 'intelligence';
  const showAgent = view !== 'intelligence';
  const showTradeBuilder = view === 'agent';
  const wantsTradeAnalytics = showIntelligence || showUpgrade;
  const analyticsWeeklyStats = tradeAnalyticsRequested ? weeklyStats : null;

  // ── Data loading ────────────────────────────────────────────────────────────

  useEffect(() => {
    setKtcLoading(true);
    setKtcError(null);

    // Always fetch dynasty data alongside the format-specific data.
    // Dynasty is needed for two reasons:
    //   1. It's the only source of RDP (draft pick) entries for redraft leagues.
    //   2. Some players appear only in dynasty rankings; we use those as a fallback
    //      for redraft leagues (discounted by DYNASTY_FALLBACK_MULT).
    const fetches = [fetchKtcPlayers(format)];
    if (format !== 'dynasty') fetches.push(fetchKtcPlayers('dynasty').catch(() => []));

    Promise.all(fetches)
      .then(([formatPlayers, dynastyPlayers]) => {
        if (dynastyPlayers?.length) {
          const rdpEntries = dynastyPlayers.filter(k => k.position === 'RDP');
          setKtcPlayers([...formatPlayers, ...rdpEntries]);
          // Keep the full dynasty player list (non-RDP) for fallback lookups.
          setDynastyKtcPlayers(dynastyPlayers.filter(k => k.position !== 'RDP'));
        } else {
          setKtcPlayers(formatPlayers);
          setDynastyKtcPlayers(null);
        }
        setKtcLoading(false);
      })
      .catch(e => { setKtcError(e.message); setKtcLoading(false); });
  }, [format]);

  useEffect(() => {
    if (!selectedLeagueId) return;
    Promise.all([
      getTradedPicksForLeague(selectedLeagueId).catch(() => []),
      getLeagueDraftsForLeague(selectedLeagueId).catch(() => []),
    ]).then(([picks, drafts]) => {
      setTradedPicks(picks ?? []);
      setLeagueDrafts(drafts ?? []);
      const maxFromDrafts = (drafts ?? []).reduce((max, d) => Math.max(max, d.settings?.rounds ?? 0), 0);
      setDraftRounds(maxFromDrafts || null);
    });
  }, [getLeagueDraftsForLeague, getTradedPicksForLeague, selectedLeagueId]);

  useEffect(() => {
    if (format !== 'redraft' || !league) {
      setDraftPickMarketValues(new Map());
      return undefined;
    }

    let cancelled = false;
    const draft = getTradePickCalibrationDraft(leagueDrafts, season);
    fetchLeagueLogsMarketForLeague({
      league,
      draft,
      scoringSettings,
    }).then((market) => {
      if (!cancelled) setDraftPickMarketValues(market?.valuesByPlayerId ?? new Map());
    }).catch(() => {
      if (!cancelled) setDraftPickMarketValues(new Map());
    });

    return () => { cancelled = true; };
  }, [format, league, leagueDrafts, scoringSettings, season]);

  useEffect(() => {
    if (
      format !== 'redraft'
      || !tradeAdpEligible
      || !sleeperPlayers
      || Object.keys(sleeperPlayers).length === 0
    ) {
      setDraftPickAdpValues(new Map());
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;

    getFantasyAdp({ season, signal: controller.signal })
      .then((response) => {
        if (cancelled) return;
        const mapped = mapFantasyAdpToSleeperPlayers({
          players: sleeperPlayers,
          adpRows: getFantasyAdpRows(response),
        });
        setDraftPickAdpValues(mapped instanceof Map ? mapped : new Map());
      })
      .catch((error) => {
        if (cancelled || error?.name === 'AbortError') return;
        setDraftPickAdpValues(new Map());
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [format, season, sleeperPlayers, tradeAdpEligible]);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);
  useEffect(() => {
    if (wantsTradeAnalytics && !statsRequested) {
      setStatsRequested(true);
      return undefined;
    }
    if (statsRequested || !selectedLeagueId) return undefined;

    let timeoutId = null;
    let idleId = null;
    const requestStats = () => setStatsRequested(true);

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(requestStats, { timeout: 650 });
    } else {
      timeoutId = window.setTimeout(requestStats, 220);
    }

    return () => {
      if (idleId != null && typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [wantsTradeAnalytics, statsRequested, selectedLeagueId]);

  useEffect(() => {
    if (!statsRequested || seasonStats || statsLoading) return;
    loadSeasonStats();
  }, [statsRequested, seasonStats, statsLoading, loadSeasonStats]);

  useEffect(() => {
    if (
      !statsRequested
      || platform !== 'sleeper'
      || !usePriorSeasonProduction
      || !previousSeasonKey
      || preseasonValuationStats
    ) return;

    // Before the active season starts, value every position against the most
    // recent completed production season under the new league scoring rules.
    void loadStatsForSeason(previousSeasonKey).catch(() => null);
  }, [
    loadStatsForSeason,
    platform,
    preseasonValuationStats,
    previousSeasonKey,
    statsRequested,
    usePriorSeasonProduction,
  ]);

  useEffect(() => {
    if (format !== 'redraft' || !league || !sleeperPlayers) {
      setDraftPickCalibrationCandidates(null);
      return undefined;
    }

    let cancelled = false;
    const candidateLimit = TRADE_PICK_CALIBRATION_ROUNDS * Math.max(1, rosters?.length ?? 0);
    const draft = getTradePickCalibrationDraft(leagueDrafts, season);
    const cancelTask = scheduleDeferredTradeTask(() => {
      const draftModel = buildDraftAssistantViewModel({
        players: sleeperPlayers,
        rosters: [],
        league,
        draft,
        draftPicks: [],
        draftTradedPicks: [],
        myRoster: null,
        scoringSettings,
        season,
        marketValuesByPlayerId: draftPickMarketValues,
        adpByPlayerId: draftPickAdpValues,
        seasonStats: valuationSeasonStats,
        weeklyStats: valuationWeeklyStats,
        modelWeights: NEUTRAL_TRADE_DRAFT_MODEL_WEIGHTS,
      });
      if (cancelled) return;
      setDraftPickCalibrationCandidates(
        draftModel.rankedCandidates.slice(0, candidateLimit).map((candidate, index) => ({
          id: candidate.id,
          rank: index + 1,
        })),
      );
    }, 260);

    return () => {
      cancelled = true;
      cancelTask?.();
    };
  }, [
    format,
    league,
    leagueDrafts,
    rosters,
    season,
    sleeperPlayers,
    scoringSettings,
    draftPickMarketValues,
    draftPickAdpValues,
    valuationSeasonStats,
    valuationWeeklyStats,
  ]);

  useEffect(() => {
    if (!wantsTradeAnalytics || tradeAnalyticsRequested) return;
    setTradeAnalyticsRequested(true);
  }, [tradeAnalyticsRequested, wantsTradeAnalytics]);

  useEffect(() => {
    if (tradeAnalyticsRequested || !selectedLeagueId) return undefined;
    if (!showTradeBuilder && !prewarmAnalytics) return undefined;

    let timeoutId = null;
    let idleId = null;
    const requestTradeAnalytics = () => setTradeAnalyticsRequested(true);

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(requestTradeAnalytics, { timeout: 900 });
    } else {
      timeoutId = window.setTimeout(requestTradeAnalytics, 320);
    }

    return () => {
      if (idleId != null && typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [tradeAnalyticsRequested, selectedLeagueId, showTradeBuilder, prewarmAnalytics]);

  useEffect(() => {
    if (!prewarmAnalytics) return;
    if (!statsRequested) setStatsRequested(true);
    if (!tradeAnalyticsRequested) setTradeAnalyticsRequested(true);
  }, [prewarmAnalytics, statsRequested, tradeAnalyticsRequested]);

  // ── Pre-populate from entry points ──────────────────────────────────────────

  useEffect(() => {
    if (!initialPlayer) return;
    onConsumeInitialPlayer?.();

    const {
      sleeperId,
      side,
      partnerRosterId: initPartner,
      otherSleeperId,
    } = initialPlayer;
    const normalizedInitPartner = normalizeRosterId(initPartner);

    // Reset trade state
    setYourPicks([]);
    setTheirPicks([]);
    setSuggestions(null);

    if (view === 'upgrade') {
      setUpgradeTargetId(sleeperId);
      setUpgradeOfferPlayerIds((prev) => prev.filter((id) => id !== sleeperId));
      setSubmittedUpgradeSearch(null);
      setUpgradeSearchResults(null);
      return;
    }

    if (side === 'give') {
      // Trading away one of your own players
      setYourPlayers([sleeperId]);
      setTheirPlayers([]);

      // If there's a second player from Compare, put them on "their" side
      if (otherSleeperId) {
        setTheirPlayers([otherSleeperId]);
        // Find which roster owns the other player
        const ownerRoster = rosters.find(r =>
          [...(r.players ?? []), ...(r.reserve ?? [])].includes(otherSleeperId)
        );
        if (ownerRoster && ownerRoster.roster_id !== myRosterData?.roster_id) {
          setPartnerRosterId(ownerRoster.roster_id);
        }
      } else {
        setTheirPlayers([]);
      }
    } else if (side === 'get') {
      // Targeting a player on another roster
      if (normalizedInitPartner) setPartnerRosterId(normalizedInitPartner);
      setTheirPlayers([sleeperId]);
      setYourPlayers([]);
    }
  }, [initialPlayer]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived data ────────────────────────────────────────────────────────────

  const { slots, rosterPicks } = useMemo(
    () => buildRosterPicks(tradedPicks, rosters, league, season, draftRounds),
    [tradedPicks, rosters, league, season, draftRounds],
  );

  // League-specific KTC adjustments — applied once to the raw array so all
  // downstream code (pickers, value bars, trade math) sees tuned numbers.
  const ktcMultipliers = useMemo(
    () => computeKtcMultipliers(scoringSettings, league?.roster_positions),
    [scoringSettings, league],
  );

  const adjustedKtcPlayers = useMemo(
    () => applyKtcMultipliers(ktcPlayers, ktcMultipliers),
    [ktcPlayers, ktcMultipliers],
  );

  // Dynasty fallback with league multipliers applied — used when a player has no redraft value.
  const adjustedDynastyKtcPlayers = useMemo(
    () => applyKtcMultipliers(dynastyKtcPlayers, ktcMultipliers),
    [dynastyKtcPlayers, ktcMultipliers],
  );

  // Whether any meaningful adjustment was applied (for UI attribution label)
  const isAdjusted = useMemo(
    () => Object.values(ktcMultipliers).some(v => Math.abs(v - 1) > 0.01),
    [ktcMultipliers],
  );

  // Sort rosters: my team first, then alphabetically (excluding self for partner list)
  const partnerRosters = useMemo(() => {
    if (!rosters.length || !myRosterData) return [];
    return [...rosters]
      .filter((roster) => roster.roster_id !== myRosterData.roster_id)
      .map((roster) => {
        const displayName = getUserDisplayName(roster.owner_id ?? '');
        const user = leagueUserById.get(roster.owner_id);
        return {
          roster,
          displayName,
          avatarHash: user?.avatar ?? null,
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [rosters, myRosterData, getUserDisplayName, leagueUserById]);

  const tradeAnalyticsReady = Boolean(tradeAnalyticsRequested && sleeperPlayers && seasonStats && weeklyStats);
  const tradeAnalyticsSnapshot = useMemo(() => buildTradeAnalyticsSnapshot({
      league,
      rosters,
      players: sleeperPlayers,
      seasonStats,
      valuationSeasonStats,
      weeklyStats: analyticsWeeklyStats,
      scoringSettings,
      scheduleMap: null,
      myRosterId: myRosterData?.roster_id ?? null,
      adjustedKtcPlayers,
      adjustedDynastyKtcPlayers,
      leagueType,
      includePlayerTradeValues: tradeAnalyticsReady,
      includeOpportunityLayer: false,
    }), [
    league,
    rosters,
    sleeperPlayers,
    seasonStats,
    valuationSeasonStats,
    analyticsWeeklyStats,
    scoringSettings,
    myRosterData?.roster_id,
    adjustedKtcPlayers,
    adjustedDynastyKtcPlayers,
    leagueType,
    tradeAnalyticsReady,
  ]);
  const {
    rankMap,
    positionalAvgPPG,
    positionalValuePerPPG,
    leagueAvgMult,
    hasIDP,
    hasDST,
    mergedIDPMap,
    playerTradeValueDetailsMap,
    playerTradeValueMap,
  } = tradeAnalyticsSnapshot;
  const draftPickCalibrationPool = useMemo(() => {
    if (!draftPickCalibrationCandidates?.length || !sleeperPlayers) return null;
    return draftPickCalibrationCandidates.map((candidate) => {
      const sharedDetail = playerTradeValueDetailsMap?.get(candidate.id) ?? null;
      const detail = sharedDetail ?? computeTradePlayerValueDetail({
        id: candidate.id,
        players: sleeperPlayers,
        adjustedKtcPlayers,
        adjustedDynastyKtcPlayers,
        leagueType,
        seasonStats: valuationSeasonStats,
        scoringSettings,
        positionalAvgPPG,
        positionalValuePerPPG,
        rankMap,
        mergedIDPMap,
        blendWeight: 0.50,
      });
      return {
        rank: candidate.rank,
        value: detail?.value ?? null,
      };
    });
  }, [
    draftPickCalibrationCandidates,
    sleeperPlayers,
    playerTradeValueDetailsMap,
    adjustedKtcPlayers,
    adjustedDynastyKtcPlayers,
    leagueType,
    valuationSeasonStats,
    scoringSettings,
    positionalAvgPPG,
    positionalValuePerPPG,
    rankMap,
    mergedIDPMap,
  ]);

  // Redraft picks use one league-scored, round-level baseline. The pick's
  // current owner must not change its value because Sleeper does not assign a
  // reliable future slot before the draft.
  const pickValueMap = useMemo(() => {
    if (format !== 'redraft' || !adjustedKtcPlayers?.length || !rosters?.length) return null;
    return computeRedraftPickValues(adjustedKtcPlayers, rosters.length, leagueType, {
      calibrationPool: draftPickCalibrationPool,
      fallbackValueMultiplier: leagueAvgMult,
    });
  }, [format, adjustedKtcPlayers, leagueType, rosters, draftPickCalibrationPool, leagueAvgMult]);
  const tradeOpportunityLayerCacheKey = useMemo(() => {
    if (!tradeAnalyticsReady) return null;
    return buildTradeOpportunityLayerCacheKey({
      selectedLeagueId,
      season,
      league,
      rosters,
      players: sleeperPlayers,
      seasonStats,
      weeklyStats: analyticsWeeklyStats,
      scoringSettings,
      myRosterId: myRosterData?.roster_id ?? null,
    });
  }, [
    tradeAnalyticsReady,
    selectedLeagueId,
    season,
    league,
    rosters,
    sleeperPlayers,
    seasonStats,
    analyticsWeeklyStats,
    scoringSettings,
    myRosterData?.roster_id,
  ]);
  const opportunityLayer = useMemo(() => {
    if (!tradeOpportunityLayerCacheKey) return null;
    return getCachedTradeOpportunityLayer(
      tradeOpportunityLayerCacheKey,
      () => buildRosterOpportunityLayer({
        league,
        rosters,
        players: sleeperPlayers,
        seasonStats,
        weeklyStats: analyticsWeeklyStats,
        scoringSettings,
        scheduleMap: null,
        myRosterId: myRosterData?.roster_id ?? null,
        targetRosterIds: null,
        rankMap,
      }),
    );
  }, [
    tradeOpportunityLayerCacheKey,
    league,
    rosters,
    sleeperPlayers,
    seasonStats,
    analyticsWeeklyStats,
    scoringSettings,
    myRosterData?.roster_id,
    rankMap,
  ]);
  const isTradeAnalyticsLoading = Boolean(
    wantsTradeAnalytics && (
      !statsRequested
      || statsLoading
      || !sleeperPlayers
      || !seasonStats
      || !weeklyStats
    ),
  );

  useEffect(() => {
    tradeIntelligenceCacheRef.current.clear();
    setTradeIntelligence(null);
    setTradeIntelligencePartnerId(null);
  }, [selectedLeagueId, season, opportunityLayer, playerTradeValueMap, pickValueMap, adjustedKtcPlayers, leagueType, rosterPicks, slots, league, leagueDrafts]);

  useEffect(() => {
    if (!deferredPartnerRosterId || !opportunityLayer || !playerTradeValueMap) {
      if (showIntelligence) {
        setTradeIntelligence(null);
        setTradeIntelligencePartnerId(null);
      }
      return undefined;
    }

    const cacheKey = String(deferredPartnerRosterId);
    const cached = tradeIntelligenceCacheRef.current.get(cacheKey) ?? null;
    if (cached) {
      if (showIntelligence) {
        setTradeIntelligence((prev) => (prev === cached ? prev : cached));
        setTradeIntelligencePartnerId(cacheKey);
      }
      return undefined;
    }

    let cancelled = false;
    const cancelTask = scheduleDeferredTradeTask(() => {
      const next = buildPartnerTradeIntelligence({
          opportunityLayer,
          selectedPartnerRosterId: deferredPartnerRosterId ?? null,
          rosterPicks,
          slots,
          league,
          drafts: leagueDrafts,
          currentSeason: season,
          pickValueMap,
          ktcPlayers: adjustedKtcPlayers,
          leagueType,
          playerValueMap: playerTradeValueMap,
        });
      if (cancelled) return;
      tradeIntelligenceCacheRef.current.set(cacheKey, next);
      if (!showIntelligence) return;
      startTradeIntelligenceTransition(() => {
        setTradeIntelligence(next);
        setTradeIntelligencePartnerId(cacheKey);
      });
    }, showIntelligence ? 180 : 520);

    return () => {
      cancelled = true;
      cancelTask?.();
    };
  }, [showIntelligence, opportunityLayer, deferredPartnerRosterId, rosterPicks, slots, league, leagueDrafts, season, pickValueMap, adjustedKtcPlayers, leagueType, playerTradeValueMap, startTradeIntelligenceTransition, selectedLeagueId]);

  const selectedTradePartnerKey = partnerRosterId == null ? null : String(partnerRosterId);
  const loadedTradePartnerKey = tradeIntelligencePartnerId == null ? null : String(tradeIntelligencePartnerId);
  const hasCurrentPartnerTradeIntelligence = Boolean(
    tradeIntelligence && selectedTradePartnerKey && selectedTradePartnerKey === loadedTradePartnerKey,
  );
  const tradeProposals = tradeIntelligence?.tradeProposals ?? [];
  const surplusTradeProposals = tradeIntelligence?.surplusTradeProposals ?? [];
  const isTradeIntelligenceShowingStaleResults = Boolean(
    tradeIntelligence && selectedTradePartnerKey && loadedTradePartnerKey && selectedTradePartnerKey !== loadedTradePartnerKey,
  );

  const resolvePlayerModalMeta = useCallback((player) => {
    if (!player?.id || !sleeperPlayers) return null;
    const sleeperPlayer = sleeperPlayers[player.id];
    const espnId = player.espnId ?? sleeperPlayer?.espn_id ?? espnIdOverrides?.[player.id] ?? null;
    const teamId = player.teamId ?? sleeperPlayer?.team ?? player.team ?? null;
    if (!espnId || !teamId) return null;

    const yearsExp = player.experience != null
      ? Math.max(0, Number(player.experience) - 1)
      : sleeperPlayer?.years_exp;
    return {
      id: String(espnId),
      sleeperId: player.id,
      displayName: player.displayName ?? sleeperPlayer?.full_name ?? player.name ?? player.label ?? 'Player',
      teamId,
      position: player.position ?? sleeperPlayer?.position ?? '',
      positionName: player.positionName ?? '',
      jersey: player.jersey ?? sleeperPlayer?.number ?? '',
      experience: yearsExp != null ? yearsExp + 1 : undefined,
    };
  }, [espnIdOverrides, sleeperPlayers]);

  const openStatsModalForPlayer = useCallback((player) => {
    const meta = resolvePlayerModalMeta(player);
    if (!meta) return;
    setStatsModalPlayer(meta);
  }, [resolvePlayerModalMeta]);

  const getTradeShareAssetValue = useCallback((asset) => {
    if (asset?.type !== 'player') return null;
    return playerTradeValueMap?.get(String(asset.id)) ?? null;
  }, [playerTradeValueMap]);

  const openTradeSharePlayer = useCallback((asset) => {
    if (asset?.type !== 'player') return;
    const meta = resolvePlayerModalMeta({
      id: String(asset.id),
      displayName: asset.label,
      position: asset.position,
      team: asset.team,
    });
    if (meta) onViewPlayer?.(meta.id, meta);
  }, [onViewPlayer, resolvePlayerModalMeta]);

  const myRosterOpportunityPlayers = useMemo(
    () => [...(opportunityLayer?.rosterAnalysesById?.[myRosterData?.roster_id]?.rosterPlayers ?? [])]
      .sort((a, b) => (b.ppg ?? 0) - (a.ppg ?? 0) || a.name.localeCompare(b.name)),
    [opportunityLayer, myRosterData?.roster_id],
  );

  const currentUpgradeSearchRequest = useMemo(() => buildUpgradeSearchRequest({
    targetPlayerId: upgradeTargetId,
    allowedOutgoingPlayerIds: upgradeOfferPlayerIds,
    tradePostureLevel: upgradeTradePostureLevel,
    allowPackages: upgradeAllowPackages,
    allowOutgoingPicks: picksEnabled && upgradeAllowOutgoingPicks,
    allowIncomingPicks: picksEnabled && upgradeAllowIncomingPicks,
  }), [
    picksEnabled,
    upgradeTargetId,
    upgradeOfferPlayerIds,
    upgradeTradePostureLevel,
    upgradeAllowPackages,
    upgradeAllowOutgoingPicks,
    upgradeAllowIncomingPicks,
  ]);

  const upgradeSearchCacheKey = useMemo(() => {
    return buildUpgradeSearchCacheKey(submittedUpgradeSearch, selectedLeagueId, season);
  }, [submittedUpgradeSearch, selectedLeagueId, season]);
  const currentUpgradeSearchCacheKey = useMemo(
    () => buildUpgradeSearchCacheKey(currentUpgradeSearchRequest, selectedLeagueId, season),
    [currentUpgradeSearchRequest, selectedLeagueId, season],
  );

  useEffect(() => {
    upgradeSearchCacheRef.current.clear();
    setUpgradeSearchResults(null);
  }, [selectedLeagueId, season, opportunityLayer, playerTradeValueMap, pickValueMap, adjustedKtcPlayers, leagueType, rosterPicks, slots, league, leagueDrafts]);

  useEffect(() => {
    if (!submittedUpgradeSearch?.targetPlayerId || !opportunityLayer || !playerTradeValueMap || !upgradeSearchCacheKey) {
      setUpgradeSearchResults(null);
      return undefined;
    }

    const cached = upgradeSearchCacheRef.current.get(upgradeSearchCacheKey) ?? null;
    if (cached) {
      setUpgradeSearchResults((prev) => (prev === cached ? prev : cached));
      return undefined;
    }

    let cancelled = false;
    const cancelTask = scheduleDeferredTradeTask(() => {
      const next = findLeagueWideUpgradeGroups({
          opportunityLayer,
          targetPlayerId: submittedUpgradeSearch.targetPlayerId,
          allowedOutgoingPlayerIds: submittedUpgradeSearch.allowedOutgoingPlayerIds,
          tradePostureLevel: submittedUpgradeSearch.tradePostureLevel,
          allowPackages: submittedUpgradeSearch.allowPackages,
          allowOutgoingPicks: submittedUpgradeSearch.allowOutgoingPicks,
          allowIncomingPicks: submittedUpgradeSearch.allowIncomingPicks,
          rosterPicks,
          slots,
          league,
          drafts: leagueDrafts,
          currentSeason: season,
          pickValueMap,
          ktcPlayers: adjustedKtcPlayers,
          leagueType,
          playerValueMap: playerTradeValueMap,
        });
      if (cancelled) return;
      upgradeSearchCacheRef.current.set(upgradeSearchCacheKey, next);
      startUpgradeResultsTransition(() => {
        setUpgradeSearchResults(next);
      });
    }, 180);

    return () => {
      cancelled = true;
      cancelTask?.();
    };
  }, [submittedUpgradeSearch, upgradeSearchCacheKey, opportunityLayer, rosterPicks, slots, league, leagueDrafts, season, pickValueMap, adjustedKtcPlayers, leagueType, playerTradeValueMap, startUpgradeResultsTransition]);

  useEffect(() => {
    if (!showUpgrade || !currentUpgradeSearchRequest || !currentUpgradeSearchCacheKey) return undefined;
    if (!opportunityLayer || !playerTradeValueMap) return undefined;
    if (!(currentUpgradeSearchRequest.allowedOutgoingPlayerIds.length > 0 || currentUpgradeSearchRequest.allowOutgoingPicks)) return undefined;
    if (upgradeSearchCacheRef.current.has(currentUpgradeSearchCacheKey)) return undefined;

    let cancelled = false;
    const cancelTask = scheduleDeferredTradeTask(() => {
      const next = findLeagueWideUpgradeGroups({
          opportunityLayer,
          targetPlayerId: currentUpgradeSearchRequest.targetPlayerId,
          allowedOutgoingPlayerIds: currentUpgradeSearchRequest.allowedOutgoingPlayerIds,
          tradePostureLevel: currentUpgradeSearchRequest.tradePostureLevel,
          allowPackages: currentUpgradeSearchRequest.allowPackages,
          allowOutgoingPicks: currentUpgradeSearchRequest.allowOutgoingPicks,
          allowIncomingPicks: currentUpgradeSearchRequest.allowIncomingPicks,
          rosterPicks,
          slots,
          league,
          drafts: leagueDrafts,
          currentSeason: season,
          pickValueMap,
          ktcPlayers: adjustedKtcPlayers,
          leagueType,
          playerValueMap: playerTradeValueMap,
        });
      if (cancelled) return;
      upgradeSearchCacheRef.current.set(currentUpgradeSearchCacheKey, next);
    }, 480);

    return () => {
      cancelled = true;
      cancelTask?.();
    };
  }, [
    showUpgrade,
    currentUpgradeSearchRequest,
    currentUpgradeSearchCacheKey,
    opportunityLayer,
    playerTradeValueMap,
    rosterPicks,
    slots,
    league,
    leagueDrafts,
    season,
    pickValueMap,
    adjustedKtcPlayers,
    leagueType,
  ]);

  // Enrich a valueSide result with canonical player details. Pick values are
  // already calibrated to the final Trade scale in computeRedraftPickValues.
  function enrichItems(side) {
    if (!side.items.length) return side;
    const enriched = side.items.map(it => {
      if (it.type === 'pick') {
        return { ...it, adjVal: it.val };
      }
      const sharedTradeValueDetail = playerTradeValueDetailsMap?.get(it.id) ?? null;
      const ktcEntry = it.ktcEntry ?? findKtcPlayerFromSleeper(it.id, sleeperPlayers, adjustedKtcPlayers ?? []);
      const fallbackTradeValueDetail = sharedTradeValueDetail ?? computeTradePlayerValueDetail({
        id: it.id,
        players: sleeperPlayers,
        adjustedKtcPlayers,
        adjustedDynastyKtcPlayers,
        leagueType,
        seasonStats: valuationSeasonStats,
        scoringSettings,
        positionalAvgPPG,
        positionalValuePerPPG,
        rankMap,
        mergedIDPMap,
        blendWeight: 0.50,
      });
      const adjVal = fallbackTradeValueDetail?.value ?? playerTradeValueMap?.get(it.id) ?? it.val;
      const avgPPG = fallbackTradeValueDetail?.avgPPG != null
        ? Math.round(fallbackTradeValueDetail.avgPPG * 10) / 10
        : null;
      const rankInfo = fallbackTradeValueDetail?.rankInfo ?? null;

      return {
        ...it,
        adjVal,
        avgPPG,
        rankInfo,
        ktcEntry,
        dynastyFallback: fallbackTradeValueDetail?.dynastyFallback ?? it.dynastyFallback ?? false,
        idpFallback: fallbackTradeValueDetail?.isEstimated ?? it.idpFallback ?? false,
      };
    });
    const adjTotal = enriched.reduce((sum, it) => sum + (it.adjVal ?? it.val ?? 0), 0);
    return { ...side, items: enriched, total: adjTotal };
  }

  // Value calculations — show player cards immediately once sleeperPlayers is loaded,
  // even if KTC hasn't resolved yet (values show "—" until KTC finishes).
  const yourSide = useMemo(() => {
    if (!showTradeBuilder || !sleeperPlayers) return { total: 0, items: [] };
    const side = valueSide(yourPlayers, yourPicks, sleeperPlayers, adjustedKtcPlayers ?? [], leagueType, rosters, pickValueMap, season, adjustedDynastyKtcPlayers, mergedIDPMap, playerTradeValueDetailsMap, league, leagueDrafts);
    return enrichItems(side);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTradeBuilder, yourPlayers, yourPicks, sleeperPlayers, adjustedKtcPlayers, adjustedDynastyKtcPlayers, mergedIDPMap, leagueType, rosters, pickValueMap, season, league, leagueDrafts, playerTradeValueDetailsMap, playerTradeValueMap, positionalAvgPPG, positionalValuePerPPG, leagueAvgMult, rankMap]);

  const theirSide = useMemo(() => {
    if (!showTradeBuilder || !sleeperPlayers) return { total: 0, items: [] };
    const side = valueSide(theirPlayers, theirPicks, sleeperPlayers, adjustedKtcPlayers ?? [], leagueType, rosters, pickValueMap, season, adjustedDynastyKtcPlayers, mergedIDPMap, playerTradeValueDetailsMap, league, leagueDrafts);
    return enrichItems(side);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTradeBuilder, theirPlayers, theirPicks, sleeperPlayers, adjustedKtcPlayers, adjustedDynastyKtcPlayers, mergedIDPMap, leagueType, rosters, pickValueMap, season, league, leagueDrafts, playerTradeValueDetailsMap, playerTradeValueMap, positionalAvgPPG, positionalValuePerPPG, leagueAvgMult, rankMap]);

  const verdict = useMemo(
    () => evaluateTrade(yourSide.total, theirSide.total),
    [yourSide.total, theirSide.total],
  );

  const hasItems = showTradeBuilder && (yourSide.items.length > 0 || theirSide.items.length > 0);
  const hasDynastyFallback = showTradeBuilder && [...yourSide.items, ...theirSide.items].some((it) => it.dynastyFallback);

  const getTradeParticipant = useCallback((rosterId) => {
    const roster = rosterById.get(rosterId) ?? null;
    const user = roster ? leagueUserById.get(roster.owner_id) : null;
    return {
      userId: roster?.owner_id ?? null,
      rosterId: roster?.roster_id ?? rosterId ?? null,
      name: user?.display_name ?? user?.username ?? getUserDisplayName(roster?.owner_id ?? ''),
      teamName: user?.metadata?.team_name ?? roster?.metadata?.team_name ?? getUserDisplayName(roster?.owner_id ?? ''),
      avatarHash: user?.avatar ?? null,
    };
  }, [getUserDisplayName, leagueUserById, rosterById]);

  const buildCurrentTradeSnapshot = useCallback(() => {
    if (!myRosterData?.roster_id || !partnerRosterId || !sleeperUser?.user_id) return null;
    // A counter is authored by the participant opening this composer. The
    // hydrated trade sides already represent the local user's roster as
    // `yourSide`, regardless of who authored the current revision. Keeping
    // that perspective here prevents counters from re-submitting the prior
    // sender's assets under the new sender key.
    return buildTradeProposalSnapshotFromCurrentPerspective({
      leagueId: selectedLeagueId,
      season,
      currentParticipant: getTradeParticipant(myRosterData.roster_id),
      partnerParticipant: getTradeParticipant(partnerRosterId),
      currentSide: yourSide,
      partnerSide: theirSide,
      verdict,
    });
  }, [getTradeParticipant, myRosterData?.roster_id, partnerRosterId, selectedLeagueId, season, sleeperUser?.user_id, theirSide, verdict, yourSide]);

  const buildEngineTradeSnapshot = useCallback((proposal) => {
    if (!proposal?.targetRosterId || !myRosterData?.roster_id) return null;
    const sumAssets = (assets = []) => assets.reduce((total, asset) => total + (Number(asset.value ?? asset.val) || 0), 0);
    const outgoingTotal = sumAssets(proposal.outgoingAssets);
    const incomingTotal = sumAssets(proposal.incomingAssets);
    return buildTradeProposalSnapshot({
      leagueId: selectedLeagueId,
      season,
      sender: getTradeParticipant(myRosterData.roster_id),
      recipient: getTradeParticipant(proposal.targetRosterId),
      senderAssets: proposal.outgoingAssets ?? [],
      recipientAssets: proposal.incomingAssets ?? [],
      totals: { sender: outgoingTotal, recipient: incomingTotal },
      verdict: evaluateTrade(outgoingTotal, incomingTotal),
    });
  }, [getTradeParticipant, myRosterData?.roster_id, season, selectedLeagueId]);

  useEffect(() => {
    const snapshot = initialTradeProposal?.revision?.snapshot;
    if (!initialTradeProposal?.id || !snapshot || !myRosterData?.roster_id || !sleeperUser?.user_id || !sleeperPlayers || Object.keys(sleeperPlayers).length === 0) return;
    const senderRosterId = normalizeRosterId(snapshot.sender?.rosterId ?? initialTradeProposal.senderRosterId);
    const recipientRosterId = normalizeRosterId(snapshot.recipient?.rosterId ?? initialTradeProposal.recipientRosterId);
    const isCurrentSender = String(snapshot.sender?.userId ?? initialTradeProposal.senderUserId) === String(sleeperUser.user_id);
    const ownSide = isCurrentSender ? snapshot.sender : snapshot.recipient;
    const otherSide = isCurrentSender ? snapshot.recipient : snapshot.sender;
    const otherRosterId = otherSide?.rosterId ?? (isCurrentSender ? initialTradeProposal.recipientRosterId : initialTradeProposal.senderRosterId);
    const ownRosterId = isCurrentSender ? senderRosterId : recipientRosterId;
    const hasAssets = (ownSide?.assets?.length ?? 0) + (otherSide?.assets?.length ?? 0) > 0;
    if (!ownSide || !otherSide || !ownRosterId || String(ownRosterId) !== String(myRosterData.roster_id) || !hasAssets) return;
    const picksFromAssets = (assets = [], ownerRosterId) => assets.filter((asset) => asset.type === 'pick').map((asset) => ({
      year: String(asset.year),
      round: Number(asset.round),
      fromRosterId: String(asset.originalRosterId ?? asset.fromRosterId ?? ownerRosterId),
      isOwn: String(asset.originalRosterId ?? asset.fromRosterId ?? ownerRosterId) === String(ownerRosterId),
      key: String(asset.originalRosterId ?? asset.fromRosterId ?? ownerRosterId) === String(ownerRosterId)
        ? `${asset.year}|${asset.round}`
        : `${asset.year}|${asset.round}|from${asset.originalRosterId ?? asset.fromRosterId}`,
    }));
    setPartnerRosterId(normalizeRosterId(otherRosterId));
    setYourPlayers((ownSide?.assets ?? []).filter((asset) => asset.type === 'player' && asset.id != null).map((asset) => String(asset.id)));
    setYourPicks(picksEnabled ? picksFromAssets(ownSide?.assets, myRosterData.roster_id) : []);
    setTheirPlayers((otherSide?.assets ?? []).filter((asset) => asset.type === 'player' && asset.id != null).map((asset) => String(asset.id)));
    setTheirPicks(picksEnabled ? picksFromAssets(otherSide?.assets, otherRosterId) : []);
    setCounterTarget(initialTradeProposal);
    onConsumeInitialTradeProposal?.();
  }, [initialTradeProposal, myRosterData?.roster_id, onConsumeInitialTradeProposal, picksEnabled, sleeperPlayers, sleeperUser?.user_id]);

  const openTradeShare = useCallback((snapshot, mode = 'send', proposal = null) => {
    if (!snapshot || !tradeProposalActions) return;
    setTradeShareRequest({ snapshot, mode, proposal });
    setTradeShareResult(null);
    setTradeShareError('');
  }, [tradeProposalActions]);

  const submitTradeShare = useCallback(async (expiryPreset) => {
    if (!tradeShareRequest || !tradeProposalActions) return;
    setTradeShareSubmitting(true);
    setTradeShareError('');
    try {
      const response = tradeShareRequest.mode === 'counter'
        ? await tradeProposalActions.sendCounter(tradeShareRequest.proposal.id, tradeShareRequest.proposal.currentRevision, tradeShareRequest.snapshot, expiryPreset)
        : await tradeProposalActions.sendProposal(
          tradeShareRequest.snapshot,
          tradeShareRequest.snapshot.recipient.userId,
          tradeShareRequest.snapshot.recipient.rosterId,
          expiryPreset,
        );
      setTradeShareResult(response);
      if (tradeShareRequest.mode === 'counter') setCounterTarget(null);
    } catch (error) {
      setTradeShareError(error?.message ?? 'The trade proposal could not be sent.');
    } finally {
      setTradeShareSubmitting(false);
    }
  }, [tradeProposalActions, tradeShareRequest]);

  const closeTradeShare = useCallback(() => {
    setTradeShareRequest(null);
    setTradeShareResult(null);
    setTradeShareError('');
  }, []);
  const suggestionBasePools = useMemo(() => {
    if (!showTradeBuilder || !adjustedKtcPlayers || !myRosterData?.roster_id || !partnerRosterId) return null;

    const dynFallbackOpts = {
      dynastyKtcPlayers: adjustedDynastyKtcPlayers,
      seasonStats: valuationSeasonStats,
      scoringSettings,
      positionalValuePerPPG,
      positionalAvgPPG,
      rankMap,
      idpValueMap: mergedIDPMap,
      playerTradeValueDetailsMap,
      league,
      drafts: leagueDrafts,
    };

    return {
      yours: buildCandidatePool(
        myRosterData.roster_id,
        rosters,
        [],
        [],
        sleeperPlayers,
        adjustedKtcPlayers,
        leagueType,
        rosterPicks,
        slots,
        pickValueMap,
        season,
        dynFallbackOpts,
      ),
      theirs: buildCandidatePool(
        partnerRosterId,
        rosters,
        [],
        [],
        sleeperPlayers,
        adjustedKtcPlayers,
        leagueType,
        rosterPicks,
        slots,
        pickValueMap,
        season,
        dynFallbackOpts,
      ),
    };
  }, [
    showTradeBuilder,
    adjustedKtcPlayers,
    myRosterData,
    partnerRosterId,
    adjustedDynastyKtcPlayers,
    valuationSeasonStats,
    scoringSettings,
    positionalValuePerPPG,
    positionalAvgPPG,
    rankMap,
    mergedIDPMap,
    playerTradeValueDetailsMap,
    rosters,
    sleeperPlayers,
    leagueType,
    rosterPicks,
    slots,
    pickValueMap,
    season,
    league,
    leagueDrafts,
  ]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const addPlayer = useCallback((side, playerIdOrObj) => {
    const fromGlobalSearch = typeof playerIdOrObj === 'object';
    if (side === 'yours' && typeof playerIdOrObj !== 'object') {
      // Your side locked picker: plain ID from your roster
      setYourPlayers(prev => [...prev, playerIdOrObj]);
    } else if (typeof playerIdOrObj === 'object') {
      // All-rosters search: { id, rosterId }
      const { id, rosterId: playerRosterId } = playerIdOrObj;
      const normalizedPlayerRosterId = normalizeRosterId(playerRosterId);
      if (normalizedPlayerRosterId === myRosterData?.roster_id) {
        // Own player selected from global search → always goes to Your Side
        setYourPlayers(prev => [...prev, id]);
      } else if (normalizedPlayerRosterId && normalizedPlayerRosterId !== partnerRosterId) {
        // Different partner selected → set partner and reset their side only.
        // Your Side players can be offered to any trade partner, so preserve them.
        switchPartnerTradeContext(normalizedPlayerRosterId, { nextTheirPlayers: [id], nextTheirPicks: [] });
      } else {
        setTheirPlayers(prev => [...prev, id]);
      }
    } else {
      setTheirPlayers(prev => [...prev, playerIdOrObj]);
    }
    if (fromGlobalSearch) setPickerOpen(null);
    setSuggestions(null);
  }, [partnerRosterId, myRosterData?.roster_id, switchPartnerTradeContext]);

  const removePlayer = useCallback((side, playerId) => {
    if (side === 'yours') setYourPlayers(prev => prev.filter(id => id !== playerId));
    else setTheirPlayers(prev => prev.filter(id => id !== playerId));
    setSuggestions(null);
  }, []);

  const addPick = useCallback((side, pick) => {
    if (!picksEnabled) return;
    if (side === 'yours') setYourPicks(prev => [...prev, pick]);
    else setTheirPicks(prev => [...prev, pick]);
    setSuggestions(null);
  }, [picksEnabled]);

  const removePick = useCallback((side, pickKey) => {
    if (side === 'yours') setYourPicks(prev => prev.filter(p => p.key !== pickKey));
    else setTheirPicks(prev => prev.filter(p => p.key !== pickKey));
    setSuggestions(null);
  }, []);

  const applyTradeProposal = useCallback((proposal) => {
    if (!proposal) return;
    startPartnerSwitchTransition(() => {
      setPartnerRosterId(normalizeRosterId(proposal.targetRosterId));
      setYourPlayers((proposal.outgoingAssets ?? []).filter((asset) => asset.type === 'player').map((asset) => asset.id));
      setYourPicks(picksEnabled ? (proposal.outgoingAssets ?? []).filter((asset) => asset.type === 'pick' && asset.pickData).map((asset) => asset.pickData) : []);
      setTheirPlayers((proposal.incomingAssets ?? []).filter((asset) => asset.type === 'player').map((asset) => asset.id));
      setTheirPicks(picksEnabled ? (proposal.incomingAssets ?? []).filter((asset) => asset.type === 'pick' && asset.pickData).map((asset) => asset.pickData) : []);
      setSuggestions(null);
    });
    onViewChange?.('agent');
  }, [onViewChange, picksEnabled, startPartnerSwitchTransition]);

  const handleSuggest = useCallback(() => {
    if (!adjustedKtcPlayers || !partnerRosterId || !suggestionBasePools) return;
    const gap = Math.abs(yourSide.total - theirSide.total);
    if (gap <= 0) return;

    const deficitSide = yourSide.total < theirSide.total ? 'yours' : 'theirs';

    const deficitExcludeIds     = deficitSide === 'yours' ? yourPlayers : theirPlayers;
    const deficitExcludePickKeys = (deficitSide === 'yours' ? yourPicks : theirPicks).map(p => p.key);
    const surplusExcludeIds     = deficitSide === 'yours' ? theirPlayers : yourPlayers;
    const surplusExcludePickKeys = (deficitSide === 'yours' ? theirPicks : yourPicks).map(p => p.key);

    const deficitExcludeSet = new Set(deficitExcludeIds);
    const deficitExcludePickSet = new Set(deficitExcludePickKeys);
    const surplusExcludeSet = new Set(surplusExcludeIds);
    const surplusExcludePickSet = new Set(surplusExcludePickKeys);
    const deficitCandidates = (suggestionBasePools[deficitSide] ?? []).filter((candidate) => (
      candidate.type === 'player'
        ? !deficitExcludeSet.has(candidate.id)
        : !deficitExcludePickSet.has(candidate.id)
    ));
    const surplusCandidates = (suggestionBasePools[deficitSide === 'yours' ? 'theirs' : 'yours'] ?? []).filter((candidate) => (
      candidate.type === 'player'
        ? !surplusExcludeSet.has(candidate.id)
        : !surplusExcludePickSet.has(candidate.id)
    ));

    const options = suggestPackage({
      gap,
      deficitSide,
      deficitCandidates,
      deficitItems:    deficitSide === 'yours' ? yourSide.items : theirSide.items,
      surplusItems:    deficitSide === 'yours' ? theirSide.items : yourSide.items,
      surplusCandidates,
    });
    setSuggestions({ options, deficitSide });
  }, [adjustedKtcPlayers, partnerRosterId, suggestionBasePools, yourSide, theirSide,
      yourPlayers, theirPlayers, yourPicks, theirPicks]);

  const applySuggestion = useCallback((option) => {
    const applyAdd = (side, items) => {
      for (const item of items) {
        if (item.type === 'player') {
          if (side === 'yours') setYourPlayers(prev => [...prev, item.id]);
          else setTheirPlayers(prev => [...prev, item.id]);
        } else if (picksEnabled && item.pickData) {
          if (side === 'yours') setYourPicks(prev => [...prev, item.pickData]);
          else setTheirPicks(prev => [...prev, item.pickData]);
        }
      }
    };
    const applyRemove = (side, items) => {
      for (const item of items) {
        if (item.type === 'player') {
          if (side === 'yours') setYourPlayers(prev => prev.filter(id => id !== item.id));
          else setTheirPlayers(prev => prev.filter(id => id !== item.id));
        } else if (picksEnabled) {
          if (side === 'yours') setYourPicks(prev => prev.filter(p => p.key !== item.id));
          else setTheirPicks(prev => prev.filter(p => p.key !== item.id));
        }
      }
    };

    if (option.action === 'add') {
      applyAdd(option.side, option.items);
    } else if (option.action === 'remove') {
      applyRemove(option.side, option.items);
    } else if (option.action === 'swap') {
      applyRemove(option.side, [option.remove]);
      applyAdd(option.side, [option.add]);
    }
    setSuggestions(null);
  }, [picksEnabled]);

  const clearTrade = useCallback(() => {
    setYourPlayers([]);
    setYourPicks([]);
    setTheirPlayers([]);
    setTheirPicks([]);
    setSuggestions(null);
  }, []);

  const runUpgradeFinderSearch = useCallback(() => {
    if (!currentUpgradeSearchRequest) return;
    const cached = currentUpgradeSearchCacheKey
      ? (upgradeSearchCacheRef.current.get(currentUpgradeSearchCacheKey) ?? null)
      : null;
    startUpgradeSearchTransition(() => {
      if (cached) {
        setUpgradeSearchResults((prev) => (prev === cached ? prev : cached));
      }
      setSubmittedUpgradeSearch(currentUpgradeSearchRequest);
    });
  }, [
    currentUpgradeSearchRequest,
    currentUpgradeSearchCacheKey,
    startUpgradeSearchTransition,
  ]);

  const isTradeIntelligenceLoading = false;
  const isTradeIntelligencePreparingPartner = isTradeAnalyticsLoading || Boolean(
    showIntelligence
      && partnerRosterId
      && opportunityLayer
      && playerTradeValueMap
      && !hasCurrentPartnerTradeIntelligence,
  ) || isTradeIntelligencePending || isPartnerSwitchPending;
  const isUpgradeSearchDirty = Boolean(
    submittedUpgradeSearch && !areUpgradeSearchRequestsEqual(submittedUpgradeSearch, currentUpgradeSearchRequest),
  );
  const isUpgradeResultsLoading = Boolean(
    submittedUpgradeSearch?.targetPlayerId && opportunityLayer && playerTradeValueMap && !upgradeSearchResults,
  ) || isUpgradeResultsPending;

  const statsModal = statsModalPlayer ? (
    <PlayerStatsModal
      playerId={statsModalPlayer.id}
      playerMeta={statsModalPlayer}
      onClose={() => setStatsModalPlayer(null)}
      onOpenFullProfile={() => {
        onViewPlayer?.(statsModalPlayer.id, statsModalPlayer);
        setStatsModalPlayer(null);
      }}
    />
  ) : null;

  if (showUpgrade) {
    if (isTradeAnalyticsLoading) {
      return (
        <>
          <div className="px-4 pt-4 pb-8">
            <div
              className="rounded-2xl px-5 py-5"
              style={{ background: 'var(--color-fill)', border: '1px solid var(--color-separator)' }}
            >
              <div className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-label-tertiary)' }}>
                Upgrade Finder
              </div>
              <div className="mt-2 text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
                Preparing league-wide upgrade paths...
              </div>
              <div className="mt-1 text-sm" style={{ color: 'var(--color-label-secondary)' }}>
                The full roster opportunity analysis starts when you open the upgrade view.
              </div>
            </div>
          </div>
          {statsModal}
        </>
      );
    }
    return (
      <>
        <UpgradeFinderPage
          players={myRosterOpportunityPlayers}
          searchSubmitted={Boolean(submittedUpgradeSearch)}
          searchDirty={isUpgradeSearchDirty}
          selectedPlayerId={upgradeTargetId}
          selectedOutgoingPlayerIds={upgradeOfferPlayerIds}
          searchPending={isUpgradeSearchPending || isUpgradeResultsLoading}
          tradePostureLevel={upgradeTradePostureLevel}
          playerValueMap={playerTradeValueMap}
          allowPackages={upgradeAllowPackages}
          allowOutgoingPicks={picksEnabled && upgradeAllowOutgoingPicks}
          allowIncomingPicks={picksEnabled && upgradeAllowIncomingPicks}
          results={upgradeSearchResults}
          postureOptions={UPGRADE_TRADE_POSTURES}
          darkMode={darkMode}
          seasonStats={valuationSeasonStats}
          sleeperPlayers={sleeperPlayers}
          ktcPlayers={adjustedKtcPlayers}
          dynastyKtcPlayers={adjustedDynastyKtcPlayers}
          leagueType={leagueType}
          scoringSettings={scoringSettings}
          myRosterId={myRosterData?.roster_id}
          mergedIDPMap={mergedIDPMap}
          getUserDisplayName={getUserDisplayName}
          rosters={rosters}
          ownerNameByRosterId={ownerNameByRosterId}
          rankMap={rankMap}
          positionalAvgPPG={positionalAvgPPG}
          positionalValuePerPPG={positionalValuePerPPG}
          playerTradeValueDetailsMap={playerTradeValueDetailsMap}
          onSelectPlayer={(playerId) => {
            setUpgradeTargetId(playerId);
            setUpgradeOfferPlayerIds((prev) => prev.filter((id) => id !== playerId));
          }}
          onToggleOutgoingPlayer={(playerId) => {
            setUpgradeOfferPlayerIds((prev) => prev.includes(playerId)
              ? prev.filter((id) => id !== playerId)
              : [...prev, playerId]);
          }}
          onAllowOutgoingPicksChange={picksEnabled ? setUpgradeAllowOutgoingPicks : () => {}}
          onAllowIncomingPicksChange={picksEnabled ? setUpgradeAllowIncomingPicks : () => {}}
          onAllowPackagesChange={setUpgradeAllowPackages}
          onTradePostureChange={setUpgradeTradePostureLevel}
          onRunSearch={runUpgradeFinderSearch}
          onApplyProposal={applyTradeProposal}
          onShareProposal={(proposal) => openTradeShare(buildEngineTradeSnapshot(proposal))}
          onOpenPlayer={openStatsModalForPlayer}
          onBack={() => onViewChange?.('agent')}
        />
        {statsModal}
      </>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="page-frame-workbench pb-8">

      {showAgent ? (
        <>
          {/* ── Desktop: shelf rail + main column ──────────────────────── */}
          {/* Shared shelf drop handler: routing follows the shelf tab context */}
          <TradeProposalBuilder
            addPlayer={addPlayer}
            partnerRosterId={partnerRosterId}
            addPick={addPick}
            myRosterData={myRosterData}
            rosterById={rosterById}
            yourPlayers={yourPlayers}
            theirPlayers={theirPlayers}
            sleeperPlayers={sleeperPlayers}
            playerTradeValueMap={playerTradeValueMap}
            getUserDisplayName={getUserDisplayName}
            ownerNameByRosterId={ownerNameByRosterId}
            rosterPicks={rosterPicks}
            slots={slots}
            picksEnabled={picksEnabled}
            yourPicks={yourPicks}
            theirPicks={theirPicks}
            league={league}
            rosters={rosters}
            ktcPlayers={adjustedKtcPlayers}
            leagueType={leagueType}
            pickValueMap={pickValueMap}
            currentSeason={season}
            drafts={leagueDrafts}
            leagueUserById={leagueUserById}
            partnerRosters={partnerRosters}
            switchPartnerTradeContext={switchPartnerTradeContext}
            shelfDragRef={shelfDragRef}
            hasItems={hasItems}
            verdict={verdict}
            handleSuggest={handleSuggest}
            suggestions={suggestions}
            applySuggestion={applySuggestion}
            yourSide={yourSide}
            theirSide={theirSide}
            ktcLoading={ktcLoading}
            ktcError={ktcError}
            removePlayer={removePlayer}
            removePick={removePick}
            setPickerOpen={setTradePickerOpen}
            openStatsModalForPlayer={openStatsModalForPlayer}
            clearTrade={clearTrade}
            onShareTrade={() => openTradeShare(buildCurrentTradeSnapshot(), counterTarget ? 'counter' : 'send', counterTarget)}
            attribution={<TradeValueAttribution
              format={format}
              leagueType={leagueType}
              isAdjusted={isAdjusted}
              onInfoClick={() => setShowValInfo(true)}
              onDark
            />}
          />

          {/* ── Search all rostered players (mobile only) ───────────────── */}
          {!ktcLoading && !ktcError && (
            <div className="lg:hidden px-4 mt-3">
              <button
                onClick={() => setTradePickerOpen({ side: 'theirs', type: 'player', allRosters: true })}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)', border: '1px solid var(--color-separator)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                Search All Rostered Players
              </button>
            </div>
          )}

          {/* ── Value trends ────────────────────────────────────────────── */}
          {hasItems && (
            <div className="px-4 pt-4">
              <button onClick={() => setShowTrends(!showTrends)}
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
                <span style={{ transform: showTrends ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms' }}>▸</span>
                Value Trends
              </button>
              {showTrends && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {(() => {
                    const trendItems = [...yourSide.items, ...theirSide.items].filter(it => it.type === 'player' && it.ktcEntry);
                    return trendItems.length > 0 ? (
                      trendItems.map(it => <TrendRow key={it.id} item={it} leagueType={leagueType} />)
                    ) : (
                      <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--color-fill)', color: 'var(--color-label-tertiary)' }}>
                        No KTC trend data available for these players.
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ── Dynasty fallback disclaimer ──────────────────────────────── */}
          {hasDynastyFallback && (
            <div className="mx-4 mt-4 px-3 py-2.5 rounded-xl text-xs"
              style={{ background: 'var(--color-fill)', color: 'var(--color-label-tertiary)', lineHeight: 1.5 }}>
              <span style={{ color: 'var(--color-label-secondary)', fontWeight: 600 }}>~ DYN est.</span>
              {' '}One or more players aren't listed in KTC's {format === 'dynasty' ? 'dynasty' : 'redraft'} rankings.
              Their value is estimated from season performance calibrated against KTC-ranked players, or from dynasty rankings when stats are unavailable.
            </div>
          )}

        </>
      ) : null}

      {showIntelligence ? (
        <div className="px-4 pt-3">
          {isTradeIntelligenceLoading ? (
            <div
              className="rounded-2xl px-5 py-5"
              style={{ background: 'var(--color-fill)', border: '1px solid var(--color-separator)' }}
            >
              <div className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-label-tertiary)' }}>
                Trade Intelligence
              </div>
              <div className="mt-2 text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
                Preparing partner-specific trade ideas...
              </div>
              <div className="mt-1 text-sm" style={{ color: 'var(--color-label-secondary)' }}>
                Opening intelligence mode now runs the full league opportunity analysis on demand.
              </div>
            </div>
          ) : (
            <TradeProposalPanel
              partnerRosterId={partnerRosterId}
              partnerName={partnerRosterId ? (ownerNameByRosterId.get(partnerRosterId) ?? null) : null}
              partnerRosters={partnerRosters}
              rosters={rosters}
              ownerNameByRosterId={ownerNameByRosterId}
              tradeProposals={tradeProposals}
              surplusTradeProposals={surplusTradeProposals}
              activeMode={tradeProposalMode}
              proposalFilters={proposalFilters}
              onProposalFiltersChange={setProposalFilters}
              onModeChange={setTradeProposalMode}
              onPartnerChange={switchPartnerTradeContext}
              onApplyProposal={applyTradeProposal}
              onShareProposal={(proposal) => openTradeShare(buildEngineTradeSnapshot(proposal))}
              onOpenPlayer={openStatsModalForPlayer}
              isPreparingPartner={isTradeIntelligencePreparingPartner}
              isShowingStaleResults={isTradeIntelligenceShowingStaleResults}
            />
          )}
        </div>
      ) : null}


      {/* ── Picker modals ───────────────────────────────────────────────── */}

      {showValInfo && (
        <ValuationInfoSheet
          format={format}
          leagueType={leagueType}
          scoringSettings={scoringSettings}
          rosterPositions={league?.roster_positions}
          multipliers={ktcMultipliers}
          isAdjusted={isAdjusted}
          onClose={() => setShowValInfo(false)}
        />
      )}

      {pickerOpen?.type === 'player' && (
        <TradeRosterPicker
          rosterId={pickerOpen.side === 'yours'
            ? myRosterData?.roster_id
            : (pickerOpen.allRosters ? null : (partnerRosterId ?? null))}
          rosters={rosters}
          sleeperPlayers={sleeperPlayers}
          ktcPlayers={adjustedKtcPlayers}
          dynastyKtcPlayers={adjustedDynastyKtcPlayers}
          leagueType={leagueType}
          excludeIds={pickerOpen.allRosters
            ? [...yourPlayers, ...theirPlayers]
            : (pickerOpen.side === 'yours' ? yourPlayers : theirPlayers)}
          includeOwnRoster={pickerOpen.allRosters === true}
          seasonStats={valuationSeasonStats}
          scoringSettings={scoringSettings}
          getUserDisplayName={getUserDisplayName}
          myRosterId={myRosterData?.roster_id}
          currentTotal={pickerOpen.side === 'yours' ? yourSide.total : theirSide.total}
          activeRosterId={pickerOpen.side === 'yours' ? myRosterData?.roster_id : partnerRosterId}
          mergedIDPMap={mergedIDPMap}
          sharedRankMap={rankMap}
          sharedPositionalAvgPPG={positionalAvgPPG}
          sharedPositionalValuePerPPG={positionalValuePerPPG}
          sharedPlayerTradeValueDetailsMap={playerTradeValueDetailsMap}
          onSelect={result => addPlayer(pickerOpen.side, result)}
          onClose={() => setPickerOpen(null)}
        />
      )}

      {picksEnabled && pickerOpen?.type === 'pick' && (
        <TradePickPicker
          rosterId={pickerOpen.side === 'yours' ? myRosterData?.roster_id : partnerRosterId}
          rosterPicks={rosterPicks}
          slots={slots}
          picksEnabled={picksEnabled}
          rosters={rosters}
          ktcPlayers={adjustedKtcPlayers}
          leagueType={leagueType}
          pickValueMap={pickValueMap}
          currentSeason={season}
          league={league}
          drafts={leagueDrafts}
          excludeKeys={(pickerOpen.side === 'yours' ? yourPicks : theirPicks).map(p => p.key)}
          getUserDisplayName={getUserDisplayName}
          currentTotal={pickerOpen.side === 'yours' ? yourSide.total : theirSide.total}
          onSelect={pick => addPick(pickerOpen.side, pick)}
          onClose={() => setPickerOpen(null)}
        />
      )}

      {/* ── Roster browse modal — opened by "View Roster & Picks" button ── */}
      {rosterModalRosterId && (
        <RosterBrowseModal
          roster={rosterById.get(rosterModalRosterId)}
          partnerName={ownerNameByRosterId.get(rosterModalRosterId) ?? ''}
          sleeperPlayers={sleeperPlayers}
          adjustedKtcPlayers={adjustedKtcPlayers}
          adjustedDynastyKtcPlayers={adjustedDynastyKtcPlayers}
          leagueType={leagueType}
          rosterPicks={rosterPicks}
          slots={slots}
          season={season}
          league={league}
          drafts={leagueDrafts}
          pickValueMap={pickValueMap}
          rosters={rosters}
          ownerNameByRosterId={ownerNameByRosterId}
          seasonStats={valuationSeasonStats}
          scoringSettings={scoringSettings}
          positionalAvgPPG={positionalAvgPPG}
          positionalValuePerPPG={positionalValuePerPPG}
          rankMap={rankMap}
          playerTradeValueDetailsMap={playerTradeValueDetailsMap}
          theirPlayers={theirPlayers}
          theirPicks={theirPicks}
          theirSideItems={theirSide.items}
          mergedIDPMap={mergedIDPMap}
          hasIDP={hasIDP}
          hasDST={hasDST}
          onAddPlayer={id => addPlayer('theirs', { id, rosterId: rosterModalRosterId })}
          onAddPick={picksEnabled ? (pick => addPick('theirs', pick)) : () => {}}
          onClose={() => setRosterModalRosterId(null)}
        />
      )}

      {statsModal}

      {tradeShareRequest && (
        <TradeShareSheet
          snapshot={tradeShareRequest.snapshot}
          mode={tradeShareRequest.mode}
          onSubmit={submitTradeShare}
          onClose={closeTradeShare}
          submitting={tradeShareSubmitting}
          result={tradeShareResult}
          error={tradeShareError}
          viewerUserId={sleeperUser?.user_id}
          valueResolver={getTradeShareAssetValue}
          onOpenPlayer={openTradeSharePlayer}
          onOpenProposals={() => onViewChange?.('inbox')}
        />
      )}
    </div>
  );
}

function TradeValueAttribution({ format, leagueType, isAdjusted, onInfoClick, onDark = false }) {
  return (
    <>
      <span
        className="text-xs"
        data-testid="trade-value-attribution"
        style={{ color: onDark ? 'rgba(255,255,255,0.46)' : 'var(--color-label-quaternary)' }}
      >
        Values from{' '}
        <span className="font-medium" style={{ color: onDark ? 'rgba(255,255,255,0.68)' : 'var(--color-label-tertiary)' }}>KeepTradeCut</span>
        {' · '}{format === 'dynasty' ? 'Dynasty' : 'Redraft'}
        {' · '}{leagueType === 'sf' ? 'Superflex' : '1QB'}
        {isAdjusted && (
          <span style={{ color: 'var(--color-accent)' }}>{' · '}League-adjusted</span>
        )}
      </span>
      <button
        onClick={onInfoClick}
        className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
        style={{ background: onDark ? 'rgba(255,255,255,0.12)' : 'var(--color-fill)', color: onDark ? 'rgba(255,255,255,0.74)' : 'var(--color-label-tertiary)', pointerEvents: 'auto' }}
        aria-label="How values are calculated"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
        </svg>
      </button>
    </>
  );
}

// ── TrendRow ──────────────────────────────────────────────────────────────────

function TrendRow({ item, leagueType }) {
  const vals = leagueType === 'sf' ? item.ktcEntry?.superflexValues : item.ktcEntry?.oneQBValues;
  if (!vals) return null;

  const currentValue = vals.value ?? null;
  const trend7 = vals.overall7DayTrend ?? 0;
  const trendAll = vals.overallTrend ?? 0;

  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg"
      style={{ background: 'var(--color-fill)' }}>
      <span className="text-xs font-medium truncate" style={{ color: 'var(--color-label)' }}>
        {item.label}
      </span>
      <div className="flex gap-3 shrink-0">
        <TrendValue label="7d" value={trend7} currentValue={currentValue} />
        <TrendValue label="30d" value={trendAll} currentValue={currentValue} />
      </div>
    </div>
  );
}

function TrendValue({ label, value, currentValue }) {
  const color = value > 0 ? 'var(--color-accent-green, #22c55e)'
    : value < 0 ? 'var(--color-destructive, #ef4444)'
    : 'var(--color-label-quaternary)';
  const previousValue = currentValue != null ? currentValue - value : null;
  const pctChange = previousValue > 0 ? (value / previousValue) * 100 : null;
  const formattedValue = pctChange != null
    ? `${pctChange > 0 ? '+' : ''}${Math.abs(pctChange) < 10 ? pctChange.toFixed(1) : Math.round(pctChange)}%`
    : `${value > 0 ? '+' : ''}${value}`;

  return (
    <span className="text-xs tabular-nums" style={{ color }}>
      {label}: {formattedValue}
    </span>
  );
}
