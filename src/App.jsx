import { Suspense, lazy, useCallback, useEffect, useState, useRef } from 'react';
import { loadScheduleData } from './utils/scheduleParser';
import { usePredictions } from './context/PredictionContext';
import { useTheme } from './context/ThemeContext';
import { validateTotalWinsLosses } from './utils/validation';
import { exportAsJSON, importFromJSON } from './utils/exportImport';
import TeamList from './components/TeamList';
import { usePWAInstall } from './hooks/usePWAInstall';
import NavBar from './components/NavBar';
import BottomTabBar from './components/BottomTabBar';
import SeasonSubNav from './components/SeasonSubNav';
import CompanionSubNav from './components/CompanionSubNav';
import TradeSubNav from './components/TradeSubNav';
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
const ScoringSettings = lazy(() => import('./components/companion/ScoringSettings'));
const CompanionMatchup = lazy(() => import('./components/companion/CompanionMatchup'));
const CompanionWaiver = lazy(() => import('./components/companion/CompanionWaiver'));
const CompanionDefense = lazy(() => import('./components/companion/CompanionDefense'));
const CompanionTrade = lazy(() => import('./components/companion/CompanionTrade'));
const CompareTab = lazy(() => import('./components/compare/CompareTab'));

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

function AppInner() {
  const [scheduleData, setScheduleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [appRoute, setAppRoute] = useState(() => parseAppRoute(window.location.pathname, window.location.search));
  const [scoringSettingsOpen, setScoringSettingsOpen] = useState(false);
  const [statsNavBack, setStatsNavBack] = useState(null); // { label, onBack } | null — contextual back from external nav
  const [compareInitPlayerA, setCompareInitPlayerA] = useState(null);
  const [compareInitPlayerB, setCompareInitPlayerB] = useState(null);
  const [tradeAnalyticsPrewarmRequested, setTradeAnalyticsPrewarmRequested] = useState(false);

  const { hasLeague, season, changeSeason, league, disconnect, sleeperUser } = useSleeperLeague();
  const { statsLoading, loadSeasonStats, seasonStats } = useSleeperStats();

  const { getPredictionCount, resetAllPredictions, predictions, importPredictions, generateRandomPredictions } = usePredictions();
  const { darkMode, toggleDarkMode, favoriteTeam, setFavoriteTeam } = useTheme();
  const fileInputRef = useRef(null);

  const [exportPreviewOpen, setExportPreviewOpen] = useState(false);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);

  const [teamSearch, setTeamSearch] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('');

  const { isInstallable, isInstalled, triggerInstall } = usePWAInstall();

  const activeTab = appRoute.activeTab;
  const seasonView = appRoute.seasonView;
  const statisticsView = appRoute.statisticsView;
  const statisticsTeamId = appRoute.statisticsTeamId;
  const statisticsPlayerId = appRoute.statisticsPlayerId;
  const predictionsTeamId = appRoute.predictionsTeamId;
  const companionView = appRoute.companionView;
  const tradeView = appRoute.tradeView;

  const tradeInitPlayer = appRoute.tradePlayerId
    ? {
        sleeperId: appRoute.tradePlayerId,
        side: appRoute.tradeSide ?? 'give',
        partnerRosterId: appRoute.tradePartnerRosterId ?? undefined,
        otherSleeperId: appRoute.tradeOtherPlayerId ?? undefined,
      }
    : null;
  const waiverInitRequest = appRoute.companionView === 'waiver' && appRoute.waiverPosition
    ? { position: appRoute.waiverPosition }
    : null;
  const matchupInitRequest = appRoute.companionView === 'matchup' && (appRoute.matchupWeek || appRoute.matchupPlayerId)
    ? { week: appRoute.matchupWeek, playerId: appRoute.matchupPlayerId }
    : null;
  const rankingsPosition = appRoute.companionView === 'rankings' ? (appRoute.rankingsPosition ?? 'ALL') : 'ALL';
  const leagueRouteState = appRoute.companionView === 'league'
    ? {
        subView: appRoute.leagueSubview ?? 'roster',
        rosterId: appRoute.leagueRosterId ?? null,
      }
    : { subView: 'roster', rosterId: null };
  const heatmapRouteState = appRoute.companionView === 'defense'
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

    setAppRoute((prev) => (isSameAppRoute(prev, normalized) ? prev : normalized));
  }, [readHistoryState]);

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

  const navigateTradeView = useCallback((view) => {
    applyRoute({ activeTab: 'trade', tradeView: view });
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

  const navigateToStatisticsPlayer = useCallback((player, { backLabel = null, backRoute = null } = {}) => {
    if (!player?.id) return;

    const playerMeta = {
      id: String(player.id),
      displayName: player.displayName ?? '',
      teamId: player.teamId ?? null,
      position: player.position ?? '',
      positionName: player.positionName ?? '',
      experience: player.experience,
      jersey: player.jersey ?? '',
      status: player.status ?? '',
    };
    const nextBackContext = buildStatsBackContext(backLabel, backRoute);

    setStatsNavBack(nextBackContext);
    applyRoute({
      activeTab: 'statistics',
      statisticsView: 'player',
      statisticsPlayerId: playerMeta.id,
      statisticsPlayerSlug: slugifyRouteSegment(playerMeta.displayName || playerMeta.id) || 'player',
    }, {
      state: {
        statsPlayerMeta: playerMeta,
        statsBackLabel: backLabel ?? null,
        statsBackRoute: backRoute ? normalizeAppRoute(backRoute) : null,
      },
    });
  }, [applyRoute, buildStatsBackContext]);

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
    <div className="app-shell">

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
        onScoringSettings={() => setScoringSettingsOpen(true)}
      />

      {/* ── Main panel ───────────────────────────────────────── */}
      <div className="app-main">

        {/* Top nav bar — mobile/tablet only, hidden lg+ via CSS */}
        <NavBar
          darkMode={darkMode}
          onToggleDarkMode={toggleDarkMode}
          onMenuOpen={() => setActionSheetOpen(true)}
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
          <div className="season-subnav">
            <CompanionSubNav activeView={companionView} onViewChange={navigateCompanionView} />
          </div>
        )}

        {activeTab === 'trade' && hasLeague && (
          <div className="season-subnav">
            <TradeSubNav activeView={tradeView} onViewChange={navigateTradeView} onViewIntent={prewarmTradeView} />
          </div>
        )}

        {/* ── Content area ─────────────────────────────────── */}
        <div className="content-area lg:px-8 pt-4 lg:pt-6">

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
              statsView={statisticsView}
              selectedTeamId={statisticsTeamId}
              selectedPlayerId={statisticsPlayerId}
              selectedPlayerMeta={statsRoutePlayerMeta}
              navBack={statsNavBack}
              onNavigateHome={navigateToStatisticsHome}
              onNavigateTeam={navigateToStatisticsTeam}
              onNavigatePlayer={navigateToStatisticsPlayer}
              onComparePlayer={(player) => {
                setCompareInitPlayerA(player);
                setCompareInitPlayerB(null);
                applyRoute({ activeTab: 'trade', tradeView: 'compare' });
              }}
              onBuildTrade={(initialTrade) => {
                applyRoute({
                  activeTab: 'trade',
                  tradeView: 'agent',
                  tradePlayerId: initialTrade?.sleeperId,
                  tradeSide: initialTrade?.side,
                  tradePartnerRosterId: initialTrade?.partnerRosterId,
                  tradeOtherPlayerId: initialTrade?.otherSleeperId,
                });
              }}
            />
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
            <>
              <div className="flex items-center gap-2 mb-3 px-4">
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold truncate" style={{ color: 'var(--color-label-secondary)' }}>
                    {league?.name ?? 'League'}
                  </span>
                </div>
                {(() => {
                  const currentYear = parseInt(league?.season ?? new Date().getFullYear());
                  const years = [String(currentYear)];
                  if (league?.previous_league_id) years.push(String(currentYear - 1));
                  if (years.length < 2) return null;
                  return (
                    <div className="flex gap-1 shrink-0">
                      {years.map(s => (
                        <button
                          key={s}
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
                  );
                })()}
                {statsLoading ? (
                  <span className="text-xs shrink-0" style={{ color: 'var(--color-label-tertiary)' }}>
                    Loading…
                  </span>
                ) : (!seasonStats || Object.keys(seasonStats).length === 0) ? (
                  <button
                    onClick={loadSeasonStats}
                    className="text-xs font-semibold shrink-0 px-2 py-0.5 rounded"
                    style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}
                  >
                    Load Stats
                  </button>
                ) : null}
                <button
                  onClick={disconnect}
                  className="text-xs shrink-0"
                  style={{ color: 'var(--color-label-quaternary)' }}
                >
                  ✕
                </button>
              </div>
              {tradeView === 'compare' ? (
                <Suspense fallback={<SectionLoading label="Loading Compare" />}>
                  <CompareTab
                    teams={scheduleData.teams}
                    initialPlayerA={compareInitPlayerA}
                    initialPlayerB={compareInitPlayerB}
                    onConsumeInitialPlayerA={() => setCompareInitPlayerA(null)}
                    onConsumeInitialPlayerB={() => setCompareInitPlayerB(null)}
                    onBuildTrade={(sleeperIdA, sleeperIdB) => {
                      applyRoute({
                        activeTab: 'trade',
                        tradeView: 'agent',
                        tradePlayerId: sleeperIdA,
                        tradeSide: 'give',
                        tradeOtherPlayerId: sleeperIdB,
                      });
                    }}
                    onViewPlayer={(player) => {
                      navigateToStatisticsPlayer(player, {
                        backLabel: 'Compare',
                        backRoute: { activeTab: 'trade', tradeView: 'compare' },
                      });
                    }}
                  />
                </Suspense>
              ) : (
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
            </>
          )}

          {activeTab === 'companion' && hasLeague && (
            <>
              {/* League + season header */}
              <div className="flex items-center gap-2 mb-3 px-4">
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold truncate" style={{ color: 'var(--color-label-secondary)' }}>
                    {league?.name ?? 'League'}
                  </span>
                </div>
                {/* Season picker — only show seasons this league has existed for */}
                {(() => {
                  const currentYear = parseInt(league?.season ?? new Date().getFullYear());
                  const years = [String(currentYear)];
                  if (league?.previous_league_id) years.push(String(currentYear - 1));
                  if (years.length < 2) return null;
                  return (
                    <div className="flex gap-1 shrink-0">
                      {years.map(s => (
                        <button
                          key={s}
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
                  );
                })()}
                {/* Stats reload / status */}
                {statsLoading ? (
                  <span className="text-xs shrink-0" style={{ color: 'var(--color-label-tertiary)' }}>
                    Loading…
                  </span>
                ) : (!seasonStats || Object.keys(seasonStats).length === 0) ? (
                  <button
                    onClick={loadSeasonStats}
                    className="text-xs font-semibold shrink-0 px-2 py-0.5 rounded"
                    style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}
                  >
                    Load Stats
                  </button>
                ) : null}
                {/* Disconnect */}
                <button
                  onClick={disconnect}
                  className="text-xs shrink-0"
                  style={{ color: 'var(--color-label-quaternary)' }}
                >
                  ✕
                </button>
              </div>
              {companionView === 'roster'    && (
                <Suspense fallback={<SectionLoading label="Loading Roster" />}>
                <CompanionRoster
                  onTradePlayer={(sleeperId) => {
                    applyRoute({ activeTab: 'trade', tradeView: 'agent', tradePlayerId: sleeperId, tradeSide: 'give' });
                  }}
                  onOpenMatchupWeek={(playerId, week) => {
                    applyRoute({ activeTab: 'companion', companionView: 'matchup', matchupPlayerId: playerId, matchupWeek: week });
                  }}
                />
                </Suspense>
              )}
              {companionView === 'rankings'  && (
                <Suspense fallback={<SectionLoading label="Loading Rankings" />}>
                  <CompanionRankings
                    positionFilter={rankingsPosition}
                    onPositionFilterChange={(position) => updateCompanionRoute({
                      companionView: 'rankings',
                      rankingsPosition: position === 'ALL' ? null : position,
                    })}
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
                    onComparePlayers={(playerA, playerB) => { setCompareInitPlayerA(playerA); setCompareInitPlayerB(playerB); applyRoute({ activeTab: 'trade', tradeView: 'compare' }); }}
                    onViewPlayer={(id, meta) => {
                      navigateToStatisticsPlayer({ id, ...meta }, {
                        backLabel: 'Matchup',
                        backRoute: appRoute,
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
              {companionView === 'defense'   && (
                <Suspense fallback={<SectionLoading label="Loading Heatmap" />}>
                  <CompanionDefense
                    routeState={heatmapRouteState}
                    onRouteStateChange={(nextState) => updateCompanionRoute({
                      companionView: 'defense',
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
                    }, { replace: true })}
                    onViewPlayer={(id, meta) => {
                      navigateToStatisticsPlayer({ id, ...meta }, {
                        backLabel: 'Heatmap',
                        backRoute: appRoute,
                      });
                    }}
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

      {/* ── Scoring Settings modal ────────────────────────────── */}
      {scoringSettingsOpen && (
        <Suspense fallback={<ModalLoading label="Loading scoring settings" />}>
          <ScoringSettings onClose={() => setScoringSettingsOpen(false)} />
        </Suspense>
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
