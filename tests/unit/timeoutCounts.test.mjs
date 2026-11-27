import assert from 'node:assert/strict';
import test from 'node:test';
import { countTimeoutsRemaining } from '../../src/utils/playByPlay/timeoutCounts.js';

const row = (period, text, type_slug = 'timeout') => ({ period, text, type_slug });
const teams = { awayTeam: 'GB', homeTeam: 'LAR' };

test('counts each team\'s timeouts in the current half from the play rows', () => {
  // Week 13 GB at LAR, end of the first half: GB used all three.
  const firstHalf = [
    row(1, 'Timeout #1 by LA at 05:10.'),
    row(2, 'Timeout #1 by GB at 02:33.'),
    row(2, 'Official Timeout at 01:54.', 'official-timeout'),
    row(2, 'Timeout #2 by GB at 01:54.'),
    row(2, 'Timeout #3 by GB at 00:58.'),
  ];
  assert.deepEqual(countTimeoutsRemaining(firstHalf, teams), { period: 2, away: 0, home: 2 });
  // The second half starts fresh, whatever was used before it.
  assert.deepEqual(
    countTimeoutsRemaining([...firstHalf, row(3, 'B.Corum up the middle for 3 yards.', 'rush')], teams),
    { period: 3, away: 3, home: 3 },
  );
});

test('a later timeout number covers a row the feed never posted', () => {
  assert.deepEqual(countTimeoutsRemaining([row(4, 'Timeout #2 by GB at 03:26.')], teams), { period: 4, away: 1, home: 3 });
});

test('overtime gives two timeouts in the regular season and three in the postseason', () => {
  const ot = [row(5, 'Timeout #1 by GB at 06:00.')];
  assert.deepEqual(countTimeoutsRemaining(ot, teams), { period: 5, away: 1, home: 2 });
  assert.deepEqual(countTimeoutsRemaining(ot, { ...teams, postseason: true }), { period: 5, away: 2, home: 3 });
});

test('returns null without teams or periods', () => {
  assert.equal(countTimeoutsRemaining([], teams), null);
  assert.equal(countTimeoutsRemaining([row(1, 'Timeout #1 by GB')], { awayTeam: 'GB' }), null);
});
