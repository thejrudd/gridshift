import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getStartedScheduleWeeks,
  getUnsettledScheduleWeeks,
  mergeSeasonScheduleResults,
  mergeSeasonScheduleResultsIntoMap,
} from '../../src/utils/seasonScheduleResults.js';

const scoreboard = (events) => ({ events });

const espnEvent = ({ id, away, home, awayScore, homeScore, completed, state = 'post' }) => ({
  id,
  date: '2026-09-10T00:20Z',
  status: { type: { completed, state, name: completed ? 'STATUS_FINAL' : 'STATUS_IN_PROGRESS', shortDetail: completed ? 'Final' : 'Q3 4:12' } },
  competitions: [{
    competitors: [
      { homeAway: 'home', score: String(homeScore), team: { abbreviation: home } },
      { homeAway: 'away', score: String(awayScore), team: { abbreviation: away } },
    ],
  }],
});

const baseSchedule = () => ({
  season: 2026,
  weeks: [
    {
      week: 1,
      games: [
        { id: '2026-W01-NE-SEA', espnEventId: '401872656', week: 1, awayTeam: 'NE', homeTeam: 'SEA', kickoff: '2026-09-10T00:20:00.000Z', status: 'scheduled', completed: false, awayScore: null, homeScore: null },
        { id: '2026-W01-TB-CIN', espnEventId: '401872658', week: 1, awayTeam: 'TB', homeTeam: 'CIN', kickoff: '2026-09-13T17:00:00.000Z', status: 'scheduled', completed: false, awayScore: null, homeScore: null },
      ],
    },
    { week: 2, games: [{ id: '2026-W02-NE-BUF', espnEventId: '401872700', week: 2, awayTeam: 'NE', homeTeam: 'BUF', kickoff: '2026-09-17T00:20:00.000Z', status: 'scheduled', completed: false, awayScore: null, homeScore: null }] },
  ],
});

test('merges final scores into the matching scheduled game', () => {
  const merged = mergeSeasonScheduleResults(baseSchedule(), new Map([
    [1, scoreboard([espnEvent({ id: '401872656', away: 'NE', home: 'SEA', awayScore: 10, homeScore: 13, completed: true })])],
  ]));

  const [game] = merged.weeks[0].games;
  assert.equal(game.completed, true);
  assert.equal(game.status, 'final');
  assert.equal(game.awayScore, 10);
  assert.equal(game.homeScore, 13);
  assert.equal(merged.weeks[0].games[1].completed, false, 'unmatched games keep their scheduled state');
});

test('preserves game identity so the prediction fingerprint is unaffected', () => {
  const schedule = baseSchedule();
  const merged = mergeSeasonScheduleResults(schedule, new Map([
    [1, scoreboard([espnEvent({ id: '401872656', away: 'NE', home: 'SEA', awayScore: 10, homeScore: 13, completed: true })])],
  ]));

  const identity = (s) => s.weeks.flatMap((w) => w.games.map((g) => [g.id, g.week, g.awayTeam, g.homeTeam]));
  assert.deepEqual(identity(merged), identity(schedule));
});

test('falls back to the away@home matchup when the ESPN event id changed', () => {
  const merged = mergeSeasonScheduleResults(baseSchedule(), new Map([
    [1, scoreboard([espnEvent({ id: '999999999', away: 'NE', home: 'SEA', awayScore: 24, homeScore: 21, completed: true })])],
  ]));

  assert.equal(merged.weeks[0].games[0].awayScore, 24);
  assert.equal(merged.weeks[0].games[0].completed, true);
});

test('carries in-progress games without marking them final', () => {
  const merged = mergeSeasonScheduleResults(baseSchedule(), new Map([
    [1, scoreboard([espnEvent({ id: '401872656', away: 'NE', home: 'SEA', awayScore: 7, homeScore: 3, completed: false, state: 'in' })])],
  ]));

  const [game] = merged.weeks[0].games;
  assert.equal(game.status, 'live');
  assert.equal(game.completed, false);
  assert.equal(game.awayScore, 7);
});

test('overlays hydrated game results into the separately cached matchup schedule', () => {
  const scheduleMap = {
    1: {
      CLE: { kickoff: '2026-09-10T00:20:00.000Z', completed: false, opp: 'JAX', home: false },
      JAX: { kickoff: '2026-09-10T00:20:00.000Z', completed: false, opp: 'CLE', home: true },
    },
  };
  const merged = mergeSeasonScheduleResultsIntoMap(scheduleMap, {
    season: 2026,
    weeks: [{
      week: 1,
      games: [{
        awayTeam: 'CLE',
        homeTeam: 'JAX',
        kickoff: '2026-09-10T00:20:00.000Z',
        espnEventId: '401872656',
        status: 'final',
        statusDetail: 'Final',
        completed: true,
        awayScore: 10,
        homeScore: 13,
      }],
    }],
  }, '2026');

  assert.notEqual(merged, scheduleMap);
  assert.equal(merged[1].JAX.completed, true);
  assert.equal(merged[1].JAX.status, 'final');
  assert.equal(merged[1].JAX.ptsFor, 13);
  assert.equal(merged[1].JAX.ptsAgainst, 10);
  assert.equal(merged[1].CLE.completed, true);
  assert.equal(merged[1].CLE.ptsFor, 10);
  assert.equal(merged[1].CLE.ptsAgainst, 13);
});

test('does not overwrite a matchup schedule with an unhydrated scheduled game', () => {
  const scheduleMap = { 1: { JAX: { kickoff: '2026-09-10T00:20:00.000Z', completed: false, opp: 'CLE' } } };
  const schedule = {
    season: 2026,
    weeks: [{
      week: 1,
      games: [{
        awayTeam: 'CLE',
        homeTeam: 'JAX',
        kickoff: '2026-09-10T00:20:00.000Z',
        status: 'scheduled',
        completed: false,
        awayScore: null,
        homeScore: null,
      }],
    }],
  };

  assert.equal(mergeSeasonScheduleResultsIntoMap(scheduleMap, schedule, 2026), scheduleMap);
});

test('returns the identical schedule reference when nothing changed', () => {
  const schedule = baseSchedule();
  assert.equal(mergeSeasonScheduleResults(schedule, new Map()), schedule);
  assert.equal(mergeSeasonScheduleResults(schedule, new Map([[1, scoreboard([])]])), schedule);
});

test('rebuilds derived schedule fields after a merge', () => {
  const merged = mergeSeasonScheduleResults(baseSchedule(), new Map([
    [1, scoreboard([espnEvent({ id: '401872656', away: 'NE', home: 'SEA', awayScore: 10, homeScore: 13, completed: true })])],
  ]));

  assert.equal(merged.games.length, 3);
  assert.equal(merged.metadata.hasSchedule, true);
  assert.equal(merged.gamesByTeam.SEA.length, 1);
  assert.equal(merged.gamesByTeam.NE.length, 2);
});

test('only reports weeks whose first kickoff has passed', () => {
  const now = Date.parse('2026-09-13T09:00:00.000Z');
  assert.deepEqual(getStartedScheduleWeeks(baseSchedule(), now), [1]);
  assert.deepEqual(getStartedScheduleWeeks(baseSchedule(), Date.parse('2026-09-01T00:00:00.000Z')), []);
});

test('reports a started week as unsettled until every game is final', () => {
  const now = Date.parse('2026-09-13T09:00:00.000Z');
  assert.deepEqual(getUnsettledScheduleWeeks(baseSchedule(), now), [1]);

  const settled = baseSchedule();
  settled.weeks[0].games = settled.weeks[0].games.map((game) => ({ ...game, completed: true }));
  assert.deepEqual(getUnsettledScheduleWeeks(settled, now), []);
});
