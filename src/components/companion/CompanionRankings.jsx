import { useEffect, useMemo, useState } from 'react';
import { useSleeperBase, useSleeperStatsProgress } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { calcPointsFromTotals } from '../../utils/scoringEngine';
import PlayerWeeklySheet from './PlayerWeeklySheet';
import useCardGlow from '../../hooks/useCardGlow.jsx';
import useMediaQuery from '../../hooks/useMediaQuery.js';
import {
  getLeaguePositionFilters,
  getPositionFilterLabel,
  isValidLeaguePositionFilter,
  positionMatchesLeagueFilter,
} from '../../utils/leaguePositions';
import { getPlayerRowTeamTheme } from '../../utils/playerRowTheme';

const POSITION_COLORS = {
  QB: '#ef4444',
  RB: '#22c55e',
  WR: '#3b82f6',
  TE: '#f59e0b',
  K: '#8b5cf6',
  DEF: '#64748b',
  DL: '#dc2626',
  LB: '#2563eb',
  DB: '#0891b2',
  TST: '#14b8a6',
  STP: '#a855f7',
};
const COMPACT_PHONE_QUERY = '(max-width: 480px)';
const HIDE_AVG_QUERY = '(max-width: 900px)';
const RANKINGS_ROW_GAP = 10;

function measureMaxNameWidth(players) {
  if (typeof document === 'undefined' || !players.length) return 0;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  ctx.font = '600 14px Figtree, sans-serif';
  return Math.ceil(players.reduce((max, p) =>
    Math.max(max, ctx.measureText(p.name ?? '').width), 0)) + 8;
}

function getRankingsGridTemplate({ hideAvgColumn, isCompactPhone, nameColPx }) {
  // On compact phones, names truncate freely; on larger screens, size to the longest name
  if (isCompactPhone) return `32px 44px minmax(0,1fr) auto 80px 12px`;
  const nameCol = nameColPx ? `minmax(0,${nameColPx}px)` : 'minmax(0,1fr)';
  if (hideAvgColumn) return `32px 44px ${nameCol} auto 80px 12px`;
  return `32px 44px ${nameCol} auto 64px 80px 12px`;
}

export default function CompanionRankings({ positionFilter = 'ALL', onPositionFilterChange, onViewPlayer = null }) {
  const {
    players, loadPlayers,
    seasonStats, loadSeasonStats,
    statsLoading,
    scoringSettings,
    rosters,
    league,
  } = useSleeperBase();
  const { darkMode } = useTheme();
  const isCompactPhone = useMediaQuery(COMPACT_PHONE_QUERY);
  const hideAvgColumn = useMediaQuery(HIDE_AVG_QUERY);

  const [posFilter, setPosFilter] = useState(positionFilter);
  const [search, setSearch] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [sortBy, setSortBy] = useState('season');
  const availablePositions = useMemo(
    () => getLeaguePositionFilters(league?.roster_positions),
    [league?.roster_positions],
  );

  useEffect(() => {
    setPosFilter(isValidLeaguePositionFilter(positionFilter, availablePositions) ? positionFilter : 'ALL');
  }, [positionFilter, availablePositions]);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);
  useEffect(() => {
    if (!seasonStats && !statsLoading) loadSeasonStats();
  }, [seasonStats, statsLoading, loadSeasonStats]);

  // Build set of all rostered player IDs for highlighting
  const rosteredIds = useMemo(() => {
    const ids = new Set();
    for (const r of rosters) {
      for (const id of (r.players || [])) ids.add(id);
      for (const id of (r.reserve || [])) ids.add(id);
    }
    return ids;
  }, [rosters]);

  // Full sorted list with true ranks - search is NOT applied here so ranks are stable.
  const allRanked = useMemo(() => {
    if (!players || !seasonStats) return [];

    return Object.entries(seasonStats)
      .map(([id, stats]) => {
        const p = players[id];
        if (!p) return null;
        const pos = p.position;
        if (!positionMatchesLeagueFilter(pos, 'ALL', { stats, availableFilters: availablePositions })) return null;
        if (!positionMatchesLeagueFilter(pos, posFilter, { stats, availableFilters: availablePositions })) return null;

        const pts = calcPointsFromTotals(stats, scoringSettings, p.position);
        if (pts <= 0) return null;

        return {
          id,
          name: p.full_name || `${p.first_name} ${p.last_name}`,
          position: pos,
          team: p.team || 'FA',
          pts,
          avgPPG: stats?.gp ? pts / stats.gp : null,
          isRostered: rosteredIds.has(id),
          teamTheme: getPlayerRowTeamTheme(p.team || '', darkMode),
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (sortBy === 'avg') {
          const avgDiff = (b.avgPPG ?? -Infinity) - (a.avgPPG ?? -Infinity);
          if (avgDiff !== 0) return avgDiff;
        }
        return b.pts - a.pts;
      })
      .slice(0, 100)
      .map((player, i) => ({ ...player, rank: i + 1 }));
  }, [players, seasonStats, scoringSettings, posFilter, availablePositions, rosteredIds, darkMode, sortBy]);

  // Apply search on top of the ranked list - rank numbers are preserved from above.
  const ranked = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRanked;
    return allRanked.filter(p =>
      p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q),
    );
  }, [allRanked, search]);

  const nameColPx = useMemo(() => measureMaxNameWidth(ranked), [ranked]);

  return (
    <div className="pb-6">
      {/* Filters */}
      <div className="px-4 pb-3 flex flex-col gap-2">
        {/* Position chips */}
        <div className="flex gap-1.5 flex-wrap">
          {availablePositions.map(pos => (
            <button
              key={pos}
              onClick={() => {
                setPosFilter(pos);
                onPositionFilterChange?.(pos);
              }}
              className="px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
              style={{
                background: posFilter === pos ? 'var(--color-signature)' : 'var(--color-fill)',
                color: posFilter === pos ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
              }}
            >
              {getPositionFilterLabel(pos)}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: 'var(--color-label-tertiary)' }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search players..."
            className="w-full pl-9 pr-3 py-2 rounded-xl font-medium focus:outline-none"
            style={{
              fontSize: '16px',
              background: 'var(--color-fill-secondary)',
              color: 'var(--color-label)',
            }}
          />
        </div>
      </div>

      {/* Stats loading */}
      {statsLoading && <RankingsStatsLoadingBanner />}

      {/* Column headers */}
      <div
        className="grid items-center px-4 pb-2 mb-1"
        style={{
          borderBottom: '1px solid var(--color-separator)',
          gridTemplateColumns: getRankingsGridTemplate({ hideAvgColumn, isCompactPhone, nameColPx }),
          columnGap: RANKINGS_ROW_GAP,
        }}
      >
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>#</span>
        <div />
        <span className="min-w-0 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Player</span>
        <div />
        {!hideAvgColumn && (
          <SortHeader
            label="Avg/G"
            active={sortBy === 'avg'}
            onClick={() => setSortBy('avg')}
          />
        )}
        <SortHeader
          label="Season"
          active={sortBy === 'season'}
          onClick={() => setSortBy('season')}
        />
        <div />
      </div>

      {!seasonStats && !statsLoading && (
        <div className="flex items-center justify-center py-16">
          <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>Loading stats...</span>
        </div>
      )}

      {ranked.map((player) => (
        <RankRow
          key={player.id}
          rank={player.rank}
          player={player}
          hideAvgColumn={hideAvgColumn}
          isCompactPhone={isCompactPhone}
          nameColPx={nameColPx}
          onSelect={() => setSelectedPlayerId(player.id)}
        />
      ))}

      {ranked.length === 0 && seasonStats && (
        <div className="flex items-center justify-center py-16">
          <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>No players found.</span>
        </div>
      )}

      {selectedPlayerId && (
        <PlayerWeeklySheet
          playerId={selectedPlayerId}
          onClose={() => setSelectedPlayerId(null)}
          onViewStats={onViewPlayer}
        />
      )}
    </div>
  );
}

function RankingsStatsLoadingBanner() {
  const statsProgress = useSleeperStatsProgress();

  return (
    <div className="mx-4 mb-3 px-4 py-2.5 rounded-xl flex items-center gap-3" style={{ background: 'var(--color-fill)' }}>
      <div className="h-1 flex-1 rounded-full overflow-hidden" style={{ background: 'var(--color-fill-secondary)' }}>
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${statsProgress}%`, background: 'var(--color-signature)' }} />
      </div>
      <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--color-label-tertiary)' }}>
        {statsProgress}%
      </span>
    </div>
  );
}

function SortHeader({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="relative w-full grid place-items-center text-xs font-semibold uppercase tracking-widest transition-colors"
      style={{ color: active ? 'var(--color-label)' : 'var(--color-label-tertiary)' }}
    >
      <span className="text-center">{label}</span>
      <span
        className="absolute right-0 top-1/2 inline-block text-[9px]"
        style={{ transform: 'translateY(-50%)', visibility: active ? 'visible' : 'hidden' }}
      >
        ↓
      </span>
    </button>
  );
}

function RankRow({ rank, player, onSelect, hideAvgColumn, isCompactPhone, nameColPx }) {
  const [isHovered, setIsHovered] = useState(false);
  const posColor = POSITION_COLORS[player.position] ?? 'var(--color-label-tertiary)';
  const rosteredColor = player.teamTheme.accent ?? 'var(--color-signature)';
  const { darkMode } = useTheme();
  const glowColor = player.teamTheme.accent ?? (darkMode ? '#5AADFF' : '#1A6EFF');
  const cardColor = player.teamTheme.accent ?? null;
  const { glowHandlers, borderOverlay, glowShadow } = useCardGlow({
    enabled: isHovered,
    color: glowColor,
    cardColor,
    darkMode,
    coreColor: darkMode ? (player.teamTheme.glowCore ?? '#FFFFFF') : null,
    outerColor: player.teamTheme.accent ?? glowColor,
  });
  const baseShadow = isHovered
    ? '0 8px 18px rgba(12,15,20,0.10), 0 2px 6px rgba(12,15,20,0.08)'
    : '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)';
  const rowShadow = glowShadow ? `${glowShadow}, ${baseShadow}` : baseShadow;

  return (
    <button
      onClick={onSelect}
      onMouseMove={glowHandlers.onMouseMove}
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
      className="relative grid items-center w-full px-3 py-2.5 text-left active:opacity-60"
      style={{
        gridTemplateColumns: getRankingsGridTemplate({ hideAvgColumn, isCompactPhone, nameColPx }),
        columnGap: RANKINGS_ROW_GAP,
        borderBottom: '1px solid var(--color-separator)',
        borderLeft: player.teamTheme.accent ? `4px solid ${player.teamTheme.accent}` : '4px solid transparent',
        background: isHovered ? player.teamTheme.hoverBg : player.teamTheme.rowBg,
        boxShadow: rowShadow,
        transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'background 150ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 200ms cubic-bezier(0.32, 0.72, 0, 1), transform 200ms cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      {borderOverlay}
      <span className="text-xs tabular-nums" style={{ color: 'var(--color-label-quaternary)' }}>
        {rank}
      </span>

      <img
        src={`https://sleepercdn.com/content/nfl/players/thumb/${player.id}.jpg`}
        alt={player.name}
        className="w-11 h-11 rounded-full shrink-0 object-cover"
        style={{
          background: 'var(--color-fill)',
          border: player.teamTheme.avatarBorder ? `2px solid ${player.teamTheme.avatarBorder}` : '2px solid transparent',
        }}
        onError={e => { e.target.src = 'https://sleepercdn.com/images/v2/icons/player_default.webp'; }}
      />

      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-semibold text-sm truncate" style={{ color: 'var(--color-label)' }}>
            {player.name}
          </span>
        </div>
        <div className="text-xs mt-0.5 flex items-center gap-1.5 min-w-0 whitespace-nowrap overflow-hidden">
          <span style={{ color: posColor, fontWeight: 600 }}>{player.position}</span>
          <span style={{ color: 'var(--color-label-tertiary)' }}>{player.team}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 self-center" style={{ minHeight: 18 }}>
        {player.isRostered && (
          <span
            className="shrink-0 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.12em] leading-none"
            style={{ color: rosteredColor }}
          >
            {isCompactPhone ? 'R' : 'ROSTERED'}
          </span>
        )}
        {!isCompactPhone && player.teamTheme.logoKey && (
          <img
            src={`https://a.espncdn.com/i/teamlogos/nfl/500/${player.teamTheme.logoKey}.png`}
            alt=""
            aria-hidden="true"
            className="shrink-0"
            style={{ width: 'auto', height: 44, maxWidth: 44, objectFit: 'contain', opacity: 0.72 }}
            onError={e => { e.target.style.display = 'none'; }}
          />
        )}
      </div>

      {!hideAvgColumn && (
        <div className="w-full grid place-items-center">
          <span className="font-semibold tabular-nums text-sm text-center" style={{ color: 'var(--color-label-secondary)' }}>
            {player.avgPPG != null ? player.avgPPG.toFixed(1) : '—'}
          </span>
        </div>
      )}

      <div className="w-full grid place-items-center">
        <span className="font-bold tabular-nums text-sm text-center" style={{ color: 'var(--color-label)' }}>
          {player.pts.toFixed(1)}
        </span>
      </div>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-label-quaternary)', flexShrink: 0 }}>
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </button>
  );
}
