import test from 'node:test';
import assert from 'node:assert/strict';

import { parseGlobalQuery } from '../../src/utils/globalSearch/parseIntent.js';
import { resolveTeamScope, isTeamInScope } from '../../src/utils/globalSearch/answers/scope.js';
import {
  buildFantasyStandingsModel,
  buildNflStandingsModel,
  resolveStandingsAnswer,
} from '../../src/utils/globalSearch/answers/standings.js';
import { resolveTeamStatsAnswer } from '../../src/utils/globalSearch/answers/teamStats.js';

const NFL_TEAMS = [
  { id: 'SEA', name: 'Seattle Seahawks', division: 'NFC West', conference: 'NFC' },
  { id: 'ARI', name: 'Arizona Cardinals', division: 'NFC West', conference: 'NFC' },
  { id: 'SF', name: 'San Francisco 49ers', division: 'NFC West', conference: 'NFC' },
  { id: 'LAR', name: 'Los Angeles Rams', division: 'NFC West', conference: 'NFC' },
  { id: 'BUF', name: 'Buffalo Bills', division: 'AFC East', conference: 'AFC' },
  { id: 'MIA', name: 'Miami Dolphins', division: 'AFC East', conference: 'AFC' },
];

// Two completed weeks. SEA beats ARI then SF; BUF beats MIA; LAR idle after
// losing to SF, so the division has a spread of records to sort.
const NFL_SCHEDULE = {
  season: 2026,
  weeks: [
    {
      week: 1,
      games: [
        { awayTeam: 'ARI', homeTeam: 'SEA', awayScore: 17, homeScore: 24, status: 'final' },
        { awayTeam: 'LAR', homeTeam: 'SF', awayScore: 10, homeScore: 20, status: 'final' },
        { awayTeam: 'MIA', homeTeam: 'BUF', awayScore: 14, homeScore: 31, status: 'final' },
      ],
    },
    {
      week: 2,
      games: [
        { awayTeam: 'SF', homeTeam: 'SEA', awayScore: 13, homeScore: 27, status: 'final' },
        { awayTeam: 'ARI', homeTeam: 'LAR', awayScore: 21, homeScore: 20, status: 'final' },
        { awayTeam: 'BUF', homeTeam: 'MIA', awayScore: 28, homeScore: 24, status: 'final' },
      ],
    },
  ],
};

const FANTASY_LEAGUE = {
  rosters: [
    { roster_id: 1, owner_id: 'u1', settings: { wins: 2, losses: 0, ties: 0, fpts: 250, fpts_decimal: 50, fpts_against: 190, fpts_against_decimal: 0 } },
    { roster_id: 2, owner_id: 'u2', settings: { wins: 1, losses: 1, ties: 0, fpts: 210, fpts_against: 205 } },
    { roster_id: 3, owner_id: 'u3', settings: { wins: 0, losses: 2, ties: 0, fpts: 180, fpts_against: 245 } },
  ],
  leagueUsers: [
    { user_id: 'u1', metadata: { team_name: 'Turf Monsters' } },
    { user_id: 'u2', metadata: {} },
    { user_id: 'u3', metadata: { team_name: 'Cleat Chasers' } },
  ],
  getUserDisplayName: (id) => ({ u1: 'Sam', u2: 'Dana', u3: 'Alex' })[id] ?? null,
};

const DATA = { nflTeams: NFL_TEAMS, nflSchedule: NFL_SCHEDULE, fantasyLeague: FANTASY_LEAGUE };

// ── Scope ───────────────────────────────────────────────────────────────────

test('a division resolves to its teams', () => {
  const scope = resolveTeamScope(parseGlobalQuery('nfc west standings'), NFL_TEAMS);
  assert.deepEqual([...scope.teamIds].sort(), ['ARI', 'LAR', 'SEA', 'SF']);
  assert.equal(scope.label, 'NFC West');
});

test('a conference resolves to its teams', () => {
  const scope = resolveTeamScope(parseGlobalQuery('afc standings'), NFL_TEAMS);
  assert.deepEqual([...scope.teamIds].sort(), ['BUF', 'MIA']);
  assert.equal(scope.label, 'AFC');
});

test('slots are OR-ed within a type and AND-ed across types', () => {
  // The same rule rank.js filters results by, so a scope means the same set of
  // teams whether it narrows a list or titles a card.
  const both = resolveTeamScope(parseGlobalQuery('seattle arizona sacks'), NFL_TEAMS);
  assert.deepEqual([...both.teamIds].sort(), ['ARI', 'SEA']);

  const crossed = resolveTeamScope(parseGlobalQuery('afc east seattle sacks'), NFL_TEAMS);
  assert.equal(crossed.teamIds.size, 0, 'no team is both a Seahawk and in the AFC East');
});

test('naming nothing means the league, not an empty set', () => {
  const scope = resolveTeamScope(parseGlobalQuery('most rushing yards'), NFL_TEAMS);
  assert.equal(scope.isLeagueWide, true);
  assert.equal(scope.teamIds, null);
  assert.equal(isTeamInScope(scope, 'SEA'), true);
  // A league-wide scope admits a player whose team is unknown; filtering those
  // out would quietly drop free agents from a leaderboard about nobody's team.
  assert.equal(isTeamInScope(scope, null), true);
});

test('a conference is not repeated after its own division', () => {
  const scope = resolveTeamScope(parseGlobalQuery('nfc nfc west standings'), NFL_TEAMS);
  assert.equal(scope.label, 'NFC West');
});

// ── NFL standings ───────────────────────────────────────────────────────────

test('the standings model derives PF, PA, differential and per-game rates', () => {
  const model = buildNflStandingsModel(DATA);
  const sea = model.byId.get('SEA');
  assert.equal(sea.wins, 2);
  assert.equal(sea.losses, 0);
  assert.equal(sea.pointsFor, 51);
  assert.equal(sea.pointsAgainst, 30);
  assert.equal(sea.pointDifferential, 21);
  assert.equal(sea.pointsPerGame, 25.5);
});

test('strength of schedule is the opponents average win percentage', () => {
  // Seattle played ARI (1-1) and SF (1-1), so .500 — and it counts the full
  // schedule, which here is the same two games.
  const model = buildNflStandingsModel(DATA);
  assert.equal(model.byId.get('SEA').strengthOfSchedule, 0.5);
});

test('a division standings card lists exactly that division, in order', () => {
  const answer = resolveStandingsAnswer(parseGlobalQuery('nfc west standings'), DATA);
  assert.equal(answer.kind, 'standings');
  assert.equal(answer.title, 'NFC West standings');
  // SF and ARI are both 1-1; compareStandingRows settles them, and the card
  // uses that same comparator so search and the standings page never disagree.
  assert.deepEqual(answer.rows.map((row) => row.teamId), ['SEA', 'SF', 'ARI', 'LAR']);
  assert.equal(answer.rows[0].values[0], '2-0');
});

test('a division table does not repeat the division on every row', () => {
  const answer = resolveStandingsAnswer(parseGlobalQuery('nfc west standings'), DATA);
  assert.ok(answer.rows.every((row) => row.sublabel == null));
});

test('a conference standings card is scoped to that conference', () => {
  const answer = resolveStandingsAnswer(parseGlobalQuery('afc standings'), DATA);
  assert.deepEqual(answer.rows.map((row) => row.teamId).sort(), ['BUF', 'MIA']);
});

test('standings with nothing played yet answers nothing', () => {
  // Every row would be 0-0 with every derived column empty — a table that
  // answers the question with no information in it.
  const empty = { ...DATA, nflSchedule: { season: 2026, weeks: [{ week: 1, games: [] }] } };
  assert.equal(resolveStandingsAnswer(parseGlobalQuery('nfc west standings'), empty), null);
});

test('a query without the standings intent is not a standings answer', () => {
  assert.equal(resolveStandingsAnswer(parseGlobalQuery('nfc west'), DATA), null);
});

// ── Fantasy standings ───────────────────────────────────────────────────────

test('fantasy standings sort by record then points for', () => {
  const model = buildFantasyStandingsModel(FANTASY_LEAGUE);
  assert.deepEqual(model.rows.map((row) => row.rosterId), ['1', '2', '3']);
  assert.equal(model.rows[0].name, 'Turf Monsters');
  // Sleeper splits the decimal into its own field.
  assert.equal(model.rows[0].pointsFor, 250.5);
  assert.equal(model.rows[0].pointsPerGame, 125.3);
});

test('a fantasy scope word asks for the league table', () => {
  const answer = resolveStandingsAnswer(parseGlobalQuery('fantasy standings'), DATA);
  assert.equal(answer.title, 'League standings');
  assert.equal(answer.rows[0].label, 'Turf Monsters');
  assert.deepEqual(answer.route, { activeTab: 'league', leagueView: 'standings' });
});

test('a manager with no team name is listed under their own name', () => {
  const answer = resolveStandingsAnswer(parseGlobalQuery('my league standings'), DATA);
  assert.equal(answer.rows[1].label, 'Dana');
});

test('a division named alongside a fantasy word still means the NFL', () => {
  // A division is unambiguous evidence; the connected league has no NFC West.
  const answer = resolveStandingsAnswer(parseGlobalQuery('fantasy nfc west standings'), DATA);
  assert.equal(answer.title, 'NFC West standings');
});

// ── Team season stats ───────────────────────────────────────────────────────

test('a team record answers with the whole season line', () => {
  const answer = resolveTeamStatsAnswer(parseGlobalQuery('seahawks record'), DATA);
  assert.equal(answer.title, 'Seattle Seahawks');
  assert.deepEqual(answer.values.map((value) => value.label), [
    'Record', 'Points for', 'Points against', 'Differential',
    'Points per game', 'Strength of schedule',
  ]);
  assert.equal(answer.values[0].display, '2-0');
});

test('naming one stat answers with that stat alone', () => {
  const answer = resolveTeamStatsAnswer(parseGlobalQuery('seahawks point differential'), DATA);
  assert.deepEqual(answer.values.map((value) => value.display), ['+21']);
});

test('points against reads as the team stat, not the defenses view', () => {
  const answer = resolveTeamStatsAnswer(parseGlobalQuery('seahawks points against'), DATA);
  assert.equal(answer.values[0].label, 'Points against');
  assert.equal(answer.values[0].display, '30');
});

test('a player asking a team question gets their team, said out loud', () => {
  // A player has no record of his own. Answering the question behind it is
  // more useful than declining, as long as the card never pretends the number
  // is his.
  const record = { kind: 'player', label: 'Elias Roan', meta: { team: 'SEA' } };
  const answer = resolveTeamStatsAnswer(parseGlobalQuery('elias roan record'), DATA, { record });
  assert.equal(answer.title, 'Seattle Seahawks');
  assert.match(answer.subtitle, /^Elias Roan's team/);
});

test('a fantasy team reports its own season, not an NFL one', () => {
  const record = { kind: 'fantasyTeam', label: 'Turf Monsters', meta: { rosterId: 1 } };
  const answer = resolveTeamStatsAnswer(parseGlobalQuery('turf monsters record'), DATA, { record });
  assert.equal(answer.title, 'Turf Monsters');
  assert.equal(answer.values[0].display, '2-0');
  assert.equal(answer.values[1].display, '250.5');
  // Strength of schedule is an NFL-only column here; a fantasy card does not
  // claim one it cannot compute.
  assert.ok(answer.values.every((value) => value.key !== 'sos'));
});

test('standings and the team card never both fire', () => {
  assert.equal(resolveTeamStatsAnswer(parseGlobalQuery('nfc west standings'), DATA), null);
});

test('a team question with no team named answers nothing', () => {
  assert.equal(resolveTeamStatsAnswer(parseGlobalQuery('record'), DATA), null);
});

test('"my record" answers with your own fantasy team', () => {
  // The empty-state guide offers this exact query as an example, so it has to
  // resolve to something.
  const data = { ...DATA, fantasyLeague: { ...FANTASY_LEAGUE, myRosterId: 2 } };
  const answer = resolveTeamStatsAnswer(parseGlobalQuery('my record'), data);
  assert.equal(answer.title, 'Dana');
  assert.equal(answer.values[0].display, '1-1');
  assert.match(answer.subtitle, /Your team/);
});

test('"my record" with no league falls through rather than guessing', () => {
  assert.equal(
    resolveTeamStatsAnswer(parseGlobalQuery('my record'), { ...DATA, fantasyLeague: null }),
    null,
  );
});

test('naming a team beats the self scope', () => {
  const data = { ...DATA, fantasyLeague: { ...FANTASY_LEAGUE, myRosterId: 2 } };
  const answer = resolveTeamStatsAnswer(parseGlobalQuery('my seahawks record'), data);
  assert.equal(answer.title, 'Seattle Seahawks');
});
