import test from 'node:test';
import assert from 'node:assert/strict';

import { parseGlobalQuery } from '../../src/utils/globalSearch/parseIntent.js';
import { rankResults } from '../../src/utils/globalSearch/rank.js';
import { buildLeagueRecords, composeIndex } from '../../src/utils/globalSearch/buildIndex.js';
import { buildPlayerRecords } from '../../src/utils/globalSearch/entities/players.js';
import { resolveAnswer } from '../../src/utils/globalSearch/answers/index.js';

// ── A two-season league, stored the way League History caches it ───────────

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

const PLAYERS = {
  wr1: { full_name: 'Marcus Vane', team: 'SEA', position: 'WR', search_rank: 3, active: true },
  rb1: { full_name: 'Elias Roan', team: 'BUF', position: 'RB', search_rank: 9, active: true },
  te1: { full_name: 'Tomas Reed', team: 'KC', position: 'TE', search_rank: 40, active: true },
};

const snapshot2024 = {
  season: '2024',
  completed: true,
  league: { settings: { last_scored_leg: 3, playoff_week_start: 3 } },
  users: [
    { user_id: 'user-a', display_name: 'Alex', metadata: { team_name: 'Alpha' } },
    { user_id: 'user-b', display_name: 'Blair', metadata: { team_name: 'Beta' } },
  ],
  rosters: [{ roster_id: 1, owner_id: 'user-a' }, { roster_id: 2, owner_id: 'user-b' }],
  matchupsByWeek: {
    1: [{ matchup_id: 1, roster_id: 1, points: 100 }, { matchup_id: 1, roster_id: 2, points: 90 }],
    2: [{ matchup_id: 1, roster_id: 1, points: 80 }, { matchup_id: 1, roster_id: 2, points: 120 }],
    3: [{ matchup_id: 1, roster_id: 1, points: 101 }, { matchup_id: 1, roster_id: 2, points: 100 }],
  },
  winnersBracket: [{ r: 1, m: 1, t1: 1, t2: 2, w: 2, l: 1, p: 1 }],
  losersBracket: [],
  transactions: [
    {
      transaction_id: 'trade-2024', type: 'trade', status: 'complete', roster_ids: [1, 2], created: 100,
      adds: { te1: 1 }, drops: { te1: 2 },
    },
  ],
};

const snapshot2025 = {
  season: '2025',
  completed: false,
  league: { settings: { last_scored_leg: 2, playoff_week_start: 15 } },
  users: [
    { user_id: 'user-a', display_name: 'Alex', metadata: { team_name: 'Alpha Rebrand' } },
    { user_id: 'user-b', display_name: 'Blair', metadata: { team_name: 'Beta' } },
    { user_id: 'user-c', display_name: 'Casey', metadata: { team_name: 'Gamma' } },
  ],
  rosters: [
    { roster_id: 5, owner_id: 'user-a' },
    { roster_id: 6, owner_id: 'user-b' },
    { roster_id: 7, owner_id: 'user-c' },
  ],
  matchupsByWeek: {
    1: [{ matchup_id: 1, roster_id: 5, points: 110 }, { matchup_id: 1, roster_id: 6, points: 95.5 }],
    2: [{ matchup_id: 1, roster_id: 5, points: 88 }, { matchup_id: 1, roster_id: 7, points: 91 }],
  },
  winnersBracket: [],
  losersBracket: [],
  transactions: [
    {
      transaction_id: 'trade-2025', type: 'trade', status: 'complete', roster_ids: [6, 7],
      created: Date.parse('2025-10-01T00:00:00Z'), leg: 4,
      adds: { wr1: 7, rb1: 6 }, drops: { wr1: 6, rb1: 7 },
    },
    {
      transaction_id: 'waiver-2025', type: 'waiver', status: 'complete',
      created: Date.parse('2025-10-08T00:00:00Z'), leg: 5, adds: { te1: 5 }, drops: {},
    },
  ],
};

const ENTRIES = [
  { season: '2025', league: { league_id: 'L2025' } },
  { season: '2024', league: { league_id: 'L2024' } },
];
for (const [entry, snapshot] of [[ENTRIES[0], snapshot2025], [ENTRIES[1], snapshot2024]]) {
  store.set(`nfl_pc_league-history:v2:${entry.league.league_id}:${entry.season}`, JSON.stringify({ ts: 1, data: snapshot }));
}

const FANTASY_LEAGUE = {
  rosters: snapshot2025.rosters,
  leagueUsers: snapshot2025.users,
  getUserDisplayName: (id) => ({ 'user-a': 'Alex', 'user-b': 'Blair', 'user-c': 'Casey' })[id],
  myRosterId: 5,
};

const index = composeIndex({
  playerRecords: buildPlayerRecords(PLAYERS),
  leagueRecords: buildLeagueRecords(FANTASY_LEAGUE),
});

const DATA = {
  players: PLAYERS,
  fantasyLeague: FANTASY_LEAGUE,
  leagueHistory: { entries: ENTRIES, players: PLAYERS },
};

function answerFor(query, data = DATA) {
  const slots = parseGlobalQuery(query);
  return resolveAnswer(slots, rankResults(index, slots, { groupLimit: 6 }), data);
}

test('champions list every completed season with who they beat', () => {
  const answer = answerFor('champions');
  assert.equal(answer.kind, 'historyRows');
  assert.equal(answer.title, 'League champions');
  assert.deepEqual(answer.rows.map((row) => [row.rank, row.label]), [['2024', 'Beta']]);
  assert.match(answer.rows[0].sublabel, /beat Alpha/);
  assert.deepEqual(answer.route, { activeTab: 'league', leagueView: 'history' });
});

test('a season narrows champions to that year', () => {
  assert.equal(answerFor('2024 champion').title, '2024 champion');
  assert.equal(answerFor('2019 champion'), null);
});

test('head to head reads your all-time record against a manager', () => {
  const answer = answerFor('head to head beta');
  assert.equal(answer.kind, 'headToHead');
  assert.equal(answer.title, 'You vs Beta');
  const values = Object.fromEntries(answer.values.map((value) => [value.key, value.display]));
  // 2024: W 100–90, L 80–120, W 101–100 in the playoff, which League History's
  // rivalries count; 2025: W 110–95.5.
  assert.equal(values.record, '3-1');
  assert.equal(values.pf, '391.0');
  assert.equal(values.pa, '405.5');
  assert.equal(values.last, 'W 110.0–95.5');
});

test('"me vs" is the same head-to-head question', () => {
  const slots = parseGlobalQuery('me vs gamma');
  assert.equal(slots.compare.left.scope, 'self');
  const answer = answerFor('me vs gamma');
  assert.equal(answer.title, 'You vs Gamma');
  assert.equal(answer.values[0].display, '0-1');
});

test('a player\'s trades list every trade that moved him', () => {
  const answer = answerFor('marcus vane trades');
  assert.equal(answer.title, 'Marcus Vane trades');
  assert.equal(answer.rows.length, 1);
  assert.equal(answer.rows[0].rank, 'Wk 4');
  assert.equal(answer.rows[0].label, 'Beta · Gamma');
  assert.match(answer.rows[0].sublabel, /Gamma gets Marcus Vane/);
  assert.match(answer.rows[0].sublabel, /Beta gets Elias Roan/);
  assert.deepEqual(answer.route, { activeTab: 'trade', tradeView: 'history' });
});

test('trades with a manager prefer your own deals, then theirs', () => {
  assert.equal(answerFor('trades with beta').title, 'Your trades with Beta');
  // You and Gamma never traded, so it falls back to all of Gamma's trades.
  const gamma = answerFor('trades with gamma');
  assert.equal(gamma.title, 'Gamma trades');
  assert.equal(gamma.rows.length, 1);
});

test('recent transactions read the latest season, newest first', () => {
  const answer = answerFor('recent transactions');
  assert.equal(answer.title, 'Recent transactions');
  assert.equal(answer.subtitle, '2025 season');
  assert.deepEqual(answer.rows.map((row) => row.key), ['waiver-2025', 'trade-2025']);
  assert.match(answer.rows[0].sublabel, /Waiver claim · adds Tomas Reed/);
});

test('with no history stored, history questions fall through to destinations', () => {
  const empty = { ...DATA, leagueHistory: { entries: [{ season: '2023', league: { league_id: 'nope' } }], players: PLAYERS } };
  assert.equal(answerFor('champions', empty), null);
  assert.equal(answerFor('champions', { ...DATA, leagueHistory: null }), null);
});
