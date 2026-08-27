import test from 'node:test';
import assert from 'node:assert/strict';
import { getPredictionProgressSummary } from '../../src/utils/predictionProgress.js';

const teams = Array.from({ length: 32 }, (_, index) => ({
  id: `T${index}`,
  opponents: Array.from({ length: 17 }, (__, game) => `O${index}-${game}`),
}));

const completeRecord = (wins = 9) => ({ wins, losses: 17 - wins, ties: 0, divisionWins: 3 });

test('record progress uses semantic records without provenance metadata', () => {
  const predictions = Object.fromEntries(teams.map((team, index) => [team.id, completeRecord(index < 16 ? 9 : 8)]));
  const progress = getPredictionProgressSummary({ teams, predictions, mode: 'record' });
  assert.deepEqual(progress.primary, { label: 'Records', value: 32, total: 32, status: 'complete' });
  assert.deepEqual(progress.secondary, { label: 'League wins', value: 272, total: 272, status: 'complete' });
  assert.equal(Number.isInteger(progress.secondary.value), true);
});

test('record progress lowers the league-win target for paired ties', () => {
  const predictions = Object.fromEntries(teams.map((team, index) => [team.id, completeRecord(index < 16 ? 9 : 8)]));
  predictions.T0 = { wins: 8, losses: 8, ties: 1, divisionWins: 3 };
  predictions.T16 = { wins: 8, losses: 8, ties: 1, divisionWins: 3 };

  const progress = getPredictionProgressSummary({ teams, predictions, mode: 'record' });
  assert.deepEqual(progress.secondary, { label: 'League wins', value: 271, total: 271, status: 'complete' });
});

test('record progress marks incomplete, invalid, and excess aggregate records', () => {
  const incomplete = getPredictionProgressSummary({
    teams,
    predictions: Object.fromEntries(teams.slice(0, 31).map(team => [team.id, completeRecord()])),
    mode: 'record',
  });
  assert.equal(incomplete.primary.value, 31);
  assert.equal(incomplete.primary.status, 'incomplete');

  const invalidRecords = Object.fromEntries(teams.map(team => [team.id, completeRecord()]));
  invalidRecords.T0 = { wins: 18, losses: 0, ties: 0 };
  const invalid = getPredictionProgressSummary({ teams, predictions: invalidRecords, mode: 'record' });
  assert.equal(invalid.primary.status, 'invalid');
  assert.equal(invalid.secondary.status, 'excess');
  assert.equal(invalid.secondary.value > invalid.secondary.total, true);
});

test('advanced progress counts only legal explicit team slots and whole canonical games', () => {
  const predictions = Object.fromEntries(teams.map(team => [team.id, {
    gameResults: Object.fromEntries(Array.from({ length: 17 }, (_, index) => [index, 'W'])),
  }]));
  delete predictions.T0.gameResults[16];
  predictions.T1.gameResults[16] = 'X';
  const progress = getPredictionProgressSummary({
    teams,
    predictions,
    gameCounts: { pickedGames: 271.8, totalGames: 272 },
    mode: 'advanced',
  });
  assert.deepEqual(progress.primary, { label: 'Teams', value: 30, total: 32, status: 'incomplete' });
  assert.deepEqual(progress.secondary, { label: 'Games', value: 271, total: 272, status: 'incomplete' });
  assert.equal(Number.isInteger(progress.secondary.value), true);
});
