import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlayerMatchupBenchOption } from '../../src/utils/playerMatchupBenchOption.js';

const now = Date.parse('2026-09-15T12:00:00Z');
const kickoff = '2026-09-16T12:00:00Z';
const player = (id, projected, extra = {}) => ({
  id, name: id, position: 'WR', projection: { projected },
  scheduleEntry: { kickoff, completed: false }, ...extra,
});
const context = (overrides = {}) => ({
  isUser: true, slot: 'WR', starter: player('starter', 10),
  bench: [player('lower', 11.9), player('better', 12), player('best', 15)],
  excludedIds: [], players: {}, ...overrides,
});
const choose = overrides => buildPlayerMatchupBenchOption({ context: context(overrides), now });

test('returns one highest projection with a minimum two-point improvement, without mutating input', () => {
  const input = context();
  const original = structuredClone(input);
  assert.deepEqual(buildPlayerMatchupBenchOption({ context: input, now }), {
    player: input.bench[2], projected: 15, improvement: 5, slot: 'WR',
  });
  assert.deepEqual(input, original);
  assert.equal(choose({ bench: [player('edge', 12)] }).improvement, 2);
  assert.equal(choose({ bench: [player('edge', 11.999)] }), null);
});

test('requires own starter context and directly eligible slot, including flex and IDP', () => {
  assert.equal(choose({ isUser: false }), null);
  assert.equal(choose({ slot: 'UNKNOWN' }), null);
  assert.equal(choose({ bench: [player('rb', 20, { position: 'RB' })] }), null);
  assert.equal(choose({ slot: 'FLEX', bench: [player('rb', 20, { position: 'RB' })] }).player.id, 'rb');
  assert.equal(choose({ slot: 'SUPER_FLEX', bench: [player('qb', 20, { position: 'QB' })] }).player.id, 'qb');
  assert.equal(choose({ slot: 'IDP_FLEX', bench: [player('de', 20, { position: 'DE' })] }).player.id, 'de');
  assert.equal(choose({ bench: [player('multi', 20, { position: 'RB' })], players: { multi: { fantasy_positions: ['RB', 'WR'] } } }).player.id, 'multi');
});

test('requires both known future kickoffs and removes suggestion exactly at kickoff', () => {
  for (const scheduleEntry of [{}, { kickoff: 'bad' }, { kickoff: '2020-01-01' }, { kickoff, completed: true }, { kickoff, status: 'Postponed' }]) {
    assert.equal(choose({ starter: player('starter', 10, { scheduleEntry }) }), null);
    assert.equal(choose({ bench: [player('candidate', 20, { scheduleEntry })] }), null);
  }
  assert.equal(buildPlayerMatchupBenchOption({ context: context(), now: Date.parse(kickoff) }), null);
  assert.equal(choose({ starter: player('starter', 10, { gameStarted: true }) }), null);
  assert.equal(choose({ bench: [player('candidate', 20, { isBye: true })] }), null);
});

test('excludes reserve, taxi and unavailable players even if their projection is higher', () => {
  assert.equal(choose({ excludedIds: ['best', 'better'] }), null);
  assert.equal(choose({ bench: [player(3, 20)], excludedIds: ['3'] }), null);
  for (const injury_status of ['Out', 'Doubtful', 'Injured Reserve', 'Inactive', 'Suspended', 'PUP', 'NFI']) {
    assert.equal(choose({ bench: [player('candidate', 20)], players: { candidate: { injury_status } } }), null);
  }
  assert.equal(choose({ bench: [player('candidate', 20, { availabilityStatus: 'Out' })] }), null);
  assert.equal(choose({ bench: [player('candidate', 20)], players: { candidate: { injury_status: 'Questionable' } } }).player.id, 'candidate');
});

test('retains valid zero and negative projections but never substitutes missing values', () => {
  for (const missing of [null, undefined, '', NaN, Infinity]) {
    assert.equal(choose({ starter: player('starter', missing) }), null);
    assert.equal(choose({ bench: [player('candidate', missing)] }), null);
  }
  assert.equal(choose({ starter: player('starter', -2), bench: [player('candidate', 0)] }).improvement, 2);
  assert.equal(choose({ starter: player('starter', 0), bench: [player('candidate', 2)] }).improvement, 2);
});

test('ties choose deterministically and never recommend selected starter again', () => {
  assert.equal(choose({ bench: [player('z', 20), player('a', 20), player('starter', 30)] }).player.id, 'a');
});
