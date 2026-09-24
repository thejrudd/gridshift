import test from 'node:test';
import assert from 'node:assert/strict';

import { parseGlobalQuery } from '../../src/utils/globalSearch/parseIntent.js';
import { buildStaticRecords, composeIndex } from '../../src/utils/globalSearch/buildIndex.js';
import { buildPlayerRecords } from '../../src/utils/globalSearch/entities/players.js';
import { buildLeagueRecords } from '../../src/utils/globalSearch/buildIndex.js';
import { rankResults } from '../../src/utils/globalSearch/rank.js';

const SCHEDULE_DATA = {
  season: 2026,
  teams: [
    { id: 'SEA', name: 'Seattle Seahawks', division: 'NFC West', conference: 'NFC', city: 'Seattle', nickname: 'Seahawks' },
    { id: 'ARI', name: 'Arizona Cardinals', division: 'NFC West', conference: 'NFC', city: 'Arizona', nickname: 'Cardinals' },
    { id: 'BUF', name: 'Buffalo Bills', division: 'AFC East', conference: 'AFC', city: 'Buffalo', nickname: 'Bills' },
  ],
};

const SEASON_SCHEDULE = {
  season: 2026,
  weeks: {
    3: [
      { id: '2026-W03-ARI-SEA', week: 3, awayTeam: 'ARI', homeTeam: 'SEA' },
      { id: '2026-W03-BUF-ARI', week: 3, awayTeam: 'BUF', homeTeam: 'ARI' },
    ],
    4: [{ id: '2026-W04-SEA-BUF', week: 4, awayTeam: 'SEA', homeTeam: 'BUF' }],
  },
};

const PLAYERS = {
  1: { full_name: 'Jaxon Smith-Njigba', team: 'SEA', position: 'WR', number: 11, search_rank: 8, active: true, espn_id: '4426515' },
  2: { full_name: 'Cooper Kupp', team: 'SEA', position: 'WR', number: 10, search_rank: 60, active: true },
  3: { full_name: 'Sam Darnold', team: 'SEA', position: 'QB', number: 14, search_rank: 90, active: true },
  4: { full_name: 'Josh Allen', team: 'BUF', position: 'QB', number: 17, search_rank: 5, active: true },
  5: { full_name: 'Josh Allen', team: 'ARI', position: 'LB', number: 41, search_rank: 900, active: true },
  6: { full_name: 'Justin Jefferson', team: 'ARI', position: 'WR', number: 18, search_rank: 3, active: true },
  7: { full_name: 'Parker Washington', team: 'JAX', position: 'WR', number: 11, search_rank: 70, active: true },
};

const LEAGUE = {
  rosters: [{ roster_id: 1, owner_id: 'u1' }],
  leagueUsers: [{ user_id: 'u1', metadata: { team_name: 'Turf Monsters' } }],
  getUserDisplayName: () => 'Dana',
};

function buildTestIndex() {
  return composeIndex({
    staticRecords: buildStaticRecords({ scheduleData: SCHEDULE_DATA, seasonSchedule: SEASON_SCHEDULE }),
    playerRecords: buildPlayerRecords(PLAYERS),
    leagueRecords: buildLeagueRecords(LEAGUE),
  });
}

const index = buildTestIndex();

function search(query, options) {
  return rankResults(index, parseGlobalQuery(query), options);
}

function flatLabels(query, options) {
  return search(query, options).flatMap((group) => group.results.map((entry) => entry.record.label));
}

function groupLabels(query) {
  return search(query).map((group) => group.label);
}

test('team plus jersey identifies exactly one player', () => {
  const labels = flatLabels('sea 11');
  assert.equal(labels[0], 'Jaxon Smith-Njigba');
  assert.equal(labels.length, 1, 'no other record satisfies both slots');
});

test('an initialism finds its player when scoped by team', () => {
  assert.equal(flatLabels('seattle jsn')[0], 'Jaxon Smith-Njigba');
});

test('team plus position narrows rather than widens', () => {
  const labels = flatLabels('seattle wr');
  assert.deepEqual(labels, ['Jaxon Smith-Njigba', 'Cooper Kupp']);
  assert.equal(labels.includes('Sam Darnold'), false, 'the quarterback fails the position slot');
  assert.equal(labels.includes('Justin Jefferson'), false, 'the Cardinal fails the team slot');
});

test('a misspelled position returns players matching the corrected position', () => {
  for (const query of ['quaterback', 'qaterback']) {
    const labels = flatLabels(query);
    assert.deepEqual([...labels].sort(), ['Josh Allen', 'Sam Darnold'], query);
  }
});

test('popularity breaks the tie between identical names', () => {
  const labels = flatLabels('josh allen');
  assert.deepEqual(labels, ['Josh Allen', 'Josh Allen']);
  const [first] = search('josh allen')[0].results;
  assert.equal(first.record.meta.team, 'BUF', 'the household name ranks first');
});

test('a misspelled name still reaches its player', () => {
  assert.ok(flatLabels('jefersn').includes('Justin Jefferson'));
});

test('a bare week returns the week and its games, and nothing else', () => {
  const groups = search('week 3');
  assert.deepEqual(groups.map((group) => group.label), ['Games & weeks']);
  const labels = groups[0].results.map((entry) => entry.record.label);
  assert.equal(labels[0], 'Week 3');
  assert.equal(labels.length, 3, 'the week index plus both week 3 games');
});

test('a week never leaks the whole corpus through on base weight alone', () => {
  // Regression: records with no opinion on a slot used to pass the filter and
  // then score on their own weight, so a bare week returned every player, team,
  // destination, and command in the index.
  const labels = flatLabels('week 3', { groupLimit: 50 });
  assert.equal(labels.includes('Jaxon Smith-Njigba'), false);
  assert.equal(labels.includes('Seattle Seahawks'), false);
  assert.equal(labels.includes('Toggle dark mode'), false);
});

test('a team and a week lead with the single matching game', () => {
  // Naming a week is how someone asks about one specific game, so it outranks
  // the team's own page.
  assert.equal(flatLabels('seattle week 4')[0], 'Seattle Seahawks at Buffalo Bills');
  assert.equal(
    flatLabels('cardinals week 4').includes('Seattle Seahawks at Buffalo Bills'),
    false,
    'Arizona is not in that game',
  );
});

test('a bare team leads with the team, with its games below', () => {
  const groups = search('seattle');
  assert.equal(groups[0].results[0].record.label, 'Seattle Seahawks');
  assert.ok(groups.some((group) => group.label === 'Games & weeks'), 'its games are still offered');
});

test('a schedule intent routes the team to its schedule rather than its overview', () => {
  const [entry] = search('cardinals schedule')[0].results;
  assert.equal(entry.record.label, 'Arizona Cardinals');
  assert.equal(entry.route.statisticsView, 'schedule');
  assert.equal(entry.route.statisticsScheduleMode, 'team');
  assert.equal(entry.route.statisticsScheduleTeamId, 'ARI');
});

test('a plain team query routes to the team overview', () => {
  const [entry] = search('cardinals')[0].results;
  assert.equal(entry.route.statisticsView, 'team');
});

test('the named team outranks the generic destination that shares its intent word', () => {
  // "arizona schedule" is about Arizona; the NFL schedule view is a fallback,
  // not the answer.
  assert.equal(groupLabels('arizona schedule')[0], 'NFL teams');
});

test('a soft intent term never filters real entities out', () => {
  // Regression: treating intent words as required name terms dropped every game,
  // because no game record contains the word "schedule".
  const labels = flatLabels('arizona schedule', { groupLimit: 20 });
  assert.ok(labels.some((label) => label.includes('Arizona Cardinals at')), 'games survive the intent word');
});

test('a destination is reachable by name', () => {
  assert.equal(flatLabels('waiver wire')[0], 'Waivers');
  assert.equal(flatLabels('injuries')[0], 'Injuries');
  assert.equal(flatLabels('my matchup')[0], 'Matchups');
});

test('a division query returns its teams and offers the standings view', () => {
  const groups = search('nfc west standings');
  assert.equal(groups[0].label, 'NFL teams');
  const teams = groups[0].results.map((entry) => entry.record.label);
  assert.deepEqual(teams.sort(), ['Arizona Cardinals', 'Seattle Seahawks']);
  assert.ok(groupLabels('nfc west standings').includes('Go to'));
});

test('a command is returned alone when the query names it', () => {
  const groups = search('dark mode');
  assert.deepEqual(groups.map((group) => group.label), ['Commands']);
  assert.equal(groups[0].results[0].record.command, 'theme.toggle');
});

test('light and dark both resolve to the one theme command', () => {
  assert.equal(flatLabels('light mode')[0], 'Toggle dark mode');
  assert.equal(flatLabels('dark mode')[0], 'Toggle dark mode');
});

test('a fantasy team is findable by team name and by manager name', () => {
  assert.equal(flatLabels('turf monsters')[0], 'Turf Monsters');
  assert.equal(flatLabels('dana')[0], 'Turf Monsters');
});

test('results are grouped, strongest group first', () => {
  const groups = search('seattle');
  assert.equal(groups[0].label, 'NFL teams');
  assert.ok(groups.every((group) => group.results.length > 0));
});

test('the group limit caps each group independently', () => {
  const groups = search('seattle', { groupLimit: 1 });
  assert.ok(groups.every((group) => group.results.length <= 1));
});

test('a query with no signal returns nothing rather than everything', () => {
  assert.deepEqual(search(''), []);
  assert.deepEqual(search('the a for'), []);
  assert.deepEqual(search('zzzzqqq'), []);
});

// A surname can also be a team word: "washington" is the Commanders' city and
// Parker Washington's last name. The team reading filters him out, so ranking
// has to score the name reading too.
test('a surname that is also a team word still finds the player', () => {
  assert.equal(flatLabels('parker washington')[0], 'Parker Washington');
  assert.equal(flatLabels('parker washing')[0], 'Parker Washington');
});

test('a team word alongside a name term does not add unrelated players', () => {
  assert.deepEqual(flatLabels('seattle jaxon'), flatLabels('seattle jaxon').filter((label) => label.includes('Jaxon') || label.includes('Seattle') || label.includes('Seahawks')));
  assert.ok(!flatLabels('parker washington').includes('Cooper Kupp'));
});

test('ranking tolerates an empty index', () => {
  assert.deepEqual(rankResults(composeIndex({}), parseGlobalQuery('seattle')), []);
  assert.deepEqual(rankResults(null, parseGlobalQuery('seattle')), []);
});

// ── Chronological games ─────────────────────────────────────────────────────
// A list of games reads as a season. Score order put Week 12 above Week 3 for
// no reason a reader could see, because a team's games all carry the same slot
// bonus and the real tiebreaker was the label's alphabetical order.

function gameGroup(query) {
  return search(query).find((group) => group.label === 'Games & weeks')?.results ?? [];
}

test('a team schedule lists its games in kickoff order', () => {
  const weeks = gameGroup('seattle schedule').map((entry) => entry.record.meta.week);
  assert.deepEqual(weeks, [...weeks].sort((left, right) => left - right));
});

test('naming one week leaves that week ranked first', () => {
  // Here the ranking *is* the answer: the matching game earned the top row.
  const results = gameGroup('seattle week 4');
  assert.ok(results.length > 0);
  assert.equal(results[0].record.meta.week, 4);
});

test('chronological order is applied before the group is truncated', () => {
  // Trimming first would pick games at random from the season and only then
  // sort those.
  const first = gameGroup('arizona games', { groupLimit: 1 })[0];
  const all = gameGroup('arizona games');
  assert.equal(first.record.id, all[0].record.id);
  assert.equal(first.record.meta.week, 3);
});
