// Sleeper implementation of the league data contract (src/utils/leagueProviderContract.js).
//
// A pure mapping over data the Sleeper path already loads (SleeperContext and
// useLeagueHistoryData). It adds no requests and changes no values: Standings
// renders exactly what it rendered before the contract existed (pinned by
// tests/unit/leagueProviderStandings.test.mjs), and so does League Activity
// (tests/unit/leagueProviderScreens.test.mjs).

import { LEAGUE_PROVIDER_IDS } from './leagueProviderContract.js';
import { buildActivitySeasonGroups, buildFinalPlacements, buildSeasonStandings, normalizeSeasonBrackets } from './leagueHistory.js';

/**
 * League summary from the Sleeper context value (`useFantasyLeague()`).
 * @returns {import('./leagueProviderContract.js').LeagueSummary | null}
 */
export function mapSleeperLeagueSummary({ platform, league, selectedLeagueId, season } = {}) {
  if (platform !== 'sleeper' || !league || !selectedLeagueId) return null;
  return {
    provider: LEAGUE_PROVIDER_IDS.SLEEPER,
    leagueId: String(selectedLeagueId),
    name: league.name ?? 'League',
    season: String(league.season ?? season ?? ''),
    viewerRole: null,
  };
}

/**
 * Standings model from `useLeagueHistoryData()` output. Uses the same
 * leagueHistory functions, inputs, and options CompanionStandings used before.
 * @returns {import('./leagueProviderContract.js').StandingsModel}
 */
export function buildSleeperStandingsModel(history) {
  const season = String(history?.season ?? '');
  const snapshot = history?.snapshots?.find((entry) => String(entry.season) === season) ?? null;
  const historical = Boolean(snapshot?.completed);
  const standings = snapshot ? buildSeasonStandings(snapshot, { historical }) : null;
  const brackets = snapshot ? normalizeSeasonBrackets(snapshot) : null;
  const finalPlacements = historical && snapshot ? buildFinalPlacements(snapshot, brackets) : null;
  const hasStandings = Boolean(standings?.rows?.length && standings.throughWeek > 0);

  let status = 'ready';
  if (history?.platform !== 'sleeper') status = 'unsupported';
  else if (history.loading) status = 'loading';
  else if (history.error) status = 'error';
  else if (!hasStandings) status = 'empty';

  return {
    provider: LEAGUE_PROVIDER_IDS.SLEEPER,
    status,
    season,
    error: history?.error ?? '',
    retry: history?.retry ?? (() => {}),
    historical,
    standings,
    brackets,
    finalPlacements,
    postseason: { kind: 'bracket', week: snapshot?.league?.settings?.playoff_week_start ?? null },
  };
}

/** League Activity filters for a Sleeper league (unchanged from before the contract). */
export const SLEEPER_ACTIVITY_FILTERS = Object.freeze([
  { id: 'all', label: 'All' },
  { id: 'trade', label: 'Trades' },
  { id: 'pick', label: 'Picks' },
  { id: 'waiver', label: 'Waivers' },
  { id: 'free_agent', label: 'Free agents' },
]);

/**
 * League Activity model from `useLeagueHistoryData()` output and the player
 * catalog, through the same `buildActivitySeasonGroups` call CompanionActivity
 * made before the contract.
 * @returns {import('./leagueProviderContract.js').ActivityModel}
 */
export function buildSleeperActivityModel(history, players) {
  const season = String(history?.season ?? '');
  const groups = buildActivitySeasonGroups(history?.snapshots ?? [], players ?? {});
  const entries = groups.find((group) => group.season === history?.season)?.entries ?? [];
  let status = 'ready';
  if (history?.platform !== 'sleeper') status = 'unsupported';
  else if (history.loading) status = 'loading';
  else if (history.error) status = 'error';
  else if (entries.length === 0) status = 'empty';
  return {
    provider: LEAGUE_PROVIDER_IDS.SLEEPER,
    status,
    season,
    error: history?.error ?? '',
    retry: history?.retry ?? (() => {}),
    entries,
    filters: SLEEPER_ACTIVITY_FILTERS,
    hideCommissionerByDefault: true,
  };
}
