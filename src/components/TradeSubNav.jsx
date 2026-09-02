import StatusBadge from './ui/StatusBadge';

const VIEWS = [
  { id: 'agent', label: 'Agent' },
  { id: 'intelligence', label: 'Intelligence' },
  { id: 'upgrade', label: 'Upgrades' },
  { id: 'history', label: 'History' },
  { id: 'inbox', label: 'Proposals', alpha: true },
];

export default function TradeSubNav({ activeView, onViewChange, onViewIntent, unreadCount = 0 }) {
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
          data-tour={id === 'history' ? 'trade-view-history' : id === 'inbox' ? 'trade-view-proposals' : undefined}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            {label}
            {id === 'inbox' && unreadCount > 0 && <span aria-label={`${unreadCount} unread proposal updates`} title={`${unreadCount} unread proposal updates`} style={{ minWidth: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', borderRadius: 999, background: 'var(--color-signature)', color: 'var(--color-signature-fg)', fontSize: 'var(--type-micro)', lineHeight: 1 }}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
            {beta && <StatusBadge kind="beta" size="sm" />}
            {alpha && <StatusBadge kind="alpha" size="sm" />}
          </span>
        </button>
      ))}
    </div>
  );
}
