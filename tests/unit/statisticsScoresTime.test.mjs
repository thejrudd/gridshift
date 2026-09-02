import test from 'node:test';
import assert from 'node:assert/strict';
import { formatStatisticsScoresLocalKickoff } from '../../src/utils/statisticsScoresTime.js';

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
