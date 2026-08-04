const FIRST_FANTASY_WEEK = 1;
const LAST_FANTASY_WEEK = 18;

function normalizeSeason(value) {
  return value == null ? '' : String(value).trim();
}

function resolveRegularSeasonWeek(nflState) {
  const leg = Number(nflState?.leg);
  const week = Number(nflState?.week);
  const value = Number.isFinite(leg) && leg > 0 ? leg : week;
  if (!Number.isFinite(value) || value < FIRST_FANTASY_WEEK) return null;
  return Math.min(LAST_FANTASY_WEEK, Math.floor(value));
}

export function resolveFantasyLiveAvailability({ nflState, leagueSeason } = {}) {
  if (!nflState || typeof nflState !== 'object') {
    return { active: false, week: null, reason: 'unknown', message: null };
  }

  const phase = String(nflState.season_type ?? '').trim().toLowerCase();
  if (phase !== 'regular') {
    return {
      active: false,
      week: null,
      reason: phase === 'pre' ? 'preseason' : 'offseason',
      message: phase === 'pre'
        ? 'There is no fantasy matchup this week. Fantasy Live begins with the NFL regular season.'
        : 'There is no fantasy matchup this week. Fantasy Live returns with the next NFL regular season.',
    };
  }

  const activeSeason = normalizeSeason(nflState.season);
  const selectedSeason = normalizeSeason(leagueSeason);
  if (activeSeason && selectedSeason && activeSeason !== selectedSeason) {
    return {
      active: false,
      week: null,
      reason: 'season-mismatch',
      message: `There is no current fantasy matchup for this ${selectedSeason} league. Fantasy Live follows the active ${activeSeason} season.`,
    };
  }

  const week = resolveRegularSeasonWeek(nflState);
  if (!week) {
    return {
      active: false,
      week: null,
      reason: 'week-unavailable',
      message: 'There is no fantasy matchup this week.',
    };
  }

  return { active: true, week, reason: null, message: null };
}

function joinConfigurationItems(items) {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

export function getLiveConfigurationMessage(config, platformLabel = 'Sleeper') {
  if (!config || typeof config !== 'object') return null;

  const missing = [];
  if (config.apiKeyReady === false) missing.push('a BALLDONTLIE API key');
  if (config.leagueScopeEnabled === false) missing.push(`an allowed ${platformLabel} league ID`);
  if (config.cookieSigningReady === false) missing.push('a server session secret');

  if (missing.length) return `Live scoring needs ${joinConfigurationItems(missing)}.`;
  if (config.enabled === false) return 'Live scoring is not fully configured on this server.';
  return null;
}
