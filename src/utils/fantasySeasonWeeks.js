// Resolves the last NFL week a connected fantasy league actually plays a
// matchup in. Fantasy views must never score or display weeks past this
// boundary — a 17-week league has no week 18 matchup, so week 18 NFL
// production is not fantasy production for that league.

function positiveInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
}

function getNflSeasonWeekCount(league) {
  const season = Number(league?.season);
  return Number.isFinite(season) && season < 2021 ? 17 : 18;
}

// Sleeper reports the bracket size rather than a round count. Byes still
// consume a round, so the round count is the bracket depth for the seeded
// field (6 teams -> 3 rounds, the same as an 8-team bracket).
function getPlayoffRoundCount(settings) {
  const teams = positiveInteger(settings?.playoff_teams);
  if (!teams || teams < 2) return null;
  const rounds = Math.ceil(Math.log2(teams));

  // playoff_round_type: 0 = one week per round, 1 = two-week championship,
  // 2 = two weeks per round.
  const roundType = Number(settings?.playoff_round_type);
  if (roundType === 2) return rounds * 2;
  if (roundType === 1) return rounds + 1;
  return rounds;
}

function getPlayoffEndWeek(settings) {
  const playoffStart = positiveInteger(settings?.playoff_week_start);
  if (!playoffStart) return null;
  const rounds = getPlayoffRoundCount(settings);
  return rounds ? playoffStart + rounds - 1 : playoffStart;
}

export function getFantasyLeagueMaxWeek(league) {
  const seasonWeekCount = getNflSeasonWeekCount(league);
  if (!league) return seasonWeekCount;

  const settings = league.settings ?? {};
  // ESPN leagues carry an explicit matchup period count derived from the
  // league schedule; Sleeper leagues are derived from the playoff bracket.
  const explicit = positiveInteger(settings.matchup_periods) ?? getPlayoffEndWeek(settings);
  if (!explicit) return seasonWeekCount;

  return Math.min(explicit, seasonWeekCount);
}

export default getFantasyLeagueMaxWeek;
