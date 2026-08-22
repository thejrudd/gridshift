import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FANTASY_ADP_CACHE_TTL_MS,
  FANTASY_ADP_SOURCE,
  FANTASY_ADP_STALE_TTL_MS,
  buildFantasyAdpParams,
  createFantasyAdpRouter,
  fetchFantasyAdp,
  validateFantasyAdpQuery,
} from '../../server/fantasyAdpHandlers.js';
import { createBalldontlieGateway, getBalldontlieGatewayConfig } from '../../server/balldontlieGateway.js';

const GOAT_ENV = Object.freeze({
  GRIDSHIFT_BDL_API_KEY: 'server-key',
  GRIDSHIFT_BDL_TIER: 'goat',
  GRIDSHIFT_BDL_EFFECTIVE_MAX_REQ_PER_MIN: '600',
});

function ok(payload) {
  return { ok: true, status: 200, headers: new Headers(), json: async () => payload };
}

function unavailable() {
  return {
    ok: false,
    status: 503,
    headers: new Headers(),
    json: async () => ({ error: 'upstream unavailable' }),
  };
}

function getRouteHandler(router, path) {
  const route = router.stack.find((layer) => layer.route?.path === path)?.route;
  const handler = route?.stack.find((layer) => layer.method === 'get')?.handle;
  assert.equal(typeof handler, 'function');
  return handler;
}

function createResponseCapture() {
  const captured = { statusCode: 200, headers: {}, body: null };
  return {
    captured,
    response: {
      status(statusCode) {
        captured.statusCode = statusCode;
        return this;
      },
      set(name, value) {
        captured.headers[String(name).toLowerCase()] = value;
        return this;
      },
      json(body) {
        captured.body = body;
        return this;
      },
    },
  };
}

test('Fantasy ADP capability is limited to GOAT and the existing trial profile', () => {
  assert.equal(getBalldontlieGatewayConfig(GOAT_ENV).capabilities.fantasy, true);
  assert.equal(getBalldontlieGatewayConfig({ ...GOAT_ENV, GRIDSHIFT_BDL_TIER: 'trial' }).capabilities.fantasy, true);
  assert.equal(getBalldontlieGatewayConfig({ ...GOAT_ENV, GRIDSHIFT_BDL_TIER: 'all-star' }).capabilities.fantasy, false);
  assert.equal(getBalldontlieGatewayConfig({ ...GOAT_ENV, GRIDSHIFT_BDL_TIER: 'free' }).capabilities.fantasy, false);
});

test('Fantasy ADP validates exactly one four-digit NFL season and builds the upstream query', () => {
  assert.deepEqual(validateFantasyAdpQuery({ season: '2026' }), { season: 2026 });
  assert.deepEqual([...buildFantasyAdpParams(2026).entries()], [['season', '2026'], ['per_page', '100']]);
  for (const season of ['', '2026.0', '26', '2001', '2201', ['2026', '2025']]) {
    assert.throws(() => validateFantasyAdpQuery({ season }), { message: 'A valid four-digit NFL season query parameter is required.' });
  }
});

test('Fantasy ADP requests are paginated, coalesced, and fresh-cached for six hours', async () => {
  let nowMs = 1_000_000;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const urls = [];
  const gateway = createBalldontlieGateway({
    env: GOAT_ENV,
    now: () => nowMs,
    fetcher: async (url) => {
      urls.push(new URL(url));
      await pending;
      return ok({ data: [{ id: 17446, average_draft_position: 22.09 }], meta: { next_cursor: null, per_page: 100 } });
    },
  });
  const firstRequest = fetchFantasyAdp({ season: 2026, gateway });
  const secondRequest = fetchFantasyAdp({ season: 2026, gateway });
  release();
  const [first, second] = await Promise.all([firstRequest, secondRequest]);
  const third = await fetchFantasyAdp({ season: 2026, gateway });
  assert.equal(urls.length, 1);
  assert.equal(urls[0].pathname, '/nfl/v1/fantasy/adp');
  assert.equal(urls[0].searchParams.get('season'), '2026');
  assert.equal(urls[0].searchParams.get('per_page'), '100');
  assert.deepEqual(first.data, [{ id: 17446, average_draft_position: 22.09 }]);
  assert.equal(first.freshness.refreshAfterMs, FANTASY_ADP_CACHE_TTL_MS);
  assert.equal(second.cache.coalesced, true);
  assert.equal(third.cache.hit, true);
  assert.equal(third.accounting.upstreamRequests, 0);
  assert.equal(gateway.getStatus().rateLimit.usedRequests, 1);
});

test('Fantasy ADP follows BALLDONTLIE opaque cursors', async () => {
  const urls = [];
  const gateway = createBalldontlieGateway({
    env: GOAT_ENV,
    fetcher: async (url) => {
      const current = new URL(url);
      urls.push(current);
      return current.searchParams.get('cursor')
        ? ok({ data: [{ id: 2 }], meta: { next_cursor: null } })
        : ok({ data: [{ id: 1 }], meta: { next_cursor: 'opaque-next-cursor' } });
    },
  });
  const result = await fetchFantasyAdp({ season: 2026, gateway });
  assert.deepEqual(result.data, [{ id: 1 }, { id: 2 }]);
  assert.equal(urls[1].searchParams.get('cursor'), 'opaque-next-cursor');
});

test('Fantasy ADP serves a bounded stale snapshot when a refresh fails', async () => {
  let nowMs = 1_000_000;
  let online = true;
  const gateway = createBalldontlieGateway({
    env: GOAT_ENV,
    now: () => nowMs,
    fetcher: async () => (online ? ok({ data: [{ id: 1, average_draft_position: 1.5 }], meta: { next_cursor: null } }) : unavailable()),
  });
  const fresh = await fetchFantasyAdp({ season: 2026, gateway });
  nowMs += FANTASY_ADP_CACHE_TTL_MS + 1;
  online = false;
  const stale = await fetchFantasyAdp({ season: 2026, gateway });
  assert.equal(FANTASY_ADP_STALE_TTL_MS > FANTASY_ADP_CACHE_TTL_MS, true);
  assert.equal(fresh.freshness.stale, false);
  assert.equal(stale.cache.hit, true);
  assert.equal(stale.freshness.stale, true);
  assert.deepEqual(stale.data, fresh.data);
});

test('Fantasy ADP uses the protected background lane without exhausting live-score capacity', async () => {
  let fetchCount = 0;
  const gateway = createBalldontlieGateway({
    env: { ...GOAT_ENV, GRIDSHIFT_BDL_INTERNAL_MAX_REQ_PER_MIN: '120' },
    now: () => 2_000_000,
    fetcher: async () => {
      fetchCount += 1;
      return ok({ data: [], meta: { next_cursor: null } });
    },
  });
  for (let season = 2002; season < 2062; season += 1) await fetchFantasyAdp({ season, gateway });
  const live = await gateway.request({
    path: '/nfl/v1/games',
    params: new URLSearchParams({ 'weeks[]': '1' }),
    capability: 'games',
    lane: 'scores-live',
  });
  assert.equal(live.cache.hit, false);
  assert.equal(fetchCount, 61);
});

test('Fantasy ADP rejects disabled capability and a missing server-side key', async () => {
  const disabledGateway = createBalldontlieGateway({ env: { ...GOAT_ENV, GRIDSHIFT_BDL_TIER: 'all-star' }, fetcher: async () => ok({ data: [], meta: null }) });
  const missingKeyGateway = createBalldontlieGateway({ env: { GRIDSHIFT_BDL_TIER: 'goat' }, fetcher: async () => ok({ data: [], meta: null }) });
  await assert.rejects(fetchFantasyAdp({ season: 2026, gateway: disabledGateway }), (error) => error.statusCode === 403 && /does not include fantasy/.test(error.message));
  await assert.rejects(fetchFantasyAdp({ season: 2026, gateway: missingKeyGateway }), (error) => error.statusCode === 503 && /server-side BALLDONTLIE API key/.test(error.message));
});

test('Fantasy ADP router returns a public data envelope and non-secret unavailable response', async () => {
  const gateway = createBalldontlieGateway({ env: GOAT_ENV, fetcher: async () => ok({ data: [{ id: 1 }], meta: { next_cursor: null } }) });
  const handler = getRouteHandler(createFantasyAdpRouter({ gateway }), '/adp');
  const success = createResponseCapture();
  await handler({ query: { season: '2026' } }, success.response);
  assert.equal(success.captured.statusCode, 200);
  assert.equal(success.captured.headers['cache-control'], 'no-store');
  assert.deepEqual(success.captured.body.source, FANTASY_ADP_SOURCE);
  assert.deepEqual(success.captured.body.data, [{ id: 1 }]);
  assert.equal(success.captured.body.freshness.stale, false);
  assert.equal(JSON.stringify(success.captured.body).includes(GOAT_ENV.GRIDSHIFT_BDL_API_KEY), false);
  const disabledGateway = createBalldontlieGateway({ env: { ...GOAT_ENV, GRIDSHIFT_BDL_TIER: 'all-star' }, fetcher: async () => ok({ data: [], meta: null }) });
  const unavailableHandler = getRouteHandler(createFantasyAdpRouter({ gateway: disabledGateway }), '/adp');
  const unavailableResponse = createResponseCapture();
  await unavailableHandler({ query: { season: '2026' } }, unavailableResponse.response);
  assert.equal(unavailableResponse.captured.statusCode, 403);
  assert.deepEqual(unavailableResponse.captured.body.source, FANTASY_ADP_SOURCE);
  assert.equal(unavailableResponse.captured.body.ok, false);
  assert.equal(JSON.stringify(unavailableResponse.captured.body).includes(GOAT_ENV.GRIDSHIFT_BDL_API_KEY), false);
});
