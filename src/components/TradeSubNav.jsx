const VIEWS = [
  { id: 'agent', label: 'Agent' },
  { id: 'intelligence', label: 'Intelligence' },
  { id: 'upgrade', label: 'Upgrades' },
];

export default function TradeSubNav({ activeView, onViewChange, onViewIntent }) {
  return (
    <div className="season-tabs" role="tablist" aria-label="Trade views">
      {VIEWS.map(({ id, label, beta, alpha }) => (
        <button
          key={id}
          role="tab"
          aria-selected={activeView === id}
          onClick={() => onViewChange(id)}
          onMouseEnter={() => (id === 'intelligence' || id === 'upgrade') && onViewIntent?.(id)}
          onFocus={() => (id === 'intelligence' || id === 'upgrade') && onViewIntent?.(id)}
          onTouchStart={() => (id === 'intelligence' || id === 'upgrade') && onViewIntent?.(id)}
          className={`season-tab${activeView === id ? ' active' : ''}`}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            {label}
            {beta && (
              <span style={{
                fontSize: '7px',
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                padding: '1px 3px',
                borderRadius: '3px',
                background: 'var(--color-signature)',
                color: 'var(--color-signature-fg)',
                lineHeight: '11px',
                verticalAlign: 'middle',
              }}>
                β
              </span>
            )}
            {alpha && (
              <span style={{
                fontSize: '7px',
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                padding: '1px 3px',
                borderRadius: '3px',
                background: 'var(--color-alpha)',
                color: 'var(--color-alpha-fg)',
                lineHeight: '11px',
                verticalAlign: 'middle',
              }}>
                α
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
