import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLeaguePools, compactWeekRows, selectGroupPools } from '../../src/utils/playerSeason/leaguePools.js';
import { buildPlayerGame, findSubjectRow, gameSecond, pickReferencedPeople } from '../../src/utils/playerSeason/playerSeasonGames.js';
import {
  buildRanks,
  dashboardGroup,
  opponentContext,
  opponentRanks,
  passAgg,
  passerRating,
  playKind,
  seasonPlays,
} from '../../src/utils/playerSeason/dashboardModel.js';
import { createPlayerSeasonService } from '../../server/playerSeasonHandlers.js';

function sleeperRow(id, first, last, position, team, opponent, stats) {
  return { player_id: id, team, opponent, player: { first_name: first, last_name: last, position }, stats: { gp: 1, ...stats } };
}

// Two weeks, three teams. BUF plays MIA then NE; MIA plays NE in week 2.
const WEEKS = [
  {
    week: 1,
    rows: [
      sleeperRow('1', 'Josh', 'Allen', 'QB', 'BUF', 'MIA', { pass_att: 30, pass_cmp: 20, pass_yd: 250, pass_td: 2, pass_int: 1, pass_sack: 2, rush_att: 5, rush_yd: 30 }),
      sleeperRow('2', 'Tua', 'Tago', 'QB', 'MIA', 'BUF', { pass_att: 35, pass_cmp: 25, pass_yd: 300, pass_td: 1, pass_int: 0, pass_sack: 1 }),
      sleeperRow('3', 'Back', 'Up', 'QB', 'MIA', 'BUF', { pass_att: 2, pass_cmp: 1, pass_yd: 5 }),
      sleeperRow('BUF', 'Buffalo', 'Bills', 'DEF', 'BUF', 'MIA', { pts_allow: 17 }),
      sleeperRow('MIA', 'Miami', 'Dolphins', 'DEF', 'MIA', 'BUF', { pts_allow: 24 }),
      sleeperRow('9', 'Edge', 'Rusher', 'DE', 'BUF', 'MIA', { def_snp: 40, tm_def_snp: 60, idp_sack: 1, idp_qb_hit: 2, idp_tkl: 3 }),
    ],
  },
  {
    week: 2,
    rows: [
      sleeperRow('1', 'Josh', 'Allen', 'QB', 'BUF', 'NE', { pass_att: 28, pass_cmp: 18, pass_yd: 220, pass_td: 1, pass_int: 0, pass_sack: 1 }),
      sleeperRow('4', 'Drake', 'Maye', 'QB', 'NE', 'BUF', { pass_att: 40, pass_cmp: 30, pass_yd: 330, pass_td: 3, pass_int: 1, pass_sack: 3 }),
      sleeperRow('2', 'Tua', 'Tago', 'QB', 'MIA', 'NE', { pass_att: 10, pass_cmp: 4, pass_yd: 40, pass_td: 0, pass_int: 2 }),
      sleeperRow('BUF', 'Buffalo', 'Bills', 'DEF', 'BUF', 'NE', { pts_allow: 27 }),
      sleeperRow('NE', 'New England', 'Patriots', 'DEF', 'NE', 'BUF', { pts_allow: 20 }),
    ],
  },
];

test('league pools sum season lines, count starter games, and carry team-week lines', () => {
  const pools = buildLeaguePools(WEEKS);
  assert.deepEqual(pools.weeks, [1, 2]);
  const allen = pools.players.find((player) => player.id === '1');
  assert.equal(allen.gp, 2);
  assert.equal(allen.st, 2);
  assert.equal(allen.s.pass_yd, 470);
  const backup = pools.players.find((player) => player.id === '3');
  assert.equal(backup.st, 0, 'two attempts is not a starter game');
  assert.equal(pools.teams.BUF[1].opp, 'MIA');
  assert.equal(pools.teams.BUF[1].pf, 24, "points scored come from the opponent defense's points allowed");
  assert.equal(pools.teams.BUF[1].pa, 17);
  assert.equal(pools.teams.MIA[1].off.QB.pass_att, 37, 'every passer counts toward the team line');
  assert.equal(selectGroupPools(pools, 'DL').players.length, 1);
});

test('compactWeekRows keeps only the fields the pools read', () => {
  const [row] = compactWeekRows([{ ...WEEKS[0].rows[0], stats: { ...WEEKS[0].rows[0].stats, pos_rank_ppr: 3, pts_ppr: 20 } }]);
  assert.equal(row.stats.pass_yd, 250);
  assert.equal(row.stats.pos_rank_ppr, undefined);
});

test('ranks use the qualified rule and keep the player in the all-starters pool', () => {
  const pools = buildLeaguePools(WEEKS);
  const ranks = buildRanks(pools, 'QB', '1');
  // BUF and MIA played two games, NE one. The MIA backup's two attempts fall short of 14 per team game.
  assert.deepEqual(ranks.qualified[0].vals.map((entry) => entry.id).sort(), ['1', '2', '4']);
  assert.ok(ranks.all[0].vals.every((entry) => entry.id !== '3'), 'no starter game, not in the all-starters pool');
  assert.equal(ranks.isQualified, true);
  const rating = ranks.qualified.find((rank) => rank.key === 'rate');
  assert.equal(rating.vals[0].id, '4', 'higher passer rating ranks first');
  const intRate = ranks.qualified.find((rank) => rank.key === 'intp');
  assert.equal(intRate.vals[0].id, '1', 'lower interception rate ranks first');
});

test('opponent context excludes the viewed week and ranks the easiest matchup first', () => {
  const pools = buildLeaguePools(WEEKS);
  // What BUF's defense allowed to QBs, leaving out week 1: only NE's week-2 line.
  const buf = opponentContext(pools, 'QB', 'BUF', 1);
  assert.equal(buf.g, 1);
  assert.equal(buf.passA, 330);
  assert.equal(Math.round(buf.rate * 10) / 10, Math.round(passerRating(30, 40, 330, 3, 1) * 10) / 10);
  const ranks = opponentRanks(pools, 'QB');
  // NE allowed 220 passing yards to BUF; MIA allowed 250 + 40 over two games.
  assert.ok(ranks.MIA.passA < ranks.NE.passA || ranks.MIA.passA === 1);
});

test('dashboard groups follow position groups and exclude positions without a dashboard', () => {
  assert.equal(dashboardGroup('DE'), 'DL');
  assert.equal(dashboardGroup('CB'), 'DB');
  assert.equal(dashboardGroup('OT'), null);
});

function bdlPlayer(id, first, last, position, team) {
  return { player: { id, first_name: first, last_name: last, position_abbreviation: position, jersey_number: '17' }, team: { abbreviation: team } };
}

const DETAIL = {
  game: { id: 77, week: 1, date: '2026-09-10', status: 'Final', home_team: { abbreviation: 'BUF' }, visitor_team: { abbreviation: 'DET' }, home_team_score: 24, visitor_team_score: 20 },
  playerStats: [
    { ...bdlPlayer(10, 'Josh', 'Allen', 'QB', 'BUF'), passing_attempts: 2, passing_completions: 1 },
    { ...bdlPlayer(11, 'Khalil', 'Shakir', 'WR', 'BUF'), receptions: 1 },
    { ...bdlPlayer(20, 'Christian', 'Benford', 'CB', 'DET'), passes_defended: 1 },
    { ...bdlPlayer(21, 'James', 'Cook III', 'RB', 'BUF'), rushing_attempts: 1 },
  ],
  teamStats: [{ team: { abbreviation: 'BUF' }, total_yards: 300 }, { team: { abbreviation: 'DET' }, total_yards: 280 }],
  plays: [
    {
      period: 1, clock_display: '14:20', type_slug: 'pass-reception', text: '(Shotgun) J.Allen pass short right to K.Shakir to BUF 40 for 12 yards (C.Benford).',
      start_down: 1, start_distance: 10, start_yards_to_endzone: 72, end_yards_to_endzone: 60, stat_yardage: 12, home_score: 0, away_score: 0,
      home_win_probability: 0.56, team: { abbreviation: 'BUF' }, participants: [{ player_id: 10, type: 'passer' }, { player_id: 11, type: 'receiver' }],
    },
    {
      period: 1, clock_display: '13:50', type_slug: 'pass-incompletion', text: 'J.Allen pass incomplete deep left to K.Shakir (C.Benford).',
      start_down: 1, start_distance: 10, start_yards_to_endzone: 60, end_yards_to_endzone: 60, stat_yardage: 0, home_score: 0, away_score: 0,
      home_win_probability: 0.55, team: { abbreviation: 'BUF' }, participants: [{ player_id: 10, type: 'passer' }, { player_id: 11, type: 'receiver' }],
    },
    {
      period: 1, clock_display: '13:10', type_slug: 'rush', text: 'J.Cook right tackle to DET 51 for 9 yards (A.Hutchinson).',
      start_down: 2, start_distance: 10, start_yards_to_endzone: 60, end_yards_to_endzone: 51, stat_yardage: 9, home_score: 0, away_score: 0,
      home_win_probability: 0.57, team: { abbreviation: 'BUF' }, participants: [{ player_id: 21, type: 'rusher' }],
    },
  ],
};

test('a QB is credited on his passes with depth, direction, receiver, and win chance before and after', () => {
  const { game, subjectId } = buildPlayerGame(DETAIL, { name: 'Josh Allen', team: 'BUF', position: 'QB' });
  assert.equal(subjectId, 10);
  assert.equal(game.opp, 'DET');
  assert.equal(game.plays.length, 2);
  const [completion, incompletion] = game.plays;
  assert.equal(completion.r, 'passer');
  assert.equal(completion.pd, 'short');
  assert.equal(completion.pdir, 'right');
  assert.equal(completion.tgt, 11);
  assert.equal(completion.fs.pass_cmp, 1);
  assert.equal(incompletion.wb, 0.56);
  assert.equal(incompletion.wp, 0.55);
  assert.equal(game.teamPassAtt, 2);
  assert.equal(playKind(incompletion, 'QB'), 'Incompletion');
});

test('a suffixed name still matches, and a run records its gap', () => {
  const { game } = buildPlayerGame(DETAIL, { name: 'James Cook', team: 'BUF', position: 'RB' });
  assert.equal(game.active, true);
  assert.equal(game.plays.length, 1);
  assert.equal(game.plays[0].gap, 'rt');
  assert.equal(game.plays[0].r, 'rusher');
});

test('the defender named on an incomplete pass is credited a pass defensed, not a tackle', () => {
  const { game } = buildPlayerGame(DETAIL, { name: 'Christian Benford', team: 'DET', position: 'CB' });
  const incompletion = game.plays.find((play) => play.t === 'pass-incompletion');
  assert.deepEqual(incompletion.cr, { pd: 1 });
  assert.equal(incompletion.fs.idp_pd, 1);
  assert.equal(incompletion.fs.idp_tkl, undefined);
  const catchTackle = game.plays.find((play) => play.t === 'pass-reception');
  assert.equal(catchTackle.cr.tkl, 1);
});

test('season helpers flatten plays and keep only referenced people', () => {
  const built = buildPlayerGame(DETAIL, { name: 'Josh Allen', team: 'BUF', position: 'QB' });
  const season = { games: [built.game] };
  assert.equal(seasonPlays(season).length, 2);
  assert.equal(passAgg(seasonPlays(season)).att, 2);
  const people = pickReferencedPeople(season.games, built.people);
  assert.deepEqual(Object.keys(people).sort(), ['10', '11']);
  assert.equal(findSubjectRow(DETAIL.playerStats, { name: 'josh allen', team: 'BUF', position: 'QB' }).player.id, 10);
  assert.equal(gameSecond(2, '15:00'), 900);
});

test('the pools route validates its query and builds from Sleeper weeks', async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);
    if (url.includes('/state/nfl')) return { ok: true, json: async () => ({ season: '2026', season_type: 'regular', week: 2 }) };
    const week = Number(url.match(/\/2026\/(\d+)/)?.[1]);
    return { ok: true, json: async () => WEEKS.find((entry) => entry.week === week)?.rows ?? [] };
  };
  const service = createPlayerSeasonService({ fetchImpl, gateway: null, snapshotStore: null });
  await assert.rejects(service.pools({ season: 2026, group: 'OL' }), /position group/);
  await assert.rejects(service.pools({ season: 1999, group: 'QB' }), /season/);
  const pools = await service.pools({ season: 2026, group: 'QB' });
  assert.equal(pools.group, 'QB');
  assert.deepEqual(pools.weeks, [1, 2]);
  assert.ok(pools.players.every((player) => player.g === 'QB'));
  const before = requests.length;
  await service.pools({ season: 2026, group: 'DL' });
  assert.equal(requests.length, before, 'cached weeks are not refetched');
});
