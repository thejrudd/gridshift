export default function CompanionLoadingState({
  title,
  description,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 px-6 text-center ${className}`}>
      <div
        className="mb-3 h-1.5 w-44 overflow-hidden rounded-full"
        style={{ background: 'var(--color-fill-secondary)' }}
      >
        <div
          className="h-full w-2/3 rounded-full animate-pulse"
          style={{ background: 'var(--color-signature)' }}
        />
      </div>
      <span className="text-sm font-semibold" style={{ color: 'var(--color-label)' }}>
        {title}
      </span>
      {description && (
        <span className="mt-1 text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
          {description}
        </span>
      )}
    </div>
  );
}
