// ── TradeRosterPicker ─────────────────────────────────────────────────────────
// Modal player picker for the Trade Agent.
// Supports two modes:
//   - Roster-locked: shows only one roster's players (for "Your Side")
//   - All Rosters: search across the entire league (for "Their Side")
// When in "All Rosters" mode, selecting a player returns { id, rosterId }
// so CompanionTrade can auto-set the trade partner.

import { useState, useEffect, useMemo } from 'react';
import { findKtcPlayerFromSleeper, getKtcValue, fmtKtcValue, productionAdjustedValue } from '../../utils/ktcApi';
import { DYNASTY_FALLBACK_MULT } from '../../utils/tradeEngine';
import { calcPointsFromTotals } from '../../utils/scoringEngine';
import { computePositionalRanks, computePositionalAvgPPG, computePositionalValuePerPPG } from '../../utils/projectionEngine';
import { parseSearchQuery, matchesFilter } from '../../utils/parseSearchQuery';
import { TEAM_COLORS } from '../../data/teamColors';
import { useTheme } from '../../context/ThemeContext';

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
  onSelect,              // (playerId) for locked mode, ({ id, rosterId }) for all-rosters mode
  onClose,
}) {
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const { darkMode } = useTheme();
  const isAllMode = rosterId == null;

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Positional ranks across all rostered players
  const rankMap = useMemo(
    () => computePositionalRanks(seasonStats, sleeperPlayers, scoringSettings),
    [seasonStats, sleeperPlayers, scoringSettings],
  );

  // Average PPG per position — used to calibrate per-player production multipliers
  const positionalAvgPPG = useMemo(
    () => computePositionalAvgPPG(rosters, seasonStats, sleeperPlayers, scoringSettings),
    [rosters, seasonStats, sleeperPlayers, scoringSettings],
  );

  // KTC value per PPG for each position — used to estimate dynasty-fallback player values
  const positionalValuePerPPG = useMemo(
    () => computePositionalValuePerPPG(
      rosters, sleeperPlayers, ktcPlayers, leagueType,
      seasonStats, scoringSettings, findKtcPlayerFromSleeper, getKtcValue, productionAdjustedValue,
    ),
    [rosters, sleeperPlayers, ktcPlayers, leagueType, seasonStats, scoringSettings],
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

  // Build player list — either from one roster or all (optionally including own roster)
  const players = useMemo(() => {
    let sourceIds;
    if (isAllMode) {
      sourceIds = [];
      for (const r of rosters) {
        if (!includeOwnRoster && r.roster_id === myRosterId) continue;
        const ids = [...new Set([...(r.players ?? []), ...(r.reserve ?? [])])];
        sourceIds.push(...ids);
      }
    } else {
      const roster = rosters.find(r => r.roster_id === rosterId);
      sourceIds = roster ? [...new Set([...(roster.players ?? []), ...(roster.reserve ?? [])])] : [];
    }

    return sourceIds
      .filter(id => !allowedSet || allowedSet.has(id))
      .filter(id => !isAllMode || !excludeSet.has(id))
      .map(id => {
        const sp = sleeperPlayers?.[id];
        if (!sp) return null;
        const ktc = findKtcPlayerFromSleeper(id, sleeperPlayers, ktcPlayers);
        let rawVal = getKtcValue(ktc, leagueType);
        let dynastyFallback = false;
        let idpFallback = false;
        if (rawVal == null && dynastyKtcPlayers?.length) {
          const dKtc = findKtcPlayerFromSleeper(id, sleeperPlayers, dynastyKtcPlayers);
          const dVal = getKtcValue(dKtc, leagueType);
          if (dVal != null) { rawVal = Math.round(dVal * DYNASTY_FALLBACK_MULT); dynastyFallback = true; }
        }
        if (rawVal == null && mergedIDPMap?.has(id)) {
          rawVal = mergedIDPMap.get(id);
          idpFallback = true;
        }
        rawVal = rawVal ?? (ktcPlayers?.length > 0 ? 0 : null);
        const stats = seasonStats?.[id];
        const pts = stats ? calcPointsFromTotals(stats, scoringSettings, sp.position) : null;
        const gp = stats?.gp ?? 0;
        const avgPPG = pts != null && gp ? Math.round((pts / gp) * 10) / 10 : null;
        const rankInfo = rankMap[id] ?? null;

        let val;
        if (idpFallback) {
          val = rawVal;
        } else if (dynastyFallback && gp >= 3 && avgPPG != null && positionalValuePerPPG[sp.position] != null) {
          // PPG-calibrated estimation: anchor dynasty-fallback players to the same
          // value-per-PPG ratio as direct-KTC-ranked players at this position.
          val = Math.round(avgPPG * positionalValuePerPPG[sp.position]);
        } else {
          // 50% PPG blend weight for trade agent (higher than default 35%)
          val = productionAdjustedValue(rawVal, avgPPG, positionalAvgPPG[sp.position], 0.50);
        }

        // Layer 2 — rank-percentile nudge (±12%)
        if (!idpFallback && rankInfo?.rank != null && rankInfo?.posCount > 1) {
          const percentile = 1 - (rankInfo.rank - 1) / (rankInfo.posCount - 1);
          val = Math.round(val * (0.88 + 0.24 * percentile));
        }

        const ownerRosterId = playerRosterMap[id];
        const isOwnPlayer = ownerRosterId === myRosterId;
        const ownerName = isAllMode && ownerRosterId
          ? (isOwnPlayer ? 'Your Roster' : getUserDisplayName(rosters.find(r => r.roster_id === ownerRosterId)?.owner_id ?? ''))
          : null;
        const teamKey = toTeamKey(sp.team);
        const cityName = TEAM_CITY_NAMES[teamKey] ?? '';
        const palette = TEAM_COLORS[teamKey] ?? null;
        return {
          id,
          name: sp.full_name ?? `${sp.first_name ?? ''} ${sp.last_name ?? ''}`.trim(),
          position: sp.position ?? '',
          team: sp.team ?? '',
          teamKey,
          palette,
          injuryStatus: sp.injury_status,
          val,
          dynastyFallback,
          idpFallback,
          pts,
          avgPPG,
          rankInfo,
          ownerRosterId,
          ownerName,
          isOwnPlayer,
          cityName,
          isAdded: excludeSet.has(id),
        };
      })
      .filter(Boolean);
  }, [isAllMode, includeOwnRoster, rosters, rosterId, myRosterId, excludeSet, allowedSet, sleeperPlayers,
      ktcPlayers, dynastyKtcPlayers, leagueType, seasonStats, scoringSettings, playerRosterMap,
      mergedIDPMap,
      getUserDisplayName, rankMap, positionalAvgPPG, positionalValuePerPPG]);

  // Position chip filter applied first (independent of text search)
  const posFiltered = useMemo(() => {
    if (posFilter === 'ALL') return players;
    const group = POSITION_FILTER_GROUPS[posFilter];
    return players.filter(p => group ? group.has(p.position) : p.position === posFilter);
  }, [players, posFilter]);

  const filtered = useMemo(() => {
    if (!search.trim()) return posFiltered;
    const filters = parseSearchQuery(search);
    const hasFilters = filters.pos.size || filters.team.size || filters.div.size || filters.conf.size || filters.name.length;
    if (!hasFilters) return posFiltered;
    return posFiltered.filter(p => {
      if (filters.name.length > 0) {
        // Include city name so partial matches like "New" hit "new orleans saints"
        const hay = [p.name, p.ownerName ?? '', p.team, p.cityName].join(' ').toLowerCase();
        if (!filters.name.every(t => hay.includes(t))) return false;
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
  }, [posFiltered, search]);

  const grouped = useMemo(() => {
    const groups = {};
    for (const p of filtered) {
      const pos = toDisplayPosition(p.position);
      if (!groups[pos]) groups[pos] = [];
      groups[pos].push(p);
    }
    for (const pos of Object.keys(groups)) {
      groups[pos].sort((a, b) => (b.val ?? -1) - (a.val ?? -1));
    }
    return groups;
  }, [filtered]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex flex-col rounded-2xl overflow-hidden w-full"
        style={{ background: 'var(--color-bg)', maxWidth: 520, height: '72vh', maxHeight: 640 }}
        onClick={e => e.stopPropagation()}>

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
              autoFocus
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
        <div className="flex-1 overflow-y-auto">
          {/* Player list — always shown */}
          {POSITION_ORDER.map(pos => {
            const list = grouped[pos];
            if (!list?.length) return null;
            return (
              <div key={pos}>
                <div className="sticky top-0 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest"
                  style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-label-tertiary)', letterSpacing: '0.08em', borderBottom: '1px solid var(--color-separator)', zIndex: 1 }}>
                  {pos === 'Other' ? 'OTHER' : pos}
                </div>
                {list.map(p => {
                  const teamColor = p.palette
                    ? (darkMode ? p.palette.darkPrimary : p.palette.primary)
                    : null;
                  // Text needs to stay on var(--color-label) since tint is subtle —
                  // only use luminance to decide border/accent visibility
                  const isLightColor = teamColor ? hexLuminance(teamColor) > 0.35 : false;

                  return (
                    <div key={p.id}
                      className="flex items-center w-full px-4 py-3 gap-3 relative overflow-hidden transition-colors"
                      style={{
                        borderBottom: '1px solid var(--color-separator)',
                        borderLeft: teamColor ? `3px solid ${teamColor}` : '3px solid transparent',
                        background: teamColor
                          ? `${teamColor}${isLightColor ? '18' : '22'}`
                          : 'transparent',
                        opacity: p.isAdded ? 0.5 : 1,
                      }}>

                      {/* Player avatar */}
                      <img src={`https://sleepercdn.com/content/nfl/players/thumb/${p.id}.jpg`}
                        alt="" className="w-9 h-9 rounded-full shrink-0 object-cover"
                        style={{ background: 'var(--color-fill-secondary)' }}
                        onError={e => { e.target.style.display = 'none'; }} />

                      {/* Name + meta */}
                      <div className="flex-1 min-w-0 text-left relative">
                        {/* Team logo watermark — scoped to text area so it never overlaps the value column */}
                        {p.teamKey && (
                          <img
                            src={`https://a.espncdn.com/i/teamlogos/nfl/500/${p.teamKey}.png`}
                            aria-hidden="true"
                            className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none select-none"
                            style={{ width: 44, height: 44, objectFit: 'contain', opacity: 0.10 }}
                            onError={e => { e.target.style.display = 'none'; }}
                          />
                        )}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-semibold truncate" style={{ color: 'var(--color-label)' }}>
                            {p.name}
                          </span>
                          {p.injuryStatus && p.injuryStatus !== 'Active' && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded"
                              style={{ background: 'var(--color-fill-secondary)', color: 'var(--color-label-tertiary)', fontSize: '9px', fontWeight: 700 }}>
                              {p.injuryStatus}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-xs" style={{ color: 'var(--color-label-secondary)' }}>
                            {p.position}{p.team ? ` · ${p.team}` : ''}
                          </span>
                          {p.rankInfo && (
                            <span className="text-xs font-bold tabular-nums"
                              style={{ color: teamColor ?? 'var(--color-label-tertiary)' }}>
                              #{p.rankInfo.rank} {p.rankInfo.posLabel}
                            </span>
                          )}
                          {p.avgPPG != null && (
                            <span className="text-xs tabular-nums" style={{ color: 'var(--color-label-tertiary)' }}>
                              {p.avgPPG.toFixed(1)} avg
                            </span>
                          )}
                          {p.ownerName && (
                            <span className="text-xs font-semibold"
                              style={{ color: p.isOwnPlayer ? 'var(--color-signature)' : 'var(--color-label-quaternary)' }}>
                              · {p.ownerName}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* KTC value + projected total */}
                      <div className="flex flex-col items-end shrink-0 gap-0.5">
                        <span className="text-sm font-bold tabular-nums"
                          title={p.idpFallback ? 'Estimated from season production (no KTC data)' : undefined}
                          style={{ color: p.val != null ? 'var(--color-label)' : 'var(--color-label-quaternary)' }}>
                          {(p.dynastyFallback || p.idpFallback) ? '~' : ''}{fmtKtcValue(p.val)}
                        </span>
                        {p.dynastyFallback && (
                          <span style={{ color: 'var(--color-label-quaternary)', fontSize: '9px', fontWeight: 600 }}>
                            DYN est.
                          </span>
                        )}
                        {p.idpFallback && (
                          <span style={{ color: 'var(--color-label-quaternary)', fontSize: '9px', fontWeight: 600 }}>
                            est.
                          </span>
                        )}
                        {showsAdditiveTotal(p) && (
                          <span className="text-xs tabular-nums" style={{ color: 'var(--color-accent)' }}>
                            → {fmtKtcValue(currentTotal + p.val)}
                          </span>
                        )}
                      </div>
                      {p.isAdded ? (
                        <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                          style={{ background: 'rgba(0,168,68,0.15)', color: 'var(--color-accent-green)' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </div>
                      ) : (
                        <button onClick={() => handleSelect(p)}
                          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors active:opacity-60"
                          style={{ background: 'var(--color-fill)', color: 'var(--color-label-secondary)', fontSize: '20px', lineHeight: 1 }}>
                          +
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-12 text-sm text-center" style={{ color: 'var(--color-label-tertiary)' }}>
              {search.trim() ? `No players found for "${search}"` : 'No players found'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
