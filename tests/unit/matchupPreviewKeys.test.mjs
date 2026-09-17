import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMatchupKeys, hashSeed, keyPartsToString, KEY_FAMILY } from '../../src/utils/matchupPreviewKeys.js';
import { readRecentKeyIds, recordKeyIds, pairingId } from '../../src/utils/matchupPreviewKeyHistory.js';

const starter = (overrides = {}) => ({
  id: overrides.id ?? `p-${Math.random().toString(36).slice(2, 8)}`,
  isEmpty: false,
  name: 'Starter',
  position: 'RB',
  slotLabel: 'RB',
  team: 'ATL',
  opponentTeam: 'CAR',
  gameKey: 'ATL@CAR|2026-09-20',
  gameLabel: 'CAR at ATL',
  isHome: true,
  isBye: false,
  gameStarted: false,
  gameFinal: false,
  kickoffWindow: 'early',
  projected: 12,
  baselineProjected: 12,
  actual: null,
  seasonAverage: 11,
  bestWeek: 18,
  positionalRank: 12,
  availabilityStatus: null,
  opponentContext: null,
  weatherNote: null,
  ...overrides,
});

const side = (key, overrides = {}) => ({
  key,
  id: `roster-${key}`,
  name: key === 'a' ? 'Fourth & Long' : 'Second Bower',
  managerName: key === 'a' ? 'You' : 'D. Mahler',
  abbr: key === 'a' ? 'F&L' : 'BOW',
  record: '1–1',
  games: 2,
  seed: key === 'a' ? 6 : 2,
  pointsFor: 231.4,
  pointsAgainst: 226.9,
  pointsForRank: 4,
  pointsAgainstRank: 5,
  starters: [starter(), starter(), starter()],
  projectedTotal: 118.4,
  recordedProjectedTotal: 118.4,
  liveTotal: null,
  expectedTotal: 118.4,
  remainingProjection: 118.4,
  earlyWindowProjection: 118.4,
  lateWindowProjection: null,
  benchUpgrade: null,
  benchUpgradeLabel: null,
  ...overrides,
});

const context = (overrides = {}) => ({
  leagueId: 'league-1',
  season: '2026',
  week: 3,
  phase: 'pre',
  sides: { a: side('a'), b: side('b') },
  slots: [],
  slotGroups: [],
  expectedMargin: 3.5,
  liveMargin: 0,
  finalMargin: 0,
  swing: 24,
  starterCount: 18,
  fallbackCount: 0,
  rivalry: null,
  league: { teamCount: 12, averagePointsFor: 240, averagePointsAgainst: 240 },
  seedKey: 'league-1|2026|3|roster-a|roster-b',
  ...overrides,
});

test('returns at most the requested number of keys', () => {
  const keys = buildMatchupKeys(context(), { limit: 3 });
  assert.ok(keys.length <= 3);
});

test('never repeats a family across the selected keys', () => {
  const keys = buildMatchupKeys(context({
    slotGroups: [
      { label: 'QB', starters: 1, a: 19.2, b: 16.8, lead: 'a', aNames: 'Stafford', bNames: 'Lawrence' },
      { label: 'RB', starters: 2, a: 30.5, b: 18.5, lead: 'a', aNames: 'Robinson · Walker', bNames: 'Gibbs · Brown' },
      { label: 'WR', starters: 2, a: 30.3, b: 32.1, lead: 'b', aNames: 'Wilson', bNames: 'Nacua' },
      { label: 'TE', starters: 1, a: 11.8, b: 15.6, lead: 'b', aNames: 'McBride', bNames: 'Bowers' },
    ],
    rivalry: { games: 6, leftWins: 2, rightWins: 4, meetings: [{ season: 2025, week: 13, margin: 2.4, winner: 'left' }] },
  }), { limit: 3 });
  const families = keys.map((key) => key.family);
  assert.equal(new Set(families).size, families.length);
});

test('produces fewer keys rather than padding when signals are absent', () => {
  const bare = context({
    swing: null,
    expectedMargin: null,
    league: null,
    sides: {
      a: side('a', {
        pointsFor: null, pointsAgainst: null, games: 0, record: null, seed: null, pointsForRank: null,
        starters: [], projectedTotal: null, recordedProjectedTotal: null, expectedTotal: null,
        remainingProjection: null, earlyWindowProjection: null,
      }),
      b: side('b', {
        pointsFor: null, pointsAgainst: null, games: 0, record: null, seed: null, pointsForRank: null,
        starters: [], projectedTotal: null, recordedProjectedTotal: null, expectedTotal: null,
        remainingProjection: null, earlyWindowProjection: null,
      }),
    },
  });
  const keys = buildMatchupKeys(bare, { limit: 3 });
  assert.ok(keys.length < 3, `expected a thin context to produce fewer than 3 keys, got ${keys.length}`);
});

test('is deterministic for the same matchup and week', () => {
  const input = context();
  const first = buildMatchupKeys(input, { limit: 3 });
  const second = buildMatchupKeys(input, { limit: 3 });
  assert.deepEqual(first.map((key) => key.text), second.map((key) => key.text));
});

test('different pairings do not converge on identical phrasing', () => {
  const base = context({ sides: { a: side('a'), b: side('b') } });
  const other = context({ seedKey: 'league-1|2026|3|roster-c|roster-d' });
  const phrasings = new Set([
    ...buildMatchupKeys(base, { limit: 3 }).map((key) => key.text),
    ...buildMatchupKeys(other, { limit: 3 }).map((key) => key.text),
  ]);
  assert.ok(phrasings.size > 1);
});

test('demotes a detector that fired for this pairing in a recent week', () => {
  const input = context({
    slotGroups: [
      { label: 'RB', starters: 2, a: 34, b: 18, lead: 'a', aNames: 'Robinson · Walker', bNames: 'Gibbs · Brown' },
    ],
  });
  const withoutHistory = buildMatchupKeys(input, { limit: 1 });
  assert.equal(withoutHistory.length, 1);
  const withHistory = buildMatchupKeys(input, { limit: 1, recentIds: [withoutHistory[0].detectorId] });
  assert.notEqual(withHistory[0]?.detectorId, withoutHistory[0].detectorId);
});

test('a throwing detector never takes the panel down', () => {
  const hostile = context();
  Object.defineProperty(hostile.sides.a, 'starters', {
    get() { throw new Error('boom'); },
  });
  assert.doesNotThrow(() => buildMatchupKeys(hostile, { limit: 3 }));
});

test('key text renders emphasis as segments, not markup', () => {
  const keys = buildMatchupKeys(context(), { limit: 3 });
  for (const key of keys) {
    assert.ok(Array.isArray(key.parts));
    assert.equal(keyPartsToString(key.parts), key.text);
    assert.ok(!/[<>]/.test(key.text), `key text should never carry markup: ${key.text}`);
  }
});

test('every key belongs to a declared family', () => {
  const families = new Set(Object.values(KEY_FAMILY));
  for (const key of buildMatchupKeys(context(), { limit: 3 })) {
    assert.ok(families.has(key.family), `unexpected family ${key.family}`);
  }
});

test('hashSeed is stable and distinguishes inputs', () => {
  assert.equal(hashSeed('league|2026|3'), hashSeed('league|2026|3'));
  assert.notEqual(hashSeed('league|2026|3'), hashSeed('league|2026|4'));
});

test('key history returns earlier weeks only, most recent first', () => {
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  };
  const pairing = pairingId(1, 2);
  recordKeyIds({ leagueId: 'L', pairingId: pairing, week: 2, ids: ['slot-edge-largest'], storage });
  recordKeyIds({ leagueId: 'L', pairingId: pairing, week: 3, ids: ['shape-tossup'], storage });
  recordKeyIds({ leagueId: 'L', pairingId: pairing, week: 4, ids: ['rivalry-series'], storage });
  assert.deepEqual(
    readRecentKeyIds({ leagueId: 'L', pairingId: pairing, week: 4, storage }),
    ['shape-tossup', 'slot-edge-largest'],
  );
});

test('key history survives an unavailable storage', () => {
  const hostile = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  const pairing = pairingId(9, 10);
  assert.doesNotThrow(() => recordKeyIds({ leagueId: 'L', pairingId: pairing, week: 1, ids: ['shape-tossup'], storage: hostile }));
  assert.deepEqual(readRecentKeyIds({ leagueId: 'L', pairingId: pairing, week: 1, storage: hostile }), []);
});

test('pairing id is order independent', () => {
  assert.equal(pairingId(4, 7), pairingId(7, 4));
});
