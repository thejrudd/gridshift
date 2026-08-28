import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPredictionExport,
  parsePredictionImportData,
} from '../../src/utils/exportImport.js';

const predictions = {
  BUF: { wins: 14, losses: 3 },
  JAX: { wins: 13, losses: 4 },
};

test('prediction exports keep regular-season records and playoff picks together', () => {
  const exported = createPredictionExport({
    predictions,
    playoffPicks: { 'AFC-wc-2-7': 'JAX' },
    season: 2026,
  });

  assert.deepEqual(parsePredictionImportData(exported), {
    predictions,
    playoffPicks: { 'AFC-wc-2-7': 'JAX' },
    season: 2026,
    legacy: false,
  });
});

test('legacy record-only prediction files import with an empty bracket', () => {
  assert.deepEqual(parsePredictionImportData(predictions), {
    predictions,
    playoffPicks: {},
    season: null,
    legacy: true,
  });
});

test('versioned prediction files reject malformed playoff picks', () => {
  assert.throws(() => parsePredictionImportData({
    format: 'gridshift-predictions',
    predictions,
    playoffPicks: null,
  }), /expected playoff picks/);
});
