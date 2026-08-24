import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getLiveMatchups } from '../../src/api/sleeperApi.js';
import {
  STARTER_GAME_STATE,
  getFallbackRemainingGameFraction,
  getMatchupCustomPoints,
  getOfficialMatchupRowPoints,
  hasReconciledMatchup,
  isCompleteScheduleWeek,
  resolveStarterGameState,
} from '../../src/utils/liveScoringFeed.js';

describe('live starter game-state resolution', () => {
  it('distinguishes scheduled, live, and officially final games', () => {
    assert.deepEqual(
      resolveStarterGameState({ game: { status: 'Scheduled' } }),
      { state: STARTER_GAME_STATE.SCHEDULED, remainingFraction: 1, settled: false },
    );
    assert.deepEqual(
      resolveStarterGameState({ game: { status: '2nd Qtr' } }),
      { state: STARTER_GAME_STATE.LIVE, remainingFraction: null, settled: false },
    );
    assert.deepEqual(
      resolveStarterGameState({ game: { status: 'Final/OT' } }),
      { state: STARTER_GAME_STATE.OFFICIAL_FINAL, remainingFraction: 0, settled: true },
    );
  });

  it('accepts an explicit completed schedule entry as official finality', () => {
    assert.deepEqual(
      resolveStarterGameState({
        scheduleEntry: { completed: true, ptsFor: 31, ptsAgainst: 24 },
        hasScheduleForWeek: true,
        hasGameThisWeek: true,
      }),
      { state: STARTER_GAME_STATE.OFFICIAL_FINAL, remainingFraction: 0, settled: true },
    );
  });

  it('does not infer finality from a zero clock or schedule scores', () => {
    assert.deepEqual(
      resolveStarterGameState({ game: { status: '4th Qtr', period: 4, time: '0:00' } }),
      { state: STARTER_GAME_STATE.LIVE, remainingFraction: null, settled: false },
    );
    assert.deepEqual(
      resolveStarterGameState({
        scheduleEntry: { ptsFor: 31, ptsAgainst: 24 },
        hasScheduleForWeek: true,
        hasGameThisWeek: true,
      }),
      { state: STARTER_GAME_STATE.SCHEDULED, remainingFraction: 1, settled: false },
    );
  });

  it('requires caller-confirmed schedule completeness to confirm a bye', () => {
    assert.deepEqual(
      resolveStarterGameState({
        hasScheduleForWeek: true,
        hasGameThisWeek: false,
      }),
      { state: STARTER_GAME_STATE.CONFIRMED_BYE, remainingFraction: 0, settled: true },
    );
    assert.deepEqual(
      resolveStarterGameState({
        hasScheduleForWeek: false,
        hasGameThisWeek: false,
      }),
      { state: STARTER_GAME_STATE.UNRESOLVED, remainingFraction: 1, settled: false },
    );
    assert.deepEqual(
      resolveStarterGameState(),
      { state: STARTER_GAME_STATE.UNRESOLVED, remainingFraction: 1, settled: false },
    );
  });

  it('keeps unknown provider states unresolved', () => {
    assert.deepEqual(
      resolveStarterGameState({
        game: { status: 'Delayed' },
        scheduleEntry: { date: '2025-09-07' },
        hasScheduleForWeek: true,
        hasGameThisWeek: true,
      }),
      { state: STARTER_GAME_STATE.UNRESOLVED, remainingFraction: 1, settled: false },
    );
  });
});

describe('schedule and final matchup evidence', () => {
  it('accepts only a complete reciprocal NFL week for bye confirmation', () => {
    const teams = Array.from({ length: 26 }, (_, index) => `T${index + 1}`);
    const complete = Object.fromEntries(teams.map((team, index) => {
      const opponent = index % 2 === 0 ? teams[index + 1] : teams[index - 1];
      return [team, { opp: opponent }];
    }));

    assert.equal(isCompleteScheduleWeek(complete), true);
    assert.equal(isCompleteScheduleWeek(Object.fromEntries(Object.entries(complete).slice(0, 24))), false);
    assert.equal(isCompleteScheduleWeek({ ...complete, T1: { opp: 'MISSING' } }), false);
  });

  it('uses kickoff or observed points only as a conservative progress fallback', () => {
    const kickoff = Date.parse('2025-10-05T17:00:00.000Z');
    assert.equal(getFallbackRemainingGameFraction({
      scheduleEntry: { kickoff: '2025-10-05T17:00:00.000Z' },
      now: kickoff - 1,
    }), 1);
    assert.equal(getFallbackRemainingGameFraction({
      scheduleEntry: { kickoff: '2025-10-05T17:00:00.000Z' },
      now: kickoff + (2 * 60 * 60 * 1000),
    }), 0.5);
    assert.equal(getFallbackRemainingGameFraction({
      scheduleEntry: null,
      currentPoints: 8,
    }), 0.5);
    assert.equal(getFallbackRemainingGameFraction({
      scheduleEntry: null,
      currentPoints: 0,
    }), 1);
  });

  it('requires both authoritative totals and every starter point before settlement', () => {
    const rows = [
      {
        matchup_id: 4,
        points: 101.2,
        custom_points: -0.2,
        starters: ['a', 'b'],
        players_points: { a: 60, b: 41.2 },
      },
      {
        matchup_id: 4,
        points: 99,
        starters: ['c', 'd'],
        players_points: { c: 49, d: 50 },
      },
    ];

    assert.equal(getMatchupCustomPoints(rows[0]), -0.2);
    assert.equal(getOfficialMatchupRowPoints(rows[0]), 101);
    assert.equal(hasReconciledMatchup(rows, 4), true);
    assert.equal(hasReconciledMatchup([
      rows[0],
      { ...rows[1], players_points: { c: 49 } },
    ], 4), false);
    assert.equal(hasReconciledMatchup([
      rows[0],
      { ...rows[1], players_points: { c: 49, d: null } },
    ], 4), false);
  });
});

describe('live Sleeper matchup refresh', () => {
  it('uses no-store and a unique cache-busted URL', async () => {
    const originalFetch = globalThis.fetch;
    const requests = [];
    globalThis.fetch = async (url, options) => {
      requests.push({ url: String(url), options });
      return {
        ok: true,
        json: async () => [],
      };
    };

    try {
      await getLiveMatchups('12345', 17);
      await getLiveMatchups('12345', 17);
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(requests.length, 2);
    assert.match(
      requests[0].url,
      /^https:\/\/api\.sleeper\.app\/v1\/league\/12345\/matchups\/17\?_gridshift=\d+-\d+$/,
    );
    assert.deepEqual(requests[0].options, { cache: 'no-store' });
    assert.notEqual(requests[0].url, requests[1].url);
  });
});
