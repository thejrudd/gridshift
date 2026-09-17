import { useEffect, useRef, useState } from 'react';
import { LOADING_MOTION } from '../utils/loadingMotion';

/**
 * useLoadingReveal — the timing gate in front of every wired loading surface.
 *
 * It owns the two decisions CSS cannot make: whether a skeleton has earned the
 * right to appear (SHOW AFTER), and how long it has to stay once it has
 * (MINIMUM HOLD). Everything else — the entrance, the stagger, the texture, the
 * handoff — is CSS reading the `--gs-load-*` tokens. Glossary and rollout
 * status: docs/Loading Motion.md.
 *
 * Phases:
 *   'structure'  real chrome only (tabs, filters, column headers, rank
 *                numbers). A load that resolves inside SHOW AFTER never leaves
 *                this phase, so a fast tab switch does not flash a placeholder.
 *   'skeleton'   placeholders are on screen and held for at least MINIMUM HOLD.
 *   'content'    real rows are mounted. `isHandingOff` stays true for the
 *                handoff fade so the outgoing skeleton can dissolve under them.
 *
 * @param {boolean} loading           true while the surface's data is in flight.
 * @param {object}  [options]
 * @param {number}  [options.showAfter]   override SHOW AFTER, ms.
 * @param {number}  [options.minimumHold] override MINIMUM HOLD, ms.
 * @param {number}  [options.handoffFade] override HANDOFF FADE, ms.
 * @param {string}  [options.handoff]     'row-by-row' | 'cross-fade' | 'cut'.
 *                                        'cut' drops the skeleton on the frame
 *                                        content mounts, so no fade is held.
 * @param {*}       [options.resetKey]    changing this restarts the clock —
 *                                        pass the tab id, week, or league so a
 *                                        navigation re-runs the whole load.
 */
export default function useLoadingReveal(loading, options = {}) {
  const {
    showAfter = LOADING_MOTION.showAfter,
    minimumHold = LOADING_MOTION.minimumHold,
    handoffFade = LOADING_MOTION.handoffFade,
    handoff = LOADING_MOTION.handoff,
    resetKey,
  } = options;

  const [skeletonVisible, setSkeletonVisible] = useState(false);
  const [isHandingOff, setIsHandingOff] = useState(false);
  // Bumped whenever a fresh load starts, so callers can key their list and
  // force the entrance animation to replay rather than resuming mid-flight.
  const [revealKey, setRevealKey] = useState(0);
  const shownAtRef = useRef(null);

  // A new load session is a render-time derivation, not an effect: the reveal
  // has to restart in the same commit the load starts, or the first frame of
  // the new load still carries the previous run's handoff state.
  const [session, setSession] = useState(() => ({ loading, resetKey }));
  if (session.loading !== loading || session.resetKey !== resetKey) {
    setSession({ loading, resetKey });
    if (loading) {
      setIsHandingOff(false);
      setRevealKey(key => key + 1);
    }
  }

  // SHOW AFTER — arm a timer when a load begins; if the load finishes first the
  // timer is cleared and the skeleton never mounts.
  useEffect(() => {
    if (!loading) return undefined;
    const timer = setTimeout(() => {
      shownAtRef.current = Date.now();
      setSkeletonVisible(true);
    }, Math.max(0, showAfter));
    return () => clearTimeout(timer);
  }, [loading, showAfter, resetKey]);

  // MINIMUM HOLD — when the load resolves, keep the skeleton until it has had
  // its floor, then open the handoff window the CSS fade runs inside.
  useEffect(() => {
    if (loading || !skeletonVisible) return undefined;

    const finish = () => {
      shownAtRef.current = null;
      setSkeletonVisible(false);
      if (handoff === 'cut' || handoffFade <= 0) return undefined;
      setIsHandingOff(true);
      const fadeTimer = setTimeout(() => setIsHandingOff(false), handoffFade);
      return () => clearTimeout(fadeTimer);
    };

    const shownFor = shownAtRef.current == null ? minimumHold : Date.now() - shownAtRef.current;
    const remaining = Math.max(0, minimumHold - shownFor);

    let cleanupFade;
    const holdTimer = setTimeout(() => { cleanupFade = finish(); }, remaining);
    return () => {
      clearTimeout(holdTimer);
      cleanupFade?.();
    };
  }, [loading, skeletonVisible, minimumHold, handoffFade, handoff]);

  const phase = skeletonVisible ? 'skeleton' : (loading ? 'structure' : 'content');

  return {
    phase,
    /** Render placeholder rows. */
    showSkeleton: phase === 'skeleton',
    /** Render the real rows. */
    showContent: phase === 'content',
    /** Skeleton is still mounted, overlaying the content it is handing off to. */
    isHandingOff: phase === 'content' && isHandingOff,
    /** Key the reveal container with this so a re-load replays the entrance. */
    revealKey,
  };
}
