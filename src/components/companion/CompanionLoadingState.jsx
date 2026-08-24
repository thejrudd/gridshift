import { Skeleton } from '../ui/Skeleton';

export default function CompanionLoadingState({
  title,
  description,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 px-6 text-center ${className}`} role="status">
      <Skeleton className="mb-3 h-1.5 w-44 rounded-full" />
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
