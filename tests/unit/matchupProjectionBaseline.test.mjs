import test from 'node:test';
import assert from 'node:assert/strict';
import {
  baselineScope, captureMatchupProjectionBaseline, captureMatchupProjectionBaselines,
  getMatchupProjectionBaseline, getMatchupProjectionBaselines, selectMatchupProjectionBaselines,
  summarizeBdlProjection, summarizeExternalProjection, summarizeRecordedPregameProjection, clearMatchupProjectionBaselines, MATCHUP_PROJECTION_BASELINE_LIMIT, MATCHUP_PROJECTION_BASELINE_STORAGE_KEY,
} from '../../src/utils/matchupProjectionBaseline.js';

function storage() { const data = new Map(); return { get length() { return data.size; }, key: index => [...data.keys()][index] ?? null, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }; }
const base = (extra = {}) => ({ leagueId: 'L1', season: 2026, week: 2, playerId: 'P1', scoringSettings: { rec: 1, pass_yd: 0.04 }, projection: { projected: 12.4, projectedStats: { rec: 5 } }, scheduleEntry: { kickoff: '2026-09-20T12:00:00Z', completed: false }, nowMs: Date.parse('2026-09-19T12:00:00Z'), storage: storage(), ...extra });

test('latest pregame observation survives kickoff, re-opening and changing current projection', () => {
  const options = base();
  captureMatchupProjectionBaseline(options);
  options.projection.projectedStats.rec = 100;
  assert.equal(getMatchupProjectionBaseline(options, { storage: options.storage }).projection.projectedStats.rec, 5);
  options.projection = { projected: 13.1 };
  options.nowMs += 1000;
  captureMatchupProjectionBaseline(options);
  options.nowMs = Date.parse(options.scheduleEntry.kickoff);
  assert.equal(captureMatchupProjectionBaseline({ ...options, projection: { projected: 20 } }), null);
  assert.equal(getMatchupProjectionBaseline(options, { storage: options.storage }).projection.projected, 13.1);
  assert.equal(getMatchupProjectionBaseline({ ...options, playerId: 'unobserved' }, { storage: options.storage }), null);
});

test('zero is valid; null, non-finite score, missing kickoff/scope and started games are not captured', () => {
  assert.equal(captureMatchupProjectionBaseline(base({ projection: { projected: 0 } })).projection.projected, 0);
  for (const score of [null, undefined, '', NaN, Infinity]) {
    assert.equal(captureMatchupProjectionBaseline(base({ projection: { projected: score } })), null);
  }
  for (const change of [{ scheduleEntry: null }, { scheduleEntry: { kickoff: 'invalid' } }, { gameStarted: true }, { season: null }, { week: null }, { nowMs: NaN }, { scheduleEntry: { kickoff: '2026-09-20T12:00:00Z', status: 'live' } }]) {
    assert.equal(captureMatchupProjectionBaseline(base(change)), null);
  }
});

test('scoring fingerprints are stable and returned maps isolate every scope field', () => {
  const options = base({ scoringSettings: { rec: 1, positions: { TE: { rec: 2, rec_yd: 0.1 } } } });
  captureMatchupProjectionBaseline(options);
  const reordered = { ...options, season: '2026', scoringSettings: { positions: { TE: { rec_yd: 0.1, rec: 2 } }, rec: 1 } };
  assert.equal(getMatchupProjectionBaseline(reordered, { storage: options.storage }).projection.projected, 12.4);
  for (const change of [{ leagueId: 'L2' }, { season: 2025 }, { week: 3 }, { playerId: 'P2' }, { scoringSettings: { rec: 0.5 } }]) {
    assert.equal(getMatchupProjectionBaseline({ ...options, ...change }, { storage: options.storage }), null);
  }
  const all = getMatchupProjectionBaselines({ storage: options.storage });
  assert.deepEqual(Object.keys(selectMatchupProjectionBaselines(all, options)), ['P1']);
  assert.deepEqual(selectMatchupProjectionBaselines(all, { ...options, scoringSettings: { rec: 0.5 } }), {});
});

test('malformed persisted records cannot masquerade as pregame projections', () => {
  const options = base();
  const snapshot = captureMatchupProjectionBaseline(options);
  const key = `${MATCHUP_PROJECTION_BASELINE_STORAGE_KEY}${encodeURIComponent(baselineScope(options))}:${snapshot.capturedAt}`;
  for (const bad of [{ ...snapshot, projection: { projected: null } }, { ...snapshot, capturedAt: Date.parse(snapshot.kickoff) }, { ...snapshot, kickoff: 'invalid' }, { ...snapshot, playerId: 'different' }]) {
    options.storage.setItem(key, JSON.stringify(bad));
    assert.equal(getMatchupProjectionBaseline(options, { storage: options.storage }), null);
  }
  options.storage.setItem(key, '{bad');
  assert.deepEqual(getMatchupProjectionBaselines({ storage: options.storage }), {});
});

test('blocked reads and failed writes preserve bounded in-memory observations', () => {
  const blocked = { length: 0, key: () => null, getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
  clearMatchupProjectionBaselines({ storage: blocked });
  const options = base({ storage: blocked });
  captureMatchupProjectionBaseline(options);
  assert.equal(getMatchupProjectionBaseline(options, { storage: blocked }).projection.projected, 12.4);
  const noAccess = { get length() { throw new Error('blocked'); }, getItem: () => null };
  assert.equal(getMatchupProjectionBaseline(options, { storage: noAccess }).projection.projected, 12.4);
  captureMatchupProjectionBaselines({ ...options, players: Array.from({ length: MATCHUP_PROJECTION_BASELINE_LIMIT + 2 }, (_, index) => ({ id: `P${index}`, projection: options.projection, scheduleEntry: options.scheduleEntry })) });
  assert.equal(Object.keys(getMatchupProjectionBaselines({ storage: blocked })).length, MATCHUP_PROJECTION_BASELINE_LIMIT);
  assert.equal(getMatchupProjectionBaseline({ ...options, playerId: 'P0' }, { storage: blocked }), null);
  clearMatchupProjectionBaselines({ storage: blocked });
  assert.deepEqual(getMatchupProjectionBaselines({ storage: blocked }), {});
});

test('batch capture retains each player in its own storage record', () => {
  const options = base();
  let writes = 0;
  const wrapped = { ...options.storage, get length() { return options.storage.length; }, setItem: (...args) => { writes++; options.storage.setItem(...args); } };
  captureMatchupProjectionBaselines({ ...options, storage: wrapped, players: ['P1', 'P2'].map(id => ({ id, projection: options.projection, scheduleEntry: options.scheduleEntry })) });
  assert.equal(writes, 2);
  assert.equal(Object.keys(selectMatchupProjectionBaselines(getMatchupProjectionBaselines({ storage: wrapped }), options)).length, 2);
});

test('summarized header projections require complete BALLDONTLIE coverage', () => {
  const players = [{ id: 'P1', name: 'Provider Player' }, { id: 'P2', name: 'Fallback Player' }];
  const baselines = {
    P1: { projection: { projected: 12.4, factors: { source: 'balldontlie' } } },
    P2: { projection: { projected: 18.7, factors: { source: 'current-season' } } },
  };

  const partial = summarizeRecordedPregameProjection(players, baselines);
  assert.deepEqual(partial, { total: 12.4, projectedCount: 1, starterCount: 2, complete: false });
  assert.equal(summarizeRecordedPregameProjection(players, {
    ...baselines,
    P2: { projection: { projected: 18.7, factors: { source: 'balldontlie' } } },
  }).total, 31.1);
  assert.equal(summarizeRecordedPregameProjection(players, {
    P1: { projection: { projected: 12.4, factors: { source: 'current-season' } } },
    P2: { projection: { projected: 18.7, factors: { source: 'prior-season' } } },
  }), null);
});

test('summarizes the visible BDL player projections for a settled header', () => {
  const players = [
    { id: 'P1', name: 'Provider Player', projection: { projected: 12.4, factors: { source: 'balldontlie' } } },
    { id: 'P2', name: 'Fallback Player', projection: { projected: 18.7, factors: { source: 'current-season' } } },
  ];

  assert.equal(summarizeBdlProjection(players).total, 12.4);
  assert.equal(summarizeBdlProjection(players).complete, false);
  assert.equal(summarizeBdlProjection([
    ...players.slice(0, 1),
    { ...players[1], projection: { projected: 18.7, factors: { source: 'balldontlie' } } },
  ]).total, 31.1);
  assert.equal(summarizeBdlProjection([
    ...players.map((player) => ({ ...player, projection: { ...player.projection, factors: { source: 'prior-season' } } })),
  ]), null);
});

test('summarizes mixed BDL and Sleeper external projections for a settled header', () => {
  assert.deepEqual(summarizeExternalProjection([
    { id: 'P1', name: 'BDL Player', projection: { projected: 12.4, factors: { source: 'balldontlie' } } },
    { id: 'P2', name: 'Sleeper Player', projection: { projected: 9.0, factors: { source: 'sleeper' } } },
  ]), { total: 21.4, projectedCount: 2, starterCount: 2, complete: true });
});


test('interleaved tabs retain unrelated players and newer observations', () => {
  const options = base();
  captureMatchupProjectionBaseline(options);
  captureMatchupProjectionBaseline({ ...options, playerId: 'P2', nowMs: options.nowMs + 200 });
  captureMatchupProjectionBaseline({ ...options, projection: { projected: 18 }, nowMs: options.nowMs + 100 });
  // A delayed older observation must not overwrite the later projection.
  captureMatchupProjectionBaseline({ ...options, projection: { projected: 9 }, nowMs: options.nowMs + 50 });
  assert.equal(getMatchupProjectionBaseline(options, { storage: options.storage }).projection.projected, 18);
  assert.ok(getMatchupProjectionBaseline({ ...options, playerId: 'P2' }, { storage: options.storage }));
  assert.equal(options.storage.length, 2);
});
