// ── TradeRosterPicker ─────────────────────────────────────────────────────────
// Modal player picker for the Trade Agent.
// Supports two modes:
//   - Roster-locked: shows only one roster's players (for "Your Side")
//   - All Rosters: search across the entire league (for "Their Side")
// When in "All Rosters" mode, selecting a player returns { id, rosterId }
// so CompanionTrade can auto-set the trade partner.

import { useState, useEffect, useMemo } from 'react';
import { findKtcPlayerFromSleeper, getKtcValue, fmtKtcValue } from '../../utils/ktcApi';
import { calcPointsFromTotals } from '../../utils/scoringEngine';
import { computePositionalRanks } from '../../utils/projectionEngine';
import { TEAM_COLORS } from '../../data/teamColors';
import { useTheme } from '../../context/ThemeContext';

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB'];

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

// ── Color helpers (inline — same as PlayerProfile / CompareTab) ───────────────

function hexLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TradeRosterPicker({
  rosterId,           // null = all-rosters mode, number = locked to that roster
  rosters,
  sleeperPlayers,
  ktcPlayers,
  leagueType,
  excludeIds,
  seasonStats,
  scoringSettings,
  getUserDisplayName, // needed for all-rosters mode owner labels
  myRosterId,         // to exclude own roster in all-rosters mode
  currentTotal,       // current KTC total for this side of the trade
  onSelect,           // (playerId) for locked mode, ({ id, rosterId }) for all-rosters mode
  onClose,
}) {
  const [search, setSearch] = useState('');
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

  // Build player list — either from one roster or all (excluding own roster in all mode)
  const players = useMemo(() => {
    let sourceIds;
    if (isAllMode) {
      sourceIds = [];
      for (const r of rosters) {
        if (r.roster_id === myRosterId) continue;
        const ids = [...new Set([...(r.players ?? []), ...(r.reserve ?? [])])];
        sourceIds.push(...ids);
      }
    } else {
      const roster = rosters.find(r => r.roster_id === rosterId);
      sourceIds = roster ? [...new Set([...(roster.players ?? []), ...(roster.reserve ?? [])])] : [];
    }

    return sourceIds
      .filter(id => !excludeSet.has(id))
      .map(id => {
        const sp = sleeperPlayers?.[id];
        if (!sp) return null;
        const ktc = findKtcPlayerFromSleeper(id, sleeperPlayers, ktcPlayers);
        const val = getKtcValue(ktc, leagueType);
        const stats = seasonStats?.[id];
        const pts = stats ? calcPointsFromTotals(stats, scoringSettings, sp.position) : null;
        const gp = stats?.gp ?? null;
        const avgPPG = pts != null && gp ? Math.round((pts / gp) * 10) / 10 : null;
        const ownerRosterId = playerRosterMap[id];
        const ownerName = isAllMode && ownerRosterId
          ? getUserDisplayName(rosters.find(r => r.roster_id === ownerRosterId)?.owner_id ?? '')
          : null;
        const teamKey = toTeamKey(sp.team);
        const palette = TEAM_COLORS[teamKey] ?? null;
        const rankInfo = rankMap[id] ?? null;
        return {
          id,
          name: sp.full_name ?? `${sp.first_name ?? ''} ${sp.last_name ?? ''}`.trim(),
          position: sp.position ?? '',
          team: sp.team ?? '',
          teamKey,
          palette,
          injuryStatus: sp.injury_status,
          val,
          pts,
          avgPPG,
          rankInfo,
          ownerRosterId,
          ownerName,
        };
      })
      .filter(Boolean);
  }, [isAllMode, rosters, rosterId, myRosterId, excludeSet, sleeperPlayers, ktcPlayers,
      leagueType, seasonStats, scoringSettings, playerRosterMap, getUserDisplayName, rankMap]);

  const filtered = useMemo(() => {
    if (!search.trim()) return players;
    const q = search.toLowerCase();
    return players.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.position.toLowerCase().includes(q) ||
      p.team.toLowerCase().includes(q) ||
      (p.ownerName && p.ownerName.toLowerCase().includes(q))
    );
  }, [players, search]);

  const grouped = useMemo(() => {
    const groups = {};
    for (const p of filtered) {
      const pos = POSITION_ORDER.includes(p.position) ? p.position : 'Other';
      if (!groups[pos]) groups[pos] = [];
      groups[pos].push(p);
    }
    for (const pos of Object.keys(groups)) {
      groups[pos].sort((a, b) => (b.val ?? -1) - (a.val ?? -1));
    }
    return groups;
  }, [filtered]);

  function handleSelect(player) {
    if (isAllMode) {
      onSelect({ id: player.id, rosterId: player.ownerRosterId });
    } else {
      onSelect(player.id);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="flex flex-col rounded-2xl overflow-hidden w-full mx-4"
        style={{ background: 'var(--color-bg)', maxWidth: 520, height: '72vh', maxHeight: 640 }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--color-separator)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
            {isAllMode ? 'Search All Rosters' : 'Add Player'}
          </span>
          <button onClick={onClose} className="text-xs font-semibold"
            style={{ color: 'var(--color-accent)' }}>
            Cancel
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--color-separator)' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={isAllMode ? 'Search by name, position, team, or owner…' : 'Search by name, position, or team…'}
            autoFocus
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{
              background: 'var(--color-fill)',
              color: 'var(--color-label)',
              border: 'none',
              outline: 'none',
              fontSize: '16px',
            }}
          />
        </div>

        {/* Player list */}
        <div className="flex-1 overflow-y-auto">
          {POSITION_ORDER.map(pos => {
            const list = grouped[pos];
            if (!list?.length) return null;
            return (
              <div key={pos}>
                <div className="sticky top-0 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest"
                  style={{ background: 'var(--color-bg)', color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}>
                  {pos}
                </div>
                {list.map(p => {
                  const teamColor = p.palette
                    ? (darkMode ? p.palette.darkPrimary : p.palette.primary)
                    : null;
                  // Text needs to stay on var(--color-label) since tint is subtle —
                  // only use luminance to decide border/accent visibility
                  const isLightColor = teamColor ? hexLuminance(teamColor) > 0.35 : false;

                  return (
                    <button key={p.id} onClick={() => handleSelect(p)}
                      className="flex items-center w-full px-4 py-3 gap-3 relative overflow-hidden transition-colors"
                      style={{
                        borderBottom: '1px solid var(--color-separator)',
                        borderLeft: teamColor ? `3px solid ${teamColor}` : '3px solid transparent',
                        background: teamColor
                          ? `${teamColor}${isLightColor ? '18' : '22'}`
                          : 'transparent',
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
                            <span className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>
                              · {p.ownerName}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* KTC value + projected total */}
                      <div className="flex flex-col items-end shrink-0 gap-0.5">
                        <span className="text-sm font-bold tabular-nums"
                          style={{ color: p.val != null ? 'var(--color-label)' : 'var(--color-label-quaternary)' }}>
                          {fmtKtcValue(p.val)}
                        </span>
                        {p.val != null && currentTotal != null && (
                          <span className="text-xs tabular-nums" style={{ color: 'var(--color-accent)' }}>
                            → {fmtKtcValue(currentTotal + p.val)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-12 text-sm text-center" style={{ color: 'var(--color-label-tertiary)' }}>
              No players found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
