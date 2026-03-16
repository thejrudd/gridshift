import { useSleeper } from '../context/SleeperContext';

export default function Sidebar({
  activeTab,
  onTabChange,
  predictionCount,
  totalTeams,
  isSeasonComplete,
  darkMode,
  onToggleDarkMode,
  onGuide,
  onExportImage,
  onExportJSON,
  onImportJSON,
  onRandom,
  onReset,
  isInstallable,
  isInstalled,
  onInstall,
  favoriteTeam,
  onMyTeam,
  onScoringSettings,
}) {
  const progress = totalTeams > 0 ? (predictionCount / totalTeams) * 100 : 0;
  const { isConnected, hasLeague, disconnect } = useSleeper();

  return (
    <aside className="app-sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div
          className="font-display font-bold leading-none"
          style={{ fontSize: '28px', color: 'var(--color-label)', letterSpacing: '0.08em' }}
        >
          NFL
        </div>
        <div
          className="font-display leading-none mt-0.5"
          style={{ fontSize: '12px', color: 'var(--color-label-secondary)', letterSpacing: '0.18em' }}
        >
          PREDICTOR
        </div>
        <div className="flex items-center justify-between mt-2">
          <div
            className="font-semibold"
            style={{ fontSize: '11px', color: 'var(--color-signature)', letterSpacing: '0.06em' }}
          >
            2026 SEASON
          </div>
          {favoriteTeam && (
            <button
              onClick={onMyTeam}
              title={`My Team: ${favoriteTeam.toUpperCase()}`}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-full transition-opacity active:opacity-60"
              style={{ background: 'var(--color-signature)', color: 'var(--color-signature-fg)' }}
            >
              <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em' }}>
                {favoriteTeam.toUpperCase()}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Progress bar — only visible on Predictions tab */}
      <div className="sidebar-progress" style={{ visibility: activeTab === 'predictions' ? 'visible' : 'hidden' }}>
        <div className="flex items-center justify-between mb-1.5">
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-label-tertiary)', letterSpacing: '0.08em' }}
          >
            Season
          </span>
          <span
            className="text-xs font-bold tabular-nums"
            style={{
              color: isSeasonComplete ? 'var(--color-accent-green)' : 'var(--color-label-secondary)',
            }}
          >
            {predictionCount}/{totalTeams}
            {isSeasonComplete && ' ✓'}
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
              background: isSeasonComplete ? 'var(--color-accent-green)' : 'var(--color-signature)',
            }}
          />
        </div>
      </div>

      {/* Main navigation */}
      <nav className="sidebar-nav" aria-label="Main navigation">
        <SidebarNavItem
          active={activeTab === 'predictions'}
          onClick={() => onTabChange('predictions')}
          icon={<SeasonIcon />}
          label="Predictions"
        />
        <SidebarNavItem
          active={activeTab === 'statistics'}
          onClick={() => onTabChange('statistics')}
          icon={<PlayersIcon />}
          label="Statistics"
        />
        <SidebarNavItem
          active={activeTab === 'companion'}
          onClick={() => onTabChange('companion')}
          icon={<CompanionIcon />}
          label="Companion"
          beta
        />
      </nav>

      <div className="sidebar-divider" />

      {/* Actions */}
      <div className="sidebar-actions">
        <div className="sidebar-section-label">Actions</div>
        <SidebarAction label="Guide" onClick={onGuide} />
        {activeTab === 'predictions' && (
          <>
            <SidebarAction label="Create Image" onClick={onExportImage} disabled={predictionCount === 0} />
            <SidebarAction label="Export JSON" onClick={onExportJSON} disabled={predictionCount === 0} />
            <SidebarAction label="Import JSON" onClick={onImportJSON} />
            <SidebarAction label="Randomize Predictions" onClick={onRandom} />
          </>
        )}
        {activeTab === 'companion' && (
          <>
            <SidebarAction label="Scoring Settings" onClick={onScoringSettings} />
            {isConnected && (
              <SidebarAction label="Disconnect Sleeper" onClick={disconnect} />
            )}
          </>
        )}
        {isInstallable && !isInstalled && (
          <SidebarAction label="Install App" onClick={onInstall} />
        )}
        {activeTab === 'predictions' && (
          <>
            <div className="sidebar-divider" style={{ marginTop: '4px' }} />
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
              style={{ color: 'var(--color-signature)' }}
            >
              {favoriteTeam.toUpperCase()}
            </span>
          )}
        </button>
        <button
          onClick={onToggleDarkMode}
          className="sidebar-action-item"
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
        <a
          href="https://github.com/thejrudd/nfl-predictor"
          target="_blank"
          rel="noopener noreferrer"
          className="sidebar-action-item"
        >
          About / GitHub
        </a>
        <div
          className="px-5 py-3 text-xs"
          style={{ color: 'var(--color-label-tertiary)' }}
        >
          v4.3.3
        </div>
      </div>
    </aside>
  );
}

function SidebarNavItem({ active, onClick, icon, label, beta }) {
  return (
    <button
      onClick={onClick}
      className={`sidebar-nav-item${active ? ' active' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      <span className="sidebar-nav-icon">{icon}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {label}
        {beta && <BetaBadge />}
      </span>
    </button>
  );
}

function BetaBadge() {
  return (
    <span style={{
      fontSize: '9px',
      fontWeight: 700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      padding: '1px 5px',
      borderRadius: '4px',
      background: 'var(--color-signature)',
      color: '#000',
      lineHeight: '14px',
    }}>
      Beta
    </span>
  );
}

function SidebarAction({ label, onClick, disabled, destructive }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`sidebar-action-item${destructive ? ' destructive' : ''}`}
    >
      {label}
    </button>
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
