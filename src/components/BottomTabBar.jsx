export default function BottomTabBar({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'companion',   label: 'Companion',   renderIcon: (active) => <CompanionIcon active={active} /> },
    { id: 'statistics',  label: 'Statistics',  renderIcon: (active) => <PlayersIcon active={active} /> },
    { id: 'trade',       label: 'Trade',       renderIcon: (active) => <TradeIcon active={active} /> },
    { id: 'scout',       label: 'Scout',       renderIcon: (active) => <ScoutIcon active={active} />, alpha: true },
    { id: 'predictions', label: 'Predictions', renderIcon: (active) => <SeasonIcon active={active} /> },
  ];

  return (
    <nav className="tab-bar" aria-label="Main navigation">
      <div className="tab-bar-inner">
        {tabs.map(({ id, label, renderIcon, beta, alpha }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`tab-item${active ? ' active' : ''}`}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
            >
              <span style={{ position: 'relative', display: 'inline-flex', justifyContent: 'center' }}>
                {renderIcon(active)}
                {beta && (
                  <span style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-10px',
                    fontSize: '7px',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    padding: '1px 3px',
                    borderRadius: '3px',
                    background: 'var(--color-signature)',
                    color: 'var(--color-signature-fg)',
                    lineHeight: '11px',
                  }}>
                    β
                  </span>
                )}
                {alpha && (
                  <span style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-10px',
                    fontSize: '7px',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    padding: '1px 3px',
                    borderRadius: '3px',
                    background: 'var(--color-alpha)',
                    color: 'var(--color-alpha-fg)',
                    lineHeight: '11px',
                  }}>
                    α
                  </span>
                )}
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

function ScoutIcon({ active }) {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" className="tab-icon" aria-hidden="true">
      {active ? (
        <g fill="currentColor">
          {/* Clipboard body */}
          <rect x="6" y="5" width="14" height="17" rx="2" />
          {/* Clip at top */}
          <rect x="10" y="3" width="6" height="4" rx="1" fill="var(--color-bg)" />
          {/* Lines (report rows) */}
          <rect x="9" y="11" width="8" height="1.5" rx="0.75" fill="var(--color-bg)" />
          <rect x="9" y="14" width="6" height="1.5" rx="0.75" fill="var(--color-bg)" />
          <rect x="9" y="17" width="4" height="1.5" rx="0.75" fill="var(--color-bg)" />
        </g>
      ) : (
        <g>
          <rect x="6" y="5" width="14" height="17" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="10" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" fill="var(--color-bg)" />
          <line x1="9" y1="11.75" x2="17" y2="11.75" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="9" y1="14.75" x2="15" y2="14.75" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="9" y1="17.75" x2="13" y2="17.75" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
