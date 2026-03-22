export default function BottomTabBar({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'predictions', label: 'Predictions', Icon: SeasonIcon },
    { id: 'statistics',  label: 'Statistics',  Icon: PlayersIcon },
    { id: 'companion',   label: 'Companion',   Icon: CompanionIcon, beta: true },
    { id: 'compare',     label: 'Compare',     Icon: CompareIcon, alpha: true },
  ];

  return (
    <nav className="tab-bar" aria-label="Main navigation">
      <div className="tab-bar-inner">
        {tabs.map(({ id, label, Icon, beta, alpha }) => {
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
                <Icon active={active} />
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
                    color: '#000',
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
                    background: '#8b5cf6',
                    color: '#fff',
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

function CompareIcon({ active }) {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" className="tab-icon" aria-hidden="true">
      {active ? (
        <g fill="currentColor">
          <rect x="3" y="5" width="8" height="16" rx="2" />
          <rect x="15" y="5" width="8" height="16" rx="2" />
        </g>
      ) : (
        <g>
          <rect x="3" y="5" width="8" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="15" y="5" width="8" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
}
