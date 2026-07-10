const VIEWS = [
  { id: 'prospects', label: 'Prospects' },
  { id: 'picks',     label: 'Picks' },
  { id: 'results',   label: 'Results' },
];

export default function ScoutSubNav({ activeView, onViewChange }) {
  return (
    <div className="season-tabs" role="tablist" aria-label="Scout views">
      {VIEWS.map(({ id, label }) => (
        <button
          key={id}
          role="tab"
          aria-selected={activeView === id}
          onClick={() => onViewChange(id)}
          className={`season-tab${activeView === id ? ' active' : ''}`}
          data-tour={id === 'results' ? 'scout-view-results' : undefined}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
