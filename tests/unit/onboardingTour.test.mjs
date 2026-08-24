import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getInitialOnboardingPhase,
  normalizeOnboardingStatus,
  ONBOARDING_PHASE,
  ONBOARDING_STATUS,
} from '../../src/utils/onboardingTour.js';

test('fresh installs receive the welcome prompt', () => {
  assert.equal(getInitialOnboardingPhase({ isFirstRun: true, storedStatus: null, hasLeague: false }), ONBOARDING_PHASE.welcome);
});

test('existing installs without onboarding state are not interrupted', () => {
  assert.equal(getInitialOnboardingPhase({ isFirstRun: false, storedStatus: null, hasLeague: false }), ONBOARDING_PHASE.idle);
});

test('awaiting setup reopens welcome before connection and resumes after connection', () => {
  assert.equal(getInitialOnboardingPhase({
    isFirstRun: false,
    storedStatus: ONBOARDING_STATUS.awaitingLeague,
    hasLeague: false,
  }), ONBOARDING_PHASE.welcome);
  assert.equal(getInitialOnboardingPhase({
    isFirstRun: false,
    storedStatus: ONBOARDING_STATUS.awaitingLeague,
    hasLeague: true,
  }), ONBOARDING_PHASE.tour);
});

test('completed and invalid onboarding states are handled safely', () => {
  assert.equal(getInitialOnboardingPhase({
    isFirstRun: true,
    storedStatus: ONBOARDING_STATUS.complete,
    hasLeague: false,
  }), ONBOARDING_PHASE.idle);
  assert.equal(normalizeOnboardingStatus('unexpected'), null);
});
