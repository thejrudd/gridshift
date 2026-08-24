import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createSleeperRosterSync,
  SLEEPER_ROSTER_REFRESH_INTERVAL_MS,
} from '../../src/utils/sleeperRosterSync.js';

class FakeEventTarget {
  constructor(properties = {}) {
    Object.assign(this, properties);
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

function createFakeScheduler() {
  let nextId = 1;
  const timers = new Map();
  return {
    timers,
    schedule(callback, delay) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { callback, delay });
      return id;
    },
    cancelSchedule(id) {
      timers.delete(id);
    },
    runNext() {
      const entry = timers.entries().next().value;
      assert.ok(entry, 'expected a scheduled roster refresh');
      const [id, timer] = entry;
      timers.delete(id);
      timer.callback();
      return timer;
    },
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Sleeper roster synchronization', () => {
  it('refreshes immediately, deduplicates concurrent triggers, and polls every 30 seconds', async () => {
    const documentTarget = new FakeEventTarget({ visibilityState: 'visible' });
    const windowTarget = new FakeEventTarget();
    const navigatorTarget = { onLine: true };
    const scheduler = createFakeScheduler();
    const applied = [];
    let resolveFetch;
    let fetchCount = 0;
    const fetchRosters = () => {
      fetchCount += 1;
      return new Promise((resolve) => { resolveFetch = resolve; });
    };

    const sync = createSleeperRosterSync({
      leagueId: 'league-1',
      fetchRosters,
      applyRosters: (rosters) => applied.push(rosters),
      documentTarget,
      windowTarget,
      navigatorTarget,
      schedule: scheduler.schedule,
      cancelSchedule: scheduler.cancelSchedule,
    });

    sync.start();
    await flushPromises();
    windowTarget.dispatch('focus');
    documentTarget.dispatch('visibilitychange');
    const initialRequest = sync.refresh();
    assert.equal(fetchCount, 1);

    resolveFetch([{ roster_id: 1, players: ['player-1'] }]);
    await initialRequest;
    assert.equal(applied.length, 1);
    assert.equal(scheduler.timers.size, 1);
    const timer = scheduler.runNext();
    assert.equal(timer.delay, SLEEPER_ROSTER_REFRESH_INTERVAL_MS);
    await flushPromises();
    assert.equal(fetchCount, 2);

    sync.stop();
  });

  it('pauses while hidden and refreshes immediately when visible again', async () => {
    const documentTarget = new FakeEventTarget({ visibilityState: 'hidden' });
    const windowTarget = new FakeEventTarget();
    const scheduler = createFakeScheduler();
    let fetchCount = 0;

    const sync = createSleeperRosterSync({
      leagueId: 'league-1',
      fetchRosters: async () => { fetchCount += 1; return []; },
      applyRosters: () => {},
      documentTarget,
      windowTarget,
      navigatorTarget: { onLine: true },
      schedule: scheduler.schedule,
      cancelSchedule: scheduler.cancelSchedule,
    });

    sync.start();
    await flushPromises();
    windowTarget.dispatch('focus');
    assert.equal(fetchCount, 0);
    assert.equal(scheduler.timers.size, 0);

    documentTarget.visibilityState = 'visible';
    documentTarget.dispatch('visibilitychange');
    await sync.refresh();
    assert.equal(fetchCount, 1);
    assert.equal(scheduler.timers.size, 1);

    documentTarget.visibilityState = 'hidden';
    documentTarget.dispatch('visibilitychange');
    assert.equal(scheduler.timers.size, 0);
    sync.stop();
  });

  it('waits for reconnection and refreshes on the online event', async () => {
    const documentTarget = new FakeEventTarget({ visibilityState: 'visible' });
    const windowTarget = new FakeEventTarget();
    const navigatorTarget = { onLine: false };
    let fetchCount = 0;

    const sync = createSleeperRosterSync({
      leagueId: 'league-1',
      fetchRosters: async () => { fetchCount += 1; return []; },
      applyRosters: () => {},
      documentTarget,
      windowTarget,
      navigatorTarget,
    });

    sync.start();
    await flushPromises();
    assert.equal(fetchCount, 0);

    navigatorTarget.onLine = true;
    windowTarget.dispatch('online');
    await sync.refresh();
    assert.equal(fetchCount, 1);
    sync.stop();
  });

  it('retains the last good state on failure and ignores a response after stop', async () => {
    const documentTarget = new FakeEventTarget({ visibilityState: 'visible' });
    const windowTarget = new FakeEventTarget();
    const scheduler = createFakeScheduler();
    const applied = [];

    const failedSync = createSleeperRosterSync({
      leagueId: 'league-1',
      fetchRosters: async () => { throw new Error('temporary Sleeper failure'); },
      applyRosters: (rosters) => applied.push(rosters),
      documentTarget,
      windowTarget,
      navigatorTarget: { onLine: true },
      schedule: scheduler.schedule,
      cancelSchedule: scheduler.cancelSchedule,
    });
    failedSync.start();
    await failedSync.refresh();
    assert.deepEqual(applied, []);
    assert.equal(scheduler.timers.size, 1);
    failedSync.stop();

    let resolveFetch;
    const staleSync = createSleeperRosterSync({
      leagueId: 'league-1',
      fetchRosters: () => new Promise((resolve) => { resolveFetch = resolve; }),
      applyRosters: (rosters) => applied.push(rosters),
      documentTarget,
      windowTarget,
      navigatorTarget: { onLine: true },
    });
    staleSync.start();
    await flushPromises();
    const staleRequest = staleSync.refresh();
    staleSync.stop();
    resolveFetch([{ roster_id: 1, players: [] }]);
    await staleRequest;
    assert.deepEqual(applied, []);
  });
});
