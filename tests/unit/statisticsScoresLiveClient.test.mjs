import assert from 'node:assert/strict';
import test from 'node:test';
import { getStatisticsScoresLiveWeek } from '../../src/api/statisticsScoresApi.js';
import {
  normalizeBdlScoreboardSeason,
  overlayBdlScoreboardWeek,
} from '../../src/utils/balldontlieNflScoreboard.js';
import { NFL_SEASON_PHASES } from '../../src/utils/espnNflScoreboard.js';

const game = {
  id: 7001,
  visitor_team: { abbreviation: 'BAL', full_name: 'Baltimore Ravens' },
  home_team: { abbreviation: 'KC', full_name: 'Kansas City Chiefs' },
  venue: 'GEHA Field at Arrowhead Stadium',
  week: 1,
  date: '2026-09-06T00:20:00.000Z',
  season: 2026,
  home_team_score: 3,
  visitor_team_score: 0,
};

test('requests the provider-selected live-week route without provider secrets', async () => {
  const originalFetch = globalThis.fetch;
  let request = null;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return { ok: true, json: async () => ({ ok: true, phase: 'preseason' }) };
  };
  try {
    await getStatisticsScoresLiveWeek({ season: 2026, phase: 'preseason', week: 2 });
    assert.equal(request.url, '/api/statistics/scores/live-week?season=2026&week=2&phase=preseason');
    assert.deepEqual(request.options.headers, { Accept: 'application/json' });
    assert.equal(request.url.includes('source='), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('overlays a selected-week BALLDONTLIE snapshot without losing stable detail identity', () => {
  const season = normalizeBdlScoreboardSeason({ data: [{
    ...game,
    status_state: 'in_progress',
    status: '10:03 - 1st',
  }] }, { season: 2026, phase: NFL_SEASON_PHASES.REGULAR });
  const updated = overlayBdlScoreboardWeek(season, {
    games: [{
      ...game,
      status_state: 'in_progress',
      status: '9:58 - 1st',
      visitor_team_score: 7,
      home_team_score: 10,
    }],
    freshness: {
      stale: false,
      providerFetchedAt: '2026-09-06T01:02:03.000Z',
    },
    cadence: { scoresLiveMs: 1000 },
  }, 1, { observedAt: 123_000 });
  const updatedGame = updated.weeks[0].games[0];

  assert.equal(updatedGame.id, 'bdl-7001');
  assert.equal(updatedGame.providerGameId, '7001');
  assert.equal(updatedGame.bdlGameId, '7001');
  assert.equal(updatedGame.detailsProvider, 'balldontlie');
  assert.equal(updatedGame.statusLabel, 'Q1 · 9:58');
  assert.deepEqual(updatedGame.score, { away: 7, home: 10 });
  assert.equal(updatedGame.live.providerClockAnchor.changedAt, 123_000);
  assert.equal(updatedGame.asOf, '2026-09-06T01:02:03.000Z');
  assert.equal(updated.metadata.cadence.scoresLiveMs, 1000);
});
