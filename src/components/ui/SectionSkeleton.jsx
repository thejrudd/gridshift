import { Skeleton, SkeletonCard } from './Skeleton';

/**
 * Full-section loading fallback used as the Suspense fallback for lazy-loaded
 * views — a header bar plus a short stack of card shapes, so an arriving
 * section reads as "content coming" instead of a bare text message.
 */
export default function SectionSkeleton({ label }) {
  return (
    <div className="px-4 py-6 max-w-3xl mx-auto w-full" role="status" aria-label={label ?? 'Loading section'}>
      <Skeleton className="h-4 w-40 rounded mb-5" />
      <div className="flex flex-col gap-3">
        <SkeletonCard height="4.5rem" />
        <SkeletonCard height="4.5rem" />
        <SkeletonCard height="4.5rem" />
      </div>
    </div>
  );
}
