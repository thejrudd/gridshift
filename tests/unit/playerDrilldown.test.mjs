import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStatisticsPlayerMetaFromSleeperId,
  lookupEspnIdByName,
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

test('a player with no team resolves by name, so free agents open their stats page', async () => {
  const meta = await resolveStatisticsPlayerMetaFromSleeperId('7528', {
    7528: { full_name: 'Najee Harris', espn_id: null, team: null, position: 'RB', years_exp: 5 },
  }, {}, {
    fetchRosterFn: async () => { throw new Error('no roster for a player with no team'); },
    nameLookup: async (name) => (name === 'Najee Harris' ? '4241457' : null),
  });

  assert.equal(meta.id, '4241457');
  assert.equal(meta.sleeperId, '7528');
  assert.equal(meta.displayName, 'Najee Harris');
  assert.equal(meta.position, 'RB');
});

test('lookupEspnIdByName accepts only a unique exact name', async () => {
  const results = [
    { id: '4241457', displayName: 'Najee Harris' },
    { id: '3918298', displayName: 'Josh Allen' },
    { id: '17102', displayName: 'Josh Allen' },
    { id: '3915239', displayName: 'Josh Hines-Allen' },
    { id: '555', displayName: 'Marvin Harrison Jr.' },
  ];
  const searchFn = async () => results;

  assert.equal(await lookupEspnIdByName('Najee Harris', { searchFn }), '4241457');
  assert.equal(await lookupEspnIdByName('najée harris', { searchFn }), '4241457', 'accents and case are ignored');
  assert.equal(await lookupEspnIdByName('Marvin Harrison', { searchFn }), '555', 'a suffix is ignored');
  assert.equal(await lookupEspnIdByName('Josh Allen', { searchFn }), null, 'two players share the name, so no guess');
  assert.equal(await lookupEspnIdByName('Nobody Here', { searchFn }), null);
  assert.equal(await lookupEspnIdByName('', { searchFn }), null);
  assert.equal(await lookupEspnIdByName('Najee Harris', { searchFn: async () => { throw new Error('offline'); } }), null);
});
