import { useCallback, useEffect, useState } from 'react';
import {
  getInitialOnboardingPhase,
  normalizeOnboardingStatus,
  ONBOARDING_PHASE,
  ONBOARDING_STATUS,
  ONBOARDING_STORAGE_KEY,
} from '../utils/onboardingTour';

function readStoredStatus() {
  try { return normalizeOnboardingStatus(localStorage.getItem(ONBOARDING_STORAGE_KEY)); } catch { return null; }
}

function writeStoredStatus(status) {
  try { localStorage.setItem(ONBOARDING_STORAGE_KEY, status); } catch { /* ignore */ }
}

export default function useOnboardingTour({ isFirstRun, hasLeague }) {
  const [initialStoredStatus] = useState(readStoredStatus);
  const [phase, setPhase] = useState(() => getInitialOnboardingPhase({
    isFirstRun,
    storedStatus: initialStoredStatus,
    hasLeague,
  }));

  // Persist fresh onboarding before interaction so setup can survive reloads.
  useEffect(() => {
    if (isFirstRun && initialStoredStatus === null) {
      writeStoredStatus(ONBOARDING_STATUS.awaitingLeague);
    }
  }, [initialStoredStatus, isFirstRun]);

  // Without a league the tour runs on sample data, so there is nothing to wait for.
  const begin = useCallback(() => {
    setPhase(ONBOARDING_PHASE.tour);
  }, []);

  const startManual = useCallback(() => {
    setPhase(hasLeague ? ONBOARDING_PHASE.tour : ONBOARDING_PHASE.welcome);
  }, [hasLeague]);

  const complete = useCallback(() => {
    writeStoredStatus(ONBOARDING_STATUS.complete);
    setPhase(ONBOARDING_PHASE.idle);
  }, []);

  // A league-less tour ends on the connect prompt instead of the app.
  const finishPreview = useCallback(() => {
    writeStoredStatus(ONBOARDING_STATUS.complete);
    setPhase(ONBOARDING_PHASE.connect);
  }, []);

  return { phase, begin, startManual, complete, finishPreview };
}
