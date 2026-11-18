import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getMatchupLiveCadence,
  isDeepEqual,
  LIVE_CADENCE,
  LIVE_IDLE_REFRESH_MS,
} from '../../src/utils/liveRefreshCadence.js';
import { createVisiblePoller } from '../../src/utils/visiblePolling.js';
import {
  getScheduleResultsRefreshMs,
  getScheduleScoreboardFingerprint,
  isSettledScheduleScoreboard,
  SCHEDULE_LIVE_REFRESH_MS,
  SCHEDULE_UNSETTLED_KEEPALIVE_MS,
} from '../../src/utils/scheduleResultsPolling.js';

const NOW = Date.parse('2026-11-15T18:00:00.000Z');
const TEAMS = new Set(['KC', 'BUF']);
const game = (id, away, home, date, status, extra = {}) => ({
  id, visitor_team: { abbreviation: away }, home_team: { abbreviation: home }, date, status, ...extra,
});

// --- Matchups cadence -------------------------------------------------------

test('a live matchup game keeps the fast cadence', () => {
  const games = [game(1, 'BUF', 'KC', '2026-11-15T17:00:00.000Z', 'In Progress', { period: 2, time: '4:12' })];
  assert.deepEqual(getMatchupLiveCadence({ games, teams: TEAMS, fastMs: 5000, now: NOW }), { mode: LIVE_CADENCE.LIVE, delayMs: 5000 });
});

test('a matchup game kicking off within the lead window polls fast before kickoff', () => {
  const games = [game(1, 'BUF', 'KC', '2026-11-15T18:10:00.000Z', 'Scheduled')];
  assert.equal(getMatchupLiveCadence({ games, teams: TEAMS, fastMs: 5000, now: NOW }).mode, LIVE_CADENCE.KICKOFF);
  assert.equal(getMatchupLiveCadence({ games, teams: TEAMS, fastMs: 5000, now: NOW }).delayMs, 5000);
});

test('a game past kickoff that the provider has not flipped to live still polls fast', () => {
  const games = [game(1, 'BUF', 'KC', '2026-11-15T17:55:00.000Z', 'Scheduled')];
  assert.equal(getMatchupLiveCadence({ games, teams: TEAMS, fastMs: 5000, now: NOW }).delayMs, 5000);
});

test('no live or imminent matchup game backs off to the idle cadence', () => {
  const games = [
    game(1, 'BUF', 'KC', '2026-11-15T13:00:00.000Z', 'Final'),
    game(2, 'BUF', 'KC', '2026-11-16T01:20:00.000Z', 'Scheduled'),
    // Live, but not a matchup team.
    game(3, 'GB', 'MIN', '2026-11-15T17:00:00.000Z', 'In Progress', { period: 2 }),
  ];
  assert.deepEqual(getMatchupLiveCadence({ games, teams: TEAMS, fastMs: 5000, now: NOW }), { mode: LIVE_CADENCE.IDLE, delayMs: LIVE_IDLE_REFRESH_MS });
  // The free tier's 60s fast cadence never polls faster when idle.
  assert.equal(getMatchupLiveCadence({ games, teams: TEAMS, fastMs: 60000, now: NOW }).delayMs, LIVE_IDLE_REFRESH_MS);
});

test('hidden or offline pauses, loading and errors retry fast, the sandbox stays fast', () => {
  const games = [game(1, 'BUF', 'KC', '2026-11-15T13:00:00.000Z', 'Final')];
  assert.deepEqual(getMatchupLiveCadence({ games, teams: TEAMS, fastMs: 5000, active: false, now: NOW }), { mode: LIVE_CADENCE.PAUSED, delayMs: null });
  assert.equal(getMatchupLiveCadence({ games, teams: TEAMS, fastMs: 5000, loaded: false, now: NOW }).delayMs, 5000);
  assert.equal(getMatchupLiveCadence({ games, teams: TEAMS, fastMs: 5000, errored: true, now: NOW }).delayMs, 5000);
  assert.equal(getMatchupLiveCadence({ games, teams: TEAMS, fastMs: 5000, always: true, now: NOW }).delayMs, 5000);
});

// --- Unchanged payloads -----------------------------------------------------

test('isDeepEqual lets an unchanged payload keep its state identity', () => {
  const previous = { key: 'k', games: [game(1, 'BUF', 'KC', 'x', 'Final', { score: [1, 2] })] };
  const same = [game(1, 'BUF', 'KC', 'x', 'Final', { score: [1, 2] })];
  const moved = [game(1, 'BUF', 'KC', 'x', 'Final', { score: [1, 3] })];
  const update = (prev, games) => (prev.key === 'k' && isDeepEqual(prev.games, games) ? prev : { key: 'k', games });
  assert.equal(update(previous, same), previous);
  assert.notEqual(update(previous, moved), previous);
  assert.equal(isDeepEqual({ a: 1 }, { a: 1, b: undefined }), false);
  assert.equal(isDeepEqual([1, 2], { 0: 1, 1: 2 }), false);
  assert.equal(isDeepEqual(Number.NaN, Number.NaN), true);
});

// --- Visible poller ---------------------------------------------------------

function createHarness({ visible = true, online = true } = {}) {
  const listeners = { document: new Map(), window: new Map() };
  const target = (bucket) => ({
    addEventListener: (type, fn) => bucket.set(type, fn),
    removeEventListener: (type) => bucket.delete(type),
  });
  const documentTarget = { ...target(listeners.document), visibilityState: visible ? 'visible' : 'hidden' };
  const navigatorTarget = { onLine: online };
  const timers = [];
  let clock = 0;
  return {
    documentTarget,
    navigatorTarget,
    windowTarget: target(listeners.window),
    schedule: (fn, delay) => { const timer = { fn, at: clock + delay, live: true }; timers.push(timer); return timer; },
    cancelSchedule: (timer) => { timer.live = false; },
    now: () => clock,
    pending: () => timers.filter((timer) => timer.live),
    advance(ms) {
      const end = clock + ms;
      for (;;) {
        const due = timers.filter((timer) => timer.live && timer.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        clock = Math.max(clock, due.at);
        due.live = false;
        due.fn();
      }
      clock = end;
    },
    setVisible(next) {
      documentTarget.visibilityState = next ? 'visible' : 'hidden';
      listeners.document.get('visibilitychange')?.();
    },
    setOnline(next) {
      navigatorTarget.onLine = next;
      listeners.window.get(next ? 'online' : 'offline')?.();
    },
  };
}

test('the poller ticks at the current delay, pauses while hidden and refreshes once on return', () => {
  const harness = createHarness();
  let runs = 0;
  let delay = 5000;
  const poller = createVisiblePoller({ run: () => { runs += 1; }, getDelay: () => delay, ...harness });
  poller.start();
  assert.equal(runs, 0, 'starting never fetches; the caller does the first load');
  harness.advance(15000);
  assert.equal(runs, 3);

  harness.setVisible(false);
  harness.advance(60000);
  assert.equal(runs, 3, 'a hidden tab makes no requests');
  assert.equal(harness.pending().length, 0);

  harness.setVisible(true);
  assert.equal(runs, 4, 'returning refreshes once right away');
  harness.setVisible(true);
  assert.equal(runs, 4, 'a repeated visibility event is not a burst');

  delay = 180000;
  poller.reschedule();
  harness.advance(5000);
  assert.equal(runs, 4, 'a widened delay applies to the pending tick');
  harness.advance(175000);
  assert.equal(runs, 5);
  poller.stop();
  harness.advance(600000);
  assert.equal(runs, 5);
});

test('the poller pauses offline, resumes on online, and starts paused in a hidden tab', () => {
  const harness = createHarness({ visible: false });
  let runs = 0;
  const poller = createVisiblePoller({ run: () => { runs += 1; }, getDelay: () => 1000, ...harness });
  poller.start();
  harness.advance(10000);
  assert.equal(runs, 0);
  harness.setVisible(true);
  assert.equal(runs, 1);

  harness.setOnline(false);
  harness.advance(10000);
  assert.equal(runs, 1, 'offline makes no requests');
  harness.setOnline(true);
  assert.equal(runs, 2);
  harness.advance(1000);
  assert.equal(runs, 3);
  poller.stop();
});

test('narrowing the delay never postpones the pending tick', () => {
  const harness = createHarness();
  let runs = 0;
  let delay = 180000;
  const poller = createVisiblePoller({ run: () => { runs += 1; }, getDelay: () => delay, ...harness });
  poller.start();
  harness.advance(170000);
  delay = 5000;
  poller.reschedule();
  harness.advance(0);
  assert.equal(runs, 1, 'already overdue at the new cadence, so it runs now');
  poller.reschedule();
  poller.reschedule();
  harness.advance(5000);
  assert.equal(runs, 2);
  poller.stop();
});

test('a countdown delay re-read by repeated reschedules never fires before its window', () => {
  const harness = createHarness();
  const windowAt = 600000;
  let runs = 0;
  const poller = createVisiblePoller({
    run: () => { runs += 1; },
    getDelay: () => Math.max(60000, windowAt - harness.now()),
    ...harness,
    rescheduleFrom: 'now',
  });
  poller.start();
  for (let step = 0; step < 50; step += 1) {
    harness.advance(10000);
    poller.reschedule();
  }
  // 500s elapsed, window opens at 600s: measured from the last tick, each
  // re-time would have pulled the tick earlier.
  assert.equal(runs, 0);
  harness.advance(100000);
  assert.equal(runs, 1);
  poller.stop();
});

// --- Season schedule results ------------------------------------------------

const scheduleWith = (games) => ({ season: 2026, weeks: [{ week: 11, games }] });

test('schedule results poll every minute only around an unfinished game', () => {
  const live = scheduleWith([{ kickoff: '2026-11-15T17:00:00.000Z', completed: false }]);
  assert.equal(getScheduleResultsRefreshMs(live, NOW), SCHEDULE_LIVE_REFRESH_MS);

  // Sunday done, Monday night still to come: wait for Monday's window.
  const monday = scheduleWith([
    { kickoff: '2026-11-15T13:00:00.000Z', completed: true },
    { kickoff: '2026-11-17T01:15:00.000Z', completed: false },
  ]);
  const untilMonday = Date.parse('2026-11-17T01:15:00.000Z') - 15 * 60_000 - NOW;
  assert.equal(getScheduleResultsRefreshMs(monday, NOW), Math.min(untilMonday, 6 * 60 * 60_000));

  // A started game with no final long after its window keeps a slow keep-alive.
  const stuck = scheduleWith([{ kickoff: '2026-11-14T12:00:00.000Z', completed: false }]);
  assert.equal(getScheduleResultsRefreshMs(stuck, NOW), SCHEDULE_UNSETTLED_KEEPALIVE_MS);

  // Every game final: never poll.
  assert.equal(getScheduleResultsRefreshMs(scheduleWith([{ kickoff: '2026-11-15T13:00:00.000Z', completed: true }]), NOW), null);
});

const espnEvent = (id, completed, homeScore = 21) => ({
  id,
  date: '2026-11-15T18:00Z',
  status: { type: { completed, state: completed ? 'post' : 'in', name: completed ? 'STATUS_FINAL' : 'STATUS_IN_PROGRESS', shortDetail: completed ? 'Final' : 'Q3 4:12' } },
  competitions: [{ competitors: [
    { homeAway: 'home', score: String(homeScore), team: { abbreviation: 'KC' } },
    { homeAway: 'away', score: '17', team: { abbreviation: 'BUF' } },
  ] }],
});

test('only a complete, all-final week scoreboard is stored for good', () => {
  assert.equal(isSettledScheduleScoreboard({ events: [espnEvent('1', true), espnEvent('2', true)] }, 2), true);
  assert.equal(isSettledScheduleScoreboard({ events: [espnEvent('1', true), espnEvent('2', false)] }, 2), false);
  assert.equal(isSettledScheduleScoreboard({ events: [espnEvent('1', true)] }, 2), false, 'a partial payload is never kept');
  assert.equal(isSettledScheduleScoreboard({ events: [] }, 0), false);
});

test('the scoreboard fingerprint ignores unchanged polls and catches score changes', () => {
  const first = getScheduleScoreboardFingerprint({ events: [espnEvent('1', false)] });
  assert.equal(getScheduleScoreboardFingerprint({ events: [espnEvent('1', false)] }), first);
  assert.notEqual(getScheduleScoreboardFingerprint({ events: [espnEvent('1', false, 24)] }), first);
});
