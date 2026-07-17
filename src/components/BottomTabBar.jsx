import StatusBadge from './ui/StatusBadge';

const TAB_BADGE_OVERLAY = { position: 'absolute', top: '-5px', right: '-15px' };

export default function BottomTabBar({ activeTab, onTabChange, tradeDisabled = false, leagueDisabled = false }) {
  const tabs = [
    { id: 'fantasy',     label: 'Fantasy',      renderIcon: (active) => <CompanionIcon active={active} />, dataTour: 'tab-companion' },
    { id: 'league',      label: 'League',       renderIcon: (active) => <LeagueIcon active={active} />, disabled: leagueDisabled, disabledTitle: 'League history is available for connected Sleeper leagues.' },
    { id: 'statistics',  label: 'Statistics',  renderIcon: (active) => <PlayersIcon active={active} /> },
    { id: 'trade',       label: 'Trade',       renderIcon: (active) => <TradeIcon active={active} />, disabled: tradeDisabled },
    { id: 'draft',       label: 'Draft',       renderIcon: (active) => <DraftIcon active={active} />, beta: true },
    { id: 'predictions', label: 'Predictions', renderIcon: (active) => <SeasonIcon active={active} /> },
  ];

  return (
    <nav className="tab-bar" aria-label="Main navigation">
      <div className="tab-bar-inner">
        {tabs.map(({ id, label, renderIcon, beta, alpha, disabled, disabledTitle, dataTour }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={disabled ? undefined : () => onTabChange(id)}
              className={`tab-item${active ? ' active' : ''}${disabled ? ' is-disabled' : ''}`}
              data-tour={dataTour ?? `tab-${id}`}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              aria-disabled={disabled ? 'true' : undefined}
              disabled={disabled}
              title={disabled ? (disabledTitle ?? 'Trade is not available for ESPN leagues yet.') : undefined}
            >
              <span style={{ position: 'relative', display: 'inline-flex', justifyContent: 'center' }}>
                {renderIcon(active)}
                {beta && <StatusBadge kind="beta" size="sm" style={TAB_BADGE_OVERLAY} />}
                {alpha && <StatusBadge kind="alpha" size="sm" style={TAB_BADGE_OVERLAY} />}
              </span>
              <span className="tab-label">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function CompanionIcon({ active }) {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" className="tab-icon" aria-hidden="true">
      {active ? (
        <g fill="currentColor">
          <path d="M13 3l2.5 5 5.5.8-4 3.9.95 5.5L13 15.7l-4.95 2.5.95-5.5-4-3.9 5.5-.8z" />
        </g>
      ) : (
        <path
          d="M13 3l2.5 5 5.5.8-4 3.9.95 5.5L13 15.7l-4.95 2.5.95-5.5-4-3.9 5.5-.8z"
          stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

function LeagueIcon({ active }) {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" className="tab-icon" aria-hidden="true">
      {active ? (
        <g fill="currentColor">
          <path d="M5 21V9l8-5 8 5v12H5z" />
          <rect x="3.5" y="20" width="19" height="2" rx="1" />
          <rect x="9" y="11" width="8" height="1.5" rx="0.75" fill="var(--color-bg)" />
          <rect x="9" y="15" width="8" height="1.5" rx="0.75" fill="var(--color-bg)" />
        </g>
      ) : (
        <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 21V9l8-5 8 5v12" />
          <path d="M3.5 21h19" />
          <path d="M9 12h8M9 16h8" />
        </g>
      )}
    </svg>
  );
}

function SeasonIcon({ active }) {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" className="tab-icon" aria-hidden="true">
      {active ? (
        /* Filled football with white laces */
        <g>
          <ellipse cx="13" cy="13" rx="9.5" ry="6" fill="currentColor" />
          <line x1="13" y1="7.2" x2="13" y2="18.8" stroke="var(--color-bg)" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="10.2" y1="10.5" x2="15.8" y2="10.5" stroke="var(--color-bg)" strokeWidth="1.1" strokeLinecap="round" />
          <line x1="10.2" y1="13" x2="15.8" y2="13" stroke="var(--color-bg)" strokeWidth="1.1" strokeLinecap="round" />
          <line x1="10.2" y1="15.5" x2="15.8" y2="15.5" stroke="var(--color-bg)" strokeWidth="1.1" strokeLinecap="round" />
        </g>
      ) : (
        /* Outlined football */
        <g>
          <ellipse cx="13" cy="13" rx="9.5" ry="6" stroke="currentColor" strokeWidth="1.5" />
          <line x1="13" y1="7.2" x2="13" y2="18.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="10.2" y1="10.5" x2="15.8" y2="10.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <line x1="10.2" y1="13" x2="15.8" y2="13" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <line x1="10.2" y1="15.5" x2="15.8" y2="15.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

function PlayersIcon({ active }) {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" className="tab-icon" aria-hidden="true">
      {active ? (
        <g fill="currentColor">
          <circle cx="13" cy="8.5" r="4" />
          <path d="M4.5 23c0-4.69 3.81-8.5 8.5-8.5s8.5 3.81 8.5 8.5" />
        </g>
      ) : (
        <g>
          <circle cx="13" cy="8.5" r="4" stroke="currentColor" strokeWidth="1.5" />
          <path d="M4.5 23c0-4.69 3.81-8.5 8.5-8.5s8.5 3.81 8.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

function TradeIcon({ active }) {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" className="tab-icon" aria-hidden="true">
      {active ? (
        <g fill="currentColor">
          <path d="M5 9h11l-2-2 1.4-1.4L20.8 9l-5.4 3.4L14 11l2-2H5z" />
          <path d="M21 17H10l2 2-1.4 1.4L5.2 17l5.4-3.4L12 15l-2 2h11z" />
        </g>
      ) : (
        <g>
          <path d="M5 9h11l-2-2 1.4-1.4L20.8 9l-5.4 3.4L14 11l2-2H5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M21 17H10l2 2-1.4 1.4L5.2 17l5.4-3.4L12 15l-2 2h11z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  );
}

function DraftIcon({ active }) {
  return (
    <svg width="25" height="25" viewBox="0 0 26 26" fill="none" className="tab-icon" aria-hidden="true">
      {active ? (
        <g fill="currentColor">
          <rect x="6" y="4" width="14" height="18" rx="2" />
          <rect x="10" y="8" width="6" height="1.5" rx="0.75" fill="var(--color-bg)" />
          <rect x="10" y="12" width="6" height="1.5" rx="0.75" fill="var(--color-bg)" />
          <rect x="10" y="16" width="4" height="1.5" rx="0.75" fill="var(--color-bg)" />
        </g>
      ) : (
        <g>
          <rect x="6" y="4" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <line x1="10" y1="8.75" x2="16" y2="8.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="10" y1="12.75" x2="16" y2="12.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="10" y1="16.75" x2="14" y2="16.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
