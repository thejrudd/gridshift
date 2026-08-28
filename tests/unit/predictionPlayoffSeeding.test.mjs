import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPredictionPlayoffField,
  getPredictionPlayoffSeeds,
} from '../../src/utils/predictionPlayoffSeeding.js';

const teams = ['East', 'North', 'South', 'West'].flatMap((division, divisionIndex) => ([
  {
    id: `A${divisionIndex}W`,
    name: `${division} Full Winner`,
    nickname: ['Zulu', 'Alpha', 'Bravo', 'Charlie'][divisionIndex],
    conference: 'AFC',
    division: `AFC ${division}`,
  },
  {
    id: `A${divisionIndex}R`,
    name: `${division} Full Runner-up`,
    nickname: ['Delta', 'Echo', 'Foxtrot', 'Golf'][divisionIndex],
    conference: 'AFC',
    division: `AFC ${division}`,
  },
]));

const records = Object.fromEntries(teams.map((team) => [team.id, team.id.endsWith('W')
  ? { wins: 11, losses: 6, ties: 0, divisionWins: 3 }
  : { wins: 10, losses: 7, ties: 0, divisionWins: 6 }]));

test('orders tied prediction seeds by the visible team label without using a conflicting division-win tiebreak', () => {
  const seeds = getPredictionPlayoffSeeds(teams, records).AFC;
  assert.deepEqual(seeds.map((team) => team.id), ['A1W', 'A2W', 'A3W', 'A0W', 'A0R', 'A1R', 'A2R']);
  assert.deepEqual(seeds.slice(3, 5).map((team) => team.id), ['A0W', 'A0R']);
});

test('keeps partial division winners and wild cards distinct', () => {
  const partialTeams = teams.filter((team) => ['AFC East', 'AFC North'].includes(team.division));
  const field = getPredictionPlayoffField(partialTeams, records).AFC;
  assert.deepEqual(field.divisionWinners.map((team) => team.id), ['A1W', 'A0W']);
  assert.deepEqual(field.wildCards.map((team) => team.id), ['A0R', 'A1R']);
  assert.deepEqual(field.seeds.map((team) => team.id), ['A1W', 'A0W', 'A0R', 'A1R']);
});
