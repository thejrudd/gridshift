import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchStatisticsScoresEspnWeek,
  fetchStatisticsScoresGameDetail,
  fetchStatisticsScoresGamePlays,
  fetchStatisticsScoresLatestPlay,
  fetchStatisticsScoresGames,
  fetchStatisticsScoresLiveWeek,
  getStatisticsScoresConfigStatus,
  validateStatisticsScoresLiveWeekQuery,
} from '../../server/statisticsScoresHandlers.js';

const TEST_BDL_ENV = Object.freeze({
  GRIDSHIFT_BDL_API_KEY: 'server-key',
  GRIDSHIFT_BDL_TIER: 'goat',
  GRIDSHIFT_BDL_EFFECTIVE_MAX_REQ_PER_MIN: '600',
});

test('selected-week live Scores rejects unbounded query shapes before provider work', () => {
  assert.deepEqual(
    validateStatisticsScoresLiveWeekQuery({ season: '2026', phase: 'regular', week: '4' }),
    { season: 2026, phase: 'regular', week: 4 },
  );
  assert.throws(
    () => validateStatisticsScoresLiveWeekQuery({ season: '2026,2027', phase: 'regular', week: '4' }),
    /Valid season, phase, and week/,
  );
  assert.throws(
    () => validateStatisticsScoresLiveWeekQuery({ season: '2026', phase: 'postseason', week: '4' }),
    /Valid season, phase, and week/,
  );
  assert.throws(
    () => validateStatisticsScoresLiveWeekQuery({ season: '2026', phase: 'regular', week: '999' }),
    /Valid season, phase, and week/,
  );
});

test('Statistics Scores aggregates paginated BALLDONTLIE detail with the correct preseason filters', async () => {
  const requests = [];
  const result = await fetchStatisticsScoresGameDetail({
    gameId: 887766,
    phase: 'preseason',
    env: { ...TEST_BDL_ENV },
    fetcher: async (url, options) => {
      requests.push({ url: new URL(url), options });
      const requestUrl = new URL(url);
      const cursor = requestUrl.searchParams.get('cursor');
      if (requestUrl.pathname === '/nfl/v1/games/887766') {
        return { ok: true, status: 200, json: async () => ({ data: { id: 887766, status: 'Final' } }) };
      }
      if (requestUrl.pathname === '/nfl/v1/stats') {
        return {
          ok: true,
          status: 200,
          json: async () => cursor
            ? { data: [{ player: { id: 2 } }], meta: { next_cursor: null } }
            : { data: [{ player: { id: 1 } }], meta: { next_cursor: 12 } },
        };
      }
      if (requestUrl.pathname === '/nfl/v1/team_stats') {
        return { ok: true, status: 200, json: async () => ({ data: [{ team: { id: 10 } }, { team: { id: 20 } }], meta: null }) };
      }
      if (requestUrl.pathname === '/nfl/v1/plays') {
        return {
          ok: true,
          status: 200,
          json: async () => cursor
            ? { data: [{ id: 'p2', scoring_play: true }], meta: { next_cursor: null } }
            : { data: [{ id: 'p1', scoring_play: false }], meta: { next_cursor: 34 } },
        };
      }
      throw new Error(`Unexpected request: ${requestUrl}`);
    },
  });

  assert.equal(result.game.id, 887766);
  assert.deepEqual(result.playerStats.map((row) => row.player.id), [1, 2]);
  assert.equal(result.teamStats.length, 2);
  assert.deepEqual(result.plays.map((play) => play.id), ['p1', 'p2']);
  assert.deepEqual(result.scoringPlays.map((play) => play.id), ['p2']);
  assert.deepEqual(result.coverage, {
    game: true,
    teamStats: true,
    playerStats: true,
    plays: true,
    scoring: true,
  });
  assert.equal(result.phase, 'preseason');
  assert.equal(result.seasonType, 1);
  assert.equal(result.cache.hit, false);
  assert.equal(requests.length, 6);
  requests.forEach(({ options }) => assert.equal(options.headers.Authorization, 'server-key'));
  requests
    .filter(({ url }) => url.pathname !== '/nfl/v1/games/887766')
    .forEach(({ url }) => assert.equal(url.searchParams.get('season_type'), '1'));
  requests
    .filter(({ url }) => url.pathname === '/nfl/v1/stats' || url.pathname === '/nfl/v1/team_stats')
    .forEach(({ url }) => assert.deepEqual(url.searchParams.getAll('game_ids[]'), ['887766']));
  requests
    .filter(({ url }) => url.pathname === '/nfl/v1/plays')
    .forEach(({ url }) => assert.equal(url.searchParams.get('game_id'), '887766'));
});

test('Statistics Scores detail treats provider empty arrays as valid partial coverage', async () => {
  const result = await fetchStatisticsScoresGameDetail({
    gameId: 887767,
    phase: 'regular',
    env: { ...TEST_BDL_ENV },
    fetcher: async (url) => ({
      ok: true,
      status: 200,
      json: async () => new URL(url).pathname.includes('/games/')
        ? { data: { id: 887767, status: 'Scheduled' } }
        : { data: [], meta: null },
    }),
  });

  assert.equal(result.game.id, 887767);
  assert.deepEqual(result.teamStats, []);
  assert.deepEqual(result.playerStats, []);
  assert.deepEqual(result.plays, []);
  assert.deepEqual(result.scoringPlays, []);
  assert.deepEqual(result.coverage, {
    game: true,
    teamStats: false,
    playerStats: false,
    plays: false,
    scoring: false,
  });
});

test('Statistics Scores coalesces and caches the complete BALLDONTLIE detail request', async () => {
  let requestCount = 0;
  let releaseGame;
  const gameGate = new Promise((resolve) => { releaseGame = resolve; });
  const options = {
    gameId: 887768,
    env: { ...TEST_BDL_ENV },
    fetcher: async (url) => {
      requestCount += 1;
      if (new URL(url).pathname.includes('/games/')) await gameGate;
      return {
        ok: true,
        status: 200,
        json: async () => new URL(url).pathname.includes('/games/')
          ? { data: { id: 887768 } }
          : { data: [], meta: null },
      };
    },
  };

  const firstRequest = fetchStatisticsScoresGameDetail(options);
  const sharedRequest = fetchStatisticsScoresGameDetail(options);
  releaseGame();
  const [first, shared] = await Promise.all([firstRequest, sharedRequest]);
  const cached = await fetchStatisticsScoresGameDetail(options);

  assert.equal(requestCount, 4);
  assert.deepEqual(shared.game, first.game);
  assert.equal(first.cache.hit, false);
  assert.equal(first.cache.coalesced, false);
  assert.equal(shared.cache.coalesced, true);
  assert.equal(cached.cache.hit, true);
});

test('Statistics Scores fetches paginated BALLDONTLIE game detail without a Fantasy Live session', async () => {
  const requests = [];
  const result = await fetchStatisticsScoresGamePlays({
    gameId: 987654,
    env: { ...TEST_BDL_ENV },
    fetcher: async (url, options) => {
      requests.push({ url: String(url), options });
      const cursor = new URL(url).searchParams.get('cursor');
      return {
        ok: true,
        status: 200,
        json: async () => cursor
          ? { data: [{ id: 2 }], meta: { next_cursor: null } }
          : { data: [{ id: 1 }], meta: { next_cursor: 42 } },
      };
    },
  });

  assert.deepEqual(result.data.map((play) => play.id), [1, 2]);
  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[0].url).pathname, '/nfl/v1/plays');
  assert.equal(new URL(requests[0].url).searchParams.get('game_id'), '987654');
  assert.equal(requests[0].options.headers.Authorization, 'server-key');
  assert.equal(new URL(requests[1].url).searchParams.get('cursor'), '42');
});

test('Statistics Scores latest-play endpoint selects the final chronological row', async () => {
  const requests = [];
  const result = await fetchStatisticsScoresLatestPlay({
    gameId: 987655,
    phase: 'regular',
    env: { ...TEST_BDL_ENV },
    fetcher: async (url, options) => {
      requests.push({ url: String(url), options });
      const cursor = new URL(url).searchParams.get('cursor');
      return {
        ok: true,
        status: 200,
        json: async () => cursor
          ? { data: [{ id: 'opening-play', clock_display: '00:13', period: 1 }], meta: { next_cursor: null } }
          : { data: [{ id: 'latest-play', text: 'PENALTY on HOU', clock_display: '00:05', period: 1 }], meta: { next_cursor: 42 } },
      };
    },
  });

  assert.equal(result.play.id, 'latest-play');
  assert.equal(result.playsCount, 2);
  assert.equal(result.phase, 'regular');
  assert.equal(result.seasonType, 2);
  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[0].url).searchParams.get('game_id'), '987655');
  assert.equal(new URL(requests[0].url).searchParams.get('season_type'), '2');
  assert.equal(requests[0].options.headers.Authorization, 'server-key');
  assert.equal(new URL(requests[1].url).searchParams.get('cursor'), '42');
});

test('Statistics Scores shares a short server cache for ESPN live week snapshots', async () => {
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url: String(url), options });
    return { ok: true, status: 200, json: async () => ({ events: [{ id: 'live-event' }] }) };
  };

  const first = await fetchStatisticsScoresEspnWeek({
    season: 2191,
    phase: 'preseason',
    week: 2,
    fetcher,
  });
  const second = await fetchStatisticsScoresEspnWeek({
    season: 2191,
    phase: 'preseason',
    week: 2,
    fetcher,
  });

  assert.equal(requests.length, 1);
  const url = new URL(requests[0].url);
  assert.equal(url.searchParams.get('dates'), '2191');
  assert.equal(url.searchParams.get('seasontype'), '1');
  assert.equal(url.searchParams.get('week'), '2');
  assert.equal(requests[0].options.cache, 'no-store');
  assert.equal(first.cache.hit, false);
  assert.equal(second.cache.hit, true);
  assert.equal(second.scoreboard.events[0].id, 'live-event');
});

test('Statistics Scores keeps ESPN week cache entries distinct by phase and week', async () => {
  const requestUrls = [];
  const fetcher = async (url) => {
    requestUrls.push(String(url));
    return { ok: true, status: 200, json: async () => ({ events: [] }) };
  };

  await fetchStatisticsScoresEspnWeek({ season: 2192, phase: 'preseason', week: 1, fetcher });
  await fetchStatisticsScoresEspnWeek({ season: 2192, phase: 'regular', week: 1, fetcher });
  await fetchStatisticsScoresEspnWeek({ season: 2192, phase: 'regular', week: 2, fetcher });

  assert.equal(requestUrls.length, 3);
  assert.deepEqual(requestUrls.map((value) => {
    const url = new URL(value);
    return [url.searchParams.get('seasontype'), url.searchParams.get('week')];
  }), [['1', '1'], ['2', '1'], ['2', '2']]);
});

test('Statistics Scores selects BALLDONTLIE from the configured key without league gating', () => {
  const status = getStatisticsScoresConfigStatus({
    ...TEST_BDL_ENV,
    GRIDSHIFT_LIVE_ALLOWED_LEAGUE_IDS: '',
  });

  assert.equal(status.provider, 'balldontlie');
  assert.equal(status.apiKeyReady, true);
  assert.equal(status.available, true);
  assert.equal(status.overrideApplied, false);
  assert.equal(status.selectionReason, 'configured-key');
  assert.match(status.message, /Fantasy Live league enablement does not control/);
});

test('Statistics Scores exposes exactly three developer source overrides outside production', () => {
  const env = { ...TEST_BDL_ENV, NODE_ENV: 'test' };

  assert.deepEqual(
    ['fixture', 'espn', 'balldontlie'].map((source) => {
      const status = getStatisticsScoresConfigStatus(env, { source });
      return [status.provider, status.overrideAllowed, status.overrideApplied, status.requestedSource, status.available];
    }),
    [
      ['fixture', true, true, 'fixture', true],
      ['espn', true, true, 'espn', true],
      ['balldontlie', true, true, 'balldontlie', true],
    ],
  );

  const invalid = getStatisticsScoresConfigStatus(env, { source: 'synthetic' });
  assert.equal(invalid.provider, 'balldontlie');
  assert.equal(invalid.overrideApplied, false);
  assert.equal(invalid.requestedSource, null);
});

test('Statistics Scores ignores developer overrides in production', () => {
  const withoutKey = getStatisticsScoresConfigStatus(
    { NODE_ENV: 'production', GRIDSHIFT_BDL_API_KEY: '' },
    { source: 'fixture' },
  );
  const withKey = getStatisticsScoresConfigStatus(
    { ...TEST_BDL_ENV, NODE_ENV: 'production' },
    { source: 'espn' },
  );

  assert.equal(withoutKey.provider, 'espn');
  assert.equal(withoutKey.overrideAllowed, false);
  assert.equal(withoutKey.overrideApplied, false);
  assert.equal(withoutKey.requestedSource, null);
  assert.equal(withKey.provider, 'balldontlie');
  assert.equal(withKey.overrideApplied, false);

  const staging = getStatisticsScoresConfigStatus(
    { NODE_ENV: 'staging', GRIDSHIFT_BDL_API_KEY: '' },
    { source: 'fixture' },
  );
  assert.equal(staging.provider, 'espn');
  assert.equal(staging.overrideAllowed, false);
});

test('Statistics Scores fails closed when the server runtime is unset', () => {
  const status = getStatisticsScoresConfigStatus(
    { ...TEST_BDL_ENV },
    { source: 'fixture' },
  );

  assert.equal(status.provider, 'balldontlie');
  assert.equal(status.overrideAllowed, false);
  assert.equal(status.overrideApplied, false);
  assert.equal(status.requestedSource, null);
});

test('Statistics Scores falls back when the configured profile cannot provide games', () => {
  const status = getStatisticsScoresConfigStatus({
    GRIDSHIFT_BDL_API_KEY: 'server-key',
    GRIDSHIFT_BDL_TIER: 'unknown',
  });

  assert.equal(status.provider, 'espn');
  assert.equal(status.available, true);
  assert.equal(status.selectionReason, 'unsupported-capability');
  assert.match(status.message, /cannot provide Scores games/);
});

test('fixture and ESPN developer sources never call the paid upstream API', async () => {
  let requestCount = 0;
  const fetcher = async () => {
    requestCount += 1;
    return { ok: true, json: async () => ({ data: [] }) };
  };
  const env = { NODE_ENV: 'test', GRIDSHIFT_BDL_API_KEY: 'server-key' };

  const fixture = await fetchStatisticsScoresGames({ season: 2026, source: 'fixture', env, fetcher });
  const espn = await fetchStatisticsScoresGames({ season: 2026, source: 'espn', env, fetcher });

  assert.equal(fixture.provider, 'fixture');
  assert.deepEqual(fixture.games, []);
  assert.equal(espn.provider, 'espn');
  assert.deepEqual(espn.games, []);
  assert.equal(requestCount, 0);
});

test('an explicit local BALLDONTLIE source reports a missing server key', async () => {
  const status = getStatisticsScoresConfigStatus(
    { NODE_ENV: 'test', GRIDSHIFT_BDL_API_KEY: '' },
    { source: 'balldontlie' },
  );

  assert.equal(status.provider, 'balldontlie');
  assert.equal(status.available, false);
  assert.equal(status.selectionReason, 'developer-override-missing-key');
  await assert.rejects(
    fetchStatisticsScoresGames({
      season: 2026,
      source: 'balldontlie',
      env: { NODE_ENV: 'test', GRIDSHIFT_BDL_API_KEY: '' },
    }),
    /server-side BALLDONTLIE API key/,
  );
});

test('an explicit local BALLDONTLIE source surfaces upstream failure without fallback', async () => {
  await assert.rejects(
    fetchStatisticsScoresGames({
      season: 2097,
      source: 'balldontlie',
      env: { ...TEST_BDL_ENV, NODE_ENV: 'test' },
      fetcher: async () => ({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Upstream unavailable' }),
      }),
    }),
    /Upstream unavailable/,
  );
});

test('automatic and overridden BALLDONTLIE responses keep distinct status metadata', async () => {
  let requestCount = 0;
  const options = {
    season: 2096,
    env: { ...TEST_BDL_ENV, NODE_ENV: 'test' },
    fetcher: async () => {
      requestCount += 1;
      return { ok: true, json: async () => ({ data: [], meta: null }) };
    },
  };

  const automatic = await fetchStatisticsScoresGames(options);
  const overridden = await fetchStatisticsScoresGames({ ...options, source: 'balldontlie' });

  assert.equal(automatic.overrideApplied, false);
  assert.equal(automatic.selectionReason, 'configured-key');
  assert.equal(overridden.overrideApplied, true);
  assert.equal(overridden.selectionReason, 'developer-override');
  assert.equal(requestCount, 1);
});

test('Statistics Scores keeps ESPN as the deliberate no-key fallback', async () => {
  let requestCount = 0;
  const result = await fetchStatisticsScoresGames({
    season: 2026,
    env: { GRIDSHIFT_BDL_API_KEY: '   ' },
    fetcher: async () => {
      requestCount += 1;
      return { ok: true, json: async () => ({ data: [] }) };
    },
  });

  assert.equal(result.provider, 'espn');
  assert.equal(result.selectionReason, 'no-api-key');
  assert.deepEqual(result.games, []);
  assert.equal(requestCount, 0);
});

test('Statistics Scores fetches the configured BDL season without a Fantasy Live session', async () => {
  const requests = [];
  const result = await fetchStatisticsScoresGames({
    season: 2098,
    env: { ...TEST_BDL_ENV },
    fetcher: async (url, options) => {
      requests.push({ url: String(url), options });
      const cursor = new URL(url).searchParams.get('cursor');
      return {
        ok: true,
        json: async () => cursor
          ? { data: [{ id: 2 }], meta: { per_page: 100 } }
          : { data: [{ id: 1 }], meta: { next_cursor: 42, per_page: 100 } },
      };
    },
  });

  assert.equal(result.provider, 'balldontlie');
  assert.deepEqual(result.games.map((game) => game.id), [1, 2]);
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /seasons%5B%5D=2098/);
  assert.deepEqual(new URL(requests[0].url).searchParams.getAll('season_type[]'), ['2', '3']);
  assert.deepEqual(new URL(requests[0].url).searchParams.getAll('season_type[]').includes('1'), false);
  assert.equal(requests[0].options.headers.Authorization, 'server-key');
  assert.equal(new URL(requests[1].url).searchParams.get('cursor'), '42');
});

test('Statistics Scores requests only BALLDONTLIE preseason rows for the preseason phase', async () => {
  const requests = [];
  const result = await fetchStatisticsScoresGames({
    season: 2099,
    phase: 'preseason',
    source: 'balldontlie',
    env: { ...TEST_BDL_ENV, NODE_ENV: 'test' },
    fetcher: async (url) => {
      requests.push(String(url));
      return {
        ok: true,
        json: async () => ({ data: [{ id: 11, week: 1 }], meta: null }),
      };
    },
  });

  const params = new URL(requests[0]).searchParams;
  assert.equal(result.phase, 'preseason');
  assert.deepEqual(result.games.map((game) => game.id), [11]);
  assert.deepEqual(params.getAll('season_type[]'), ['1']);
});

test('Statistics Scores separates BALLDONTLIE cache entries by phase', async () => {
  const seasonTypes = [];
  const options = {
    season: 2100,
    source: 'balldontlie',
    env: { ...TEST_BDL_ENV, NODE_ENV: 'test' },
    fetcher: async (url) => {
      const type = new URL(url).searchParams.getAll('season_type[]');
      seasonTypes.push(type);
      return { ok: true, json: async () => ({ data: [{ id: type[0] }], meta: null }) };
    },
  };

  const preseason = await fetchStatisticsScoresGames({ ...options, phase: 'preseason' });
  const regular = await fetchStatisticsScoresGames({ ...options, phase: 'regular' });

  assert.deepEqual(seasonTypes, [['1'], ['2', '3']]);
  assert.deepEqual(preseason.games.map((game) => game.id), ['1']);
  assert.deepEqual(regular.games.map((game) => game.id), ['2']);
});

test('selected-week live Scores requests only one narrow BALLDONTLIE week snapshot', async () => {
  const requests = [];
  const result = await fetchStatisticsScoresLiveWeek({
    season: 2120,
    phase: 'regular',
    week: 7,
    env: { ...TEST_BDL_ENV },
    fetcher: async (url) => {
      requests.push(String(url));
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 17 }], meta: null }) };
    },
  });

  assert.equal(result.provider, 'balldontlie');
  assert.deepEqual(result.games.map((game) => game.id), [17]);
  assert.equal(result.cadence.scoresLiveMs, 1_000);
  assert.equal(result.freshness.stale, false);
  assert.equal(result.cache.coalesced, false);
  assert.equal(requests.length, 1);
  const params = new URL(requests[0]).searchParams;
  assert.deepEqual(params.getAll('seasons[]'), ['2120']);
  assert.deepEqual(params.getAll('weeks[]'), ['7']);
  assert.deepEqual(params.getAll('season_type[]'), ['2']);
  assert.equal(params.has('cursor'), false);
});

test('selected-week live Scores carries the canonical latest play in the same response', async () => {
  const requests = [];
  const result = await fetchStatisticsScoresLiveWeek({
    season: 2123,
    phase: 'regular',
    week: 8,
    env: { ...TEST_BDL_ENV },
    fetcher: async (url) => {
      const parsed = new URL(url);
      requests.push(parsed);
      if (parsed.pathname === '/nfl/v1/plays') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{ id: 'snap-1', period: 2, clock_display: '08:41', text: 'Pass complete.' }],
            meta: { next_cursor: null },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: 1701, status_state: 'in_progress', status: '8:45 - 2nd' }],
          meta: null,
        }),
      };
    },
  });

  assert.equal(requests.length, 2);
  assert.equal(result.liveGameSnapshots.length, 1);
  assert.equal(result.liveGameSnapshots[0].gameId, '1701');
  assert.equal(result.liveGameSnapshots[0].latestPlay.id, 'snap-1');
  assert.equal(result.liveGameSnapshots[0].freshness.refreshAfterMs, 8_000);
  assert.equal(requests[1].searchParams.get('game_id'), '1701');
  assert.equal(requests[1].searchParams.get('season_type'), '2');
});

test('selected-week live Scores falls back to ESPN when the paid live lane is unavailable', async () => {
  const requests = [];
  const result = await fetchStatisticsScoresLiveWeek({
    season: 2121,
    phase: 'preseason',
    week: 2,
    env: { GRIDSHIFT_BDL_API_KEY: '' },
    fetcher: async (url) => {
      requests.push(String(url));
      return { ok: true, status: 200, json: async () => ({ events: [{ id: 'espn-1' }] }) };
    },
  });

  assert.equal(result.provider, 'espn');
  assert.equal(result.fallbackReason, 'no-balldontlie-key');
  assert.equal(result.scoreboard.events[0].id, 'espn-1');
  assert.equal(result.cache.stale, false);
  assert.equal(result.freshness.providerFetchedAt, result.cache.fetchedAt);
  assert.equal(requests.length, 1);
  assert.match(requests[0], /site\.api\.espn\.com/);
});

test('selected-week live Scores falls back to ESPN after a BALLDONTLIE outage', async () => {
  const requests = [];
  const result = await fetchStatisticsScoresLiveWeek({
    season: 2122,
    phase: 'regular',
    week: 3,
    env: { ...TEST_BDL_ENV },
    fetcher: async (url) => {
      const parsed = new URL(url);
      requests.push(parsed.hostname);
      if (parsed.hostname === 'api.balldontlie.io') {
        return { ok: false, status: 503, json: async () => ({ error: 'upstream down' }) };
      }
      return { ok: true, status: 200, json: async () => ({ events: [] }) };
    },
  });

  assert.equal(result.provider, 'espn');
  assert.equal(result.fallbackReason, 'balldontlie-unavailable');
  assert.deepEqual(requests, ['api.balldontlie.io', 'site.api.espn.com']);
});
