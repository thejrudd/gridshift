import { useEffect, useMemo, useRef, useState } from 'react';
import { useSleeperBase, useSleeperStatsProgress } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { createPointsCalculator } from '../../utils/scoringEngine';
import { projectPlayer, buildDefenseTable, getDefenseStrength, getLeagueAvgPPG } from '../../utils/projectionEngine';
import { STADIUMS } from '../../data/stadiums';
import useCardGlow from '../../hooks/useCardGlow.jsx';
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

const PROJECTION_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB']);
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

function getWaiverInjuryLabel(status, compact) {
  if (!compact || !status) return status;

  const LABELS = {
    'Questionable': 'Q',
    'Probable': 'P',
    'Doubtful': 'D',
    'Out': 'OUT',
    'Injured Reserve': 'IR',
    'Physically Unable to Perform': 'PUP',
  };

  return LABELS[status] ?? status.slice(0, 3).toUpperCase();
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
  scoringSettings,
  darkMode,
}) {
  return [
    filteredCandidates.slice(0, 100).map(player => player.id).join(','),
    week,
    scheduleWeekKey,
    JSON.stringify(scoringSettings ?? {}),
    darkMode ? 'dark' : 'light',
  ].join('|');
}

function getSharedNameColumnWidth(players) {
  if (typeof document === 'undefined' || !players.length) return 0;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return 0;

  context.font = '600 14px Figtree, sans-serif';
  const measured = Math.ceil(players.reduce((max, player) => (
    Math.max(max, context.measureText(player.name ?? '').width)
  ), 0)) + 6;
  return Math.min(measured, 168);
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
    scoringSettings,
    myRoster,
  } = useSleeperBase();
  const { darkMode } = useTheme();
  const isCompactPhone = useMediaQuery(COMPACT_PHONE_QUERY);
  const layout = useMemo(() => getWaiverLayout(isCompactPhone), [isCompactPhone]);
  const calcFantasyPoints = useMemo(() => createPointsCalculator(scoringSettings), [scoringSettings]);

  const [posFilter, setPosFilter] = useState(positionFilter);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('recent');
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
      JSON.stringify(scoringSettings ?? {}),
    ].join('|');
  }, [selectedLeagueId, season, seasonStatCount, playerCount, weeklyStatCount, rosteredIds.size, availablePositions, scoringSettings]);

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
          injuryStatus: p.injury_status,
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
      buildDefenseTable(weeklyStats, players, scheduleMap, scoringSettings)
    ), {
      playerCount: Object.keys(players).length,
      weeklyStatCount: Object.keys(weeklyStats).length,
    });
  }, [shouldProjectWaivers, weeklyStats, players, scheduleMap, scoringSettings]);

  const leagueAvgByPos = useMemo(() => {
    if (!shouldProjectWaivers || !weeklyStats || !players) return {};
    return debugCompanionMeasure('Waiver projection league averages', () => {
      const result = {};
      for (const pos of availablePositions) {
        if (pos === 'ALL' || !PROJECTION_POSITIONS.has(pos)) continue;
        result[pos] = getLeagueAvgPPG(pos, weeklyStats, players, scoringSettings, week);
      }
      return result;
    }, { availablePositions, week });
  }, [shouldProjectWaivers, weeklyStats, players, scoringSettings, week, availablePositions]);

  const available = useMemo(() => {
    if (!shouldProjectWaivers || !defenseTable) {
      const visibleRowsCacheKey = getVisibleRowsCacheKey({
        filteredCandidates,
        week,
        scheduleWeekKey,
        scoringSettings,
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
          scoringSettings,
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
  }, [shouldProjectWaivers, filteredCandidates, defenseTable, week, scheduleWeekKey, scoringSettings, scheduleMap, leagueAvgByPos, darkMode, calcFantasyPoints]);

  const sharedNameColumnWidth = useMemo(
    () => getSharedNameColumnWidth(available),
    [available],
  );
  const showWaiverPreparing = available.length === 0 && (
    statsLoading
    || playerCount === 0
    || !seasonStats
  );
  const showWaiverEmpty = available.length === 0 && !showWaiverPreparing && Boolean(seasonStats);

  return (
    <div className="pb-6">
      <div className="px-4 pb-3 flex flex-col gap-2">
        <div className="flex gap-1.5 flex-wrap">
          {availablePositions.map(pos => (
            <button
              key={pos}
              onClick={() => {
                onConsumeInitialPositionRequest?.();
                setPosFilter(pos);
                onPositionFilterChange?.(pos);
              }}
              className="px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
              style={{
                background: activePosFilter === pos ? 'var(--color-signature)' : 'var(--color-fill)',
                color: activePosFilter === pos ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
              }}
            >
              {getPositionFilterLabel(pos)}
            </button>
          ))}
        </div>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--color-label-tertiary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={e => {
              setSearchInput(e.target.value);
              clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => setSearch(e.target.value), 200);
            }}
            placeholder="Search players..."
            className="w-full pl-9 pr-3 py-2 rounded-xl font-medium focus:outline-none"
            style={{ fontSize: '16px', background: 'var(--color-fill-secondary)', color: 'var(--color-label)' }}
          />
        </div>
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
          onViewPlayer={onViewPlayer}
          sortBy={sortBy}
          layout={layout}
          isCompactPhone={isCompactPhone}
          nameColumnWidth={sharedNameColumnWidth}
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

function MetricCell({ children, emphasis = false, color }) {
  return (
    <div className="min-w-0 w-full grid place-items-center">
      <span
        className={`${emphasis ? 'font-semibold' : ''} tabular-nums text-[13px] sm:text-sm text-center`}
        style={{ color }}
      >
        {children}
      </span>
    </div>
  );
}

function ResponsiveWaiverRow({ player, onViewPlayer, sortBy, nameColumnWidth, layout, isCompactPhone }) {
  const { darkMode } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const isInjured = player.injuryStatus && !['Questionable', 'Probable'].includes(player.injuryStatus);
  const posColor = POSITION_COLORS[player.position] ?? 'var(--color-label-tertiary)';
  const canNav = !!(onViewPlayer && player.espnId);
  const injuryLabel = getWaiverInjuryLabel(player.injuryStatus, isCompactPhone);
  const trendBg = player.trendState === 'hot'
    ? 'rgba(30,155,55,0.12)'
    : player.trendState === 'cold'
      ? 'rgba(224,39,15,0.12)'
      : 'transparent';
  const trendColor = player.trendState === 'hot'
    ? 'var(--color-accent-green)'
    : player.trendState === 'cold'
      ? 'var(--color-accent-red)'
      : 'transparent';
  const trendLabel = player.trendState === 'hot'
    ? (isCompactPhone ? '↑' : '↑ HOT')
    : player.trendState === 'cold'
      ? (isCompactPhone ? '↓' : '↓ COLD')
      : '';
  const glowColor = player.teamTheme.accent ?? (darkMode ? '#5AADFF' : '#1A6EFF');
  const { glowHandlers, borderOverlay, glowShadow } = useCardGlow({
    enabled: isHovered,
    color: glowColor,
    cardColor: player.teamTheme.accent ?? null,
    darkMode,
    coreColor: darkMode ? (player.teamTheme.glowCore ?? '#FFFFFF') : null,
    outerColor: player.teamTheme.accent ?? glowColor,
  });
  const baseShadow = isHovered
    ? '0 8px 18px rgba(12,15,20,0.10), 0 2px 6px rgba(12,15,20,0.08)'
    : '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)';
  const rowShadow = glowShadow ? `${glowShadow}, ${baseShadow}` : baseShadow;

  return (
    <div className="px-4">
      <button
        onClick={canNav ? () => onViewPlayer(String(player.espnId), {
          displayName: player.name,
          teamId: player.team,
          position: player.position,
          experience: player.yearsExp != null ? player.yearsExp + 1 : undefined,
        }) : undefined}
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
        className="relative grid items-center w-full text-left active:opacity-60"
        style={{
          gridTemplateColumns: layout.tableTemplate,
          columnGap: layout.gap,
          border: '1px solid var(--color-separator)',
          borderLeft: player.teamTheme.accent ? `4px solid ${player.teamTheme.accent}` : '4px solid var(--color-separator)',
          borderRadius: 0,
          background: isHovered ? player.teamTheme.hoverBg : player.teamTheme.rowBg,
          boxShadow: rowShadow,
          padding: `${layout.verticalPadding}px ${layout.sidePadding}px`,
          transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
          transition: 'background 150ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 200ms cubic-bezier(0.32, 0.72, 0, 1), transform 200ms cubic-bezier(0.32, 0.72, 0, 1)',
          cursor: canNav ? 'pointer' : 'default',
        }}
      >
        {borderOverlay}
        <img
          src={`https://sleepercdn.com/content/nfl/players/thumb/${player.id}.jpg`}
          alt={player.name}
          className="rounded-full shrink-0 object-cover"
          style={{
            width: layout.avatarSize,
            height: layout.avatarSize,
            background: 'var(--color-fill)',
            border: player.teamTheme.avatarBorder ? `2px solid ${player.teamTheme.avatarBorder}` : '2px solid transparent',
          }}
          onError={e => { e.target.src = 'https://sleepercdn.com/images/v2/icons/player_default.webp'; }}
        />

        <div
          className="min-w-0 grid items-center gap-2"
          style={{
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            justifySelf: 'start',
            width: '100%',
            maxWidth: layout.showSeason ? `${Math.max(nameColumnWidth, 0) + 90}px` : 'none',
          }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="min-w-0 font-semibold truncate"
                style={{ color: canNav ? 'var(--color-accent)' : 'var(--color-label)', fontSize: layout.nameFontSize, lineHeight: 1.15 }}
              >
                {player.name}
              </span>
              {player.injuryStatus && (
                <span
                  className="font-bold px-1.5 py-0.5 rounded-lg shrink-0"
                  style={{
                    background: isInjured ? 'rgba(239,68,68,0.12)' : 'rgba(245,183,0,0.12)',
                    color: isInjured ? 'var(--color-accent-red)' : 'var(--color-signature)',
                    fontSize: isCompactPhone ? 9 : 10,
                  }}
                >
                  {injuryLabel}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1 min-w-0 whitespace-nowrap overflow-hidden" style={{ minHeight: 16 }}>
              <span style={{ color: posColor, fontWeight: 600, fontSize: layout.metaFontSize }}>{player.position}</span>
              <span style={{ color: 'var(--color-label-tertiary)', fontSize: layout.metaFontSize }}>{player.team}</span>
              {player.oppTeam && (
                <span style={{ color: 'var(--color-label-quaternary)', fontSize: layout.metaFontSize - 1 }}>
                  vs {player.oppTeam}
                </span>
              )}
            </div>
          </div>

          <div className="shrink-0 flex items-center justify-start gap-1.5 self-center">
            <span
              className="shrink-0 font-bold px-1 py-1 rounded-lg text-center"
              style={{
                width: layout.hotWidth,
                background: trendBg,
                color: trendColor,
                fontSize: isCompactPhone ? 8 : 9,
              }}
            >
              {trendLabel}
            </span>

            {!isCompactPhone && (player.teamTheme.logoKey ? (
              <img
                src={`https://a.espncdn.com/i/teamlogos/nfl/500/${player.teamTheme.logoKey}.png`}
                alt=""
                aria-hidden="true"
                className="shrink-0 self-center"
                style={{ width: 'auto', height: 44, maxWidth: 44, objectFit: 'contain', opacity: 0.72 }}
                onError={e => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className="w-11 shrink-0" />
            ))}
          </div>
        </div>

        <MetricCell
          emphasis
          color={player.projected != null
            ? (sortBy === 'projected' ? 'var(--color-label)' : 'var(--color-label-secondary)')
            : 'var(--color-label-quaternary)'}
        >
          {player.projected != null ? player.projected.toFixed(1) : '-'}
        </MetricCell>

        {layout.showSeason && (
          <MetricCell
            emphasis
            color={sortBy === 'season' ? 'var(--color-label)' : 'var(--color-label-secondary)'}
          >
            {player.pts.toFixed(1)}
          </MetricCell>
        )}

        <MetricCell
          emphasis
          color={sortBy === 'recent' ? 'var(--color-label)' : 'var(--color-label-secondary)'}
        >
          {player.recentAvg > 0 ? player.recentAvg.toFixed(1) : '-'}
        </MetricCell>
      </button>
    </div>
  );
}
