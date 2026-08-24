import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DRAFT_BYE_CONFLICT_SEVERITY,
  buildDraftByeConflictModel,
  buildDraftRosterByeConflictModel,
} from '../../src/utils/draftAssistant/byeConflicts.js';
import {
  getRosterProjectionSlotEligibilities,
  getRosterProjectionSlotOrder,
  selectNextAvailableRosterProjection,
} from '../../src/utils/draftAssistant/rosterProjection.js';

const player = (id, name, position, byeWeek) => ({
  player_id: id,
  full_name: name,
  fantasy_positions: [position],
  bye_week: byeWeek,
});

test('redraft compares available saved targets and own picks while excluding other-manager picks', () => {
  const playersById = {
    a: { id: 'a', name: 'Alpha Receiver', position: 'WR', byeWeek: 7 },
    b: { raw: player('b', 'Beta Runner', 'RB', '7') },
    c: { id: 'c', name: 'Current Pick', position: 'WR', teamContext: { byeWeek: 7 } },
    d: player('d', 'Unknown Bye', 'TE', null),
    other: player('other', 'Other Manager Pick', 'WR', 7),
    available: player('available', 'Available Quarterback', 'QB', 7),
  };
  const model = buildDraftByeConflictModel({
    leagueType: 0,
    playersById,
    candidatePlayerIds: ['a', 'b', 'c', 'd', 'other', 'available'],
    savedTargetIds: ['a', 'b', 'd', 'other', 'a'],
    draftPicks: [
      { player_id: 'c', roster_id: 1, is_keeper: false },
      { playerId: 'c', rosterId: '1' },
      { playerId: 'other', rosterId: '2' },
    ],
    myRosterId: '1',
  });

  assert.equal(model.format, 'redraft');
  assert.deepEqual(model.comparisonPlayerIds, ['a', 'b', 'd', 'c']);
  assert.deepEqual(model.byPlayerId.get('a'), {
    playerId: 'a',
    week: 7,
    matchingPlayerIds: ['b', 'c'],
    matchingPlayerNames: ['Beta Runner', 'Current Pick'],
    totalOverlaps: 2,
    exactPositionOverlaps: 1,
    severity: DRAFT_BYE_CONFLICT_SEVERITY.HIGH,
  });
  assert.equal(model.byPlayerId.get('b').severity, DRAFT_BYE_CONFLICT_SEVERITY.MEDIUM);
  assert.equal(model.byPlayerId.get('b').exactPositionOverlaps, 0);
  assert.equal(model.byPlayerId.get('available').totalOverlaps, 3);
  assert.equal(model.byPlayerId.get('available').severity, DRAFT_BYE_CONFLICT_SEVERITY.MEDIUM);
  assert.deepEqual(model.byPlayerId.get('other').matchingPlayerIds, []);
  assert.equal(model.byPlayerId.get('other').severity, DRAFT_BYE_CONFLICT_SEVERITY.NONE);
  assert.equal(model.byPlayerId.get('d').week, null);
  assert.equal(model.byPlayerId.get('d').severity, DRAFT_BYE_CONFLICT_SEVERITY.NONE);
});

test('keeper compares saved targets plus assigned and later own picks without treating holdovers as peers', () => {
  const playersById = new Map([
    ['holdover', player('holdover', 'Unassigned Holdover', 'WR', 9)],
    ['saved', player('saved', 'Saved Target', 'WR', 8)],
    ['saved-peer', player('saved-peer', 'Saved Target Peer', 'WR', 8)],
    ['keeper', player('keeper', 'Assigned Keeper', 'RB', 8)],
    ['later', player('later', 'Later Pick', 'WR', 8)],
    ['candidate', player('candidate', 'Candidate Receiver', 'WR', 8)],
    ['holdover-only-candidate', player('holdover-only-candidate', 'Holdover Week Candidate', 'QB', 9)],
  ]);
  const model = buildDraftByeConflictModel({
    leagueType: 'keeper',
    playersById,
    candidatePlayerIds: ['saved', 'saved-peer', 'candidate', 'holdover-only-candidate'],
    savedTargetIds: ['saved', 'saved-peer'],
    existingRosterPlayerIds: ['holdover'],
    draftPicks: [
      { player_id: 'keeper', roster_id: '7', is_keeper: true },
      { playerId: 'later', rosterId: '7' },
      { playerId: 'holdover', rosterId: '8' },
    ],
    myRosterId: 7,
  });

  assert.deepEqual(model.comparisonPlayerIds, ['saved', 'saved-peer', 'keeper', 'later']);
  assert.deepEqual(model.byPlayerId.get('saved').matchingPlayerIds, ['saved-peer', 'keeper', 'later']);
  assert.equal(model.byPlayerId.get('saved').severity, DRAFT_BYE_CONFLICT_SEVERITY.HIGH);
  assert.deepEqual(model.byPlayerId.get('saved-peer').matchingPlayerIds, ['saved', 'keeper', 'later']);
  assert.deepEqual(model.byPlayerId.get('candidate').matchingPlayerIds, ['saved', 'saved-peer', 'keeper', 'later']);
  assert.equal(model.byPlayerId.get('candidate').exactPositionOverlaps, 3);
  assert.equal(model.byPlayerId.get('candidate').severity, DRAFT_BYE_CONFLICT_SEVERITY.HIGH);
  assert.equal(model.byPlayerId.get('holdover-only-candidate').totalOverlaps, 0);
});

test('dynasty compares saved targets along with the existing roster and own picks', () => {
  const playersById = {
    roster: player('roster', 'Roster Receiver', 'WR', 5),
    pick: player('pick', 'Drafted Runner', 'RB', 5),
    saved: player('saved', 'Saved Quarterback', 'QB', 10),
    savedPeer: player('savedPeer', 'Saved Tight End', 'TE', 10),
    candidate: player('candidate', 'Candidate Receiver', 'WR', 5),
    savedWeekCandidate: player('savedWeekCandidate', 'Saved Week Candidate', 'TE', 10),
  };
  const model = buildDraftByeConflictModel({
    leagueType: 2,
    playersById,
    candidatePlayerIds: ['candidate', 'saved', 'savedPeer', 'savedWeekCandidate'],
    savedTargetIds: ['saved', 'savedPeer'],
    existingRosterPlayerIds: ['roster'],
    draftPicks: [{ playerId: 'pick', rosterId: '3' }],
    myRosterId: '3',
  });

  assert.equal(model.format, 'dynasty');
  assert.deepEqual(model.comparisonPlayerIds, ['roster', 'saved', 'savedPeer', 'pick']);
  assert.deepEqual(model.byPlayerId.get('candidate').matchingPlayerNames, ['Roster Receiver', 'Drafted Runner']);
  assert.equal(model.byPlayerId.get('candidate').severity, DRAFT_BYE_CONFLICT_SEVERITY.HIGH);
  assert.deepEqual(model.byPlayerId.get('saved').matchingPlayerIds, ['savedPeer']);
  assert.equal(model.byPlayerId.get('saved').severity, DRAFT_BYE_CONFLICT_SEVERITY.MEDIUM);
  assert.deepEqual(model.byPlayerId.get('savedPeer').matchingPlayerIds, ['saved']);
  assert.equal(model.byPlayerId.get('savedWeekCandidate').totalOverlaps, 2);
});

test('same-position saved targets conflict symmetrically in every league format', () => {
  const playersById = {
    one: player('one', 'First Runner', 'RB', 10),
    two: player('two', 'Second Runner', 'RB', 10),
  };

  for (const leagueType of [0, 1, 2]) {
    const model = buildDraftByeConflictModel({
      leagueType,
      playersById,
      candidatePlayerIds: ['one', 'two'],
      savedTargetIds: ['one', 'two'],
    });

    assert.equal(model.byPlayerId.get('one').severity, DRAFT_BYE_CONFLICT_SEVERITY.HIGH);
    assert.deepEqual(model.byPlayerId.get('one').matchingPlayerNames, ['Second Runner']);
    assert.equal(model.byPlayerId.get('two').severity, DRAFT_BYE_CONFLICT_SEVERITY.HIGH);
    assert.deepEqual(model.byPlayerId.get('two').matchingPlayerNames, ['First Runner']);
  }
});

test('position normalization elevates team-defense matches and invalid bye values stay unknown', () => {
  const playersById = {
    dst: player('dst', 'Defense One', 'DST', 12),
    def: player('def', 'Defense Two', 'DEF', 12),
    invalid: player('invalid', 'Invalid Week', 'WR', 19),
  };
  const model = buildDraftByeConflictModel({
    leagueType: 'redraft',
    playersById,
    candidatePlayerIds: ['dst', 'def', 'invalid'],
    savedTargetIds: ['dst', 'def', 'invalid'],
  });

  assert.equal(model.byPlayerId.get('dst').exactPositionOverlaps, 1);
  assert.equal(model.byPlayerId.get('dst').severity, DRAFT_BYE_CONFLICT_SEVERITY.HIGH);
  assert.equal(model.byPlayerId.get('invalid').week, null);
  assert.equal(model.byPlayerId.get('invalid').totalOverlaps, 0);
});

test('empty input returns a stable empty redraft model', () => {
  const model = buildDraftByeConflictModel();

  assert.equal(model.format, 'redraft');
  assert.deepEqual(model.comparisonPlayerIds, []);
  assert.equal(model.byPlayerId.size, 0);
});

test('locked roster conflict model compares every current commitment without Board eligibility rules', () => {
  const model = buildDraftRosterByeConflictModel({
    playersById: {
      qb: player('qb', 'Locked Quarterback', 'QB', 9),
      wrOne: player('wrOne', 'Locked Receiver One', 'WR', 9),
      wrTwo: player('wrTwo', 'Locked Receiver Two', 'WR', 9),
      unknown: player('unknown', 'Unknown Bye', 'TE', null),
    },
    playerIds: ['qb', 'wrOne', 'wrTwo', 'unknown', 'wrOne'],
  });

  assert.deepEqual(model.comparisonPlayerIds, ['qb', 'wrOne', 'wrTwo', 'unknown']);
  assert.equal(model.byPlayerId.get('qb').severity, DRAFT_BYE_CONFLICT_SEVERITY.MEDIUM);
  assert.equal(model.byPlayerId.get('wrOne').severity, DRAFT_BYE_CONFLICT_SEVERITY.HIGH);
  assert.deepEqual(model.byPlayerId.get('wrOne').matchingPlayerNames, ['Locked Quarterback', 'Locked Receiver Two']);
  assert.equal(model.byPlayerId.get('unknown').severity, DRAFT_BYE_CONFLICT_SEVERITY.NONE);
});

test('projected roster selection advances to the next live Board preference and respects flex order', () => {
  const preferences = {
    RB: [
      { id: 'rb-gone', boardRank: 1, available: false },
      { id: 'rb-live', boardRank: 4, available: true },
    ],
    WR: [
      { id: 'wr-live', boardRank: 2, available: true },
      { id: 'wr-next', boardRank: 5, available: true },
    ],
  };

  assert.equal(selectNextAvailableRosterProjection({
    eligiblePositions: ['RB'],
    preferredPlayersByPosition: preferences,
  })?.id, 'rb-live');
  assert.equal(selectNextAvailableRosterProjection({
    eligiblePositions: ['RB', 'WR'],
    preferredPlayersByPosition: preferences,
    claimedPlayerIds: new Set(['wr-live']),
  })?.id, 'rb-live');
  assert.equal(selectNextAvailableRosterProjection({
    eligiblePositions: ['RB', 'WR'],
    preferredPlayersByPosition: preferences,
    claimedPlayerIds: new Set(['rb-live']),
  })?.id, 'wr-live');
});

test('projected roster prioritizes dedicated slots, then the narrowest compatible flex slots', () => {
  const slots = ['FLEX', 'WR', 'SUPER_FLEX', 'WRRB_FLEX', 'RB', 'QB/WR/RB/TE FLEX'];

  assert.deepEqual(getRosterProjectionSlotOrder(slots), [1, 4, 3, 0, 2, 5]);
  assert.deepEqual(
    [...getRosterProjectionSlotEligibilities('QB/WR/RB/TE FLEX')],
    ['QB', 'WR', 'RB', 'TE'],
  );
  assert.deepEqual(
    [...getRosterProjectionSlotEligibilities('IDP FLEX')],
    ['DL', 'LB', 'DB'],
  );
});
