import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getStatisticsScoresEspnWeek,
  getStatisticsScoresGameDetail,
  getStatisticsScoresGamePlays,
  getStatisticsScoresGames,
  getStatisticsScoresPreseason,
  getStatisticsScoresStatus,
  getStatisticsScoresStory,
} from '../../src/api/statisticsScoresApi.js';

async function captureRequest(run) {
  const originalFetch = globalThis.fetch;
  let request = null;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    const phase = new URL(String(url), 'http://gridshift.test').searchParams.get('phase');
    return { ok: true, json: async () => ({ ok: true, ...(phase ? { phase } : {}) }) };
  };
  try {
    await run();
    return request;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('Statistics Scores browser API serializes only source names and season values', async () => {
  const status = await captureRequest(() => getStatisticsScoresStatus({ source: 'fixture' }));
  const games = await captureRequest(() => getStatisticsScoresGames({
    season: 2026,
    phase: 'preseason',
    source: 'balldontlie',
  }));
  const preseason = await captureRequest(() => getStatisticsScoresPreseason({ season: 2026, source: 'espn' }));

  assert.equal(status.url, '/api/statistics/scores/status?source=fixture');
  assert.equal(games.url, '/api/statistics/scores/games?season=2026&source=balldontlie&phase=preseason');
  assert.equal(preseason.url, '/api/statistics/scores/preseason?season=2026&source=espn');
  assert.deepEqual(status.options.headers, { Accept: 'application/json' });
  assert.equal(JSON.stringify([status, games, preseason]).includes('server-key'), false);
});

test('Statistics Scores browser API requests the shared ESPN live-week route without provider secrets', async () => {
  const request = await captureRequest(() => getStatisticsScoresEspnWeek({
    season: 2026,
    phase: 'regular',
    week: 3,
  }));

  assert.equal(request.url, '/api/statistics/scores/espn-week?season=2026&week=3&phase=regular');
  assert.deepEqual(request.options.headers, { Accept: 'application/json' });
  assert.equal(request.url.includes('source='), false);
});

test('Statistics Scores browser API requests BALLDONTLIE detail through the Scores boundary', async () => {
  const [detail, plays] = await Promise.all([
    captureRequest(() => getStatisticsScoresGameDetail(1393548, { phase: 'preseason' })),
    captureRequest(() => getStatisticsScoresGamePlays(1393548)),
  ]);

  assert.equal(detail.url, '/api/statistics/scores/game/1393548/detail?phase=preseason');
  assert.equal(plays.url, '/api/statistics/scores/game/1393548/plays');
  assert.deepEqual(detail.options.headers, { Accept: 'application/json' });
  assert.equal(JSON.stringify([detail, plays]).includes('server-key'), false);
});

test('Statistics Scores browser API requests StoryStats through the server boundary', async () => {
  const request = await captureRequest(() => getStatisticsScoresStory(1393548, 'live'));

  assert.equal(request.url, '/api/statistics/scores/game/1393548/story?phase=live');
  assert.deepEqual(request.options.headers, { Accept: 'application/json' });
  assert.equal(JSON.stringify(request).includes('server-key'), false);
});

test('Statistics Scores status keeps its existing URL when no override is supplied', async () => {
  const request = await captureRequest(() => getStatisticsScoresStatus());
  assert.equal(request.url, '/api/statistics/scores/status');
});

test('Statistics Scores browser API does not serialize unsupported source names', async () => {
  const request = await captureRequest(() => getStatisticsScoresStatus({ source: 'synthetic' }));
  assert.equal(request.url, '/api/statistics/scores/status');
});

test('Statistics Scores browser API does not serialize unsupported phase names', async () => {
  const request = await captureRequest(() => getStatisticsScoresGames({
    season: 2026,
    phase: 'postseason',
    source: 'balldontlie',
  }));
  assert.equal(request.url, '/api/statistics/scores/games?season=2026&source=balldontlie');
});

test('Statistics Scores reports a stale local sidecar instead of rendering the wrong phase', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ ok: true, phase: 'regular', games: [] }),
  });
  try {
    await assert.rejects(
      getStatisticsScoresGames({ season: 2026, phase: 'preseason', source: 'balldontlie' }),
      /Restart npm run dev/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
