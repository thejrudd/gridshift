function normalizeSeason(value) {
  const season = String(value ?? '').trim();
  return /^\d{4}$/.test(season) ? season : null;
}
/**
 * Builds every available league-year scoring model independently of the
 * currently selected results season.
 */
export function buildScoringModelOptions({
  platform = 'sleeper',
  resultSeason = null,
  linkedLeagueHistory = [],
  linkedLeagueSeasonOptions = [],
  activeLeague = null,
} = {}) {
  const normalizedResultSeason = normalizeSeason(resultSeason ?? activeLeague?.season);
  const bySeason = new Map();

  if (platform === 'espn') {
    for (const seasonValue of linkedLeagueSeasonOptions ?? []) {
      const season = normalizeSeason(seasonValue);
      if (!season || bySeason.has(season)) continue;
      bySeason.set(season, {
        season,
        leagueId: activeLeague?.league_id == null ? null : String(activeLeague.league_id),
        leagueName: activeLeague?.name ?? 'ESPN league',
        league: null,
        isResultSeason: season === normalizedResultSeason,
      });
    }
  } else {
    for (const entry of linkedLeagueHistory ?? []) {
      const season = normalizeSeason(entry?.season ?? entry?.league?.season);
      if (!season || !entry?.league || bySeason.has(season)) continue;
      bySeason.set(season, {
        season,
        leagueId: entry.league.league_id == null ? null : String(entry.league.league_id),
        leagueName: entry.league.name ?? 'Sleeper league',
        league: entry.league,
        isResultSeason: season === normalizedResultSeason,
      });
    }
  }

  if (normalizedResultSeason && !bySeason.has(normalizedResultSeason) && activeLeague) {
    bySeason.set(normalizedResultSeason, {
      season: normalizedResultSeason,
      leagueId: activeLeague.league_id == null ? null : String(activeLeague.league_id),
      leagueName: activeLeague.name ?? (platform === 'espn' ? 'ESPN league' : 'Sleeper league'),
      league: platform === 'sleeper' ? activeLeague : null,
      isResultSeason: true,
    });
  }

  return [...bySeason.values()].sort((left, right) => Number(right.season) - Number(left.season));
}
