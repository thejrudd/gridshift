import test from 'node:test';
import assert from 'node:assert/strict';

import { splitDeltaIntoPlays } from '../../src/dev/liveSandbox/liveSandboxReplay.js';

const tdsIn = (plays, key) => plays.map((play) => Number(play[key] ?? 0));

test('a single carry stays a single play', () => {
  const plays = splitDeltaIntoPlays({ rush_att: 1, rush_yd: 7 });
  assert.equal(plays.length, 1);
  assert.deepEqual(plays[0], { rush_att: 1, rush_yd: 7 });
});

test('two rushing touchdowns are dealt to separate plays', () => {
  // The bug this exists to prevent: one entry claiming two scores.
  const plays = splitDeltaIntoPlays({ rush_att: 4, rush_yd: 40, rush_td: 2 });
  assert.equal(plays.length, 4);
  assert.deepEqual(tdsIn(plays, 'rush_td'), [0, 0, 1, 1]);
  plays.forEach((play) => assert.ok((play.rush_td ?? 0) <= 1, 'a play scored twice'));
});

test('a play never carries more than one touchdown of any kind', () => {
  const plays = splitDeltaIntoPlays({
    pass_cmp: 12, pass_yd: 289, pass_td: 1,
    rush_att: 6, rush_yd: 40, rush_td: 2,
  });
  plays.forEach((play) => {
    const scores = Number(play.pass_td ?? 0) + Number(play.rush_td ?? 0) + Number(play.rec_td ?? 0);
    assert.ok(scores <= 1, `a play carried ${scores} touchdowns`);
  });
});

test('rushing and receiving are separate plays for the same player', () => {
  const plays = splitDeltaIntoPlays({ rush_att: 2, rush_yd: 10, rec: 3, rec_yd: 30 });
  assert.equal(plays.length, 5);
  assert.equal(plays.filter((play) => play.rush_att).length, 2);
  assert.equal(plays.filter((play) => play.rec).length, 3);
  // No play mixes a carry with a catch.
  plays.forEach((play) => assert.ok(!(play.rush_att && play.rec)));
});

test('yardage is shared out and still sums to the original', () => {
  const plays = splitDeltaIntoPlays({ rush_att: 3, rush_yd: 116 });
  assert.equal(plays.reduce((sum, play) => sum + play.rush_yd, 0), 116);
});

test('negative yardage stays negative and still sums', () => {
  const plays = splitDeltaIntoPlays({ rush_att: 2, rush_yd: -6 });
  assert.equal(plays.reduce((sum, play) => sum + play.rush_yd, 0), -6);
});

test('yardage with no recorded attempt still produces one play', () => {
  const plays = splitDeltaIntoPlays({ rec_yd: 14 });
  assert.equal(plays.length, 1);
  assert.equal(plays[0].rec_yd, 14);
});

test('more touchdowns than recorded attempts still get their own plays', () => {
  const plays = splitDeltaIntoPlays({ rush_td: 2 });
  assert.equal(plays.length, 2);
  assert.deepEqual(tdsIn(plays, 'rush_td'), [1, 1]);
});

test('kicks are one play each', () => {
  const plays = splitDeltaIntoPlays({ fgm: 4, xpm: 2 });
  assert.equal(plays.length, 6);
  assert.equal(plays.filter((play) => play.fgm === 1).length, 4);
  assert.equal(plays.filter((play) => play.xpm === 1).length, 2);
});

test('turnovers are their own plays', () => {
  const plays = splitDeltaIntoPlays({ pass_cmp: 2, pass_yd: 20, pass_int: 1 });
  assert.equal(plays.filter((play) => play.pass_int).length, 1);
  assert.equal(plays.length, 3);
});

test('stats with no play structure ride along rather than vanishing', () => {
  const plays = splitDeltaIntoPlays({ rush_att: 1, rush_yd: 3, fum_rec: 1 });
  assert.equal(plays.length, 1);
  assert.equal(plays[0].fum_rec, 1);
});

test('a delta of only structureless stats still yields one play', () => {
  const plays = splitDeltaIntoPlays({ idp_tkl: 3 });
  assert.equal(plays.length, 1);
  assert.equal(plays[0].idp_tkl, 3);
});

test('an empty delta yields nothing', () => {
  assert.deepEqual(splitDeltaIntoPlays(null), []);
  assert.deepEqual(splitDeltaIntoPlays({}), []);
});
