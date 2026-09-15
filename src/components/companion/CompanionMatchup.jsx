import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSleeperBase, useSleeperStatsProgress } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import { calcPoints } from '../../utils/scoringEngine';
import {
  buildDefenseTable,
  computeLeagueAvgPPGByPositionFromDefenseTable,
  computePositionalRanks,
  computeWeeklyPositionalRanks,
  getAvgPPG,
  getDefensePercentile,
  getDefenseStrength,
} from '../../utils/projectionEngine';
import { buildProjectionContext, getProjectionScoreTone, isStarterGameStarted, projectFromGameInfo } from '../../utils/starterProjections.js';
import { STADIUMS, WEEK_DATES_2025 } from '../../data/stadiums';
import { fetchGameWeather, formatWeather } from '../../api/weatherApi';
import { getFantasyProjections } from '../../api/fantasyProjectionsApi.js';
import { getLiveMatchups } from '../../api/sleeperApi';
import {
  getFantasyProjectionSourceLabel,
  mapFantasyProjectionsToSleeperPlayers,
} from '../../utils/fantasyProjections.js';
import PlayerMatchupBreakdown from './PlayerMatchupBreakdown';
import useMatchupProjectionBaselines from '../../hooks/useMatchupProjectionBaselines.js';
import { buildDrilldownOpponentContext } from '../../utils/playerMatchupPresentation.js';
import { isEspnFantasyGameLogPosition, loadEspnFantasyGameLogWeekRow } from '../../utils/espnFantasyGameLogRows.js';
import { buildFantasyMatchupScoringBreakdown } from '../../utils/fantasyMatchupBreakdown.js';
import CompanionLoadingState from './CompanionLoadingState';
import Modal from '../Modal';
import MatchupRivalryModal from './MatchupRivalryModal';
import useCardGlow from '../../hooks/useCardGlow.jsx';
import useMediaQuery from '../../hooks/useMediaQuery.js';
import { getPlayerRowTeamTheme } from '../../utils/playerRowTheme';
import { getPlayerAvailabilityStatus } from '../../utils/playerAvailabilityStatus.js';
import { debugCompanionLog, debugCompanionMeasure, debugCompanionTimeAsync } from '../../utils/companionPerfDebug';
import { CompanionSelectorButton, CompanionSelectorRail, CompanionSegmentedControl } from './CompanionSelectorControls.jsx';
import { POSITION_COLORS } from '../../utils/companionAssetVisuals.js';
import CompanionPlayerRow, { CompanionPlayerMetric, CompanionPlayerStatus } from './CompanionPlayerRow.jsx';
import PlayerAvatar from '../shared/PlayerAvatar.jsx';
import { buildFantasyPaletteSlots, fantasyHeroGradient, getFantasyTeamPalette } from '../../utils/fantasyTeamIdentity.js';
import { ArrowsLeftRightIcon } from '@phosphor-icons/react/ArrowsLeftRight';
import { ChartLineUpIcon } from '@phosphor-icons/react/ChartLineUp';
import { ClockIcon } from '@phosphor-icons/react/Clock';
import { InfoIcon } from '@phosphor-icons/react/Info';
import { TrophyIcon } from '@phosphor-icons/react/Trophy';
import StatsProgressBanner from '../ui/StatsProgressBanner';
import SeasonHintBanner from '../ui/SeasonHintBanner';
import UiEmptyState from '../ui/EmptyState';
import {
  buildFantasyMatchupGroups,
  findMatchupGroupIndexByRosterId,
} from '../../utils/fantasyMatchups.js';
import { buildMatchupWinProbability, hasFinalMatchupGameEvidence } from '../../utils/matchupWinProbability.js';
import { formatWinProbabilityPair, getStarterOutlook } from '../../utils/liveWinProbability.js';
import {
  getFallbackRemainingGameFraction,
  getOfficialMatchupRowPoints,
  hasReconciledMatchup,
  isCompleteScheduleWeek,
} from '../../utils/liveScoringFeed.js';
import { getLeagueHistorySnapshot, buildLeagueHistoryModel } from '../../utils/leagueHistory.js';
import { isFullGameWeekComplete } from '../../utils/matchupTaleOfTape.js';
import PlayerMatchupCompare from './PlayerMatchupCompare.jsx';

const TOTAL_WEEKS = 18;
const COMPACT_PHONE_QUERY = '(max-width: 480px)';
const MATCHUP_RESPONSE_CACHE = new Map();
const MATCHUP_RESPONSE_IN_FLIGHT = new Map();
const MATCHUP_TAPE_HISTORY_CACHE = new Map();
const FINAL_MATCHUP_RECONCILIATION_RETRY_MS = 30000;

function isTeamDefensePosition(position) {
  const normalized = String(position ?? '').toUpperCase();
  return normalized === 'DEF' || normalized === 'DST' || normalized === 'D/ST';
}

function isRosterFantasyByeWeek(matchupRows, rosterId) {
  if (!Array.isArray(matchupRows) || rosterId == null) return false;
  const rosterMatchup = matchupRows.find(row => String(row?.roster_id) === String(rosterId));
  if (!rosterMatchup) return false;
  if (rosterMatchup.metadata?.isBye === true) return true;
  if (rosterMatchup.matchup_id == null) return true;
  const sides = matchupRows.filter(row => String(row?.matchup_id) === String(rosterMatchup.matchup_id));
  return sides.length === 1;
}

function areNumberSetsEqual(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function getLongestTokenLength(label) {
  return String(label ?? '')
    .trim()
    .split(/\s+/)
    .reduce((max, token) => Math.max(max, token.length), 0);
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

function summarizeTeamForecast(players) {
  const rosterPlayers = (players ?? []).filter(Boolean);
  const projectedPlayers = rosterPlayers.filter((player) => Number.isFinite(Number(player?.projection?.projected)));
  if (!projectedPlayers.length) return null;

  const total = projectedPlayers.reduce((sum, player) => sum + Number(player.projection.projected), 0);
  const sources = [...new Set(projectedPlayers.map((player) => getFantasyProjectionSourceLabel(player.projection)).filter(Boolean))];
  return {
    total: Math.round(total * 10) / 10,
    projectedCount: projectedPlayers.length,
    starterCount: rosterPlayers.length,
    complete: projectedPlayers.length === rosterPlayers.length,
    sourceLabel: sources.length === 1 ? sources[0] : sources.length > 1 ? 'Mixed model' : null,
  };
}

function formatForecastFreshness(collectedAt) {
  const collectedMs = Date.parse(collectedAt ?? '');
  if (!Number.isFinite(collectedMs)) return null;
  const minutes = Math.max(0, Math.round((Date.now() - collectedMs) / 60000));
  if (minutes < 2) return 'collected just now';
  if (minutes < 60) return `collected ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `collected ${hours}h ago`;
  return `collected ${Math.round(hours / 24)}d ago`;
}

function getMatchupForecastSourceLabel(winProbability) {
  if (!winProbability) return null;
  const source = winProbability.primarySource;
  if (source === 'balldontlie') {
    return `BALLDONTLIE projection · ${winProbability.usesLeagueScoring ? 'league scoring' : 'provider scoring fallback'}`;
  }
  if (source === 'current-season') return 'GridShift model · current season';
  if (source === 'prior-season') return 'GridShift model · prior season';
  if (source === 'mixed') return 'Mixed forecast sources';
  return 'GridShift fallback estimate';
}

export default function CompanionMatchup({
  onViewPlayer,
  onComparePlayers = null,
  onOpenHistoricalMatchup = null,
  initialWeekRequest = null,
  selectedWeek = null,
  onWeekChange = null,
  selectedRosterId = null,
  onSelectedRosterChange = null,
  onConsumeInitialWeekRequest = null,
}) {
  const { darkMode } = useTheme();
  const isCompactPhone = useMediaQuery(COMPACT_PHONE_QUERY);
  const {
    platform, selectedLeagueId, league, season,
    rosters, players, loadPlayers,
    weeklyStats, seasonStats, scheduleMap, loadSeasonStats,
    statsBySeason, loadStatsForSeason,
    statsLoading, activeScoringSettings, scoringOverride,
    myRoster, getUserDisplayName, espnIdOverrides, loadMatchups, linkedLeagueHistory,
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
  const [showBench, setShowBench] = useState(true);
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const [showMatchupPicker, setShowMatchupPicker] = useState(false);
  const [selectedRosterIdState, setSelectedRosterIdState] = useState(selectedRosterId);
  const [byeWeeks, setByeWeeks] = useState(() => new Set());
  const [selectedPlayer, setSelectedPlayer] = useState(null); // { id, projection }
  const [selectedTeam, setSelectedTeam] = useState(null); // 'mine' | 'opp'
  const [weatherMap, setWeatherMap] = useState({}); // { 'TEAM-DATE': weather }
  const [providerProjectionState, setProviderProjectionState] = useState({ key: '', status: 'idle', map: new Map(), error: null });
  const [finalMatchupReconciliation, setFinalMatchupReconciliation] = useState({ key: '', status: 'idle', attempts: 0 });
  const [taleOfTape, setTaleOfTape] = useState(null);
  const [rivalrySelection, setRivalrySelection] = useState(null);
  const [tapeHistoryState, setTapeHistoryState] = useState({ key: '', status: 'idle', model: null });
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
  const tapeHistoryRequestRef = useRef(null);

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
    const cacheKey = `${selectedLeagueId}|${season}|${requestedWeek}`;
    if (MATCHUP_RESPONSE_CACHE.has(cacheKey)) {
      debugCompanionLog('Matchup fantasy matchups cache hit', { selectedLeagueId, week: requestedWeek });
      setMatchups(MATCHUP_RESPONSE_CACHE.get(cacheKey));
      setWeek(requestedWeek);
      setMatchupLoading(false);
      return;
    }
    if (MATCHUP_RESPONSE_IN_FLIGHT.has(cacheKey)) {
      let cancelled = false;
      debugCompanionLog('Matchup fantasy matchups in-flight cache hit', { selectedLeagueId, week: requestedWeek });
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
    const request = debugCompanionTimeAsync('Matchup fantasy matchups fetch', () => (
      loadMatchups(selectedLeagueId, requestedWeek)
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
  }, [loadMatchups, selectedLeagueId, requestedWeek]);

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

  const userRosterData = myRoster();
  const userRosterId = userRosterData?.roster_id ?? null;

  useEffect(() => {
    setSelectedRosterIdState(selectedRosterId);
  }, [selectedRosterId]);

  const matchupGroups = useMemo(() => buildFantasyMatchupGroups(
    matchups,
    rosters,
    getUserDisplayName,
    userRosterId,
  ), [getUserDisplayName, matchups, rosters, userRosterId]);

  const selectedMatchupIndex = useMemo(() => {
    const requestedIndex = findMatchupGroupIndexByRosterId(matchupGroups, selectedRosterIdState);
    if (requestedIndex >= 0) return requestedIndex;
    const userIndex = findMatchupGroupIndexByRosterId(matchupGroups, userRosterId);
    return userIndex >= 0 ? userIndex : 0;
  }, [matchupGroups, selectedRosterIdState, userRosterId]);
  const selectedMatchupGroup = matchupGroups[selectedMatchupIndex] ?? null;
  const leftSide = selectedMatchupGroup?.sides?.[0] ?? null;
  const rightSide = selectedMatchupGroup?.sides?.[1] ?? null;
  const myMatchup = leftSide?.row ?? null;
  const opponentMatchup = rightSide?.row ?? null;
  const myRosterData = leftSide?.roster ?? (myMatchup ? { roster_id: myMatchup.roster_id, players: myMatchup.players ?? [] } : null);
  const opponentRoster = rightSide?.roster ?? (opponentMatchup ? { roster_id: opponentMatchup.roster_id, players: opponentMatchup.players ?? [] } : null);
  const myRosterId = leftSide?.rosterId ?? null;
  const myName = leftSide?.name ?? 'Team';
  const opponentName = rightSide?.name ?? 'Opponent';
  const leftIsUser = Boolean(leftSide?.isUser);
  const rightIsUser = Boolean(rightSide?.isUser);
  const fantasyPaletteSlots = useMemo(() => buildFantasyPaletteSlots(rosters), [rosters]);
  const myFantasyPalette = useMemo(
    () => getFantasyTeamPalette(myRosterId, fantasyPaletteSlots),
    [fantasyPaletteSlots, myRosterId],
  );
  const opponentFantasyPalette = useMemo(
    () => getFantasyTeamPalette(opponentMatchup?.roster_id ?? rightSide?.rosterId, fantasyPaletteSlots),
    [fantasyPaletteSlots, opponentMatchup?.roster_id, rightSide?.rosterId],
  );
  const hasAdvancedStats = Boolean(insightsRequested && weeklyStats && seasonStats && players);
  const playerCount = players ? Object.keys(players).length : 0;
  const seasonStatCount = seasonStats ? Object.keys(seasonStats).length : 0;
  const weeklyStatCount = weeklyStats ? Object.keys(weeklyStats).length : 0;
  const matchupWeekSchedule = scheduleMap?.[week] ?? scheduleMap?.[String(week)] ?? null;
  const isFullGameWeekConcluded = isFullGameWeekComplete(matchupWeekSchedule);
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

  const previousSeasonKey = useMemo(() => {
    const seasonYear = Number(season);
    return Number.isInteger(seasonYear) && seasonYear > 0 ? String(seasonYear - 1) : null;
  }, [season]);

  const previousSeasonPackage = previousSeasonKey ? statsBySeason?.[previousSeasonKey] ?? null : null;
  const providerProjections = providerProjectionState.map;
  const projectionLoadKey = useMemo(() => [
    season ?? '',
    week,
    playerCount,
    JSON.stringify(activeScoringSettings ?? {}),
  ].join('|'), [activeScoringSettings, playerCount, season, week]);
  const projectionRequestRef = useRef(null);

  useEffect(() => {
    if (!hasAdvancedStats || !players || !selectedLeagueId || !season || !week) return undefined;
    if (projectionRequestRef.current?.key === projectionLoadKey) return undefined;

    const controller = new AbortController();
    let cancelled = false;
    projectionRequestRef.current = { key: projectionLoadKey, controller };
    setProviderProjectionState({ key: projectionLoadKey, status: 'loading', map: new Map(), error: null });

    const loadEarlySeasonHistory = async () => {
      if (
        platform !== 'sleeper'
        || week > 4
        || !previousSeasonKey
        || previousSeasonPackage?.weeklyStats
        || cancelled
      ) return;
      try {
        await loadStatsForSeason(previousSeasonKey);
      } catch {
        // The current-season model and BDL remain fully optional paths.
      }
    };

    void getFantasyProjections({ season, week, signal: controller.signal })
      .then((payload) => {
        if (cancelled) return;
        const mapped = mapFantasyProjectionsToSleeperPlayers({
          players,
          projectionRows: payload?.data,
          scoringSettings: activeScoringSettings,
        });
        setProviderProjectionState({ key: projectionLoadKey, status: 'ready', map: mapped, error: null });
        void loadEarlySeasonHistory();
      })
      .catch((error) => {
        if (cancelled || error?.name === 'AbortError') return;
        setProviderProjectionState({ key: projectionLoadKey, status: 'unavailable', map: new Map(), error: error?.message ?? null });
        void loadEarlySeasonHistory();
      });

    return () => {
      cancelled = true;
      controller.abort();
      if (projectionRequestRef.current?.controller === controller) {
        projectionRequestRef.current = null;
      }
    };
  }, [
    activeScoringSettings,
    hasAdvancedStats,
    loadStatsForSeason,
    players,
    platform,
    previousSeasonKey,
    previousSeasonPackage?.weeklyStats,
    projectionLoadKey,
    season,
    selectedLeagueId,
    week,
  ]);
  const myPointsMap = myMatchup?.players_points ?? {};
  const oppPointsMap = opponentMatchup?.players_points ?? {};
  const fantasyPlatformLabel = platform === 'espn' ? 'ESPN' : 'Sleeper';
  const matchupSideCount = selectedMatchupGroup?.sides?.length ?? 0;
  const isByeMatchup = Boolean(myMatchup) && (
    matchupSideCount === 1
    || isRosterFantasyByeWeek(matchups, myRosterId)
  );
  const myBreakdownPlayerIds = useMemo(() => {
    const starters = (myMatchup?.starters ?? []).filter(Boolean);
    if (starters.length) return starters;
    return (myMatchup?.players ?? []).filter(Boolean);
  }, [myMatchup]);
  const opponentBreakdownPlayerIds = useMemo(
    () => (opponentMatchup?.starters ?? []).filter(Boolean),
    [opponentMatchup],
  );

  useEffect(() => {
    if (platform !== 'espn' || !selectedLeagueId || !myRosterId) {
      setByeWeeks((prev) => (prev.size ? new Set() : prev));
      return undefined;
    }

    let cancelled = false;
    void Promise.all(weekOptions.map(async (optionWeek) => {
      const rows = await loadMatchups(selectedLeagueId, optionWeek);
      return isRosterFantasyByeWeek(rows, myRosterId) ? optionWeek : null;
    })).then((weekResults) => {
      if (cancelled) return;
      const next = new Set(weekResults.filter(Number.isFinite));
      setByeWeeks((prev) => (areNumberSetsEqual(prev, next) ? prev : next));
    });

    return () => {
      cancelled = true;
    };
  }, [loadMatchups, myRosterId, platform, selectedLeagueId, weekOptions]);

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
    if (!hasAdvancedStats || !isFullGameWeekConcluded) return {};
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
  }, [hasAdvancedStats, weeklyStats, players, activeScoringSettings, week, matchupDataCacheKey, weeklyStatCount, isFullGameWeekConcluded]);

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
  }, [hasAdvancedStats, weeklyStats, players, scheduleMap, activeScoringSettings, matchupDataCacheKey, playerCount, weeklyStatCount, week]);

  // Drilldown-only historical context. This table is never used by the shared
  // projection or Heatmap classification paths.
  const previousDefenseTable = useMemo(() => {
    const previousWeeklyStats = previousSeasonPackage?.weeklyStats;
    if (!hasAdvancedStats || !previousWeeklyStats || !players) return null;
    return buildDefenseTable(previousWeeklyStats, players, null, activeScoringSettings);
  }, [activeScoringSettings, hasAdvancedStats, players, previousSeasonPackage?.weeklyStats]);

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

  const rosterOwnerById = useMemo(
    () => new Map((rosters ?? []).map((roster) => [String(roster?.roster_id), roster?.owner_id ?? null])),
    [rosters],
  );

  const loadTaleOfTapeHistory = useCallback((historyKey) => {
    if (platform !== 'sleeper' || !historyKey || !linkedLeagueHistory?.length) {
      setTapeHistoryState({ key: historyKey, status: 'unavailable', model: null });
      return;
    }
    const cached = MATCHUP_TAPE_HISTORY_CACHE.get(historyKey);
    if (cached) {
      setTapeHistoryState({ key: historyKey, status: 'ready', model: cached });
      return;
    }
    if (tapeHistoryRequestRef.current?.key === historyKey) {
      setTapeHistoryState({ key: historyKey, status: 'loading', model: null });
      return;
    }

    const request = Promise.all(linkedLeagueHistory.map((entry) => getLeagueHistorySnapshot({
      league: entry.league,
      season: entry.season,
      completed: Number(entry.season) < Number(season),
    })))
      .then((snapshots) => buildLeagueHistoryModel(snapshots, players ?? {}));
    tapeHistoryRequestRef.current = { key: historyKey, request };
    setTapeHistoryState({ key: historyKey, status: 'loading', model: null });
    request
      .then((model) => {
        MATCHUP_TAPE_HISTORY_CACHE.set(historyKey, model);
        if (tapeHistoryRequestRef.current?.key === historyKey) {
          setTapeHistoryState({ key: historyKey, status: 'ready', model });
        }
      })
      .catch(() => {
        if (tapeHistoryRequestRef.current?.key === historyKey) {
          tapeHistoryRequestRef.current = null;
          setTapeHistoryState({ key: historyKey, status: 'error', model: null });
        }
      });
  }, [linkedLeagueHistory, platform, players, season]);

  const openTaleOfTape = useCallback((leftPlayer, rightPlayer, slotPos) => {
    if (!leftPlayer || !rightPlayer || leftPlayer.name === 'Empty' || rightPlayer.name === 'Empty') return;
    if (onComparePlayers) {
      const leftSeed = toCompareSeed(leftPlayer);
      const rightSeed = toCompareSeed(rightPlayer);
      if (leftSeed && rightSeed) {
        onComparePlayers(leftSeed, rightSeed);
        return;
      }
    }
    setTaleOfTape({
      left: leftPlayer,
      right: rightPlayer,
      slotLabel: SLOT_LABELS[slotPos] ?? slotPos ?? leftPlayer.position ?? rightPlayer.position ?? 'Position',
    });
  }, [onComparePlayers, toCompareSeed]);

  const openRivalry = () => {
    const historyKey = `${selectedLeagueId}|${season}`;
    setRivalrySelection({
      historyKey,
      leftManagerId: rosterOwnerById.get(String(leftSide?.rosterId)) ?? null,
      rightManagerId: rosterOwnerById.get(String(rightSide?.rosterId)) ?? null,
      leftName: myName,
      rightName: opponentName,
      leftPalette: myFantasyPalette,
      rightPalette: opponentFantasyPalette,
    });
    loadTaleOfTapeHistory(historyKey);
  };

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
    const opponentFantasyContext = hasAdvancedStats && oppTeam && defenseTable && !isDefensivePos
      ? buildDrilldownOpponentContext({
          currentDefenseTable: defenseTable,
          priorDefenseTable: previousDefenseTable,
          oppTeam,
          position: p.position,
          beforeWeek: week,
        })
      : null;
    // Bye detection: week has games for other teams but not this team
    const weekHasGames = !!scheduleMap && Object.keys(scheduleMap[week] ?? {}).length > 0;
    const isBye = weekHasGames && !schedEntry && myTeam !== 'FA';
    const fallbackWeekPts = pointsMap && Number.isFinite(Number(pointsMap[id])) ? Number(pointsMap[id]) : null;
    const statWeekPts = weekEntry ? calcPoints(weekEntry, activeScoringSettings, p.position) : null;
    const preferStatWeekPts = platform === 'espn' && weekEntry && !isTeamDefensePosition(p.position);
    const gameStarted = isStarterGameStarted({
      scheduleEntry: schedEntry,
      weekEntry,
      fallbackPoints: fallbackWeekPts,
    });

    return {
      id,
      name: p.full_name || `${p.first_name} ${p.last_name}`,
      position: p.position,
      team: myTeam,
      weekPts: preferStatWeekPts ? statWeekPts : (fallbackWeekPts ?? statWeekPts),
      avgPPG: hasAdvancedStats ? getAvgPPG(weekly, activeScoringSettings, p.position) : null,
      rank: positionalRanks[id] ?? null,
      weekRank: isFullGameWeekConcluded ? weeklyRanks[id] ?? null : null,
      oppTeam,
      isHome,
      homeTeam,
      scheduleEntry: schedEntry,
      gameDate: schedEntry?.date ?? WEEK_DATES_2025[week] ?? null,
      gameStarted,
      stadium,
      isIndoor: stadium?.indoor ?? null,
      weekly,
      availabilityStatus: getPlayerAvailabilityStatus(p),
      defStrength,
      defPercentile,
      opponentFantasyContext,
      isBye,
      teamTheme: getPlayerRowTeamTheme(myTeam, darkMode),
    };
  }, [players, hasAdvancedStats, weeklyStats, activeScoringSettings, positionalRanks, weeklyRanks, week, scheduleMap, defenseTable, previousDefenseTable, darkMode, platform, isFullGameWeekConcluded]);

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
      const historicalPlayers = myMatchup.players?.length ? myMatchup.players : myRosterData.players;
      return (historicalPlayers ?? []).filter(id => !starterSet.has(id)).map(id => enrichPlayer(id, myPointsMap)).filter(Boolean);
    }, {
      rosterPlayerCount: myMatchup.players?.length ?? myRosterData.players?.length ?? 0,
      hasAdvancedStats,
    });
  }, [myRosterData, myMatchup, enrichPlayer, myPointsMap]);

  const oppBench = useMemo(() => {
    if (!opponentRoster || !opponentMatchup) return [];
    return debugCompanionMeasure('Matchup opponent bench enrich', () => {
      const starterSet = new Set(opponentMatchup.starters ?? []);
      const historicalPlayers = opponentMatchup.players?.length ? opponentMatchup.players : opponentRoster.players;
      return (historicalPlayers ?? []).filter(id => !starterSet.has(id)).map(id => enrichPlayer(id, oppPointsMap)).filter(Boolean);
    }, {
      rosterPlayerCount: opponentMatchup.players?.length ?? opponentRoster.players?.length ?? 0,
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

  // Shared projection context — the same assembly Companion Live uses, so both
  // tabs produce identical pre-kickoff projections for the same player/week.
  const projectionContext = useMemo(() => {
    if (!hasAdvancedStats) return null;
    return buildProjectionContext({
      weeklyStats,
      players,
      scheduleMap,
      scoringSettings: activeScoringSettings,
      week,
      defenseTable,
      leagueAvgByPos,
      historicalWeeklyStats: previousSeasonPackage?.weeklyStats ?? null,
      providerProjections,
    });
  }, [
    hasAdvancedStats,
    defenseTable,
    weeklyStats,
    players,
    scheduleMap,
    activeScoringSettings,
    week,
    leagueAvgByPos,
    previousSeasonPackage?.weeklyStats,
    providerProjections,
  ]);

  const addProjection = useCallback((player) => {
    if (!player || !projectionContext || player.name === 'Empty') return player;
    const date = player.gameDate ?? WEEK_DATES_2025[week];
    const key = player.homeTeam && date ? `${player.homeTeam}-${date}` : null;
    const weather = player.isIndoor ? null : (key ? (weatherMap[key] ?? null) : null);
    return { ...player, projection: projectFromGameInfo(player, projectionContext, { weather }), weather };
  }, [projectionContext, weatherMap, week]);

  // Add projections once weather is available
  const enrichedSlots = useMemo(() => {
    if (!hasAdvancedStats) return starterSlots;

    return debugCompanionMeasure('Matchup starter projections', () => starterSlots.map(slot => ({
      mine: addProjection(slot.mine),
      opp: addProjection(slot.opp),
      slotPos: slot.slotPos,
    })), {
      week,
      starterSlotCount: starterSlots.length,
      weatherEntries: Object.keys(weatherMap).length,
    });
  }, [addProjection, hasAdvancedStats, starterSlots, week, weatherMap]);

  const enrichedMyBench = useMemo(() => myBench.map(addProjection), [addProjection, myBench]);
  const enrichedOppBench = useMemo(() => oppBench.map(addProjection), [addProjection, oppBench]);
  const drilldownPlayers = useMemo(() => [
    ...enrichedSlots.flatMap(slot => [slot.mine, slot.opp]),
    ...enrichedMyBench, ...enrichedOppBench,
  ].filter(player => player?.id), [enrichedSlots, enrichedMyBench, enrichedOppBench]);
  const projectionBaselines = useMatchupProjectionBaselines({
    leagueId: selectedLeagueId, season, week, scoringSettings: activeScoringSettings,
    players: drilldownPlayers,
  });
  // Keep an open drilldown connected to incoming stats and projection updates.
  const selectedDrilldownPlayer = selectedPlayer
    ? drilldownPlayers.find(player => String(player.id) === String(selectedPlayer.id)) ?? null
    : null;
  const drilldownBenchComparison = (() => {
    if (!selectedDrilldownPlayer) return null;
    const side = leftIsUser ? 'mine' : rightIsUser ? 'opp' : null;
    if (!side) return null;
    const starterSlot = enrichedSlots.find(slot => String(slot[side]?.id) === String(selectedDrilldownPlayer.id));
    if (!starterSlot) return null;
    const roster = side === 'mine' ? myRosterData : opponentRoster;
    return {
      isUser: true,
      starter: selectedDrilldownPlayer,
      slot: starterSlot.slotPos,
      bench: side === 'mine' ? enrichedMyBench : enrichedOppBench,
      excludedIds: [...(roster?.reserve ?? []), ...(roster?.taxi ?? [])],
      players,
    };
  })();


  const currentMatchupId = myMatchup?.matchup_id ?? opponentMatchup?.matchup_id ?? null;
  const hasFinalMatchupGameEvidenceForWeek = useMemo(() => (
    hasFinalMatchupGameEvidence(
      starterSlots.flatMap((slot) => [slot.mine, slot.opp]),
      {
        scheduleWeekComplete: isCompleteScheduleWeek(matchupWeekSchedule),
      },
    )
  ), [matchupWeekSchedule, starterSlots]);
  const finalMatchupReconciliationKey = selectedLeagueId && currentMatchupId != null
    ? `${selectedLeagueId}:${season}:${week}:${currentMatchupId}`
    : null;
  const hasCompleteOfficialMatchupPoints = useMemo(() => (
    currentMatchupId != null && hasReconciledMatchup(matchups, currentMatchupId)
  ), [currentMatchupId, matchups]);
  const shouldReconcileFinalMatchup = Boolean(
    platform === 'sleeper'
    && hasFinalMatchupGameEvidenceForWeek
    && finalMatchupReconciliationKey,
  );
  const matchupSettlementConfirmed = Boolean(
    hasFinalMatchupGameEvidenceForWeek
    && hasCompleteOfficialMatchupPoints
    && (platform !== 'sleeper' || finalMatchupReconciliation.status === 'success'),
  );

  useEffect(() => {
    setFinalMatchupReconciliation({
      key: finalMatchupReconciliationKey,
      status: 'idle',
      attempts: 0,
    });
  }, [finalMatchupReconciliationKey]);

  useEffect(() => {
    if (
      !shouldReconcileFinalMatchup
      || !selectedLeagueId
      || currentMatchupId == null
      || finalMatchupReconciliation.key !== finalMatchupReconciliationKey
      || finalMatchupReconciliation.status !== 'idle'
    ) return undefined;

    let cancelled = false;
    const attempts = finalMatchupReconciliation.attempts + 1;
    setFinalMatchupReconciliation({
      key: finalMatchupReconciliationKey,
      status: 'pending',
      attempts,
    });
    getLiveMatchups(selectedLeagueId, week)
      .then((rows) => {
        if (cancelled) return;
        const nextMatchups = Array.isArray(rows) ? rows : [];
        const reconciled = hasReconciledMatchup(nextMatchups, currentMatchupId);
        if (reconciled) {
          MATCHUP_RESPONSE_CACHE.set(`${selectedLeagueId}|${season}|${week}`, nextMatchups);
          setMatchups(nextMatchups);
        }
        setFinalMatchupReconciliation({
          key: finalMatchupReconciliationKey,
          status: reconciled ? 'success' : 'incomplete',
          attempts,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setFinalMatchupReconciliation({
          key: finalMatchupReconciliationKey,
          status: 'error',
          attempts,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    currentMatchupId,
    finalMatchupReconciliation.attempts,
    finalMatchupReconciliation.key,
    finalMatchupReconciliation.status,
    finalMatchupReconciliationKey,
    platform,
    season,
    selectedLeagueId,
    shouldReconcileFinalMatchup,
    week,
  ]);

  // Sleeper may publish official player points shortly after the last NFL
  // game is final. Keep the forecast visible until a fresh response proves
  // both sides are complete, then retry quietly if that response lags.
  useEffect(() => {
    if (
      !shouldReconcileFinalMatchup
      || finalMatchupReconciliation.key !== finalMatchupReconciliationKey
      || !['error', 'incomplete'].includes(finalMatchupReconciliation.status)
    ) return undefined;
    const retryDelay = Math.min(
      FINAL_MATCHUP_RECONCILIATION_RETRY_MS * Math.max(1, finalMatchupReconciliation.attempts),
      120000,
    );
    const timer = window.setTimeout(() => {
      setFinalMatchupReconciliation((current) => (
        current.key === finalMatchupReconciliationKey
        && ['error', 'incomplete'].includes(current.status)
          ? { ...current, status: 'idle' }
          : current
      ));
    }, retryDelay);
    return () => window.clearTimeout(timer);
  }, [
    finalMatchupReconciliation.attempts,
    finalMatchupReconciliation.key,
    finalMatchupReconciliation.status,
    finalMatchupReconciliationKey,
    shouldReconcileFinalMatchup,
  ]);

  const myTeamGameStarted = useMemo(
    () => starterSlots.some(slot => slot.mine?.gameStarted),
    [starterSlots],
  );
  const opponentGameStarted = useMemo(
    () => starterSlots.some(slot => slot.opp?.gameStarted),
    [starterSlots],
  );
  const matchupGameStarted = myTeamGameStarted || opponentGameStarted;
  const matchupOutcomePointsA = matchupSettlementConfirmed && !scoringOverride
    ? getOfficialMatchupRowPoints(myMatchup) ?? myDisplayPoints
    : myDisplayPoints;
  const matchupOutcomePointsB = matchupSettlementConfirmed && !scoringOverride
    ? getOfficialMatchupRowPoints(opponentMatchup) ?? oppDisplayPoints
    : oppDisplayPoints;
  const matchupOutcome = useMemo(() => {
    if (!matchupGameStarted || matchupOutcomePointsA == null || matchupOutcomePointsB == null) {
      return { mine: 'pending', opp: 'pending' };
    }
    if (matchupOutcomePointsA === matchupOutcomePointsB) return { mine: 'tie', opp: 'tie' };
    return matchupOutcomePointsA > matchupOutcomePointsB
      ? { mine: 'win', opp: 'loss' }
      : { mine: 'loss', opp: 'win' };
  }, [matchupGameStarted, matchupOutcomePointsA, matchupOutcomePointsB]);
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
  const myForecast = useMemo(
    () => summarizeTeamForecast(enrichedSlots.map((slot) => slot.mine)),
    [enrichedSlots],
  );
  const oppForecast = useMemo(
    () => summarizeTeamForecast(enrichedSlots.map((slot) => slot.opp)),
    [enrichedSlots],
  );
  const matchupWinProbability = useMemo(() => (
    buildMatchupWinProbability({
      myPlayers: enrichedSlots.map((slot) => slot.mine),
      opponentPlayers: enrichedSlots.map((slot) => slot.opp),
      myCustomPoints: myMatchup?.custom_points,
      opponentCustomPoints: opponentMatchup?.custom_points,
      settledConfirmed: matchupSettlementConfirmed,
      officialPoints: !scoringOverride && hasCompleteOfficialMatchupPoints
        ? {
            mine: getOfficialMatchupRowPoints(myMatchup),
            opponent: getOfficialMatchupRowPoints(opponentMatchup),
          }
        : null,
    })
  ), [
    enrichedSlots,
    hasCompleteOfficialMatchupPoints,
    myMatchup,
    opponentMatchup,
    scoringOverride,
    matchupSettlementConfirmed,
  ]);
  // Once either side has started, both matchup totals are meaningful actual
  // scores. Keep the projection secondary even when the other side's first
  // game has not kicked off yet (its actual total will usually be 0.00).
  const mineScoreIsLive = matchupGameStarted && myDisplayPoints != null;
  const oppScoreIsLive = matchupGameStarted && oppDisplayPoints != null;
  const mineForecastTotal = matchupWinProbability?.expectedA ?? myForecast?.total ?? null;
  const oppForecastTotal = matchupWinProbability?.expectedB ?? oppForecast?.total ?? null;
  const displayedMineScore = mineScoreIsLive
    ? myDisplayPoints.toFixed(2)
    : mineForecastTotal != null ? mineForecastTotal.toFixed(1) : '—';
  const displayedOppScore = oppScoreIsLive
    ? oppDisplayPoints.toFixed(2)
    : oppForecastTotal != null ? oppForecastTotal.toFixed(1) : '—';

  const sharedPlayerNameFontSize = useMemo(() => {
    const labels = [
      ...enrichedSlots.flatMap(slot => [slot.mine?.name, slot.opp?.name]),
      ...enrichedMyBench.map(player => player?.name),
      ...enrichedOppBench.map(player => player?.name),
    ].filter(Boolean);
    return getUnifiedPlayerNameFontSize(labels, isCompactPhone);
  }, [enrichedMyBench, enrichedOppBench, enrichedSlots, isCompactPhone]);

  useEffect(() => {
    const requestedPlayerId = initialWeekRequest?.playerId;
    const requestedWeek = Number(initialWeekRequest?.week ?? week);
    if (!requestedPlayerId || requestedWeek !== week) return;

    const matchupPlayers = [
      ...enrichedSlots.flatMap((slot) => [slot.mine, slot.opp]),
      ...enrichedMyBench,
      ...enrichedOppBench,
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
  }, [enrichedMyBench, enrichedOppBench, enrichedSlots, initialWeekRequest, onConsumeInitialWeekRequest, week]);

  useEffect(() => {
    setSelectedPlayer(null);
    setSelectedTeam(null);
    setShowMatchupPicker(false);
  }, [selectedMatchupGroup?.key, week]);

  const selectMatchupAtIndex = useCallback((nextIndex) => {
    const nextGroup = matchupGroups[nextIndex];
    const nextRosterId = nextGroup?.sides?.[0]?.rosterId;
    if (!nextGroup || !nextRosterId) return;
    setSelectedPlayer(null);
    setSelectedTeam(null);
    setSelectedRosterIdState(nextRosterId);
    onSelectedRosterChange?.(nextRosterId);
  }, [matchupGroups, onSelectedRosterChange]);

  const handleMatchupPagerKeyDown = useCallback((event) => {
    if (event.key === 'ArrowLeft' && selectedMatchupIndex > 0) {
      event.preventDefault();
      selectMatchupAtIndex(selectedMatchupIndex - 1);
    }
    if (event.key === 'ArrowRight' && selectedMatchupIndex < matchupGroups.length - 1) {
      event.preventDefault();
      selectMatchupAtIndex(selectedMatchupIndex + 1);
    }
  }, [matchupGroups.length, selectMatchupAtIndex, selectedMatchupIndex]);

  const hasLoadedMatchups = Array.isArray(matchups);
  const hasNoMatchup = hasLoadedMatchups && !matchupLoading && !myMatchup;
  const hasNoOpponentMatchup = hasLoadedMatchups && !matchupLoading && Boolean(myMatchup) && !opponentMatchup && !isByeMatchup;
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
  const matchupControls = selectedLeagueId && !hasNoMatchup && (hasStarterIds || hasRenderableStarterRows) ? (
    <div className="companion-matchup-controls mx-2 sm:mx-4 mb-3">
      <CompanionSelectorRail ariaLabel="Matchup controls" wrapOnDesktop={false} className="companion-matchup-controls__rail">
        <CompanionSelectorButton
          onClick={() => setShowWeekPicker(true)}
          size="sm"
          aria-label={`Choose matchup week. Week ${week} selected.`}
          aria-haspopup="dialog"
          aria-expanded={showWeekPicker}
          className="companion-matchup-week-trigger"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4" />
            <path d="M8 2v4" />
            <path d="M3 10h18" />
          </svg>
          Week {week}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.6, marginLeft: -1 }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </CompanionSelectorButton>
        {matchupGroups.length > 0 && (
          <div
            role="group"
            aria-label="Browse weekly matchups"
            tabIndex={0}
            onKeyDown={handleMatchupPagerKeyDown}
            className="companion-matchup-controls__pager inline-flex min-w-0 items-stretch focus-visible:outline-none focus-visible:ring-2"
            style={{
              borderRadius: 8,
              boxShadow: 'inset 0 0 0 1px var(--color-separator)',
              overflow: 'hidden',
              '--tw-ring-color': 'var(--color-signature)',
            }}
          >
            <button
              type="button"
              aria-label="Previous matchup"
              disabled={selectedMatchupIndex <= 0}
              onClick={() => selectMatchupAtIndex(selectedMatchupIndex - 1)}
              className="inline-flex shrink-0 items-center justify-center disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
              style={{
                width: 44,
                minWidth: 44,
                background: 'var(--color-fill)',
                color: 'var(--color-label)',
                borderRight: '1px solid var(--color-separator)',
                '--tw-ring-color': 'var(--color-signature)',
                fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif",
                fontSize: 22,
                fontWeight: 800,
              }}
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={showMatchupPicker}
              aria-label={`Choose matchup. ${myName}${opponentMatchup ? ` versus ${opponentName}` : ' bye'}, matchup ${selectedMatchupIndex + 1} of ${matchupGroups.length}.`}
              title={`${myName}${opponentMatchup ? ` vs ${opponentName}` : ' · Bye'}`}
              onClick={() => setShowMatchupPicker(true)}
              className="inline-flex min-w-0 flex-1 flex-col items-center justify-center px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
              style={{
                background: 'var(--color-fill)',
                color: 'var(--color-label)',
                '--tw-ring-color': 'var(--color-signature)',
              }}
            >
              <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-center text-[length:var(--type-label)] font-bold" style={{ lineHeight: 1.15 }}>
                {myName}{opponentMatchup ? ` vs ${opponentName}` : ' · Bye'}
              </span>
              <span className="mt-0.5 block text-[length:var(--type-micro)] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-label-tertiary)', lineHeight: 1.1 }}>
                Matchup {selectedMatchupIndex + 1} of {matchupGroups.length}
              </span>
            </button>
            <button
              type="button"
              aria-label="Next matchup"
              disabled={selectedMatchupIndex >= matchupGroups.length - 1}
              onClick={() => selectMatchupAtIndex(selectedMatchupIndex + 1)}
              className="inline-flex shrink-0 items-center justify-center disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
              style={{
                width: 44,
                minWidth: 44,
                background: 'var(--color-fill)',
                color: 'var(--color-label)',
                borderLeft: '1px solid var(--color-separator)',
                '--tw-ring-color': 'var(--color-signature)',
                fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif",
                fontSize: 22,
                fontWeight: 800,
              }}
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
        )}
        {!isByeMatchup && (
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
        )}
      </CompanionSelectorRail>
    </div>
  ) : null;
  const weekPickerModal = (
    <MatchupWeekPickerModal
      open={showWeekPicker}
      onClose={() => setShowWeekPicker(false)}
      weekOptions={weekOptions}
      week={week}
      byeWeeks={byeWeeks}
      playoffStart={playoffStart}
      totalWeeks={totalWeeks}
      onSelect={(nextWeek) => {
        setSelectedPlayer(null);
        setSelectedTeam(null);
        setRequestedWeek(nextWeek);
        onWeekChange?.(nextWeek);
        setShowWeekPicker(false);
      }}
    />
  );
  const matchupPickerModal = (
    <MatchupPickerModal
      open={showMatchupPicker}
      onClose={() => setShowMatchupPicker(false)}
      matchupGroups={matchupGroups}
      selectedIndex={selectedMatchupIndex}
      onSelect={(index) => {
        selectMatchupAtIndex(index);
        setShowMatchupPicker(false);
      }}
    />
  );

  if (!selectedLeagueId) {
    return <EmptyState title="Connect a league to see matchup data." />;
  }

  if (hasNoMatchup) {
    return (
      <div className="pb-6">
        {matchupControls}
        <EmptyState
          title="Matchups will appear once your league schedule is available."
          description={`Pre-season ${fantasyPlatformLabel} leagues may not have weekly matchups published yet, so there is nothing to preview for this week.`}
        />
        {weekPickerModal}
        {matchupPickerModal}
      </div>
    );
  }

  if (hasNoOpponentMatchup) {
    return (
      <div className="pb-6">
        {matchupControls}
        <EmptyState
          title="Opponent details are not available for this week yet."
          description={`Once ${fantasyPlatformLabel} publishes both sides of the matchup, this view will show projections and lineup context.`}
        />
        {weekPickerModal}
        {matchupPickerModal}
      </div>
    );
  }

  if (isByeMatchup) {
    return (
      <div className="pb-6">
        {matchupControls}
        <ByeWeekMatchup
          teamName={myName}
          week={week}
          points={myDisplayPoints}
          onOpenBreakdown={() => setSelectedTeam('mine')}
        />
        {selectedTeam === 'mine' && (
          <TeamScoreBreakdown
            teamName={myName}
            playerIds={myBreakdownPlayerIds}
            playerPoints={scoringOverride ? null : myPointsMap}
            teamTotal={myDisplayPoints}
            scoringOverride={scoringOverride}
            week={week}
            onClose={() => setSelectedTeam(null)}
          />
        )}
        {weekPickerModal}
        {matchupPickerModal}
      </div>
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
    <div className="page-frame-workbench pb-6">
      <SeasonHintBanner capability="current-only" feature="Weekly matchups" className="mx-2 sm:mx-4 mb-3" />
      {/* Integrated matchup masthead: score, probability, and provenance share one visual field. */}
      <div className="mb-4">
        {matchupControls}
        <MatchupMasthead
          myName={myName}
          opponentName={opponentName}
          myPalette={myFantasyPalette}
          opponentPalette={opponentFantasyPalette}
          myScore={displayedMineScore}
          opponentScore={displayedOppScore}
          myScoreLabel={matchupWinProbability?.settled ? 'Final score' : mineScoreIsLive ? 'Live score' : mineForecastTotal != null ? 'Projected points' : 'Score pending'}
          opponentScoreLabel={matchupWinProbability?.settled ? 'Final score' : oppScoreIsLive ? 'Live score' : oppForecastTotal != null ? 'Projected points' : 'Score pending'}
          myProjectedFinal={matchupWinProbability?.settled ? null : mineScoreIsLive && mineForecastTotal != null ? mineForecastTotal : null}
          opponentProjectedFinal={matchupWinProbability?.settled ? null : oppScoreIsLive && oppForecastTotal != null ? oppForecastTotal : null}
          leftIsUser={leftIsUser}
          rightIsUser={rightIsUser}
          matchupOutcome={matchupOutcome}
          myForecast={myForecast}
          oppForecast={oppForecast}
          winProbability={matchupWinProbability}
          loading={providerProjectionState.status === 'loading' && !myForecast && !oppForecast}
          onOpenRivalry={openRivalry}
          onOpenMine={() => setSelectedTeam('mine')}
          onOpenOpponent={() => setSelectedTeam('opp')}
          myHeaderGlow={mineHeaderGlow}
          opponentHeaderGlow={oppHeaderGlow}
          isMineHeaderHovered={isMineHeaderHovered}
          isOpponentHeaderHovered={isOppHeaderHovered}
          setIsMineHeaderHovered={setIsMineHeaderHovered}
          setIsOpponentHeaderHovered={setIsOppHeaderHovered}
        />
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
                onComparePlayers={slot.mine && slot.opp ? () => openTaleOfTape(slot.mine, slot.opp, slot.slotPos) : null}
                onSelectMine={() => slot.mine?.id && setSelectedPlayer({ id: slot.mine.id, projection: slot.mine.projection ?? null, enriched: slot.mine })}
                onSelectOpp={() => slot.opp?.id && setSelectedPlayer({ id: slot.opp.id, projection: slot.opp.projection ?? null, enriched: slot.opp })}
              />
            ))}
          </div>

          {/* Bench section */}
          {(enrichedMyBench.length > 0 || enrichedOppBench.length > 0) && (
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
                const len = Math.max(enrichedMyBench.length, enrichedOppBench.length);
                return (
                  <div className="companion-matchup-bench-list">
                    {Array.from({ length: len }, (_, i) => (
                      <HeadToHeadRow
                        key={i}
                        mine={enrichedMyBench[i] ?? null}
                        opp={enrichedOppBench[i] ?? null}
                        bench
                        sharedPlayerNameFontSize={sharedPlayerNameFontSize}
                        onSelectMine={() => enrichedMyBench[i]?.id && setSelectedPlayer({ id: enrichedMyBench[i].id, projection: enrichedMyBench[i].projection ?? null, enriched: enrichedMyBench[i] })}
                        onSelectOpp={() => enrichedOppBench[i]?.id && setSelectedPlayer({ id: enrichedOppBench[i].id, projection: enrichedOppBench[i].projection ?? null, enriched: enrichedOppBench[i] })}
                      />
                    ))}
                  </div>
                );
              })()}
            </>
          )}
      {selectedPlayer && (
        <PlayerMatchupBreakdown
          key={`${selectedLeagueId}:${season}:${week}:${selectedPlayer.id}`}
          playerId={selectedPlayer.id}
          week={week}
          projection={selectedDrilldownPlayer?.projection ?? null}
          baseline={projectionBaselines[selectedPlayer.id] ?? null}
          enrichedPlayer={selectedDrilldownPlayer}
          benchComparison={drilldownBenchComparison}
          onViewBenchPlayer={(playerId) => setSelectedPlayer({ id: playerId })}
          onClose={() => setSelectedPlayer(null)}
          onViewStats={onViewPlayer}
        />
      )}

      {selectedTeam && (
        <TeamScoreBreakdown
          teamName={selectedTeam === 'mine' ? myName : opponentName}
          playerIds={selectedTeam === 'mine' ? myBreakdownPlayerIds : opponentBreakdownPlayerIds}
          playerPoints={scoringOverride ? null : selectedTeam === 'mine' ? myPointsMap : oppPointsMap}
          teamTotal={selectedTeam === 'mine' ? myDisplayPoints : oppDisplayPoints}
          scoringOverride={scoringOverride}
          week={week}
          onClose={() => setSelectedTeam(null)}
        />
      )}

      {taleOfTape && (
        <PlayerMatchupCompare
          left={taleOfTape.left}
          right={taleOfTape.right}
          slotLabel={taleOfTape.slotLabel}
          week={week}
          leftBaseline={projectionBaselines[taleOfTape.left?.id] ?? null}
          rightBaseline={projectionBaselines[taleOfTape.right?.id] ?? null}
          onClose={() => setTaleOfTape(null)}
        />
      )}

      {rivalrySelection && (
        <MatchupRivalryModal
          selection={rivalrySelection}
          players={players}
          onOpenMatchup={onOpenHistoricalMatchup}
          historyState={tapeHistoryState.key === rivalrySelection.historyKey ? tapeHistoryState : { status: 'loading', model: null }}
          onRetry={() => loadTaleOfTapeHistory(rivalrySelection.historyKey)}
          onClose={() => setRivalrySelection(null)}
        />
      )}
      {weekPickerModal}
      {matchupPickerModal}
    </div>
  );
}

function ByeWeekMatchup({ teamName, week, points, onOpenBreakdown }) {
  const numericPoints = Number(points);
  const hasPoints = Number.isFinite(numericPoints);

  return (
    <div className="px-2 sm:px-4">
      <div
        className="min-h-[260px] flex flex-col items-center justify-center px-4 py-12 text-center"
        style={{
          background: 'var(--color-fill)',
          borderTop: '1px solid var(--color-separator)',
          borderBottom: '1px solid var(--color-separator)',
        }}
      >
        <div
          className="text-[length:var(--type-label)] font-bold uppercase tracking-[0.22em]"
          style={{ color: 'var(--color-label-tertiary)', fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif" }}
        >
          Week {week} Bye
        </div>
        <div
          className="mt-2 max-w-full uppercase"
          style={{
            color: 'var(--color-label)',
            fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif",
            fontSize: 'clamp(30px, 8vw, 46px)',
            fontWeight: 800,
            lineHeight: 0.95,
          }}
        >
          {teamName}
        </div>
        {hasPoints && (
          <button
            type="button"
            className="companion-matchup-scorecard mt-6 min-w-[168px] px-5 py-3 active:opacity-70 transition-opacity"
            aria-label={`Open scoring breakdown for ${teamName}`}
            onClick={onOpenBreakdown}
            style={{
              background: 'var(--color-fill-secondary)',
              border: '1px solid var(--color-separator)',
              borderRadius: 0,
              color: 'var(--color-label)',
            }}
          >
            <span
              className="block text-[length:var(--type-label)] font-bold uppercase tracking-[0.18em]"
              style={{ color: 'var(--color-label-tertiary)', fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif" }}
            >
              Fantasy Score
            </span>
            <span
              className="mt-1 block tabular-nums"
              style={{ color: 'var(--color-signature)', fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif", fontSize: 34, fontWeight: 800, lineHeight: 0.95 }}
            >
              {numericPoints.toFixed(2)}
            </span>
          </button>
        )}
        <div className="mt-5 max-w-md text-sm leading-6" style={{ color: 'var(--color-label-secondary)' }}>
          No opponent was scheduled for this fantasy week.
        </div>
      </div>
    </div>
  );
}

function MatchupMasthead({
  myName,
  opponentName,
  myPalette,
  opponentPalette,
  myScore,
  opponentScore,
  myScoreLabel,
  opponentScoreLabel,
  myProjectedFinal,
  opponentProjectedFinal,
  leftIsUser,
  rightIsUser,
  matchupOutcome,
  myForecast,
  oppForecast,
  winProbability,
  loading,
  onOpenMine,
  onOpenOpponent,
  onOpenRivalry,
  myHeaderGlow,
  opponentHeaderGlow,
  isMineHeaderHovered,
  isOpponentHeaderHovered,
  setIsMineHeaderHovered,
  setIsOpponentHeaderHovered,
}) {
  const probabilityLabels = formatWinProbabilityPair(winProbability?.probA, { settled: winProbability?.settled });
  const isSettled = Boolean(winProbability?.settled);
  const modeLabel = isSettled ? 'Final result' : winProbability?.mode === 'live' ? 'Live outlook' : 'Pregame forecast';
  const sourceLabel = isSettled ? 'Official matchup totals' : getMatchupForecastSourceLabel(winProbability);
  const freshnessLabel = formatForecastFreshness(winProbability?.providerCollectedAt);
  const missingProjectionCount = Math.max(0, (winProbability?.starterCount ?? 0) - (winProbability?.projectedCount ?? 0));
  const confidenceLabel = !winProbability
    ? loading ? 'Forecast loading' : 'Coverage unavailable'
    : isSettled
      ? 'Final score locked'
    : winProbability.complete
      ? 'Complete lineup'
      : missingProjectionCount > 0
        ? `${missingProjectionCount} fallback estimate${missingProjectionCount === 1 ? '' : 's'}`
        : 'Game state unresolved';
  const leadKey = winProbability?.expectedMarginA >= 0 ? 'mine' : 'opponent';
  const leadName = leadKey === 'mine' ? myName : opponentName;
  const margin = Math.abs(Number(winProbability?.expectedMarginA) || 0).toFixed(1);
  const probabilityA = Math.max(0, Math.min(100, Number(winProbability?.probA) || 0));
  const myDirectCoverage = myForecast ? `${myForecast.projectedCount}/${myForecast.starterCount}` : null;
  const oppDirectCoverage = oppForecast ? `${oppForecast.projectedCount}/${oppForecast.starterCount}` : null;
  const coverageLabel = myDirectCoverage && oppDirectCoverage
    ? `${Number(myForecast?.projectedCount ?? 0) + Number(oppForecast?.projectedCount ?? 0)}/${Number(myForecast?.starterCount ?? 0) + Number(oppForecast?.starterCount ?? 0)} direct projections`
    : null;
  const paletteForSide = (palette, fallback) => palette?.[0] ?? fallback;
  const leftAccent = paletteForSide(myPalette, 'var(--color-accent)');
  const rightAccent = paletteForSide(opponentPalette, 'var(--color-signature)');
  const leftBackground = myPalette?.length ? fantasyHeroGradient(myPalette[0], myPalette[1], 135) : 'var(--color-fill-secondary)';
  const rightBackground = opponentPalette?.length ? fantasyHeroGradient(opponentPalette[0], opponentPalette[1], 225) : 'var(--color-fill-secondary)';

  const renderScoreSide = ({
    name,
    score,
    scoreLabel,
    projectedFinal,
    isUser,
    outcome,
    side,
    background,
    accent,
    onClick,
    onMouseMove,
    hovered,
    setHovered,
    glow,
  }) => (
    <button
      type="button"
      aria-label={`${name} scoring breakdown${isUser ? ', your team' : ''}`}
      data-testid={side === 'mine' ? 'matchup-forecast-mine' : 'matchup-forecast-opponent'}
      className={`companion-matchup-scorecard companion-matchup-masthead__side is-${side}`}
      onClick={onClick}
      onMouseMove={onMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        '--matchup-masthead-accent': accent,
        background,
        boxShadow: hovered ? (glow.glowShadow ?? '0 0 0 1px var(--color-separator)') : 'none',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      {glow.borderOverlay}
      <span className="companion-matchup-masthead__side-accent" aria-hidden="true" />
      <span className="companion-matchup-masthead__team-name">{name}</span>
      <span className="companion-matchup-masthead__score-label">{scoreLabel}</span>
      <strong className="companion-matchup-masthead__score tabular-nums">{score}</strong>
      {projectedFinal != null && (
        <span className="companion-matchup-masthead__projected-final">Projected final {projectedFinal.toFixed(1)}</span>
      )}
      {isSettled && outcome !== 'pending' && outcome !== 'tie' && (
        <span className={`companion-matchup-masthead__outcome is-${outcome}`} aria-label={outcome === 'win' ? 'Winning' : 'Losing'}>
          {outcome === 'win' ? 'W' : 'L'}
        </span>
      )}
    </button>
  );

  return (
    <section
      className="companion-matchup-masthead mx-2 mb-3 sm:mx-4"
      aria-label={isSettled ? 'Final matchup result' : winProbability?.mode === 'live' ? 'Live matchup win chance' : 'Matchup forecast'}
      data-testid={winProbability ? 'matchup-win-probability' : undefined}
    >
      <div className="companion-matchup-masthead__score-grid">
        {renderScoreSide({ name: myName, score: myScore, scoreLabel: myScoreLabel, projectedFinal: myProjectedFinal, isUser: leftIsUser, outcome: matchupOutcome.mine, side: 'mine', background: leftBackground, accent: leftAccent, onClick: onOpenMine, onMouseMove: myHeaderGlow.glowHandlers.onMouseMove, hovered: isMineHeaderHovered, setHovered: setIsMineHeaderHovered, glow: myHeaderGlow })}
        <button type="button" className="companion-matchup-masthead__axis" onClick={onOpenRivalry} aria-label={`Open rivalry history: ${myName} versus ${opponentName}`} aria-haspopup="dialog">
          <span className="companion-matchup-masthead__axis-icon"><ArrowsLeftRightIcon size={17} weight="bold" aria-hidden="true" /></span>
          <span className="companion-matchup-masthead__axis-label">VS</span>
          {winProbability ? <span className="companion-matchup-masthead__axis-mode">{modeLabel}</span> : <span className="companion-matchup-masthead__axis-mode">Matchup</span>}
        </button>
        {renderScoreSide({ name: opponentName, score: opponentScore, scoreLabel: opponentScoreLabel, projectedFinal: opponentProjectedFinal, isUser: rightIsUser, outcome: matchupOutcome.opp, side: 'opponent', background: rightBackground, accent: rightAccent, onClick: onOpenOpponent, onMouseMove: opponentHeaderGlow.glowHandlers.onMouseMove, hovered: isOpponentHeaderHovered, setHovered: setIsOpponentHeaderHovered, glow: opponentHeaderGlow })}
      </div>

      {winProbability ? (
        <div className="companion-matchup-masthead__probability" data-testid="matchup-forecast-summary">
          <div className="companion-matchup-masthead__probability-labels">
            <div className="companion-matchup-masthead__probability-side is-left">
              <strong style={{ color: leftAccent }}>{probabilityLabels.a}</strong>
              <span>{myName}</span>
            </div>
            <div className="companion-matchup-masthead__probability-center">
              <span>{isSettled ? 'Final result' : 'Estimated win chance'}</span>
              <strong>{leadName} by {margin}</strong>
            </div>
            <div className="companion-matchup-masthead__probability-side is-right">
              <strong style={{ color: rightAccent }}>{probabilityLabels.b}</strong>
              <span>{opponentName}</span>
            </div>
          </div>
          <div
            className="companion-matchup-masthead__probability-bar"
            style={{ gridTemplateColumns: `${probabilityA}% minmax(0, 1fr)`, '--matchup-masthead-left-accent': leftAccent, '--matchup-masthead-right-accent': rightAccent, '--matchup-masthead-seam': `${probabilityA}%` }}
            role="img"
            aria-label={`${myName} ${probabilityLabels.a} win probability; ${opponentName} ${probabilityLabels.b} win probability`}
          >
            <span />
            <span />
            <i aria-hidden="true" />
          </div>
        </div>
      ) : (
        <div className="companion-matchup-masthead__probability-empty" data-testid="matchup-forecast-summary">
          <ChartLineUpIcon size={16} weight="bold" aria-hidden="true" />
          <span>{loading ? 'Loading forecast…' : 'Estimated win chance unavailable'}</span>
        </div>
      )}

      <div className="companion-matchup-masthead__meta" role={loading ? 'status' : undefined} data-testid={loading ? 'matchup-forecast-loading' : undefined}>
        <span><InfoIcon size={14} weight="bold" aria-hidden="true" /> {sourceLabel ?? 'Forecast source unavailable'}</span>
        {!isSettled && freshnessLabel ? <span><ClockIcon size={14} weight="bold" aria-hidden="true" /> {freshnessLabel}</span> : null}
        <span title={isSettled ? 'Both teams have complete official starter points from the fantasy provider.' : 'Fallback estimates use a season average or position default and carry more uncertainty than a direct matchup projection.'}><ChartLineUpIcon size={14} weight="bold" aria-hidden="true" /> {isSettled ? confidenceLabel : `${coverageLabel ? `${coverageLabel} · ` : ''}${confidenceLabel}`}</span>
      </div>
      {winProbability && (
        <details
          className="companion-matchup-masthead__details"
          data-testid="matchup-forecast-details"
        >
          <summary>
            <InfoIcon size={14} weight="bold" aria-hidden="true" />
            {isSettled ? 'Final details' : 'Forecast details'}
          </summary>
          <div className="companion-matchup-masthead__details-grid">
            <div>
              {isSettled ? 'Final score' : 'Projected final'}: <strong style={{ color: 'var(--color-label)' }}>{myName} {winProbability.expectedA.toFixed(1)}</strong> · <strong style={{ color: 'var(--color-label)' }}>{opponentName} {winProbability.expectedB.toFixed(1)}</strong>
            </div>
            <div>
              {isSettled ? 'Final margin' : 'Expected edge'}: <strong style={{ color: 'var(--color-label)' }}>{leadName} by {margin}</strong>{isSettled ? ' · no points remaining' : ` · swing ±${winProbability.explanation?.swing?.toFixed?.(1) ?? '—'}`}
            </div>
            <div>{sourceLabel ?? 'Forecast source unavailable'}{!isSettled && freshnessLabel ? ` · ${freshnessLabel}` : ''}</div>
            <div>{isSettled ? 'Every starter game is final or a confirmed bye, and the official fantasy score is locked.' : winProbability.mode === 'live' ? 'Remaining points use game-time estimates.' : 'Win chance compares the projected final scores.'}</div>
          </div>
        </details>
      )}
    </section>
  );
}

function MatchupPickerModal({ open, onClose, matchupGroups, selectedIndex, onSelect }) {
  if (!open) return null;

  return (
    <Modal
      onClose={onClose}
      mobileSheet
      ariaLabel="Select matchup"
      containerClassName="matchup-week-picker-sheet"
      containerStyle={{
        background: 'var(--color-bg-secondary)',
        maxWidth: '520px',
        '--modal-mobile-sheet-max-height': 'min(86dvh, calc(100dvh - env(safe-area-inset-top) - 8px))',
      }}
    >
      <div className="matchup-week-picker-header">
        <div className="min-w-0">
          <div className="companion-segmented__title matchup-week-picker-title">
            Select Matchup
          </div>
          <div className="matchup-week-picker-note">
            Browse every matchup for this week
          </div>
        </div>
        <CompanionSelectorButton
          size="xs"
          variant="ghost"
          aria-label="Close select matchup"
          onClick={onClose}
          className="matchup-week-picker-close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </CompanionSelectorButton>
      </div>
      <div className="grid gap-2 overflow-y-auto px-4 pb-5" style={{ maxHeight: 'min(64dvh, 560px)' }}>
        {matchupGroups.map((group, index) => {
          const left = group.sides[0];
          const right = group.sides[1];
          const isSelected = index === selectedIndex;
          return (
            <button
              type="button"
              key={group.key}
              aria-current={isSelected ? 'true' : undefined}
              aria-label={`${left?.name ?? 'Team'}${right ? ` versus ${right.name}` : ' bye'}${group.includesUser ? ', includes your team' : ''}`}
              onClick={() => onSelect(index)}
              className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2"
              style={{
                minHeight: 52,
                background: isSelected ? 'var(--color-signature)' : 'var(--color-fill)',
                border: `1px solid ${isSelected ? 'var(--color-signature)' : 'var(--color-separator)'}`,
                borderRadius: 8,
                color: isSelected ? 'var(--color-signature-fg)' : 'var(--color-label)',
                '--tw-ring-color': 'var(--color-signature)',
              }}
            >
              <span className="min-w-0">
                <span className="block whitespace-normal text-sm font-bold text-pretty">{left?.name ?? 'Team'}</span>
                {left?.isUser && (
                  <span className="mt-0.5 block text-[length:var(--type-micro)] font-bold uppercase tracking-[0.16em]" style={{ opacity: 0.68 }}>You</span>
                )}
              </span>
              <span className="text-[length:var(--type-label)] font-bold uppercase tracking-[0.14em]" style={{ opacity: 0.58 }}>
                {right ? 'vs' : 'bye'}
              </span>
              <span className="min-w-0 text-right">
                {right && (
                  <>
                    <span className="block whitespace-normal text-sm font-bold text-pretty">{right.name}</span>
                    {right.isUser && (
                      <span className="mt-0.5 block text-[length:var(--type-micro)] font-bold uppercase tracking-[0.16em]" style={{ opacity: 0.68 }}>You</span>
                    )}
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function MatchupWeekPickerModal({ open, onClose, weekOptions, week, byeWeeks, playoffStart, totalWeeks, onSelect }) {
  if (!open) return null;

  return (
    <Modal
      onClose={onClose}
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
          onClick={onClose}
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
          const isBye = byeWeeks?.has(w) ?? false;
          const isSelected = week === w;
          const tag = isBye ? 'Bye' : isPlayoff ? 'Playoff' : null;
          return (
            <CompanionSelectorButton
              key={w}
              active={isSelected}
              size="md"
              variant="segment"
              aria-label={`Week ${w}${isBye ? ' bye' : ''}${isPlayoff ? ' playoff' : ''}`}
              className={`matchup-week-picker-option${isPlayoff ? ' is-playoff-week' : ''}${isBye ? ' is-bye-week' : ''}`}
              onClick={() => onSelect(w)}
            >
              <span>Wk {w}</span>
              {tag ? (
                <span className="matchup-week-picker-option__tag">
                  {tag}
                </span>
              ) : null}
            </CompanionSelectorButton>
          );
        })}
      </div>
    </Modal>
  );
}

// Sleeper flex/special slot names → short display labels
const SLOT_LABELS = {
  FLEX: 'W/R/T', REC_FLEX: 'W/R/T', WRRBTE_FLEX: 'W/R/T', WRT_FLEX: 'W/R/T',
  WRRB_FLEX: 'W/R',
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
      <div className="grid grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] items-stretch gap-1 sm:gap-2">
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
            className={`companion-matchup-slot-badge font-bold text-center inline-flex w-full flex-col items-center justify-center${canCompare ? ' companion-matchup-compare' : ''}`}
            style={{
              color: posColor,
              fontFamily: '"Barlow Condensed", sans-serif',
              fontSize: isCompactPhone ? '9px' : '11px',
              minWidth: 44,
              minHeight: 44,
              padding: isCompactPhone ? '2px 1px' : '3px 4px',
              lineHeight: 1,
              cursor: canCompare ? 'pointer' : 'default',
              letterSpacing: '0.08em',
            }}
            aria-label={canCompare ? `Open tale of the tape for ${mine?.name} and ${opp?.name}` : undefined}
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

function isPlayerGameFinal(player) {
  return hasFinalMatchupGameEvidence([player]);
}

function getPlayerPerformanceTarget(player, actualScore, projectedPts) {
  if (actualScore == null || projectedPts == null) return null;
  if (isPlayerGameFinal(player)) return projectedPts;

  const outlook = getStarterOutlook({
    current: actualScore,
    position: player.position,
    projection: player.projection ?? null,
    fallbackAvg: player.avgPPG,
    fraction: getFallbackRemainingGameFraction({
      scheduleEntry: player.scheduleEntry ?? null,
      currentPoints: actualScore,
    }),
  });
  return Number.isFinite(outlook.expectedAtNow) ? outlook.expectedAtNow : null;
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
  const rankText = player.weekRank ? `${player.weekRank.posLabel}${player.weekRank.rank}` : player.rank ? `${player.rank.posLabel}${player.rank.rank} Overall` : null;
  const weatherText = player.weather ? formatWeather(player.weather) : null;
  const actualScore = !isBye && player.gameStarted ? (weekPts ?? 0) : null;
  const finalGame = isPlayerGameFinal(player);
  const performanceTarget = getPlayerPerformanceTarget(player, actualScore, projectedPts);
  const performanceDelta = actualScore != null && performanceTarget != null
    ? Math.round((actualScore - performanceTarget) * 10) / 10
    : null;
  const scoreTone = finalGame ? 'default' : getProjectionScoreTone(actualScore, performanceTarget);
  const performanceTargetLabel = finalGame ? 'full-game projection' : 'expected pace target';
  const scoreTitle = actualScore == null || finalGame || performanceDelta == null
    ? undefined
    : performanceDelta > 0.05
      ? `${actualScore.toFixed(2)} points, ${performanceDelta.toFixed(1)} above ${performanceTargetLabel}`
      : performanceDelta < -0.05
        ? `${actualScore.toFixed(2)} points, ${Math.abs(performanceDelta).toFixed(1)} below ${performanceTargetLabel}`
        : `${actualScore.toFixed(2)} points, in line with ${performanceTargetLabel}`;
  const projectionRangeText = !isBye && !player.gameStarted && projMin != null && projMax != null
    ? `${projMin.toFixed(1)}-${projMax.toFixed(1)} range`
    : null;
  const isTeamDefense = isTeamDefensePosition(player.position);
  const playerMetrics = !isBye ? [
    (
      <CompanionPlayerMetric
        key="actual"
        compact
        align="end"
        value={actualScore == null ? '—' : actualScore.toFixed(2)}
        tone={scoreTone}
        className={`companion-matchup-player-metric--actual${actualScore == null ? ' is-pending' : ''}`}
        title={scoreTitle}
      />
    ),
    projectedPts != null ? (
      <CompanionPlayerMetric
        key="projection"
        compact
        align="end"
        value={projectedPts.toFixed(1)}
        className="companion-matchup-player-metric--projection"
        title="Full-game projection"
      />
    ) : null,
  ].filter(Boolean) : [];
  const scoreColumns = playerMetrics.length ? [
    <div key="metrics" className="companion-matchup-player-metrics">
      {playerMetrics}
    </div>,
  ] : null;
  const hasMetricSlot = Boolean(scoreColumns) || isBye;
  const detailSegments = compact
    ? [rankText].filter(Boolean)
    : [rankText, weatherText, projectionRangeText].filter(Boolean);
  const rowAccent = player.teamTheme?.accent ?? 'var(--color-separator)';
  const metricColumn = hasMetricSlot ? 'minmax(54px, auto)' : 'auto';
  const gridTemplate = compact
    ? isTeamDefense
      ? `30px minmax(0, 1fr) ${metricColumn}`
      : `minmax(0, 1fr) ${metricColumn}`
    : isTeamDefense
      ? `44px minmax(0, 1fr) ${metricColumn}`
      : `44px minmax(0, 1fr) 36px ${metricColumn}`;
  const scoreFontSize = `${Math.max(compact ? 12 : 14, Math.min(compact ? 15 : 17, nameFontSize + 4))}px`;

  return (
    <CompanionPlayerRow
      player={player}
      darkMode={darkMode}
      compact={compact}
      interactive={Boolean(onSelect)}
      onClick={onSelect}
      showAccentRail={false}
      className={`companion-matchup-player-row${isTeamDefense ? ' is-team-defense' : ''}`}
      showAvatar={!compact || isTeamDefense}
      useTeamLogoAsAvatar={isTeamDefense}
      showPosition={false}
      showTeamLogo={!compact && !isTeamDefense}
      metaSegments={[matchupMeta, ...detailSegments]}
      columns={isBye ? [
        <CompanionPlayerStatus
          key="bye-week"
          label="Bye Week"
          className="companion-matchup-bye-metric"
        />,
      ] : scoreColumns}
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

function TeamScoreBreakdown({ teamName, playerIds, playerPoints = null, teamTotal = null, scoringOverride = false, week, onClose }) {
  const { darkMode } = useTheme();
  const { platform, weeklyStats, activeScoringSettings, players, season } = useSleeperBase();
  const [view, setView] = useState('category');
  const [espnDerivedRowsState, setEspnDerivedRowsState] = useState({ key: '', rowsByPlayerId: {} });
  const playerIdsKey = useMemo(() => playerIds.join('|'), [playerIds]);
  const espnDerivedRowsKey = platform === 'espn' && players && week && playerIds.length
    ? [season, week, playerIdsKey].join('|')
    : '';
  const espnDerivedRowsByPlayerId = useMemo(() => (
    espnDerivedRowsState.key === espnDerivedRowsKey
      ? espnDerivedRowsState.rowsByPlayerId
      : {}
  ), [espnDerivedRowsKey, espnDerivedRowsState]);

  useEffect(() => {
    if (!espnDerivedRowsKey) return undefined;

    const candidates = playerIds.filter((id) => {
      const player = players?.[id];
      const isTeamDefense = isTeamDefensePosition(player?.position);
      return player
        && isEspnFantasyGameLogPosition(player.position)
        && (isTeamDefense ? player.team : (player.espn_id || player.sourceIds?.espn));
    });
    if (!candidates.length) return undefined;

    let cancelled = false;
    void Promise.all(candidates.map(async (id) => {
      try {
        const row = await loadEspnFantasyGameLogWeekRow({
          playerId: id,
          player: players[id],
          season,
          scoringSettings: activeScoringSettings,
          week,
        });
        return [id, row ?? null];
      } catch {
        return [id, null];
      }
    })).then((entries) => {
      if (cancelled) return;
      setEspnDerivedRowsState({
        key: espnDerivedRowsKey,
        rowsByPlayerId: Object.fromEntries(entries.filter(([, row]) => row)),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [activeScoringSettings, espnDerivedRowsKey, playerIds, players, season, week]);

  const breakdown = useMemo(() => buildFantasyMatchupScoringBreakdown({
    playerIds,
    playerPoints: scoringOverride ? null : playerPoints,
    teamTotal,
    week,
    weeklyStats,
    players,
    scoringSettings: activeScoringSettings,
    derivedRowsByPlayerId: espnDerivedRowsByPlayerId,
  }), [
    activeScoringSettings,
    espnDerivedRowsByPlayerId,
    playerIds,
    playerPoints,
    players,
    scoringOverride,
    teamTotal,
    week,
    weeklyStats,
  ]);
  const rows = view === 'category' ? breakdown.categoryRows : breakdown.playerRows;

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
            <CompanionSelectorButton
              size="xs"
              variant="ghost"
              aria-label="Close scoring breakdown"
              onClick={onClose}
              className="shrink-0"
              style={{ width: 30, height: 30, padding: 0 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </CompanionSelectorButton>
          </div>

      <div
        className="shrink-0 px-5 py-3"
        data-testid="team-score-breakdown-view"
        style={{ borderBottom: '1px solid var(--color-separator)' }}
      >
        <CompanionSegmentedControl
          value={view}
          options={[
            { value: 'category', label: 'By category' },
            { value: 'player', label: 'By player' },
          ]}
          onChange={setView}
          ariaLabel="Scoring breakdown view"
          columns={2}
        />
      </div>

      {/* Column headers */}
      <div
        className="flex items-center px-5 py-2 shrink-0"
        style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-separator)' }}
      >
        {view === 'category' ? (
          <>
            <span className="flex-1 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Category</span>
            <span className="w-14 text-right text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Value</span>
            <span className="w-16 text-right text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Pts</span>
          </>
        ) : (
          <>
            <span className="flex-1 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Player</span>
            <span className="w-20 text-right text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Pts</span>
          </>
        )}
      </div>

      {/* Body */}
      <div className="overflow-y-auto flex-1">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>No scoring data for Week {week}.</span>
          </div>
        ) : view === 'category' ? (
          rows.map(row => (
            <div
              key={row.key}
              className="flex items-center px-5 py-2.5"
              style={{ borderBottom: '1px solid var(--color-separator)' }}
            >
              <span className="flex-1 text-sm" style={{ color: 'var(--color-label)' }}>
                {row.label}
              </span>
              <span className="w-14 text-right text-sm tabular-nums" style={{ color: 'var(--color-label-secondary)' }}>
                {row.statVal == null ? '—' : Number.isInteger(row.statVal) ? row.statVal : row.statVal.toFixed(1)}
              </span>
              <span
                className="w-16 text-right text-sm font-semibold tabular-nums"
                style={{ color: row.pts < 0 ? 'var(--color-accent-red)' : 'var(--color-label)' }}
              >
                {row.pts > 0 ? `+${row.pts.toFixed(2)}` : row.pts.toFixed(2)}
              </span>
            </div>
          ))
        ) : (
          rows.map((row) => {
            if (row.isAdjustment) {
              return (
                <div
                  key={row.id}
                  className="flex items-center px-5 py-3"
                  style={{ borderBottom: '1px solid var(--color-separator)' }}
                >
                  <span className="flex-1 text-sm" style={{ color: 'var(--color-label-secondary)' }}>{row.name}</span>
                  <span className="w-20 text-right text-sm font-semibold tabular-nums" style={{ color: row.points < 0 ? 'var(--color-accent-red)' : 'var(--color-label)' }}>
                    {row.points > 0 ? `+${row.points.toFixed(2)}` : row.points.toFixed(2)}
                  </span>
                </div>
              );
            }

            const player = row.player ?? { id: row.id, full_name: row.name, position: row.position, team: row.team };
            return (
              <CompanionPlayerRow
                key={row.id}
                player={player}
                name={row.name}
                darkMode={darkMode}
                compact
                showPosition={false}
                showTeamLogo={false}
                showAccentRail={false}
                metaSegments={row.position ? [row.position] : []}
                columns={[
                  <CompanionPlayerMetric
                    key="points"
                    compact
                    align="end"
                    value={row.points == null ? '—' : row.points.toFixed(2)}
                    className={`team-score-breakdown-player-points${row.points == null ? ' is-pending' : ''}`}
                  />,
                ]}
                status={row.pointSource === 'unavailable' ? (
                  <CompanionPlayerStatus label="Unavailable" title="No reported player score or weekly stat line is available." />
                ) : null}
                gridTemplate="34px minmax(0, 1fr) minmax(58px, auto)"
                className="team-score-breakdown-player-row"
                style={{
                  minHeight: 58,
                  borderRadius: 0,
                  borderBottom: '1px solid var(--color-separator)',
                  padding: '7px 20px 7px 12px',
                }}
              />
            );
          })
        )}

        {/* Total row */}
        <div
          className="flex items-center px-5 py-4"
          style={{ background: 'var(--color-fill-secondary)', borderTop: '1px solid var(--color-separator)' }}
        >
          <span className="flex-1 text-sm font-bold" style={{ color: 'var(--color-label)' }}>Total</span>
          <span className="text-xl font-bold tabular-nums" style={{ color: 'var(--color-signature)' }}>
            {breakdown.total == null ? '—' : breakdown.total.toFixed(2)}
          </span>
        </div>
      </div>
    </Modal>
  );
}

function MatchupStatsLoadingBanner() {
  const statsProgress = useSleeperStatsProgress();
  return <StatsProgressBanner progress={statsProgress} className="mx-2 sm:mx-4 mb-4" />;
}

function EmptyState({ title, description = null }) {
  return <UiEmptyState title={title} hint={description} />;
}
