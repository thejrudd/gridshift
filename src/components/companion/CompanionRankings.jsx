import { useEffect, useMemo, useState } from 'react';
import { useSleeperBase, useSleeperStatsProgress } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { calcPointsFromTotals } from '../../utils/scoringEngine';
import CompanionPlayerPreviewSheet from './CompanionPlayerPreviewSheet';
import useMediaQuery from '../../hooks/useMediaQuery.js';
import {
  getLeaguePositionFilters,
  getPositionFilterLabel,
  isValidLeaguePositionFilter,
  positionMatchesLeagueFilter,
} from '../../utils/leaguePositions';
import { getPlayerRowTeamTheme } from '../../utils/playerRowTheme';
import { getPlayerAvailabilityStatus } from '../../utils/playerAvailabilityStatus.js';
import { PlayerStatusLogoCluster } from './PlayerStatusBadge.jsx';
import { CompanionSearchField, CompanionSelectorButton, CompanionSelectorRail } from './CompanionSelectorControls.jsx';
import CompanionPlayerRow, {
  CompanionPlayerLocalContrastText,
  CompanionPlayerMetric,
  CompanionPlayerStatus,
} from './CompanionPlayerRow.jsx';
const COMPACT_PHONE_QUERY = '(max-width: 480px)';
const HIDE_AVG_QUERY = '(max-width: 900px)';
const MOBILE_SHEET_QUERY = '(max-width: 1023px)';
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
    activeScoringSettings,
    rosters,
    league,
  } = useSleeperBase();
  const { darkMode } = useTheme();
  const isCompactPhone = useMediaQuery(COMPACT_PHONE_QUERY);
  const useMobilePreviewSheet = useMediaQuery(MOBILE_SHEET_QUERY);
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

        const pts = calcPointsFromTotals(stats, activeScoringSettings, p.position);
        if (pts <= 0) return null;

        return {
          id,
          name: p.full_name || `${p.first_name} ${p.last_name}`,
          position: pos,
          team: p.team || 'FA',
          pts,
          avgPPG: stats?.gp ? pts / stats.gp : null,
          isRostered: rosteredIds.has(id),
          availabilityStatus: getPlayerAvailabilityStatus(p),
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
  }, [players, seasonStats, activeScoringSettings, posFilter, availablePositions, rosteredIds, darkMode, sortBy]);

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
        <CompanionSelectorRail ariaLabel="Rankings position filter">
          {availablePositions.map(pos => (
            <CompanionSelectorButton
              key={pos}
              active={posFilter === pos}
              onClick={() => {
                setPosFilter(pos);
                onPositionFilterChange?.(pos);
              }}
            >
              {getPositionFilterLabel(pos)}
            </CompanionSelectorButton>
          ))}
        </CompanionSelectorRail>

        {/* Search */}
        <CompanionSearchField
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search players..."
        />
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
          onSelect={() => {
            if (useMobilePreviewSheet) setSelectedPlayerId(player.id);
            else onViewPlayer?.(player.id);
          }}
        />
      ))}

      {ranked.length === 0 && seasonStats && (
        <div className="flex items-center justify-center py-16">
          <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>No players found.</span>
        </div>
      )}

      {selectedPlayerId && (
        <CompanionPlayerPreviewSheet
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
  const { darkMode } = useTheme();
  const columnGridTemplate = hideAvgColumn ? 'auto 80px' : 'auto 64px 80px';
  const nameCol = nameColPx ? `minmax(0,${nameColPx}px)` : 'minmax(0,1fr)';
  const rowTemplate = isCompactPhone
    ? '32px 44px minmax(0,1fr) minmax(0,1fr) 12px'
    : `32px 44px ${nameCol} minmax(0,1fr) 12px`;
  const metaSegments = [player.position, player.team];

  return (
    <CompanionPlayerRow
      player={player}
      darkMode={darkMode}
      onClick={onSelect}
      showPosition={false}
      showTeamLogo={false}
      metaSegments={metaSegments}
      leading={(
        <span className="text-xs tabular-nums" style={{ color: 'var(--color-label-quaternary)' }}>
          {rank}
        </span>
      )}
      gridTemplate={rowTemplate}
      columnGridTemplate={columnGridTemplate}
      columns={[
        <div
          key="status"
          className={isCompactPhone ? 'flex items-center gap-1.5 self-center' : 'grid items-center self-center'}
          style={{
            minHeight: 18,
            gridTemplateColumns: isCompactPhone ? undefined : '74px auto',
            columnGap: isCompactPhone ? undefined : 6,
          }}
        >
          <div className={isCompactPhone ? 'shrink-0' : 'min-w-0 text-right'}>
            {player.isRostered ? (
              <CompanionPlayerLocalContrastText
                className="shrink-0 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.12em] leading-none"
              >
                {isCompactPhone ? 'R' : 'ROSTERED'}
              </CompanionPlayerLocalContrastText>
            ) : !isCompactPhone ? (
              <span
                aria-hidden="true"
                className="invisible text-[10px] font-bold uppercase tracking-[0.12em] leading-none"
              >
                ROSTERED
              </span>
            ) : null}
          </div>
          {!isCompactPhone && (
            <PlayerStatusLogoCluster
              logoKey={player.teamTheme.logoKey}
              status={player.availabilityStatus}
              className="justify-start"
            />
          )}
          {isCompactPhone && player.availabilityStatus && (
            <CompanionPlayerStatus label={player.availabilityStatus} tone="neutral" />
          )}
        </div>,
        !hideAvgColumn && (
          <CompanionPlayerMetric
            key="avg"
            value={player.avgPPG != null ? player.avgPPG.toFixed(1) : '—'}
            align="center"
          />
        ),
        <CompanionPlayerMetric
          key="season"
          value={player.pts.toFixed(1)}
          align="center"
        />,
      ].filter(Boolean)}
      trailing={(
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-label-quaternary)', flexShrink: 0 }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      )}
      style={{
        columnGap: RANKINGS_ROW_GAP,
        borderBottom: '1px solid var(--color-separator)',
        borderLeftWidth: 4,
        borderRadius: 0,
      }}
    />
  );
}
