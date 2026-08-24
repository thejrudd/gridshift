import StatusBadge from './ui/StatusBadge';

const VIEWS = [
  { id: 'stats', label: 'Stats' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'scores', label: 'Scores', beta: true },
  { id: 'standings', label: 'Standings' },
];

export default function StatisticsSubNav({ activeView = 'stats', onViewChange }) {
  return (
    <div className="season-tabs" role="tablist" aria-label="Statistics views">
      {VIEWS.map(({ id, label, beta }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={activeView === id}
          onClick={() => onViewChange?.(id)}
          className={`season-tab${activeView === id ? ' active' : ''}`}
          data-tour={`statistics-view-${id}`}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            {label}
            {beta && <StatusBadge kind="beta" size="sm" />}
          </span>
        </button>
      ))}
    </div>
  );
}
