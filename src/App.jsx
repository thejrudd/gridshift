import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useState, useRef, useTransition } from 'react';
import { loadScheduleData } from './utils/scheduleParser';
import { loadSeasonSchedule } from './utils/seasonSchedule';
import { usePredictions } from './context/PredictionContext';
import { useTheme } from './context/ThemeContext';
import { exportAsJSON, importFromJSON } from './utils/exportImport';
import { usePWAInstall } from './hooks/usePWAInstall';
import useBodyScrollLock from './hooks/useBodyScrollLock';
import NavBar from './components/NavBar';
import BottomTabBar from './components/BottomTabBar';
import SeasonSubNav from './components/SeasonSubNav';
import StatisticsSubNav from './components/StatisticsSubNav';
import CompanionSubNav from './components/CompanionSubNav';
import TradeSubNav from './components/TradeSubNav';
import ScoutSubNav from './components/ScoutSubNav';
import DraftSubNav from './components/DraftSubNav';
import ActionSheet from './components/ActionSheet';
import Sidebar from './components/Sidebar';
import { SleeperProvider, useSleeperLeague, useSleeperStats } from './context/SleeperContext';
import {
  buildAppPath,
  getDefaultRouteForTab,
  isSameAppRoute,
  normalizeAppRoute,
  parseAppRoute,
  slugifyRouteSegment,
} from './utils/appRoutes';
import {
  buildStatisticsPlayerMeta,
  buildStatisticsPlayerMetaFromSleeperId,
  resolveStatisticsPlayerMetaFromSleeperId,
  STATISTICS_MODES,
} from './utils/playerDrilldown';
import { debugCompanionLog, debugCompanionTimeAsync } from './utils/companionPerfDebug';
import ScoringOverrideBanner from './components/companion/ScoringOverrideBanner';

const ExportPreview = lazy(() => import('./components/ExportPreview'));
const PredictionsRedesign = lazy(() => import('./components/predictions/PredictionsRedesign'));
const Guide = lazy(() => import('./components/Guide'));
const PlayerBrowser = lazy(() => import('./components/PlayerBrowser'));
const StatisticsSchedule = lazy(() => import('./components/StatisticsSchedule'));
const StatisticsStandings = lazy(() => import('./components/StatisticsStandings'));
const StatisticsGame = lazy(() => import('./components/StatisticsGame'));
const FavoriteTeamPicker = lazy(() => import('./components/FavoriteTeamPicker'));
const CompanionConnect = lazy(() => import('./components/companion/CompanionConnect'));
const CompanionRoster = lazy(() => import('./components/companion/CompanionRoster'));
const CompanionRankings = lazy(() => import('./components/companion/CompanionRankings'));
const CompanionScoring = lazy(() => import('./components/companion/CompanionScoring'));
const CompanionLeague = lazy(() => import('./components/companion/CompanionLeague'));
const CompanionMatchup = lazy(() => debugCompanionTimeAsync(
  'CompanionMatchup chunk import',
  () => import('./components/companion/CompanionMatchup'),
));
const CompanionWaiver = lazy(() => debugCompanionTimeAsync(
  'CompanionWaiver chunk import',
  () => import('./components/companion/CompanionWaiver'),
));
const CompanionHeatmap = lazy(() => import('./components/companion/CompanionHeatmap'));
const CompanionDefense = lazy(() => import('./components/companion/CompanionDefense'));
const CompanionTrade = lazy(() => import('./components/companion/CompanionTrade'));
const ScoutTab = lazy(() => import('./components/scout/ScoutTab'));
const DraftAssistant = lazy(() => import('./components/draft/DraftAssistant'));

function SectionLoading({ label = 'Loading section' }) {
  return (
    <div className="flex items-center justify-center py-16">
      <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>{label}...</span>
    </div>
  );
}

function ModalLoading({ label = 'Loading' }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl px-5 py-4"
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-separator)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)',
        }}
      >
        <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>{label}...</span>
      </div>
    </div>
  );
}

function RouteLoadingOverlay({ label = 'Opening player' }) {
  const [progress, setProgress] = useState(12);

  useEffect(() => {
    const start = window.performance?.now?.() ?? Date.now();
    const interval = window.setInterval(() => {
      const now = window.performance?.now?.() ?? Date.now();
      const elapsed = now - start;
      const target = elapsed < 220
        ? 48
        : elapsed < 650
          ? 72
          : 88;

      setProgress((current) => Math.min(target, current + Math.max(4, (target - current) * 0.34)));
    }, 80);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-4"
      style={{
        background: 'var(--color-bg)',
        backgroundColor: 'color-mix(in srgb, var(--color-bg) 84%, transparent)',
        backdropFilter: 'blur(6px)',
      }}
      role="status"
      aria-live="polite"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-lg"
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-separator)',
          boxShadow: '0 18px 52px rgba(0,0,0,0.22)',
        }}
      >
        <div className="h-1 w-full overflow-hidden" style={{ background: 'var(--color-fill-secondary)' }}>
          <div
            className="h-full rounded-r-full transition-[width] duration-150"
            style={{ width: `${progress}%`, background: 'var(--color-signature)' }}
          />
        </div>
        <div className="flex items-center gap-3 px-4 py-3" style={{ color: 'var(--color-label-secondary)' }}>
          <svg className="h-4 w-4 shrink-0 animate-spin" style={{ color: 'var(--color-accent)' }} fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="min-w-0 truncate text-sm font-semibold">{label}...</span>
        </div>
      </div>
    </div>
  );
}

function LeagueContextHeader({
  league,
  season,
  changeSeason,
  seasonOptions,
  onSwitchLeague,
  className,
}) {
  const years = seasonOptions?.length ? seasonOptions : [String(league?.season ?? season)];

  return (
    <div className={className ?? 'flex items-center gap-2 mt-3 mb-3 px-4'}>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold truncate" style={{ color: 'var(--color-label-secondary)' }}>
          {league?.name ?? 'League'}
        </span>
      </div>
      {years.length > 1 && (
        <div className="flex gap-1 shrink-0">
          {years.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => changeSeason(s)}
              className="px-2 py-0.5 rounded text-xs font-semibold transition-colors"
              style={{
                background: season === s ? 'var(--color-signature)' : 'var(--color-fill)',
                color: season === s ? 'var(--color-signature-fg)' : 'var(--color-label-tertiary)',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onSwitchLeague}
        className="inline-flex items-center gap-1.5 text-xs font-semibold shrink-0 px-2.5 py-1 rounded-lg active:opacity-70"
        style={{
          background: 'var(--color-fill)',
          color: 'var(--color-label-secondary)',
          border: '1px solid var(--color-separator)',
        }}
        aria-label="Switch league"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 7h11l-3-3" />
          <path d="M17 17H6l3 3" />
          <path d="M18 7l-3 3" />
          <path d="M6 17l3-3" />
        </svg>
        Switch
      </button>
    </div>
  );
}

function getScheduleTeamId(value) {
  if (typeof value === 'string') return value.toUpperCase();
  return value?.id ? String(value.id).toUpperCase() : null;
}

function getScheduleGameTeamId(game, side) {
  if (side === 'away') {
    return getScheduleTeamId(game?.awayTeam)
      ?? getScheduleTeamId(game?.away)
      ?? getScheduleTeamId(game?.awayTeamId)
      ?? getScheduleTeamId(game?.awayId);
  }
  return getScheduleTeamId(game?.homeTeam)
    ?? getScheduleTeamId(game?.home)
    ?? getScheduleTeamId(game?.homeTeamId)
    ?? getScheduleTeamId(game?.homeId);
}

function buildPredictionScheduleModel(seasonSchedule, teams = []) {
  const teamSchedules = new Map(teams.map((team) => [team.id, []]));
  const hasScheduleGames = seasonSchedule?.metadata?.hasSchedule || seasonSchedule?.games?.length > 0;

  if (!hasScheduleGames) {
    return {
      schedule: seasonSchedule,
      teams,
      hasScheduleGames: false,
    };
  }

  const weeks = (seasonSchedule?.weeks ?? []).map((week) => ({
    ...week,
    games: (week.games ?? []).map((game, index) => {
      const awayTeam = getScheduleGameTeamId(game, 'away');
      const homeTeam = getScheduleGameTeamId(game, 'home');
      const awaySchedule = teamSchedules.get(awayTeam) ?? [];
      const homeSchedule = teamSchedules.get(homeTeam) ?? [];
      const awayGameIndex = awaySchedule.length;
      const homeGameIndex = homeSchedule.length;
      const id = game.id ?? `${seasonSchedule.season ?? 2026}-W${String(week.week).padStart(2, '0')}-${awayTeam}-${homeTeam}-${index + 1}`;
      const normalizedGame = {
        ...game,
        id,
        week: week.week,
        awayTeam,
        homeTeam,
        awayGameIndex,
        homeGameIndex,
      };

      if (awayTeam) {
        awaySchedule.push({
          id,
          week: week.week,
          opponentId: homeTeam,
          awayTeam,
          homeTeam,
          gameIndex: awayGameIndex,
        });
        teamSchedules.set(awayTeam, awaySchedule);
      }

      if (homeTeam) {
        homeSchedule.push({
          id,
          week: week.week,
          opponentId: awayTeam,
          awayTeam,
          homeTeam,
          gameIndex: homeGameIndex,
        });
        teamSchedules.set(homeTeam, homeSchedule);
      }

      return normalizedGame;
    }),
  }));

  const predictionTeams = teams.map((team) => {
    const schedule = teamSchedules.get(team.id) ?? [];
    if (!schedule.length) return team;
    return {
      ...team,
      schedule,
      opponents: schedule.map((entry) => entry.opponentId),
    };
  });

  return {
    schedule: { ...seasonSchedule, weeks, games: weeks.flatMap((week) => week.games) },
    teams: predictionTeams,
    hasScheduleGames: true,
  };
}

function getPredictionGameWinner(game, predictions) {
  const awayTeam = getScheduleGameTeamId(game, 'away');
  const homeTeam = getScheduleGameTeamId(game, 'home');
  const awayResult = predictions?.[awayTeam]?.gameResults?.[game.awayGameIndex];
  const homeResult = predictions?.[homeTeam]?.gameResults?.[game.homeGameIndex];

  if (awayResult === 'W' || homeResult === 'L') return awayTeam;
  if (awayResult === 'L' || homeResult === 'W') return homeTeam;
  if (awayResult === 'T' || homeResult === 'T') return 'T';
  return null;
}

function buildPredictionPickMap(weeks = [], predictions = {}) {
  return weeks.reduce((acc, week) => {
    for (const game of week.games ?? []) {
      const winner = getPredictionGameWinner(game, predictions);
      if (winner) acc[game.id] = winner;
    }
    return acc;
  }, {});
}

const VALID_PREDICTION_RESULTS = new Set(['W', 'L', 'T']);
const FULL_SEASON_GAME_COUNT = 17;
const REGULAR_SEASON_GAME_COUNT = 272;

function getPositiveCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

function getTeamPredictionGameCount(team) {
  return Math.max(
    team?.opponents?.length || 0,
    team?.schedule?.length || 0,
    FULL_SEASON_GAME_COUNT,
  );
}

function countRecordDecisionSlots(record, teamGameCount) {
  if (!record) return 0;
  const decisions = getPositiveCount(record.wins)
    + getPositiveCount(record.losses)
    + getPositiveCount(record.ties);
  return Math.min(teamGameCount, decisions);
}

function countExplicitGameSlots(record, teamGameCount) {
  return Object.entries(record?.gameResults ?? {}).reduce((count, [slot, result]) => {
    const index = Number(slot);
    if (!Number.isInteger(index) || index < 0 || index >= teamGameCount) return count;
    return VALID_PREDICTION_RESULTS.has(result) ? count + 1 : count;
  }, 0);
}

function isManualRecordPrediction(record) {
  return Boolean(record?.manualOverride || record?.recordSource === 'manual');
}

function getPredictionProgressSummary(teams = [], predictions = {}, gameCounts = {}) {
  let completedTeams = 0;
  let manualTeamSlots = 0;
  let totalTeamSlots = gameCounts.totalTeamSlots ?? 0;

  if (!totalTeamSlots) {
    totalTeamSlots = teams.reduce((sum, team) => sum + getTeamPredictionGameCount(team), 0);
  }

  for (const team of teams) {
    const teamGameCount = getTeamPredictionGameCount(team);
    const record = predictions?.[team.id];
    const recordSlots = countRecordDecisionSlots(record, teamGameCount);
    const explicitSlots = countExplicitGameSlots(record, teamGameCount);
    const hasCompleteManualRecord = isManualRecordPrediction(record) && recordSlots >= teamGameCount;
    const hasCompleteGamePicks = explicitSlots >= teamGameCount;

    if (hasCompleteManualRecord || hasCompleteGamePicks) {
      completedTeams += 1;
    }

    if (isManualRecordPrediction(record)) {
      manualTeamSlots += Math.max(0, recordSlots - explicitSlots);
    }
  }

  const totalGames = gameCounts.totalGames
    || Math.round(totalTeamSlots / 2)
    || (teams.length ? REGULAR_SEASON_GAME_COUNT : 0);
  const pickedGames = Math.min(
    totalGames,
    (gameCounts.pickedGames ?? 0) + (manualTeamSlots / 2),
  );

  return {
    completedTeams,
    totalTeams: teams.length,
    pickedGames,
    totalGames,
  };
}

function prunePlayoffPicksAfterChange(previous, matchupId) {
  const next = { ...previous };
  const conference = matchupId.startsWith('AFC-') ? 'AFC' : matchupId.startsWith('NFC-') ? 'NFC' : null;
  if (matchupId === 'super-bowl') return next;

  if (conference && matchupId.includes('-wc-')) {
    delete next[`${conference}-div-1`];
    delete next[`${conference}-div-2`];
    delete next[`${conference}-championship`];
    delete next['super-bowl'];
    return next;
  }

  if (conference && matchupId.includes('-div-')) {
    delete next[`${conference}-championship`];
    delete next['super-bowl'];
    return next;
  }

  if (conference && matchupId.endsWith('-championship')) {
    delete next['super-bowl'];
  }

  return next;
}

function AppInner() {
  const [scheduleData, setScheduleData] = useState(null);
  const [seasonSchedule, setSeasonSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [appRoute, setAppRoute] = useState(() => parseAppRoute(window.location.pathname, window.location.search));
  const [statsNavBack, setStatsNavBack] = useState(null); // { label, onBack } | null — contextual back from external nav
  const [statsDrilldownPending, setStatsDrilldownPending] = useState(null);
  const draftPlayerOpenTokenRef = useRef(0);
  const [tradeAnalyticsPrewarmRequested, setTradeAnalyticsPrewarmRequested] = useState(false);
  const [, startRouteTransition] = useTransition();

  const { hasLeague, selectedLeagueId, season, changeSeason, league, linkedLeagueSeasonOptions, scoringOverridePaused } = useSleeperLeague();
  const {
    statsLoading,
    seasonStats,
    players: sleeperPlayers,
    espnIdOverrides,
  } = useSleeperStats();

  const {
    getPredictionCount,
    getGamePredictionCounts,
    resetAllPredictions,
    predictions,
    importPredictions,
    generateRandomPredictions,
    setManualTeamRecord,
    setTeamGameResults,
  } = usePredictions();
  const { darkMode, toggleDarkMode, favoriteTeam, setFavoriteTeam } = useTheme();
  const fileInputRef = useRef(null);
  const contentAreaRef = useRef(null);
  const pendingContentScrollTopRef = useRef(null);
  const latestAppRouteRef = useRef(appRoute);
  const heatmapRouteUpdateTimerRef = useRef(null);
  const pendingHeatmapRoutePatchRef = useRef(null);

  const [contentScrolled, setContentScrolled] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebarCollapsed') === 'true'; } catch { return false; }
  });
  const toggleSidebarCollapsed = () => setSidebarCollapsed(prev => {
    const next = !prev;
    try { localStorage.setItem('sidebarCollapsed', String(next)); } catch { /* ignore */ }
    return next;
  });
  const [exportPreviewOpen, setExportPreviewOpen] = useState(false);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);
  const [leagueSwitcherOpen, setLeagueSwitcherOpen] = useState(false);
  useBodyScrollLock(leagueSwitcherOpen);

  const preserveContentScrollDuringUpdate = useCallback((update) => {
    pendingContentScrollTopRef.current = contentAreaRef.current?.scrollTop ?? null;
    update();
  }, []);

  useLayoutEffect(() => {
    const scrollTop = pendingContentScrollTopRef.current;
    if (scrollTop == null) return;
    pendingContentScrollTopRef.current = null;

    const contentArea = contentAreaRef.current;
    if (!contentArea) return;
    const maxScrollTop = Math.max(0, contentArea.scrollHeight - contentArea.clientHeight);
    contentArea.scrollTop = Math.min(scrollTop, maxScrollTop);
  }, [scoringOverridePaused]);

  const [predictionPickMode, setPredictionPickMode] = useState('record');
  const [playoffPicks, setPlayoffPicks] = useState({});

  const { isInstallable, isInstalled, triggerInstall } = usePWAInstall();

  const activeTab = appRoute.activeTab;
  const seasonView = appRoute.seasonView;
  const statisticsView = appRoute.statisticsView;
  const statisticsTeamId = appRoute.statisticsTeamId;
  const statisticsPlayerId = appRoute.statisticsPlayerId;
  const statisticsGameId = appRoute.statisticsGameId;
  const statisticsMode = appRoute.statisticsMode ?? STATISTICS_MODES.GAME;
  const statisticsScheduleMode = appRoute.statisticsScheduleMode;
  const statisticsScheduleWeek = appRoute.statisticsScheduleWeek;
  const statisticsScheduleTeamId = appRoute.statisticsScheduleTeamId;
  const statisticsScheduleFilter = appRoute.statisticsScheduleFilter;
  const predictionsTeamId = appRoute.predictionsTeamId;
  const companionView = appRoute.companionView;
  const tradeView = appRoute.tradeView;
  const scoutView = appRoute.scoutView;
  const draftView = appRoute.draftView;

  useEffect(() => {
    latestAppRouteRef.current = appRoute;
  }, [appRoute]);

  const tradeInitPlayer = appRoute.tradePlayerId
    ? {
        sleeperId: appRoute.tradePlayerId,
        side: appRoute.tradeSide ?? 'give',
        partnerRosterId: appRoute.tradePartnerRosterId ?? undefined,
        otherSleeperId: appRoute.tradeOtherPlayerId ?? undefined,
      }
    : null;
  const sleeperPlayerCount = sleeperPlayers ? Object.keys(sleeperPlayers).length : 0;

  useEffect(() => {
    if (activeTab !== 'companion') return;
    debugCompanionLog('Route entered Companion', {
      companionView,
      selectedLeagueId,
      season,
      hasLeague,
      statsLoading,
      hasSeasonStats: Boolean(seasonStats),
      hasSleeperPlayers: sleeperPlayerCount > 0,
    });
  }, [activeTab, companionView, selectedLeagueId, season, hasLeague, statsLoading, seasonStats, sleeperPlayerCount]);
  const waiverInitRequest = appRoute.companionView === 'waiver' && appRoute.waiverPosition
    ? { position: appRoute.waiverPosition }
    : null;
  const matchupInitRequest = appRoute.companionView === 'matchup' && (appRoute.matchupWeek || appRoute.matchupPlayerId)
    ? { week: appRoute.matchupWeek, playerId: appRoute.matchupPlayerId }
    : null;
  const rankingsPosition = appRoute.companionView === 'rankings' ? (appRoute.rankingsPosition ?? 'ALL') : 'ALL';
  const rankingsRosterId = appRoute.companionView === 'rankings' ? appRoute.rankingsRosterId : null;
  const leagueRouteState = appRoute.companionView === 'league'
    ? {
        subView: appRoute.leagueSubview ?? 'roster',
        rosterId: appRoute.leagueRosterId ?? null,
      }
    : { subView: 'roster', rosterId: null };
  const heatmapRouteState = appRoute.companionView === 'heatmap'
    ? {
        viewMode: appRoute.heatmapViewMode ?? 'offense',
        position: appRoute.heatmapPosition ?? 'ALL',
        defensePosition: appRoute.heatmapDefensePosition ?? 'ALL',
        statMode: appRoute.heatmapStatMode ?? 'pts',
        defenseStatMode: appRoute.heatmapDefenseStatMode ?? 'pts',
        scope: appRoute.heatmapScope ?? 'overall',
        location: appRoute.heatmapLocation ?? 'all',
        sortKey: appRoute.heatmapSortKey ?? 'avg',
        sortDir: appRoute.heatmapSortDir ?? 'desc',
        teamSort: appRoute.heatmapTeamSort ?? 'alpha',
        useTeamColors: appRoute.heatmapUseTeamColors === '1',
        vegasView: appRoute.heatmapVegasView ?? 'spread',
    }
    : null;
  const defenseRouteState = appRoute.companionView === 'defense'
    ? {
        mode: appRoute.defenseMode ?? 'stats',
        position: appRoute.defensePosition ?? 'QB',
        stat: appRoute.defenseStat ?? 'pass_yd',
        sort: appRoute.defenseSort ?? 'total',
        dir: appRoute.defenseDir ?? 'desc',
        query: appRoute.defenseQuery ?? '',
      }
    : null;
  const readHistoryState = useCallback(() => {
    const current = window.history.state;
    return current && typeof current === 'object' ? current : {};
  }, []);

  const applyRoute = useCallback((nextRoute, { replace = false, state = null } = {}) => {
    const normalized = normalizeAppRoute(nextRoute);
    const nextPath = buildAppPath(normalized);
    const currentState = readHistoryState();
    const nextState = { ...currentState, ...(state ?? {}), _nav: 'app' };
    const samePath = nextPath === `${window.location.pathname}${window.location.search}`;

    if (replace) {
      window.history.replaceState(nextState, '', nextPath);
    } else if (!samePath || state) {
      window.history.pushState(nextState, '', nextPath);
    }

    startRouteTransition(() => {
      setAppRoute((prev) => (isSameAppRoute(prev, normalized) ? prev : normalized));
    });
  }, [readHistoryState, startRouteTransition]);

  const navigateToTab = useCallback((tab) => {
    applyRoute(getDefaultRouteForTab(tab));
  }, [applyRoute]);

  const navigateSeasonView = useCallback((view) => {
    applyRoute({ activeTab: 'predictions', seasonView: view });
  }, [applyRoute]);

  const navigatePredictionTeam = useCallback((team) => {
    if (!team?.id) return;
    applyRoute({ activeTab: 'predictions', seasonView: 'predictions', predictionsTeamId: team.id });
  }, [applyRoute]);

  const navigateCompanionView = useCallback((view) => {
    applyRoute({ activeTab: 'companion', companionView: view });
  }, [applyRoute]);

  const updateCompanionRoute = useCallback((patch, options = {}) => {
    applyRoute({ ...appRoute, activeTab: 'companion', ...patch }, options);
  }, [appRoute, applyRoute]);

  const scheduleHeatmapRouteUpdate = useCallback((nextState) => {
    pendingHeatmapRoutePatchRef.current = {
      companionView: 'heatmap',
      heatmapViewMode: nextState.viewMode,
      heatmapPosition: nextState.position === 'ALL' ? null : nextState.position,
      heatmapDefensePosition: nextState.defensePosition === 'ALL' ? null : nextState.defensePosition,
      heatmapStatMode: nextState.statMode,
      heatmapDefenseStatMode: nextState.defenseStatMode,
      heatmapScope: nextState.scope,
      heatmapLocation: nextState.location,
      heatmapSortKey: nextState.sortKey,
      heatmapSortDir: nextState.sortDir,
      heatmapTeamSort: nextState.teamSort,
      heatmapUseTeamColors: nextState.useTeamColors ? '1' : '0',
      heatmapVegasView: nextState.vegasView,
    };

    if (heatmapRouteUpdateTimerRef.current) {
      window.clearTimeout(heatmapRouteUpdateTimerRef.current);
    }

    heatmapRouteUpdateTimerRef.current = window.setTimeout(() => {
      heatmapRouteUpdateTimerRef.current = null;
      const patch = pendingHeatmapRoutePatchRef.current;
      pendingHeatmapRoutePatchRef.current = null;
      if (!patch) return;

      const currentRoute = latestAppRouteRef.current;
      if (currentRoute.activeTab !== 'companion' || currentRoute.companionView !== 'heatmap') return;

      applyRoute({ ...currentRoute, activeTab: 'companion', ...patch }, { replace: true });
    }, 120);
  }, [applyRoute]);

  useEffect(() => () => {
    if (heatmapRouteUpdateTimerRef.current) {
      window.clearTimeout(heatmapRouteUpdateTimerRef.current);
      heatmapRouteUpdateTimerRef.current = null;
    }
    pendingHeatmapRoutePatchRef.current = null;
  }, []);

  useEffect(() => {
    if (activeTab === 'companion' && companionView === 'heatmap') return;
    if (heatmapRouteUpdateTimerRef.current) {
      window.clearTimeout(heatmapRouteUpdateTimerRef.current);
      heatmapRouteUpdateTimerRef.current = null;
    }
    pendingHeatmapRoutePatchRef.current = null;
  }, [activeTab, companionView]);

  const navigateTradeView = useCallback((view) => {
    applyRoute({ activeTab: 'trade', tradeView: view });
  }, [applyRoute]);

  const navigateScoutView = useCallback((view) => {
    applyRoute({ activeTab: 'scout', scoutView: view });
  }, [applyRoute]);

  const navigateDraftView = useCallback((view) => {
    applyRoute({ activeTab: 'draft', draftView: view });
  }, [applyRoute]);

  const prewarmTradeView = useCallback((view) => {
    if (view === 'intelligence' || view === 'upgrade') {
      setTradeAnalyticsPrewarmRequested(true);
    }
  }, []);

  const buildStatsBackContext = useCallback((label, backRoute) => {
    if (!label || !backRoute) return null;
    const normalizedBackRoute = normalizeAppRoute(backRoute);
    return {
      label,
      onBack: () => {
        applyRoute(normalizedBackRoute);
        setStatsNavBack(null);
      },
    };
  }, [applyRoute]);

  const navigateToStatisticsHome = useCallback(() => {
    applyRoute({ activeTab: 'statistics', statisticsView: 'browser' });
  }, [applyRoute]);

  const navigateStatisticsSubView = useCallback((view) => {
    if (view === 'schedule') {
      applyRoute({ activeTab: 'statistics', statisticsView: 'schedule' });
      return;
    }
    if (view === 'standings') {
      applyRoute({ activeTab: 'statistics', statisticsView: 'standings' });
      return;
    }
    applyRoute({ activeTab: 'statistics', statisticsView: 'browser' });
  }, [applyRoute]);

  const navigateToStatisticsTeam = useCallback((team) => {
    if (!team?.id) return;
    applyRoute({
      activeTab: 'statistics',
      statisticsView: 'team',
      statisticsTeamId: team.id,
    });
  }, [applyRoute]);

  const navigateToStatisticsScheduleTeam = useCallback((teamId) => {
    if (!teamId) return;
    applyRoute({
      activeTab: 'statistics',
      statisticsView: 'schedule',
      statisticsScheduleMode: 'team',
      statisticsScheduleTeamId: teamId,
    });
  }, [applyRoute]);

  const navigateToStatisticsGame = useCallback((game) => {
    const gameId = game?.espnEventId ?? game?.eventId ?? game?.id;
    if (!gameId) return;
    applyRoute({
      activeTab: 'statistics',
      statisticsView: 'game',
      statisticsGameId: String(gameId),
    });
  }, [applyRoute]);

  const updateStatisticsScheduleRoute = useCallback((patch, options = {}) => {
    applyRoute({
      ...appRoute,
      activeTab: 'statistics',
      statisticsView: 'schedule',
      ...patch,
    }, options);
  }, [appRoute, applyRoute]);

  const navigateToStatisticsPlayer = useCallback((player, { backLabel = null, backRoute = null, mode = STATISTICS_MODES.GAME } = {}) => {
    if (!player?.id) return;

    const playerMeta = buildStatisticsPlayerMeta(player);
    if (!playerMeta?.id) return;
    const nextBackContext = buildStatsBackContext(backLabel, backRoute);

    setStatsDrilldownPending({
      playerId: playerMeta.id,
      label: `Opening ${playerMeta.displayName || 'player'}`,
    });
    setStatsNavBack(nextBackContext);
    applyRoute({
      activeTab: 'statistics',
      statisticsView: 'player',
      statisticsPlayerId: playerMeta.id,
      statisticsPlayerSlug: slugifyRouteSegment(playerMeta.displayName || playerMeta.id) || 'player',
      statisticsMode: mode,
    }, {
      state: {
        statsBackLabel: backLabel ?? null,
        statsBackRoute: backRoute ? normalizeAppRoute(backRoute) : null,
      },
    });
  }, [applyRoute, buildStatsBackContext]);

  const navigateDraftPlayerToStatistics = useCallback(async (sleeperId) => {
    if (!sleeperId) return;
    const token = draftPlayerOpenTokenRef.current + 1;
    draftPlayerOpenTokenRef.current = token;

    const sleeperPlayer = sleeperPlayers?.[sleeperId];
    const displayName = sleeperPlayer?.full_name
      || `${sleeperPlayer?.first_name ?? ''} ${sleeperPlayer?.last_name ?? ''}`.trim()
      || 'player';

    setStatsDrilldownPending({
      playerId: `draft:${sleeperId}`,
      label: `Opening ${displayName}`,
    });

    try {
      const playerMeta = await resolveStatisticsPlayerMetaFromSleeperId(sleeperId, sleeperPlayers, espnIdOverrides);
      if (draftPlayerOpenTokenRef.current !== token) return;
      if (!playerMeta) {
        setStatsDrilldownPending(null);
        return;
      }

      navigateToStatisticsPlayer(playerMeta, {
        backLabel: 'Draft',
        backRoute: appRoute,
        mode: STATISTICS_MODES.FANTASY,
      });
    } catch {
      if (draftPlayerOpenTokenRef.current === token) setStatsDrilldownPending(null);
    }
  }, [appRoute, espnIdOverrides, navigateToStatisticsPlayer, sleeperPlayers]);

  useEffect(() => {
    if (!statsDrilldownPending) return undefined;
    const routeHasOpenedPendingPlayer = activeTab === 'statistics'
      && statisticsView === 'player'
      && statisticsPlayerId === statsDrilldownPending.playerId;

    if (!routeHasOpenedPendingPlayer) return undefined;

    const frame = requestAnimationFrame(() => {
      setStatsDrilldownPending(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab, statisticsPlayerId, statisticsView, statsDrilldownPending]);

  useEffect(() => {
    if (!statsDrilldownPending) return undefined;
    const timeout = window.setTimeout(() => {
      setStatsDrilldownPending(null);
    }, 8000);
    return () => window.clearTimeout(timeout);
  }, [statsDrilldownPending]);

  const updateStatisticsMode = useCallback((mode) => {
    if (activeTab !== 'statistics' || statisticsView !== 'player' || !statisticsPlayerId) return;
    applyRoute({
      ...appRoute,
      activeTab: 'statistics',
      statisticsView: 'player',
      statisticsPlayerId,
      statisticsMode: mode,
    });
  }, [activeTab, appRoute, applyRoute, statisticsPlayerId, statisticsView]);

  useEffect(() => {
    const parsedRoute = parseAppRoute(window.location.pathname, window.location.search);
    const canonicalPath = buildAppPath(parsedRoute);
    const currentState = readHistoryState();
    const currentPath = `${window.location.pathname}${window.location.search}`;

    if (canonicalPath !== currentPath || currentState._nav !== 'app') {
      window.history.replaceState({ ...currentState, _nav: 'app' }, '', canonicalPath);
    }

    setAppRoute((prev) => (isSameAppRoute(prev, parsedRoute) ? prev : parsedRoute));
  }, [readHistoryState]);

  useEffect(() => {
    const onPopState = () => {
      setAppRoute(parseAppRoute(window.location.pathname, window.location.search));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (activeTab !== 'statistics' || statisticsView !== 'player') {
      setStatsNavBack(null);
      return;
    }

    const currentState = readHistoryState();
    if (currentState.statsBackLabel && currentState.statsBackRoute) {
      setStatsNavBack(buildStatsBackContext(currentState.statsBackLabel, currentState.statsBackRoute));
      return;
    }

    setStatsNavBack(null);
  }, [activeTab, statisticsView, statisticsPlayerId, buildStatsBackContext, readHistoryState]);

  useEffect(() => {
    Promise.all([loadScheduleData(), loadSeasonSchedule()])
      .then(([data, loadedSeasonSchedule]) => {
        setScheduleData(data);
        setSeasonSchedule(loadedSeasonSchedule);
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  const handleExportJSON = () => { exportAsJSON(predictions); setActionSheetOpen(false); };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await importFromJSON(file);
      importPredictions(data);
      alert(`Imported predictions for ${Object.keys(data).length} teams.`);
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
    e.target.value = '';
  };

  const handleExportImage = () => { setExportPreviewOpen(true); setActionSheetOpen(false); };
  const handleRandom = () => {
    setActionSheetOpen(false);
    if (!window.confirm('This will replace all current predictions with random ones. Continue?')) return;
    if (scheduleData) generateRandomPredictions(scheduleData.teams);
  };
  const handleReset = () => {
    setActionSheetOpen(false);
    if (!window.confirm('Are you sure you want to reset all predictions? This cannot be undone.')) return;
    resetAllPredictions();
  };
  const handleInstall = () => { triggerInstall(); setActionSheetOpen(false); };
  const handleImportClick = () => { fileInputRef.current?.click(); setActionSheetOpen(false); };
  const handleMyTeam = () => { setTeamPickerOpen(true); setActionSheetOpen(false); };

  const predictionScheduleModel = useMemo(
    () => buildPredictionScheduleModel(seasonSchedule, scheduleData?.teams ?? []),
    [scheduleData, seasonSchedule],
  );
  const predictionTeams = predictionScheduleModel.teams;
  const predictionSchedule = predictionScheduleModel.schedule;
  const predictionPickMap = useMemo(
    () => buildPredictionPickMap(predictionSchedule?.weeks ?? [], predictions),
    [predictionSchedule, predictions],
  );

  const handlePredictionRecordChange = useCallback(({ teamId, record }) => {
    if (!teamId || !record) return;
    setManualTeamRecord(teamId, record, predictionTeams);
  }, [predictionTeams, setManualTeamRecord]);

  const handlePredictionGameResultsSave = useCallback(({ teamId, gameResults }) => {
    if (!teamId) return false;
    return setTeamGameResults(teamId, gameResults, predictionTeams);
  }, [predictionTeams, setTeamGameResults]);

  const handlePlayoffPick = useCallback(({ matchupId, winnerId }) => {
    if (!matchupId || !winnerId) return;
    setPlayoffPicks((prev) => {
      const next = prunePlayoffPicksAfterChange(prev, matchupId);
      if (prev[matchupId] === winnerId) {
        delete next[matchupId];
      } else {
        next[matchupId] = winnerId;
      }
      return next;
    });
  }, []);

  const handleOpenPredictionTeam = useCallback((team) => {
    navigatePredictionTeam(team);
  }, [navigatePredictionTeam]);

  const handleBackToAdvancedMode = useCallback(() => {
    setPredictionPickMode('advanced');
    applyRoute({ activeTab: 'predictions', seasonView: 'predictions' });
  }, [applyRoute]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--color-bg)' }}>
        <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>Loading…</span>
      </div>
    );
  }

  if (error || !scheduleData) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--color-bg)' }}>
        <span className="text-sm" style={{ color: 'var(--color-accent-red)' }}>{error || 'No data available'}</span>
      </div>
    );
  }

  const predictionCount = getPredictionCount();
  const progressSummary = getPredictionProgressSummary(
    predictionTeams,
    predictions,
    getGamePredictionCounts(predictionTeams),
  );
  const completedTeamCount = progressSummary.completedTeams;
  const totalTeams = progressSummary.totalTeams || scheduleData.teams.length;
  const pickedGameCount = progressSummary.pickedGames;
  const totalGames = progressSummary.totalGames;
  const isSeasonComplete = totalTeams > 0 && completedTeamCount === totalTeams;
  const statsRoutePlayerMeta = activeTab === 'statistics' && statisticsView === 'player'
    ? (readHistoryState().statsPlayerMeta ?? null)
    : null;

  return (
    <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>

      {/* ── Desktop Sidebar (lg+) ─────────────────────────────── */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={navigateToTab}
        predictionCount={predictionCount}
        completedTeamCount={completedTeamCount}
        totalTeams={totalTeams}
        pickedGameCount={pickedGameCount}
        totalGames={totalGames}
        isSeasonComplete={isSeasonComplete}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
        onGuide={() => setGuideOpen(true)}
        onExportJSON={handleExportJSON}
        onImportJSON={handleImportClick}
        onRandom={handleRandom}
        onReset={handleReset}
        isInstallable={isInstallable}
        isInstalled={isInstalled}
        onInstall={handleInstall}
        favoriteTeam={favoriteTeam}
        onMyTeam={handleMyTeam}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
      />

      {/* ── Main panel ───────────────────────────────────────── */}
      <div className="app-main">

        {/* Top nav bar — mobile/tablet only, hidden lg+ via CSS */}
        <NavBar
          darkMode={darkMode}
          onToggleDarkMode={toggleDarkMode}
          onMenuOpen={() => setActionSheetOpen(true)}
          scrolled={contentScrolled}
        />

        {/* Season sub-navigation */}
        {activeTab === 'predictions' && (
          <div className="season-subnav">
            {/* Title + progress — shown on mobile (lg+ has this in sidebar) */}
            <div className="season-subnav-header lg:hidden">
              <h1
                className="font-display font-bold"
                style={{ fontSize: '20px', color: 'var(--color-label)', letterSpacing: '0.08em' }}
              >
                2026 SEASON
              </h1>
              <span
                className="text-xs font-bold tabular-nums px-2 py-0.5 rounded"
                style={{
                  background: isSeasonComplete ? 'rgba(46,213,120,0.12)' : 'var(--color-fill)',
                  color: isSeasonComplete ? 'var(--color-accent-green)' : 'var(--color-label-secondary)',
                }}
              >
                Teams {completedTeamCount}/{totalTeams}{isSeasonComplete && ' ✓'}
              </span>
            </div>
            <SeasonSubNav activeView={seasonView} onViewChange={navigateSeasonView} />
          </div>
        )}

        {/* Companion sub-navigation */}
        {activeTab === 'companion' && hasLeague && (
          <div className="season-subnav league-subnav">
            <CompanionSubNav activeView={companionView} onViewChange={navigateCompanionView} />
            {/* Desktop: bottom-right of subnav bar, aligned with tab text */}
            <div className="hidden lg:flex items-center absolute bottom-0 right-8 pb-[9px]">
              <LeagueContextHeader
                league={league}
                season={season}
                changeSeason={changeSeason}
                seasonOptions={linkedLeagueSeasonOptions}
                onSwitchLeague={() => setLeagueSwitcherOpen(true)}
                className="flex items-center gap-2"
              />
            </div>
          </div>
        )}

        {activeTab === 'trade' && hasLeague && (
          <div className="season-subnav league-subnav">
            <TradeSubNav activeView={tradeView} onViewChange={navigateTradeView} onViewIntent={prewarmTradeView} />
            {/* Desktop: bottom-right of subnav bar, aligned with tab text */}
            <div className="hidden lg:flex items-center absolute bottom-0 right-8 pb-[9px]">
              <LeagueContextHeader
                league={league}
                season={season}
                changeSeason={changeSeason}
                seasonOptions={linkedLeagueSeasonOptions}
                onSwitchLeague={() => setLeagueSwitcherOpen(true)}
                className="flex items-center gap-2"
              />
            </div>
          </div>
        )}

        {activeTab === 'scout' && (
          <div className="season-subnav">
            <ScoutSubNav activeView={scoutView} onViewChange={navigateScoutView} />
          </div>
        )}

        {activeTab === 'draft' && hasLeague && (
          <div className="season-subnav league-subnav">
            <DraftSubNav activeView={draftView} onViewChange={navigateDraftView} />
            <div className="hidden lg:flex items-center absolute bottom-0 right-8 pb-[9px]">
              <LeagueContextHeader
                league={league}
                season={season}
                changeSeason={changeSeason}
                seasonOptions={linkedLeagueSeasonOptions}
                onSwitchLeague={() => setLeagueSwitcherOpen(true)}
                className="flex items-center gap-2"
              />
            </div>
          </div>
        )}

        {activeTab === 'statistics' && (
          <div className="season-subnav">
            <StatisticsSubNav
              activeView={statisticsView === 'schedule' || statisticsView === 'standings' ? statisticsView : 'stats'}
              onViewChange={navigateStatisticsSubView}
            />
          </div>
        )}

        {/* Scoring override banner — frozen above scroll area */}
        {activeTab === 'companion' && hasLeague && companionView !== 'scoring' && (
          <ScoringOverrideBanner preserveContentScrollDuringUpdate={preserveContentScrollDuringUpdate} />
        )}

        {/* ── Content area ─────────────────────────────────── */}
        <div
          ref={contentAreaRef}
          className="content-area lg:px-8 pt-4 lg:pt-6"
          onScroll={(e) => setContentScrolled(e.currentTarget.scrollTop > 2)}
        >

          {activeTab === 'predictions' && (
            <Suspense fallback={<SectionLoading label="Loading predictions" />}>
              <PredictionsRedesign
                teams={predictionTeams}
                scheduleData={predictionSchedule}
                seasonView={seasonView}
                pickMode={predictionPickMode}
                onPickModeChange={setPredictionPickMode}
                selectedTeamId={predictionsTeamId}
                picks={predictionPickMap}
                predictions={predictions}
                onRecordChange={handlePredictionRecordChange}
                onSaveTeamGameResults={handlePredictionGameResultsSave}
                playoffPicks={playoffPicks}
                onPlayoffPick={handlePlayoffPick}
                onOpenTeam={handleOpenPredictionTeam}
                onBackToAdvancedMode={handleBackToAdvancedMode}
              />
            </Suspense>
          )}

          {activeTab === 'statistics' && statisticsView === 'schedule' && (
            <Suspense fallback={<SectionLoading label="Loading schedule" />}>
              <StatisticsSchedule
                teams={predictionTeams}
                scheduleData={predictionSchedule}
                mode={statisticsScheduleMode}
                week={statisticsScheduleWeek}
                teamId={statisticsScheduleTeamId}
                filter={statisticsScheduleFilter}
                onRouteChange={updateStatisticsScheduleRoute}
                onViewGameStats={navigateToStatisticsGame}
              />
            </Suspense>
          )}

          {activeTab === 'statistics' && statisticsView === 'standings' && (
            <Suspense fallback={<SectionLoading label="Loading standings" />}>
              <StatisticsStandings
                teams={predictionTeams}
                scheduleData={predictionSchedule}
              />
            </Suspense>
          )}

          {activeTab === 'statistics' && statisticsView === 'game' && (
            <Suspense fallback={<SectionLoading label="Loading game statistics" />}>
              <StatisticsGame
                gameId={statisticsGameId}
                teams={predictionTeams}
                scheduleData={predictionSchedule}
                onBackToSchedule={() => navigateStatisticsSubView('schedule')}
              />
            </Suspense>
          )}

          {activeTab === 'statistics' && statisticsView !== 'schedule' && statisticsView !== 'standings' && statisticsView !== 'game' && (
            <Suspense fallback={<SectionLoading label="Loading statistics" />}>
            <PlayerBrowser
              teams={scheduleData.teams}
              darkMode={darkMode}
              statsView={statisticsView}
              selectedTeamId={statisticsTeamId}
              selectedPlayerId={statisticsPlayerId}
              selectedPlayerMeta={statsRoutePlayerMeta}
              selectedPlayerMode={statisticsMode}
              leagueSeason={season}
              navBack={statsNavBack}
              onNavigateHome={navigateToStatisticsHome}
              onNavigateTeam={navigateToStatisticsTeam}
              onNavigatePlayer={navigateToStatisticsPlayer}
              onViewSchedule={navigateToStatisticsScheduleTeam}
              onPlayerModeChange={updateStatisticsMode}
              onBuildTrade={(initialTrade) => {
                applyRoute({
                  activeTab: 'trade',
                  tradeView: initialTrade?.view ?? 'agent',
                  tradePlayerId: initialTrade?.sleeperId,
                  tradeSide: initialTrade?.side,
                  tradePartnerRosterId: initialTrade?.partnerRosterId,
                  tradeOtherPlayerId: initialTrade?.otherSleeperId,
                });
              }}
            />
            </Suspense>
          )}

          {activeTab === 'scout' && (
            <Suspense fallback={<SectionLoading label="Loading scout" />}>
              <ScoutTab view={scoutView} onViewChange={navigateScoutView} />
            </Suspense>
          )}

          {activeTab === 'companion' && !hasLeague && (
            <Suspense fallback={<SectionLoading label="Loading connect" />}>
              <CompanionConnect />
            </Suspense>
          )}

          {activeTab === 'trade' && !hasLeague && (
            <Suspense fallback={<SectionLoading label="Loading connect" />}>
              <CompanionConnect />
            </Suspense>
          )}

          {activeTab === 'draft' && !hasLeague && (
            <Suspense fallback={<SectionLoading label="Loading connect" />}>
              <CompanionConnect />
            </Suspense>
          )}

          {activeTab === 'trade' && hasLeague && (
            <Suspense fallback={<SectionLoading label="Loading Trade" />}>
              <CompanionTrade
                initialPlayer={tradeInitPlayer}
                onConsumeInitialPlayer={() => applyRoute({
                  activeTab: 'trade',
                  tradeView,
                }, { replace: true })}
                onViewPlayer={(id, meta) => {
                  navigateToStatisticsPlayer({ id, ...meta }, {
                    backLabel: 'Trade',
                    backRoute: {
                      activeTab: 'trade',
                      tradeView,
                    },
                  });
                }}
                onOpenWaiver={(position) => {
                  if (!position) return;
                  applyRoute({ activeTab: 'companion', companionView: 'waiver', waiverPosition: position });
                }}
                prewarmAnalytics={tradeAnalyticsPrewarmRequested}
                view={tradeView}
                onViewChange={navigateTradeView}
              />
            </Suspense>
          )}

          {activeTab === 'companion' && hasLeague && (
            <>
              {companionView === 'roster'    && (
                <Suspense fallback={<SectionLoading label="Loading Roster" />}>
                <CompanionRoster
                  onTradePlayer={(sleeperId) => {
                    applyRoute({ activeTab: 'trade', tradeView: 'agent', tradePlayerId: sleeperId, tradeSide: 'give' });
                  }}
                  onOpenMatchupWeek={(playerId, week) => {
                    applyRoute({ activeTab: 'companion', companionView: 'matchup', matchupPlayerId: playerId, matchupWeek: week });
                  }}
                  onViewPlayer={(sleeperId) => {
                    const playerMeta = buildStatisticsPlayerMetaFromSleeperId(sleeperId, sleeperPlayers, espnIdOverrides);
                    if (!playerMeta) return;
                    navigateToStatisticsPlayer(playerMeta, {
                      backLabel: 'Roster',
                      backRoute: appRoute,
                      mode: STATISTICS_MODES.FANTASY,
                    });
                  }}
                />
                </Suspense>
              )}
              {companionView === 'rankings'  && (
                <Suspense fallback={<SectionLoading label="Loading Rankings" />}>
                  <CompanionRankings
                    positionFilter={rankingsPosition}
                    rosterFilter={rankingsRosterId}
                    onPositionFilterChange={(position) => updateCompanionRoute({
                      companionView: 'rankings',
                      rankingsPosition: position === 'ALL' ? null : position,
                    }, { replace: true })}
                    onRosterFilterChange={(rosterId) => updateCompanionRoute({
                      companionView: 'rankings',
                      rankingsRosterId: rosterId,
                    }, { replace: true })}
                    onViewPlayer={(sleeperId) => {
                      const playerMeta = buildStatisticsPlayerMetaFromSleeperId(sleeperId, sleeperPlayers, espnIdOverrides);
                      if (!playerMeta) return;
                      navigateToStatisticsPlayer(playerMeta, {
                        backLabel: 'Rankings',
                        backRoute: appRoute,
                        mode: STATISTICS_MODES.FANTASY,
                      });
                    }}
                  />
                </Suspense>
              )}
              {companionView === 'matchup'   && (
                <Suspense fallback={<SectionLoading label="Loading Matchup" />}>
                  <CompanionMatchup
                    initialWeekRequest={matchupInitRequest}
                    selectedWeek={appRoute.matchupWeek ?? null}
                    onWeekChange={(week) => updateCompanionRoute({
                      companionView: 'matchup',
                      matchupWeek: week,
                    }, { replace: true })}
                    onConsumeInitialWeekRequest={() => updateCompanionRoute({
                      companionView: 'matchup',
                      matchupWeek: appRoute.matchupWeek ?? null,
                      matchupPlayerId: null,
                    }, { replace: true })}
                    onViewPlayer={(id, meta, options = {}) => {
                      navigateToStatisticsPlayer({ id, ...meta }, {
                        backLabel: 'Matchup',
                        backRoute: appRoute,
                        mode: options.mode ?? STATISTICS_MODES.FANTASY,
                      });
                    }}
                  />
                </Suspense>
              )}
              {companionView === 'waiver'    && (
                <Suspense fallback={<SectionLoading label="Loading Waiver" />}>
                  <CompanionWaiver
                    initialPositionRequest={waiverInitRequest}
                    positionFilter={appRoute.waiverPosition ?? 'ALL'}
                    onPositionFilterChange={(position) => updateCompanionRoute({
                      companionView: 'waiver',
                      waiverPosition: position === 'ALL' ? null : position,
                    }, { replace: true })}
                    onConsumeInitialPositionRequest={() => {}}
                    onViewPlayer={(id, meta) => {
                      navigateToStatisticsPlayer({ id, ...meta }, {
                        backLabel: 'Waiver',
                        backRoute: appRoute,
                        mode: STATISTICS_MODES.FANTASY,
                      });
                    }}
                  />
                </Suspense>
              )}
              {companionView === 'league'   && (
                <Suspense fallback={<SectionLoading label="Loading League" />}>
                <CompanionLeague
                  routeState={leagueRouteState}
                  onRouteStateChange={(nextState) => updateCompanionRoute({
                    companionView: 'league',
                    leagueSubview: nextState.subView ?? 'roster',
                    leagueRosterId: nextState.rosterId ?? null,
                  }, { replace: true })}
                  onViewPlayer={(sleeperId) => {
                    const playerMeta = buildStatisticsPlayerMetaFromSleeperId(sleeperId, sleeperPlayers, espnIdOverrides);
                    if (!playerMeta) return;
                    navigateToStatisticsPlayer(playerMeta, {
                      backLabel: 'League',
                      backRoute: appRoute,
                      mode: STATISTICS_MODES.FANTASY,
                    });
                  }}
                  onTradePlayer={(sleeperId, partnerRosterId, side = 'get') => {
                    applyRoute({
                      activeTab: 'trade',
                      tradeView: 'agent',
                      tradePlayerId: sleeperId,
                      tradeSide: side,
                      tradePartnerRosterId: partnerRosterId,
                    });
                  }}
                />
                </Suspense>
              )}
              {companionView === 'heatmap'   && (
                <Suspense fallback={<SectionLoading label="Loading Heatmap" />}>
                  <CompanionHeatmap
                    routeState={heatmapRouteState}
                    onRouteStateChange={scheduleHeatmapRouteUpdate}
                    onViewPlayer={(id, meta) => {
                      navigateToStatisticsPlayer({ id, ...meta }, {
                        backLabel: 'Heatmap',
                        backRoute: appRoute,
                        mode: STATISTICS_MODES.FANTASY,
                      });
                    }}
                  />
                </Suspense>
              )}
              {companionView === 'defense'   && (
                <Suspense fallback={<SectionLoading label="Loading Defense" />}>
                  <CompanionDefense
                    routeState={defenseRouteState}
                    onRouteStateChange={(nextState) => updateCompanionRoute({
                      companionView: 'defense',
                      defenseMode: nextState.mode,
                      defensePosition: nextState.position,
                      defenseStat: nextState.stat,
                      defenseSort: nextState.sort,
                      defenseDir: nextState.dir,
                      defenseQuery: nextState.query || null,
                    }, { replace: true })}
                  />
                </Suspense>
              )}
              {companionView === 'scoring'   && (
                <Suspense fallback={<SectionLoading label="Loading Scoring" />}>
                  <CompanionScoring />
                </Suspense>
              )}
            </>
          )}

          {activeTab === 'draft' && hasLeague && (
            <Suspense fallback={<SectionLoading label="Loading Draft" />}>
              <DraftAssistant
                view={draftView}
                onViewPlayer={navigateDraftPlayerToStatistics}
              />
            </Suspense>
          )}
        </div>

        {/* Bottom tab bar — mobile/tablet only, hidden lg+ via CSS */}
        <BottomTabBar activeTab={activeTab} onTabChange={navigateToTab} />
      </div>

      {statsDrilldownPending && (
        <RouteLoadingOverlay label={statsDrilldownPending.label} />
      )}

      {/* ── Action Sheet (mobile menu) ───────────────────────── */}
      {actionSheetOpen && (
        <ActionSheet
          onClose={() => setActionSheetOpen(false)}
          predictionCount={predictionCount}
          activeTab={activeTab}
          onGuide={() => { setGuideOpen(true); setActionSheetOpen(false); }}
          onExportImage={handleExportImage}
          onExportJSON={handleExportJSON}
          onImportJSON={handleImportClick}
          onRandom={handleRandom}
          onReset={handleReset}
          onInstall={isInstallable && !isInstalled ? handleInstall : null}
          onMyTeam={handleMyTeam}
          favoriteTeam={favoriteTeam}
          league={hasLeague && (activeTab === 'companion' || activeTab === 'trade' || activeTab === 'draft') ? league : null}
          leagueSeason={season}
          leagueSeasonOptions={linkedLeagueSeasonOptions}
          onLeagueSeasonChange={changeSeason}
          onSwitchLeague={() => {
            setActionSheetOpen(false);
            setLeagueSwitcherOpen(true);
          }}
        />
      )}

      {/* ── Modals ────────────────────────────────────────────── */}
      {guideOpen && (
        <Suspense fallback={<ModalLoading label="Loading guide" />}>
          <Guide
            onClose={() => setGuideOpen(false)}
            activeTab={activeTab}
            seasonView={seasonView}
            statisticsView={statisticsView}
            companionView={companionView}
            tradeView={tradeView}
            scoutView={scoutView}
            draftView={draftView}
          />
        </Suspense>
      )}
      {teamPickerOpen && (
        <Suspense fallback={<ModalLoading label="Loading team picker" />}>
          <FavoriteTeamPicker onClose={() => setTeamPickerOpen(false)} />
        </Suspense>
      )}

      {leagueSwitcherOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setLeagueSwitcherOpen(false)}
        >
          <div
            className="modal-panel w-full max-w-xl rounded-2xl overflow-hidden max-h-[86vh] flex flex-col"
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-separator)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-separator)' }}>
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--color-label-tertiary)', fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif" }}>
                  Switch League
                </div>
                <div className="mt-1 text-sm" style={{ color: 'var(--color-label-secondary)' }}>
                  Choose a Sleeper season and league.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLeagueSwitcherOpen(false)}
                className="px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] active:opacity-60"
                style={{
                  fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif",
                  background: 'var(--color-fill)',
                  color: 'var(--color-label-secondary)',
                  border: '1px solid var(--color-separator)',
                  borderRadius: 0,
                }}
              >
                Close
              </button>
            </div>
            <div className="overflow-y-auto">
              <Suspense fallback={<SectionLoading label="Loading leagues" />}>
                <CompanionConnect
                  forceLeaguePicker
                  onLeagueSelected={() => setLeagueSwitcherOpen(false)}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {exportPreviewOpen && (
        <Suspense fallback={<ModalLoading label="Preparing export" />}>
          <ExportPreview teams={scheduleData.teams} onClose={() => setExportPreviewOpen(false)} />
        </Suspense>
      )}

      <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
    </div>
  );
}

function App() {
  return (
    <SleeperProvider>
      <AppInner />
    </SleeperProvider>
  );
}

export default App;
