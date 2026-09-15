import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FANTASY_PROJECTIONS_CACHE_TTL_MS,
  FANTASY_PROJECTIONS_SOURCE,
  buildFantasyProjectionsParams,
  createFantasyProjectionsRouter,
  fetchFantasyProjections,
  validateFantasyProjectionsQuery,
} from '../../server/fantasyProjectionHandlers.js';
import { createBalldontlieGateway } from '../../server/balldontlieGateway.js';

const GOAT_ENV = Object.freeze({
  GRIDSHIFT_BDL_API_KEY: 'server-key',
  GRIDSHIFT_BDL_TIER: 'goat',
  GRIDSHIFT_BDL_EFFECTIVE_MAX_REQ_PER_MIN: '600',
});

function ok(payload) {
  return { ok: true, status: 200, headers: new Headers(), json: async () => payload };
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

test('Fantasy projections validate a four-digit season and week 1–18', () => {
  assert.deepEqual(validateFantasyProjectionsQuery({ season: '2026', week: '1' }), { season: 2026, week: 1 });
  assert.deepEqual([...buildFantasyProjectionsParams(2026, 1).entries()], [
    ['season', '2026'],
    ['week', '1'],
    ['per_page', '100'],
  ]);
  for (const query of [
    {},
    { season: '2026.0', week: '1' },
    { season: '2026', week: '0' },
    { season: '2026', week: '19' },
  ]) {
    assert.throws(() => validateFantasyProjectionsQuery(query), {
      message: 'A valid four-digit NFL season and week 1–18 are required.',
    });
  }
});

test('Fantasy projections request the paginated weekly BDL endpoint and cache the snapshot', async () => {
  const urls = [];
  const gateway = createBalldontlieGateway({
    env: GOAT_ENV,
    fetcher: async (url) => {
      urls.push(new URL(url));
      return ok({
        data: [{
          id: 12,
          season: 2026,
          week: 1,
          player: { id: 38, first_name: 'Josh', last_name: 'Allen', position_abbreviation: 'QB' },
          team: { id: 3, abbreviation: 'BUF' },
          stats: { passing_yards: 200.5 },
          projections: [{ total_points: 18.2, scoring_format: { key: 'half_ppr', name: 'Half PPR' } }],
        }],
        meta: { next_cursor: null },
      });
    },
  });

  const first = await fetchFantasyProjections({ season: 2026, week: 1, gateway });
  const second = await fetchFantasyProjections({ season: 2026, week: 1, gateway });
  assert.equal(urls.length, 1);
  assert.equal(urls[0].pathname, '/nfl/v1/fantasy/projections');
  assert.equal(urls[0].searchParams.get('season'), '2026');
  assert.equal(urls[0].searchParams.get('week'), '1');
  assert.equal(first.source.dataset, FANTASY_PROJECTIONS_SOURCE.dataset);
  assert.equal(first.data[0].stats.passing_yards, 200.5);
  assert.equal(first.freshness.refreshAfterMs, FANTASY_PROJECTIONS_CACHE_TTL_MS);
  assert.equal(second.cache.hit, true);
});

test('Fantasy projections router returns a bounded public envelope without the provider key', async () => {
  const gateway = createBalldontlieGateway({
    env: GOAT_ENV,
    fetcher: async () => ok({ data: [], meta: { next_cursor: null } }),
  });
  const handler = getRouteHandler(createFantasyProjectionsRouter({ gateway }), '/projections');
  const capture = createResponseCapture();
  await handler({ query: { season: '2026', week: '1' } }, capture.response);
  assert.equal(capture.captured.statusCode, 200);
  assert.equal(capture.captured.headers['cache-control'], 'no-store');
  assert.deepEqual(capture.captured.body.source, FANTASY_PROJECTIONS_SOURCE);
  assert.equal(JSON.stringify(capture.captured.body).includes(GOAT_ENV.GRIDSHIFT_BDL_API_KEY), false);
});

test('Fantasy projections stay optional when the server has no BDL key', async () => {
  const handler = getRouteHandler(createFantasyProjectionsRouter({
    env: { GRIDSHIFT_BDL_TIER: 'goat' },
    fetcher: async () => {
      throw new Error('The optional provider should not be called without a key.');
    },
  }), '/projections');
  const capture = createResponseCapture();
  await handler({ query: { season: '2026', week: '1' } }, capture.response);
  assert.equal(capture.captured.statusCode, 503);
  assert.match(capture.captured.body.error, /server-side BALLDONTLIE API key/i);
});
