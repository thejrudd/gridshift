// Check if a record is valid (wins + losses = 17)
export const isValidRecord = (wins, losses) => {
  return wins + losses === 17 && wins >= 0 && wins <= 17 && losses >= 0 && losses <= 17;
};

// Validate all predictions and return warnings
export const validateAllPredictions = (predictions, teams) => {
  const warnings = [];

  // Check each team has valid record
  Object.entries(predictions).forEach(([teamId, record]) => {
    if (!isValidRecord(record.wins, record.losses)) {
      const team = teams.find(t => t.id === teamId);
      warnings.push(`${team?.name || teamId}: Invalid record (must total 17 games)`);
    }
  });

  return warnings;
};

// Get completion percentage
export const getCompletionPercentage = (predictionCount, totalTeams) => {
  return Math.round((predictionCount / totalTeams) * 100);
};

// Check if all teams have predictions
export const isComplete = (predictionCount, totalTeams) => {
  return predictionCount === totalTeams;
};

// Validate that total wins equals total losses (mathematically consistent)
export const validateTotalWinsLosses = (predictions) => {
  const totalWins = Object.values(predictions).reduce((sum, record) => sum + record.wins, 0);
  const totalLosses = Object.values(predictions).reduce((sum, record) => sum + record.losses, 0);

  const TOTAL_GAMES = 272; // 32 teams × 17 games / 2

  return {
    isValid: totalWins === totalLosses && totalWins === TOTAL_GAMES,
    totalWins,
    totalLosses,
    expectedTotal: TOTAL_GAMES,
    difference: totalWins - totalLosses
  };
};

// Validate division records (each division must have exactly 12 total wins)
export const validateDivisionRecords = (predictions, teams) => {
  const divisions = [
    'AFC East', 'AFC North', 'AFC South', 'AFC West',
    'NFC East', 'NFC North', 'NFC South', 'NFC West'
  ];

  const errors = [];

  divisions.forEach(division => {
    const divisionTeams = teams.filter(team => team.division === division);
    const totalDivisionWins = divisionTeams.reduce((sum, team) => {
      const record = predictions[team.id];
      return sum + (record?.divisionWins || 0);
    }, 0);

    // Each division: 4 teams × 6 games = 24 games / 2 = 12 total wins
    const EXPECTED_DIVISION_WINS = 12;

    if (totalDivisionWins !== EXPECTED_DIVISION_WINS) {
      errors.push({
        division,
        totalWins: totalDivisionWins,
        expected: EXPECTED_DIVISION_WINS,
        difference: totalDivisionWins - EXPECTED_DIVISION_WINS
      });
    }
  });

  return {
    isValid: errors.length === 0,
    errors
  };
};
