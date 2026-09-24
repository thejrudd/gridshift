import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveResultRoute } from '../../src/utils/globalSearch/resolveRoute.js';
import { buildPlayerRecords } from '../../src/utils/globalSearch/entities/players.js';
import { buildNflTeamRecords } from '../../src/utils/globalSearch/entities/nflTeams.js';
import { buildGameRecords } from '../../src/utils/globalSearch/entities/games.js';
import { buildStaticRecords, composeIndex } from '../../src/utils/globalSearch/buildIndex.js';
import { parseGlobalQuery } from '../../src/utils/globalSearch/parseIntent.js';
import { rankResults } from '../../src/utils/globalSearch/rank.js';

const [WITH_ESPN_ID, WITHOUT_ESPN_ID, NO_TEAM] = buildPlayerRecords({
  1: { full_name: 'Known Player', team: 'SEA', position: 'WR', number: 11, search_rank: 5, active: true, espn_id: '4426515' },
  2: { full_name: 'Unknown Player', team: 'SEA', position: 'TE', number: 88, search_rank: 30, active: true },
  3: { full_name: 'Free Agent', team: null, position: 'RB', number: 20, search_rank: 100, active: true },
});

const SEA_ROSTER = [
  { id: '9001', displayName: 'Known Player', position: 'WR', jersey: '11' },
  { id: '9002', displayName: 'Unknown Player', position: 'TE', jersey: '88' },
];

test('a player the index has an ESPN id for routes without any lookup', async () => {
  let fetched = false;
  const result = await resolveResultRoute({ record: WITH_ESPN_ID }, {
    rosterFetcher: async () => { fetched = true; return SEA_ROSTER; },
  });

  assert.equal(result.route.statisticsView, 'player');
  assert.equal(result.route.statisticsPlayerId, '4426515');
  assert.equal(result.route.statisticsPlayerSlug, 'known-player');
  assert.equal(fetched, false, 'the fast path does no network work');
});

test('a player without an ESPN id resolves from their team roster', async () => {
  // Regression: the fallback used to require the Sleeper player directory to be
  // loaded in memory. It usually is not, so roughly 70% of players resolved to a
  // null route and clicking them did nothing at all.
  const result = await resolveResultRoute({ record: WITHOUT_ESPN_ID }, {
    rosterFetcher: async (team) => (team === 'SEA' ? SEA_ROSTER : []),
  });

  assert.equal(result.route.statisticsPlayerId, '9002');
  assert.equal(result.playerMeta.displayName, 'Unknown Player');
  assert.equal(result.reason, null);
});

test('the roster lookup is driven by the record alone, not the Sleeper directory', async () => {
  let requestedTeam = null;
  await resolveResultRoute({ record: WITHOUT_ESPN_ID }, {
    rosterFetcher: async (team) => { requestedTeam = team; return SEA_ROSTER; },
  });
  assert.equal(requestedTeam, 'SEA', 'the team comes from the record');
});

test('an unresolvable player reports a reason instead of failing silently', async () => {
  const noMatch = await resolveResultRoute({ record: WITHOUT_ESPN_ID }, {
    rosterFetcher: async () => [],
  });
  assert.equal(noMatch.route, null);
  assert.equal(noMatch.reason, 'no-espn-id', 'the caller can tell the user why');

  const noTeam = await resolveResultRoute({ record: NO_TEAM }, {
    rosterFetcher: async () => SEA_ROSTER,
  });
  assert.equal(noTeam.route, null);
  assert.equal(noTeam.reason, 'no-espn-id');
});

test('a failed roster fetch degrades to a reason rather than throwing', async () => {
  const result = await resolveResultRoute({ record: WITHOUT_ESPN_ID }, {
    rosterFetcher: async () => { throw new Error('offline'); },
  });
  assert.equal(result.route, null);
  assert.equal(result.reason, 'no-espn-id');
});

test('name matching tolerates suffixes and accents', async () => {
  const [record] = buildPlayerRecords({
    1: { full_name: 'Michael Pittman Jr.', team: 'IND', position: 'WR', number: 11, search_rank: 40, active: true },
  });
  const result = await resolveResultRoute({ record }, {
    rosterFetcher: async () => [{ id: '7777', displayName: 'Michael Pittman', position: 'WR', jersey: '11' }],
  });
  assert.equal(result.route.statisticsPlayerId, '7777');
});

test('same-named teammates are separated by position', async () => {
  const [record] = buildPlayerRecords({
    1: { full_name: 'Josh Allen', team: 'JAX', position: 'LB', number: 41, search_rank: 500, active: true },
  });
  const result = await resolveResultRoute({ record }, {
    rosterFetcher: async () => [
      { id: '1111', displayName: 'Josh Allen', position: 'QB', jersey: '17' },
      { id: '2222', displayName: 'Josh Allen', position: 'LB', jersey: '41' },
    ],
  });
  assert.equal(result.route.statisticsPlayerId, '2222', 'the linebacker, not the quarterback');
});

test('a non-player result uses the route it already carries', async () => {
  const [team] = buildNflTeamRecords({
    teams: [{ id: 'SEA', name: 'Seattle Seahawks', division: 'NFC West', conference: 'NFC', city: 'Seattle', nickname: 'Seahawks' }],
  });
  const result = await resolveResultRoute({ record: team, route: team.route }, {});
  assert.equal(result.route.statisticsView, 'team');
  assert.equal(result.route.statisticsTeamId, 'SEA');
  assert.equal(result.playerMeta, null);
});

test('a rank-adapted route wins over the record default', async () => {
  const [team] = buildNflTeamRecords({
    teams: [{ id: 'ARI', name: 'Arizona Cardinals', division: 'NFC West', conference: 'NFC', city: 'Arizona', nickname: 'Cardinals' }],
  });
  const adapted = { activeTab: 'statistics', statisticsView: 'schedule', statisticsScheduleMode: 'team', statisticsScheduleTeamId: 'ARI' };
  const result = await resolveResultRoute({ record: team, route: adapted }, {});
  assert.equal(result.route.statisticsView, 'schedule');
});

test('a missing record is handled rather than thrown on', async () => {
  const result = await resolveResultRoute(null, {});
  assert.equal(result.route, null);
  assert.equal(result.reason, 'no-record');
});

// ── Game results ───────────────────────────────────────────────────────────

const [SEA_GAME] = buildGameRecords({
  season: 2026,
  weeks: {
    3: [{
      id: '2026-W03-SEA-ARI',
      espnEventId: '401872700',
      awayTeam: 'SEA',
      homeTeam: 'ARI',
      kickoff: '2026-09-27T17:00:00.000Z',
    }],
  },
}, { teams: [{ id: 'SEA', name: 'Seattle Seahawks' }, { id: 'ARI', name: 'Arizona Cardinals' }] });

const BEFORE_KICKOFF = Date.parse('2026-09-26T12:00:00.000Z');
const IN_PROGRESS = Date.parse('2026-09-27T18:00:00.000Z');
const AFTER_GAME = Date.parse('2026-09-30T12:00:00.000Z');

test('a game that has kicked off opens its Scores page', async () => {
  for (const now of [IN_PROGRESS, AFTER_GAME]) {
    const { route } = await resolveResultRoute({ record: SEA_GAME, focusTeamId: 'SEA' }, { now });
    assert.equal(route.statisticsView, 'scores');
    assert.equal(route.statisticsScoresGameId, '401872700');
    assert.equal(route.statisticsScoresWeek, 3);
    assert.equal(route.statisticsScoresSeason, 2026);
    assert.equal(route.statisticsScoresAwayTeamId, 'SEA');
    assert.equal(route.statisticsScoresHomeTeamId, 'ARI');
  }
});

test('an unplayed game opens the schedule of the team the query named', async () => {
  const { route } = await resolveResultRoute({ record: SEA_GAME, focusTeamId: 'ARI' }, { now: BEFORE_KICKOFF });
  assert.equal(route.statisticsView, 'schedule');
  assert.equal(route.statisticsScheduleMode, 'team');
  assert.equal(route.statisticsScheduleTeamId, 'ARI');
});

test('an unplayed game found without naming a team keeps its week schedule', async () => {
  const { route } = await resolveResultRoute({ record: SEA_GAME }, { now: BEFORE_KICKOFF });
  assert.equal(route.statisticsView, 'schedule');
  assert.equal(route.statisticsScheduleMode, 'week');
  assert.equal(route.statisticsScheduleWeek, 3);
});

test('ranking records which team a game result was found through', () => {
  const index = composeIndex({
    staticRecords: buildStaticRecords({
      scheduleData: { teams: [{ id: 'SEA', name: 'Seattle Seahawks' }, { id: 'ARI', name: 'Arizona Cardinals' }] },
      seasonSchedule: { season: 2026, weeks: { 3: [{ id: 'g', awayTeam: 'SEA', homeTeam: 'ARI', kickoff: '2026-09-27T17:00:00.000Z' }] } },
    }),
  });
  const groups = rankResults(index, parseGlobalQuery('arizona week 3'));
  const game = groups.flatMap((group) => group.results).find((entry) => entry.record.id === 'g');
  assert.equal(game?.focusTeamId, 'ARI');
});
