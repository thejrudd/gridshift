import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RECENTS_LIMIT,
  addRecentPick,
  addRecentQuery,
  emptyRecents,
  hasRecents,
  normalizeRecents,
  resolveRecentPicks,
} from '../../src/utils/globalSearch/recents.js';
import {
  buildSuggestionGroups,
  selectMyStarters,
  selectThisWeeksGames,
} from '../../src/utils/globalSearch/suggestions.js';
import { createIndex } from '../../src/utils/globalSearch/tokenIndex.js';

const player = (id, label) => ({ kind: 'player', id, label, tokens: [], weight: 0 });
const team = (id, label) => ({ kind: 'nflTeam', id, label, tokens: [], weight: 0 });
const game = (id, week, kickoff) => ({
  kind: 'game', id, label: id, tokens: [], weight: 0, meta: { week, kickoff },
});

test('queries move to the front, dedupe case-insensitively, and cap', () => {
  let recents = emptyRecents();
  recents = addRecentQuery(recents, 'seahawks', 1);
  recents = addRecentQuery(recents, '  jsn  ', 2);
  recents = addRecentQuery(recents, 'SEAHAWKS', 3);
  assert.deepEqual(recents.queries.map((entry) => entry.text), ['SEAHAWKS', 'jsn']);

  for (let step = 0; step < RECENTS_LIMIT + 4; step += 1) {
    recents = addRecentQuery(recents, `query ${step}`, 10 + step);
  }
  assert.equal(recents.queries.length, RECENTS_LIMIT);
  assert.equal(recents.queries[0].text, `query ${RECENTS_LIMIT + 3}`);
});

test('blank queries are not recorded', () => {
  assert.deepEqual(addRecentQuery(emptyRecents(), '   ').queries, []);
});

test('picks store identity only, newest first, deduped by kind and id', () => {
  let recents = emptyRecents();
  recents = addRecentPick(recents, player('1', 'Jaxon Smith-Njigba'), 1);
  recents = addRecentPick(recents, team('sea', 'Seattle Seahawks'), 2);
  recents = addRecentPick(recents, player('1', 'Jaxon Smith-Njigba'), 3);
  assert.deepEqual(recents.picks, [
    { kind: 'player', id: '1', at: 3 },
    { kind: 'nflTeam', id: 'sea', at: 2 },
  ]);
  assert.equal(hasRecents(recents), true);
  assert.equal(hasRecents(emptyRecents()), false);
});

test('corrupt storage reads as empty recents', () => {
  for (const raw of [null, 'text', 42, [], { queries: 'x', picks: {} }]) {
    assert.deepEqual(normalizeRecents(raw), emptyRecents());
  }
  assert.deepEqual(
    normalizeRecents({ queries: [{ text: 'ok' }, { nope: 1 }], picks: [{ kind: 'player' }, { kind: 'player', id: 7 }] }),
    { queries: [{ text: 'ok', at: 0 }], picks: [{ kind: 'player', id: '7', at: 0 }] },
  );
});

test('recent picks resolve against the live index and drop missing records', () => {
  const index = createIndex([player('1', 'Renamed Label'), team('sea', 'Seattle Seahawks')]);
  let recents = emptyRecents();
  recents = addRecentPick(recents, player('1', 'Old Label'), 1);
  recents = addRecentPick(recents, player('gone', 'Retired'), 2);
  recents = addRecentPick(recents, team('sea', 'Seattle Seahawks'), 3);

  const records = resolveRecentPicks(recents, index);
  assert.deepEqual(records.map((record) => record.label), ['Seattle Seahawks', 'Renamed Label']);
});

const GAMES = [
  game('w1-a', 1, '2026-09-10T00:20:00.000Z'),
  game('w2-b', 2, '2026-09-20T17:00:00.000Z'),
  game('w2-a', 2, '2026-09-18T00:15:00.000Z'),
  game('w3-a', 3, '2026-09-27T17:00:00.000Z'),
  { kind: 'game', id: 'week-2', label: 'Week 2', tokens: [], weight: 0, meta: { week: 2, isWeekIndex: true } },
];

test('this week is the earliest week with a game not yet long finished, in kickoff order', () => {
  const index = createIndex(GAMES);
  const preseason = selectThisWeeksGames(index, Date.parse('2026-08-01T00:00:00Z'));
  assert.deepEqual(preseason.map((record) => record.id), ['w1-a']);

  // Monday after week 2's last game still shows week 2.
  const monday = selectThisWeeksGames(index, Date.parse('2026-09-21T12:00:00Z'));
  assert.deepEqual(monday.map((record) => record.id), ['w2-a', 'w2-b']);

  const over = selectThisWeeksGames(index, Date.parse('2027-03-01T00:00:00Z'));
  assert.deepEqual(over, []);
});

test('starters follow lineup order, skip empty slots, and need a known roster', () => {
  const index = createIndex([player('10', 'QB One'), player('20', 'RB One'), player('30', 'WR One')]);
  const fantasyLeague = {
    myRosterId: 2,
    rosters: [
      { roster_id: 1, starters: ['10'] },
      { roster_id: 2, starters: ['30', '0', 'unknown', '20'] },
    ],
  };
  assert.deepEqual(selectMyStarters(index, fantasyLeague).map((record) => record.id), ['30', '20']);
  assert.deepEqual(selectMyStarters(index, { ...fantasyLeague, myRosterId: null }), []);
  assert.deepEqual(selectMyStarters(index, null), []);
});

test('suggestion groups omit unavailable sources and never repeat a recent pick', () => {
  const index = createIndex([player('10', 'QB One'), player('20', 'RB One'), ...GAMES]);
  const recents = addRecentPick(emptyRecents(), player('20', 'RB One'), 1);
  const fantasyLeague = { myRosterId: 1, rosters: [{ roster_id: 1, starters: ['10', '20'] }] };
  const now = Date.parse('2026-09-15T00:00:00Z');

  const groups = buildSuggestionGroups({ index, recents, fantasyLeague, now });
  assert.deepEqual(groups.map((group) => group.label), ['Recent', 'Your starters', 'Week 2 games']);
  assert.deepEqual(groups[1].results.map((entry) => entry.record.id), ['10']);

  const bare = buildSuggestionGroups({ index, recents: emptyRecents(), now: Date.parse('2027-03-01T00:00:00Z') });
  assert.deepEqual(bare, []);
  assert.deepEqual(buildSuggestionGroups({ index: null }), []);
});
