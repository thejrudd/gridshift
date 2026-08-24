import { getAllDivisions, getTeamsByDivision, sortTeamsByRecord, getTeamsByConference, getStrengthOfSchedule } from './scheduleParser';

// Returns the team(s) with most wins and most losses
export const getBestAndWorstTeams = (predictions, teams) => {
  const predicted = teams.filter(t => predictions[t.id]);
  if (predicted.length === 0) return { best: null, worst: null };

  const sorted = sortTeamsByRecord(predicted, predictions, teams);
  return {
    best: sorted[0],
    worst: sorted[sorted.length - 1],
  };
};

// Returns the division with the highest combined wins
export const getToughestDivision = (predictions, teams) => {
  const divisions = getAllDivisions();
  let best = null;
  let bestWins = -1;

  for (const division of divisions) {
    const divTeams = getTeamsByDivision(teams, division);
    const allPredicted = divTeams.every(t => predictions[t.id]);
    if (!allPredicted) continue;

    const totalWins = divTeams.reduce((sum, t) => sum + (predictions[t.id]?.wins || 0), 0);
    if (totalWins > bestWins) {
      bestWins = totalWins;
      best = { division, totalWins, teams: divTeams };
    }
  }

  return best;
};

// Returns teams with notably high or low win totals
export const getBoldPredictions = (predictions, teams) => {
  const highFlyers = []; // 12+ wins
  const cellarDwellers = []; // 4 or fewer wins

  for (const team of teams) {
    const record = predictions[team.id];
    if (!record) continue;
    if (record.wins >= 12) highFlyers.push(team);
    if (record.wins <= 4) cellarDwellers.push(team);
  }

  // Sort high flyers by wins descending, cellar dwellers by wins ascending
  highFlyers.sort((a, b) => (predictions[b.id]?.wins || 0) - (predictions[a.id]?.wins || 0));
  cellarDwellers.sort((a, b) => (predictions[a.id]?.wins || 0) - (predictions[b.id]?.wins || 0));

  return { highFlyers, cellarDwellers };
};

// Returns the best team from each conference
export const getConferenceChampions = (predictions, teams) => {
  const result = {};

  for (const conference of ['AFC', 'NFC']) {
    const confTeams = getTeamsByConference(teams, conference).filter(t => predictions[t.id]);
    if (confTeams.length === 0) continue;
    const sorted = sortTeamsByRecord(confTeams, predictions, teams);
    result[conference] = sorted[0];
  }

  return result;
};

// Returns division winners for a conference (replicates PlayoffSeeding logic)
export const getDivisionWinners = (predictions, teams, conference) => {
  const divisions = getAllDivisions().filter(d => d.startsWith(conference));
  const winners = [];

  for (const division of divisions) {
    const divTeams = getTeamsByDivision(teams, division);
    const allPredicted = divTeams.every(t => predictions[t.id]);
    if (!allPredicted) continue;

    const sorted = sortTeamsByRecord(divTeams, predictions, teams);
    winners.push({ ...sorted[0], division });
  }

  return sortTeamsByRecord(winners, predictions, teams);
};

// Returns the division with the fewest combined wins
export const getWorstDivision = (predictions, teams) => {
  const divisions = getAllDivisions();
  let worst = null;
  let worstWins = Infinity;

  for (const division of divisions) {
    const divTeams = getTeamsByDivision(teams, division);
    if (!divTeams.every(t => predictions[t.id])) continue;

    const totalWins = divTeams.reduce((sum, t) => sum + (predictions[t.id]?.wins || 0), 0);
    if (totalWins < worstWins) {
      worstWins = totalWins;
      worst = { division, totalWins, teams: divTeams };
    }
  }

  return worst;
};

// Returns teams with hardest and easiest strength of schedule
export const getStrengthOfScheduleExtremes = (predictions, teams) => {
  const results = [];
  for (const team of teams) {
    if (!predictions[team.id]) continue;
    const sos = getStrengthOfSchedule(team.id, teams, predictions);
    if (sos) results.push({ ...team, sos: sos.avgOppWins });
  }

  if (results.length === 0) return { hardest: null, easiest: null };
  results.sort((a, b) => b.sos - a.sos);

  return {
    hardest: results.slice(0, 3),
    easiest: results.slice(-3).reverse(),
  };
};

// Returns the division with the tightest race (smallest gap between 1st and last)
export const getClosestDivisionRace = (predictions, teams) => {
  const divisions = getAllDivisions();
  let closest = null;
  let smallestGap = Infinity;

  for (const division of divisions) {
    const divTeams = getTeamsByDivision(teams, division);
    if (!divTeams.every(t => predictions[t.id])) continue;

    const wins = divTeams.map(t => predictions[t.id]?.wins || 0);
    const gap = Math.max(...wins) - Math.min(...wins);
    if (gap < smallestGap) {
      smallestGap = gap;
      const sorted = sortTeamsByRecord(divTeams, predictions, teams);
      closest = { division, gap, teams: sorted };
    }
  }

  return closest;
};

// Returns wild card teams (non-division-winners in playoff spots, seeds 5-7)
export const getWildCardTeams = (predictions, teams) => {
  const result = {};
  for (const conference of ['AFC', 'NFC']) {
    const divWinnerIds = new Set();
    const confDivisions = getAllDivisions().filter(d => d.startsWith(conference));

    for (const division of confDivisions) {
      const divTeams = getTeamsByDivision(teams, division);
      if (!divTeams.every(t => predictions[t.id])) continue;
      const sorted = sortTeamsByRecord(divTeams, predictions, teams);
      divWinnerIds.add(sorted[0].id);
    }

    const confTeams = getTeamsByConference(teams, conference).filter(
      t => predictions[t.id] && !divWinnerIds.has(t.id)
    );
    const sorted = sortTeamsByRecord(confTeams, predictions, teams);
    result[conference] = sorted.slice(0, 3);
  }

  return result;
};

// Returns count of teams near .500 (7-10 wins) and teams at extremes
export const getParityIndex = (predictions, teams) => {
  let near500 = 0;
  let total = 0;

  for (const team of teams) {
    if (!predictions[team.id]) continue;
    total++;
    const wins = predictions[team.id].wins;
    if (wins >= 7 && wins <= 10) near500++;
  }

  if (total === 0) return null;
  return { near500, total, percentage: Math.round((near500 / total) * 100) };
};
