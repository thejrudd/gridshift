import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLocalKickoffDayTime, formatStatisticsScoresLocalKickoff } from '../../src/utils/statisticsScoresTime.js';

test('formats scheduled kickoffs in the requested local timezone', () => {
  const kickoff = '2026-08-14T04:30:00.000Z';

  assert.equal(
    formatStatisticsScoresLocalKickoff(kickoff, { timeZone: 'Pacific/Auckland' }),
    'Fri, Aug 14, 4:30 PM GMT+12',
  );
  assert.equal(
    formatStatisticsScoresLocalKickoff(kickoff, { timeZone: 'America/Los_Angeles' }),
    'Thu, Aug 13, 9:30 PM PDT',
  );
});

test('returns null for an invalid kickoff', () => {
  assert.equal(formatStatisticsScoresLocalKickoff('not-a-date'), null);
  assert.equal(formatStatisticsScoresLocalKickoff(null), null);
});

test('the short kickoff label is the local weekday and time', () => {
  assert.equal(formatLocalKickoffDayTime('2026-11-08T21:25:00.000Z', { timeZone: 'America/Chicago' }), 'Sun 3:25 PM');
  assert.equal(formatLocalKickoffDayTime('2026-11-10T01:15:00.000Z', { timeZone: 'America/New_York' }), 'Mon 8:15 PM');
  assert.equal(formatLocalKickoffDayTime(''), null);
  assert.equal(formatLocalKickoffDayTime('not a date'), null);
});
