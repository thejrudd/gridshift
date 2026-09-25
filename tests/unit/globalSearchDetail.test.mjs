import test from 'node:test';
import assert from 'node:assert/strict';

import { buildResultDetail } from '../../src/utils/globalSearch/detail.js';
import { buildStaticRecords, composeIndex } from '../../src/utils/globalSearch/buildIndex.js';
import { buildPlayerRecords } from '../../src/utils/globalSearch/entities/players.js';
import { buildCommandRecords } from '../../src/utils/globalSearch/entities/commands.js';
import { buildAppViewRecords } from '../../src/utils/globalSearch/entities/appViews.js';
import { buildFantasyTeamRecords } from '../../src/utils/globalSearch/entities/fantasyTeams.js';
import { KIND_PLAYER } from '../../src/utils/globalSearch/entities/record.js';
import { buildFantasyOwnership } from '../../src/utils/fantasyOwnership.js';

const SCHEDULE_DATA = {
  season: 2026,
  teams: [
    { id: 'SEA', name: 'Seattle Seahawks', division: 'NFC West', conference: 'NFC', city: 'Seattle', nickname: 'Seahawks' },
    { id: 'ARI', name: 'Arizona Cardinals', division: 'NFC West', conference: 'NFC', city: 'Arizona', nickname: 'Cardinals' },
  ],
};

// SEA plays weeks 1 and 3; week 2 is their bye.
const SEASON_SCHEDULE = {
  season: 2026,
  weeks: {
    1: [{ id: 'g1', week: 1, awayTeam: 'ARI', homeTeam: 'SEA', kickoff: '2020-09-10T00:20:00.000Z', network: 'NBC' }],
    2: [{ id: 'g2', week: 2, awayTeam: 'ARI', homeTeam: 'ARI', kickoff: '2020-09-17T00:20:00.000Z', network: 'FOX' }],
    3: [{ id: 'g3', week: 3, awayTeam: 'SEA', homeTeam: 'ARI', kickoff: '2099-09-24T00:20:00.000Z', network: 'CBS' }],
  },
};

const index = composeIndex({
  staticRecords: buildStaticRecords({ scheduleData: SCHEDULE_DATA, seasonSchedule: SEASON_SCHEDULE }),
  playerRecords: buildPlayerRecords({
    1: {
      full_name: 'Indexed Receiver', team: 'SEA', position: 'WR', number: 11,
      search_rank: 5, active: true, height: `6' 2\"`, weight: '205',
    },
  }),
});

const recordOf = (kind, predicate) => index.records.find(
  (record) => record.kind === kind && predicate(record),
);

const labelsOf = (detail) => detail.facts.map((fact) => fact.label);
const valueFor = (detail, label) => detail.facts.find((fact) => fact.label === label)?.value;

test('a player shows position, number, next game, and bye', () => {
  const player = recordOf('player', (record) => record.label === 'Indexed Receiver');
  const detail = buildResultDetail(player, { index });

  assert.equal(valueFor(detail, 'Position'), 'WR');
  assert.equal(valueFor(detail, 'Number'), '#11');
  assert.equal(labelsOf(detail).includes('Height'), false, 'measurements are already visible on the player result row');
  assert.equal(valueFor(detail, 'Bye'), 'Week 2', 'the week with no scheduled game');
  assert.ok(labelsOf(detail).some((label) => label.startsWith('Next · Week 3')));
});

test('the next game is the first one that has not kicked off', () => {
  // Weeks 1 and 2 are in the past; week 3 is not.
  const player = recordOf('player', (record) => record.label === 'Indexed Receiver');
  const detail = buildResultDetail(player, { index });
  const next = detail.facts.find((fact) => fact.label.startsWith('Next'));
  assert.equal(next.label, 'Next · Week 3');
  assert.equal(next.value, 'at ARI', 'SEA is the away team that week');
});

test('home and away are labelled from the subject team perspective', () => {
  const team = recordOf('nflTeam', (record) => record.meta.teamId === 'ARI');
  const detail = buildResultDetail(team, { index });
  const next = detail.facts.find((fact) => fact.label.startsWith('Next'));
  assert.equal(next.value, 'vs SEA', 'ARI hosts that week');
});

test('a team shows its division alongside its schedule facts', () => {
  const team = recordOf('nflTeam', (record) => record.meta.teamId === 'SEA');
  const detail = buildResultDetail(team, { index });
  assert.equal(valueFor(detail, 'Division'), 'NFC West');
});

test('a game shows its matchup, kickoff, and broadcast', () => {
  const game = recordOf('game', (record) => record.meta.week === 3 && !record.meta.isWeekIndex);
  const detail = buildResultDetail(game, { index });
  assert.equal(valueFor(detail, 'Matchup'), 'SEA at ARI');
  assert.equal(valueFor(detail, 'Watch'), 'CBS');
  assert.ok(valueFor(detail, 'Kickoff'), 'a formatted kickoff is present');
});

test('a week shows how many games it holds rather than repeating its own label', () => {
  const week = recordOf('game', (record) => record.meta.isWeekIndex && record.meta.week === 1);
  const detail = buildResultDetail(week, { index });
  assert.equal(valueFor(detail, 'Games'), '1');
  assert.equal(labelsOf(detail).includes('Week'), false, 'the row label already says the week');
});

test('commands and destinations have no detail at all', () => {
  // Their row already says everything; expanding one would echo the label back.
  const [command] = buildCommandRecords();
  const [view] = buildAppViewRecords();

  assert.deepEqual(buildResultDetail(command, { index }), { facts: [], stats: null, fantasy: null });
  assert.deepEqual(buildResultDetail(view, { index }), { facts: [], stats: null, fantasy: null });
});

test('a fantasy team shows its manager only when that adds something', () => {
  const [named] = buildFantasyTeamRecords({
    rosters: [{ roster_id: 1, owner_id: 'u1' }],
    leagueUsers: [{ user_id: 'u1', metadata: { team_name: 'Turf Monsters' } }],
    getUserDisplayName: () => 'Dana',
  });
  assert.equal(valueFor(buildResultDetail(named, { index }), 'Manager'), 'Dana');

  const [unnamed] = buildFantasyTeamRecords({
    rosters: [{ roster_id: 2, owner_id: 'u2' }],
    leagueUsers: [{ user_id: 'u2' }],
    getUserDisplayName: () => 'Sam',
  });
  assert.deepEqual(
    buildResultDetail(unnamed, { index }).facts,
    [],
    'the row label is already the manager name',
  );
});

test('a stat line appears only when the app already has the stats', () => {
  const player = recordOf('player', (record) => record.label === 'Indexed Receiver');

  assert.equal(buildResultDetail(player, { index }).stats, null, 'no stats cached, no stat line');

  const withStats = buildResultDetail(player, {
    index,
    answerData: {
      weeklyStats: { [player.meta.sleeperId]: [{ week: 1, rec: 6, rec_yd: 88, rec_td: 1, rec_tgt: 9 }] },
      scoring: { rec: 1, rec_yd: 0.1, rec_td: 6 },
      currentWeek: 2,
    },
  });
  assert.ok(withStats.stats.values.length, 'a stat line renders when the data is there');
});

test('detail never fetches, so a missing index degrades to what the record knows', () => {
  const player = recordOf('player', (record) => record.label === 'Indexed Receiver');
  const detail = buildResultDetail(player, { index: null });
  assert.equal(valueFor(detail, 'Position'), 'WR');
  assert.equal(labelsOf(detail).some((label) => label.startsWith('Next')), false);
});

test('detail tolerates a missing record', () => {
  assert.deepEqual(buildResultDetail(null, { index }), { facts: [], stats: null, fantasy: null });
});

// ── Fantasy ownership ───────────────────────────────────────────────────────
// Who rosters this player in the connected league, and where that leads.

const OWNERSHIP = buildFantasyOwnership({
  rosters: [
    { roster_id: 1, owner_id: 'u1', players: ['1'] },
    { roster_id: 2, owner_id: 'u2', players: ['9'], reserve: ['2'] },
  ],
  leagueUsers: [
    { user_id: 'u1', metadata: { team_name: 'Turf Monsters' } },
    { user_id: 'u2', metadata: {} },
  ],
  getUserDisplayName: (id) => (id === 'u2' ? 'Dana' : 'Sam'),
  myRosterId: 2,
});

const player = recordOf(KIND_PLAYER, (record) => record.label === 'Indexed Receiver');

test('a rostered player names the team that holds them', () => {
  const { fantasy } = buildResultDetail(player, {
    index,
    answerData: { fantasyOwnership: OWNERSHIP },
  });
  assert.equal(fantasy.label, 'Turf Monsters');
  assert.equal(fantasy.isMine, false);
  assert.deepEqual(fantasy.actions.map((action) => action.key), ['roster', 'matchup']);
  assert.equal(fantasy.actions[0].route.leagueRosterId, '1');
  assert.equal(fantasy.actions[1].route.matchupRosterId, '1');
});

test('your own roster is named as yours rather than by team name', () => {
  const mine = { ...player, meta: { ...player.meta, sleeperId: '2' } };
  const { fantasy } = buildResultDetail(mine, {
    index,
    answerData: { fantasyOwnership: OWNERSHIP },
  });
  assert.equal(fantasy.label, 'On your roster');
  assert.equal(fantasy.isMine, true);
  // A player stashed on IR is still owned — it is the ownership, not the
  // lineup slot, that decides who you would be trading with.
  assert.equal(fantasy.actions[0].route.leagueRosterId, '2');
});

test('an unrostered player is a free agent, with nowhere to go', () => {
  const nobody = { ...player, meta: { ...player.meta, sleeperId: '404' } };
  const { fantasy } = buildResultDetail(nobody, {
    index,
    answerData: { fantasyOwnership: OWNERSHIP },
  });
  assert.equal(fantasy.label, 'Free agent');
  assert.deepEqual(fantasy.actions, []);
});

test('with no league connected the palette says nothing about ownership', () => {
  // Every player would look unowned, and stating that would be a claim the
  // data does not support.
  const { fantasy } = buildResultDetail(player, { index, answerData: {} });
  assert.equal(fantasy, null);
});
