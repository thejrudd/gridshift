import useLoadingReveal from '../../hooks/useLoadingReveal';
import { LOADING_MOTION, loadingMotionAttrs } from '../../utils/loadingMotion';
import { Skeleton } from './Skeleton';

/**
 * LoadingSwap — the one place a Fantasy surface goes from placeholder to data.
 *
 * Wraps the timing gate (useLoadingReveal) and the CSS structure the handoff
 * needs, so wiring a tab is a single component rather than a phase state
 * machine per file. Defaults are the signed-off profile in
 * `src/utils/loadingMotion.js`; every knob is documented in
 * docs/Loading Motion.md.
 *
 *   <LoadingSwap loading={statsLoading} skeleton={<SkeletonRows count={6} />}>
 *     {rows.map(row => <Row key={row.id} {...row} />)}
 *   </LoadingSwap>
 *
 * Children become the staggered reveal's direct children, so keep one element
 * per row at the top level — a fragment wrapping several rows would reveal them
 * as one beat.
 *
 * @param {boolean} loading         data is in flight.
 * @param {ReactNode} skeleton      placeholder rows, one element per row.
 * @param {string} [className]      classes for the content (reveal) layer.
 * @param {string} [skeletonClassName] classes for the placeholder layer, so it
 *                                  can inherit the same padding as the content.
 * @param {string} [entrance]       'lift' | 'fade' | 'wipe' | 'scale' | 'slide'
 * @param {string} [texture]        'sweep' | 'pulse' | 'build' | 'static'
 * @param {string} [handoff]        'row-by-row' | 'cross-fade' | 'cut'
 * @param {boolean} [rails]         grow each row's leading accent bar. The row
 *                                  must render that bar as `.gs-reveal-rail`.
 * @param {*} [resetKey]            changing it restarts the load (tab, week…).
 * @param {object} [timing]         { showAfter, minimumHold, handoffFade } ms
 *                                  overrides for surfaces with a genuinely
 *                                  different arrival profile.
 */
export default function LoadingSwap({
  loading,
  skeleton,
  children,
  className = '',
  skeletonClassName = '',
  entrance,
  texture,
  handoff = LOADING_MOTION.handoff,
  rails = false,
  resetKey,
  timing = {},
  role,
  'aria-label': ariaLabel,
}) {
  const { showSkeleton, showContent, isHandingOff, revealKey } = useLoadingReveal(loading, {
    ...timing,
    handoff,
    resetKey,
  });

  const revealClass = [
    'gs-loadswap__content',
    'gridshift-reveal',
    'gridshift-reveal--auto',
    rails ? 'gridshift-reveal--rails' : '',
    className,
  ].filter(Boolean).join(' ');

  const skeletonMounted = showSkeleton || isHandingOff;

  return (
    <div
      className="gs-loadswap"
      {...loadingMotionAttrs({ entrance, texture, handoff })}
      role={role}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
    >
      {skeletonMounted && (
        <div
          className={`gs-loadswap__skeleton ${isHandingOff ? 'is-handing-off' : ''} ${skeletonClassName}`.trim()}
          aria-hidden="true"
        >
          {skeleton}
        </div>
      )}
      {showContent && (
        <div className={revealClass} key={revealKey}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * RevealList — the entrance without the skeleton.
 *
 * For surfaces whose rows are already in hand when they mount (so there is
 * nothing to place-hold) but that should still arrive on the shared stagger.
 * `resetKey` is what replays it: give it the thing a navigation changes — the
 * week, the matchup, the selected roster — and the list re-reveals on each move
 * instead of only on first mount.
 */
export function RevealList({
  children,
  className = '',
  entrance,
  rails = false,
  resetKey,
  ...rest
}) {
  const revealClass = [
    'gridshift-reveal',
    'gridshift-reveal--auto',
    rails ? 'gridshift-reveal--rails' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={revealClass}
      key={String(resetKey ?? '')}
      {...loadingMotionAttrs({ entrance })}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * SkeletonRows — the default placeholder body: N evenly sized card shapes.
 * Surfaces with a distinctive row silhouette should pass their own skeleton
 * instead, one element per row, so the row-by-row handoff lines up.
 */
export function SkeletonRows({ count = 6, height = '3.5rem', className = '', rowClassName = '' }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`.trim()}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={`w-full rounded-xl ${rowClassName}`.trim()} style={{ height }} />
      ))}
    </div>
  );
}
