import assert from 'node:assert/strict';
import http from 'node:http';
import { gunzipSync } from 'node:zlib';
import { describe, it } from 'node:test';
import express from 'express';
import { getPlayerDataConfig } from '../../server/playerDataConfig.js';
import { createPlayerDataRouter, createPlayerDataService } from '../../server/playerDataHandlers.js';
import { createPlayerDataStore } from '../../server/playerDataStore.js';
import { createUpstreamClient, UpstreamUnavailableError } from '../../server/playerDataUpstream.js';

// The suite pins "now" to mid-season so the current season is 2025 and 2024 is
// a completed one, independent of the real clock.
const NOW = Date.UTC(2025, 9, 15);
const HOUR = 60 * 60 * 1000;

function clock(start = NOW) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

/**
 * A small fake ESPN: one player on SEA (ESPN team id 25), with games described
 * by { id, week, played, completed }. Records every URL it is asked for.
 */
function createFakeEspn({ games, failWhen = null, status = null, profiles = {} } = {}) {
  const calls = [];
  const state = { games };

  const statsFor = (eventId) => ({
    splits: { categories: [{ name: 'passing', stats: [{ name: 'passingYards', value: Number(eventId) }] }] },
  });

  function respond(url) {
    if (failWhen?.(url)) return { status: 500, body: {} };
    if (status?.(url)) return { status: status(url), body: {} };

    const profile = url.match(/\/athletes\/(\d+)\?lang/);
    if (profile) {
      const known = profiles[profile[1]];
      return known ? { body: { position: { abbreviation: known.position }, debutYear: known.debutYear } } : { status: 404, body: {} };
    }

    let match = url.match(/seasons\/(\d+)\/athletes\/(\d+)\/eventlog/);
    if (match) {
      return {
        body: {
          events: {
            items: state.games.map((g) => ({
              played: g.played !== false,
              event: { $ref: `http://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${g.id}?lang=en` },
              ...(g.played !== false
                ? { statistics: { $ref: `http://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${g.id}/competitions/${g.id}/competitors/25/roster/${match[2]}/statistics/0?lang=en&region=us` } }
                : {}),
            })),
          },
        },
      };
    }
    if (/\/teams\/25\?/.test(url)) return { body: { abbreviation: 'SEA' } };
    if (/teams\/sea\/schedule\?season=\d+&seasontype=2/.test(url)) {
      return {
        body: {
          events: state.games.map((g) => ({
            id: g.id,
            week: { number: g.week },
            competitions: [{
              status: { type: { completed: g.completed !== false } },
              competitors: [
                { homeAway: 'home', team: { abbreviation: 'SEA' }, score: { value: 24, displayValue: '24' } },
                { homeAway: 'away', team: { abbreviation: 'SF' }, score: { value: 17, displayValue: '17' } },
              ],
            }],
          })),
        },
      };
    }
    if (/teams\/sea\/schedule\?season=\d+&seasontype=3/.test(url)) return { body: { events: [] } };
    match = url.match(/events\/(\d+)\/competitions\/\d+\/competitors\/25\/roster\/\d+\/statistics\/0/);
    if (match) return { body: statsFor(match[1]) };
    if (/\/seasons\/\d+\/types\/2\/athletes\/\d+\/statistics\/0/.test(url)) return { body: { season: true, url } };
    if (/\/athletes\/\d+\/statistics\/0/.test(url)) {
      return { body: { splits: { categories: [{ name: 'general', stats: [{ name: 'passingYards', value: 1 }] }] } } };
    }
    return { status: 404, body: {} };
  }

  const fetchImpl = async (url) => {
    calls.push(url);
    const { status: code = 200, body } = respond(url);
    return {
      status: code,
      headers: new Map(),
      text: async () => JSON.stringify(body),
    };
  };

  return {
    fetchImpl,
    calls,
    state,
    count: (pattern) => calls.filter((u) => pattern.test(u)).length,
  };
}

function createHarness({ espn, config = {}, time = clock(), upstreamOptions = {} } = {}) {
  const fullConfig = { ...getPlayerDataConfig({ env: {} }), ...config };
  const store = createPlayerDataStore({ config: fullConfig, databasePath: ':memory:', now: time.now });
  const upstream = createUpstreamClient({
    fetchImpl: espn.fetchImpl,
    spacingMs: 0,
    sleep: async () => {},
    now: time.now,
    ...upstreamOptions,
  });
  const service = createPlayerDataService({ store, upstream, config: fullConfig, now: time.now });
  return { store, upstream, service, config: fullConfig, time };
}

const decode = (result) => JSON.parse(gunzipSync(result.body).toString('utf8'));

const THREE_GAMES = [
  { id: 101, week: 1 },
  { id: 102, week: 2 },
  { id: 104, week: 4 },
];

describe('player data cache: game logs', () => {
  it('fetches a completed season once, marks it final, and never asks ESPN again', async () => {
    const espn = createFakeEspn({ games: THREE_GAMES });
    const { service, store } = createHarness({ espn });

    const first = await service.getGameLog('555', 2024, 'sea');
    assert.equal(first.kind, 'ok');
    assert.equal(first.final, true);
    const callsAfterFirst = espn.calls.length;

    const games = decode(first);
    assert.deepEqual(games.map((g) => g.meta.week), [1, 2, 3, 4]);
    assert.equal(games[2].meta.isBye, true, 'week 3 is a synthetic BYE row');
    assert.equal(games[0].statsJson.splits.categories[0].stats[0].value, 101);
    assert.equal(games[0].meta.opponent, 'vs SF');
    assert.equal(games[0].meta.result, 'W');

    const second = await service.getGameLog('555', 2024, 'sea');
    assert.equal(second.kind, 'ok');
    assert.equal(espn.calls.length, callsAfterFirst, 'no further ESPN calls for a stored final season');
    assert.equal(store.getStats().rows, 1);
  });

  it('respects the live TTL and refreshes incrementally, fetching only new games', async () => {
    const espn = createFakeEspn({ games: [{ id: 101, week: 1 }, { id: 102, week: 2 }] });
    const time = clock();
    const { service } = createHarness({ espn, time });

    const first = await service.getGameLog('555', 2025, 'sea');
    assert.equal(first.final, false, 'the current season is never final');
    assert.equal(espn.count(/\/roster\//), 2);

    time.advance(HOUR / 2);
    await service.getGameLog('555', 2025, 'sea');
    assert.equal(espn.count(/eventlog/), 1, 'still fresh inside the TTL');

    espn.state.games.push({ id: 103, week: 3 });
    time.advance(HOUR * 2);
    const refreshed = await service.getGameLog('555', 2025, 'sea');
    assert.equal(espn.count(/eventlog/), 2);
    assert.equal(espn.count(/\/roster\//), 3, 'only the new game was fetched');
    assert.deepEqual(decode(refreshed).map((g) => g.eventId), ['101', '102', '103']);
  });

  it('refetches a game that was still in progress when it was stored', async () => {
    const espn = createFakeEspn({ games: [{ id: 101, week: 1, completed: false }] });
    const time = clock();
    const { service } = createHarness({ espn, time });

    await service.getGameLog('555', 2025, 'sea');
    espn.state.games = [{ id: 101, week: 1, completed: true }];
    time.advance(HOUR * 2);
    await service.getGameLog('555', 2025, 'sea');
    assert.equal(espn.count(/\/roster\//), 2, 'a live game is fetched again once it finishes');
  });

  it('finalizes a stored live season once the season has passed', async () => {
    const espn = createFakeEspn({ games: THREE_GAMES });
    const time = clock(Date.UTC(2026, 0, 20)); // still the 2025 league year
    const { service, store } = createHarness({ espn, time });

    const live = await service.getGameLog('555', 2025, 'sea');
    assert.equal(live.final, false);

    time.advance(1000 * 60 * 60 * 24 * 60); // into March 2026
    const finalized = await service.getGameLog('555', 2025, 'sea');
    assert.equal(finalized.final, true);
    assert.equal(store.get('gamelog_v11_555_2025').final, true);
  });

  it('coalesces concurrent requests into one ESPN waterfall', async () => {
    const espn = createFakeEspn({ games: THREE_GAMES });
    const { service } = createHarness({ espn });

    const results = await Promise.all([
      service.getGameLog('555', 2024, 'sea'),
      service.getGameLog('555', 2024, 'sea'),
      service.getGameLog('555', 2024, 'sea'),
    ]);
    assert.ok(results.every((r) => r.kind === 'ok'));
    assert.equal(espn.count(/eventlog/), 1);
    assert.equal(espn.count(/\/roster\//), 3);
  });

  it('does not store empty results and remembers them briefly', async () => {
    const espn = createFakeEspn({ games: [] });
    const time = clock();
    const { service, store } = createHarness({ espn, time });

    const first = await service.getGameLog('555', 2024, 'sea');
    assert.equal(first.kind, 'ok');
    assert.deepEqual(decode(first), []);
    assert.equal(store.getStats().rows, 0);

    const callsAfterFirst = espn.calls.length;
    await service.getGameLog('555', 2024, 'sea');
    assert.equal(espn.calls.length, callsAfterFirst, 'negative cache answers the repeat');

    time.advance(10 * 60 * 1000);
    await service.getGameLog('555', 2024, 'sea');
    assert.ok(espn.calls.length > callsAfterFirst, 'the negative cache expires');
  });

  it('returns partial data without storing it when a per-game call fails', async () => {
    const espn = createFakeEspn({
      games: THREE_GAMES,
      failWhen: (url) => /events\/102\/competitions/.test(url),
    });
    const { service, store } = createHarness({ espn });

    const result = await service.getGameLog('555', 2024, 'sea');
    assert.equal(result.kind, 'ok');
    assert.equal(result.incomplete, true);
    assert.equal(result.final, false);
    assert.equal(store.getStats().rows, 0, 'incomplete data is never persisted as final');
  });

  it('reports unavailable when ESPN fails and nothing is stored', async () => {
    const espn = createFakeEspn({ games: THREE_GAMES, failWhen: () => true });
    const { service } = createHarness({ espn });

    const result = await service.getGameLog('555', 2024, 'sea');
    assert.equal(result.kind, 'unavailable');
  });
});

describe('player data cache: stale fallback', () => {
  it('serves the expired row with stale=true while ESPN is failing', async () => {
    let failing = false;
    const espn = createFakeEspn({ games: THREE_GAMES, failWhen: () => failing });
    const time = clock();
    const { service } = createHarness({ espn, time });

    const fresh = await service.getGameLog('555', 2025, 'sea');
    assert.equal(fresh.stale, false);

    time.advance(HOUR * 3);
    failing = true;
    const result = await service.getGameLog('555', 2025, 'sea');
    assert.equal(result.kind, 'ok');
    assert.equal(result.stale, true);
    assert.equal(result.final, false);
    assert.deepEqual(decode(result).map((g) => g.eventId), decode(fresh).map((g) => g.eventId));
  });
});

describe('player data cache: season and career stats', () => {
  it('stores completed-season stats forever and treats a 404 as not found', async () => {
    const espn = createFakeEspn({
      status: (url) => (/seasons\/2003\/types/.test(url) ? 404 : null),
    });
    const { service } = createHarness({ espn });

    const stats = await service.getStats('555', 2024);
    assert.equal(stats.kind, 'ok');
    assert.equal(stats.final, true);
    await service.getStats('555', 2024);
    assert.equal(espn.count(/seasons\/2024\/types/), 1);

    const missing = await service.getStats('555', 2003);
    assert.equal(missing.kind, 'notFound');
    await service.getStats('555', 2003);
    assert.equal(espn.count(/seasons\/2003\/types/), 1, '404 is remembered briefly');
  });

  it('refreshes career stats on a 24 hour TTL and never marks them final', async () => {
    const espn = createFakeEspn({});
    const time = clock();
    const { service } = createHarness({ espn, time });

    const first = await service.getCareer('555');
    assert.equal(first.final, false);
    time.advance(HOUR * 5);
    await service.getCareer('555');
    assert.equal(espn.count(/athletes\/555\/statistics\/0/), 1);
    time.advance(HOUR * 20);
    await service.getCareer('555');
    assert.equal(espn.count(/athletes\/555\/statistics\/0/), 2);
  });

  it('repairs a zero career TFL from stored season stats instead of refetching them', async () => {
    const tflSeasons = { 2006: 4, 2007: 6 };
    const espn = createFakeEspn({});
    const baseFetch = espn.fetchImpl;
    espn.fetchImpl = async (url) => {
      const season = url.match(/seasons\/(\d+)\/types\/2/)?.[1];
      if (season) {
        espn.calls.push(url);
        const value = tflSeasons[season];
        return {
          status: value == null ? 404 : 200,
          headers: new Map(),
          text: async () => JSON.stringify({
            splits: { categories: [{ name: 'defensive', stats: [{ name: 'tacklesForLoss', value }] }] },
          }),
        };
      }
      if (/athletes\/777\/statistics\/0/.test(url)) {
        espn.calls.push(url);
        return {
          status: 200,
          headers: new Map(),
          text: async () => JSON.stringify({
            splits: { categories: [{ name: 'defensive', stats: [
              { name: 'tacklesForLoss', value: 0 },
              { name: 'sacks', value: 5 },
              { name: 'totalTackles', value: 90 },
            ] }] },
          }),
        };
      }
      return baseFetch(url);
    };
    const time = clock();
    const { service } = createHarness({ espn, time });

    const career = await service.getCareer('777');
    const tfl = decode(career).splits.categories[0].stats[0];
    assert.equal(tfl.value, 10);

    // 2006 through the current season: one ESPN call each on the first repair.
    assert.equal(espn.count(/seasons\/\d+\/types\/2/), 20);

    time.advance(HOUR * 30);
    await service.getCareer('777');
    assert.equal(
      espn.count(/seasons\/\d+\/types\/2/),
      21,
      'only the live season is refetched; stored and known-empty completed seasons are not',
    );
  });
});

describe('player data cache: career repair scope', () => {
  const careerBody = (tfl = 0) => JSON.stringify({
    splits: { categories: [{ name: 'defensive', stats: [
      { name: 'tacklesForLoss', value: tfl },
      { name: 'sacks', value: 5 },
      { name: 'totalTackles', value: 90 },
    ] }] },
  });

  function espnWithCareer(profiles) {
    const espn = createFakeEspn({ profiles });
    const base = espn.fetchImpl;
    espn.fetchImpl = async (url) => {
      if (/athletes\/\d+\/statistics\/0/.test(url)) {
        espn.calls.push(url);
        return { status: 200, headers: new Map(), text: async () => careerBody() };
      }
      return base(url);
    };
    return espn;
  }

  it('skips the per-season repair entirely for a non-defender', async () => {
    const espn = espnWithCareer({ 888: { position: 'TE', debutYear: 2013 } });
    const { service } = createHarness({ espn });

    const career = await service.getCareer('888');
    assert.equal(career.kind, 'ok');
    assert.equal(espn.count(/seasons\/\d+\/types\/2/), 0, 'no season lookups for a tight end');
    assert.equal(espn.count(/\/athletes\/888\?lang/), 1, 'one athlete lookup decides');
  });

  it('starts the repair at the defender\'s debut season instead of 2006', async () => {
    const espn = espnWithCareer({ 889: { position: 'LB', debutYear: 2022 } });
    const { service } = createHarness({ espn });

    await service.getCareer('889');
    // 2022 through the pinned current season (2025) is four seasons.
    assert.equal(espn.count(/seasons\/\d+\/types\/2/), 4);
    assert.equal(espn.count(/seasons\/2021\/types\/2/), 0);
  });

  it('falls back to the full repair when the athlete lookup fails', async () => {
    const espn = espnWithCareer({});
    const { service } = createHarness({ espn });

    await service.getCareer('890');
    assert.equal(espn.count(/seasons\/\d+\/types\/2/), 20, '2006 through 2025');
  });
});

describe('player data cache: shared team data', () => {
  it('fetches a team lookup and completed-season schedule once for all of its players', async () => {
    const espn = createFakeEspn({ games: THREE_GAMES });
    const { service } = createHarness({ espn });

    await service.getGameLog('555', 2024, 'sea');
    await service.getGameLog('556', 2024, 'sea');

    assert.equal(espn.count(/\/teams\/25\?/), 1);
    assert.equal(espn.count(/teams\/sea\/schedule\?season=2024&seasontype=2/), 1);
    assert.equal(espn.count(/teams\/sea\/schedule\?season=2024&seasontype=3/), 1);
    assert.equal(espn.count(/eventlog/), 2, 'each player still gets their own eventlog');
    assert.equal(espn.count(/\/roster\//), 6);
  });

  it('shares a live-season schedule only briefly, since scores change', async () => {
    const espn = createFakeEspn({ games: THREE_GAMES });
    const time = clock();
    const { service } = createHarness({ espn, time });

    await service.getGameLog('555', 2025, 'sea');
    await service.getGameLog('556', 2025, 'sea');
    assert.equal(espn.count(/schedule\?season=2025&seasontype=2/), 1);

    time.advance(10 * 60 * 1000);
    await service.getGameLog('557', 2025, 'sea');
    assert.equal(espn.count(/schedule\?season=2025&seasontype=2/), 2);
  });

  it('does not keep failed responses', async () => {
    let failing = true;
    const espn = createFakeEspn({ games: THREE_GAMES, failWhen: (url) => failing && /\/teams\/25\?/.test(url) });
    const { service } = createHarness({ espn });

    const first = await service.getGameLog('555', 2024, 'sea');
    assert.equal(first.incomplete, true, 'a failed team lookup marks the log incomplete');
    failing = false;
    const second = await service.getGameLog('556', 2024, 'sea');
    assert.equal(second.incomplete, false);
    assert.equal(espn.count(/\/teams\/25\?/), 2);
  });
});

describe('player data cache: upstream client', () => {
  function createSlowFetch() {
    const state = { active: 0, max: 0, starts: [] };
    const fetchImpl = async () => {
      state.active += 1;
      state.max = Math.max(state.max, state.active);
      await new Promise((resolve) => setImmediate(resolve));
      state.active -= 1;
      return { status: 200, headers: new Map(), text: async () => '{}' };
    };
    return { state, fetchImpl };
  }

  it('never exceeds the concurrency limit', async () => {
    const { state, fetchImpl } = createSlowFetch();
    const client = createUpstreamClient({ fetchImpl, concurrency: 2, spacingMs: 0, sleep: async () => {} });
    await Promise.all(Array.from({ length: 12 }, (_, i) => client.request(`https://x/${i}`)));
    assert.equal(state.max, 2);
  });

  it('spaces request starts by the configured gap', async () => {
    // Real timers: the gap is enforced with sleep(), and a fake clock cannot
    // model several requests sleeping at once.
    const starts = [];
    const client = createUpstreamClient({
      fetchImpl: async () => {
        starts.push(Date.now());
        return { status: 200, headers: new Map(), text: async () => '{}' };
      },
      concurrency: 4,
      spacingMs: 30,
    });
    await Promise.all(Array.from({ length: 5 }, (_, i) => client.request(`https://x/${i}`)));
    starts.sort((x, y) => x - y);
    for (let i = 1; i < starts.length; i += 1) {
      assert.ok(starts[i] - starts[i - 1] >= 25, `gap ${i} was ${starts[i] - starts[i - 1]}ms`);
    }
  });

  it('runs foreground requests ahead of queued background ones', async () => {
    const order = [];
    const client = createUpstreamClient({
      fetchImpl: async (url) => {
        order.push(url);
        await new Promise((resolve) => setImmediate(resolve));
        return { status: 200, headers: new Map(), text: async () => '{}' };
      },
      concurrency: 1,
      spacingMs: 0,
      sleep: async () => {},
    });

    const first = client.request('https://x/first');
    const background = [1, 2].map((n) => client.request(`https://x/background${n}`, { background: true }));
    const foreground = client.request('https://x/foreground');
    await Promise.all([first, ...background, foreground]);

    assert.deepEqual(order, [
      'https://x/first',
      'https://x/foreground',
      'https://x/background1',
      'https://x/background2',
    ]);
  });

  it('opens the breaker on a 429, stops calling ESPN, and recovers after the cooldown', async () => {
    const time = clock(0);
    let calls = 0;
    let status = 429;
    const client = createUpstreamClient({
      fetchImpl: async () => {
        calls += 1;
        return { status, headers: new Map(), text: async () => '{}' };
      },
      spacingMs: 0,
      breakerBaseCooldownMs: 60_000,
      now: time.now,
      sleep: async () => {},
    });

    const first = await client.request('https://x/1');
    assert.equal(first.ok, false);
    assert.equal(client.getStatus().open, true);

    await assert.rejects(client.request('https://x/2'), UpstreamUnavailableError);
    assert.equal(calls, 1, 'no ESPN call while the breaker is open');

    time.advance(61_000);
    status = 200;
    const recovered = await client.request('https://x/3');
    assert.equal(recovered.ok, true);
    assert.equal(client.getStatus().open, false);
  });

  it('opens the breaker after a run of server errors and doubles the cooldown on repeat trips', async () => {
    const time = clock(0);
    const client = createUpstreamClient({
      fetchImpl: async () => ({ status: 503, headers: new Map(), text: async () => '{}' }),
      spacingMs: 0,
      breakerFailureThreshold: 3,
      breakerBaseCooldownMs: 60_000,
      now: time.now,
      sleep: async () => {},
    });

    for (let i = 0; i < 3; i += 1) await client.request(`https://x/${i}`);
    assert.equal(client.getStatus().retryAt - time.now(), 60_000);

    time.advance(61_000);
    for (let i = 0; i < 3; i += 1) await client.request(`https://x/again${i}`);
    assert.equal(client.getStatus().retryAt - time.now(), 120_000);
  });

  it('keeps serving stored data while the breaker is open', async () => {
    let limited = false;
    const espn = createFakeEspn({ games: THREE_GAMES, status: () => (limited ? 429 : null) });
    const time = clock();
    const { service, upstream } = createHarness({ espn, time });

    await service.getGameLog('555', 2025, 'sea');
    time.advance(HOUR * 3);
    limited = true;

    const result = await service.getGameLog('555', 2025, 'sea');
    assert.equal(result.kind, 'ok');
    assert.equal(result.stale, true);
    assert.equal(upstream.getStatus().open, true);

    // While open, further requests are answered from the store with no ESPN calls.
    const callsBefore = espn.calls.length;
    const again = await service.getGameLog('555', 2025, 'sea');
    assert.equal(again.stale, true);
    assert.equal(espn.calls.length, callsBefore);
  });
});

describe('player data cache: store', () => {
  it('evicts the least recently read rows past the cap and keeps the newest write', () => {
    const time = clock();
    const store = createPlayerDataStore({
      config: { maxBytes: 300 },
      databasePath: ':memory:',
      now: time.now,
    });
    const body = (n) => Buffer.alloc(n, 1);

    store.put('a', body(100));
    time.advance(1000);
    store.put('b', body(100));
    time.advance(1000);
    store.put('c', body(100));
    time.advance(1000);
    assert.equal(store.getStats().rows, 3);

    // Reading "a" makes it the most recently read row.
    time.advance(2 * HOUR);
    assert.ok(store.get('a'));

    const evicted = store.put('d', body(100));
    assert.ok(evicted >= 1);
    assert.equal(store.get('b'), null, 'least recently read row goes first');
    assert.ok(store.get('a'));
    assert.ok(store.get('d'), 'the row just written is never evicted');
    assert.ok(store.getStats().bytes <= 300);
  });
});

describe('player data cache: schema upgrade', () => {
  it('adds columns introduced after a database was first created', async () => {
    const os = await import('node:os');
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { DatabaseSync } = await import('node:sqlite');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gridshift-player-data-test-'));
    try {
      const legacy = new DatabaseSync(path.join(dir, 'player-data.sqlite'));
      legacy.exec(`CREATE TABLE espn_cache (
        key TEXT PRIMARY KEY, body BLOB NOT NULL, fetched_at INTEGER NOT NULL,
        last_read_at INTEGER NOT NULL, size INTEGER NOT NULL, final INTEGER NOT NULL DEFAULT 0
      )`);
      legacy.close();

      const store = createPlayerDataStore({ config: { dataDir: dir, maxBytes: 1_000_000 } });
      store.put('k', Buffer.alloc(0), { missing: true });
      assert.equal(store.get('k').missing, true);
      store.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('player data cache: HTTP routes', () => {
  async function withServer(espn, run, harnessOptions = {}) {
    const harness = createHarness({ espn, ...harnessOptions });
    const app = express();
    app.use('/api/players', createPlayerDataRouter({ service: harness.service, config: harness.config }));
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/players`;
    try {
      await run({ base, ...harness });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      harness.store.close();
    }
  }

  it('serves a completed-season game log as cacheable gzip JSON', async () => {
    const espn = createFakeEspn({ games: THREE_GAMES });
    await withServer(espn, async ({ base }) => {
      const res = await fetch(`${base}/555/gamelog/2024?team=sea`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('cache-control'), /immutable/);
      assert.equal(res.headers.get('x-gridshift-stale'), null);
      assert.equal(res.headers.get('x-gridshift-incomplete'), null);
      const games = await res.json();
      assert.equal(games.length, 4);
    });
  });

  it('serves the live season with a short cache lifetime', async () => {
    const espn = createFakeEspn({ games: THREE_GAMES });
    await withServer(espn, async ({ base }) => {
      const res = await fetch(`${base}/555/gamelog/2025`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('cache-control'), /max-age=300/);
      assert.doesNotMatch(res.headers.get('cache-control'), /immutable/);
    });
  });

  it('serves identity encoding to a client that does not accept gzip', async () => {
    const espn = createFakeEspn({ games: THREE_GAMES });
    await withServer(espn, async ({ base }) => {
      const body = await new Promise((resolve, reject) => {
        http.get(`${base}/555/gamelog/2024`, { headers: { 'Accept-Encoding': 'identity' } }, (res) => {
          assert.equal(res.headers['content-encoding'], undefined);
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
        }).on('error', reject);
      });
      assert.equal(body.length, 4);
    });
  });

  it('marks partial data incomplete and uncacheable', async () => {
    const espn = createFakeEspn({
      games: THREE_GAMES,
      failWhen: (url) => /events\/102\/competitions/.test(url),
    });
    await withServer(espn, async ({ base, store }) => {
      const res = await fetch(`${base}/555/gamelog/2024`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-gridshift-incomplete'), '1');
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.equal(store.getStats().rows, 0);
    });
  });

  it('rejects malformed and unsupported requests with 400 and never calls ESPN', async () => {
    const espn = createFakeEspn({ games: THREE_GAMES });
    await withServer(espn, async ({ base }) => {
      const cases = [
        '/abc/stats/2024',
        '/555/stats/24',
        '/555/stats/1999', // before the configured minimum: browser falls back to ESPN
        '/555/stats/2099', // future season
        '/555/gamelog/2024?team=../etc',
        '/555/gamelog/2024?team=sea&team=kc',
        '/99999999999/career',
      ];
      for (const path of cases) {
        const res = await fetch(`${base}${path}`);
        assert.equal(res.status, 400, path);
        assert.equal(res.headers.get('cache-control'), 'no-store');
      }
      assert.equal(espn.calls.length, 0);
    });
  });

  it('answers 404 when ESPN has no stats and 503 when ESPN is unavailable', async () => {
    const espn = createFakeEspn({
      status: (url) => (/seasons\/2010\/types/.test(url) ? 404 : null),
      failWhen: (url) => /seasons\/2011\/types/.test(url),
    });
    await withServer(espn, async ({ base }) => {
      const missing = await fetch(`${base}/555/stats/2010`);
      assert.equal(missing.status, 404);
      const down = await fetch(`${base}/555/stats/2011`);
      assert.equal(down.status, 503);
      assert.equal(down.headers.get('cache-control'), 'no-store');
    });
  });
});
