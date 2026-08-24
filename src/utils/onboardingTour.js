export const ONBOARDING_STORAGE_KEY = 'gridshift:onboardingTour';

export const ONBOARDING_STATUS = {
  awaitingLeague: 'awaiting-league',
  complete: 'complete',
};

export const ONBOARDING_PHASE = {
  idle: 'idle',
  welcome: 'welcome',
  awaitingLeague: 'awaiting-league',
  tour: 'tour',
};

export function normalizeOnboardingStatus(value) {
  return Object.values(ONBOARDING_STATUS).includes(value) ? value : null;
}

export function getInitialOnboardingPhase({ isFirstRun, storedStatus, hasLeague }) {
  const status = normalizeOnboardingStatus(storedStatus);
  if (status === ONBOARDING_STATUS.complete) return ONBOARDING_PHASE.idle;
  if (status === ONBOARDING_STATUS.awaitingLeague) {
    return hasLeague ? ONBOARDING_PHASE.tour : ONBOARDING_PHASE.welcome;
  }
  return isFirstRun ? ONBOARDING_PHASE.welcome : ONBOARDING_PHASE.idle;
}
