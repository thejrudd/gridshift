import { useEffect, useMemo, useRef, useState } from 'react';
import { useSleeperBase, useSleeperStatsProgress } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { createPointsCalculator } from '../../utils/scoringEngine';
import { projectPlayer, buildDefenseTable, getDefenseStrength, getLeagueAvgPPG } from '../../utils/projectionEngine';
import { STADIUMS } from '../../data/stadiums';
import useMediaQuery from '../../hooks/useMediaQuery.js';
import {
  getLeaguePositionFilters,
  getPositionFilterLabel,
  isValidLeaguePositionFilter,
  normalizeLeaguePlayerPosition,
  positionMatchesLeagueFilter,
} from '../../utils/leaguePositions';
import { getPlayerRowTeamTheme } from '../../utils/playerRowTheme';
import { isWaiverEligiblePlayerRecord } from '../../utils/playerEligibility';
import { debugCompanionLog, debugCompanionMeasure } from '../../utils/companionPerfDebug';
import CompanionLoadingState from './CompanionLoadingState';
import CompanionPlayerPreviewSheet from './CompanionPlayerPreviewSheet';
import PlayerStatusBadge from './PlayerStatusBadge.jsx';
import { getPlayerAvailabilityStatus } from '../../utils/playerAvailabilityStatus.js';
import { CompanionSearchField, CompanionSelectorButton, CompanionSelectorRail } from './CompanionSelectorControls.jsx';
import CompanionPlayerRow, { CompanionPlayerMetric, CompanionPlayerStatus } from './CompanionPlayerRow.jsx';

const PROJECTION_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB']);
const COMPACT_PHONE_QUERY = '(max-width: 480px)';
const MOBILE_SHEET_QUERY = '(max-width: 1023px)';
const WAIVER_ROW_SIDE_PADDING = 10;
const WAIVER_ROW_LEFT_BORDER = 4;

function getWaiverLayout(isCompactPhone) {
  if (isCompactPhone) {
    return {
      avatarSize: 38,
      gap: 4,
      headerInset: 14,
      hotWidth: 16,
      metaFontSize: 11,
      nameFontSize: 13,
      showSeason: false,
      sidePadding: 10,
      tableTemplate: '38px minmax(0, 1fr) 50px 54px',
      verticalPadding: 11,
    };
  }

  const metricWidth = 58;
  return {
    avatarSize: 44,
    gap: 5,
    headerInset: WAIVER_ROW_SIDE_PADDING + WAIVER_ROW_LEFT_BORDER,
    hotWidth: 54,
    metaFontSize: 12,
    nameFontSize: 14,
    showSeason: true,
    sidePadding: 10,
    tableTemplate: `44px minmax(0, 1fr) repeat(3, ${metricWidth}px)`,
    verticalPadding: 10,
  };
}

function getTrendState(recentAvg, seasonAvg) {
  if (!(recentAvg > 0 && seasonAvg > 0)) return 'neutral';
  if (recentAvg >= seasonAvg * 1.25 && (recentAvg - seasonAvg) >= 2) return 'hot';
  if (recentAvg <= seasonAvg * 0.75 && (seasonAvg - recentAvg) >= 2) return 'cold';
  return 'neutral';
}

function getRecentAverageFast(weekly, calcFantasyPoints, position, count = 4) {
  if (!weekly?.length) return 0;

  const recent = [];
  for (const weekStats of weekly) {
    const week = Number(weekStats?.week);
    if (!Number.isFinite(week)) continue;

    const entry = { week, stats: weekStats };
    let insertAt = recent.length;
    while (insertAt > 0 && recent[insertAt - 1].week < week) insertAt -= 1;
    recent.splice(insertAt, 0, entry);
    if (recent.length > count) recent.pop();
  }

  if (!recent.length) return 0;
  let total = 0;
  for (const entry of recent) {
    total += calcFantasyPoints(entry.stats, position);
  }
  return Math.round((total / recent.length) * 10) / 10;
}

function getSeasonAverage(weekly, calcFantasyPoints, position) {
  if (!weekly?.length) return 0;
  let total = 0;
  let count = 0;
  for (const weekStats of weekly) {
    const points = calcFantasyPoints(weekStats, position);
    if (points <= 0) continue;
    total += points;
    count += 1;
  }
  return count > 0 ? total / count : 0;
}

function getWaiverScheduleContext(player, week, scheduleMap) {
  const team = player.team?.toUpperCase();
  const matchup = scheduleMap?.[week]?.[team];
  const oppTeam = matchup?.opp ?? null;
  const isHome = matchup?.home ?? null;
  const venueTeam = isHome === true ? team : isHome === false ? oppTeam : null;
  const isIndoor = venueTeam ? (STADIUMS[venueTeam]?.indoor ?? false) : false;

  return {
    oppTeam,
    isHome,
    isIndoor,
  };
}

function getWaiverScheduleWeekKey(scheduleMap, week) {
  const weekMap = scheduleMap?.[week];
  if (!weekMap) return '';
  return JSON.stringify(weekMap);
}

function getVisibleRowsCacheKey({
  filteredCandidates,
  week,
  scheduleWeekKey,
  activeScoringSettings,
  darkMode,
}) {
  return [
    filteredCandidates.slice(0, 100).map(player => player.id).join(','),
    week,
    scheduleWeekKey,
    JSON.stringify(activeScoringSettings ?? {}),
    darkMode ? 'dark' : 'light',
  ].join('|');
}

export default function CompanionWaiver({
  onViewPlayer,
  initialPositionRequest,
  onConsumeInitialPositionRequest,
  positionFilter = 'ALL',
  onPositionFilterChange,
}) {
  const {
    players, loadPlayers,
    selectedLeagueId,
    season,
    rosters,
    league,
    seasonStats, loadSeasonStats,
    weeklyStats,
    scheduleMap,
    espnIdOverrides,
    statsLoading,
    activeScoringSettings,
    myRoster,
  } = useSleeperBase();
  const { darkMode } = useTheme();
  const isCompactPhone = useMediaQuery(COMPACT_PHONE_QUERY);
  const useMobilePreviewSheet = useMediaQuery(MOBILE_SHEET_QUERY);
  const layout = useMemo(() => getWaiverLayout(isCompactPhone), [isCompactPhone]);
  const calcFantasyPoints = useMemo(() => createPointsCalculator(activeScoringSettings), [activeScoringSettings]);

  const [posFilter, setPosFilter] = useState(positionFilter);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const debounceRef = useRef(null);
  const rankedCandidatesCacheRef = useRef({ key: '', value: [] });
  const visibleRowsCacheRef = useRef({ key: '', value: [] });
  const requestedPosition = initialPositionRequest?.position;
  const availablePositions = useMemo(
    () => getLeaguePositionFilters(league?.roster_positions),
    [league?.roster_positions],
  );
  const activePosFilter = requestedPosition && isValidLeaguePositionFilter(requestedPosition, availablePositions)
    ? requestedPosition
    : posFilter;
  const playerCount = players ? Object.keys(players).length : 0;
  const seasonStatCount = seasonStats ? Object.keys(seasonStats).length : 0;
  const weeklyStatCount = weeklyStats ? Object.keys(weeklyStats).length : 0;

  useEffect(() => {
    debugCompanionLog('Waiver mounted', {
      selectedLeagueId,
      season,
      positionFilter,
      availablePositions,
    });
    return () => debugCompanionLog('Waiver unmounted');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    debugCompanionLog('Waiver readiness', {
      selectedLeagueId,
      season,
      sortBy,
      activePosFilter,
      statsLoading,
      hasPlayers: playerCount > 0,
      hasSeasonStats: Boolean(seasonStats),
      hasWeeklyStats: Boolean(weeklyStats),
      rosterCount: rosters.length,
      availablePositions,
    });
  }, [selectedLeagueId, season, sortBy, activePosFilter, statsLoading, playerCount, seasonStatCount, weeklyStatCount, rosters.length, availablePositions]);

  useEffect(() => {
    if (requestedPosition && isValidLeaguePositionFilter(requestedPosition, availablePositions)) return;
    setPosFilter(isValidLeaguePositionFilter(positionFilter, availablePositions) ? positionFilter : 'ALL');
  }, [positionFilter, requestedPosition, availablePositions]);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);
  useEffect(() => {
    if (!seasonStats && !statsLoading) {
      debugCompanionLog('Waiver season stats requested');
      loadSeasonStats();
    }
  }, [seasonStats, statsLoading, loadSeasonStats]);

  useEffect(() => {
    if (isCompactPhone && sortBy === 'season') {
      setSortBy('recent');
    }
  }, [isCompactPhone, sortBy]);

  const rosteredIds = useMemo(() => {
    const ids = new Set();
    for (const r of rosters) {
      for (const id of (r.players || [])) ids.add(id);
      for (const id of (r.reserve || [])) ids.add(id);
    }
    return ids;
  }, [rosters]);

  const myRosterData = useMemo(() => myRoster(), [myRoster]);
  const myPlayerIds = useMemo(() => {
    if (!myRosterData) return new Set();
    return new Set([...(myRosterData.players || []), ...(myRosterData.reserve || [])]);
  }, [myRosterData]);
  void myPlayerIds;

  const week = useMemo(() => {
    const playoffStart = league?.settings?.playoff_week_start ?? 18;
    const lastScored = league?.settings?.last_scored_leg;
    if (lastScored) return Math.min(lastScored + 1, playoffStart - 1);
    return Math.max(1, playoffStart - 1);
  }, [league]);
  const scheduleWeekKey = useMemo(
    () => getWaiverScheduleWeekKey(scheduleMap, week),
    [scheduleMap, week],
  );

  const shouldProjectWaivers = sortBy === 'projected';
  const rankedCandidatesCacheKey = useMemo(() => {
    return [
      selectedLeagueId,
      season,
      seasonStatCount,
      playerCount,
      weeklyStatCount,
      rosteredIds.size,
      availablePositions.join(','),
      JSON.stringify(activeScoringSettings ?? {}),
    ].join('|');
  }, [selectedLeagueId, season, seasonStatCount, playerCount, weeklyStatCount, rosteredIds.size, availablePositions, activeScoringSettings]);

  const rankedCandidates = useMemo(() => {
    if (!players || !seasonStats) return [];
    if (rankedCandidatesCacheRef.current.key === rankedCandidatesCacheKey) {
      debugCompanionLog('Waiver rankable free agents cache hit', {
        rankedCount: rankedCandidatesCacheRef.current.value.length,
      });
      return rankedCandidatesCacheRef.current.value;
    }

    const nextCandidates = debugCompanionMeasure('Waiver rankable free agents', () => Object.entries(seasonStats)
      .map(([id, stats]) => {
        if (rosteredIds.has(id)) return null;
        const p = players[id];
        if (!p) return null;
        if (!isWaiverEligiblePlayerRecord(p)) return null;
        const pos = p.position;
        if (!positionMatchesLeagueFilter(pos, 'ALL', { stats, availableFilters: availablePositions })) return null;

        const pts = calcFantasyPoints(stats, pos);
        if (pts <= 0) return null;

        const weekly = weeklyStats?.[id] ?? [];
        const recentAvg = getRecentAverageFast(weekly, calcFantasyPoints, pos);
        const projectionPosition = normalizeLeaguePlayerPosition(pos);
        const espnId = p.espn_id ?? espnIdOverrides?.[id] ?? null;

        return {
          id,
          name: p.full_name || `${p.first_name} ${p.last_name}`,
          position: pos,
          team: p.team || 'FA',
          pts,
          recentAvg,
          projected: null,
          projectionPosition,
          weekly,
          availabilityStatus: getPlayerAvailabilityStatus(p),
          espnId,
          yearsExp: p.years_exp,
        };
      })
      .filter(Boolean), {
        seasonStatCount: Object.keys(seasonStats).length,
        playerDirectoryCount: playerCount,
        rosteredCount: rosteredIds.size,
        availablePositions,
      });
    rankedCandidatesCacheRef.current = {
      key: rankedCandidatesCacheKey,
      value: nextCandidates,
    };
    return nextCandidates;
  }, [players, seasonStats, weeklyStats, calcFantasyPoints, rosteredIds, espnIdOverrides, availablePositions, rankedCandidatesCacheKey]);

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return debugCompanionMeasure('Waiver filter/sort candidates', () => rankedCandidates
      .filter(player => positionMatchesLeagueFilter(player.position, activePosFilter, {
        stats: seasonStats?.[player.id],
        availableFilters: availablePositions,
      }))
      .filter(player => !q || player.name.toLowerCase().includes(q) || player.team.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sortBy === 'season') return b.pts - a.pts || b.recentAvg - a.recentAvg;
        return b.recentAvg - a.recentAvg || b.pts - a.pts;
      })
      .slice(0, shouldProjectWaivers ? 250 : 100), {
        rankedCount: rankedCandidates.length,
        activePosFilter,
        searchLength: q.length,
        sortBy,
        shouldProjectWaivers,
      });
  }, [rankedCandidates, activePosFilter, search, sortBy, seasonStats, availablePositions, shouldProjectWaivers]);

  const defenseTable = useMemo(() => {
    if (!shouldProjectWaivers || !weeklyStats || !players) return null;
    return debugCompanionMeasure('Waiver projection defense table', () => (
      buildDefenseTable(weeklyStats, players, scheduleMap, activeScoringSettings)
    ), {
      playerCount: Object.keys(players).length,
      weeklyStatCount: Object.keys(weeklyStats).length,
    });
  }, [shouldProjectWaivers, weeklyStats, players, scheduleMap, activeScoringSettings]);

  const leagueAvgByPos = useMemo(() => {
    if (!shouldProjectWaivers || !weeklyStats || !players) return {};
    return debugCompanionMeasure('Waiver projection league averages', () => {
      const result = {};
      for (const pos of availablePositions) {
        if (pos === 'ALL' || !PROJECTION_POSITIONS.has(pos)) continue;
        result[pos] = getLeagueAvgPPG(pos, weeklyStats, players, activeScoringSettings, week);
      }
      return result;
    }, { availablePositions, week });
  }, [shouldProjectWaivers, weeklyStats, players, activeScoringSettings, week, availablePositions]);

  const available = useMemo(() => {
    if (!shouldProjectWaivers || !defenseTable) {
      const visibleRowsCacheKey = getVisibleRowsCacheKey({
        filteredCandidates,
        week,
        scheduleWeekKey,
        activeScoringSettings,
        darkMode,
      });
      if (visibleRowsCacheRef.current.key === visibleRowsCacheKey) {
        debugCompanionLog('Waiver visible row decoration cache hit', {
          visibleCount: visibleRowsCacheRef.current.value.length,
          week,
        });
        return visibleRowsCacheRef.current.value;
      }

      const nextRows = debugCompanionMeasure('Waiver visible row decoration', () => filteredCandidates
        .slice(0, 100)
        .map(player => {
          const scheduleContext = getWaiverScheduleContext(player, week, scheduleMap);
          const seasonAvg = getSeasonAverage(player.weekly, calcFantasyPoints, player.position);
          return {
            ...player,
            ...scheduleContext,
            seasonAvg,
            trendState: getTrendState(player.recentAvg, seasonAvg),
            teamTheme: getPlayerRowTeamTheme(player.team || '', darkMode),
          };
        }), {
          visibleCount: Math.min(filteredCandidates.length, 100),
          week,
        });
      visibleRowsCacheRef.current = {
        key: visibleRowsCacheKey,
        value: nextRows,
      };
      return nextRows;
    }

    return debugCompanionMeasure('Waiver projected candidates', () => filteredCandidates
      .map(player => {
        const { projectionPosition } = player;
        const scheduleContext = getWaiverScheduleContext(player, week, scheduleMap);
        if (!projectionPosition || !PROJECTION_POSITIONS.has(projectionPosition) || player.weekly.length < 2) {
          return {
            ...player,
            ...scheduleContext,
          };
        }

        const defStrength = scheduleContext.oppTeam
          ? getDefenseStrength(defenseTable, scheduleContext.oppTeam, projectionPosition, week)
          : null;
        const projection = projectPlayer({
          weeklyArr: player.weekly,
          pos: projectionPosition,
          oppTeam: scheduleContext.oppTeam,
          isHome: scheduleContext.isHome,
          isIndoor: scheduleContext.isIndoor,
          weather: null,
          allWeeklyStats: null,
          players: null,
          activeScoringSettings,
          scheduleMap,
          week,
          defStrength,
          leagueAvg: leagueAvgByPos[projectionPosition] ?? 0,
          skipOpponentLookup: true,
        });

        return {
          ...player,
          ...scheduleContext,
          projected: projection?.projected ?? null,
        };
      })
      .sort((a, b) => {
        const ap = a.projected ?? -1;
        const bp = b.projected ?? -1;
        return bp - ap || b.recentAvg - a.recentAvg;
      })
      .slice(0, 100)
      .map(player => {
        const seasonAvg = getSeasonAverage(player.weekly, calcFantasyPoints, player.position);
        return {
          ...player,
          seasonAvg,
          trendState: getTrendState(player.recentAvg, seasonAvg),
          teamTheme: getPlayerRowTeamTheme(player.team || '', darkMode),
        };
      }), {
        candidateCount: filteredCandidates.length,
        week,
      });
  }, [shouldProjectWaivers, filteredCandidates, defenseTable, week, scheduleWeekKey, activeScoringSettings, scheduleMap, leagueAvgByPos, darkMode, calcFantasyPoints]);

  const showWaiverPreparing = available.length === 0 && (
    statsLoading
    || playerCount === 0
    || !seasonStats
  );
  const showWaiverEmpty = available.length === 0 && !showWaiverPreparing && Boolean(seasonStats);

  return (
    <div className="pb-6">
      <div className="px-4 pb-3 flex flex-col gap-2">
        <CompanionSelectorRail ariaLabel="Waiver position filter">
          {availablePositions.map(pos => (
            <CompanionSelectorButton
              key={pos}
              active={activePosFilter === pos}
              onClick={() => {
                onConsumeInitialPositionRequest?.();
                setPosFilter(pos);
                onPositionFilterChange?.(pos);
              }}
            >
              {getPositionFilterLabel(pos)}
            </CompanionSelectorButton>
          ))}
        </CompanionSelectorRail>
        <CompanionSearchField
          value={searchInput}
          onChange={e => {
              setSearchInput(e.target.value);
              clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => setSearch(e.target.value), 200);
            }}
          placeholder="Search players..."
        />
      </div>

      {statsLoading && <WaiverStatsLoadingBanner />}

      <div className="px-4">
        <div
          className="grid items-center pb-2 mb-1"
          style={{
            borderBottom: '1px solid var(--color-separator)',
            gridTemplateColumns: layout.tableTemplate,
            columnGap: layout.gap,
            paddingLeft: layout.headerInset,
            paddingRight: layout.sidePadding,
          }}
        >
          <div />
          <span className="min-w-0 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-label-tertiary)' }}>Player</span>
          <ColHeader label="Proj" active={sortBy === 'projected'} onClick={() => setSortBy(value => value === 'projected' ? 'recent' : 'projected')} />
          {layout.showSeason && <ColHeader label="Season" active={sortBy === 'season'} onClick={() => setSortBy(value => value === 'season' ? 'recent' : 'season')} />}
          <ColHeader label="4-Wk Avg" active={sortBy === 'recent'} onClick={() => setSortBy('recent')} />
        </div>
      </div>

      {showWaiverPreparing && (
        <CompanionLoadingState
          title="Preparing waiver options..."
          description="Loading league stats and active player records."
        />
      )}

      {available.map(player => (
        <ResponsiveWaiverRow
          key={player.id}
          player={player}
          onSelect={() => {
            if (useMobilePreviewSheet) {
              setSelectedPlayerId(player.id);
              return;
            }
            if (!player.espnId) return;
            onViewPlayer?.(String(player.espnId), {
              displayName: player.name,
              teamId: player.team,
              position: player.position,
              experience: player.yearsExp != null ? player.yearsExp + 1 : undefined,
            });
          }}
          sortBy={sortBy}
          layout={layout}
          isCompactPhone={isCompactPhone}
        />
      ))}

      {showWaiverEmpty && (
        <div className="flex items-center justify-center py-16 px-6 text-center">
          <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>
            {rosteredIds.size === 0
              ? 'Connect a league to see available players.'
              : 'No available players found.'}
          </span>
        </div>
      )}

      {selectedPlayerId && (
        <CompanionPlayerPreviewSheet
          playerId={selectedPlayerId}
          onClose={() => setSelectedPlayerId(null)}
          onViewStats={onViewPlayer ? (playerId) => {
            const player = available.find((candidate) => candidate.id === playerId);
            if (!player?.espnId) return;
            onViewPlayer(String(player.espnId), {
              displayName: player.name,
              teamId: player.team,
              position: player.position,
              experience: player.yearsExp != null ? player.yearsExp + 1 : undefined,
            });
          } : null}
        />
      )}
    </div>
  );
}
function ColHeader({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="min-w-0 w-full grid items-center relative"
      style={{ color: active ? 'var(--color-label)' : 'var(--color-label-tertiary)' }}
    >
      <span className="w-full text-xs font-semibold uppercase tracking-widest text-center">
        {label}
      </span>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '9px',
          visibility: active ? 'visible' : 'hidden',
        }}
      >
        ↓
      </span>
    </button>
  );
}

function WaiverStatsLoadingBanner() {
  const statsProgress = useSleeperStatsProgress();

  return (
    <div className="mx-4 mb-3 px-4 py-2.5 rounded-xl flex items-center gap-3" style={{ background: 'var(--color-fill)' }}>
      <div className="h-1 flex-1 rounded-full overflow-hidden" style={{ background: 'var(--color-fill-secondary)' }}>
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${statsProgress}%`, background: 'var(--color-signature)' }} />
      </div>
      <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--color-label-tertiary)' }}>{statsProgress}%</span>
    </div>
  );
}

function ResponsiveWaiverRow({ player, onSelect, sortBy, layout, isCompactPhone }) {
  const { darkMode } = useTheme();
  const canNav = !!onSelect;
  const trendLabel = player.trendState === 'hot'
    ? (isCompactPhone ? '↑' : '↑ HOT')
    : player.trendState === 'cold'
      ? (isCompactPhone ? '↓' : '↓ COLD')
      : '';
  const projectedColor = player.projected != null
    ? (sortBy === 'projected' ? 'var(--color-label)' : 'var(--color-label-secondary)')
    : 'var(--color-label-quaternary)';
  const seasonColor = sortBy === 'season' ? 'var(--color-label)' : 'var(--color-label-secondary)';
  const recentColor = sortBy === 'recent' ? 'var(--color-label)' : 'var(--color-label-secondary)';
  const statusColumnTemplate = isCompactPhone
    ? (trendLabel || player.availabilityStatus ? '22px ' : '')
    : '150px ';
  const columnGridTemplate = layout.showSeason
    ? `${statusColumnTemplate}repeat(3, minmax(0, 58px))`
    : `${statusColumnTemplate}50px 54px`;
  const rowGridTemplate = isCompactPhone
    ? `${layout.avatarSize}px minmax(0, 1fr) auto`
    : `${layout.avatarSize}px minmax(12rem, 1fr) 44px auto`;
  const metaSegments = [
    player.position,
    player.team,
    player.oppTeam ? `vs ${player.oppTeam}` : null,
  ].filter(Boolean);
  const metricValue = (value, color) => (
    <span style={{ color }}>
      {value}
    </span>
  );

  return (
    <div className="px-4">
      <CompanionPlayerRow
        player={player}
        darkMode={darkMode}
        compact={isCompactPhone}
        showPosition={false}
        showTeamLogo={!isCompactPhone}
        interactive={canNav}
        onClick={canNav ? onSelect : undefined}
        metaSegments={metaSegments}
        gridTemplate={rowGridTemplate}
        columnGridTemplate={columnGridTemplate}
        columns={[
          (!isCompactPhone || trendLabel || player.availabilityStatus) ? (
            <div key="status" className="min-w-0 flex items-center justify-start gap-2 self-center">
              {trendLabel ? (
                <CompanionPlayerStatus
                  tone={player.trendState === 'hot' ? 'positive' : player.trendState === 'cold' ? 'negative' : 'neutral'}
                  className="text-center"
                  localContrast
                  title={trendLabel}
                >
                  {trendLabel}
                </CompanionPlayerStatus>
              ) : null}
              {player.availabilityStatus ? (
                <PlayerStatusBadge status={player.availabilityStatus} compact={isCompactPhone} />
              ) : null}
            </div>
          ) : null,
          <CompanionPlayerMetric
            key="projected"
            compact
            align="center"
            value={metricValue(player.projected != null ? player.projected.toFixed(1) : '-', projectedColor)}
          />,
          layout.showSeason ? (
            <CompanionPlayerMetric
              key="season"
              compact
              align="center"
              value={metricValue(player.pts.toFixed(1), seasonColor)}
            />
          ) : null,
          <CompanionPlayerMetric
            key="recent"
            compact
            align="center"
            value={metricValue(player.recentAvg > 0 ? player.recentAvg.toFixed(1) : '-', recentColor)}
          />,
        ].filter(Boolean)}
        style={{
          columnGap: layout.gap,
          borderRadius: 0,
          padding: `${layout.verticalPadding}px ${layout.sidePadding}px`,
          borderLeftWidth: WAIVER_ROW_LEFT_BORDER,
        }}
      />
    </div>
  );
}
