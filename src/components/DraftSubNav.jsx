const VIEWS = [
  { id: 'war-room', label: 'War Room' },
  { id: 'my-board', label: 'Board' },
  { id: 'results', label: 'Results' },
  { id: 'gauntlet', label: 'Gauntlet', disabled: true },
  { id: 'tiers-runs', label: 'Tiers/Runs', disabled: true },
];

export default function DraftSubNav({ activeView, onViewChange, disabledViews = {} }) {
  return (
    <div className="season-tabs" role="tablist" aria-label="Draft views">
      {VIEWS.map(({ id, label, disabled }) => {
        const dynamicDisabled = disabledViews[id] ?? null;
        const isDisabled = Boolean(disabled || dynamicDisabled?.disabled);
        const title = disabled
          ? `${label} is staged for future work`
          : dynamicDisabled?.reason;

        return (
          <button
            key={id}
            role="tab"
            aria-selected={activeView === id}
            aria-disabled={isDisabled || undefined}
            disabled={isDisabled}
            onClick={() => {
              if (!isDisabled) onViewChange(id);
            }}
            className={`season-tab${activeView === id ? ' active' : ''}${isDisabled ? ' is-disabled' : ''}`}
            title={title}
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
        );
      })}
    </div>
  );
}
