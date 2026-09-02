import assert from 'node:assert/strict';
import test, { afterEach, describe, it } from 'node:test';
import {
  buildLiveGamesParams,
  createLiveRouter,
  getLiveConfigStatus,
  isLiveLeagueAllowed,
  resolveLivePlaySeasonType,
} from '../../server/liveHandlers.js';

const originalNodeEnv = process.env.NODE_ENV;
const originalMockPlays = process.env.GRIDSHIFT_LIVE_MOCK_PLAYS;
const originalApiKey = process.env.GRIDSHIFT_BDL_API_KEY;
const originalAllowedLeagueIds = process.env.GRIDSHIFT_LIVE_ALLOWED_LEAGUE_IDS;
const originalCookieSecret = process.env.GRIDSHIFT_LIVE_COOKIE_SECRET;
const originalSessionSecret = process.env.GRIDSHIFT_SESSION_SECRET;
const originalAllowPreseason = process.env.GRIDSHIFT_LIVE_ALLOW_PRESEASON;

function restoreEnv(key, value) {
  if (value == null) delete process.env[key];
  else process.env[key] = value;
}

function getRouteHandler(router, routePath, method) {
  const route = router.stack.find((layer) => layer.route?.path === routePath && layer.route.methods?.[method])?.route;
  const handler = route?.stack.find((layer) => layer.method === method)?.handle;
  assert.equal(typeof handler, 'function');
  return handler;
}

async function invoke(router, routePath, method, { body = {}, query = {}, headers = {} } = {}) {
  const captured = { statusCode: 200, headers: {}, body: null };
  const response = {
    status(statusCode) { captured.statusCode = statusCode; return this; },
    set(name, value) { captured.headers[String(name).toLowerCase()] = String(value); return this; },
    json(payload) { captured.body = payload; return this; },
  };
  const request = { body, query, headers };
  await getRouteHandler(router, routePath, method)(request, response);
  return { response: captured, body: captured.body };
}

afterEach(() => {
  restoreEnv('NODE_ENV', originalNodeEnv);
  restoreEnv('GRIDSHIFT_LIVE_MOCK_PLAYS', originalMockPlays);
  restoreEnv('GRIDSHIFT_BDL_API_KEY', originalApiKey);
  restoreEnv('GRIDSHIFT_LIVE_ALLOWED_LEAGUE_IDS', originalAllowedLeagueIds);
  restoreEnv('GRIDSHIFT_LIVE_COOKIE_SECRET', originalCookieSecret);
  restoreEnv('GRIDSHIFT_SESSION_SECRET', originalSessionSecret);
  restoreEnv('GRIDSHIFT_LIVE_ALLOW_PRESEASON', originalAllowPreseason);
});

test('the local preseason play boundary selects the preseason snapshot cache key', () => {
  process.env.NODE_ENV = 'test';
  process.env.GRIDSHIFT_LIVE_ALLOW_PRESEASON = 'true';
  assert.equal(resolveLivePlaySeasonType({ seasonType: 'preseason' }), 1);
  assert.equal(resolveLivePlaySeasonType({}), 2);
});

describe('Fantasy Live placeholder-data boundary', () => {
  it('keeps preseason out of the BALLDONTLIE live games request', () => {
    const params = buildLiveGamesParams({
      season: '2026',
      week: '1',
      seasonType: '1',
    });

    assert.deepEqual(params.getAll('season_type[]'), ['2', '3']);
    assert.equal(params.getAll('season_type[]').includes('1'), false);
  });

  it('allows mock plays in a local test environment', () => {
    process.env.NODE_ENV = 'test';
    process.env.GRIDSHIFT_LIVE_MOCK_PLAYS = 'true';
    assert.equal(getLiveConfigStatus().mockPlaysEnabled, true);
  });

  it('never enables mock plays in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.GRIDSHIFT_LIVE_MOCK_PLAYS = 'true';
    assert.equal(getLiveConfigStatus().mockPlaysEnabled, false);
  });

  it('reports each server-side live scoring prerequisite separately', () => {
    process.env.GRIDSHIFT_BDL_API_KEY = 'test-key';
    delete process.env.GRIDSHIFT_LIVE_ALLOWED_LEAGUE_IDS;
    process.env.GRIDSHIFT_LIVE_COOKIE_SECRET = 'test-secret';
    delete process.env.GRIDSHIFT_SESSION_SECRET;

    const status = getLiveConfigStatus();
    assert.equal(status.enabled, false);
    assert.equal(status.apiKeyReady, true);
    assert.equal(status.leagueScopeEnabled, false);
    assert.equal(status.cookieSigningReady, true);
  });

  it('enables live scoring only when the API key, allowlist, and session secret are present', () => {
    process.env.GRIDSHIFT_BDL_API_KEY = 'test-key';
    process.env.GRIDSHIFT_LIVE_ALLOWED_LEAGUE_IDS = 'league-73';
    process.env.GRIDSHIFT_SESSION_SECRET = 'test-secret';
    delete process.env.GRIDSHIFT_LIVE_COOKIE_SECRET;

    const status = getLiveConfigStatus();
    assert.equal(status.enabled, true);
    assert.equal(status.apiKeyReady, true);
    assert.equal(status.leagueScopeEnabled, true);
    assert.equal(status.cookieSigningReady, true);
  });

  it('checks the selected league against the server allowlist without exposing the list', () => {
    process.env.GRIDSHIFT_LIVE_ALLOWED_LEAGUE_IDS = 'league-73, sleeper:league-88';

    assert.equal(isLiveLeagueAllowed('league-73'), true);
    assert.equal(isLiveLeagueAllowed('sleeper:league-88'), true);
    assert.equal(isLiveLeagueAllowed('league-99'), false);
    assert.equal(isLiveLeagueAllowed('espn:league-73'), false);
  });

  it('scopes a browser session to the requested league and allows no-code shutdown', async () => {
    process.env.NODE_ENV = 'test';
    process.env.GRIDSHIFT_BDL_API_KEY = 'test-key';
    process.env.GRIDSHIFT_LIVE_ALLOWED_LEAGUE_IDS = 'league-73,league-88';
    process.env.GRIDSHIFT_SESSION_SECRET = 'test-secret';
    delete process.env.GRIDSHIFT_LIVE_COOKIE_SECRET;
    delete process.env.GRIDSHIFT_LIVE_ACCESS_CODE;

    const router = createLiveRouter({
      gateway: { getStatus: () => ({}) },
      snapshotStore: {},
    });
    const started = await invoke(router, '/session', 'post', {
      body: { leagueId: 'league-73', provider: 'sleeper' },
    });
    assert.equal(started.response.statusCode, 200);
    assert.equal(started.body.session.canDisable, true);

    const cookie = started.response.headers['set-cookie'].split(';', 1)[0];
    const allowed = await invoke(router, '/status', 'get', {
      query: { leagueId: 'league-73' },
      headers: { cookie },
    });
    assert.equal(allowed.body.live.leagueAllowed, true);
    assert.equal(allowed.body.session.enabled, true);
    assert.equal(allowed.body.session.leagueKey, 'sleeper:league-73');

    const other = await invoke(router, '/status', 'get', {
      query: { leagueId: 'league-88' },
      headers: { cookie },
    });
    assert.equal(other.body.live.leagueAllowed, true);
    assert.equal(other.body.session.enabled, false);

    const cleared = await invoke(router, '/session', 'delete', { headers: { cookie } });
    assert.equal(cleared.response.statusCode, 200);
  });
});
