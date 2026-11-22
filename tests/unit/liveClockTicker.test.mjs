import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLiveClockTicker,
  formatLiveClockLabel,
  getLiveClockGameKey,
  isTickingClockGame,
} from '../../src/utils/liveClockTicker.js';

const START = Date.parse('2026-09-13T17:00:00.000Z');

function fakeEnvironment() {
  const env = {
    time: START,
    timers: new Map(),
    nextId: 1,
    handlers: new Map(),
  };
  const target = {
    addEventListener: (type, handler) => {
      if (!env.handlers.has(type)) env.handlers.set(type, new Set());
      env.handlers.get(type).add(handler);
    },
    removeEventListener: (type, handler) => env.handlers.get(type)?.delete(handler),
  };
  env.document = { ...target, visibilityState: 'visible' };
  env.window = { ...target };
  env.navigator = { onLine: true };
  env.api = {
    now: () => env.time,
    schedule: (fn, ms) => {
      const id = env.nextId++;
      env.timers.set(id, { fn, at: env.time + ms });
      return id;
    },
    cancelSchedule: (id) => env.timers.delete(id),
    documentTarget: env.document,
    windowTarget: env.window,
    navigatorTarget: env.navigator,
  };
  env.listenerCount = () => [...env.handlers.values()].reduce((sum, set) => sum + set.size, 0);
  env.advance = (ms) => {
    const end = env.time + ms;
    for (;;) {
      const due = [...env.timers.entries()]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      env.timers.delete(due[0]);
      env.time = due[1].at;
      due[1].fn();
    }
    env.time = end;
  };
  env.setVisible = (visible) => {
    env.document.visibilityState = visible ? 'visible' : 'hidden';
    env.handlers.get('visibilitychange')?.forEach((handler) => handler());
  };
  env.setOnline = (online) => {
    env.navigator.onLine = online;
    env.handlers.get(online ? 'online' : 'offline')?.forEach((handler) => handler());
  };
  return env;
}

function liveGame({ clock = '8:14', period = '2', changedAt = START, key = null, latestPlay = null, ...extra } = {}) {
  return {
    id: 'bdl-42',
    bdlGameId: '42',
    provider: 'balldontlie',
    status: 'live',
    statusLabel: `Q${period} · ${clock}`,
    live: {
      period,
      clock,
      providerClockAnchor: {
        key: key ?? `${period}|${clock}`,
        changedAt,
        observedAt: changedAt,
        providerFetchedAt: changedAt,
        staleAfterMs: 10_000,
        feedStale: false,
        providerClockFrozen: false,
      },
    },
    latestPlay,
    ...extra,
  };
}

test('only live BALLDONTLIE-sourced games with an anchor and a play sample tick', () => {
  const withPlay = (extra = {}) => ({ ...liveGame({ latestPlay: { play: { period: 2, clock_display: '8:40', type_slug: 'rush' } } }), ...extra });
  assert.equal(isTickingClockGame(withPlay()), true);
  // Without play-by-play the clock cannot see stoppages, so it stays stepped.
  assert.equal(isTickingClockGame(liveGame()), false);
  assert.equal(isTickingClockGame(withPlay({ provider: 'espn' })), false);
  // An ESPN overlay keeps BALLDONTLIE detail identity but owns the clock.
  assert.equal(isTickingClockGame(withPlay({ scoreboardProvider: 'espn' })), false);
  assert.equal(isTickingClockGame(withPlay({ status: 'halftime' })), false);
  assert.equal(isTickingClockGame(withPlay({ live: { period: '2', clock: '8:14' } })), false);
  assert.equal(getLiveClockGameKey(liveGame()), 'bdl:42');
  assert.equal(getLiveClockGameKey({ id: 'bdl-42' }), 'bdl:42');
  assert.equal(formatLiveClockLabel('3', '4:09'), 'Q3 · 4:09');
});

test('one interval starts with the first subscriber and stops with the last', () => {
  const env = fakeEnvironment();
  const ticker = createLiveClockTicker(env.api);
  assert.equal(ticker.isTicking(), false);
  const offA = ticker.subscribe(() => {});
  const offB = ticker.subscribe(() => {});
  assert.equal(env.timers.size, 1);
  assert.equal(ticker.isTicking(), true);
  offA();
  assert.equal(ticker.isTicking(), true);
  offB();
  assert.equal(ticker.isTicking(), false);
  assert.equal(env.timers.size, 0);
  assert.equal(env.listenerCount(), 0);
});

test('ticks once a second and every surface reads the identical second', () => {
  const env = fakeEnvironment();
  const ticker = createLiveClockTicker(env.api);
  let notifications = 0;
  const off = ticker.subscribe(() => { notifications += 1; });
  const game = liveGame();
  assert.equal(ticker.resolveGame(game).label, 'Q2 · 8:14');
  env.advance(3_000);
  assert.equal(notifications, 3);
  const card = ticker.resolveGame(game);
  // A second surface with a different object for the same game, in the same tick.
  const drilldown = ticker.resolveGame({ ...game, live: { ...game.live } });
  assert.equal(card.label, 'Q2 · 8:11');
  assert.deepEqual(drilldown, card);
  // Re-resolving in the same tick (StrictMode) does not advance memory.
  assert.deepEqual(ticker.resolveGame(game), card);
  off();
});

test('stops while hidden and emits one immediate tick on return', () => {
  const env = fakeEnvironment();
  const ticker = createLiveClockTicker(env.api);
  let notifications = 0;
  ticker.subscribe(() => { notifications += 1; });
  const game = liveGame();
  ticker.resolveGame(game);
  env.advance(2_000);
  assert.equal(ticker.resolveGame(game).clock, '8:12');

  env.setVisible(false);
  assert.equal(ticker.isTicking(), false);
  const before = notifications;
  env.time += 3_000;
  assert.equal(notifications, before);
  assert.equal(ticker.resolveGame(game).clock, '8:12');
  assert.equal(ticker.resolveGame(game).frozen, true);

  env.setVisible(true);
  assert.equal(ticker.isTicking(), true);
  assert.equal(notifications, before + 1);
  assert.equal(ticker.resolveGame(game).clock, '8:09');
});

test('stops while offline and resumes on return', () => {
  const env = fakeEnvironment();
  const ticker = createLiveClockTicker(env.api);
  ticker.subscribe(() => {});
  const game = liveGame();
  ticker.resolveGame(game);
  env.setOnline(false);
  assert.equal(ticker.isTicking(), false);
  env.setOnline(true);
  assert.equal(ticker.isTicking(), true);
  env.advance(1_000);
  assert.equal(ticker.resolveGame(game).clock, '8:13');
});

test('a held clock shows the latest play reason, and nothing when unknown', () => {
  const env = fakeEnvironment();
  const ticker = createLiveClockTicker(env.api);
  ticker.subscribe(() => {});
  const timeout = liveGame({
    latestPlay: { play: { typeSlug: 'timeout', rawText: 'Timeout #2 by DAL', period: 2, time: '8:14' } },
  });
  ticker.resolveGame(timeout);
  env.advance(4_000);
  assert.deepEqual(
    { clock: ticker.resolveGame(timeout).clock, reason: ticker.resolveGame(timeout).stopReason },
    { clock: '8:14', reason: 'Timeout' },
  );

  const running = liveGame({
    bdlGameId: '43',
    id: 'bdl-43',
    latestPlay: { play: { typeSlug: 'rush', rawText: 'run for 4', period: 2, time: '8:20' } },
  });
  ticker.resolveGame(running);
  env.advance(20_000);
  const capped = ticker.resolveGame(running);
  assert.equal(capped.clock, '8:04');
  assert.equal(capped.frozen, true);
  assert.equal(capped.stopReason, null);
});

test('display memory is shared and monotonic across surfaces and samples', () => {
  const env = fakeEnvironment();
  const ticker = createLiveClockTicker(env.api);
  ticker.subscribe(() => {});
  // A mounted surface resolves on every tick.
  for (let second = 0; second < 6; second += 1) {
    ticker.resolveGame(liveGame());
    env.advance(1_000);
  }
  assert.equal(ticker.resolveGame(liveGame()).clock, '8:08');
  // The next sample says the clock had stopped higher: one jump up.
  const corrected = liveGame({ clock: '8:11', changedAt: env.time });
  assert.equal(ticker.resolveGame(corrected).clock, '8:11');
  // A sample behind the display eases down rather than jumping.
  env.advance(1_000);
  assert.equal(ticker.resolveGame(corrected).clock, '8:10');
  const behind = liveGame({ clock: '8:05', changedAt: env.time });
  // Resolved from the previous tick's 8:11: six seconds behind, eased by three.
  assert.equal(ticker.resolveGame(behind).clock, '8:08');
  env.advance(1_000);
  assert.equal(ticker.resolveGame(behind).clock, '8:04');
});

test('device-local first sight bounds a skewed anchor age', () => {
  const env = fakeEnvironment();
  const ticker = createLiveClockTicker(env.api);
  ticker.subscribe(() => {});
  // The provider-side anchor reads 30s old because the device runs ahead.
  const skewed = liveGame({ changedAt: START - 30_000 });
  assert.equal(ticker.resolveGame(skewed).clock, '8:14');
  env.advance(2_000);
  assert.equal(ticker.resolveGame(skewed).clock, '8:12');
});
