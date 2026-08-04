import { AVAILABLE_SLEEPER_SEASONS, useFantasyLeague } from '../context/SleeperContext';

// Per-view season capability:
//   'current-only'  — the view only makes sense in the current league year
//                     (Live scoring, current Matchup, Waiver).
//   'historical-ok' — works in any season (default); hints only fire when the
//                     view reports itself empty.
export const CURRENT_LEAGUE_YEAR = AVAILABLE_SLEEPER_SEASONS[0];

/**
 * NFL regular seasons begin on the Thursday after the first Monday in September.
 * Historical seasons are always considered started; future seasons are not.
 */
export function isNflRegularSeasonStarted(season, date = new Date()) {
  const seasonYear = Number(season);
  if (!Number.isInteger(seasonYear)) return false;

  const currentYear = date.getFullYear();
  if (seasonYear < currentYear) return true;
  if (seasonYear > currentYear) return false;

  const septemberFirst = new Date(currentYear, 8, 1);
  const daysUntilMonday = (8 - septemberFirst.getDay()) % 7;
  const firstMonday = 1 + daysUntilMonday;
  const regularSeasonStart = new Date(currentYear, 8, firstMonday + 3);
  return date >= regularSeasonStart;
}

/**
 * Pure hint resolver — returns null or { kind, targetSeason, message }.
 * Views pass their own emptiness; this never guesses from render output.
 */
export function getSeasonHint({ capability = 'historical-ok', isEmpty = false, feature = 'This view', season, seasonOptions = [] }) {
  const seasonKey = String(season ?? '');
  if (!seasonKey) return null;
  const options = seasonOptions.map(String);
  const isCurrent = seasonKey === String(CURRENT_LEAGUE_YEAR);

  if (capability === 'current-only' && !isCurrent) {
    const target = options.find((year) => year === String(CURRENT_LEAGUE_YEAR));
    if (!target) return null;
    return {
      kind: 'current-only',
      targetSeason: target,
      message: feature === 'Fantasy Live'
        ? `Fantasy Live is only available for the current league year with active fantasy matchups. You're viewing ${seasonKey}.`
        : `${feature} follows the current season — you're viewing ${seasonKey}.`,
    };
  }

  if (isEmpty) {
    // Suggest the most recent other league year that this account has.
    const target = options.find((year) => year !== seasonKey);
    if (!target) return null;
    return {
      kind: isCurrent ? 'empty-current' : 'empty-season',
      targetSeason: target,
      message: isCurrent
        ? `Nothing here for ${seasonKey} yet.`
        : `Nothing here for ${seasonKey}.`,
    };
  }

  return null;
}

/** Context-aware wrapper used by SeasonHintBanner. */
export function useSeasonHint({ capability, isEmpty, feature }) {
  const { season, linkedLeagueSeasonOptions, changeSeason, seasonSwitching } = useFantasyLeague();
  const hint = getSeasonHint({
    capability,
    isEmpty,
    feature,
    season,
    seasonOptions: linkedLeagueSeasonOptions ?? [],
  });
  return hint ? { ...hint, changeSeason, seasonSwitching } : null;
}
