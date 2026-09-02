import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStoryStatsParams,
  buildStoryStatsPath,
  createStoryStatsRouter,
  createStoryStatsService,
  fetchStoryStats,
  normalizeStoryStatsResponse,
  validateStoryStatsQuery,
} from '../../server/storyStatsHandlers.js';

function createGateway({ response, delayMs = 0, supportsStoryStats = true } = {}) {
  const calls = [];
  return {
    calls,
    supports: (capability) => capability === 'storyStats' && supportsStoryStats,
    request: async (options) => {
      calls.push(options);
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return typeof response === 'function' ? response(options) : (response ?? {
        payload: {
          game: { id: 424095 },
          story: {
            id: 1454,
            created_at: '2026-08-01T15:55:39.467Z',
            content: 'A statistical preview.',
            entity_tags: { teams: [], players: [] },
          },
        },
      });
    },
  };
}

test('StoryStats query validation accepts only numeric game IDs and supported phases', () => {
  assert.deepEqual(
    validateStoryStatsQuery({ gameId: '424095', phase: 'LIVE' }),
    { gameId: 424095, phase: 'live' },
  );
  assert.equal(buildStoryStatsPath('424095', 'pregame'), '/stories/nfl/games/424095/pregame');
  assert.deepEqual(
    [...buildStoryStatsParams().entries()],
    [['audience', 'stats'], ['tone', 'editorial']],
  );
  [
    { gameId: '', phase: 'live' },
    { gameId: '424095.5', phase: 'live' },
    { gameId: '424095abc', phase: 'live' },
    { gameId: '424095', phase: 'quarter' },
    { gameId: '424095', phase: undefined },
  ].forEach((query) => {
    assert.throws(
      () => validateStoryStatsQuery(query),
      (error) => error.statusCode === 400,
    );
  });
});

test('StoryStats normalization preserves documented fields and adds stable aliases', () => {
  const normalized = normalizeStoryStatsResponse({
    game: { id: 424095 },
    data: [
      {
        id: 1457,
        created_at: '2026-08-01T15:55:51.920Z',
        type: 'score_update',
        content: 'A three-point lead changes the game state.',
        entity_tags: {
          teams: [{ id: 5, name: 'Miami Dolphins', abbreviation: 'MIA' }],
          players: [],
        },
        game_snapshot: {
          period: 1,
          home_score: 3,
          away_score: 0,
          minutes_remaining: 10,
          clock: '10:35',
        },
        provider_specific_field: 'keep-me-in-raw',
      },
    ],
  }, { gameId: 424095, phase: 'live' });

  assert.equal(normalized.game.id, 424095);
  assert.equal(normalized.stories.length, 1);
  assert.deepEqual(normalized.stories[0], {
    id: 1457,
    phase: 'live',
    title: null,
    body: 'A three-point lead changes the game state.',
    generatedAt: '2026-08-01T15:55:51.920Z',
    created_at: '2026-08-01T15:55:51.920Z',
    content: 'A three-point lead changes the game state.',
    type: 'score_update',
    entity_tags: {
      teams: [{ id: 5, name: 'Miami Dolphins', abbreviation: 'MIA' }],
      players: [],
    },
    game_snapshot: {
      period: 1,
      home_score: 3,
      away_score: 0,
      minutes_remaining: 10,
      clock: '10:35',
    },
    gameId: 424095,
    source: {
      provider: 'storystats',
      sport: 'nfl',
      audience: 'stats',
      tone: 'editorial',
      type: 'score_update',
      entityTags: {
        teams: [{ id: 5, name: 'Miami Dolphins', abbreviation: 'MIA' }],
        players: [],
      },
      gameSnapshot: {
        period: 1,
        home_score: 3,
        away_score: 0,
        minutes_remaining: 10,
        clock: '10:35',
      },
    },
    raw: {
      id: 1457,
      created_at: '2026-08-01T15:55:51.920Z',
      type: 'score_update',
      content: 'A three-point lead changes the game state.',
      entity_tags: {
        teams: [{ id: 5, name: 'Miami Dolphins', abbreviation: 'MIA' }],
        players: [],
      },
      game_snapshot: {
        period: 1,
        home_score: 3,
        away_score: 0,
        minutes_remaining: 10,
        clock: '10:35',
      },
      provider_specific_field: 'keep-me-in-raw',
    },
  });
  assert.equal(normalized.stories[0].raw.provider_specific_field, 'keep-me-in-raw');
});

test('StoryStats always requests the statistical editorial variant on the documented game path', async () => {
  const gateway = createGateway({
    response: {
      payload: {
        story: {
          id: 1454,
          created_at: '2026-08-01T15:55:39.467Z',
          content: 'A statistical pregame story.',
        },
      },
      accounting: { upstreamRequests: 1 },
    },
  });
  const result = await fetchStoryStats({
    gameId: 424095,
    phase: 'pregame',
    storyStatsGateway: gateway,
    store: undefined,
  });

  assert.equal(gateway.calls.length, 1);
  assert.equal(gateway.calls[0].path, '/stories/nfl/games/424095/pregame');
  assert.equal(gateway.calls[0].capability, 'storyStats');
  assert.equal(gateway.calls[0].paginate, false);
  assert.deepEqual([...gateway.calls[0].params.entries()], [
    ['audience', 'stats'],
    ['tone', 'editorial'],
  ]);
  assert.deepEqual(result.request.params, { audience: 'stats', tone: 'editorial' });
  assert.deepEqual(result.stories[0].content, 'A statistical pregame story.');
  assert.equal(result.accounting.upstreamRequests, 1);
});

test('StoryStats turns provider not-ready 404s into an explicit empty availability state', async () => {
  const notReady = Object.assign(new Error('Story not yet generated for this game'), {
    statusCode: 404,
    upstreamRequests: 1,
  });
  const gateway = createGateway({ response: () => { throw notReady; } });
  const result = await fetchStoryStats({
    gameId: 424095,
    phase: 'postgame',
    storyStatsGateway: gateway,
  });

  assert.equal(result.availability, 'not-ready');
  assert.deepEqual(result.stories, []);
  assert.equal(result.accounting.upstreamRequests, 1);
  assert.equal(result.accounting.dailyUsed, 1);
});

test('StoryStats handler cache and in-flight coalescing avoid duplicate upstream calls', async () => {
  const gateway = createGateway({ delayMs: 10 });
  const service = createStoryStatsService({ gateway, storyStatsGateway: gateway, now: () => 1_756_663_200_000 });
  const firstRequest = service.fetch({ gameId: 424095, phase: 'live' });
  const coalescedRequest = service.fetch({ gameId: 424095, phase: 'live' });
  const [first, coalesced] = await Promise.all([firstRequest, coalescedRequest]);
  const cached = await service.fetch({ gameId: 424095, phase: 'live' });

  assert.equal(gateway.calls.length, 1);
  assert.equal(first.cache.hit, false);
  assert.equal(first.cache.coalesced, false);
  assert.equal(coalesced.cache.coalesced, true);
  assert.equal(cached.cache.hit, true);
  assert.equal(cached.cache.coalesced, false);
  assert.equal(first.accounting.dailyUsed, 1);
  assert.equal(coalesced.accounting.dailyUsed, 1);
  assert.equal(cached.accounting.upstreamRequests, 0);
  assert.equal(cached.accounting.dailyUsed, 1);
});

test('StoryStats does not spend daily budget when the injected gateway serves a cache hit', async () => {
  const gateway = createGateway({
    response: {
      payload: { data: [] },
      cache: { hit: true },
      accounting: { upstreamRequests: 0 },
    },
  });
  const service = createStoryStatsService({ gateway, storyStatsGateway: gateway, dailyLimit: 1 });
  const result = await service.fetch({ gameId: 424095, phase: 'live' });

  assert.equal(result.cache.hit, true);
  assert.equal(result.accounting.upstreamRequests, 0);
  assert.equal(result.accounting.dailyUsed, 0);
});

test('production StoryStats reads use the warmed cache without making an upstream request', async () => {
  const gateway = createGateway();
  const service = createStoryStatsService({ storyStatsGateway: gateway, dailyLimit: 1 });
  await service.fetch({ gameId: 424095, phase: 'postgame' });

  const cached = await service.fetch({ gameId: 424095, phase: 'postgame', allowUpstream: false });
  assert.equal(cached.cache.hit, true);
  assert.equal(cached.accounting.upstreamRequests, 0);
  assert.equal(gateway.calls.length, 1);

  const emptyService = createStoryStatsService({ storyStatsGateway: createGateway(), dailyLimit: 1 });
  const notReady = await emptyService.fetch({ gameId: 424096, phase: 'postgame', allowUpstream: false });
  assert.equal(notReady.availability, 'not-ready');
  assert.equal(notReady.accounting.upstreamRequests, 0);
});

test('StoryStats daily beta limit returns UTC reset timing and resets on the next UTC day', async () => {
  let nowMs = Date.UTC(2026, 8, 2, 23, 59, 30);
  const gateway = createGateway();
  const service = createStoryStatsService({
    gateway,
    storyStatsGateway: gateway,
    dailyLimit: 2,
    now: () => nowMs,
    cacheTtlMs: 0,
  });

  await service.fetch({ gameId: 424095, phase: 'pregame' });
  await service.fetch({ gameId: 424096, phase: 'pregame' });
  await assert.rejects(
    service.fetch({ gameId: 424097, phase: 'pregame' }),
    (error) => error.statusCode === 429
      && error.localQuota === true
      && error.retryAfterMs === 30_000,
  );
  assert.equal(gateway.calls.length, 2);

  nowMs = Date.UTC(2026, 8, 3, 0, 0, 1);
  const afterReset = await service.fetch({ gameId: 424097, phase: 'pregame' });
  assert.equal(afterReset.accounting.dailyUsed, 1);
  assert.equal(afterReset.accounting.dailyRemaining, 1);
  assert.equal(gateway.calls.length, 3);
});

test('StoryStats router exposes the parent-wirable game story route', () => {
  const gateway = createGateway();
  const router = createStoryStatsRouter({ storyStatsGateway: gateway });
  const routeLayer = router.stack.find((layer) => layer.route?.path === '/game/:gameId/story');

  assert.ok(routeLayer);
  assert.equal(routeLayer.route.methods.get, true);
});
