// ── CompanionTrade ────────────────────────────────────────────────────────────
// Trade workflow: build and evaluate trade proposals using KTC values.
// Lives under the Trade section; uses Sleeper rosters and draft pick data.
//
// === FILE SECTIONS ===
// Line ~47:    Constants & team color helpers
// Line ~141:   CompanionTrade (main component — state, handlers, render)
// Line ~1488:  TradeSide (give/get column UI)
// Line ~1718:  ProposalPlayerCard (individual player/pick card)
// Line ~2248:  Proposal card layout utilities (sizing, equalized height)
// Line ~2499:  TradeProposalItem (single proposal row in lists)
// Line ~2802:  UpgradeResultGroup
// Line ~3027:  TradeProposalPanel (proposal list with filters)
// Line ~3243:  UpgradeFinderPage (upgrade search flow)
// Line ~3879:  ValueBar (trade fairness gauge)
// Line ~3944:  TrendRow (player trend indicators)
// Line ~3980:  ValuationInfoSheet (scoring multiplier breakdown)
// Line ~4538:  RosterBrowseModal (full roster picker overlay)
// Line ~4852:  Spinner

import { memo, useState, useEffect, useMemo, useCallback, useDeferredValue, useRef, useTransition } from 'react';
import { useSleeperLeague, useSleeperStats } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { fetchKtcPlayers, fmtKtcValue, computeKtcMultipliers, applyKtcMultipliers, productionAdjustedValue, findKtcPlayerFromSleeper } from '../../utils/ktcApi';
import { getTradedPicks, getLeagueDrafts } from '../../api/sleeperApi';
import {
  buildRosterPicks, getPicksForRoster,
  valueSide, evaluateTrade, suggestPackage, buildCandidatePool,
  computeRedraftPickValues, valueDraftPick,
} from '../../utils/tradeEngine';
import { TEAM_COLORS } from '../../data/teamColors';
import { calcPointsFromTotals } from '../../utils/scoringEngine';
import { formatScoringSettingValue } from '../../utils/scoringDisplay';
import { detectLeagueDefensiveType, normalizeIDPPos } from '../../utils/idpEngine';
import { buildPartnerTradeIntelligence, buildRosterOpportunityLayer, findLeagueWideUpgradeGroups } from '../../utils/opportunityEngine';
import { buildTradeAnalyticsSnapshot } from '../../utils/tradeAnalytics';
import { computeTradePlayerValueDetail } from '../../utils/tradeValue';
import { compareDraftPickAssets } from '../../utils/draftPickDisplay';
import TradeRosterPicker from './TradeRosterPicker';
import TradePickPicker from './TradePickPicker';
import UpgradeBargainingTable from './UpgradeBargainingTable';
import { buildUpgradeMoverSuggestions } from './upgradeMoverSuggestions';
import PlayerStatsModal from '../PlayerStatsModal';
import Modal from '../Modal';
import useCardGlow from '../../hooks/useCardGlow.jsx';
import useMediaQuery from '../../hooks/useMediaQuery.js';

const ROSTER_BROWSE_OFFENSE_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K']);

const UPGRADE_TRADE_POSTURES = [
  { level: 0, label: 'Underpay', description: 'Try to buy low' },
  { level: 1, label: 'Lean Under', description: 'Slight edge to me' },
  { level: 2, label: 'Fair', description: 'Close to even' },
  { level: 3, label: 'Lean Over', description: 'Pay a little extra' },
  { level: 4, label: 'Overpay', description: 'Pay up for the upgrade' },
];

const POSITION_COLORS = {
  QB: '#5AADFF',
  RB: '#2ED578',
  WR: '#FF8C1A',
  TE: '#F5B700',
  K: '#9CA3AF',
  DL: '#FF4433',
  LB: '#00C2A8',
  DB: '#C084FC',
  DEF: '#64748B',
};

// ── Team color helpers ────────────────────────────────────────────────────────

const SLEEPER_TEAM_MAP = {
  lar: 'la',
  was: 'wsh',
  jac: 'jax',
  lvr: 'lv',
};

function toTeamKey(sleeperTeam) {
  if (!sleeperTeam) return '';
  const lower = sleeperTeam.toLowerCase();
  return SLEEPER_TEAM_MAP[lower] ?? lower;
}

function normalizeRosterId(value) {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function hexLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#') || hex.length < 7) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function contrastRatio(hexA, hexB) {
  const luminanceA = hexLuminance(hexA);
  const luminanceB = hexLuminance(hexB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

function darkenHex(hex, factor) {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function mixHex(hexA, hexB, weight = 0.5) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return hexA;
  const clampedWeight = Math.min(1, Math.max(0, weight));
  const r = Math.round((a.r * (1 - clampedWeight)) + (b.r * clampedWeight));
  const g = Math.round((a.g * (1 - clampedWeight)) + (b.g * clampedWeight));
  const blue = Math.round((a.b * (1 - clampedWeight)) + (b.b * clampedWeight));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`;
}

function pickReadableForeground(stops = []) {
  const candidates = ['#FFFFFF', '#0C0F14'];
  return candidates
    .map((color) => ({
      color,
      worstContrast: Math.min(...stops.map((stop) => contrastRatio(color, stop))),
    }))
    .sort((a, b) => b.worstContrast - a.worstContrast)[0]?.color ?? '#FFFFFF';
}

function teamPalette(sleeperTeam, darkMode) {
  const key = toTeamKey(sleeperTeam);
  const palette = TEAM_COLORS[key] ?? null;
  if (!palette) {
    return {
      color: null,
      tint: null,
      borderColor: null,
      accentColor: null,
      logoBadgeBg: darkMode ? 'rgba(255,255,255,0.92)' : 'rgba(12,15,20,0.72)',
      logoBadgeBorder: darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(12,15,20,0.12)',
      isLight: false,
      logoKey: '',
    };
  }
  const color = darkMode ? palette.darkPrimary : palette.primary;
  const secondary = darkMode
    ? (palette.darkSecondary ?? palette.secondary ?? color)
    : (palette.secondary ?? color);
  const middle = mixHex(darkenHex(color, 0.72), secondary, 0.32);
  const gradientForeground = pickReadableForeground([
    color,
    middle,
    secondary,
    mixHex(color, middle, 0.5),
    mixHex(middle, secondary, 0.5),
  ]);
  const isLight = hexLuminance(color) > 0.35;
  const alpha = isLight ? '18' : '22';
  const borderColor = (!darkMode && isLight) ? darkenHex(color, 0.55) : color;
  const fallbackAccent = secondary;
  const accentSource = darkMode && hexLuminance(color) < 0.14 ? fallbackAccent : color;
  const accentColor = accentSource && hexLuminance(accentSource) < 0.18
    ? '#F2F1EC'
    : accentSource;
  const logoBadgeBg = darkMode
    ? 'rgba(255,255,255,0.92)'
    : 'rgba(12,15,20,0.76)';
  const logoBadgeBorder = darkMode
    ? `${accentColor ?? '#ffffff'}55`
    : 'rgba(12,15,20,0.12)';
  return {
    color,
    secondary,
    gradient: `linear-gradient(135deg, ${color} 0%, ${middle} 48%, ${secondary} 100%)`,
    gradientOverlay: darkMode
      ? 'linear-gradient(180deg, rgba(12,15,20,0.04) 0%, rgba(12,15,20,0.22) 100%)'
      : 'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(12,15,20,0.12) 100%)',
    gradientForeground,
    tint: `${color}${alpha}`,
    borderColor,
    accentColor,
    logoBadgeBg,
    logoBadgeBorder,
    isLight,
    logoKey: key,
  };
}

// Derive league format and type from Sleeper league settings
function detectLeagueFormat(league) {
  // Sleeper settings.type: 0 = redraft, 2 = dynasty/keeper
  const isDynasty = league?.settings?.type === 2;
  return isDynasty ? 'dynasty' : 'redraft';
}

function detectLeagueType(league) {
  // If roster_positions includes SUPER_FLEX, it's a superflex league
  const hasSF = (league?.roster_positions ?? []).includes('SUPER_FLEX');
  return hasSF ? 'sf' : '1qb';
}

/** True for IDP (DL/LB/DB sub-positions) or D/ST (DEF) players. */
function isIDPDSTPos(position) {
  return normalizeIDPPos(position) !== null || position === 'DEF';
}

function scheduleDeferredTradeTask(callback, timeout = 240) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const idleId = window.requestIdleCallback(() => callback(), { timeout });
    return () => window.cancelIdleCallback(idleId);
  }
  const timerId = window.setTimeout(callback, 0);
  return () => window.clearTimeout(timerId);
}

const TRADE_OPPORTUNITY_LAYER_CACHE_LIMIT = 8;
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
// ── Main component ───────────────────────────────────────────────────────────

export default function CompanionTrade({ initialPlayer, onConsumeInitialPlayer, view = 'agent', onViewChange, onViewPlayer, prewarmAnalytics = false }) {
  const {
    rosters, leagueUsers, myRoster,
    selectedLeagueId, league, season, getUserDisplayName,
    scoringSettings,
  } = useSleeperLeague();
  const {
    players: sleeperPlayers, seasonStats, weeklyStats,
    loadPlayers, loadSeasonStats, statsLoading, espnIdOverrides,
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

  // Trade partner
  const [partnerRosterId, setPartnerRosterId] = useState(null);

  // Trade contents
  const [yourPlayers, setYourPlayers]   = useState([]);   // sleeper IDs
  const [yourPicks, setYourPicks]       = useState([]);   // { year, round, fromRosterId, key }
  const [theirPlayers, setTheirPlayers] = useState([]);
  const [theirPicks, setTheirPicks]     = useState([]);

  // KTC data
  const [ktcPlayers, setKtcPlayers]             = useState(null);
  const [dynastyKtcPlayers, setDynastyKtcPlayers] = useState(null); // full dynasty list for fallback
  const [ktcLoading, setKtcLoading] = useState(false);
  const [ktcError, setKtcError]     = useState(null);

  // Draft picks data
  const [tradedPicks, setTradedPicks] = useState(null);
  const [leagueDrafts, setLeagueDrafts] = useState([]);
  const [draftRounds, setDraftRounds] = useState(null);

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
      getTradedPicks(selectedLeagueId).catch(() => []),
      getLeagueDrafts(selectedLeagueId).catch(() => []),
    ]).then(([picks, drafts]) => {
      setTradedPicks(picks ?? []);
      setLeagueDrafts(drafts ?? []);
      const maxFromDrafts = (drafts ?? []).reduce((max, d) => Math.max(max, d.settings?.rounds ?? 0), 0);
      setDraftRounds(maxFromDrafts || null);
    });
  }, [selectedLeagueId]);

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

  // Redraft pick values — derived from KTC player tier buckets rather than dynasty RDP entries.
  // null for dynasty leagues (KTC RDP values are used directly instead).
  const pickValueMap = useMemo(() => {
    if (format !== 'redraft' || !adjustedKtcPlayers?.length || !rosters?.length) return null;
    return computeRedraftPickValues(adjustedKtcPlayers, rosters.length, leagueType);
  }, [format, adjustedKtcPlayers, leagueType, rosters]);

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
    allowOutgoingPicks: upgradeAllowOutgoingPicks,
    allowIncomingPicks: upgradeAllowIncomingPicks,
  }), [
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

  // Enrich a valueSide result: apply production adjustment to player vals, scale picks by leagueAvgMult
  function enrichItems(side) {
    if (!side.items.length) return side;
    const enriched = side.items.map(it => {
      if (it.type === 'pick') {
        const adjVal = it.val != null ? Math.round(it.val * leagueAvgMult) : it.val;
        return { ...it, adjVal };
      }
      const sharedTradeValueDetail = playerTradeValueDetailsMap?.get(it.id) ?? null;
      const ktcEntry = it.ktcEntry ?? findKtcPlayerFromSleeper(it.id, sleeperPlayers, adjustedKtcPlayers ?? []);
      const fallbackTradeValueDetail = sharedTradeValueDetail ?? computeTradePlayerValueDetail({
        id: it.id,
        players: sleeperPlayers,
        adjustedKtcPlayers,
        adjustedDynastyKtcPlayers,
        leagueType,
        seasonStats,
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
  const suggestionBasePools = useMemo(() => {
    if (!showTradeBuilder || !adjustedKtcPlayers || !myRosterData?.roster_id || !partnerRosterId) return null;

    const dynFallbackOpts = {
      dynastyKtcPlayers: adjustedDynastyKtcPlayers,
      seasonStats,
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
    seasonStats,
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
    if (side === 'yours') setYourPicks(prev => [...prev, pick]);
    else setTheirPicks(prev => [...prev, pick]);
    setSuggestions(null);
  }, []);

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
    setYourPicks((proposal.outgoingAssets ?? []).filter((asset) => asset.type === 'pick' && asset.pickData).map((asset) => asset.pickData));
    setTheirPlayers((proposal.incomingAssets ?? []).filter((asset) => asset.type === 'player').map((asset) => asset.id));
      setTheirPicks((proposal.incomingAssets ?? []).filter((asset) => asset.type === 'pick' && asset.pickData).map((asset) => asset.pickData));
      setSuggestions(null);
    });
    onViewChange?.('agent');
  }, [onViewChange, startPartnerSwitchTransition]);

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
        } else if (item.pickData) {
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
        } else {
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
  }, []);

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
          allowOutgoingPicks={upgradeAllowOutgoingPicks}
          allowIncomingPicks={upgradeAllowIncomingPicks}
          results={upgradeSearchResults}
          postureOptions={UPGRADE_TRADE_POSTURES}
          darkMode={darkMode}
          seasonStats={seasonStats}
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
          onAllowOutgoingPicksChange={setUpgradeAllowOutgoingPicks}
          onAllowIncomingPicksChange={setUpgradeAllowIncomingPicks}
          onAllowPackagesChange={setUpgradeAllowPackages}
          onTradePostureChange={setUpgradeTradePostureLevel}
          onRunSearch={runUpgradeFinderSearch}
          onApplyProposal={applyTradeProposal}
          onOpenPlayer={openStatsModalForPlayer}
          onBack={() => onViewChange?.('agent')}
        />
        {statsModal}
      </>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="pb-8">

      {showAgent ? (
        <>
          {/* ── Desktop: shelf rail + main column ──────────────────────── */}
          {/* Shared shelf drop handler: routing follows the shelf tab context */}
          {(() => {
            const handleShelfDrop = drag => {
              if (!drag) return;
              if (drag.type === 'player') {
                if (drag.shelfTab === 'yours') addPlayer('yours', drag.id);
                else if (partnerRosterId) addPlayer('theirs', { id: drag.id, rosterId: partnerRosterId });
              } else if (drag.type === 'pick' && drag.pickData) {
                if (drag.shelfTab === 'yours') addPick('yours', drag.pickData);
                else addPick('theirs', drag.pickData);
              }
            };
            const sharedShelfProps = {
              myPlayers: myRosterData?.players ?? [],
              partnerPlayers: partnerRosterId ? (rosterById.get(partnerRosterId)?.players ?? []) : [],
              yourTradePlayers: yourPlayers,
              theirTradePlayers: theirPlayers,
              sleeperPlayers,
              playerTradeValueMap,
              myName: getUserDisplayName(myRosterData?.owner_id ?? ''),
              partnerName: partnerRosterId ? (ownerNameByRosterId.get(partnerRosterId) ?? 'Select Partner') : 'Select Partner',
              hasPartner: !!partnerRosterId,
              onAddToYours: id => addPlayer('yours', id),
              onAddToTheirs: id => partnerRosterId ? addPlayer('theirs', { id, rosterId: partnerRosterId }) : null,
              rosterPicks,
              slots,
              myRosterId: myRosterData?.roster_id,
              partnerRosterId,
              yourTradePicks: yourPicks,
              theirTradePicks: theirPicks,
              onAddPickToYours: pick => addPick('yours', pick),
              onAddPickToTheirs: pick => addPick('theirs', pick),
              league,
              myAvatar: leagueUserById.get(myRosterData?.owner_id ?? '')?.avatar ?? null,
              partnerAvatar: partnerRosterId
                ? (leagueUserById.get(rosterById.get(partnerRosterId)?.owner_id ?? '')?.avatar ?? null)
                : null,
              partnerRosters,
              onPartnerChange: id => {
                if (!id) { switchPartnerTradeContext(null); return; }
                if (id !== partnerRosterId) switchPartnerTradeContext(id);
              },
            };
            const sharedPlateProps = { shelfDragRef, onDropFromShelf: handleShelfDrop };
            const colorCommentary = hasItems
              ? getColorCommentary(verdict.verdict, verdict.gap, ownerNameByRosterId.get(partnerRosterId) ?? null)
              : null;
            const SUGGEST_ACTION_META = {
              add:    { label: 'ADD',    bg: '#22c55e22', color: '#22c55e' },
              remove: { label: 'REMOVE', bg: '#f59e0b22', color: '#f59e0b' },
              swap:   { label: 'SWAP',   bg: 'rgba(90,173,255,0.13)', color: '#5AADFF' },
            };
            const suggestBlock = (
              <>
                {hasItems && verdict.verdict !== 'fair' && verdict.gap > 0 && (
                  <div style={{ borderTop: '1px solid var(--color-separator)', padding: '10px 14px', display: 'flex', justifyContent: 'center' }}>
                    <button
                      onClick={handleSuggest}
                      className="py-2 px-4 font-semibold"
                      style={{ fontSize: 13, borderRadius: 8, background: 'var(--color-signature)', color: 'var(--color-signature-fg)', border: 0, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      Suggest Adjustment
                    </button>
                  </div>
                )}
                {suggestions && suggestions.options.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--color-separator)', padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-display,'Barlow Condensed',sans-serif)", fontWeight: 700, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-label-quaternary)' }}>SUGGESTIONS</span>
                    {suggestions.options.map((opt, i) => {
                      const absRemaining = Math.abs(opt.newGap);
                      const isNearEven = absRemaining < verdict.gap * 0.05;
                      const currentSurplusSide = opt.newGap > 0
                        ? (suggestions.deficitSide === 'yours' ? 'theirs' : 'yours')
                        : suggestions.deficitSide;
                      const favoredLabel = currentSurplusSide === 'theirs' ? 'You' : 'Them';
                      const remainingLabel = isNearEven ? 'Near-even trade' : `Favors ${favoredLabel} · ${fmtKtcValue(absRemaining)}`;
                      const smeta = SUGGEST_ACTION_META[opt.action] ?? SUGGEST_ACTION_META.add;
                      let descLine;
                      if (opt.action === 'add') descLine = `Add to ${opt.side === 'yours' ? 'Your' : 'Their'} Side: ${opt.items.map(it => it.label).join(' + ')}`;
                      else if (opt.action === 'remove') descLine = `Remove from ${opt.side === 'yours' ? 'Your' : 'Their'} Side: ${opt.items[0]?.label}`;
                      else descLine = `${opt.side === 'yours' ? 'Your' : 'Their'} Side: ${opt.remove?.label} → ${opt.add?.label}`;
                      return (
                        <div key={i} className="rounded-lg px-3 py-2.5 flex items-center justify-between gap-2" style={{ background: 'var(--color-fill)' }}>
                          <div className="flex-1 min-w-0 flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold px-1.5 py-0.5 rounded tracking-widest shrink-0" style={{ fontSize: 10, background: smeta.bg, color: smeta.color }}>{smeta.label}</span>
                              <span className="font-medium truncate" style={{ fontSize: 13, color: 'var(--color-label)' }}>{descLine}</span>
                            </div>
                            <span className="tabular-nums" style={{ fontSize: 12, color: 'var(--color-label-quaternary)' }}>{remainingLabel}</span>
                          </div>
                          <button onClick={() => applySuggestion(opt)} className="shrink-0 px-3 py-1.5 rounded-lg font-semibold"
                            style={{ fontSize: 13, background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}>
                            Apply
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {suggestions && suggestions.options.length === 0 && (
                  <div style={{ borderTop: '1px solid var(--color-separator)', padding: '10px 14px', fontSize: 12, textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                    No combinations found to close the gap.
                  </div>
                )}
              </>
            );
            return (
              <>
                {/* ── Desktop: shelf rail + main column ───────────────── */}
                <div className="hidden lg:flex" style={{ alignItems: 'flex-start' }}>
                  <RosterShelf {...sharedShelfProps} shelfDragRef={shelfDragRef} />
                  <div className="flex-1 min-w-0 flex flex-col">
                    <BroadcastScoreboard
                      yourTotal={yourSide.total}
                      theirTotal={theirSide.total}
                      yourName={getUserDisplayName(myRosterData?.owner_id ?? '')}
                      yourAvatar={leagueUserById.get(myRosterData?.owner_id ?? '')?.avatar ?? null}
                      partnerName={partnerRosterId ? (ownerNameByRosterId.get(partnerRosterId) ?? null) : null}
                      partnerAvatar={partnerRosterId
                        ? (leagueUserById.get(rosterById.get(partnerRosterId)?.owner_id ?? '')?.avatar ?? null)
                        : null}
                      verdict={verdict}
                      hasItems={hasItems}
                      onClear={clearTrade}
                    />
                    {!ktcLoading && !ktcError ? (
                      <>
                        <div className="trade-plates-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
                          <TradePlate
                            side="yours"
                            items={yourSide.items}
                            total={yourSide.total}
                            onRemovePlayer={id => removePlayer('yours', id)}
                            onRemovePick={key => removePick('yours', key)}
                            onAddPlayer={() => setPickerOpen({ side: 'yours', type: 'player' })}
                            onAddPick={() => setPickerOpen({ side: 'yours', type: 'pick' })}
                            onOpenPlayer={openStatsModalForPlayer}
                            {...sharedPlateProps}
                          />
                          <TradePlate
                            side="theirs"
                            items={theirSide.items}
                            total={theirSide.total}
                            onRemovePlayer={id => removePlayer('theirs', id)}
                            onRemovePick={key => removePick('theirs', key)}
                            onAddPlayer={() => setPickerOpen({ side: 'theirs', type: 'player', allRosters: !partnerRosterId })}
                            onAddPick={partnerRosterId ? () => setPickerOpen({ side: 'theirs', type: 'pick' }) : null}
                            onOpenPlayer={openStatsModalForPlayer}
                            {...sharedPlateProps}
                          />
                        </div>
                        {colorCommentary && (
                          <div style={{ borderTop: '1px solid var(--color-separator)', padding: '10px 14px', background: 'var(--color-bg-secondary)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            <span style={{ fontFamily: "var(--font-display, 'Barlow Condensed', sans-serif)", fontWeight: 700, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-label-quaternary)', paddingTop: 2, flexShrink: 0 }}>COLOR COMMENTARY</span>
                            <span style={{ fontSize: 14, lineHeight: 1.4, color: 'var(--color-label)', fontStyle: 'italic' }}>"{colorCommentary}"</span>
                          </div>
                        )}
                        {suggestBlock}
                      </>
                    ) : (
                      <div className="mx-4 mt-4 rounded-xl px-4 py-4 flex flex-col gap-1.5" style={{ background: 'var(--color-fill)' }}>
                        {ktcLoading ? (
                          <div className="flex items-center gap-2.5">
                            <Spinner />
                            <span className="text-sm font-medium" style={{ color: 'var(--color-label-secondary)' }}>Loading trade values…</span>
                          </div>
                        ) : (
                          <>
                            <span className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>Trade values unavailable</span>
                            <span className="text-xs leading-relaxed" style={{ color: 'var(--color-label-tertiary)' }}>
                              The KeepTradeCut proxy could not be reached. Trade values require the nginx proxy in production.
                            </span>
                            <span className="text-xs font-mono mt-1" style={{ color: 'var(--color-label-quaternary)' }}>{ktcError}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Mobile: vertical stack ───────────────────────── */}
                <div className="lg:hidden flex flex-col">
                  <BroadcastScoreboard
                    yourTotal={yourSide.total}
                    theirTotal={theirSide.total}
                    yourName={getUserDisplayName(myRosterData?.owner_id ?? '')}
                    yourAvatar={leagueUserById.get(myRosterData?.owner_id ?? '')?.avatar ?? null}
                    partnerName={partnerRosterId ? (ownerNameByRosterId.get(partnerRosterId) ?? null) : null}
                    partnerAvatar={partnerRosterId
                      ? (leagueUserById.get(rosterById.get(partnerRosterId)?.owner_id ?? '')?.avatar ?? null)
                      : null}
                    verdict={verdict}
                    hasItems={hasItems}
                    onClear={clearTrade}
                  />
                  {!ktcLoading && !ktcError ? (
                    <>
                      <TradePlate
                        side="yours"
                        items={yourSide.items}
                        total={yourSide.total}
                        onRemovePlayer={id => removePlayer('yours', id)}
                        onRemovePick={key => removePick('yours', key)}
                        onAddPlayer={() => setPickerOpen({ side: 'yours', type: 'player' })}
                        onAddPick={() => setPickerOpen({ side: 'yours', type: 'pick' })}
                        onOpenPlayer={openStatsModalForPlayer}
                        {...sharedPlateProps}
                      />
                      <TradePlate
                        side="theirs"
                        items={theirSide.items}
                        total={theirSide.total}
                        onRemovePlayer={id => removePlayer('theirs', id)}
                        onRemovePick={key => removePick('theirs', key)}
                        onAddPlayer={() => setPickerOpen({ side: 'theirs', type: 'player', allRosters: !partnerRosterId })}
                        onAddPick={partnerRosterId ? () => setPickerOpen({ side: 'theirs', type: 'pick' }) : null}
                        onOpenPlayer={openStatsModalForPlayer}
                        {...sharedPlateProps}
                      />
                      {colorCommentary && (
                        <div style={{ borderTop: '1px solid var(--color-separator)', padding: '10px 14px', background: 'var(--color-bg-secondary)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <span style={{ fontFamily: "var(--font-display, 'Barlow Condensed', sans-serif)", fontWeight: 700, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-label-quaternary)', paddingTop: 2, flexShrink: 0 }}>COLOR COMMENTARY</span>
                          <span style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--color-label)', fontStyle: 'italic' }}>"{colorCommentary}"</span>
                        </div>
                      )}
                      {suggestBlock}
                      <MobileRosterShelf {...sharedShelfProps} />
                    </>
                  ) : (
                    <div className="mx-4 mt-4 rounded-xl px-4 py-4 flex flex-col gap-1.5" style={{ background: 'var(--color-fill)' }}>
                      {ktcLoading ? (
                        <div className="flex items-center gap-2.5">
                          <Spinner />
                          <span className="text-sm font-medium" style={{ color: 'var(--color-label-secondary)' }}>Loading trade values…</span>
                        </div>
                      ) : (
                        <>
                          <span className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>Trade values unavailable</span>
                          <span className="text-xs font-mono mt-1" style={{ color: 'var(--color-label-quaternary)' }}>{ktcError}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </>
            );
          })()}

          {/* ── Search all rostered players (mobile only) ───────────────── */}
          {!ktcLoading && !ktcError && (
            <div className="lg:hidden px-4 mt-3">
              <button
                onClick={() => setPickerOpen({ side: 'theirs', type: 'player', allRosters: true })}
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
              tradeProposals={tradeProposals}
              surplusTradeProposals={surplusTradeProposals}
              activeMode={tradeProposalMode}
              proposalFilters={proposalFilters}
              onProposalFiltersChange={setProposalFilters}
              onModeChange={setTradeProposalMode}
              onApplyProposal={applyTradeProposal}
              onOpenPlayer={openStatsModalForPlayer}
              isPreparingPartner={isTradeIntelligencePreparingPartner}
              isShowingStaleResults={isTradeIntelligenceShowingStaleResults}
            />
          )}
        </div>
      ) : null}

      {showAgent && (
        <>
          <div className="lg:hidden px-4 pt-6 pb-2 flex items-center justify-center gap-1.5">
            <TradeValueAttribution
              format={format}
              leagueType={leagueType}
              isAdjusted={isAdjusted}
              onInfoClick={() => setShowValInfo(true)}
            />
          </div>
          <div
            className="hidden lg:flex items-center justify-end gap-1.5"
            style={{ position: 'fixed', right: 24, bottom: 14, zIndex: 20, pointerEvents: 'none' }}
          >
            <TradeValueAttribution
              format={format}
              leagueType={leagueType}
              isAdjusted={isAdjusted}
              onInfoClick={() => setShowValInfo(true)}
            />
          </div>
        </>
      )}

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
          seasonStats={seasonStats}
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

      {pickerOpen?.type === 'pick' && (
        <TradePickPicker
          rosterId={pickerOpen.side === 'yours' ? myRosterData?.roster_id : partnerRosterId}
          rosterPicks={rosterPicks}
          slots={slots}
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
          seasonStats={seasonStats}
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
          onAddPick={pick => addPick('theirs', pick)}
          onClose={() => setRosterModalRosterId(null)}
        />
      )}

      {statsModal}
    </div>
  );
}

function TradeValueAttribution({ format, leagueType, isAdjusted, onInfoClick }) {
  return (
    <>
      <span className="text-xs" style={{ color: 'var(--color-label-quaternary)', pointerEvents: 'auto' }}>
        Values from{' '}
        <span className="font-medium" style={{ color: 'var(--color-label-tertiary)' }}>KeepTradeCut</span>
        {' · '}{format === 'dynasty' ? 'Dynasty' : 'Redraft'}
        {' · '}{leagueType === 'sf' ? 'Superflex' : '1QB'}
        {isAdjusted && (
          <span style={{ color: 'var(--color-accent)' }}>{' · '}League-adjusted</span>
        )}
      </span>
      <button
        onClick={onInfoClick}
        className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
        style={{ background: 'var(--color-fill)', color: 'var(--color-label-tertiary)', pointerEvents: 'auto' }}
        aria-label="How values are calculated"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
        </svg>
      </button>
    </>
  );
}

function getTradeAssetMetaSegments(item) {
  if (item.type === 'pick') {
    const segments = [
      item.year,
      item.round != null ? `Round ${item.round}` : null,
      item.pickNumberLabel ?? item.pickRangeLabel,
      item.quality,
    ];
    if (item.cardMetaLabel && item.pickRangeLabel && item.cardMetaLabel !== item.pickRangeLabel) {
      segments.push(`${item.cardMetaLabel}: ${item.pickRangeLabel}`);
    }
    return segments.filter(Boolean);
  }

  const segments = [
    [item.position, item.team].filter(Boolean).join(' · '),
    item.rankInfo ? `#${item.rankInfo.rank} ${item.rankInfo.posLabel}` : null,
    item.avgPPG != null ? `${item.avgPPG.toFixed(1)} avg` : null,
    item.dynastyFallback ? 'DYN est.' : item.idpFallback ? 'est.' : null,
  ];
  return segments.filter(Boolean);
}

function getTradePositionColor(position) {
  const normalized = normalizeIDPPos(position) ?? String(position ?? '').toUpperCase();
  return POSITION_COLORS[normalized] ?? null;
}

function TradeSideAssetRow({ item, palette, darkMode, onOpenPlayer, onRemove }) {
  const [isHovered, setIsHovered] = useState(false);
  const isInteractive = item.type === 'player' && !!onOpenPlayer;
  const hasTeamGradient = item.type === 'player' && palette?.gradient;
  const accentColor = palette?.borderColor ?? (item.type === 'pick' ? 'var(--color-signature)' : 'var(--color-accent)');
  const rowBg = hasTeamGradient ? palette.gradient : (palette?.tint ?? 'var(--color-fill)');
  const hoverBg = palette?.color ? `${palette.color}${palette.isLight ? '2e' : '34'}` : 'var(--color-fill-secondary)';
  const rowForeground = hasTeamGradient ? palette.gradientForeground : 'var(--color-label)';
  const rowMuted = hasTeamGradient
    ? (rowForeground === '#FFFFFF' ? 'rgba(255,255,255,0.70)' : 'rgba(12,15,20,0.64)')
    : 'var(--color-label-secondary)';
  const rowSubtle = hasTeamGradient
    ? (rowForeground === '#FFFFFF' ? 'rgba(255,255,255,0.16)' : 'rgba(12,15,20,0.12)')
    : 'var(--color-fill-secondary)';
  const metaSegments = getTradeAssetMetaSegments(item);
  const value = item.adjVal ?? item.val;
  const valueIsEstimated = item.dynastyFallback || item.idpFallback;
  const rowTitle = [item.label, ...metaSegments, `Value ${fmtKtcValue(value)}`].join(' · ');
  const posColor = item.type === 'player' ? getTradePositionColor(item.position) : null;
  const posTextColor = posColor && hexLuminance(posColor) > 0.42 ? '#0C0F14' : '#FFFFFF';
  const valueKicker = item.type === 'player' && item.avgPPG != null ? `${item.avgPPG.toFixed(1)} avg` : 'Value';
  const { glowHandlers, borderOverlay, glowShadow } = useCardGlow({
    enabled: isHovered,
    color: accentColor,
    cardColor: palette?.color ?? null,
    darkMode,
    coreColor: darkMode ? '#FFFFFF' : null,
    outerColor: accentColor,
  });
  const baseShadow = isHovered
    ? '0 5px 12px rgba(12,15,20,0.09)'
    : 'none';
  const rowShadow = glowShadow ? `${glowShadow}, ${baseShadow}` : baseShadow;

  return (
    <div
      className={`trade-selection-row${isInteractive ? ' is-interactive' : ''}`}
      style={{
        background: isHovered && !hasTeamGradient ? hoverBg : rowBg,
        '--trade-selection-accent': accentColor,
        '--trade-selection-fg': rowForeground,
        '--trade-selection-muted': rowMuted,
        '--trade-selection-subtle': rowSubtle,
        boxShadow: rowShadow,
        transition: 'background 150ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 200ms cubic-bezier(0.32, 0.72, 0, 1)',
        cursor: isInteractive ? 'pointer' : undefined,
      }}
      onClick={isInteractive ? () => onOpenPlayer(item) : undefined}
      onMouseMove={isInteractive ? glowHandlers.onMouseMove : undefined}
      onMouseEnter={(event) => {
        setIsHovered(true);
        glowHandlers.onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        setIsHovered(false);
        glowHandlers.onMouseLeave?.(event);
      }}
      onFocus={(event) => {
        setIsHovered(true);
        glowHandlers.onMouseEnter?.(event);
      }}
      onBlur={(event) => {
        setIsHovered(false);
        glowHandlers.onMouseLeave?.(event);
      }}
      onKeyDown={isInteractive ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenPlayer(item);
        }
      } : undefined}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      title={rowTitle}
      aria-label={isInteractive ? `Open player stats for ${item.label}` : undefined}
    >
      {borderOverlay}
      {hasTeamGradient && (
        <div
          className="trade-selection-row__gradient-overlay"
          style={{ background: palette.gradientOverlay }}
          aria-hidden="true"
        />
      )}
      <span
        className="trade-selection-row__select-mark"
        style={{
          background: 'var(--color-signature)',
          borderColor: 'var(--color-signature)',
          color: 'var(--color-signature-fg)',
        }}
        aria-hidden="true"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      {item.type === 'player' && (
        <img src={`https://sleepercdn.com/content/nfl/players/thumb/${item.id}.jpg`}
          alt="" className="trade-selection-row__avatar"
          loading="eager"
          decoding="async"
          onError={e => { e.target.style.display = 'none'; }} />
      )}
      {item.type === 'pick' && (
        <div className="trade-selection-row__pick-mark">
          PICK
        </div>
      )}
      {item.type === 'player' && (
        <span
          className="trade-selection-row__position"
          style={{
            background: posColor ?? rowSubtle,
            color: posColor ? posTextColor : rowForeground,
            boxShadow: posColor ? '0 4px 10px rgba(0,0,0,0.16)' : 'none',
          }}
        >
          {item.position || '—'}
        </span>
      )}
      <div className="trade-selection-row__body">
        <div
          className="trade-selection-row__identity"
          style={{ color: rowForeground }}
        >
          {item.label}
        </div>
        {metaSegments.length > 0 && (
          <div className="trade-selection-row__meta">
            <span className="trade-selection-row__meta-prefix">{item.type === 'pick' ? 'Draft Asset' : 'Player'}</span>
            {metaSegments.map((segment) => (
              <span key={segment} className="trade-selection-row__meta-item">{segment}</span>
            ))}
          </div>
        )}
      </div>
      {item.type === 'player' && palette?.logoKey ? (
        <img
          src={`https://a.espncdn.com/i/teamlogos/nfl/500/${palette.logoKey}.png`}
          aria-hidden="true"
          className="trade-selection-row__team-logo"
          loading="eager"
          decoding="async"
          onError={e => { e.target.style.display = 'none'; }}
        />
      ) : item.type === 'player' ? (
        <span className="trade-selection-row__team-logo-spacer" aria-hidden="true" />
      ) : null}
      <div className="trade-selection-row__value">
        <span className="trade-selection-row__value-kicker">{valueKicker}</span>
        <span
          className="trade-selection-row__value-number"
          title={item.idpFallback ? 'Estimated from season production (no KTC data)' : undefined}
        >
          {valueIsEstimated ? '~' : ''}{fmtKtcValue(value)}
        </span>
      </div>
      <button onClick={(event) => { event.stopPropagation(); onRemove(); }}
        className="trade-selection-row__remove"
        aria-label={`Remove ${item.label}`}>
        ×
      </button>
    </div>
  );
}

// ── getColorCommentary ─────────────────────────────────────────────────────────
// ── ShelfPartnerTab ────────────────────────────────────────────────────────────
function ShelfPartnerTab({ partnerRosters, value, onChange, label, active, disabled, onActivate, buttonStyle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const df = "var(--font-display, 'Barlow Condensed', sans-serif)";

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = partnerRosters.find(r => r.roster.roster_id === value) ?? null;

  const Avatar = ({ hash, name, size = 22 }) => hash ? (
    <img src={`https://sleepercdn.com/avatars/thumbs/${hash}`} alt={name}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      onError={e => { e.target.style.display = 'none'; }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--color-fill-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.45, fontWeight: 700, color: 'var(--color-label-secondary)', flexShrink: 0 }}>
      {name?.[0]?.toUpperCase()}
    </div>
  );

  return (
      <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <button
          type="button"
          onClick={() => {
            if (!disabled) setOpen(v => !v);
          }}
          style={{
            ...buttonStyle,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            cursor: disabled ? 'default' : 'pointer',
            opacity: disabled ? 0.55 : 1,
          }}
        >
          {selected ? (
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selected.displayName}
              </span>
          ) : (
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label || 'Select Partner'}</span>
          )}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={active ? 'currentColor' : 'var(--color-label-tertiary)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 5px)', right: 0, zIndex: 50,
            width: 280, maxWidth: 'calc(100vw - 28px)',
            background: 'var(--color-bg-secondary)', border: '1px solid var(--color-separator)',
            borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1)',
            overflow: 'hidden', maxHeight: 360, overflowY: 'auto',
          }}>
            {/* Clear option */}
            {value && (
              <button
                onClick={() => { onChange(null); onActivate?.(); setOpen(false); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', background: 'transparent', border: 0, borderBottom: '1px solid var(--color-separator)', cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px dashed var(--color-separator)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-label-tertiary)', fontFamily: df, letterSpacing: '0.06em' }}>CLEAR PARTNER</span>
              </button>
            )}
            {partnerRosters.map(({ roster, displayName, avatarHash }) => {
              const isSelected = roster.roster_id === value;
              return (
                <button
                  key={roster.roster_id}
                  onClick={() => { onChange(roster.roster_id); onActivate?.(); setOpen(false); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px',
                    background: isSelected ? 'var(--color-fill)' : 'transparent',
                    border: 0, borderBottom: '1px solid var(--color-separator)', cursor: 'pointer', textAlign: 'left',
                    transition: 'background 100ms',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--color-fill-secondary)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  <Avatar hash={avatarHash} name={displayName} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--color-label)' : 'var(--color-label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayName}
                  </span>
                  {isSelected && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-signature)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
  );
}

function getColorCommentary(verdict, gap, partnerName) {
  if (!gap) return null;
  const pn = partnerName || 'your partner';
  const stablePick = (arr) => {
    const key = `${verdict}:${Math.round(gap / 25)}:${pn}`;
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) {
      hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    }
    return arr[Math.abs(hash) % arr.length];
  };

  if (verdict === 'fair') return stablePick([
    `Straight swap — values are close. Pull the trigger.`,
    `Both sides are roughly even. Hard to argue either way.`,
    `Balanced deal. If both managers like it, there's no wrong answer.`,
    `Numbers say this is fair. Now it comes down to fit.`,
    `Close enough to call it even. League won't bat an eye.`,
    `This one's a wash on paper. Go with your gut.`,
    `Fairly valued on both sides. The tiebreaker is roster need.`,
    `Value neutral. If you want the players, do it.`,
  ]);

  if (verdict === 'favors_you') return stablePick([
    `You're getting the better end here. ${pn} might push back.`,
    `The value tilts your way. Don't be surprised if ${pn} counters.`,
    `You're winning this trade on paper. ${pn} may want something added.`,
    `Looks good for you. ${pn} is leaving some value on the table.`,
    `Smart get — you're coming out ahead. See if ${pn} bites.`,
    `The numbers favor you. Send it before they change their mind.`,
    `You're extracting more than you're giving up here.`,
    `${pn} is undervaluing their side. Take advantage if they're willing.`,
    `Nice return for you. ${pn} may be overrating what they're getting.`,
    `Favorable gap. If ${pn} accepts as-is, that's a win for your roster.`,
  ]);

  if (verdict === 'favors_them') return stablePick([
    `You're giving up more than you're getting. Try sweetening your side.`,
    `The value gap goes ${pn}'s way. Adjust the package before sending.`,
    `You're overpaying here. Consider trimming their side or adding from yours.`,
    `${pn} is getting the better end. Think about what you could pull back.`,
    `This deal currently favors ${pn}. Rebalance before you lock it in.`,
    `You're leaving value on the table. Don't finalize without tweaking.`,
    `The numbers say you're giving up too much. Revisit the terms.`,
    `${pn} comes out ahead on this one. Worth renegotiating.`,
    `Losing trade as constructed. Either add to your return or trim the cost.`,
    `Gap isn't in your favor. See if ${pn} will accept less from you.`,
  ]);

  return null;
}

// ── BroadcastScoreboard ────────────────────────────────────────────────────────
function BroadcastScoreboard({ yourTotal, theirTotal, yourName, yourAvatar, partnerName, partnerAvatar, verdict, hasItems, onClear }) {
  const { verdict: v, pct = 0, gap = 0 } = verdict;
  const sign = v === 'favors_you' ? 1 : v === 'favors_them' ? -1 : 0;
  const angleDeg = hasItems ? sign * Math.min((pct / 100) * 72, 72) : 0;
  const angleRad = (angleDeg * Math.PI) / 180;
  const cx = 110; const cy = 112;
  const needleX = cx + 66 * Math.sin(angleRad);
  const needleY = cy - 66 * Math.cos(angleRad);
  const arcLen = 260;
  const amberLen = Math.max(0, Math.min(((90 + angleDeg) / 180) * arcLen, arcLen));
  const verdictText = !hasItems
    ? 'Build Trade'
    : v === 'fair'
      ? 'Fair Deal'
      : v === 'favors_you'
        ? 'Favors You'
        : 'Favors Them';
  const verdictFill = !hasItems ? 'rgba(255,255,255,0.52)' : v === 'fair' ? '#F5B700' : v === 'favors_you' ? '#22c55e' : '#ef4444';
  const detailText = !hasItems
    ? 'Add players or picks to compare values'
    : v === 'fair'
      ? 'Trade values are balanced'
      : `${fmtKtcValue(gap)} gap · ${pct}% ${v === 'favors_you' ? 'your way' : 'their way'}`;
  const df = "var(--font-display, 'Barlow Condensed', sans-serif)";
  const ticks = [-64, 0, 64].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    return {
      x1: cx + 76 * Math.sin(rad),
      y1: cy - 76 * Math.cos(rad),
      x2: cx + 83 * Math.sin(rad),
      y2: cy - 83 * Math.cos(rad),
      emphasis: deg === 0,
    };
  });
  const Avatar = ({ hash, name, align = 'left' }) => hash ? (
    <img
      src={`https://sleepercdn.com/avatars/thumbs/${hash}`}
      alt=""
      style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(255,255,255,0.18)' }}
      onError={e => { e.target.style.display = 'none'; }}
    />
  ) : (
    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.62)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {(name || (align === 'right' ? 'P' : 'Y'))[0]?.toUpperCase()}
    </div>
  );
  const TeamBlock = ({ name, total, avatar, align = 'left' }) => (
    <div className={`trade-scoreboard__team trade-scoreboard__team--${align}`} style={{ display: 'flex', alignItems: 'center', justifyContent: align === 'right' ? 'flex-end' : 'flex-start', gap: 10, minWidth: 0 }}>
      {align === 'left' && <Avatar hash={avatar} name={name} align={align} />}
      <div className="trade-scoreboard__team-copy" style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'right' ? 'flex-end' : 'flex-start', gap: 2, minWidth: 0, textAlign: align === 'right' ? 'right' : 'left' }}>
        <span className="trade-scoreboard__team-name" style={{ fontFamily: "'Figtree', sans-serif", fontWeight: 700, fontSize: 14, lineHeight: 1.1, color: 'rgba(255,255,255,0.78)', maxWidth: 210, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        <span className="trade-scoreboard__team-total" style={{ fontFamily: df, fontWeight: 800, fontSize: 40, lineHeight: 0.92, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', color: '#fff' }}>
          {hasItems ? fmtKtcValue(total) : '0'}
        </span>
      </div>
      {align === 'right' && <Avatar hash={avatar} name={name} align={align} />}
    </div>
  );

  return (
    <div className="trade-scoreboard" style={{ background: '#0D1117', color: 'white', padding: '8px 20px 12px', flexShrink: 0, position: 'relative' }}>
      <div style={{ minHeight: 24, marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
        {hasItems ? (
          <button onClick={onClear} style={{ fontFamily: df, fontSize: 11, letterSpacing: '0.12em', color: '#F5B700', background: 'none', border: 0, cursor: 'pointer', fontWeight: 700, padding: '4px 0', textTransform: 'uppercase' }}>
            CLEAR
          </button>
        ) : <span aria-hidden="true" />}
      </div>
      <div className="trade-scoreboard__grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', gap: 24, alignItems: 'center' }}>
        <TeamBlock name={yourName || 'You'} total={yourTotal} avatar={yourAvatar} />
        <div className="trade-scoreboard__meter" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
          <div className="trade-scoreboard__verdict" style={{ textAlign: 'center', marginBottom: -8, minHeight: 34 }}>
            <div className="trade-scoreboard__verdict-title" style={{ fontFamily: "'Figtree', sans-serif", fontWeight: 800, fontSize: 15, lineHeight: 1.1, color: verdictFill }}>
              {verdictText}
            </div>
            <div className="trade-scoreboard__verdict-detail" style={{ marginTop: 3, fontFamily: "'Figtree', sans-serif", fontWeight: 600, fontSize: 11, lineHeight: 1.1, color: 'rgba(255,255,255,0.68)' }}>
              {detailText}
            </div>
          </div>
          <svg className="trade-scoreboard__svg" width="220" height="112" viewBox="0 0 220 112" style={{ overflow: 'visible', display: 'block' }}>
            <path d="M 26 112 A 84 84 0 0 1 194 112" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="8" strokeLinecap="round"/>
            <path d="M 26 112 A 84 84 0 0 1 194 112" fill="none" stroke="#F5B700" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${amberLen} ${arcLen}`}/>
            {ticks.map((tick, index) => (
              <line
                key={index}
                x1={tick.x1.toFixed(2)}
                y1={tick.y1.toFixed(2)}
                x2={tick.x2.toFixed(2)}
                y2={tick.y2.toFixed(2)}
                stroke={tick.emphasis ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.46)'}
                strokeWidth={tick.emphasis ? 2.4 : 1.6}
                strokeLinecap="round"
              />
            ))}
            <line x1={cx} y1={cy} x2={needleX.toFixed(2)} y2={needleY.toFixed(2)} stroke="white" strokeWidth="3.8" strokeLinecap="round"/>
            <circle cx={cx} cy={cy} r="7" fill="#F5B700" stroke="rgba(0,0,0,0.65)" strokeWidth="2.5"/>
          </svg>
        </div>
        <TeamBlock name={partnerName || 'Select Partner'} total={theirTotal} avatar={partnerAvatar} align="right" />
      </div>
    </div>
  );
}

// ── TradePlate ─────────────────────────────────────────────────────────────────
function TradePlate({ side, items, total, onRemovePlayer, onRemovePick, onAddPlayer, onAddPick, onOpenPlayer, shelfDragRef, onDropFromShelf }) {
  const { darkMode } = useTheme();
  // null | 'valid' | 'invalid'
  const [dragState, setDragState] = useState(null);
  const isYours = side === 'yours';
  const df = "var(--font-display, 'Barlow Condensed', sans-serif)";

  const dragBg = dragState === 'valid'
    ? 'rgba(34,197,94,0.08)'
    : dragState === 'invalid'
      ? 'rgba(239,68,68,0.08)'
      : undefined;
  const dragOutline = dragState === 'valid'
    ? '2px solid #22c55e'
    : dragState === 'invalid'
      ? '2px solid #ef4444'
      : undefined;

  return (
    <div
      className="trade-plate flex flex-col gap-2"
      onDragOver={e => {
        e.preventDefault();
        const drag = shelfDragRef?.current;
        if (!drag) return;
        setDragState(drag.shelfTab === side ? 'valid' : 'invalid');
      }}
      onDragLeave={() => setDragState(null)}
      onDrop={e => {
        e.preventDefault();
        setDragState(null);
        const drag = shelfDragRef?.current;
        if (!drag) return;
        if (drag.shelfTab !== side) {
          // Wrong side — reject silently
          shelfDragRef.current = null;
          return;
        }
        onDropFromShelf?.(drag);
        shelfDragRef.current = null;
      }}
      style={{
        padding: '12px 14px 14px',
        borderTop: '1px solid var(--color-separator)',
        borderRight: isYours ? '1px solid var(--color-separator)' : undefined,
        background: dragBg,
        minHeight: 120,
        minWidth: 0,
        overflow: 'hidden',
        transition: 'background 100ms, outline 100ms',
        outline: dragOutline,
        outlineOffset: -2,
      }}
    >
      {items.map((item) => {
        const palette = item.type === 'player' ? teamPalette(item.team, darkMode) : { color: null, tint: null, logoKey: '' };
        return (
          <TradeSideAssetRow key={item.id} item={item} palette={palette} darkMode={darkMode} onOpenPlayer={onOpenPlayer} onRemove={() => item.type === 'player' ? onRemovePlayer(item.id) : onRemovePick(item.id)} />
        );
      })}
      {items.length === 0 && (
        <div
          className="hidden lg:flex flex-1 min-h-[92px] items-center justify-center text-center rounded-lg"
          style={{
            border: '1px dashed var(--color-separator)',
            color: dragState === 'valid' ? '#22c55e' : 'var(--color-label-quaternary)',
            background: dragState === 'valid' ? 'rgba(34,197,94,0.06)' : 'transparent',
            fontFamily: df,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          <span>
            {dragState === 'valid'
              ? 'Drop here to add'
              : dragState === 'invalid'
                ? 'Wrong side'
                : 'Drop here from shelf'}
            {!dragState && (
              <span style={{ display: 'block', marginTop: 4, fontFamily: "'Figtree', sans-serif", fontSize: 11, fontWeight: 500, letterSpacing: 0, textTransform: 'none', color: 'var(--color-label-quaternary)' }}>
                or use + Player / + Pick
              </span>
            )}
          </span>
        </div>
      )}
      <div className="flex gap-1.5" style={{ marginTop: items.length ? 4 : 0 }}>
        <button onClick={onAddPlayer} className="flex-1 py-2.5 rounded-lg font-medium"
          style={{ fontSize: 13, border: '1px dashed var(--color-separator)', color: 'var(--color-label-tertiary)', background: 'transparent', cursor: 'pointer' }}>
          + Player
        </button>
        <button onClick={onAddPick ?? undefined} disabled={!onAddPick} className="flex-1 py-2.5 rounded-lg font-medium"
          style={{ fontSize: 13, border: '1px dashed var(--color-separator)', color: 'var(--color-label-tertiary)', background: 'transparent', opacity: onAddPick ? 1 : 0.35, cursor: onAddPick ? 'pointer' : 'default' }}>
          + Pick
        </button>
      </div>
    </div>
  );
}

// ── Shelf helpers ──────────────────────────────────────────────────────────────
const SHELF_POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'IDP'];
const IDP_POSITIONS = new Set(['DE', 'DT', 'DL', 'LB', 'ILB', 'OLB', 'CB', 'S', 'SS', 'FS', 'DB', 'EDG', 'EDGE']);
function matchesShelfFilter(pos, posFilter) {
  if (posFilter === 'ALL') return true;
  if (posFilter === 'IDP') return IDP_POSITIONS.has(pos);
  return pos === posFilter;
}

function shelfPlayerName(player) {
  return player?.full_name
    || [player?.first_name, player?.last_name].filter(Boolean).join(' ')
    || 'Player';
}

// ── RosterShelf ────────────────────────────────────────────────────────────────
function RosterShelf({
  myPlayers, partnerPlayers, yourTradePlayers, theirTradePlayers,
  sleeperPlayers, playerTradeValueMap, myName, partnerName, hasPartner,
  onAddToYours, onAddToTheirs,
  rosterPicks, slots, myRosterId, partnerRosterId: shelfPartnerRosterId,
  yourTradePicks, theirTradePicks, onAddPickToYours, onAddPickToTheirs,
  shelfDragRef, partnerRosters, onPartnerChange,
}) {
  const [activeTab, setActiveTab] = useState('yours');
  const [posFilter, setPosFilter] = useState('ALL');
  const [showPicks, setShowPicks] = useState(false);
  const df = "var(--font-display, 'Barlow Condensed', sans-serif)";

  const roster = activeTab === 'yours' ? myPlayers : partnerPlayers;
  const inTradePlayers = activeTab === 'yours' ? yourTradePlayers : theirTradePlayers;
  const inTradePickKeys = new Set(
    (activeTab === 'yours' ? yourTradePicks : theirTradePicks).map(p => p.key)
  );

  const filteredPlayers = (roster ?? [])
    .filter(id => {
      const p = sleeperPlayers?.[id];
      return p && matchesShelfFilter(p.position, posFilter);
    })
    .sort((a, b) => (playerTradeValueMap?.get(b) ?? 0) - (playerTradeValueMap?.get(a) ?? 0));

  const rosterId = activeTab === 'yours' ? myRosterId : shelfPartnerRosterId;
  const shelfPicks = (rosterPicks && slots && rosterId)
    ? (getPicksForRoster(rosterId, rosterPicks, slots) ?? [])
    : [];

  const handleDragStart = (type, id, pickData) => {
    if (shelfDragRef) shelfDragRef.current = { type, id, shelfTab: activeTab, pickData };
  };

  const tabButtonStyle = isActive => ({
    flex: 1,
    padding: '9px 4px',
    background: 'transparent',
    border: 0,
    borderBottom: `2.5px solid ${isActive ? 'var(--color-signature)' : 'transparent'}`,
    fontFamily: "'Figtree', sans-serif",
    fontWeight: 600,
    fontSize: 12,
    letterSpacing: 0,
    color: isActive ? 'var(--color-label)' : 'var(--color-label-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ width: 'clamp(300px, 24vw, 340px)', flexShrink: 0, borderRight: '1px solid var(--color-separator)', background: 'var(--color-bg-secondary)', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, maxHeight: '100vh', alignSelf: 'flex-start', overflow: 'visible' }}>
      {/* YOU / PARTNER tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-separator)', position: 'sticky', top: 0, background: 'var(--color-bg-secondary)', zIndex: 2 }}>
        <button onClick={() => setActiveTab('yours')}
          style={{ ...tabButtonStyle(activeTab === 'yours'), cursor: 'pointer' }}>
          {myName || 'YOU'}
        </button>
        <ShelfPartnerTab
          partnerRosters={partnerRosters}
          value={shelfPartnerRosterId}
          onChange={onPartnerChange}
          label={partnerName || 'Select Partner'}
          active={activeTab === 'theirs'}
          disabled={false}
          onActivate={() => setActiveTab('theirs')}
          buttonStyle={tabButtonStyle(activeTab === 'theirs')}
        />
      </div>
      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 4, padding: '7px 10px', flexWrap: 'wrap', position: 'sticky', top: 38, background: 'var(--color-bg-secondary)', zIndex: 1, borderBottom: '1px solid var(--color-separator)' }}>
        {SHELF_POSITIONS.map(pos => (
          <button key={pos} onClick={() => { setShowPicks(false); setPosFilter(pos); }}
            style={{ padding: '3px 8px', borderRadius: 100, border: '1px solid var(--color-separator)', background: !showPicks && posFilter === pos ? 'var(--color-signature)' : 'transparent', color: !showPicks && posFilter === pos ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)', fontWeight: 600, fontSize: 10, cursor: 'pointer', letterSpacing: '0.04em' }}>
            {pos}
          </button>
        ))}
        <button onClick={() => setShowPicks(true)}
          style={{ padding: '3px 8px', borderRadius: 100, border: '1px solid var(--color-separator)', background: showPicks ? 'var(--color-signature)' : 'transparent', color: showPicks ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)', fontWeight: 600, fontSize: 10, cursor: 'pointer', letterSpacing: '0.04em' }}>
          PICKS
        </button>
      </div>
      {/* List */}
      <div style={{ flex: 1, minHeight: 0, padding: '4px 8px 8px', display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto' }}>
        {showPicks ? (
          shelfPicks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '14px 0', fontSize: 12, color: 'var(--color-label-quaternary)' }}>
              {!hasPartner && activeTab === 'theirs' ? 'Select a partner first' : 'No picks'}
            </div>
          ) : shelfPicks.map(pick => {
            const inTrade = inTradePickKeys.has(pick.key);
            const label = `${pick.year ?? ''} · Rd ${pick.round}`;
            return (
              <button key={pick.key}
                draggable={!inTrade}
                onDragStart={() => handleDragStart('pick', pick.key, pick)}
                onClick={() => !inTrade && (activeTab === 'yours' ? onAddPickToYours(pick) : onAddPickToTheirs(pick))}
                disabled={inTrade}
                className="group"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 7px', borderRadius: 7, border: inTrade ? '1px dashed var(--color-separator)' : '1px solid var(--color-separator)', background: 'var(--color-bg)', opacity: inTrade ? 0.35 : 1, cursor: inTrade ? 'default' : 'grab', textAlign: 'left', width: '100%' }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: 'rgba(245,183,0,0.12)', color: '#F5B700', flexShrink: 0, letterSpacing: '0.04em' }}>PICK</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: 'var(--color-label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                {!inTrade && (
                  <span className="hidden lg:inline-flex opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity" style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--color-signature)', flexShrink: 0 }}>ADD</span>
                )}
                {inTrade && (
                  <span className="hidden lg:inline-flex" style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--color-label-quaternary)', flexShrink: 0 }}>ADDED</span>
                )}
              </button>
            );
          })
        ) : filteredPlayers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '14px 0', fontSize: 12, color: 'var(--color-label-quaternary)' }}>
            {!hasPartner && activeTab === 'theirs' ? 'Select a partner first' : 'No players'}
          </div>
        ) : filteredPlayers.map(id => {
          const p = sleeperPlayers?.[id];
          if (!p) return null;
          const val = playerTradeValueMap?.get(id);
          const isInTrade = inTradePlayers.includes(id);
          const pos = p.position;
          const posColor = POSITION_COLORS[pos];
          return (
            <button key={id}
              draggable={!isInTrade}
              onDragStart={() => handleDragStart('player', id, null)}
              onClick={() => !isInTrade && (activeTab === 'yours' ? onAddToYours(id) : onAddToTheirs(id))}
              disabled={isInTrade}
              className="group"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 7px', borderRadius: 7, border: isInTrade ? '1px dashed var(--color-separator)' : '1px solid var(--color-separator)', background: 'var(--color-bg)', opacity: isInTrade ? 0.35 : 1, cursor: isInTrade ? 'default' : 'grab', textAlign: 'left', width: '100%' }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: posColor ? `${posColor}22` : 'var(--color-fill)', color: posColor ?? 'var(--color-label-tertiary)', flexShrink: 0, letterSpacing: '0.04em' }}>{pos}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: 'var(--color-label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {shelfPlayerName(p)}
              </span>
              {val != null && (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-label-secondary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmtKtcValue(val)}</span>
              )}
              {!isInTrade && (
                <span className="hidden lg:inline-flex opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity" style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--color-signature)', flexShrink: 0 }}>ADD</span>
              )}
              {isInTrade && (
                <span className="hidden lg:inline-flex" style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--color-label-quaternary)', flexShrink: 0 }}>ADDED</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── MobileRosterShelf ──────────────────────────────────────────────────────────
function MobileRosterShelf({
  myPlayers, partnerPlayers, yourTradePlayers, theirTradePlayers,
  sleeperPlayers, playerTradeValueMap, myName, partnerName, hasPartner,
  onAddToYours, onAddToTheirs,
  rosterPicks, slots, myRosterId, partnerRosterId: shelfPartnerRosterId,
  yourTradePicks, theirTradePicks, onAddPickToYours, onAddPickToTheirs,
  partnerRosters, onPartnerChange,
}) {
  const [activeTab, setActiveTab] = useState('yours');
  const [posFilter, setPosFilter] = useState('ALL');
  const [showPicks, setShowPicks] = useState(false);
  const df = "var(--font-display, 'Barlow Condensed', sans-serif)";

  const roster = activeTab === 'yours' ? myPlayers : partnerPlayers;
  const inTradePlayers = activeTab === 'yours' ? yourTradePlayers : theirTradePlayers;
  const inTradePickKeys = new Set(
    (activeTab === 'yours' ? yourTradePicks : theirTradePicks).map(p => p.key)
  );

  const filteredPlayers = (roster ?? [])
    .filter(id => {
      const p = sleeperPlayers?.[id];
      return p && matchesShelfFilter(p.position, posFilter);
    })
    .sort((a, b) => (playerTradeValueMap?.get(b) ?? 0) - (playerTradeValueMap?.get(a) ?? 0));

  const rosterId = activeTab === 'yours' ? myRosterId : shelfPartnerRosterId;
  const shelfPicks = (rosterPicks && slots && rosterId)
    ? (getPicksForRoster(rosterId, rosterPicks, slots) ?? [])
    : [];

  const tabButtonStyle = isActive => ({
    flex: 1,
    padding: '7px 10px',
    borderRadius: 10,
    background: isActive ? 'var(--color-signature)' : 'var(--color-fill)',
    color: isActive ? 'var(--color-signature-fg)' : 'var(--color-label-tertiary)',
    border: '1px solid var(--color-separator)',
    fontFamily: "'Figtree', sans-serif",
    fontWeight: 600,
    fontSize: 12,
    letterSpacing: 0,
    textTransform: 'none',
    minHeight: 36,
  });

  return (
    <div style={{ borderTop: '1.5px solid var(--color-separator)', background: 'var(--color-bg-secondary)', marginTop: 8 }}>
      {/* Team tabs */}
      <div style={{ padding: '10px 14px 8px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--color-separator)' }}>
        <button onClick={() => setActiveTab('yours')}
          style={{ ...tabButtonStyle(activeTab === 'yours'), cursor: 'pointer' }}>
          {myName || 'YOU'}
        </button>
        <ShelfPartnerTab
          partnerRosters={partnerRosters}
          value={shelfPartnerRosterId}
          onChange={onPartnerChange}
          label={partnerName || 'Select Partner'}
          active={activeTab === 'theirs'}
          disabled={false}
          onActivate={() => setActiveTab('theirs')}
          buttonStyle={tabButtonStyle(activeTab === 'theirs')}
        />
      </div>
      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', overflowX: 'auto', scrollbarWidth: 'none', borderBottom: '1px solid var(--color-separator)' }}>
        {SHELF_POSITIONS.map(pos => (
          <button key={pos} onClick={() => { setShowPicks(false); setPosFilter(pos); }}
            style={{ padding: '5px 12px', borderRadius: 100, flexShrink: 0, border: '1px solid var(--color-separator)', background: !showPicks && posFilter === pos ? 'var(--color-signature)' : 'var(--color-fill)', color: !showPicks && posFilter === pos ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)', fontWeight: 600, fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em', minHeight: 32 }}>
            {pos}
          </button>
        ))}
        <button onClick={() => setShowPicks(true)}
          style={{ padding: '5px 12px', borderRadius: 100, flexShrink: 0, border: '1px solid var(--color-separator)', background: showPicks ? 'var(--color-signature)' : 'var(--color-fill)', color: showPicks ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)', fontWeight: 600, fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em', minHeight: 32 }}>
          PICKS
        </button>
      </div>
      {/* Vertical player/pick list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '6px 14px 12px', maxHeight: 280, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {showPicks ? (
          shelfPicks.length === 0 ? (
            <div style={{ padding: '14px 0', fontSize: 13, color: 'var(--color-label-quaternary)', textAlign: 'center' }}>
              {!hasPartner && activeTab === 'theirs' ? 'Select a partner first' : 'No picks'}
            </div>
          ) : shelfPicks.map(pick => {
            const inTrade = inTradePickKeys.has(pick.key);
            const label = `${pick.year ?? ''} · Rd ${pick.round}`;
            return (
              <button key={pick.key}
                onClick={() => !inTrade && (activeTab === 'yours' ? onAddPickToYours(pick) : onAddPickToTheirs(pick))}
                disabled={inTrade}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 10, border: inTrade ? '1px dashed var(--color-separator)' : '1px solid var(--color-separator)', background: 'var(--color-bg)', opacity: inTrade ? 0.4 : 1, cursor: inTrade ? 'default' : 'pointer', textAlign: 'left', width: '100%', minHeight: 44 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'rgba(245,183,0,0.12)', color: '#F5B700', flexShrink: 0, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em' }}>PICK</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--color-label)' }}>{label}</span>
              </button>
            );
          })
        ) : filteredPlayers.length === 0 ? (
          <div style={{ padding: '14px 0', fontSize: 13, color: 'var(--color-label-quaternary)', textAlign: 'center' }}>
            {!hasPartner && activeTab === 'theirs' ? 'Select a partner first' : 'No players'}
          </div>
        ) : filteredPlayers.map(id => {
          const p = sleeperPlayers?.[id];
          if (!p) return null;
          const val = playerTradeValueMap?.get(id);
          const isInTrade = inTradePlayers.includes(id);
          const pos = p.position;
          const posColor = POSITION_COLORS[pos];
          return (
            <button key={id}
              onClick={() => !isInTrade && (activeTab === 'yours' ? onAddToYours(id) : onAddToTheirs(id))}
              disabled={isInTrade}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 10, border: isInTrade ? '1px dashed var(--color-separator)' : '1px solid var(--color-separator)', background: 'var(--color-bg)', opacity: isInTrade ? 0.4 : 1, cursor: isInTrade ? 'default' : 'pointer', textAlign: 'left', width: '100%', minHeight: 44 }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: posColor ? `${posColor}22` : 'var(--color-fill)', color: posColor ?? 'var(--color-label-tertiary)', flexShrink: 0, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em' }}>{pos}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {shelfPlayerName(p)}
              </span>
              {val != null && (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-label-secondary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmtKtcValue(val)}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatProposalAssets(assets = []) {
  return assets.map((asset) => (
    asset.type === 'player'
      ? `${asset.label ?? asset.name} [${asset.position}]`
      : (asset.label ?? asset.name)
  )).join(' + ');
}

function AssetBadge({ asset }) {
  const isPlayer = asset.type === 'player';
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium"
      style={{ background: 'var(--color-fill-secondary)', color: 'var(--color-label)' }}
    >
      <span>{asset.label ?? asset.name}</span>
      {isPlayer && (
        <span
          className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-label-secondary)', border: '1px solid var(--color-separator)' }}
        >
          {asset.position}
        </span>
      )}
    </span>
  );
}

function getProposalPickIdentity(pick) {
  if (!pick) return 'Draft Pick';
  const roundNumber = Number(pick.round);
  const hasRound = Number.isFinite(roundNumber) && roundNumber > 0;
  const compactPickNumberLabel = pick.pickNumberLabel ?? pick.pickRangeLabel ?? null;
  const parsedPickSlot = typeof compactPickNumberLabel === 'string'
    ? Number(compactPickNumberLabel.match(/^\d+\.(\d+)$/)?.[1])
    : null;
  const lockedPickSlot = Number(pick.lockedSlot ?? parsedPickSlot);
  const hasLockedPickSlot = Number.isFinite(lockedPickSlot) && lockedPickSlot > 0;
  const compactRoundLabel = hasRound ? `Round ${roundNumber}` : null;
  const compactPickSlotLabel = hasLockedPickSlot ? `Pick ${lockedPickSlot}` : compactPickNumberLabel;

  return [
    pick.year,
    compactRoundLabel,
    compactPickSlotLabel,
  ].filter(Boolean).join(' · ') || pick.label || 'Draft Pick';
}

function ProposalAssetRow({ asset, darkMode, onOpenPlayer }) {
  if (!asset) return null;

  const isPlayer = asset.type === 'player';
  const isInteractive = isPlayer && !!onOpenPlayer;
  const palette = isPlayer && asset.team ? teamPalette(asset.team, darkMode) : null;
  const value = asset.value ?? asset.val;
  const hasTeamGradient = isPlayer && palette?.gradient;
  const accentColor = palette?.borderColor ?? (isPlayer ? 'var(--color-accent)' : 'var(--color-signature)');
  const rowBg = hasTeamGradient ? palette.gradient : (palette?.tint ?? 'var(--color-fill)');
  const rowForeground = hasTeamGradient ? palette.gradientForeground : 'var(--color-label)';
  const rowMuted = hasTeamGradient
    ? (rowForeground === '#FFFFFF' ? 'rgba(255,255,255,0.70)' : 'rgba(12,15,20,0.64)')
    : 'var(--color-label-secondary)';
  const rowSubtle = hasTeamGradient
    ? (rowForeground === '#FFFFFF' ? 'rgba(255,255,255,0.16)' : 'rgba(12,15,20,0.12)')
    : 'var(--color-fill-secondary)';
  const Component = isInteractive ? 'button' : 'div';

  if (!isPlayer) {
    const quality = asset.displayQuality ?? asset.quality ?? null;
    const metaSegments = [quality, asset.pickRangeLabel].filter(Boolean);
    return (
      <Component
        type={isInteractive ? 'button' : undefined}
        className="trade-selection-row trade-selection-row--proposal"
        style={{
          background: rowBg,
          '--trade-selection-accent': 'var(--color-signature)',
          '--trade-selection-fg': 'var(--color-label)',
          '--trade-selection-muted': 'var(--color-label-secondary)',
          '--trade-selection-subtle': 'var(--color-fill-secondary)',
        }}
      >
        <div className="trade-selection-row__pick-mark">
          PICK
        </div>
        <div className="trade-selection-row__body">
          <div className="trade-selection-row__identity" style={{ color: 'var(--color-label)' }}>
            {getProposalPickIdentity(asset)}
          </div>
          <div className="trade-selection-row__meta">
            <span className="trade-selection-row__meta-prefix">Draft Asset</span>
            {(metaSegments.length ? metaSegments : [asset.cardHeadline || 'Draft pick']).map((segment) => (
              <span key={segment} className="trade-selection-row__meta-item">{segment}</span>
            ))}
          </div>
        </div>
        <div className="trade-selection-row__value">
          <span className="trade-selection-row__value-kicker">
            Value
          </span>
          <span className="trade-selection-row__value-number">
            {value != null ? fmtKtcValue(value) : '—'}
          </span>
        </div>
      </Component>
    );
  }

  const rankLabel = asset.rank?.posLabel ? `${asset.rank.posLabel}${asset.rank.rank}` : null;
  const metaSegments = [
    [asset.position, asset.team].filter(Boolean).join(' · '),
    rankLabel,
    asset.ppg > 0 ? `${asset.ppg.toFixed(1)} PPG` : null,
  ].filter(Boolean);
  const posColor = getTradePositionColor(asset.position);
  const posTextColor = posColor && hexLuminance(posColor) > 0.42 ? '#0C0F14' : '#FFFFFF';

  return (
    <Component
      type={isInteractive ? 'button' : undefined}
      onClick={isInteractive ? () => onOpenPlayer(asset) : undefined}
      className={`trade-selection-row trade-selection-row--proposal${isInteractive ? ' is-interactive' : ''}`}
      style={{
        background: rowBg,
        '--trade-selection-accent': accentColor,
        '--trade-selection-fg': rowForeground,
        '--trade-selection-muted': rowMuted,
        '--trade-selection-subtle': rowSubtle,
        cursor: isInteractive ? 'pointer' : undefined,
      }}
      title={[asset.name, ...metaSegments, `Value ${fmtKtcValue(value)}`].join(' · ')}
      aria-label={isInteractive ? `Open player stats for ${asset.name}` : undefined}
    >
      {hasTeamGradient && (
        <div
          className="trade-selection-row__gradient-overlay"
          style={{ background: palette.gradientOverlay }}
          aria-hidden="true"
        />
      )}
      <img
        src={`https://sleepercdn.com/content/nfl/players/thumb/${asset.id}.jpg`}
        alt=""
        className="trade-selection-row__avatar"
        loading="lazy"
        decoding="async"
        onError={e => { e.target.style.display = 'none'; }}
      />
      <span
        className="trade-selection-row__position"
        style={{
          background: posColor ?? rowSubtle,
          color: posColor ? posTextColor : rowForeground,
        }}
      >
        {asset.position || '—'}
      </span>
      <div className="trade-selection-row__body">
        <div className="trade-selection-row__identity" style={{ color: rowForeground }}>
          {asset.name}
        </div>
        <div className="trade-selection-row__meta">
          <span className="trade-selection-row__meta-prefix">Player</span>
          {(metaSegments.length ? metaSegments : ['Player']).map((segment) => (
            <span key={segment} className="trade-selection-row__meta-item">{segment}</span>
          ))}
        </div>
      </div>
      {palette?.logoKey ? (
        <img
          src={`https://a.espncdn.com/i/teamlogos/nfl/500/${palette.logoKey}.png`}
          aria-hidden="true"
          className="trade-selection-row__team-logo"
          loading="lazy"
          decoding="async"
          onError={e => { e.target.style.display = 'none'; }}
        />
      ) : (
        <span className="trade-selection-row__team-logo-spacer" aria-hidden="true" />
      )}
      <div className="trade-selection-row__value">
        <span className="trade-selection-row__value-kicker">
          Value
        </span>
        <span className="trade-selection-row__value-number">
          {value != null ? fmtKtcValue(value) : '—'}
        </span>
      </div>
    </Component>
  );
}

function fmtPpg(value) {
  return Number.isFinite(value) ? Number(value).toFixed(1) : '0.0';
}

function fmtSignedPpg(value) {
  if (!Number.isFinite(value)) return '0.0';
  const numeric = Number(value);
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(1)}`;
}

function paymentTypeLabel(paymentType) {
  switch (paymentType) {
    case 'player':
      return 'Player swap';
    case 'pick':
      return 'Pick-driven';
    case 'player_plus_pick':
      return 'Player + pick';
    case 'player_plus_player':
      return 'Two-player swap';
    case 'multi_asset':
      return null;
    default:
      return null;
  }
}

// Position-specific season stat definitions for desktop card breakdown.
const CARD_STAT_DEFS = {
  QB: [
    { key: 'pass_yd', label: 'Pass Yds' }, { key: 'pass_td', label: 'Pass TD' },
    { key: 'pass_int', label: 'INT' }, { key: 'pass_cmp', label: 'Comp' },
    { key: 'rush_yd', label: 'Rush Yds' }, { key: 'rush_td', label: 'Rush TD' },
  ],
  RB: [
    { key: 'rush_yd', label: 'Rush Yds' }, { key: 'rush_td', label: 'Rush TD' },
    { key: 'rush_att', label: 'Carries' }, { key: 'rec', label: 'Rec' },
    { key: 'rec_yd', label: 'Rec Yds' }, { key: 'rec_td', label: 'Rec TD' },
  ],
  WR: [
    { key: 'rec', label: 'Rec' }, { key: 'rec_yd', label: 'Rec Yds' },
    { key: 'rec_td', label: 'Rec TD' }, { key: 'rush_yd', label: 'Rush Yds' },
    { key: 'rush_td', label: 'Rush TD' },
  ],
  TE: [
    { key: 'rec', label: 'Rec' }, { key: 'rec_yd', label: 'Rec Yds' },
    { key: 'rec_td', label: 'Rec TD' },
  ],
  K: [
    { key: 'fgm', label: 'FGM' }, { key: 'fgmiss', label: 'FG Miss' },
    { key: 'xpm', label: 'XPM' }, { key: 'xpmiss', label: 'XP Miss' },
  ],
  DL: [
    { key: 'idp_tkl', label: 'Tackles' }, { key: 'idp_sack', label: 'Sacks' },
    { key: 'idp_int', label: 'INT' }, { key: 'idp_ff', label: 'FF' },
    { key: 'idp_pd', label: 'PD' }, { key: 'idp_qbhit', label: 'QB Hits' },
  ],
  LB: [
    { key: 'idp_tkl', label: 'Tackles' }, { key: 'idp_sack', label: 'Sacks' },
    { key: 'idp_int', label: 'INT' }, { key: 'idp_ff', label: 'FF' },
    { key: 'idp_pd', label: 'PD' }, { key: 'idp_qbhit', label: 'QB Hits' },
  ],
  DB: [
    { key: 'idp_tkl', label: 'Tackles' }, { key: 'idp_int', label: 'INT' },
    { key: 'idp_pd', label: 'PD' }, { key: 'idp_ff', label: 'FF' },
    { key: 'idp_sack', label: 'Sacks' }, { key: 'idp_qbhit', label: 'QB Hits' },
  ],
};

// Portrait trading card for one asset in a proposal side.
function ProposalPlayerCard({ player = null, palette = null, pick = null, side, seasonStats, showSideBadge = true, forcedHeight = null, cardRef = null, topRightSlot = null, onClick = null, compactTradeCard = false }) {
  const primary = player ?? null;
  const primaryPalette = palette ?? null;
  const primaryPick = pick ?? null;
  const { darkMode, favoriteTeam } = useTheme();
  const { rosters } = useSleeperLeague();

  const teamColor = primaryPalette?.color ?? null;
  const teamGradient = primaryPalette?.gradient ?? null;
  const teamGradientOverlay = primaryPalette?.gradientOverlay ?? null;
  const teamGradientForeground = primaryPalette?.gradientForeground ?? 'white';
  const cardBg = teamGradient
    ? teamGradient
    : 'var(--color-fill)';
  const cardBorder = teamColor ? `${teamColor}88` : 'var(--color-separator)';
  const cardHighlight = teamColor
    ? `4px solid ${teamColor}`
    : `4px solid ${darkMode ? 'rgba(255,255,255,0.16)' : 'rgba(12,15,20,0.14)'}`;
  // Gradient fade applied behind the player image (visible when photo doesn't fully cover)
  const photoFade = teamColor
    ? 'linear-gradient(to bottom, transparent 18%, rgba(12,15,20,0.08) 68%, rgba(12,15,20,0.24) 100%)'
    : 'linear-gradient(to bottom, transparent 25%, rgba(0,0,0,0.5) 75%, rgba(0,0,0,0.7) 100%)';

  // Desktop: position-specific season stats
  const playerStats = primary ? seasonStats?.[primary.id] : null;
  const statPosition = primary ? (normalizeIDPPos(primary.position) ?? primary.position) : null;
  const statDefs = statPosition ? (CARD_STAT_DEFS[statPosition] ?? []) : [];
  const visibleStatDefs = compactTradeCard ? statDefs.slice(0, 2) : statDefs;

  const fmtStat = (v) => v == null ? '—' : (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));
  const playerImageSrc = primary
    ? `https://sleepercdn.com/content/nfl/players/thumb/${primary.id}.jpg`
    : null;
  const isInteractive = !!(primary && onClick);
  // Use the team's vivid primary color for the glow, not the contrast-adjusted accent.
  const interactiveGlowColor = teamColor ?? (darkMode ? '#5AADFF' : '#1A6EFF');
  const { glowHandlers, borderOverlay, glowShadow } = useCardGlow({
    enabled: isInteractive,
    color: interactiveGlowColor,
    cardColor: teamColor,
    darkMode,
  });
  const baseShadow = darkMode ? '0 8px 20px rgba(0,0,0,0.12)' : '0 8px 18px rgba(12,15,20,0.10)';
  const cardBoxShadow = glowShadow
    ? `${glowShadow}, ${baseShadow}`
    : baseShadow;

  // ── Pick-only card ──────────────────────────────────────────────────────
  if (!primary && primaryPick) {
    const pickOrdinals = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' };
    const roundNumber = Number(primaryPick.round);
    const hasRound = Number.isFinite(roundNumber) && roundNumber > 0;
    const roundOrd = hasRound ? (pickOrdinals[roundNumber] ?? `${roundNumber}th`) : null;
    const roundHeroParts = roundOrd?.match(/^(\d+)(\D+)$/);
    const quality = primaryPick.displayQuality ?? primaryPick.quality ?? '';
    const qualityLabel = quality === 'Early' ? 'Early' : quality === 'Mid' ? 'Middle' : quality === 'Late' ? 'Late' : '';
    const r = hasRound ? roundNumber : 1;
    // Dynamic pick range based on league size
    const teamCount = rosters?.length || 12;
    const earlyEnd = Math.floor(teamCount / 3);
    const midEnd = Math.floor((2 * teamCount) / 3);
    const QUALITY_SLOTS = {
      Early: [1, earlyEnd],
      Mid:   [earlyEnd + 1, midEnd],
      Late:  [midEnd + 1, teamCount],
    };
    const slots = QUALITY_SLOTS[quality];
    const pickRange = slots
      ? `${r}.${String(slots[0]).padStart(2, '0')} – ${r}.${String(slots[1]).padStart(2, '0')}`
      : null;
    const cardHeadline = primaryPick.cardHeadline
      ?? (qualityLabel && roundOrd ? `${roundOrd} Round · ${qualityLabel}` : `Round ${primaryPick.round ?? '—'}`);
    const pickMetaLabel = primaryPick.cardMetaLabel ?? (primaryPick.displayMode === 'future' ? null : 'Projected Range');
    const pickMetaValue = primaryPick.pickRangeLabel ?? pickRange;
    const showPickMeta = Boolean(pickMetaLabel && pickMetaValue);
    const compactPickNumberLabel = primaryPick.pickNumberLabel ?? primaryPick.pickRangeLabel ?? null;
    const parsedPickSlot = typeof compactPickNumberLabel === 'string'
      ? Number(compactPickNumberLabel.match(/^\d+\.(\d+)$/)?.[1])
      : null;
    const lockedPickSlot = Number(primaryPick.lockedSlot ?? parsedPickSlot);
    const hasLockedPickSlot = Number.isFinite(lockedPickSlot) && lockedPickSlot > 0;
    const compactRoundLabel = hasRound ? `Round ${roundNumber}` : null;
    const compactPickSlotLabel = hasLockedPickSlot ? `Pick ${lockedPickSlot}` : compactPickNumberLabel;
    const compactPickIdentity = [
      primaryPick.year,
      compactRoundLabel,
      compactPickSlotLabel,
    ].filter(Boolean).join(' · ') || primaryPick.label || 'Draft Pick';

    // Derive color theme: My Team > dark gold > light gold
    const favPalette = favoriteTeam ? teamPalette(favoriteTeam, darkMode) : null;
    const favColor = favPalette?.color ?? null;

    let pt; // pickTheme
    if (favColor) {
      pt = {
        bg: darkMode
          ? `linear-gradient(160deg, ${favColor}cc 0%, ${favColor}55 35%, #141418 70%, #0a0a0c 100%)`
          : `linear-gradient(160deg, ${favColor}55 0%, ${favColor}28 50%, #ffffff 100%)`,
        border: `${favColor}88`,
        watermark: `${favColor}12`,
        yearBg: `${favColor}18`,
        yearBorder: `${favColor}35`,
        divider: `${favColor}88`,
        subLabel: `${favColor}cc`,
        yearText: darkMode ? 'white' : '#0c0f14',
        bannerBg: `linear-gradient(90deg, transparent 0%, ${favColor}22 15%, ${favColor}28 50%, ${favColor}22 85%, transparent 100%)`,
        bannerBorder: `${favColor}44`,
        glassBg: darkMode ? 'rgba(10,10,12,0.65)' : 'rgba(255,255,255,0.65)',
        glassBorder: `${favColor}22`,
        accent: favColor,
        accentMuted: darkMode ? `${favColor}bb` : `${favColor}cc`,
        labelText: darkMode ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.75)',
      };
    } else if (darkMode) {
      // Stitch-inspired dark gold
      pt = {
        bg: 'linear-gradient(160deg, #1c1508 0%, #141418 45%, #0a0a0c 100%)',
        border: 'rgba(212,175,55,0.45)',
        watermark: 'rgba(212,175,55,0.08)',
        yearBg: 'rgba(212,175,55,0.07)',
        yearBorder: 'rgba(212,175,55,0.2)',
        divider: 'rgba(212,175,55,0.45)',
        subLabel: 'rgba(212,175,55,0.7)',
        yearText: 'white',
        bannerBg: 'linear-gradient(90deg, transparent 0%, rgba(212,175,55,0.1) 15%, rgba(212,175,55,0.14) 50%, rgba(212,175,55,0.1) 85%, transparent 100%)',
        bannerBorder: 'rgba(212,175,55,0.28)',
        glassBg: 'rgba(10,8,2,0.72)',
        glassBorder: 'rgba(212,175,55,0.12)',
        accent: '#D4AF37',
        accentMuted: 'rgba(212,175,55,0.65)',
        labelText: 'rgba(255,255,255,0.82)',
      };
    } else {
      // Light mode: white + deep gold (less yellow, more amber-brown)
      pt = {
        bg: 'linear-gradient(160deg, #fdf6e8 0%, #f0d98a 45%, #e8cc72 75%, #faf4e4 100%)',
        border: 'rgba(148,102,8,0.5)',
        watermark: 'rgba(148,102,8,0.09)',
        yearBg: 'rgba(148,102,8,0.07)',
        yearBorder: 'rgba(148,102,8,0.22)',
        divider: 'rgba(148,102,8,0.45)',
        subLabel: 'rgba(110,72,4,0.7)',
        yearText: '#1c1000',
        bannerBg: 'linear-gradient(90deg, transparent 0%, rgba(148,102,8,0.12) 15%, rgba(148,102,8,0.16) 50%, rgba(148,102,8,0.12) 85%, transparent 100%)',
        bannerBorder: 'rgba(148,102,8,0.3)',
        glassBg: 'rgba(248,238,200,0.82)',
        glassBorder: 'rgba(148,102,8,0.18)',
        accent: '#7a5500',
        accentMuted: 'rgba(110,72,4,0.65)',
        labelText: 'rgba(25,16,0,0.78)',
      };
    }

    return (
        <div
          ref={cardRef}
          className="w-full aspect-[5/7] rounded-xl flex flex-col overflow-hidden relative"
          style={{
            background: compactTradeCard ? 'var(--color-bg-secondary)' : pt.bg,
            border: compactTradeCard ? '0' : `2px solid ${pt.border}`,
            borderLeft: compactTradeCard ? undefined : `4px solid ${pt.accent}`,
            minHeight: !compactTradeCard && forcedHeight ? `${forcedHeight}px` : undefined,
          }}
        >
        <div className="relative w-full overflow-hidden" style={{ flexShrink: 0, height: compactTradeCard ? '50%' : '56%' }}>
          <div className="absolute inset-0" style={{ background: compactTradeCard ? 'var(--color-fill)' : pt.bg }} />
          {compactTradeCard ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-3 py-4 pointer-events-none select-none overflow-hidden">
              <span
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 'clamp(48px, 30%, 78px)',
                  fontWeight: 900,
                  color: 'var(--color-signature)',
                  lineHeight: 0.92,
                  letterSpacing: 0,
                }}
              >
                {roundHeroParts ? (
                  <span className="inline-flex items-start justify-center">
                    <span>{roundHeroParts[1]}</span>
                    <span
                      style={{
                        fontSize: '0.56em',
                        lineHeight: 1,
                        marginLeft: '0.04em',
                        marginTop: '0.08em',
                        letterSpacing: '0.01em',
                      }}
                    >
                      {roundHeroParts[2]}
                    </span>
                  </span>
                ) : (
                  roundOrd ?? '?'
                )}
              </span>
              <span
                className="mt-1 text-center text-[11px] font-bold uppercase leading-none"
                style={{ color: 'var(--color-label-secondary)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.16em' }}
              >
                {primaryPick.year ?? '—'} Pick
              </span>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
              <span
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 'clamp(150px, 80%, 220px)',
                  fontWeight: 900,
                  color: pt.watermark,
                  lineHeight: 1,
                  letterSpacing: '-0.04em',
                }}
              >
                {primaryPick.round ?? '?'}
              </span>
            </div>
          )}
          {showSideBadge && (
            <div className="absolute top-1.5 left-1.5 lg:top-2 lg:left-2 z-10">
              <span
                className="text-[8px] lg:text-[10px] font-bold uppercase tracking-widest px-1.5 lg:px-2 py-0.5 lg:py-1 rounded"
                style={{
                  background: darkMode ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.8)',
                  color: darkMode ? 'white' : '#0c0f14',
                  letterSpacing: '0.08em',
                  border: `1px solid ${pt.border}`,
                  textShadow: darkMode ? '0 1px 2px rgba(0,0,0,0.5)' : 'none',
                }}
              >
                {side === 'give' ? 'Give' : 'Get'}
              </span>
            </div>
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center px-3">
            {!compactTradeCard && (
              <>
                <span
                  style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: '10px',
                    fontWeight: 700,
                    color: pt.accentMuted,
                    letterSpacing: '0.35em',
                    textTransform: 'uppercase',
                  }}
                >
                  Draft Pick
                </span>
                <span
                  className="mt-2"
                  style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 'clamp(34px, 4vw, 48px)',
                    fontWeight: 300,
                    color: pt.yearText,
                    lineHeight: 1,
                    letterSpacing: '0.04em',
                  }}
                >
                  {primaryPick.year ?? '—'}
                </span>
              </>
            )}
          </div>
        </div>

        {compactTradeCard ? (
          <div
            className="flex flex-1 flex-col justify-between px-3 pb-3 pt-3 min-h-0"
            style={{ background: 'var(--color-bg-secondary)' }}
          >
            <div className="min-w-0">
              <div
                className="truncate whitespace-nowrap text-left text-base font-bold uppercase leading-none lg:text-[17px] xl:text-lg"
                style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.01em' }}
              >
                {compactPickIdentity}
              </div>
              <div
                className="mt-7 truncate whitespace-nowrap text-left text-[11px] font-bold uppercase leading-none lg:text-[13px] xl:text-sm"
                style={{ color: 'var(--color-label-secondary)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.16em' }}
              >
                Draft Pick
              </div>
            </div>

            <div className="mt-4">
              <div
                className="tabular-nums text-2xl font-bold leading-none"
                style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em' }}
              >
                {primaryPick.value != null ? fmtKtcValue(primaryPick.value) : '—'}
              </div>
              <div
                className="mt-0.5 text-[10px] font-bold uppercase leading-none lg:text-[12px]"
                style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.14em' }}
              >
                Value
              </div>
            </div>
          </div>
        ) : (
        <>
        <div
          className="relative px-2 lg:px-3 py-1 lg:py-1.5 text-center shrink-0"
          style={{
            background: pt.bannerBg,
            borderTop: `1px solid ${pt.bannerBorder}`,
            borderBottom: `1px solid ${pt.bannerBorder}`,
          }}
        >
          <div
            className="text-[11px] lg:text-sm font-bold leading-tight tracking-wide uppercase whitespace-nowrap"
            style={{
              color: pt.yearText,
              textShadow: darkMode ? '0 1px 3px rgba(0,0,0,0.6)' : 'none',
              fontFamily: "'Barlow Condensed', sans-serif",
            }}
          >
            {cardHeadline}
          </div>
        </div>

        <div className="flex flex-col flex-1 px-2 pb-2 min-h-0 items-center overflow-hidden" style={{ background: pt.glassBg }}>
          <div className="flex items-center justify-center py-1 lg:py-1.5 shrink-0">
            <span
              className="text-sm lg:text-[18px] font-bold tabular-nums leading-tight"
              style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em' }}
            >
              {primaryPick.value != null ? fmtKtcValue(primaryPick.value) : '—'}
            </span>
          </div>

          {showPickMeta && (
          <div className={compactTradeCard ? 'hidden' : 'hidden min-[420px]:flex gap-1 w-full lg:hidden min-h-0 overflow-hidden'}>
            <div className="flex-1 rounded-lg p-1.5 flex flex-col gap-px" style={{ background: 'rgba(0,0,0,0.22)' }}>
              <span className="text-[7px] font-bold uppercase tracking-wide mb-0.5" style={{ color: pt.accentMuted }}>{pickMetaLabel}</span>
              <span className="text-[9px] font-semibold tabular-nums" style={{ color: pt.labelText }}>
                {pickMetaValue}
              </span>
            </div>
          </div>
          )}

          {showPickMeta && (
          <div className="hidden lg:flex gap-1.5 w-full min-h-0 overflow-hidden">
            <div className="flex-1 rounded-lg p-1.5 flex flex-col gap-px" style={{ background: 'rgba(0,0,0,0.22)' }}>
              <span className="text-[9px] font-bold uppercase tracking-wide mb-0.5" style={{ color: pt.accentMuted }}>{pickMetaLabel}</span>
              <span className="text-[11px] font-semibold tabular-nums" style={{ color: pt.labelText }}>
                {pickMetaValue}
              </span>
            </div>
          </div>
          )}
        </div>
        </>
        )}
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className="w-full aspect-[5/7] rounded-xl flex flex-col overflow-hidden relative"
      style={{
        background: cardBg,
        border: compactTradeCard ? '0' : `2px solid ${cardBorder}`,
        borderLeft: compactTradeCard ? undefined : cardHighlight,
        minHeight: !compactTradeCard && forcedHeight ? `${forcedHeight}px` : undefined,
        cursor: isInteractive ? 'pointer' : undefined,
        boxShadow: cardBoxShadow,
        transition: 'box-shadow 200ms cubic-bezier(0.32, 0.72, 0, 1)',
      }}
      onClick={isInteractive ? () => onClick(primary) : undefined}
      {...glowHandlers}
      onFocus={isInteractive ? glowHandlers.onMouseEnter : undefined}
      onBlur={isInteractive ? glowHandlers.onMouseLeave : undefined}
      onKeyDown={isInteractive ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick(primary);
        }
      } : undefined}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-label={isInteractive ? `Open player stats for ${primary.name}` : undefined}
    >
      {/* Mouse-tracking border glow */}
      {borderOverlay}
      {/* ── Photo area (~45% of card height) ──────────────────── */}
      <div className="relative w-full overflow-hidden" style={{ flexShrink: 0, height: compactTradeCard ? '50%' : '56%' }}>
        {/* Background fill + gradient fade (behind the player image) */}
        <div className="absolute inset-0"
          style={{ background: teamGradient ?? (teamColor ? `${teamColor}44` : 'var(--color-fill)') }} />
        {teamGradientOverlay && <div className="absolute inset-0" style={{ background: teamGradientOverlay }} />}
        <div className="absolute inset-0" style={{ background: photoFade }} />

        {primary ? (
          <img
            src={playerImageSrc}
            alt=""
            className="absolute inset-0 w-full h-full"
            style={{ objectFit: 'cover', objectPosition: 'top center' }}
            loading="eager"
            decoding="async"
            onError={e => {
              e.target.style.display = 'none';
            }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <span className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.4)' }}>📋</span>
            <span className="text-[9px] font-bold uppercase tracking-widest"
              style={{ color: 'rgba(255,255,255,0.5)' }}>Draft Pick</span>
          </div>
        )}

        {/* Give / Get badge — top left */}
        {showSideBadge && (
          <div className="absolute top-1.5 left-1.5 lg:top-2 lg:left-2 z-10">
            <span className="text-[8px] lg:text-[10px] font-bold uppercase tracking-widest px-1.5 lg:px-2 py-0.5 lg:py-1 rounded"
              style={{
                background: 'rgba(0,0,0,0.7)',
                color: teamGradientForeground,
                letterSpacing: '0.08em',
                border: `1px solid ${teamColor ? `${teamColor}88` : 'rgba(255,255,255,0.2)'}`,
                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
              }}>
              {side === 'give' ? 'Give' : 'Get'}
            </span>
          </div>
        )}

        {/* Team logo badge — top right */}
        {topRightSlot ? (
          <div className="absolute top-1.5 right-1.5 lg:top-2 lg:right-2 z-10">
            {topRightSlot}
          </div>
        ) : primaryPalette?.logoKey ? (
          <div className="absolute top-1.5 right-1.5 lg:top-2 lg:right-2 z-10">
            <span
              className="w-6 h-6 lg:w-8 lg:h-8 rounded-full flex items-center justify-center"
              style={{
                background: primaryPalette.logoBadgeBg,
                border: `1px solid ${primaryPalette.logoBadgeBorder}`,
                boxShadow: '0 1px 4px rgba(0,0,0,0.28)',
              }}
            >
              <img
                src={`https://a.espncdn.com/i/teamlogos/nfl/500/${primaryPalette.logoKey}.png`}
                aria-hidden="true"
                className="pointer-events-none select-none w-4 h-4 lg:w-6 lg:h-6"
                style={{ objectFit: 'contain', opacity: 0.96, filter: darkMode ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.22))' : 'drop-shadow(0 1px 3px rgba(0,0,0,0.35))' }}
                loading="eager"
                decoding="async"
                onError={e => { e.target.style.display = 'none'; }}
              />
            </span>
          </div>
        ) : null}
      </div>

      {compactTradeCard && primary ? (
        <div
          className="flex flex-1 flex-col justify-between px-3 pb-3 pt-3 min-h-0"
          style={{ background: 'var(--color-bg-secondary)' }}
        >
            <div className="min-w-0">
              <div
                className="truncate whitespace-nowrap text-left text-base font-bold uppercase leading-none lg:text-[17px] xl:text-lg"
                style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.01em' }}
              >
                {primary.name}
              </div>
              <div
                className="mt-1 truncate whitespace-nowrap text-left text-[11px] font-bold uppercase leading-none lg:text-[13px] xl:text-sm"
                style={{ color: 'var(--color-label-secondary)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.1em' }}
              >
                {primary.rank?.posLabel ? `${primary.rank.posLabel}${primary.rank.rank}` : [primary.team, primary.position].filter(Boolean).join(' · ')}
              </div>
          </div>

          <div className="mt-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div
                className="tabular-nums text-2xl font-bold leading-none"
                style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em' }}
              >
                {primary.value != null ? fmtKtcValue(primary.value) : '—'}
              </div>
              <div
                className="mt-0.5 text-[10px] font-bold uppercase leading-none lg:text-[12px]"
                style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.14em' }}
              >
                Value
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div
                className="tabular-nums text-2xl font-bold leading-none"
                style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em' }}
              >
                {primary.ppg > 0 ? primary.ppg.toFixed(1) : '—'}
              </div>
              <div
                className="mt-0.5 text-[10px] font-bold uppercase leading-none lg:text-[12px]"
                style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.14em' }}
              >
                PPG
              </div>
            </div>
          </div>
        </div>
      ) : (
      <>
      {/* ── Name banner ──────────────────────────────────────── */}
      <div className="relative px-2 lg:px-3 py-1 lg:py-1.5 text-center shrink-0"
        style={{
          background: darkMode
            ? 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.58) 15%, rgba(0,0,0,0.66) 50%, rgba(0,0,0,0.58) 85%, transparent 100%)'
            : 'linear-gradient(90deg, transparent 0%, rgba(12,15,20,0.58) 15%, rgba(12,15,20,0.66) 50%, rgba(12,15,20,0.58) 85%, transparent 100%)',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
        <div className="text-[11px] lg:text-[15px] xl:text-base font-bold leading-tight tracking-wide uppercase whitespace-nowrap"
          style={{ color: 'white', textShadow: '0 1px 3px rgba(0,0,0,0.6)', fontFamily: "'Barlow Condensed', sans-serif" }}>
          {primary?.name ?? primaryPick?.label ?? '—'}
        </div>
        {primary && (
          <div className="text-[8px] lg:text-[12px] xl:text-[13px] font-medium tracking-wider uppercase mt-0.5 whitespace-nowrap"
            style={{ color: 'rgba(255,255,255,0.55)' }}>
            {[primary.team, primary.position].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>

      {/* ── Card details ─────────────────────────────────────── */}
      <div className="flex flex-col flex-1 px-2 pb-2 min-h-0 items-center overflow-hidden"
        style={{ background: 'rgba(0,0,0,0.25)' }}>

        {/* ── Featured trade value ─── */}
        {primary?.value != null && (
          <div className="flex items-center justify-center py-1 lg:py-1.5 shrink-0">
            <span className="text-sm lg:text-[18px] font-bold tabular-nums leading-tight"
              style={{ color: 'var(--color-label)' }}>
              {fmtKtcValue(primary.value)}
            </span>
          </div>
        )}

        {primary ? (
          <>
            {/* ── MOBILE stat boxes (lg:hidden) ─── */}
            <div className="flex flex-1 min-h-0 gap-1 w-full lg:hidden overflow-hidden">
              <div className="flex-1 min-h-0 rounded-lg px-1.5 py-1 flex flex-col items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
                {primary?.ppg > 0 ? (
                  <>
                    <span className="text-[13px] font-bold tabular-nums leading-tight" style={{ color: 'white' }}>
                      {primary.ppg.toFixed(1)}
                    </span>
                    <span className="text-[7px] font-medium leading-tight" style={{ color: 'rgba(255,255,255,0.5)' }}>PPG</span>
                  </>
                ) : (
                  <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>—</span>
                )}
              </div>
              {primary?.rank?.posLabel && (
                <div className="flex-1 min-h-0 rounded-lg px-1.5 py-1 flex flex-col items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
                  <span className="text-[13px] font-bold tabular-nums leading-tight" style={{ color: 'rgba(255,255,255,0.9)' }}>
                    {primary.rank.posLabel}{primary.rank.rank}
                  </span>
                  <span className="text-[7px] font-medium leading-tight" style={{ color: 'rgba(255,255,255,0.5)' }}>Rank</span>
                </div>
              )}
            </div>

            {/* ── DESKTOP stat boxes (hidden lg:flex) ─── */}
            <div className="hidden lg:flex flex-1 min-h-0 gap-1.5 w-full overflow-hidden">
              {compactTradeCard ? (
                <>
                  <div className="flex-1 min-h-0 rounded-lg px-1.5 py-1 flex flex-col items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
                    <span className="text-[15px] font-bold tabular-nums leading-tight" style={{ color: 'white' }}>
                      {primary.ppg > 0 ? primary.ppg.toFixed(1) : '—'}
                    </span>
                    <span className="text-[8px] lg:text-[10px] font-medium leading-tight uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.52)' }}>PPG</span>
                  </div>
                  <div className="flex-1 min-h-0 rounded-lg px-1.5 py-1 flex flex-col items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
                    <span className="text-[15px] font-bold tabular-nums leading-tight" style={{ color: 'rgba(255,255,255,0.92)' }}>
                      {primary.rank?.posLabel ? `${primary.rank.posLabel}${primary.rank.rank}` : '—'}
                    </span>
                    <span className="text-[8px] lg:text-[10px] font-medium leading-tight uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.52)' }}>Rank</span>
                  </div>
                </>
              ) : (
              <>
              {/* Left: Game Stats */}
              <div className="flex-1 rounded-lg p-2 flex flex-col gap-0.5" style={{ background: 'rgba(0,0,0,0.35)' }}>
                <span
                  className="text-[9px] font-semibold uppercase tracking-wide mb-0.5"
                  style={{ color: 'rgba(255,255,255,0.6)', fontFamily: "'Figtree', sans-serif" }}
                >
                  Stats
                </span>
                {visibleStatDefs.length > 0 && playerStats ? (
                  visibleStatDefs.map(sd => (
                    <div key={sd.key} className="flex justify-between items-baseline">
                      <span
                        className="text-[10px] font-medium"
                        style={{ color: 'rgba(255,255,255,0.68)', fontFamily: "'Figtree', sans-serif" }}
                      >
                        {sd.label}
                      </span>
                      <span
                        className="text-[11px] font-semibold tabular-nums"
                        style={{ color: 'white', fontFamily: "'Figtree', sans-serif" }}
                      >
                        {fmtStat(playerStats[sd.key])}
                      </span>
                    </div>
                  ))
                ) : (
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Figtree', sans-serif" }}>—</span>
                )}
              </div>

              {/* Right: Fantasy Stats */}
              <div className="flex-1 rounded-lg p-2 flex flex-col gap-0.5" style={{ background: 'rgba(0,0,0,0.35)' }}>
                <span
                  className="text-[9px] font-semibold uppercase tracking-wide mb-0.5"
                  style={{ color: 'rgba(255,255,255,0.6)', fontFamily: "'Figtree', sans-serif" }}
                >
                  Fantasy
                </span>
                {primary ? (
                  <>
                    <div className="flex justify-between items-baseline">
                      <span
                        className="text-[10px] font-medium"
                        style={{ color: 'rgba(255,255,255,0.68)', fontFamily: "'Figtree', sans-serif" }}
                      >
                        PPG
                      </span>
                      <span
                        className="text-[11px] font-semibold tabular-nums"
                        style={{ color: 'white', fontFamily: "'Figtree', sans-serif" }}
                      >
                        {primary.ppg > 0 ? primary.ppg.toFixed(1) : '—'}
                      </span>
                    </div>
                    {primary.rank?.posLabel && (
                      <div className="flex justify-between items-baseline">
                        <span
                          className="text-[10px] font-medium"
                          style={{ color: 'rgba(255,255,255,0.68)', fontFamily: "'Figtree', sans-serif" }}
                        >
                          Rank
                        </span>
                        <span
                          className="text-[11px] font-semibold tabular-nums"
                          style={{ color: 'rgba(255,255,255,0.9)', fontFamily: "'Figtree', sans-serif" }}
                        >
                          {primary.rank.posLabel}{primary.rank.rank}
                        </span>
                      </div>
                    )}
                    {!compactTradeCard && primary.seasonPts > 0 && (
                      <div className="flex justify-between items-baseline">
                        <span
                          className="text-[10px] font-medium"
                          style={{ color: 'rgba(255,255,255,0.68)', fontFamily: "'Figtree', sans-serif" }}
                        >
                          Season
                        </span>
                        <span
                          className="text-[11px] font-semibold tabular-nums"
                          style={{ color: 'white', fontFamily: "'Figtree', sans-serif" }}
                        >
                          {primary.seasonPts.toFixed(1)}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Figtree', sans-serif" }}>—</span>
                )}
              </div>
              </>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 w-full" aria-hidden="true" />
        )}
      </div>
      </>
      )}
    </div>
  );
}

const TRADE_PROPOSAL_CARD_GAP_PX = 10;
const TRADE_PROPOSAL_VISIBLE_CARD_LIMIT = 3;

function getProposalCardSlotStyle(cardCount, isWideTradeProposalLayout, sharedSizingCardCount = cardCount) {
  if (!isWideTradeProposalLayout) {
    return {
      width: 'min(76vw, 30vh, 14rem)',
      maxWidth: '100%',
      flex: '0 0 auto',
    };
  }

  const visibleCards = Math.min(Math.max(sharedSizingCardCount || cardCount || 1, 1), TRADE_PROPOSAL_VISIBLE_CARD_LIMIT);
  const availableCardWidth = `calc((100% - ${(visibleCards - 1) * TRADE_PROPOSAL_CARD_GAP_PX}px) / ${visibleCards})`;
  const cardWidth = `min(15rem, ${availableCardWidth})`;

  return {
    width: cardWidth,
    flex: `1 1 ${cardWidth}`,
    minWidth: 0,
    maxWidth: cardWidth,
  };
}

function getTradeProposalListTransitionStyle({ isDimmed, isStale }) {
  return {
    opacity: 1,
    filter: 'none',
    transform: 'none',
    transition: 'none',
    pointerEvents: isStale ? 'none' : undefined,
  };
}

function useEqualizedCardHeight(enabled, measureKey) {
  const containerRef = useRef(null);
  const cardRefs = useRef(new Map());
  const frameRef = useRef(null);
  const [equalizedCardHeight, setEqualizedCardHeight] = useState(null);

  const registerCardRef = useCallback((slotId, node) => {
    if (!slotId) return;
    if (node) cardRefs.current.set(slotId, node);
    else cardRefs.current.delete(slotId);
  }, []);

  const scheduleMeasurement = useCallback(() => {
    if (!enabled) return;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      let tallest = 0;
      for (const node of cardRefs.current.values()) {
        if (!node) continue;
        tallest = Math.max(tallest, node.offsetHeight || 0);
      }
      const nextHeight = tallest ? Math.ceil(tallest) : null;
      setEqualizedCardHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      cardRefs.current.clear();
      setEqualizedCardHeight(null);
      return;
    }

    scheduleMeasurement();
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [enabled, measureKey, scheduleMeasurement]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onResize = () => scheduleMeasurement();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [enabled, scheduleMeasurement]);

  useEffect(() => {
    if (!enabled || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      scheduleMeasurement();
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [enabled, measureKey, scheduleMeasurement]);

  return {
    containerRef,
    registerCardRef,
    equalizedCardHeight,
  };
}

const EMPTY_PROPOSAL_ASSET_BUCKET = {
  players: [],
  picks: [],
  playerCount: 0,
  pickCount: 0,
};

const EMPTY_PROPOSAL_ASSET_SUMMARY = {
  incoming: EMPTY_PROPOSAL_ASSET_BUCKET,
  outgoing: EMPTY_PROPOSAL_ASSET_BUCKET,
  totalPlayerCount: 0,
};

const proposalAssetSummaryCache = new WeakMap();

function partitionProposalAssets(assets = []) {
  const players = [];
  const picks = [];

  for (const asset of assets) {
    if (asset?.type === 'player') players.push(asset);
    else if (asset?.type === 'pick') picks.push(asset);
  }

  return {
    players,
    picks,
    playerCount: players.length,
    pickCount: picks.length,
  };
}

function getProposalAssetSummary(proposal) {
  if (!proposal || typeof proposal !== 'object') return EMPTY_PROPOSAL_ASSET_SUMMARY;
  const cached = proposalAssetSummaryCache.get(proposal);
  if (cached) return cached;

  const incoming = partitionProposalAssets(proposal.incomingAssets);
  const outgoing = partitionProposalAssets(proposal.outgoingAssets);
  const summary = {
    incoming,
    outgoing,
    totalPlayerCount: incoming.playerCount + outgoing.playerCount,
  };
  proposalAssetSummaryCache.set(proposal, summary);
  return summary;
}

function sortProposalPickAssets(picks = []) {
  return [...picks].sort(compareDraftPickAssets);
}

function buildProposalCardAssets(bucket, renderAllAssetsAsCards) {
  const sortedPicks = sortProposalPickAssets(bucket.picks);
  if (renderAllAssetsAsCards) return [...bucket.players, ...sortedPicks];
  return bucket.playerCount ? bucket.players : sortedPicks;
}

function sumProposalAssetValues(assets = []) {
  return Math.round((assets ?? []).reduce((sum, asset) => sum + Number(asset?.value ?? asset?.val ?? 0), 0));
}

function countProposalAssets(proposal) {
  return (proposal?.incomingAssets?.length ?? 0) + (proposal?.outgoingAssets?.length ?? 0);
}

function getProposalUpgradeDelta(proposal) {
  const contextDelta = Number(proposal?.context?.myUpgradeDelta);
  if (Number.isFinite(contextDelta)) return contextDelta;
  const proposalDelta = Number(proposal?.upgradeDelta);
  return Number.isFinite(proposalDelta) ? proposalDelta : 0;
}

function getProposalOutgoingValue(proposal) {
  return sumProposalAssetValues(proposal?.outgoingAssets ?? []);
}

function getManagerInitials(managerName) {
  const parts = String(managerName ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function getRosterRecordText(roster) {
  const settings = roster?.settings ?? {};
  const wins = settings.wins ?? settings.win;
  const losses = settings.losses ?? settings.loss;
  const ties = settings.ties ?? settings.tie;
  if (!Number.isFinite(Number(wins)) || !Number.isFinite(Number(losses))) return null;
  return `${Number(wins)}-${Number(losses)}${Number(ties) > 0 ? `-${Number(ties)}` : ''}`;
}

function getRosterFantasyPoints(roster) {
  const settings = roster?.settings ?? {};
  const points = Number(settings.fpts ?? 0);
  const decimal = Number(settings.fpts_decimal ?? 0);
  return points + (decimal / 100);
}

function getOrdinal(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const mod100 = numeric % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${numeric}th`;
  switch (numeric % 10) {
    case 1:
      return `${numeric}st`;
    case 2:
      return `${numeric}nd`;
    case 3:
      return `${numeric}rd`;
    default:
      return `${numeric}th`;
  }
}

function buildRosterStandingMap(rosters = []) {
  return new Map(
    [...(rosters ?? [])]
      .sort((a, b) => {
        const aSettings = a?.settings ?? {};
        const bSettings = b?.settings ?? {};
        return Number(bSettings.wins ?? 0) - Number(aSettings.wins ?? 0)
          || Number(aSettings.losses ?? 0) - Number(bSettings.losses ?? 0)
          || getRosterFantasyPoints(b) - getRosterFantasyPoints(a);
      })
      .map((roster, index) => [normalizeRosterId(roster?.roster_id), getOrdinal(index + 1)]),
  );
}

function getUpgradeNeedMeta(proposals = []) {
  const proposal = proposals.find((item) => item?.context?.theirNeedPosition || item?.theirNeedPosition) ?? proposals[0] ?? null;
  const position = proposal?.context?.theirNeedPosition ?? proposal?.theirNeedPosition ?? null;
  if (!position) return 'Upgrade fit';
  const starterGain = Number(proposal?.context?.theirUpgradeDelta ?? 0);
  return starterGain >= 0.3 ? `Needs ${position} help` : `Needs ${position} depth`;
}

function buildManagerMetaLine({ roster, standingMap, rosterId, proposals }) {
  const pieces = [
    getRosterRecordText(roster),
    standingMap?.get(normalizeRosterId(rosterId)),
    getUpgradeNeedMeta(proposals),
  ].filter(Boolean);
  return pieces.length ? pieces.join(' · ') : 'Upgrade fit';
}

function sortUpgradeResultGroups(groups = [], sortMode = 'manager') {
  const prepared = groups.map((entry) => ({
    ...entry,
    group: {
      ...entry.group,
      proposals: [...(entry.group?.proposals ?? [])],
    },
  }));

  if (sortMode === 'best_delta') {
    return prepared
      .map((entry) => ({
        ...entry,
        group: {
          ...entry.group,
          proposals: entry.group.proposals.sort((a, b) => getProposalUpgradeDelta(b) - getProposalUpgradeDelta(a)
            || (b.plausibilityScore ?? 0) - (a.plausibilityScore ?? 0)),
        },
      }))
      .sort((a, b) => getProposalUpgradeDelta(b.group.proposals[0]) - getProposalUpgradeDelta(a.group.proposals[0])
        || (b.group.proposals[0]?.plausibilityScore ?? 0) - (a.group.proposals[0]?.plausibilityScore ?? 0));
  }

  if (sortMode === 'lightest_package') {
    return prepared
      .map((entry) => ({
        ...entry,
        group: {
          ...entry.group,
          proposals: entry.group.proposals.sort((a, b) => getProposalOutgoingValue(a) - getProposalOutgoingValue(b)
            || countProposalAssets(a) - countProposalAssets(b)
            || getProposalUpgradeDelta(b) - getProposalUpgradeDelta(a)),
        },
      }))
      .sort((a, b) => getProposalOutgoingValue(a.group.proposals[0]) - getProposalOutgoingValue(b.group.proposals[0])
        || countProposalAssets(a.group.proposals[0]) - countProposalAssets(b.group.proposals[0])
        || getProposalUpgradeDelta(b.group.proposals[0]) - getProposalUpgradeDelta(a.group.proposals[0]));
  }

  return prepared;
}

function cloneProposalAsset(asset) {
  if (!asset || typeof asset !== 'object') return asset;
  return {
    ...asset,
    pickData: asset.pickData && typeof asset.pickData === 'object'
      ? { ...asset.pickData }
      : asset.pickData,
  };
}

function cloneTradeProposal(proposal) {
  if (!proposal || typeof proposal !== 'object') return proposal;
  return {
    ...proposal,
    incomingAssets: (proposal.incomingAssets ?? []).map(cloneProposalAsset),
    outgoingAssets: (proposal.outgoingAssets ?? []).map(cloneProposalAsset),
  };
}

function buildProposalFilterEntry(proposal) {
  const clonedProposal = cloneTradeProposal(proposal);
  const summary = getProposalAssetSummary(clonedProposal);

  return {
    proposal: clonedProposal,
    outgoingPlayers: summary.outgoing.playerCount,
    incomingPlayers: summary.incoming.playerCount,
    outgoingPicks: summary.outgoing.pickCount,
    incomingPicks: summary.incoming.pickCount,
  };
}

function getProposalDesktopSpan(proposal) {
  const summary = getProposalAssetSummary(proposal);
  const incomingAssetCount = summary.incoming.playerCount + summary.incoming.pickCount;
  const outgoingAssetCount = summary.outgoing.playerCount + summary.outgoing.pickCount;
  return Math.max(incomingAssetCount, outgoingAssetCount) > 1 || summary.totalPlayerCount >= 3 ? 2 : 1;
}

function buildDesktopProposalRows(proposals = []) {
  const rows = [];
  const rowUsage = [];

  for (const proposal of proposals) {
    const span = getProposalDesktopSpan(proposal);
    let targetRowIndex = -1;

    for (let i = 0; i < rowUsage.length; i += 1) {
      if ((rowUsage[i] + span) <= 2) {
        targetRowIndex = i;
        break;
      }
    }

    if (targetRowIndex === -1) {
      rows.push([{ proposal, span }]);
      rowUsage.push(span);
      continue;
    }

    rows[targetRowIndex].push({ proposal, span });
    rowUsage[targetRowIndex] += span;
  }

  return rows;
}

function buildFilteredProposalLayout(entries = [], filters) {
  const filteredProposals = [];
  const desktopRows = [];
  const rowUsage = [];

  for (const entry of entries) {
    if (!matchesProposalFilters(entry, filters)) continue;
    const proposal = entry.proposal;
    filteredProposals.push(proposal);

    const span = getProposalDesktopSpan(proposal);
    let targetRowIndex = -1;
    for (let i = 0; i < rowUsage.length; i += 1) {
      if ((rowUsage[i] + span) <= 2) {
        targetRowIndex = i;
        break;
      }
    }

    if (targetRowIndex === -1) {
      desktopRows.push([{ proposal, span }]);
      rowUsage.push(span);
      continue;
    }

    desktopRows[targetRowIndex].push({ proposal, span });
    rowUsage[targetRowIndex] += span;
  }

  return { filteredProposals, desktopRows };
}

function useDeferredContentReady(deferContent) {
  const [ready, setReady] = useState(() => !deferContent);

  useEffect(() => {
    if (!deferContent) {
      setReady(true);
      return undefined;
    }

    setReady(false);
    const cancelTask = scheduleDeferredTradeTask(() => {
      setReady(true);
    }, 120);
    return () => cancelTask?.();
  }, [deferContent]);

  return ready;
}

const TradeProposalItem = memo(function TradeProposalItem({
  proposal,
  darkMode,
  seasonStats,
  onApplyProposal,
  onOpenPlayer,
  containerClassName = '',
  renderAllAssetsAsCards = false,
  deferInsights = false,
  resultVariant = '',
}) {
  const isUpgradeResult = resultVariant === 'upgrade';
  const {
    incomingCardAssets,
    outgoingCardAssets,
    incomingAssetsForCallout,
    outgoingAssetsForCallout,
    incomingMobilePickCards,
    outgoingMobilePickCards,
  } = useMemo(() => {
    const summary = getProposalAssetSummary(proposal);
    const incomingMixedPackage = summary.incoming.playerCount > 0 && summary.incoming.pickCount > 0;
    const outgoingMixedPackage = summary.outgoing.playerCount > 0 && summary.outgoing.pickCount > 0;
    const renderIncomingAssetsAsCards = renderAllAssetsAsCards || incomingMixedPackage;
    const renderOutgoingAssetsAsCards = renderAllAssetsAsCards || outgoingMixedPackage;
    const incomingCardAssets = buildProposalCardAssets(summary.incoming, renderIncomingAssetsAsCards);
    const outgoingCardAssets = buildProposalCardAssets(summary.outgoing, renderOutgoingAssetsAsCards);
    const incomingCalloutAssets = renderIncomingAssetsAsCards
      ? []
      : (summary.incoming.playerCount ? sortProposalPickAssets(summary.incoming.picks) : []);
    const outgoingCalloutAssets = renderOutgoingAssetsAsCards
      ? []
      : (summary.outgoing.playerCount ? sortProposalPickAssets(summary.outgoing.picks) : []);

    return {
      incomingCardAssets,
      outgoingCardAssets,
      incomingAssetsForCallout: incomingCalloutAssets,
      outgoingAssetsForCallout: outgoingCalloutAssets,
      incomingMobilePickCards: incomingCalloutAssets,
      outgoingMobilePickCards: outgoingCalloutAssets,
    };
  }, [proposal, renderAllAssetsAsCards]);
  const isWideTradeProposalLayout = useMediaQuery('(min-width: 1536px)');
  const isUpgradeSideBySideLayout = useMediaQuery('(min-width: 1200px)');
  const useSideFittedCardSlots = isWideTradeProposalLayout || (isUpgradeResult && isUpgradeSideBySideLayout);
  const sharedProposalSizingCardCount = useSideFittedCardSlots
    ? Math.max(outgoingCardAssets.length, incomingCardAssets.length)
    : null;
  const proposalCardMeasureKey = `${proposal.id}:${incomingCardAssets.length}:${outgoingCardAssets.length}:${incomingMobilePickCards.length}:${outgoingMobilePickCards.length}:${seasonStats ? 'ready' : 'idle'}:${isWideTradeProposalLayout ? 'wide' : 'compact'}`;
  const {
    containerRef: proposalCardsContainerRef,
    registerCardRef,
  } = useEqualizedCardHeight(false, proposalCardMeasureKey);
  const outgoingCardSlotStyle = getProposalCardSlotStyle(outgoingCardAssets.length, useSideFittedCardSlots, sharedProposalSizingCardCount);
  const incomingCardSlotStyle = getProposalCardSlotStyle(incomingCardAssets.length, useSideFittedCardSlots, sharedProposalSizingCardCount);
  const outgoingMobilePickCardSlotStyle = getProposalCardSlotStyle(outgoingMobilePickCards.length, false);
  const incomingMobilePickCardSlotStyle = getProposalCardSlotStyle(incomingMobilePickCards.length, false);
  const insightsReady = useDeferredContentReady(deferInsights);
  const [isHovered, setIsHovered] = useState(false);
  const proposalShadow = isHovered
    ? '0 10px 24px rgba(12,15,20,0.12), 0 3px 8px rgba(12,15,20,0.08)'
    : '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)';
  const outgoingTotal = sumProposalAssetValues(proposal?.outgoingAssets ?? []);
  const incomingTotal = sumProposalAssetValues(proposal?.incomingAssets ?? []);

  if (isUpgradeResult) {
    const summary = getUpgradeProposalSummary(proposal);
    const upgradeDelta = getProposalUpgradeDelta(proposal);
    const renderUpgradeSide = ({ label, tone, assets, slotStyle, side }) => (
      <div className="min-w-0 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span
            className="inline-flex w-max items-center rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
            style={{
              background: tone === 'give' ? 'var(--color-accent-red)' : 'var(--color-accent-green)',
              color: '#fff',
              fontFamily: "'Barlow Condensed', sans-serif",
            }}
          >
            {label}
          </span>
          <span
            className="shrink-0 text-lg font-bold tabular-nums leading-none"
            style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em' }}
          >
            {fmtKtcValue(tone === 'give' ? outgoingTotal : incomingTotal)}
          </span>
        </div>
        <div className="flex flex-col gap-1.5 md:hidden">
          {assets.map((asset) => (
            <ProposalAssetRow
              key={`mobile:${side}:${asset.id}`}
              asset={asset}
              darkMode={darkMode}
              onOpenPlayer={asset.type === 'player' ? onOpenPlayer : null}
            />
          ))}
        </div>
        <div className="hidden flex-row flex-nowrap items-stretch justify-start gap-2.5 overflow-x-auto scrollbar-hide pb-1 md:flex min-[1200px]:justify-center">
          {assets.map((asset, index) => (
            <div
              key={asset.id}
              className="max-w-full self-center flex"
              style={slotStyle}
            >
              <ProposalPlayerCard
                cardRef={(node) => registerCardRef(`${side}:${asset.id}:${index}`, node)}
                player={asset.type === 'player' ? asset : null}
                palette={asset.type === 'player' ? (asset.team ? teamPalette(asset.team, darkMode) : null) : null}
                pick={asset.type === 'pick' ? asset : null}
                side={side}
                showSideBadge={false}
                seasonStats={seasonStats}
                compactTradeCard
                onClick={asset.type === 'player' ? onOpenPlayer : null}
              />
            </div>
          ))}
        </div>
      </div>
    );

    return (
      <div
        className={`rounded-2xl overflow-hidden ${containerClassName}`}
        style={{
          background: 'var(--color-bg)',
          border: `1px solid ${isHovered ? 'var(--color-signature)' : 'var(--color-separator)'}`,
          boxShadow: proposalShadow,
          transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
          transition: 'border-color 160ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 200ms cubic-bezier(0.32, 0.72, 0, 1), transform 200ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocus={() => setIsHovered(true)}
        onBlur={() => setIsHovered(false)}
      >
        <div
          ref={proposalCardsContainerRef}
          className="grid grid-cols-1 gap-3 p-4 min-[1200px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] min-[1200px]:gap-4"
        >
          <div className="min-[1200px]:col-span-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--color-label-tertiary)' }}>
                Upgrade Path
              </div>
              <div className="mt-0.5 truncate text-[12px] font-semibold" style={{ color: 'var(--color-label-secondary)' }}>
                {summary.yourUpgradeTitle}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onApplyProposal?.(proposal)}
              className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}
            >
              Apply
            </button>
          </div>

          {renderUpgradeSide({
            label: 'You Give',
            tone: 'give',
            assets: outgoingCardAssets,
            slotStyle: outgoingCardSlotStyle,
            side: 'give',
          })}

          <div
            className="shrink-0 self-center justify-self-center text-2xl font-bold rotate-90 min-[1200px]:rotate-0"
            style={{ color: 'var(--color-label-quaternary)', fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            ⇄
          </div>

          {renderUpgradeSide({
            label: 'You Get',
            tone: 'get',
            assets: incomingCardAssets,
            slotStyle: incomingCardSlotStyle,
            side: 'get',
          })}
        </div>

        <div
          className="grid grid-cols-1 gap-4 px-4 pb-4 pt-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          style={{ borderTop: '1px dashed var(--color-separator)' }}
        >
          {insightsReady ? (
            <>
              <div className="min-w-0">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--color-label-tertiary)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                  Why It Helps You
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label)' }}>
                  {proposal.whyItHelpsMe}
                </p>
              </div>
              <div className="min-w-0">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--color-label-tertiary)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                  Why It Helps Them
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label)' }}>
                  {proposal.whyItHelpsThem}
                </p>
              </div>
              <div className="md:min-w-[5rem] md:text-right">
                <div className="text-3xl font-bold tabular-nums leading-none" style={{ color: 'var(--color-accent-green)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {fmtSignedPpg(upgradeDelta)}
                </div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-label-tertiary)' }}>
                  Starter PPG
                </div>
              </div>
            </>
          ) : (
            <div className="md:col-span-3 space-y-2">
              <div className="h-3 rounded-full" style={{ width: '52%', background: 'var(--color-fill)' }} />
              <div className="h-3 rounded-full" style={{ width: '82%', background: 'var(--color-fill)' }} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl overflow-hidden ${containerClassName}`}
      style={{
        border: `1px solid ${isHovered ? 'var(--color-signature)' : 'var(--color-separator)'}`,
        boxShadow: proposalShadow,
        transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'border-color 160ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 200ms cubic-bezier(0.32, 0.72, 0, 1), transform 200ms cubic-bezier(0.32, 0.72, 0, 1)',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2.5"
        style={{ background: 'var(--color-fill-secondary)' }}>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--color-label-tertiary)' }}>
            {isUpgradeResult ? 'Upgrade Path' : 'Suggested Deal'}
          </div>
          {isUpgradeResult && (
            <div className="mt-0.5 truncate text-[12px] font-semibold" style={{ color: 'var(--color-label-secondary)' }}>
              Review package fit, then apply it to the Trade Agent.
            </div>
          )}
        </div>
        <button onClick={() => onApplyProposal?.(proposal)}
          className="px-3 py-1 rounded-lg text-xs font-semibold transition-colors shrink-0"
          style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}>
          Apply
        </button>
      </div>

      <div
        ref={proposalCardsContainerRef}
        className="flex flex-col 2xl:flex-row justify-center gap-2.5 px-3 py-3 min-w-0 items-stretch 2xl:items-start"
        style={{ background: 'var(--color-fill)' }}>
        <div className="w-full min-w-0 flex flex-col gap-1.5 2xl:flex-1">
          {isUpgradeResult ? (
            <div className="flex items-center gap-2 px-1 pb-0.5">
              <span className="h-2 w-2 rounded-full" style={{ background: 'var(--color-accent-red)' }} />
              <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--color-label-secondary)' }}>You give</span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 px-1 pb-0.5 md:justify-center">
              <span className="inline-block px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{ background: 'var(--color-accent-red)', color: '#fff' }}>Give</span>
              <span className="text-sm font-bold tabular-nums md:hidden" style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em' }}>
                {fmtKtcValue(outgoingTotal)}
              </span>
            </div>
          )}
          <div className="flex flex-col gap-1.5 md:hidden">
            {outgoingCardAssets.map((asset) => (
              <ProposalAssetRow
                key={`mobile:give:${asset.id}`}
                asset={asset}
                darkMode={darkMode}
                onOpenPlayer={asset.type === 'player' ? onOpenPlayer : null}
              />
            ))}
          </div>
          <div className="hidden flex-row flex-nowrap items-stretch justify-start 2xl:justify-center gap-2.5 overflow-x-auto scrollbar-hide px-1 pb-1 -mx-1 md:flex">
            {outgoingCardAssets.map((asset, index) => (
              <div
                key={asset.id}
                className="max-w-full self-center 2xl:self-stretch flex"
                style={outgoingCardSlotStyle}
              >
                <ProposalPlayerCard
                  cardRef={(node) => registerCardRef(`give:${asset.id}:${index}`, node)}
                  player={asset.type === 'player' ? asset : null}
                  palette={asset.type === 'player' ? (asset.team ? teamPalette(asset.team, darkMode) : null) : null}
                  pick={asset.type === 'pick' ? asset : null}
                  side="give"
                  showSideBadge={false}
                  seasonStats={seasonStats}
                  compactTradeCard
                  onClick={asset.type === 'player' ? onOpenPlayer : null}
                />
              </div>
            ))}
          </div>
          {outgoingMobilePickCards.length > 0 && (
            <div className="hidden flex-row flex-nowrap justify-start 2xl:justify-center gap-2 overflow-x-auto scrollbar-hide px-1 pb-1 -mx-1 md:flex 2xl:hidden">
              {outgoingMobilePickCards.map((asset, index) => (
                <div
                  key={`give-mobile-pick:${asset.id}:${index}`}
                  className="max-w-full self-center flex"
                  style={outgoingMobilePickCardSlotStyle}
                >
                  <ProposalPlayerCard
                    cardRef={(node) => registerCardRef(`give-mobile-pick:${asset.id}:${index}`, node)}
                    player={null}
                    palette={null}
                    pick={asset}
                    side="give"
                    showSideBadge={false}
                    seasonStats={seasonStats}
                    compactTradeCard
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 text-base font-bold self-center rotate-90 2xl:rotate-0"
          style={{ color: 'var(--color-label-quaternary)' }}>
          ⇄
        </div>
        <div className="w-full min-w-0 flex flex-col gap-1.5 2xl:flex-1">
          {isUpgradeResult ? (
            <div className="flex items-center gap-2 px-1 pb-0.5">
              <span className="h-2 w-2 rounded-full" style={{ background: 'var(--color-accent-green)' }} />
              <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--color-label-secondary)' }}>You get</span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 px-1 pb-0.5 md:justify-center">
              <span className="inline-block px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{ background: 'var(--color-accent-green)', color: '#fff' }}>Get</span>
              <span className="text-sm font-bold tabular-nums md:hidden" style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em' }}>
                {fmtKtcValue(incomingTotal)}
              </span>
            </div>
          )}
          <div className="flex flex-col gap-1.5 md:hidden">
            {incomingCardAssets.map((asset) => (
              <ProposalAssetRow
                key={`mobile:get:${asset.id}`}
                asset={asset}
                darkMode={darkMode}
                onOpenPlayer={asset.type === 'player' ? onOpenPlayer : null}
              />
            ))}
          </div>
          <div className="hidden flex-row flex-nowrap items-stretch justify-start 2xl:justify-center gap-2.5 overflow-x-auto scrollbar-hide px-1 pb-1 -mx-1 md:flex">
            {incomingCardAssets.map((asset, index) => (
              <div
                key={asset.id}
                className="max-w-full self-center 2xl:self-stretch flex"
                style={incomingCardSlotStyle}
              >
                <ProposalPlayerCard
                  cardRef={(node) => registerCardRef(`get:${asset.id}:${index}`, node)}
                  player={asset.type === 'player' ? asset : null}
                  palette={asset.type === 'player' ? (asset.team ? teamPalette(asset.team, darkMode) : null) : null}
                  pick={asset.type === 'pick' ? asset : null}
                  side="get"
                  showSideBadge={false}
                  seasonStats={seasonStats}
                  compactTradeCard
                  onClick={asset.type === 'player' ? onOpenPlayer : null}
                />
              </div>
            ))}
          </div>
          {incomingMobilePickCards.length > 0 && (
            <div className="hidden flex-row flex-nowrap justify-start 2xl:justify-center gap-2 overflow-x-auto scrollbar-hide px-1 pb-1 -mx-1 md:flex 2xl:hidden">
              {incomingMobilePickCards.map((asset, index) => (
                <div
                  key={`get-mobile-pick:${asset.id}:${index}`}
                  className="max-w-full self-center flex"
                  style={incomingMobilePickCardSlotStyle}
                >
                  <ProposalPlayerCard
                    cardRef={(node) => registerCardRef(`get-mobile-pick:${asset.id}:${index}`, node)}
                    player={null}
                    palette={null}
                    pick={asset}
                    side="get"
                    showSideBadge={false}
                    seasonStats={seasonStats}
                    compactTradeCard
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {(outgoingAssetsForCallout.length > 0 || incomingAssetsForCallout.length > 0) && (
        <div className="hidden 2xl:flex items-start justify-center gap-2.5 px-3 pb-2"
          style={{ background: 'var(--color-fill)' }}>
          <div className="flex-1 flex flex-wrap justify-center gap-1.5 max-w-[680px]">
            {outgoingAssetsForCallout.map(asset => (
              <span key={asset.id} className="max-w-full">
                <AssetBadge asset={asset} />
              </span>
            ))}
          </div>
          <div className="shrink-0 text-base" style={{ visibility: 'hidden' }}>⇄</div>
          <div className="flex-1 flex flex-wrap justify-center gap-1.5 max-w-[680px]">
            {incomingAssetsForCallout.map(asset => (
              <span key={asset.id} className="max-w-full">
                <AssetBadge asset={asset} />
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 py-3"
        style={{ background: 'var(--color-bg-secondary)', borderTop: '1px solid var(--color-separator-opaque)' }}>
        {insightsReady ? (
          isUpgradeResult ? (
            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--color-fill-secondary)', border: '1px solid var(--color-separator)' }}>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: 'var(--color-label-tertiary)' }}>
                  Why it helps you
                </div>
                <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--color-label)' }}>
                  {proposal.whyItHelpsMe}
                </p>
              </div>
              <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--color-fill-secondary)', border: '1px solid var(--color-separator)' }}>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: 'var(--color-label-tertiary)' }}>
                  Why it helps them
                </div>
                <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--color-label)' }}>
                  {proposal.whyItHelpsThem}
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--color-label)' }}>
                <span className="font-semibold" style={{ color: 'var(--color-label)' }}>You: </span>
                {proposal.whyItHelpsMe}
              </p>
              <p className="text-[12.5px] leading-relaxed mt-1" style={{ color: 'var(--color-label)' }}>
                <span className="font-semibold" style={{ color: 'var(--color-label)' }}>Them: </span>
                {proposal.whyItHelpsThem}
              </p>
            </>
          )
        ) : (
          <div className="space-y-2">
            <div className="h-3.5 rounded-full" style={{ width: '68%', background: 'var(--color-fill)' }} />
            <div className="h-3.5 rounded-full" style={{ width: '92%', background: 'var(--color-fill)' }} />
          </div>
        )}
      </div>
    </div>
  );
});

TradeProposalItem.displayName = 'TradeProposalItem';

const PLAYER_COUNT_FILTER_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: '0', label: '0' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
];

const PLAYER_COUNT_FILTER_OPTIONS_NO_ZERO = PLAYER_COUNT_FILTER_OPTIONS.filter((option) => option.value !== '0');

const PICK_FILTER_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'without', label: 'No Picks' },
  { value: 'with', label: 'With Picks' },
];

const DEFAULT_PROPOSAL_FILTERS = Object.freeze({
  outgoingPlayers: 'any',
  incomingPlayers: 'any',
  outgoingPicks: 'any',
  incomingPicks: 'any',
});

const UPGRADE_RESULT_SORT_OPTIONS = [
  { id: 'manager', label: 'By Manager' },
  { id: 'best_delta', label: 'Best Delta' },
  { id: 'lightest_package', label: 'Lightest Package' },
];

function matchesProposalFilters(entry, filters) {
  if (filters.outgoingPlayers !== 'any' && entry.outgoingPlayers !== Number(filters.outgoingPlayers)) return false;
  if (filters.incomingPlayers !== 'any' && entry.incomingPlayers !== Number(filters.incomingPlayers)) return false;
  if (filters.outgoingPicks === 'with' && entry.outgoingPicks === 0) return false;
  if (filters.outgoingPicks === 'without' && entry.outgoingPicks > 0) return false;
  if (filters.incomingPicks === 'with' && entry.incomingPicks === 0) return false;
  if (filters.incomingPicks === 'without' && entry.incomingPicks > 0) return false;

  return true;
}

function nextProposalFilters(prev, key, value) {
  return {
    ...prev,
    [key]: prev[key] === value ? 'any' : value,
  };
}

const upgradeProposalSummaryCache = new WeakMap();

function getUpgradeProposalSummary(proposal) {
  if (!proposal) {
    return {
      yourUpgradeTitle: 'Current starter → Target',
      yourUpgradeMeta: '0.0 PPG → 0.0 PPG · +0.0',
      yourFallbackMeta: 'Closest fallback: None clear · Depth 0',
      theirSectionLabel: 'Their Benefit',
      theirNeedTitle: 'Need context unavailable',
      theirNeedStarterMeta: 'Starter context unavailable',
      theirNeedUpgradeMeta: 'Starter gain +0.0 PPG',
      fallbackLabel: 'Best Remaining Option After Trade',
      fallbackName: null,
      fallbackMeta: 'They would not have a clear same-position option after moving this player.',
    };
  }

  const cached = upgradeProposalSummaryCache.get(proposal);
  if (cached) return cached;

  const context = proposal.context ?? {};
  const theirUpgradeDelta = Number(context.theirUpgradeDelta ?? 0);
  const theirNeedRoomSizeBefore = context.theirNeedRoomSizeBefore ?? '—';
  const theirNeedRoomSizeAfter = context.theirNeedRoomSizeAfter ?? '—';
  const meaningfulStarterGain = theirUpgradeDelta >= 0.3;
  const shallowRoomBefore = Number.isFinite(context.theirNeedRoomSizeBefore) && Number(context.theirNeedRoomSizeBefore) <= 1;
  const outgoingPlayerAssets = (proposal?.outgoingAssets ?? []).filter((asset) => asset?.type === 'player');
  const outgoingPrimaryAsset = context.theirUpgradeWith ?? outgoingPlayerAssets[0] ?? null;
  const outgoingSamePosCount = Number(context.theirNeedIncomingPlayerCount ?? outgoingPlayerAssets.length);
  const outgoingExtraCount = Number(context.theirNeedAdditionalPlayers ?? Math.max(0, outgoingPlayerAssets.length - 1));
  const theirStarterReferenceName = context.theirNeedStarter?.name ?? 'their weakest starter';
  const theirNeedPositionLabel = context.theirNeedPosition ?? proposal.theirNeedPosition ?? 'Position';
  const theirNeedUpgradeMetaParts = [];
  if (meaningfulStarterGain) {
    theirNeedUpgradeMetaParts.push(`Primary gain ${fmtSignedPpg(theirUpgradeDelta)} PPG vs ${theirStarterReferenceName}`);
  } else {
    theirNeedUpgradeMetaParts.push(`Starter gain ${fmtSignedPpg(theirUpgradeDelta)} PPG vs ${theirStarterReferenceName}`);
  }
  if (outgoingSamePosCount > 0) {
    theirNeedUpgradeMetaParts.push(`Adds ${outgoingSamePosCount} ${theirNeedPositionLabel}${outgoingSamePosCount === 1 ? '' : 's'} to the roster`);
  }
  theirNeedUpgradeMetaParts.push(`${theirNeedPositionLabel} roster ${theirNeedRoomSizeBefore} → ${theirNeedRoomSizeAfter}`);
  const fallbackDeltaReference = context.theirTradeAwayPlayer?.name ?? outgoingPrimaryAsset?.name ?? 'outgoing asset';
  const summary = {
    yourUpgradeTitle: `${context.myUpgradeFrom?.name ?? 'Current starter'} → ${context.myUpgradeTo?.name ?? 'Target'}`,
    yourUpgradeMeta: `${fmtPpg(context.myUpgradeFrom?.ppg ?? 0)} PPG → ${fmtPpg(context.myUpgradeTo?.ppg ?? 0)} PPG · +${fmtPpg(context.myUpgradeDelta ?? proposal.upgradeDelta ?? 0)} vs ${context.myUpgradeFrom?.name ?? 'current starter'}`,
    yourFallbackMeta: context.myNeedFallback
      ? `Closest fallback: ${context.myNeedFallback.name} · ${fmtPpg(context.myNeedFallback.ppg ?? 0)} PPG · Depth ${context.myNeedDepthCurrent ?? '—'}`
      : `Closest fallback: None clear · Depth ${context.myNeedDepthCurrent ?? 0}`,
    theirSectionLabel: meaningfulStarterGain
      ? 'Their Need'
      : shallowRoomBefore
        ? 'Their Depth Need'
        : 'Their Benefit',
    theirNeedTitle: context.theirNeedPosition ?? proposal.theirNeedPosition ?? 'Need context unavailable',
    theirNeedStarterMeta: context.theirNeedStarter
      ? `Weakest current starter: ${context.theirNeedStarter.name} · ${fmtPpg(context.theirNeedStarter.ppg ?? 0)} PPG`
      : 'Starter context unavailable',
    theirNeedUpgradeMeta: theirNeedUpgradeMetaParts.join(' · '),
    fallbackLabel: context.theirTradeAwayPosition ? `Best Remaining ${context.theirTradeAwayPosition} After Trade` : 'Best Remaining Option After Trade',
    fallbackName: context.theirTradeAwayFallback?.name ?? null,
    fallbackMeta: context.theirTradeAwayFallback
      ? `${fmtPpg(context.theirTradeAwayFallback.ppg ?? 0)} PPG · Change vs ${fallbackDeltaReference} ${fmtSignedPpg(context.theirTradeAwayDeltaVsOutgoing ?? 0)} PPG · Depth after ${context.theirTradeAwayDepthAfter ?? '—'}`
      : 'They would not have a clear same-position option after moving this player.',
  };

  upgradeProposalSummaryCache.set(proposal, summary);
  return summary;
}

const TRADE_RESULT_BLOCK_STYLE = {
  contentVisibility: 'auto',
  containIntrinsicSize: '760px',
};

const UpgradeResultGroup = memo(function UpgradeResultGroup({
  group,
  rosterId,
  managerName,
  initial,
  metaLine,
  darkMode,
  seasonStats,
  onApplyProposal,
  onOpenPlayer,
}) {
  return (
    <div
      className="pt-5 first:pt-0"
      style={{ borderTop: '1px solid var(--color-separator)', ...TRADE_RESULT_BLOCK_STYLE }}
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ background: 'var(--color-fill)', color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif" }}>
            {initial}
          </span>
          <div className="min-w-0">
            <div className="text-xl font-bold uppercase truncate" style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em' }}>
              {managerName}
            </div>
            <div className="text-[11px]" style={{ color: 'var(--color-label-secondary)' }}>
              {metaLine}
            </div>
          </div>
        </div>
        <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.14em] shrink-0" style={{ background: 'var(--color-fill)', color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif" }}>
          {group.proposals.length} {group.proposals.length === 1 ? 'Path' : 'Paths'}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {group.proposals.map((proposal) => (
          <div key={proposal.id} style={TRADE_RESULT_BLOCK_STYLE}>
            <TradeProposalItem
              proposal={proposal}
              darkMode={darkMode}
              seasonStats={seasonStats}
              onApplyProposal={onApplyProposal}
              onOpenPlayer={onOpenPlayer}
              renderAllAssetsAsCards
              resultVariant="upgrade"

            />
          </div>
        ))}
      </div>
    </div>
  );
});

UpgradeResultGroup.displayName = 'UpgradeResultGroup';

function useStagedRender(items, initialCount, step = initialCount) {
  const [visibleCount, setVisibleCount] = useState(() => Math.min(initialCount, items.length));
  const minimumVisibleCount = Math.min(initialCount, items.length);
  const effectiveVisibleCount = items.length > 0
    ? Math.min(items.length, Math.max(visibleCount, minimumVisibleCount))
    : 0;

  useEffect(() => {
    setVisibleCount((current) => {
      if (items.length === 0) return 0;
      if (current < minimumVisibleCount) return minimumVisibleCount;
      if (current > items.length) return items.length;
      return current;
    });
  }, [items.length, minimumVisibleCount]);

  useEffect(() => {
    if (effectiveVisibleCount >= items.length) return undefined;

    let cancelled = false;
    let handle = null;
    const schedule = typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'
      ? (callback) => window.requestIdleCallback(callback, { timeout: 180 })
      : (callback) => window.setTimeout(callback, 90);
    const cancel = typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function'
      ? (value) => window.cancelIdleCallback(value)
      : (value) => window.clearTimeout(value);

    const flushNext = () => {
      if (cancelled) return;
      setVisibleCount((current) => {
        if (current >= items.length) return current;
        const next = Math.min(items.length, current + step);
        if (next < items.length) {
          handle = schedule(flushNext);
        }
        return next;
      });
    };

    handle = schedule(flushNext);

    return () => {
      cancelled = true;
      if (handle != null) cancel(handle);
    };
  }, [effectiveVisibleCount, items.length, step]);

  return {
    visibleItems: items.slice(0, effectiveVisibleCount),
    visibleCount: effectiveVisibleCount,
    totalCount: items.length,
    hasMore: effectiveVisibleCount < items.length,
    showAll: () => setVisibleCount(items.length),
  };
}

function StagedRenderStatus({ visibleCount, totalCount, hasMore, onShowAll, label }) {
  if (!totalCount) return null;

  return (
    <div className="flex items-center justify-between gap-3 pt-3">
      <span className="text-[11px] font-medium" style={{ color: 'var(--color-label-tertiary)' }}>
        Showing {visibleCount} of {totalCount} {label}
      </span>
      {hasMore && (
        <button
          onClick={onShowAll}
          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors"
          style={{
            background: 'var(--color-fill)',
            color: 'var(--color-label-secondary)',
            border: '1px solid var(--color-separator)',
          }}
        >
          Show all
        </button>
      )}
    </div>
  );
}

const TradeProposalPanel = memo(function TradeProposalPanel({
  partnerRosterId,
  partnerName,
  tradeProposals,
  surplusTradeProposals,
  activeMode,
  proposalFilters,
  onProposalFiltersChange,
  onModeChange,
  onApplyProposal,
  onOpenPlayer,
  isPreparingPartner = false,
  isShowingStaleResults = false,
}) {
  const { darkMode } = useTheme();
  const { seasonStats } = useSleeperStats();
  const deferredProposalFilters = useDeferredValue(proposalFilters);
  const isProposalFilterPending = proposalFilters.outgoingPlayers !== deferredProposalFilters.outgoingPlayers
    || proposalFilters.incomingPlayers !== deferredProposalFilters.incomingPlayers
    || proposalFilters.outgoingPicks !== deferredProposalFilters.outgoingPicks
    || proposalFilters.incomingPicks !== deferredProposalFilters.incomingPicks;
  useEffect(() => {
    onProposalFiltersChange((prev) => {
      let next = prev;

      if (activeMode === 'needs' && prev.incomingPlayers === '0') {
        next = next === prev ? { ...next } : next;
        next.incomingPlayers = 'any';
      }

      if (activeMode === 'surplus' && prev.outgoingPlayers === '0') {
        next = next === prev ? { ...next } : next;
        next.outgoingPlayers = 'any';
      }

      return next;
    });
  }, [activeMode, onProposalFiltersChange]);
  const activeProposals = activeMode === 'surplus' ? surplusTradeProposals : tradeProposals;
  const proposalFilterEntries = useMemo(
    () => activeProposals.map(buildProposalFilterEntry),
    [activeProposals],
  );
  const { filteredProposals, desktopRows } = useMemo(
    () => buildFilteredProposalLayout(proposalFilterEntries, deferredProposalFilters),
    [proposalFilterEntries, deferredProposalFilters],
  );
  const hasActiveFilters = Object.values(proposalFilters).some((value) => value !== 'any');
  const activeEmptyText = activeMode === 'surplus'
    ? 'No surplus-driven trade ideas are available right now.'
    : 'No need-driven trade ideas are available right now.';
  const outgoingPlayerFilterDisabledValue = activeMode === 'surplus' ? '0' : null;
  const proposalListTransitionStyle = getTradeProposalListTransitionStyle({
    isDimmed: false,
    isStale: isShowingStaleResults,
  });

  return (
    <section className="rounded-2xl p-4" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-separator)' }}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-label-tertiary)' }}>
            Trade Intelligence
          </div>
          <h3 className="text-base font-semibold leading-tight" style={{ color: 'var(--color-label)' }}>
            {partnerRosterId ? `Ideas With ${partnerName || 'This Manager'}` : 'Choose A Trade Partner'}
          </h3>
          <p className="text-xs mt-1 max-w-2xl" style={{ color: 'var(--color-label-secondary)' }}>
            {partnerRosterId
              ? 'Review needs-based or surplus-driven ideas with this manager.'
              : 'Select a manager above to look for trade ideas.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => onModeChange?.('needs')}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
              style={{
                background: activeMode === 'needs' ? 'var(--color-signature)' : 'var(--color-fill)',
                color: activeMode === 'needs' ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
                border: '1px solid var(--color-separator)',
              }}
            >
              Fix Needs
            </button>
            <button
              onClick={() => onModeChange?.('surplus')}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
              style={{
                background: activeMode === 'surplus' ? 'var(--color-signature)' : 'var(--color-fill)',
                color: activeMode === 'surplus' ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
                border: '1px solid var(--color-separator)',
              }}
            >
              Use Surplus
            </button>
          </div>
          {partnerRosterId && (
            <div className="mt-3 grid gap-2 xl:grid-cols-2">
              {[
                { key: 'outgoingPlayers', label: 'You Send Players', options: PLAYER_COUNT_FILTER_OPTIONS },
                { key: 'incomingPlayers', label: 'You Get Players', options: activeMode === 'needs' ? PLAYER_COUNT_FILTER_OPTIONS_NO_ZERO : PLAYER_COUNT_FILTER_OPTIONS },
                { key: 'outgoingPicks', label: 'Picks You Send', options: PICK_FILTER_OPTIONS },
                { key: 'incomingPicks', label: 'Picks You Get', options: PICK_FILTER_OPTIONS },
              ].map((group) => (
                <div key={group.key} className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--color-label-tertiary)' }}>
                    {group.label}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {group.options.map((option) => {
                      const active = proposalFilters[group.key] === option.value;
                      const disabled = group.key === 'outgoingPlayers' && option.value === outgoingPlayerFilterDisabledValue;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            if (disabled) return;
                            onProposalFiltersChange((prev) => nextProposalFilters(prev, group.key, option.value));
                          }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors disabled:cursor-not-allowed"
                          style={{
                            background: active
                              ? 'var(--color-signature)'
                              : disabled
                                ? 'var(--color-bg-tertiary)'
                                : 'var(--color-fill)',
                            color: active
                              ? 'var(--color-signature-fg)'
                              : disabled
                                ? 'var(--color-label-tertiary)'
                                : 'var(--color-label-secondary)',
                            border: '1px solid var(--color-separator)',
                            opacity: disabled ? 0.58 : 1,
                          }}
                          title={disabled ? 'Pick-only outgoing packages are only available in Fix Needs.' : undefined}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 self-start min-h-[30px]">
          {hasActiveFilters && (
            <button
              onClick={() => onProposalFiltersChange(DEFAULT_PROPOSAL_FILTERS)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
              style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)', border: '1px solid var(--color-separator)' }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {!partnerRosterId ? (
        <div className="pt-4 text-sm" style={{ color: 'var(--color-label-secondary)' }}>
          Choose a partner above to generate partner-specific trade ideas.
        </div>
      ) : isPreparingPartner && !activeProposals.length ? (
        <div className="pt-4 text-sm" style={{ color: 'var(--color-label-secondary)' }}>
          Preparing trade ideas for this manager...
        </div>
      ) : !activeProposals.length ? (
        <div className="pt-4 text-sm" style={{ color: 'var(--color-label-secondary)' }}>
          {activeEmptyText}
        </div>
      ) : !filteredProposals.length ? (
        <div className="pt-4 text-sm" style={{ color: 'var(--color-label-secondary)' }}>
          No trade ideas match your current filters.
        </div>
      ) : (
        <>
          <div
            className="pt-4 space-y-3 xl:hidden"
            style={proposalListTransitionStyle}
          >
            {filteredProposals.map((proposal) => (
              <div key={proposal.id}>
                <TradeProposalItem
                  proposal={proposal}
                  darkMode={darkMode}
                  seasonStats={seasonStats}
                  onApplyProposal={onApplyProposal}
                  onOpenPlayer={onOpenPlayer}

                />
              </div>
            ))}
          </div>

          <div
            className="hidden xl:flex xl:flex-col xl:gap-3 xl:pt-4"
            style={proposalListTransitionStyle}
          >
            {desktopRows.map((row, rowIndex) => {
              if (row.length === 1) {
                const [item] = row;
                const centeredSingle = item.span === 1;
                return (
                  <div
                    key={`row-${rowIndex}`}
                    className={centeredSingle ? 'flex justify-center' : 'block'}
                  >
                    <TradeProposalItem
                      key={item.proposal.id}
                      proposal={item.proposal}
                      darkMode={darkMode}
                      seasonStats={seasonStats}
                      onApplyProposal={onApplyProposal}
                      onOpenPlayer={onOpenPlayer}
                      containerClassName="w-full"

                    />
                  </div>
                );
              }

              return (
                <div key={`row-${rowIndex}`} className="grid grid-cols-2 gap-3">
                  {row.map((item) => (
                    <TradeProposalItem
                      key={item.proposal.id}
                      proposal={item.proposal}
                      darkMode={darkMode}
                      seasonStats={seasonStats}
                      onApplyProposal={onApplyProposal}
                      onOpenPlayer={onOpenPlayer}
                      containerClassName="w-full"

                    />
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
});

TradeProposalPanel.displayName = 'TradeProposalPanel';

const UpgradeFinderPage = memo(function UpgradeFinderPage({
  players,
  searchSubmitted,
  searchDirty = false,
  searchPending,
  selectedPlayerId,
  selectedOutgoingPlayerIds,
  tradePostureLevel,
  allowPackages,
  allowOutgoingPicks,
  allowIncomingPicks,
  results,
  postureOptions,
  darkMode,
  seasonStats,
  sleeperPlayers,
  ktcPlayers,
  dynastyKtcPlayers,
  leagueType,
  scoringSettings,
  myRosterId,
  mergedIDPMap,
  playerValueMap,
  rankMap,
  positionalAvgPPG,
  positionalValuePerPPG,
  playerTradeValueDetailsMap,
  getUserDisplayName,
  rosters,
  ownerNameByRosterId,
  onSelectPlayer,
  onToggleOutgoingPlayer,
  onAllowOutgoingPicksChange,
  onAllowIncomingPicksChange,
  onAllowPackagesChange,
  onTradePostureChange,
  onRunSearch,
  onApplyProposal,
  onOpenPlayer,
  onBack,
}) {
  const resultsRef = useRef(null);
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const [offerPickerOpen, setOfferPickerOpen] = useState(false);
  const [upgradeResultSort, setUpgradeResultSort] = useState('manager');

  const playersById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );

  const buildSelectableCard = useCallback((playerId) => {
    if (!playerId) return null;
    const player = playersById.get(playerId);
    if (!player) return null;
    const sleeperPlayer = sleeperPlayers?.[player.id] ?? {};
    const team = sleeperPlayer.team ?? player.team ?? '';
    const position = sleeperPlayer.position ?? player.position ?? '';
    return {
      id: player.id,
      name: sleeperPlayer.full_name ?? player.name,
      displayName: sleeperPlayer.full_name ?? player.name,
      team,
      teamId: team,
      position,
      espnId: sleeperPlayer.espn_id ?? null,
      jersey: sleeperPlayer.number ?? '',
      experience: sleeperPlayer.years_exp != null ? sleeperPlayer.years_exp + 1 : undefined,
      ppg: player.ppg ?? null,
      value: playerValueMap?.get(player.id) ?? null,
      rank: rankMap?.get?.(player.id) ?? rankMap?.[player.id] ?? null,
      palette: team ? teamPalette(team, darkMode) : null,
    };
  }, [darkMode, playerValueMap, playersById, rankMap, sleeperPlayers]);

  const selectedPlayer = useMemo(
    () => buildSelectableCard(selectedPlayerId),
    [buildSelectableCard, selectedPlayerId],
  );

  const hasSelectedOutgoingPlayers = selectedOutgoingPlayerIds.length > 0;
  const outgoingReady = hasSelectedOutgoingPlayers || allowOutgoingPicks;
  const canSearch = Boolean(selectedPlayerId) && outgoingReady;
  const moverRows = useMemo(() => buildUpgradeMoverSuggestions({
    players,
    selectedTargetId: selectedPlayerId,
    selectedOutgoingIds: selectedOutgoingPlayerIds,
    sleeperPlayers,
    playerValueMap,
    rankMap,
    limit: players.length,
  }), [
    players,
    playerValueMap,
    rankMap,
    selectedOutgoingPlayerIds,
    selectedPlayerId,
    sleeperPlayers,
  ]);

  useEffect(() => {
    if (!searchSubmitted || !resultsRef.current) return;
    resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [searchSubmitted, results]);

  const rosterById = useMemo(() => new Map(
    (rosters ?? []).map((roster) => [normalizeRosterId(roster?.roster_id), roster]),
  ), [rosters]);
  const standingMap = useMemo(() => buildRosterStandingMap(rosters), [rosters]);
  const resultGroups = useMemo(() => {
    const mappedGroups = (results?.groups ?? []).map((group) => {
      const rosterId = group.rosterId ?? group.managerRosterId;
      const normalizedRosterId = normalizeRosterId(rosterId);
      const managerName = ownerNameByRosterId?.get(rosterId) ?? 'Unknown Manager';
      return {
        group,
        rosterId,
        managerName,
        initial: getManagerInitials(managerName),
        metaLine: buildManagerMetaLine({
          roster: rosterById.get(normalizedRosterId),
          standingMap,
          rosterId,
          proposals: group.proposals ?? [],
        }),
      };
    });
    return sortUpgradeResultGroups(mappedGroups, upgradeResultSort);
  }, [ownerNameByRosterId, results?.groups, rosterById, standingMap, upgradeResultSort]);
  const stagedResultGroups = useStagedRender(resultGroups, 4, 3);
  const totalUpgradePaths = useMemo(
    () => (results?.groups ?? []).reduce((sum, group) => sum + (group.proposals?.length ?? 0), 0),
    [results?.groups],
  );
  const targetPickerAllowedIds = useMemo(
    () => (targetPickerOpen ? players.map((player) => player.id) : []),
    [players, targetPickerOpen],
  );
  const offerPickerAllowedIds = useMemo(
    () => (offerPickerOpen ? players.filter((player) => player.id !== selectedPlayerId).map((player) => player.id) : []),
    [offerPickerOpen, players, selectedPlayerId],
  );

  return (
    <section className="flex flex-col gap-6">
      <UpgradeBargainingTable
        selectedPlayer={selectedPlayer}
        moverRows={moverRows}
        selectedOutgoingPlayerIds={selectedOutgoingPlayerIds}
        allowOutgoingPicks={allowOutgoingPicks}
        allowIncomingPicks={allowIncomingPicks}
        allowPackages={allowPackages}
        darkMode={darkMode}
        postureOptions={postureOptions}
        tradePostureLevel={tradePostureLevel}
        canSearch={canSearch}
        searchPending={searchPending}
        onChooseTarget={() => setTargetPickerOpen(true)}
        onChangeTarget={() => setTargetPickerOpen(true)}
        onToggleMover={(id) => onToggleOutgoingPlayer(id)}
        onAddPlayers={() => setOfferPickerOpen(true)}
        onClearPlayers={() => selectedOutgoingPlayerIds.forEach((id) => onToggleOutgoingPlayer(id))}
        onAllowOutgoingPicksChange={onAllowOutgoingPicksChange}
        onAllowIncomingPicksChange={onAllowIncomingPicksChange}
        onAllowPackagesChange={onAllowPackagesChange}
        onPostureChange={onTradePostureChange}
        onRunSearch={onRunSearch}
        onOpenPlayer={onOpenPlayer}
      />

      {searchSubmitted && (
        <section ref={resultsRef}>
          {searchPending && (
            <div
              className="mb-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold"
              style={{
                background: 'var(--color-fill)',
                color: 'var(--color-label-secondary)',
                border: '1px solid var(--color-separator)',
              }}
            >
              <Spinner size="w-3.5 h-3.5" />
              Refreshing matches...
            </div>
          )}
          {searchDirty && !searchPending && (
            <div
              className="mb-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold"
              style={{
                background: 'var(--color-fill)',
                color: 'var(--color-label-secondary)',
                border: '1px solid var(--color-separator)',
              }}
            >
              Current filters changed. Run search again to refresh these results.
            </div>
          )}
          {!resultGroups.length ? (
            <div className="rounded-2xl px-5 py-8 text-center" style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)', border: '1px solid var(--color-separator)' }}>
              <div className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>No feasible upgrade paths found.</div>
              <div className="text-xs mt-2">
                Try widening your outgoing player pool, opening up pick intent, or moving the posture closer to fair.
              </div>
            </div>
          ) : (
            <div
              className="rounded-2xl p-4 lg:p-5"
              style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-separator)',
                opacity: searchPending ? 0.72 : 1,
                transition: 'opacity 160ms cubic-bezier(0.32, 0.72, 0, 1)',
              }}
            >
              <div className="mb-5 flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-center lg:justify-between" style={{ borderColor: 'var(--color-separator)' }}>
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-center gap-3 text-3xl font-bold uppercase leading-none" style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em' }}>
                    Upgrade Paths Found
                    <span
                      className="inline-flex min-w-9 items-center justify-center rounded-md px-2 py-1 text-base font-semibold tabular-nums"
                      style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)', fontFamily: "'Figtree', sans-serif", letterSpacing: 0 }}
                    >
                      {totalUpgradePaths}
                    </span>
                  </h3>
                  <div className="mt-2 text-sm" style={{ color: 'var(--color-label-secondary)' }}>
                    {results?.targetPlayer
                      ? `Showing matches for ${results.targetPlayer.label ?? results.targetPlayer.name}.`
                      : selectedPlayer
                        ? `Showing the latest search around ${selectedPlayer.name}.`
                        : 'Showing the latest upgrade search results.'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {UPGRADE_RESULT_SORT_OPTIONS.map((option) => {
                    const active = upgradeResultSort === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setUpgradeResultSort(option.id)}
                        className="rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors"
                        style={{
                          background: active ? 'var(--color-signature)' : 'var(--color-bg-secondary)',
                          color: active ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
                          border: '1px solid var(--color-separator)',
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-5">
                {stagedResultGroups.visibleItems.map(({ group, rosterId, managerName, initial, metaLine }) => {
                  return (
                    <UpgradeResultGroup
                      key={rosterId}
                      group={group}
                      rosterId={rosterId}
                      managerName={managerName}
                      initial={initial}
                      metaLine={metaLine}
                      darkMode={darkMode}
                      seasonStats={seasonStats}
                      onApplyProposal={onApplyProposal}
                      onOpenPlayer={onOpenPlayer}
                    />
                  );
                })}
              </div>
              <StagedRenderStatus
                visibleCount={stagedResultGroups.visibleCount}
                totalCount={stagedResultGroups.totalCount}
                hasMore={stagedResultGroups.hasMore}
                onShowAll={stagedResultGroups.showAll}
                label="manager groups"
              />
            </div>
          )}
        </section>
      )}

      {targetPickerOpen && (
        <TradeRosterPicker
          rosterId={myRosterId}
          rosters={rosters}
          sleeperPlayers={sleeperPlayers}
          ktcPlayers={ktcPlayers}
          dynastyKtcPlayers={dynastyKtcPlayers}
          leagueType={leagueType}
          excludeIds={[]}
          allowedIds={targetPickerAllowedIds}
          seasonStats={seasonStats}
          scoringSettings={scoringSettings}
          getUserDisplayName={getUserDisplayName}
          myRosterId={myRosterId}
          includeOwnRoster={false}
          currentTotal={0}
          activeRosterId={myRosterId}
          mergedIDPMap={mergedIDPMap}
          sharedRankMap={rankMap}
          sharedPositionalAvgPPG={positionalAvgPPG}
          sharedPositionalValuePerPPG={positionalValuePerPPG}
          sharedPlayerTradeValueDetailsMap={playerTradeValueDetailsMap}
          onSelect={(result) => {
            const nextId = typeof result === 'object' ? result.id : result;
            onSelectPlayer(nextId);
            setTargetPickerOpen(false);
          }}
          onClose={() => setTargetPickerOpen(false)}
        />
      )}

      {offerPickerOpen && (
        <TradeRosterPicker
          rosterId={myRosterId}
          rosters={rosters}
          sleeperPlayers={sleeperPlayers}
          ktcPlayers={ktcPlayers}
          dynastyKtcPlayers={dynastyKtcPlayers}
          leagueType={leagueType}
          excludeIds={selectedOutgoingPlayerIds}
          allowedIds={offerPickerAllowedIds}
          seasonStats={seasonStats}
          scoringSettings={scoringSettings}
          getUserDisplayName={getUserDisplayName}
          myRosterId={myRosterId}
          includeOwnRoster={false}
          currentTotal={0}
          activeRosterId={myRosterId}
          mergedIDPMap={mergedIDPMap}
          sharedRankMap={rankMap}
          sharedPositionalAvgPPG={positionalAvgPPG}
          sharedPositionalValuePerPPG={positionalValuePerPPG}
          sharedPlayerTradeValueDetailsMap={playerTradeValueDetailsMap}
          onSelect={(result) => {
            const nextId = typeof result === 'object' ? result.id : result;
            onToggleOutgoingPlayer(nextId);
          }}
          onClose={() => setOfferPickerOpen(false)}
        />
      )}
    </section>
  );
});

UpgradeFinderPage.displayName = 'UpgradeFinderPage';

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

// ── ValuationInfoSheet ────────────────────────────────────────────────────────

function ValuationInfoSheet({ format, leagueType, scoringSettings, rosterPositions, multipliers, isAdjusted, onClose }) {
  const rec           = scoringSettings?.rec ?? 0.5;
  const passTd        = scoringSettings?.pass_td ?? 4;
  const teBonus       = scoringSettings?.bonus_rec_te ?? 0;
  const rbBonus       = scoringSettings?.bonus_rec_rb ?? 0;
  const wrBonus       = scoringSettings?.bonus_rec_wr ?? 0;
  const rushAttBonus  = scoringSettings?.bonus_rush_att ?? 0;
  const passInt       = scoringSettings?.pass_int ?? -2;
  const passIntTd     = scoringSettings?.pass_int_td ?? 0;
  const fumLost       = scoringSettings?.fum_lost ?? -2;
  const bonusPassYd300 = scoringSettings?.bonus_pass_yd_300 ?? 0;
  const bonusPassYd400 = scoringSettings?.bonus_pass_yd_400 ?? 0;
  const bonusRushYd100 = scoringSettings?.bonus_rush_yd_100 ?? 0;
  const bonusRushYd200 = scoringSettings?.bonus_rush_yd_200 ?? 0;
  const bonusRecYd100  = scoringSettings?.bonus_rec_yd_100 ?? 0;
  const bonusRecYd200  = scoringSettings?.bonus_rec_yd_200 ?? 0;
  const rushFd        = scoringSettings?.rush_fd ?? 0;
  const recFd         = scoringSettings?.rec_fd ?? 0;
  const bonusPassTd40p  = scoringSettings?.bonus_pass_td_40p  ?? 0;
  const bonusPassTd50p  = scoringSettings?.bonus_pass_td_50p  ?? 0;
  const bonusPassCmp40p = scoringSettings?.bonus_pass_cmp_40p ?? 0;
  const bonusRushTd40p  = scoringSettings?.bonus_rush_td_40p  ?? 0;
  const bonusRushTd50p  = scoringSettings?.bonus_rush_td_50p  ?? 0;
  const bonusRecTd40p   = scoringSettings?.bonus_rec_td_40p   ?? 0;
  const bonusRecTd50p   = scoringSettings?.bonus_rec_td_50p   ?? 0;
  const bonusRec40p     = scoringSettings?.bonus_rec_40p      ?? 0;
  const bonusRush40p    = scoringSettings?.bonus_rush_40p     ?? 0;
  const { hasIDP, hasDST } = detectLeagueDefensiveType(rosterPositions);

  // Count TE/RB/WR starters for the scarcity note
  const posCounts = {};
  for (const p of rosterPositions ?? []) posCounts[p] = (posCounts[p] ?? 0) + 1;

  const idpRows = [
    { key: 'idp_tkl', label: 'Tackles', value: scoringSettings?.idp_tkl ?? 0, baseline: '0 pts' },
    { key: 'idp_tkl_solo', label: 'Solo tackles', value: scoringSettings?.idp_tkl_solo ?? 0, baseline: '0 pts' },
    { key: 'idp_tkl_ast', label: 'Assisted tackles', value: scoringSettings?.idp_tkl_ast ?? 0, baseline: '0 pts' },
    { key: 'idp_tkl_loss', label: 'Tackles for loss', value: scoringSettings?.idp_tkl_loss ?? 0, baseline: '0 pts' },
    { key: 'idp_sack', label: 'Sacks', value: scoringSettings?.idp_sack ?? 0, baseline: '0 pts' },
    { key: 'idp_sack_yd', label: 'Sack yards', value: scoringSettings?.idp_sack_yd ?? 0, baseline: '0 pts' },
    { key: 'idp_int', label: 'Interceptions', value: scoringSettings?.idp_int ?? 0, baseline: '0 pts' },
    { key: 'idp_int_ret_yd', label: 'INT return yards', value: scoringSettings?.idp_int_ret_yd ?? 0, baseline: '0 pts' },
    { key: 'idp_int_td', label: 'INT TDs', value: scoringSettings?.idp_int_td ?? 0, baseline: '0 pts' },
    { key: 'idp_ff', label: 'Forced fumbles', value: scoringSettings?.idp_ff ?? 0, baseline: '0 pts' },
    { key: 'idp_fr', label: 'Fumble recoveries', value: scoringSettings?.idp_fr ?? 0, baseline: '0 pts' },
    { key: 'idp_fr_yd', label: 'Fumble return yards', value: scoringSettings?.idp_fr_yd ?? 0, baseline: '0 pts' },
    { key: 'idp_fr_td', label: 'Fumble return TDs', value: scoringSettings?.idp_fr_td ?? 0, baseline: '0 pts' },
    { key: 'idp_def_td', label: 'Defensive TDs', value: scoringSettings?.idp_def_td ?? 0, baseline: '0 pts' },
    { key: 'idp_pd', label: 'Passes defended', value: scoringSettings?.idp_pd ?? 0, baseline: '0 pts' },
    { key: 'idp_qbhit', label: 'QB hits', value: scoringSettings?.idp_qbhit ?? 0, baseline: '0 pts' },
    { key: 'idp_safety', label: 'Safeties', value: scoringSettings?.idp_safety ?? 0, baseline: '0 pts' },
    { key: 'idp_blk_kick', label: 'Blocked kicks', value: scoringSettings?.idp_blk_kick ?? 0, baseline: '0 pts' },
    { key: 'bonus_sack_2p', label: '2+ sack bonus', value: scoringSettings?.bonus_sack_2p ?? 0, baseline: 'None' },
    { key: 'bonus_tkl_10p', label: '10+ tackle bonus', value: scoringSettings?.bonus_tkl_10p ?? 0, baseline: 'None' },
    { key: 'idp_pass_def_3p', label: '3+ pass defense bonus', value: scoringSettings?.idp_pass_def_3p ?? 0, baseline: 'None' },
  ].filter((row) => row.value !== 0);

  const dstRows = [
    { key: 'def_td', label: 'Team D/ST TDs', value: scoringSettings?.def_td ?? 0, baseline: '0 pts' },
    { key: 'sack', label: 'Team sacks', value: scoringSettings?.sack ?? 0, baseline: '0 pts' },
    { key: 'int', label: 'Team INTs', value: scoringSettings?.int ?? 0, baseline: '0 pts' },
    { key: 'safe', label: 'Team safeties', value: scoringSettings?.safe ?? 0, baseline: '0 pts' },
    { key: 'def_3_and_out', label: '3-and-outs', value: scoringSettings?.def_3_and_out ?? 0, baseline: '0 pts' },
    { key: 'def_4_and_stop', label: '4th-down stops', value: scoringSettings?.def_4_and_stop ?? 0, baseline: '0 pts' },
    { key: 'def_forced_punts', label: 'Forced punts', value: scoringSettings?.def_forced_punts ?? 0, baseline: '0 pts' },
    { key: 'def_pass_def', label: 'Team pass defenses', value: scoringSettings?.def_pass_def ?? 0, baseline: '0 pts' },
    { key: 'pts_allow', label: 'Points allowed', value: scoringSettings?.pts_allow ?? 0, baseline: '0 pts' },
    { key: 'pts_allow_0', label: 'Points allowed: 0', value: scoringSettings?.pts_allow_0 ?? 0, baseline: '0 pts' },
    { key: 'pts_allow_1_6', label: 'Points allowed: 1-6', value: scoringSettings?.pts_allow_1_6 ?? 0, baseline: '0 pts' },
    { key: 'pts_allow_7_13', label: 'Points allowed: 7-13', value: scoringSettings?.pts_allow_7_13 ?? 0, baseline: '0 pts' },
    { key: 'pts_allow_14_20', label: 'Points allowed: 14-20', value: scoringSettings?.pts_allow_14_20 ?? 0, baseline: '0 pts' },
    { key: 'pts_allow_21_27', label: 'Points allowed: 21-27', value: scoringSettings?.pts_allow_21_27 ?? 0, baseline: '0 pts' },
    { key: 'pts_allow_28_34', label: 'Points allowed: 28-34', value: scoringSettings?.pts_allow_28_34 ?? 0, baseline: '0 pts' },
    { key: 'pts_allow_35p', label: 'Points allowed: 35+', value: scoringSettings?.pts_allow_35p ?? 0, baseline: '0 pts' },
  ].filter((row) => row.value !== 0);

  const showIDPDetails = hasIDP && idpRows.length > 0;
  const showDSTDetails = hasDST && dstRows.length > 0;
  const showDefenseSection = showIDPDetails || showDSTDetails || hasIDP || hasDST;

  function pct(mult) {
    const delta = Math.round((mult - 1) * 100);
    if (delta === 0) return null;
    return delta > 0 ? `+${delta}%` : `${delta}%`;
  }

  const positions = [
    { pos: 'QB', label: 'Quarterback' },
    { pos: 'RB', label: 'Running Back' },
    { pos: 'WR', label: 'Wide Receiver' },
    { pos: 'TE', label: 'Tight End' },
  ];

  return (
    <Modal
      onClose={onClose}
      containerClassName="flex flex-col"
      containerStyle={{ background: 'var(--color-bg)', maxHeight: '80vh', maxWidth: 560 }}
      mobileSheet
      ariaLabel="How values are calculated"
    >

        {/* Handle + header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3"
          style={{ borderBottom: '1px solid var(--color-separator)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
            How Values Are Calculated
          </span>
          <button onClick={onClose} className="text-xs font-semibold"
            style={{ color: 'var(--color-accent)' }}>Done</button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-5 overflow-y-auto">

          {/* KTC section */}
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-widest"
              style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
              KeepTradeCut (KTC)
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label)' }}>
              Trade values are sourced from{' '}
              <span className="font-semibold">KeepTradeCut</span>, a community-driven
              platform where dynasty managers submit real trade offers to establish
              consensus market values. Values are on a <span className="font-semibold">0–10,000</span> scale.
            </p>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
              KTC publishes separate value sets for{' '}
              <span className="font-semibold">Dynasty vs Redraft</span> leagues and{' '}
              <span className="font-semibold">1QB vs Superflex</span> formats. This app
              automatically selects the correct set based on your league's Sleeper settings.
            </p>
            <div className="rounded-xl px-3 py-2.5 flex gap-4"
              style={{ background: 'var(--color-fill)' }}>
              <InfoPill label="Format" value={format === 'dynasty' ? 'Dynasty' : 'Redraft'} />
              <InfoPill label="League type" value={leagueType === 'sf' ? 'Superflex' : '1QB'} />
            </div>
          </section>

          {/* Baseline section */}
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-widest"
              style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
              KTC Baseline Assumptions
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
              KTC's community values are built from a broad mix of leagues. Their implicit baseline is:
            </p>
            <div className="flex flex-col gap-1">
              {[
                ['Reception scoring', '½ PPR (0.5 pts/catch)'],
                ['Passing touchdowns', '4 pts per TD'],
                ['Position reception bonuses', 'None'],
                ['Per-carry bonus', 'None'],
                ['Big-play TD/completion bonuses', 'None'],
                ['Roster construction', '1 TE, standard flex'],
              ].map(([label, val]) => (
                <div key={label} className="flex items-center justify-between py-1.5 px-3 rounded-lg"
                  style={{ background: 'var(--color-fill)' }}>
                  <span className="text-xs" style={{ color: 'var(--color-label-secondary)' }}>{label}</span>
                  <span className="text-xs font-semibold" style={{ color: 'var(--color-label-tertiary)' }}>{val}</span>
                </div>
              ))}
            </div>
          </section>

          {/* League adjustments section */}
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-widest"
              style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
              Your League's Adjustments
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
              {isAdjusted
                ? 'Your league\'s scoring settings differ from KTC\'s baseline. Positional multipliers are applied automatically based on the live settings fetched from Sleeper:'
                : 'Your league\'s settings match KTC\'s baseline closely — no adjustments are applied.'}
            </p>

            {/* Scoring settings */}
            <div className="flex flex-col gap-1">
              <AdjustmentRow
                label="Reception scoring"
                leagueValue={`${rec} pts/catch`}
                baseline="0.5 pts/catch"
                note={rec !== 0.5 ? `WR values ${pct(multipliers.WR) ?? 'unchanged'}, RB values ${pct(multipliers.RB) ?? 'unchanged'} vs baseline` : null}
              />
              <AdjustmentRow
                label="Passing touchdowns"
                leagueValue={`${passTd} pts/TD`}
                baseline="4 pts/TD"
                note={passTd !== 4 ? `QB values ${pct(multipliers.QB) ?? 'unchanged'} vs baseline` : null}
              />
              <AdjustmentRow
                label="TE premium"
                leagueValue={teBonus > 0 ? `+${teBonus} pts/catch` : 'None'}
                baseline="None"
                note={teBonus > 0 ? `TE values ${pct(multipliers.TE) ?? 'unchanged'} vs baseline` : null}
              />
              {rbBonus > 0 && (
                <AdjustmentRow
                  label="RB reception bonus"
                  leagueValue={`+${rbBonus} pts/catch`}
                  baseline="None"
                  note={`RB values ${pct(multipliers.RB) ?? 'unchanged'} vs baseline (includes all RB adjustments)`}
                />
              )}
              {wrBonus > 0 && (
                <AdjustmentRow
                  label="WR reception bonus"
                  leagueValue={`+${wrBonus} pts/catch`}
                  baseline="None"
                  note={`WR values ${pct(multipliers.WR) ?? 'unchanged'} vs baseline (includes all WR adjustments)`}
                />
              )}
              {rushAttBonus > 0 && (
                <AdjustmentRow
                  label="Carry bonus"
                  leagueValue={`+${rushAttBonus} pts/carry`}
                  baseline="None"
                  note={`RB values ${pct(multipliers.RB) ?? 'unchanged'} vs baseline (includes all RB adjustments)`}
                />
              )}
              {passInt < -2 && (
                <AdjustmentRow
                  label="Interception penalty"
                  leagueValue={`${passInt} pts/INT`}
                  baseline="-2 pts/INT"
                  note={`QB values reduced vs baseline`}
                />
              )}
              {passIntTd < 0 && (
                <AdjustmentRow
                  label="Pick 6 thrown"
                  leagueValue={`${passIntTd} pts`}
                  baseline="None"
                  note={`QB values reduced for turnover risk`}
                />
              )}
              {fumLost < -2 && (
                <AdjustmentRow
                  label="Fumble lost penalty"
                  leagueValue={`${fumLost} pts/fumble`}
                  baseline="-2 pts/fumble"
                  note={`RB values reduced vs baseline`}
                />
              )}
              {(bonusPassYd300 > 0 || bonusPassYd400 > 0) && (
                <AdjustmentRow
                  label="Big passing game bonus"
                  leagueValue={[
                    bonusPassYd300 > 0 && `+${bonusPassYd300} at 300 yds`,
                    bonusPassYd400 > 0 && `+${bonusPassYd400} at 400 yds`,
                  ].filter(Boolean).join(', ')}
                  baseline="None"
                  note={`QB values boosted for volume/big-game upside`}
                />
              )}
              {(bonusRushYd100 > 0 || bonusRushYd200 > 0) && (
                <AdjustmentRow
                  label="Big rushing game bonus"
                  leagueValue={[
                    bonusRushYd100 > 0 && `+${bonusRushYd100} at 100 yds`,
                    bonusRushYd200 > 0 && `+${bonusRushYd200} at 200 yds`,
                  ].filter(Boolean).join(', ')}
                  baseline="None"
                  note={`Workhorse RB values boosted`}
                />
              )}
              {(bonusRecYd100 > 0 || bonusRecYd200 > 0) && (
                <AdjustmentRow
                  label="Big receiving game bonus"
                  leagueValue={[
                    bonusRecYd100 > 0 && `+${bonusRecYd100} at 100 yds`,
                    bonusRecYd200 > 0 && `+${bonusRecYd200} at 200 yds`,
                  ].filter(Boolean).join(', ')}
                  baseline="None"
                  note={`WR and TE values boosted for target volume`}
                />
              )}
              {rushFd > 0 && (
                <AdjustmentRow
                  label="Rush first down bonus"
                  leagueValue={`+${rushFd} pts/FD`}
                  baseline="None"
                  note={`RB values boosted for efficiency`}
                />
              )}
              {recFd > 0 && (
                <AdjustmentRow
                  label="Receiving first down bonus"
                  leagueValue={`+${recFd} pts/FD`}
                  baseline="None"
                  note={`WR and TE values boosted for route-running volume`}
                />
              )}
              {(bonusPassTd40p > 0 || bonusPassTd50p > 0 || bonusPassCmp40p > 0) && (
                <AdjustmentRow
                  label="Big passing play bonus"
                  leagueValue={[
                    bonusPassTd40p  > 0 && `+${bonusPassTd40p} per 40+ yd TD`,
                    bonusPassTd50p  > 0 && `+${bonusPassTd50p} per 50+ yd TD`,
                    bonusPassCmp40p > 0 && `+${bonusPassCmp40p} per 40+ yd cmp`,
                  ].filter(Boolean).join(', ')}
                  baseline="None"
                  note="QB values boosted for explosive play upside"
                />
              )}
              {(bonusRushTd40p > 0 || bonusRushTd50p > 0 || bonusRush40p > 0) && (
                <AdjustmentRow
                  label="Big rushing play bonus"
                  leagueValue={[
                    bonusRushTd40p > 0 && `+${bonusRushTd40p} per 40+ yd TD`,
                    bonusRushTd50p > 0 && `+${bonusRushTd50p} per 50+ yd TD`,
                    bonusRush40p   > 0 && `+${bonusRush40p} per 40+ yd run`,
                  ].filter(Boolean).join(', ')}
                  baseline="None"
                  note="RB values boosted for breakaway speed"
                />
              )}
              {(bonusRecTd40p > 0 || bonusRecTd50p > 0 || bonusRec40p > 0) && (
                <AdjustmentRow
                  label="Big receiving play bonus"
                  leagueValue={[
                    bonusRecTd40p > 0 && `+${bonusRecTd40p} per 40+ yd TD`,
                    bonusRecTd50p > 0 && `+${bonusRecTd50p} per 50+ yd TD`,
                    bonusRec40p   > 0 && `+${bonusRec40p} per 40+ yd rec`,
                  ].filter(Boolean).join(', ')}
                  baseline="None"
                  note="WR and TE values boosted for big-play ability"
                />
              )}
              {(posCounts.TE ?? 0) >= 2 && (
                <AdjustmentRow
                  label="TE starter spots"
                  leagueValue={`${posCounts.TE} starters`}
                  baseline="1 starter"
                  note={`Additional TE scarcity premium applied`}
                />
              )}
              {(posCounts.RB ?? 0) >= 3 && (
                <AdjustmentRow
                  label="RB starter spots"
                  leagueValue={`${posCounts.RB} starters`}
                  baseline="2 starters"
                  note={`Additional RB scarcity premium applied`}
                />
              )}
              {(posCounts.WR ?? 0) >= 4 && (
                <AdjustmentRow
                  label="WR starter spots"
                  leagueValue={`${posCounts.WR} starters`}
                  baseline="3 starters"
                  note={`Additional WR scarcity premium applied`}
                />
              )}
            </div>

            {/* Position multiplier summary */}
            {isAdjusted && (
              <div className="rounded-xl overflow-hidden mt-1"
                style={{ border: '1px solid var(--color-separator)' }}>
                <div className="px-3 py-2 flex items-center"
                  style={{ background: 'var(--color-fill)', borderBottom: '1px solid var(--color-separator)' }}>
                  <span className="flex-1 text-xs font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>Position</span>
                  <span className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>Adjustment</span>
                </div>
                {positions.map(({ pos, label }) => {
                  const delta = pct(multipliers[pos] ?? 1);
                  return (
                    <div key={pos} className="px-3 py-2.5 flex items-center"
                      style={{ borderBottom: '1px solid var(--color-separator)' }}>
                      <span className="flex-1 text-sm" style={{ color: 'var(--color-label)' }}>{label}</span>
                      <span className="text-sm font-semibold tabular-nums"
                        style={{ color: delta ? (delta.startsWith('+') ? 'var(--color-accent-green, #22c55e)' : 'var(--color-destructive, #ef4444)') : 'var(--color-label-quaternary)' }}>
                        {delta ?? 'No change'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {showDefenseSection && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-bold uppercase tracking-widest"
                style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
                Defensive Scoring
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
                Defensive values are based on <span className="font-semibold">live season production in your Sleeper scoring</span>,
                then translated onto the same value-per-PPG scale as offensive players.
              </p>
              <div className="rounded-xl px-3 py-2.5 flex gap-4"
                style={{ background: 'var(--color-fill)' }}>
                <InfoPill label="IDP" value={hasIDP ? 'Enabled' : 'Off'} />
                <InfoPill label="D/ST" value={hasDST ? 'Enabled' : 'Off'} />
              </div>

              {showIDPDetails && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-label-tertiary)' }}>
                    IDP scoring used in valuations
                  </span>
                  {idpRows.map((row) => (
                    <AdjustmentRow
                      key={`idp-${row.label}`}
                      label={row.label}
                      leagueValue={formatScoringSettingValue(row.key, row.value, { zero: row.baseline, defaultSuffix: 'pts' })}
                      baseline={row.baseline}
                      note={null}
                    />
                  ))}
                </div>
              )}

              {showDSTDetails && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-label-tertiary)' }}>
                    D/ST scoring used in valuations
                  </span>
                  {dstRows.map((row) => (
                    <AdjustmentRow
                      key={`dst-${row.label}`}
                      label={row.label}
                      leagueValue={formatScoringSettingValue(row.key, row.value, { zero: row.baseline, defaultSuffix: 'pts' })}
                      baseline={row.baseline}
                      note={null}
                    />
                  ))}
                </div>
              )}

              {!showIDPDetails && !showDSTDetails && (
                <div className="rounded-lg px-3 py-2.5"
                  style={{ background: 'var(--color-fill)' }}>
                  <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>
                    Defensive roster slots are enabled, but all tracked defensive scoring weights are currently zero.
                  </span>
                </div>
              )}
            </section>
          )}

          {/* Season performance adjustments section */}
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-bold uppercase tracking-widest"
              style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
              Season Performance Adjustments
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
              After scoring multipliers are applied, two additional layers adjust each player's
              value based on <span className="font-semibold">how they're actually performing in your league</span> this season.
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-label-tertiary)' }}>PPG Adjustment</span>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
                  Each player's season average PPG is compared to the positional average in your league.
                  Players scoring above average gain value; below-average players lose value.
                  Range: <span className="font-semibold">×0.80 floor → ×1.40 ceiling</span>, with a 50% blend weight
                  so KTC consensus still anchors the result. Applies to players with direct KTC rankings only —
                  dynasty-fallback players are already 100% PPG-driven.
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-label-tertiary)' }}>Total Points Rank Adjustment</span>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
                  After the PPG adjustment, a ±12% nudge is applied based on each player's
                  positional rank by <span className="font-semibold">total season points</span> (PPG × games played) in your league.
                  Rank #1 at the position receives +12%; the median rank is unchanged; last rank receives −12%.
                  Players with no recorded stats are unaffected.
                </p>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-label-tertiary)' }}>
                These two adjustments compound. A top-ranked, high-PPG player can be ~20–30% above
                their raw KTC value; a low-ranked, low-PPG player can be ~20–25% below.
              </p>
            </div>
          </section>

          {/* Draft picks section */}
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-widest"
              style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
              Draft Pick Values
            </h3>
            {format === 'dynasty' ? (
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
                Dynasty picks use <span className="font-semibold">KTC's published RDP values</span> directly.
                Quality (Early / Mid / Late) is determined by current standings — the worst-record
                teams produce Early picks. Pick values are <span className="font-semibold">not adjusted</span> by
                league scoring settings, as KTC community consensus already prices future asset value
                on a scoring-agnostic basis.
              </p>
            ) : (
              <>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
                  Redraft pick values are <span className="font-semibold">computed from KTC's player rankings</span> rather
                  than dynasty RDP entries, since redraft picks represent access to players in a
                  specific draft slot — not long-term dynasty asset value.
                </p>
                <div className="flex flex-col gap-1 mt-0.5">
                  {[
                    ['Early / Mid / Late', 'Each round is split into thirds by draft position. Early picks cover the top third of the round, Late picks the bottom third.'],
                    ['Round depth discount', 'Later rounds carry more uncertainty. Round 1 ≈ 10% off the median player value in that tier. Round 5 ≈ 38% off. Round 10+ ≈ 70–80% off.'],
                    ['Year discount', 'Picks usable sooner are worth more. Each additional year in the future reduces value by ~10%, floored at 40% off for picks 4+ years out.'],
                  ].map(([label, desc]) => (
                    <div key={label} className="rounded-lg px-3 py-2.5 flex flex-col gap-0.5"
                      style={{ background: 'var(--color-fill)' }}>
                      <span className="text-xs font-semibold" style={{ color: 'var(--color-label)' }}>{label}</span>
                      <span className="text-xs leading-relaxed" style={{ color: 'var(--color-label-tertiary)' }}>{desc}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <div className="pb-2 text-xs text-center" style={{ color: 'var(--color-label-quaternary)' }}>
            Adjustments recalculate automatically whenever your league settings change in Sleeper.
          </div>

        </div>
    </Modal>
  );
}

function InfoPill({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>{label}</span>
      <span className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>{value}</span>
    </div>
  );
}

function AdjustmentRow({ label, leagueValue, baseline, note }) {
  const isDifferent = leagueValue !== baseline && note;
  return (
    <div className="rounded-lg px-3 py-2.5 flex flex-col gap-1"
      style={{ background: 'var(--color-fill)', outline: isDifferent ? '1px solid var(--color-accent)' : 'none', outlineOffset: '-1px' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium" style={{ color: 'var(--color-label)' }}>{label}</span>
        <span className="text-xs font-semibold" style={{ color: isDifferent ? 'var(--color-accent)' : 'var(--color-label-tertiary)' }}>
          {leagueValue}
        </span>
      </div>
      {isDifferent && note && (
        <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>{note}</span>
      )}
    </div>
  );
}

// ── RosterBrowseModal ─────────────────────────────────────────────────────────
// Multi-add modal opened by "View Roster & Picks". Stays open after each addition
// so the user can add multiple players and picks in a single session.

function RosterBrowseModal({
  roster, partnerName,
  sleeperPlayers, adjustedKtcPlayers, adjustedDynastyKtcPlayers, leagueType,
  rosterPicks, slots, season, league, drafts, pickValueMap, rosters, ownerNameByRosterId,
  seasonStats, scoringSettings, positionalAvgPPG, positionalValuePerPPG, rankMap, playerTradeValueDetailsMap,
  theirPlayers, theirPicks, theirSideItems,
  mergedIDPMap, hasIDP, hasDST,
  onAddPlayer, onAddPick, onClose,
}) {
  const { darkMode } = useTheme();
  const rosterBrowsePlayerCacheRef = useRef(new Map());

  const addedPlayerIds = useMemo(() => new Set(theirPlayers), [theirPlayers]);
  const addedPickKeys  = useMemo(() => new Set(theirPicks.map(p => p.key)), [theirPicks]);
  const theirSideItemMap = useMemo(
    () => new Map((theirSideItems ?? []).map((item) => [item.id, item])),
    [theirSideItems],
  );

  useEffect(() => {
    rosterBrowsePlayerCacheRef.current.clear();
  }, [
    roster?.roster_id,
    sleeperPlayers,
    adjustedKtcPlayers,
    adjustedDynastyKtcPlayers,
    mergedIDPMap,
    leagueType,
    theirSideItemMap,
    seasonStats,
    scoringSettings,
    positionalAvgPPG,
    positionalValuePerPPG,
    rankMap,
    playerTradeValueDetailsMap,
  ]);

  const getRosterBrowsePlayerMeta = useCallback((id) => {
    const cached = rosterBrowsePlayerCacheRef.current.get(id);
    if (cached) return cached;

    const sp = sleeperPlayers[id];
    if (!sp) return null;
    const enriched = theirSideItemMap.get(id);
    const sharedTradeValue = playerTradeValueDetailsMap?.get(id) ?? null;
    let dynastyFallback = sharedTradeValue?.dynastyFallback ?? false;
    let idpFallback = sharedTradeValue?.isEstimated ?? false;
    const isIDPDST = isIDPDSTPos(sp.position);
    let val;
    if (enriched?.adjVal != null) {
      val = enriched.adjVal;
      dynastyFallback = enriched.dynastyFallback ?? false;
    } else if (sharedTradeValue) {
      val = sharedTradeValue.value;
      dynastyFallback = sharedTradeValue.dynastyFallback;
      idpFallback = sharedTradeValue.isEstimated ?? false;
    } else {
      const detail = computeTradePlayerValueDetail({
        id,
        players: sleeperPlayers,
        adjustedKtcPlayers,
        adjustedDynastyKtcPlayers,
        leagueType,
        seasonStats,
        scoringSettings,
        positionalAvgPPG,
        positionalValuePerPPG,
        rankMap,
        mergedIDPMap,
        blendWeight: 0.50,
      });
      if (detail) {
        val = detail.value;
        dynastyFallback = detail.dynastyFallback;
        idpFallback = detail.isEstimated;
      }
    }

    const next = {
      id,
      name: sp.full_name ?? `${sp.first_name ?? ''} ${sp.last_name ?? ''}`.trim(),
      position: sp.position ?? '',
      team: sp.team ?? '',
      val,
      isEstimated: sharedTradeValue?.isEstimated ?? idpFallback,
      dynastyFallback,
    };
    rosterBrowsePlayerCacheRef.current.set(id, next);
    return next;
  }, [sleeperPlayers, theirSideItemMap, playerTradeValueDetailsMap, seasonStats, scoringSettings, adjustedKtcPlayers, leagueType, adjustedDynastyKtcPlayers, mergedIDPMap, positionalValuePerPPG, positionalAvgPPG, rankMap]);

  // Player list sorted by adjusted value descending
  const players = useMemo(() => {
    if (!roster || !sleeperPlayers) return [];
    const ids = [...new Set([...(roster.players ?? []), ...(roster.reserve ?? [])])];
    return ids.map((id) => getRosterBrowsePlayerMeta(id)).filter(Boolean).sort((a, b) => (b.val ?? -1) - (a.val ?? -1));
  }, [roster, sleeperPlayers, getRosterBrowsePlayerMeta]);

  const playerSections = useMemo(() => {
    if (!players.length) return [];

    const offense = [];
    const defense = [];
    for (const player of players) {
      if (ROSTER_BROWSE_OFFENSE_POSITIONS.has(player.position)) offense.push(player);
      else defense.push(player);
    }

    const showSections = (hasIDP || hasDST) && offense.length > 0 && defense.length > 0;
    if (!showSections) return [{ label: 'Players', items: players }];
    return [
      { label: 'Offense', items: offense },
      { label: 'Defense', items: defense },
    ];
  }, [hasDST, hasIDP, players]);

  // Pick list — enriched with quality label and value
  const picks = useMemo(() => {
    if (!roster || !rosterPicks || !slots) return [];
    return getPicksForRoster(roster.roster_id, rosterPicks, slots).map(pick => {
      const { val, displayInfo, quality, valueQuality } = valueDraftPick(pick, {
        rosters,
        ktcPlayers: adjustedKtcPlayers,
        leagueType,
        pickValueMap,
        currentSeason: season,
        league,
        drafts,
      });
      const fromOwner = pick.isOwn ? null : (ownerNameByRosterId?.get(pick.fromRosterId) ?? null);
      return {
        ...pick,
        quality,
        valueQuality,
        label: displayInfo.label,
        val,
        fromOwner,
        displayMode: displayInfo.displayMode,
        lockedSlot: displayInfo.lockedSlot ?? null,
        pickNumberLabel: displayInfo.pickNumberLabel ?? null,
        pickRangeLabel: displayInfo.pickRangeLabel ?? null,
        cardHeadline: displayInfo.cardHeadline ?? null,
        cardMetaLabel: displayInfo.cardMetaLabel ?? null,
        sortSlot: displayInfo.sortSlot ?? null,
      };
    }).sort(compareDraftPickAssets);
  }, [roster, rosterPicks, slots, rosters, adjustedKtcPlayers, leagueType, league, drafts, pickValueMap, season, ownerNameByRosterId]);

  return (
    <Modal
      onClose={onClose}
      containerClassName="flex flex-col"
      containerStyle={{ background: 'var(--color-bg)', maxWidth: 520, height: '72vh', maxHeight: 640 }}
      mobileSheet
      ariaLabel={`${partnerName}'s roster`}
    >

        {/* Header */}
        <div className="px-4 pt-4 pb-3 shrink-0 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--color-separator)' }}>
          <div>
            <span className="font-bold text-base" style={{ color: 'var(--color-label)' }}>
              {partnerName}&apos;s Roster
            </span>
            <span className="text-xs ml-2" style={{ color: 'var(--color-label-tertiary)' }}>
              Tap + to add to trade
            </span>
          </div>
          <button onClick={onClose} className="p-1" style={{ color: 'var(--color-label-secondary)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto">

          {/* Players — split into Offense/Defense sections for IDP/D/ST leagues */}
          {playerSections.length > 0 && (() => {
            const renderPlayerRow = (p) => {
              const tp = teamPalette(p.team, darkMode);
              const isAdded = addedPlayerIds.has(p.id);
              return (
                <div key={p.id}
                  className="flex items-center px-4 py-3 gap-3 relative overflow-hidden"
                  style={{
                    borderBottom: '1px solid var(--color-separator)',
                    borderLeft: tp.borderColor ? `3px solid ${tp.borderColor}` : '3px solid transparent',
                    background: tp.tint ?? 'transparent',
                    opacity: isAdded ? 0.5 : 1,
                    contentVisibility: 'auto',
                    containIntrinsicSize: '76px',
                  }}>
                  <img src={`https://sleepercdn.com/content/nfl/players/thumb/${p.id}.jpg`}
                    alt="" className="w-9 h-9 rounded-full shrink-0 object-cover"
                    style={{ background: 'var(--color-fill-secondary)' }}
                    loading="lazy"
                    decoding="async"
                    onError={e => { e.target.style.display = 'none'; }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: 'var(--color-label)' }}>{p.name}</div>
                    <div className="text-xs" style={{ color: 'var(--color-label-secondary)' }}>{p.position} · {p.team}</div>
                  </div>
                  <span className="text-sm font-bold tabular-nums shrink-0"
                    title={p.isEstimated ? 'Estimated from season production (no KTC data)' : undefined}
                    style={{ color: p.val != null ? 'var(--color-label-secondary)' : 'var(--color-label-quaternary)' }}>
                    {(p.isEstimated || p.dynastyFallback) ? '~' : ''}{fmtKtcValue(p.val)}
                  </span>
                  {p.dynastyFallback && (
                    <span className="text-xs shrink-0" style={{ color: 'var(--color-label-quaternary)', fontSize: '9px' }}>
                      DYN est.
                    </span>
                  )}
                  {isAdded ? (
                    <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(0,168,68,0.15)', color: 'var(--color-accent-green)' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </div>
                  ) : (
                    <button onClick={() => onAddPlayer(p.id)}
                      className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors active:opacity-60"
                      style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)', fontSize: '20px', lineHeight: 1 }}>
                      +
                    </button>
                  )}
                </div>
              );
            };

            const SectionHeader = ({ label }) => (
              <div className="sticky top-0 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest"
                style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-label-tertiary)', letterSpacing: '0.08em', borderBottom: '1px solid var(--color-separator)', zIndex: 1 }}>
                {label}
              </div>
            );

            return playerSections.map((section) => (
              <div key={section.label}>
                <SectionHeader label={section.label} />
                {section.items.map(renderPlayerRow)}
              </div>
            ));
          })()}

          {/* Picks */}
          {picks.length > 0 && (
            <div>
              <div className="sticky top-0 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest"
                style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-label-tertiary)', letterSpacing: '0.08em', borderBottom: '1px solid var(--color-separator)', zIndex: 1 }}>
                Draft Capital
              </div>
              {picks.map(pick => {
                const isAdded = addedPickKeys.has(pick.key);
                return (
                  <div key={pick.key}
                    className="flex items-center px-4 py-3 gap-3"
                    style={{ borderBottom: '1px solid var(--color-separator)', opacity: isAdded ? 0.5 : 1, contentVisibility: 'auto', containIntrinsicSize: '76px' }}>
                    <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-sm font-bold"
                      style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)' }}>
                      {pick.round}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>{pick.label}</div>
                      {pick.fromOwner && (
                        <div className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>from {pick.fromOwner}</div>
                      )}
                    </div>
                    {pick.val != null && (
                      <span className="text-sm font-bold tabular-nums shrink-0"
                        style={{ color: 'var(--color-label-secondary)' }}>
                        {fmtKtcValue(pick.val)}
                      </span>
                    )}
                    {isAdded ? (
                      <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ background: 'rgba(0,168,68,0.15)', color: 'var(--color-accent-green)' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </div>
                    ) : (
                      <button onClick={() => onAddPick(pick)}
                        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors active:opacity-60"
                        style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)', fontSize: '20px', lineHeight: 1 }}>
                        +
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {players.length === 0 && picks.length === 0 && (
            <div className="py-12 text-sm text-center" style={{ color: 'var(--color-label-tertiary)' }}>
              No players or picks found.
            </div>
          )}
        </div>
    </Modal>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: 'spin 0.8s linear infinite' }}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
