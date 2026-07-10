/**
 * Skeleton primitives — the app's single loading language for content areas.
 *
 * Hybrid shell pattern: render real structure (names, logos, layout) the
 * moment it's available and put a skeleton only where a value hasn't hydrated
 * yet. Never render placeholder values ('0.0', '—') as if they were data;
 * after hydration '—' remains the legitimate "no data" marker.
 */

export function Skeleton({ className = '', style }) {
  return <div className={`gs-skeleton ${className}`} style={style} aria-hidden="true" />;
}

/** Small pill sized for an unhydrated stat cell. */
export function SkeletonStatChip({ width = '2.25rem', className = '' }) {
  return <Skeleton className={`inline-block rounded ${className}`} style={{ width, height: '0.85em', verticalAlign: 'baseline' }} />;
}

export function SkeletonText({ lines = 2, className = '' }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-3 rounded" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </div>
  );
}

export function SkeletonCard({ height = '5rem', className = '' }) {
  return <Skeleton className={`w-full rounded-xl ${className}`} style={{ height }} />;
}
