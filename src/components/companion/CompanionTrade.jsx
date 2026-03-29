// ── CompanionTrade ────────────────────────────────────────────────────────────
// Trade workflow: build and evaluate trade proposals using KTC values.
// Lives under the Trade section; uses Sleeper rosters and draft pick data.

import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { useSleeper } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { fetchKtcPlayers, getKtcValue, fmtKtcValue, findKtcPlayerFromSleeper, computeKtcMultipliers, applyKtcMultipliers, productionAdjustedValue } from '../../utils/ktcApi';
import { getTradedPicks, getLeagueDrafts } from '../../api/sleeperApi';
import {
  buildRosterPicks, getPicksForRoster, getPickQuality,
  valueSide, evaluateTrade, suggestPackage, buildCandidatePool,
  computeRedraftPickValues, DYNASTY_FALLBACK_MULT,
} from '../../utils/tradeEngine';
import { TEAM_COLORS } from '../../data/teamColors';
import { computePositionalRanks, computePositionalAvgPPG, computePositionalValuePerPPG, computeLeagueAvgMult } from '../../utils/projectionEngine';
import { calcPointsFromTotals } from '../../utils/scoringEngine';
import { detectLeagueDefensiveType, computeIDPValues, computeDSTValues, normalizeIDPPos } from '../../utils/idpEngine';
import { buildRosterOpportunityLayer, buildPartnerTradeIntelligence, findLeagueWideUpgradeGroups } from '../../utils/opportunityEngine';
import TradeRosterPicker from './TradeRosterPicker';
import TradePickPicker from './TradePickPicker';

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

function hexLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function darkenHex(hex, factor) {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
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
  const isLight = hexLuminance(color) > 0.35;
  const alpha = isLight ? '18' : '22';
  const borderColor = (!darkMode && isLight) ? darkenHex(color, 0.55) : color;
  const fallbackAccent = darkMode
    ? (palette.darkSecondary ?? palette.secondary ?? color)
    : (palette.secondary ?? color);
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
  return { color, tint: `${color}${alpha}`, borderColor, accentColor, logoBadgeBg, logoBadgeBorder, isLight, logoKey: key };
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

// ── Main component ───────────────────────────────────────────────────────────

export default function CompanionTrade({ initialPlayer, onConsumeInitialPlayer, view = 'agent', onViewChange }) {
  const {
    rosters, leagueUsers, players: sleeperPlayers, myRoster,
    selectedLeagueId, league, season, getUserDisplayName,
    scoringSettings, seasonStats, weeklyStats,
    loadPlayers, loadSeasonStats, statsLoading,
  } = useSleeper();
  const { darkMode } = useTheme();

  const myRosterData = myRoster();

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
  const [upgradeAllowPackages, setUpgradeAllowPackages] = useState(false);
  const [upgradeAllowOutgoingPicks, setUpgradeAllowOutgoingPicks] = useState(false);
  const [upgradeAllowIncomingPicks, setUpgradeAllowIncomingPicks] = useState(false);
  const [submittedUpgradeSearch, setSubmittedUpgradeSearch] = useState(null);
  const [tradeProposalMode, setTradeProposalMode] = useState('needs');

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
      const maxFromDrafts = (drafts ?? []).reduce((max, d) => Math.max(max, d.settings?.rounds ?? 0), 0);
      setDraftRounds(maxFromDrafts || null);
    });
  }, [selectedLeagueId]);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);
  useEffect(() => {
    if (!seasonStats && !statsLoading) loadSeasonStats();
  }, [seasonStats, statsLoading, loadSeasonStats]);

  // ── Pre-populate from entry points ──────────────────────────────────────────

  useEffect(() => {
    if (!initialPlayer) return;
    onConsumeInitialPlayer?.();

    const { sleeperId, side, partnerRosterId: initPartner, otherSleeperId } = initialPlayer;

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
      if (initPartner) setPartnerRosterId(initPartner);
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
      .filter(r => r.roster_id !== myRosterData.roster_id)
      .sort((a, b) => getUserDisplayName(a.owner_id).localeCompare(getUserDisplayName(b.owner_id)));
  }, [rosters, myRosterData, getUserDisplayName]);

  // Positional ranks across all rostered players (for trade card display)
  const rankMap = useMemo(
    () => computePositionalRanks(seasonStats, sleeperPlayers, scoringSettings),
    [seasonStats, sleeperPlayers, scoringSettings],
  );

  // Average PPG per position — anchors per-player production multipliers
  const positionalAvgPPG = useMemo(
    () => computePositionalAvgPPG(rosters, seasonStats, sleeperPlayers, scoringSettings),
    [rosters, seasonStats, sleeperPlayers, scoringSettings],
  );

  // KTC value per PPG for each position — derived from rostered players with direct KTC fantasy
  // rankings. Used to estimate trade value for dynasty-fallback players on the same scale.
  const positionalValuePerPPG = useMemo(
    () => computePositionalValuePerPPG(
      rosters, sleeperPlayers, adjustedKtcPlayers, leagueType,
      seasonStats, scoringSettings, findKtcPlayerFromSleeper, getKtcValue, productionAdjustedValue,
    ),
    [rosters, sleeperPlayers, adjustedKtcPlayers, leagueType, seasonStats, scoringSettings],
  );

  // League-wide average production multiplier — applied to pick values to keep them consistent with players
  const leagueAvgMult = useMemo(
    () => computeLeagueAvgMult(rosters, seasonStats, sleeperPlayers, scoringSettings, productionAdjustedValue),
    [rosters, seasonStats, sleeperPlayers, scoringSettings],
  );

  const opportunityLayer = useMemo(() => {
    const targetRosterIds = [myRosterData?.roster_id, partnerRosterId].filter(Boolean);
    return buildRosterOpportunityLayer({
      league,
      rosters,
      players: sleeperPlayers,
      seasonStats,
      weeklyStats,
      scoringSettings,
      scheduleMap: null,
      myRosterId: myRosterData?.roster_id ?? null,
      targetRosterIds,
    });
  }, [league, rosters, sleeperPlayers, seasonStats, weeklyStats, scoringSettings, myRosterData, partnerRosterId]);

  // IDP / D/ST league detection and production-based value computation.
  // Values are anchored to the same PPG → value ratio as skill positions so if
  // league scoring brings IDP in line with WR/RB/TE, values will reflect that.
  const { hasIDP, hasDST } = useMemo(
    () => detectLeagueDefensiveType(league?.roster_positions),
    [league],
  );

  const idpComputedMap = useMemo(
    () => hasIDP
      ? computeIDPValues(sleeperPlayers, seasonStats, scoringSettings, league?.roster_positions, positionalValuePerPPG)
      : null,
    [hasIDP, sleeperPlayers, seasonStats, scoringSettings, league?.roster_positions, positionalValuePerPPG],
  );

  const dstComputedMap = useMemo(
    () => hasDST
      ? computeDSTValues(sleeperPlayers, seasonStats, scoringSettings, positionalValuePerPPG)
      : null,
    [hasDST, sleeperPlayers, seasonStats, scoringSettings, positionalValuePerPPG],
  );

  // Single merged IDP+DST map — the last fallback before 0 in all value lookups
  const mergedIDPMap = useMemo(() => {
    if (!idpComputedMap && !dstComputedMap) return null;
    const m = new Map(idpComputedMap ?? []);
    if (dstComputedMap) for (const [k, v] of dstComputedMap) m.set(k, v);
    return m;
  }, [idpComputedMap, dstComputedMap]);

  const playerTradeValueMap = useMemo(() => {
    if (!sleeperPlayers || !rosters?.length) return null;
    const ids = new Set();
    for (const roster of rosters) {
      for (const id of [...new Set([...(roster.players ?? []), ...(roster.reserve ?? [])])]) ids.add(id);
    }

    const map = new Map();
    for (const id of ids) {
      const sp = sleeperPlayers[id];
      if (!sp) continue;

      const ktc = findKtcPlayerFromSleeper(id, sleeperPlayers, adjustedKtcPlayers ?? []);
      let rawVal = getKtcValue(ktc, leagueType);
      let dynastyFallback = false;
      if (rawVal == null && adjustedDynastyKtcPlayers?.length) {
        const dKtc = findKtcPlayerFromSleeper(id, sleeperPlayers, adjustedDynastyKtcPlayers);
        const dVal = getKtcValue(dKtc, leagueType);
        if (dVal != null) {
          rawVal = Math.round(dVal * DYNASTY_FALLBACK_MULT);
          dynastyFallback = true;
        }
      }

      const idpFallback = rawVal == null && mergedIDPMap?.has(id);
      if (idpFallback) rawVal = mergedIDPMap.get(id);
      rawVal = rawVal ?? (adjustedKtcPlayers?.length > 0 ? 0 : null);

      const isIDPDST = isIDPDSTPos(sp.position);
      const stats = seasonStats?.[id];
      const pts = stats ? calcPointsFromTotals(stats, scoringSettings, sp.position) : null;
      const gp = stats?.gp ?? 0;
      const avgPPG = pts != null && gp ? pts / gp : null;

      let val;
      if (isIDPDST && mergedIDPMap?.has(id)) {
        val = rawVal;
      } else if (dynastyFallback && gp >= 3 && avgPPG != null && positionalValuePerPPG?.[sp.position] != null) {
        val = Math.round(avgPPG * positionalValuePerPPG[sp.position]);
      } else {
        val = productionAdjustedValue(rawVal, avgPPG, positionalAvgPPG?.[sp.position], 0.50);
      }

      const rankInfo = rankMap?.[id] ?? null;
      if (!isIDPDST && rankInfo?.rank != null && rankInfo?.posCount > 1) {
        const percentile = 1 - (rankInfo.rank - 1) / (rankInfo.posCount - 1);
        val = Math.round(val * (0.88 + 0.24 * percentile));
      }

      if (val != null) map.set(id, val);
    }
    return map;
  }, [
    sleeperPlayers, rosters, adjustedKtcPlayers, adjustedDynastyKtcPlayers, mergedIDPMap,
    leagueType, seasonStats, scoringSettings, positionalAvgPPG, positionalValuePerPPG, rankMap,
  ]);

  const tradeIntelligence = useMemo(() => buildPartnerTradeIntelligence({
    opportunityLayer,
    selectedPartnerRosterId: partnerRosterId ?? null,
    rosterPicks,
    slots,
    currentSeason: season,
    pickValueMap,
    playerValueMap: playerTradeValueMap,
  }), [opportunityLayer, partnerRosterId, rosterPicks, slots, season, pickValueMap, playerTradeValueMap]);

  const tradeProposals = tradeIntelligence?.tradeProposals ?? [];
  const surplusTradeProposals = tradeIntelligence?.surplusTradeProposals ?? [];

  const myRosterOpportunityPlayers = useMemo(
    () => [...(opportunityLayer?.rosterAnalysesById?.[myRosterData?.roster_id]?.rosterPlayers ?? [])]
      .sort((a, b) => (b.ppg ?? 0) - (a.ppg ?? 0) || a.name.localeCompare(b.name)),
    [opportunityLayer, myRosterData],
  );

  const upgradeSearchResults = useMemo(() => {
    if (!submittedUpgradeSearch?.targetPlayerId) return null;
    return findLeagueWideUpgradeGroups({
      opportunityLayer,
      targetPlayerId: submittedUpgradeSearch.targetPlayerId,
      allowedOutgoingPlayerIds: submittedUpgradeSearch.allowedOutgoingPlayerIds,
      tradePostureLevel: submittedUpgradeSearch.tradePostureLevel,
      allowPackages: submittedUpgradeSearch.allowPackages,
      allowOutgoingPicks: submittedUpgradeSearch.allowOutgoingPicks,
      allowIncomingPicks: submittedUpgradeSearch.allowIncomingPicks,
      rosterPicks,
      slots,
      currentSeason: season,
      pickValueMap,
      playerValueMap: playerTradeValueMap,
    });
  }, [submittedUpgradeSearch, opportunityLayer, rosterPicks, slots, season, pickValueMap, playerTradeValueMap]);

  // Enrich a valueSide result: apply production adjustment to player vals, scale picks by leagueAvgMult
  function enrichItems(side) {
    if (!side.items.length) return side;
    const enriched = side.items.map(it => {
      if (it.type === 'pick') {
        const adjVal = it.val != null ? Math.round(it.val * leagueAvgMult) : it.val;
        return { ...it, adjVal };
      }
      const stats = seasonStats?.[it.id];
      const pts = stats ? calcPointsFromTotals(stats, scoringSettings, it.position) : null;
      const gp = stats?.gp ?? 0;
      const avgPPG = pts != null && gp ? Math.round((pts / gp) * 10) / 10 : null;
      const rankInfo = rankMap[it.id] ?? null;

      let adjVal;
      if (it.idpFallback) {
        // IDP/DST: value is already production-derived from idpEngine — use as-is.
        // Skip production adjustment (would be a no-op anyway) and rank nudge
        // (would double-count production since ranking also uses season stats).
        adjVal = it.val;
      } else if (it.dynastyFallback && gp >= 3 && avgPPG != null && positionalValuePerPPG[it.position] != null) {
        // PPG-calibrated estimation: derive value from the same value-per-PPG ratio
        // as direct-KTC-ranked players, so dynasty-fallback players sit on the same scale.
        adjVal = Math.round(avgPPG * positionalValuePerPPG[it.position]);
      } else {
        // Direct KTC players: 50% PPG blend weight (higher than default 35%) so
        // season performance has more influence on trade-agent values.
        adjVal = productionAdjustedValue(it.val, avgPPG, positionalAvgPPG[it.position], 0.50);
      }

      // Layer 2 — rank-percentile nudge (±12%) for KTC-based players only.
      // IDP/DST players skip this since their value is already production-proportional.
      if (!it.idpFallback && rankInfo?.rank != null && rankInfo?.posCount > 1) {
        const percentile = 1 - (rankInfo.rank - 1) / (rankInfo.posCount - 1);
        const rankMult = 0.88 + 0.24 * percentile;
        adjVal = Math.round(adjVal * rankMult);
      }

      return {
        ...it,
        adjVal,
        avgPPG,
        rankInfo,
        dynastyFallback: it.dynastyFallback ?? false,
      };
    });
    const adjTotal = enriched.reduce((sum, it) => sum + (it.adjVal ?? it.val ?? 0), 0);
    return { ...side, items: enriched, total: adjTotal };
  }

  // Value calculations — show player cards immediately once sleeperPlayers is loaded,
  // even if KTC hasn't resolved yet (values show "—" until KTC finishes).
  const yourSide = useMemo(() => {
    const side = sleeperPlayers
      ? valueSide(yourPlayers, yourPicks, sleeperPlayers, adjustedKtcPlayers ?? [], leagueType, rosters, pickValueMap, season, adjustedDynastyKtcPlayers, mergedIDPMap)
      : { total: 0, items: [] };
    return enrichItems(side);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yourPlayers, yourPicks, sleeperPlayers, adjustedKtcPlayers, adjustedDynastyKtcPlayers, mergedIDPMap, leagueType, rosters, pickValueMap, season, seasonStats, scoringSettings, rankMap, positionalAvgPPG, positionalValuePerPPG, leagueAvgMult]);

  const theirSide = useMemo(() => {
    const side = sleeperPlayers
      ? valueSide(theirPlayers, theirPicks, sleeperPlayers, adjustedKtcPlayers ?? [], leagueType, rosters, pickValueMap, season, adjustedDynastyKtcPlayers, mergedIDPMap)
      : { total: 0, items: [] };
    return enrichItems(side);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theirPlayers, theirPicks, sleeperPlayers, adjustedKtcPlayers, adjustedDynastyKtcPlayers, mergedIDPMap, leagueType, rosters, pickValueMap, season, seasonStats, scoringSettings, rankMap, positionalAvgPPG, positionalValuePerPPG, leagueAvgMult]);

  const verdict = useMemo(
    () => evaluateTrade(yourSide.total, theirSide.total),
    [yourSide.total, theirSide.total],
  );

  const hasItems = yourSide.items.length > 0 || theirSide.items.length > 0;
  const hasDynastyFallback = [...yourSide.items, ...theirSide.items].some(it => it.dynastyFallback);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const addPlayer = useCallback((side, playerIdOrObj) => {
    if (side === 'yours' && typeof playerIdOrObj !== 'object') {
      // Your side locked picker: plain ID from your roster
      setYourPlayers(prev => [...prev, playerIdOrObj]);
    } else if (typeof playerIdOrObj === 'object') {
      // All-rosters search: { id, rosterId }
      const { id, rosterId: playerRosterId } = playerIdOrObj;
      if (playerRosterId === myRosterData?.roster_id) {
        // Own player selected from global search → always goes to Your Side
        setYourPlayers(prev => [...prev, id]);
      } else if (playerRosterId && playerRosterId !== partnerRosterId) {
        // Different partner selected → set partner and reset their side only.
        // Your Side players can be offered to any trade partner, so preserve them.
        setPartnerRosterId(playerRosterId);
        setTheirPlayers([id]);
        setTheirPicks([]);
      } else {
        setTheirPlayers(prev => [...prev, id]);
      }
    } else {
      setTheirPlayers(prev => [...prev, playerIdOrObj]);
    }
    setPickerOpen(null);
    setSuggestions(null);
  }, [partnerRosterId, myRosterData?.roster_id]);

  const removePlayer = useCallback((side, playerId) => {
    if (side === 'yours') setYourPlayers(prev => prev.filter(id => id !== playerId));
    else setTheirPlayers(prev => prev.filter(id => id !== playerId));
    setSuggestions(null);
  }, []);

  const addPick = useCallback((side, pick) => {
    if (side === 'yours') setYourPicks(prev => [...prev, pick]);
    else setTheirPicks(prev => [...prev, pick]);
    setPickerOpen(null);
    setSuggestions(null);
  }, []);

  const removePick = useCallback((side, pickKey) => {
    if (side === 'yours') setYourPicks(prev => prev.filter(p => p.key !== pickKey));
    else setTheirPicks(prev => prev.filter(p => p.key !== pickKey));
    setSuggestions(null);
  }, []);

  const applyTradeProposal = useCallback((proposal) => {
    if (!proposal) return;
    setPartnerRosterId(proposal.targetRosterId ?? null);
    setYourPlayers((proposal.outgoingAssets ?? []).filter((asset) => asset.type === 'player').map((asset) => asset.id));
    setYourPicks((proposal.outgoingAssets ?? []).filter((asset) => asset.type === 'pick' && asset.pickData).map((asset) => asset.pickData));
    setTheirPlayers((proposal.incomingAssets ?? []).filter((asset) => asset.type === 'player').map((asset) => asset.id));
    setTheirPicks((proposal.incomingAssets ?? []).filter((asset) => asset.type === 'pick' && asset.pickData).map((asset) => asset.pickData));
    setSuggestions(null);
    onViewChange?.('agent');
  }, [onViewChange]);

  const handleSuggest = useCallback(() => {
    if (!adjustedKtcPlayers || !partnerRosterId) return;
    const gap = Math.abs(yourSide.total - theirSide.total);
    if (gap <= 0) return;

    const deficitSide = yourSide.total < theirSide.total ? 'yours' : 'theirs';
    const surplusRosterId = deficitSide === 'yours' ? partnerRosterId : myRosterData?.roster_id;
    const deficitRosterId = deficitSide === 'yours' ? myRosterData?.roster_id : partnerRosterId;

    const deficitExcludeIds     = deficitSide === 'yours' ? yourPlayers : theirPlayers;
    const deficitExcludePickKeys = (deficitSide === 'yours' ? yourPicks : theirPicks).map(p => p.key);
    const surplusExcludeIds     = deficitSide === 'yours' ? theirPlayers : yourPlayers;
    const surplusExcludePickKeys = (deficitSide === 'yours' ? theirPicks : yourPicks).map(p => p.key);

    const dynFallbackOpts = {
      dynastyKtcPlayers: adjustedDynastyKtcPlayers,
      seasonStats, scoringSettings, positionalValuePerPPG, positionalAvgPPG, rankMap,
      idpValueMap: mergedIDPMap,
    };
    const deficitCandidates = buildCandidatePool(
      deficitRosterId, rosters, deficitExcludeIds, deficitExcludePickKeys,
      sleeperPlayers, adjustedKtcPlayers, leagueType, rosterPicks, slots, pickValueMap, season,
      dynFallbackOpts,
    );
    const surplusCandidates = buildCandidatePool(
      surplusRosterId, rosters, surplusExcludeIds, surplusExcludePickKeys,
      sleeperPlayers, adjustedKtcPlayers, leagueType, rosterPicks, slots, pickValueMap, season,
      dynFallbackOpts,
    );

    const options = suggestPackage({
      gap,
      deficitSide,
      deficitCandidates,
      deficitItems:    deficitSide === 'yours' ? yourSide.items : theirSide.items,
      surplusItems:    deficitSide === 'yours' ? theirSide.items : yourSide.items,
      surplusCandidates,
    });
    setSuggestions({ options, deficitSide });
  }, [adjustedKtcPlayers, partnerRosterId, yourSide, theirSide, myRosterData, rosters,
      yourPlayers, theirPlayers, yourPicks, theirPicks, sleeperPlayers, leagueType, rosterPicks, slots, pickValueMap]);

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
    if (!upgradeTargetId || (!upgradeOfferPlayerIds.length && !upgradeAllowOutgoingPicks)) return;
    setSubmittedUpgradeSearch({
      targetPlayerId: upgradeTargetId,
      allowedOutgoingPlayerIds: upgradeOfferPlayerIds,
      tradePostureLevel: upgradeTradePostureLevel,
      allowPackages: upgradeAllowPackages,
      allowOutgoingPicks: upgradeAllowOutgoingPicks,
      allowIncomingPicks: upgradeAllowIncomingPicks,
    });
  }, [upgradeTargetId, upgradeOfferPlayerIds, upgradeTradePostureLevel, upgradeAllowPackages, upgradeAllowOutgoingPicks, upgradeAllowIncomingPicks]);

  const upgradeFinderPage = (
    <UpgradeFinderPage
      players={myRosterOpportunityPlayers}
      searchSubmitted={Boolean(submittedUpgradeSearch)}
      selectedPlayerId={upgradeTargetId}
      selectedOutgoingPlayerIds={upgradeOfferPlayerIds}
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
      onBack={() => onViewChange?.('agent')}
    />
  );

  if (view === 'upgrade') {
    return upgradeFinderPage;
  }

  const showAgent = view !== 'intelligence';
  const showIntelligence = view === 'intelligence';

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="pb-8">

      {/* ── Owner carousel + search ──────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
            {showIntelligence ? 'Trade Intelligence' : 'Agent'}
          </span>
        </div>
        <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <div className="flex gap-2" style={{ width: 'max-content' }}>
            {partnerRosters.map(roster => {
              const isSelected = roster.roster_id === partnerRosterId;
              const name = getUserDisplayName(roster.owner_id);
              const user = leagueUsers.find(u => u.user_id === roster.owner_id);
              const avatarHash = user?.avatar;
              return (
                <button
                  key={roster.roster_id}
                  onClick={() => {
                    if (roster.roster_id !== partnerRosterId) {
                      setPartnerRosterId(roster.roster_id);
                      setTheirPlayers([]);
                      setTheirPicks([]);
                      setSuggestions(null);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors shrink-0"
                  style={{
                    background: isSelected ? 'var(--color-signature)' : 'var(--color-fill)',
                    color: isSelected ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
                    fontWeight: isSelected ? 700 : 500,
                  }}
                >
                  {avatarHash ? (
                    <img src={`https://sleepercdn.com/avatars/thumbs/${avatarHash}`}
                      alt={name} className="w-5 h-5 rounded-full shrink-0 object-cover"
                      onError={e => { e.target.style.display = 'none'; }} />
                  ) : (
                    <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center"
                      style={{ background: 'var(--color-fill-secondary)', fontSize: '9px', fontWeight: 700, color: 'var(--color-label-secondary)' }}>
                      {name[0]?.toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs whitespace-nowrap">{name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* "View Roster & Picks" — shown directly under carousel when a partner is selected */}
        {partnerRosterId && !ktcLoading && !ktcError && (
          <button
            onClick={() => setRosterModalRosterId(partnerRosterId)}
            className="w-full flex items-center justify-center gap-2 mt-2 py-2 rounded-xl text-sm font-semibold transition-colors"
            style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)', border: '1px solid var(--color-separator)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            View Roster &amp; Picks
          </button>
        )}

      </div>

      {showAgent ? (
        <>
        <div className="flex gap-3 px-4 pt-2">
          {/* YOUR SIDE */}
          <TradeSide
            label="Your Side"
            items={yourSide.items}
            total={yourSide.total}
            onRemovePlayer={id => removePlayer('yours', id)}
            onRemovePick={key => removePick('yours', key)}
            onAddPlayer={() => setPickerOpen({ side: 'yours', type: 'player' })}
            onAddPick={() => setPickerOpen({ side: 'yours', type: 'pick' })}
            isLeader={hasItems && verdict.verdict === 'favors_them'}
            showTeamColors
          />


          {/* THEIR SIDE */}
          <TradeSide
            label="Their Side"
            items={theirSide.items}
            total={theirSide.total}
            onRemovePlayer={id => removePlayer('theirs', id)}
            onRemovePick={key => removePick('theirs', key)}
            onAddPlayer={() => setPickerOpen({ side: 'theirs', type: 'player', allRosters: !partnerRosterId })}
            onAddPick={partnerRosterId ? () => setPickerOpen({ side: 'theirs', type: 'pick' }) : null}
            isLeader={hasItems && verdict.verdict === 'favors_you'}
            showTeamColors
          />
        </div>

        {/* ── Search button — above Trade Intelligence ─────────────────── */}
        {!ktcLoading && !ktcError && (
          <div className="px-4 mt-2">
            <button
              onClick={() => setPickerOpen({ side: 'theirs', type: 'player', allRosters: true })}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              Search All Rostered Players
            </button>
          </div>
        )}

        {/* ── Instructions / status (shown when no items yet) ─────────── */}
        {!hasItems && (
          <div className="mx-4 mt-4 rounded-xl px-4 py-4 flex flex-col gap-1.5"
            style={{ background: 'var(--color-fill)' }}>
            {ktcLoading ? (
              <div className="flex items-center gap-2.5">
                <Spinner />
                <span className="text-sm font-medium" style={{ color: 'var(--color-label-secondary)' }}>
                  Loading trade values…
                </span>
              </div>
            ) : ktcError ? (
              <>
                <span className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
                  Trade values unavailable
                </span>
                <span className="text-xs leading-relaxed" style={{ color: 'var(--color-label-tertiary)' }}>
                  The KeepTradeCut proxy could not be reached. Trade values require the nginx proxy in production.
                </span>
                <span className="text-xs font-mono mt-1" style={{ color: 'var(--color-label-quaternary)' }}>
                  {ktcError}
                </span>
              </>
            ) : (
              <>
                <span className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
                  Build your trade
                </span>
                <span className="text-xs leading-relaxed" style={{ color: 'var(--color-label-tertiary)' }}>
                  Select a trade partner above, or begin adding players or picks to either side. Or tap Search All Rostered Players to view all available players available for trade, including your own.
                </span>
              </>
            )}
          </div>
        )}

        {/* ── Value comparison bar ────────────────────────────────────── */}
        {hasItems && (
          <div className="px-4 pt-4">
            <ValueBar yourTotal={yourSide.total} theirTotal={theirSide.total} verdict={verdict} />
          </div>
        )}

          {/* ── Refine Trade ─────────────────────────────────────────────── */}
          {hasItems && verdict.verdict !== 'fair' && verdict.gap > 0 && (
            <div className="px-4 pt-3">
              <button onClick={handleSuggest}
                className="w-full py-2.5 rounded-xl text-xs font-semibold transition-colors"
                style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}>
                Refine Trade
              </button>
            </div>
          )}

          {/* ── Suggestion results ──────────────────────────────────────── */}
          {suggestions && suggestions.options.length > 0 && (
            <div className="px-4 pt-3 flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
                Refinement Options
              </span>
              {suggestions.options.map((opt, i) => {
                const absRemaining = Math.abs(opt.newGap);
                const isNearEven = absRemaining < verdict.gap * 0.05;
                // Which side holds the value advantage after this adjustment?
                // "Your Side" / "Their Side" = what each party gives away.
                // If the giving side with more value is "theirs" → trade favors YOU.
                // If it's "yours" → trade favors THEM.
                const currentSurplusSide = opt.newGap > 0
                  ? (suggestions.deficitSide === 'yours' ? 'theirs' : 'yours')
                  : suggestions.deficitSide;
                const favoredLabel = currentSurplusSide === 'theirs' ? 'You' : 'Them';
                const remainingLabel = isNearEven
                  ? 'Near-even trade'
                  : `Favors ${favoredLabel} · ${fmtKtcValue(absRemaining)}`;

                const ACTION_META = {
                  add:    { label: 'ADD',    bg: '#22c55e22', color: '#22c55e' },
                  remove: { label: 'REMOVE', bg: '#f59e0b22', color: '#f59e0b' },
                  swap:   { label: 'SWAP',   bg: 'var(--color-accent)22', color: 'var(--color-accent)' },
                };
                const meta = ACTION_META[opt.action] ?? ACTION_META.add;

                let descLine;
                if (opt.action === 'add') {
                  descLine = `Add to ${opt.side === 'yours' ? 'Your' : 'Their'} Side: ${opt.items.map(it => it.label).join(' + ')}`;
                } else if (opt.action === 'remove') {
                  descLine = `Remove from ${opt.side === 'yours' ? 'Your' : 'Their'} Side: ${opt.items[0]?.label}`;
                } else {
                  descLine = `${opt.side === 'yours' ? 'Your' : 'Their'} Side: ${opt.remove?.label} → ${opt.add?.label}`;
                }

                return (
                  <div key={i} className="rounded-xl px-3 py-2.5 flex items-center justify-between gap-2"
                    style={{ background: 'var(--color-fill)' }}>
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-widest shrink-0"
                          style={{ background: meta.bg, color: meta.color }}>
                          {meta.label}
                        </span>
                        <span className="text-xs font-medium truncate" style={{ color: 'var(--color-label)' }}>
                          {descLine}
                        </span>
                      </div>
                      <span className="text-xs tabular-nums" style={{ color: 'var(--color-label-quaternary)' }}>
                        {remainingLabel}
                      </span>
                    </div>
                    <button onClick={() => applySuggestion(opt)}
                      className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}>
                      Apply
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {suggestions && suggestions.options.length === 0 && (
            <div className="px-4 pt-3 text-xs text-center" style={{ color: 'var(--color-label-tertiary)' }}>
              No combinations found to close the gap.
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
                  {[...yourSide.items, ...theirSide.items]
                    .filter(it => it.ktcEntry)
                    .map(it => <TrendRow key={it.id} item={it} leagueType={leagueType} />)}
                </div>
              )}
            </div>
          )}

          {/* ── Clear trade ─────────────────────────────────────────────── */}
          {hasItems && (
            <div className="px-4 pt-4">
              <button onClick={clearTrade}
                className="w-full py-2 rounded-xl text-xs font-semibold transition-colors"
                style={{ background: 'var(--color-fill)', color: 'var(--color-destructive, #ef4444)' }}>
                Clear Trade
              </button>
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

          {/* ── Attribution ─────────────────────────────────────────────── */}
          <div className="px-4 pt-4 flex items-center justify-center gap-1.5">
            <span className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>
              Values from{' '}
              <span className="font-medium" style={{ color: 'var(--color-label-tertiary)' }}>KeepTradeCut</span>
              {' · '}{format === 'dynasty' ? 'Dynasty' : 'Redraft'}
              {' · '}{leagueType === 'sf' ? 'Superflex' : '1QB'}
              {isAdjusted && (
                <span style={{ color: 'var(--color-accent)' }}>{' · '}League-adjusted</span>
              )}
            </span>
            <button
              onClick={() => setShowValInfo(true)}
              className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
              style={{ background: 'var(--color-fill)', color: 'var(--color-label-tertiary)' }}
              aria-label="How values are calculated"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
              </svg>
            </button>
          </div>
        </>
      ) : null}

      {showIntelligence ? (
        <div className="px-4 pt-3">
          <TradeProposalPanel
            partnerRosterId={partnerRosterId}
            partnerName={partnerRosterId ? getUserDisplayName(rosters.find((roster) => roster.roster_id === partnerRosterId)?.owner_id ?? '') : null}
            tradeProposals={tradeProposals}
            surplusTradeProposals={surplusTradeProposals}
            activeMode={tradeProposalMode}
            onModeChange={setTradeProposalMode}
            onApplyProposal={applyTradeProposal}
          />
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
          seasonStats={seasonStats}
          scoringSettings={scoringSettings}
          getUserDisplayName={getUserDisplayName}
          myRosterId={myRosterData?.roster_id}
          currentTotal={pickerOpen.side === 'yours' ? yourSide.total : theirSide.total}
          activeRosterId={pickerOpen.side === 'yours' ? myRosterData?.roster_id : partnerRosterId}
          mergedIDPMap={mergedIDPMap}
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
          roster={rosters.find(r => r.roster_id === rosterModalRosterId)}
          partnerName={getUserDisplayName(
            rosters.find(r => r.roster_id === rosterModalRosterId)?.owner_id ?? ''
          )}
          sleeperPlayers={sleeperPlayers}
          adjustedKtcPlayers={adjustedKtcPlayers}
          adjustedDynastyKtcPlayers={adjustedDynastyKtcPlayers}
          leagueType={leagueType}
          rosterPicks={rosterPicks}
          slots={slots}
          season={season}
          pickValueMap={pickValueMap}
          rosters={rosters}
          getUserDisplayName={getUserDisplayName}
          seasonStats={seasonStats}
          scoringSettings={scoringSettings}
          positionalAvgPPG={positionalAvgPPG}
          positionalValuePerPPG={positionalValuePerPPG}
          rankMap={rankMap}
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
    </div>
  );
}

// ── TradeSide ─────────────────────────────────────────────────────────────────

function TradeSide({ label, items, total, onRemovePlayer, onRemovePick, onAddPlayer, onAddPick, isLeader, showTeamColors }) {
  const { darkMode } = useTheme();

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-1.5">

      {/* Header: label + running total */}
      <div className="rounded-lg px-2.5 py-2 flex items-center justify-between mb-0.5"
        style={{
          background: isLeader ? 'var(--color-signature)' : 'var(--color-fill)',
          color: isLeader ? 'var(--color-signature-fg)' : 'var(--color-label)',
        }}>
        <span className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: isLeader ? 'var(--color-signature-fg)' : 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
          {label}
        </span>
        <span className="text-sm font-bold tabular-nums">{fmtKtcValue(total)}</span>
      </div>

      {items.map(it => {
        const tp = (showTeamColors && it.type === 'player')
          ? teamPalette(it.team, darkMode)
          : { color: null, tint: null, logoKey: '' };
        return (
          <div key={it.id}
            className="rounded-lg px-2.5 py-2 flex items-center gap-2 relative overflow-hidden"
            style={{
              background: tp.tint ?? 'var(--color-fill)',
              borderLeft: tp.borderColor ? `3px solid ${tp.borderColor}` : '3px solid transparent',
            }}>

            {it.type === 'player' && (
              <img src={`https://sleepercdn.com/content/nfl/players/thumb/${it.id}.jpg`}
                alt="" className="hidden lg:block w-7 h-7 rounded-full shrink-0 object-cover"
                style={{ background: 'var(--color-fill-secondary)' }}
                onError={e => { e.target.style.display = 'none'; }} />
            )}
            {it.type === 'pick' && (
              <div className="hidden lg:flex w-7 h-7 rounded-full shrink-0 items-center justify-center"
                style={{ background: 'var(--color-fill-secondary)', fontSize: '8px', fontWeight: 700, color: 'var(--color-label-tertiary)' }}>
                PICK
              </div>
            )}
            <div className="flex-1 min-w-0 relative">
              {/* Team logo watermark — scoped to text area so it never overlaps values */}
              {it.type === 'player' && tp.logoKey && (
                <img
                  src={`https://a.espncdn.com/i/teamlogos/nfl/500/${tp.logoKey}.png`}
                  aria-hidden="true"
                  className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none select-none"
                  style={{ width: 32, height: 32, objectFit: 'contain', opacity: 0.12 }}
                  onError={e => { e.target.style.display = 'none'; }}
                />
              )}
              {/* Name + value on same row */}
              <div className="flex items-baseline gap-1.5">
                <div className="flex-1 min-w-0 text-xs font-semibold leading-snug"
                  style={{ color: 'var(--color-label)' }}>
                  {it.label}
                </div>
                <span className="text-sm font-bold tabular-nums shrink-0"
                  title={it.idpFallback ? 'Estimated from season production (no KTC data)' : undefined}
                  style={{ color: (it.adjVal ?? it.val) != null ? 'var(--color-label)' : 'var(--color-label-quaternary)' }}>
                  {(it.dynastyFallback || it.idpFallback) ? '~' : ''}{fmtKtcValue(it.adjVal ?? it.val)}
                </span>
              </div>
              {/* Sub-info: single nowrap line */}
              {it.position && (
                <div className="flex items-center gap-1 overflow-hidden mt-0.5">
                  <span className="text-xs shrink-0" style={{ color: 'var(--color-label-tertiary)' }}>
                    {it.position}{it.team ? ` · ${it.team}` : ''}
                  </span>
                  {it.rankInfo && (
                    <span className="text-xs font-bold tabular-nums shrink-0"
                      style={{ color: tp.color ?? 'var(--color-label-quaternary)' }}>
                      · #{it.rankInfo.rank} {it.rankInfo.posLabel}
                    </span>
                  )}
                  {it.avgPPG != null && (
                    <span className="hidden lg:inline text-xs tabular-nums shrink-0" style={{ color: 'var(--color-label-quaternary)' }}>
                      · {it.avgPPG.toFixed(1)} avg
                    </span>
                  )}
                  {(it.dynastyFallback || it.idpFallback) && (
                    <span className="shrink-0" style={{ color: 'var(--color-label-quaternary)', fontSize: '9px' }}>
                      · {it.dynastyFallback ? 'DYN est.' : 'est.'}
                    </span>
                  )}
                </div>
              )}
            </div>
            <button onClick={() => it.type === 'player' ? onRemovePlayer(it.id) : onRemovePick(it.id)}
              className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: 'var(--color-fill-secondary)', color: 'var(--color-label-tertiary)', fontSize: '10px' }}>
              ×
            </button>
          </div>
        );
      })}

      {/* Add buttons */}
      <div className="flex gap-1.5">
        <button onClick={onAddPlayer}
          className="flex-1 py-2 rounded-lg text-xs font-medium transition-colors"
          style={{ border: '1px dashed var(--color-separator)', color: 'var(--color-label-tertiary)' }}>
          + Player
        </button>
        <button onClick={onAddPick ?? undefined} disabled={!onAddPick}
          className="flex-1 py-2 rounded-lg text-xs font-medium transition-colors"
          style={{
            border: '1px dashed var(--color-separator)',
            color: 'var(--color-label-tertiary)',
            opacity: onAddPick ? 1 : 0.35,
            cursor: onAddPick ? 'pointer' : 'default',
          }}>
          + Pick
        </button>
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

function fmtPpg(value) {
  return Number.isFinite(value) ? Number(value).toFixed(1) : '0.0';
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
function ProposalPlayerCard({ player = null, palette = null, pick = null, side, seasonStats, showSideBadge = true, forcedHeight = null, cardRef = null }) {
  const primary = player ?? null;
  const primaryPalette = palette ?? null;
  const primaryPick = pick ?? null;
  const { darkMode, favoriteTeam } = useTheme();
  const { rosters } = useSleeper();

  const teamColor = primaryPalette?.color ?? null;
  const accentColor = primaryPalette?.accentColor ?? teamColor ?? 'white';
  const cardBg = teamColor
    ? `linear-gradient(160deg, ${teamColor}dd 0%, ${teamColor}88 30%, ${teamColor}22 60%, rgba(0,0,0,0.82) 100%)`
    : 'var(--color-fill)';
  const cardBorder = teamColor ? `${teamColor}88` : 'var(--color-separator)';
  // Gradient fade applied behind the player image (visible when photo doesn't fully cover)
  const photoFade = teamColor
    ? `linear-gradient(to bottom, transparent 25%, ${teamColor}cc 75%, ${teamColor}ee 100%)`
    : 'linear-gradient(to bottom, transparent 25%, rgba(0,0,0,0.5) 75%, rgba(0,0,0,0.7) 100%)';

  // Desktop: position-specific season stats
  const playerStats = primary ? seasonStats?.[primary.id] : null;
  const statPosition = primary ? (normalizeIDPPos(primary.position) ?? primary.position) : null;
  const statDefs = statPosition ? (CARD_STAT_DEFS[statPosition] ?? []) : [];

  const fmtStat = (v) => v == null ? '—' : (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));

  // ── Pick-only card ──────────────────────────────────────────────────────
  if (!primary && primaryPick) {
    const pickOrdinals = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' };
    const roundOrd = pickOrdinals[primaryPick.round] ?? `${primaryPick.round}th`;
    const quality = primaryPick.quality ?? '';
    const qualityLabel = quality === 'Early' ? 'Early' : quality === 'Mid' ? 'Middle' : quality === 'Late' ? 'Late' : '';
    const r = primaryPick.round ?? 1;
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
        className="w-full rounded-xl flex flex-col overflow-hidden relative"
        style={{
          background: pt.bg,
          border: `2px solid ${pt.border}`,
          height: forcedHeight ? `${forcedHeight}px` : undefined,
        }}
      >
        <div className="relative w-full overflow-hidden" style={{ aspectRatio: '5 / 4', flexShrink: 0 }}>
          <div className="absolute inset-0" style={{ background: pt.bg }} />
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
            <span
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 'clamp(8px, 4cqw, 10px)',
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
                fontSize: 'clamp(34px, 16cqw, 48px)',
                fontWeight: 300,
                color: pt.yearText,
                lineHeight: 1,
                letterSpacing: '0.04em',
              }}
            >
              {primaryPick.year ?? '—'}
            </span>
          </div>
        </div>

        <div
          className="relative px-2 lg:px-3 py-1 lg:py-1.5 text-center"
          style={{
            background: pt.bannerBg,
            borderTop: `1px solid ${pt.bannerBorder}`,
            borderBottom: `1px solid ${pt.bannerBorder}`,
          }}
        >
          <div
            className="text-[11px] lg:text-sm font-bold leading-tight tracking-wide uppercase"
            style={{
              color: pt.yearText,
              textShadow: darkMode ? '0 1px 3px rgba(0,0,0,0.6)' : 'none',
              fontFamily: "'Barlow Condensed', sans-serif",
            }}
          >
            {qualityLabel ? `${roundOrd} Round · ${qualityLabel}` : `Round ${primaryPick.round}`}
          </div>
        </div>

        <div className="flex flex-col flex-1 px-2 pb-2 min-h-0 items-center" style={{ background: pt.glassBg }}>
          <div className="flex items-center justify-center py-1 lg:py-1.5">
            <span
              className="text-sm lg:text-base font-bold tabular-nums leading-tight"
              style={{ color: pt.accent, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em' }}
            >
              {primaryPick.value != null ? fmtKtcValue(primaryPick.value) : '—'}
            </span>
          </div>

          <div className="flex gap-1 w-full lg:hidden">
            <div className="flex-1 rounded-lg p-1.5 flex flex-col gap-px" style={{ background: 'rgba(0,0,0,0.22)' }}>
              <span className="text-[7px] font-bold uppercase tracking-wide mb-0.5" style={{ color: pt.accentMuted }}>Proj. Pick</span>
              <span className="text-[9px] font-semibold tabular-nums" style={{ color: pt.labelText }}>
                {pickRange ?? '—'}
              </span>
            </div>
          </div>

          <div className="hidden lg:flex gap-1 w-full">
            <div className="flex-1 rounded-lg p-1.5 flex flex-col gap-px" style={{ background: 'rgba(0,0,0,0.22)' }}>
              <span className="text-[8px] font-bold uppercase tracking-wide mb-0.5" style={{ color: pt.accentMuted }}>Proj. Pick</span>
              <span className="text-[10px] font-semibold tabular-nums" style={{ color: pt.labelText }}>
                {pickRange ?? '—'}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className="w-full rounded-xl flex flex-col overflow-hidden relative"
      style={{
        background: cardBg,
        border: `2px solid ${cardBorder}`,
        height: forcedHeight ? `${forcedHeight}px` : undefined,
      }}
    >
      {/* ── Photo area (~45% of card height) ──────────────────── */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '5 / 4', flexShrink: 0 }}>
        {/* Background fill + gradient fade (behind the player image) */}
        <div className="absolute inset-0"
          style={{ background: teamColor ? `${teamColor}44` : 'var(--color-fill)' }} />
        <div className="absolute inset-0" style={{ background: photoFade }} />

        {primary ? (
          <img
            src={`https://sleepercdn.com/content/nfl/players/thumb/${primary.id}.jpg`}
            alt=""
            className="absolute inset-0 w-full h-full"
            style={{ objectFit: 'cover', objectPosition: 'top center' }}
            onError={e => { e.target.style.display = 'none'; }}
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
                color: 'white',
                letterSpacing: '0.08em',
                border: `1px solid ${teamColor ? `${teamColor}88` : 'rgba(255,255,255,0.2)'}`,
                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
              }}>
              {side === 'give' ? 'Give' : 'Get'}
            </span>
          </div>
        )}

        {/* Team logo badge — top right */}
        {primaryPalette?.logoKey && (
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
                onError={e => { e.target.style.display = 'none'; }}
              />
            </span>
          </div>
        )}
      </div>

      {/* ── Name banner ──────────────────────────────────────── */}
      <div className="relative px-2 lg:px-3 py-1 lg:py-1.5 text-center"
        style={{
          background: `linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.55) 15%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.55) 85%, transparent 100%)`,
          borderTop: '1px solid rgba(255,255,255,0.12)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
        <div className="text-[11px] lg:text-sm font-bold leading-tight tracking-wide uppercase"
          style={{ color: 'white', textShadow: '0 1px 3px rgba(0,0,0,0.6)', fontFamily: "'Barlow Condensed', sans-serif" }}>
          {primary?.name ?? primaryPick?.label ?? '—'}
        </div>
        {primary && (
          <div className="text-[8px] lg:text-[10px] font-medium tracking-wider uppercase mt-0.5"
            style={{ color: 'rgba(255,255,255,0.55)' }}>
            {[primary.team, primary.position].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>

      {/* ── Card details ─────────────────────────────────────── */}
      <div className="flex flex-col flex-1 px-2 pb-2 min-h-0 items-center"
        style={{ background: 'rgba(0,0,0,0.25)' }}>

        {/* ── Featured trade value ─── */}
        {primary?.value != null && (
          <div className="flex items-center justify-center py-1 lg:py-1.5">
            <span className="text-sm lg:text-base font-bold tabular-nums leading-tight"
              style={{ color: accentColor, textShadow: '0 1px 3px rgba(0,0,0,0.4)', WebkitTextStroke: darkMode ? '0.4px rgba(0,0,0,0.28)' : '0.4px rgba(255,255,255,0.25)' }}>
              {fmtKtcValue(primary.value)}
            </span>
          </div>
        )}

        {primary ? (
          <>
            {/* ── MOBILE stat boxes (lg:hidden) ─── */}
            <div className="flex gap-1 w-full lg:hidden">
              <div className="flex-1 rounded-lg p-1.5 flex flex-col items-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
                {primary?.ppg > 0 ? (
                  <>
                    <span className="text-sm font-bold tabular-nums leading-tight" style={{ color: 'white' }}>
                      {primary.ppg.toFixed(1)}
                    </span>
                    <span className="text-[8px] font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>PPG</span>
                  </>
                ) : (
                  <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>—</span>
                )}
              </div>
              {primary?.rank?.posLabel && (
                <div className="flex-1 rounded-lg p-1.5 flex flex-col items-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
                  <span className="text-sm font-bold tabular-nums leading-tight" style={{ color: 'rgba(255,255,255,0.85)' }}>
                    {primary.rank.posLabel}
                  </span>
                  <span className="text-[8px] font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Rank</span>
                </div>
              )}
            </div>

            {/* ── DESKTOP stat boxes (hidden lg:flex) ─── */}
            <div className="hidden lg:flex gap-1 w-full">
              {/* Left: Game Stats */}
              <div className="flex-1 rounded-lg p-1.5 flex flex-col gap-px" style={{ background: 'rgba(0,0,0,0.35)' }}>
                <span className="text-[7px] font-bold uppercase tracking-wide mb-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>Game Stats</span>
                {statDefs.length > 0 && playerStats ? (
                  statDefs.map(sd => (
                    <div key={sd.key} className="flex justify-between items-baseline">
                      <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.55)' }}>{sd.label}</span>
                      <span className="text-[9px] font-semibold tabular-nums" style={{ color: 'white' }}>
                        {fmtStat(playerStats[sd.key])}
                      </span>
                    </div>
                  ))
                ) : (
                  <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.35)' }}>—</span>
                )}
              </div>

              {/* Right: Fantasy Stats */}
              <div className="flex-1 rounded-lg p-1.5 flex flex-col gap-px" style={{ background: 'rgba(0,0,0,0.35)' }}>
                <span className="text-[7px] font-bold uppercase tracking-wide mb-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>Fantasy</span>
                {primary ? (
                  <>
                    <div className="flex justify-between items-baseline">
                      <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.55)' }}>PPG</span>
                      <span className="text-[9px] font-semibold tabular-nums" style={{ color: 'white' }}>
                        {primary.ppg > 0 ? primary.ppg.toFixed(1) : '—'}
                      </span>
                    </div>
                    {primary.recentAvg > 0 && (
                      <div className="flex justify-between items-baseline">
                        <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.55)' }}>L3 Avg</span>
                        <span className="text-[9px] font-semibold tabular-nums" style={{ color: 'white' }}>
                          {primary.recentAvg.toFixed(1)}
                        </span>
                      </div>
                    )}
                    {primary.seasonPts > 0 && (
                      <div className="flex justify-between items-baseline">
                        <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.55)' }}>Season</span>
                        <span className="text-[9px] font-semibold tabular-nums" style={{ color: 'white' }}>
                          {primary.seasonPts.toFixed(1)}
                        </span>
                      </div>
                    )}
                    {primary.rank?.posLabel && (
                      <div className="flex justify-between items-baseline">
                        <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.55)' }}>Rank</span>
                        <span className="text-[9px] font-semibold tabular-nums" style={{ color: 'rgba(255,255,255,0.85)' }}>
                          {primary.rank.posLabel}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.35)' }}>—</span>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 w-full" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

function getProposalCardSlotStyle(assetCount) {
  const count = Math.max(assetCount || 1, 1);
  const availableWidth = `calc((100% - (${count - 1} * var(--proposal-card-gap, 0.625rem))) / ${count})`;
  const cardMaxWidth = count >= 3
    ? 'clamp(9.5rem, 11vw, 11.5rem)'
    : count === 2
      ? 'clamp(10rem, 12vw, 12.25rem)'
      : 'clamp(10.5rem, 13vw, 13rem)';
  return {
    flex: `1 1 ${availableWidth}`,
    maxWidth: `min(${availableWidth}, ${cardMaxWidth})`,
    minWidth: 'min(100%, 9.5rem)',
    width: '100%',
  };
}

function getProposalDesktopSpan(proposal) {
  const incomingPlayers = proposal.incomingAssets.filter((asset) => asset.type === 'player').length;
  const outgoingPlayers = proposal.outgoingAssets.filter((asset) => asset.type === 'player').length;
  return (incomingPlayers + outgoingPlayers) >= 3 ? 2 : 1;
}

function buildDesktopProposalRows(proposals = []) {
  const rows = [];

  for (const proposal of proposals) {
    const span = getProposalDesktopSpan(proposal);
    let placed = false;

    for (const row of rows) {
      const used = row.reduce((sum, item) => sum + item.span, 0);
      if ((used + span) <= 2) {
        row.push({ proposal, span });
        placed = true;
        break;
      }
    }

    if (!placed) rows.push([{ proposal, span }]);
  }

  return rows;
}

function TradeProposalItem({
  proposal,
  darkMode,
  seasonStats,
  onApplyProposal,
  containerClassName = '',
  renderAllAssetsAsCards = false,
}) {
  const incomingPlayers = proposal.incomingAssets.filter(a => a.type === 'player');
  const outgoingPlayers = proposal.outgoingAssets.filter(a => a.type === 'player');
  const incomingPicks = proposal.incomingAssets.filter(a => a.type === 'pick');
  const outgoingPicks = proposal.outgoingAssets.filter(a => a.type === 'pick');
  const incomingCardAssets = renderAllAssetsAsCards ? proposal.incomingAssets : (incomingPlayers.length ? incomingPlayers : incomingPicks);
  const outgoingCardAssets = renderAllAssetsAsCards ? proposal.outgoingAssets : (outgoingPlayers.length ? outgoingPlayers : outgoingPicks);
  const incomingAssetsForCallout = renderAllAssetsAsCards ? [] : (incomingPlayers.length ? incomingPicks : []);
  const outgoingAssetsForCallout = renderAllAssetsAsCards ? [] : (outgoingPlayers.length ? outgoingPicks : []);
  const cardCount = incomingCardAssets.length + outgoingCardAssets.length;
  const wideDesktopLayout = cardCount >= 3;
  const outgoingCardCount = outgoingCardAssets.length || 1;
  const incomingCardCount = incomingCardAssets.length || 1;
  const sharedCardCount = Math.max(outgoingCardCount, incomingCardCount);
  const sharedCardSlotStyle = getProposalCardSlotStyle(sharedCardCount);
  const cardRefs = useRef(new Map());
  const [equalizedCardHeight, setEqualizedCardHeight] = useState(null);
  const measureFrameRef = useRef(null);

  const registerCardRef = useCallback((slotId, node) => {
    if (!slotId) return;
    if (node) cardRefs.current.set(slotId, node);
    else cardRefs.current.delete(slotId);
  }, []);

  const measureCardHeights = useCallback(() => {
    if (measureFrameRef.current) cancelAnimationFrame(measureFrameRef.current);
    measureFrameRef.current = requestAnimationFrame(() => {
      measureFrameRef.current = requestAnimationFrame(() => {
        const tallest = Array.from(cardRefs.current.values()).reduce((max, node) => {
          if (!node) return max;
          return Math.max(max, node.getBoundingClientRect().height);
        }, 0);
        const nextHeight = tallest ? Math.ceil(tallest) : null;
        setEqualizedCardHeight((prev) => (prev === nextHeight ? prev : nextHeight));
      });
    });
  }, []);

  useLayoutEffect(() => {
    measureCardHeights();
    return () => {
      if (measureFrameRef.current) cancelAnimationFrame(measureFrameRef.current);
    };
  }, [measureCardHeights, proposal.id, sharedCardCount, incomingPlayers.length, outgoingPlayers.length, incomingPicks.length, outgoingPicks.length, seasonStats, equalizedCardHeight]);

  useEffect(() => {
    const onResize = () => {
      measureCardHeights();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measureCardHeights]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      measureCardHeights();
    });
    Array.from(cardRefs.current.values()).forEach((node) => {
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [measureCardHeights, proposal.id, incomingPlayers.length, outgoingPlayers.length, incomingPicks.length, outgoingPicks.length, seasonStats]);

  return (
    <div className={`rounded-xl overflow-hidden ${containerClassName}`} style={{ border: '1px solid var(--color-separator)' }}>
      <div className="flex items-center justify-end gap-3 px-4 py-2.5"
        style={{ background: 'var(--color-fill-secondary)' }}>
        <button onClick={() => onApplyProposal?.(proposal)}
          className="px-3 py-1 rounded-lg text-xs font-semibold transition-colors shrink-0"
          style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}>
          Apply
        </button>
      </div>

      <div
        className={`flex justify-center gap-2.5 px-3 py-3 min-w-0 items-start ${wideDesktopLayout ? 'xl:gap-4' : ''}`}
        style={{ background: 'var(--color-fill)', '--proposal-card-gap': wideDesktopLayout ? '1rem' : '0.625rem' }}>
        <div className={`flex-1 min-w-0 flex flex-col gap-1.5 ${wideDesktopLayout ? 'max-w-[640px]' : 'max-w-[520px]'}`}>
          <div className="text-center pb-0.5">
            <span className="inline-block px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ background: 'var(--color-accent-red)', color: '#fff' }}>Give</span>
          </div>
          <div className="flex flex-col xl:flex-row xl:flex-wrap items-stretch xl:justify-center gap-2.5">
            {outgoingCardAssets.map((asset, index) => (
              <div
                key={asset.id}
                className="w-full xl:w-auto flex"
                style={{ ...sharedCardSlotStyle, height: equalizedCardHeight ? `${equalizedCardHeight}px` : '100%' }}
              >
                <ProposalPlayerCard
                  cardRef={(node) => registerCardRef(`give:${asset.id}:${index}`, node)}
                  player={asset.type === 'player' ? asset : null}
                  palette={asset.type === 'player' ? (asset.team ? teamPalette(asset.team, darkMode) : null) : null}
                  pick={asset.type === 'pick' ? asset : null}
                  side="give"
                  showSideBadge={false}
                  seasonStats={seasonStats}
                  forcedHeight={equalizedCardHeight}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="shrink-0 text-base font-bold self-center"
          style={{ color: 'var(--color-label-quaternary)' }}>
          ⇄
        </div>
        <div className={`flex-1 min-w-0 flex flex-col gap-1.5 ${wideDesktopLayout ? 'max-w-[640px]' : 'max-w-[520px]'}`}>
          <div className="text-center pb-0.5">
            <span className="inline-block px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ background: 'var(--color-accent-green)', color: '#fff' }}>Get</span>
          </div>
          <div className="flex flex-col xl:flex-row xl:flex-wrap items-stretch xl:justify-center gap-2.5">
            {incomingCardAssets.map((asset, index) => (
              <div
                key={asset.id}
                className="w-full xl:w-auto flex"
                style={{ ...sharedCardSlotStyle, height: equalizedCardHeight ? `${equalizedCardHeight}px` : '100%' }}
              >
                <ProposalPlayerCard
                  cardRef={(node) => registerCardRef(`get:${asset.id}:${index}`, node)}
                  player={asset.type === 'player' ? asset : null}
                  palette={asset.type === 'player' ? (asset.team ? teamPalette(asset.team, darkMode) : null) : null}
                  pick={asset.type === 'pick' ? asset : null}
                  side="get"
                  showSideBadge={false}
                  seasonStats={seasonStats}
                  forcedHeight={equalizedCardHeight}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {(outgoingAssetsForCallout.length > 0 || incomingAssetsForCallout.length > 0) && (
        <div className="flex items-start justify-center gap-2.5 px-3 pb-2"
          style={{ background: 'var(--color-fill)' }}>
          <div className={`flex-1 flex flex-wrap justify-center gap-1.5 ${wideDesktopLayout ? 'max-w-[640px]' : 'max-w-[520px]'}`}>
            {outgoingAssetsForCallout.map(asset => (
              <span key={asset.id} className="max-w-full">
                <AssetBadge asset={asset} />
              </span>
            ))}
          </div>
          <div className="shrink-0 text-base" style={{ visibility: 'hidden' }}>⇄</div>
          <div className={`flex-1 flex flex-wrap justify-center gap-1.5 ${wideDesktopLayout ? 'max-w-[640px]' : 'max-w-[520px]'}`}>
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
        <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--color-label)' }}>
          <span className="font-semibold" style={{ color: 'var(--color-label)' }}>You: </span>
          {proposal.whyItHelpsMe}
        </p>
        <p className="text-[12.5px] leading-relaxed mt-1" style={{ color: 'var(--color-label)' }}>
          <span className="font-semibold" style={{ color: 'var(--color-label)' }}>Them: </span>
          {proposal.whyItHelpsThem}
        </p>
      </div>
    </div>
  );
}

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

function matchesProposalFilters(proposal, filters) {
  const outgoingPlayers = proposal.outgoingAssets.filter((asset) => asset.type === 'player').length;
  const incomingPlayers = proposal.incomingAssets.filter((asset) => asset.type === 'player').length;
  const outgoingPicks = proposal.outgoingAssets.filter((asset) => asset.type === 'pick').length;
  const incomingPicks = proposal.incomingAssets.filter((asset) => asset.type === 'pick').length;

  if (filters.outgoingPlayers !== 'any' && outgoingPlayers !== Number(filters.outgoingPlayers)) return false;
  if (filters.incomingPlayers !== 'any' && incomingPlayers !== Number(filters.incomingPlayers)) return false;
  if (filters.outgoingPicks === 'with' && outgoingPicks === 0) return false;
  if (filters.outgoingPicks === 'without' && outgoingPicks > 0) return false;
  if (filters.incomingPicks === 'with' && incomingPicks === 0) return false;
  if (filters.incomingPicks === 'without' && incomingPicks > 0) return false;

  return true;
}

function nextProposalFilters(prev, key, value, activeMode = 'needs') {
  const next = { ...prev, [key]: value };

  if (key === 'outgoingPlayers' && value === '0') next.outgoingPicks = 'with';
  if (key === 'incomingPlayers' && value === '0' && activeMode !== 'needs') next.incomingPicks = 'with';
  if (key === 'incomingPlayers' && value === '0' && activeMode === 'needs') next.incomingPlayers = 'any';

  if (key === 'outgoingPicks' && value === 'without' && prev.outgoingPlayers === '0') next.outgoingPlayers = 'any';
  if (key === 'incomingPicks' && value === 'without' && prev.incomingPlayers === '0') next.incomingPlayers = 'any';

  return next;
}

function TradeProposalPanel({
  partnerRosterId,
  partnerName,
  tradeProposals,
  surplusTradeProposals,
  activeMode,
  onModeChange,
  onApplyProposal,
}) {
  const { darkMode } = useTheme();
  const { seasonStats } = useSleeper();
  const [proposalFilters, setProposalFilters] = useState({
    outgoingPlayers: 'any',
    incomingPlayers: 'any',
    outgoingPicks: 'any',
    incomingPicks: 'any',
  });
  useEffect(() => {
    if (activeMode !== 'needs') return;
    setProposalFilters((prev) => {
      if (prev.incomingPlayers !== '0') return prev;
      return {
        ...prev,
        incomingPlayers: 'any',
      };
    });
  }, [activeMode]);
  const activeProposals = activeMode === 'surplus' ? surplusTradeProposals : tradeProposals;
  const filteredProposals = useMemo(
    () => activeProposals.filter((proposal) => matchesProposalFilters(proposal, proposalFilters)),
    [activeProposals, proposalFilters],
  );
  const desktopRows = buildDesktopProposalRows(filteredProposals);
  const hasActiveFilters = Object.values(proposalFilters).some((value) => value !== 'any');
  const activeEmptyText = activeMode === 'surplus'
    ? 'No surplus-driven trade ideas are available right now.'
    : 'No need-driven trade ideas are available right now.';

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
              ? 'Switch between needs-based ideas and surplus-driven ideas without changing the proposal cards.'
              : 'Select a manager above to look for trade ideas.'}
          </p>
          {partnerRosterId && (
            <p className="text-[11px] mt-2 max-w-2xl" style={{ color: 'var(--color-label-tertiary)' }}>
              {activeMode === 'needs'
                ? 'Fix Needs: you always receive at least one player; picks only appear as compensation.'
                : 'Use Surplus: you can receive players, picks, or a mix.'}
            </p>
          )}
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
                      const disabled = (
                        (group.key === 'outgoingPicks' && option.value === 'without' && proposalFilters.outgoingPlayers === '0')
                        || (group.key === 'incomingPicks' && option.value === 'without' && proposalFilters.incomingPlayers === '0')
                      );
                      return (
                        <button
                          key={option.value}
                          onClick={() => {
                            if (disabled) return;
                            setProposalFilters((prev) => nextProposalFilters(prev, group.key, option.value, activeMode));
                          }}
                          disabled={disabled}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors"
                          style={{
                            background: active ? 'var(--color-signature)' : 'var(--color-fill)',
                            color: disabled
                              ? 'var(--color-label-quaternary)'
                              : active
                                ? 'var(--color-signature-fg)'
                                : 'var(--color-label-secondary)',
                            border: '1px solid var(--color-separator)',
                            opacity: disabled ? 0.55 : 1,
                          }}
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
        <div className="flex items-center gap-2 shrink-0 self-start">
          {hasActiveFilters && (
            <button
              onClick={() => setProposalFilters({
                outgoingPlayers: 'any',
                incomingPlayers: 'any',
                outgoingPicks: 'any',
                incomingPicks: 'any',
              })}
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
          <div className="pt-4 space-y-3 xl:hidden">
            {filteredProposals.map((proposal) => (
              <TradeProposalItem
                key={proposal.id}
                proposal={proposal}
                darkMode={darkMode}
                seasonStats={seasonStats}
                onApplyProposal={onApplyProposal}
              />
            ))}
          </div>

          <div className="hidden xl:flex xl:flex-col xl:gap-3 xl:pt-4">
            {desktopRows.map((row, rowIndex) => {
              if (row.length === 1) {
                const [item] = row;
                const centeredSingle = item.span === 1;
                return (
                  <div key={`row-${rowIndex}`} className={centeredSingle ? 'flex justify-center' : 'block'}>
                    <TradeProposalItem
                      proposal={item.proposal}
                      darkMode={darkMode}
                      seasonStats={seasonStats}
                      onApplyProposal={onApplyProposal}
                      containerClassName={centeredSingle ? 'w-full max-w-[720px]' : 'w-full'}
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
}

function UpgradeFinderPage({
  players,
  searchSubmitted,
  selectedPlayerId,
  selectedOutgoingPlayerIds,
  tradePostureLevel,
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
  getUserDisplayName,
  rosters,
  onSelectPlayer,
  onToggleOutgoingPlayer,
  onAllowOutgoingPicksChange,
  onAllowIncomingPicksChange,
  onAllowPackagesChange,
  onTradePostureChange,
  onRunSearch,
  onApplyProposal,
  onBack,
}) {
  const resultsRef = useRef(null);
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const [offerPickerOpen, setOfferPickerOpen] = useState(false);

  const selectableCards = useMemo(() => players.map((player) => {
    const sleeperPlayer = sleeperPlayers?.[player.id] ?? {};
    const team = sleeperPlayer.team ?? player.team ?? '';
    const position = sleeperPlayer.position ?? player.position ?? '';
    return {
      id: player.id,
      name: sleeperPlayer.full_name ?? player.name,
      team,
      position,
      ppg: player.ppg ?? null,
      value: playerValueMap?.get(player.id) ?? null,
      palette: team ? teamPalette(team, darkMode) : null,
    };
  }), [darkMode, playerValueMap, players, sleeperPlayers]);

  const playerCardMap = useMemo(
    () => new Map(selectableCards.map((player) => [player.id, player])),
    [selectableCards],
  );

  const selectedPlayer = selectedPlayerId ? (playerCardMap.get(selectedPlayerId) ?? null) : null;
  const selectedOutgoingPlayers = useMemo(
    () => selectedOutgoingPlayerIds.map((id) => playerCardMap.get(id)).filter(Boolean),
    [playerCardMap, selectedOutgoingPlayerIds],
  );

  const hasSelectedOutgoingPlayers = selectedOutgoingPlayers.length > 0;
  const outgoingReady = hasSelectedOutgoingPlayers || allowOutgoingPicks;
  const canSearch = Boolean(selectedPlayerId) && outgoingReady;

  const steps = [
    { label: 'Target', active: true, complete: Boolean(selectedPlayerId) },
    { label: 'Offer', active: Boolean(selectedPlayerId), complete: hasSelectedOutgoingPlayers },
    { label: 'Picks', active: Boolean(selectedPlayerId), complete: allowOutgoingPicks || allowIncomingPicks || canSearch },
    { label: 'Posture', active: canSearch, complete: false },
  ];

  useEffect(() => {
    onAllowPackagesChange?.(selectedOutgoingPlayerIds.length > 1);
  }, [onAllowPackagesChange, selectedOutgoingPlayerIds.length]);

  useEffect(() => {
    if (!searchSubmitted || !resultsRef.current) return;
    resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [searchSubmitted, results]);

  const selectionButton = ({ title, description, onClick, cta }) => (
    <button
      onClick={onClick}
      className="w-full rounded-xl px-4 py-3 text-left border transition-colors"
      style={{
        background: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-separator)',
        color: 'var(--color-label)',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
            {description}
          </div>
        </div>
        <span
          className="shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: 'var(--color-fill)', color: 'var(--color-label)' }}
        >
          <span>{cta}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </span>
      </div>
    </button>
  );

  const renderSelectedCard = ({ player, side, onRemove }) => (
    <div key={player.id} className="group relative w-[210px] max-w-full flex-none self-start">
      {onRemove && (
        <button
          onClick={() => onRemove(player.id)}
          className="absolute top-2 right-2 z-20 w-7 h-7 rounded-full flex items-center justify-center border transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
          style={{
            background: 'rgba(12,15,20,0.82)',
            color: '#fff',
            borderColor: 'rgba(255,255,255,0.2)',
          }}
          aria-label={`Remove ${player.name}`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M18 6 6 18" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      )}
      <ProposalPlayerCard
        player={player}
        palette={player.palette}
        side={side}
        seasonStats={seasonStats}
        showSideBadge={false}
      />
    </div>
  );

  const renderToggleCard = ({ active, title, description, onClick }) => (
    <button
      onClick={onClick}
      className="rounded-xl px-3 py-3 text-left border transition-colors"
      style={{
        background: active ? 'rgba(245,183,0,0.08)' : 'var(--color-bg-secondary)',
        borderColor: active ? 'var(--color-signature)' : 'var(--color-separator)',
        color: 'var(--color-label)',
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5"
          style={{
            borderColor: active ? 'var(--color-signature)' : 'var(--color-label-quaternary)',
            background: active ? 'var(--color-signature)' : 'transparent',
            color: active ? 'var(--color-signature-fg)' : 'transparent',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--color-label-secondary)' }}>
            {description}
          </div>
        </div>
      </div>
    </button>
  );

  const postureColor = (level) => {
    if (level <= 1) return 'var(--color-accent-green)';
    if (level === 2) return 'var(--color-signature)';
    if (level === 3) return 'var(--color-accent-orange)';
    return 'var(--color-accent-red)';
  };

  const renderPostureIcon = (level, selected) => {
    const iconColor = selected
      ? (level <= 2 ? 'var(--color-signature-fg)' : '#fff')
      : postureColor(level);
    if (level === 0) {
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: iconColor }}>
          <path d="M19 5 5 19" />
          <path d="M9 19H5v-4" />
        </svg>
      );
    }
    if (level === 1) {
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: iconColor }}>
          <path d="M19 7 7 19" />
          <path d="M19 13V7h-6" />
        </svg>
      );
    }
    if (level === 2) {
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: iconColor }}>
          <path d="M12 3v18" />
          <path d="M5 8h14" />
          <path d="M7 8c0 2-1.5 4-3 5 1.5 1 3 3 3 5" />
          <path d="M17 8c0 2 1.5 4 3 5-1.5 1-3 3-3 5" />
        </svg>
      );
    }
    if (level === 3) {
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: iconColor }}>
          <path d="M5 17 17 5" />
          <path d="M11 5h6v6" />
        </svg>
      );
    }
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: iconColor }}>
        <path d="M5 19 19 5" />
        <path d="M15 5h4v4" />
      </svg>
    );
  };

  const buildFallbackLabel = (proposal) => {
    if (!proposal.context?.theirTradeAwayPosition) return 'Fallback';
    return `Their Fallback At ${proposal.context.theirTradeAwayPosition}`;
  };

  return (
    <section className="rounded-2xl p-5 lg:p-6" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-separator)' }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>
            Upgrades
          </div>
          <h2
            className="mt-2 text-lg font-bold leading-tight"
            style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em' }}
          >
            Search The League For Upgrade Paths
          </h2>
          <p className="text-sm mt-2 max-w-2xl" style={{ color: 'var(--color-label-secondary)' }}>
            Pick your target, choose what you are willing to move, then search the league for realistic upgrade paths.
          </p>
        </div>
      </div>
      <div className="mt-6 flex flex-col gap-6">
        <section>
          <div className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--color-label-tertiary)' }}>
            Step 1 · Select A Player To Upgrade
          </div>

          
{selectedPlayer ? (
            <div className="flex flex-col items-center gap-3">
              <div className="flex justify-center w-full">
                {renderSelectedCard({ player: selectedPlayer, side: 'get' })}
              </div>
              <div className="flex justify-center w-full">
                <button
                  onClick={() => setTargetPickerOpen(true)}
                  className="px-3 py-2 rounded-lg text-sm font-semibold border transition-colors"
                  style={{
                    background: 'var(--color-bg-secondary)',
                    borderColor: 'var(--color-separator)',
                    color: 'var(--color-label)',
                  }}
                >
                  Change target player
                </button>
              </div>
            </div>
          ) : (

            selectionButton({
              title: 'Choose your target player',
              description: 'Open the player picker and choose the player you want this search to improve.',
              onClick: () => setTargetPickerOpen(true),
              cta: 'Open picker',
            })
          )}
        </section>

        <div style={{ borderTop: '1px solid var(--color-separator)' }} />

        <section>
          <div className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--color-label-tertiary)' }}>
            Step 2 · Choose Players You Can Move
          </div>

          
{hasSelectedOutgoingPlayers ? (
            <div className="flex flex-col items-center gap-3">
              <div className="flex flex-wrap justify-center items-start gap-3 w-full">
                {selectedOutgoingPlayers.map((player) => renderSelectedCard({
                  player,
                  side: 'give',
                  onRemove: onToggleOutgoingPlayer,
                }))}
              </div>
              <div className="flex flex-wrap justify-center gap-2 w-full">
                <button
                  onClick={() => setOfferPickerOpen(true)}
                  className="px-3 py-2 rounded-lg text-sm font-semibold border transition-colors"
                  style={{
                    background: 'var(--color-bg-secondary)',
                    borderColor: 'var(--color-separator)',
                    color: 'var(--color-label)',
                  }}
                >
                  Add or change players
                </button>
                <button
                  onClick={() => selectedOutgoingPlayerIds.forEach((id) => onToggleOutgoingPlayer(id))}
                  className="px-3 py-2 rounded-lg text-sm font-semibold border transition-colors"
                  style={{
                    background: 'var(--color-fill)',
                    borderColor: 'var(--color-separator)',
                    color: 'var(--color-label-secondary)',
                  }}
                >
                  Clear players
                </button>
              </div>
            </div>
          ) : (


            <div className="flex flex-col gap-3">
              {selectionButton({
                title: 'Add one or more outgoing players',
                description: 'Use the same player picker to build the pool you are comfortable moving in this search.',
                onClick: () => setOfferPickerOpen(true),
                cta: 'Add players',
              })}
              <div className="text-xs" style={{ color: 'var(--color-label-secondary)' }}>
                You can leave this empty if you want to search pick-led offers instead.
              </div>
            </div>
          )}
        </section>

        <div style={{ borderTop: '1px solid var(--color-separator)' }} />

        <section>
          <div className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--color-label-tertiary)' }}>
            Step 3 · Pick Intent
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {renderToggleCard({
              active: allowOutgoingPicks,
              title: 'Willing to trade picks',
              description: 'Let the search add your picks when a player-only package needs help closing the gap.',
              onClick: () => onAllowOutgoingPicksChange(!allowOutgoingPicks),
            })}
            {renderToggleCard({
              active: allowIncomingPicks,
              title: 'Willing to accept picks back',
              description: 'Let the search ask for their picks when the return package should tilt back toward you.',
              onClick: () => onAllowIncomingPicksChange(!allowIncomingPicks),
            })}
          </div>
          <div className="text-xs mt-2" style={{ color: 'var(--color-label-secondary)' }}>
            In Fix Needs mode, incoming picks act as compensation around the player upgrade rather than replacing it.
          </div>
        </section>

        <div style={{ borderTop: '1px solid var(--color-separator)' }} />

        <section>
          <div className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--color-label-tertiary)' }}>
            Step 4 · Trade Posture
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {postureOptions.map((option) => {
              const selected = option.level === tradePostureLevel;
              const selectedColor = postureColor(option.level);
              const selectedText = option.level <= 2 ? 'var(--color-signature-fg)' : '#fff';
              return (
                <button
                  key={option.level}
                  onClick={() => onTradePostureChange(option.level)}
                  className="rounded-xl px-3 py-3 text-left border transition-colors"
                  style={{
                    background: selected ? selectedColor : 'var(--color-bg-secondary)',
                    borderColor: selected ? selectedColor : 'var(--color-separator)',
                    color: selected ? selectedText : 'var(--color-label)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        background: selected ? 'rgba(12,15,20,0.14)' : 'var(--color-fill)',
                        color: selected ? selectedText : selectedColor,
                      }}
                    >
                      {renderPostureIcon(option.level, selected)}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold leading-tight">{option.label}</div>
                      <div className="text-[11px] mt-1 hidden sm:block leading-relaxed" style={{ color: selected ? selectedText : 'var(--color-label-secondary)' }}>
                        {option.description}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <button
          onClick={onRunSearch}
          disabled={!canSearch}
          className="w-full py-3 rounded-xl text-sm font-bold uppercase transition-colors"
          style={{
            background: canSearch ? 'var(--color-signature)' : 'var(--color-fill)',
            color: canSearch ? 'var(--color-signature-fg)' : 'var(--color-label-tertiary)',
            fontFamily: "'Barlow Condensed', sans-serif",
            letterSpacing: '0.08em',
          }}
        >
          Find Matches
        </button>

        {searchSubmitted && (
          <section ref={resultsRef}>
            <div className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--color-label-tertiary)' }}>
              Results
            </div>
            <div className="text-sm mb-4" style={{ color: 'var(--color-label-secondary)' }}>
              {results?.targetPlayer
                ? `Showing matches for ${results.targetPlayer.label ?? results.targetPlayer.name}.`
                : selectedPlayer
                  ? `Showing the latest search around ${selectedPlayer.name}.`
                  : 'Showing the latest upgrade search results.'}
            </div>
            {!results?.groups?.length ? (
              <div className="rounded-2xl px-5 py-8 text-center" style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)', border: '1px solid var(--color-separator)' }}>
                <div className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>No feasible upgrade paths found.</div>
                <div className="text-xs mt-2">
                  Try widening your outgoing player pool, opening up pick intent, or moving the posture closer to fair.
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {results.groups.map((group) => {
                  const roster = rosters.find((entry) => entry.roster_id === (group.rosterId ?? group.managerRosterId));
                  const managerName = getUserDisplayName(roster?.owner_id ?? '');
                  const initial = (managerName?.trim()?.[0] ?? '?').toUpperCase();
                  return (
                    <div key={group.rosterId ?? group.managerRosterId} className="rounded-2xl p-4 lg:p-5" style={{ background: 'var(--color-fill)', border: '1px solid var(--color-separator)' }}>
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-label)', border: '1px solid var(--color-separator)' }}>
                            {initial}
                          </span>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate" style={{ color: 'var(--color-label)' }}>
                              {managerName}
                            </div>
                            <div className="text-[11px]" style={{ color: 'var(--color-label-secondary)' }}>
                              {group.proposals.length} {group.proposals.length === 1 ? 'deal' : 'deals'}
                            </div>
                          </div>
                        </div>
                        <span className="px-2 py-1 rounded-lg text-[11px] font-semibold shrink-0" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-label-secondary)', border: '1px solid var(--color-separator)' }}>
                          {group.proposals.length}
                        </span>
                      </div>

                      <div className="flex flex-col gap-4">
                        {group.proposals.map((proposal) => (
                          <div key={proposal.id} className="flex flex-col gap-3">
                            <TradeProposalItem
                              proposal={proposal}
                              darkMode={darkMode}
                              seasonStats={seasonStats}
                              onApplyProposal={onApplyProposal}
                              renderAllAssetsAsCards
                            />
                            <div className="grid gap-2 lg:grid-cols-3">
                              <div className="rounded-xl px-3 py-3 border-l-[3px]" style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-accent-green)' }}>
                                <div className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-label-tertiary)' }}>
                                  Your Upgrade
                                </div>
                                <div className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
                                  {(proposal.context?.myUpgradeFrom?.name ?? 'Current starter')} → {(proposal.context?.myUpgradeTo?.name ?? 'Target')}
                                </div>
                                <div className="text-[11px] mt-1" style={{ color: 'var(--color-label-secondary)' }}>
                                  {fmtPpg(proposal.context?.myUpgradeFrom?.ppg ?? 0)} PPG → {fmtPpg(proposal.context?.myUpgradeTo?.ppg ?? 0)} PPG · +{fmtPpg(proposal.context?.myUpgradeDelta ?? proposal.upgradeDelta ?? 0)}
                                </div>
                                <div className="text-[11px] mt-2" style={{ color: 'var(--color-label-secondary)' }}>
                                  {proposal.context?.myNeedFallback
                                    ? `Closest fallback: ${proposal.context.myNeedFallback.name} · ${fmtPpg(proposal.context.myNeedFallback.ppg ?? 0)} PPG · Depth ${proposal.context?.myNeedDepthCurrent ?? '—'}`
                                    : `Closest fallback: None clear · Depth ${proposal.context?.myNeedDepthCurrent ?? 0}`}
                                </div>
                              </div>

                              <div className="rounded-xl px-3 py-3 border-l-[3px]" style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-accent)' }}>
                                <div className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-label-tertiary)' }}>
                                  Their Need
                                </div>
                                <div className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
                                  {proposal.context?.theirNeedPosition ?? proposal.theirNeedPosition ?? 'Need context unavailable'}
                                </div>
                                <div className="text-[11px] mt-1" style={{ color: 'var(--color-label-secondary)' }}>
                                  {proposal.context?.theirNeedStarter
                                    ? `${proposal.context.theirNeedStarter.name} · ${fmtPpg(proposal.context.theirNeedStarter.ppg ?? 0)} PPG`
                                    : 'Starter context unavailable'}
                                </div>
                                <div className="text-[11px] mt-2" style={{ color: 'var(--color-label-secondary)' }}>
                                  {`Gain +${fmtPpg(proposal.context?.theirUpgradeDelta ?? 0)} PPG · Current playable depth ${proposal.context?.theirNeedDepthCurrent ?? '—'}`}
                                </div>
                              </div>

                              <div className="rounded-xl px-3 py-3 border-l-[3px]" style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-separator-opaque)' }}>
                                <div className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-label-tertiary)' }}>
                                  {buildFallbackLabel(proposal)}
                                </div>
                                {proposal.context?.theirTradeAwayFallback ? (
                                  <>
                                    <div className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
                                      {proposal.context.theirTradeAwayFallback.name}
                                    </div>
                                    <div className="text-[11px] mt-1" style={{ color: 'var(--color-label-secondary)' }}>
                                      {fmtPpg(proposal.context.theirTradeAwayFallback.ppg ?? 0)} PPG · Drop-off {fmtPpg(proposal.context.theirTradeAwayDropoff ?? 0)} · Depth {proposal.context.theirTradeAwayDepthAfter ?? '—'}
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-[11px]" style={{ color: 'var(--color-label-secondary)' }}>
                                    They would not have a clear fallback after moving this player.
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      {targetPickerOpen && (
        <TradeRosterPicker
          rosterId={myRosterId}
          rosters={rosters}
          sleeperPlayers={sleeperPlayers}
          ktcPlayers={ktcPlayers}
          dynastyKtcPlayers={dynastyKtcPlayers}
          leagueType={leagueType}
          excludeIds={[]}
          allowedIds={players.map((player) => player.id)}
          seasonStats={seasonStats}
          scoringSettings={scoringSettings}
          getUserDisplayName={getUserDisplayName}
          myRosterId={myRosterId}
          includeOwnRoster={false}
          currentTotal={0}
          activeRosterId={myRosterId}
          mergedIDPMap={mergedIDPMap}
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
          allowedIds={players.filter((player) => player.id !== selectedPlayerId).map((player) => player.id)}
          seasonStats={seasonStats}
          scoringSettings={scoringSettings}
          getUserDisplayName={getUserDisplayName}
          myRosterId={myRosterId}
          includeOwnRoster={false}
          currentTotal={0}
          activeRosterId={myRosterId}
          mergedIDPMap={mergedIDPMap}
          onSelect={(result) => {
            const nextId = typeof result === 'object' ? result.id : result;
            onToggleOutgoingPlayer(nextId);
          }}
          onClose={() => setOfferPickerOpen(false)}
        />
      )}
    </section>
  );
}

// ── ValueBar ──────────────────────────────────────────────────────────────────

function ValueBar({ yourTotal, theirTotal, verdict: { verdict, gap, pct } }) {
  const max = Math.max(yourTotal, theirTotal, 1);
  const yourFrac = yourTotal / max;
  const theirFrac = theirTotal / max;

  const verdictMeta = {
    fair:        { text: 'Fair Trade',   color: '#22c55e' },
    favors_you:  { text: 'Favors You',   color: 'var(--color-signature)' },
    favors_them: { text: 'Favors Them',  color: '#ef4444' },
  };
  const { text, color } = verdictMeta[verdict] ?? verdictMeta.fair;

  return (
    <div className="flex flex-col gap-2 rounded-xl px-3 py-3" style={{ background: 'var(--color-fill)' }}>
      {/* Side totals */}
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--color-label-quaternary)' }}>
            Your Side
          </span>
          <span className="text-lg font-bold tabular-nums leading-none"
            style={{ color: verdict === 'favors_them' ? 'var(--color-label)' : 'var(--color-accent)' }}>
            {fmtKtcValue(yourTotal)}
          </span>
        </div>
        <div className="text-center flex flex-col items-center gap-0.5">
          {verdict !== 'fair' && gap > 0 && (
            <>
              <span className="text-sm font-bold tabular-nums" style={{ color }}>{fmtKtcValue(gap)}</span>
              <span className="text-xs font-semibold" style={{ color }}>{pct}% gap</span>
            </>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--color-label-quaternary)' }}>
            Their Side
          </span>
          <span className="text-lg font-bold tabular-nums leading-none"
            style={{ color: verdict === 'favors_you' ? 'var(--color-label)' : 'var(--color-accent)' }}>
            {fmtKtcValue(theirTotal)}
          </span>
        </div>
      </div>

      {/* Bar */}
      <div className="flex gap-0.5 h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--color-fill-secondary)' }}>
        <div className="h-full rounded-l-full transition-all duration-500"
          style={{ width: `${yourFrac * 100}%`, background: verdict === 'favors_them' ? 'var(--color-label-tertiary)' : 'var(--color-accent)' }} />
        <div className="h-full rounded-r-full transition-all duration-500"
          style={{ width: `${theirFrac * 100}%`, background: verdict === 'favors_you' ? 'var(--color-label-tertiary)' : 'var(--color-accent)' }} />
      </div>

      {/* Verdict label */}
      <div className="text-center">
        <span className="text-sm font-bold" style={{ color }}>{text}</span>
        {verdict === 'fair' && (
          <span className="text-xs ml-2" style={{ color: 'var(--color-label-quaternary)' }}>straight swap is reasonable</span>
        )}
      </div>
    </div>
  );
}

// ── TrendRow ──────────────────────────────────────────────────────────────────

function TrendRow({ item, leagueType }) {
  const vals = leagueType === 'sf' ? item.ktcEntry?.superflexValues : item.ktcEntry?.oneQBValues;
  if (!vals) return null;

  const trend7 = vals.overall7DayTrend ?? 0;
  const trendAll = vals.overallTrend ?? 0;

  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg"
      style={{ background: 'var(--color-fill)' }}>
      <span className="text-xs font-medium truncate" style={{ color: 'var(--color-label)' }}>
        {item.label}
      </span>
      <div className="flex gap-3 shrink-0">
        <TrendValue label="7d" value={trend7} />
        <TrendValue label="30d" value={trendAll} />
      </div>
    </div>
  );
}

function TrendValue({ label, value }) {
  const color = value > 0 ? 'var(--color-accent-green, #22c55e)'
    : value < 0 ? 'var(--color-destructive, #ef4444)'
    : 'var(--color-label-quaternary)';
  return (
    <span className="text-xs tabular-nums" style={{ color }}>
      {label}: {value > 0 ? '+' : ''}{value}
    </span>
  );
}

// ── ValuationInfoSheet ────────────────────────────────────────────────────────

function ValuationInfoSheet({ format, leagueType, scoringSettings, rosterPositions, multipliers, isAdjusted, onClose }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

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
    ['Tackles', scoringSettings?.idp_tkl ?? 0, '0 pts'],
    ['Solo tackles', scoringSettings?.idp_tkl_solo ?? 0, '0 pts'],
    ['Assisted tackles', scoringSettings?.idp_tkl_ast ?? 0, '0 pts'],
    ['Tackles for loss', scoringSettings?.idp_tkl_loss ?? 0, '0 pts'],
    ['Sacks', scoringSettings?.idp_sack ?? 0, '0 pts'],
    ['Sack yards', scoringSettings?.idp_sack_yd ?? 0, '0 pts'],
    ['Interceptions', scoringSettings?.idp_int ?? 0, '0 pts'],
    ['INT return yards', scoringSettings?.idp_int_ret_yd ?? 0, '0 pts'],
    ['INT TDs', scoringSettings?.idp_int_td ?? 0, '0 pts'],
    ['Forced fumbles', scoringSettings?.idp_ff ?? 0, '0 pts'],
    ['Fumble recoveries', scoringSettings?.idp_fr ?? 0, '0 pts'],
    ['Fumble return yards', scoringSettings?.idp_fr_yd ?? 0, '0 pts'],
    ['Fumble return TDs', scoringSettings?.idp_fr_td ?? 0, '0 pts'],
    ['Defensive TDs', scoringSettings?.idp_def_td ?? 0, '0 pts'],
    ['Passes defended', scoringSettings?.idp_pd ?? 0, '0 pts'],
    ['QB hits', scoringSettings?.idp_qbhit ?? 0, '0 pts'],
    ['Safeties', scoringSettings?.idp_safety ?? 0, '0 pts'],
    ['Blocked kicks', scoringSettings?.idp_blk_kick ?? 0, '0 pts'],
    ['2+ sack bonus', scoringSettings?.bonus_sack_2p ?? 0, 'None'],
    ['10+ tackle bonus', scoringSettings?.bonus_tkl_10p ?? 0, 'None'],
    ['3+ pass defense bonus', scoringSettings?.idp_pass_def_3p ?? 0, 'None'],
  ].filter(([, value]) => value !== 0);

  const dstRows = [
    ['Team D/ST TDs', scoringSettings?.def_td ?? 0, '0 pts'],
    ['Team sacks', scoringSettings?.sack ?? 0, '0 pts'],
    ['Team INTs', scoringSettings?.int ?? 0, '0 pts'],
    ['Team safeties', scoringSettings?.safe ?? 0, '0 pts'],
    ['3-and-outs', scoringSettings?.def_3_and_out ?? 0, '0 pts'],
    ['4th-down stops', scoringSettings?.def_4_and_stop ?? 0, '0 pts'],
    ['Forced punts', scoringSettings?.def_forced_punts ?? 0, '0 pts'],
    ['Team pass defenses', scoringSettings?.def_pass_def ?? 0, '0 pts'],
    ['Points allowed', scoringSettings?.pts_allow ?? 0, '0 pts'],
    ['Points allowed: 0', scoringSettings?.pts_allow_0 ?? 0, '0 pts'],
    ['Points allowed: 1-6', scoringSettings?.pts_allow_1_6 ?? 0, '0 pts'],
    ['Points allowed: 7-13', scoringSettings?.pts_allow_7_13 ?? 0, '0 pts'],
    ['Points allowed: 14-20', scoringSettings?.pts_allow_14_20 ?? 0, '0 pts'],
    ['Points allowed: 21-27', scoringSettings?.pts_allow_21_27 ?? 0, '0 pts'],
    ['Points allowed: 28-34', scoringSettings?.pts_allow_28_34 ?? 0, '0 pts'],
    ['Points allowed: 35+', scoringSettings?.pts_allow_35p ?? 0, '0 pts'],
  ].filter(([, value]) => value !== 0);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="flex flex-col rounded-2xl overflow-hidden w-full mx-4"
        style={{ background: 'var(--color-bg)', maxHeight: '80vh', maxWidth: 560 }}
        onClick={e => e.stopPropagation()}>

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
                  {idpRows.map(([label, value, baseline]) => (
                    <AdjustmentRow
                      key={`idp-${label}`}
                      label={label}
                      leagueValue={typeof value === 'number' ? `${value} pts` : String(value)}
                      baseline={baseline}
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
                  {dstRows.map(([label, value, baseline]) => (
                    <AdjustmentRow
                      key={`dst-${label}`}
                      label={label}
                      leagueValue={typeof value === 'number' ? `${value} pts` : String(value)}
                      baseline={baseline}
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
      </div>
    </div>
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
  rosterPicks, slots, season, pickValueMap, rosters, getUserDisplayName,
  seasonStats, scoringSettings, positionalAvgPPG, positionalValuePerPPG, rankMap,
  theirPlayers, theirPicks, theirSideItems,
  mergedIDPMap, hasIDP, hasDST,
  onAddPlayer, onAddPick, onClose,
}) {
  const { darkMode } = useTheme();

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const addedPlayerIds = useMemo(() => new Set(theirPlayers), [theirPlayers]);
  const addedPickKeys  = useMemo(() => new Set(theirPicks.map(p => p.key)), [theirPicks]);

  const ORDINALS = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' };

  // Player list — sorted by adjusted value descending
  const players = useMemo(() => {
    if (!roster || !sleeperPlayers) return [];
    const ids = [...new Set([...(roster.players ?? []), ...(roster.reserve ?? [])])];
    return ids.map(id => {
      const sp = sleeperPlayers[id];
      if (!sp) return null;
      // Use enriched adjVal from theirSide if the player is already on it; otherwise compute raw
      const enriched = theirSideItems?.find(it => it.id === id);
      const ktc = findKtcPlayerFromSleeper(id, sleeperPlayers, adjustedKtcPlayers ?? []);
      let rawVal = getKtcValue(ktc, leagueType);
      let dynastyFallback = false;
      if (rawVal == null && adjustedDynastyKtcPlayers?.length) {
        const dKtc = findKtcPlayerFromSleeper(id, sleeperPlayers, adjustedDynastyKtcPlayers);
        const dVal = getKtcValue(dKtc, leagueType);
        if (dVal != null) {
          rawVal = Math.round(dVal * DYNASTY_FALLBACK_MULT);
          dynastyFallback = true;
        }
      }
      // IDP/DST fallback — production-computed value
      const idpFallback = rawVal == null && mergedIDPMap?.has(id);
      if (idpFallback) rawVal = mergedIDPMap.get(id);
      rawVal = rawVal ?? (adjustedKtcPlayers?.length > 0 ? 0 : null);

      const isIDPDST = isIDPDSTPos(sp.position);
      const stats = seasonStats?.[id];
      const pts = stats ? calcPointsFromTotals(stats, scoringSettings, sp.position) : null;
      const gp = stats?.gp ?? 0;
      const avgPPG = pts != null && gp ? pts / gp : null;
      let val;
      if (enriched?.adjVal != null) {
        val = enriched.adjVal;
      } else if (isIDPDST && mergedIDPMap?.has(id)) {
        val = rawVal;
      } else if (dynastyFallback && gp >= 3 && avgPPG != null && positionalValuePerPPG?.[sp.position] != null) {
        val = Math.round(avgPPG * positionalValuePerPPG[sp.position]);
      } else {
        val = productionAdjustedValue(rawVal, avgPPG, positionalAvgPPG?.[sp.position], 0.50);
      }

      const rankInfo = rankMap?.[id] ?? null;
      if (!isIDPDST && enriched?.adjVal == null && rankInfo?.rank != null && rankInfo?.posCount > 1) {
        const percentile = 1 - (rankInfo.rank - 1) / (rankInfo.posCount - 1);
        val = Math.round(val * (0.88 + 0.24 * percentile));
      }

      return {
        id,
        name: sp.full_name ?? `${sp.first_name ?? ''} ${sp.last_name ?? ''}`.trim(),
        position: sp.position ?? '',
        team: sp.team ?? '',
        val,
        isEstimated: idpFallback,
        dynastyFallback,
      };
    }).filter(Boolean).sort((a, b) => (b.val ?? -1) - (a.val ?? -1));
  }, [roster, sleeperPlayers, adjustedKtcPlayers, adjustedDynastyKtcPlayers, mergedIDPMap, leagueType, theirSideItems, seasonStats, scoringSettings, positionalAvgPPG, positionalValuePerPPG, rankMap]);

  // Pick list — enriched with quality label and value
  const picks = useMemo(() => {
    if (!roster || !rosterPicks || !slots) return [];
    return getPicksForRoster(roster.roster_id, rosterPicks, slots).map(pick => {
      const quality = getPickQuality(pick.fromRosterId, rosters);
      const ord = ORDINALS[pick.round] ?? `${pick.round}th`;
      let val = null;
      if (pickValueMap?.[pick.round] != null) {
        const tierVal = pickValueMap[pick.round][quality] ?? pickValueMap[pick.round].Mid ?? null;
        const yearOffset = (pick.year ?? season) - season;
        const discount = yearOffset <= 0 ? 1 : Math.pow(0.92, yearOffset);
        val = tierVal != null ? Math.round(tierVal * discount) : null;
      }
      const fromOwner = pick.isOwn ? null : getUserDisplayName(
        rosters.find(r => r.roster_id === pick.fromRosterId)?.owner_id ?? ''
      );
      return { ...pick, quality, label: `${pick.year} ${quality} ${ord}`, val, fromOwner };
    });
  }, [roster, rosterPicks, slots, rosters, pickValueMap, season, getUserDisplayName]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex flex-col rounded-2xl overflow-hidden w-full"
        style={{ background: 'var(--color-bg)', maxWidth: 520, height: '72vh', maxHeight: 640 }}
        onClick={e => e.stopPropagation()}>

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
          {players.length > 0 && (() => {
            const OFFENSE_POS = new Set(['QB', 'RB', 'WR', 'TE', 'K']);
            const offPlayers = players.filter(p => OFFENSE_POS.has(p.position));
            const defPlayers = players.filter(p => !OFFENSE_POS.has(p.position));
            const showSections = (hasIDP || hasDST) && offPlayers.length > 0 && defPlayers.length > 0;

            const renderPlayerRow = p => {
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
                  }}>
                  <img src={`https://sleepercdn.com/content/nfl/players/thumb/${p.id}.jpg`}
                    alt="" className="w-9 h-9 rounded-full shrink-0 object-cover"
                    style={{ background: 'var(--color-fill-secondary)' }}
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

            return showSections ? (
              <>
                <SectionHeader label="Offense" />
                {offPlayers.map(renderPlayerRow)}
                <SectionHeader label="Defense" />
                {defPlayers.map(renderPlayerRow)}
              </>
            ) : (
              <>
                <SectionHeader label="Players" />
                {players.map(renderPlayerRow)}
              </>
            );
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
                    style={{ borderBottom: '1px solid var(--color-separator)', opacity: isAdded ? 0.5 : 1 }}>
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
      </div>
    </div>
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
