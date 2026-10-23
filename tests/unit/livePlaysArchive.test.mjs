import assert from 'node:assert/strict';
import test from 'node:test';
import { createLivePlaysArchive } from '../../server/livePlaysArchive.js';
import { createLiveGameSnapshotStore, PLAY_CORRECTION_WINDOW_MS } from '../../server/liveGameSnapshots.js';

const HOUR = 60 * 60 * 1000;
const KICKOFF = Date.parse('2026-10-18T17:00:00.000Z');

function makePlays(count = 3, label = 'play') {
  return Array.from({ length: count }, (_, index) => ({
    id: `${label}-${index}`,
    period: 1,
    clock_display: `${10 - index}:00`,
    text: `${label} ${index}`,
  }));
}

// A provider double: counts requests by kind and answers from the scenario.
function makeGateway(scenario) {
  const calls = { status: 0, plays: 0 };
  return {
    calls,
    async request({ path }) {
      if (path.startsWith('/nfl/v1/games/')) {
        calls.status += 1;
        return { payload: { data: { id: 7, date: new Date(KICKOFF).toISOString(), status: scenario.status } } };
      }
      calls.plays += 1;
      return {
        payload: { data: scenario.plays, meta: { next_cursor: null } },
        cache: { hit: false, coalesced: false, stale: false },
        freshness: { providerFetchedAt: new Date(0).toISOString(), ageMs: 0 },
      };
    },
  };
}

function setup(scenario, startAt) {
  let nowMs = startAt;
  const clock = { now: () => nowMs, advance: (ms) => { nowMs += ms; } };
  const archive = createLivePlaysArchive({ databasePath: ':memory:', now: clock.now, config: { maxBytes: 10 * 1024 * 1024 } });
  const gateway = makeGateway(scenario);
  const store = createLiveGameSnapshotStore({ gateway, archive, now: clock.now });
  return { archive, gateway, store, clock };
}

test('a game final for over 48 hours is fetched once and then served from the archive with no provider calls', async () => {
  const scenario = { status: 'Final', plays: makePlays(4) };
  const { gateway, store } = setup(scenario, KICKOFF + 4 * HOUR + PLAY_CORRECTION_WINDOW_MS + HOUR);

  const first = await store.getPlays({ gameId: 7 });
  assert.equal(first.plays.length, 4);
  assert.deepEqual(gateway.calls, { status: 1, plays: 1 });

  const second = await store.getPlays({ gameId: 7 });
  assert.equal(second.plays.length, 4);
  assert.equal(second.cache.archived, true);
  assert.deepEqual(second.accounting, { pageCount: 0, upstreamRequests: 0 });
  assert.deepEqual(gateway.calls, { status: 1, plays: 1 }, 'a verified row asks the provider nothing');
});

test('a recently finished game is served from the archive, refetched once after the correction window, then permanent', async () => {
  const scenario = { status: 'Final', plays: makePlays(3, 'original') };
  const { gateway, store, clock } = setup(scenario, KICKOFF + 5 * HOUR);

  await store.getPlays({ gameId: 7 });
  assert.deepEqual(gateway.calls, { status: 1, plays: 1 });

  // Inside the window: the archived copy is served with no provider call at
  // all — an archived game is known to be final, so not even a status check.
  clock.advance(10 * HOUR);
  const inside = await store.getPlays({ gameId: 7 });
  assert.equal(inside.cache.archived, true);
  assert.deepEqual(gateway.calls, { status: 1, plays: 1 });

  // A correction lands; after the window the play list is refetched once.
  scenario.plays = makePlays(3, 'corrected');
  clock.advance(PLAY_CORRECTION_WINDOW_MS);
  const after = await store.getPlays({ gameId: 7 });
  assert.equal(after.plays[0].id, 'corrected-0');
  assert.equal(gateway.calls.plays, 2);

  // Permanent from here: no provider calls of either kind.
  const statusCalls = gateway.calls.status;
  const later = await store.getPlays({ gameId: 7 });
  assert.equal(later.plays[0].id, 'corrected-0');
  assert.equal(later.cache.archived, true);
  assert.equal(gateway.calls.plays, 2);
  assert.equal(gateway.calls.status, statusCalls);
});

test('a live game is never archived', async () => {
  const scenario = { status: '06:42 - 3rd', plays: makePlays(2) };
  const { archive, gateway, store } = setup(scenario, KICKOFF + 2 * HOUR);
  await store.getPlays({ gameId: 7 });
  await store.getPlays({ gameId: 7 });
  assert.equal(gateway.calls.plays, 2);
  assert.equal(archive.getStats().rows, 0);
});

test('an empty answer for a finished game is not archived', async () => {
  const scenario = { status: 'Final', plays: [] };
  const { archive, gateway, store } = setup(scenario, KICKOFF + 100 * HOUR);
  await store.getPlays({ gameId: 7 });
  await store.getPlays({ gameId: 7 });
  assert.equal(gateway.calls.plays, 2);
  assert.equal(archive.getStats().rows, 0);
});

test('the archive round-trips a payload through gzip and evicts least recently read rows past its cap', () => {
  let nowMs = 1_000;
  const archive = createLivePlaysArchive({ databasePath: ':memory:', now: () => nowMs, config: { maxBytes: 4_000 } });
  const payload = { data: makePlays(5), meta: { next_cursor: null } };
  archive.put('1:', payload, { gameEndedAt: 500, verified: true });
  const row = archive.get('1:');
  assert.deepEqual(row.payload, payload);
  assert.equal(row.verified, true);
  assert.equal(row.gameEndedAt, 500);

  // Incompressible bodies so the cap is crossed quickly.
  const noisy = (seed) => ({ data: Array.from({ length: 40 }, (_, index) => ({ id: `${seed}-${index}-${Math.random().toString(36).slice(2)}` })) });
  nowMs += 10;
  archive.put('2:', noisy('b'), { gameEndedAt: 500 });
  nowMs += 10;
  archive.put('3:', noisy('c'), { gameEndedAt: 500 });
  assert.ok(archive.getStats().bytes <= 4_000);
  assert.ok(archive.get('3:'), 'the row just written is never evicted');
});
