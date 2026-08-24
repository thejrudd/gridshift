/**
 * The single empty-state treatment (DESIGN.md › Empty States): short heading
 * plus at most one supporting line and one action. One per surface — if a
 * panel has nothing to show and no action to offer, don't render the panel.
 */
export default function EmptyState({ title, hint = null, action = null, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-16 text-center ${className}`}>
      <span className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>{title}</span>
      {hint && (
        <span className="mt-1 max-w-md text-xs leading-5" style={{ color: 'var(--color-label-secondary)' }}>
          {hint}
        </span>
      )}
      {action}
    </div>
  );
}
