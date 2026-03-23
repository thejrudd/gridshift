import { useEffect, useState, useRef } from 'react';
import { loadScheduleData } from './utils/scheduleParser';
import { usePredictions } from './context/PredictionContext';
import { useTheme } from './context/ThemeContext';
import { validateTotalWinsLosses } from './utils/validation';
import { exportAsJSON, importFromJSON } from './utils/exportImport';
import TeamList from './components/TeamList';
import TeamDetail from './components/TeamDetail';
import StandingsTable from './components/StandingsTable';
import PlayoffSeeding from './components/PlayoffSeeding';
import Guide from './components/Guide';
import ExportPreview from './components/ExportPreview';
import PlayerBrowser from './components/PlayerBrowser';
import { usePWAInstall } from './hooks/usePWAInstall';
import NavBar from './components/NavBar';
import BottomTabBar from './components/BottomTabBar';
import SeasonSubNav from './components/SeasonSubNav';
import CompanionSubNav from './components/CompanionSubNav';
import ActionSheet from './components/ActionSheet';
import Sidebar from './components/Sidebar';
import FavoriteTeamPicker from './components/FavoriteTeamPicker';
import { SleeperProvider, useSleeper } from './context/SleeperContext';
import CompanionConnect from './components/companion/CompanionConnect';
import CompanionRoster from './components/companion/CompanionRoster';
import CompanionRankings from './components/companion/CompanionRankings';
import CompanionMatchup from './components/companion/CompanionMatchup';
import CompanionWaiver from './components/companion/CompanionWaiver';
import CompanionScoring from './components/companion/CompanionScoring';
import CompanionDefense from './components/companion/CompanionDefense';
import CompanionLeague from './components/companion/CompanionLeague';
import CompanionTrade from './components/companion/CompanionTrade';
import CompareTab from './components/compare/CompareTab';
import ScoringSettings from './components/companion/ScoringSettings';

function AppInner() {
  const [scheduleData, setScheduleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);

  // Two-level navigation
  const [activeTab, setActiveTab]     = useState('predictions');
  const [seasonView, setSeasonView]   = useState('predictions');
  const [companionView, setCompanionView] = useState('roster');
  const [scoringSettingsOpen, setScoringSettingsOpen] = useState(false);
  const [statsInitPlayer, setStatsInitPlayer] = useState(null);
  const [statsNavBack, setStatsNavBack] = useState(null); // { label, onBack } | null — contextual back from external nav
  const [compareInitPlayerA, setCompareInitPlayerA] = useState(null);
  const [tradeInitPlayer, setTradeInitPlayer] = useState(null); // { sleeperId, side: 'give'|'get', partnerRosterId? }

  const { hasLeague, season, changeSeason, league, disconnect, sleeperUser, statsLoading, loadSeasonStats, seasonStats } = useSleeper();

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

  // ── Browser history ────────────────────────────────────────────────────────
  const isFirstNavRender = useRef(true);
  const historyRestoring = useRef(false);

  useEffect(() => {
    if (isFirstNavRender.current) {
      isFirstNavRender.current = false;
      history.replaceState({ activeTab, seasonView, companionView, _nav: 'app' }, '');
      return;
    }
    if (historyRestoring.current) {
      historyRestoring.current = false;
      return;
    }
    history.pushState({ activeTab, seasonView, companionView, _nav: 'app' }, '');
  }, [activeTab, seasonView, companionView]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onPopState = (e) => {
      if (e.state?._nav !== 'app') return;
      historyRestoring.current = true;
      setActiveTab(e.state.activeTab ?? 'predictions');
      setSeasonView(e.state.seasonView ?? 'predictions');
      setCompanionView(e.state.companionView ?? 'roster');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  // ──────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (seasonView !== 'predictions') {
      setTeamSearch('');
      setDivisionFilter('');
    }
  }, [seasonView]);

  useEffect(() => {
    setTeamSearch('');
    setDivisionFilter('');
    if (activeTab !== 'statistics') setStatsNavBack(null);
  }, [activeTab]);

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

  return (
    <div className="app-shell">

      {/* ── Desktop Sidebar (lg+) ─────────────────────────────── */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        predictionCount={predictionCount}
        totalTeams={totalTeams}
        isSeasonComplete={isSeasonComplete}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
        onGuide={() => setGuideOpen(true)}
        onExportImage={handleExportImage}
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
            <SeasonSubNav activeView={seasonView} onViewChange={setSeasonView} />
          </div>
        )}

        {/* Companion sub-navigation */}
        {activeTab === 'companion' && hasLeague && (
          <div className="season-subnav">
            <CompanionSubNav activeView={companionView} onViewChange={setCompanionView} />
          </div>
        )}

        {/* ── Content area ─────────────────────────────────── */}
        <div className="content-area px-4 sm:px-6 lg:px-8 pt-4 lg:pt-6">

          {activeTab === 'predictions' && (
            <>
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
                    onTeamClick={setSelectedTeam}
                    teamSearch={teamSearch}
                    divisionFilter={divisionFilter}
                  />
                </>
              )}

              {seasonView === 'standings' && <StandingsTable teams={scheduleData.teams} />}
              {seasonView === 'playoffs' && <PlayoffSeeding teams={scheduleData.teams} />}
            </>
          )}

          {activeTab === 'statistics' && <PlayerBrowser teams={scheduleData.teams} initialPlayer={statsInitPlayer} onInitialPlayerConsumed={() => setStatsInitPlayer(null)} navBack={statsNavBack} onComparePlayer={(player) => { setCompareInitPlayerA(player); setActiveTab('compare'); }} />}

          {activeTab === 'compare' && <CompareTab teams={scheduleData.teams} initialPlayerA={compareInitPlayerA} onConsumeInitialPlayerA={() => setCompareInitPlayerA(null)} onBuildTrade={(sleeperIdA, sleeperIdB) => { setTradeInitPlayer({ sleeperId: sleeperIdA, side: 'give', otherSleeperId: sleeperIdB }); setActiveTab('companion'); setCompanionView('trade'); }} />}

          {activeTab === 'companion' && !hasLeague && (
            <CompanionConnect />
          )}

          {activeTab === 'companion' && hasLeague && (
            <>
              {/* League + season header */}
              <div className="flex items-center gap-2 mb-3 px-1">
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
                            color: season === s ? '#0C0F14' : 'var(--color-label-tertiary)',
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
                    style={{ background: 'var(--color-signature)', color: '#0C0F14' }}
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
              {companionView === 'roster'    && <CompanionRoster onTradePlayer={(sleeperId) => { setTradeInitPlayer({ sleeperId, side: 'give' }); setCompanionView('trade'); }} />}
              {companionView === 'rankings'  && <CompanionRankings />}
              {companionView === 'matchup'   && <CompanionMatchup onViewPlayer={(id, meta) => { setStatsInitPlayer({ id, ...meta }); setStatsNavBack({ label: 'Matchup', onBack: () => { setActiveTab('companion'); setStatsNavBack(null); } }); setActiveTab('statistics'); }} />}
              {companionView === 'waiver'    && <CompanionWaiver onViewPlayer={(id, meta) => { setStatsInitPlayer({ id, ...meta }); setStatsNavBack({ label: 'Waiver', onBack: () => { setActiveTab('companion'); setStatsNavBack(null); } }); setActiveTab('statistics'); }} />}
              {companionView === 'league'   && <CompanionLeague onTradePlayer={(sleeperId, partnerRosterId) => { setTradeInitPlayer({ sleeperId, side: 'get', partnerRosterId }); setCompanionView('trade'); }} />}
              {companionView === 'defense'   && <CompanionDefense onViewPlayer={(id, meta) => { setStatsInitPlayer({ id, ...meta }); setStatsNavBack({ label: 'Heatmap', onBack: () => { setActiveTab('companion'); setStatsNavBack(null); } }); setActiveTab('statistics'); }} />}
              {companionView === 'trade'     && <CompanionTrade initialPlayer={tradeInitPlayer} onConsumeInitialPlayer={() => setTradeInitPlayer(null)} />}
              {companionView === 'scoring'   && <CompanionScoring />}
            </>
          )}
        </div>

        {/* Bottom tab bar — mobile/tablet only, hidden lg+ via CSS */}
        <BottomTabBar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* ── Scoring Settings modal ────────────────────────────── */}
      {scoringSettingsOpen && (
        <ScoringSettings onClose={() => setScoringSettingsOpen(false)} />
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
      {guideOpen && <Guide onClose={() => setGuideOpen(false)} activeTab={activeTab} />}
      {teamPickerOpen && <FavoriteTeamPicker onClose={() => setTeamPickerOpen(false)} />}

      {exportPreviewOpen && (
        <ExportPreview teams={scheduleData.teams} onClose={() => setExportPreviewOpen(false)} />
      )}

      {selectedTeam && (
        <TeamDetail
          team={selectedTeam}
          allTeams={scheduleData.teams}
          onClose={() => setSelectedTeam(null)}
        />
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
