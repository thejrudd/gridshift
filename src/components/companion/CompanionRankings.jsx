import { useEffect, useMemo, useRef, useState } from 'react';
import { useSleeperBase, useSleeperStatsProgress } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { DEFAULT_SCORING, calcPointsFromTotals } from '../../utils/scoringEngine';
import CompanionPlayerPreviewSheet from './CompanionPlayerPreviewSheet';
import useMediaQuery from '../../hooks/useMediaQuery.js';
import {
  getLeaguePositionFilters,
  getPositionFilterLabel,
  normalizeLeaguePlayerPosition,
  isValidLeaguePositionFilter,
  positionMatchesLeagueFilter,
} from '../../utils/leaguePositions';
import { getPlayerRowTeamTheme } from '../../utils/playerRowTheme';
import { getPlayerAvailabilityStatus } from '../../utils/playerAvailabilityStatus.js';
import PlayerStatusBadge, { PlayerStatusLogoCluster } from './PlayerStatusBadge.jsx';
import {
  CompanionFantasyTeamMenu,
  CompanionSearchField,
  CompanionSelectorButton,
  CompanionSelectorRail,
} from './CompanionSelectorControls.jsx';
import CompanionPlayerRow, {
  CompanionPlayerLocalContrastText,
  CompanionPlayerMetric,
} from './CompanionPlayerRow.jsx';
const COMPACT_PHONE_QUERY = '(max-width: 480px)';
const HIDE_AVG_QUERY = '(max-width: 900px)';
const MOBILE_SHEET_QUERY = '(max-width: 1023px)';
const RANKINGS_ROW_GAP = 10;
const MISSING_SORT_VALUE = 1_000_000_000;
const GROUP_FILTERS = {
  OFFENSE: ['QB', 'RB', 'WR', 'TE', 'K'],
  DEFENSE: ['DEF', 'DL', 'LB', 'DB'],
};
const BASE_SORT_OPTIONS = [
  { id: 'season', label: 'Season Points' },
];
const RANK_SCOPE_OPTIONS = [
  { id: 'overall', label: 'Overall Ranking' },
  { id: 'position', label: 'Positional Ranking' },
];
const ROSTER_PLAYER_FIELDS = ['players', 'reserve', 'taxi'];
const ACTION_SORT_OPTIONS = [
  { id: 'pass_yd', label: 'Passing Yards', shortLabel: 'Pass Yds', positions: ['QB'] },
  { id: 'pass_td', label: 'Passing TDs', shortLabel: 'Pass TD', positions: ['QB'] },
  { id: 'pass_int', label: 'Interceptions Thrown', shortLabel: 'INT Thrown', positions: ['QB'], negative: true },
  { id: 'pass_sack', label: 'Sacks Taken', shortLabel: 'Sacked', positions: ['QB'], negative: true },
  { id: 'rush_yd', label: 'Rushing Yards', shortLabel: 'Rush Yds', positions: ['QB', 'RB', 'WR', 'TE'] },
  { id: 'rush_td', label: 'Rushing TDs', shortLabel: 'Rush TD', positions: ['QB', 'RB', 'WR', 'TE'] },
  { id: 'rush_att', scoringKeys: ['rush_att', 'bonus_rush_att'], label: 'Rush Attempts', shortLabel: 'Carries', positions: ['QB', 'RB', 'WR', 'TE'] },
  { id: 'rec', label: 'Receptions', shortLabel: 'Rec', positions: ['RB', 'WR', 'TE'] },
  { id: 'rec_yd', label: 'Receiving Yards', shortLabel: 'Rec Yds', positions: ['RB', 'WR', 'TE'] },
  { id: 'rec_td', label: 'Receiving TDs', shortLabel: 'Rec TD', positions: ['RB', 'WR', 'TE'] },
  { id: 'fum_lost', label: 'Fumbles Lost', shortLabel: 'Fum Lost', positions: ['QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB', 'IDP'], negative: true },
  { id: 'fgm', label: 'Field Goals Made', shortLabel: 'FG Made', positions: ['K'] },
  { id: 'fgmiss', label: 'Field Goals Missed', shortLabel: 'FG Miss', positions: ['K'], negative: true },
  { id: 'xpm', label: 'Extra Points Made', shortLabel: 'XP Made', positions: ['K'] },
  { id: 'xpmiss', label: 'Extra Points Missed', shortLabel: 'XP Miss', positions: ['K'], negative: true },
  { id: 'idp_tkl', label: 'Tackles', shortLabel: 'Tackles', positions: ['DL', 'LB', 'DB', 'IDP'] },
  { id: 'idp_tkl_loss', label: 'Tackles For Loss', shortLabel: 'TFL', positions: ['DL', 'LB', 'DB', 'IDP'] },
  { id: 'idp_sack', label: 'Sacks', shortLabel: 'Sacks', positions: ['DL', 'LB', 'DB', 'IDP'] },
  { id: 'idp_int', label: 'Interceptions', shortLabel: 'INT', positions: ['DL', 'LB', 'DB', 'IDP'] },
  { id: 'idp_ff', label: 'Forced Fumbles', shortLabel: 'FF', positions: ['DL', 'LB', 'DB', 'IDP'] },
  { id: 'idp_fr', label: 'Fumble Recoveries', shortLabel: 'FR', positions: ['DL', 'LB', 'DB', 'IDP'] },
  { id: 'idp_pd', label: 'Passes Defended', shortLabel: 'Pass Def', positions: ['DL', 'LB', 'DB', 'IDP'] },
];

function getSortOptionById(id) {
  return [...BASE_SORT_OPTIONS, ...ACTION_SORT_OPTIONS].find(option => option.id === id) ?? BASE_SORT_OPTIONS[0];
}

function getFilterChipLabel(filter) {
  if (filter === 'OFFENSE') return 'Offense';
  if (filter === 'DEFENSE') return 'Defense';
  return getPositionFilterLabel(filter);
}

function buildRankingsFilterChips(availablePositions) {
  const availableSet = new Set(availablePositions);
  const chips = ['ALL'];
  if (GROUP_FILTERS.OFFENSE.some(filter => availableSet.has(filter))) chips.push('OFFENSE');
  if (GROUP_FILTERS.DEFENSE.some(filter => availableSet.has(filter))) chips.push('DEFENSE');
  return [...chips, ...availablePositions.filter(pos => pos !== 'ALL')];
}

function getExpandedPositionFilters(selectedFilters, availablePositions) {
  if (!selectedFilters?.length || selectedFilters.includes('ALL')) return availablePositions.filter(pos => pos !== 'ALL');
  const availableSet = new Set(availablePositions);
  const expanded = new Set();
  for (const filter of selectedFilters) {
    const group = GROUP_FILTERS[filter];
    if (group) {
      group.forEach(pos => { if (availableSet.has(pos)) expanded.add(pos); });
    } else if (availableSet.has(filter)) {
      expanded.add(filter);
    }
  }
  return [...expanded];
}

function selectedFiltersMatchPlayer(position, stats, selectedFilters, availablePositions) {
  const expandedFilters = getExpandedPositionFilters(selectedFilters, availablePositions);
  if (!expandedFilters.length) return false;
  return expandedFilters.some(filter => positionMatchesLeagueFilter(position, filter, { stats, availableFilters: availablePositions }));
}

function isFilterChipActive(filter, selectedFilters) {
  if (filter === 'ALL') return selectedFilters.includes('ALL');
  return selectedFilters.includes(filter);
}

function getNextSelectedFilters(currentFilters, filter, event) {
  const multiSelect = (event?.ctrlKey || event?.metaKey) && filter !== 'ALL';
  if (!multiSelect) return [filter];

  const current = currentFilters.includes('ALL') ? [] : currentFilters;
  const next = current.includes(filter)
    ? current.filter(item => item !== filter)
    : [...current, filter];
  return next.length ? next : ['ALL'];
}

function getPrimaryRouteFilter(selectedFilters, availablePositions) {
  if (selectedFilters.length === 1 && isValidLeaguePositionFilter(selectedFilters[0], availablePositions)) return selectedFilters[0];
  return 'ALL';
}

function normalizeRosterId(rosterId) {
  if (rosterId == null) return null;
  const value = String(rosterId).trim();
  return value || null;
}

function parseRosterFilter(rosterFilter) {
  if (Array.isArray(rosterFilter)) {
    return rosterFilter.map(normalizeRosterId).filter(Boolean);
  }
  if (typeof rosterFilter !== 'string') {
    const normalized = normalizeRosterId(rosterFilter);
    return normalized ? [normalized] : [];
  }
  return rosterFilter.split(',').map(normalizeRosterId).filter(Boolean);
}

function serializeRosterFilter(rosterIds) {
  return rosterIds.length ? rosterIds.join(',') : null;
}

function getRosterPlayerIds(roster) {
  const ids = new Set();
  for (const field of ROSTER_PLAYER_FIELDS) {
    for (const id of (roster?.[field] ?? [])) ids.add(String(id));
  }
  return ids;
}

function rankPlayersByPosition(players) {
  const rankByPosition = new Map();
  return players.map((player) => {
    const rankPosition = normalizeLeaguePlayerPosition(player.position) ?? player.position ?? 'FLEX';
    const nextRank = (rankByPosition.get(rankPosition) ?? 0) + 1;
    rankByPosition.set(rankPosition, nextRank);
    return { ...player, positionRank: nextRank };
  });
}

function getActionSortOptionsForFilters(selectedFilters, availablePositions) {
  const expandedFilters = getExpandedPositionFilters(selectedFilters, availablePositions);
  if (!expandedFilters.length || expandedFilters.length === availablePositions.filter(pos => pos !== 'ALL').length) return ACTION_SORT_OPTIONS;
  return ACTION_SORT_OPTIONS.filter(option => option.positions.some(position => expandedFilters.includes(position)));
}

function optionHasFantasyValue(option, scoringSettings) {
  const settings = { ...DEFAULT_SCORING, ...scoringSettings };
  if (option.scoringKeys) return option.scoringKeys.some(key => Number(settings?.[key]) !== 0);
  return Number(settings?.[option.scoringKey ?? option.id]) !== 0;
}

function isActionSortAvailableForPlayer(option, position) {
  return !option?.positions || option.positions.includes(position);
}

function getRecordedStatValue(stats, statKey) {
  if (!stats || !Object.prototype.hasOwnProperty.call(stats, statKey)) return null;
  const value = Number(stats[statKey]);
  return Number.isFinite(value) ? value : null;
}

function getActionSortContribution(stats, scoringSettings, position, option) {
  if (!option || !isActionSortAvailableForPlayer(option, position)) return { points: null, raw: null };
  const raw = getRecordedStatValue(stats, option.id);
  if (raw == null) return { points: null, raw: null };
  const multiplier = option.scoringKeys
    ? option.scoringKeys.reduce((sum, key) => {
        if (key === 'bonus_rush_att' && position !== 'RB') return sum;
        return sum + (Number(scoringSettings?.[key]) || 0);
      }, 0)
    : Number(scoringSettings?.[option.scoringKey ?? option.id]) || 0;
  return { points: raw * multiplier, raw };
}

function formatRankingsMetric(value) {
  if (!Number.isFinite(value)) return '—';
  const absValue = Math.abs(value);
  if (absValue >= 100) return value.toFixed(0);
  if (absValue >= 10) return value.toFixed(1);
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function formatRankingsPpgLabel(value) {
  if (!Number.isFinite(value)) return null;
  return `${value.toFixed(1)} PPG`;
}

function getActionDisplayValue(player, sortValueMode, period) {
  const contribution = player.sortContribution ?? {};
  const total = sortValueMode === 'raw' ? contribution.raw : contribution.points;
  if (period === 'avg') {
    return player.sortGames ? total / player.sortGames : null;
  }
  return total;
}

function compareActionSortValues(a, b, option, sortValueMode) {
  const metricKey = sortValueMode === 'raw' ? 'raw' : 'points';
  const aValue = a.sortContribution?.[metricKey];
  const bValue = b.sortContribution?.[metricKey];
  const aMissing = aValue == null || !Number.isFinite(aValue);
  const bMissing = bValue == null || !Number.isFinite(bValue);
  if (aMissing || bMissing) {
    if (aMissing && bMissing) return 0;
    return aMissing ? MISSING_SORT_VALUE : -MISSING_SORT_VALUE;
  }

  if (sortValueMode === 'raw') {
    const rawDiff = bValue - aValue;
    if (rawDiff !== 0) return rawDiff;
    return (b.sortContribution?.points ?? -Infinity) - (a.sortContribution?.points ?? -Infinity);
  }

  const ptsDiff = option?.negative ? aValue - bValue : bValue - aValue;
  if (ptsDiff !== 0) return ptsDiff;
  return (b.sortContribution?.raw ?? -Infinity) - (a.sortContribution?.raw ?? -Infinity);
}

function applySortDirection(comparison, sortDir, { preserveMissingLast = false } = {}) {
  if (preserveMissingLast && Math.abs(comparison) === MISSING_SORT_VALUE) return comparison;
  return sortDir === 'asc' ? -comparison : comparison;
}

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

export default function CompanionRankings({
  positionFilter = 'ALL',
  rosterFilter = null,
  onPositionFilterChange,
  onRosterFilterChange,
  onViewPlayer = null,
}) {
  const {
    players, loadPlayers,
    seasonStats, loadSeasonStats,
    statsLoading,
    activeScoringSettings,
    rosters,
    leagueUsers,
    league,
    myRoster,
    getUserDisplayName,
  } = useSleeperBase();
  const { darkMode } = useTheme();
  const isCompactPhone = useMediaQuery(COMPACT_PHONE_QUERY);
  const useMobilePreviewSheet = useMediaQuery(MOBILE_SHEET_QUERY);
  const hideAvgColumn = useMediaQuery(HIDE_AVG_QUERY);

  const [selectedFilters, setSelectedFilters] = useState([positionFilter]);
  const [search, setSearch] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [sortBy, setSortBy] = useState('season');
  const [sortDir, setSortDir] = useState('desc');
  const [sortValueMode, setSortValueMode] = useState('fantasy');
  const [rankScope, setRankScope] = useState('overall');
  const [selectedRosterIds, setSelectedRosterIds] = useState(() => parseRosterFilter(rosterFilter));
  const [teamMenuOpen, setTeamMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchInputRef = useRef(null);
  const availablePositions = useMemo(
    () => getLeaguePositionFilters(league?.roster_positions),
    [league?.roster_positions],
  );
  const myRosterData = myRoster();
  const sortedRosters = useMemo(() => {
    const myId = myRosterData?.roster_id;
    return [...(rosters ?? [])].sort((a, b) => {
      if (a.roster_id === myId) return -1;
      if (b.roster_id === myId) return 1;
      return getUserDisplayName(a.owner_id).localeCompare(getUserDisplayName(b.owner_id));
    });
  }, [rosters, myRosterData, getUserDisplayName]);
  const rosterFilterOptions = useMemo(() => {
    const userById = new Map((leagueUsers ?? []).map((user) => [user.user_id, user]));
    return sortedRosters.map((roster) => {
      const name = getUserDisplayName(roster.owner_id);
      return {
        id: normalizeRosterId(roster.roster_id),
        name,
        avatarHash: userById.get(roster.owner_id)?.avatar ?? null,
        isMe: roster.roster_id === myRosterData?.roster_id,
      };
    });
  }, [getUserDisplayName, leagueUsers, myRosterData?.roster_id, sortedRosters]);
  const selectedRosterIdSet = useMemo(() => new Set(selectedRosterIds), [selectedRosterIds]);
  const selectedRosterOptions = useMemo(
    () => rosterFilterOptions.filter((roster) => selectedRosterIdSet.has(roster.id)),
    [rosterFilterOptions, selectedRosterIdSet],
  );
  const rosterPlayerIdByRosterId = useMemo(() => {
    const map = new Map();
    for (const roster of (rosters ?? [])) {
      map.set(normalizeRosterId(roster.roster_id), getRosterPlayerIds(roster));
    }
    return map;
  }, [rosters]);
  const selectedRosterPlayerIds = useMemo(() => {
    if (!selectedRosterIds.length) return null;
    const ids = new Set();
    for (const rosterId of selectedRosterIds) {
      for (const playerId of (rosterPlayerIdByRosterId.get(rosterId) ?? [])) ids.add(playerId);
    }
    return ids;
  }, [rosterPlayerIdByRosterId, selectedRosterIds]);
  const filterChips = useMemo(() => buildRankingsFilterChips(availablePositions), [availablePositions]);
  const actionSortOptions = useMemo(
    () => getActionSortOptionsForFilters(selectedFilters, availablePositions)
      .filter(option => optionHasFantasyValue(option, activeScoringSettings)),
    [activeScoringSettings, availablePositions, selectedFilters],
  );
  const selectedSortOption = useMemo(() => getSortOptionById(sortBy), [sortBy]);
  const isActionSort = sortBy !== 'season' && sortBy !== 'avg';

  useEffect(() => {
    setSelectedFilters([isValidLeaguePositionFilter(positionFilter, availablePositions) ? positionFilter : 'ALL']);
  }, [positionFilter, availablePositions]);
  useEffect(() => {
    const nextRosterIds = parseRosterFilter(rosterFilter)
      .filter((rosterId) => rosterPlayerIdByRosterId.has(rosterId));
    setSelectedRosterIds(nextRosterIds);
  }, [rosterFilter, rosterPlayerIdByRosterId]);
  useEffect(() => {
    if (sortBy === 'season' || sortBy === 'avg') return;
    if (actionSortOptions.some(option => option.id === sortBy)) return;
    setSortBy('season');
  }, [actionSortOptions, sortBy]);
  useEffect(() => {
    if (mobileSearchOpen) searchInputRef.current?.focus?.();
  }, [mobileSearchOpen]);

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

  // Full sorted list with true ranks - search and fantasy team filters are NOT applied here so ranks are stable.
  const sortedPlayers = useMemo(() => {
    if (!players || !seasonStats) return [];

    return Object.entries(seasonStats)
      .map(([id, stats]) => {
        const p = players[id];
        if (!p) return null;
        const pos = p.position;
        const sortPosition = normalizeLeaguePlayerPosition(pos) ?? pos;
        if (!positionMatchesLeagueFilter(pos, 'ALL', { stats, availableFilters: availablePositions })) return null;

        const pts = calcPointsFromTotals(stats, activeScoringSettings, p.position);
        if (pts <= 0) return null;

        const sortContribution = getActionSortContribution(stats, activeScoringSettings, sortPosition, selectedSortOption);
        if (sortBy !== 'season' && sortBy !== 'avg' && sortContribution.raw == null) return null;

        return {
          id,
          name: p.full_name || `${p.first_name} ${p.last_name}`,
          position: pos,
          team: p.team || 'FA',
          pts,
          avgPPG: stats?.gp ? pts / stats.gp : null,
          stats,
          sortContribution,
          sortGames: Number(stats?.gp) || null,
          isRostered: rosteredIds.has(id),
          availabilityStatus: getPlayerAvailabilityStatus(p),
          teamTheme: getPlayerRowTeamTheme(p.team || '', darkMode),
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        let comparison = 0;
        if (sortBy === 'avg') {
          comparison = (b.avgPPG ?? -Infinity) - (a.avgPPG ?? -Infinity);
          if (comparison !== 0) return applySortDirection(comparison, sortDir);
        }
        if (sortBy !== 'season') {
          comparison = compareActionSortValues(a, b, selectedSortOption, sortValueMode);
          if (comparison !== 0) return applySortDirection(comparison, sortDir, { preserveMissingLast: true });
        }
        comparison = b.pts - a.pts;
        return applySortDirection(comparison, sortDir);
      })
      .map((player, i) => ({ ...player, overallRank: i + 1 }));
  }, [players, seasonStats, activeScoringSettings, availablePositions, rosteredIds, darkMode, sortBy, selectedSortOption, sortValueMode, sortDir]);

  const allRanked = useMemo(() => rankPlayersByPosition(sortedPlayers), [sortedPlayers]);

  // Apply position, fantasy team, and search filters on top of the ranked list - rank numbers are preserved from above.
  const ranked = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = allRanked.filter(p => {
      if (!selectedFiltersMatchPlayer(p.position, p.stats, selectedFilters, availablePositions)) return false;
      if (selectedRosterPlayerIds && !selectedRosterPlayerIds.has(String(p.id))) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q);
    }).map(player => ({
      ...player,
      rank: rankScope === 'position' ? player.positionRank : player.overallRank,
    }));
    return selectedRosterIds.length || q ? filtered : filtered.slice(0, 100);
  }, [allRanked, availablePositions, rankScope, search, selectedFilters, selectedRosterIds.length, selectedRosterPlayerIds]);

  const nameColPx = useMemo(() => measureMaxNameWidth(ranked), [ranked]);
  const hasLoadedStats = Boolean(seasonStats);
  const hasAnyRankingsData = useMemo(() => {
    if (!players || !seasonStats) return false;

    return Object.entries(seasonStats).some(([id, stats]) => {
      const p = players[id];
      if (!p) return false;
      if (!positionMatchesLeagueFilter(p.position, 'ALL', { stats, availableFilters: availablePositions })) return false;
      return calcPointsFromTotals(stats, activeScoringSettings, p.position) > 0;
    });
  }, [activeScoringSettings, availablePositions, players, seasonStats]);
  const hasRankingsData = sortedPlayers.some((player) => selectedFiltersMatchPlayer(player.position, player.stats, selectedFilters, availablePositions));
  const showRankingsControls = !hasLoadedStats || hasAnyRankingsData || statsLoading;
  const showRankingsTable = hasAnyRankingsData;
  const sortOptions = useMemo(() => [...BASE_SORT_OPTIONS, ...actionSortOptions], [actionSortOptions]);

  return (
    <div className="pb-6">
      {/* Filters */}
      {showRankingsControls && (
        <div className="px-4 pb-3 flex flex-col gap-2">
          {/* Position chips */}
          <CompanionSelectorRail ariaLabel="Rankings position filter">
            {filterChips.map(pos => (
              <CompanionSelectorButton
                key={pos}
                active={isFilterChipActive(pos, selectedFilters)}
                onClick={(event) => {
                  const nextFilters = getNextSelectedFilters(selectedFilters, pos, event);
                  setSelectedFilters(nextFilters);
                  const shouldSyncRoute = !(event.ctrlKey || event.metaKey)
                    && (pos === 'ALL' || isValidLeaguePositionFilter(pos, availablePositions));
                  if (shouldSyncRoute) {
                    onPositionFilterChange?.(getPrimaryRouteFilter(nextFilters, availablePositions));
                  }
                }}
              >
                {getFilterChipLabel(pos)}
              </CompanionSelectorButton>
            ))}
          </CompanionSelectorRail>

          {useMobilePreviewSheet ? (
            <>
              <RankingsMobileSortControls
                value={sortBy}
                options={sortOptions}
                sortValueMode={sortValueMode}
                valueModeDisabled={!isActionSort}
                onSortChange={(nextSort) => {
                  setSortBy(nextSort);
                  setSortDir('desc');
                }}
                onSortValueModeChange={setSortValueMode}
              />
              <RankingsRankScopeToggle value={rankScope} onChange={setRankScope} />
              <div className="flex min-w-0 items-center gap-2">
                {rosterFilterOptions.length > 0 && (
                  <CompanionFantasyTeamMenu
                    open={teamMenuOpen}
                    options={rosterFilterOptions}
                    selectedIds={selectedRosterIds}
                    selectedOptions={selectedRosterOptions}
                    onOpenChange={setTeamMenuOpen}
                    menuLabel="Fantasy team filter"
                    className="flex-1"
                    onChange={(nextRosterIds) => {
                      setSelectedRosterIds(nextRosterIds);
                      onRosterFilterChange?.(serializeRosterFilter(nextRosterIds));
                    }}
                  />
                )}
                <RankingsSearchIconButton
                  active={mobileSearchOpen || Boolean(search.trim())}
                  onClick={() => setMobileSearchOpen(current => !current)}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <RankingsRankScopeToggle value={rankScope} onChange={setRankScope} />
              {rosterFilterOptions.length > 0 && (
                <CompanionFantasyTeamMenu
                  open={teamMenuOpen}
                  options={rosterFilterOptions}
                  selectedIds={selectedRosterIds}
                  selectedOptions={selectedRosterOptions}
                  onOpenChange={setTeamMenuOpen}
                  menuLabel="Fantasy team filter"
                  onChange={(nextRosterIds) => {
                    setSelectedRosterIds(nextRosterIds);
                    onRosterFilterChange?.(serializeRosterFilter(nextRosterIds));
                  }}
                />
              )}
            </div>
          )}

          {/* Search */}
          {(!useMobilePreviewSheet || mobileSearchOpen || search.trim()) && (
            <CompanionSearchField
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search players..."
              inputProps={{ ref: searchInputRef }}
            />
          )}

          {!useMobilePreviewSheet && (
            <div className="flex flex-col items-stretch gap-2 min-[481px]:flex-row">
              <RankingsSortSelect
                value={sortBy}
                options={sortOptions}
                onChange={(nextSort) => {
                  setSortBy(nextSort);
                  setSortDir('desc');
                }}
              />
              <RankingsSortValueToggle
                value={sortValueMode}
                disabled={!isActionSort}
                onChange={setSortValueMode}
              />
            </div>
          )}
        </div>
      )}

      {/* Stats loading */}
      {statsLoading && <RankingsStatsLoadingBanner />}

      {/* Column headers */}
      {showRankingsTable && (
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
              label="Avg PPG"
              active={sortBy === 'avg'}
              direction={sortDir}
              onClick={() => {
                if (sortBy === 'avg') {
                  setSortDir(current => current === 'desc' ? 'asc' : 'desc');
                } else {
                  setSortBy('avg');
                  setSortDir('desc');
                }
              }}
            />
          )}
          <SortHeader
            label="Season"
            active={sortBy !== 'avg'}
            direction={sortDir}
            onClick={() => {
              if (sortBy === 'avg') {
                setSortBy('season');
                setSortDir('desc');
              } else {
                setSortDir(current => current === 'desc' ? 'asc' : 'desc');
              }
            }}
          />
          <div />
        </div>
      )}

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
          activeSortOption={selectedSortOption}
          sortValueMode={sortValueMode}
          hideAvgColumn={hideAvgColumn}
          isCompactPhone={isCompactPhone}
          nameColPx={nameColPx}
          onSelect={() => {
            if (useMobilePreviewSheet) setSelectedPlayerId(player.id);
            else onViewPlayer?.(player.id);
          }}
        />
      ))}

      {ranked.length === 0 && hasLoadedStats && (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <span className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
            {!hasAnyRankingsData
              ? 'Rankings will appear once season stats are available.'
              : hasRankingsData
                ? 'No matching players.'
                : 'No rankings for this position yet.'}
          </span>
          {!hasAnyRankingsData && (
            <span className="mt-1 max-w-md text-xs leading-5" style={{ color: 'var(--color-label-secondary)' }}>
              Pre-season leagues may not have any player results yet, so there is nothing to rank right now.
            </span>
          )}
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

function RankingsSearchIconButton({ active, onClick }) {
  return (
    <button
      type="button"
      aria-label="Search players"
      aria-pressed={active}
      onClick={onClick}
      className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl transition-colors active:opacity-70 lg:hidden"
      style={{
        background: active ? 'var(--color-signature)' : 'var(--color-fill)',
        border: '1px solid var(--color-separator)',
        color: active ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
      }}
    >
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    </button>
  );
}

function RankingsMobileSortControls({
  value,
  options,
  sortValueMode,
  valueModeDisabled,
  onSortChange,
  onSortValueModeChange,
}) {
  const valueModeOptions = [
    { id: 'fantasy', label: 'Fantasy Value' },
    { id: 'raw', label: 'Game Stats' },
  ];

  return (
    <>
      <CompanionSelectorRail ariaLabel="Rankings sort options" wrapOnDesktop={false}>
        {options.map(option => (
          <CompanionSelectorButton
            key={option.id}
            active={option.id === value}
            onClick={() => onSortChange(option.id)}
          >
            {option.shortLabel ?? (option.id === 'season' ? 'Season' : option.label)}
          </CompanionSelectorButton>
        ))}
      </CompanionSelectorRail>

      <CompanionSelectorRail ariaLabel="Rankings sort value mode" wrapOnDesktop={false}>
        {valueModeOptions.map(option => (
          <CompanionSelectorButton
            key={option.id}
            active={!valueModeDisabled && option.id === sortValueMode}
            disabled={valueModeDisabled}
            onClick={() => {
              if (!valueModeDisabled) onSortValueModeChange(option.id);
            }}
          >
            {option.label}
          </CompanionSelectorButton>
        ))}
      </CompanionSelectorRail>
    </>
  );
}

function RankingsSortSelect({ value, options, onChange }) {
  const activeLabel = options.find(option => option.id === value)?.label ?? 'Season Points';
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2"
      style={{
        background: 'var(--color-fill)',
        border: '1px solid var(--color-separator)',
      }}
    >
      <span
        className="shrink-0 text-xs font-semibold uppercase tracking-widest"
        style={{ color: 'var(--color-label-tertiary)' }}
      >
        Sort
      </span>
      <div className="relative min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setOpen(current => !current)}
          aria-label={`Sort rankings by ${activeLabel}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="w-full truncate rounded-lg bg-transparent py-1.5 pl-2 pr-8 text-left font-semibold outline-none"
          style={{
            color: 'var(--color-label)',
            border: '1px solid transparent',
            fontSize: 16,
          }}
        >
          {activeLabel}
        </button>
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-1/2 h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: 'var(--color-label-tertiary)', transform: 'translateY(-50%)' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close sort menu"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
            tabIndex={-1}
          />
          <div
            role="listbox"
            aria-label="Rankings sort options"
            className="absolute left-3 right-3 top-[calc(100%+6px)] z-30 max-h-72 overflow-y-auto rounded-xl py-1 shadow-xl"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-separator)',
              boxShadow: '0 18px 40px color-mix(in srgb, var(--color-label) 18%, transparent)',
            }}
          >
            {options.map(option => {
              const active = option.id === value;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className="block w-full px-3 py-2 text-left text-sm font-semibold transition-colors"
                  style={{
                    background: active ? 'var(--color-fill-secondary)' : 'transparent',
                    color: active ? 'var(--color-label)' : 'var(--color-label-secondary)',
                    fontSize: 16,
                  }}
                  onClick={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function RankingsRankScopeToggle({ value, onChange }) {
  return (
    <div
      className="flex shrink-0 items-center gap-1"
      role="group"
      aria-label="Choose ranking scope"
    >
      {RANK_SCOPE_OPTIONS.map(option => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={active}
            className="companion-selector-button companion-selector-button--sm companion-selector-button--option min-w-[76px] justify-center"
            style={{
              background: active ? 'var(--color-signature)' : undefined,
              color: active ? 'var(--color-signature-fg)' : undefined,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function RankingsSortValueToggle({ value, disabled = false, onChange }) {
  const options = [
    { id: 'fantasy', label: 'Fantasy Value' },
    { id: 'raw', label: 'Game Stats' },
  ];

  return (
    <div
      className="grid min-w-0 flex-1 grid-cols-2 rounded-xl p-1 min-[481px]:w-[clamp(260px,34vw,360px)] min-[481px]:flex-none"
      role="group"
      aria-label="Choose stat sort value"
      style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-separator)',
      }}
    >
      {options.map(option => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              if (!disabled) onChange(option.id);
            }}
            aria-pressed={active}
            disabled={disabled}
            className="min-w-0 truncate px-2 py-2 text-xs font-bold transition-colors"
            style={{
              background: !disabled && active ? 'var(--color-signature)' : 'transparent',
              color: disabled
                ? 'var(--color-label-quaternary)'
                : active
                  ? 'var(--color-signature-fg)'
                  : 'var(--color-label-secondary)',
              borderRadius: 6,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SortHeader({ label, active, direction = 'desc', onClick }) {
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
        {direction === 'asc' ? '↑' : '↓'}
      </span>
    </button>
  );
}

function RankRow({ rank, player, activeSortOption, sortValueMode, onSelect, hideAvgColumn, isCompactPhone, nameColPx }) {
  const { darkMode } = useTheme();
  const isActionSort = activeSortOption?.id !== 'season';
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
        <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-label)' }}>
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
            <PlayerStatusBadge status={player.availabilityStatus} compact />
          )}
        </div>,
        !hideAvgColumn && (
          <CompanionPlayerMetric
            key="avg"
            value={isActionSort ? formatRankingsMetric(getActionDisplayValue(player, sortValueMode, 'avg')) : (player.avgPPG != null ? player.avgPPG.toFixed(1) : '—')}
            align="center"
          />
        ),
        <CompanionPlayerMetric
          key="season"
          value={isActionSort ? formatRankingsMetric(getActionDisplayValue(player, sortValueMode, 'season')) : player.pts.toFixed(1)}
          label={hideAvgColumn && !isActionSort ? formatRankingsPpgLabel(player.avgPPG) : null}
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
