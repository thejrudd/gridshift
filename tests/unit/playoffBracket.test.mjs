import test from 'node:test';
import assert from 'node:assert/strict';
import { getLowestRemainingSeedTeam } from '../../src/utils/playoffBracket.js';

test('returns the numerically lowest remaining seed after upsets', () => {
  const seeds = Array.from({ length: 7 }, (_, index) => ({ id: `T${index + 1}` }));
  assert.equal(getLowestRemainingSeedTeam(seeds, [seeds[6], seeds[2], seeds[3]]).id, 'T7');
  assert.equal(getLowestRemainingSeedTeam(seeds, [seeds[1], seeds[5], seeds[4]]).id, 'T6');
});
