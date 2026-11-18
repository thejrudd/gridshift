import assert from 'node:assert/strict';
import test from 'node:test';
import { getLatestBdlScorePlay } from '../../src/utils/balldontlieNflScoreboard.js';
import { buildPlayEvents, buildStarterNameIndex } from '../../src/utils/livePlaysFeed.js';
import { sortPlaysChronologically } from '../../src/utils/playByPlay/playOrder.js';

const rush = (id, period, clock, yards, wallclock) => ({
  id,
  type_slug: 'rush',
  team: { abbreviation: 'CIN' },
  period,
  clock_display: clock,
  stat_yardage: yards,
  short_text: `Chase Brown ${yards} Yd Rush`,
  text: `C.Brown up the middle to CLV 20 for ${yards} yards (G.Delpit).`,
  ...(wallclock ? { wallclock } : {}),
});

test('a row without a wallclock sorts by its game clock, not ahead of every timed row', () => {
  const q1 = rush(1, 1, '10:00', 50, '2025-09-07T17:10:00Z');
  const q4 = rush(2, 4, '5:00', 60, null);
  const q2 = rush(3, 2, '3:00', 5, '2025-09-07T17:55:00Z');
  assert.deepEqual(sortPlaysChronologically([q4, q2, q1]).map((play) => play.id), [1, 3, 2]);
  assert.equal(getLatestBdlScorePlay([q4, q2, q1]).id, 2);
});

test('the same game clock falls back to wallclock, then to arrival order', () => {
  const a = { id: 'a', period: 2, clock: '2:00', wallclock: 2000 };
  const b = { id: 'b', period: 2, clock: '2:00', wallclock: 1000 };
  const c = { id: 'c', period: 2, time: '2:00' };
  const d = { id: 'd', period: 2, time: '2:00' };
  assert.deepEqual(sortPlaysChronologically([a, b]).map((play) => play.id), ['b', 'a']);
  assert.deepEqual(sortPlaysChronologically([d, c]).map((play) => play.id), ['d', 'c']);
});

test('a milestone bonus lands on the play that actually crossed it', () => {
  // 50 yards in Q1 (timed), 60 in Q4 (untimed): the Q4 carry crosses 100.
  // The old Fantasy key sorted the untimed Q4 row first and paid the bonus on
  // the Q1 carry instead.
  const plays = [rush(1, 1, '10:00', 50, '2025-09-07T17:10:00Z'), rush(2, 4, '5:00', 60, null)];
  const index = buildStarterNameIndex([{ id: 'cb', player: { full_name: 'Chase Brown', team: 'CIN', position: 'RB' } }]);
  const game = { id: 7, date: '2025-09-07T17:00:00Z', home_team: { abbreviation: 'CLE' }, visitor_team: { abbreviation: 'CIN' } };
  const events = buildPlayEvents({ 7: plays }, index, { rush_yd: 0.1, bonus_rush_yd_100: 3 }, new Map([['cb', 'RB']]), new Map([['7', game]]));
  const byPlay = Object.fromEntries(events.map((event) => [event.sharedPlayId, event]));
  assert.equal(byPlay['2'].stats.bonus_rush_yd_100, 1);
  assert.equal(byPlay['1'].stats.bonus_rush_yd_100, undefined);
  assert.equal(byPlay['2'].pts, 9);
});
