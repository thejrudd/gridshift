/**
 * Thin real-progress banner for the season-stats load — the only place in the
 * app that shows a progress percentage (fake progress is prohibited).
 * Callers pass the live `statsProgress` value from SleeperStatsProgressContext.
 */
export default function StatsProgressBanner({ progress = 0, label = 'Loading stats', className = '' }) {
  return (
    <div
      className={`px-4 py-3 rounded-xl flex items-center gap-3 ${className}`}
      style={{ background: 'var(--color-fill)', border: '1px solid var(--color-separator)' }}
    >
      <div
        className="h-1 flex-1 rounded-full overflow-hidden"
        style={{ background: 'var(--color-fill-secondary)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${progress}%`, background: 'var(--color-signature)' }}
        />
      </div>
      <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--color-label-tertiary)' }}>
        {label} {progress}%
      </span>
    </div>
  );
}
