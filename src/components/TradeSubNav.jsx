const VIEWS = [
  { id: 'agent', label: 'Agent', beta: true },
  { id: 'intelligence', label: 'Intelligence', beta: true },
  { id: 'upgrade', label: 'Upgrades', beta: true },
  { id: 'compare', label: 'Compare' },
];

export default function TradeSubNav({ activeView, onViewChange }) {
  return (
    <div className="season-tabs" role="tablist" aria-label="Trade views">
      {VIEWS.map(({ id, label, beta, alpha }) => (
        <button
          key={id}
          role="tab"
          aria-selected={activeView === id}
          onClick={() => onViewChange(id)}
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
                background: '#8b5cf6',
                color: '#fff',
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
