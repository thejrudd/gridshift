import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canUseBalldontlieScores,
  normalizeStatisticsScoresProvider,
  resolveStatisticsScoresProvider,
  STATISTICS_SCORES_PROVIDERS,
} from '../../src/utils/statisticsScoresProvider.js';

const configuredStatus = {
  provider: STATISTICS_SCORES_PROVIDERS.BALLDONTLIE,
  apiKeyReady: true,
};

test('uses BALLDONTLIE when the server reports a configured key without league gating', () => {
  assert.equal(canUseBalldontlieScores({ providerStatus: configuredStatus }), true);
  assert.equal(resolveStatisticsScoresProvider({ providerStatus: configuredStatus }), STATISTICS_SCORES_PROVIDERS.BALLDONTLIE);
});

test('falls back to ESPN when the provider status is unavailable or has no key', () => {
  assert.equal(resolveStatisticsScoresProvider({}), STATISTICS_SCORES_PROVIDERS.ESPN);
  assert.equal(resolveStatisticsScoresProvider({ providerStatus: { provider: 'espn', apiKeyReady: false } }), STATISTICS_SCORES_PROVIDERS.ESPN);
  assert.equal(resolveStatisticsScoresProvider({ providerStatus: { provider: STATISTICS_SCORES_PROVIDERS.BALLDONTLIE, apiKeyReady: false } }), STATISTICS_SCORES_PROVIDERS.ESPN);
});

test('normalizes only the three supported Statistics Scores sources', () => {
  assert.equal(normalizeStatisticsScoresProvider(' FIXTURE '), STATISTICS_SCORES_PROVIDERS.FIXTURE);
  assert.equal(normalizeStatisticsScoresProvider('ESPN'), STATISTICS_SCORES_PROVIDERS.ESPN);
  assert.equal(normalizeStatisticsScoresProvider('balldontlie'), STATISTICS_SCORES_PROVIDERS.BALLDONTLIE);
  assert.equal(normalizeStatisticsScoresProvider('synthetic'), null);
});

test('honors an applied local override even when BALLDONTLIE is unavailable', () => {
  assert.equal(resolveStatisticsScoresProvider({
    providerStatus: {
      provider: STATISTICS_SCORES_PROVIDERS.FIXTURE,
      overrideApplied: true,
      available: true,
    },
  }), STATISTICS_SCORES_PROVIDERS.FIXTURE);
  assert.equal(resolveStatisticsScoresProvider({
    providerStatus: {
      provider: STATISTICS_SCORES_PROVIDERS.BALLDONTLIE,
      overrideApplied: true,
      apiKeyReady: false,
      available: false,
    },
  }), STATISTICS_SCORES_PROVIDERS.BALLDONTLIE);
});
