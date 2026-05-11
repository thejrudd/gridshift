import { Suspense, lazy, useCallback, useEffect, useState, useRef, useTransition } from 'react';
import { loadScheduleData } from './utils/scheduleParser';
import { usePredictions } from './context/PredictionContext';
import { useTheme } from './context/ThemeContext';
import { validateTotalWinsLosses } from './utils/validation';
import { exportAsJSON, importFromJSON } from './utils/exportImport';
import TeamList from './components/TeamList';
import { usePWAInstall } from './hooks/usePWAInstall';
import useBodyScrollLock from './hooks/useBodyScrollLock';
import NavBar from './components/NavBar';
import BottomTabBar from './components/BottomTabBar';
import SeasonSubNav from './components/SeasonSubNav';
import CompanionSubNav from './components/CompanionSubNav';
import TradeSubNav from './components/TradeSubNav';
import ScoutSubNav from './components/ScoutSubNav';
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
import { buildStatisticsPlayerMeta, buildStatisticsPlayerMetaFromSleeperId, STATISTICS_MODES } from './utils/playerDrilldown';
import { debugCompanionLog, debugCompanionTimeAsync } from './utils/companionPerfDebug';
import ScoringOverrideBanner from './components/companion/ScoringOverrideBanner';

const ExportPreview = lazy(() => import('./components/ExportPreview'));
const TeamDetail = lazy(() => import('./components/TeamDetail'));
const StandingsTable = lazy(() => import('./components/StandingsTable'));
const PlayoffSeeding = lazy(() => import('./components/PlayoffSeeding'));
const Guide = lazy(() => import('./components/Guide'));
const PlayerBrowser = lazy(() => import('./components/PlayerBrowser'));
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

function AppInner() {
  const [scheduleData, setScheduleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [appRoute, setAppRoute] = useState(() => parseAppRoute(window.location.pathname, window.location.search));
  const [statsNavBack, setStatsNavBack] = useState(null); // { label, onBack } | null — contextual back from external nav
  const [statsDrilldownPending, setStatsDrilldownPending] = useState(null);
  const [tradeAnalyticsPrewarmRequested, setTradeAnalyticsPrewarmRequested] = useState(false);
  const [, startRouteTransition] = useTransition();

  const { hasLeague, selectedLeagueId, season, changeSeason, league, linkedLeagueSeasonOptions } = useSleeperLeague();
  const {
    statsLoading,
    seasonStats,
    players: sleeperPlayers,
    espnIdOverrides,
  } = useSleeperStats();

  const { getPredictionCount, resetAllPredictions, predictions, importPredictions, generateRandomPredictions } = usePredictions();
  const { darkMode, toggleDarkMode, favoriteTeam, setFavoriteTeam } = useTheme();
  const fileInputRef = useRef(null);
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

  const [teamSearch, setTeamSearch] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('');

  const { isInstallable, isInstalled, triggerInstall } = usePWAInstall();

  const activeTab = appRoute.activeTab;
  const seasonView = appRoute.seasonView;
  const statisticsView = appRoute.statisticsView;
  const statisticsTeamId = appRoute.statisticsTeamId;
  const statisticsPlayerId = appRoute.statisticsPlayerId;
  const statisticsMode = appRoute.statisticsMode ?? STATISTICS_MODES.GAME;
  const predictionsTeamId = appRoute.predictionsTeamId;
  const companionView = appRoute.companionView;
  const tradeView = appRoute.tradeView;
  const scoutView = appRoute.scoutView;

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
  const selectedPredictionTeam = activeTab === 'predictions' && predictionsTeamId
    ? (scheduleData?.teams?.find((team) => team.id.toUpperCase() === predictionsTeamId) ?? null)
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

  const navigateToStatisticsTeam = useCallback((team) => {
    if (!team?.id) return;
    applyRoute({
      activeTab: 'statistics',
      statisticsView: 'team',
      statisticsTeamId: team.id,
    });
  }, [applyRoute]);

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
    if (seasonView !== 'predictions') {
      setTeamSearch('');
      setDivisionFilter('');
    }
  }, [seasonView]);

  useEffect(() => {
    setTeamSearch('');
    setDivisionFilter('');
  }, [activeTab]);

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
    loadScheduleData()
      .then(data => { setScheduleData(data); setLoading(false); })
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
  const totalTeams = scheduleData.teams.length;
  const validation = validateTotalWinsLosses(predictions);
  const isSeasonComplete = predictionCount === totalTeams && validation.isValid;
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
        totalTeams={totalTeams}
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
                {predictionCount}/{totalTeams}{isSeasonComplete && ' ✓'}
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

        {/* Scoring override banner — frozen above scroll area */}
        {activeTab === 'companion' && hasLeague && companionView !== 'scoring' && (
          <ScoringOverrideBanner />
        )}

        {/* ── Content area ─────────────────────────────────── */}
        <div
          className="content-area lg:px-8 pt-4 lg:pt-6"
          onScroll={(e) => setContentScrolled(e.currentTarget.scrollTop > 2)}
        >

          {activeTab === 'predictions' && (
            <div className="px-4">
              {seasonView === 'predictions' && (
                <>
                  {/* Search + filter */}
                  <div className="flex gap-2 mb-4 lg:mb-5">
                    <div className="flex-1 relative">
                      <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                        style={{ color: 'var(--color-label-tertiary)' }}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <input
                        type="text"
                        value={teamSearch}
                        onChange={e => setTeamSearch(e.target.value)}
                        placeholder="Search teams…"
                        aria-label="Search teams"
                        className="w-full pl-9 pr-3 py-2 rounded-xl font-medium focus:outline-none"
                        style={{
                          fontSize: '16px',
                          background: 'var(--color-fill-secondary)',
                          color: 'var(--color-label)',
                        }}
                      />
                    </div>
                    <div className="flex gap-1.5 items-center shrink-0">
                      {[['', 'All'], ['AFC', 'AFC'], ['NFC', 'NFC']].map(([val, label]) => (
                        <button
                          key={val}
                          onClick={() => setDivisionFilter(val)}
                          className="px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
                          style={{
                            background: divisionFilter === val ? 'var(--color-signature)' : 'var(--color-fill-secondary)',
                            color: divisionFilter === val ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
                          }}
                          aria-pressed={divisionFilter === val}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <TeamList
                    teams={scheduleData.teams}
                    onTeamClick={navigatePredictionTeam}
                    teamSearch={teamSearch}
                    divisionFilter={divisionFilter}
                  />
                </>
              )}

              {seasonView === 'standings' && (
                <Suspense fallback={<SectionLoading label="Loading standings" />}>
                  <StandingsTable teams={scheduleData.teams} />
                </Suspense>
              )}
              {seasonView === 'playoffs' && (
                <Suspense fallback={<SectionLoading label="Loading playoffs" />}>
                  <PlayoffSeeding teams={scheduleData.teams} />
                </Suspense>
              )}
            </div>
          )}

          {activeTab === 'statistics' && (
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
          league={hasLeague && (activeTab === 'companion' || activeTab === 'trade') ? league : null}
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
          <Guide onClose={() => setGuideOpen(false)} activeTab={activeTab} companionView={companionView} tradeView={tradeView} />
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

      {selectedPredictionTeam && (
        <Suspense fallback={<ModalLoading label="Loading team details" />}>
          <TeamDetail
            team={selectedPredictionTeam}
            allTeams={scheduleData.teams}
            onClose={() => applyRoute({ activeTab: 'predictions', seasonView: 'predictions' })}
          />
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
