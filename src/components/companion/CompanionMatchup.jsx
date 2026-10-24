import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSleeperBase, useSleeperStatsEnhancing, useSleeperStatsProgress } from '../../context/SleeperContext';
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
import { summarizeExternalProjection, summarizeRecordedPregameProjection } from '../../utils/matchupProjectionBaseline.js';
import { STADIUMS, WEEK_DATES_2025 } from '../../data/stadiums';
import { fetchGameWeather, formatWeather } from '../../api/weatherApi';
import { getFantasyProjections } from '../../api/fantasyProjectionsApi.js';
import { getLiveMatchups, getWeeklyProjections } from '../../api/sleeperApi';
import {
  getFantasyProjectionSourceLabel,
  mapFantasyProjectionsToSleeperPlayers,
} from '../../utils/fantasyProjections.js';
import { mapSleeperProjectionsToPlayers } from '../../utils/sleeperProjections.js';
import PlayerMatchupBreakdown from './PlayerMatchupBreakdown';
import TeamScoringDrilldown from './TeamScoringDrilldown.jsx';
import useMatchupProjectionBaselines from '../../hooks/useMatchupProjectionBaselines.js';
import { buildDrilldownOpponentContext, getPaceAdjustedProjection } from '../../utils/playerMatchupPresentation.js';
import { RevealList } from '../ui/LoadingSwap.jsx';
import { Skeleton } from '../ui/Skeleton';
import Modal from '../Modal';
import MatchupPreviewModal from './MatchupPreviewModal';
import { buildMatchupPreviewModel, formatFantasyRosterSeed, getFantasyRosterSeeds } from '../../utils/matchupPreviewModel.js';
import { buildMatchupRivalry } from '../../utils/matchupRivalry.js';
import { pairingId as matchupPairingId, readRecentKeyIds, recordKeyIds } from '../../utils/matchupPreviewKeyHistory.js';
import useCardGlow from '../../hooks/useCardGlow.jsx';
import useMediaQuery from '../../hooks/useMediaQuery.js';
import { getPlayerRowTeamTheme } from '../../utils/playerRowTheme';
import { getPlayerAvailabilityStatus } from '../../utils/playerAvailabilityStatus.js';
import { getSleeperAvatarUrl, POSITION_COLORS } from '../../utils/companionAssetVisuals.js';
import { debugCompanionLog, debugCompanionMeasure, debugCompanionTimeAsync } from '../../utils/companionPerfDebug';
import { CompanionSelectorButton } from './CompanionSelectorControls.jsx';
import CompanionPlayerRow, { CompanionPlayerMetric, CompanionPlayerStatus } from './CompanionPlayerRow.jsx';
import PlayerStatusBadge from './PlayerStatusBadge.jsx';
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
  canUseFantasyRosterPreview,
  findMatchupGroupIndexByRosterId,
  hasSleeperWeeklyStarterIds,
} from '../../utils/fantasyMatchups.js';
import { buildMatchupWinProbability, hasFinalMatchupGameEvidence } from '../../utils/matchupWinProbability.js';
import { formatWinProbabilityPair, getStarterOutlook } from '../../utils/liveWinProbability.js';
import {
  getFallbackRemainingGameFraction,
  getMatchupCustomPoints,
  getOfficialMatchupRowPoints,
  getSleeperPlayerName,
  hasReconciledMatchup,
  isCompleteScheduleWeek,
} from '../../utils/liveScoringFeed.js';
import { getLeagueHistorySnapshot, buildLeagueHistoryModel } from '../../utils/leagueHistory.js';
import { isFullGameWeekComplete } from '../../utils/matchupTaleOfTape.js';
import PlayerMatchupCompare from './PlayerMatchupCompare.jsx';
import useMatchupLiveFeed from '../../hooks/useMatchupLiveFeed.js';
import MatchupReplayBar from './matchup/MatchupReplayBar.jsx';
import MatchupLiveChart from './matchup/MatchupLiveChart.jsx';
import { traceLiveMilestone } from '../../utils/liveLoadTrace.js';
import MatchupScoringPlays from './matchup/MatchupScoringPlays.jsx';
import MatchupPlayerHoverCard from './matchup/MatchupPlayerHoverCard.jsx';
import MatchupPointSourcesCard from './matchup/MatchupPointSourcesCard.jsx';
import { buildMatchupPointSources, buildMatchupScoredSources } from '../../utils/matchupPointSources.js';
import { buildReplayFrame, getGameStateAt } from '../../utils/matchupReplay.js';
import { FantasyBaseOverride } from '../../context/SleeperContext';
import { LIVE_SANDBOX_ENABLED, LiveSandboxPanel, useLiveSandbox } from '../../dev/liveSandbox';
import { mergeSeasonScheduleResultsIntoMap } from '../../utils/seasonScheduleResults.js';
import { getFantasyLeagueMaxWeek } from '../../utils/fantasySeasonWeeks.js';

const TOTAL_WEEKS = 18;
const COMPACT_PHONE_QUERY = '(max-width: 480px)';
// The page holds its skeleton for the live layer's first answer, at most this
// long, so the masthead, chart and rows arrive as one beat (docs/Loading Motion.md).
const LIVE_LAYER_MAX_WAIT_MS = 2500;
// The chart has its own, longer wait: past the page's cap it keeps a
// placeholder until every started game's plays are in, so it draws once
// instead of filling in game by game.
const LIVE_CHART_MAX_WAIT_MS = 10000;
// Long enough for the shared reveal (duration + capped stagger) to finish.
// After it, rows that mount (plays arriving, scrubbing) appear without motion.
const LIVE_REVEAL_WINDOW_MS = 800;
const MATCHUP_RESPONSE_CACHE = new Map();
const MATCHUP_RESPONSE_IN_FLIGHT = new Map();
const MATCHUP_RESPONSE_CACHE_LIMIT = 12;
const MATCHUP_TAPE_HISTORY_CACHE = new Map();
const FINAL_MATCHUP_RECONCILIATION_RETRY_MS = 30000;
const MATCHUP_SNAPSHOT_GATE_TIMEOUT_MS = 2000;

function cacheMatchupResponse(cacheKey, rows) {
  MATCHUP_RESPONSE_CACHE.delete(cacheKey);
  MATCHUP_RESPONSE_CACHE.set(cacheKey, rows);
  while (MATCHUP_RESPONSE_CACHE.size > MATCHUP_RESPONSE_CACHE_LIMIT) {
    const oldestKey = MATCHUP_RESPONSE_CACHE.keys().next().value;
    if (oldestKey == null) break;
    MATCHUP_RESPONSE_CACHE.delete(oldestKey);
  }
}

function isProjectionStateSettled(state, expectedKey) {
  return state?.key === expectedKey && ['ready', 'unavailable'].includes(state.status);
}

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

function buildRosterPreviewMatchup(matchup, roster) {
  if (!matchup || !roster) return matchup;
  return {
    ...matchup,
    starters: Array.isArray(roster.starters) ? roster.starters : [],
    players: Array.isArray(roster.players) ? roster.players : [],
  };
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
    if (longestToken >= 14 || longestLabel >= 24) return 9;
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

/** Two-letter monogram for the preview title card, from the team's own name. */
function buildTeamInitials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const letters = words.length === 1
    ? words[0].slice(0, 2)
    : `${words[0][0]}${words[words.length - 1][0]}`;
  return letters.toUpperCase();
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

function summarizeBenchPoints(players) {
  const benchPlayers = (players ?? []).filter((player) => player?.id && player?.name !== 'Empty');
  const points = benchPlayers.map((player) => Number(player.weekPts));
  if (!benchPlayers.length || points.some((value) => !Number.isFinite(value))) return null;
  return Math.round(points.reduce((sum, value) => sum + value, 0) * 10) / 10;
}

function formatMatchupProjectionDelta(actualScore, projectedScore) {
  const actual = Number(actualScore);
  const projected = Number(projectedScore);
  if (!Number.isFinite(actual) || !Number.isFinite(projected)) return null;
  const delta = Math.round((actual - projected) * 10) / 10;
  return `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)}`;
}

function formatRosterPoints(points, decimal) {
  const wholePoints = Number(points);
  if (!Number.isFinite(wholePoints)) return '—';
  const decimalPoints = Number(decimal ?? 0);
  const total = wholePoints + (Number.isFinite(decimalPoints) ? decimalPoints / 100 : 0);
  return total.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function getRosterSeasonSummary(roster) {
  const settings = roster?.settings ?? {};
  const wins = settings.wins ?? settings.win;
  const losses = settings.losses ?? settings.loss;
  const ties = settings.ties ?? settings.tie;
  const hasRecord = Number.isFinite(Number(wins)) && Number.isFinite(Number(losses));

  return {
    record: hasRecord
      ? `${Number(wins)}-${Number(losses)}${Number(ties) > 0 ? `-${Number(ties)}` : ''}`
      : '—',
    pointsFor: formatRosterPoints(settings.fpts, settings.fpts_decimal),
    pointsAgainst: formatRosterPoints(settings.fpts_against, settings.fpts_against_decimal),
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

// In dev, the Live sandbox's synthetic league can stand in for the connected
// one so the live layer is testable outside game windows. Production renders
// the view directly (the sandbox is compiled out).
export default function CompanionMatchup(props) {
  const sandbox = useLiveSandbox();
  const connected = useSleeperBase();
  // The sandbox league has one replayable week. Any other week the route names
  // belongs to the connected league. (Pinning the view to the sandbox week
  // instead left it waiting forever on a week the route no longer named.)
  const showSandboxLeague = Boolean(sandbox) && (
    props.selectedWeek == null || Number(props.selectedWeek) === Number(sandbox.base.currentFantasyWeek)
  );
  return (
    <FantasyBaseOverride value={showSandboxLeague ? sandbox.base : null}>
      <CompanionMatchupView {...props} liveSandboxStandsIn={showSandboxLeague} />
      {LIVE_SANDBOX_ENABLED && (
        <LiveSandboxPanel canUseLiveData={Boolean(connected.platform === 'sleeper' && connected.selectedLeagueId && connected.league)} />
      )}
    </FantasyBaseOverride>
  );
}

function CompanionMatchupView({
  onViewPlayer,
  onViewScheduleGame = null,
  onOpenInjuries = null,
  onComparePlayers = null,
  onOpenHistoricalMatchup = null,
  isActive = true,
  initialWeekRequest = null,
  selectedWeek = null,
  onWeekChange = null,
  selectedRosterId = null,
  onSelectedRosterChange = null,
  onConsumeInitialWeekRequest = null,
  seasonSchedule = null,
  liveSandboxStandsIn = false,
}) {
  const { darkMode } = useTheme();
  const isCompactPhone = useMediaQuery(COMPACT_PHONE_QUERY);
  const statsEnhancing = useSleeperStatsEnhancing();
  const {
    platform, selectedLeagueId, league, season,
    currentFantasyWeek,
    rosters, players, loadPlayers,
    weeklyStats, seasonStats, scheduleMap: baseScheduleMap, loadSeasonStats,
    statsBySeason, loadStatsForSeason,
    statsLoading, activeScoringSettings, scoringOverride,
    myRoster, getUserDisplayName, leagueUsers, espnIdOverrides, loadMatchups, linkedLeagueHistory, linkedLeagueSeasonOptions,
  } = useSleeperBase();
  const scheduleMap = useMemo(
    () => mergeSeasonScheduleResultsIntoMap(baseScheduleMap, seasonSchedule, season),
    [baseScheduleMap, season, seasonSchedule],
  );

  const totalWeeks = useMemo(() => {
    return Math.min(getFantasyLeagueMaxWeek(league), TOTAL_WEEKS);
  }, [league]);
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

  // The context owns the live Sleeper state and its season-aware fallback, so
  // Matchups and the other fantasy surfaces cannot drift onto different weeks.
  const activeDefaultWeek = currentFantasyWeek ?? defaultWeek;
  const selectedRouteWeek = selectedWeek == null
    ? null
    : clampMatchupWeek(selectedWeek, totalWeeks, activeDefaultWeek);
  const [week, setWeek] = useState(() => selectedWeek == null ? null : clampMatchupWeek(selectedWeek, totalWeeks, defaultWeek));
  const [requestedWeek, setRequestedWeek] = useState(() => selectedWeek == null ? null : clampMatchupWeek(selectedWeek, totalWeeks, defaultWeek));

  useEffect(() => {
    if (selectedWeek != null || initialWeekRequest?.week || activeDefaultWeek == null) return;
    setRequestedWeek(clampMatchupWeek(activeDefaultWeek, totalWeeks, defaultWeek));
  }, [activeDefaultWeek, defaultWeek, initialWeekRequest?.week, selectedWeek, totalWeeks]);

  const [matchups, setMatchups] = useState(null);
  const [matchupRefreshTick, setMatchupRefreshTick] = useState(0);
  // Returning to the Matchups tab replays the live layer's reveal.
  const [activationCount, setActivationCount] = useState(0);
  const [matchupLoading, setMatchupLoading] = useState(false);
  const handledMatchupRefreshTickRef = useRef(0);
  const hasMatchupsRef = useRef(false);
  const wasMatchupActiveRef = useRef(isActive);
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const [showMatchupPicker, setShowMatchupPicker] = useState(false);
  const [selectedRosterIdState, setSelectedRosterIdState] = useState(selectedRosterId);
  const [byeWeeks, setByeWeeks] = useState(() => new Set());
  const [selectedPlayer, setSelectedPlayer] = useState(null); // { id, projection }
  const [selectedTeam, setSelectedTeam] = useState(null); // 'mine' | 'opp'
  const [weatherMap, setWeatherMap] = useState({}); // { 'TEAM-DATE': weather }
  const [providerProjectionState, setProviderProjectionState] = useState({ key: '', status: 'idle', map: new Map(), error: null });
  const [sleeperProjectionState, setSleeperProjectionState] = useState({ key: '', status: 'idle', map: new Map(), error: null });
  const [matchupSnapshotGate, setMatchupSnapshotGate] = useState({ key: '', status: 'idle' });
  const [matchupSnapshot, setMatchupSnapshot] = useState(null);
  const [matchupSnapshotRevision, setMatchupSnapshotRevision] = useState(0);
  const [finalMatchupReconciliation, setFinalMatchupReconciliation] = useState({ key: '', status: 'idle', attempts: 0 });
  const [taleOfTape, setTaleOfTape] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tapeHistoryState, setTapeHistoryState] = useState({ key: '', status: 'idle', model: null });
  const [isMineHeaderHovered, setIsMineHeaderHovered] = useState(false);
  const [isOppHeaderHovered, setIsOppHeaderHovered] = useState(false);
  const [insightsRequested, setInsightsRequested] = useState(false);
  const weatherPendingKeysRef = useRef(new Set());
  const matchupSnapshotGateKeyRef = useRef(null);
  const matchupSnapshotGateTimerRef = useRef(null);
  const advancedCacheRef = useRef({
    positionalRanks: { key: '', value: {} },
    weeklyRanks: { key: '', value: {} },
    defenseTable: { key: '', value: null },
    leagueAvgByPos: { key: '', value: {} },
  });
  const tapeHistoryRequestRef = useRef(null);
  const isLeagueSnapshotReady = Boolean(
    selectedLeagueId
    && league
    && String(league.league_id) === String(selectedLeagueId)
    && league.season != null
    && String(league.season) === String(season),
  );

  useEffect(() => {
    debugCompanionLog('Matchup mounted', {
      selectedLeagueId,
      season,
      selectedWeek,
      activeDefaultWeek,
      totalWeeks,
    });
    return () => debugCompanionLog('Matchup unmounted');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadPlayers(); }, [loadPlayers]);
  useEffect(() => {
    hasMatchupsRef.current = Array.isArray(matchups);
  }, [matchups]);
  useEffect(() => {
    if (!isActive) {
      wasMatchupActiveRef.current = false;
      return undefined;
    }
    if (!wasMatchupActiveRef.current) {
      wasMatchupActiveRef.current = true;
      setMatchupRefreshTick((current) => current + 1);
      setActivationCount((current) => current + 1);
    }
    return undefined;
  }, [isActive]);
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
    if (!selectedLeagueId || !isLeagueSnapshotReady || !requestedWeek) {
      setMatchups(null);
      setMatchupLoading(Boolean(selectedLeagueId && isLeagueSnapshotReady && !requestedWeek));
      return undefined;
    }
    const cacheKey = `${selectedLeagueId}|${season}|${requestedWeek}`;
    const forceRefresh = matchupRefreshTick > handledMatchupRefreshTickRef.current;
    if (forceRefresh) handledMatchupRefreshTickRef.current = matchupRefreshTick;

    const requestMatchupResponse = (fresh) => {
      const existingRequest = MATCHUP_RESPONSE_IN_FLIGHT.get(cacheKey);
      if (existingRequest) return existingRequest;

      const request = debugCompanionTimeAsync('Matchup fantasy matchups fetch', () => (
        loadMatchups(selectedLeagueId, requestedWeek, { fresh })
      ), { selectedLeagueId, week: requestedWeek })
        .then((data) => {
          const nextMatchups = Array.isArray(data) ? data : [];
          cacheMatchupResponse(cacheKey, nextMatchups);
          return { ok: true, data: nextMatchups };
        })
        .catch(() => ({ ok: false, data: null }))
        .finally(() => {
          MATCHUP_RESPONSE_IN_FLIGHT.delete(cacheKey);
        });

      MATCHUP_RESPONSE_IN_FLIGHT.set(cacheKey, request);
      return request;
    };

    if (!forceRefresh && MATCHUP_RESPONSE_CACHE.has(cacheKey)) {
      debugCompanionLog('Matchup fantasy matchups cache hit', { selectedLeagueId, week: requestedWeek });
      setMatchups(MATCHUP_RESPONSE_CACHE.get(cacheKey));
      setWeek(requestedWeek);
      setMatchupLoading(false);

      // Sleeper is authoritative and can change while the tab is hidden. Keep
      // the cached page visible, then reconcile it with a no-store request.
      if (platform === 'sleeper') {
        let cancelled = false;
        requestMatchupResponse(true).then((data) => {
          if (cancelled || !data?.ok) return;
          setMatchups(data.data);
          setMatchupSnapshotRevision((revision) => revision + 1);
        });
        return () => {
          cancelled = true;
        };
      }
      return;
    }
    if (MATCHUP_RESPONSE_IN_FLIGHT.has(cacheKey)) {
      let cancelled = false;
      debugCompanionLog('Matchup fantasy matchups in-flight cache hit', { selectedLeagueId, week: requestedWeek });
      setMatchupLoading(true);
      MATCHUP_RESPONSE_IN_FLIGHT.get(cacheKey)
        .then((result) => {
          if (!cancelled && result?.ok) {
            setMatchups(result.data);
            setWeek(requestedWeek);
          }
          if (!cancelled) setMatchupLoading(false);
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
    const request = requestMatchupResponse(platform === 'sleeper');
    request
      .then((result) => {
        if (!cancelled) {
          if (result?.ok) {
            setMatchups(result.data);
            setWeek(requestedWeek);
          } else if (!hasMatchupsRef.current) {
            setMatchups([]);
          }
          setMatchupLoading(false);
        }
      })
      .finally(() => {
        if (!cancelled) setMatchupLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isLeagueSnapshotReady, loadMatchups, matchupRefreshTick, platform, season, selectedLeagueId, requestedWeek]);

  useEffect(() => {
    if (!initialWeekRequest?.week) return;
    setRequestedWeek(clampMatchupWeek(initialWeekRequest.week, totalWeeks, 1));
  }, [initialWeekRequest, totalWeeks]);

  useEffect(() => {
    if (selectedWeek == null) return;
    setRequestedWeek(clampMatchupWeek(selectedWeek, totalWeeks, activeDefaultWeek));
  }, [activeDefaultWeek, selectedWeek, totalWeeks]);

  const userRosterData = myRoster();
  const userRosterId = userRosterData?.roster_id ?? null;
  // Matchups stays mounted while another Companion view is open. Keep cached
  // rows hidden until they belong to the week selected by the route.
  const routeWeekMatchesLoaded = selectedRouteWeek == null || Number(week) === Number(selectedRouteWeek);
  const visibleMatchups = isLeagueSnapshotReady && routeWeekMatchesLoaded ? matchups : null;

  useEffect(() => {
    setSelectedRosterIdState(selectedRosterId);
  }, [selectedRosterId]);

  const matchupGroups = useMemo(() => buildFantasyMatchupGroups(
    visibleMatchups,
    rosters,
    getUserDisplayName,
    userRosterId,
  ), [getUserDisplayName, rosters, userRosterId, visibleMatchups]);
  const leagueUserById = useMemo(
    () => new Map((leagueUsers ?? []).map((user) => [String(user.user_id), user])),
    [leagueUsers],
  );

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
  const myWeeklyLineupPublished = hasSleeperWeeklyStarterIds(myMatchup);
  const opponentWeeklyLineupPublished = hasSleeperWeeklyStarterIds(opponentMatchup);
  const myRosterPreviewReady = platform === 'sleeper'
    && canUseFantasyRosterPreview(myMatchup, myRosterData);
  const opponentRosterPreviewReady = platform === 'sleeper'
    && canUseFantasyRosterPreview(opponentMatchup, opponentRoster);
  const myLineupUnavailable = platform === 'sleeper'
    && !myWeeklyLineupPublished
    && !myRosterPreviewReady;
  const opponentLineupUnavailable = platform === 'sleeper'
    && !opponentWeeklyLineupPublished
    && !opponentRosterPreviewReady;
  const displayMyMatchup = useMemo(
    () => myRosterPreviewReady ? buildRosterPreviewMatchup(myMatchup, myRosterData) : myMatchup,
    [myMatchup, myRosterData, myRosterPreviewReady],
  );
  const displayOpponentMatchup = useMemo(
    () => opponentRosterPreviewReady
      ? buildRosterPreviewMatchup(opponentMatchup, opponentRoster)
      : opponentMatchup,
    [opponentMatchup, opponentRoster, opponentRosterPreviewReady],
  );
  const myRosterId = leftSide?.rosterId ?? null;
  const myName = leftSide?.name ?? 'Team';
  const opponentName = rightSide?.name ?? 'Opponent';
  const rosterSeeds = useMemo(() => getFantasyRosterSeeds(rosters), [rosters]);
  const mySeedLabel = formatFantasyRosterSeed(rosterSeeds.get(String(leftSide?.rosterId ?? '')));
  const opponentSeedLabel = formatFantasyRosterSeed(rosterSeeds.get(String(rightSide?.rosterId ?? '')));
  const myInitials = buildTeamInitials(myName);
  const opponentInitials = buildTeamInitials(opponentName);
  const myTeamSummary = useMemo(() => getRosterSeasonSummary(myRosterData), [myRosterData]);
  const opponentTeamSummary = useMemo(() => getRosterSeasonSummary(opponentRoster), [opponentRoster]);
  const showTeamSummary = Number.isFinite(Number(currentFantasyWeek))
    && Number(week) === Number(currentFantasyWeek);
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
  const sleeperProjections = sleeperProjectionState.map;
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

  useEffect(() => {
    if (!hasAdvancedStats || platform !== 'sleeper' || !season || !week) {
      setSleeperProjectionState({ key: '', status: 'idle', map: new Map(), error: null });
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;
    setSleeperProjectionState({ key: projectionLoadKey, status: 'loading', map: new Map(), error: null });

    void getWeeklyProjections(season, week, controller.signal)
      .then((rows) => {
        if (cancelled) return;
        const mapped = mapSleeperProjectionsToPlayers({
          players,
          projectionRows: rows,
          scoringSettings: activeScoringSettings,
        });
        setSleeperProjectionState({ key: projectionLoadKey, status: 'ready', map: mapped, error: null });
      })
      .catch((error) => {
        if (cancelled || error?.name === 'AbortError') return;
        setSleeperProjectionState({ key: projectionLoadKey, status: 'unavailable', map: new Map(), error: error?.message ?? null });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeScoringSettings, getWeeklyProjections, hasAdvancedStats, platform, players, projectionLoadKey, season, week]);
  const myPointsMap = myMatchup?.players_points ?? {};
  const oppPointsMap = opponentMatchup?.players_points ?? {};
  const myVisiblePointsMap = useMemo(
    () => myRosterPreviewReady ? {} : myPointsMap,
    [myPointsMap, myRosterPreviewReady],
  );
  const oppVisiblePointsMap = useMemo(
    () => opponentRosterPreviewReady ? {} : oppPointsMap,
    [oppPointsMap, opponentRosterPreviewReady],
  );
  const fantasyPlatformLabel = platform === 'espn' ? 'ESPN' : 'Sleeper';
  const matchupSideCount = selectedMatchupGroup?.sides?.length ?? 0;
  const isByeMatchup = Boolean(myMatchup) && (
    matchupSideCount === 1
    || isRosterFantasyByeWeek(visibleMatchups, myRosterId)
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
      statsEnhancing,
      matchupLoading,
      hasPlayers: playerCount > 0,
      hasSeasonStats: Boolean(seasonStats),
      hasWeeklyStats: Boolean(weeklyStats),
      hasScheduleMap: Boolean(scheduleMap),
      matchupCount: visibleMatchups?.length ?? 0,
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
    statsEnhancing,
    matchupLoading,
    playerCount,
    seasonStatCount,
    weeklyStatCount,
    scheduleMap,
    visibleMatchups,
    rosters.length,
  ]);

  // When a scoring override is active, sum recalculated starter points instead of
  // using Sleeper's pre-computed matchup score (custom_points overrides points).
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
    const officialPoints = getOfficialMatchupRowPoints(myMatchup);
    if (!scoringOverride) return officialPoints;
    return calcStarterTotal(myMatchup?.starters) ?? officialPoints;
  }, [scoringOverride, myMatchup, calcStarterTotal]);

  const oppDisplayPoints = useMemo(() => {
    const officialPoints = getOfficialMatchupRowPoints(opponentMatchup);
    if (!scoringOverride) return officialPoints;
    return calcStarterTotal(opponentMatchup?.starters) ?? officialPoints;
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

  const getOwnerAvatarUrl = (side) => {
    const rosterId = side?.rosterId ?? side?.roster?.roster_id;
    const ownerId = side?.roster?.owner_id ?? rosterOwnerById.get(String(rosterId ?? ''));
    return getSleeperAvatarUrl(leagueUserById.get(String(ownerId ?? ''))?.avatar);
  };
  const myAvatarUrl = getOwnerAvatarUrl(leftSide);
  const opponentAvatarUrl = getOwnerAvatarUrl(rightSide);

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
    if (!leftPlayer || !rightPlayer || leftPlayer.name === 'Empty' || rightPlayer.name === 'Empty' || leftPlayer.isUnavailable || rightPlayer.isUnavailable) return;
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

  const matchupHistoryKey = `${selectedLeagueId}|${season}`;

  const openPreview = () => {
    setPreviewOpen(true);
    loadTaleOfTapeHistory(matchupHistoryKey);
  };

  const enrichPlayer = useCallback((id, pointsMap = null) => {
    if (!id || !players) return null;
    const p = players[id];
    if (!p) return {
      id,
      name: 'Player record unavailable',
      position: '?',
      team: '',
      pts: null,
      weekPts: null,
      avgPPG: 0,
      rank: null,
      oppTeam: null,
      isHome: null,
      isIndoor: null,
      homeTeam: null,
      availabilityStatus: null,
      weekly: [],
      isUnavailable: true,
    };

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
      const myIds = displayMyMatchup?.starters ?? [];
      const oppIds = displayOpponentMatchup?.starters ?? [];
      const len = Math.max(
        myIds.length,
        oppIds.length,
        myLineupUnavailable || opponentLineupUnavailable ? starterPositions.length : 0,
      );
      return Array.from({ length: len }, (_, i) => ({
        mine: enrichPlayer(myIds[i], myVisiblePointsMap),
        opp: enrichPlayer(oppIds[i], oppVisiblePointsMap),
        slotPos: starterPositions[i] ?? null,
      }));
    }, {
      week,
      hasAdvancedStats,
      myStarterCount: displayMyMatchup?.starters?.length ?? 0,
      oppStarterCount: displayOpponentMatchup?.starters?.length ?? 0,
    });
  }, [displayMyMatchup, displayOpponentMatchup, enrichPlayer, starterPositions, myLineupUnavailable, opponentLineupUnavailable, myVisiblePointsMap, oppVisiblePointsMap, week, hasAdvancedStats]);

  // Bench players
  const myBench = useMemo(() => {
    if (!myRosterData || !displayMyMatchup) return [];
    return debugCompanionMeasure('Matchup my bench enrich', () => {
      const starterSet = new Set(displayMyMatchup.starters ?? []);
      const historicalPlayers = displayMyMatchup.players?.length ? displayMyMatchup.players : myRosterData.players;
      return (historicalPlayers ?? []).filter(id => !starterSet.has(id)).map(id => enrichPlayer(id, myVisiblePointsMap)).filter(Boolean);
    }, {
      rosterPlayerCount: displayMyMatchup.players?.length ?? myRosterData.players?.length ?? 0,
      hasAdvancedStats,
    });
  }, [myRosterData, displayMyMatchup, enrichPlayer, myVisiblePointsMap, hasAdvancedStats]);

  const oppBench = useMemo(() => {
    if (!opponentRoster || !displayOpponentMatchup) return [];
    return debugCompanionMeasure('Matchup opponent bench enrich', () => {
      const starterSet = new Set(displayOpponentMatchup.starters ?? []);
      const historicalPlayers = displayOpponentMatchup.players?.length ? displayOpponentMatchup.players : opponentRoster.players;
      return (historicalPlayers ?? []).filter(id => !starterSet.has(id)).map(id => enrichPlayer(id, oppVisiblePointsMap)).filter(Boolean);
    }, {
      rosterPlayerCount: displayOpponentMatchup.players?.length ?? opponentRoster.players?.length ?? 0,
      hasAdvancedStats,
    });
  }, [opponentRoster, displayOpponentMatchup, enrichPlayer, oppVisiblePointsMap, hasAdvancedStats]);

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
      sleeperProjections,
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
    sleeperProjections,
  ]);

  const addProjection = useCallback((player) => {
    if (!player || !projectionContext || player.name === 'Empty' || player.isUnavailable) return player;
    const date = player.gameDate ?? WEEK_DATES_2025[week];
    const key = player.homeTeam && date ? `${player.homeTeam}-${date}` : null;
    const weather = player.isIndoor ? null : (key ? (weatherMap[key] ?? null) : null);
    return { ...player, projection: projectFromGameInfo(player, projectionContext, { weather }), weather };
  }, [projectionContext, weatherMap, week]);

  // Add projections once weather is available
  const liveEnrichedSlots = useMemo(() => {
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

  const liveEnrichedMyBench = useMemo(() => myBench.map(addProjection), [addProjection, myBench]);
  const liveEnrichedOppBench = useMemo(() => oppBench.map(addProjection), [addProjection, oppBench]);

  const matchupSnapshotKey = useMemo(() => [
    selectedLeagueId ?? '',
    season ?? '',
    week,
    selectedMatchupGroup?.key ?? '',
    matchupRefreshTick,
    matchupSnapshotRevision,
    projectionLoadKey,
  ].join('|'), [matchupRefreshTick, matchupSnapshotRevision, projectionLoadKey, season, selectedLeagueId, selectedMatchupGroup?.key, week]);
  const snapshotWeatherKeys = useMemo(() => [...new Set(
    starterSlots
      .flatMap((slot) => [slot.mine, slot.opp])
      .map((player) => {
        const date = player?.gameDate ?? WEEK_DATES_2025[week];
        return player?.homeTeam && date && !player.isIndoor
          ? `${player.homeTeam}-${date}`
          : null;
      })
      .filter(Boolean),
  )], [starterSlots, week]);
  const snapshotStarterRowsReady = starterSlots.some((slot) => (
    [slot.mine, slot.opp].some((player) => player && player.name !== 'Empty')
  ));
  const snapshotLineupUnavailable = Boolean(
    platform === 'sleeper'
    && playerCount > 0
    && myMatchup
    && opponentMatchup
    && myLineupUnavailable
    && opponentLineupUnavailable
  );
  const snapshotBaseReady = Boolean(
    selectedLeagueId
    && Array.isArray(visibleMatchups)
    && !matchupLoading
    && myMatchup
    && opponentMatchup
    && hasAdvancedStats
    && !statsLoading
    && !statsEnhancing
    && playerCount > 0
    && (snapshotStarterRowsReady || snapshotLineupUnavailable)
  );
  const snapshotOptionalDataReady = Boolean(
    scheduleMap
    && isProjectionStateSettled(providerProjectionState, projectionLoadKey)
    && (platform !== 'sleeper' || isProjectionStateSettled(sleeperProjectionState, projectionLoadKey))
    && snapshotWeatherKeys.every((key) => Object.prototype.hasOwnProperty.call(weatherMap, key))
  );

  useEffect(() => {
    if (!snapshotBaseReady) {
      matchupSnapshotGateKeyRef.current = null;
      if (matchupSnapshotGateTimerRef.current != null) {
        window.clearTimeout(matchupSnapshotGateTimerRef.current);
        matchupSnapshotGateTimerRef.current = null;
      }
      setMatchupSnapshotGate({ key: matchupSnapshotKey, status: 'idle' });
      setMatchupSnapshot(null);
      return undefined;
    }

    if (matchupSnapshotGateKeyRef.current === matchupSnapshotKey) return undefined;

    matchupSnapshotGateKeyRef.current = matchupSnapshotKey;
    setMatchupSnapshotGate({ key: matchupSnapshotKey, status: 'waiting' });
    matchupSnapshotGateTimerRef.current = window.setTimeout(() => {
      matchupSnapshotGateTimerRef.current = null;
      setMatchupSnapshotGate({ key: matchupSnapshotKey, status: 'ready' });
    }, MATCHUP_SNAPSHOT_GATE_TIMEOUT_MS);

    return () => {
      if (matchupSnapshotGateTimerRef.current != null) {
        window.clearTimeout(matchupSnapshotGateTimerRef.current);
        matchupSnapshotGateTimerRef.current = null;
      }
    };
  }, [matchupSnapshotKey, snapshotBaseReady]);

  useEffect(() => {
    if (
      matchupSnapshotGate.key !== matchupSnapshotKey
      || matchupSnapshotGate.status !== 'waiting'
      || !snapshotOptionalDataReady
    ) return;
    if (matchupSnapshotGateTimerRef.current != null) {
      window.clearTimeout(matchupSnapshotGateTimerRef.current);
      matchupSnapshotGateTimerRef.current = null;
    }
    setMatchupSnapshotGate({ key: matchupSnapshotKey, status: 'ready' });
  }, [matchupSnapshotGate, matchupSnapshotKey, snapshotOptionalDataReady]);

  const hasMatchupSnapshot = matchupSnapshot?.key === matchupSnapshotKey;
  // A stored snapshot is reusable only for the same league, season, week, and matchup.
  const hasCompatibleMatchupSnapshot = Boolean(
    matchupSnapshot
    && String(matchupSnapshot.leagueId ?? '') === String(selectedLeagueId ?? '')
    && String(matchupSnapshot.season ?? '') === String(season ?? '')
    && Number(matchupSnapshot.week) === Number(week)
    && String(matchupSnapshot.matchupKey ?? '') === String(selectedMatchupGroup?.key ?? ''),
  );
  useEffect(() => {
    if (
      matchupSnapshotGate.key !== matchupSnapshotKey
      || matchupSnapshotGate.status !== 'ready'
      || hasMatchupSnapshot
    ) return;
    setMatchupSnapshot({
      key: matchupSnapshotKey,
      leagueId: selectedLeagueId,
      season,
      week,
      matchupKey: selectedMatchupGroup?.key ?? '',
      starterSlots,
      enrichedSlots: liveEnrichedSlots,
      enrichedMyBench: liveEnrichedMyBench,
      enrichedOppBench: liveEnrichedOppBench,
    });
  }, [hasMatchupSnapshot, liveEnrichedMyBench, liveEnrichedOppBench, liveEnrichedSlots, matchupSnapshotGate, matchupSnapshotKey, season, selectedLeagueId, selectedMatchupGroup?.key, starterSlots, week]);

  const renderedStarterSlots = hasMatchupSnapshot ? matchupSnapshot.starterSlots : starterSlots;
  const enrichedSlots = hasMatchupSnapshot ? matchupSnapshot.enrichedSlots : liveEnrichedSlots;
  const enrichedMyBench = hasMatchupSnapshot ? matchupSnapshot.enrichedMyBench : liveEnrichedMyBench;
  const enrichedOppBench = hasMatchupSnapshot ? matchupSnapshot.enrichedOppBench : liveEnrichedOppBench;
  const drilldownPlayers = useMemo(() => [
    ...enrichedSlots.flatMap(slot => [slot.mine, slot.opp]),
    ...enrichedMyBench, ...enrichedOppBench,
  ].filter(player => player?.id), [enrichedSlots, enrichedMyBench, enrichedOppBench]);
  const projectionBaselines = useMatchupProjectionBaselines({
    leagueId: selectedLeagueId, season, week, scoringSettings: activeScoringSettings,
    players: drilldownPlayers,
  });
  const recordedMinePregameProjection = useMemo(
    () => summarizeRecordedPregameProjection(enrichedSlots.map((slot) => slot.mine), projectionBaselines),
    [enrichedSlots, projectionBaselines],
  );
  const recordedOppPregameProjection = useMemo(
    () => summarizeRecordedPregameProjection(enrichedSlots.map((slot) => slot.opp), projectionBaselines),
    [enrichedSlots, projectionBaselines],
  );
  const currentMineExternalProjection = useMemo(
    () => summarizeExternalProjection(enrichedSlots.map((slot) => slot.mine)),
    [enrichedSlots],
  );
  const currentOppExternalProjection = useMemo(
    () => summarizeExternalProjection(enrichedSlots.map((slot) => slot.opp)),
    [enrichedSlots],
  );
  const mineBenchPoints = useMemo(
    () => summarizeBenchPoints(enrichedMyBench),
    [enrichedMyBench],
  );
  const oppBenchPoints = useMemo(
    () => summarizeBenchPoints(enrichedOppBench),
    [enrichedOppBench],
  );
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
  const officialStarterPlayers = useMemo(() => {
    return renderedStarterSlots.map((slot) => ({ mine: slot.mine, opp: slot.opp }));
  }, [renderedStarterSlots]);
  const hasFinalMatchupGameEvidenceForWeek = useMemo(() => (
    hasFinalMatchupGameEvidence(
      officialStarterPlayers.flatMap((slot) => [slot.mine, slot.opp]),
      {
        scheduleWeekComplete: isCompleteScheduleWeek(matchupWeekSchedule),
        scheduleWeekFinal: isFullGameWeekConcluded,
      },
    )
  ), [isFullGameWeekConcluded, matchupWeekSchedule, officialStarterPlayers]);
  const finalMatchupReconciliationKey = selectedLeagueId && currentMatchupId != null
    ? `${selectedLeagueId}:${season}:${week}:${currentMatchupId}`
    : null;
  const hasCompleteOfficialMatchupPoints = useMemo(() => (
    currentMatchupId != null && hasReconciledMatchup(visibleMatchups, currentMatchupId)
  ), [currentMatchupId, visibleMatchups]);
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
          cacheMatchupResponse(`${selectedLeagueId}|${season}|${week}`, nextMatchups);
          setMatchups(nextMatchups);
          setMatchupSnapshotRevision((revision) => revision + 1);
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
    () => renderedStarterSlots.some(slot => slot.mine?.gameStarted),
    [renderedStarterSlots],
  );
  const opponentGameStarted = useMemo(
    () => renderedStarterSlots.some(slot => slot.opp?.gameStarted),
    [renderedStarterSlots],
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
      myCustomPoints: getMatchupCustomPoints(myMatchup),
      opponentCustomPoints: getMatchupCustomPoints(opponentMatchup),
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
  const matchupIsSettled = Boolean(matchupWinProbability?.settled || matchupSettlementConfirmed);

  const mineHeaderProjection = matchupIsSettled
    ? recordedMinePregameProjection?.complete
      ? recordedMinePregameProjection.total
      : currentMineExternalProjection?.complete
        ? currentMineExternalProjection.total
        : myForecast?.total ?? null
    : mineScoreIsLive && mineForecastTotal != null ? (matchupWinProbability?.paceExpectedA ?? mineForecastTotal) : null;
  const oppHeaderProjection = matchupIsSettled
    ? recordedOppPregameProjection?.complete
      ? recordedOppPregameProjection.total
      : currentOppExternalProjection?.complete
        ? currentOppExternalProjection.total
        : oppForecast?.total ?? null
    : oppScoreIsLive && oppForecastTotal != null ? (matchupWinProbability?.paceExpectedB ?? oppForecastTotal) : null;

  // Preview panel model. Built only while the panel is open — it walks every
  // starter, the league's rosters and the linked-season rivalry.
  const previewPairingId = matchupPairingId(leftSide?.rosterId, rightSide?.rosterId);
  const previewRivalry = useMemo(() => {
    if (!previewOpen || tapeHistoryState.key !== matchupHistoryKey || tapeHistoryState.status !== 'ready') return null;
    return buildMatchupRivalry(
      tapeHistoryState.model,
      rosterOwnerById.get(String(leftSide?.rosterId)) ?? null,
      rosterOwnerById.get(String(rightSide?.rosterId)) ?? null,
      players ?? {},
    );
  }, [previewOpen, tapeHistoryState, matchupHistoryKey, rosterOwnerById, leftSide?.rosterId, rightSide?.rosterId, players]);

  const previewModel = useMemo(() => {
    if (!previewOpen) return null;
    return buildMatchupPreviewModel({
      leagueId: selectedLeagueId,
      season,
      week,
      phase: matchupIsSettled ? 'post' : matchupGameStarted ? 'live' : 'pre',
      sides: {
        a: {
          rosterId: leftSide?.rosterId ?? null,
          name: myName,
          managerName: leftSide?.roster?.owner_id ? getUserDisplayName(leftSide.roster.owner_id) : null,
          abbr: buildTeamInitials(myName),
          initials: buildTeamInitials(myName),
          palette: myFantasyPalette,
        },
        b: {
          rosterId: rightSide?.rosterId ?? null,
          name: opponentName,
          managerName: rightSide?.roster?.owner_id ? getUserDisplayName(rightSide.roster.owner_id) : null,
          abbr: buildTeamInitials(opponentName),
          initials: buildTeamInitials(opponentName),
          palette: opponentFantasyPalette,
        },
      },
      slots: enrichedSlots,
      benches: { a: enrichedMyBench, b: enrichedOppBench },
      winProbability: matchupWinProbability,
      liveTotals: matchupGameStarted ? { a: myDisplayPoints, b: oppDisplayPoints } : null,
      headerExtras: {
        a: {
          projectedFinal: mineHeaderProjection,
          projectionDelta: matchupIsSettled && mineScoreIsLive ? formatMatchupProjectionDelta(myDisplayPoints, mineHeaderProjection) : null,
          summary: showTeamSummary ? myTeamSummary : null,
        },
        b: {
          projectedFinal: oppHeaderProjection,
          projectionDelta: matchupIsSettled && oppScoreIsLive ? formatMatchupProjectionDelta(oppDisplayPoints, oppHeaderProjection) : null,
          summary: showTeamSummary ? opponentTeamSummary : null,
        },
      },
      baselines: projectionBaselines,
      rosters,
      rivalry: previewRivalry,
      slotLabels: SLOT_LABELS,
      recordedProjectionTotals: {
        a: recordedMinePregameProjection?.total ?? null,
        b: recordedOppPregameProjection?.total ?? null,
      },
      scoreWeeklyEntry: calcPoints,
      scoringSettings: activeScoringSettings,
      recentKeyIds: readRecentKeyIds({ leagueId: selectedLeagueId, pairingId: previewPairingId, week }),
    });
  }, [
    previewOpen, selectedLeagueId, season, week, matchupIsSettled, matchupGameStarted,
    leftSide, rightSide, myName, opponentName, myFantasyPalette, opponentFantasyPalette,
    enrichedSlots, enrichedMyBench, enrichedOppBench, matchupWinProbability, projectionBaselines,
    myDisplayPoints, oppDisplayPoints, mineHeaderProjection, oppHeaderProjection, mineScoreIsLive, oppScoreIsLive,
    showTeamSummary, myTeamSummary, opponentTeamSummary,
    rosters, previewRivalry, recordedMinePregameProjection, recordedOppPregameProjection,
    activeScoringSettings, previewPairingId, getUserDisplayName,
  ]);

  // Remember which detectors spoke this week so the same pairing reads
  // differently the next time these two meet.
  useEffect(() => {
    if (!previewModel?.keys?.length) return;
    recordKeyIds({
      leagueId: selectedLeagueId,
      pairingId: previewPairingId,
      week,
      ids: previewModel.keys.map((key) => key.detectorId),
    });
  }, [previewModel, selectedLeagueId, previewPairingId, week]);
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

  // ── Live layer: replay bar, win chance / lead chart, scoring plays ───────
  // The current NFL week, or an earlier week of the same season replayed from
  // its plays, and only for leagues with a live session. Future weeks and
  // everything else render exactly as before. Rules: docs/Fantasy Live.md.
  const isLiveLayerWeek = currentFantasyWeek != null && Number(week) >= 1 && Number(week) <= Number(currentFantasyWeek);
  const opponentRosterId = opponentMatchup?.roster_id ?? rightSide?.rosterId ?? null;
  const liveProjectionTables = useMemo(() => (defenseTable
    ? { weeklyStats, players, scoringSettings: activeScoringSettings, defenseTable, leagueAvgByPos }
    : null), [activeScoringSettings, defenseTable, leagueAvgByPos, players, weeklyStats]);
  const live = useMatchupLiveFeed({
    enabled: platform === 'sleeper' && isLiveLayerWeek,
    matchupId: currentMatchupId,
    week: isLiveLayerWeek ? Number(week) : null,
    allowSandbox: liveSandboxStandsIn,
    projectionTables: liveProjectionTables,
  });
  // Before any starter in this matchup kicks off there is no progress to show:
  // the page keeps the plain masthead and its estimated win chance bar.
  const liveLayerActive = Boolean(live.active && live.started && !live.axis.isEmpty && live.series.length);
  const matchupIdentityKey = `${selectedLeagueId ?? ''}:${season}:${week}:${currentMatchupId ?? ''}`;

  // Hold the skeleton for the live layer's first answer (capped), so the page
  // does not paint plain Matchups and then jump to the live layout.
  const [liveWaitExpiredKey, setLiveWaitExpiredKey] = useState(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setLiveWaitExpiredKey(matchupIdentityKey), LIVE_LAYER_MAX_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [matchupIdentityKey]);
  // Latched per matchup: once the first answer is in, a later refetch (the
  // hook's context changes as players load) never sends the page back to the
  // skeleton.
  const [liveReadyKey, setLiveReadyKey] = useState(null);
  if (live.ready && liveReadyKey !== matchupIdentityKey) setLiveReadyKey(matchupIdentityKey);
  const liveLayerPending = platform === 'sleeper'
    && isLiveLayerWeek
    && !live.ready
    && liveReadyKey !== matchupIdentityKey
    && liveWaitExpiredKey !== matchupIdentityKey;

  // The chart mounts once its data is complete (or the page's wait expired),
  // then stays for this matchup: a game kicking off later briefly leaves its
  // plays outstanding, and that must not swap the chart back to a placeholder.
  const [liveChartKey, setLiveChartKey] = useState(null);
  const [liveChartWaitExpiredKey, setLiveChartWaitExpiredKey] = useState(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setLiveChartWaitExpiredKey(matchupIdentityKey), LIVE_CHART_MAX_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [matchupIdentityKey]);
  const liveChartDataReady = live.feedReady || liveChartWaitExpiredKey === matchupIdentityKey;
  if (liveLayerActive && liveChartDataReady && liveChartKey !== matchupIdentityKey) setLiveChartKey(matchupIdentityKey);
  const showLiveChart = liveChartDataReady || liveChartKey === matchupIdentityKey;
  useEffect(() => {
    if (liveLayerActive && showLiveChart) {
      traceLiveMilestone('chart shown', { detail: live.feedReady ? 'data complete' : `waited the ${LIVE_CHART_MAX_WAIT_MS / 1000}s cap` });
    }
    // Once per matchup: the chart's arrival, not each later render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveLayerActive && showLiveChart, matchupIdentityKey]);
  useEffect(() => {
    if (live.ready) traceLiveMilestone('page shown (live layer answered)');
  }, [live.ready, matchupIdentityKey]);

  // The live layer reveals on page load, a week or matchup change, and a
  // return to the Matchups tab; never on a Lineup / Scoring plays switch.
  const liveRevealKey = `${matchupIdentityKey}:${activationCount}`;
  const [liveRevealDoneKey, setLiveRevealDoneKey] = useState(null);
  useEffect(() => {
    if (!liveLayerActive) return undefined;
    const timer = window.setTimeout(() => setLiveRevealDoneKey(liveRevealKey), LIVE_REVEAL_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [liveLayerActive, liveRevealKey]);
  const liveRevealing = liveLayerActive && liveRevealDoneKey !== liveRevealKey;
  const liveMineKey = live.sideKeyByRosterId[myRosterId] ?? 'a';
  const [replayAt, setReplayAt] = useState(null);
  const [selectedPlayId, setSelectedPlayId] = useState(null);
  const [playScrollRequest, setPlayScrollRequest] = useState(0);
  const [chartView, setChartView] = useState('wp');
  const [playSide, setPlaySide] = useState('all');
  const [bigPlaysOnly, setBigPlaysOnly] = useState(false);
  const [liveTab, setLiveTab] = useState('lineup');
  const [hoverTarget, setHoverTarget] = useState(null);
  const pageFrameRef = useRef(null);
  const hoverTimersRef = useRef({ show: null, hide: null });
  const effectiveReplayAt = liveLayerActive ? replayAt : null;

  // A matchup is its own navigation context: never carry a replay moment, a
  // selected play, filters or a hover card across matchups or weeks.
  useEffect(() => {
    setReplayAt(null);
    setSelectedPlayId(null);
    setPlaySide('all');
    setBigPlaysOnly(false);
    setHoverTarget(null);
    setLiveTab('lineup');
  }, [selectedMatchupGroup?.key, week]);

  const liveSideColors = useMemo(() => ({
    mine: myFantasyPalette?.[0] ?? 'var(--color-accent)',
    opp: opponentFantasyPalette?.[0] ?? 'var(--color-signature)',
  }), [myFantasyPalette, opponentFantasyPalette]);

  const starterById = useMemo(() => {
    const map = new Map();
    enrichedSlots.forEach((slot) => {
      if (slot.mine?.id) map.set(String(slot.mine.id), { player: slot.mine, side: 'mine' });
      if (slot.opp?.id) map.set(String(slot.opp.id), { player: slot.opp, side: 'opp' });
    });
    return map;
  }, [enrichedSlots]);

  // Feed events oriented to this page: whose side, the player's name, the
  // change in *your* win chance, and the player's running total after it.
  const liveEvents = useMemo(() => {
    if (!liveLayerActive) return [];
    const seriesIndex = new Map();
    live.series.forEach((point, index) => { if (point.eventId) seriesIndex.set(point.eventId, index); });
    const winMine = (point) => {
      const p = Number(point?.p);
      return Number.isFinite(p) ? (liveMineKey === 'a' ? p : 100 - p) : null;
    };
    const running = new Map();
    return [...live.events]
      .sort((left, right) => (Number(left.progress) || 0) - (Number(right.progress) || 0))
      .map((event) => {
        const side = Number(event.rosterId) === Number(myRosterId) ? 'mine'
          : Number(event.rosterId) === Number(opponentRosterId) ? 'opp' : null;
        const index = seriesIndex.get(event.id);
        const after = index != null ? live.series[index] : null;
        const before = index > 0 ? live.series[index - 1] : null;
        const swing = after && before && winMine(after) != null && winMine(before) != null ? winMine(after) - winMine(before) : null;
        const total = (running.get(String(event.playerId)) ?? 0) + (Number(event.pts) || 0);
        running.set(String(event.playerId), total);
        return {
          ...event,
          side,
          playerName: starterById.get(String(event.playerId))?.player?.name ?? getSleeperPlayerName(players?.[event.playerId] ?? {}),
          // Play rows carry their text as `desc`; stat-update rows as `description`.
          description: event.desc ?? event.description ?? '',
          swingMine: swing,
          runningTotal: total,
        };
      })
      .filter((event) => event.side);
  }, [live.events, live.series, liveLayerActive, liveMineKey, myRosterId, opponentRosterId, players, starterById]);

  const liveFrame = useMemo(() => (liveLayerActive
    ? buildReplayFrame({ series: live.series, events: liveEvents, mineKey: liveMineKey, at: effectiveReplayAt })
    : null), [effectiveReplayAt, live.series, liveEvents, liveLayerActive, liveMineKey]);

  // A starter's game state at the replay moment (or now).
  const liveGameStateFor = useCallback((playerId) => {
    const resolution = live.starterGameStateById.get(String(playerId));
    // resolveStarterGameState: scheduled | live | officialFinal | confirmedBye | unresolved.
    const liveState = resolution?.state === 'live' ? 'live'
      : resolution?.state === 'officialFinal' || resolution?.state === 'confirmedBye' ? 'final'
        : 'pre';
    return getGameStateAt({
      axis: live.axis,
      gameId: resolution?.game?.id,
      at: effectiveReplayAt,
      liveState,
      liveProgress: 1 - (Number(resolution?.remainingFraction) || 0),
    });
  }, [effectiveReplayAt, live.axis, live.starterGameStateById]);

  // The live feed's displayed total per starter right now: Sleeper's points
  // plus plays it has not confirmed yet (docs/Fantasy Live.md). One number for
  // the rows, the masthead, the chart and the plays.
  const liveDisplayedPoints = useMemo(() => {
    const map = new Map();
    Object.values(live.sidesByRosterId ?? {}).forEach((side) => side.entries.forEach((entry) => {
      if (Number.isFinite(Number(entry.row?.points))) map.set(String(entry.id), Number(entry.row.points));
    }));
    return map;
  }, [live.sidesByRosterId]);

  // Rows follow the live layer: live totals now, or the replay moment's.
  const displaySlots = useMemo(() => {
    if (!liveLayerActive || !liveFrame) return enrichedSlots;
    const follow = (player) => {
      if (!player?.id || player.name === 'Empty' || player.isBye) return player;
      const { state } = liveGameStateFor(player.id);
      const points = effectiveReplayAt == null
        ? liveDisplayedPoints.get(String(player.id)) ?? player.weekPts ?? 0
        : liveFrame.pointsByPlayer.get(String(player.id)) ?? 0;
      return { ...player, weekPts: state === 'pre' ? null : points, gameStarted: state !== 'pre' };
    };
    return enrichedSlots.map((slot) => ({ ...slot, mine: follow(slot.mine), opp: follow(slot.opp) }));
  }, [effectiveReplayAt, enrichedSlots, liveDisplayedPoints, liveFrame, liveGameStateFor, liveLayerActive]);

  const liveYetToFinish = useMemo(() => {
    if (!liveLayerActive) return null;
    const count = (side) => enrichedSlots
      .map((slot) => slot[side])
      .filter((player) => player?.id && player.name !== 'Empty' && !player.isBye && liveGameStateFor(player.id).state !== 'final')
      .length;
    return { mine: count('mine'), opp: count('opp') };
  }, [enrichedSlots, liveGameStateFor, liveLayerActive]);

  // One side's lineup for the team scoring drilldown, in league roster order.
  // It follows the live layer's current points and game states (not a replay
  // moment), so its categories line up with the stat lines it explains.
  const teamDrilldownSpots = useMemo(() => {
    if (!selectedTeam) return [];
    const side = selectedTeam === 'mine' ? 'mine' : 'opp';
    return enrichedSlots.map((slot) => {
      const player = slot?.[side] ?? null;
      const slotLabel = SLOT_LABELS[slot?.slotPos] ?? slot?.slotPos ?? player?.position ?? null;
      if (!player?.id || player.name === 'Empty') return { slotPos: slot?.slotPos ?? null, slotLabel, player: null };
      const resolution = liveLayerActive ? live.starterGameStateById.get(String(player.id)) : null;
      if (!resolution) return { slotPos: slot.slotPos, slotLabel, player, state: null, points: player.weekPts };
      const state = player.isBye ? 'bye'
        : resolution.state === 'live' ? 'live'
          : resolution.state === 'officialFinal' || resolution.state === 'confirmedBye' ? 'final'
            : player.gameStarted ? 'live' : 'pre';
      const fraction = Number(resolution.remainingFraction);
      return {
        slotPos: slot.slotPos,
        slotLabel,
        player,
        state,
        points: state === 'pre' ? null : liveDisplayedPoints.get(String(player.id)) ?? player.weekPts ?? 0,
        remainingFraction: Number.isFinite(fraction) ? fraction : null,
      };
    });
  }, [enrichedSlots, live.starterGameStateById, liveDisplayedPoints, liveLayerActive, selectedTeam]);

  // `source` 'list' marks a click in the plays list itself, which never asks
  // the list to scroll; chart and hover-card selections jump the list to it.
  const selectLivePlay = useCallback((playId, source = null) => {
    if (!playId) return;
    const event = liveEvents.find((candidate) => candidate.id === playId);
    if (!event) return;
    if (selectedPlayId === playId) {
      setSelectedPlayId(null);
      return;
    }
    setSelectedPlayId(playId);
    // Rewind the whole page to the moment right after this play.
    const position = Number(event.progress);
    setReplayAt(Number.isFinite(position) && position < live.nowProgress - 1e-6 ? position : null);
    if (playSide !== 'all' && playSide !== event.side) setPlaySide('all');
    if (bigPlaysOnly) setBigPlaysOnly(false);
    if (source !== 'list') setPlayScrollRequest((request) => request + 1);
  }, [bigPlaysOnly, live.nowProgress, liveEvents, playSide, selectedPlayId]);

  const seekLive = useCallback((position) => {
    setReplayAt(position);
    if (position == null) setSelectedPlayId(null);
  }, []);

  // Desktop hover cards on starter rows: 120ms to open, instant between rows.
  const hoverOpenIdRef = useRef(null);
  useEffect(() => { hoverOpenIdRef.current = hoverTarget?.id ?? null; }, [hoverTarget]);
  // `point` is the pointer's position when a mouse opened the card (the card
  // then follows the pointer itself); keyboard focus leaves it null and the
  // card sits by the row.
  const showHoverCard = useCallback((element, point = null) => {
    const id = element?.dataset?.hoverPlayer;
    if (!id) return;
    window.clearTimeout(hoverTimersRef.current.hide);
    if (hoverOpenIdRef.current === id) return;
    window.clearTimeout(hoverTimersRef.current.show);
    if (hoverOpenIdRef.current) {
      hoverOpenIdRef.current = id;
      setHoverTarget({ id, anchor: element, point });
      return;
    }
    hoverTimersRef.current.show = window.setTimeout(() => {
      hoverOpenIdRef.current = id;
      setHoverTarget({ id, anchor: element, point });
    }, 120);
  }, []);
  const hideHoverCard = useCallback(() => {
    window.clearTimeout(hoverTimersRef.current.show);
    window.clearTimeout(hoverTimersRef.current.hide);
    hoverTimersRef.current.hide = window.setTimeout(() => {
      hoverOpenIdRef.current = null;
      setHoverTarget(null);
    }, 80);
  }, []);
  useEffect(() => () => {
    window.clearTimeout(hoverTimersRef.current.show);
    window.clearTimeout(hoverTimersRef.current.hide);
  }, []);
  // Gated on the event, not a `(hover: hover)` media query: some desktop
  // browsers (Edge on touch-capable machines) report no hover while the
  // pointer is still a mouse. Touch and pen never open the card.
  const hoverHandlers = {
    onPointerOver: (event) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      const element = event.target.closest?.('[data-hover-player]');
      if (element) showHoverCard(element, { x: event.clientX, y: event.clientY });
    },
    onPointerOut: (event) => {
      const element = event.target.closest?.('[data-hover-player]');
      if (!element || element.contains(event.relatedTarget)) return;
      hideHoverCard();
    },
    onFocus: (event) => {
      // Keyboard focus only; a tap or click also focuses the row.
      if (!event.target.matches?.(':focus-visible')) return;
      const element = event.target.closest?.('[data-hover-player]');
      if (element) showHoverCard(element);
    },
    onBlur: hideHoverCard,
    onClickCapture: () => {
      window.clearTimeout(hoverTimersRef.current.show);
      hoverOpenIdRef.current = null;
      setHoverTarget(null);
    },
  };

  const hoverCardData = useMemo(() => {
    if (!hoverTarget) return null;
    const entry = starterById.get(String(hoverTarget.id));
    if (!entry) return null;
    const { player, side } = entry;
    let state;
    let progress = 0;
    if (liveLayerActive) {
      ({ state, progress } = liveGameStateFor(player.id));
    } else {
      state = isPlayerGameFinal(player) ? 'final' : player.gameStarted ? 'live' : 'pre';
      progress = state === 'final' ? 1 : 0;
    }
    const plays = liveLayerActive
      ? liveEvents.filter((event) => String(event.playerId) === String(player.id)
        && (effectiveReplayAt == null || Number(event.progress) <= effectiveReplayAt + 1e-6))
      : [];
    const points = liveLayerActive
      ? liveFrame?.pointsByPlayer.get(String(player.id)) ?? 0
      : Number(player.weekPts) || 0;
    const quarterClock = () => {
      if (effectiveReplayAt == null) {
        const latest = plays[plays.length - 1];
        return latest?.glance?.clock ?? 'In progress';
      }
      const quarter = Math.min(4, Math.floor(progress * 4) + 1);
      const seconds = Math.floor((1 - ((progress * 4) % 1)) * 900);
      return `Q${quarter} ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    };
    const gameLabel = getGameLabel(player) ?? '';
    const liveGame = live.starterGameStateById.get(String(player.id))?.game;
    const kickoffWindow = liveGame ? live.axis.windowByGameId.get(String(liveGame.id)) : null;
    const kickoffLabel = kickoffWindow ? `Kicks off ${kickoffWindow.longLabel}` : gameLabel;
    const clockLabel = state === 'live' ? quarterClock() : state === 'final' ? gameLabel : kickoffLabel;
    return { player, side, state, progress, plays, points, clockLabel };
  }, [effectiveReplayAt, hoverTarget, live.axis, live.starterGameStateById, liveEvents, liveFrame, liveGameStateFor, liveLayerActive, starterById]);

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
  const hasLoadedMatchups = Array.isArray(visibleMatchups);
  const hasNoMatchup = hasLoadedMatchups && !matchupLoading && !myMatchup;
  const hasNoOpponentMatchup = hasLoadedMatchups && !matchupLoading && Boolean(myMatchup) && !opponentMatchup && !isByeMatchup;
  const hasStarterIds = (displayMyMatchup?.starters?.length ?? 0) > 0 || (displayOpponentMatchup?.starters?.length ?? 0) > 0;
  const hasRenderableStarterRows = starterSlots.some((slot) => (
    [slot.mine, slot.opp].some((player) => player && player.name !== 'Empty')
  ));
  const hasUnavailableMatchupLineup = Boolean(
    platform === 'sleeper'
    && hasLoadedMatchups
    && !matchupLoading
    && playerCount > 0
    && myMatchup
    && opponentMatchup
    && myLineupUnavailable
    && opponentLineupUnavailable
  );
  const canKeepRenderedWeekDuringSwitch = requestedWeek !== week && hasLoadedMatchups && Boolean(myMatchup);
  const isPreparingMatchupView = Boolean(selectedLeagueId)
    && !hasNoMatchup
    && !hasNoOpponentMatchup
    && !canKeepRenderedWeekDuringSwitch
    && (
      (matchupLoading && !hasLoadedMatchups)
      || !hasLoadedMatchups
      || !requestedWeek
      || playerCount === 0
      || !insightsRequested
      || !hasAdvancedStats
      || (!hasMatchupSnapshot && !hasCompatibleMatchupSnapshot)
      || (hasStarterIds && !hasRenderableStarterRows && !hasUnavailableMatchupLineup)
      || liveLayerPending
    );

  const matchupControls = selectedLeagueId && !hasNoMatchup && (hasStarterIds || hasRenderableStarterRows) ? (
    <div className="companion-matchup-controls companion-matchup-controls__row mx-2 sm:mx-4 mb-3" data-tour="matchup-live-layer">
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
      <CompanionSelectorButton
        onClick={() => setShowMatchupPicker(true)}
        size="sm"
        aria-label="Select matchup"
        aria-haspopup="dialog"
        aria-expanded={showMatchupPicker}
        className="companion-matchup-picker-trigger"
      >
        Select Matchup
      </CompanionSelectorButton>
      {platform === 'sleeper' && (
        <CompanionSelectorButton
          onClick={() => setMatchupRefreshTick((current) => current + 1)}
          disabled={matchupLoading}
          size="sm"
          aria-label={matchupLoading ? `Refreshing Week ${week} matchup` : `Refresh Week ${week} matchup`}
          title="Refresh"
          className={`companion-matchup-refresh-trigger${matchupLoading ? ' is-refreshing' : ''}`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 11a8.1 8.1 0 0 0-15.5-2.7L3 10" />
            <path d="M3 4v6h6" />
            <path d="M4 13a8.1 8.1 0 0 0 15.5 2.7L21 14" />
            <path d="M21 20v-6h-6" />
          </svg>
        </CompanionSelectorButton>
      )}
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
      selectedMatchupIndex={selectedMatchupIndex}
      userById={leagueUserById}
      onSelect={(nextIndex) => {
        selectMatchupAtIndex(nextIndex);
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
          <TeamScoringDrilldown
            teamName={myName}
            week={week}
            spots={teamDrilldownSpots}
            settled={matchupIsSettled}
            teamPoints={liveLayerActive && !matchupIsSettled ? null : myDisplayPoints}
            baselines={projectionBaselines}
            platformLabel={fantasyPlatformLabel}
            onClose={() => setSelectedTeam(null)}
          />
        )}
        {weekPickerModal}
        {matchupPickerModal}
      </div>
    );
  }

  if (hasUnavailableMatchupLineup) {
    return (
      <div className="pb-6">
        {matchupControls}
        <EmptyState
          title="Weekly lineup unavailable."
          description={`Sleeper returned this matchup, but GridShift could not resolve a usable Week ${week} lineup or current roster preview yet. Refresh the matchup after Sleeper publishes the lineup and player records.`}
        />
        {weekPickerModal}
        {matchupPickerModal}
      </div>
    );
  }

  if (isPreparingMatchupView) {
    return (
      <div className="page-frame-workbench pb-6">
        {statsLoading && (
          <MatchupStatsLoadingBanner />
        )}
        <MatchupSkeleton controls={matchupControls} />
      </div>
    );
  }

  const startersContent = (
    <>
          {/* Head-to-head starter rows. Loading motion: reveal only — the slots
              are already in hand by the time this page mounts, so there is
              nothing to place-hold, but the rows still arrive on the shared
              stagger and replay on every week/matchup move.
              Knobs and definitions: docs/Loading Motion.md. */}
          <RevealList resetKey={`${selectedLeagueId ?? ''}:${season}:${week}:${opponentName}`}>
            {displaySlots.map((slot, i) => (
              <HeadToHeadRow
                key={i}
                mine={slot.mine}
                opp={slot.opp}
                mineLineupUnavailable={myLineupUnavailable}
                oppLineupUnavailable={opponentLineupUnavailable}
                slotPos={slot.slotPos}
                sharedPlayerNameFontSize={sharedPlayerNameFontSize}
                showProgress={liveLayerActive}
                onOpenInjuries={platform === 'sleeper' ? onOpenInjuries : null}
                onComparePlayers={slot.mine && slot.opp ? () => openTaleOfTape(slot.mine, slot.opp, slot.slotPos) : null}
                onSelectMine={() => slot.mine?.id && setSelectedPlayer({ id: slot.mine.id, projection: slot.mine.projection ?? null, enriched: slot.mine })}
                onSelectOpp={() => slot.opp?.id && setSelectedPlayer({ id: slot.opp.id, projection: slot.opp.projection ?? null, enriched: slot.opp })}
              />
            ))}
          </RevealList>

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
              {/* The bench is always shown. */}
              {(() => {
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
                        onOpenInjuries={platform === 'sleeper' ? onOpenInjuries : null}
                        onSelectMine={() => enrichedMyBench[i]?.id && setSelectedPlayer({ id: enrichedMyBench[i].id, projection: enrichedMyBench[i].projection ?? null, enriched: enrichedMyBench[i] })}
                        onSelectOpp={() => enrichedOppBench[i]?.id && setSelectedPlayer({ id: enrichedOppBench[i].id, projection: enrichedOppBench[i].projection ?? null, enriched: enrichedOppBench[i] })}
                      />
                    ))}
                  </div>
                );
              })()}
            </>
          )}
    </>
  );
  const replayingMasthead = Boolean(liveLayerActive && effectiveReplayAt != null && liveFrame);
  // A settled matchup keeps its official final, except while scrubbing back
  // through it, when the masthead follows the replay moment like the rows do.
  const liveMasthead = Boolean(liveLayerActive && liveFrame && (!matchupWinProbability?.settled || replayingMasthead));
  // The scorecard hover card splits whatever the header shows by position:
  // pregame the projected total (from the same starter outlooks), live the
  // score so far (from the rows' points, following a replay moment), final
  // the official score against the projection the header compares it with.
  // (Below the early returns, so a plain value rather than a memo; it walks
  // only the starters.)
  const mastheadPhase = !liveMasthead && matchupWinProbability?.mode === 'pregame' && !mineScoreIsLive && !oppScoreIsLive
    ? 'pregame'
    : matchupIsSettled && !liveMasthead && mineScoreIsLive && oppScoreIsLive
      ? 'final'
      : liveMasthead || (mineScoreIsLive && oppScoreIsLive)
        ? 'live'
        : null;
  const mastheadStateFor = (player) => {
    if (liveLayerActive) return liveGameStateFor(player.id).state;
    if (player.scheduleEntry?.completed === true) return 'final';
    return player.gameStarted ? 'live' : 'pre';
  };
  // Mirrors the header's projected-final precedence for a settled side.
  const mastheadProjectionFor = (recorded, external) => (player) => (
    recorded?.complete ? projectionBaselines?.[String(player.id)]?.projection?.projected
      : external?.complete ? player.projection?.projected
        : null
  );
  const buildScoredSide = (side, score, projectedFinal, bench, recorded, external) => buildMatchupScoredSources(
    (mastheadPhase === 'live' ? displaySlots : enrichedSlots).map((slot) => slot[side]),
    score,
    {
      phase: mastheadPhase,
      stateFor: mastheadStateFor,
      projectionFor: mastheadProjectionFor(recorded, external),
      projectedFinal,
      bench,
    },
  );
  const mastheadPointSources = mastheadPhase === 'pregame'
    ? {
        mine: buildMatchupPointSources(matchupWinProbability.mine?.outlook, matchupWinProbability.expectedA),
        opponent: buildMatchupPointSources(matchupWinProbability.opponent?.outlook, matchupWinProbability.expectedB),
      }
    : mastheadPhase
      ? {
          mine: buildScoredSide(
            'mine',
            liveMasthead ? liveFrame.mine : myDisplayPoints,
            liveMasthead ? liveFrame.expectedMine ?? mineHeaderProjection : mineHeaderProjection,
            enrichedMyBench,
            recordedMinePregameProjection,
            currentMineExternalProjection,
          ),
          opponent: buildScoredSide(
            'opp',
            liveMasthead ? liveFrame.opp : oppDisplayPoints,
            liveMasthead ? liveFrame.expectedOpp ?? oppHeaderProjection : oppHeaderProjection,
            enrichedOppBench,
            recordedOppPregameProjection,
            currentOppExternalProjection,
          ),
        }
      : null;
  const mastheadWinProbability = liveMasthead && matchupWinProbability
    ? {
        ...matchupWinProbability,
        probA: liveFrame.winMine ?? matchupWinProbability.probA,
        expectedA: liveFrame.expectedMine ?? matchupWinProbability.expectedA,
        expectedB: liveFrame.expectedOpp ?? matchupWinProbability.expectedB,
        settled: false,
        mode: 'live',
      }
    : matchupWinProbability;

  return (
    <div
      ref={pageFrameRef}
      className={`page-frame-workbench companion-matchup pb-6${liveLayerActive ? ' matchup-live' : ''}${liveRevealing ? ' is-revealing' : ''}`}
    >
      <SeasonHintBanner capability="current-only" feature="Weekly matchups" className="mx-2 sm:mx-4 mb-3" />
      {/* Integrated matchup masthead: score, probability, and provenance share one visual field. */}
      {liveLayerActive ? matchupControls : null}
      {/* The replay bar is a direct child of the page frame so it stays pinned
          for the whole page (a sticky element cannot leave its parent). */}
      {liveLayerActive && (
          <MatchupReplayBar
            axis={live.axis}
            livePosition={live.nowProgress}
            at={effectiveReplayAt}
            onSeek={seekLive}
            playTimes={[...new Set(liveEvents.map((event) => Number(event.progress)).filter(Number.isFinite))].sort((left, right) => left - right)}
            liveGameCount={live.matchupLiveGameCount}
            updatedAt={live.status.lastUpdatedAt}
            final={live.historical}
          />
      )}
      <div className="mb-4">
        {liveLayerActive ? null : matchupControls}
        {/* Keyed on the matchup identity so the masthead's wipe and the win-chance
            bar's grow replay on every week or opponent change, not just on mount. */}
        <MatchupMasthead
          key={`${selectedLeagueId ?? ''}:${season}:${week}:${opponentName}`}
          myName={myName}
          opponentName={opponentName}
          mySeedLabel={mySeedLabel}
          opponentSeedLabel={opponentSeedLabel}
          myInitials={myInitials}
          opponentInitials={opponentInitials}
          myAvatarUrl={myAvatarUrl}
          opponentAvatarUrl={opponentAvatarUrl}
          myTeamSummary={myTeamSummary}
          opponentTeamSummary={opponentTeamSummary}
          showTeamSummary={showTeamSummary}
          myPalette={myFantasyPalette}
          opponentPalette={opponentFantasyPalette}
          myScore={liveMasthead ? liveFrame.mine.toFixed(2) : displayedMineScore}
          opponentScore={liveMasthead ? liveFrame.opp.toFixed(2) : displayedOppScore}
          myScoreLabel={replayingMasthead ? 'Score at this moment' : liveMasthead ? 'Live score' : matchupWinProbability?.settled ? 'Final score' : mineScoreIsLive ? 'Live score' : mineForecastTotal != null ? 'Projected points' : 'Score pending'}
          opponentScoreLabel={replayingMasthead ? 'Score at this moment' : liveMasthead ? 'Live score' : matchupWinProbability?.settled ? 'Final score' : oppScoreIsLive ? 'Live score' : oppForecastTotal != null ? 'Projected points' : 'Score pending'}
          myProjectedFinal={liveMasthead ? liveFrame.expectedMine ?? mineHeaderProjection : mineHeaderProjection}
          opponentProjectedFinal={liveMasthead ? liveFrame.expectedOpp ?? oppHeaderProjection : oppHeaderProjection}
          showProjectionDelta={matchupIsSettled && !replayingMasthead}
          myBenchPoints={mineBenchPoints}
          opponentBenchPoints={oppBenchPoints}
          showBenchPoints={matchupIsSettled && !replayingMasthead}
          leftIsUser={leftIsUser}
          rightIsUser={rightIsUser}
          matchupOutcome={matchupOutcome}
          myForecast={myForecast}
          oppForecast={oppForecast}
          winProbability={mastheadWinProbability}
          loading={
            (providerProjectionState.status === 'loading' || sleeperProjectionState.status === 'loading')
            && !myForecast
            && !oppForecast
          }
          onOpenPreview={openPreview}
          onOpenMine={() => setSelectedTeam('mine')}
          onOpenOpponent={() => setSelectedTeam('opp')}
          myHeaderGlow={mineHeaderGlow}
          opponentHeaderGlow={oppHeaderGlow}
          isMineHeaderHovered={isMineHeaderHovered}
          isOpponentHeaderHovered={isOppHeaderHovered}
          setIsMineHeaderHovered={setIsMineHeaderHovered}
          setIsOpponentHeaderHovered={setIsOppHeaderHovered}
          showProbabilityBar={!liveLayerActive}
          myPointSources={mastheadPointSources?.mine ?? null}
          opponentPointSources={mastheadPointSources?.opponent ?? null}
        />
      </div>

      {liveLayerActive ? (
        // After kickoff: the win chance / lead chart runs the full width above
        // Lineup and Scoring plays tabs, so it stays in view on both.
        <div className="matchup-live__body">
          <section className="matchup-live-section matchup-live-chart-section" data-panel="lead" aria-labelledby="matchup-chart-title">
            <div className="matchup-live-label">
              <h2 id="matchup-chart-title">{chartView === 'lead' ? 'Lead' : 'Win chance'}</h2>
              <div className="matchup-live-label__controls matchup-live-segmented" role="group" aria-label="Chart view">
                <button type="button" className="matchup-live-chip" aria-pressed={chartView === 'wp'} onClick={() => setChartView('wp')}>Win chance</button>
                <button type="button" className="matchup-live-chip" aria-pressed={chartView === 'lead'} onClick={() => setChartView('lead')}>Lead</button>
              </div>
            </div>
            {/* Drawn once its data is complete (capped by the page's wait), so
                it arrives whole and wipes in rather than filling in game by
                game. */}
            {showLiveChart ? (
            <MatchupLiveChart
              key={matchupIdentityKey}
              view={chartView}
              axis={live.axis}
              series={live.series}
              events={liveEvents}
              mineKey={liveMineKey}
              livePosition={live.nowProgress}
              final={live.historical}
              at={effectiveReplayAt}
              selectedPlayId={selectedPlayId}
              mineColor={liveSideColors.mine}
              oppColor={liveSideColors.opp}
              mineName={myName}
              oppName={opponentName}
              onSeek={seekLive}
              onSelectPlay={selectLivePlay}
            />
            ) : (
              <Skeleton className="matchup-live-chart__placeholder w-full rounded-xl" />
            )}
          </section>
          <div className="matchup-live-tabs" role="tablist" aria-label="Matchup sections">
            {[['lineup', 'Lineup'], ['plays', 'Scoring plays']].map(([id, label]) => (
              <button
                key={id}
                id={`matchup-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={liveTab === id}
                aria-controls={`matchup-panel-${id}`}
                className={`season-tab${liveTab === id ? ' active' : ''}`}
                onClick={() => setLiveTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Both panels stay mounted and in layout; the inactive one is
              collapsed and inert rather than display:none, which would restart
              the row reveal on every tab switch. */}
          <section
            className={`matchup-live-section${liveTab !== 'lineup' ? ' is-inactive' : ''}`}
            data-panel="lineup"
            id="matchup-panel-lineup"
            role="tabpanel"
            aria-labelledby="matchup-tab-lineup"
            inert={liveTab !== 'lineup'}
          >
            <div className="matchup-live-label">
              <h2 id="matchup-starters-title">Starters</h2>
              {liveYetToFinish && (
                <span className="matchup-live-label__scope">{`Yet to finish · You ${liveYetToFinish.mine} · Them ${liveYetToFinish.opp}`}</span>
              )}
            </div>
            <div {...hoverHandlers}>
              {startersContent}
            </div>
          </section>
          <div
            className={`matchup-live-panel${liveTab !== 'plays' ? ' is-inactive' : ''}`}
            id="matchup-panel-plays"
            role="tabpanel"
            aria-labelledby="matchup-tab-plays"
            inert={liveTab !== 'plays'}
          >
            <MatchupScoringPlays
              events={liveEvents}
              at={effectiveReplayAt}
              axis={live.axis}
              side={playSide}
              bigOnly={bigPlaysOnly}
              bigPlayThreshold={live.bigPlayThreshold}
              selectedPlayId={selectedPlayId}
              onSideChange={setPlaySide}
              onBigOnlyChange={setBigPlaysOnly}
              onSelectPlay={selectLivePlay}
              scrollRequest={playScrollRequest}
              sideColors={liveSideColors}
              revealing={liveRevealing}
              scoringSettings={activeScoringSettings}
            />
          </div>
        </div>
      ) : (
        <div {...hoverHandlers}>
          {startersContent}
        </div>
      )}
      {hoverCardData && (
        <MatchupPlayerHoverCard
          anchor={hoverTarget?.anchor}
          point={hoverTarget?.point ?? null}
          containerRef={pageFrameRef}
          player={hoverCardData.player}
          side={hoverCardData.side}
          state={hoverCardData.state}
          gameProgress={hoverCardData.progress}
          clockLabel={hoverCardData.clockLabel}
          points={hoverCardData.points}
          plays={hoverCardData.plays}
          weeklyRows={hoverCardData.player.weekly ?? weeklyStats?.[hoverCardData.player.id] ?? []}
          week={week}
          scoringSettings={activeScoringSettings}
          sideColor={liveSideColors[hoverCardData.side]}
        />
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
          onViewScheduleGame={onViewScheduleGame}
          onOpenInjuries={platform === 'sleeper' ? onOpenInjuries : null}
        />
      )}

      {selectedTeam && (
        <TeamScoringDrilldown
          teamName={selectedTeam === 'mine' ? myName : opponentName}
          week={week}
          spots={teamDrilldownSpots}
          settled={matchupIsSettled}
          teamPoints={liveLayerActive && !matchupIsSettled ? null : selectedTeam === 'mine' ? myDisplayPoints : oppDisplayPoints}
          baselines={projectionBaselines}
          platformLabel={fantasyPlatformLabel}
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
          onViewStats={onViewPlayer}
        />
      )}

      {previewOpen && (
        <MatchupPreviewModal
          model={previewModel}
          loading={tapeHistoryState.key !== matchupHistoryKey || ['idle', 'loading'].includes(tapeHistoryState.status)}
          rivalryStatus={tapeHistoryState.key === matchupHistoryKey ? tapeHistoryState.status : 'loading'}
          onOpenMeeting={onOpenHistoricalMatchup ? async (meeting) => {
            const meetingSeason = String(meeting.season);
            const partOfSeason = meetingSeason === String(season)
              || (linkedLeagueSeasonOptions ?? []).some((option) => String(option) === meetingSeason);
            if (!partOfSeason) {
              throw new Error(`You can only open matchups from seasons you were part of. You weren't in this league in ${meetingSeason}.`);
            }
            await onOpenHistoricalMatchup({ season: meeting.season, week: meeting.week, rosterId: meeting.leftRosterId });
            setPreviewOpen(false);
          } : undefined}
          onClose={() => setPreviewOpen(false)}
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
  mySeedLabel,
  opponentSeedLabel,
  myInitials,
  opponentInitials,
  myAvatarUrl,
  opponentAvatarUrl,
  myTeamSummary,
  opponentTeamSummary,
  showTeamSummary = false,
  myPalette,
  opponentPalette,
  myScore,
  opponentScore,
  myScoreLabel,
  opponentScoreLabel,
  myProjectedFinal,
  opponentProjectedFinal,
  showProjectionDelta = false,
  myBenchPoints = null,
  opponentBenchPoints = null,
  showBenchPoints = false,
  leftIsUser,
  rightIsUser,
  matchupOutcome,
  myForecast,
  oppForecast,
  winProbability,
  loading,
  onOpenMine,
  onOpenOpponent,
  onOpenPreview,
  myHeaderGlow,
  opponentHeaderGlow,
  isMineHeaderHovered,
  isOpponentHeaderHovered,
  setIsMineHeaderHovered,
  setIsOpponentHeaderHovered,
  // Once the matchup has kicked off the full-width win chance chart replaces
  // the estimated win chance bar.
  showProbabilityBar = true,
  myPointSources = null,
  opponentPointSources = null,
}) {
  const frameRef = useRef(null);
  const mineSideRef = useRef(null);
  const opponentSideRef = useRef(null);
  // The point-sources card opens like the player hover cards: a mouse pointer
  // or keyboard focus, never touch, pen or a tap's focus. Not gated on a
  // `(hover: hover)` query, which some desktop browsers fail with a mouse in
  // use. A click hides it while the team drilldown opens.
  const [sourcesOpenSide, setSourcesOpenSide] = useState(null);
  const pointSourcesSide = sourcesOpenSide === 'mine' && myPointSources ? 'mine'
    : sourcesOpenSide === 'opponent' && opponentPointSources ? 'opponent'
      : null;
  const probabilityLabels = formatWinProbabilityPair(winProbability?.probA, { settled: winProbability?.settled });
  const isSettled = Boolean(winProbability?.settled);
  const modeLabel = winProbability?.mode === 'live' ? 'Live outlook' : 'Pregame forecast';
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
    seedLabel,
    initials,
    avatarUrl,
    score,
    scoreLabel,
    projectedFinal,
    teamSummary,
    showTeamSummary,
    benchPoints,
    isUser,
    outcome,
    side,
    accent,
    background,
    onClick,
    onMouseMove,
    hovered,
    setHovered,
    glow,
    sideRef,
    hasPointSources,
  }) => {
    const projectionDelta = showProjectionDelta
      ? formatMatchupProjectionDelta(score, projectedFinal)
      : null;

    return (
      <button
      ref={sideRef}
      type="button"
      aria-label={`${name} scoring breakdown${isUser ? ', your team' : ''}`}
      aria-describedby={hasPointSources && pointSourcesSide === side ? 'matchup-point-sources' : undefined}
      data-testid={side === 'mine' ? 'matchup-forecast-mine' : 'matchup-forecast-opponent'}
      data-tour={side === 'mine' ? 'matchup-team-scoring' : undefined}
      className={`companion-matchup-scorecard companion-matchup-masthead__side is-${side}`}
      onClick={(event) => { setSourcesOpenSide(null); onClick?.(event); }}
      onMouseMove={onMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') setSourcesOpenSide(side); }}
      onPointerLeave={(event) => { if (event.pointerType === 'mouse') setSourcesOpenSide((open) => (open === side ? null : open)); }}
      onFocus={(event) => {
        setHovered(true);
        if (event.currentTarget.matches?.(':focus-visible')) setSourcesOpenSide(side);
      }}
      onBlur={() => {
        setHovered(false);
        setSourcesOpenSide((open) => (open === side ? null : open));
      }}
      style={{
        background,
        '--matchup-masthead-identity-accent': accent,
        boxShadow: hovered ? (glow.glowShadow ?? '0 0 0 1px var(--color-separator)') : 'none',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      {glow.borderOverlay}
      {(seedLabel || initials || avatarUrl) && (
        <span className="companion-matchup-masthead__identity">
          {(initials || avatarUrl) && (
            <i className="companion-matchup-masthead__identity-avatar" aria-hidden="true">
              {initials}
              {avatarUrl && (
                <img
                  src={avatarUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onError={(event) => { event.currentTarget.style.display = 'none'; }}
                />
              )}
            </i>
          )}
          {seedLabel && <span>{seedLabel}</span>}
        </span>
      )}
      <span className="companion-matchup-masthead__team-name">{name}</span>
      <span className="companion-matchup-masthead__score-label">{scoreLabel}</span>
      <strong className="companion-matchup-masthead__score tabular-nums">{score}</strong>
      {projectedFinal != null && (
        <span
          className="companion-matchup-masthead__projected-final"
          title={showProjectionDelta ? 'Projected final compared with the official score' : undefined}
        >
          Projected final {projectedFinal.toFixed(1)}
          {projectionDelta && (
            <span className="companion-matchup-masthead__projection-delta">
              {' · '}{projectionDelta}
            </span>
          )}
        </span>
      )}
      {showTeamSummary && (
        <span
          className="companion-matchup-masthead__team-summary"
          aria-label={`${name} season record ${teamSummary.record}, points for ${teamSummary.pointsFor}, points against ${teamSummary.pointsAgainst}`}
        >
          <strong className="companion-matchup-masthead__team-record tabular-nums">{teamSummary.record}</strong>
          <i className="companion-matchup-masthead__team-summary-separator" aria-hidden="true">·</i>
          <span className="companion-matchup-masthead__team-points tabular-nums">
            PF {teamSummary.pointsFor}<i className="companion-matchup-masthead__team-summary-separator" aria-hidden="true">·</i>PA {teamSummary.pointsAgainst}
          </span>
        </span>
      )}
      {showBenchPoints && benchPoints != null && (
        <span className="companion-matchup-masthead__bench-points">
          Points left on bench {benchPoints.toFixed(1)}
        </span>
      )}
      {isSettled && outcome !== 'pending' && outcome !== 'tie' && (
        <span className={`companion-matchup-masthead__outcome is-${outcome}`} aria-label={outcome === 'win' ? 'Winning' : 'Losing'}>
          {outcome === 'win' ? 'W' : 'L'}
        </span>
      )}
      </button>
    );
  };

  return (
    <div ref={frameRef} className="companion-matchup-masthead-frame">
    <section
      className="companion-matchup-masthead gridshift-reveal mx-2 mb-3 sm:mx-4"
      aria-label={isSettled ? 'Final matchup result' : winProbability?.mode === 'live' ? 'Live matchup win chance' : 'Matchup forecast'}
      data-testid={winProbability ? 'matchup-win-probability' : undefined}
    >
      <div className="companion-matchup-masthead__score-grid">
        {renderScoreSide({ name: myName, seedLabel: mySeedLabel, initials: myInitials, avatarUrl: myAvatarUrl, score: myScore, scoreLabel: myScoreLabel, projectedFinal: myProjectedFinal, teamSummary: myTeamSummary, showTeamSummary, benchPoints: myBenchPoints, isUser: leftIsUser, outcome: matchupOutcome.mine, side: 'mine', accent: leftAccent, background: leftBackground, onClick: onOpenMine, onMouseMove: myHeaderGlow.glowHandlers.onMouseMove, hovered: isMineHeaderHovered, setHovered: setIsMineHeaderHovered, glow: myHeaderGlow, sideRef: mineSideRef, hasPointSources: Boolean(myPointSources) })}
        <button type="button" className="companion-matchup-masthead__axis" onClick={onOpenPreview} aria-label={`Open matchup preview: ${myName} versus ${opponentName}`} aria-haspopup="dialog">
          <span className="companion-matchup-masthead__axis-icon"><ArrowsLeftRightIcon size={17} weight="bold" aria-hidden="true" /></span>
          <span className="companion-matchup-masthead__axis-label">VS</span>
          {winProbability && !isSettled ? <span className="companion-matchup-masthead__axis-mode">{modeLabel}</span> : null}
        </button>
        {renderScoreSide({ name: opponentName, seedLabel: opponentSeedLabel, initials: opponentInitials, avatarUrl: opponentAvatarUrl, score: opponentScore, scoreLabel: opponentScoreLabel, projectedFinal: opponentProjectedFinal, teamSummary: opponentTeamSummary, showTeamSummary, benchPoints: opponentBenchPoints, isUser: rightIsUser, outcome: matchupOutcome.opp, side: 'opponent', accent: rightAccent, background: rightBackground, onClick: onOpenOpponent, onMouseMove: opponentHeaderGlow.glowHandlers.onMouseMove, hovered: isOpponentHeaderHovered, setHovered: setIsOpponentHeaderHovered, glow: opponentHeaderGlow, sideRef: opponentSideRef, hasPointSources: Boolean(opponentPointSources) })}
      </div>

      {!showProbabilityBar ? null : winProbability ? (
        <div className="companion-matchup-masthead__probability" data-testid="matchup-forecast-summary">
          <div className={`companion-matchup-masthead__probability-labels${isSettled ? ' is-settled' : ''}`}>
            <div className="companion-matchup-masthead__probability-side is-left">
              <strong style={{ color: leftAccent }}>{probabilityLabels.a}</strong>
            </div>
            {!isSettled && (
              <div className="companion-matchup-masthead__probability-center">
                <span>Estimated win chance</span>
              </div>
            )}
            <div className="companion-matchup-masthead__probability-side is-right">
              <strong style={{ color: rightAccent }}>{probabilityLabels.b}</strong>
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
            <div className="companion-matchup-masthead__details-meta" role={loading ? 'status' : undefined} data-testid={loading ? 'matchup-forecast-loading' : undefined}>
              <span><InfoIcon size={14} weight="bold" aria-hidden="true" /> {sourceLabel ?? 'Forecast source unavailable'}</span>
              {!isSettled && freshnessLabel ? <span><ClockIcon size={14} weight="bold" aria-hidden="true" /> {freshnessLabel}</span> : null}
              <span title={isSettled ? 'Both teams have complete official starter points from the fantasy provider.' : 'Fallback estimates use a season average or position default and carry more uncertainty than a direct matchup projection.'}><ChartLineUpIcon size={14} weight="bold" aria-hidden="true" /> {isSettled ? confidenceLabel : `${coverageLabel ? `${coverageLabel} · ` : ''}${confidenceLabel}`}</span>
            </div>
            <div>{isSettled ? 'Every starter game is final or a confirmed bye, and the official fantasy score is locked.' : winProbability.mode === 'live' ? 'Remaining points use game-time estimates.' : 'Win chance compares the projected final scores.'}</div>
          </div>
        </details>
      )}
    </section>
    {pointSourcesSide && (
      <MatchupPointSourcesCard
        id="matchup-point-sources"
        sources={pointSourcesSide === 'mine' ? myPointSources : opponentPointSources}
        side={pointSourcesSide}
        anchorRef={pointSourcesSide === 'mine' ? mineSideRef : opponentSideRef}
        frameRef={frameRef}
        accent={pointSourcesSide === 'mine' ? leftAccent : rightAccent}
      />
    )}
    </div>
  );
}

function MatchupOptionTeam({ side, userById }) {
  const name = side?.name ?? 'Bye';
  const avatarHash = side?.roster?.owner_id != null
    ? userById.get(String(side.roster.owner_id))?.avatar ?? null
    : null;

  return (
    <span className="companion-matchup-option__team">
      {avatarHash ? (
        <img
          src={`https://sleepercdn.com/avatars/thumbs/${avatarHash}`}
          alt=""
          aria-hidden="true"
          className="companion-matchup-option__avatar"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      ) : (
        <span className="companion-matchup-option__avatar companion-matchup-option__avatar--fallback" aria-hidden="true">
          {name[0]?.toUpperCase()}
        </span>
      )}
      <span className="companion-matchup-option__name">{name}{side?.isUser ? ' (Me)' : ''}</span>
    </span>
  );
}

function MatchupPickerModal({ open, onClose, matchupGroups, selectedMatchupIndex, userById, onSelect }) {
  if (!open) return null;

  return (
    <Modal
      onClose={onClose}
      mobileSheet
      ariaLabel="Select matchup"
      containerClassName="matchup-picker-sheet"
      containerStyle={{
        background: 'var(--color-bg-secondary)',
        maxWidth: '480px',
        '--modal-mobile-sheet-max-height': 'min(86dvh, calc(100dvh - env(safe-area-inset-top) - 8px))',
      }}
    >
      <div className="matchup-week-picker-header">
        <div className="min-w-0">
          <div className="companion-segmented__title matchup-week-picker-title">
            Select Matchup
          </div>
          <div className="matchup-week-picker-note">
            Choose a matchup to view
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
      <div className="matchup-picker-list">
        {matchupGroups.map((group, index) => {
          const leftTeam = group.sides[0] ?? null;
          const rightTeam = group.sides[1] ?? null;
          const matchupLabel = `${leftTeam?.name ?? 'Team'}${rightTeam ? ` versus ${rightTeam.name}` : ' bye'}`;
          return (
            <CompanionSelectorButton
              key={group.key}
              active={index === selectedMatchupIndex}
              size="md"
              variant="segment"
              aria-label={`Select matchup: ${matchupLabel}${group.includesUser ? ' (your matchup)' : ''}`}
              className="matchup-picker-option"
              onClick={() => onSelect(index)}
            >
              <span className="companion-matchup-option__teams">
                <MatchupOptionTeam side={leftTeam} userById={userById} />
                <MatchupOptionTeam side={rightTeam} userById={userById} />
              </span>
            </CompanionSelectorButton>
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

// A thin bar under a starter row filling toward their projection (live layer).
function MatchupProgressBar({ player, align }) {
  const projected = Number(player?.projection?.projected);
  if (!player?.id || player.name === 'Empty' || player.isBye || !Number.isFinite(projected) || projected <= 0) return null;
  const share = Math.max(0, Math.min(1, (Number(player.weekPts) || 0) / projected));
  return (
    <span className={`matchup-row-progress is-${align}`} aria-hidden="true">
      <i style={{ width: `${share * 100}%` }} />
    </span>
  );
}

function HeadToHeadRow({ mine, opp, bench, slotPos, mineLineupUnavailable = false, oppLineupUnavailable = false, onSelectMine, onSelectOpp, onComparePlayers, onOpenInjuries, sharedPlayerNameFontSize, showProgress = false }) {
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
        <div className="matchup-row-cell" data-hover-player={!bench && mine?.id ? mine.id : undefined}>
          <MatchupPlayerRow
            player={mine}
            lineupUnavailable={mineLineupUnavailable}
            darkMode={darkMode}
            compact={isCompactPhone}
            onSelect={onSelectMine}
            onOpenInjuries={onOpenInjuries}
            nameFontSize={sharedPlayerNameFontSize}
          />
          {showProgress && <MatchupProgressBar player={mine} align="left" />}
        </div>

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
          </button>
        </div>

      {/* Opponent — right (mirrored) */}
      <div className="matchup-row-cell" data-hover-player={!bench && opp?.id ? opp.id : undefined}>
        <MatchupPlayerRow
          player={opp}
          lineupUnavailable={oppLineupUnavailable}
          darkMode={darkMode}
          compact={isCompactPhone}
          onSelect={onSelectOpp}
          onOpenInjuries={onOpenInjuries}
          nameFontSize={sharedPlayerNameFontSize}
          align="right"
        />
        {showProgress && <MatchupProgressBar player={opp} align="right" />}
      </div>
      </div>
    </div>
  );
}

function getGameLabel(player) {
  if (!player?.team) return null;
  if (!player.oppTeam) return player.team;
  if (player.isHome === true) return `${player.team} v. ${player.oppTeam}`;
  if (player.isHome === false) return `${player.team} @ ${player.oppTeam}`;
  return `${player.team} vs ${player.oppTeam}`;
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

function MatchupPlayerRow({ player, lineupUnavailable = false, darkMode, compact = false, align = 'left', onSelect, onOpenInjuries = null, nameFontSize = 13 }) {
  const isRight = align === 'right';
  if (lineupUnavailable) {
    return (
      <div
        className={`flex min-w-0 items-center px-3${isRight ? ' justify-end text-right' : ''}`}
        style={{
          minHeight: compact ? 52 : 70,
          border: '1px solid var(--color-separator)',
          background: 'var(--color-fill)',
          color: 'var(--color-label-secondary)',
        }}
        title="Sleeper has not returned a usable weekly starting lineup for this team yet."
      >
        <span className="text-xs font-semibold uppercase tracking-wide">
          Lineup unavailable
        </span>
      </div>
    );
  }
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

  if (player.isUnavailable) {
    return (
      <div
        className="flex min-w-0 items-center px-3"
        style={{
          minHeight: compact ? 52 : 70,
          border: '1px solid var(--color-separator)',
          background: 'var(--color-fill)',
          color: 'var(--color-label-secondary)',
        }}
        title="Sleeper supplied a starter ID, but GridShift has not resolved its player record yet."
      >
        <span className="text-xs font-semibold uppercase tracking-wide">
          Player record unavailable
        </span>
      </div>
    );
  }

  const isBye = Boolean(player.isBye);
  const weekPts = player.weekPts ?? null;
  const projectedPts = player.projection?.projected ?? null;
  const projMin = player.projection?.min ?? null;
  const projMax = player.projection?.max ?? null;

  // Phones put the position in a chip beside the name, leaving the game alone
  // on the second line.
  const matchupMeta = [compact ? null : player.position, getGameLabel(player)]
    .filter(Boolean)
    .join(' ');
  const rankText = player.weekRank ? `${player.weekRank.posLabel}${player.weekRank.rank}` : player.rank ? `${player.rank.posLabel}${player.rank.rank} Overall` : null;
  const actualScore = !isBye && player.gameStarted ? (weekPts ?? 0) : null;
  const finalGame = isPlayerGameFinal(player);
  // Weather only matters before and during a game, not once it is over.
  const weatherText = player.weather && !finalGame ? formatWeather(player.weather) : null;
  const performanceTarget = getPlayerPerformanceTarget(player, actualScore, projectedPts);
  const scoreTone = finalGame ? 'default' : getProjectionScoreTone(actualScore, performanceTarget);
  const paceAdjustedProjection = !finalGame
    ? getPaceAdjustedProjection({
      phase: actualScore != null ? 'live' : 'pregame',
      total: actualScore,
      projected: projectedPts,
      scheduleEntry: player.scheduleEntry ?? null,
    })
    : null;
  const displayedProjection = paceAdjustedProjection ?? projectedPts;
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
      />
    ),
    displayedProjection != null ? (
      <CompanionPlayerMetric
        key="projection"
        compact
        align="end"
        value={displayedProjection.toFixed(1)}
        className="companion-matchup-player-metric--projection"
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
    ? []
    : [rankText, weatherText, projectionRangeText].filter(Boolean);
  const injuryStatus = player.availabilityStatus
    ? onOpenInjuries && player.id != null
      ? (
        <button
          type="button"
          className="companion-player-row__action companion-matchup-injury-link"
          aria-label={`View ${player.name}'s ${player.availabilityStatus} status in Fantasy Injuries`}
          title={`View ${player.name} in Fantasy Injuries`}
          onClick={(event) => {
            event.stopPropagation();
            onOpenInjuries(player.id);
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <PlayerStatusBadge status={player.availabilityStatus} compact={compact} localContrast={false} />
        </button>
      )
      : <PlayerStatusBadge status={player.availabilityStatus} compact={compact} localContrast={false} />
    : null;
  const rowAccent = player.teamTheme?.accent ?? 'var(--color-separator)';
  const metricColumn = hasMetricSlot ? `minmax(${compact ? 36 : 54}px, auto)` : 'auto';
  // The status badge rides beside the name rather than taking its own trailing
  // column, so the team logo and score columns stay aligned across every row.
  const gridTemplate = compact
    ? `30px minmax(0, 1fr) ${metricColumn}`
    : isTeamDefense
      ? `44px minmax(0, 1fr) ${metricColumn}`
      : `44px minmax(0, 1fr) 36px ${metricColumn}`;
  const scoreFontSize = `${Math.max(compact ? 12 : 14, Math.min(compact ? 15 : 17, nameFontSize + 3))}px`;

  return (
    <CompanionPlayerRow
      player={player}
      darkMode={darkMode}
      compact={compact}
      interactive={Boolean(onSelect)}
      onClick={onSelect}
      showAccentRail={false}
      className={`companion-matchup-player-row${isTeamDefense ? ' is-team-defense' : ''}`}
      useTeamLogoAsAvatar={isTeamDefense}
      showPosition={compact}
      positionPlacement="identity"
      showTeamLogo={!compact && !isTeamDefense}
      metaSegments={[matchupMeta, ...detailSegments]}
      columns={isBye ? [
        <CompanionPlayerStatus
          key="bye-week"
          label="Bye Week"
          className="companion-matchup-bye-metric"
        />,
      ] : scoreColumns}
      identityAccessory={injuryStatus}
      gridTemplate={gridTemplate}
      columnGridTemplate={compact ? 'minmax(34px, auto)' : undefined}
      separateAction={Boolean(onOpenInjuries && player.availabilityStatus && player.id != null)}
      name={player.name}
      title=""
      style={{
        borderRadius: 0,
        borderLeftWidth: isRight ? 1 : 4,
        borderLeftColor: isRight ? 'var(--color-separator)' : rowAccent,
        borderRight: isRight ? `4px solid ${rowAccent}` : undefined,
        minHeight: compact ? 56 : 70,
        padding: compact
          ? isRight ? '7px 6px' : '7px 6px 7px 7px'
          : isRight ? '10px 12px' : '10px 18px 10px 12px',
        '--matchup-player-name-size': `${nameFontSize}px`,
        '--matchup-player-score-size': scoreFontSize,
      }}
    />
  );
}

/**
 * Structure-first loading state for the matchup page.
 *
 * Mirrors the real page's geometry rather than describing it in words: the same
 * masthead score grid, the same win-probability strip, the same head-to-head
 * row template. What arrives then fills the shape already on screen instead of
 * replacing a centred sentence with a full page.
 *
 * `.gs-section-skeleton` gives this the SHOW AFTER delay in pure CSS — the whole
 * skeleton holds itself invisible for --gs-load-show-after, so a matchup that
 * prepares quickly paints no placeholder at all. Knobs: docs/Loading Motion.md.
 */
function MatchupSkeletonSide({ align = 'left' }) {
  const items = align === 'right' ? 'items-end' : 'items-start';
  // Shape and spacing track the real side: identity chip, team name, the large
  // score, projected final, then the bench line. Close enough in height that the
  // masthead does not jump when the real one replaces it.
  return (
    <div className={`flex flex-col justify-center gap-4 px-[clamp(14px,3vw,36px)] py-[18px] ${items}`}>
      <div className={`flex items-center gap-2 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-2.5 w-14 rounded" />
      </div>
      <Skeleton className="h-[18px] w-44 max-w-full rounded" />
      <Skeleton className="h-12 w-32 rounded" />
      <Skeleton className="h-3 w-28 max-w-full rounded" />
      <Skeleton className="h-2.5 w-20 rounded" />
    </div>
  );
}

function MatchupSkeletonRow() {
  return (
    <div className="px-1.5 sm:px-4">
      <div className="grid grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] items-stretch gap-1 sm:gap-2">
        <Skeleton className="h-[68px] w-full rounded-lg" />
        <div className="flex items-center justify-center">
          <Skeleton className="h-4 w-8 rounded" />
        </div>
        <Skeleton className="h-[68px] w-full rounded-lg" />
      </div>
    </div>
  );
}

function MatchupSkeleton({ controls }) {
  return (
    <div className="gs-section-skeleton" role="status" aria-label="Preparing matchup">
      <SeasonHintBanner capability="current-only" feature="Weekly matchups" className="mx-2 sm:mx-4 mb-3" />
      <div className="mb-4">
        {controls}
        <div className="companion-matchup-masthead">
          <div className="companion-matchup-masthead__score-grid">
            <MatchupSkeletonSide />
            <div className="companion-matchup-masthead__axis">
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-2 w-12 rounded" />
            </div>
            <MatchupSkeletonSide align="right" />
          </div>
          <div className="companion-matchup-masthead__probability">
            <div className="companion-matchup-masthead__probability-labels">
              <div className="companion-matchup-masthead__probability-side">
                <Skeleton className="h-8 w-20 rounded" />
                <Skeleton className="h-2.5 w-28 max-w-full rounded" />
              </div>
              <div className="companion-matchup-masthead__probability-center">
                <Skeleton className="h-2.5 w-36 max-w-full rounded" />
              </div>
              <div className="companion-matchup-masthead__probability-side is-right">
                <Skeleton className="h-8 w-20 rounded" />
                <Skeleton className="h-2.5 w-28 max-w-full rounded" />
              </div>
            </div>
            <Skeleton className="mt-[13px] h-2 w-full" />
          </div>
        </div>
      </div>
      {/* Nine slots is a typical starting lineup. It also keeps the placeholder
          page tall enough to own the same scrollbar the real page does, so the
          content width does not shift underneath the handoff. */}
      <div className="flex flex-col gap-1 sm:gap-2 gridshift-reveal gridshift-reveal--auto">
        {Array.from({ length: 9 }, (_, i) => <MatchupSkeletonRow key={i} />)}
      </div>
    </div>
  );
}

function MatchupStatsLoadingBanner() {
  const statsProgress = useSleeperStatsProgress();
  return <StatsProgressBanner progress={statsProgress} className="mx-2 sm:mx-4 mb-4" />;
}

function EmptyState({ title, description = null }) {
  return <UiEmptyState title={title} hint={description} />;
}
