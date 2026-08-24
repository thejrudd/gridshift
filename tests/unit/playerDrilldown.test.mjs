import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStatisticsPlayerMetaFromSleeperId,
  resolveStatisticsPlayerMetaFromSleeperId,
} from '../../src/utils/playerDrilldown.js';

test('buildStatisticsPlayerMetaFromSleeperId uses existing ESPN IDs without fallback lookup', () => {
  const meta = buildStatisticsPlayerMetaFromSleeperId('103', {
    103: {
      full_name: 'Amon-Ra St. Brown',
      espn_id: 4374302,
      team: 'DET',
      position: 'WR',
      years_exp: 4,
      number: 14,
    },
  });

  assert.equal(meta.id, '4374302');
  assert.equal(meta.sleeperId, '103');
  assert.equal(meta.displayName, 'Amon-Ra St. Brown');
  assert.equal(meta.teamId, 'DET');
});

test('resolveStatisticsPlayerMetaFromSleeperId falls back to ESPN roster name matching', async () => {
  const meta = await resolveStatisticsPlayerMetaFromSleeperId('rookie-1', {
    'rookie-1': {
      full_name: 'Cam Scattebo',
      espn_id: null,
      team: 'NYG',
      position: 'RB',
      years_exp: 0,
      number: 44,
      injury_status: '',
    },
  }, {}, {
    fetchRosterFn: async (teamId) => {
      assert.equal(teamId, 'NYG');
      return [
        {
          id: 4431452,
          displayName: 'Cam Scattebo',
          jersey: '44',
          position: 'RB',
          experience: 0,
          status: 'Active',
          teamId: 'nyg',
        },
      ];
    },
  });

  assert.equal(meta.id, '4431452');
  assert.equal(meta.espnId, '4431452');
  assert.equal(meta.sleeperId, 'rookie-1');
  assert.equal(meta.displayName, 'Cam Scattebo');
  assert.equal(meta.teamId, 'nyg');
});

test('resolveStatisticsPlayerMetaFromSleeperId returns null when no roster fallback can match', async () => {
  const meta = await resolveStatisticsPlayerMetaFromSleeperId('rookie-2', {
    'rookie-2': {
      full_name: 'Kyle Monangai',
      espn_id: null,
      team: 'CHI',
      position: 'RB',
    },
  }, {}, {
    fetchRosterFn: async () => [{ id: 1, displayName: 'Different Player' }],
  });

  assert.equal(meta, null);
});
