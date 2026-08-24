import assert from 'node:assert/strict';
import test from 'node:test';
import { getLatestPlayPresentation } from '../../src/utils/nflPlays/latestPlayPresentation.js';
import { getPlayTag } from '../../src/utils/nflPlays/playPresentation.js';

const game = {
  away: { id: 'TEN' },
  home: { id: 'SF' },
};

test('shared play tags identify penalties before negative yardage', () => {
  assert.deepEqual(
    getPlayTag({ startDown: 2, startDistance: 8 }, {
      flag: 'penalty',
      yards: -8,
      type: 'pass',
      scoring: false,
    }),
    ['', 'Penalty'],
  );
});

test('latest-play presentation calls out a change in possession', () => {
  const presentation = getLatestPlayPresentation({
    id: 'pick',
    team: 'SF',
    typeSlug: 'interception',
    type: 'Interception',
    description: 'Intercepted by SF at the TEN 24.',
    rawText: 'Intercepted by SF at the TEN 24.',
    startDown: 2,
    startDistance: 8,
    startYardLine: 76,
    endYardLine: 76,
    startPossessionText: 'TEN 24',
    endPossessionText: 'SF 24',
    down: '2nd & 8',
    quarter: '1st',
    time: '04:12',
    spot: 'TEN 24',
  }, game);

  assert.equal(presentation.possessionChanged, true);
  assert.equal(presentation.possessionTeam, 'SF');
  assert.deepEqual(presentation.tag, ['loss', 'Intercepted']);
  assert.equal(presentation.time, '04:12');
});
