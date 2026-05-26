import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  handleClearEspnSession,
  handleGetEspnSession,
  handleGetEspnLeague,
  handleSetEspnSession,
} from '../../server/espnHandlers.js';

const SECRET = 'handler-test-session-secret';
const ESPN_SWID = '{12345678-1234-1234-1234-123456789ABC}';
const ESPN_S2 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function useSecret() {
  process.env.GRIDSHIFT_SESSION_SECRET = SECRET;
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    set(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

function cookiePair(setCookie = '') {
  return String(setCookie).split(';')[0];
}

describe('ESPN session routes', () => {
  it('sets, reports, and clears the encrypted ESPN session cookie', async () => {
    useSecret();
    const post = mockRes();
    handleSetEspnSession({ body: { SWID: ESPN_SWID, espn_s2: ESPN_S2 } }, post);
    const setCookie = post.headers['set-cookie'];

    assert.equal(post.statusCode, 200);
    assert.deepEqual(post.body, { authenticated: true });
    assert.match(setCookie, /^gridshift_espn_session=/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.doesNotMatch(setCookie, new RegExp(ESPN_S2));

    const get = mockRes();
    handleGetEspnSession({ headers: { cookie: cookiePair(setCookie) } }, get);
    assert.equal(get.statusCode, 200);
    assert.deepEqual(get.body, { authenticated: true });

    const del = mockRes();
    handleClearEspnSession({}, del);
    assert.equal(del.statusCode, 200);
    assert.deepEqual(del.body, { authenticated: false });
    assert.match(del.headers['set-cookie'], /Max-Age=0/);
  });

  it('rejects invalid helper session payloads', async () => {
    useSecret();
    const response = mockRes();
    handleSetEspnSession({ body: { SWID: ESPN_SWID, espn_s2: 'short' } }, response);

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.authenticated, false);
    assert.match(response.body.error, /espn_s2/);
  });

  it('allows public league fetches without an ESPN session cookie', async () => {
    useSecret();
    let forwardedCookie;
    let requestedUrl;
    const response = mockRes();
    await handleGetEspnLeague({ params: { season: 2025, leagueId: 321 }, query: {}, headers: {} }, response, {
      fetchImpl: async (url, options) => {
        requestedUrl = new URL(String(url));
        forwardedCookie = options.headers.Cookie;
        return new Response(JSON.stringify({
          id: 321,
          settings: { name: 'Public League', seasonId: 2025 },
          teams: [],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(forwardedCookie, undefined);
    assert.equal(response.body.id, 321);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(requestedUrl.searchParams.get('seasonId'), '2025');
    assert.equal(requestedUrl.searchParams.getAll('view').includes('mMatchup'), true);
    assert.equal(requestedUrl.searchParams.getAll('view').includes('mBoxscore'), true);
  });

  it('forwards ESPN fantasy player filters to the league request', async () => {
    useSecret();
    let forwardedFilter;
    const fantasyFilter = JSON.stringify({
      players: {
        filterStatus: { value: ['FREEAGENT', 'WAIVERS'] },
        limit: 1000,
      },
    });
    const response = mockRes();
    await handleGetEspnLeague({
      params: { season: 2025, leagueId: 321 },
      query: { fantasyFilter },
      headers: {},
    }, response, {
      fetchImpl: async (_url, options) => {
        forwardedFilter = options.headers['x-fantasy-filter'];
        return new Response(JSON.stringify({
          id: 321,
          settings: { name: 'Public League', seasonId: 2025 },
          teams: [],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(forwardedFilter, fantasyFilter);
  });

  it('returns the private-league fallback message when public access is rejected', async () => {
    useSecret();
    const response = mockRes();
    await handleGetEspnLeague({ params: { season: 2025, leagueId: 321 }, query: {}, headers: {} }, response, {
      fetchImpl: async () => new Response(JSON.stringify({ message: 'private' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    });

    assert.equal(response.statusCode, 401);
    assert.match(response.body.error, /secure ESPN session values/);
    assert.equal(response.headers['cache-control'], 'no-store');
  });
});
