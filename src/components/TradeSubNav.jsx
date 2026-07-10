import StatusBadge from './ui/StatusBadge';

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
            {beta && <StatusBadge kind="beta" size="sm" />}
            {alpha && <StatusBadge kind="alpha" size="sm" />}
          </span>
        </button>
      ))}
    </div>
  );
}
