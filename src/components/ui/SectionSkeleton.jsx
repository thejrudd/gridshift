import { Skeleton, SkeletonCard } from './Skeleton';

/**
 * Full-section loading fallback used as the Suspense fallback for lazy-loaded
 * views — a header bar plus a short stack of card shapes, so an arriving
 * section reads as "content coming" instead of a bare text message.
 *
 * Loading motion: this is the SHOW AFTER knob with no JavaScript behind it. A
 * Suspense fallback cannot be delayed from the outside, so the skeleton holds
 * itself invisible for --gs-load-show-after and then fades up; a chunk that
 * arrives inside that window is swapped out before anything was ever painted,
 * which is why a fast tab switch shows no placeholder at all. The card stack
 * then arrives on the shared stagger. Definitions: docs/Loading Motion.md.
 */
export default function SectionSkeleton({ label }) {
  return (
    <div
      className="gs-section-skeleton px-4 py-6 max-w-3xl mx-auto w-full"
      role="status"
      aria-label={label ?? 'Loading section'}
    >
      <Skeleton className="h-4 w-40 rounded mb-5" />
      <div className="flex flex-col gap-3 gridshift-reveal gridshift-reveal--auto">
        <SkeletonCard height="4.5rem" />
        <SkeletonCard height="4.5rem" />
        <SkeletonCard height="4.5rem" />
      </div>
    </div>
  );
}
