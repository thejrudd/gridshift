import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSleeperBase, useSleeperStatsProgress } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { calcPoints, DEFAULT_SCORING, STAT_TO_SCORING_KEY } from '../../utils/scoringEngine';
import {
  buildDefenseTable,
  computeLeagueAvgPPGByPositionFromDefenseTable,
  computePositionalRanks,
  computeWeeklyPositionalRanks,
  getAvgPPG,
  getDefensePercentile,
  getDefenseStrength,
  projectPlayer,
} from '../../utils/projectionEngine';
import { STADIUMS, WEEK_DATES_2025 } from '../../data/stadiums';
import { fetchGameWeather, formatWeather } from '../../api/weatherApi';
import { getMatchups } from '../../api/sleeperApi';
import PlayerMatchupBreakdown, { STAT_LABELS } from './PlayerMatchupBreakdown';
import CompanionLoadingState from './CompanionLoadingState';
import Modal from '../Modal';
import useCardGlow from '../../hooks/useCardGlow.jsx';
import useMediaQuery from '../../hooks/useMediaQuery.js';
import { getPlayerRowTeamTheme } from '../../utils/playerRowTheme';
import { getPlayerAvailabilityStatus } from '../../utils/playerAvailabilityStatus.js';
import { debugCompanionLog, debugCompanionMeasure, debugCompanionTimeAsync } from '../../utils/companionPerfDebug';
import { CompanionSelectorButton, CompanionSelectorRail } from './CompanionSelectorControls.jsx';
import { POSITION_COLORS } from '../../utils/companionAssetVisuals.js';
import CompanionPlayerRow, { CompanionPlayerMetric, CompanionPlayerStatus } from './CompanionPlayerRow.jsx';

const TOTAL_WEEKS = 18;
const MATCHUP_CARD_SHADOW = '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)';
const COMPACT_PHONE_QUERY = '(max-width: 480px)';
const MOBILE_LAYOUT_QUERY = '(max-width: 1023px)';
const MATCHUP_RESPONSE_CACHE = new Map();
const MATCHUP_RESPONSE_IN_FLIGHT = new Map();

function getLongestTokenLength(label) {
  return String(label ?? '')
    .trim()
    .split(/\s+/)
    .reduce((max, token) => Math.max(max, token.length), 0);
}

function getSharedHeaderTeamNameFontSize(labels, compact = false) {
  const maxTokenLength = labels.reduce(
    (max, label) => Math.max(max, getLongestTokenLength(label)),
    0,
  );
  if (compact) {
    if (maxTokenLength >= 14) return 'clamp(14px, 4vw, 18px)';
    if (maxTokenLength >= 11) return 'clamp(16px, 4.3vw, 20px)';
    if (maxTokenLength >= 9) return 'clamp(18px, 4.8vw, 22px)';
    return 'clamp(20px, 5.2vw, 24px)';
  }
  if (maxTokenLength >= 14) return 'clamp(16px, 4.5vw, 20px)';
  if (maxTokenLength >= 11) return 'clamp(18px, 4.9vw, 24px)';
  if (maxTokenLength >= 9) return 'clamp(20px, 5.2vw, 28px)';
  return 'clamp(22px, 5.6vw, 32px)';
}

function getUnifiedPlayerNameFontSize(labels, compact = false) {
  const names = (labels ?? []).filter(Boolean);
  if (!names.length) return compact ? 11 : 14;

  const longestToken = names.reduce((max, label) => Math.max(max, getLongestTokenLength(label)), 0);
  const longestLabel = names.reduce((max, label) => Math.max(max, String(label ?? '').length), 0);

  if (compact) {
    if (longestToken >= 14 || longestLabel >= 24) return 8;
    if (longestToken >= 12 || longestLabel >= 20) return 9;
    if (longestToken >= 10 || longestLabel >= 17) return 10;
    return 11;
  }

  if (longestToken >= 12 || longestLabel >= 20) return 12;
  if (longestToken >= 10 || longestLabel >= 17) return 13;
  return 14;
}

function clampMatchupWeek(value, totalWeeks, fallbackWeek) {
  const numeric = Number(value);
  const fallback = Number(fallbackWeek);
  const base = Number.isFinite(numeric) ? numeric : Number.isFinite(fallback) ? fallback : 1;
  return Math.max(1, Math.min(totalWeeks, base));
}

function getMatchupDataCacheKey({
  selectedLeagueId,
  season,
  week,
  playerCount,
  seasonStatCount,
  weeklyStatCount,
  scheduleMap,
  activeScoringSettings,
}) {
  return [
    selectedLeagueId,
    season,
    week,
    playerCount,
    seasonStatCount,
    weeklyStatCount,
    scheduleMap ? Object.keys(scheduleMap).length : 0,
    JSON.stringify(activeScoringSettings ?? {}),
  ].join('|');
}

export default function CompanionMatchup({
  onViewPlayer,
  onComparePlayers = null,
  initialWeekRequest = null,
  selectedWeek = null,
  onWeekChange = null,
  onConsumeInitialWeekRequest = null,
}) {
  const { darkMode } = useTheme();
  const isCompactPhone = useMediaQuery(COMPACT_PHONE_QUERY);
  const isMobileLayout = useMediaQuery(MOBILE_LAYOUT_QUERY);
  const {
    sleeperUser, selectedLeagueId, league, season,
    rosters, players, loadPlayers,
    weeklyStats, seasonStats, scheduleMap, loadSeasonStats,
    statsLoading, activeScoringSettings, scoringOverride,
    myRoster, getUserDisplayName, espnIdOverrides,
  } = useSleeperBase();

  const lastScoredLeg = Number(league?.settings?.last_scored_leg);
  const totalWeeks = useMemo(() => {
    return Number.isFinite(lastScoredLeg) && lastScoredLeg > 0
      ? Math.min(lastScoredLeg, TOTAL_WEEKS)
      : 17;
  }, [lastScoredLeg]);
  const rawPlayoffStart = Number(league?.settings?.playoff_week_start);
  const playoffStart = useMemo(() => {
    if (!Number.isFinite(rawPlayoffStart) || rawPlayoffStart < 1 || rawPlayoffStart > totalWeeks) {
      return totalWeeks + 1;
    }
    return rawPlayoffStart;
  }, [rawPlayoffStart, totalWeeks]);
  const defaultWeek = useMemo(() => {
    const regularSeasonEnd = playoffStart <= totalWeeks ? playoffStart - 1 : totalWeeks;
    return Math.max(1, Math.min(totalWeeks, regularSeasonEnd || totalWeeks));
  }, [playoffStart, totalWeeks]);
  const weekOptions = useMemo(
    () => Array.from({ length: totalWeeks }, (_, i) => i + 1),
    [totalWeeks],
  );

  const [matchups, setMatchups] = useState(null);
  // Default to last regular-season week inside the league's actual fantasy season.
  const [week, setWeek] = useState(() => clampMatchupWeek(selectedWeek, totalWeeks, defaultWeek));
  const [requestedWeek, setRequestedWeek] = useState(() => clampMatchupWeek(selectedWeek, totalWeeks, defaultWeek));
  const [matchupLoading, setMatchupLoading] = useState(false);
  const [showBench, setShowBench] = useState(false);
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null); // { id, projection }
  const [selectedTeam, setSelectedTeam] = useState(null); // 'mine' | 'opp'
  const [weatherMap, setWeatherMap] = useState({}); // { 'TEAM-DATE': weather }
  const [isMineHeaderHovered, setIsMineHeaderHovered] = useState(false);
  const [isOppHeaderHovered, setIsOppHeaderHovered] = useState(false);
  const [insightsRequested, setInsightsRequested] = useState(false);
  const weatherPendingKeysRef = useRef(new Set());
  const advancedCacheRef = useRef({
    positionalRanks: { key: '', value: {} },
    weeklyRanks: { key: '', value: {} },
    defenseTable: { key: '', value: null },
    leagueAvgByPos: { key: '', value: {} },
  });

  useEffect(() => {
    debugCompanionLog('Matchup mounted', {
      selectedLeagueId,
      season,
      selectedWeek,
      defaultWeek,
      totalWeeks,
    });
    return () => debugCompanionLog('Matchup unmounted');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadPlayers(); }, [loadPlayers]);
  useEffect(() => {
    if (insightsRequested || !selectedLeagueId) return undefined;
    debugCompanionLog('Matchup insights requested');
    setInsightsRequested(true);
    return undefined;
  }, [insightsRequested, selectedLeagueId]);

  useEffect(() => {
    if (!insightsRequested || seasonStats || statsLoading) return;
    debugCompanionLog('Matchup season stats requested');
    loadSeasonStats();
  }, [insightsRequested, seasonStats, statsLoading, loadSeasonStats]);

  useEffect(() => {
    if (!selectedLeagueId) return;
    const cacheKey = `${selectedLeagueId}|${requestedWeek}`;
    if (MATCHUP_RESPONSE_CACHE.has(cacheKey)) {
      debugCompanionLog('Matchup Sleeper matchups cache hit', { selectedLeagueId, week: requestedWeek });
      setMatchups(MATCHUP_RESPONSE_CACHE.get(cacheKey));
      setWeek(requestedWeek);
      setMatchupLoading(false);
      return;
    }
    if (MATCHUP_RESPONSE_IN_FLIGHT.has(cacheKey)) {
      let cancelled = false;
      debugCompanionLog('Matchup Sleeper matchups in-flight cache hit', { selectedLeagueId, week: requestedWeek });
      setMatchupLoading(true);
      MATCHUP_RESPONSE_IN_FLIGHT.get(cacheKey)
        .then((data) => {
          if (!cancelled) {
            setMatchups(data);
            setWeek(requestedWeek);
            setMatchupLoading(false);
          }
        })
        .finally(() => {
          if (!cancelled) setMatchupLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    setMatchupLoading(true);
    const request = debugCompanionTimeAsync('Matchup Sleeper matchups fetch', () => (
      getMatchups(selectedLeagueId, requestedWeek)
    ), { selectedLeagueId, week: requestedWeek })
      .then((data) => {
        const nextMatchups = data ?? [];
        MATCHUP_RESPONSE_CACHE.set(cacheKey, nextMatchups);
        return nextMatchups;
      })
      .catch(() => {
        MATCHUP_RESPONSE_CACHE.set(cacheKey, []);
        return [];
      })
      .finally(() => {
        MATCHUP_RESPONSE_IN_FLIGHT.delete(cacheKey);
      });

    MATCHUP_RESPONSE_IN_FLIGHT.set(cacheKey, request);
    request
      .then((data) => {
        if (!cancelled) {
          setMatchups(data);
          setWeek(requestedWeek);
          setMatchupLoading(false);
        }
      })
      .finally(() => {
        if (!cancelled) setMatchupLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedLeagueId, requestedWeek]);

  useEffect(() => {
    if (!initialWeekRequest?.week) return;
    setRequestedWeek(clampMatchupWeek(initialWeekRequest.week, totalWeeks, 1));
  }, [initialWeekRequest, totalWeeks]);

  useEffect(() => {
    if (selectedWeek == null) return;
    setRequestedWeek(clampMatchupWeek(selectedWeek, totalWeeks, defaultWeek));
  }, [selectedWeek, totalWeeks, defaultWeek]);

  useEffect(() => {
    setRequestedWeek(prev => clampMatchupWeek(prev, totalWeeks, defaultWeek));
  }, [defaultWeek, totalWeeks]);

  const myRosterData = myRoster();

  const myMatchup = useMemo(() => {
    if (!matchups || !myRosterData) return null;
    return matchups.find(m => m.roster_id === myRosterData.roster_id) ?? null;
  }, [matchups, myRosterData]);

  const opponentMatchup = useMemo(() => {
    if (!matchups || !myMatchup) return null;
    return matchups.find(m => m.matchup_id === myMatchup.matchup_id && m.roster_id !== myMatchup.roster_id) ?? null;
  }, [matchups, myMatchup]);

  const opponentRoster = useMemo(() => {
    if (!opponentMatchup) return null;
    return rosters.find(r => r.roster_id === opponentMatchup.roster_id) ?? null;
  }, [opponentMatchup, rosters]);

  const opponentName = useMemo(() => {
    if (!opponentRoster) return 'Opponent';
    return getUserDisplayName(opponentRoster.owner_id);
  }, [opponentRoster, getUserDisplayName]);

  const myName = useMemo(() => {
    if (!sleeperUser) return 'You';
    return getUserDisplayName(sleeperUser.user_id);
  }, [sleeperUser, getUserDisplayName]);
  const hasAdvancedStats = Boolean(insightsRequested && weeklyStats && seasonStats && players);
  const playerCount = players ? Object.keys(players).length : 0;
  const seasonStatCount = seasonStats ? Object.keys(seasonStats).length : 0;
  const weeklyStatCount = weeklyStats ? Object.keys(weeklyStats).length : 0;
  const matchupDataCacheKey = useMemo(() => getMatchupDataCacheKey({
    selectedLeagueId,
    season,
    week,
    playerCount,
    seasonStatCount,
    weeklyStatCount,
    scheduleMap,
    activeScoringSettings,
  }), [selectedLeagueId, season, week, playerCount, seasonStatCount, weeklyStatCount, scheduleMap, activeScoringSettings]);
  const myPointsMap = myMatchup?.players_points ?? {};
  const oppPointsMap = opponentMatchup?.players_points ?? {};

  useEffect(() => {
    debugCompanionLog('Matchup readiness', {
      selectedLeagueId,
      season,
      week,
      requestedWeek,
      insightsRequested,
      hasAdvancedStats,
      statsLoading,
      matchupLoading,
      hasPlayers: playerCount > 0,
      hasSeasonStats: Boolean(seasonStats),
      hasWeeklyStats: Boolean(weeklyStats),
      hasScheduleMap: Boolean(scheduleMap),
      matchupCount: matchups?.length ?? 0,
      rosterCount: rosters.length,
    });
  }, [
    selectedLeagueId,
    season,
    week,
    requestedWeek,
    insightsRequested,
    hasAdvancedStats,
    statsLoading,
    matchupLoading,
    playerCount,
    seasonStatCount,
    weeklyStatCount,
    scheduleMap,
    matchups,
    rosters.length,
  ]);

  // When a scoring override is active, sum recalculated starter points instead of
  // using Sleeper's pre-computed matchup.points (which reflect the league's own scoring).
  const calcStarterTotal = useCallback((starters) => {
    if (!starters?.length || !players || !weeklyStats) return null;
    let total = 0;
    let hasAny = false;
    for (const id of starters) {
      const p = players[id];
      if (!p) continue;
      const weekEntry = weeklyStats[id]?.find(w => w.week === week) ?? null;
      if (!weekEntry) continue;
      total += calcPoints(weekEntry, activeScoringSettings, p.position);
      hasAny = true;
    }
    return hasAny ? Math.round(total * 100) / 100 : null;
  }, [players, weeklyStats, week, activeScoringSettings]);

  const myDisplayPoints = useMemo(() => {
    if (!scoringOverride) return myMatchup?.points ?? null;
    return calcStarterTotal(myMatchup?.starters) ?? myMatchup?.points ?? null;
  }, [scoringOverride, myMatchup, calcStarterTotal]);

  const oppDisplayPoints = useMemo(() => {
    if (!scoringOverride) return opponentMatchup?.points ?? null;
    return calcStarterTotal(opponentMatchup?.starters) ?? opponentMatchup?.points ?? null;
  }, [scoringOverride, opponentMatchup, calcStarterTotal]);

  const matchupOutcome = useMemo(() => {
    if (myDisplayPoints == null || oppDisplayPoints == null) return { mine: 'pending', opp: 'pending' };
    if (myDisplayPoints === oppDisplayPoints) return { mine: 'tie', opp: 'tie' };
    return myDisplayPoints > oppDisplayPoints
      ? { mine: 'win', opp: 'loss' }
      : { mine: 'loss', opp: 'win' };
  }, [myDisplayPoints, oppDisplayPoints]);
  const neutralHeaderGlow = darkMode ? '#FFFFFF' : '#F5B700';
  const mineHeaderGlowColor = matchupOutcome.mine === 'win'
    ? '#2ED578'
    : matchupOutcome.mine === 'loss'
      ? '#FF4433'
      : neutralHeaderGlow;
  const oppHeaderGlowColor = matchupOutcome.opp === 'win'
    ? '#2ED578'
    : matchupOutcome.opp === 'loss'
      ? '#FF4433'
      : neutralHeaderGlow;
  const mineHeaderGlow = useCardGlow({
    enabled: isMineHeaderHovered,
    color: mineHeaderGlowColor,
    cardColor: matchupOutcome.mine === 'pending' || matchupOutcome.mine === 'tie' ? null : mineHeaderGlowColor,
    darkMode,
    coreColor: darkMode ? '#FFFFFF' : null,
    outerColor: mineHeaderGlowColor,
  });
  const oppHeaderGlow = useCardGlow({
    enabled: isOppHeaderHovered,
    color: oppHeaderGlowColor,
    cardColor: matchupOutcome.opp === 'pending' || matchupOutcome.opp === 'tie' ? null : oppHeaderGlowColor,
    darkMode,
    coreColor: darkMode ? '#FFFFFF' : null,
    outerColor: oppHeaderGlowColor,
  });
  const matchupHeaderNameLabels = useMemo(() => {
    const labels = new Set([myName, opponentName]);
    for (const roster of rosters) {
      if (roster?.owner_id) labels.add(getUserDisplayName(roster.owner_id));
    }
    return Array.from(labels).filter(Boolean);
  }, [myName, opponentName, rosters, getUserDisplayName]);
  const sharedTeamNameFontSize = useMemo(
    () => getSharedHeaderTeamNameFontSize(matchupHeaderNameLabels, isCompactPhone),
    [matchupHeaderNameLabels, isCompactPhone],
  );

  const positionalRanks = useMemo(() => {
    if (!hasAdvancedStats) return {};
    const cacheKey = `season|${matchupDataCacheKey}`;
    if (advancedCacheRef.current.positionalRanks.key === cacheKey) {
      debugCompanionLog('Matchup positional ranks cache hit', { seasonStatCount });
      return advancedCacheRef.current.positionalRanks.value;
    }
    const nextRanks = debugCompanionMeasure('Matchup positional ranks', () => (
      computePositionalRanks(seasonStats, players, activeScoringSettings)
    ), {
      playerDirectoryCount: playerCount,
      seasonStatCount,
    });
    advancedCacheRef.current.positionalRanks = { key: cacheKey, value: nextRanks };
    return nextRanks;
  }, [hasAdvancedStats, seasonStats, players, activeScoringSettings, matchupDataCacheKey, playerCount, seasonStatCount]);

  const weeklyRanks = useMemo(() => {
    if (!hasAdvancedStats) return {};
    const cacheKey = `week|${matchupDataCacheKey}`;
    if (advancedCacheRef.current.weeklyRanks.key === cacheKey) {
      debugCompanionLog('Matchup weekly ranks cache hit', { week, weeklyStatCount });
      return advancedCacheRef.current.weeklyRanks.value;
    }
    const nextRanks = debugCompanionMeasure('Matchup weekly ranks', () => (
      computeWeeklyPositionalRanks(weeklyStats, players, activeScoringSettings, week)
    ), {
      week,
      weeklyStatCount,
    });
    advancedCacheRef.current.weeklyRanks = { key: cacheKey, value: nextRanks };
    return nextRanks;
  }, [hasAdvancedStats, weeklyStats, players, activeScoringSettings, week, matchupDataCacheKey, weeklyStatCount]);

  // Pre-computed defense table: { [teamAbbr]: { [normPos]: { [week]: totalPts } } }
  // Built once when all data is available; used for O(1) opponent strength lookups.
  const defenseTable = useMemo(() => {
    if (!hasAdvancedStats) return null;
    const cacheKey = `defense|${matchupDataCacheKey}`;
    if (advancedCacheRef.current.defenseTable.key === cacheKey) {
      debugCompanionLog('Matchup defense table cache hit', { weeklyStatCount });
      return advancedCacheRef.current.defenseTable.value;
    }
    const nextDefenseTable = debugCompanionMeasure('Matchup defense table', () => (
      buildDefenseTable(weeklyStats, players, scheduleMap, activeScoringSettings, undefined, false, week)
    ), {
      playerDirectoryCount: playerCount,
      weeklyStatCount,
      beforeWeek: week,
    });
    advancedCacheRef.current.defenseTable = { key: cacheKey, value: nextDefenseTable };
    return nextDefenseTable;
  }, [hasAdvancedStats, weeklyStats, players, scheduleMap, activeScoringSettings, matchupDataCacheKey, playerCount, weeklyStatCount]);

  const leagueAvgByPos = useMemo(() => {
    if (!hasAdvancedStats || !defenseTable) return {};
    const cacheKey = `leagueAvg|${matchupDataCacheKey}`;
    if (advancedCacheRef.current.leagueAvgByPos.key === cacheKey) {
      debugCompanionLog('Matchup league average PPG by position cache hit', { week });
      return advancedCacheRef.current.leagueAvgByPos.value;
    }
    const nextLeagueAvgByPos = debugCompanionMeasure('Matchup league average PPG by position', () => (
      computeLeagueAvgPPGByPositionFromDefenseTable(defenseTable, week)
    ), { week });
    advancedCacheRef.current.leagueAvgByPos = { key: cacheKey, value: nextLeagueAvgByPos };
    return nextLeagueAvgByPos;
  }, [hasAdvancedStats, defenseTable, week, matchupDataCacheKey]);

  const toCompareSeed = useCallback((player) => {
    if (!player?.id || !players) return null;
    const raw = players[player.id];
    const espnId = raw?.espn_id ?? espnIdOverrides?.[player.id] ?? null;
    if (!raw) return null;
    return {
      id: espnId ?? String(player.id),
      displayName: player.name,
      teamId: raw.team || player.team || null,
      teamName: raw.team || player.team || null,
      position: raw.position || player.position || null,
      experience: raw.years_exp != null ? raw.years_exp + 1 : undefined,
    };
  }, [players, espnIdOverrides]);

  const enrichPlayer = useCallback((id, pointsMap = null) => {
    if (!id || !players) return null;
    const p = players[id];
    if (!p) return { id, name: 'Empty', position: '?', team: '', pts: null, avgPPG: 0, rank: null, oppTeam: null, isHome: null, isIndoor: null, homeTeam: null, availabilityStatus: null, weekly: [] };

    const weekly = hasAdvancedStats ? (weeklyStats?.[id] ?? []) : [];
    const weekEntry = hasAdvancedStats ? (weekly.find(w => w.week === week) ?? null) : null;
    const myTeam = p.team || 'FA';
    // Derive opponent + home/away: prefer stat entry fields, fall back to ESPN schedule
    const schedEntry = scheduleMap?.[week]?.[myTeam] ?? null;
    const oppTeam = weekEntry?.opp?.toUpperCase() ?? schedEntry?.opp ?? null;
    // Prefer ESPN schedEntry.home (reliable) over Sleeper weekEntry.home (often unreliable/zero)
    const isHome = schedEntry != null
      ? schedEntry.home
      : weekEntry != null ? (weekEntry.home === 1 || weekEntry.home === true) : null;
    // Home team hosts → determines whose stadium we use
    const homeTeam = isHome === true ? myTeam : isHome === false ? oppTeam : null;
    const stadium = homeTeam ? (STADIUMS[homeTeam] ?? null) : null;
    const defStrength = hasAdvancedStats && oppTeam && defenseTable
      ? getDefenseStrength(defenseTable, oppTeam, p.position, week)
      : null;
    const isDefensivePos = ['DL', 'DE', 'DT', 'LB', 'ILB', 'OLB', 'DB', 'CB', 'S', 'SS', 'FS'].includes(p.position);
    const defPercentile = hasAdvancedStats && oppTeam && defenseTable && !isDefensivePos
      ? getDefensePercentile(defenseTable, oppTeam, p.position, week)
      : null;
    // Bye detection: week has games for other teams but not this team
    const weekHasGames = !!scheduleMap && Object.keys(scheduleMap[week] ?? {}).length > 0;
    const isBye = weekHasGames && !schedEntry && myTeam !== 'FA';
    const fallbackWeekPts = pointsMap && Number.isFinite(Number(pointsMap[id])) ? Number(pointsMap[id]) : null;

    return {
      id,
      name: p.full_name || `${p.first_name} ${p.last_name}`,
      position: p.position,
      team: myTeam,
      weekPts: weekEntry ? calcPoints(weekEntry, activeScoringSettings, p.position) : fallbackWeekPts,
      avgPPG: hasAdvancedStats ? getAvgPPG(weekly, activeScoringSettings, p.position) : null,
      rank: positionalRanks[id] ?? null,
      weekRank: weeklyRanks[id] ?? null,
      oppTeam,
      isHome,
      homeTeam,
      gameDate: schedEntry?.date ?? WEEK_DATES_2025[week] ?? null,
      stadium,
      isIndoor: stadium?.indoor ?? null,
      weekly,
      availabilityStatus: getPlayerAvailabilityStatus(p),
      defStrength,
      defPercentile,
      isBye,
      teamTheme: getPlayerRowTeamTheme(myTeam, darkMode),
    };
  }, [players, hasAdvancedStats, weeklyStats, activeScoringSettings, positionalRanks, weeklyRanks, week, scheduleMap, defenseTable, darkMode]);

  // Ordered slot positions for each starter slot (filters out BN/IR)
  const starterPositions = useMemo(
    () => (league?.roster_positions ?? []).filter(p => p !== 'BN' && p !== 'IR'),
    [league],
  );

  // Zip starters by slot index for side-by-side display
  const starterSlots = useMemo(() => {
    return debugCompanionMeasure('Matchup starter slots enrich', () => {
      const myIds = myMatchup?.starters ?? [];
      const oppIds = opponentMatchup?.starters ?? [];
      const len = Math.max(myIds.length, oppIds.length);
      return Array.from({ length: len }, (_, i) => ({
        mine: enrichPlayer(myIds[i], myPointsMap),
        opp: enrichPlayer(oppIds[i], oppPointsMap),
        slotPos: starterPositions[i] ?? null,
      }));
    }, {
      week,
      hasAdvancedStats,
      myStarterCount: myMatchup?.starters?.length ?? 0,
      oppStarterCount: opponentMatchup?.starters?.length ?? 0,
    });
  }, [myMatchup, opponentMatchup, enrichPlayer, starterPositions, myPointsMap, oppPointsMap]);

  // Bench players
  const myBench = useMemo(() => {
    if (!myRosterData || !myMatchup) return [];
    return debugCompanionMeasure('Matchup my bench enrich', () => {
      const starterSet = new Set(myMatchup.starters ?? []);
      return (myRosterData.players ?? []).filter(id => !starterSet.has(id)).map(id => enrichPlayer(id, myPointsMap)).filter(Boolean);
    }, {
      rosterPlayerCount: myRosterData.players?.length ?? 0,
      hasAdvancedStats,
    });
  }, [myRosterData, myMatchup, enrichPlayer, myPointsMap]);

  const oppBench = useMemo(() => {
    if (!opponentRoster || !opponentMatchup) return [];
    return debugCompanionMeasure('Matchup opponent bench enrich', () => {
      const starterSet = new Set(opponentMatchup.starters ?? []);
      return (opponentRoster.players ?? []).filter(id => !starterSet.has(id)).map(id => enrichPlayer(id, oppPointsMap)).filter(Boolean);
    }, {
      rosterPlayerCount: opponentRoster.players?.length ?? 0,
      hasAdvancedStats,
    });
  }, [opponentRoster, opponentMatchup, enrichPlayer, oppPointsMap]);

  // Fetch weather for all outdoor home stadiums referenced by starters
  useEffect(() => {
    if (!hasAdvancedStats) return;

    const toFetch = new Map(); // homeTeam → { lat, lng }
    const allPlayers = [
      ...starterSlots.flatMap(s => [s.mine, s.opp]),
    ].filter(Boolean);

    for (const player of allPlayers) {
      const date = player.gameDate ?? WEEK_DATES_2025[week];
      if (!date || !player.homeTeam || player.isIndoor) continue;
      const s = STADIUMS[player.homeTeam];
      if (s && !s.indoor) {
        const key = `${player.homeTeam}-${date}`;
        if (
          !Object.prototype.hasOwnProperty.call(weatherMap, key)
          && !weatherPendingKeysRef.current.has(key)
        ) {
          toFetch.set(player.homeTeam, { lat: s.lat, lng: s.lng, key });
        }
      }
    }

    const pending = Array.from(toFetch.values());
    if (!pending.length) return;

    let cancelled = false;
    for (const { key } of pending) {
      weatherPendingKeysRef.current.add(key);
    }
    debugCompanionLog('Matchup weather fetch requested', {
      week,
      requestCount: pending.length,
      teams: pending.map(item => item.key),
    });

    debugCompanionTimeAsync('Matchup weather fetch batch', () => Promise.all(
      pending.map(({ lat, lng, key }) =>
        {
          const date = key.split('-').slice(1).join('-');
          return fetchGameWeather(lat, lng, date)
            .then((weather) => ({ key, weather }))
            .catch(() => ({ key, weather: null }));
        }
      ),
    ), { week, requestCount: pending.length }).then((results) => {
      for (const { key } of results) {
        weatherPendingKeysRef.current.delete(key);
      }
      if (cancelled) return;
      setWeatherMap((prev) => {
        const next = { ...prev };
        for (const { key, weather } of results) {
          next[key] = weather;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [hasAdvancedStats, starterSlots, week, weatherMap]);

  // Add projections once weather is available
  const enrichedSlots = useMemo(() => {
    if (!hasAdvancedStats) return starterSlots;

    return debugCompanionMeasure('Matchup starter projections', () => {
      function addProjection(player) {
        if (!player || !player.weekly?.length || player.name === 'Empty') return player;
        const date = player.gameDate ?? WEEK_DATES_2025[week];
        const key = player.homeTeam && date ? `${player.homeTeam}-${date}` : null;
        const weather = player.isIndoor ? null : (key ? (weatherMap[key] ?? null) : null);
        const proj = projectPlayer({
          weeklyArr: player.weekly,
          pos: player.position,
          oppTeam: player.oppTeam,
          isHome: player.isHome,
          isIndoor: player.isIndoor ?? false,
          weather,
          allWeeklyStats: weeklyStats,
          players,
          scoringSettings: activeScoringSettings,
          scheduleMap,
          week,
          defStrength: player.defStrength ?? null,
          leagueAvg: leagueAvgByPos[player.position] ?? 0,
          skipOpponentLookup: true,
        });
        return { ...player, projection: proj, weather };
      }

      return starterSlots.map(slot => ({
        mine: addProjection(slot.mine),
        opp: addProjection(slot.opp),
        slotPos: slot.slotPos,
      }));
    }, {
      week,
      starterSlotCount: starterSlots.length,
      weatherEntries: Object.keys(weatherMap).length,
    });
  }, [hasAdvancedStats, starterSlots, weatherMap, week, weeklyStats, players, activeScoringSettings, scheduleMap, leagueAvgByPos]);

  const sharedPlayerNameFontSize = useMemo(() => {
    const labels = [
      ...enrichedSlots.flatMap(slot => [slot.mine?.name, slot.opp?.name]),
      ...myBench.map(player => player?.name),
      ...oppBench.map(player => player?.name),
    ].filter(Boolean);
    return getUnifiedPlayerNameFontSize(labels, isCompactPhone);
  }, [enrichedSlots, myBench, oppBench, isCompactPhone]);

  useEffect(() => {
    const requestedPlayerId = initialWeekRequest?.playerId;
    const requestedWeek = Number(initialWeekRequest?.week ?? week);
    if (!requestedPlayerId || requestedWeek !== week) return;

    const matchupPlayers = [
      ...enrichedSlots.flatMap((slot) => [slot.mine, slot.opp]),
      ...myBench,
      ...oppBench,
    ].filter(Boolean);

    const match = matchupPlayers.find((player) => player?.id === requestedPlayerId);
    if (match) {
      setSelectedPlayer({
        id: match.id,
        projection: match.projection ?? null,
        enriched: match,
      });
    }
    onConsumeInitialWeekRequest?.();
  }, [enrichedSlots, initialWeekRequest, myBench, oppBench, onConsumeInitialWeekRequest, week]);

  const hasLoadedMatchups = Array.isArray(matchups);
  const hasNoMatchup = hasLoadedMatchups && !matchupLoading && !myMatchup;
  const hasNoOpponentMatchup = hasLoadedMatchups && !matchupLoading && Boolean(myMatchup) && !opponentMatchup;
  const hasStarterIds = (myMatchup?.starters?.length ?? 0) > 0 || (opponentMatchup?.starters?.length ?? 0) > 0;
  const hasRenderableStarterRows = starterSlots.some((slot) => slot.mine || slot.opp);
  const canKeepRenderedWeekDuringSwitch = requestedWeek !== week && hasLoadedMatchups && Boolean(myMatchup);
  const isPreparingMatchupView = Boolean(selectedLeagueId)
    && !hasNoMatchup
    && !hasNoOpponentMatchup
    && !canKeepRenderedWeekDuringSwitch
    && (
      matchupLoading
      || !hasLoadedMatchups
      || playerCount === 0
      || !insightsRequested
      || !hasAdvancedStats
      || (hasStarterIds && !hasRenderableStarterRows)
    );

  if (!selectedLeagueId) {
    return <EmptyState title="Connect a league to see matchup data." />;
  }

  if (hasNoMatchup) {
    return (
      <EmptyState
        title="Matchups will appear once your league schedule is available."
        description="Pre-season leagues may not have weekly matchups published yet, so there is nothing to preview for this week."
      />
    );
  }

  if (hasNoOpponentMatchup) {
    return (
      <EmptyState
        title="Opponent details are not available for this week yet."
        description="Once Sleeper publishes both sides of the matchup, this view will show projections and lineup context."
      />
    );
  }

  if (isPreparingMatchupView) {
    return (
      <div className="pb-6">
        {statsLoading && (
          <MatchupStatsLoadingBanner />
        )}
        <CompanionLoadingState
          title="Preparing matchup..."
          description="Fetching matchup data, player records, rankings, and projections before showing the page."
        />
      </div>
    );
  }

  return (
    <div className="pb-6">
      {/* Scoreboard header */}
          <div className="mb-4">
            <div className={`mx-2 sm:mx-4 mb-3 ${isCompactPhone ? '' : ''}`}>
              <CompanionSelectorRail ariaLabel="Matchup controls" wrapOnDesktop={false}>
              <CompanionSelectorButton
                onClick={() => setShowWeekPicker(true)}
                active
                size="sm"
                aria-label={`Choose matchup week. Week ${week} selected.`}
                className="companion-matchup-week-trigger"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4" />
                  <path d="M8 2v4" />
                  <path d="M3 10h18" />
                </svg>
                Week {week}
              </CompanionSelectorButton>
              <CompanionSelectorButton
                onClick={() => setShowBench(v => !v)}
                active={showBench}
                size="sm"
                aria-label={showBench ? 'Hide bench players' : 'Show bench players'}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 7h18" />
                  <path d="M6 12h12" />
                  <path d="M9 17h6" />
                </svg>
                {showBench ? 'Bench On' : 'Show Bench'}
              </CompanionSelectorButton>
              </CompanionSelectorRail>
            </div>
            <div className="px-2 sm:px-4">
              <div className="grid grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] items-stretch gap-1 sm:gap-2">
              <button
                aria-label={`Your Side scoring breakdown for ${myName}`}
                className="min-w-0 px-2 sm:px-4 py-2.5 sm:py-3 text-center active:opacity-60 transition-opacity flex flex-col justify-center"
                onClick={() => setSelectedTeam('mine')}
                onMouseMove={mineHeaderGlow.glowHandlers.onMouseMove}
                onMouseEnter={() => setIsMineHeaderHovered(true)}
                onMouseLeave={() => setIsMineHeaderHovered(false)}
                onFocus={() => setIsMineHeaderHovered(true)}
                onBlur={() => setIsMineHeaderHovered(false)}
                style={{
                  border: '1px solid var(--color-separator)',
                  background: isMineHeaderHovered
                    ? matchupOutcome.mine === 'win'
                      ? 'rgba(46,213,120,0.24)'
                      : matchupOutcome.mine === 'loss'
                        ? 'rgba(255,68,51,0.22)'
                        : 'var(--color-fill)'
                    : matchupOutcome.mine === 'win'
                      ? 'rgba(46,213,120,0.18)'
                      : matchupOutcome.mine === 'loss'
                        ? 'rgba(255,68,51,0.16)'
                        : 'var(--color-fill-secondary)',
                  borderRadius: 0,
                  position: 'relative',
                  overflow: 'hidden',
                  minHeight: isMobileLayout ? (isCompactPhone ? 88 : 104) : 132,
                  display: 'grid',
                  alignContent: 'center',
                  justifyItems: 'center',
                  gridTemplateRows: isMobileLayout
                    ? isCompactPhone ? 'minmax(0, max-content) 26px' : 'minmax(0, max-content) 34px'
                    : '18px minmax(0, 1fr) 34px',
                  boxShadow: isMineHeaderHovered
                    ? `${mineHeaderGlow.glowShadow ? `${mineHeaderGlow.glowShadow}, ` : ''}${MATCHUP_CARD_SHADOW}`
                    : 'none',
                  transform: isMineHeaderHovered ? 'translateY(-1px)' : 'translateY(0)',
                  transition: 'background 150ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 200ms cubic-bezier(0.32, 0.72, 0, 1), transform 200ms cubic-bezier(0.32, 0.72, 0, 1)',
                }}
              >
                {mineHeaderGlow.borderOverlay}
                {matchupOutcome.mine !== 'pending' && matchupOutcome.mine !== 'tie' && (
                  <div
                    aria-hidden="true"
                    className="hidden sm:block"
                    style={{
                      position: 'absolute',
                      top: '50%',
                      right: 'clamp(8px, 2vw, 18px)',
                      transform: 'translateY(-50%)',
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif",
                      fontSize: 'clamp(40px, 8vw, 64px)',
                      fontWeight: 800,
                      lineHeight: 0.9,
                      color: matchupOutcome.mine === 'win' ? 'rgba(46,213,120,0.30)' : 'rgba(255,68,51,0.28)',
                      pointerEvents: 'none',
                    }}
                  >
                    {matchupOutcome.mine === 'win' ? 'W' : 'L'}
                  </div>
                )}
                <div className="hidden lg:block relative z-[1] self-center text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.18em] sm:tracking-[0.2em]" style={{ color: 'var(--color-label-secondary)', fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif" }}>Your Side</div>
                <div className="relative z-[1] mt-1 self-center uppercase whitespace-normal" style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif", fontSize: sharedTeamNameFontSize, fontWeight: 800, lineHeight: 0.96, wordBreak: 'normal', overflowWrap: 'normal' }}>
                  {myName}
                </div>
                <div className="relative z-[1] mt-1 self-center tabular-nums" style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif", fontSize: isCompactPhone ? 'clamp(24px, 6.2vw, 30px)' : 'clamp(30px, 7vw, 38px)', fontWeight: 800, lineHeight: 0.92 }}>
                  {myDisplayPoints?.toFixed(2) ?? '?'}
                </div>
              </button>
              <div className="flex items-center justify-center self-stretch">
                <div className="px-1 py-0 text-xs font-bold uppercase tracking-[0.18em]" style={{ background: 'transparent', color: 'var(--color-label-secondary)', borderRadius: 0 }}>
                  vs
                </div>
              </div>
              <button
                aria-label={`Opponent scoring breakdown for ${opponentName}`}
                className="min-w-0 px-2 sm:px-4 py-2.5 sm:py-3 text-center active:opacity-60 transition-opacity flex flex-col justify-center"
                onClick={() => setSelectedTeam('opp')}
                onMouseMove={oppHeaderGlow.glowHandlers.onMouseMove}
                onMouseEnter={() => setIsOppHeaderHovered(true)}
                onMouseLeave={() => setIsOppHeaderHovered(false)}
                onFocus={() => setIsOppHeaderHovered(true)}
                onBlur={() => setIsOppHeaderHovered(false)}
                style={{
                  border: '1px solid var(--color-separator)',
                  background: isOppHeaderHovered
                    ? matchupOutcome.opp === 'win'
                      ? 'rgba(46,213,120,0.24)'
                      : matchupOutcome.opp === 'loss'
                        ? 'rgba(255,68,51,0.22)'
                        : 'var(--color-fill)'
                    : matchupOutcome.opp === 'win'
                      ? 'rgba(46,213,120,0.18)'
                      : matchupOutcome.opp === 'loss'
                        ? 'rgba(255,68,51,0.16)'
                        : 'var(--color-fill-secondary)',
                  borderRadius: 0,
                  position: 'relative',
                  overflow: 'hidden',
                  minHeight: isMobileLayout ? (isCompactPhone ? 88 : 104) : 132,
                  display: 'grid',
                  alignContent: 'center',
                  justifyItems: 'center',
                  gridTemplateRows: isMobileLayout
                    ? isCompactPhone ? 'minmax(0, max-content) 26px' : 'minmax(0, max-content) 34px'
                    : '18px minmax(0, 1fr) 34px',
                  boxShadow: isOppHeaderHovered
                    ? `${oppHeaderGlow.glowShadow ? `${oppHeaderGlow.glowShadow}, ` : ''}${MATCHUP_CARD_SHADOW}`
                    : 'none',
                  transform: isOppHeaderHovered ? 'translateY(-1px)' : 'translateY(0)',
                  transition: 'background 150ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 200ms cubic-bezier(0.32, 0.72, 0, 1), transform 200ms cubic-bezier(0.32, 0.72, 0, 1)',
                }}
              >
                {oppHeaderGlow.borderOverlay}
                {matchupOutcome.opp !== 'pending' && matchupOutcome.opp !== 'tie' && (
                  <div
                    aria-hidden="true"
                    className="hidden sm:block"
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: 'clamp(8px, 2vw, 18px)',
                      transform: 'translateY(-50%)',
                      fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif",
                      fontSize: 'clamp(40px, 8vw, 64px)',
                      fontWeight: 800,
                      lineHeight: 0.9,
                      color: matchupOutcome.opp === 'win' ? 'rgba(46,213,120,0.30)' : 'rgba(255,68,51,0.28)',
                      pointerEvents: 'none',
                    }}
                  >
                    {matchupOutcome.opp === 'win' ? 'W' : 'L'}
                  </div>
                )}
                <div className="hidden lg:block relative z-[1] self-center text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.18em] sm:tracking-[0.2em]" style={{ color: 'var(--color-label-secondary)', fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif" }}>Opponent</div>
                <div className="relative z-[1] mt-1 self-center uppercase whitespace-normal" style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif", fontSize: sharedTeamNameFontSize, fontWeight: 800, lineHeight: 0.96, wordBreak: 'normal', overflowWrap: 'normal' }}>
                  {opponentName}
                </div>
                <div className="relative z-[1] mt-1 self-center tabular-nums" style={{ color: 'var(--color-label)', fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif", fontSize: isCompactPhone ? 'clamp(24px, 6.2vw, 30px)' : 'clamp(30px, 7vw, 38px)', fontWeight: 800, lineHeight: 0.92 }}>
                  {oppDisplayPoints?.toFixed(2) ?? '?'}
                </div>
              </button>
            </div>
          </div>
          </div>

          {/* Column headers */}
          <div className="companion-matchup-column-header hidden lg:block px-2 sm:px-4 pb-2 mb-1" style={{ borderBottom: '1px solid var(--color-separator)' }}>
            <div className="grid grid-cols-[minmax(0,1fr)_30px_minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] items-center gap-1.5 sm:gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>{myName}</span>
              <span className="text-center text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Slot</span>
              <span className="text-right text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>{opponentName}</span>
            </div>
          </div>

          {/* Head-to-head starter rows */}
          <div>
            {enrichedSlots.map((slot, i) => (
              <HeadToHeadRow
                key={i}
                mine={slot.mine}
                opp={slot.opp}
                slotPos={slot.slotPos}
                sharedPlayerNameFontSize={sharedPlayerNameFontSize}
                onComparePlayers={(() => {
                  if (!onComparePlayers) return null;
                  const playerA = toCompareSeed(slot.mine);
                  const playerB = toCompareSeed(slot.opp);
                  if (!playerA || !playerB) return null;
                  return () => {
                      onComparePlayers(playerA, playerB);
                  };
                })()}
                onSelectMine={() => slot.mine?.id && setSelectedPlayer({ id: slot.mine.id, projection: slot.mine.projection ?? null, enriched: slot.mine })}
                onSelectOpp={() => slot.opp?.id && setSelectedPlayer({ id: slot.opp.id, projection: slot.opp.projection ?? null, enriched: slot.opp })}
              />
            ))}
          </div>

          {/* Bench section */}
          {(myBench.length > 0 || oppBench.length > 0) && (
            <>
              <div
                className="mx-2 sm:mx-4 mt-5 mb-2 px-4 py-2 text-xs font-bold uppercase tracking-widest"
                style={{
                  color: 'var(--color-label-secondary)',
                  background: 'var(--color-fill)',
                  border: '1px solid var(--color-separator)',
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif",
                }}
              >
                Bench
              </div>
              {showBench && (() => {
                const len = Math.max(myBench.length, oppBench.length);
                return (
                  <div>
                    {Array.from({ length: len }, (_, i) => (
                      <HeadToHeadRow
                        key={i}
                        mine={myBench[i] ?? null}
                        opp={oppBench[i] ?? null}
                        bench
                        sharedPlayerNameFontSize={sharedPlayerNameFontSize}
                        onSelectMine={() => myBench[i]?.id && setSelectedPlayer({ id: myBench[i].id, projection: null, enriched: myBench[i] })}
                        onSelectOpp={() => oppBench[i]?.id && setSelectedPlayer({ id: oppBench[i].id, projection: null, enriched: oppBench[i] })}
                      />
                    ))}
                  </div>
                );
              })()}
            </>
          )}
      {selectedPlayer && (
        <PlayerMatchupBreakdown
          playerId={selectedPlayer.id}
          week={week}
          projection={selectedPlayer.projection}
          enrichedPlayer={selectedPlayer.enriched ?? null}
          onClose={() => setSelectedPlayer(null)}
          onViewStats={onViewPlayer}
        />
      )}

      {selectedTeam && (
        <TeamScoreBreakdown
          teamName={selectedTeam === 'mine' ? myName : opponentName}
          playerIds={enrichedSlots.map(s => selectedTeam === 'mine' ? s.mine?.id : s.opp?.id).filter(Boolean)}
          week={week}
          onClose={() => setSelectedTeam(null)}
        />
      )}

      {showWeekPicker && (
        <Modal
          onClose={() => setShowWeekPicker(false)}
          mobileSheet
          ariaLabel="Select matchup week"
          containerClassName="matchup-week-picker-sheet"
          containerStyle={{
            background: 'var(--color-bg-secondary)',
            maxWidth: '480px',
            '--modal-mobile-sheet-max-height': 'min(86dvh, calc(100dvh - env(safe-area-inset-top) - 8px))',
          }}
        >
          <div className="matchup-week-picker-header">
            <div className="min-w-0">
              <div className="companion-segmented__title matchup-week-picker-title">
                Select Week
              </div>
              {playoffStart <= totalWeeks && (
                <div className="matchup-week-picker-note">
                  Playoffs start Week {playoffStart}
                </div>
              )}
            </div>
            <CompanionSelectorButton
              size="xs"
              variant="ghost"
              aria-label="Close select week"
              onClick={() => setShowWeekPicker(false)}
              className="matchup-week-picker-close"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </CompanionSelectorButton>
          </div>
          <div className="matchup-week-picker-grid">
            {weekOptions.map((w) => {
              const isPlayoff = w >= playoffStart;
              const isSelected = week === w;
              return (
                <CompanionSelectorButton
                  key={w}
                  active={isSelected}
                  size="md"
                  variant="segment"
                  aria-label={`Week ${w}${isPlayoff ? ' playoff' : ''}`}
                  className={`matchup-week-picker-option${isPlayoff ? ' is-playoff-week' : ''}`}
                  onClick={() => {
                    setSelectedPlayer(null);
                    setSelectedTeam(null);
                    setRequestedWeek(w);
                    onWeekChange?.(w);
                    setShowWeekPicker(false);
                  }}
                >
                  <span>Wk {w}</span>
                  {isPlayoff ? (
                    <span className="matchup-week-picker-option__tag">
                      Playoff
                    </span>
                  ) : null}
                </CompanionSelectorButton>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}

// Sleeper flex/special slot names → short display labels
const SLOT_LABELS = {
  FLEX: 'FLX', REC_FLEX: 'FLX', WRRB_FLEX: 'FLX',
  SUPER_FLEX: 'SF', IDP_FLEX: 'IDP', DEF: 'DST',
};

function HeadToHeadRow({ mine, opp, bench, slotPos, onSelectMine, onSelectOpp, onComparePlayers, sharedPlayerNameFontSize }) {
  const { darkMode } = useTheme();
  const isCompactPhone = useMediaQuery(COMPACT_PHONE_QUERY);
  const slotLabel = slotPos ? (SLOT_LABELS[slotPos] ?? slotPos) : (mine?.position ?? opp?.position ?? '?');
  const posColor = POSITION_COLORS[slotPos] ?? POSITION_COLORS[mine?.position ?? opp?.position] ?? 'var(--color-label-tertiary)';
  const slotBadgeLabel = slotLabel === 'SUPER FLEX' ? 'SF' : slotLabel === 'WRRB_FLEX' ? 'FLEX' : slotLabel;
  const canCompare = !!onComparePlayers;

  return (
    <div className="px-1.5 sm:px-4" style={{ opacity: bench ? 0.72 : 1 }}>
      <div className="grid grid-cols-[minmax(0,1fr)_30px_minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] items-stretch gap-1 sm:gap-2">
      {/* My player — left */}
        <MatchupPlayerRow
          player={mine}
          darkMode={darkMode}
          compact={isCompactPhone}
          onSelect={onSelectMine}
          nameFontSize={sharedPlayerNameFontSize}
        />

      {/* Position badge — center */}
        <div className="relative z-[1] flex items-center justify-center">
          <button
            type="button"
            onClick={canCompare ? onComparePlayers : undefined}
            className="font-bold text-center active:opacity-70 inline-flex w-full flex-col items-center justify-center"
            style={{
              background: 'transparent',
              color: posColor,
              fontFamily: '"Barlow Condensed", sans-serif',
              fontSize: isCompactPhone ? '9px' : '11px',
              minWidth: isCompactPhone ? 28 : 32,
              minHeight: isCompactPhone ? 32 : 38,
              padding: isCompactPhone ? '2px 1px' : '3px 4px',
              border: 'none',
              borderRadius: 0,
              lineHeight: 1,
              cursor: canCompare ? 'pointer' : 'default',
              boxShadow: 'none',
              textDecoration: 'none',
              letterSpacing: '0.08em',
            }}
            aria-label={canCompare ? `Compare ${mine?.name} and ${opp?.name} in Trade Compare` : undefined}
          >
            <span>{slotBadgeLabel}</span>
            {canCompare ? <span style={{ fontSize: isCompactPhone ? '7px' : '9px', lineHeight: 1, marginTop: 1 }}>⇄</span> : null}
          </button>
        </div>

      {/* Opponent — right (mirrored) */}
      <MatchupPlayerRow
        player={opp}
        darkMode={darkMode}
        compact={isCompactPhone}
        onSelect={onSelectOpp}
        nameFontSize={sharedPlayerNameFontSize}
        align="right"
      />
      </div>
    </div>
  );
}

function getGameLabel(player) {
  if (!player?.team) return null;
  if (!player.oppTeam) return player.team;
  if (player.isHome === true) return `${player.oppTeam} @ ${player.team}`;
  if (player.isHome === false) return `${player.team} @ ${player.oppTeam}`;
  return `${player.team} vs ${player.oppTeam}`;
}

function getCompactGameLabel(player) {
  if (!player?.team) return null;
  if (!player.oppTeam) return player.team;
  if (player.isHome === true) return `${player.oppTeam}@${player.team}`;
  if (player.isHome === false) return `${player.team}@${player.oppTeam}`;
  return `${player.team}/${player.oppTeam}`;
}

function MatchupPlayerRow({ player, darkMode, compact = false, align = 'left', onSelect, nameFontSize = 13 }) {
  const isRight = align === 'right';
  if (!player || player.name === 'Empty') {
    return (
      <div
        className="min-w-0"
        style={{
          minHeight: compact ? 52 : 70,
          border: '1px solid var(--color-separator)',
          background: 'var(--color-fill)',
        }}
      />
    );
  }

  const isBye = Boolean(player.isBye);
  const weekPts = player.weekPts ?? null;
  const projectedPts = player.projection?.projected ?? null;
  const projMin = player.projection?.min ?? null;
  const projMax = player.projection?.max ?? null;

  const matchupMeta = [player.position, compact ? getCompactGameLabel(player) : getGameLabel(player)]
    .filter(Boolean)
    .join(' ');
  const rankText = player.weekRank ? `${player.weekRank.posLabel}${player.weekRank.rank}` : player.rank ? `${player.rank.posLabel}${player.rank.rank} season` : null;
  const weatherText = player.weather ? formatWeather(player.weather) : null;
  const projectionRangeText = !isBye && weekPts == null && projMin != null && projMax != null
    ? `${projMin.toFixed(1)}-${projMax.toFixed(1)} range`
    : null;
  const metricText = isBye ? null : weekPts == null
    ? projectedPts != null ? `proj ${projectedPts.toFixed(1)}` : null
    : weekPts.toFixed(2);
  const metricLabel = !isBye && (weekPts != null || projectedPts != null) ? 'pts' : null;
  const hasMetric = metricText != null;
  const hasMetricSlot = hasMetric || isBye;
  const detailSegments = compact
    ? [rankText].filter(Boolean)
    : [rankText, weatherText, projectionRangeText].filter(Boolean);
  const rowAccent = player.teamTheme?.accent ?? 'var(--color-separator)';
  const gridTemplate = compact
    ? 'minmax(0, 1fr) minmax(34px, auto)'
    : hasMetricSlot
      ? '44px minmax(0, 1fr) auto 36px auto'
      : '44px minmax(0, 1fr) auto auto';
  const scoreFontSize = `${Math.max(compact ? 10 : 12, Math.min(compact ? 13 : 16, nameFontSize + 2))}px`;

  return (
    <CompanionPlayerRow
      player={player}
      darkMode={darkMode}
      compact={compact}
      interactive={Boolean(onSelect)}
      onClick={onSelect}
      className="companion-matchup-player-row"
      showAvatar={!compact}
      showPosition={false}
      showTeamLogo={!compact}
      metaSegments={[matchupMeta, ...detailSegments]}
      columns={isBye ? [
        <CompanionPlayerStatus
          key="bye-week"
          label="Bye Week"
          className="companion-matchup-bye-metric"
        />,
      ] : hasMetric ? [
        <CompanionPlayerMetric
          key="score"
          compact
          align="end"
          value={metricText}
          label={compact ? null : metricLabel}
        />,
      ] : null}
      gridTemplate={gridTemplate}
      columnGridTemplate={compact ? 'minmax(34px, auto)' : undefined}
      name={player.name}
      style={{
        borderRadius: 0,
        borderLeftWidth: isRight ? 1 : 4,
        borderLeftColor: isRight ? 'var(--color-separator)' : rowAccent,
        borderRight: isRight ? `4px solid ${rowAccent}` : undefined,
        minHeight: compact ? 48 : 70,
        padding: compact
          ? isRight ? '7px 6px' : '7px 6px 7px 7px'
          : isRight ? '10px 12px' : '10px 18px 10px 12px',
        '--matchup-player-name-size': `${nameFontSize}px`,
        '--matchup-player-score-size': scoreFontSize,
      }}
    />
  );
}

const TEAM_SCORE_LABELS = {
  ...STAT_LABELS,
  bonus_rush_rec_yd_100: '100+ Rush/Rec Yd Bonus',
  bonus_rush_rec_yd_200: '200+ Rush/Rec Yd Bonus',
  bonus_pass_cmp_25: '25+ Completion Bonus',
  bonus_rush_att_20: '20+ Carry Bonus',
  pass_td_40p: '40+ Pass TD Bonus',
  pass_td_50p: '50+ Pass TD Bonus',
  pass_cmp_40p: '40+ Completion Bonus',
  rush_td_40p: '40+ Rush TD Bonus',
  rush_td_50p: '50+ Rush TD Bonus',
  rec_td_40p: '40+ Rec TD Bonus',
  rec_td_50p: '50+ Rec TD Bonus',
  rec_40p: '40+ Reception Bonus',
  rush_40p: '40+ Rush Bonus',
  bonus_def_fum_td_50p: '50+ Fumble TD Bonus',
  bonus_def_int_td_50p: '50+ INT TD Bonus',
  idp_qb_hit: 'QB Hit',
  idp_pass_def: 'Pass Deflection',
  idp_fum_rec: 'Fumble Recovery',
  idp_fum_ret_yd: 'Fumble Return Yds',
  idp_safe: 'Safety',
  idp_sack_yd: 'Sack Yards',
  idp_int_ret_yd: 'INT Return Yds',
  idp_int_td: 'INT Return TD',
  idp_fr_yd: 'Fumble Return Yds',
  idp_fr_td: 'Fumble Return TD',
  def_td: 'DST TD',
  def_2pt: 'DST 2PT Return',
  def_3_and_out: '3 and Out',
  def_4_and_stop: '4th Down Stop',
  def_forced_punts: 'Forced Punt',
  def_pass_def: 'Pass Deflection',
  def_st_tkl_solo: 'ST Solo Tackle',
  def_kr_yd: 'Kick Return Yds',
  def_pr_yd: 'Punt Return Yds',
  sack: 'DST Sack',
};

function formatScoringKeyLabel(key) {
  return key
    .replace(/^bonus_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function TeamScoreBreakdown({ teamName, playerIds, week, onClose }) {
  const { weeklyStats, activeScoringSettings, players } = useSleeperBase();

  const { rows, total } = useMemo(() => {
    if (!weeklyStats) return { rows: [], total: 0 };
    const settings = { ...DEFAULT_SCORING, ...activeScoringSettings };
    const totals = new Map();
    let exactTotal = 0;

    const addRow = (key, label, statVal, pts, showStat = true) => {
      if (Math.abs(pts) < 0.005) return;
      const existing = totals.get(key);
      if (existing) {
        existing.pts += pts;
        existing.statVal = showStat
          ? ((existing.statVal ?? 0) + (statVal ?? 0))
          : null;
        return;
      }
      totals.set(key, {
        key,
        label,
        statVal: showStat ? (statVal ?? 0) : null,
        pts,
      });
    };

    for (const id of playerIds) {
      const weekly = weeklyStats[id] ?? [];
      const entry = weekly.find(w => w.week === week);
      if (!entry) continue;
      const position = players?.[id]?.position ?? null;
      exactTotal += calcPoints(entry, settings, position);

      for (const [statKey, statVal] of Object.entries(entry)) {
        if (!statVal) continue;
        const scoringKey = STAT_TO_SCORING_KEY[statKey];
        if (!scoringKey || !settings[scoringKey]) continue;
        addRow(
          scoringKey,
          TEAM_SCORE_LABELS[statKey] ?? TEAM_SCORE_LABELS[scoringKey] ?? formatScoringKeyLabel(scoringKey),
          Number(statVal),
          Number(statVal) * settings[scoringKey],
          true,
        );
      }

      if (position && entry.rec) {
        const bonusKey = position === 'TE'
          ? 'bonus_rec_te'
          : position === 'RB'
            ? 'bonus_rec_rb'
            : position === 'WR'
              ? 'bonus_rec_wr'
              : null;
        if (bonusKey && settings[bonusKey]) {
          addRow(bonusKey, `${position} Rec Bonus`, Number(entry.rec), Number(entry.rec) * settings[bonusKey], true);
        }
      }

      if (position === 'RB' && entry.rush_att && settings.bonus_rush_att) {
        addRow('bonus_rush_att', 'Carry Bonus', Number(entry.rush_att), Number(entry.rush_att) * settings.bonus_rush_att, true);
      }

      if (position === 'QB' && settings.bonus_fd_qb) {
        const fdTotal = Number(entry.pass_fd ?? 0) + Number(entry.rush_fd ?? 0);
        if (fdTotal) addRow('bonus_fd_qb', 'QB First Down Bonus', fdTotal, fdTotal * settings.bonus_fd_qb, true);
      }

      if (position === 'RB' && settings.bonus_fd_rb) {
        const fdTotal = Number(entry.rush_fd ?? 0) + Number(entry.rec_fd ?? 0);
        if (fdTotal) addRow('bonus_fd_rb', 'RB First Down Bonus', fdTotal, fdTotal * settings.bonus_fd_rb, true);
      }

      if (position === 'WR' && settings.bonus_fd_wr && entry.rec_fd) {
        addRow('bonus_fd_wr', 'WR First Down Bonus', Number(entry.rec_fd), Number(entry.rec_fd) * settings.bonus_fd_wr, true);
      }

      if (position === 'TE' && settings.bonus_fd_te && entry.rec_fd) {
        addRow('bonus_fd_te', 'TE First Down Bonus', Number(entry.rec_fd), Number(entry.rec_fd) * settings.bonus_fd_te, true);
      }
    }

    const rows = Array.from(totals.values())
      .map(row => ({
        ...row,
        pts: Math.round(row.pts * 100) / 100,
        statVal: row.statVal != null ? Math.round(row.statVal * 100) / 100 : null,
      }))
      .sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts));

    const breakdownTotal = rows.reduce((sum, row) => sum + row.pts, 0);
    const remainder = Math.round((exactTotal - breakdownTotal) * 100) / 100;
    if (Math.abs(remainder) >= 0.01) {
      rows.push({
        key: 'other_adjustments',
        label: 'Other Scoring Adjustments',
        statVal: null,
        pts: remainder,
      });
    }

    return {
      rows,
      total: Math.round(exactTotal * 100) / 100,
    };
  }, [weeklyStats, activeScoringSettings, playerIds, week, players]);

  return (
    <Modal
      onClose={onClose}
      mobileSheet
      ariaLabel={`${teamName} scoring breakdown`}
      containerClassName="team-score-breakdown-sheet"
      containerStyle={{
        background: 'var(--color-bg-secondary)',
        maxWidth: '480px',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        '--modal-mobile-sheet-max-height': 'min(86dvh, calc(100dvh - env(safe-area-inset-top) - 8px))',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 shrink-0" style={{ borderBottom: '1px solid var(--color-separator)' }}>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-base truncate" style={{ color: 'var(--color-label)' }}>
                {teamName}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--color-label-tertiary)' }}>
                Week {week} · Scoring Breakdown
              </div>
            </div>
            <button onClick={onClose} className="shrink-0 p-1" style={{ color: 'var(--color-label-secondary)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

      {/* Column headers */}
      <div
        className="flex items-center px-5 py-2 sticky top-0"
        style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-separator)' }}
      >
        <span className="flex-1 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Category</span>
        <span className="w-14 text-right text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Value</span>
        <span className="w-16 text-right text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Pts</span>
      </div>

      {/* Body */}
      <div className="overflow-y-auto flex-1">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>No stat data for Week {week}.</span>
          </div>
        ) : (
          <>
            {rows.map(row => (
              <div
                key={row.key}
                className="flex items-center px-5 py-2.5"
                style={{ borderBottom: '1px solid var(--color-separator)' }}
              >
                <span className="flex-1 text-sm" style={{ color: 'var(--color-label)' }}>
                  {row.label}
                </span>
                <span className="w-14 text-right text-sm tabular-nums" style={{ color: 'var(--color-label-secondary)' }}>
                  {Number.isInteger(row.statVal) ? row.statVal : row.statVal.toFixed(1)}
                </span>
                <span
                  className="w-16 text-right text-sm font-semibold tabular-nums"
                  style={{ color: row.pts < 0 ? 'var(--color-accent-red)' : 'var(--color-label)' }}
                >
                  {row.pts > 0 ? `+${row.pts.toFixed(2)}` : row.pts.toFixed(2)}
                </span>
              </div>
            ))}

            {/* Total row */}
            <div
              className="flex items-center px-5 py-4"
              style={{ background: 'var(--color-fill-secondary)', borderTop: '1px solid var(--color-separator)' }}
            >
              <span className="flex-1 text-sm font-bold" style={{ color: 'var(--color-label)' }}>Total</span>
              <span className="text-xl font-bold tabular-nums" style={{ color: 'var(--color-signature)' }}>
                {total.toFixed(2)}
              </span>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function MatchupStatsLoadingBanner() {
  const statsProgress = useSleeperStatsProgress();

  return (
    <div className="mx-2 sm:mx-4 mb-4 px-4 py-3 rounded-xl flex items-center gap-3" style={{ background: 'var(--color-fill)', border: '1px solid var(--color-separator)' }}>
      <div className="h-1 flex-1 rounded-full overflow-hidden" style={{ background: 'var(--color-fill-secondary)' }}>
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${statsProgress}%`, background: 'var(--color-signature)' }} />
      </div>
      <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--color-label-tertiary)' }}>Loading stats {statsProgress}%</span>
    </div>
  );
}

function EmptyState({ title, description = null }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <span className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>{title}</span>
      {description && (
        <span className="mt-1 max-w-md text-xs leading-5" style={{ color: 'var(--color-label-secondary)' }}>
          {description}
        </span>
      )}
    </div>
  );
}
