import test from 'node:test';
import assert from 'node:assert/strict';

import { parseGlobalQuery } from '../../src/utils/globalSearch/parseIntent.js';
import { rankResults } from '../../src/utils/globalSearch/rank.js';
import { composeIndex, buildStaticRecords, buildLeagueRecords } from '../../src/utils/globalSearch/buildIndex.js';
import { buildPlayerRecords } from '../../src/utils/globalSearch/entities/players.js';
import { resolveAnswer } from '../../src/utils/globalSearch/answers/index.js';
import { pickComparePair } from '../../src/utils/globalSearch/answers/compare.js';

const PLAYERS = {
  wr1: { full_name: 'Marcus Vane', team: 'SEA', position: 'WR', number: 18, search_rank: 3, active: true },
  wr2: { full_name: 'Elias Roan', team: 'BUF', position: 'WR', number: 11, search_rank: 8, active: true },
  qb: { full_name: 'Dalton Pryor', team: 'BUF', position: 'QB', number: 17, search_rank: 5, active: true },
  roan2: { full_name: 'Tomas Roan', team: 'SEA', position: 'LB', number: 50, search_rank: 900, active: true },
};

const WEEKLY_STATS = {
  wr1: [{ week: 1, rec: 8, rec_yd: 120, rec_td: 1 }, { week: 2, rec: 5, rec_yd: 60, rec_td: 0 }],
  wr2: [{ week: 1, rec: 4, rec_yd: 55, rec_td: 0 }, { week: 2, rec: 6, rec_yd: 95, rec_td: 1 }],
  qb: [{ week: 1, pass_yd: 300, pass_td: 3 }],
};

const SCORING = { pass_yd: 0.04, pass_td: 4, rec: 1, rec_yd: 0.1, rec_td: 6 };

const SCHEDULE_DATA = {
  season: 2026,
  teams: [
    { id: 'SEA', name: 'Seattle Seahawks', division: 'NFC West', conference: 'NFC', city: 'Seattle', nickname: 'Seahawks' },
    { id: 'BUF', name: 'Buffalo Bills', division: 'AFC East', conference: 'AFC', city: 'Buffalo', nickname: 'Bills' },
    { id: 'ARI', name: 'Arizona Cardinals', division: 'NFC West', conference: 'NFC', city: 'Arizona', nickname: 'Cardinals' },
  ],
};

const SEASON_SCHEDULE = {
  season: 2026,
  weeks: {
    1: [{ id: 'g1', week: 1, awayTeam: 'BUF', homeTeam: 'SEA', kickoff: '2026-09-13T20:00:00Z' }],
    2: [
      { id: 'g2', week: 2, awayTeam: 'SEA', homeTeam: 'ARI', kickoff: '2026-09-20T20:00:00Z' },
      { id: 'g3', week: 2, awayTeam: 'ARI', homeTeam: 'BUF', kickoff: '2026-09-20T17:00:00Z' },
    ],
  },
};

const NFL_SCHEDULE = {
  season: 2026,
  weeks: [{
    week: 1,
    games: [{ awayTeam: 'BUF', homeTeam: 'SEA', awayScore: 17, homeScore: 24, status: 'final' }],
  }],
};

const FANTASY_LEAGUE = {
  rosters: [
    { roster_id: 1, owner_id: 'u1', settings: { wins: 2, losses: 0, ties: 0, fpts: 250, fpts_against: 190 } },
    { roster_id: 2, owner_id: 'u2', settings: { wins: 1, losses: 1, ties: 0, fpts: 260, fpts_against: 205 } },
  ],
  leagueUsers: [
    { user_id: 'u1', metadata: { team_name: 'Turf Monsters' } },
    { user_id: 'u2', metadata: { team_name: 'Cleat Chasers' } },
  ],
  getUserDisplayName: (id) => ({ u1: 'Sam', u2: 'Dana' })[id] ?? null,
};

const index = composeIndex({
  staticRecords: buildStaticRecords({ scheduleData: SCHEDULE_DATA, seasonSchedule: SEASON_SCHEDULE }),
  playerRecords: buildPlayerRecords(PLAYERS),
  leagueRecords: buildLeagueRecords(FANTASY_LEAGUE),
});

const DATA = {
  weeklyStats: WEEKLY_STATS,
  players: PLAYERS,
  scoring: SCORING,
  nflTeams: SCHEDULE_DATA.teams,
  nflSchedule: NFL_SCHEDULE,
  fantasyLeague: { ...FANTASY_LEAGUE, myRosterId: 1 },
};

function search(query) {
  const slots = parseGlobalQuery(query);
  const groups = rankResults(index, slots, { groupLimit: 6 });
  return { slots, groups, answer: resolveAnswer(slots, groups, DATA) };
}

const labelsOf = (groups, kind) => groups.find((group) => group.kind === kind)?.results.map((entry) => entry.record.label) ?? [];

test('a compare operator splits the query into two independently parsed sides', () => {
  const slots = parseGlobalQuery('marcus vane vs elias roan');
  assert.equal(slots.operator, 'compare');
  assert.deepEqual(slots.compare.left.nameTerms, ['marcus', 'vane']);
  assert.deepEqual(slots.compare.right.nameTerms, ['elias', 'roan']);
  assert.equal(slots.compare.left.compare, null, 'sides never split again');

  assert.deepEqual(parseGlobalQuery('bills versus seahawks').compare.right.teams, ['sea']);
  assert.equal(parseGlobalQuery('vane vs').compare, null, 'one empty side is not a comparison');
  assert.equal(parseGlobalQuery('vs roan').compare, null);
  assert.equal(parseGlobalQuery('vane roan').compare, null);
});

test('both players of a comparison are found, each side leading with its best match', () => {
  const { groups } = search('vane vs roan');
  assert.deepEqual(labelsOf(groups, 'player').slice(0, 2), ['Marcus Vane', 'Elias Roan']);
  assert.ok(labelsOf(groups, 'player').includes('Tomas Roan'), 'the weaker reading is still listed');
});

test('two teams keep only the games they play each other', () => {
  const { groups } = search('bills vs seahawks');
  assert.deepEqual(labelsOf(groups, 'nflTeam').sort(), ['Buffalo Bills', 'Seattle Seahawks']);
  assert.deepEqual(labelsOf(groups, 'game'), ['Buffalo Bills at Seattle Seahawks']);
});

test('the pair is the best same-kind match on each side', () => {
  const { groups } = search('bills vs seahawks');
  const pair = pickComparePair(groups);
  assert.equal(pair.kind, 'nflTeam');
  assert.equal(pair.left.label, 'Buffalo Bills');
  assert.equal(pair.right.label, 'Seattle Seahawks');
});

test('a player comparison lines up season values and marks the better side', () => {
  const { answer } = search('vane vs roan');
  assert.equal(answer.kind, 'compare');
  assert.equal(answer.title, 'Marcus Vane vs Elias Roan');
  assert.deepEqual(answer.sides.map((side) => side.sleeperId), ['wr1', 'wr2']);

  const rows = Object.fromEntries(answer.rows.map((row) => [row.key, row]));
  // Vane: 13 rec, 180 yd, 1 td = 13 + 18 + 6 = 37. Roan: 10 rec, 150 yd, 1 td = 31.
  assert.equal(rows.pts.left, '37.0');
  assert.equal(rows.pts.right, '31.0');
  assert.equal(rows.pts.leader, 'left');
  assert.equal(rows.rank.left, 'WR1');
  assert.equal(rows.rank.right, 'WR2');
  assert.equal(rows.rank.leader, 'left', 'a lower rank number is better');
  assert.equal(rows.games.leader, null, 'games played favours nobody');
  assert.equal(rows.value, undefined, 'no trade value row without market data');
});

test('ranks at different positions are not compared', () => {
  const { answer } = search('vane vs pryor');
  const rank = answer.rows.find((row) => row.key === 'rank');
  assert.equal(rank.left, 'WR1');
  assert.equal(rank.right, 'QB1');
  assert.equal(rank.leader, null);
});

test('with stats not loaded, a player comparison still names both players', () => {
  const slots = parseGlobalQuery('vane vs roan');
  const groups = rankResults(index, slots, { groupLimit: 6 });
  const answer = resolveAnswer(slots, groups, { players: PLAYERS });
  assert.equal(answer.kind, 'compare');
  assert.deepEqual(answer.sides.map((side) => side.label), ['Marcus Vane', 'Elias Roan']);
  assert.deepEqual(answer.rows, []);
  assert.equal(answer.subtitle, null);
});

test('an NFL team comparison uses the standings model and favours fewer points against', () => {
  const { answer } = search('bills vs seahawks');
  const rows = Object.fromEntries(answer.rows.map((row) => [row.key, row]));
  assert.equal(rows.record.left, '0-1');
  assert.equal(rows.record.right, '1-0');
  assert.equal(rows.record.leader, 'right');
  assert.equal(rows.pa.leader, 'right');
  assert.equal(rows.sos.leader, null);
  assert.deepEqual(answer.sides[1].route, { activeTab: 'statistics', statisticsView: 'team', statisticsTeamId: 'SEA' });
});

test('a fantasy team comparison reads the league standings', () => {
  const { answer } = search('turf monsters vs cleat chasers');
  assert.equal(answer.title, 'Turf Monsters vs Cleat Chasers');
  const rows = Object.fromEntries(answer.rows.map((row) => [row.key, row]));
  assert.equal(rows.record.leader, 'left');
  assert.equal(rows.pf.leader, 'right');
});

test('mixed kinds on the two sides give no card, but the results still list both', () => {
  const { answer, groups } = search('vane vs bills');
  assert.equal(answer, null);
  assert.ok(labelsOf(groups, 'player').includes('Marcus Vane'));
  assert.ok(labelsOf(groups, 'nflTeam').includes('Buffalo Bills'));
});
