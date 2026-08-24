export const STATISTICS_SCORES_PROVIDERS = Object.freeze({
  FIXTURE: 'fixture',
  ESPN: 'espn',
  BALLDONTLIE: 'balldontlie',
});

const STATISTICS_SCORES_PROVIDER_VALUES = new Set(Object.values(STATISTICS_SCORES_PROVIDERS));

export function normalizeStatisticsScoresProvider(value, fallback = null) {
  const provider = String(value ?? '').trim().toLowerCase();
  return STATISTICS_SCORES_PROVIDER_VALUES.has(provider) ? provider : fallback;
}

export function canUseBalldontlieScores({ providerStatus, status, apiKeyReady } = {}) {
  const source = providerStatus ?? status;
  if (source) return source.provider === STATISTICS_SCORES_PROVIDERS.BALLDONTLIE && source.apiKeyReady !== false;
  return apiKeyReady === true;
}

export function resolveStatisticsScoresProvider({ providerStatus, status, apiKeyReady } = {}) {
  const source = providerStatus ?? status;
  const provider = normalizeStatisticsScoresProvider(source?.provider);
  if (source?.overrideApplied && provider) return provider;
  return canUseBalldontlieScores({ providerStatus, status, apiKeyReady })
    ? STATISTICS_SCORES_PROVIDERS.BALLDONTLIE
    : STATISTICS_SCORES_PROVIDERS.ESPN;
}
