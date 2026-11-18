import assert from 'node:assert/strict';
import test from 'node:test';

import { auditGame, readEspnBoxScore } from '../../scripts/play-feed-audit.mjs';

const game = { id: 7, season: 2026, week: 9, season_type: 2, status: 'Final', home_team: { abbreviation: 'ATL' }, visitor_team: { abbreviation: 'CIN' } };
const plays = [
  { id: 'run', period: 1, clock_display: '7:14', type_slug: 'rush', team: { abbreviation: 'ATL' }, short_text: 'Michael Penix Jr. 23 Yd Rush', text: '(Shotgun) M.Penix scrambles left tackle to CIN 17 for 23 yards (D.Turner).', stat_yardage: 23, start_down: 3, start_distance: 5, end_down: 1 },
  { id: 'loss', period: 2, clock_display: '9:00', type_slug: 'rush', team: { abbreviation: 'ATL' }, short_text: 'Michael Penix Jr. Rush, Loss of 3 Yds', text: 'M.Penix up the middle to ATL 22 for -3 yards (D.Turner).', stat_yardage: -3, start_down: 1, start_distance: 10, end_down: 2 },
];
const players = {
  penix: { full_name: 'Michael Penix Jr.', first_name: 'Michael', last_name: 'Penix', position: 'QB', team: 'ATL', espn_id: 1 },
  traded: { full_name: 'Dee Turner', first_name: 'Dee', last_name: 'Turner', position: 'LB', team: 'NYJ', espn_id: 2 },
};

test('the audit diffs each rebuilt stat against the official line, losses included', () => {
  const sleeperStats = { penix: { rush_att: 2, rush_yd: 20, rush_fd: 1 } };
  const { checks, mismatches } = auditGame({ game, plays, players, sleeperStats });
  assert.ok(checks.length >= 3);
  // A -3 yard carry is still a carry: nothing is dropped as "worth nothing".
  assert.equal(mismatches.length, 0);

  const corrected = auditGame({ game, plays, players, sleeperStats: { penix: { rush_att: 2, rush_yd: 18, rush_fd: 1 } } });
  assert.deepEqual(corrected.mismatches.map((row) => [row.stat, row.gridshift, row.official]), [['rush_yd', 20, 18]]);
  assert.deepEqual(corrected.mismatches[0].creditedPlays.map((play) => play.value).sort((a, b) => a - b), [-3, 23]);
});

test('a player traded since the game is audited on the team the box score lists', () => {
  const tackle = { id: 'tkl', period: 1, clock_display: '6:00', type_slug: 'rush', team: { abbreviation: 'ATL' }, short_text: 'Bijan Robinson 4 Yd Rush', text: 'B.Robinson up the middle to ATL 30 for 4 yards (D.Turner).', stat_yardage: 4 };
  const espnLines = new Map([['2', { name: 'Dee Turner', team: 'CIN', idp_tkl: 1 }]]);
  const { mismatches } = auditGame({ game, plays: [tackle], players, sleeperStats: { traded: { idp_tkl: 1 } }, espnLines });
  assert.equal(mismatches.filter((row) => row.playerId === 'traded').length, 0);
});

test('ESPN box score columns map to Sleeper stat keys', () => {
  const lines = readEspnBoxScore({ players: [{
    team: { abbreviation: 'ATL' },
    statistics: [
      { name: 'passing', labels: ['C/ATT', 'YDS', 'AVG', 'TD', 'INT'], athletes: [{ athlete: { id: 1, displayName: 'Michael Penix Jr.' }, stats: ['12/19', '86', '4.5', '1', '0'] }] },
      { name: 'kicking', labels: ['FG', 'PCT', 'LONG', 'XP', 'PTS'], athletes: [{ athlete: { id: 3, displayName: 'Kicker' }, stats: ['2/3', '66.7', '48', '1/1', '7'] }] },
    ],
  }] });
  assert.deepEqual(
    { cmp: lines.get('1').pass_cmp, att: lines.get('1').pass_att, yd: lines.get('1').pass_yd, team: lines.get('1').team },
    { cmp: 12, att: 19, yd: 86, team: 'ATL' },
  );
  assert.equal(lines.get('3').fgmiss, 1);
  assert.equal(lines.get('3').xpm, 1);
});

test('team defense lines are compared in Sleeper\'s keys', () => {
  // CIN's sack-fumble: CIN DEF gets the sack, the force (Sleeper `ff`) and
  // the recovery; ATL's line is only what the official record says.
  const sackFumble = {
    id: 'strip', period: 3, clock_display: '4:00', type_slug: 'sack-opp-fumble-recovery', team: { abbreviation: 'CIN' },
    short_text: 'Michael Penix Jr. Sacked by Dee Turner For 7 Yd Loss',
    text: '(Shotgun) M.Penix sacked at ATL 30 for -7 yards (D.Turner). FUMBLES (D.Turner), RECOVERED by CIN-D.Turner at ATL 31.',
    stat_yardage: -7, start_down: 2, start_distance: 8, end_down: 1,
  };
  const teamPlayers = {
    ...players,
    CIN: { full_name: 'Cincinnati Defense', position: 'DEF', team: 'CIN', player_id: 'CIN' },
    ATL: { full_name: 'Atlanta Defense', position: 'DEF', team: 'ATL', player_id: 'ATL' },
  };
  const exact = auditGame({ game, plays: [sackFumble], players: teamPlayers, sleeperStats: { CIN: { sack: 1, sack_yd: 7, ff: 1, fum_rec: 1, tkl_loss: 1 }, ATL: {} } });
  assert.equal(exact.teamMismatches.length, 0);
  assert.deepEqual(exact.teamChecks.map((check) => check.key).sort(), ['ff', 'fum_rec', 'sack', 'sack_yd', 'tkl_loss']);

  const off = auditGame({ game, plays: [sackFumble], players: teamPlayers, sleeperStats: { CIN: { sack: 1, sack_yd: 7, ff: 0, fum_rec: 1, tkl_loss: 1 }, ATL: { int: 1 } } });
  assert.deepEqual(off.teamMismatches.map((row) => [row.team, row.stat, row.gridshift, row.official]).sort(), [
    ['ATL', 'int', 0, 1],
    ['CIN', 'ff', 1, 0],
  ]);
  // Team lines never mix into the player comparison.
  assert.equal(off.mismatches.some((row) => row.playerId === 'CIN' || row.playerId === 'ATL'), false);
});
