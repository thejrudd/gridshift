const FULL_SEASON_GAME_COUNT = 17;
const REGULAR_SEASON_GAME_COUNT = 272;
const VALID_RESULTS = new Set(['W', 'L', 'T']);

function getTeamGameCount(team) {
  return Math.max(team?.opponents?.length || 0, team?.schedule?.length || 0, FULL_SEASON_GAME_COUNT);
}

function getRecordState(record, teamGameCount) {
  if (!record) return { complete: false, invalid: false, wins: 0, losses: 0, ties: 0 };
  const wins = Number(record.wins);
  const losses = Number(record.losses);
  const ties = Number(record.ties ?? 0);
  const valuesAreValid = [wins, losses, ties].every(value => Number.isInteger(value) && value >= 0);
  const total = valuesAreValid ? wins + losses + ties : 0;
  return {
    complete: valuesAreValid && total === teamGameCount,
    invalid: !valuesAreValid || total > teamGameCount,
    wins: Number.isInteger(wins) && wins >= 0 ? wins : 0,
    losses: Number.isInteger(losses) && losses >= 0 ? losses : 0,
    ties: Number.isInteger(ties) && ties >= 0 ? ties : 0,
  };
}

function countExplicitResults(record, teamGameCount) {
  return Object.entries(record?.gameResults ?? {}).reduce((count, [slot, result]) => {
    const index = Number(slot);
    return Number.isInteger(index) && index >= 0 && index < teamGameCount && VALID_RESULTS.has(result)
      ? count + 1
      : count;
  }, 0);
}

export function getPredictionProgressSummary({ teams = [], predictions = {}, gameCounts = {}, mode = 'record' } = {}) {
  if (mode === 'advanced') {
    const completedTeams = teams.reduce((count, team) => {
      const teamGameCount = getTeamGameCount(team);
      return count + (countExplicitResults(predictions?.[team.id], teamGameCount) === teamGameCount ? 1 : 0);
    }, 0);
    const totalGames = Math.max(0, Math.trunc(Number(gameCounts.totalGames) || (teams.length ? REGULAR_SEASON_GAME_COUNT : 0)));
    const pickedGames = Math.min(totalGames, Math.max(0, Math.trunc(Number(gameCounts.pickedGames) || 0)));
    return {
      mode: 'advanced', completedTeams, totalTeams: teams.length, pickedGames, totalGames,
      primary: { label: 'Teams', value: completedTeams, total: teams.length, status: completedTeams === teams.length && teams.length ? 'complete' : 'incomplete' },
      secondary: { label: 'Games', value: pickedGames, total: totalGames, status: pickedGames === totalGames && totalGames ? 'complete' : 'incomplete' },
    };
  }

  const recordStates = teams.map(team => getRecordState(predictions?.[team.id], getTeamGameCount(team)));
  const completedRecords = recordStates.filter(state => state.complete).length;
  const leagueWins = recordStates.reduce((sum, state) => sum + state.wins, 0);
  const leagueLosses = recordStates.reduce((sum, state) => sum + state.losses, 0);
  const leagueTies = recordStates.reduce((sum, state) => sum + state.ties, 0);
  const targetLeagueWins = REGULAR_SEASON_GAME_COUNT - (leagueTies / 2);
  const hasInvalidRecord = recordStates.some(state => state.invalid);
  const allRecordsComplete = teams.length > 0 && completedRecords === teams.length;
  const leagueIsBalanced = leagueWins === leagueLosses && leagueTies % 2 === 0;
  const leagueWinsStatus = leagueWins > targetLeagueWins
    ? 'excess'
    : hasInvalidRecord || (allRecordsComplete && !leagueIsBalanced)
      ? 'invalid'
      : allRecordsComplete && leagueIsBalanced ? 'complete' : 'incomplete';

  return {
    mode: 'record', completedTeams: completedRecords, totalTeams: teams.length,
    pickedGames: leagueWins, totalGames: targetLeagueWins,
    primary: { label: 'Records', value: completedRecords, total: teams.length, status: hasInvalidRecord ? 'invalid' : allRecordsComplete ? 'complete' : 'incomplete' },
    secondary: { label: 'League wins', value: leagueWins, total: targetLeagueWins, status: leagueWinsStatus },
  };
}
