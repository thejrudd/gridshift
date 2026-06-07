const VIEWS = [
  { id: 'war-room', label: 'War Room' },
  { id: 'draft-order', label: 'Draft Order' },
  { id: 'results', label: 'Results' },
  { id: 'gauntlet', label: 'Gauntlet', disabled: true },
  { id: 'tiers-runs', label: 'Tiers/Runs', disabled: true },
];

export default function DraftSubNav({ activeView, onViewChange }) {
  return (
    <div className="season-tabs" role="tablist" aria-label="Draft views">
      {VIEWS.map(({ id, label, disabled }) => (
        <button
          key={id}
          role="tab"
          aria-selected={activeView === id}
          aria-disabled={disabled || undefined}
          disabled={disabled}
          onClick={() => {
            if (!disabled) onViewChange(id);
          }}
          className={`season-tab${activeView === id ? ' active' : ''}${disabled ? ' is-disabled' : ''}`}
          title={disabled ? `${label} is staged for future work` : undefined}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            {label}
            {disabled && (
              <span
                className="draft-subnav-badge"
                aria-hidden="true"
              >
                Soon
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
