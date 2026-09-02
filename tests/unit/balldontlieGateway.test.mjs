import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBalldontlieRequestKey,
  createBalldontlieGateway,
  getBalldontlieGatewayConfig,
} from '../../server/balldontlieGateway.js';

const GOAT_ENV = Object.freeze({
  GRIDSHIFT_BDL_API_KEY: 'server-key',
  GRIDSHIFT_BDL_TIER: 'goat',
  GRIDSHIFT_BDL_EFFECTIVE_MAX_REQ_PER_MIN: '600',
});

function ok(payload) {
  return { ok: true, status: 200, json: async () => payload };
}

test('BALLDONTLIE gateway uses conservative unknown defaults and explicit GOAT headroom', () => {
  const unknown = getBalldontlieGatewayConfig({ GRIDSHIFT_BDL_API_KEY: 'server-key' });
  assert.equal(unknown.tier, 'unknown');
  assert.equal(unknown.effectiveRequestsPerMinute, 5);
  assert.equal(unknown.internalCeilingRequestsPerMinute, 4);
  assert.equal(unknown.cadence.scoresLiveEnabled, false);

  const goat = getBalldontlieGatewayConfig(GOAT_ENV);
  assert.equal(goat.effectiveRequestsPerMinute, 600);
  assert.equal(goat.internalCeilingRequestsPerMinute, 450);
  assert.equal(goat.reserveRequestsPerMinute, 150);
  assert.equal(goat.protectedScoresRequestsPerMinute, 60);
  assert.equal(goat.cadence.scoresLiveMs, 1_000);
});

test('BALLDONTLIE gateway keeps StoryStats on its Bearer credential and daily budget lane', async () => {
  let nowMs = Date.UTC(2026, 8, 2, 12, 0, 0);
  const requests = [];
  const gateway = createBalldontlieGateway({
    env: {
      GRIDSHIFT_STORY_STATS_API_KEY: 'story-key',
      GRIDSHIFT_STORY_STATS_DAILY_LIMIT: '2',
    },
    now: () => nowMs,
    fetcher: async (url, options) => {
      requests.push({ url: new URL(url), options });
      return ok({ game: { id: 424095 }, story: { id: 1, content: 'Stats story.' } });
    },
  });

  assert.equal(gateway.supports('storyStats'), true);
  const first = await gateway.request({
    path: '/stories/nfl/games/424095/pregame',
    params: new URLSearchParams({ audience: 'stats', tone: 'editorial' }),
    capability: 'storyStats',
    cacheTtlMs: 60_000,
  });
  const cached = await gateway.request({
    path: '/stories/nfl/games/424095/pregame',
    params: new URLSearchParams({ tone: 'editorial', audience: 'stats' }),
    capability: 'storyStats',
    cacheTtlMs: 60_000,
  });

  assert.equal(first.payload.story.content, 'Stats story.');
  assert.equal(cached.cache.hit, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.pathname, '/stories/nfl/games/424095/pregame');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer story-key');
  assert.equal(gateway.getStatus().storyStats.usedRequests, 1);
  assert.equal(gateway.getStatus().rateLimit.usedRequests, 0);
});

test('StoryStats gateway daily budget resets at the UTC boundary', async () => {
  let nowMs = Date.UTC(2026, 8, 2, 23, 59, 30);
  const gateway = createBalldontlieGateway({
    env: {
      GRIDSHIFT_STORY_STATS_API_KEY: 'story-key',
      GRIDSHIFT_STORY_STATS_DAILY_LIMIT: '1',
    },
    now: () => nowMs,
    fetcher: async () => ok({ data: [] }),
  });
  const request = (gameId) => gateway.request({
    path: `/stories/nfl/games/${gameId}/live`,
    capability: 'storyStats',
    cacheTtlMs: 0,
  });

  await request(1);
  await assert.rejects(request(2), /daily beta request limit/);
  nowMs = Date.UTC(2026, 8, 3, 0, 0, 1);
  await request(2);
  assert.equal(gateway.getStatus().storyStats.usedRequests, 1);
});

test('BALLDONTLIE request keys sort and deduplicate arrays while retaining distinct values and freshness', () => {
  const left = new URLSearchParams();
  left.append('season_type[]', '3');
  left.append('seasons[]', '2026');
  left.append('season_type[]', '2');
  left.append('seasons[]', '2026');
  const right = new URLSearchParams();
  right.append('seasons[]', '2026');
  right.append('season_type[]', '2');
  right.append('season_type[]', '3');
  const base = { credentialFingerprint: 'key', path: '/nfl/v1/games', paginate: true };

  assert.equal(
    buildBalldontlieRequestKey({ ...base, params: left, freshnessKey: 'one-second' }),
    buildBalldontlieRequestKey({ ...base, params: right, freshnessKey: 'one-second' }),
  );
  assert.notEqual(
    buildBalldontlieRequestKey({ ...base, params: left, freshnessKey: 'one-second' }),
    buildBalldontlieRequestKey({ ...base, params: right, freshnessKey: 'thirty-second' }),
  );
});

test('BALLDONTLIE gateway coalesces matching paginated requests and accounts for every page', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const urls = [];
  const gateway = createBalldontlieGateway({
    env: GOAT_ENV,
    fetcher: async (url) => {
      urls.push(String(url));
      if (urls.length === 1) await gate;
      return ok(new URL(url).searchParams.has('cursor')
        ? { data: [{ id: 2 }], meta: { next_cursor: null } }
        : { data: [{ id: 1 }], meta: { next_cursor: 9 } });
    },
  });
  const request = () => gateway.request({
    path: '/nfl/v1/games',
    params: new URLSearchParams({ 'seasons[]': '2026' }),
    paginate: true,
    cacheTtlMs: 1_000,
    staleTtlMs: 10_000,
    lane: 'scores-live',
  });

  const firstPromise = request();
  const secondPromise = request();
  release();
  const [first, second] = await Promise.all([firstPromise, secondPromise]);

  assert.deepEqual(first.payload.data.map((row) => row.id), [1, 2]);
  assert.equal(first.accounting.pageCount, 2);
  assert.equal(first.accounting.upstreamRequests, 2);
  assert.equal(second.cache.coalesced, true);
  assert.equal(urls.length, 2);
  assert.equal(gateway.getStatus().rateLimit.usedRequests, 2);
});

test('BALLDONTLIE gateway serves bounded stale data after an upstream failure', async () => {
  let nowMs = 1_000_000;
  let fail = false;
  const gateway = createBalldontlieGateway({
    env: GOAT_ENV,
    now: () => nowMs,
    fetcher: async () => fail
      ? { ok: false, status: 503, headers: new Headers(), json: async () => ({ error: 'down' }) }
      : ok({ data: [{ id: 1 }], meta: null }),
  });
  const options = {
    path: '/nfl/v1/games',
    cacheTtlMs: 1_000,
    staleTtlMs: 10_000,
    lane: 'scores-live',
  };

  const fresh = await gateway.request(options);
  nowMs += 1_001;
  fail = true;
  const stale = await gateway.request(options);

  assert.equal(fresh.freshness.stale, false);
  assert.equal(stale.freshness.stale, true);
  assert.equal(stale.cache.hit, true);
  assert.equal(stale.accounting.upstreamRequests, 1);
  assert.equal(stale.freshness.providerFetchedAt, fresh.freshness.providerFetchedAt);
  assert.equal(stale.freshness.receivedAt, new Date(nowMs).toISOString());
});

test('detail traffic cannot consume the protected live Scores reserve', async () => {
  let fetchCount = 0;
  const gateway = createBalldontlieGateway({
    env: { ...GOAT_ENV, GRIDSHIFT_BDL_INTERNAL_MAX_REQ_PER_MIN: '120' },
    now: () => 2_000_000,
    fetcher: async () => {
      fetchCount += 1;
      return ok({ data: [], meta: null });
    },
  });

  for (let index = 0; index < 60; index += 1) {
    await gateway.request({
      path: '/nfl/v1/stats',
      params: new URLSearchParams({ request: String(index) }),
      capability: 'stats',
      cacheTtlMs: 60_000,
      lane: 'details',
    });
  }
  await assert.rejects(
    gateway.request({
      path: '/nfl/v1/stats',
      params: new URLSearchParams({ request: 'blocked-detail' }),
      capability: 'stats',
      lane: 'details',
    }),
    /budget is temporarily exhausted/,
  );
  const live = await gateway.request({
    path: '/nfl/v1/games',
    params: new URLSearchParams({ 'weeks[]': '1' }),
    capability: 'games',
    lane: 'scores-live',
  });

  assert.equal(live.cache.hit, false);
  assert.equal(fetchCount, 61);
});

test('BALLDONTLIE gateway bounds its cache and evicts least-recently-used entries', async () => {
  let fetchCount = 0;
  const gateway = createBalldontlieGateway({
    env: { ...GOAT_ENV, GRIDSHIFT_BDL_CACHE_MAX_ENTRIES: '2' },
    fetcher: async () => {
      fetchCount += 1;
      return ok({ data: [], meta: null });
    },
  });
  const request = (id) => gateway.request({
    path: '/nfl/v1/games',
    params: new URLSearchParams({ id }),
    cacheTtlMs: 60_000,
    staleTtlMs: 60_000,
    lane: 'scores-live',
  });

  await request('one');
  await request('two');
  await request('three');
  await request('one');
  assert.equal(fetchCount, 4);
});
