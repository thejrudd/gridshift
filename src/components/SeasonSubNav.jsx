const VIEWS = [
  { id: 'predictions', label: 'Records' },
  { id: 'playoffs',    label: 'Playoffs' },
];

export default function SeasonSubNav({
  activeView,
  onViewChange,
  playoffsEnabled = true,
  playoffsReason = 'Complete all 32 team records in Records before opening Playoffs.',
}) {
  return (
    <div className="season-tabs-wrap">
      <div className="season-tabs" role="tablist" aria-label="Season views">
        {VIEWS.map(({ id, label }) => {
          const locked = id === 'playoffs' && !playoffsEnabled;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeView === id}
              aria-disabled={locked || undefined}
              title={locked ? playoffsReason : undefined}
              onClick={() => onViewChange(id)}
              className={`season-tab${activeView === id ? ' active' : ''}${locked ? ' is-locked' : ''}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
