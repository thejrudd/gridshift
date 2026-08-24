const VIEWS = [
  { id: 'predictions', label: 'Picks' },
  { id: 'standings',   label: 'Standings' },
  { id: 'playoffs',    label: 'Playoffs' },
];

export default function SeasonSubNav({ activeView, onViewChange }) {
  return (
    <div className="season-tabs" role="tablist" aria-label="Season views">
      {VIEWS.map(({ id, label }) => (
        <button
          key={id}
          role="tab"
          aria-selected={activeView === id}
          onClick={() => onViewChange(id)}
          className={`season-tab${activeView === id ? ' active' : ''}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
