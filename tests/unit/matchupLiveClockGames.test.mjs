import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBdlLiveClockGames,
  normalizeBdlScoreboardSeason,
  overlayBdlScoreboardWeek,
} from '../../src/utils/balldontlieNflScoreboard.js';
import { NFL_SEASON_PHASES } from '../../src/utils/espnNflScoreboard.js';
import {
  EMPTY_CLOCK_STATE,
  advanceLiveClockState,
  getClockSampleTiming,
} from '../../src/utils/matchupLiveClockState.js';
import { createLiveClockTicker, getLiveClockGameKey, isTickingClockGame } from '../../src/utils/liveClockTicker.js';

// Fantasy Matchups' ticking-clock games (useMatchupLiveFeed's clockGamesById):
// the same anchor and latest-play rules as Statistics Scores, kept apart from
// the raw games list the live layer reads.

const T0 = Date.parse('2026-09-06T01:02:04.000Z');
const FEED = 'feed-7';

function rawGame(overrides = {}) {
  return {
    id: 7001,
    visitor_team: { abbreviation: 'BAL', full_name: 'Baltimore Ravens' },
    home_team: { abbreviation: 'KC', full_name: 'Kansas City Chiefs' },
    week: 1,
    season: 2026,
    date: '2026-09-06T00:20:00.000Z',
    status: '10:03 - 1st',
    status_state: 'in_progress',
    period: 1,
    time: '10:03',
    visitor_team_score: 0,
    home_team_score: 3,
    ...overrides,
  };
}

function rawPlay(overrides = {}) {
  return {
    id: 'p1',
    period: 1,
    clock_display: '10:03',
    wallclock: '2026-09-06T01:01:00.000Z',
    text: 'Pass complete for 5 yards.',
    team: { abbreviation: 'BAL' },
    ...overrides,
  };
}

function gamesPayload(games, ageMs = 400) {
  return { ok: true, data: games, freshness: { providerFetchedAt: '2026-09-06T01:02:03.000Z', ageMs, stale: false } };
}

function pollGames(state, games, observedAt, options = {}) {
  const payload = gamesPayload(games, options.ageMs);
  const gamesSample = getClockSampleTiming(payload, observedAt);
  return advanceLiveClockState(state, FEED, () => ({ rawGames: payload.data, gamesSample }), { enabled: options.enabled ?? true });
}

function pollPlays(state, gameId, plays, observedAt, ageMs = 300) {
  const payload = { ok: true, data: plays, freshness: { providerFetchedAt: '2026-09-06T01:02:05.000Z', ageMs, stale: false } };
  const timing = getClockSampleTiming(payload, observedAt);
  const latest = plays.at(-1) ?? null;
  return advanceLiveClockState(state, FEED, (base) => ({
    latestPlays: { ...base.latestPlays, [gameId]: latest ? { play: latest, ...timing, stale: false } : null },
  }));
}

test('a live BALLDONTLIE row becomes a ticking clock game anchored at receipt minus the server age', () => {
  const state = pollGames(EMPTY_CLOCK_STATE, [rawGame()], T0);
  const game = state.clockGames.get('7001');

  assert.equal(game.bdlGameId, '7001');
  assert.equal(game.provider, 'balldontlie');
  assert.equal(game.status, 'live');
  assert.equal(game.live.clock, '10:03');
  assert.equal(game.live.providerClockAnchor.changedAt, T0 - 400);
  assert.equal(game.live.providerClockAnchor.sampleAgeMs, 400);
  // No play sample yet: it cannot see stoppages, so it stays stepped.
  assert.equal(isTickingClockGame(game), false);
  const withPlay = pollPlays(state, '7001', [rawPlay({ clock_display: '10:20' })], T0 + 500);
  assert.equal(isTickingClockGame(withPlay.clockGames.get('7001')), true);
});

test('Fantasy and Scores share one clock key for a game', () => {
  const state = pollGames(EMPTY_CLOCK_STATE, [rawGame()], T0);
  const scoresSeason = normalizeBdlScoreboardSeason({ data: [rawGame()] }, { season: 2026, phase: NFL_SEASON_PHASES.REGULAR });
  assert.equal(getLiveClockGameKey(state.clockGames.get('7001')), 'bdl:7001');
  assert.equal(getLiveClockGameKey(scoresSeason.weeks[0].games[0]), 'bdl:7001');
});

test('the anchor is carried across polls and an unchanged poll keeps the previous state', () => {
  const first = pollGames(EMPTY_CLOCK_STATE, [rawGame()], T0);
  const second = pollGames(first, [rawGame()], T0 + 5000, { ageMs: 900 });
  assert.equal(second, first);
  assert.equal(second.clockGames.get('7001').live.providerClockAnchor.changedAt, T0 - 400);

  // A changed row elsewhere (the score) keeps the clock entry and its anchor.
  const scored = pollGames(second, [rawGame({ home_team_score: 10 })], T0 + 10_000);
  assert.notEqual(scored, second);
  assert.equal(scored.clockGames, second.clockGames);

  const moved = pollGames(scored, [rawGame({ status: '9:41 - 1st', time: '9:41' })], T0 + 15_000, { ageMs: 200 });
  assert.equal(moved.clockGames.get('7001').live.providerClockAnchor.changedAt, T0 + 15_000 - 200);
  assert.notEqual(moved.clockGames, scored.clockGames);
});

test('the raw games list is never touched', () => {
  const games = [rawGame()];
  const snapshot = JSON.stringify(games);
  const state = pollGames(EMPTY_CLOCK_STATE, games, T0);
  assert.equal(state.rawGames, games);
  assert.equal(JSON.stringify(games), snapshot);
  assert.equal('live' in games[0], false);
});

test('a newer latest play stands in for the games clock with a steady anchor across polls', () => {
  let state = pollGames(EMPTY_CLOCK_STATE, [rawGame()], T0);
  state = pollPlays(state, '7001', [rawPlay(), rawPlay({ id: 'p2', clock_display: '9:58' })], T0 + 1000);
  const fromPlay = state.clockGames.get('7001');
  assert.equal(fromPlay.live.clock, '9:58');
  assert.equal(fromPlay.statusLabel, 'Q1 · 9:58');
  assert.equal(fromPlay.latestPlay.play.id, 'p2');
  // Receipt minus the plays response age, never the play's wallclock.
  assert.equal(fromPlay.live.providerClockAnchor.changedAt, T0 + 1000 - 300);

  // The games feed still says 10:03 on the next polls: the play keeps standing
  // in, and its anchor does not move.
  const next = pollGames(state, [rawGame()], T0 + 5000);
  const later = pollGames(next, [rawGame()], T0 + 10_000, { ageMs: 50 });
  assert.equal(later.clockGames.get('7001').live.clock, '9:58');
  assert.equal(later.clockGames.get('7001').live.providerClockAnchor.changedAt, T0 + 1000 - 300);
});

test('Scores keeps the same steady anchor while one play overrides the games clock', () => {
  const season = normalizeBdlScoreboardSeason({ data: [rawGame()] }, { season: 2026, phase: NFL_SEASON_PHASES.REGULAR });
  const snapshot = (fetchedAt, ageMs) => ({
    games: [rawGame()],
    freshness: { providerFetchedAt: fetchedAt, ageMs, stale: false },
    liveGameSnapshots: [{
      gameId: 7001,
      latestPlay: rawPlay({ id: 'p2', clock_display: '9:58' }),
      freshness: { providerFetchedAt: '2026-09-06T01:02:05.000Z', ageMs, stale: false },
    }],
  });
  const first = overlayBdlScoreboardWeek(season, snapshot('2026-09-06T01:02:05.000Z', 100), 1, { observedAt: T0 + 1000 });
  const second = overlayBdlScoreboardWeek(first, snapshot('2026-09-06T01:02:05.000Z', 100), 1, { observedAt: T0 + 2000 });
  const firstGame = first.weeks[0].games[0];
  const secondGame = second.weeks[0].games[0];
  assert.equal(firstGame.live.clock, '9:58');
  assert.equal(secondGame.live.clock, '9:58');
  assert.equal(secondGame.live.providerClockAnchor.changedAt, firstGame.live.providerClockAnchor.changedAt);
  assert.equal(firstGame.live.providerClockAnchor.changedAt, T0 + 1000 - 100);
});

test('an older ordinary play never rolls the clock up, a timeout does and holds it with a reason', () => {
  let state = pollGames(EMPTY_CLOCK_STATE, [rawGame({ status: '9:30 - 1st', time: '9:30' })], T0);
  state = pollPlays(state, '7001', [rawPlay({ clock_display: '9:41', type_slug: 'pass-incompletion', text: 'Pass incomplete.' })], T0 + 1000);
  assert.equal(state.clockGames.get('7001').live.clock, '9:30');

  state = pollPlays(state, '7001', [rawPlay({ id: 't1', clock_display: '9:34', type_slug: 'timeout', type_text: 'Timeout', text: 'Timeout #1 by BAL.' })], T0 + 2000);
  const held = state.clockGames.get('7001');
  assert.equal(held.live.clock, '9:34');
  assert.equal(held.live.providerClockAnchor.providerClockFrozen, true);

  const ticker = createLiveClockTicker({ now: () => T0 + 6000, documentTarget: null, windowTarget: null, navigatorTarget: null });
  const resolved = ticker.resolveGame(held);
  assert.equal(resolved.label, 'Q1 · 9:34');
  assert.equal(resolved.stopReason, 'Timeout');
});

test('a play that lands before its games keeps its sample for the first games poll', () => {
  const playsFirst = pollPlays(EMPTY_CLOCK_STATE, '7001', [rawPlay({ id: 'p2', clock_display: '9:58' })], T0);
  assert.equal(playsFirst.clockGames.size, 0);
  const state = pollGames(playsFirst, [rawGame()], T0 + 500);
  assert.equal(state.clockGames.get('7001').live.clock, '9:58');
});

test('the dev sandbox, other feeds and non-live or non-BALLDONTLIE rows never tick', () => {
  const sandbox = pollGames(EMPTY_CLOCK_STATE, [rawGame()], T0, { enabled: false });
  assert.equal(sandbox.clockGames.size, 0);

  const espnRow = { id: '401', competitions: [{ status: { type: { state: 'in' } } }] };
  const rows = [
    espnRow,
    rawGame({ id: 1, status: 'Halftime', status_state: 'in_progress', time: null }),
    rawGame({ id: 2, status: 'Final', status_state: 'post', time: null }),
    rawGame({ id: 3, status: 'Scheduled', status_state: 'pre', period: 0, time: null }),
  ];
  const state = pollGames(EMPTY_CLOCK_STATE, rows, T0);
  assert.equal(state.clockGames.size, 0);

  // A payload for another feed starts over instead of carrying anchors.
  const live = pollGames(EMPTY_CLOCK_STATE, [rawGame()], T0);
  const other = advanceLiveClockState(live, 'feed-8', () => ({ rawGames: [], gamesSample: getClockSampleTiming({}, T0) }));
  assert.equal(other.key, 'feed-8');
  assert.equal(other.clockGames.size, 0);
});

test('without a sample the builder returns no clock games', () => {
  assert.equal(buildBdlLiveClockGames(new Map(), [rawGame()], {}).size, 0);
});

test('the same sample shows the same second on Scores and Fantasy', () => {
  const observedAt = T0;
  const payload = { data: [rawGame()], games: [rawGame()], freshness: { providerFetchedAt: '2026-09-06T01:02:03.000Z', ageMs: 400, stale: false } };
  const season = normalizeBdlScoreboardSeason({ data: [rawGame({ status: '10:20 - 1st', time: '10:20' })] }, { season: 2026, phase: NFL_SEASON_PHASES.REGULAR });
  const scoresGame = overlayBdlScoreboardWeek(season, payload, 1, { observedAt }).weeks[0].games[0];
  const fantasyGame = pollGames(EMPTY_CLOCK_STATE, payload.data, observedAt).clockGames.get('7001');
  assert.equal(scoresGame.live.providerClockAnchor.changedAt, fantasyGame.live.providerClockAnchor.changedAt);

  const ticker = createLiveClockTicker({ now: () => T0 + 3000, documentTarget: null, windowTarget: null, navigatorTarget: null });
  const fromScores = ticker.resolveGame(scoresGame);
  const fromFantasy = ticker.resolveGame(fantasyGame);
  assert.equal(fromScores.label, fromFantasy.label);
});
