import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DRAFT_BYE_CONFLICT_SEVERITY,
  buildDraftByeConflictModel,
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

test('Board candidates only compare against currently rostered players', () => {
  const playersById = {
    roster: player('roster', 'Roster Receiver', 'WR', 7),
    boardOne: player('boardOne', 'Saved Receiver One', 'WR', 7),
    boardTwo: player('boardTwo', 'Saved Receiver Two', 'WR', 7),
    unknown: player('unknown', 'Unknown Bye', 'TE', null),
  };
  const model = buildDraftByeConflictModel({
    playersById,
    candidatePlayerIds: ['boardOne', 'boardTwo', 'unknown'],
    rosteredPlayerIds: ['roster'],
  });

  assert.deepEqual(model.comparisonPlayerIds, ['roster']);
  assert.deepEqual(model.byPlayerId.get('boardOne'), {
    playerId: 'boardOne',
    week: 7,
    matchingPlayerIds: ['roster'],
    matchingPlayerNames: ['Roster Receiver'],
    matchingPlayerLabels: ['Roster Receiver (WR)'],
    totalOverlaps: 1,
    exactPositionOverlaps: 1,
    severity: DRAFT_BYE_CONFLICT_SEVERITY.HIGH,
  });
  assert.deepEqual(model.byPlayerId.get('boardTwo').matchingPlayerIds, ['roster']);
  assert.equal(model.byPlayerId.get('unknown').week, null);
  assert.equal(model.byPlayerId.get('unknown').severity, DRAFT_BYE_CONFLICT_SEVERITY.NONE);
});

test('rostered players still compare with one another for the roster tray', () => {
  const playersById = {
    qb: player('qb', 'Roster Quarterback', 'QB', 9),
    wrOne: player('wrOne', 'Roster Receiver One', 'WR', 9),
    wrTwo: player('wrTwo', 'Roster Receiver Two', 'WR', 9),
    board: player('board', 'Board Receiver', 'WR', 9),
  };
  const model = buildDraftByeConflictModel({
    playersById,
    candidatePlayerIds: ['board'],
    rosteredPlayerIds: ['qb', 'wrOne', 'wrTwo'],
  });

  assert.deepEqual(model.byPlayerId.get('qb').matchingPlayerNames, ['Roster Receiver One', 'Roster Receiver Two']);
  assert.equal(model.byPlayerId.get('qb').severity, DRAFT_BYE_CONFLICT_SEVERITY.MEDIUM);
  assert.deepEqual(model.byPlayerId.get('wrOne').matchingPlayerNames, ['Roster Quarterback', 'Roster Receiver Two']);
  assert.equal(model.byPlayerId.get('wrOne').severity, DRAFT_BYE_CONFLICT_SEVERITY.HIGH);
  assert.deepEqual(model.byPlayerId.get('board').matchingPlayerNames, ['Roster Quarterback', 'Roster Receiver One', 'Roster Receiver Two']);
  assert.equal(model.byPlayerId.get('board').severity, DRAFT_BYE_CONFLICT_SEVERITY.HIGH);
});

test('position normalization elevates team-defense matches and invalid bye values stay unknown', () => {
  const playersById = {
    dst: player('dst', 'Defense One', 'DST', 12),
    def: player('def', 'Defense Two', 'DEF', 12),
    invalid: player('invalid', 'Invalid Week', 'WR', 19),
  };
  const model = buildDraftByeConflictModel({
    playersById,
    candidatePlayerIds: ['dst', 'def', 'invalid'],
    rosteredPlayerIds: ['def'],
  });

  assert.equal(model.byPlayerId.get('dst').exactPositionOverlaps, 1);
  assert.equal(model.byPlayerId.get('dst').severity, DRAFT_BYE_CONFLICT_SEVERITY.HIGH);
  assert.equal(model.byPlayerId.get('invalid').week, null);
  assert.equal(model.byPlayerId.get('invalid').totalOverlaps, 0);
});

test('empty input returns a stable empty model', () => {
  const model = buildDraftByeConflictModel();

  assert.deepEqual(model.comparisonPlayerIds, []);
  assert.equal(model.byPlayerId.size, 0);
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
