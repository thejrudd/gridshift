import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCardStatLine, buildStatChips, getGameStatLine, sumStats } from '../../src/utils/matchupStatChips.js';

const weeklyRows = [{ week: 9, pass_yd: 242, pass_td: 1, rush_yd: -1 }];

test('the game line sums the live plays when there are any', () => {
  const line = getGameStatLine({ plays: [{ stats: { pass_yd: 40 } }, { stats: { pass_yd: 12, pass_td: 1 } }], weeklyRows, week: 9 });
  assert.deepEqual(buildStatChips('QB', line), ['52 pass yds', '1 pass TD']);
});

test('without plays the game line falls back to the week’s stat row', () => {
  const line = getGameStatLine({ plays: [], weeklyRows, week: 9 });
  assert.deepEqual(buildStatChips('QB', line), ['242 pass yds', '1 pass TD', '-1 rush yds']);
});

test('a replayed moment never shows the full week ahead of the replay', () => {
  assert.equal(getGameStatLine({ plays: [], weeklyRows, week: 9, replaying: true }), null);
});

test('no plays and no week row means no game line', () => {
  assert.equal(getGameStatLine({ plays: [], weeklyRows, week: 10 }), null);
});

test('the live box line wins over the scoring plays right now', () => {
  const boxLine = { pass_yd: 242, pass_td: 1, rush_yd: -1 };
  const line = getGameStatLine({ boxLine, plays: [{ stats: { pass_yd: 50, pass_td: 1 } }], weeklyRows, week: 9 });
  assert.deepEqual(buildStatChips('QB', line), ['242 pass yds', '1 pass TD', '-1 rush yds']);
});

test('a replayed moment ignores the live box line', () => {
  const line = getGameStatLine({ boxLine: { rush_yd: 99 }, plays: [{ stats: { rush_yd: 12 } }], replaying: true });
  assert.equal(line.rush_yd, 12);
});

test('the phone card stat line leads with attempts, in caps with paired segments', () => {
  assert.deepEqual(
    buildCardStatLine('QB', { pass_cmp: 18, pass_att: 36, pass_yd: 366, pass_td: 2, pass_int: 1, rush_att: 4, rush_yd: 13 }),
    ['18/36, 366 YDS', '2 PASS TD', '1 INT', '4 CAR, 13 YDS'],
  );
  assert.deepEqual(
    buildCardStatLine('RB', { rush_att: 15, rush_yd: 219, rec: 11, rec_tgt: 12, rec_yd: 45, rush_td: 2, rec_td: 1 }),
    ['15 CAR, 219 YDS', '11/12 REC, 45 YDS', '3 TD'],
  );
  assert.deepEqual(
    buildCardStatLine('WR', { rec: 9, rec_tgt: 14, rec_yd: 156, rush_att: 1, rush_yd: 0, rec_td: 1 }),
    ['9/14 REC, 156 YDS', '1 CAR, 0 YDS', '1 TD'],
  );
});

test('the phone card stat line leaves out volume the line does not carry', () => {
  // Summed lines zero-fill missing keys; a missing target count is not "0 targets".
  assert.deepEqual(buildCardStatLine('WR', sumStats([{ rec: 5, rec_yd: 61 }])), ['5 REC, 61 YDS']);
  assert.deepEqual(buildCardStatLine('QB', sumStats([{ pass_yd: 52, pass_td: 1 }])), ['52 YDS', '1 PASS TD']);
  assert.deepEqual(buildCardStatLine('TE', sumStats([{}])), ['0 REC, 0 YDS']);
});

test('the phone card stat line covers kickers, defenders and team defense', () => {
  assert.deepEqual(buildCardStatLine('K', { fgm: 2, fgmiss: 1, xpm: 3 }), ['2/3 FG', '3/3 XP']);
  assert.deepEqual(buildCardStatLine('LB', { idp_tkl: 9, idp_sack: 1, idp_pd: 1 }), ['9 TKL', '1 SACK', '1 PD']);
  assert.deepEqual(buildCardStatLine('DEF', { sack: 3, int: 1, fum_rec: 1, pts_allow: 17 }), ['3 SACK', '2 TAKEAWAYS', '17 PTS ALLOWED']);
  assert.deepEqual(buildCardStatLine('QB', null), []);
});
