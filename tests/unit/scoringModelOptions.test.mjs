import assert from 'node:assert/strict';
import test from 'node:test';

import { buildScoringModelOptions } from '../../src/utils/scoringModelOptions.js';

test('Scoring offers newer and older linked models independently of the results year', () => {
  const options = buildScoringModelOptions({
    platform: 'sleeper',
    resultSeason: '2025',
    activeLeague: { league_id: 'league-2025', name: 'GridShift', season: '2025' },
    linkedLeagueHistory: [
      { season: '2024', league: { league_id: 'league-2024', name: 'GridShift', season: '2024' } },
      { season: '2026', league: { league_id: 'league-2026', name: 'GridShift', season: '2026' } },
      { season: '2025', league: { league_id: 'league-2025', name: 'GridShift', season: '2025' } },
    ],
  });

  assert.deepEqual(options.map((option) => option.season), ['2026', '2025', '2024']);
  assert.equal(options.find((option) => option.season === '2026')?.leagueId, 'league-2026');
  assert.equal(options.find((option) => option.isResultSeason)?.season, '2025');
});

test('Scoring exposes ESPN model years while keeping one league identity', () => {
  const options = buildScoringModelOptions({
    platform: 'espn',
    resultSeason: '2025',
    activeLeague: { league_id: '12345', name: 'Sunday League', season: '2025' },
    linkedLeagueSeasonOptions: ['2026', '2025', '2024', '2025'],
  });

  assert.deepEqual(options.map((option) => option.season), ['2026', '2025', '2024']);
  assert.ok(options.every((option) => option.leagueId === '12345'));
  assert.equal(options.find((option) => option.isResultSeason)?.season, '2025');
});
