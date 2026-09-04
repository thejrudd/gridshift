import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getTradeDraftStorageKey,
  normalizeTradeDraftState,
  readTradeDraftState,
  writeTradeDraftState,
} from '../../src/utils/tradeDraftState.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test('trade draft storage keys are scoped to the connected user, league, and season', () => {
  assert.equal(
    getTradeDraftStorageKey({ leagueId: 'league/1', season: 2026, sleeperUserId: 'user 1' }),
    'gridshift:trade-agent-draft:league%2F1:2026:user%201',
  );
  assert.equal(getTradeDraftStorageKey({ leagueId: 'league-1', season: 2026 }), null);
});

test('trade draft state round-trips the selected assets and normalizes legacy storage values', () => {
  const storage = memoryStorage();
  const key = getTradeDraftStorageKey({ leagueId: 'league-1', season: '2026', sleeperUserId: 'user-1' });

  assert.equal(writeTradeDraftState(key, {
    partnerRosterId: '2',
    yourPlayers: ['101', 101, null],
    yourPicks: [{ year: 2027, round: '2', fromRosterId: '1', isOwn: true }],
    theirPlayers: ['201'],
    theirPicks: [{ year: '2028', round: 3, fromRosterId: 1, isOwn: false, key: '2028|3|from1' }],
  }, storage), true);

  assert.deepEqual(readTradeDraftState(key, storage), {
    partnerRosterId: 2,
    yourPlayers: ['101'],
    yourPicks: [{ year: '2027', round: 2, fromRosterId: 1, isOwn: true, key: '2027|2' }],
    theirPlayers: ['201'],
    theirPicks: [{ year: '2028', round: 3, fromRosterId: 1, isOwn: false, key: '2028|3|from1' }],
  });
});

test('invalid or old trade drafts fall back to no saved state', () => {
  assert.equal(normalizeTradeDraftState({ version: 2, yourPlayers: ['101'] }), null);
  assert.deepEqual(normalizeTradeDraftState({
    version: 1,
    yourPicks: [{ year: '2027', round: 0, fromRosterId: 1 }],
  }), {
    partnerRosterId: null,
    yourPlayers: [],
    yourPicks: [],
    theirPlayers: [],
    theirPicks: [],
  });
});
