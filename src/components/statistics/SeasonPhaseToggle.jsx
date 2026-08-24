import { NFL_SEASON_PHASES } from '../../utils/espnNflScoreboard';

const OPTIONS = [
  { id: NFL_SEASON_PHASES.REGULAR, label: 'Regular' },
  { id: NFL_SEASON_PHASES.PRESEASON, label: 'Preseason' },
];

export default function SeasonPhaseToggle({ value, onChange, disabled = false, className = '' }) {
  return (
    <div
      className={`statistics-season-phase-toggle${className ? ` ${className}` : ''}`}
      role="group"
      aria-label="NFL season phase"
    >
      {OPTIONS.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            className={active ? 'is-active' : ''}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => option.id !== value && onChange?.(option.id)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
