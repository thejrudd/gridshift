const VIEWS = [
  { id: 'roster',    label: 'Roster' },
  { id: 'rankings',  label: 'Rankings' },
  { id: 'matchup',   label: 'Matchup' },
  { id: 'waiver',    label: 'Waiver' },
  { id: 'league',    label: 'League' },
  { id: 'defense',   label: 'Heatmap' },
  { id: 'trade',     label: 'Trade' },
  { id: 'scoring',   label: 'Scoring' },
];

export default function CompanionSubNav({ activeView, onViewChange }) {
  return (
    <div className="season-tabs" role="tablist" aria-label="Companion views">
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
