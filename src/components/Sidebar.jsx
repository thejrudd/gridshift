import { useSleeperLeague } from '../context/SleeperContext';
import StatusBadge from './ui/StatusBadge';

export default function Sidebar({
  activeTab,
  onTabChange,
  predictionCount,
  completedTeamCount = predictionCount,
  totalTeams,
  pickedGameCount = 0,
  totalGames = 0,
  isSeasonComplete,
  darkMode,
  onToggleDarkMode,
  onDisplay,
  onLegal,
  onAppTour,
  onGuide,
  onExportJSON,
  onImportJSON,
  onRandom,
  onReset,
  onDraftSync,
  isInstallable,
  isInstalled,
  onInstall,
  favoriteTeam,
  onMyTeam,
  collapsed,
  onToggleCollapse,
  leagueDisabled = false,
}) {
  const { isConnected, disconnect } = useSleeperLeague();
  const tradeDisabled = false;

  return (
    <aside className="app-sidebar">
      {/* Brand — hidden when collapsed */}
      <div className="sidebar-brand" style={{ paddingRight: 44, position: 'relative' }}>
        <div className="sidebar-brand__wordmark font-display font-bold leading-none">
          <span style={{ color: 'var(--color-label)' }}>GRID</span>
          <span style={{ color: 'var(--color-label-secondary)' }}>SHIFT</span>
        </div>
        <div className="sidebar-brand__season font-semibold">
          2026 SEASON
        </div>
        {favoriteTeam && (
          <button
            onClick={onMyTeam}
            title={`My Team: ${favoriteTeam.toUpperCase()}`}
            className="mt-1.5 flex items-center gap-1.5 px-2 py-0.5 rounded-full transition-opacity active:opacity-60"
            style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}
          >
            <span style={{ fontSize: 'var(--type-label)', fontWeight: 700, letterSpacing: '0.05em' }}>
              {favoriteTeam.toUpperCase()}
            </span>
          </button>
        )}
        {/* Collapse button — inside brand area when expanded */}
        <button
          onClick={onToggleCollapse}
          title="Collapse sidebar"
          style={{
            position: 'absolute', top: 14, right: 12,
            width: 28, height: 28, borderRadius: 8,
            border: '1px solid var(--color-separator)',
            background: 'var(--color-fill)',
            color: 'var(--color-label-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
          aria-label="Collapse sidebar"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
      </div>

      {/* Keep this slot mounted so the main navigation never shifts between tabs. */}
      <div className="sidebar-progress">
        {activeTab === 'predictions' && (
          <>
          <SidebarProgressBar
            label="Teams"
            value={completedTeamCount}
            total={totalTeams}
            complete={isSeasonComplete}
          />
          <SidebarProgressBar
            label="Games"
            value={pickedGameCount}
            total={totalGames}
            complete={totalGames > 0 && pickedGameCount >= totalGames}
          />
          </>
        )}
      </div>

      {/* Main navigation */}
      <nav className="sidebar-nav" aria-label="Main navigation">
        {/* Expand button — only visible when collapsed, sits at top of icon rail */}
        {collapsed && (
          <button
            onClick={onToggleCollapse}
            title="Expand sidebar"
            style={{
              width: 44, height: 44, borderRadius: 12,
              border: '1px solid var(--color-separator)',
              background: 'var(--color-fill)',
              color: 'var(--color-label-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', marginBottom: 4,
            }}
            aria-label="Expand sidebar"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        )}
        <SidebarNavItem
          active={activeTab === 'fantasy'}
          onClick={() => onTabChange('fantasy')}
          icon={<CompanionIcon />}
          label="Fantasy"
          dataTour="tab-companion"
          collapsed={collapsed}
        />
        <SidebarNavItem
          active={activeTab === 'league'}
          onClick={() => onTabChange('league')}
          icon={<LeagueIcon />}
          label="League"
          dataTour="tab-league"
          disabled={leagueDisabled}
          disabledTitle="League history is available for connected Sleeper leagues."
          collapsed={collapsed}
        />
        <SidebarNavItem
          active={activeTab === 'statistics'}
          onClick={() => onTabChange('statistics')}
          icon={<PlayersIcon />}
          label="Statistics"
          collapsed={collapsed}
        />
        <SidebarNavItem
          active={activeTab === 'trade'}
          onClick={() => onTabChange('trade')}
          icon={<TradeIcon />}
          label="Trade"
          disabled={tradeDisabled}
          collapsed={collapsed}
        />
        <SidebarNavItem
          active={activeTab === 'draft'}
          onClick={() => onTabChange('draft')}
          icon={<DraftIcon />}
          label="Draft"
          beta
          collapsed={collapsed}
        />
        <SidebarNavItem
          active={activeTab === 'predictions'}
          onClick={() => onTabChange('predictions')}
          icon={<SeasonIcon />}
          label="Predictions"
          collapsed={collapsed}
        />
        {collapsed && (
          <button
            onClick={onToggleDarkMode}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            data-tour="theme-toggle"
            style={{
              width: 44, height: 44, borderRadius: 12,
              border: '1px solid var(--color-separator)',
              background: 'var(--color-fill)',
              color: 'var(--color-label-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', marginTop: 4,
            }}
          >
            {darkMode ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        )}
        {collapsed && (
          <button
            onClick={onDisplay}
            title="Display settings"
            aria-label="Display settings"
            data-tour="display-settings"
            style={{
              width: 44, height: 44, borderRadius: 12,
              border: '1px solid var(--color-separator)',
              background: 'var(--color-fill)',
              color: 'var(--color-label-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <DisplayIcon />
          </button>
        )}
        {collapsed && (
          <button
            onClick={onAppTour}
            title="App Tour"
            aria-label="App Tour"
            data-tour="app-tour"
            style={{
              width: 44, height: 44, borderRadius: 12,
              border: '1px solid var(--color-separator)',
              background: 'var(--color-fill)',
              color: 'var(--color-label-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <TourIcon />
          </button>
        )}
      </nav>

      <div className="sidebar-divider" />

      {/* Actions — section label is contextual; utility actions read one step
          stronger than data I/O actions */}
      <div className="sidebar-actions">
        <div className="sidebar-section-label">
          {activeTab === 'predictions'
            ? 'Predictions'
            : (activeTab === 'fantasy' || activeTab === 'league' || activeTab === 'trade' || activeTab === 'draft')
              ? 'League'
              : 'Actions'}
        </div>
        <SidebarAction label="Guide" onClick={onGuide} dataTour="app-guide" />
        {activeTab === 'predictions' && (
          <>
            <SidebarAction label="Export JSON" onClick={onExportJSON} disabled={predictionCount === 0} secondary />
            <SidebarAction label="Import JSON" onClick={onImportJSON} secondary />
            <SidebarAction label="Randomize Predictions" onClick={onRandom} secondary />
          </>
        )}
        {(activeTab === 'fantasy' || activeTab === 'league' || activeTab === 'trade' || activeTab === 'draft') && isConnected && (
          <SidebarAction label="Disconnect Sleeper" onClick={disconnect} />
        )}
        {activeTab === 'draft' && onDraftSync && (
          <SidebarAction label="Draft Sync" onClick={onDraftSync} dataTour="draft-sync" />
        )}
        {isInstallable && !isInstalled && (
          <SidebarAction label="Install App" onClick={onInstall} />
        )}
        {activeTab === 'predictions' && (
          <>
            <div className="sidebar-divider" style={{ marginTop: '10px' }} />
            <SidebarAction
              label="Reset All"
              onClick={onReset}
              disabled={predictionCount === 0}
              destructive
            />
          </>
        )}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        <button
          onClick={onMyTeam}
          className="sidebar-action-item"
          style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          My Team
          {favoriteTeam && (
            <span
              className="ml-auto text-xs font-bold"
              style={{ color: 'var(--color-label-secondary)' }}
            >
              {favoriteTeam.toUpperCase()}
            </span>
          )}
        </button>
        <button
          onClick={onToggleDarkMode}
          className="sidebar-action-item"
          data-tour="theme-toggle"
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {darkMode ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
            {darkMode ? 'Light Mode' : 'Dark Mode'}
          </span>
        </button>
        <button
          onClick={onDisplay}
          className="sidebar-action-item"
          data-tour="display-settings"
          style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
        >
          <DisplayIcon />
          Display
        </button>
        <button
          onClick={onAppTour}
          className="sidebar-action-item"
          data-tour="app-tour"
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <TourIcon />
            App Tour
          </span>
        </button>
        <a
          href="https://buymeacoffee.com/gridshift"
          target="_blank"
          rel="noopener noreferrer"
          className="sidebar-action-item"
          aria-label="Support GridShift on Buy Me a Coffee"
          style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
        >
          <SupportIcon />
          Support GridShift
        </a>
        <a
          href="mailto:featurerequest@gridshiftapp.com"
          className="sidebar-action-item"
        >
          Feature Request
        </a>
        <a
          href="https://github.com/thejrudd/nfl-predictor"
          target="_blank"
          rel="noopener noreferrer"
          className="sidebar-action-item"
        >
          About / GitHub
        </a>
        <button
          onClick={onLegal}
          className="sidebar-action-item"
        >
          Privacy & Attributions
        </button>
        <div
          className="sidebar-version"
          style={{ color: 'var(--color-label-tertiary)' }}
        >
          v8.7.0
        </div>
      </div>
    </aside>
  );
}

function formatProgressValue(value) {
  const rounded = Math.round((Number(value) || 0) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function SidebarProgressBar({ label, value, total, complete }) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeValue = Math.min(safeTotal, Math.max(0, Number(value) || 0));
  const progress = safeTotal > 0 ? (safeValue / safeTotal) * 100 : 0;

  return (
    <div className="sidebar-progress-metric" aria-label={`${label} progress`}>
      <div className="sidebar-progress-metric__header flex items-center justify-between">
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}
        >
          {label}
        </span>
        <span
          className="text-xs font-bold tabular-nums"
          style={{
            color: complete ? 'var(--color-accent-green)' : 'var(--color-label-secondary)',
          }}
        >
          {formatProgressValue(safeValue)}/{formatProgressValue(safeTotal)}
          {complete && ' ✓'}
        </span>
      </div>
      <div
        className="h-0.5 rounded-full overflow-hidden"
        style={{ background: 'var(--color-fill)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${progress}%`,
            background: complete ? 'var(--color-accent-green)' : 'var(--color-signature)',
          }}
        />
      </div>
    </div>
  );
}

function SidebarNavItem({ active, onClick, icon, label, beta, alpha, collapsed, disabled = false, disabledTitle = null, dataTour = null }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      className={`sidebar-nav-item${active ? ' active' : ''}${disabled ? ' is-disabled' : ''}`}
      data-tour={dataTour ?? `tab-${label.toLowerCase()}`}
      aria-current={active ? 'page' : undefined}
      aria-disabled={disabled ? 'true' : undefined}
      disabled={disabled}
      title={disabled ? (disabledTitle ?? 'This section is not available for the connected platform.') : (collapsed ? label : undefined)}
    >
      <span className="sidebar-nav-icon">{icon}</span>
      {!collapsed && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {label}
          {beta && <BetaBadge />}
          {alpha && <AlphaBadge />}
        </span>
      )}
    </button>
  );
}

function BetaBadge() {
  return <StatusBadge kind="beta" />;
}

function AlphaBadge() {
  return <StatusBadge kind="alpha" />;
}

function SidebarAction({ label, onClick, disabled, destructive, secondary, dataTour }) {
  return (
    <button
      data-tour={dataTour}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`sidebar-action-item${destructive ? ' destructive' : ''}`}
      style={secondary && !destructive ? { color: 'var(--color-label-tertiary)' } : undefined}
    >
      {label}
    </button>
  );
}

function SupportIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 8.5h11v4.25a5.25 5.25 0 0 1-5.25 5.25H9.25A5.25 5.25 0 0 1 4 12.75V8.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M15 10h2.25a2.75 2.75 0 0 1 0 5.5H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7.5 6.25c0-.9.75-1.2.75-2.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M11 6.25c0-.9.75-1.2.75-2.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function TourIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M10 8.5l6 3.5-6 3.5v-7z" fill="currentColor" />
    </svg>
  );
}

function DisplayIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="6" r="2" fill="var(--color-bg)" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="12" r="2" fill="var(--color-bg)" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="18" r="2" fill="var(--color-bg)" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function CompanionIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path d="M13 3l2.5 5 5.5.8-4 3.9.95 5.5L13 15.7l-4.95 2.5.95-5.5-4-3.9 5.5-.8z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function TradeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path d="M5 9h11l-2-2 1.4-1.4L20.8 9l-5.4 3.4L14 11l2-2H5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M21 17H10l2 2-1.4 1.4L5.2 17l5.4-3.4L12 15l-2 2h11z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function DraftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <rect x="6" y="4" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 8h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 16h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function LeagueIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path d="M5 21V9l8-5 8 5v12" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M3.5 21h19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 12h8M9 16h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SeasonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <ellipse cx="13" cy="13" rx="9.5" ry="6" stroke="currentColor" strokeWidth="1.5" />
      <line x1="13" y1="7.2" x2="13" y2="18.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="10.2" y1="10.5" x2="15.8" y2="10.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="10.2" y1="13" x2="15.8" y2="13" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="10.2" y1="15.5" x2="15.8" y2="15.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function PlayersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <circle cx="13" cy="8.5" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 23c0-4.69 3.81-8.5 8.5-8.5s8.5 3.81 8.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
