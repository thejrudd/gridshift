import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSeasonSchedule } from '../../src/utils/seasonSchedule.js';
import {
  buildHolidayScheduleRows,
  buildInternationalScheduleRows,
  buildPrimeTimeScheduleRows,
  buildTeamScheduleRows,
  filterTeamScheduleRows,
  getDefaultScheduleWeek,
  getHolidayLabelForScheduleGame,
  getScheduleGameScore,
  isInternationalScheduleGame,
  isFinalScheduleGame,
  isPrimeTimeScheduleGame,
  scheduleGameMatchesFilter,
} from '../../src/utils/statisticsSchedule.js';

const makeSchedule = (weeks) => ({
  season: 2026,
  weeks,
});

test('default schedule week is null for an empty schedule', () => {
  const schedule = makeSchedule([
    { week: 1, games: [] },
    { week: 2, games: [] },
  ]);

  assert.equal(getDefaultScheduleWeek(schedule, '2026-08-01T12:00:00Z'), null);
});

test('default schedule week uses the first populated week before the season', () => {
  const schedule = makeSchedule([
    { week: 1, games: [{ id: 'w1', awayTeam: 'DAL', homeTeam: 'PHI', kickoff: '2026-09-10T00:20:00Z' }] },
    { week: 2, games: [{ id: 'w2', awayTeam: 'DAL', homeTeam: 'NYG', kickoff: '2026-09-17T00:15:00Z' }] },
  ]);

  assert.equal(getDefaultScheduleWeek(schedule, '2026-08-15T12:00:00Z'), 1);
});

test('default schedule week stays on the current week until the following week kickoff', () => {
  const schedule = makeSchedule([
    { week: 1, games: [{ id: 'w1', awayTeam: 'DAL', homeTeam: 'PHI', kickoff: '2026-09-10T00:20:00Z' }] },
    { week: 2, games: [{ id: 'w2', awayTeam: 'DAL', homeTeam: 'NYG', kickoff: '2026-09-17T00:15:00Z' }] },
  ]);

  assert.equal(getDefaultScheduleWeek(schedule, '2026-09-16T20:00:00Z'), 1);
  assert.equal(getDefaultScheduleWeek(schedule, '2026-09-17T00:15:00Z'), 2);
});

test('default schedule week uses the last populated week after the season', () => {
  const schedule = makeSchedule([
    { week: 1, games: [{ id: 'w1', awayTeam: 'DAL', homeTeam: 'PHI', kickoff: '2026-09-10T00:20:00Z' }] },
    { week: 18, games: [{ id: 'w18', awayTeam: 'DAL', homeTeam: 'WSH', kickoff: '2027-01-04T01:20:00Z' }] },
  ]);

  assert.equal(getDefaultScheduleWeek(schedule, '2027-02-01T12:00:00Z'), 18);
});

test('team schedule rows include visible bye weeks', () => {
  const schedule = makeSchedule([
    { week: 1, games: [{ id: 'w1', awayTeam: 'DAL', homeTeam: 'PHI', kickoff: '2026-09-10T00:20:00Z' }] },
    { week: 2, games: [{ id: 'w2', awayTeam: 'KC', homeTeam: 'BUF', kickoff: '2026-09-17T00:15:00Z' }] },
    { week: 3, games: [{ id: 'w3', awayTeam: 'NYG', homeTeam: 'DAL', kickoff: '2026-09-24T00:15:00Z' }] },
  ]);

  const rows = buildTeamScheduleRows(schedule, 'DAL');

  assert.equal(rows.length, 3);
  assert.equal(rows[0].isBye, false);
  assert.equal(rows[0].opponentTeamId, 'PHI');
  assert.equal(rows[1].isBye, true);
  assert.equal(rows[2].isBye, false);
  assert.equal(rows[2].opponentTeamId, 'NYG');
});

test('international schedule detection ignores U.S. neutral-site games', () => {
  assert.equal(isInternationalScheduleGame({
    neutralSite: true,
    location: 'Camping World Stadium, Orlando, FL, USA',
  }), false);

  assert.equal(isInternationalScheduleGame({
    neutralSite: true,
    location: 'Tottenham Hotspur Stadium, London, England',
  }), true);

  assert.equal(isInternationalScheduleGame({
    neutralSite: true,
    location: 'Tom Benson Hall of Fame Stadium',
  }), false);

  assert.equal(isInternationalScheduleGame({
    neutralSite: true,
    location: 'Allianz Arena, Munich, BY, Germany',
    venueCountry: 'Germany',
  }), true);
});

test('international schedule rows include only non-U.S. venues in kickoff order', () => {
  const schedule = makeSchedule([
    { week: 1, games: [{ id: 'aus', awayTeam: 'SF', homeTeam: 'LAR', kickoff: '2026-09-11T00:35:00Z', location: 'Melbourne Cricket Ground, Melbourne, VIC, Australia', neutralSite: true }] },
    { week: 2, games: [{ id: 'usa-neutral', awayTeam: 'DAL', homeTeam: 'PHI', kickoff: '2026-09-18T00:20:00Z', location: 'Camping World Stadium, Orlando, FL, USA', neutralSite: true }] },
    { week: 3, games: [{ id: 'eng', awayTeam: 'IND', homeTeam: 'WSH', kickoff: '2026-09-27T13:30:00Z', location: 'Tottenham Hotspur Stadium, London, England', neutralSite: true }] },
  ]);

  const rows = buildInternationalScheduleRows(schedule);

  assert.deepEqual(rows.map((row) => row.id), ['aus', 'eng']);
  assert.deepEqual(rows.map((row) => row.week), [1, 3]);
});

test('prime time schedule detection uses Eastern evening kickoffs', () => {
  assert.equal(isPrimeTimeScheduleGame({
    kickoff: '2026-09-14T00:20:00Z',
  }), true);

  assert.equal(isPrimeTimeScheduleGame({
    kickoff: '2026-10-04T13:30:00Z',
  }), false);

  assert.equal(isPrimeTimeScheduleGame({ kickoff: null }), false);
});

test('preseason games are never classified as prime time', () => {
  assert.equal(isPrimeTimeScheduleGame({
    phase: 'preseason',
    kickoff: '2026-08-14T00:00:00Z',
    isNationalBroadcast: true,
  }), false);

  assert.equal(isPrimeTimeScheduleGame({
    phase: 'preseason',
    kickoff: '2026-08-14T00:00:00Z',
    isNationalBroadcast: false,
  }), false);
});

test('prime time schedule rows include only evening games in kickoff order', () => {
  const schedule = makeSchedule([
    {
      week: 1,
      games: [
        { id: 'afternoon', awayTeam: 'DAL', homeTeam: 'PHI', kickoff: '2026-09-13T17:00:00Z' },
        { id: 'night', awayTeam: 'BAL', homeTeam: 'KC', kickoff: '2026-09-14T00:20:00Z' },
        { id: 'morning-international', awayTeam: 'IND', homeTeam: 'WSH', kickoff: '2026-10-04T13:30:00Z', location: 'Tottenham Hotspur Stadium, London, England', neutralSite: true },
      ],
    },
  ]);

  const rows = buildPrimeTimeScheduleRows(schedule);

  assert.deepEqual(rows.map((row) => row.id), ['night']);
});

test('holiday labels use the Eastern calendar date', () => {
  assert.equal(getHolidayLabelForScheduleGame({ kickoff: '2026-11-26T17:30:00Z' }), 'Thanksgiving');
  assert.equal(getHolidayLabelForScheduleGame({ kickoff: '2026-11-27T20:00:00Z' }), 'Black Friday');
  assert.equal(getHolidayLabelForScheduleGame({ kickoff: '2026-12-25T01:15:00Z' }), 'Christmas Eve');
  assert.equal(getHolidayLabelForScheduleGame({ kickoff: '2026-12-25T18:00:00Z' }), 'Christmas Day');
  assert.equal(getHolidayLabelForScheduleGame({ kickoff: '2027-01-01T18:00:00Z' }), "New Year's Day");
  assert.equal(getHolidayLabelForScheduleGame({ kickoff: '2026-09-13T17:00:00Z' }), null);
});

test('holiday schedule rows include tagged holiday games only', () => {
  const schedule = makeSchedule([
    {
      week: 12,
      games: [
        { id: 'thanksgiving', awayTeam: 'CHI', homeTeam: 'DET', kickoff: '2026-11-26T17:30:00Z' },
        { id: 'black-friday', awayTeam: 'DEN', homeTeam: 'PIT', kickoff: '2026-11-27T20:00:00Z' },
        { id: 'regular', awayTeam: 'DAL', homeTeam: 'PHI', kickoff: '2026-11-29T18:00:00Z' },
      ],
    },
    {
      week: 16,
      games: [
        { id: 'christmas-eve', awayTeam: 'HOU', homeTeam: 'PHI', kickoff: '2026-12-25T01:15:00Z' },
        { id: 'christmas-day', awayTeam: 'GB', homeTeam: 'CHI', kickoff: '2026-12-25T18:00:00Z' },
      ],
    },
  ]);

  const rows = buildHolidayScheduleRows(schedule);

  assert.deepEqual(rows.map((row) => row.id), ['thanksgiving', 'black-friday', 'christmas-eve', 'christmas-day']);
  assert.deepEqual(rows.map((row) => row.holidayLabel), ['Thanksgiving', 'Black Friday', 'Christmas Eve', 'Christmas Day']);
});

test('schedule filters classify games by special slate', () => {
  const internationalGame = {
    id: 'london',
    kickoff: '2026-10-04T13:30:00Z',
    location: 'Tottenham Hotspur Stadium, London, England',
  };
  const primeTimeGame = {
    id: 'night',
    kickoff: '2026-09-14T00:20:00Z',
    location: 'Arrowhead Stadium, Kansas City, MO, USA',
  };
  const holidayGame = {
    id: 'thanksgiving',
    kickoff: '2026-11-26T17:30:00Z',
    location: 'Ford Field, Detroit, MI, USA',
  };

  assert.equal(scheduleGameMatchesFilter(internationalGame, 'international'), true);
  assert.equal(scheduleGameMatchesFilter(internationalGame, 'primetime'), false);
  assert.equal(scheduleGameMatchesFilter(primeTimeGame, 'primetime'), true);
  assert.equal(scheduleGameMatchesFilter(holidayGame, 'holiday'), true);
  assert.equal(scheduleGameMatchesFilter(holidayGame, 'all'), true);
});

test('team schedule filters remove bye rows and keep matching games', () => {
  const schedule = makeSchedule([
    { week: 1, games: [{ id: 'regular', awayTeam: 'DAL', homeTeam: 'PHI', kickoff: '2026-09-13T17:00:00Z', location: 'Lincoln Financial Field, Philadelphia, PA, USA' }] },
    { week: 2, games: [{ id: 'other', awayTeam: 'KC', homeTeam: 'BUF', kickoff: '2026-09-17T00:15:00Z', location: 'Highmark Stadium, Orchard Park, NY, USA' }] },
    { week: 3, games: [{ id: 'night', awayTeam: 'NYG', homeTeam: 'DAL', kickoff: '2026-09-24T00:15:00Z', location: 'AT&T Stadium, Arlington, TX, USA' }] },
  ]);

  const rows = buildTeamScheduleRows(schedule, 'DAL');
  const filteredRows = filterTeamScheduleRows(rows, 'primetime');

  assert.deepEqual(rows.map((row) => row.isBye), [false, true, false]);
  assert.deepEqual(filteredRows.map((row) => row.id), ['night']);
});

test('season schedule normalization preserves broadcaster logos', () => {
  const schedule = normalizeSeasonSchedule({
    season: 2026,
    weeks: {
      1: [{
        awayTeam: 'DAL',
        homeTeam: 'PHI',
        network: 'NBC',
        broadcasts: [{
          name: 'NBC',
          logo: 'https://example.test/nbc.png',
          darkLogo: 'https://example.test/nbc-dark.png',
        }],
      }],
    },
  });

  assert.deepEqual(schedule.games[0].broadcasts, [{
    name: 'NBC',
    logo: 'https://example.test/nbc.png',
    darkLogo: 'https://example.test/nbc-dark.png',
  }]);
});

test('season schedule normalization preserves game result metadata', () => {
  const schedule = normalizeSeasonSchedule({
    season: 2026,
    weeks: {
      1: [{
        id: 'finished',
        espnEventId: '401872656',
        awayTeam: 'BUF',
        homeTeam: 'KC',
        status: 'STATUS_FINAL',
        statusDetail: 'Final',
        awayScore: '27',
        homeScore: 24,
      }],
    },
  });

  const game = schedule.games[0];

  assert.equal(game.espnEventId, '401872656');
  assert.equal(isFinalScheduleGame(game), true);
  assert.equal(getScheduleGameScore(game, 'away'), 27);
  assert.equal(getScheduleGameScore(game, 'home'), 24);
});
