import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { fetchGameLog, fetchPlayerCareerStats, fetchPlayerProfile, fetchPlayerStats } from '../../src/utils/playerApi.js';

// playerApi remembers for a minute that the GridShift API is down. Date is
// mocked so each test can start with that cooldown lapsed.
mock.timers.enable({ apis: ['Date'], now: Date.now() });

const ESPN_STATS = { splits: { categories: [{ name: 'passing', stats: [{ name: 'passingYards', value: 9 }] }] } };
const PLAYER_DATA_PREFIX = '/api/players/';

const realFetch = globalThis.fetch;
beforeEach(() => { mock.timers.tick(61 * 1000); });
afterEach(() => { globalThis.fetch = realFetch; });

function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return handler(String(url));
  };
  return calls;
}

const jsonResponse = (body, { status = 200, headers = {} } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Map(Object.entries({ 'content-type': 'application/json', ...headers }).map(([k, v]) => [k.toLowerCase(), v])),
  json: async () => body,
  text: async () => JSON.stringify(body),
});
const htmlResponse = () => ({
  ok: true,
  status: 200,
  headers: new Map([['content-type', 'text/html']]),
  json: async () => { throw new SyntaxError('Unexpected token <'); },
  text: async () => '<html></html>',
});
const isEspn = (url) => url.startsWith('https://');

describe('player stats: GridShift API first, ESPN as fallback', () => {
  it('normalizes height and weight from the ESPN player profile', async () => {
    const calls = stubFetch(() => jsonResponse({
      id: '9021',
      displayName: 'Test Player',
      displayHeight: `6' 4\"`,
      displayWeight: '220 lbs',
    }));

    const profile = await fetchPlayerProfile('9021');
    assert.equal(profile.height, '6′ 4″');
    assert.equal(profile.weight, '220 lb');
    assert.deepEqual(calls, ['https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/athletes/9021?lang=en&region=us']);
  });

  it('uses the API payload and makes no ESPN call', async () => {
    const calls = stubFetch(() => jsonResponse(ESPN_STATS));
    const stats = await fetchPlayerStats('9001', 2024);

    assert.deepEqual(stats, ESPN_STATS);
    assert.deepEqual(calls, [`${PLAYER_DATA_PREFIX}9001/stats/2024`]);
  });

  it('routes the game log through the API and passes the team along', async () => {
    const games = [{ eventId: '1', meta: { week: 1 }, statsJson: ESPN_STATS }];
    const calls = stubFetch(() => jsonResponse(games));
    const log = await fetchGameLog('9002', 'SEA', 2024);

    assert.deepEqual(log, games);
    assert.deepEqual(calls, [`${PLAYER_DATA_PREFIX}9002/gamelog/2024?team=SEA`]);
  });

  it('routes career stats through the API', async () => {
    const calls = stubFetch(() => jsonResponse(ESPN_STATS));
    await fetchPlayerCareerStats('9003');
    assert.deepEqual(calls, [`${PLAYER_DATA_PREFIX}9003/career`]);
  });

  it('treats an API 404 as ESPN having no data, without asking ESPN again', async () => {
    const calls = stubFetch(() => jsonResponse({ error: 'not_found' }, { status: 404 }));
    await assert.rejects(fetchPlayerStats('9004', 2010), /Stats fetch failed: 404/);
    assert.equal(calls.length, 1);
    assert.equal(calls.some(isEspn), false);
  });

  it('does not mistake a bare 404 (an API without this route) for "ESPN has no data"', async () => {
    const calls = stubFetch((url) => (
      url.startsWith(PLAYER_DATA_PREFIX)
        ? { ok: false, status: 404, headers: new Map([['content-type', 'text/html']]), json: async () => ({}) }
        : jsonResponse(ESPN_STATS)
    ));
    const stats = await fetchPlayerStats('9010', 2024);
    assert.deepEqual(stats, ESPN_STATS);
    assert.equal(calls.filter(isEspn).length, 1);
  });

  it('falls back to ESPN for a request the API declines with 400, and keeps using the API afterwards', async () => {
    const calls = stubFetch((url) => (
      url.startsWith(PLAYER_DATA_PREFIX)
        ? jsonResponse({ error: 'unsupported_season' }, { status: 400 })
        : jsonResponse(ESPN_STATS)
    ));

    const stats = await fetchPlayerStats('9005', 1998);
    assert.deepEqual(stats, ESPN_STATS);
    assert.equal(calls.filter(isEspn).length, 1);

    calls.length = 0;
    await fetchPlayerStats('9006', 1997);
    assert.equal(calls[0], `${PLAYER_DATA_PREFIX}9006/stats/1997`, 'a 400 does not put the API on cooldown');
  });

  it('falls back to ESPN when the API answers with the SPA fallback page, then skips the API for a while', async () => {
    const calls = stubFetch((url) => (url.startsWith(PLAYER_DATA_PREFIX) ? htmlResponse() : jsonResponse(ESPN_STATS)));

    const first = await fetchPlayerStats('9007', 2024);
    assert.deepEqual(first, ESPN_STATS);
    assert.equal(calls.filter((u) => u.startsWith(PLAYER_DATA_PREFIX)).length, 1);

    calls.length = 0;
    await fetchPlayerStats('9008', 2024);
    assert.equal(calls.some((u) => u.startsWith(PLAYER_DATA_PREFIX)), false, 'API is on cooldown');
    assert.equal(calls.filter(isEspn).length, 1);
  });
});
