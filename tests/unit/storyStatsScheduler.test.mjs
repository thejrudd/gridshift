import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createStoryStatsScheduler,
  isPrimeTimeStoryStatsGame,
  isStoryStatsAutomationEnabled,
} from '../../server/storyStatsScheduler.js';

test('StoryStats automation is production-only and can be disabled explicitly', () => {
  assert.equal(isStoryStatsAutomationEnabled({ NODE_ENV: 'production' }), true);
  assert.equal(isStoryStatsAutomationEnabled({ NODE_ENV: 'development' }), false);
  assert.equal(isStoryStatsAutomationEnabled({ NODE_ENV: 'production', GRIDSHIFT_STORY_STATS_AUTOMATION_ENABLED: 'false' }), false);
});

test('StoryStats automation reuses the regular-season 7 PM Eastern primetime rule', () => {
  assert.equal(isPrimeTimeStoryStatsGame({ date: '2026-09-14T00:20:00Z' }), true);
  assert.equal(isPrimeTimeStoryStatsGame({ date: '2026-09-13T17:00:00Z' }), false);
  assert.equal(isPrimeTimeStoryStatsGame({ season_type: 1, date: '2026-08-14T00:20:00Z' }), false);
});

test('StoryStats scheduler warms one pregame, each observed live period, and one postgame story', async () => {
  let nowMs = Date.UTC(2026, 8, 13, 23, 30);
  let status = 'Scheduled';
  let period = null;
  const calls = [];
  const primeTimeGame = { id: 424095, date: '2026-09-14T00:20:00Z', status: 'Scheduled' };
  const afternoonGame = { id: 424096, date: '2026-09-13T17:00:00Z', status: 'Scheduled' };
  const gateway = {
    supports: (capability) => capability === 'games' || capability === 'storyStats',
    request: async () => ({ payload: { data: [] } }),
  };
  const service = {
    fetch: async ({ gameId, phase }) => {
      calls.push({ gameId, phase });
      return { stories: [] };
    },
  };
  const scheduler = createStoryStatsScheduler({
    gateway,
    service,
    enabled: true,
    now: () => nowMs,
    loadScheduleGames: async () => [primeTimeGame, afternoonGame],
    loadGameState: async () => ({ id: primeTimeGame.id, date: primeTimeGame.date, status, period }),
    logger: { error() {} },
  });

  await scheduler.tick();
  await scheduler.tick();
  assert.deepEqual(calls, [{ gameId: '424095', phase: 'pregame' }]);

  nowMs = Date.UTC(2026, 8, 14, 0, 45);
  status = '12:00 - 1st';
  period = 1;
  await scheduler.tick();
  assert.deepEqual(calls.at(-1), { gameId: '424095', phase: 'live' });

  status = '15:00 - 2nd';
  period = 2;
  await scheduler.tick();
  assert.equal(calls.filter((call) => call.phase === 'live').length, 2);

  status = 'Final';
  period = 4;
  await scheduler.tick();
  assert.deepEqual(calls.at(-1), { gameId: '424095', phase: 'postgame' });
  assert.equal(calls.length, 4);
});

test('StoryStats scheduler does not spend a fifth live request on overtime', async () => {
  let nowMs = Date.UTC(2026, 8, 14, 0, 45);
  const calls = [];
  const game = { id: 424095, date: '2026-09-14T00:20:00Z', status: '1st', period: 1 };
  const gateway = {
    supports: () => true,
    request: async () => ({ payload: { data: [] } }),
  };
  const scheduler = createStoryStatsScheduler({
    gateway,
    service: { fetch: async ({ phase }) => { calls.push(phase); return { stories: [] }; } },
    enabled: true,
    now: () => nowMs,
    loadScheduleGames: async () => [game],
    loadGameState: async () => game,
    logger: { error() {} },
  });

  await scheduler.tick();
  game.period = 2;
  await scheduler.tick();
  game.period = 3;
  await scheduler.tick();
  game.period = 4;
  await scheduler.tick();
  game.period = 5;
  game.status = 'OT';
  nowMs += 60_000;
  await scheduler.tick();

  assert.deepEqual(calls, ['live', 'live', 'live', 'live']);
});

test('disabled StoryStats automation does not inspect the schedule', async () => {
  let scheduleLoads = 0;
  const scheduler = createStoryStatsScheduler({
    gateway: { supports: () => true, request: async () => ({ payload: { data: [] } }) },
    service: { fetch: async () => { throw new Error('must not fetch'); } },
    enabled: false,
    loadScheduleGames: async () => {
      scheduleLoads += 1;
      return [];
    },
  });

  await scheduler.tick();
  assert.equal(scheduleLoads, 0);
  assert.equal(scheduler.getStatus().running, false);
});
