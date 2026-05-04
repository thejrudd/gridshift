// ── TradeRosterPicker ─────────────────────────────────────────────────────────
// Modal player picker for the Trade Agent.
// Supports two modes:
//   - Roster-locked: shows only one roster's players (for "Your Side")
//   - All Rosters: search across the entire league (for "Their Side")
// When in "All Rosters" mode, selecting a player returns { id, rosterId }
// so CompanionTrade can auto-set the trade partner.

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { findKtcPlayerFromSleeper, getKtcValue, fmtKtcValue, productionAdjustedValue } from '../../utils/ktcApi';
import { resolveTradePlayerValueDetail } from '../../utils/tradeValue';
import { computePositionalRanks, computePositionalAvgPPG, computePositionalValuePerPPG } from '../../utils/projectionEngine';
import { parseSearchQuery, matchesFilter } from '../../utils/parseSearchQuery';
import { getTeamColorKey } from '../../data/teamColors';
import { getTeamVisualTheme } from '../../utils/teamVisualTheme';
import { getPlayerAvailabilityStatus } from '../../utils/playerAvailabilityStatus.js';
import { useTheme } from '../../context/ThemeContext';
import Modal from '../Modal';
import PlayerStatusBadge from './PlayerStatusBadge.jsx';
import { CompanionSearchField, CompanionSelectorButton, CompanionSelectorRail } from './CompanionSelectorControls.jsx';
import CompanionPlayerRow, {
  CompanionPlayerAction,
  CompanionPlayerMetric,
  CompanionPlayerStatus,
} from './CompanionPlayerRow.jsx';

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
const PICKER_REFERENCE_VIEWPORT = { width: 430, height: 760 };
const TRADE_LOGO_SIDE_THEME_OPTIONS = { logoSide: 'end' };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getVisualViewportSize() {
  if (typeof window === 'undefined') return PICKER_REFERENCE_VIEWPORT;
  return {
    width: window.visualViewport?.width ?? window.innerWidth ?? PICKER_REFERENCE_VIEWPORT.width,
    height: window.visualViewport?.height ?? window.innerHeight ?? PICKER_REFERENCE_VIEWPORT.height,
  };
}

function buildPickerFitMetrics() {
  const viewport = getVisualViewportSize();
  const widthFit = clamp(viewport.width / PICKER_REFERENCE_VIEWPORT.width, 0.72, 1);
  const heightFit = clamp(viewport.height / PICKER_REFERENCE_VIEWPORT.height, 0.72, 1);
  const fit = Math.min(widthFit, heightFit);
  const detailScore = (widthFit + heightFit) / 2;

  return {
    viewportHeight: viewport.height,
    sheetRatio: clamp(0.94 - ((1 - heightFit) * 0.12), 0.86, 0.94),
    rowHeight: Math.round(PICKER_PLAYER_ROW_HEIGHT * fit),
    headerRowHeight: Math.round(PICKER_HEADER_ROW_HEIGHT * clamp(fit, 0.82, 1)),
    rowPaddingX: Math.round(16 * clamp(widthFit, 0.78, 1)),
    rowPaddingY: Math.round(12 * clamp(heightFit, 0.72, 1)),
    rowGap: Math.round(12 * clamp(widthFit, 0.72, 1)),
    avatarSize: Math.round(36 * clamp(fit, 0.76, 1)),
    buttonSize: Math.round(28 * clamp(fit, 0.82, 1)),
    nameSize: clamp(14 * fit, 12.25, 14),
    metaSize: clamp(12 * fit, 10.25, 12),
    valueSize: clamp(14 * fit, 12, 14),
    optionalMetaCount: clamp(Math.floor((detailScore - 0.72) / 0.08), 0, 3),
  };
}

function useTradePickerFitMetrics() {
  const [metrics, setMetrics] = useState(buildPickerFitMetrics);

  useEffect(() => {
    const updateMetrics = () => setMetrics(buildPickerFitMetrics());
    const viewport = window.visualViewport;

    updateMetrics();
    window.addEventListener('resize', updateMetrics);
    window.addEventListener('orientationchange', updateMetrics);
    viewport?.addEventListener('resize', updateMetrics);
    viewport?.addEventListener('scroll', updateMetrics);

    return () => {
      window.removeEventListener('resize', updateMetrics);
      window.removeEventListener('orientationchange', updateMetrics);
      viewport?.removeEventListener('resize', updateMetrics);
      viewport?.removeEventListener('scroll', updateMetrics);
    };
  }, []);

  return metrics;
}

function toPickerTradeValueMeta(detail, fallbackRankInfo = null) {
  return {
    val: detail?.value ?? null,
    dynastyFallback: detail?.dynastyFallback ?? false,
    idpFallback: detail?.isEstimated ?? false,
    pts: detail?.pts ?? null,
    avgPPG: detail?.avgPPG != null ? Math.round(detail.avgPPG * 10) / 10 : null,
    rankInfo: detail?.rankInfo ?? fallbackRankInfo,
  };
}

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
  const pickerFit = useTradePickerFitMetrics();

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
        const teamTheme = getTeamVisualTheme(sp.team, darkMode, TRADE_LOGO_SIDE_THEME_OPTIONS);
        const teamKey = teamTheme.logoKey || getTeamColorKey(sp.team) || '';
        const cityName = TEAM_CITY_NAMES[teamKey] ?? '';
        const ownerName = isAllMode && ownerRosterId ? rosterOwnerNameMap[ownerRosterId] ?? null : null;
        return {
          id,
          name: sp.full_name ?? `${sp.first_name ?? ''} ${sp.last_name ?? ''}`.trim(),
          position: sp.position ?? '',
          team: sp.team ?? '',
          teamKey,
          teamTheme,
          availabilityStatus: getPlayerAvailabilityStatus(sp),
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
  }, [showSearchGuide, sourceIds, allowedSet, isAllMode, excludeSet, sleeperPlayers, playerRosterMap, myRosterId, rosterOwnerNameMap, darkMode]);

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

    const detail = resolveTradePlayerValueDetail({
      id: player.id,
      playerTradeValueDetailsMap: sharedPlayerTradeValueDetailsMap,
      players: sleeperPlayers,
      adjustedKtcPlayers: ktcPlayers,
      adjustedDynastyKtcPlayers: dynastyKtcPlayers,
      leagueType,
      seasonStats,
      scoringSettings,
      positionalAvgPPG,
      positionalValuePerPPG,
      rankMap,
      mergedIDPMap,
      blendWeight: 0.50,
    });
    const next = toPickerTradeValueMeta(detail, rankMap[player.id] ?? null);
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
        height: pickerFit.headerRowHeight,
      });
      for (const player of list) {
        rows.push({
          type: 'player',
          id: player.id,
          player,
          height: pickerFit.rowHeight,
        });
      }
    }
    return rows;
  }, [grouped, pickerFit.headerRowHeight, pickerFit.rowHeight]);
  const shouldVirtualize = isAllMode && virtualRows.length > 80;
  const {
    containerRef: resultsContainerRef,
    totalHeight: virtualTotalHeight,
    visibleRows,
    stickyHeader,
    handleScroll,
  } = useVirtualRows(virtualRows, shouldVirtualize, pickerFit.headerRowHeight);

  const handleSelect = useCallback((player) => {
    if (player.isAdded) return;
    if (isAllMode) {
      onSelect({ id: player.id, rosterId: player.ownerRosterId });
    } else {
      onSelect(player.id);
    }
  }, [isAllMode, onSelect]);

  const showsAdditiveTotal = useCallback((player) => {
    if (player.val == null || currentTotal == null) return false;
    if (!isAllMode) return true;
    if (activeRosterId == null) return false;
    return player.ownerRosterId === activeRosterId;
  }, [activeRosterId, currentTotal, isAllMode]);

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
    const teamTheme = player.teamTheme ?? getTeamVisualTheme(player.team, darkMode, TRADE_LOGO_SIDE_THEME_OPTIONS);
    const optionalMeta = [
      player.rankInfo ? `#${player.rankInfo.rank} ${player.rankInfo.posLabel}` : null,
      player.avgPPG != null ? `${player.avgPPG.toFixed(1)} avg` : null,
    ].filter(Boolean).slice(0, pickerFit.optionalMetaCount);
    const valuePrefix = (player.dynastyFallback || player.idpFallback) ? '~' : '';
    const estimateLabel = player.dynastyFallback ? 'DYN est.' : player.idpFallback ? 'est.' : null;
    const additiveTotal = showsAdditiveTotal(player) && currentTotal > 0 ? `→ ${fmtKtcValue(currentTotal + player.val)}` : null;

    return (
      <CompanionPlayerRow
        key={key}
        player={player}
        name={player.name}
        darkMode={darkMode}
        disabled={player.isAdded}
        selected={player.isAdded}
        compact
        className="trade-roster-picker-row"
        showTeamLogo
        teamThemeOptions={TRADE_LOGO_SIDE_THEME_OPTIONS}
        identityAccessory={isAllMode && player.ownerName ? (
          <span
            className={[
              'trade-roster-picker-row__owner',
              player.isOwnPlayer ? 'is-own' : '',
            ].filter(Boolean).join(' ')}
          >
            {player.ownerName}
          </span>
        ) : null}
        metaSegments={[player.team, ...optionalMeta].filter(Boolean)}
        columnGridTemplate="minmax(58px, auto)"
        columns={[
          <CompanionPlayerMetric
            key="value"
            value={`${valuePrefix}${fmtKtcValue(player.val)}`}
            label={additiveTotal}
            kicker={estimateLabel}
            title={player.idpFallback ? 'Estimated from season production (no KTC data)' : undefined}
          />,
        ]}
        status={player.availabilityStatus ? (
          <PlayerStatusBadge
            status={player.availabilityStatus}
            compact
            className="trade-roster-picker-row__status-badge"
          />
        ) : (
          <span className="trade-roster-picker-row__status-spacer" aria-hidden="true" />
        )}
        actions={player.isAdded ? (
          <CompanionPlayerStatus tone="positive" title="Already selected">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </CompanionPlayerStatus>
        ) : (
          <CompanionPlayerAction
            label={`Add ${player.name}`}
            onClick={() => handleSelect(player)}
            title={`Add ${player.name}`}
            className="trade-roster-picker-row__button"
          >
            <span data-testid={`trade-roster-picker-add-${player.id}`}>+</span>
          </CompanionPlayerAction>
        )}
        gridTemplate="auto auto minmax(0,1fr) auto minmax(58px,auto) 22px auto"
        dataTestId={`trade-roster-picker-row-${player.id}`}
        style={{
          borderBottom: '1px solid var(--color-separator)',
          borderLeft: teamTheme.borderColor ? `3px solid ${teamTheme.borderColor}` : '3px solid transparent',
          borderRight: 0,
          borderTop: 0,
          borderRadius: 0,
          minHeight: 'var(--trade-picker-row-height)',
          contentVisibility: shouldVirtualize ? undefined : 'auto',
          containIntrinsicSize: shouldVirtualize ? undefined : 'var(--trade-picker-row-height)',
          ...(style ?? {}),
        }}
      />
    );
  }, [currentTotal, darkMode, handleSelect, pickerFit.optionalMetaCount, shouldVirtualize, showsAdditiveTotal]);

  return (
    <Modal
      onClose={onClose}
      containerClassName="flex flex-col"
      containerStyle={{
        background: 'var(--color-bg)',
        maxWidth: 520,
        height: 'calc(var(--trade-picker-vvh) * var(--trade-picker-sheet-ratio))',
        maxHeight: 'calc(var(--trade-picker-vvh) - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
        '--trade-picker-vvh': `${pickerFit.viewportHeight}px`,
        '--trade-picker-sheet-ratio': pickerFit.sheetRatio,
        '--modal-mobile-sheet-max-height': 'calc(var(--trade-picker-vvh) - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
        '--trade-picker-row-height': `${pickerFit.rowHeight}px`,
        '--trade-picker-row-padding-x': `${pickerFit.rowPaddingX}px`,
        '--trade-picker-row-padding-y': `${pickerFit.rowPaddingY}px`,
        '--trade-picker-row-gap': `${pickerFit.rowGap}px`,
        '--trade-picker-avatar-size': `${pickerFit.avatarSize}px`,
        '--trade-picker-button-size': `${pickerFit.buttonSize}px`,
        '--trade-picker-name-size': `${pickerFit.nameSize}px`,
        '--trade-picker-meta-size': `${pickerFit.metaSize}px`,
        '--trade-picker-value-size': `${pickerFit.valueSize}px`,
      }}
      mobileSheet
      ariaLabel={isAllMode ? 'Search all rostered players' : 'Add player'}
    >

        {/* Header + search + position chips */}
        <div className="trade-roster-picker-header shrink-0" data-testid="trade-roster-picker" style={{ borderBottom: '1px solid var(--color-separator)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-base" style={{ color: 'var(--color-label)' }}>
              {isAllMode ? 'Search All Rostered Players' : 'Add Player'}
            </span>
            <button onClick={onClose} data-testid="trade-roster-picker-close" className="p-1" style={{ color: 'var(--color-label-secondary)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <CompanionSearchField
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Name, team, city, or position…"
            inputProps={{
              autoComplete: 'off',
              autoCorrect: 'off',
              autoCapitalize: 'none',
              spellCheck: false,
              name: 'player_search',
              inputMode: 'search',
              'data-form-type': 'other',
              'data-testid': 'trade-roster-picker-search',
            }}
          />
          {/* Position chips — only in all-rosters mode */}
          {isAllMode && (
            <div className="mt-2.5">
            <CompanionSelectorRail ariaLabel="Trade player position filter">
              {POSITION_FILTER_CHIPS.map(pos => (
                <CompanionSelectorButton
                  key={pos}
                  onClick={() => setPosFilter(pos)}
                  active={posFilter === pos}
                >
                  {pos}
                </CompanionSelectorButton>
              ))}
            </CompanionSelectorRail>
            </div>
          )}
        </div>

        {/* Results — scrollable */}
        <div
          ref={resultsContainerRef}
          className="trade-roster-picker-results flex-1 overflow-y-auto"
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

function useVirtualRows(rows, enabled, headerRowHeight = PICKER_HEADER_ROW_HEIGHT) {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    if (!enabled) {
      const timer = window.setTimeout(() => setScrollTop(0), 0);
      return () => window.clearTimeout(timer);
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
      ? Math.min(0, nextHeaderTop - scrollTop - headerRowHeight)
      : 0;

    return {
      id: currentHeader.id,
      label: currentHeader.label,
      translateY,
    };
  }, [enabled, headerRowHeight, offsets, rows, scrollTop]);

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
