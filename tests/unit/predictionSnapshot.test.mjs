import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYOFF_MATCHUP_IDS,
  PredictionSnapshotError,
  buildCanonicalGamePicks,
  createPredictionSnapshot,
  createScheduleFingerprint,
  deriveRecordsFromGamePicks,
  generateRandomPlayoffPicks,
  getCreatablePredictionSeasons,
  getCanonicalScheduleGameIds,
  materializePredictionsFromSnapshot,
  getCurrentPredictionSeason,
  validatePlayoffPicks,
  validatePredictionCompletion,
  validatePredictionSnapshot,
} from '../../src/utils/predictionSnapshot.js';

function buildTeams() {
  return ['AFC', 'NFC'].flatMap((conference) => (
    ['East', 'North', 'South', 'West'].flatMap((division, divisionIndex) => (
      Array.from({ length: 4 }, (_, teamIndex) => ({
        id: `${conference[0]}${divisionIndex}${teamIndex}`,
        name: `${conference} ${division} ${teamIndex}`,
        conference,
        division: `${conference} ${division}`,
      }))
    ))
  ));
}

function buildBalancedRecords(teams) {
  const templates = [
    { wins: 11, losses: 6, ties: 0, divisionWins: 5 },
    { wins: 10, losses: 7, ties: 0, divisionWins: 4 },
    { wins: 7, losses: 10, ties: 0, divisionWins: 2 },
    { wins: 6, losses: 11, ties: 0, divisionWins: 1 },
  ];
  return Object.fromEntries(teams.map((team, index) => [team.id, { ...templates[index % 4] }]));
}

function sortByRecord(teams, records) {
  return [...teams].sort((left, right) => (
    records[right.id].wins - records[left.id].wins
      || records[left.id].losses - records[right.id].losses
      || left.name.localeCompare(right.name)
  ));
}

function getSeeds(teams, records, conference) {
  const conferenceTeams = teams.filter((team) => team.conference === conference);
  const divisions = [...new Set(conferenceTeams.map((team) => team.division))];
  const divisionWinners = [];
  const wildCards = [];
  for (const division of divisions) {
    const sorted = sortByRecord(conferenceTeams.filter((team) => team.division === division), records);
    divisionWinners.push(sorted[0]);
    wildCards.push(...sorted.slice(1));
  }
  return [...sortByRecord(divisionWinners, records), ...sortByRecord(wildCards, records).slice(0, 3)];
}

function buildPlayoffPicks(teams, records) {
  const picks = {};
  for (const conference of ['AFC', 'NFC']) {
    const seeds = getSeeds(teams, records, conference);
    picks[`${conference}-wc-2-7`] = seeds[1].id;
    picks[`${conference}-wc-3-6`] = seeds[2].id;
    picks[`${conference}-wc-4-5`] = seeds[3].id;
    picks[`${conference}-div-1`] = seeds[0].id;
    picks[`${conference}-div-2`] = seeds[1].id;
    picks[`${conference}-championship`] = seeds[0].id;
  }
  picks['super-bowl'] = picks['AFC-championship'];
  return picks;
}

function buildSchedule(teams, season = 2026) {
  const rotating = teams.map((team) => team.id);
  const counters = new Map(teams.map((team) => [team.id, 0]));
  const games = [];
  for (let round = 0; round < 17; round += 1) {
    for (let pair = 0; pair < rotating.length / 2; pair += 1) {
      const awayTeam = rotating[pair];
      const homeTeam = rotating[rotating.length - 1 - pair];
      const awayGameIndex = counters.get(awayTeam);
      const homeGameIndex = counters.get(homeTeam);
      counters.set(awayTeam, awayGameIndex + 1);
      counters.set(homeTeam, homeGameIndex + 1);
      games.push({
        id: `${season}-R${round + 1}-G${pair + 1}`,
        week: (round % 18) + 1,
        awayTeam,
        homeTeam,
        awayGameIndex,
        homeGameIndex,
      });
    }
    rotating.splice(1, 0, rotating.pop());
  }
  return { season, games };
}

function manager() {
  return { userId: '123', username: 'gridshift-user', displayName: 'GridShift User' };
}

test('prediction seasons roll over in March and allow only current/upcoming creation', () => {
  assert.equal(getCurrentPredictionSeason(new Date('2027-02-28T12:00:00Z')), 2026);
  assert.equal(getCurrentPredictionSeason(new Date('2027-03-01T12:00:00Z')), 2027);
  assert.deepEqual(getCreatablePredictionSeasons(new Date('2026-08-25T12:00:00Z')), [2026, 2027]);
});

test('record snapshots require balanced records and all 13 legal playoff picks', () => {
  const teams = buildTeams();
  const records = buildBalancedRecords(teams);
  const playoffPicks = buildPlayoffPicks(teams, records);
  const schedule = { season: 2026, games: [] };

  const snapshot = createPredictionSnapshot({
    season: 2026,
    pickWeek: 7,
    createdAt: '2026-10-15T12:00:00Z',
    mode: 'record',
    schedule,
    manager: manager(),
    records,
    playoffPicks,
    teams,
    now: new Date('2026-08-25T12:00:00Z'),
  });

  assert.equal(snapshot.schema, 'gridshift.prediction-snapshot');
  assert.equal(snapshot.version, 1);
  assert.equal(Object.keys(snapshot.records).length, 32);
  assert.deepEqual(Object.keys(snapshot.playoffPicks).sort(), [...PLAYOFF_MATCHUP_IDS].sort());
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.records), true);
  assert.throws(() => { snapshot.records.A00.wins = 0; }, TypeError);

  const validation = validatePredictionSnapshot(snapshot, {
    teams,
    schedule,
    now: new Date('2026-08-25T12:00:00Z'),
    enforceSeasonPolicy: true,
  });
  assert.deepEqual(validation, { valid: true, errors: [] });
});

test('record completion rejects partial, unbalanced, and division-inconsistent records', () => {
  const teams = buildTeams();
  const records = buildBalancedRecords(teams);
  delete records.A00;
  let validation = validatePredictionCompletion({ records, teams, mode: 'record' });
  assert.equal(validation.isComplete, false);
  assert.match(validation.errors.join('\n'), /exactly 32 teams/i);

  const unbalanced = buildBalancedRecords(teams);
  unbalanced.A00 = { ...unbalanced.A00, wins: 12, losses: 5 };
  validation = validatePredictionCompletion({ records: unbalanced, teams, mode: 'record' });
  assert.equal(validation.isComplete, false);
  assert.match(validation.errors.join('\n'), /wins and losses must balance/i);

  const divisionInconsistent = buildBalancedRecords(teams);
  divisionInconsistent.A00 = { ...divisionInconsistent.A00, divisionWins: 4 };
  validation = validatePredictionCompletion({ records: divisionInconsistent, teams, mode: 'record' });
  assert.equal(validation.isComplete, false);
  assert.match(validation.errors.join('\n'), /supported by predicted ties/i);
});

test('record completion accepts balanced ties and division-win deficits supported by them', () => {
  const teams = buildTeams();
  const records = buildBalancedRecords(teams);
  records.A00 = { wins: 10, losses: 6, ties: 1, divisionWins: 4 };
  records.A01 = { wins: 10, losses: 6, ties: 1, divisionWins: 4 };
  records.A02 = { wins: 6, losses: 10, ties: 1, divisionWins: 1 };
  records.A03 = { wins: 6, losses: 10, ties: 1, divisionWins: 1 };

  const validation = validatePredictionCompletion({ records, teams, mode: 'record' });
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.isComplete, true);
});

test('record completion accepts one tied division game with an odd division-win deficit', () => {
  const teams = buildTeams();
  const records = buildBalancedRecords(teams);
  records.A00 = { wins: 10, losses: 6, ties: 1, divisionWins: 4 };
  records.A01 = { wins: 10, losses: 6, ties: 1, divisionWins: 4 };

  const validation = validatePredictionCompletion({ records, teams, mode: 'record' });
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.isComplete, true);
});

test('playoff completion rejects a missing or impossible winner', () => {
  const teams = buildTeams();
  const records = buildBalancedRecords(teams);
  const missing = buildPlayoffPicks(teams, records);
  delete missing['super-bowl'];
  let validation = validatePlayoffPicks({ playoffPicks: missing, records, teams });
  assert.equal(validation.isComplete, false);
  assert.match(validation.errors.join('\n'), /all 13|Missing playoff pick: super-bowl/i);

  const impossible = buildPlayoffPicks(teams, records);
  impossible['AFC-wc-2-7'] = 'N00';
  validation = validatePlayoffPicks({ playoffPicks: impossible, records, teams });
  assert.equal(validation.isComplete, false);
  assert.match(validation.errors.join('\n'), /winner is not in that matchup/i);
});

test('random playoff generation fills all 13 legal matchups', () => {
  const teams = buildTeams();
  const records = buildBalancedRecords(teams);
  const picks = generateRandomPlayoffPicks({ teams, records, random: () => 0 });

  assert.deepEqual(Object.keys(picks).sort(), [...PLAYOFF_MATCHUP_IDS].sort());
  assert.equal(validatePlayoffPicks({ playoffPicks: picks, records, teams }).isComplete, true);
});

test('random playoff generation reseeds a seven seed against the one seed after upsets', () => {
  const teams = buildTeams();
  const records = buildBalancedRecords(teams);
  const picks = generateRandomPlayoffPicks({ teams, records, random: () => 0.99 });
  const afcSeeds = getSeeds(teams, records, 'AFC');
  const nfcSeeds = getSeeds(teams, records, 'NFC');

  assert.equal(picks['AFC-wc-2-7'], afcSeeds[6].id);
  assert.equal(picks['AFC-div-1'], afcSeeds[6].id);
  assert.equal(picks['NFC-wc-2-7'], nfcSeeds[6].id);
  assert.equal(picks['NFC-div-1'], nfcSeeds[6].id);
  assert.equal(validatePlayoffPicks({ playoffPicks: picks, records, teams }).isComplete, true);
});

test('advanced snapshots canonicalize each game once and verify records against all 272 picks', () => {
  const teams = buildTeams();
  const schedule = buildSchedule(teams);
  const gamePicks = Object.fromEntries(schedule.games.map((game, index) => [
    game.id,
    index % 2 === 0 ? game.homeTeam : game.awayTeam,
  ]));
  const records = deriveRecordsFromGamePicks({ gamePicks, schedule, teams });
  const playoffPicks = buildPlayoffPicks(teams, records);
  const snapshot = createPredictionSnapshot({
    season: 2026,
    pickWeek: 1,
    mode: 'advanced',
    schedule,
    manager: manager(),
    records,
    gamePicks,
    playoffPicks,
    teams,
    now: new Date('2026-08-25T12:00:00Z'),
  });

  assert.equal(Object.keys(snapshot.gamePicks).length, 272);
  const materialized = materializePredictionsFromSnapshot(snapshot, { schedule, teams });
  assert.equal(Object.keys(materialized[teams[0].id].gameResults).length, 17);
  assert.deepEqual(buildCanonicalGamePicks({ predictions: materialized, schedule }), snapshot.gamePicks);
  assert.equal(validatePredictionSnapshot(snapshot, { teams, schedule }).valid, true);

  const changed = structuredClone(snapshot);
  changed.records[teams[0].id].wins += 1;
  changed.records[teams[0].id].losses -= 1;
  const validation = validatePredictionSnapshot(changed, { teams, schedule });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /does not match its advanced game picks/i);
});

test('canonical game picks detect mirrored conflicts and schedule fingerprints are stable', () => {
  const teams = buildTeams();
  const schedule = buildSchedule(teams);
  const first = schedule.games[0];
  const predictions = {
    [first.awayTeam]: { gameResults: { [first.awayGameIndex]: 'W' } },
    [first.homeTeam]: { gameResults: { [first.homeGameIndex]: 'W' } },
  };
  assert.throws(
    () => buildCanonicalGamePicks({ predictions, schedule }),
    (error) => error instanceof PredictionSnapshotError && /conflicting/i.test(error.errors.join('\n')),
  );
  assert.equal(createScheduleFingerprint(schedule), createScheduleFingerprint(structuredClone(schedule)));
  assert.equal(getCanonicalScheduleGameIds(schedule).length, 272);
  assert.equal(getCanonicalScheduleGameIds(schedule)[0], schedule.games[0].id);
  const changed = structuredClone(schedule);
  changed.games[0].homeTeam = teams[2].id;
  assert.notEqual(createScheduleFingerprint(schedule), createScheduleFingerprint(changed));
});

test('creation rejects past seasons while validation can retain historical snapshots for grading', () => {
  const teams = buildTeams();
  const records = buildBalancedRecords(teams);
  const playoffPicks = buildPlayoffPicks(teams, records);
  assert.throws(
    () => createPredictionSnapshot({
      season: 2025,
      pickWeek: 18,
      mode: 'record',
      schedule: { season: 2025, games: [] },
      manager: manager(),
      records,
      playoffPicks,
      teams,
      now: new Date('2026-08-25T12:00:00Z'),
    }),
    PredictionSnapshotError,
  );

  const current = createPredictionSnapshot({
    season: 2026,
    pickWeek: 18,
    mode: 'record',
    schedule: { season: 2026, games: [] },
    manager: manager(),
    records,
    playoffPicks,
    teams,
    now: new Date('2026-08-25T12:00:00Z'),
  });
  const historical = { ...structuredClone(current), season: 2025 };
  assert.equal(validatePredictionSnapshot(historical, { teams }).valid, true);
  assert.equal(validatePredictionSnapshot(historical, {
    teams,
    now: new Date('2026-08-25T12:00:00Z'),
    enforceSeasonPolicy: true,
  }).valid, false);
});

test('creation rejects a supported year when the loaded schedule belongs to another season', () => {
  const now = new Date('2026-08-25T12:00:00Z');
  const teams = buildTeams();
  const records = buildBalancedRecords(teams);
  assert.throws(() => createPredictionSnapshot({
    season: 2027,
    pickWeek: 1,
    mode: 'record',
    schedule: { season: 2026, games: [] },
    manager: manager(),
    records,
    playoffPicks: buildPlayoffPicks(teams, records),
    teams,
    now,
  }), /incomplete or invalid/);
});
