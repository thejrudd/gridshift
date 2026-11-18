// Caching behind the Statistics player and team dashboards: the browser's
// request cache, the shared finished-game detail store, the finished-games
// archive read-through for game detail, build coalescing, and the no-key path.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequestCache } from '../../src/utils/requestCache.js';
import { isNflSeasonCompleted } from '../../src/utils/nflSeason.js';
import { createFinishedGameDetailStore } from '../../server/finishedGameDetails.js';
import { createLivePlaysArchive } from '../../server/livePlaysArchive.js';
import { createBalldontlieGateway } from '../../server/balldontlieGateway.js';
import { fetchStatisticsScoresGameDetail, seasonCacheControl } from '../../server/statisticsScoresHandlers.js';
import { createPlayerSeasonService } from '../../server/playerSeasonHandlers.js';
import { createTeamSeasonService } from '../../server/teamSeasonHandlers.js';

const TEST_BDL_ENV = Object.freeze({
  GRIDSHIFT_BDL_API_KEY: 'server-key',
  GRIDSHIFT_BDL_TIER: 'goat',
  GRIDSHIFT_BDL_EFFECTIVE_MAX_REQ_PER_MIN: '600',
});
const KICKOFF = '2024-10-06T17:00:00.000Z';
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

// ---------------------------------------------------------------- browser cache

test('request cache shares one request per key and serves the stored value after', async () => {
  const cache = createRequestCache({ maxEntries: 5 });
  let calls = 0;
  const gate = deferred();
  const fetcher = async () => { calls += 1; await gate.promise; return { n: calls }; };
  const first = cache.load('a', fetcher);
  const second = cache.load('a', fetcher);
  gate.resolve();
  assert.deepEqual(await first, { n: 1 });
  assert.equal(await second, await first);
  assert.equal(calls, 1);
  assert.deepEqual(cache.peek('a').value, { n: 1 });
  await cache.load('a', fetcher);
  assert.equal(calls, 1, 'a stored value is served without a request');
  await cache.load('a', fetcher, { force: true });
  assert.equal(calls, 2, 'force refetches');
});

test('request cache evicts the least recently used entry and keeps entries on failure', async () => {
  const cache = createRequestCache({ maxEntries: 2 });
  await cache.load('a', async () => 'A');
  await cache.load('b', async () => 'B');
  cache.peek('a'); // a is now the most recent
  await cache.load('c', async () => 'C');
  assert.equal(cache.peek('b'), null, 'b was least recently used');
  assert.equal(cache.peek('a').value, 'A');
  await assert.rejects(cache.load('a', async () => { throw new Error('offline'); }, { force: true }), /offline/);
  assert.equal(cache.peek('a').value, 'A', 'a failed refresh keeps the earlier value');
  await assert.rejects(cache.load('d', async () => { throw new Error('down'); }), /down/);
  assert.equal(cache.peek('d'), null, 'failures are never stored');
});

test('a season counts as completed from March after it started', () => {
  assert.equal(isNflSeasonCompleted(2024, Date.parse('2025-02-15T00:00:00Z')), false);
  assert.equal(isNflSeasonCompleted(2024, Date.parse('2025-03-01T00:00:00Z')), true);
  assert.equal(isNflSeasonCompleted(2026, Date.parse('2026-11-16T00:00:00Z')), false);
});

test('season payloads get a long private max-age only when completed and complete', () => {
  const nowMs = Date.parse('2026-11-16T00:00:00Z');
  assert.equal(seasonCacheControl(2025, { nowMs }), 'private, max-age=86400');
  assert.equal(seasonCacheControl(2025, { nowMs, complete: false }), 'private, max-age=60');
  assert.equal(seasonCacheControl(2026, { nowMs }), 'private, max-age=60');
});

// ------------------------------------------------- archive read-through (detail)

function detailFetcher({ status, playerRows = [{ player: { id: 1 }, game: { id: 501, status, date: KICKOFF } }], teamRows = [{ team: { id: 10 } }] }) {
  const paths = [];
  const fetcher = async (url) => {
    const { pathname } = new URL(url);
    paths.push(pathname);
    if (pathname === '/nfl/v1/games/501') {
      return { ok: true, status: 200, json: async () => ({ data: { id: 501, status, date: KICKOFF } }) };
    }
    if (pathname === '/nfl/v1/stats') return { ok: true, status: 200, json: async () => ({ data: playerRows, meta: null }) };
    if (pathname === '/nfl/v1/team_stats') return { ok: true, status: 200, json: async () => ({ data: teamRows, meta: null }) };
    throw new Error(`Unexpected request: ${pathname}`);
  };
  return { paths, fetcher };
}

// Each call gets a fresh gateway, as after a restart, so only the archive can
// save a provider request.
async function readDetailTwice(archive, scenario) {
  const { paths, fetcher } = detailFetcher(scenario);
  const read = () => fetchStatisticsScoresGameDetail({
    gameId: 501,
    phase: 'regular',
    includePlays: false,
    gateway: createBalldontlieGateway({ env: { ...TEST_BDL_ENV }, fetcher }),
    archive,
  });
  const first = await read();
  const firstRequests = paths.length;
  const second = await read();
  return { first, second, firstRequests, secondRequests: paths.length - firstRequests };
}

const memoryArchive = () => createLivePlaysArchive({ databasePath: ':memory:', config: { maxBytes: 1024 * 1024 } });

test('a finished game with both box scores is served from the archive with no provider request', async () => {
  const archive = memoryArchive();
  const { first, second, firstRequests, secondRequests } = await readDetailTwice(archive, { status: 'Final' });
  assert.equal(firstRequests, 3);
  assert.equal(secondRequests, 0);
  assert.equal(second.game.id, 501);
  assert.deepEqual(second.playerStats, first.playerStats);
  assert.deepEqual(second.teamStats, first.teamStats);
  assert.equal(second.cache.hit, true);
  assert.equal(second.accounting.upstreamRequests, 0);
  assert.equal(typeof second.freshness.providerFetchedAt, 'string');
});

test('a finished game whose box score is still empty is not archived', async () => {
  const archive = memoryArchive();
  const { secondRequests } = await readDetailTwice(archive, { status: 'Final', playerRows: [] });
  assert.equal(secondRequests, 3);
});

test('a live game is never archived and keeps the short provider cache', async () => {
  const archive = memoryArchive();
  const { secondRequests } = await readDetailTwice(archive, { status: '3rd Quarter' });
  assert.equal(secondRequests, 3);
});

test('without an archive game detail requests the provider exactly as before', async () => {
  const { firstRequests, secondRequests, second } = await readDetailTwice(null, { status: 'Final' });
  assert.equal(firstRequests, 3);
  assert.equal(secondRequests, 3);
  assert.equal(second.cache.hit, false);
});

// -------------------------------------------------------- finished detail store

test('the finished-game detail store shares one fetch per game and keeps only settled finals', async () => {
  const calls = [];
  const gate = deferred();
  const fetchDetail = async ({ gameId }) => {
    calls.push(gameId);
    await gate.promise;
    const final = gameId !== 2;
    return { game: { id: gameId, status: final ? 'Final' : '2nd Quarter' }, coverage: { plays: gameId !== 3, playerStats: true, teamStats: true } };
  };
  const store = createFinishedGameDetailStore({ fetchDetail });
  const pending = [store.get({ gameId: 1 }), store.get({ gameId: 1 }), store.get({ gameId: 2 }), store.get({ gameId: 3 })];
  gate.resolve();
  const [a, b] = await Promise.all(pending);
  assert.equal(a, b);
  assert.deepEqual(calls, [1, 2, 3]);
  await Promise.all([store.get({ gameId: 1 }), store.get({ gameId: 2 }), store.get({ gameId: 3 })]);
  assert.deepEqual(calls, [1, 2, 3, 2, 3], 'live games and games without plays are refetched');
  assert.equal(store.size, 1);
});

// ----------------------------------------------------- service builds and no-key

function seasonGateway(games) {
  return {
    getStatus: () => ({ capabilities: { games: true } }),
    supports: () => false,
    async request() {
      const freshness = { providerFetchedAt: new Date().toISOString(), ageMs: 0, stale: false };
      return { payload: { data: games, meta: null }, cache: { hit: false }, freshness, accounting: { pageCount: 1, upstreamRequests: 1 } };
    },
  };
}

const finalGame = (id, week) => ({
  id,
  week,
  date: `2024-10-${String(week).padStart(2, '0')}T17:00:00.000Z`,
  status: 'Final',
  home_team: { abbreviation: 'SEA' },
  visitor_team: { abbreviation: 'SF' },
  home_team_score: 20,
  visitor_team_score: 17,
});

test('concurrent team-season requests build each finished game once', async () => {
  const games = [finalGame(11, 1), finalGame(12, 2)];
  const calls = [];
  const gate = deferred();
  // A store double with no coalescing of its own, so only the service's can dedupe.
  const gameDetails = {
    async get({ gameId }) {
      calls.push(gameId);
      await gate.promise;
      return { game: games.find((game) => game.id === gameId), playerStats: [], teamStats: [], plays: [], coverage: { plays: false } };
    },
  };
  const service = createTeamSeasonService({ gateway: seasonGateway(games), env: { ...TEST_BDL_ENV }, gameDetails });
  const pending = [service.season({ season: 2024, team: 'SEA' }), service.season({ season: 2024, team: 'SEA' })];
  await new Promise((resolve) => setTimeout(resolve, 10));
  gate.resolve();
  const [first, second] = await Promise.all(pending);
  assert.deepEqual(calls.sort(), [11, 12]);
  assert.equal(first.games.length, 2);
  assert.equal(second.games.length, 2);
  assert.equal(first.complete, false, 'games without plays mark the payload incomplete');
});

const noKeyGateway = {
  getStatus: () => ({ capabilities: { games: false } }),
  supports: () => false,
  async request() { throw new Error('no provider request without a key'); },
};
const untouchedDetails = { async get() { throw new Error('the detail store is not used without a key'); } };

test('without a provider key the team service never reads game detail', async () => {
  const service = createTeamSeasonService({ gateway: noKeyGateway, env: {}, gameDetails: untouchedDetails });
  // No games list means the team has no games this season, as before.
  await assert.rejects(service.season({ season: 2024, team: 'SEA' }), /no games/);
});

test('without a provider key the player service builds from Sleeper alone', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/state/nfl')) return { ok: true, json: async () => ({ season: '2026', season_type: 'regular', week: 10 }) };
    return { ok: true, json: async () => [] };
  };
  const service = createPlayerSeasonService({ fetchImpl, gateway: noKeyGateway, env: {}, gameDetails: untouchedDetails });
  const payload = await service.season({ season: 2024, team: 'SEA', name: 'Test Player', position: 'WR' });
  assert.deepEqual(payload.games, []);
  assert.equal(payload.remaining, 0);
  // No game list: cached only briefly, so it fills in once a key or the provider returns.
  assert.equal(payload.complete, false);
});

test('a finished game counts as settled only once every offered box score has landed', async () => {
  const { isSettledFinalDetail } = await import('../../server/finishedGameDetails.js');
  const final = { status: 'Final', date: '2026-11-08T18:00:00Z' };
  const full = { game: final, coverage: { plays: true, playerStats: true, teamStats: true }, capabilities: { stats: true, teamStats: true } };
  assert.equal(isSettledFinalDetail(full), true);
  assert.equal(isSettledFinalDetail({ ...full, coverage: { ...full.coverage, teamStats: false } }), false);
  assert.equal(isSettledFinalDetail({ ...full, coverage: { ...full.coverage, plays: false } }), false);
  assert.equal(isSettledFinalDetail({ ...full, game: { status: '3rd Quarter' } }), false);
  // A plan without team stats never waits for them.
  assert.equal(isSettledFinalDetail({ ...full, coverage: { ...full.coverage, teamStats: false }, capabilities: { stats: true, teamStats: false } }), true);
});
