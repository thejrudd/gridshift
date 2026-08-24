import {
  getScheduleGameScore,
  getScheduleGameTeamId,
  getScheduleWeeks,
  isFinalScheduleGame,
} from './statisticsSchedule.js';

export const CONFERENCE_ORDER = ['AFC', 'NFC'];

export const DIVISION_ORDER = [
  'AFC East',
  'AFC North',
  'AFC South',
  'AFC West',
  'NFC East',
  'NFC North',
  'NFC South',
  'NFC West',
];

function normalizeTeamId(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return normalized || null;
}

function getConference(team = {}) {
  if (team.conference) return team.conference;
  return typeof team.division === 'string' ? team.division.split(' ')[0] : null;
}

function createRecord(team) {
  return {
    team,
    teamId: team.id,
    wins: 0,
    losses: 0,
    ties: 0,
    divisionWins: 0,
    divisionLosses: 0,
    divisionTies: 0,
    conferenceWins: 0,
    conferenceLosses: 0,
    conferenceTies: 0,
    pointsFor: 0,
    pointsAgainst: 0,
  };
}

const RECORD_KEYS = {
  overall: ['wins', 'losses', 'ties'],
  division: ['divisionWins', 'divisionLosses', 'divisionTies'],
  conference: ['conferenceWins', 'conferenceLosses', 'conferenceTies'],
};

function getGamesPlayed(record, scope = 'overall') {
  const [winKey, lossKey, tieKey] = RECORD_KEYS[scope] ?? RECORD_KEYS.overall;
  return (record[winKey] ?? 0) + (record[lossKey] ?? 0) + (record[tieKey] ?? 0);
}

function getWinPct(wins, losses, ties) {
  const games = wins + losses + ties;
  return games > 0 ? (wins + ties * 0.5) / games : 0;
}

function applyOutcome(record, ownScore, opponentScore, scope = 'overall') {
  const [winKey, lossKey, tieKey] = RECORD_KEYS[scope] ?? RECORD_KEYS.overall;

  if (ownScore > opponentScore) {
    record[winKey] += 1;
  } else if (ownScore < opponentScore) {
    record[lossKey] += 1;
  } else {
    record[tieKey] += 1;
  }
}

function addGameToRecord(record, opponent, ownScore, opponentScore) {
  record.pointsFor += ownScore;
  record.pointsAgainst += opponentScore;
  applyOutcome(record, ownScore, opponentScore);

  if (record.team.division && record.team.division === opponent?.division) {
    applyOutcome(record, ownScore, opponentScore, 'division');
  }

  if (getConference(record.team) && getConference(record.team) === getConference(opponent)) {
    applyOutcome(record, ownScore, opponentScore, 'conference');
  }
}

function withDerivedFields(record) {
  const gamesPlayed = getGamesPlayed(record);
  const divisionGames = getGamesPlayed(record, 'division');
  const conferenceGames = getGamesPlayed(record, 'conference');

  return {
    ...record,
    conference: getConference(record.team),
    division: record.team.division ?? 'Unassigned',
    gamesPlayed,
    divisionGames,
    conferenceGames,
    winPct: getWinPct(record.wins, record.losses, record.ties),
    divisionPct: getWinPct(record.divisionWins, record.divisionLosses, record.divisionTies),
    conferencePct: getWinPct(record.conferenceWins, record.conferenceLosses, record.conferenceTies),
    pointDifferential: record.pointsFor - record.pointsAgainst,
  };
}

function compareText(left, right) {
  const leftName = left.team?.name ?? left.teamId ?? '';
  const rightName = right.team?.name ?? right.teamId ?? '';
  return leftName.localeCompare(rightName);
}

export function compareStandingRows(left, right, scope = 'division') {
  const primaryPct = right.winPct - left.winPct;
  if (primaryPct !== 0) return primaryPct;

  const wins = right.wins - left.wins;
  if (wins !== 0) return wins;

  const losses = left.losses - right.losses;
  if (losses !== 0) return losses;

  const firstScopePct = scope === 'conference'
    ? right.conferencePct - left.conferencePct
    : right.divisionPct - left.divisionPct;
  if (firstScopePct !== 0) return firstScopePct;

  const secondScopePct = scope === 'conference'
    ? right.divisionPct - left.divisionPct
    : right.conferencePct - left.conferencePct;
  if (secondScopePct !== 0) return secondScopePct;

  const pointDiff = right.pointDifferential - left.pointDifferential;
  if (pointDiff !== 0) return pointDiff;

  const pointsFor = right.pointsFor - left.pointsFor;
  if (pointsFor !== 0) return pointsFor;

  return compareText(left, right);
}

function withRanks(rows, scope) {
  return [...rows]
    .sort((left, right) => compareStandingRows(left, right, scope))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function groupRows(rows, order, key, scope) {
  const rowsByGroup = rows.reduce((acc, row) => {
    const group = row[key] ?? 'Unassigned';
    acc.set(group, [...(acc.get(group) ?? []), row]);
    return acc;
  }, new Map());

  const orderedGroups = [
    ...order.filter((group) => rowsByGroup.has(group)),
    ...[...rowsByGroup.keys()]
      .filter((group) => !order.includes(group))
      .sort((left, right) => left.localeCompare(right)),
  ];

  return orderedGroups.map((group) => ({
    id: group,
    label: group,
    rows: withRanks(rowsByGroup.get(group) ?? [], scope),
  }));
}

export function buildStatisticsStandings({ teams = [], scheduleData = {} } = {}) {
  const knownTeams = teams
    .filter((team) => normalizeTeamId(team?.id))
    .map((team) => ({ ...team, id: normalizeTeamId(team.id) }));
  const teamsById = new Map(knownTeams.map((team) => [team.id, team]));
  const recordsById = new Map(knownTeams.map((team) => [team.id, createRecord(team)]));
  const weeks = getScheduleWeeks(scheduleData);
  let completedGames = 0;
  let scoredGames = 0;

  for (const week of weeks) {
    for (const game of week.games ?? []) {
      const awayTeamId = getScheduleGameTeamId(game, 'away');
      const homeTeamId = getScheduleGameTeamId(game, 'home');
      const awayTeam = teamsById.get(awayTeamId);
      const homeTeam = teamsById.get(homeTeamId);
      if (!awayTeam || !homeTeam || !isFinalScheduleGame(game)) continue;

      completedGames += 1;
      const awayScore = getScheduleGameScore(game, 'away');
      const homeScore = getScheduleGameScore(game, 'home');
      if (awayScore == null || homeScore == null) continue;

      scoredGames += 1;
      addGameToRecord(recordsById.get(awayTeamId), homeTeam, awayScore, homeScore);
      addGameToRecord(recordsById.get(homeTeamId), awayTeam, homeScore, awayScore);
    }
  }

  const rows = [...recordsById.values()].map(withDerivedFields);

  return {
    rows,
    divisionGroups: groupRows(rows, DIVISION_ORDER, 'division', 'division'),
    conferenceGroups: groupRows(rows, CONFERENCE_ORDER, 'conference', 'conference'),
    completedGames,
    scoredGames,
    scheduledGames: weeks.reduce((sum, week) => sum + (week.games?.length ?? 0), 0),
    season: scheduleData?.season ?? null,
  };
}
