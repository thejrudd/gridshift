export const PREDICTION_CONFERENCES = Object.freeze(['AFC', 'NFC']);

export const PREDICTION_DIVISION_ORDER = Object.freeze([
  'AFC East', 'AFC North', 'AFC South', 'AFC West',
  'NFC East', 'NFC North', 'NFC South', 'NFC West',
]);

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

/**
 * Canonical deterministic order for prediction standings and playoff seeding.
 * It intentionally preserves the active playoff picker's compatibility rule:
 * overall wins, losses, then the user-visible team label.
 */
export function comparePredictionTeams(left, right, records = {}) {
  const leftRecord = getPredictionRecord(left, records);
  const rightRecord = getPredictionRecord(right, records);
  return numericRecordValue(rightRecord, 'wins', 'w') - numericRecordValue(leftRecord, 'wins', 'w')
    || numericRecordValue(leftRecord, 'losses', 'l') - numericRecordValue(rightRecord, 'losses', 'l')
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

export function getPredictionPlayoffField(teams = [], records = {}) {
  const knownTeams = (Array.isArray(teams) ? teams : []).filter((team) => getPredictionTeamId(team));
  return Object.fromEntries(PREDICTION_CONFERENCES.map((conference) => {
    const conferenceTeams = knownTeams.filter((team) => getPredictionConference(team) === conference);
    const divisionWinners = [];
    const wildCards = [];

    for (const division of getConferenceDivisions(conferenceTeams, conference)) {
      const sorted = conferenceTeams
        .filter((team) => getPredictionDivision(team) === division)
        .sort((left, right) => comparePredictionTeams(left, right, records));
      if (sorted[0]) divisionWinners.push(sorted[0]);
      wildCards.push(...sorted.slice(1));
    }

    const sortedDivisionWinners = divisionWinners.sort((left, right) => comparePredictionTeams(left, right, records));
    const sortedWildCards = wildCards.sort((left, right) => comparePredictionTeams(left, right, records)).slice(0, 3);
    return [conference, {
      divisionWinners: sortedDivisionWinners,
      wildCards: sortedWildCards,
      seeds: [...sortedDivisionWinners, ...sortedWildCards].slice(0, 7),
    }];
  }));
}

export function getPredictionPlayoffSeeds(teams = [], records = {}) {
  const field = getPredictionPlayoffField(teams, records);
  return Object.fromEntries(PREDICTION_CONFERENCES.map((conference) => [conference, field[conference]?.seeds ?? []]));
}
