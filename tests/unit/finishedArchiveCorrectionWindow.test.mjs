// Statistics box scores use a one-week correction window with a 6-hour recheck;
// play-by-play and live stats keep the default window and no recheck.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readThroughFinishedArchive } from '../../server/finishedGameArchive.js';
import { PLAY_CORRECTION_WINDOW_MS } from '../../server/liveGameSnapshots.js';

const HOUR = 60 * 60_000;
const KICKOFF = Date.parse('2026-11-08T18:00:00Z');
const ENDED = KICKOFF + 4 * HOUR;

function memoryArchive() {
  const rows = new Map();
  return {
    rows,
    get: (key) => rows.get(key) ?? null,
    put: (key, payload, { gameEndedAt, verified = false } = {}) => {
      rows.set(key, { key, payload, gameEndedAt, verified, fetchedAt: clock.t });
    },
  };
}
const clock = { t: ENDED + HOUR };
const now = () => clock.t;
const finalPayload = (n) => ({ data: [{ status: 'Final', date: new Date(KICKOFF).toISOString(), n }] });

function reader(archive, opts) {
  let calls = 0;
  const read = () => readThroughFinishedArchive({
    archive, key: 'k', now, ...opts,
    fetchFresh: async () => { calls += 1; return { payload: finalPayload(calls), cacheInfo: {} }; },
  });
  return { read, calls: () => calls };
}

test('box scores are rechecked every 6 hours inside a one-week window, then kept for good', async () => {
  clock.t = ENDED + HOUR;
  const archive = memoryArchive();
  const { read, calls } = reader(archive, { correctionWindowMs: 7 * 24 * HOUR, revalidateAfterMs: 6 * HOUR });
  await read();
  assert.equal(calls(), 1);
  clock.t += 5 * HOUR; await read();
  assert.equal(calls(), 1, 'served from the archive before the recheck is due');
  clock.t += 2 * HOUR; const corrected = await read();
  assert.equal(calls(), 2, 'rechecked once 6 hours have passed');
  assert.equal(corrected.payload.data[0].n, 2);
  assert.equal(archive.rows.get('k').verified, false);
  clock.t = ENDED + 8 * 24 * HOUR; await read();
  assert.equal(calls(), 3);
  assert.equal(archive.rows.get('k').verified, true, 'locked in once the week has passed');
  clock.t += 30 * 24 * HOUR; await read();
  assert.equal(calls(), 3, 'no provider call after it is verified');
});

test('the default window keeps the old rule: no recheck inside it', async () => {
  clock.t = ENDED + HOUR;
  const archive = memoryArchive();
  const { read, calls } = reader(archive, {});
  await read();
  clock.t = ENDED + PLAY_CORRECTION_WINDOW_MS - HOUR; await read();
  assert.equal(calls(), 1);
  clock.t = ENDED + PLAY_CORRECTION_WINDOW_MS + HOUR; await read();
  assert.equal(calls(), 2);
  assert.equal(archive.rows.get('k').verified, true);
});
