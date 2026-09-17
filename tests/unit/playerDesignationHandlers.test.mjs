import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLAYER_DESIGNATIONS_CACHE_TTL_MS,
  PLAYER_DESIGNATIONS_MAX_PAGES,
  PLAYER_DESIGNATIONS_SOURCE,
  PLAYER_DESIGNATIONS_STALE_TTL_MS,
  buildPlayerDesignationsParams,
  createPlayerDesignationsRouter,
  fetchPlayerDesignations,
  validatePlayerDesignationsQuery,
} from '../../server/playerDesignationHandlers.js';
import { createBalldontlieGateway, getBalldontlieGatewayConfig } from '../../server/balldontlieGateway.js';

const GOAT_ENV = Object.freeze({
  GRIDSHIFT_BDL_API_KEY: 'server-key',
  GRIDSHIFT_BDL_TIER: 'goat',
  GRIDSHIFT_BDL_EFFECTIVE_MAX_REQ_PER_MIN: '600',
});

function ok(payload) {
  return { ok: true, status: 200, headers: new Headers(), json: async () => payload };
}

function teamDirectoryResponse() {
  return ok({
    data: [
      { id: 3, abbreviation: 'BUF' },
      { id: 14, abbreviation: 'KC' },
      { id: 21, abbreviation: 'WSH' },
    ],
    meta: { next_cursor: null },
  });
}

function isTeamDirectoryRequest(url) {
  return new URL(String(url)).pathname === '/nfl/v1/teams';
}

function withTeamDirectory(fetcher) {
  return async (url, ...rest) => (
    isTeamDirectoryRequest(url) ? teamDirectoryResponse() : fetcher(url, ...rest)
  );
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

test('Player designations are explicitly limited to GOAT entitlement, including GOAT trials', () => {
  assert.equal(getBalldontlieGatewayConfig(GOAT_ENV).capabilities.designations, true);
  assert.equal(getBalldontlieGatewayConfig({ ...GOAT_ENV, GRIDSHIFT_BDL_TIER: 'trial' }).capabilities.designations, true);
  assert.equal(getBalldontlieGatewayConfig({ ...GOAT_ENV, GRIDSHIFT_BDL_TIER: 'all-star' }).capabilities.designations, false);
  assert.equal(getBalldontlieGatewayConfig({ ...GOAT_ENV, GRIDSHIFT_BDL_TIER: 'free' }).capabilities.designations, false);
});

test('Player designations require a regular-season year, week, and bounded Sleeper candidate teams', () => {
  assert.deepEqual(validatePlayerDesignationsQuery({ season: '2026', week: '1', teams: 'BUF,WSH' }), { season: 2026, week: 1, teams: ['BUF', 'WAS'] });
  assert.deepEqual([...buildPlayerDesignationsParams(2026, 1, [21, 3]).entries()], [
    ['season', '2026'],
    ['week', '1'],
    ['season_types[]', '2'],
    ['per_page', '100'],
    ['team_ids[]', '3'],
    ['team_ids[]', '21'],
  ]);
  for (const query of [
    {},
    { season: '2026.0', week: '1', teams: 'BUF' },
    { season: '2026', week: '0', teams: 'BUF' },
    { season: '2026', week: '19', teams: 'BUF' },
    { season: ['2026'], week: '1', teams: 'BUF' },
    { season: '2026', week: ['1'], teams: 'BUF' },
    { season: '2026', week: '1' },
    { season: '2026', week: '1', teams: 'not-a-team' },
  ]) {
    assert.throws(() => validatePlayerDesignationsQuery(query), {
      message: 'A valid four-digit NFL season, week 1–18, and one or more NFL teams are required.',
    });
  }
});

test('Player designations page through the server gateway and return only actionable, bounded fields', async () => {
  const urls = [];
  const gateway = createBalldontlieGateway({
    env: GOAT_ENV,
    fetcher: async (url) => {
      urls.push(new URL(url));
      if (isTeamDirectoryRequest(url)) return teamDirectoryResponse();
      return ok({
        data: [
          {
            id: 1,
            season: 2026,
            week: 1,
            player: { id: 38, first_name: 'Josh', last_name: 'Allen', position: 'Quarterback', position_abbreviation: 'QB', age: 30 },
            team: { id: 3, abbreviation: 'BUF', name: 'Bills', full_name: 'Buffalo Bills', division: 'EAST' },
            active: true,
            starter: true,
            did_not_play: false,
            secret_provider_field: 'omit me',
          },
          {
            id: 2,
            season: 2026,
            week: 1,
            season_type: 'regular',
            game_id: 987,
            player: { id: 39, first_name: 'Injured', last_name: 'Player', position: 'Running Back', position_abbreviation: 'RB' },
            team: { id: 4, abbreviation: 'KC', name: 'Chiefs', full_name: 'Kansas City Chiefs' },
            practice_reports: [{ date: '2026-09-09', status: 'limited', note: 'omit me' }],
            injury: ' Left hamstring ',
            game_status: 'questionable',
            active: false,
            starter: null,
            did_not_play: true,
            updated_at: '2026-09-10T01:02:03.000Z',
            secret_provider_field: 'omit me',
          },
          {
            id: 3,
            season: 2025,
            week: 1,
            player: { id: 40 },
            injury: 'wrong selected season',
          },
        ],
        meta: { next_cursor: null, per_page: 100 },
      });
    },
  });

  const first = await fetchPlayerDesignations({ season: 2026, week: 1, teams: ['BUF', 'KC'], gateway });
  const second = await fetchPlayerDesignations({ season: 2026, week: 1, teams: ['KC', 'BUF'], gateway });
  assert.equal(urls.length, 2);
  assert.equal(urls[0].pathname, '/nfl/v1/teams');
  assert.equal(urls[1].pathname, '/nfl/v1/player_designations');
  assert.equal(urls[1].searchParams.get('season'), '2026');
  assert.equal(urls[1].searchParams.get('week'), '1');
  assert.equal(urls[1].searchParams.get('season_types[]'), '2');
  assert.equal(urls[1].searchParams.get('per_page'), '100');
  assert.deepEqual(urls[1].searchParams.getAll('team_ids[]').sort((left, right) => Number(left) - Number(right)), ['3', '14']);
  assert.deepEqual(first.data, [{
    id: 2,
    season: 2026,
    week: 1,
    season_type: 'regular',
    game_id: 987,
    player: { id: 39, first_name: 'Injured', last_name: 'Player', position: 'Running Back', position_abbreviation: 'RB' },
    team: { id: 4, abbreviation: 'KC', name: 'Chiefs', full_name: 'Kansas City Chiefs' },
    practice_reports: [{ date: '2026-09-09', status: 'limited' }],
    injury: 'Left hamstring',
    game_status: 'questionable',
    active: false,
    starter: null,
    did_not_play: true,
    updated_at: '2026-09-10T01:02:03.000Z',
  }]);
  assert.deepEqual(first.meta, { per_page: 100 });
  assert.equal(first.freshness.refreshAfterMs, PLAYER_DESIGNATIONS_CACHE_TTL_MS);
  assert.equal(second.cache.hit, true);
});

test('Player designations retain every actionable signal without treating unknown data as healthy', async () => {
  const base = { season: 2026, week: 1, player: { id: 1 } };
  const gateway = createBalldontlieGateway({
    env: GOAT_ENV,
    fetcher: withTeamDirectory(async () => ok({
      data: [
        { ...base, id: 1, injury: 'Knee' },
        { ...base, id: 2, game_status: 'out' },
        { ...base, id: 3, practice_reports: [{ date: '2026-09-09', status: 'did_not_participate' }] },
        { ...base, id: 4, active: false },
        { ...base, id: 5, did_not_play: true },
        { ...base, id: 6, active: true, did_not_play: false },
        { ...base, id: 7, active: null, did_not_play: null },
      ],
      meta: { next_cursor: null },
    })),
  });

  const result = await fetchPlayerDesignations({ season: 2026, week: 1, teams: ['BUF'], gateway });
  assert.deepEqual(result.data.map((row) => row.id), [1, 2, 3, 4, 5]);
  assert.equal(result.data[0].active, null);
  assert.equal(result.data[0].did_not_play, null);
});

test('Player designations discard practice reports after the provider snapshot date', async () => {
  const gateway = createBalldontlieGateway({
    env: GOAT_ENV,
    now: () => Date.parse('2026-09-16T12:00:00.000Z'),
    fetcher: withTeamDirectory(async () => ok({
      data: [
        { season: 2026, week: 1, id: 1, player: { id: 1 }, injury: 'Knee', practice_reports: [
          { date: '2026-09-16', status: 'limited' },
          { date: '2026-09-17', status: 'did_not_participate' },
        ] },
        { season: 2026, week: 1, id: 2, player: { id: 2 }, practice_reports: [
          { date: '2026-09-17', status: 'did_not_participate' },
        ] },
      ],
      meta: { next_cursor: null },
    })),
  });

  const result = await fetchPlayerDesignations({ season: 2026, week: 1, teams: ['BUF'], gateway });
  assert.deepEqual(result.data.map((row) => row.id), [1]);
  assert.deepEqual(result.data[0].practice_reports, [{ date: '2026-09-16', status: 'limited' }]);
});

test('Player designations use a five-minute cache with a 24-hour stale fallback', async () => {
  let nowMs = 1_000_000;
  let online = true;
  const gateway = createBalldontlieGateway({
    env: GOAT_ENV,
    now: () => nowMs,
    fetcher: withTeamDirectory(async () => (online
      ? ok({ data: [{ id: 2, season: 2026, week: 1, player: { id: 39 }, injury: 'Hamstring' }], meta: { next_cursor: null } })
      : { ok: false, status: 503, headers: new Headers(), json: async () => ({ error: 'upstream unavailable' }) })),
  });

  const fresh = await fetchPlayerDesignations({ season: 2026, week: 1, teams: ['BUF'], gateway });
  nowMs += PLAYER_DESIGNATIONS_CACHE_TTL_MS + 1;
  online = false;
  const stale = await fetchPlayerDesignations({ season: 2026, week: 1, teams: ['BUF'], gateway });
  assert.equal(PLAYER_DESIGNATIONS_STALE_TTL_MS > PLAYER_DESIGNATIONS_CACHE_TTL_MS, true);
  assert.equal(fresh.freshness.stale, false);
  assert.equal(stale.cache.hit, true);
  assert.equal(stale.freshness.stale, true);
  assert.deepEqual(stale.data, fresh.data);
});

test('Player designations fail instead of returning a partial 24-page snapshot', async () => {
  let requestCount = 0;
  const gateway = createBalldontlieGateway({
    env: GOAT_ENV,
    fetcher: withTeamDirectory(async () => {
      requestCount += 1;
      return ok({
        data: [{ id: requestCount, season: 2026, week: 1, player: { id: requestCount }, active: false }],
        meta: { next_cursor: `cursor-${requestCount}` },
      });
    }),
  });

  await assert.rejects(
    fetchPlayerDesignations({ season: 2026, week: 1, teams: ['BUF'], gateway }),
    (error) => error.statusCode === 502 && /pagination limit reached/i.test(error.message),
  );
  assert.equal(requestCount, PLAYER_DESIGNATIONS_MAX_PAGES);
  assert.equal(gateway.getStatus().rateLimit.usedRequests, PLAYER_DESIGNATIONS_MAX_PAGES + 1);
});

test('Player designations fail closed under provider rate pressure', async () => {
  let requestCount = 0;
  const gateway = createBalldontlieGateway({
    env: { ...GOAT_ENV, GRIDSHIFT_BDL_EFFECTIVE_MAX_REQ_PER_MIN: '1' },
    fetcher: withTeamDirectory(async () => {
      requestCount += 1;
      return ok({
        data: [{ id: requestCount, season: 2026, week: 1, player: { id: requestCount }, injury: 'Knee' }],
        meta: { next_cursor: requestCount === 1 ? 'next-page' : null },
      });
    }),
  });

  await assert.rejects(
    fetchPlayerDesignations({ season: 2026, week: 1, teams: ['BUF'], gateway }),
    (error) => error.statusCode === 429 && /budget/i.test(error.message),
  );
  assert.equal(requestCount, 0);
});

test('Player designations router keeps the provider key server-side and reports unavailable GOAT access safely', async () => {
  const gateway = createBalldontlieGateway({
    env: GOAT_ENV,
    fetcher: withTeamDirectory(async () => ok({ data: [{ id: 2, season: 2026, week: 1, player: { id: 39 }, injury: 'Hamstring' }], meta: { next_cursor: null } })),
  });
  const handler = getRouteHandler(createPlayerDesignationsRouter({ gateway }), '/player-designations');
  const success = createResponseCapture();
  await handler({ query: { season: '2026', week: '1', teams: 'BUF' } }, success.response);
  assert.equal(success.captured.statusCode, 200);
  assert.equal(success.captured.headers['cache-control'], 'no-store');
  assert.deepEqual(success.captured.body.source, PLAYER_DESIGNATIONS_SOURCE);
  assert.equal(JSON.stringify(success.captured.body).includes(GOAT_ENV.GRIDSHIFT_BDL_API_KEY), false);

  const disabledGateway = createBalldontlieGateway({
    env: { ...GOAT_ENV, GRIDSHIFT_BDL_TIER: 'all-star' },
    fetcher: async () => ok({ data: [], meta: null }),
  });
  const unavailableHandler = getRouteHandler(createPlayerDesignationsRouter({ gateway: disabledGateway }), '/player-designations');
  const unavailable = createResponseCapture();
  await unavailableHandler({ query: { season: '2026', week: '1', teams: 'BUF' } }, unavailable.response);
  assert.equal(unavailable.captured.statusCode, 403);
  assert.deepEqual(unavailable.captured.body.source, PLAYER_DESIGNATIONS_SOURCE);
  assert.equal(unavailable.captured.body.ok, false);
  assert.equal(JSON.stringify(unavailable.captured.body).includes(GOAT_ENV.GRIDSHIFT_BDL_API_KEY), false);

  const missingKeyGateway = createBalldontlieGateway({
    env: { GRIDSHIFT_BDL_TIER: 'goat' },
    fetcher: async () => {
      throw new Error('The optional provider should not be called without a server key.');
    },
  });
  const missingKeyHandler = getRouteHandler(createPlayerDesignationsRouter({ gateway: missingKeyGateway }), '/player-designations');
  const missingKey = createResponseCapture();
  await missingKeyHandler({ query: { season: '2026', week: '1', teams: 'BUF' } }, missingKey.response);
  assert.equal(missingKey.captured.statusCode, 503);
  assert.match(missingKey.captured.body.error, /Fantasy Injuries/i);
  assert.match(missingKey.captured.body.error, /server-side BALLDONTLIE API key/i);
});
