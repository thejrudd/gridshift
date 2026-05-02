// ── TradeRosterPicker ─────────────────────────────────────────────────────────
// Modal player picker for the Trade Agent.
// Supports two modes:
//   - Roster-locked: shows only one roster's players (for "Your Side")
//   - All Rosters: search across the entire league (for "Their Side")
// When in "All Rosters" mode, selecting a player returns { id, rosterId }
// so CompanionTrade can auto-set the trade partner.

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { findKtcPlayerFromSleeper, getKtcValue, fmtKtcValue, productionAdjustedValue } from '../../utils/ktcApi';
import { DYNASTY_FALLBACK_MULT } from '../../utils/tradeValue';
import { calcPointsFromTotals } from '../../utils/scoringEngine';
import { computePositionalRanks, computePositionalAvgPPG, computePositionalValuePerPPG } from '../../utils/projectionEngine';
import { parseSearchQuery, matchesFilter } from '../../utils/parseSearchQuery';
import { TEAM_COLORS } from '../../data/teamColors';
import { useTheme } from '../../context/ThemeContext';
import Modal from '../Modal';

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB', 'DEF', 'Other'];
const POSITION_FILTER_CHIPS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB', 'DEF'];
const POSITION_FILTER_GROUPS = {
  DL: new Set(['DL', 'DE', 'DT']),
  LB: new Set(['LB', 'ILB', 'OLB']),
  DB: new Set(['DB', 'CB', 'S', 'SS', 'FS']),
  DEF: new Set(['DEF']),
};

function toDisplayPosition(pos) {
  if (POSITION_FILTER_GROUPS.DL.has(pos)) return 'DL';
  if (POSITION_FILTER_GROUPS.LB.has(pos)) return 'LB';
  if (POSITION_FILTER_GROUPS.DB.has(pos)) return 'DB';
  if (POSITION_FILTER_GROUPS.DEF.has(pos)) return 'DEF';
  if (POSITION_ORDER.includes(pos)) return pos;
  return 'Other';
}

// Team city + nickname map for partial name matching (e.g. "New" → Saints)
const TEAM_CITY_NAMES = {
  buf: 'buffalo bills', mia: 'miami dolphins', ne: 'new england patriots', nyj: 'new york jets',
  bal: 'baltimore ravens', cin: 'cincinnati bengals', cle: 'cleveland browns', pit: 'pittsburgh steelers',
  hou: 'houston texans', ind: 'indianapolis colts', jax: 'jacksonville jaguars', ten: 'tennessee titans',
  den: 'denver broncos', kc: 'kansas city chiefs', lv: 'las vegas raiders', lac: 'los angeles chargers',
  dal: 'dallas cowboys', nyg: 'new york giants', phi: 'philadelphia eagles', wsh: 'washington commanders',
  chi: 'chicago bears', det: 'detroit lions', gb: 'green bay packers', min: 'minnesota vikings',
  atl: 'atlanta falcons', car: 'carolina panthers', no: 'new orleans saints', tb: 'tampa bay buccaneers',
  ari: 'arizona cardinals', la: 'los angeles rams', sf: 'san francisco 49ers', sea: 'seattle seahawks',
};

// ── Sleeper → TEAM_COLORS key normalization ───────────────────────────────────
// Sleeper uses a few abbreviations that differ from TEAM_COLORS keys.

const SLEEPER_TEAM_MAP = {
  lar: 'la',   // Los Angeles Rams
  was: 'wsh',  // Washington Commanders
  jac: 'jax',  // Jacksonville Jaguars (Sleeper uses both)
  lvr: 'lv',   // Las Vegas Raiders (Sleeper sometimes uses LVR)
};

function toTeamKey(sleeperTeam) {
  if (!sleeperTeam) return '';
  const lower = sleeperTeam.toLowerCase();
  return SLEEPER_TEAM_MAP[lower] ?? lower;
}

// ── Color helpers ────────────────────────────────────────────────────────────

function hexLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// ── NFL division / conference lookup ─────────────────────────────────────────

const NFL_TEAM_INFO = {
  buf: { division: 'AFC East',  conference: 'AFC' }, mia: { division: 'AFC East',  conference: 'AFC' },
  ne:  { division: 'AFC East',  conference: 'AFC' }, nyj: { division: 'AFC East',  conference: 'AFC' },
  bal: { division: 'AFC North', conference: 'AFC' }, cin: { division: 'AFC North', conference: 'AFC' },
  cle: { division: 'AFC North', conference: 'AFC' }, pit: { division: 'AFC North', conference: 'AFC' },
  hou: { division: 'AFC South', conference: 'AFC' }, ind: { division: 'AFC South', conference: 'AFC' },
  jax: { division: 'AFC South', conference: 'AFC' }, ten: { division: 'AFC South', conference: 'AFC' },
  den: { division: 'AFC West',  conference: 'AFC' }, kc:  { division: 'AFC West',  conference: 'AFC' },
  lv:  { division: 'AFC West',  conference: 'AFC' }, lac: { division: 'AFC West',  conference: 'AFC' },
  dal: { division: 'NFC East',  conference: 'NFC' }, nyg: { division: 'NFC East',  conference: 'NFC' },
  phi: { division: 'NFC East',  conference: 'NFC' }, wsh: { division: 'NFC East',  conference: 'NFC' },
  chi: { division: 'NFC North', conference: 'NFC' }, det: { division: 'NFC North', conference: 'NFC' },
  gb:  { division: 'NFC North', conference: 'NFC' }, min: { division: 'NFC North', conference: 'NFC' },
  atl: { division: 'NFC South', conference: 'NFC' }, car: { division: 'NFC South', conference: 'NFC' },
  no:  { division: 'NFC South', conference: 'NFC' }, tb:  { division: 'NFC South', conference: 'NFC' },
  ari: { division: 'NFC West',  conference: 'NFC' }, la:  { division: 'NFC West',  conference: 'NFC' },
  sf:  { division: 'NFC West',  conference: 'NFC' }, sea: { division: 'NFC West',  conference: 'NFC' },
};

// ── Search guide chips ────────────────────────────────────────────────────────

const GUIDE_SECTIONS = [
  { label: 'By player name', chips: ['Patrick Mahomes', 'Josh', 'Jefferson'] },
  { label: 'By team — nickname, city, or abbreviation', chips: ['Bears', 'Detroit', 'KC', '49ers', 'New England'] },
  { label: 'By position — abbreviation, full name, or plural', chips: ['QB', 'RBs', 'Wide Receiver', 'Tight Ends', 'Kicker'] },
  { label: 'By conference or division', chips: ['NFC', 'AFC', 'NFC West', 'AFC North'] },
  { label: "Combine terms — order doesn't matter", chips: ['RB Bears', 'QB NFC West', 'WRs in Detroit', 'Receivers on the Chiefs'] },
  { label: 'Natural language — filler words are ignored', chips: ['Running backs in Detroit', 'QBs playing for the Bears', 'Tight ends in the AFC'] },
];

const PICKER_HEADER_ROW_HEIGHT = 35;
const PICKER_PLAYER_ROW_HEIGHT = 76;
const PICKER_OVERSCAN_PX = 320;

function SearchGuide({ onExample }) {
  return (
    <div className="px-4 py-4 flex flex-col gap-5">
      <p className="text-xs leading-relaxed" style={{ color: 'var(--color-label-tertiary)' }}>
        Search by any combination of name, team, position, conference, or division. Tap an example to try it.
      </p>
      {GUIDE_SECTIONS.map(({ label, chips }) => (
        <div key={label}>
          <div className="text-xs font-semibold mb-2 uppercase tracking-wide"
            style={{ color: 'var(--color-label-quaternary)' }}>
            {label}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {chips.map(chip => (
              <button key={chip} onClick={() => onExample(chip)}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-opacity active:opacity-60"
                style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)' }}>
                {chip}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TradeRosterPicker({
  rosterId,              // null = all-rosters mode, number = locked to that roster
  rosters,
  sleeperPlayers,
  ktcPlayers,
  dynastyKtcPlayers,     // fallback for players absent from the primary (redraft) list
  leagueType,
  excludeIds,
  allowedIds,
  seasonStats,
  scoringSettings,
  getUserDisplayName,    // needed for all-rosters mode owner labels
  myRosterId,            // to label/include own roster in all-rosters mode
  includeOwnRoster,      // when true (all-rosters mode), include own roster in results
  currentTotal,          // current KTC total for this side of the trade
  activeRosterId,        // roster currently selected for this trade side
  mergedIDPMap,          // production-based fallback values for IDP / D/ST players
  sharedRankMap,
  sharedPositionalAvgPPG,
  sharedPositionalValuePerPPG,
  sharedPlayerTradeValueDetailsMap,
  onSelect,              // (playerId) for locked mode, ({ id, rosterId }) for all-rosters mode
  onClose,
}) {
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const { darkMode } = useTheme();
  const isAllMode = rosterId == null;
  const deferredSearch = useDeferredValue(search);
  const trimmedSearch = deferredSearch.trim();
  const showSearchGuide = isAllMode && !trimmedSearch && posFilter === 'ALL';
  const enrichedPlayerCacheRef = useRef(new Map());

  // Positional ranks across all rostered players
  const rankMap = useMemo(
    () => sharedRankMap ?? computePositionalRanks(seasonStats, sleeperPlayers, scoringSettings),
    [sharedRankMap, seasonStats, sleeperPlayers, scoringSettings],
  );

  // Average PPG per position — used to calibrate per-player production multipliers
  const positionalAvgPPG = useMemo(
    () => sharedPositionalAvgPPG ?? computePositionalAvgPPG(rosters, seasonStats, sleeperPlayers, scoringSettings),
    [sharedPositionalAvgPPG, rosters, seasonStats, sleeperPlayers, scoringSettings],
  );

  // KTC value per PPG for each position — used to estimate dynasty-fallback player values
  const positionalValuePerPPG = useMemo(
    () => sharedPositionalValuePerPPG ?? computePositionalValuePerPPG(
      rosters, sleeperPlayers, ktcPlayers, leagueType,
      seasonStats, scoringSettings, findKtcPlayerFromSleeper, getKtcValue, productionAdjustedValue,
    ),
    [sharedPositionalValuePerPPG, rosters, sleeperPlayers, ktcPlayers, leagueType, seasonStats, scoringSettings],
  );

  // Build a map: playerId → rosterId (which roster owns this player)
  const playerRosterMap = useMemo(() => {
    const map = {};
    for (const r of rosters) {
      const ids = [...new Set([...(r.players ?? []), ...(r.reserve ?? [])])];
      for (const id of ids) map[id] = r.roster_id;
    }
    return map;
  }, [rosters]);

  const excludeSet = useMemo(() => new Set(excludeIds ?? []), [excludeIds]);
  const allowedSet = useMemo(() => allowedIds?.length ? new Set(allowedIds) : null, [allowedIds]);
  const rosterOwnerNameMap = useMemo(() => {
    const map = {};
    for (const roster of rosters) {
      const isOwnRoster = roster.roster_id === myRosterId;
      map[roster.roster_id] = isOwnRoster
        ? 'Your Roster'
        : getUserDisplayName(roster.owner_id ?? '');
    }
    return map;
  }, [rosters, myRosterId, getUserDisplayName]);

  const sourceIds = useMemo(() => {
    if (isAllMode) {
      const ids = [];
      for (const roster of rosters) {
        if (!includeOwnRoster && roster.roster_id === myRosterId) continue;
        ids.push(...new Set([...(roster.players ?? []), ...(roster.reserve ?? [])]));
      }
      return ids;
    }

    const roster = rosters.find((entry) => entry.roster_id === rosterId);
    return roster ? [...new Set([...(roster.players ?? []), ...(roster.reserve ?? [])])] : [];
  }, [isAllMode, rosters, includeOwnRoster, myRosterId, rosterId]);

  // Build the lightweight searchable list first, then enrich only visible results.
  const basePlayers = useMemo(() => {
    if (showSearchGuide) return [];

    return sourceIds
      .filter(id => !allowedSet || allowedSet.has(id))
      .filter(id => !isAllMode || !excludeSet.has(id))
      .map(id => {
        const sp = sleeperPlayers?.[id];
        if (!sp) return null;
        const ownerRosterId = playerRosterMap[id];
        const teamKey = toTeamKey(sp.team);
        const cityName = TEAM_CITY_NAMES[teamKey] ?? '';
        const ownerName = isAllMode && ownerRosterId ? rosterOwnerNameMap[ownerRosterId] ?? null : null;
        return {
          id,
          name: sp.full_name ?? `${sp.first_name ?? ''} ${sp.last_name ?? ''}`.trim(),
          position: sp.position ?? '',
          team: sp.team ?? '',
          teamKey,
          palette: TEAM_COLORS[teamKey] ?? null,
          injuryStatus: sp.injury_status,
          ownerRosterId,
          ownerName,
          isOwnPlayer: ownerRosterId === myRosterId,
          cityName,
          searchText: [
            sp.full_name ?? `${sp.first_name ?? ''} ${sp.last_name ?? ''}`.trim(),
            ownerName ?? '',
            sp.team ?? '',
            cityName,
          ].join(' ').toLowerCase(),
          isAdded: excludeSet.has(id),
        };
      })
      .filter(Boolean);
  }, [showSearchGuide, sourceIds, allowedSet, isAllMode, excludeSet, sleeperPlayers, playerRosterMap, myRosterId, rosterOwnerNameMap]);

  // Position chip filter applied first (independent of text search)
  const posFiltered = useMemo(() => {
    if (posFilter === 'ALL') return basePlayers;
    const group = POSITION_FILTER_GROUPS[posFilter];
    return basePlayers.filter(p => group ? group.has(p.position) : p.position === posFilter);
  }, [basePlayers, posFilter]);

  const parsedSearch = useMemo(() => parseSearchQuery(trimmedSearch), [trimmedSearch]);

  const filtered = useMemo(() => {
    if (!trimmedSearch) return posFiltered;
    const filters = parsedSearch;
    const hasFilters = filters.pos.size || filters.team.size || filters.div.size || filters.conf.size || filters.name.length;
    if (!hasFilters) return posFiltered;
    return posFiltered.filter(p => {
      if (filters.name.length > 0) {
        if (!filters.name.every(t => p.searchText.includes(t))) return false;
      }
      if (filters.pos.size > 0) {
        if (![...filters.pos].some(pos => matchesFilter(p.position, pos))) return false;
      }
      if (filters.team.size > 0 && !filters.team.has(p.teamKey)) return false;
      const teamInfo = NFL_TEAM_INFO[p.teamKey];
      if (filters.div.size > 0 && (!teamInfo || !filters.div.has(teamInfo.division))) return false;
      if (filters.conf.size > 0 && (!teamInfo || !filters.conf.has(teamInfo.conference))) return false;
      return true;
    });
  }, [posFiltered, trimmedSearch, parsedSearch]);

  useEffect(() => {
    enrichedPlayerCacheRef.current.clear();
  }, [
    sleeperPlayers,
    ktcPlayers,
    dynastyKtcPlayers,
    leagueType,
    sharedPlayerTradeValueDetailsMap,
    mergedIDPMap,
    seasonStats,
    scoringSettings,
    rankMap,
    positionalAvgPPG,
    positionalValuePerPPG,
  ]);

  const getEnrichedPlayerMeta = useCallback((player) => {
    const cached = enrichedPlayerCacheRef.current.get(player.id);
    if (cached) return cached;

    const sharedTradeValue = sharedPlayerTradeValueDetailsMap?.get(player.id) ?? null;
    if (sharedTradeValue) {
      const stats = seasonStats?.[player.id];
      const pts = stats ? calcPointsFromTotals(stats, scoringSettings, player.position) : null;
      const gp = stats?.gp ?? 0;
      const avgPPG = pts != null && gp ? Math.round((pts / gp) * 10) / 10 : null;
      const next = {
        val: sharedTradeValue.value,
        dynastyFallback: sharedTradeValue.dynastyFallback,
        idpFallback: sharedTradeValue.isEstimated,
        pts,
        avgPPG,
        rankInfo: rankMap[player.id] ?? null,
      };
      enrichedPlayerCacheRef.current.set(player.id, next);
      return next;
    }

    const ktc = findKtcPlayerFromSleeper(player.id, sleeperPlayers, ktcPlayers);
    let rawVal = getKtcValue(ktc, leagueType);
    let dynastyFallback = false;
    let idpFallback = false;
    if (rawVal == null && dynastyKtcPlayers?.length) {
      const dKtc = findKtcPlayerFromSleeper(player.id, sleeperPlayers, dynastyKtcPlayers);
      const dVal = getKtcValue(dKtc, leagueType);
      if (dVal != null) {
        rawVal = Math.round(dVal * DYNASTY_FALLBACK_MULT);
        dynastyFallback = true;
      }
    }
    if (rawVal == null && mergedIDPMap?.has(player.id)) {
      rawVal = mergedIDPMap.get(player.id);
      idpFallback = true;
    }
    rawVal = rawVal ?? (ktcPlayers?.length > 0 ? 0 : null);

    const stats = seasonStats?.[player.id];
    const pts = stats ? calcPointsFromTotals(stats, scoringSettings, player.position) : null;
    const gp = stats?.gp ?? 0;
    const avgPPG = pts != null && gp ? Math.round((pts / gp) * 10) / 10 : null;
    const rankInfo = rankMap[player.id] ?? null;

    let val;
    if (idpFallback) {
      val = rawVal;
    } else if (dynastyFallback && gp >= 3 && avgPPG != null && positionalValuePerPPG[player.position] != null) {
      val = Math.round(avgPPG * positionalValuePerPPG[player.position]);
    } else {
      val = productionAdjustedValue(rawVal, avgPPG, positionalAvgPPG[player.position], 0.50);
    }

    if (!idpFallback && rankInfo?.rank != null && rankInfo?.posCount > 1) {
      const percentile = 1 - (rankInfo.rank - 1) / (rankInfo.posCount - 1);
      val = Math.round(val * (0.88 + 0.24 * percentile));
    }

    const next = {
      val,
      dynastyFallback,
      idpFallback,
      pts,
      avgPPG,
      rankInfo,
    };
    enrichedPlayerCacheRef.current.set(player.id, next);
    return next;
  }, [
    sleeperPlayers,
    ktcPlayers,
    dynastyKtcPlayers,
    leagueType,
    sharedPlayerTradeValueDetailsMap,
    mergedIDPMap,
    seasonStats,
    scoringSettings,
    rankMap,
    positionalAvgPPG,
    positionalValuePerPPG,
  ]);

  const players = useMemo(() => (
    filtered.map((player) => ({
      ...player,
      ...getEnrichedPlayerMeta(player),
    }))
  ), [filtered, getEnrichedPlayerMeta]);

  const grouped = useMemo(() => {
    const groups = {};
    for (const p of players) {
      const pos = toDisplayPosition(p.position);
      if (!groups[pos]) groups[pos] = [];
      groups[pos].push(p);
    }
    for (const pos of Object.keys(groups)) {
      groups[pos].sort((a, b) => (b.val ?? -1) - (a.val ?? -1));
    }
    return groups;
  }, [players]);

  const virtualRows = useMemo(() => {
    const rows = [];
    for (const pos of POSITION_ORDER) {
      const list = grouped[pos];
      if (!list?.length) continue;
      rows.push({
        type: 'header',
        id: `header:${pos}`,
        label: pos === 'Other' ? 'OTHER' : pos,
        height: PICKER_HEADER_ROW_HEIGHT,
      });
      for (const player of list) {
        rows.push({
          type: 'player',
          id: player.id,
          player,
          height: PICKER_PLAYER_ROW_HEIGHT,
        });
      }
    }
    return rows;
  }, [grouped]);
  const shouldVirtualize = isAllMode && virtualRows.length > 80;
  const {
    containerRef: resultsContainerRef,
    totalHeight: virtualTotalHeight,
    visibleRows,
    stickyHeader,
    handleScroll,
  } = useVirtualRows(virtualRows, shouldVirtualize);

  function handleSelect(player) {
    if (player.isAdded) return;
    if (isAllMode) {
      onSelect({ id: player.id, rosterId: player.ownerRosterId });
    } else {
      onSelect(player.id);
    }
  }

  function showsAdditiveTotal(player) {
    if (player.val == null || currentTotal == null) return false;
    if (!isAllMode) return true;
    if (activeRosterId == null) return false;
    return player.ownerRosterId === activeRosterId;
  }

  const renderHeaderRow = useCallback((label, key, style = null) => (
    <div
      key={key}
      className="px-4 py-1.5 text-xs font-semibold uppercase tracking-widest"
      style={{
        background: 'var(--color-bg-secondary)',
        color: 'var(--color-label-tertiary)',
        letterSpacing: '0.08em',
        borderBottom: '1px solid var(--color-separator)',
        zIndex: 1,
        ...(style ?? {}),
      }}
    >
      {label}
    </div>
  ), []);

  const renderPlayerRow = useCallback((player, key = player.id, style = null) => {
    const teamColor = player.palette
      ? (darkMode ? player.palette.darkPrimary : player.palette.primary)
      : null;
    const isLightColor = teamColor ? hexLuminance(teamColor) > 0.35 : false;

    return (
      <div
        key={key}
        className="flex items-center w-full px-4 py-3 gap-3 relative overflow-hidden transition-colors"
        style={{
          borderBottom: '1px solid var(--color-separator)',
          borderLeft: teamColor ? `3px solid ${teamColor}` : '3px solid transparent',
          background: teamColor
            ? `${teamColor}${isLightColor ? '18' : '22'}`
            : 'transparent',
          opacity: player.isAdded ? 0.5 : 1,
          contentVisibility: shouldVirtualize ? undefined : 'auto',
          containIntrinsicSize: shouldVirtualize ? undefined : '76px',
          ...(style ?? {}),
        }}
      >
        <img src={`https://sleepercdn.com/content/nfl/players/thumb/${player.id}.jpg`}
          alt="" className="w-9 h-9 rounded-full shrink-0 object-cover"
          style={{ background: 'var(--color-fill-secondary)' }}
          loading="lazy"
          decoding="async"
          onError={e => { e.target.style.display = 'none'; }} />

        <div className="flex-1 min-w-0 text-left relative">
          {player.teamKey && (
            <img
              src={`https://a.espncdn.com/i/teamlogos/nfl/500/${player.teamKey}.png`}
              aria-hidden="true"
              className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none select-none"
              style={{ width: 44, height: 44, objectFit: 'contain', opacity: 0.10 }}
              loading="lazy"
              decoding="async"
              onError={e => { e.target.style.display = 'none'; }}
            />
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold truncate" style={{ color: 'var(--color-label)' }}>
              {player.name}
            </span>
            {player.injuryStatus && player.injuryStatus !== 'Active' && (
              <span className="shrink-0 px-1.5 py-0.5 rounded"
                style={{ background: 'var(--color-fill-secondary)', color: 'var(--color-label-tertiary)', fontSize: '9px', fontWeight: 700 }}>
                {player.injuryStatus}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-xs" style={{ color: 'var(--color-label-secondary)' }}>
              {player.position}{player.team ? ` · ${player.team}` : ''}
            </span>
            {player.rankInfo && (
              <span className="text-xs font-bold tabular-nums"
                style={{ color: teamColor ?? 'var(--color-label-tertiary)' }}>
                #{player.rankInfo.rank} {player.rankInfo.posLabel}
              </span>
            )}
            {player.avgPPG != null && (
              <span className="text-xs tabular-nums" style={{ color: 'var(--color-label-tertiary)' }}>
                {player.avgPPG.toFixed(1)} avg
              </span>
            )}
            {player.ownerName && (
              <span className="text-xs font-semibold"
                style={{ color: player.isOwnPlayer ? 'var(--color-signature)' : 'var(--color-label-quaternary)' }}>
                · {player.ownerName}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end shrink-0 gap-0.5">
          <span className="text-sm font-bold tabular-nums"
            title={player.idpFallback ? 'Estimated from season production (no KTC data)' : undefined}
            style={{ color: player.val != null ? 'var(--color-label)' : 'var(--color-label-quaternary)' }}>
            {(player.dynastyFallback || player.idpFallback) ? '~' : ''}{fmtKtcValue(player.val)}
          </span>
          {player.dynastyFallback && (
            <span style={{ color: 'var(--color-label-quaternary)', fontSize: '9px', fontWeight: 600 }}>
              DYN est.
            </span>
          )}
          {player.idpFallback && (
            <span style={{ color: 'var(--color-label-quaternary)', fontSize: '9px', fontWeight: 600 }}>
              est.
            </span>
          )}
          {showsAdditiveTotal(player) && (
            <span className="text-xs tabular-nums" style={{ color: 'var(--color-accent)' }}>
              → {fmtKtcValue(currentTotal + player.val)}
            </span>
          )}
        </div>
        {player.isAdded ? (
          <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,168,68,0.15)', color: 'var(--color-accent-green)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
        ) : (
          <button onClick={() => handleSelect(player)}
            className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors active:opacity-60"
            style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)', fontSize: '20px', lineHeight: 1 }}>
            +
          </button>
        )}
      </div>
    );
  }, [activeRosterId, currentTotal, darkMode, handleSelect, shouldVirtualize]);

  return (
    <Modal
      onClose={onClose}
      containerClassName="flex flex-col"
      containerStyle={{ background: 'var(--color-bg)', maxWidth: 520, height: '72vh', maxHeight: 640 }}
      mobileSheet
      ariaLabel={isAllMode ? 'Search all rostered players' : 'Add player'}
    >

        {/* Header + search + position chips */}
        <div className="px-4 pt-4 pb-3 shrink-0" style={{ borderBottom: '1px solid var(--color-separator)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-base" style={{ color: 'var(--color-label)' }}>
              {isAllMode ? 'Search All Rostered Players' : 'Add Player'}
            </span>
            <button onClick={onClose} className="p-1" style={{ color: 'var(--color-label-secondary)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: 'var(--color-label-quaternary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Name, team, city, or position…"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              name="player_search"
              inputMode="search"
              data-form-type="other"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: 'var(--color-fill)', color: 'var(--color-label)', fontSize: '16px' }}
            />
          </div>
          {/* Position chips — only in all-rosters mode */}
          {isAllMode && (
            <div className="flex gap-1.5 mt-2.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {POSITION_FILTER_CHIPS.map(pos => (
                <button
                  key={pos}
                  onClick={() => setPosFilter(pos)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold shrink-0 transition-colors"
                  style={{
                    background: posFilter === pos ? 'var(--color-signature)' : 'var(--color-fill)',
                    color: posFilter === pos ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
                  }}
                >
                  {pos}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Results — scrollable */}
        <div
          ref={resultsContainerRef}
          className="flex-1 overflow-y-auto"
          onScroll={shouldVirtualize ? handleScroll : undefined}
        >
          {showSearchGuide ? (
            <SearchGuide onExample={setSearch} />
          ) : (
            <>
              {shouldVirtualize && stickyHeader
                ? renderHeaderRow(stickyHeader.label, `sticky:${stickyHeader.id}`, {
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    transform: `translateY(${stickyHeader.translateY}px)`,
                    pointerEvents: 'none',
                  })
                : null}
              {shouldVirtualize ? (
                <div style={{ height: `${virtualTotalHeight}px`, position: 'relative' }}>
                  {visibleRows.map((row) => (
                    row.type === 'header'
                      ? renderHeaderRow(row.label, row.id, {
                          position: 'absolute',
                          top: `${row.top}px`,
                          left: 0,
                          right: 0,
                        })
                      : renderPlayerRow(row.player, row.id, {
                          position: 'absolute',
                          top: `${row.top}px`,
                          left: 0,
                          right: 0,
                          height: `${row.height}px`,
                        })
                  ))}
                </div>
              ) : (
                POSITION_ORDER.map((pos) => {
                  const list = grouped[pos];
                  if (!list?.length) return null;
                  return (
                    <div key={pos}>
                      {renderHeaderRow(pos === 'Other' ? 'OTHER' : pos, `header:${pos}`, {
                        position: 'sticky',
                        top: 0,
                      })}
                      {list.map((player) => renderPlayerRow(player))}
                    </div>
                  );
                })
              )}
          {filtered.length === 0 && (
            <div className="py-12 text-sm text-center" style={{ color: 'var(--color-label-tertiary)' }}>
              {trimmedSearch ? `No players found for "${search}"` : 'No players found'}
            </div>
          )}
            </>
          )}
        </div>
    </Modal>
  );
}

function findRowIndexForOffset(offsets, target) {
  if (!offsets.length) return 0;
  let low = 0;
  let high = offsets.length - 1;
  let best = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (offsets[mid] <= target) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

function useVirtualRows(rows, enabled) {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setScrollTop(0);
      return undefined;
    }

    const node = containerRef.current;
    if (!node) return undefined;

    const updateViewportHeight = () => {
      setViewportHeight(node.clientHeight || 0);
    };

    updateViewportHeight();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewportHeight);
      return () => window.removeEventListener('resize', updateViewportHeight);
    }

    const observer = new ResizeObserver(() => {
      updateViewportHeight();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, rows.length]);

  const { offsets, totalHeight } = useMemo(() => {
    const nextOffsets = [];
    let offset = 0;
    for (const row of rows) {
      nextOffsets.push(offset);
      offset += row.height;
    }
    return { offsets: nextOffsets, totalHeight: offset };
  }, [rows]);

  const visibleRange = useMemo(() => {
    if (!enabled || !rows.length) {
      return { start: 0, end: rows.length };
    }

    const startTarget = Math.max(0, scrollTop - PICKER_OVERSCAN_PX);
    const endTarget = scrollTop + viewportHeight + PICKER_OVERSCAN_PX;
    const start = findRowIndexForOffset(offsets, startTarget);
    let end = findRowIndexForOffset(offsets, endTarget);

    while (end < rows.length && offsets[end] < endTarget) end += 1;

    return {
      start,
      end: Math.min(rows.length, Math.max(end + 1, start + 1)),
    };
  }, [enabled, offsets, rows, scrollTop, viewportHeight]);

  const visibleRows = useMemo(() => rows
    .slice(visibleRange.start, visibleRange.end)
    .map((row, index) => ({
      ...row,
      top: offsets[visibleRange.start + index] ?? 0,
    })), [offsets, rows, visibleRange.end, visibleRange.start]);

  const stickyHeader = useMemo(() => {
    if (!enabled || !rows.length) return null;

    let currentHeader = null;
    let nextHeaderTop = null;

    for (let i = 0; i < rows.length; i += 1) {
      if (rows[i].type !== 'header') continue;
      const top = offsets[i];
      if (top <= scrollTop) {
        currentHeader = rows[i];
        continue;
      }
      nextHeaderTop = top;
      break;
    }

    if (!currentHeader) currentHeader = rows.find((row) => row.type === 'header') ?? null;
    if (!currentHeader) return null;

    const translateY = nextHeaderTop != null
      ? Math.min(0, nextHeaderTop - scrollTop - PICKER_HEADER_ROW_HEIGHT)
      : 0;

    return {
      id: currentHeader.id,
      label: currentHeader.label,
      translateY,
    };
  }, [enabled, offsets, rows, scrollTop]);

  const handleScroll = useCallback((event) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  return {
    containerRef,
    totalHeight,
    visibleRows,
    stickyHeader,
    handleScroll,
  };
}
