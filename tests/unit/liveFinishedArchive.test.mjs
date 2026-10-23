// Finished games' player stats and finished weeks' game lists are escrowed on
// the server's disk archive, so the provider is asked about a finished game a
// bounded number of times ever, whatever the number of viewers or restarts.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createLivePlaysArchive } from '../../server/livePlaysArchive.js';
import { PLAY_CORRECTION_WINDOW_MS } from '../../server/liveGameSnapshots.js';
import { createLiveRouter } from '../../server/liveHandlers.js';
import { getFinishedPayloadEndedAt } from '../../server/finishedGameArchive.js';

const HOUR = 60 * 60 * 1000;
const KICKOFF = Date.parse('2026-10-18T17:00:00.000Z');
const ENV_KEYS = ['NODE_ENV', 'GRIDSHIFT_BDL_API_KEY', 'GRIDSHIFT_LIVE_ALLOWED_LEAGUE_IDS', 'GRIDSHIFT_SESSION_SECRET', 'GRIDSHIFT_LIVE_COOKIE_SECRET', 'GRIDSHIFT_LIVE_ACCESS_CODE'];
const savedEnv = {};

beforeEach(() => {
  ENV_KEYS.forEach((key) => { savedEnv[key] = process.env[key]; });
  process.env.NODE_ENV = 'test';
  process.env.GRIDSHIFT_BDL_API_KEY = 'test-key';
  process.env.GRIDSHIFT_LIVE_ALLOWED_LEAGUE_IDS = 'league-73';
  process.env.GRIDSHIFT_SESSION_SECRET = 'test-secret';
  delete process.env.GRIDSHIFT_LIVE_COOKIE_SECRET;
  delete process.env.GRIDSHIFT_LIVE_ACCESS_CODE;
});

afterEach(() => {
  ENV_KEYS.forEach((key) => {
    if (savedEnv[key] == null) delete process.env[key];
    else process.env[key] = savedEnv[key];
  });
});

function getRouteHandler(router, routePath, method) {
  return router.stack.find((layer) => layer.route?.path === routePath && layer.route.methods?.[method])
    .route.stack.find((layer) => layer.method === method).handle;
}

async function invoke(router, routePath, method, { body = {}, query = {}, headers = {}, params = {} } = {}) {
  const captured = { statusCode: 200, headers: {}, body: null };
  const response = {
    status(statusCode) { captured.statusCode = statusCode; return this; },
    set(name, value) { captured.headers[String(name).toLowerCase()] = String(value); return this; },
    json(payload) { captured.body = payload; return this; },
  };
  await getRouteHandler(router, routePath, method)({ body, query, headers, params }, response);
  return captured;
}

// A provider double counting requests per path; `scenario.status` is every
// game's status and `scenario.label` marks which fetch a row came from.
function makeGateway(scenario) {
  const calls = { games: 0, stats: 0 };
  const game = (id) => ({ id, date: new Date(KICKOFF).toISOString(), status: scenario.status });
  return {
    calls,
    getStatus: () => ({}),
    async request({ path, params }) {
      const kind = path === '/nfl/v1/games' ? 'games' : 'stats';
      calls[kind] += 1;
      const payload = kind === 'games'
        ? { data: [game(11), game(12)] }
        : { data: [{ player: { id: 1, last_name: scenario.label }, game: game(Number(params.get('game_ids[]'))) }] };
      return {
        payload,
        cache: { hit: false, coalesced: false, stale: false },
        freshness: { ageMs: 0, providerFetchedAt: new Date(0).toISOString() },
      };
    },
  };
}

async function setup(scenario, startAt, archive = createLivePlaysArchive({ databasePath: ':memory:', config: { maxBytes: 1024 * 1024 } })) {
  let nowMs = startAt;
  const clock = { now: () => nowMs, advance: (ms) => { nowMs += ms; } };
  const gateway = makeGateway(scenario);
  const router = createLiveRouter({ gateway, snapshotStore: {}, archive, now: clock.now });
  const started = await invoke(router, '/session', 'post', { body: { leagueId: 'league-73', provider: 'sleeper' } });
  const cookie = started.headers['set-cookie'].split(';', 1)[0];
  const stats = () => invoke(router, '/player-stats', 'get', { query: { gameIds: '11,12' }, headers: { cookie } });
  const games = () => invoke(router, '/games', 'get', { query: { season: '2026', week: '7' }, headers: { cookie } });
  return { archive, gateway, clock, stats, games };
}

test('a finished game is read from the provider once, then from the archive, even after a restart', async () => {
  const scenario = { status: 'Final', label: 'first' };
  const first = await setup(scenario, KICKOFF + 6 * HOUR);
  await first.stats();
  await first.games();
  assert.deepEqual(first.gateway.calls, { games: 1, stats: 2 });

  const again = await first.stats();
  assert.equal(again.body.cache.archived, true);
  assert.deepEqual(first.gateway.calls, { games: 1, stats: 2 });

  // A restarted server (new router and gateway, same disk) asks nothing.
  const restarted = await setup(scenario, KICKOFF + 7 * HOUR, first.archive);
  const fromDisk = await restarted.stats();
  await restarted.games();
  assert.equal(fromDisk.body.data.length, 2);
  assert.deepEqual(restarted.gateway.calls, { games: 0, stats: 0 });
});

test('finished data is refetched once after the correction window, then never again', async () => {
  const scenario = { status: 'Final', label: 'original' };
  const { gateway, clock, stats } = await setup(scenario, KICKOFF + 6 * HOUR);
  await stats();
  scenario.label = 'corrected';
  clock.advance(PLAY_CORRECTION_WINDOW_MS);
  const corrected = await stats();
  assert.equal(corrected.body.data[0].player.last_name, 'corrected');
  assert.equal(gateway.calls.stats, 4);

  clock.advance(30 * 24 * HOUR);
  await stats();
  assert.equal(gateway.calls.stats, 4);
});

test('a live game is never archived', async () => {
  const scenario = { status: '2nd Qtr', label: 'live' };
  const { archive, stats, games } = await setup(scenario, KICKOFF + HOUR);
  await stats();
  await games();
  assert.equal(archive.getStats().rows, 0);
});

test('a payload counts as finished only when every game in it is final', () => {
  const final = { status: 'Final', date: new Date(KICKOFF).toISOString() };
  assert.equal(getFinishedPayloadEndedAt({ data: [final, { ...final, status: '1:00 PM' }] }), null);
  assert.equal(getFinishedPayloadEndedAt({ data: [] }), null);
  assert.equal(getFinishedPayloadEndedAt({ data: [{ game: final }] }), KICKOFF + 4 * HOUR);
});
