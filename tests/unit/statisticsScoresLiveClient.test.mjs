import assert from 'node:assert/strict';
import test from 'node:test';
import { getStatisticsScoresLiveWeek } from '../../src/api/statisticsScoresApi.js';
import {
  mergeBdlLatestPlayClock,
  mergeBdlLatestPlayScore,
  normalizeBdlScorePlay,
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
  const observedAt = Date.parse('2026-09-06T01:02:04.000Z');
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
  }, 1, { observedAt });
  const updatedGame = updated.weeks[0].games[0];

  assert.equal(updatedGame.id, 'bdl-7001');
  assert.equal(updatedGame.providerGameId, '7001');
  assert.equal(updatedGame.bdlGameId, '7001');
  assert.equal(updatedGame.detailsProvider, 'balldontlie');
  assert.equal(updatedGame.statusLabel, 'Q1 · 9:58');
  assert.deepEqual(updatedGame.score, { away: 7, home: 10 });
  assert.equal(updatedGame.live.providerClockAnchor.changedAt, Date.parse('2026-09-06T01:02:03.000Z'));
  assert.equal(updatedGame.live.providerClockAnchor.observedAt, observedAt);
  assert.equal(updatedGame.asOf, '2026-09-06T01:02:03.000Z');
  assert.equal(updated.metadata.cadence.scoresLiveMs, 1000);
});

test('holds a previously live game as stale when the selected-week snapshot omits it', () => {
  const season = normalizeBdlScoreboardSeason({
    data: [{
      ...game,
      status_state: 'in_progress',
      status: '10:03 - 1st',
    }],
    freshness: {
      providerFetchedAt: '2026-09-06T01:02:03.000Z',
      receivedAt: '2026-09-06T01:02:04.000Z',
      stale: false,
    },
  }, { season: 2026, phase: NFL_SEASON_PHASES.REGULAR });
  const updated = overlayBdlScoreboardWeek(season, {
    games: [],
    freshness: {
      providerFetchedAt: '2026-09-06T01:02:13.000Z',
      stale: false,
    },
  }, 1, { observedAt: Date.parse('2026-09-06T01:02:14.000Z') });
  const updatedGame = updated.weeks[0].games[0];

  assert.equal(updatedGame.status, 'live');
  assert.equal(updatedGame.live.clock, '10:03');
  assert.equal(updatedGame.live.providerClockAnchor.feedStale, true);
});

test('uses a newer BDL play clock without overwriting a newer game snapshot', () => {
  const season = normalizeBdlScoreboardSeason({
    data: [{
      ...game,
      status_state: 'in_progress',
      status: '10:03 - 1st',
    }],
    freshness: {
      providerFetchedAt: '2026-09-06T01:02:03.000Z',
      receivedAt: '2026-09-06T01:02:04.000Z',
      stale: false,
    },
  }, { season: 2026, phase: NFL_SEASON_PHASES.REGULAR });
  const baseGame = season.weeks[0].games[0];
  const latestPlay = normalizeBdlScorePlay({
    id: 'p2',
    period: 1,
    clock_display: '9:58',
    wallclock: '2026-09-06T01:02:05.000Z',
    text: 'Pass complete for 5 yards.',
    start_down: 2,
    start_distance: 11,
    start_yards_to_endzone: 18,
    start_possession_text: 'BAL 18',
    team: { abbreviation: 'BAL' },
  }, baseGame);
  const fromPlay = mergeBdlLatestPlayClock(baseGame, {
    play: latestPlay,
    updatedAt: Date.parse('2026-09-06T01:02:06.000Z'),
    clockAnchorAt: latestPlay.wallclock,
  });

  assert.equal(fromPlay.live.period, '1');
  assert.equal(fromPlay.live.clock, '9:58');
  assert.equal(fromPlay.live.possession, 'BAL');
  assert.equal(fromPlay.live.downDistance, '2nd & 11');
  assert.equal(fromPlay.live.fieldPosition, 'BAL 18');
  assert.equal(fromPlay.live.redZone, true);
  assert.equal(fromPlay.live.providerClockAnchor.changedAt, Date.parse('2026-09-06T01:02:05.000Z'));

  const newerSnapshot = mergeBdlLatestPlayClock({
    ...baseGame,
    live: { ...baseGame.live, period: '1', clock: '9:42' },
  }, {
    play: latestPlay,
    updatedAt: Date.parse('2026-09-06T01:02:06.000Z'),
    clockAnchorAt: latestPlay.wallclock,
  });
  assert.equal(newerSnapshot.live.clock, '9:42');
});

test('derives BALLDONTLIE red-zone state from the displayed starting spot', () => {
  const season = normalizeBdlScoreboardSeason({
    data: [{
      ...game,
      status_state: 'in_progress',
      status: '0:50 - 2nd',
    }],
  }, { season: 2026, phase: NFL_SEASON_PHASES.REGULAR });
  const baseGame = season.weeks[0].games[0];
  const longFieldGoal = normalizeBdlScorePlay({
    id: 'field-goal-from-den-41',
    period: 2,
    clock_display: '0:50',
    text: 'Trey Smack made a 59 yard field goal.',
    type_slug: 'field-goal-good',
    start_down: 4,
    start_distance: 5,
    start_yards_to_endzone: 41,
    end_yards_to_endzone: 0,
    start_possession_text: 'DEN 41',
    team: { abbreviation: 'GB' },
    scoring_play: true,
  }, baseGame);

  const updated = mergeBdlLatestPlayClock(baseGame, {
    play: longFieldGoal,
    stale: false,
  });

  assert.equal(updated.live.downDistance, '4th & 5');
  assert.equal(updated.live.fieldPosition, 'DEN 41');
  assert.equal(updated.live.redZone, false);
});

test('uses a newer BDL play score when the score snapshot is behind it', () => {
  const season = normalizeBdlScoreboardSeason({
    data: [{
      ...game,
      status_state: 'in_progress',
      status: '10:03 - 1st',
      visitor_team_score: 3,
      home_team_score: 7,
    }],
  }, { season: 2026, phase: NFL_SEASON_PHASES.REGULAR });
  const baseGame = season.weeks[0].games[0];
  const latestPlay = normalizeBdlScorePlay({
    id: 'field-goal-good',
    period: 1,
    clock_display: '9:58',
    wallclock: '2026-09-06T01:02:05.000Z',
    text: 'Field goal is good.',
    team: { abbreviation: 'BAL' },
    scoring_play: true,
    away_score: 6,
    home_score: 7,
  }, baseGame);

  const updated = mergeBdlLatestPlayScore(baseGame, {
    play: latestPlay,
    stale: false,
  });

  assert.deepEqual(updated.score, { away: 6, home: 7 });
  assert.equal(updated.awayScore, 6);
  assert.equal(updated.homeScore, 7);
});

test('does not roll a scorecard back from an older latest play', () => {
  const season = normalizeBdlScoreboardSeason({
    data: [{
      ...game,
      status_state: 'in_progress',
      status: '9:58 - 1st',
      visitor_team_score: 6,
      home_team_score: 7,
    }],
  }, { season: 2026, phase: NFL_SEASON_PHASES.REGULAR });
  const baseGame = season.weeks[0].games[0];
  const olderPlay = normalizeBdlScorePlay({
    id: 'field-goal-attempt',
    period: 1,
    clock_display: '10:03',
    text: 'Pass complete.',
    team: { abbreviation: 'BAL' },
    away_score: 3,
    home_score: 7,
  }, baseGame);

  const updated = mergeBdlLatestPlayScore(baseGame, {
    play: olderPlay,
    stale: false,
  });

  assert.deepEqual(updated.score, { away: 6, home: 7 });
});

test('does not roll a score backward when Games already includes a same-clock conversion', () => {
  const season = normalizeBdlScoreboardSeason({
    data: [{
      ...game,
      status_state: 'in_progress',
      status: '3:12 - 4th',
      visitor_team_score: 34,
      home_team_score: 17,
    }],
  }, { season: 2026, phase: NFL_SEASON_PHASES.REGULAR });
  const baseGame = season.weeks[0].games[0];
  const touchdownBeforeConversion = normalizeBdlScorePlay({
    id: 'touchdown-before-conversion',
    period: 4,
    clock_display: '3:12',
    text: 'Pass complete for a touchdown.',
    team: { abbreviation: 'KC' },
    scoring_play: true,
    away_score: 34,
    home_score: 15,
  }, baseGame);

  const updated = mergeBdlLatestPlayScore(baseGame, {
    play: touchdownBeforeConversion,
    stale: false,
    updatedAt: Date.parse('2026-09-06T01:02:06.000Z'),
  });

  assert.deepEqual(updated.score, { away: 34, home: 17 });
});

test('uses a newer latest-play response when its scoring event clock is earlier', () => {
  const season = normalizeBdlScoreboardSeason({
    data: [{
      ...game,
      status_state: 'in_progress',
      status: '9:58 - 1st',
      visitor_team_score: 3,
      home_team_score: 7,
    }],
    freshness: {
      providerFetchedAt: '2026-09-06T01:02:03.000Z',
    },
  }, { season: 2026, phase: NFL_SEASON_PHASES.REGULAR });
  const baseGame = season.weeks[0].games[0];
  const latestPlay = normalizeBdlScorePlay({
    id: 'field-goal-good-earlier-clock',
    period: 1,
    clock_display: '10:03',
    text: 'Field goal is good.',
    team: { abbreviation: 'BAL' },
    scoring_play: true,
    away_score: 6,
    home_score: 7,
  }, baseGame);

  const updated = mergeBdlLatestPlayScore(baseGame, {
    play: latestPlay,
    stale: false,
    updatedAt: new Date('2026-09-06T01:02:05.000Z'),
  });

  assert.deepEqual(updated.score, { away: 6, home: 7 });
});

test('uses an official timeout clock to correct a locally advanced scorebug and hold it', () => {
  const season = normalizeBdlScoreboardSeason({
    data: [{
      ...game,
      status_state: 'in_progress',
      status: '12:38 - 3rd',
    }],
    freshness: {
      providerFetchedAt: '2026-09-06T01:02:03.000Z',
      receivedAt: '2026-09-06T01:02:04.000Z',
      stale: false,
    },
  }, { season: 2026, phase: NFL_SEASON_PHASES.REGULAR });
  const baseGame = season.weeks[0].games[0];
  const timeoutPlay = normalizeBdlScorePlay({
    id: 'timeout-1',
    period: 3,
    clock_display: '12:48',
    wallclock: '2026-09-06T01:02:05.000Z',
    type_slug: 'official-timeout',
    type_text: 'Official Timeout',
    text: 'Official timeout.',
    team: { abbreviation: 'BAL' },
  }, baseGame);
  const fromPlay = mergeBdlLatestPlayClock(baseGame, {
    play: timeoutPlay,
    updatedAt: Date.parse('2026-09-06T01:02:06.000Z'),
    clockAnchorAt: timeoutPlay.wallclock,
  });

  assert.equal(fromPlay.live.clock, '12:48');
  assert.equal(fromPlay.live.providerClockAnchor.providerClockFrozen, true);
});
