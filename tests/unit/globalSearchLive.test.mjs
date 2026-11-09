import test from 'node:test';
import assert from 'node:assert/strict';

import { parseGlobalQuery } from '../../src/utils/globalSearch/parseIntent.js';
import { rankResults } from '../../src/utils/globalSearch/rank.js';
import { buildStaticRecords, composeIndex } from '../../src/utils/globalSearch/buildIndex.js';
import { buildPlayerRecords } from '../../src/utils/globalSearch/entities/players.js';
import { buildLiveAnswer, getLiveRequest } from '../../src/utils/globalSearch/answers/live.js';
import {
  LIVE_STATE_ERROR,
  LIVE_STATE_OFF,
  LIVE_STATE_OK,
  loadLiveWeek,
  resetLiveSourceCache,
} from '../../src/utils/globalSearch/live/liveSource.js';

const SCHEDULE_DATA = {
  season: 2026,
  teams: [
    { id: 'BUF', name: 'Buffalo Bills', city: 'Buffalo', nickname: 'Bills' },
    { id: 'KC', name: 'Kansas City Chiefs', city: 'Kansas City', nickname: 'Chiefs' },
    { id: 'SEA', name: 'Seattle Seahawks', city: 'Seattle', nickname: 'Seahawks' },
    { id: 'WAS', name: 'Washington Commanders', city: 'Washington', nickname: 'Commanders' },
    { id: 'DAL', name: 'Dallas Cowboys', city: 'Dallas', nickname: 'Cowboys' },
  ],
};

const SEASON_SCHEDULE = {
  season: 2026,
  weeks: {
    10: [
      { id: 'g1', espnEventId: '901', week: 10, awayTeam: 'KC', homeTeam: 'BUF', kickoff: '2026-11-15T18:00:00Z' },
      { id: 'g2', espnEventId: '902', week: 10, awayTeam: 'WAS', homeTeam: 'DAL', kickoff: '2026-11-15T21:25:00Z' },
    ],
  },
};

const PLAYERS = {
  p1: { full_name: 'Marcus Vane', team: 'KC', position: 'WR', search_rank: 3, active: true },
};

const index = composeIndex({
  staticRecords: buildStaticRecords({ scheduleData: SCHEDULE_DATA, seasonSchedule: SEASON_SCHEDULE }),
  playerRecords: buildPlayerRecords(PLAYERS),
});

const TEAM_NAMES = Object.fromEntries(SCHEDULE_DATA.teams.map((team) => [team.id, team.name]));

// Normalized scoreboard games, as liveSource returns them. Washington arrives
// under the provider's own code, WSH.
const GAMES = [
  {
    id: 'bdl-2', week: 10, status: 'scheduled', statusLabel: 'Scheduled', dateLabel: 'Sun, Nov 15', kickoffLabel: '4:25 PM',
    kickoff: '2026-11-15T21:25:00Z', awayTeam: 'WSH', homeTeam: 'DAL', awayScore: null, homeScore: null,
  },
  {
    id: 'bdl-1', week: 10, status: 'live', statusLabel: 'Q3 · 4:12', kickoff: '2026-11-15T18:00:00Z',
    awayTeam: 'KC', homeTeam: 'BUF', awayScore: 21, homeScore: 17,
  },
];

const NOW = Date.parse('2026-11-15T20:00:00Z');

function requestFor(query) {
  const slots = parseGlobalQuery(query);
  return getLiveRequest(slots, rankResults(index, slots, { groupLimit: 6 }));
}

test('live requests read a team, a player, or the whole slate', () => {
  assert.deepEqual(requestFor('bills score'), { scope: 'teams', teamIds: ['BUF'] });
  assert.deepEqual(requestFor('live scores'), { scope: 'all' });
  assert.deepEqual(requestFor('chiefs vs bills score').teamIds.sort(), ['BUF', 'KC']);
  assert.deepEqual(requestFor('marcus vane live'), { scope: 'teams', teamIds: ['KC'], playerLabel: 'Marcus Vane' });
});

test('queries that are not live questions make no live request', () => {
  assert.equal(requestFor('bills'), null);
  assert.equal(requestFor('bills schedule'), null);
  assert.equal(requestFor('my live matchup'), null, 'the fantasy matchup is not answered live');
  assert.equal(requestFor('zzqx live'), null, 'an unknown name is not widened to the whole slate');
  // "love" is one edit from "live"; it must stay a name.
  assert.equal(parseGlobalQuery('jordan love').intents.includes('live'), false);
});

test('a team card shows its game, matched across provider team codes', () => {
  const answer = buildLiveAnswer(requestFor('washington score'), GAMES, { index, week: 10, teamNames: TEAM_NAMES, now: NOW });
  assert.equal(answer.kind, 'liveGames');
  assert.equal(answer.title, 'Washington Commanders at Dallas Cowboys');
  assert.equal(answer.games[0].awayId, 'WAS');
  assert.equal(answer.games[0].statusLabel, 'Sun, Nov 15 · 4:25 PM');
  assert.equal(answer.games[0].route.statisticsView, 'schedule', 'an upcoming game opens the schedule');
});

test('a game in progress opens its Scores page', () => {
  const answer = buildLiveAnswer(requestFor('bills score'), GAMES, { index, week: 10, teamNames: TEAM_NAMES, now: NOW });
  const [game] = answer.games;
  assert.equal(game.inProgress, true);
  assert.equal(game.statusLabel, 'Q3 · 4:12');
  assert.equal(game.route.statisticsView, 'scores');
  assert.equal(game.route.statisticsScoresGameId, '901');
});

test('the whole slate leads with games in progress', () => {
  const answer = buildLiveAnswer({ scope: 'all' }, GAMES, { index, week: 10, teamNames: TEAM_NAMES, now: NOW });
  assert.equal(answer.title, 'Live now');
  assert.equal(answer.subtitle, '1 game in progress · Week 10');
  assert.deepEqual(answer.games.map((game) => game.key), ['bdl-1', 'bdl-2']);
});

test('a player card names whose game it is, and a bye says so', () => {
  const player = buildLiveAnswer(requestFor('marcus vane live'), GAMES, { index, week: 10, teamNames: TEAM_NAMES, now: NOW });
  assert.equal(player.subtitle, "Marcus Vane's game · Week 10");

  const bye = buildLiveAnswer(requestFor('seahawks score'), GAMES, { index, week: 10, teamNames: TEAM_NAMES, now: NOW });
  assert.equal(bye.title, 'Seattle Seahawks');
  assert.equal(bye.subtitle, 'No game in week 10');
  assert.deepEqual(bye.games, []);
});

// ── liveSource: the gate and the one request ────────────────────────────────

function stubFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET' });
    for (const [pattern, respond] of routes) {
      if (String(url).includes(pattern)) {
        const { status = 200, body } = respond(calls);
        return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
      }
    }
    throw new Error(`unexpected request ${url}`);
  };
  return calls;
}

const RAW_GAME = {
  id: 1, week: 10, date: '2026-11-15T18:00:00Z', status: '4:12 - 3rd',
  visitor_team: { abbreviation: 'KC' }, home_team: { abbreviation: 'BUF' },
  visitor_team_score: 21, home_team_score: 17,
};

test('with live data off on the server, nothing is fetched beyond the status check', async () => {
  resetLiveSourceCache();
  const calls = stubFetch([
    ['/api/live/status', () => ({ body: { ok: true, live: { enabled: false }, session: { enabled: false } } })],
  ]);
  const result = await loadLiveWeek({ leagueId: 'L1', season: 2026, week: 10 });
  assert.equal(result.state, LIVE_STATE_OFF);
  assert.deepEqual(calls.map((call) => call.url.split('?')[0]), ['/api/live/status']);
});

test('an allowlisted league starts its session the way Fantasy Live does, then reads the week once', async () => {
  resetLiveSourceCache();
  let sessionStarted = false;
  const calls = stubFetch([
    ['/api/live/status', () => ({
      body: { ok: true, live: { enabled: true, leagueAllowed: true, accessCodeRequired: false }, session: { enabled: sessionStarted } },
    })],
    ['/api/live/session', () => { sessionStarted = true; return { body: { ok: true } }; }],
    ['/api/live/games', () => ({ body: { ok: true, data: [RAW_GAME] } })],
  ]);

  const first = await loadLiveWeek({ leagueId: 'L1', season: 2026, week: 10 });
  assert.equal(first.state, LIVE_STATE_OK);
  assert.equal(first.games[0].status, 'live');
  assert.equal(first.games[0].awayScore, 21);
  assert.ok(calls.some((call) => call.url === '/api/live/session' && call.method === 'POST'));

  const before = calls.length;
  await loadLiveWeek({ leagueId: 'L1', season: 2026, week: 10 });
  assert.equal(calls.length, before, 'the same week inside the cache window makes no request');
  assert.ok(calls.every((call) => call.url.startsWith('/api/')), 'every request goes to GridShift itself');
});

test('an access code is never bypassed', async () => {
  resetLiveSourceCache();
  const calls = stubFetch([
    ['/api/live/status', () => ({
      body: { ok: true, live: { enabled: true, leagueAllowed: true, accessCodeRequired: true }, session: { enabled: false } },
    })],
  ]);
  const result = await loadLiveWeek({ leagueId: 'L1', season: 2026, week: 10 });
  assert.equal(result.state, LIVE_STATE_OFF);
  assert.ok(!calls.some((call) => call.url.includes('/session')));
});

test('a failing live server reports an error rather than throwing', async () => {
  resetLiveSourceCache();
  stubFetch([
    ['/api/live/status', () => ({ body: { ok: true, live: { enabled: true }, session: { enabled: true } } })],
    ['/api/live/games', () => ({ status: 502, body: { ok: false, error: 'upstream' } })],
  ]);
  const result = await loadLiveWeek({ leagueId: 'L1', season: 2026, week: 10 });
  assert.equal(result.state, LIVE_STATE_ERROR);
});

test('no league means no live answer and no request', async () => {
  resetLiveSourceCache();
  const calls = stubFetch([]);
  assert.equal((await loadLiveWeek({ leagueId: null, season: 2026, week: 10 })).state, LIVE_STATE_OFF);
  assert.equal(calls.length, 0);
});
