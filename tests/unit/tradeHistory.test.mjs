import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getTradeHistoryFaabTotal,
  normalizeSleeperTradeTransaction,
  normalizeTradeHistorySeason,
  tradeHistoryMatches,
} from '../../src/utils/tradeHistory.js';

const rosters = [
  { roster_id: 1, owner_id: 'user-a' },
  { roster_id: 2, owner_id: 'user-b' },
];

const users = [
  { user_id: 'user-a', display_name: 'Alex Manager', metadata: { team_name: 'Alpha Team' } },
  { user_id: 'user-b', display_name: 'Blair Manager', metadata: { team_name: 'Beta Team' } },
];

const players = {
  p1: { full_name: 'Alpha Runner', team: 'BUF', position: 'RB' },
  p2: { full_name: 'Beta Receiver', team: 'DET', position: 'WR' },
};

const completedTrade = {
  type: 'trade',
  status: 'complete',
  transaction_id: 'trade-1',
  status_updated: 1_760_000_000_000,
  leg: 7,
  roster_ids: [1, 2],
  adds: { p1: 2, p2: 1 },
  drops: { p1: 1, p2: 2 },
  draft_picks: [
    { season: '2027', round: 2, roster_id: 2, previous_owner_id: 2, owner_id: 1 },
  ],
  waiver_budget: [
    { sender: 1, receiver: 2, amount: 18 },
  ],
};

test('normalizes one completed transaction into factual sent assets for each manager', () => {
  const trade = normalizeSleeperTradeTransaction({
    transaction: completedTrade,
    season: '2026',
    rosters,
    users,
    players,
  });

  assert.equal(trade.id, 'trade-1');
  assert.equal(trade.season, '2026');
  assert.equal(trade.week, 7);
  assert.equal(trade.sides.length, 2);

  const alex = trade.sides.find((side) => side.rosterId === '1');
  const blair = trade.sides.find((side) => side.rosterId === '2');
  assert.equal(alex.manager.name, 'Alex Manager');
  assert.equal(alex.manager.teamName, 'Alpha Team');
  assert.deepEqual(alex.assets.map((asset) => asset.type), ['player', 'faab']);
  assert.equal(alex.assets[0].label, 'Alpha Runner');
  assert.equal(alex.assets[0].toRosterId, '2');
  assert.deepEqual(blair.assets.map((asset) => asset.type), ['player', 'pick']);
  assert.equal(blair.assets[1].year, '2027');
  assert.equal(blair.assets[1].round, 2);
  assert.equal(getTradeHistoryFaabTotal(trade), 18);
});

test('excludes non-finalized and non-trade transactions', () => {
  assert.equal(normalizeSleeperTradeTransaction({
    transaction: { ...completedTrade, status: 'pending' },
    season: '2026',
    rosters,
    users,
    players,
  }), null);
  assert.equal(normalizeSleeperTradeTransaction({
    transaction: { ...completedTrade, type: 'waiver' },
    season: '2026',
    rosters,
    users,
    players,
  }), null);
});

test('sorts finalized trades newest first within a season', () => {
  const trades = normalizeTradeHistorySeason({
    season: '2026',
    rosters,
    users,
    transactions: [
      { ...completedTrade, transaction_id: 'older', status_updated: 100 },
      { ...completedTrade, transaction_id: 'newer', status_updated: 200 },
    ],
  }, players);
  assert.deepEqual(trades.map((trade) => trade.id), ['newer', 'older']);
});

test('matches manager, team, player, pick, and FAAB search content', () => {
  const trade = normalizeSleeperTradeTransaction({
    transaction: completedTrade,
    season: '2026',
    rosters,
    users,
    players,
  });

  assert.equal(tradeHistoryMatches(trade, 'alex manager'), true);
  assert.equal(tradeHistoryMatches(trade, 'beta team'), true);
  assert.equal(tradeHistoryMatches(trade, 'alpha runner'), true);
  assert.equal(tradeHistoryMatches(trade, '2027 2nd'), true);
  assert.equal(tradeHistoryMatches(trade, '$18 faab'), true);
  assert.equal(tradeHistoryMatches(trade, '', 'user-b'), true);
  assert.equal(tradeHistoryMatches(trade, '', 'missing-user'), false);
  assert.equal(tradeHistoryMatches(trade, 'not in this trade'), false);
});
