import test from 'node:test';
import assert from 'node:assert/strict';
import {
  comparePredictionTeams,
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

test('orders same-division ties by division record, then projected strength of schedule', () => {
  const tiedTeams = [
    {
      id: 'A-HARD',
      name: 'Hard Schedule Team',
      nickname: 'Zulu',
      conference: 'AFC',
      division: 'AFC East',
      opponents: ['HARD'],
    },
    {
      id: 'A-EASY',
      name: 'Easy Schedule Team',
      nickname: 'Alpha',
      conference: 'AFC',
      division: 'AFC East',
      opponents: ['EASY'],
    },
  ];
  const allTeams = [
    ...tiedTeams,
    { id: 'HARD', name: 'Hard Opponent', opponents: [] },
    { id: 'EASY', name: 'Easy Opponent', opponents: [] },
  ];
  const tiedRecords = {
    'A-HARD': { wins: 9, losses: 8, ties: 0, divisionWins: 3 },
    'A-EASY': { wins: 9, losses: 8, ties: 0, divisionWins: 3 },
    HARD: { wins: 13, losses: 4, ties: 0, divisionWins: 3 },
    EASY: { wins: 4, losses: 13, ties: 0, divisionWins: 3 },
  };

  assert.ok(comparePredictionTeams(tiedTeams[0], tiedTeams[1], tiedRecords, allTeams) < 0);
  assert.equal(getPredictionPlayoffField(tiedTeams, tiedRecords, allTeams).AFC.divisionWinners[0].id, 'A-HARD');

  const divisionRecordBreaksTie = {
    ...tiedRecords,
    'A-HARD': { ...tiedRecords['A-HARD'], divisionWins: 2 },
    'A-EASY': { ...tiedRecords['A-EASY'], divisionWins: 4 },
  };
  assert.ok(comparePredictionTeams(tiedTeams[1], tiedTeams[0], divisionRecordBreaksTie, allTeams) < 0);
});

test('uses the label fallback when projected strength of schedule is incomplete', () => {
  const tiedTeams = [
    {
      id: 'A-HARD',
      name: 'Hard Schedule Team',
      nickname: 'Zulu',
      conference: 'AFC',
      division: 'AFC East',
      opponents: ['HARD'],
    },
    {
      id: 'A-EASY',
      name: 'Easy Schedule Team',
      nickname: 'Alpha',
      conference: 'AFC',
      division: 'AFC East',
      opponents: ['EASY'],
    },
  ];
  const recordsWithoutOpponents = {
    'A-HARD': { wins: 9, losses: 8, ties: 0, divisionWins: 3 },
    'A-EASY': { wins: 9, losses: 8, ties: 0, divisionWins: 3 },
  };

  assert.ok(comparePredictionTeams(tiedTeams[1], tiedTeams[0], recordsWithoutOpponents, tiedTeams) < 0);
});
