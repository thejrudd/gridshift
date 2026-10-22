import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMatchupPointSources, buildMatchupScoredSources } from '../../src/utils/matchupPointSources.js';

const outlook = (playerId, playerName, positionGroup, remainingProj, source = 'projection') => ({
  playerId, playerName, positionGroup, current: 0, remainingProj, source,
});

test('groups starters by position in lineup order and sums to the total', () => {
  const sources = buildMatchupPointSources({
    outlooks: [
      outlook('w1', 'Ja\'Marr Chase', 'WR', 18.4),
      outlook('q1', 'Josh Allen', 'QB', 24.1),
      outlook('r1', 'Bijan Robinson', 'RB', 17.2),
      outlook('r2', 'De\'Von Achane', 'RB', 15.6, 'seasonAvg'),
      outlook('d1', 'Bills', 'DEF', 7),
    ],
  }, 82.3);
  assert.deepEqual(sources.rows.map((row) => row.label), ['QB', 'RB', 'WR', 'D/ST']);
  assert.equal(sources.rows[1].points, 32.8);
  assert.deepEqual(sources.rows[1].players.map((player) => player.name), ['Robinson', 'Achane']);
  assert.equal(sources.rows[1].players[1].estimated, true);
  assert.equal(sources.estimatedCount, 1);
  assert.equal(sources.adjustment, 0);
  assert.equal(sources.total, 82.3);
});

test('keeps a league adjustment gap visible', () => {
  const sources = buildMatchupPointSources({ outlooks: [outlook('q1', 'Josh Allen', 'QB', 20)] }, 22.5);
  assert.equal(sources.adjustment, 2.5);
});

test('returns null without starters', () => {
  assert.equal(buildMatchupPointSources({ outlooks: [] }, 0), null);
  assert.equal(buildMatchupPointSources(null, 0), null);
});

const starter = (id, name, position, weekPts, extra = {}) => ({ id, name, position, weekPts, ...extra });

test('live: groups scored points, counts game states, and reports what is left', () => {
  const states = { q1: 'final', r1: 'live', r2: 'pre', w1: 'live' };
  const sources = buildMatchupScoredSources([
    starter('q1', 'Josh Allen', 'QB', 22.4),
    starter('r1', 'Bijan Robinson', 'RB', 6.1),
    starter('r2', 'De\'Von Achane', 'RB', null),
    starter('w1', 'Ja\'Marr Chase', 'WR', 9.5),
    { id: 'e', name: 'Empty' },
  ], 38, { phase: 'live', stateFor: (player) => states[player.id], projectedFinal: 81.2 });
  assert.equal(sources.phase, 'live');
  assert.deepEqual(sources.rows.map((row) => [row.label, row.points]), [['QB', 22.4], ['RB', 6.1], ['WR', 9.5]]);
  // Playing first, then finished, then yet to play.
  assert.deepEqual(sources.rows[1].players.map((player) => [player.name, player.state]), [['Robinson', 'live'], ['Achane', 'pre']]);
  assert.deepEqual(sources.counts, { pre: 1, live: 2, final: 1 });
  assert.equal(sources.toGo, 43.2);
  assert.equal(sources.projectedFinal, 81.2);
  assert.equal(sources.adjustment, 0);
  assert.equal(sources.rows[0].delta, null);
});

test('final: compares complete positions with projection and names the top bench scorer', () => {
  const projections = { q1: 20, r1: 15, r2: null };
  const sources = buildMatchupScoredSources([
    starter('q1', 'Josh Allen', 'QB', 24.1),
    starter('r1', 'Bijan Robinson', 'RB', 12),
    starter('r2', 'De\'Von Achane', 'RB', 18),
    starter('d1', 'Bills', 'DEF', 5, { isBye: false }),
  ], 61.1, {
    phase: 'final',
    projectionFor: (player) => projections[player.id] ?? null,
    bench: [starter('b1', 'Tony Pollard', 'RB', 14.2), starter('b2', 'Jake Ferguson', 'TE', 3)],
  });
  assert.equal(sources.rows[0].delta, 4.1);
  assert.equal(sources.rows[1].delta, null);
  assert.equal(sources.adjustment, 2);
  assert.deepEqual(sources.topBench, { name: 'Pollard', points: 14.2 });
  assert.equal(sources.toGo, null);
});

test('scored sources return null without starters', () => {
  assert.equal(buildMatchupScoredSources([{ id: 'e', name: 'Empty' }], 0), null);
});
