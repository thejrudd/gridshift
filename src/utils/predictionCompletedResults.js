// Final NFL results that a mid-season prediction treats as already decided.
// Reads the hydrated prediction schedule (see buildPredictionScheduleModel in
// App.jsx), whose games carry awayGameIndex/homeGameIndex slots and, once the
// scoreboard reports them final, `completed` plus both scores.

const isScore = (value) => typeof value === 'number' && Number.isFinite(value);

// Returns { away, home } results ('W' | 'L' | 'T') for a final game, else null.
export function getCompletedGameOutcome(game) {
  if (game?.completed !== true) return null;
  const { awayScore, homeScore } = game;
  if (!isScore(awayScore) || !isScore(homeScore)) return null;
  if (awayScore === homeScore) return { away: 'T', home: 'T' };
  return awayScore > homeScore ? { away: 'W', home: 'L' } : { away: 'L', home: 'W' };
}

const getTeamId = (value) => {
  if (typeof value === 'string') return value.toUpperCase();
  return value?.id ? String(value.id).toUpperCase() : null;
};

// { [teamId]: { [gameIndex]: 'W' | 'L' | 'T' } } for every final game.
export function buildCompletedGameResults(schedule) {
  const games = schedule?.games ?? (schedule?.weeks ?? []).flatMap((week) => week.games ?? []);
  const results = {};

  for (const game of games) {
    const outcome = getCompletedGameOutcome(game);
    if (!outcome) continue;
    const slots = [
      [getTeamId(game.awayTeam), game.awayGameIndex, outcome.away],
      [getTeamId(game.homeTeam), game.homeGameIndex, outcome.home],
    ];
    for (const [teamId, gameIndex, result] of slots) {
      if (!teamId || !Number.isInteger(gameIndex)) continue;
      results[teamId] = { ...(results[teamId] ?? {}), [gameIndex]: result };
    }
  }

  return results;
}

const FULL_SEASON_GAMES = 17;
const DIVISION_GAMES = 6;
const NON_DIVISION_GAMES = 11;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Final results split into division and non-division games, or null when the
// team has no final games. These are the floor any predicted record must respect.
export function getCompletedRecordBounds(team, teamResults, teams = []) {
  if (!team || !teamResults) return null;
  const divisionByTeam = new Map(teams.map((entry) => [entry.id, entry.division]));
  const bounds = {
    divisionWins: 0, divisionLosses: 0, divisionTies: 0,
    otherWins: 0, otherLosses: 0, otherTies: 0,
  };
  let count = 0;
  for (const [gameIndex, result] of Object.entries(teamResults)) {
    const opponentId = team.opponents?.[Number(gameIndex)];
    const prefix = opponentId && divisionByTeam.get(opponentId) === team.division ? 'division' : 'other';
    const suffix = result === 'W' ? 'Wins' : result === 'L' ? 'Losses' : result === 'T' ? 'Ties' : null;
    if (!suffix) continue;
    bounds[`${prefix}${suffix}`] += 1;
    count += 1;
  }
  return count ? bounds : null;
}

export function buildCompletedRecordBoundsByTeam(teams = [], completedResults = {}) {
  return Object.fromEntries(teams.flatMap((team) => {
    const bounds = getCompletedRecordBounds(team, completedResults[team.id], teams);
    return bounds ? [[team.id, bounds]] : [];
  }));
}

// Allowed ranges for a full-season record given final results. Ties are fixed
// at the final tie count when the entry mode has no ties control.
export function getCompletedRecordRanges(bounds, { wins = 0, ties = 0, allowTies = true } = {}) {
  const finalWins = (bounds?.divisionWins ?? 0) + (bounds?.otherWins ?? 0);
  const finalLosses = (bounds?.divisionLosses ?? 0) + (bounds?.otherLosses ?? 0);
  const finalTies = (bounds?.divisionTies ?? 0) + (bounds?.otherTies ?? 0);
  const tieRange = allowTies
    ? { min: finalTies, max: FULL_SEASON_GAMES - finalWins - finalLosses }
    : { min: finalTies, max: finalTies };
  const safeTies = clamp(ties, tieRange.min, tieRange.max);
  const winRange = { min: finalWins, max: FULL_SEASON_GAMES - safeTies - finalLosses };
  const safeWins = clamp(wins, winRange.min, winRange.max);
  const divisionRange = {
    min: Math.max(
      bounds?.divisionWins ?? 0,
      safeWins - (NON_DIVISION_GAMES - (bounds?.otherLosses ?? 0) - (bounds?.otherTies ?? 0)),
      0,
    ),
    max: Math.min(
      DIVISION_GAMES - (bounds?.divisionLosses ?? 0) - (bounds?.divisionTies ?? 0),
      safeWins - (bounds?.otherWins ?? 0),
    ),
  };
  return { ties: tieRange, wins: winRange, divisionWins: divisionRange };
}

// Pulls a predicted record back inside what the final results allow.
export function clampRecordToCompletedResults(record, bounds, { allowTies = true } = {}) {
  if (!bounds || !record) return record;
  const ranges = getCompletedRecordRanges(bounds, {
    wins: Number(record.wins) || 0,
    ties: Number(record.ties) || 0,
    allowTies,
  });
  const ties = clamp(Number(record.ties) || 0, ranges.ties.min, ranges.ties.max);
  const wins = clamp(Number(record.wins) || 0, ranges.wins.min, ranges.wins.max);
  const divisionWins = clamp(
    Number(record.divisionWins ?? ranges.divisionWins.min) || 0,
    ranges.divisionWins.min,
    ranges.divisionWins.max,
  );
  return { ...record, wins, losses: FULL_SEASON_GAMES - wins - ties, ties, divisionWins };
}
