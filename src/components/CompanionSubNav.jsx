const VIEWS = [
  { id: 'roster',    label: 'Roster' },
  { id: 'rankings',  label: 'Rankings' },
  { id: 'matchup',   label: 'Matchup' },
  { id: 'waiver',    label: 'Waiver' },
  { id: 'league',    label: 'League' },
  { id: 'defense',   label: 'Heatmap' },
  { id: 'scoring',   label: 'Scoring' },
];

export default function CompanionSubNav({ activeView, onViewChange }) {
  return (
    <div className="season-tabs" role="tablist" aria-label="Companion views">
      {VIEWS.map(({ id, label, alpha }) => (
        <button
          key={id}
          role="tab"
          aria-selected={activeView === id}
          onClick={() => onViewChange(id)}
          className={`season-tab${activeView === id ? ' active' : ''}`}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            {label}
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
