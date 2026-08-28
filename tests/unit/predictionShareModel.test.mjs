import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPredictionShareModel, getPredictionPickWeekContext } from '../../src/utils/predictionShareModel.js';

const divisionName = (conference, index) => `${conference} ${['East', 'North', 'South', 'West'][index < 4 ? index : 0]}`;
const teams = [
  ...['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((id, index) => ({ id: `AF${id}`, conference: 'AFC', division: divisionName('AFC', index) })),
  ...['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((id, index) => ({ id: `NF${id}`, conference: 'NFC', division: divisionName('NFC', index) })),
];

test('labels exports before Week 1 and advances from schedule kickoffs', () => {
  const schedule = { weeks: [
    { week: 1, games: [{ kickoff: '2026-09-10T00:20:00Z' }] },
    { week: 2, games: [{ kickoff: '2026-09-17T00:20:00Z' }] },
  ] };
  assert.deepEqual(getPredictionPickWeekContext(schedule, '2026-08-25T12:00:00Z'), { pickWeek: 1, weekLabel: 'Before Week 1' });
  assert.deepEqual(getPredictionPickWeekContext(schedule, '2026-09-18T12:00:00Z'), { pickWeek: 2, weekLabel: 'Week 2' });
});

test('reseeds the lowest remaining wild-card seed against the one seed', () => {
  const records = Object.fromEntries(teams.map((team, index) => [team.id, { wins: 17 - index, losses: index, ties: 0, divisionWins: 3 }]));
  const playoffPicks = {
    'AFC-wc-2-7': 'AFG', 'AFC-wc-3-6': 'AFC', 'AFC-wc-4-5': 'AFD',
    'AFC-div-1': 'AFA', 'AFC-div-2': 'AFC', 'AFC-championship': 'AFA',
    'NFC-wc-2-7': 'NFG', 'NFC-wc-3-6': 'NFC', 'NFC-wc-4-5': 'NFD',
    'NFC-div-1': 'NFA', 'NFC-div-2': 'NFC', 'NFC-championship': 'NFA',
    'super-bowl': 'AFA',
  };
  const model = buildPredictionShareModel({
    snapshot: { season: 2026, createdAt: '2026-09-20T12:00:00Z', mode: 'record', records, playoffPicks },
    teams,
    schedule: { weeks: [{ week: 1, games: [{ kickoff: '2026-09-10T00:20:00Z' }] }] },
  });
  const oneSeedMatchup = model.playoff.AFC.divisional[0];
  assert.equal(oneSeedMatchup.teams[0].id, model.seeds.AFC[0].id);
  assert.equal(oneSeedMatchup.teams[1].id, 'AFG');
  assert.equal(model.conferenceChampions.AFC.id, 'AFA');
  assert.equal(model.conferenceChampions.NFC.id, 'NFA');
  assert.equal(model.champion.id, 'AFA');
});

test('uses the canonical tied-record order for playoff seeds and bracket matchups', () => {
  const records = Object.fromEntries(teams.map((team, index) => [team.id, {
    wins: 10,
    losses: 7,
    ties: 0,
    divisionWins: 6 - (index % 7),
  }]));
  const model = buildPredictionShareModel({
    snapshot: { season: 2026, createdAt: '2026-09-20T12:00:00Z', mode: 'record', records, playoffPicks: {} },
    teams,
    schedule: { weeks: [] },
  });

  assert.deepEqual(model.seeds.AFC.map((team) => team.id), ['AFA', 'AFB', 'AFC', 'AFD', 'AFE', 'AFF', 'AFG']);
  assert.deepEqual(model.playoff.AFC.wildCard[2].teams.map((team) => team.id), ['AFD', 'AFE']);
});
