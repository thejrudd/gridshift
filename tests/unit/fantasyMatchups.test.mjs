import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFantasyMatchupGroups,
  findMatchupGroupIndexByRosterId,
} from '../../src/utils/fantasyMatchups.js';

const rosters = [
  { roster_id: 1, owner_id: 'alpha' },
  { roster_id: 2, owner_id: 'bravo' },
  { roster_id: 3, owner_id: 'charlie' },
  { roster_id: 4, owner_id: 'delta' },
  { roster_id: 5, owner_id: 'echo' },
];
const names = {
  alpha: 'Alpha',
  bravo: 'Bravo',
  charlie: 'Charlie',
  delta: 'Delta',
  echo: 'Echo',
};
const getName = (ownerId) => names[ownerId] ?? 'Unknown';

test('groups provider matchup ids without coercing strings and puts the user matchup first', () => {
  const groups = buildFantasyMatchupGroups([
    { roster_id: 3, matchup_id: 'playoff-a' },
    { roster_id: 4, matchup_id: 'playoff-a' },
    { roster_id: 2, matchup_id: 'playoff-b' },
    { roster_id: 1, matchup_id: 'playoff-b' },
  ], rosters, getName, 2);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].key, 'matchup:playoff-b');
  assert.deepEqual(groups[0].sides.map((side) => side.rosterId), ['2', '1']);
  assert.deepEqual(groups[1].sides.map((side) => side.rosterId), ['3', '4']);
});

test('retains null-id rows as independent single-side bye groups', () => {
  const groups = buildFantasyMatchupGroups([
    { roster_id: 5, matchup_id: null },
    { roster_id: 3, matchup_id: null },
  ], rosters, getName, 5);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].sides[0].rosterId, '5');
  assert.equal(groups[0].sides.length, 1);
  assert.equal(groups[1].sides[0].rosterId, '3');
});

test('finds the matchup containing a selected roster', () => {
  const groups = buildFantasyMatchupGroups([
    { roster_id: 1, matchup_id: 1 },
    { roster_id: 2, matchup_id: 1 },
    { roster_id: 3, matchup_id: 2 },
    { roster_id: 4, matchup_id: 2 },
  ], rosters, getName, 1);

  assert.equal(findMatchupGroupIndexByRosterId(groups, '4'), 1);
  assert.equal(findMatchupGroupIndexByRosterId(groups, '999'), -1);
});
