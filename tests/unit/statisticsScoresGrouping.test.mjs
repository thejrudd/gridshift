import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getStatisticsScoresGameDay,
  groupStatisticsScoresGames,
} from '../../src/utils/statisticsScoresGrouping.js';

function game(id, kickoff, status = 'scheduled', overrides = {}) {
  return {
    id,
    kickoff,
    status,
    slot: kickoff?.slice(0, 10),
    ...overrides,
  };
}

test('groups scorebugs by the NFL Eastern calendar day instead of the UTC date', () => {
  const thursday = game('thursday', '2026-08-14T00:00:00.000Z');
  const friday = game('friday', '2026-08-14T23:00:00.000Z');

  assert.equal(thursday.slot, friday.slot);
  assert.deepEqual(getStatisticsScoresGameDay(thursday), {
    key: '2026-08-13',
    label: 'Thursday',
    dateLabel: 'Thu, Aug 13',
  });
  assert.deepEqual(getStatisticsScoresGameDay(friday), {
    key: '2026-08-14',
    label: 'Friday',
    dateLabel: 'Fri, Aug 14',
  });

  const groups = groupStatisticsScoresGames([thursday, friday]);
  assert.deepEqual(groups.map((group) => [group.label, group.games.map(({ id }) => id)]), [
    ['Thursday', ['thursday']],
    ['Friday', ['friday']],
  ]);
});

test('pulls every active game into one Live section before calendar-day sections', () => {
  const groups = groupStatisticsScoresGames([
    game('halftime', '2026-08-15T00:00:00.000Z', 'halftime'),
    game('live', '2026-08-14T01:35:00.000Z', 'live'),
    game('delayed', '2026-08-16T17:00:00.000Z', 'delayed'),
    game('friday', '2026-08-14T23:00:00.000Z'),
    game('thursday', '2026-08-14T00:00:00.000Z'),
  ]);

  assert.deepEqual(groups.map((group) => [group.label, group.dateLabel, group.games.map(({ id }) => id)]), [
    ['Live', null, ['live', 'halftime', 'delayed']],
    ['Thursday', 'Thu, Aug 13', ['thursday']],
    ['Friday', 'Fri, Aug 14', ['friday']],
  ]);
});

test('merges legacy fixture kickoff windows that share one displayed day', () => {
  const groups = groupStatisticsScoresGames([
    game('early', null, 'scheduled', {
      slot: 'saturday',
      slotLabel: 'Saturday',
      dateLabel: 'Sat · Oct 10',
    }),
    game('night', null, 'scheduled', {
      slot: 'saturday-night',
      slotLabel: 'Saturday Night',
      dateLabel: 'Sat · Oct 10',
    }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, 'Saturday');
  assert.deepEqual(groups[0].games.map(({ id }) => id), ['early', 'night']);
});
