import assert from 'node:assert/strict';
import test from 'node:test';
import { createBalldontlieGateway } from '../../server/balldontlieGateway.js';
import {
  createLiveGameSnapshotStore,
  getCanonicalLatestPlay,
} from '../../server/liveGameSnapshots.js';

const ENV = Object.freeze({
  GRIDSHIFT_BDL_API_KEY: 'server-key',
  GRIDSHIFT_BDL_TIER: 'goat',
  GRIDSHIFT_BDL_EFFECTIVE_MAX_REQ_PER_MIN: '600',
});

test('canonical latest play follows game progress instead of provider array order', () => {
  const latest = getCanonicalLatestPlay([
    { id: 'latest', period: 2, clock_display: '05:11', text: 'Latest snap.' },
    { id: 'older', period: 1, clock_display: '00:05', text: 'Older snap.' },
  ]);
  assert.equal(latest.id, 'latest');
});

test('all consumers share one canonical provider play request and freshness class', async () => {
  let requestCount = 0;
  let nowMs = Date.parse('2026-09-06T01:02:03.000Z');
  const gateway = createBalldontlieGateway({
    env: { ...ENV },
    now: () => nowMs,
    fetcher: async () => {
      requestCount += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: 'play-1', period: 1, clock_display: '09:58', text: 'Pass complete.' }],
          meta: { next_cursor: null },
        }),
      };
    },
  });
  const store = createLiveGameSnapshotStore({ gateway, refreshMs: 8_000 });

  const [scorecard, drilldown, fantasy] = await Promise.all([
    store.getPlays({ gameId: 7001, seasonType: 2 }),
    store.getPlays({ gameId: 7001, seasonType: 2 }),
    store.getPlays({ gameId: 7001, seasonType: 2 }),
  ]);

  assert.equal(requestCount, 1);
  assert.equal(scorecard.latestPlay.id, 'play-1');
  assert.deepEqual(drilldown.plays, scorecard.plays);
  assert.deepEqual(fantasy.plays, scorecard.plays);
  assert.equal(drilldown.cache.coalesced, true);
  assert.equal(fantasy.cache.coalesced, true);

  nowMs += 7_999;
  const cached = await store.getPlays({ gameId: 7001, seasonType: 2 });
  assert.equal(requestCount, 1);
  assert.equal(cached.cache.hit, true);
});
