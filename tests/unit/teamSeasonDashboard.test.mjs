import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStandings, buildTeamGame, buildTeamRanks, upcomingGames } from '../../src/utils/teamSeason/teamSeasonModel.js';
import {
  depthIndex,
  depthStanding,
  fantasyScoring,
  linePoints,
  nameKey,
  roleOf,
  seasonTotals,
} from '../../src/utils/teamSeason/teamDashboardModel.js';
import { createTeamSeasonService } from '../../server/teamSeasonHandlers.js';

const team = (abbreviation, conference, division) => ({ abbreviation, conference, division, name: abbreviation, full_name: `${abbreviation} Team` });
const SEA = team('SEA', 'NFC', 'WEST');
const SF = team('SF', 'NFC', 'WEST');
const KC = team('KC', 'AFC', 'WEST');

const GAMES = [
  { id: 1, week: 1, date: '2026-09-10T00:00:00Z', status: 'Final', home_team: SEA, visitor_team: SF, home_team_score: 17, visitor_team_score: 10, home_team_q1: 7, home_team_q2: 0, home_team_q3: 3, home_team_q4: 7, visitor_team_q1: 0, visitor_team_q2: 10, visitor_team_q3: 0, visitor_team_q4: 0 },
  { id: 2, week: 2, date: '2026-09-17T00:00:00Z', status: 'Final/OT', home_team: KC, visitor_team: SEA, home_team_score: 23, visitor_team_score: 20, home_team_ot: 3, visitor_team_ot: 0 },
  { id: 3, week: 3, date: '2026-09-24T00:00:00Z', status: 'Final', home_team: SF, visitor_team: KC, home_team_score: 30, visitor_team_score: 3 },
  { id: 4, week: 4, date: '2026-10-01T00:00:00Z', status: 'Scheduled', home_team: SEA, visitor_team: KC, venue: 'Lumen Field' },
];

test('standings count records, points, and division games', () => {
  const { standings, teams } = buildStandings(GAMES);
  const sea = standings.find((row) => row.t === 'SEA');
  assert.deepEqual([sea.w, sea.l, sea.pf, sea.pa, sea.dw, sea.dl], [1, 1, 37, 33, 1, 0]);
  assert.equal(teams.SEA.div, 'WEST');
  assert.equal(standings.length, 3);
});

test('upcoming games list only the team’s unplayed games', () => {
  const upcoming = upcomingGames(GAMES, 'SEA');
  assert.equal(upcoming.length, 1);
  assert.deepEqual([upcoming[0].opp, upcoming[0].home, upcoming[0].venue], ['KC', true, 'Lumen Field']);
});

test('team ranks pair both sides of each game and share tied ranks', () => {
  const rows = [
    { game: { id: 1 }, team: SEA, total_yards: 350, turnovers: 0, sacks: 1, total_offensive_plays: 60 },
    { game: { id: 1 }, team: SF, total_yards: 250, turnovers: 2, sacks: 3, total_offensive_plays: 55 },
    { game: { id: 3 }, team: SF, total_yards: 400, turnovers: 0, sacks: 0, total_offensive_plays: 65 },
    { game: { id: 3 }, team: KC, total_yards: 200, turnovers: 1, sacks: 2, total_offensive_plays: 50 },
    { game: { id: 2 }, team: KC, total_yards: 300 }, // missing its pair: skipped
  ];
  const { ranks, leagueGames } = buildTeamRanks(GAMES, rows);
  assert.equal(leagueGames, 2);
  const yards = ranks.find((rank) => rank.key === 'yds');
  assert.deepEqual(yards.vals.map((entry) => entry.t), ['SEA', 'SF', 'KC']);
  const allowed = ranks.find((rank) => rank.key === 'ydsA');
  assert.equal(allowed.vals[0].t, 'SEA', 'fewest yards allowed ranks first');
  const takeaways = ranks.find((rank) => rank.key === 'tod');
  assert.equal(takeaways.vals.find((entry) => entry.t === 'SEA').v, 2);
});

const DETAIL = {
  game: GAMES[0],
  playerStats: [
    { player: { id: 10, first_name: 'Sam', last_name: 'Darnold', position_abbreviation: 'QB', jersey_number: '14' }, team: SEA, passing_attempts: 30, passing_completions: 20, passing_yards: 250, passing_touchdowns: 2 },
    { player: { id: 20, first_name: 'Brock', last_name: 'Purdy', position_abbreviation: 'QB' }, team: SF, passing_attempts: 25 },
  ],
  teamStats: [{ team: SEA, total_yards: 350 }, { team: SF, total_yards: 250 }],
  plays: [
    { period: 1, clock_display: '15:00', type_slug: 'kickoff', text: 'kicks off', team: SF },
    { period: 1, clock_display: '14:50', type_slug: 'rush', text: 'K.Walker up the middle to SEA 30 for 5 yards.', team: SEA, start_down: 1, home_score: 0, away_score: 0 },
    { period: 1, clock_display: '12:00', type_slug: 'passing-touchdown', text: 'S.Darnold pass short right to J.Smith-Njigba for 20 yards, TOUCHDOWN.', team: SEA, scoring_play: true, home_score: 7, away_score: 0 },
    { period: 1, clock_display: '11:55', type_slug: 'kickoff', text: 'kicks off', team: SEA },
    { period: 1, clock_display: '11:50', type_slug: 'rush', text: 'C.McCaffrey left end to SF 30 for 4 yards.', team: SF, start_down: 1, home_score: 7, away_score: 0 },
    // BALLDONTLIE names the team that ends up with the ball on a kick; the shared rule flips it back to the punting offense.
    { period: 1, clock_display: '10:00', type_slug: 'punt', text: 'M.Wishnowsky punts 50 yards.', team: SEA, start_down: 4, home_score: 7, away_score: 0 },
  ],
};

test('a team game carries its box lines, quarter scores, drives, and scoring plays', () => {
  const game = buildTeamGame(DETAIL, 'SEA');
  assert.equal(game.opp, 'SF');
  assert.deepEqual([game.pf, game.pa], [17, 10]);
  assert.deepEqual(game.qf, [7, 0, 3, 7, 0]);
  assert.equal(game.lines.length, 1, 'only this team’s players');
  assert.equal(game.lines[0].n, 'Sam Darnold');
  assert.equal(game.ts.me.total_yards, 350);
  assert.deepEqual(game.drives.map((drive) => [drive.tm, drive.r]), [['me', 'Touchdown'], ['opp', 'Punt']]);
  assert.deepEqual(game.scoring, [{ side: 'me', type: 'Passing TD', pts: 7, q: 1 }]);
  assert.equal(buildTeamGame(DETAIL, 'KC'), null);
});

test('overtime is flagged from the team’s overtime score', () => {
  const game = buildTeamGame({ game: GAMES[1], plays: [], playerStats: [], teamStats: [] }, 'SEA');
  assert.equal(game.ot, true);
  assert.equal(game.home, false);
});

const UNITS = [
  { name: '3WR 1TE', slots: [{ key: 'qb', abbr: 'QB', name: 'Quarterback', athletes: [{ id: 'e1', name: 'Sam Darnold' }, { id: 'e2', name: 'Drew Lock' }] }, { key: 'wr2', abbr: 'WR2', name: 'Wide Receiver', athletes: [{ id: 'e3', name: 'Rashid Shaheed' }] }] },
  { name: 'Base 3-4 D', slots: [{ key: 'slb', abbr: 'SLB', name: 'Strongside Linebacker', athletes: [{ id: 'e4', name: 'Uchenna Nwosu' }, { id: 'e5', name: 'Derick Hall' }] }] },
];

test('depth roles and standings label starters and backups with who is ahead', () => {
  const index = depthIndex(UNITS);
  assert.equal(roleOf('WR', index.e3), 'WR');
  assert.equal(roleOf('LB', index.e5), 'EDGE', 'a strongside linebacker slot is an edge rusher');
  assert.equal(roleOf('LS', []), null);
  const slotAthletes = (slot) => UNITS.flatMap((unit) => unit.slots).find((entry) => entry.key === slot.k)?.athletes;
  assert.deepEqual(depthStanding(index.e1, 'QB', slotAthletes), { backup: false, slot: index.e1[0], text: 'Starter at QB' });
  const hall = depthStanding(index.e5, 'EDGE', slotAthletes);
  assert.equal(hall.backup, true);
  assert.equal(hall.text, '2nd at SLB, behind Nwosu');
  assert.equal(depthStanding([], 'S').text, 'Not on the depth chart');
});

test('fantasy presets score kickers by kicks; league scoring leaves them out', () => {
  const preset = fantasyScoring('half');
  const receiver = { receptions: 4, receiving_yards: 50, receiving_targets: 6 };
  assert.equal(linePoints(receiver, 'WR', preset), 4 * 0.5 + 5);
  assert.equal(linePoints({ field_goals_made: 2, field_goal_attempts: 2, extra_points_made: 3 }, 'PK', preset), 9);
  const league = fantasyScoring('league', { ...preset.scoring, rec: 1 });
  assert.equal(linePoints({ field_goals_made: 2, field_goal_attempts: 2 }, 'K', league), null);
  assert.equal(linePoints({ total_tackles: 5 }, 'LB', preset), null, 'defenders have no fantasy line');
});

test('season totals sum box lines and keep longs as maxima', () => {
  const games = [
    { lines: [{ id: 1, n: 'A', pos: 'RB', rushing_attempts: 10, rushing_yards: 40, long_rushing: 12 }] },
    { lines: [{ id: 1, n: 'A', pos: 'RB', rushing_attempts: 5, rushing_yards: 60, long_rushing: 30 }] },
  ];
  const [entry] = seasonTotals(games, fantasyScoring('std'));
  assert.deepEqual([entry.gp, entry.rushing_yards, entry.long_rushing, entry.fp], [2, 100, 30, 10]);
  assert.equal(nameKey('James Cook III'), nameKey('James Cook'));
});

test('the team route validates its query before any provider call', async () => {
  const service = createTeamSeasonService({ gateway: null });
  await assert.rejects(service.season({ season: 2019, team: 'SEA' }), /season/);
  await assert.rejects(service.season({ season: 2026, team: 'SEATTLE' }), /team/);
});

test('a 4-3 depth chart puts its ends on the edge and its linebackers off the ball', () => {
  const index = depthIndex([
    { name: 'Base 4-3 D', slots: [
      { key: 'rde', abbr: 'RDE', name: 'Right Defensive End', athletes: [{ id: 'd1', name: 'Edge One' }] },
      { key: 'ldt', abbr: 'LDT', name: 'Left Defensive Tackle', athletes: [{ id: 'd2', name: 'Tackle One' }] },
      { key: 'slb', abbr: 'SLB', name: 'Strongside Linebacker', athletes: [{ id: 'd3', name: 'Backer One' }] },
    ] },
  ]);
  assert.equal(roleOf('DE', index.d1), 'EDGE');
  assert.equal(roleOf('DT', index.d2), 'DL');
  assert.equal(roleOf('LB', index.d3), 'LB', 'a 4-3 strongside linebacker is not an edge rusher');
  assert.equal(roleOf('DE', []), 'EDGE', 'without a depth chart a listed end is the edge rusher');
  assert.equal(roleOf('PK', []), 'K');
});

test('the depth chart route validates the team and caches ESPN’s answer', async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return { ok: true, json: async () => ({ depthchart: [{ name: 'Base 4-3 D', positions: {} }] }) }; };
  const service = createTeamSeasonService({ gateway: null, fetcher });
  await assert.rejects(service.depthChart({ team: 'k c' }), /team/);
  const first = await service.depthChart({ team: 'KC' });
  const second = await service.depthChart({ team: 'kc' });
  assert.equal(first.depthchart[0].name, 'Base 4-3 D');
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
});
