import { getStrengthOfSchedule } from './scheduleParser.js';

export const PREDICTION_CONFERENCES = Object.freeze(['AFC', 'NFC']);

export const PREDICTION_DIVISION_ORDER = Object.freeze([
  'AFC East', 'AFC North', 'AFC South', 'AFC West',
  'NFC East', 'NFC North', 'NFC South', 'NFC West',
]);

const PREDICTION_TEAM_GAMES = 17;

export function getPredictionTeamId(value) {
  return String(typeof value === 'object' ? value?.id ?? '' : value ?? '').trim().toUpperCase();
}

function getPredictionConference(team) {
  const value = String(team?.conference ?? team?.conf ?? team?.division ?? '').trim().toUpperCase();
  if (value.startsWith('AFC')) return 'AFC';
  if (value.startsWith('NFC')) return 'NFC';
  return '';
}

function getPredictionDivision(team) {
  const division = String(team?.division ?? '').trim();
  if (!division) return '';
  if (/^(AFC|NFC)\s/i.test(division)) return division;
  const conference = getPredictionConference(team);
  return conference ? `${conference} ${division}` : division;
}

function getPredictionRecord(team, records = {}) {
  const id = getPredictionTeamId(team);
  return team?.record ?? records[id] ?? records[id.toLowerCase()] ?? {};
}

function getPredictionTeamLabel(team) {
  return String(team?.nickname || team?.name || getPredictionTeamId(team));
}

function numericRecordValue(record, primary, compact) {
  const value = Number(record?.[primary] ?? record?.[compact] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function getRecordByTeamId(records, teamId) {
  const normalizedId = getPredictionTeamId(teamId);
  return records?.[normalizedId] ?? records?.[normalizedId.toLowerCase()] ?? null;
}

function isCompletePredictionRecord(record) {
  if (!record) return false;
  const wins = Number(record.wins ?? record.w ?? 0);
  const losses = Number(record.losses ?? record.l ?? 0);
  const ties = Number(record.ties ?? record.t ?? 0);
  return [wins, losses, ties].every(Number.isInteger)
    && wins >= 0
    && losses >= 0
    && ties >= 0
    && wins + losses + ties === PREDICTION_TEAM_GAMES;
}

function getCompleteProjectedStrengthOfSchedule(team, records, allTeams) {
  const teamsForSOS = Array.isArray(allTeams) && allTeams.length ? allTeams : [team].filter(Boolean);
  if (!isCompletePredictionRecord(getPredictionRecord(team, records))) return null;
  const scheduleTeam = teamsForSOS.find((candidate) => (
    getPredictionTeamId(candidate) === getPredictionTeamId(team)
  ));
  if (!Array.isArray(scheduleTeam?.opponents) || !scheduleTeam.opponents.length) return null;

  const opponentRecordsComplete = scheduleTeam.opponents.every((opponentId) => (
    isCompletePredictionRecord(getRecordByTeamId(records, opponentId))
  ));
  if (!opponentRecordsComplete) return null;

  const sos = getStrengthOfSchedule(team.id, teamsForSOS, records ?? {});
  if (!sos || sos.predictedOpponents !== sos.totalOpponents) return null;
  return sos.avgOppWins;
}

function compareProjectedStrengthOfSchedule(left, right, records, allTeams) {
  const leftSOS = getCompleteProjectedStrengthOfSchedule(left, records, allTeams);
  const rightSOS = getCompleteProjectedStrengthOfSchedule(right, records, allTeams);
  if (leftSOS == null || rightSOS == null || Math.abs(rightSOS - leftSOS) <= 0.001) return 0;
  return rightSOS - leftSOS;
}

/**
 * Canonical deterministic order for prediction standings and playoff seeding.
 * It compares overall record first, then division record for teams in the same
 * division, projected SOS when all opponent records are complete, and finally
 * the user-visible team label and team ID.
 */
export function comparePredictionTeams(left, right, records = {}, allTeams = null) {
  const leftRecord = getPredictionRecord(left, records);
  const rightRecord = getPredictionRecord(right, records);
  return numericRecordValue(rightRecord, 'wins', 'w') - numericRecordValue(leftRecord, 'wins', 'w')
    || numericRecordValue(leftRecord, 'losses', 'l') - numericRecordValue(rightRecord, 'losses', 'l')
    || (getPredictionDivision(left) && getPredictionDivision(left) === getPredictionDivision(right)
      ? numericRecordValue(rightRecord, 'divisionWins', 'division_wins')
        - numericRecordValue(leftRecord, 'divisionWins', 'division_wins')
      : 0)
    || compareProjectedStrengthOfSchedule(left, right, records, allTeams)
    || getPredictionTeamLabel(left).localeCompare(getPredictionTeamLabel(right))
    || getPredictionTeamId(left).localeCompare(getPredictionTeamId(right));
}

function getConferenceDivisions(teams, conference) {
  const found = [...new Set(teams
    .filter((team) => getPredictionConference(team) === conference)
    .map(getPredictionDivision)
    .filter(Boolean))];
  return found.sort((left, right) => {
    const leftIndex = PREDICTION_DIVISION_ORDER.indexOf(left);
    const rightIndex = PREDICTION_DIVISION_ORDER.indexOf(right);
    if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex;
    if (leftIndex >= 0) return -1;
    if (rightIndex >= 0) return 1;
    return left.localeCompare(right);
  });
}

export function getPredictionPlayoffField(teams = [], records = {}, allTeams = teams) {
  const knownTeams = (Array.isArray(teams) ? teams : []).filter((team) => getPredictionTeamId(team));
  return Object.fromEntries(PREDICTION_CONFERENCES.map((conference) => {
    const conferenceTeams = knownTeams.filter((team) => getPredictionConference(team) === conference);
    const divisionWinners = [];
    const wildCards = [];

    for (const division of getConferenceDivisions(conferenceTeams, conference)) {
      const sorted = conferenceTeams
        .filter((team) => getPredictionDivision(team) === division)
        .sort((left, right) => comparePredictionTeams(left, right, records, allTeams));
      if (sorted[0]) divisionWinners.push(sorted[0]);
      wildCards.push(...sorted.slice(1));
    }

    const sortedDivisionWinners = divisionWinners.sort((left, right) => comparePredictionTeams(left, right, records, allTeams));
    const sortedWildCards = wildCards.sort((left, right) => comparePredictionTeams(left, right, records, allTeams)).slice(0, 3);
    return [conference, {
      divisionWinners: sortedDivisionWinners,
      wildCards: sortedWildCards,
      seeds: [...sortedDivisionWinners, ...sortedWildCards].slice(0, 7),
    }];
  }));
}

export function getPredictionPlayoffSeeds(teams = [], records = {}, allTeams = teams) {
  const field = getPredictionPlayoffField(teams, records, allTeams);
  return Object.fromEntries(PREDICTION_CONFERENCES.map((conference) => [conference, field[conference]?.seeds ?? []]));
}
