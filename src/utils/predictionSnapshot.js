import { getLowestRemainingSeedTeam } from './playoffBracket.js';

const SNAPSHOT_SCHEMA = 'gridshift.prediction-snapshot';

export const PREDICTION_SNAPSHOT_SCHEMA = SNAPSHOT_SCHEMA;
export const PREDICTION_SNAPSHOT_VERSION = 1;
export const NFL_TEAM_COUNT = 32;
export const NFL_TEAM_GAMES = 17;
export const NFL_REGULAR_SEASON_WEEKS = 18;
export const NFL_REGULAR_SEASON_GAMES = 272;

const PREDICTION_SEASON_START_MONTH = 2; // March, zero-based.
const VALID_MODES = new Set(['record', 'advanced']);
const CONFERENCES = ['AFC', 'NFC'];

export const PLAYOFF_MATCHUP_IDS = Object.freeze([
  'AFC-wc-2-7',
  'AFC-wc-3-6',
  'AFC-wc-4-5',
  'AFC-div-1',
  'AFC-div-2',
  'AFC-championship',
  'NFC-wc-2-7',
  'NFC-wc-3-6',
  'NFC-wc-4-5',
  'NFC-div-1',
  'NFC-div-2',
  'NFC-championship',
  'super-bowl',
]);

const PLAYOFF_MATCHUP_ID_SET = new Set(PLAYOFF_MATCHUP_IDS);

export class PredictionSnapshotError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'PredictionSnapshotError';
    this.errors = errors;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeTeamId(value) {
  if (value == null) return null;
  const normalized = String(typeof value === 'object' ? value.id ?? '' : value).trim().toUpperCase();
  return normalized || null;
}

function normalizeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function normalizeRecord(record) {
  return {
    wins: normalizeInteger(record?.wins),
    losses: normalizeInteger(record?.losses),
    ties: normalizeInteger(record?.ties ?? 0),
    divisionWins: normalizeInteger(record?.divisionWins),
  };
}

function getTeamIdFromGame(game, side) {
  const capitalized = `${side[0].toUpperCase()}${side.slice(1)}`;
  return normalizeTeamId(
    game?.[`${side}Team`]
      ?? game?.[`${side}TeamId`]
      ?? game?.[`${side}Id`]
      ?? game?.[side]
      ?? game?.[capitalized],
  );
}

function getScheduleGames(schedule) {
  if (Array.isArray(schedule?.games)) return schedule.games;
  if (Array.isArray(schedule?.weeks)) {
    return schedule.weeks.flatMap((week) => Array.isArray(week?.games) ? week.games : []);
  }
  return [];
}

function getScheduleGameId(game, index, season) {
  const awayId = getTeamIdFromGame(game, 'away') ?? 'AWAY';
  const homeId = getTeamIdFromGame(game, 'home') ?? 'HOME';
  const week = normalizeInteger(game?.week) ?? 0;
  return String(game?.id ?? game?.gameId ?? game?.espnEventId ?? `${season}-W${week}-${awayId}-${homeId}-${index}`);
}

function getTeamGameIndex(game, side) {
  const explicit = game?.[`${side}GameIndex`] ?? game?.[`${side}Index`];
  return Number.isInteger(explicit) ? explicit : null;
}

function getKnownTeams(teams) {
  const normalized = (Array.isArray(teams) ? teams : [])
    .map((team) => ({ ...team, id: normalizeTeamId(team?.id) }))
    .filter((team) => team.id);
  return {
    teams: normalized,
    teamIds: normalized.map((team) => team.id),
    teamById: new Map(normalized.map((team) => [team.id, team])),
  };
}

function sortTeamsByRecord(teams, records) {
  return [...teams].sort((left, right) => {
    const leftRecord = records[left.id] ?? {};
    const rightRecord = records[right.id] ?? {};
    if (rightRecord.wins !== leftRecord.wins) return rightRecord.wins - leftRecord.wins;
    if (leftRecord.losses !== rightRecord.losses) return leftRecord.losses - rightRecord.losses;
    return String(left.name ?? left.nickname ?? left.id).localeCompare(String(right.name ?? right.nickname ?? right.id));
  });
}

function getPlayoffSeeds(teams, records) {
  return Object.fromEntries(CONFERENCES.map((conference) => {
    const conferenceTeams = teams.filter((team) => team.conference === conference);
    const divisions = [...new Set(conferenceTeams.map((team) => team.division).filter(Boolean))];
    const divisionWinners = [];
    const wildCards = [];

    for (const division of divisions) {
      const sorted = sortTeamsByRecord(conferenceTeams.filter((team) => team.division === division), records);
      if (sorted[0]) divisionWinners.push(sorted[0]);
      wildCards.push(...sorted.slice(1));
    }

    return [conference, [
      ...sortTeamsByRecord(divisionWinners, records),
      ...sortTeamsByRecord(wildCards, records).slice(0, 3),
    ].slice(0, 7)];
  }));
}

function chooseRandomTeam(options, random) {
  if (!Array.isArray(options) || options.length !== 2 || options.some((team) => !team?.id)) {
    throw new PredictionSnapshotError('A complete two-team playoff matchup is required.');
  }
  return options[random() < 0.5 ? 0 : 1];
}

export function generateRandomPlayoffPicks({ teams = [], records = {}, random = Math.random } = {}) {
  if (typeof random !== 'function') throw new TypeError('A random-number function is required.');
  const { teams: normalizedTeams, teamIds } = getKnownTeams(teams);
  const normalizedRecords = cloneRecords(records, teamIds);
  const seedsByConference = getPlayoffSeeds(normalizedTeams, normalizedRecords);
  const picks = {};

  for (const conference of CONFERENCES) {
    const seeds = seedsByConference[conference] ?? [];
    if (seeds.length !== 7) {
      throw new PredictionSnapshotError(`${conference} playoff seeding could not be resolved.`);
    }

    const wildcardMatchups = [
      { id: `${conference}-wc-2-7`, teams: [seeds[1], seeds[6]] },
      { id: `${conference}-wc-3-6`, teams: [seeds[2], seeds[5]] },
      { id: `${conference}-wc-4-5`, teams: [seeds[3], seeds[4]] },
    ];
    const wildcardWinners = wildcardMatchups.map(({ id, teams: matchupTeams }) => {
      const winner = chooseRandomTeam(matchupTeams, random);
      picks[id] = winner.id;
      return winner;
    });

    const lowestRemaining = getLowestRemainingSeedTeam(seeds, wildcardWinners);
    const otherWildcardWinners = wildcardWinners.filter((team) => team.id !== lowestRemaining?.id);
    const firstDivisionalWinner = chooseRandomTeam([seeds[0], lowestRemaining], random);
    const secondDivisionalWinner = chooseRandomTeam(otherWildcardWinners, random);
    picks[`${conference}-div-1`] = firstDivisionalWinner.id;
    picks[`${conference}-div-2`] = secondDivisionalWinner.id;
    picks[`${conference}-championship`] = chooseRandomTeam(
      [firstDivisionalWinner, secondDivisionalWinner],
      random,
    ).id;
  }

  picks['super-bowl'] = chooseRandomTeam(
    CONFERENCES.map((conference) => normalizedTeams.find((team) => team.id === picks[`${conference}-championship`])),
    random,
  ).id;

  const validation = validatePlayoffPicks({ playoffPicks: picks, records: normalizedRecords, teams: normalizedTeams });
  if (!validation.isComplete) {
    throw new PredictionSnapshotError('Random playoff picks could not be completed.', validation.errors);
  }
  return picks;
}

function appendError(errors, condition, message) {
  if (!condition) errors.push(message);
}

function cloneRecords(records, teamIds) {
  return Object.fromEntries(teamIds.map((teamId) => [teamId, normalizeRecord(records?.[teamId])]));
}

export function getCurrentPredictionSeason(date = new Date()) {
  const resolved = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(resolved.getTime())) throw new TypeError('A valid date is required.');
  return resolved.getMonth() >= PREDICTION_SEASON_START_MONTH
    ? resolved.getFullYear()
    : resolved.getFullYear() - 1;
}

export function getCreatablePredictionSeasons(date = new Date()) {
  const current = getCurrentPredictionSeason(date);
  return Object.freeze([current, current + 1]);
}

export function isCreatablePredictionSeason(season, date = new Date()) {
  const normalized = normalizeInteger(season);
  return normalized != null && getCreatablePredictionSeasons(date).includes(normalized);
}

export function getCanonicalScheduleGameIds(schedule = {}) {
  const season = normalizeInteger(schedule?.season) ?? 0;
  return Object.freeze(getScheduleGames(schedule).map((game, index) => getScheduleGameId(game, index, season)));
}

export function createScheduleFingerprint(schedule = {}) {
  const season = normalizeInteger(schedule?.season) ?? 0;
  const games = getScheduleGames(schedule).map((game, index) => [
    getScheduleGameId(game, index, season),
    normalizeInteger(game?.week) ?? 0,
    getTeamIdFromGame(game, 'away'),
    getTeamIdFromGame(game, 'home'),
  ]);
  const source = JSON.stringify([season, games]);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `gs-${season}-${games.length}-${(hash >>> 0).toString(36)}`;
}

export function buildCanonicalGamePicks({ predictions = {}, schedule = {} } = {}) {
  const season = normalizeInteger(schedule?.season) ?? 0;
  const picks = {};
  const errors = [];

  getScheduleGames(schedule).forEach((game, index) => {
    const gameId = getScheduleGameId(game, index, season);
    const awayId = getTeamIdFromGame(game, 'away');
    const homeId = getTeamIdFromGame(game, 'home');
    const awayIndex = getTeamGameIndex(game, 'away');
    const homeIndex = getTeamGameIndex(game, 'home');
    const awayResult = awayId && awayIndex != null ? predictions?.[awayId]?.gameResults?.[awayIndex] : null;
    const homeResult = homeId && homeIndex != null ? predictions?.[homeId]?.gameResults?.[homeIndex] : null;

    if (!awayId || !homeId) {
      errors.push(`Schedule game ${gameId} is missing an away or home team.`);
      return;
    }

    const fromAway = awayResult === 'W' ? awayId : awayResult === 'L' ? homeId : awayResult === 'T' ? 'T' : null;
    const fromHome = homeResult === 'W' ? homeId : homeResult === 'L' ? awayId : homeResult === 'T' ? 'T' : null;
    if (fromAway && fromHome && fromAway !== fromHome) {
      errors.push(`Game ${gameId} has conflicting team results.`);
      return;
    }
    const winner = fromAway ?? fromHome;
    if (winner) picks[gameId] = winner;
  });

  if (errors.length) throw new PredictionSnapshotError('Could not build canonical game picks.', errors);
  return picks;
}

/**
 * Builds the fixed 17-game Advanced Mode schedule used by a single-team
 * record share card. This deliberately validates only the selected team's
 * schedule; the ordinary season-share gate remains independent of whether
 * the rest of the league has game-by-game picks.
 */
export function getTeamAdvancedPredictionStatus({ teamId, predictions = {}, schedule = {}, teams = [] } = {}) {
  const normalizedTeamId = normalizeTeamId(teamId);
  const errors = [];
  if (!normalizedTeamId) {
    return { teamId: null, isComplete: false, completedCount: 0, totalGames: NFL_TEAM_GAMES, remainingCount: NFL_TEAM_GAMES, matchups: [], rows: [], errors: ['A team is required.'] };
  }

  const season = normalizeInteger(schedule?.season) ?? 0;
  const rows = getScheduleGames(schedule).flatMap((game, index) => {
    const awayId = getTeamIdFromGame(game, 'away');
    const homeId = getTeamIdFromGame(game, 'home');
    const isAway = awayId === normalizedTeamId;
    const isHome = homeId === normalizedTeamId;
    if (!isAway && !isHome) return [];

    const gameId = getScheduleGameId(game, index, season);
    const gameIndex = getTeamGameIndex(game, isAway ? 'away' : 'home');
    const result = gameIndex == null ? null : predictions?.[normalizedTeamId]?.gameResults?.[gameIndex];
    if (gameIndex == null) errors.push(`Game ${gameId} is missing ${normalizedTeamId}'s schedule position.`);
    if (!['W', 'L', 'T'].includes(result)) errors.push(`Game ${gameId} is missing a valid ${normalizedTeamId} result.`);

    return [{
      gameId,
      week: normalizeInteger(game?.week),
      teamId: normalizedTeamId,
      opponentId: isAway ? homeId : awayId,
      venue: isAway ? 'away' : 'home',
      gameIndex,
      result: ['W', 'L', 'T'].includes(result) ? result : null,
    }];
  });

  if (rows.length !== NFL_TEAM_GAMES) {
    errors.push(`${normalizedTeamId} must have exactly ${NFL_TEAM_GAMES} scheduled games.`);
  }
  if (new Set(rows.map((row) => row.gameId)).size !== rows.length) {
    errors.push(`${normalizedTeamId}'s schedule contains duplicate games.`);
  }
  if (new Set(rows.map((row) => row.gameIndex).filter(Number.isInteger)).size !== rows.length) {
    errors.push(`${normalizedTeamId}'s schedule positions must be unique.`);
  }

  const selectedTeam = teams.find((team) => normalizeTeamId(team?.id) === normalizedTeamId);
  const teamById = new Map(teams.map((team) => [normalizeTeamId(team?.id), team]));
  const derivedRecord = rows.reduce((record, row) => {
    if (row.result === 'W') {
      record.wins += 1;
      if (selectedTeam?.division && teamById.get(row.opponentId)?.division === selectedTeam.division) {
        record.divisionWins += 1;
      }
    } else if (row.result === 'L') record.losses += 1;
    else if (row.result === 'T') record.ties += 1;
    return record;
  }, { wins: 0, losses: 0, ties: 0, divisionWins: 0 });
  const expectedRecord = normalizeRecord(predictions?.[normalizedTeamId]);
  const canCompareRecord = teams.length > 0
    && ['wins', 'losses', 'ties', 'divisionWins'].every((key) => Number.isInteger(predictions?.[normalizedTeamId]?.[key]));
  const matchesRecord = !canCompareRecord || ['wins', 'losses', 'ties', 'divisionWins']
    .every((key) => derivedRecord[key] === expectedRecord[key]);
  if (rows.length === NFL_TEAM_GAMES && rows.every((row) => row.result) && !matchesRecord) {
    errors.push(`${normalizedTeamId}'s Advanced Mode matchups do not match its predicted record.`);
  }

  const matchups = Object.freeze(rows.map((row) => Object.freeze({
    ...row,
    isAway: row.venue === 'away',
  })));
  const completedCount = rows.filter((row) => row.result != null).length;

  return {
    teamId: normalizedTeamId,
    isComplete: errors.length === 0,
    completedCount,
    totalGames: NFL_TEAM_GAMES,
    remainingCount: Math.max(0, NFL_TEAM_GAMES - completedCount),
    matchesRecord,
    derivedRecord: Object.freeze(derivedRecord),
    matchups,
    rows: matchups,
    errors: [...new Set(errors)],
  };
}

export function getTeamAdvancedShareSchedule(options = {}) {
  return getTeamAdvancedPredictionStatus(options);
}

function isSemanticRecord(record) {
  if (!isPlainObject(record)) return false;
  const normalized = normalizeRecord(record);
  return Object.values(normalized).every(Number.isInteger)
    && normalized.wins >= 0
    && normalized.losses >= 0
    && normalized.ties >= 0
    && normalized.wins + normalized.losses + normalized.ties === NFL_TEAM_GAMES;
}

export function getManualRecordLeagueStatus({ records = {}, teams = [] } = {}) {
  const teamIds = teams.map((team) => normalizeTeamId(team?.id)).filter(Boolean);
  const enteredTeamIds = teamIds.filter((teamId) => Object.hasOwn(records, teamId) && isSemanticRecord(records[teamId]));
  const totalWins = enteredTeamIds.reduce((sum, teamId) => sum + normalizeRecord(records[teamId]).wins, 0);
  const totalLosses = enteredTeamIds.reduce((sum, teamId) => sum + normalizeRecord(records[teamId]).losses, 0);
  const totalTies = enteredTeamIds.reduce((sum, teamId) => sum + normalizeRecord(records[teamId]).ties, 0);
  const targetWins = (teamIds.length * NFL_TEAM_GAMES - totalTies) / 2;
  return {
    isComplete: teamIds.length === NFL_TEAM_COUNT && enteredTeamIds.length === teamIds.length,
    enteredTeamIds,
    enteredCount: enteredTeamIds.length,
    remainingCount: Math.max(0, teamIds.length - enteredTeamIds.length),
    totalWins,
    totalLosses,
    totalTies,
    targetWins,
    winDelta: targetWins - totalWins,
  };
}

export function rebalanceCompleteManualRecords({ records = {}, teams = [], targetTeamId } = {}) {
  const status = getManualRecordLeagueStatus({ records, teams });
  const nextRecords = { ...records };
  const adjustments = [];
  if (!status.isComplete || !Number.isInteger(status.winDelta) || status.winDelta === 0) {
    return { records: nextRecords, adjustments, isBalanced: status.isComplete && status.winDelta === 0, remainingDelta: status.winDelta };
  }

  let remainingDelta = status.winDelta;
  const candidates = teams
    .filter((team) => normalizeTeamId(team?.id) !== normalizeTeamId(targetTeamId))
    .map((team) => {
      const teamId = normalizeTeamId(team?.id);
      const record = normalizeRecord(records[teamId]);
      return {
        teamId,
        originalRecord: record,
        record,
        adjustmentCount: 0,
        minWins: Math.max(0, record.divisionWins),
        maxWins: Math.min(NFL_TEAM_GAMES - record.ties, 11 + record.divisionWins),
      };
    });

  while (remainingDelta !== 0) {
    const direction = remainingDelta > 0 ? 1 : -1;
    const candidate = candidates
      .filter((entry) => direction > 0 ? entry.record.wins < entry.maxWins : entry.record.wins > entry.minWins)
      .sort((left, right) => {
        const leftNextWins = left.record.wins + direction;
        const rightNextWins = right.record.wins + direction;
        return Math.abs(leftNextWins - 8.5) - Math.abs(rightNextWins - 8.5)
          || left.adjustmentCount - right.adjustmentCount
          || left.teamId.localeCompare(right.teamId);
      })[0];
    if (!candidate) break;
    const wins = candidate.record.wins + direction;
    candidate.record = { ...candidate.record, wins, losses: NFL_TEAM_GAMES - wins - candidate.record.ties };
    candidate.adjustmentCount += 1;
    remainingDelta -= direction;
  }

  for (const candidate of candidates.filter((entry) => entry.adjustmentCount > 0)) {
    const { wins, losses } = candidate.record;
    const updated = {
      ...records[candidate.teamId],
      wins,
      losses,
      recordSource: 'manual',
      manualOverride: true,
      manualRecord: { wins, losses, ties: candidate.record.ties, divisionWins: candidate.record.divisionWins },
    };
    nextRecords[candidate.teamId] = updated;
    adjustments.push({ teamId: candidate.teamId, previousRecord: candidate.originalRecord, record: normalizeRecord(updated) });
  }

  return { records: nextRecords, adjustments, isBalanced: remainingDelta === 0, remainingDelta };
}

export function formatManualRecordBalanceNotice({ adjustments = [], teams = [] } = {}) {
  if (!adjustments.length) return '';
  const teamById = new Map(teams.map((team) => [normalizeTeamId(team?.id), team]));
  const affected = adjustments.map(({ teamId, record }) => {
    const team = teamById.get(normalizeTeamId(teamId));
    const label = team?.nickname || team?.name || team?.id || normalizeTeamId(teamId);
    const normalized = normalizeRecord(record);
    const recordLabel = normalized.ties > 0
      ? `${normalized.wins}-${normalized.losses}-${normalized.ties}`
      : `${normalized.wins}-${normalized.losses}`;
    return `${label} to ${recordLabel}`;
  });
  return `League records balanced automatically: ${affected.join(', ')}.`;
}

export function deriveRecordsFromGamePicks({ gamePicks = {}, schedule = {}, teams = [] } = {}) {
  const { teams: normalizedTeams, teamIds, teamById } = getKnownTeams(teams);
  const records = Object.fromEntries(teamIds.map((teamId) => [teamId, {
    wins: 0,
    losses: 0,
    ties: 0,
    divisionWins: 0,
  }]));
  const season = normalizeInteger(schedule?.season) ?? 0;

  getScheduleGames(schedule).forEach((game, index) => {
    const gameId = getScheduleGameId(game, index, season);
    const awayId = getTeamIdFromGame(game, 'away');
    const homeId = getTeamIdFromGame(game, 'home');
    const winner = normalizeTeamId(gamePicks?.[gameId]);
    if (!awayId || !homeId || !winner || !records[awayId] || !records[homeId]) return;
    const divisionGame = teamById.get(awayId)?.division === teamById.get(homeId)?.division;

    if (winner === 'T') {
      records[awayId].ties += 1;
      records[homeId].ties += 1;
    } else if (winner === awayId) {
      records[awayId].wins += 1;
      records[homeId].losses += 1;
      if (divisionGame) records[awayId].divisionWins += 1;
    } else if (winner === homeId) {
      records[homeId].wins += 1;
      records[awayId].losses += 1;
      if (divisionGame) records[homeId].divisionWins += 1;
    }
  });

  return normalizedTeams.length ? records : {};
}

export function materializePredictionsFromSnapshot(snapshot, { schedule = null, teams = [] } = {}) {
  const teamIds = getKnownTeams(teams).teamIds;
  const predictions = Object.fromEntries(teamIds.map((teamId) => {
    const record = normalizeRecord(snapshot?.records?.[teamId]);
    return [teamId, {
      ...record,
      gameResults: {},
      recordSource: snapshot?.mode === 'advanced' ? 'games' : 'manual',
      manualOverride: snapshot?.mode !== 'advanced',
      ...(snapshot?.mode !== 'advanced' ? { manualRecord: record } : {}),
    }];
  }));

  if (snapshot?.mode !== 'advanced') return predictions;
  const counters = Object.fromEntries(teamIds.map((teamId) => [teamId, 0]));
  const season = normalizeInteger(schedule?.season) ?? normalizeInteger(snapshot?.season) ?? 0;
  getScheduleGames(schedule).forEach((game, index) => {
    const awayId = getTeamIdFromGame(game, 'away');
    const homeId = getTeamIdFromGame(game, 'home');
    if (!predictions[awayId] || !predictions[homeId]) return;
    const awayIndex = getTeamGameIndex(game, 'away') ?? counters[awayId];
    const homeIndex = getTeamGameIndex(game, 'home') ?? counters[homeId];
    counters[awayId] += 1;
    counters[homeId] += 1;
    const winnerId = snapshot.gamePicks?.[getScheduleGameId(game, index, season)];
    if (winnerId === 'T') {
      predictions[awayId].gameResults[awayIndex] = 'T';
      predictions[homeId].gameResults[homeIndex] = 'T';
    } else if (winnerId === awayId) {
      predictions[awayId].gameResults[awayIndex] = 'W';
      predictions[homeId].gameResults[homeIndex] = 'L';
    } else if (winnerId === homeId) {
      predictions[awayId].gameResults[awayIndex] = 'L';
      predictions[homeId].gameResults[homeIndex] = 'W';
    }
  });
  return predictions;
}

export function validatePredictionCompletion({
  records = {},
  predictions,
  teams = [],
  mode = 'record',
  gamePicks = {},
  schedule = null,
} = {}) {
  const sourceRecords = predictions ?? records;
  const { teams: normalizedTeams, teamIds } = getKnownTeams(teams);
  const normalizedRecords = cloneRecords(sourceRecords, teamIds);
  const errors = [];

  appendError(errors, VALID_MODES.has(mode), `Unsupported prediction mode: ${String(mode)}.`);
  appendError(errors, normalizedTeams.length === NFL_TEAM_COUNT, `Predictions require exactly ${NFL_TEAM_COUNT} known teams.`);

  const recordKeys = isPlainObject(sourceRecords) ? Object.keys(sourceRecords).map(normalizeTeamId).filter(Boolean) : [];
  appendError(errors, recordKeys.length === NFL_TEAM_COUNT, `Predictions require records for exactly ${NFL_TEAM_COUNT} teams.`);
  const knownTeamIds = new Set(teamIds);
  for (const teamId of recordKeys) {
    if (!knownTeamIds.has(teamId)) errors.push(`Unknown prediction team: ${teamId}.`);
  }

  let totalWins = 0;
  let totalLosses = 0;
  let totalTies = 0;
  for (const teamId of teamIds) {
    const record = normalizedRecords[teamId];
    const valuesAreIntegers = Object.values(record).every(Number.isInteger);
    appendError(errors, valuesAreIntegers, `${teamId} has a non-integer record value.`);
    if (!valuesAreIntegers) continue;
    appendError(errors, record.wins >= 0 && record.losses >= 0 && record.ties >= 0, `${teamId} has a negative record value.`);
    appendError(errors, record.wins + record.losses + record.ties === NFL_TEAM_GAMES, `${teamId} must total ${NFL_TEAM_GAMES} games.`);
    appendError(errors, record.divisionWins >= 0 && record.divisionWins <= 6, `${teamId} has an invalid division-win total.`);
    appendError(errors, record.divisionWins <= record.wins, `${teamId} has more division wins than total wins.`);
    appendError(errors, record.divisionWins >= Math.max(0, record.wins - 11), `${teamId} has too few division wins for its total wins.`);
    totalWins += record.wins;
    totalLosses += record.losses;
    totalTies += record.ties;
  }

  appendError(errors, totalWins === totalLosses, 'League wins and losses must balance.');
  appendError(errors, totalTies % 2 === 0, 'League tie entries must occur in opponent pairs.');

  if (mode === 'record') {
    const divisionNames = [...new Set(normalizedTeams.map((team) => team.division).filter(Boolean))];
    for (const division of divisionNames) {
      const divisionTeams = normalizedTeams.filter((team) => team.division === division);
      const wins = divisionTeams
        .reduce((sum, team) => sum + (normalizedRecords[team.id]?.divisionWins ?? 0), 0);
      const tieEntries = divisionTeams
        .reduce((sum, team) => sum + (normalizedRecords[team.id]?.ties ?? 0), 0);
      appendError(
        errors,
        wins >= 0 && wins <= 12 && (12 - wins) <= Math.floor(tieEntries / 2),
        `${division} division wins must be between 0 and 12 and any deficit from 12 must be supported by predicted ties.`,
      );
    }
  }

  if (mode === 'advanced') {
    const games = getScheduleGames(schedule);
    appendError(errors, games.length === NFL_REGULAR_SEASON_GAMES, `Advanced predictions require exactly ${NFL_REGULAR_SEASON_GAMES} schedule games.`);
    const pickKeys = isPlainObject(gamePicks) ? Object.keys(gamePicks) : [];
    appendError(errors, pickKeys.length === games.length, 'Advanced predictions require one pick for every schedule game.');
    const season = normalizeInteger(schedule?.season) ?? 0;
    const scheduleIds = new Set();
    games.forEach((game, index) => {
      const gameId = getScheduleGameId(game, index, season);
      const awayId = getTeamIdFromGame(game, 'away');
      const homeId = getTeamIdFromGame(game, 'home');
      scheduleIds.add(gameId);
      const winner = normalizeTeamId(gamePicks?.[gameId]);
      appendError(errors, winner === awayId || winner === homeId || winner === 'T', `Game ${gameId} has an invalid or missing pick.`);
    });
    for (const gameId of pickKeys) {
      if (!scheduleIds.has(gameId)) errors.push(`Unknown schedule game pick: ${gameId}.`);
    }

    const derived = deriveRecordsFromGamePicks({ gamePicks, schedule, teams: normalizedTeams });
    for (const teamId of teamIds) {
      const expected = normalizedRecords[teamId];
      const actual = derived[teamId];
      if (!actual || ['wins', 'losses', 'ties', 'divisionWins'].some((key) => actual[key] !== expected[key])) {
        errors.push(`${teamId} record does not match its advanced game picks.`);
      }
    }
  }

  return {
    isComplete: errors.length === 0,
    errors: [...new Set(errors)],
    records: normalizedRecords,
  };
}

export function validatePlayoffPicks({ playoffPicks = {}, records = {}, teams = [] } = {}) {
  const { teams: normalizedTeams, teamIds } = getKnownTeams(teams);
  const errors = [];
  const picks = isPlainObject(playoffPicks) ? playoffPicks : {};
  const pickKeys = Object.keys(picks);
  const knownTeamIds = new Set(teamIds);

  appendError(errors, pickKeys.length === PLAYOFF_MATCHUP_IDS.length, `All ${PLAYOFF_MATCHUP_IDS.length} playoff matchups must be picked.`);
  for (const matchupId of PLAYOFF_MATCHUP_IDS) {
    appendError(errors, normalizeTeamId(picks[matchupId]) != null, `Missing playoff pick: ${matchupId}.`);
  }
  for (const matchupId of pickKeys) {
    if (!PLAYOFF_MATCHUP_ID_SET.has(matchupId)) errors.push(`Unknown playoff matchup: ${matchupId}.`);
    const winnerId = normalizeTeamId(picks[matchupId]);
    if (winnerId && !knownTeamIds.has(winnerId)) errors.push(`Unknown playoff team: ${winnerId}.`);
  }

  if (normalizedTeams.length !== NFL_TEAM_COUNT || errors.length) {
    return { isComplete: false, errors: [...new Set(errors)] };
  }

  const seedsByConference = getPlayoffSeeds(normalizedTeams, records);
  for (const conference of CONFERENCES) {
    const seeds = seedsByConference[conference] ?? [];
    appendError(errors, seeds.length === 7, `${conference} playoff seeding could not be resolved.`);
    const wildcardIds = [`${conference}-wc-2-7`, `${conference}-wc-3-6`, `${conference}-wc-4-5`];
    const wildcardOptions = [[seeds[1], seeds[6]], [seeds[2], seeds[5]], [seeds[3], seeds[4]]];
    wildcardIds.forEach((matchupId, index) => {
      const validIds = wildcardOptions[index].map((team) => team?.id).filter(Boolean);
      appendError(errors, validIds.includes(normalizeTeamId(picks[matchupId])), `${matchupId} winner is not in that matchup.`);
    });

    const wildcardWinners = wildcardIds.map((matchupId) => normalizedTeams.find((team) => team.id === normalizeTeamId(picks[matchupId])));
    const lowestRemaining = getLowestRemainingSeedTeam(seeds, wildcardWinners);
    const otherWildcardWinners = wildcardWinners.filter((team) => team?.id !== lowestRemaining?.id);
    const divisionalOptions = [[seeds[0], lowestRemaining], otherWildcardWinners];
    [`${conference}-div-1`, `${conference}-div-2`].forEach((matchupId, index) => {
      const validIds = divisionalOptions[index].map((team) => team?.id).filter(Boolean);
      appendError(errors, validIds.includes(normalizeTeamId(picks[matchupId])), `${matchupId} winner is not in that matchup.`);
    });

    const championshipId = `${conference}-championship`;
    const championshipOptions = [`${conference}-div-1`, `${conference}-div-2`].map((matchupId) => normalizeTeamId(picks[matchupId]));
    appendError(errors, championshipOptions.includes(normalizeTeamId(picks[championshipId])), `${championshipId} winner is not in that matchup.`);
  }

  const superBowlOptions = CONFERENCES.map((conference) => normalizeTeamId(picks[`${conference}-championship`]));
  appendError(errors, superBowlOptions.includes(normalizeTeamId(picks['super-bowl'])), 'Super Bowl winner is not in that matchup.');

  return { isComplete: errors.length === 0, errors: [...new Set(errors)] };
}

function normalizeManager(manager) {
  return {
    userId: String(manager?.userId ?? manager?.user_id ?? '').trim(),
    username: String(manager?.username ?? '').trim(),
    displayName: String(manager?.displayName ?? manager?.display_name ?? '').trim(),
  };
}

function normalizeCreatedAt(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cloneStringMap(value) {
  if (!isPlainObject(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [String(key), normalizeTeamId(item)]));
}

export function validatePredictionSnapshot(snapshot, {
  teams = [],
  schedule = null,
  now = new Date(),
  enforceSeasonPolicy = false,
} = {}) {
  const errors = [];
  appendError(errors, isPlainObject(snapshot), 'Snapshot must be an object.');
  if (!isPlainObject(snapshot)) return { valid: false, errors };

  appendError(errors, snapshot.schema === SNAPSHOT_SCHEMA, 'Snapshot schema is not supported.');
  appendError(errors, snapshot.version === PREDICTION_SNAPSHOT_VERSION, 'Snapshot version is not supported.');
  appendError(errors, normalizeInteger(snapshot.season) != null, 'Snapshot season must be an integer.');
  if (enforceSeasonPolicy) {
    appendError(errors, isCreatablePredictionSeason(snapshot.season, now), 'Snapshot season must be the current or upcoming season.');
  }
  const pickWeek = normalizeInteger(snapshot.pickWeek);
  appendError(errors, pickWeek != null && pickWeek >= 1 && pickWeek <= NFL_REGULAR_SEASON_WEEKS, `Pick week must be between 1 and ${NFL_REGULAR_SEASON_WEEKS}.`);
  appendError(errors, normalizeCreatedAt(snapshot.createdAt) != null, 'Snapshot creation time is invalid.');
  appendError(errors, VALID_MODES.has(snapshot.mode), `Unsupported prediction mode: ${String(snapshot.mode)}.`);
  appendError(errors, typeof snapshot.scheduleFingerprint === 'string' && snapshot.scheduleFingerprint.trim().length > 0, 'Schedule fingerprint is required.');
  if (schedule) {
    appendError(errors, normalizeInteger(schedule?.season) === normalizeInteger(snapshot.season), 'Snapshot season does not match the active schedule.');
    appendError(errors, snapshot.scheduleFingerprint === createScheduleFingerprint(schedule), 'Snapshot schedule does not match the active schedule.');
  }

  const manager = normalizeManager(snapshot.manager);
  appendError(errors, Boolean(manager.userId), 'Sleeper manager user ID is required.');
  appendError(errors, Boolean(manager.username), 'Sleeper manager username is required.');
  appendError(errors, Boolean(manager.displayName), 'Sleeper manager display name is required.');

  const completion = validatePredictionCompletion({
    records: snapshot.records,
    teams,
    mode: snapshot.mode,
    gamePicks: snapshot.gamePicks,
    schedule,
  });
  errors.push(...completion.errors);
  const playoffs = validatePlayoffPicks({ playoffPicks: snapshot.playoffPicks, records: completion.records, teams });
  errors.push(...playoffs.errors);

  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function createPredictionSnapshot({
  season,
  pickWeek,
  createdAt = new Date(),
  mode = 'record',
  schedule,
  scheduleFingerprint = createScheduleFingerprint(schedule),
  manager,
  records,
  predictions,
  gamePicks,
  playoffPicks,
  teams = [],
  now = new Date(),
} = {}) {
  if (!isCreatablePredictionSeason(season, now)) {
    throw new PredictionSnapshotError('Prediction snapshots can only be created for the current or upcoming season.', [
      `Allowed seasons: ${getCreatablePredictionSeasons(now).join(', ')}.`,
    ]);
  }

  const sourceRecords = predictions ?? records ?? {};
  const canonicalGamePicks = mode === 'advanced'
    ? (gamePicks ?? buildCanonicalGamePicks({ predictions: sourceRecords, schedule }))
    : {};
  const { teamIds } = getKnownTeams(teams);
  const snapshot = {
    schema: SNAPSHOT_SCHEMA,
    version: PREDICTION_SNAPSHOT_VERSION,
    season: normalizeInteger(season),
    pickWeek: normalizeInteger(pickWeek),
    createdAt: normalizeCreatedAt(createdAt),
    mode,
    scheduleFingerprint: String(scheduleFingerprint ?? '').trim(),
    manager: normalizeManager(manager),
    records: cloneRecords(sourceRecords, teamIds),
    gamePicks: cloneStringMap(canonicalGamePicks),
    playoffPicks: cloneStringMap(playoffPicks),
  };

  const validation = validatePredictionSnapshot(snapshot, {
    teams,
    schedule,
    now,
    enforceSeasonPolicy: true,
  });
  if (!validation.valid) {
    throw new PredictionSnapshotError('Prediction snapshot is incomplete or invalid.', validation.errors);
  }

  return deepFreeze(snapshot);
}
