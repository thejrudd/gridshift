import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getPlayerAvailabilityContext,
  getPlayerAvailabilityFilterOptions,
  matchesPlayerAvailabilityFilter,
} from '../../src/utils/playerAvailabilityStatus.js';

test('availability context combines Sleeper designation with useful injury detail', () => {
  assert.deepEqual(
    getPlayerAvailabilityContext({
      injury_status: 'Questionable',
      injury_body_part: 'Knee - ACL',
      injury_notes: 'Surgery',
    }),
    {
      status: 'Questionable',
      bodyPart: 'Knee - ACL',
      note: 'Surgery',
      detail: 'Knee - ACL · Surgery',
      label: 'Questionable · Knee - ACL · Surgery',
    },
  );
});

test('availability context omits undisclosed filler and supports draft candidate wrappers', () => {
  assert.deepEqual(
    getPlayerAvailabilityContext({
      raw: {
        status: 'PUP',
        injury_body_part: 'Undisclosed',
      },
    }),
    {
      status: 'PUP',
      bodyPart: null,
      note: null,
      detail: null,
      label: 'PUP',
    },
  );
});

test('availability filters expose and match every loaded designation', () => {
  const players = [
    { raw: { status: 'Active', injury_status: null } },
    { raw: { injury_status: 'IR' } },
    { raw: { injury_status: 'Questionable' } },
    { raw: { status: 'PUP' } },
  ];

  assert.deepEqual(
    getPlayerAvailabilityFilterOptions(players),
    [
      { id: 'all', label: 'All Availability' },
      { id: 'healthy', label: 'Healthy' },
      { id: 'Questionable', label: 'Questionable' },
      { id: 'Injured Reserve', label: 'IR' },
      { id: 'PUP', label: 'PUP' },
    ],
  );
  assert.equal(matchesPlayerAvailabilityFilter(players[1], 'Injured Reserve'), true);
  assert.equal(matchesPlayerAvailabilityFilter(players[1], 'Questionable'), false);
  assert.equal(matchesPlayerAvailabilityFilter(players[0], 'healthy'), true);
});
