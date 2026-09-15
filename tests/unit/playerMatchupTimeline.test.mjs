import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildPlayerTimelineEvents, findPlayerTimelineGame, loadPlayerMatchupTimeline } from '../../src/utils/playerMatchupTimeline.js';

const game = { id: 42, season: 2026, week: 2, season_type: 2, home_team: { abbreviation: 'NYG' }, visitor_team: { abbreviation: 'DAL' } };
const players = {
  passer: { full_name: 'Jameis Winston', position: 'QB', team: 'NYG' },
  receiver: { full_name: "Wan'Dale Robinson", position: 'WR', team: 'NYG' },
};
const scoringSettings = { pass_yd: 0.04, pass_td: 4, pass_int: -2, rush_yd: 0.1, rec: 1, rec_yd: 0.1, rec_td: 6 };
const touchdown = { id: 'td', period: 2, clock_display: '8:10', type_slug: 'passing-touchdown', team: { abbreviation: 'NYG' }, short_text: "Wan'Dale Robinson 39 Yd pass from Jameis Winston", text: 'J.Winston pass deep left to W.Robinson for 39 yards, TOUCHDOWN.', stat_yardage: 39, scoring_play: true };
const negativeRush = { id: 'loss', period: 1, clock_display: '2:00', type_slug: 'rush', team: { abbreviation: 'NYG' }, text: 'J.Winston up the middle to NYG 20 for -3 yards.', short_text: 'Jameis Winston -3 Yd Rush', stat_yardage: -3 };
const options = { leagueId: 'league-1', platform: 'sleeper', season: 2026, week: 2, playerId: 'passer', players, team: 'NYG', opponent: 'DAL', scoringSettings };
const access = { live: { enabled: true, leagueAllowed: true, accessCodeRequired: false, capabilities: { plays: true } }, session: { enabled: true } };

function fakeApi(status = access) {
  const calls = [];
  return {
    calls,
    getLiveStatus: async (args) => { calls.push(['status', args]); return status; },
    startLiveSession: async (args) => { calls.push(['session', args]); status = { ...status, session: { enabled: true } }; },
    getLiveGames: async (args) => { calls.push(['games', args]); return { data: [game] }; },
    getLiveGamePlays: async (...args) => { calls.push(['plays', ...args]); return { data: [touchdown, negativeRush] }; },
  };
}

test('game identity requires exact season, week, regular phase and opponent; ambiguity is unavailable', () => {
  assert.equal(findPlayerTimelineGame([game], options), game);
  for (const changed of [{ season: 2025 }, { week: 1 }, { season_type: 3 }, { visitor_team: { abbreviation: 'PHI' } }]) {
    assert.equal(findPlayerTimelineGame([{ ...game, ...changed }], options), null);
  }
  assert.equal(findPlayerTimelineGame([game, { ...game, id: 43 }], options), null);
  assert.equal(findPlayerTimelineGame([{ ...game, season_type: undefined, postseason: false }], options)?.id, 42);
  assert.equal(findPlayerTimelineGame([{ ...game, season_type: undefined }], options), null);
});

test('timeline retains deductions, credits only selected role, removes duplicates and orders by game time', () => {
  const events = buildPlayerTimelineEvents({ game, plays: [touchdown, negativeRush, touchdown], ...options });
  assert.deepEqual(events.map((event) => event.pts), [-0.3, 5.56]);
  assert.ok(events.every((event) => event.playerId === 'passer' && event.estimated));
  const receiver = buildPlayerTimelineEvents({ game, plays: [touchdown], ...options, playerId: 'receiver' });
  assert.equal(receiver[0].pts, 10.9);
});

test('captured provider gamebook rows produce player contributions with unmodified shared parsing', () => {
  const captured = JSON.parse(readFileSync(new URL('../fixtures/bdlNflPlays.json', import.meta.url))).games[0];
  const events = buildPlayerTimelineEvents({ game: captured, plays: captured.plays, playerId: 'hurts', team: 'PHI', players: { hurts: { full_name: 'Jalen Hurts', position: 'QB', team: 'PHI' } }, scoringSettings });
  assert.ok(events.length > 0);
  assert.ok(events.every((event) => event.playerId === 'hurts' && Number.isFinite(event.pts)));
});

test('non-allowlisted, unsupported and locked sessions never request provider games or plays', async () => {
  for (const status of [
    { ...access, live: { ...access.live, leagueAllowed: false } },
    { ...access, live: { ...access.live, capabilities: { plays: false } } },
    { ...access, live: { ...access.live, accessCodeRequired: true }, session: { enabled: false } },
  ]) {
    const api = fakeApi(status);
    assert.equal((await loadPlayerMatchupTimeline(options, api)).status, 'unavailable');
    assert.deepEqual(api.calls.map(([name]) => name), ['status']);
  }
  const api = fakeApi();
  assert.equal((await loadPlayerMatchupTimeline({ ...options, platform: 'espn' }, api)).status, 'unavailable');
  assert.equal(api.calls.length, 0);
});

test('allowlisted no-code leagues follow existing session setup and request only resolved BDL game', async () => {
  const api = fakeApi({ ...access, session: { enabled: false } });
  const result = await loadPlayerMatchupTimeline(options, api);
  assert.equal(result.status, 'ready');
  assert.deepEqual(api.calls.map(([name]) => name), ['status', 'session', 'status', 'games', 'plays']);
  assert.equal(api.calls.at(-1)[1], '42');
  assert.equal(result.events[0].pts, -0.3);
  assert.equal('officialPoints' in result, false);
});

test('missing game stops play requests, empty plays stay unknown, stale data is disclosed', async () => {
  const api = fakeApi();
  api.getLiveGames = async () => ({ data: [] });
  assert.equal((await loadPlayerMatchupTimeline(options, api)).status, 'unavailable');
  assert.ok(!api.calls.some(([name]) => name === 'plays'));
  api.getLiveGames = async () => ({ data: [game] });
  api.getLiveGamePlays = async () => ({ data: [], cache: { stale: true } });
  const empty = await loadPlayerMatchupTimeline(options, api);
  assert.equal(empty.status, 'empty');
  assert.equal(empty.stale, true);
  assert.match(empty.message, /available plays/);
  api.getLiveGamePlays = async () => ({ data: null });
  await assert.rejects(loadPlayerMatchupTimeline(options, api), /incomplete/);
});

test('cancellation after status prevents session setup or further network requests', async () => {
  const controller = new AbortController();
  const api = fakeApi();
  api.getLiveStatus = async () => { controller.abort(); return access; };
  await assert.rejects(loadPlayerMatchupTimeline({ ...options, signal: controller.signal }, api), { name: 'AbortError' });
  assert.equal(api.calls.length, 0);
});
