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
    { clock: '8:14', reason: 'DAL timeout' },
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

test('fresh responses keep an unchanged clock running and a stale plays feed freezes it', () => {
  const env = fakeEnvironment();
  const ticker = createLiveClockTicker(env.api);
  ticker.subscribe(() => {});
  const snapshot = (verifiedAt) => {
    const game = liveGame({
      latestPlay: { verifiedAt, play: { typeSlug: 'rush', period: 2, time: '8:14' } },
    });
    game.live.providerClockAnchor.verifiedAt = verifiedAt;
    return game;
  };
  assert.equal(ticker.resolveGame(snapshot(START)).clock, '8:14');
  env.advance(8_000);
  const refreshed = snapshot(env.time);
  assert.equal(ticker.resolveGame(refreshed).clock, '8:06');
  env.advance(4_000);
  assert.equal(ticker.resolveGame(refreshed).clock, '8:02');
  env.advance(6_000);
  refreshed.live.providerClockAnchor.verifiedAt = env.time;
  assert.equal(ticker.resolveGame(refreshed).clock, '7:56');
  assert.equal(ticker.resolveGame(refreshed).stale, true);
  env.advance(2_000);
  assert.equal(ticker.resolveGame(refreshed).clock, '7:56');
});

test('a new snap at 2:00 releases the two-minute warning hold', () => {
  const env = fakeEnvironment();
  const ticker = createLiveClockTicker(env.api);
  ticker.subscribe(() => {});
  const warning = liveGame({
    clock: '2:00', key: '2|2:00|warning',
    latestPlay: { play: { typeSlug: 'two-minute-warning', period: 2, time: '2:00' } },
  });
  assert.equal(ticker.resolveGame(warning).stopReason, '2-min warning');
  env.advance(20_000);
  const restarted = liveGame({
    clock: '2:00', key: '2|2:00|rush', changedAt: env.time,
    latestPlay: { play: { typeSlug: 'rush', period: 2, time: '2:00' } },
  });
  assert.equal(ticker.resolveGame(restarted).clock, '2:00');
  env.advance(2_000);
  assert.equal(ticker.resolveGame(restarted).clock, '1:58');
});

test('an unchanged reading resumes from the held clock after a stale period', () => {
  const env = fakeEnvironment();
  const ticker = createLiveClockTicker(env.api);
  ticker.subscribe(() => {});
  const game = liveGame({ clock: '4:00', period: '3' });
  const anchor = game.live.providerClockAnchor;
  anchor.verifiedAt = START;

  assert.equal(ticker.resolveGame(game).clock, '4:00');
  env.advance(180_000);
  assert.equal(ticker.resolveGame(game).clock, '3:50');
  assert.equal(ticker.resolveGame(game).stale, true);

  anchor.verifiedAt = env.time;
  assert.equal(ticker.resolveGame(game).clock, '3:50');
  assert.equal(ticker.resolveGame(game).stale, false);
  env.advance(1_000);
  assert.equal(ticker.resolveGame(game).clock, '3:49');
});

test('a quarter-ending score or turnover holds at zero and through the break', () => {
  for (const typeSlug of ['rushing-touchdown', 'pass-interception-return']) {
    const env = fakeEnvironment();
    const ticker = createLiveClockTicker(env.api);
    ticker.subscribe(() => {});
    const latestPlay = { play: { typeSlug, period: 1, time: '0:04' } };
    const endOfQuarter = liveGame({ clock: '0:00', period: '1', latestPlay });
    assert.equal(ticker.resolveGame(endOfQuarter).frozen, true);
    env.advance(8_000);
    assert.equal(ticker.resolveGame(endOfQuarter).label, 'Q1 · 0:00');

    const betweenQuarters = liveGame({ clock: '15:00', period: '2', changedAt: env.time, latestPlay });
    assert.equal(ticker.resolveGame(betweenQuarters).label, 'Q2 · 15:00');
    env.advance(8_000);
    assert.equal(ticker.resolveGame(betweenQuarters).label, 'Q2 · 15:00');

    const firstSnap = liveGame({
      clock: '15:00', period: '2', changedAt: env.time, key: '2|15:00|first-snap',
      latestPlay: { play: { typeSlug: 'rush', period: 2, time: '15:00' } },
    });
    assert.equal(ticker.resolveGame(firstSnap).label, 'Q2 · 15:00');
    env.advance(2_000);
    assert.equal(ticker.resolveGame(firstSnap).label, 'Q2 · 14:58');
  }
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

test('a fresh fetch of the same value preserves the countdown origin of a cached first sample', () => {
  const env = fakeEnvironment();
  const ticker = createLiveClockTicker(env.api);
  ticker.subscribe(() => {});
  const game = liveGame({ changedAt: START - 5_000 });
  game.live.providerClockAnchor.sampleAgeMs = 5_000;
  assert.equal(ticker.resolveGame(game).clock, '8:09');
  env.advance(2_000);
  game.live.providerClockAnchor.sampleAgeMs = 0;
  game.live.providerClockAnchor.verifiedAt = env.time;
  assert.equal(ticker.resolveGame(game).clock, '8:07');
});

test('a quiet feed holds the clock with a waiting label until the next reading', () => {
  const env = fakeEnvironment();
  const ticker = createLiveClockTicker(env.api);
  ticker.subscribe(() => {});
  const snapshot = (verifiedAt, { clock = '8:34', key = null } = {}) => {
    const game = liveGame({
      clock,
      period: '3',
      key,
      latestPlay: { verifiedAt, play: { typeSlug: 'rush', period: 3, time: clock } },
    });
    game.live.providerClockAnchor.verifiedAt = verifiedAt;
    return game;
  };
  assert.equal(ticker.resolveGame(snapshot(START)).clock, '8:34');
  for (let i = 0; i < 20; i += 1) {
    env.advance(8_000);
    ticker.resolveGame(snapshot(env.time));
  }
  const held = ticker.resolveGame(snapshot(env.time));
  assert.equal(held.clock, '7:44');
  assert.equal(held.stopReason, 'Waiting for update');
  // The next posted play replaces the hold with its own reading.
  const nextSample = snapshot(env.time, { clock: '7:41', key: '3|7:41|next' });
  assert.equal(ticker.resolveGame(nextSample).stopReason, null);
  // A small gap eases down over a tick rather than jumping.
  env.advance(1_000);
  assert.equal(ticker.resolveGame(nextSample).clock, '7:40');
});
