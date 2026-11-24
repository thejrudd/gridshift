import test from 'node:test';
import assert from 'node:assert/strict';
import { getReserveSlotCount, splitMatchupReserve } from '../../src/utils/fantasyReserve.js';

test('reserve capacity is separate from starting positions and tolerates missing settings', () => {
  assert.equal(getReserveSlotCount({ settings: { reserve_slots: 2 } }), 2);
  assert.equal(getReserveSlotCount({ roster_positions: ['QB', 'BN'] }), 0);
});

test('current reserve players are unique, outside the bench and never duplicate starters', () => {
  const roster = { players: ['1', '2', '3', '3'], reserve: ['3', '4', '4', '1'] };
  const matchup = { starters: ['1'], players: ['1', '2', '3', '3'] };
  assert.deepEqual(splitMatchupReserve({ roster, matchup, useRosterReserve: true }), { bench: ['2'], reserve: ['3', '4'] });
  assert.deepEqual(splitMatchupReserve({ roster, matchup, useRosterReserve: false }), { bench: ['2', '3'], reserve: [] });
  assert.deepEqual(splitMatchupReserve({ roster, matchup: null, useRosterReserve: true }), { bench: [], reserve: [] });
});
