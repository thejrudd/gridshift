// Load the schedule data from the JSON file
export const loadScheduleData = async () => {
  const response = await fetch('/nfl-data-2026.json');
  const data = await response.json();
  return data;
};

// Get a team by ID
export const getTeamById = (teams, teamId) => {
  return teams.find(team => team.id === teamId);
};

// Get teams by division
export const getTeamsByDivision = (teams, division) => {
  return teams.filter(team => team.division === division);
};

// Get all division names
export const getAllDivisions = () => {
  return [
    'AFC East',
    'AFC North',
    'AFC South',
    'AFC West',
    'NFC East',
    'NFC North',
    'NFC South',
    'NFC West'
  ];
};

// Get opponent details for a team (returns full team objects instead of just IDs)
export const getOpponentDetails = (teams, team) => {
  return team.opponents.map(oppId => getTeamById(teams, oppId));
};

// Get teams by conference
export const getTeamsByConference = (teams, conference) => {
  return teams.filter(team => team.conference === conference);
};

// Find the corresponding game index in an opponent's schedule
// e.g., BUF's 1st game vs MIA → MIA's 1st game vs BUF
export const findCorrespondingGameIndex = (teams, teamId, gameIndex, opponentId) => {
  const teamA = teams.find(t => t.id === teamId);
  const teamB = teams.find(t => t.id === opponentId);
  if (!teamA || !teamB) return -1;

  // Count which occurrence of opponentId this is in teamA's schedule
  let occurrence = 0;
  for (let i = 0; i <= gameIndex; i++) {
    if (teamA.opponents[i] === opponentId) occurrence++;
  }

  // Find the same occurrence of teamId in teamB's schedule
  let count = 0;
  for (let i = 0; i < teamB.opponents.length; i++) {
    if (teamB.opponents[i] === teamId) {
      count++;
      if (count === occurrence) return i;
    }
  }
  return -1;
};

// Compute strength of schedule: average opponent predicted wins
export const getStrengthOfSchedule = (teamId, teams, predictions) => {
  const team = teams.find(t => t.id === teamId);
  if (!team) return null;

  let totalOppWins = 0;
  let predictedOpponents = 0;

  for (const oppId of team.opponents) {
    const oppRecord = predictions[oppId];
    if (oppRecord) {
      totalOppWins += oppRecord.wins;
      predictedOpponents++;
    }
  }

  if (predictedOpponents === 0) return null;
  return {
    totalOppWins,
    predictedOpponents,
    totalOpponents: team.opponents.length,
    avgOppWins: totalOppWins / predictedOpponents,
  };
};

// Compute conference record from game results
// Includes both the team's own saved gameResults and synced results from opponents
export const getConferenceRecord = (teamId, teams, predictions) => {
  const team = teams.find(t => t.id === teamId);
  if (!team) return null;

  const teamRecord = predictions[teamId];
  const savedResults = teamRecord?.gameResults || {};

  // Build full game results including on-the-fly sync from opponents
  const fullResults = { ...savedResults };
  for (let i = 0; i < team.opponents.length; i++) {
    if (fullResults[i]) continue;
    const oppId = team.opponents[i];
    const oppRecord = predictions[oppId];
    if (!oppRecord?.gameResults) continue;
    const correspondingIdx = findCorrespondingGameIndex(teams, teamId, i, oppId);
    if (correspondingIdx === -1) continue;
    const oppResult = oppRecord.gameResults[correspondingIdx];
    if (oppResult === 'W') fullResults[i] = 'L';
    else if (oppResult === 'L') fullResults[i] = 'W';
    else if (oppResult === 'T') fullResults[i] = 'T';
  }

  let confWins = 0, confLosses = 0, confTies = 0, confGames = 0;

  for (let i = 0; i < team.opponents.length; i++) {
    const oppId = team.opponents[i];
    const opp = teams.find(t => t.id === oppId);
    if (!opp || opp.conference !== team.conference) continue;
    const result = fullResults[i];
    if (!result) continue;
    confGames++;
    if (result === 'W') confWins++;
    else if (result === 'L') confLosses++;
    else if (result === 'T') confTies++;
  }

  if (confGames === 0) return null;

  // Count total conference games on schedule
  const totalConfGames = team.opponents.filter(oppId => {
    const opp = teams.find(t => t.id === oppId);
    return opp && opp.conference === team.conference;
  }).length;

  return { wins: confWins, losses: confLosses, ties: confTies, games: confGames, totalGames: totalConfGames };
};

// Sort teams by wins (for standings), with division record and SOS as tiebreakers
export const sortTeamsByRecord = (teams, predictions, allTeams) => {
  return [...teams].sort((a, b) => {
    const aWins = predictions[a.id]?.wins || 0;
    const bWins = predictions[b.id]?.wins || 0;

    // Sort by overall wins descending
    if (bWins !== aWins) {
      return bWins - aWins;
    }

    // If overall wins are tied, sort by division wins descending
    const aDivisionWins = predictions[a.id]?.divisionWins || 0;
    const bDivisionWins = predictions[b.id]?.divisionWins || 0;

    if (bDivisionWins !== aDivisionWins) {
      return bDivisionWins - aDivisionWins;
    }

    // If still tied, sort by strength of schedule (higher = harder schedule = better tiebreak)
    const teamsForSOS = allTeams || teams;
    const aSOS = getStrengthOfSchedule(a.id, teamsForSOS, predictions);
    const bSOS = getStrengthOfSchedule(b.id, teamsForSOS, predictions);
    const aAvg = aSOS?.avgOppWins || 0;
    const bAvg = bSOS?.avgOppWins || 0;
    if (Math.abs(bAvg - aAvg) > 0.001) {
      return bAvg - aAvg;
    }

    // If still tied, sort alphabetically
    return a.name.localeCompare(b.name);
  });
};
