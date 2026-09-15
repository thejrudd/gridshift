import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createReconciliationState,
  computeStatSurplus,
  playFitsStatLine,
  reconcileLivePlays,
  sumDisplayedPoints,
} from '../../src/utils/liveReconciliation.js';

const SCORING = {
  pass_yd: 0.04,
  pass_td: 4,
  pass_int: -2,
  rush_yd: 0.1,
  rush_td: 6,
  rec: 1,
  rec_yd: 0.1,
  rec_td: 6,
  fum_lost: -2,
  fgm: 3,
  xpm: 1,
};

const POSITIONS = new Map([['wr1', 'WR'], ['rb1', 'RB'], ['qb1', 'QB']]);

let playSeq = 0;

function makePlay({ playerId = 'wr1', stats, pts, order, at = null, position = 'WR' }) {
  playSeq += 1;
  const id = `play-${playSeq}-${playerId}`;
  return {
    id,
    sharedPlayId: `snap-${playSeq}`,
    playerId,
    position,
    kind: 'pass',
    mechanism: null,
    desc: 'test play',
    pts,
    stats,
    at: at ?? order,
    timelineAt: at ?? order,
    progress: 0.5,
    order,
    gameId: 'game-1',
    source: 'play',
    estimated: true,
  };
}

function step(state, overrides) {
  return reconcileLivePlays(state, {
    scoringSettings: SCORING,
    positionsById: POSITIONS,
    ...overrides,
  });
}

test('every play is pending, and displayed, before Sleeper knows the player', () => {
  const plays = [
    makePlay({ stats: { rec: 1, rec_yd: 8 }, pts: 1.8, order: 10 }),
    makePlay({ stats: { rec: 1, rec_yd: 12 }, pts: 2.2, order: 20 }),
  ];
  const state = step(createReconciliationState(), { playEvents: plays, now: 100 });
  const player = state.players.get('wr1');

  assert.equal(player.sleeperPoints, null);
  assert.equal(player.adjustment, 0);
  assert.deepEqual(player.plays.map((play) => play.status), ['pending', 'pending']);
  assert.deepEqual(player.plays.map((play) => play.confirmedBy), [null, null]);
  assert.equal(player.displayedPoints, 4);
  assert.equal(player.plays.reduce((total, play) => total + play.displayPts, 0), 4);
});

test('points-provisional confirmation stops the displayed total double counting', () => {
  const plays = [
    makePlay({ stats: { rec: 1, rec_yd: 8 }, pts: 1.8, order: 10 }),
    makePlay({ stats: { rec: 1, rec_yd: 12 }, pts: 2.2, order: 20 }),
  ];
  // Sleeper's points cover the first catch only; its stat line is absent.
  const state = step(createReconciliationState(), {
    playEvents: plays,
    sleeperPointsById: { wr1: 1.8 },
    now: 100,
  });
  const player = state.players.get('wr1');

  assert.deepEqual(player.plays.map((play) => play.status), ['confirmed', 'pending']);
  assert.equal(player.plays[0].confirmedBy, 'points');
  assert.equal(player.pendingPoints, 2.2);
  assert.equal(player.displayedPoints, 4);
  assert.equal(player.adjustment, 0);
});

test('a turnover Sleeper has not taken away yet stays pending', () => {
  const plays = [
    makePlay({ playerId: 'qb1', position: 'QB', stats: { rec: 1, rec_yd: 8 }, pts: 1.8, order: 10 }),
    makePlay({ playerId: 'qb1', position: 'QB', stats: { pass_int: 1 }, pts: -2, order: 20 }),
  ];
  const state = step(createReconciliationState(), {
    playEvents: plays,
    sleeperPointsById: { qb1: 1.8 },
    now: 100,
  });
  const player = state.players.get('qb1');

  assert.deepEqual(player.plays.map((play) => play.status), ['confirmed', 'pending']);
  // The interception is shown against the total straight away rather than
  // waiting for a stat line; Sleeper simply has not caught up to it.
  assert.equal(player.displayedPoints, -0.2);
});

test('a pending turnover confirms once Sleeper drops the points', () => {
  const plays = [
    makePlay({ playerId: 'qb1', position: 'QB', stats: { rec: 1, rec_yd: 8 }, pts: 1.8, order: 10 }),
    makePlay({ playerId: 'qb1', position: 'QB', stats: { pass_int: 1 }, pts: -2, order: 20 }),
  ];
  let state = step(createReconciliationState(), {
    playEvents: plays,
    sleeperPointsById: { qb1: 1.8 },
    now: 100,
  });
  state = step(state, { playEvents: [], sleeperPointsById: { qb1: -0.2 }, now: 200 });
  const player = state.players.get('qb1');

  assert.deepEqual(player.plays.map((play) => play.status), ['confirmed', 'confirmed']);
  assert.equal(player.plays[1].confirmedBy, 'points');
  assert.equal(player.pendingPoints, 0);
  assert.equal(player.displayedPoints, -0.2);
  assert.equal(player.adjustment, 0);
});

test('a touchdown and the interception after it confirm together on the net change', () => {
  const plays = [
    makePlay({ playerId: 'qb1', position: 'QB', stats: { pass_yd: 20, pass_td: 1 }, pts: 6, order: 10 }),
    makePlay({ playerId: 'qb1', position: 'QB', stats: { pass_int: 1 }, pts: -2, order: 20 }),
  ];
  // The touchdown alone overshoots the +4 Sleeper moved; the pair does not.
  const confirmed = step(createReconciliationState(), {
    playEvents: plays,
    sleeperPointsById: { qb1: 4 },
    now: 100,
  }).players.get('qb1');

  assert.deepEqual(confirmed.plays.map((play) => play.status), ['confirmed', 'confirmed']);
  assert.equal(confirmed.displayedPoints, 4);

  // With no movement at all, neither play is Sleeper's yet.
  const pending = step(createReconciliationState(), {
    playEvents: plays,
    sleeperPointsById: { qb1: 0 },
    now: 100,
  }).players.get('qb1');

  assert.deepEqual(pending.plays.map((play) => play.status), ['pending', 'pending']);
  assert.equal(pending.displayedPoints, 4);
});

test('a scoreless play does not sit pending forever', () => {
  const plays = [makePlay({ stats: { rec: 0, rec_yd: 0, pass_att: 1 }, pts: 0, order: 10 })];
  const state = step(createReconciliationState(), {
    playEvents: plays,
    sleeperPointsById: { wr1: 0 },
    now: 100,
  });

  assert.equal(state.players.get('wr1').plays[0].status, 'confirmed');
  assert.equal(state.players.get('wr1').displayedPoints, 0);
});

test('a stale stat line is ignored for confirmation', () => {
  const plays = [makePlay({ stats: { rec: 1, rec_yd: 8 }, pts: 1.8, order: 10 })];
  const state = step(createReconciliationState(), {
    playEvents: plays,
    sleeperPointsById: { wr1: 0 },
    sleeperStatsById: { wr1: { rec: 1, rec_yd: 8 } },
    sleeperStatsFetchedAt: 0,
    now: 200000,
  });

  // Points are zero, so only a fresh stat line could have confirmed this.
  assert.equal(state.players.get('wr1').plays[0].status, 'pending');
});

test('a newer play confirms out of order when the older one cannot be satisfied', () => {
  // Worth more than the points tolerance, so only a stat line could confirm it.
  const rush = makePlay({ stats: { rush_att: 1, rush_yd: 15 }, pts: 1.5, order: 10 });
  const caught = makePlay({ stats: { rec: 1, rec_yd: 20 }, pts: 3, order: 20 });
  const state = step(createReconciliationState(), {
    playEvents: [rush, caught],
    sleeperPointsById: { wr1: 3 },
    // Sleeper has posted the catch but not the carry.
    sleeperStatsById: { wr1: { rec: 1, rec_yd: 20 } },
    sleeperStatsFetchedAt: 1000,
    now: 2000,
  });
  const player = state.players.get('wr1');

  assert.deepEqual(player.plays.map((play) => [play.order, play.status, play.confirmedBy]), [
    [10, 'pending', null],
    [20, 'confirmed', 'stats'],
  ]);
  assert.equal(player.displayedPoints, 4.5);
});

test('yardage confirms within 3, counting stats must be exact', () => {
  const play = { stats: { rec: 1, rec_yd: 12 } };
  assert.equal(playFitsStatLine(play, { rec: 1, rec_yd: 9 }, {}), true);
  assert.equal(playFitsStatLine(play, { rec: 1, rec_yd: 8 }, {}), false);
  assert.equal(playFitsStatLine(play, { rec: 0, rec_yd: 40 }, {}), false);
  // The cumulative of already-confirmed plays is what the line must clear.
  assert.equal(playFitsStatLine(play, { rec: 2, rec_yd: 24 }, { rec: 1, rec_yd: 12 }), true);
  assert.equal(playFitsStatLine(play, { rec: 1, rec_yd: 24 }, { rec: 1, rec_yd: 12 }), false);
  // Nothing in PLAY_MATCH_STATS to check against is not a confirmation.
  assert.equal(playFitsStatLine({ stats: { idp_sack: 1 } }, { idp_sack: 1 }, {}), false);
});

test('the residual is pinned to the latest confirmed play and recomputed each step', () => {
  const first = makePlay({ stats: { rec: 1, rec_yd: 8 }, pts: 1.8, order: 10 });
  const second = makePlay({ stats: { rec: 1, rec_yd: 12 }, pts: 2.2, order: 20 });
  let state = step(createReconciliationState(), {
    playEvents: [first, second],
    // Sleeper scores the same two catches 0.3 higher than the parser did.
    sleeperPointsById: { wr1: 4.3 },
    now: 100,
  });
  let player = state.players.get('wr1');

  assert.deepEqual(player.plays.map((play) => play.status), ['confirmed', 'confirmed']);
  assert.deepEqual(player.plays.map((play) => play.adjustment), [0, 0.3]);
  assert.deepEqual(player.plays.map((play) => play.displayPts), [1.8, 2.5]);
  assert.deepEqual(player.plays.map((play) => play.pts), [1.8, 2.2], 'pts was rewritten');
  assert.equal(player.adjustment, 0.3);
  assert.equal(player.displayedPoints, 4.3);

  // A third play lands and Sleeper catches up: the residual moves to it.
  const third = makePlay({ stats: { rec: 1, rec_yd: 30, rec_td: 1 }, pts: 10, order: 30 });
  state = step(state, {
    playEvents: [third],
    sleeperPointsById: { wr1: 14.5 },
    now: 200,
  });
  player = state.players.get('wr1');

  assert.deepEqual(player.plays.map((play) => play.adjustment), [0, 0, 0.5]);
  assert.equal(player.adjustment, 0.5);
  assert.equal(player.displayedPoints, 14.5);
  assert.equal(
    player.plays.reduce((total, play) => total + play.displayPts, 0),
    14.5,
  );
});

test('a stat correction produces a negative residual', () => {
  const play = makePlay({ stats: { rec: 1, rec_yd: 20 }, pts: 3, order: 10 });
  let state = step(createReconciliationState(), {
    playEvents: [play],
    sleeperPointsById: { wr1: 3 },
    now: 100,
  });
  assert.equal(state.players.get('wr1').plays[0].status, 'confirmed');

  // The catch is later ruled a 12-yard gain; Sleeper drops the player's total.
  state = step(state, { playEvents: [], sleeperPointsById: { wr1: 2.2 }, now: 200 });
  const player = state.players.get('wr1');

  assert.equal(player.adjustment, -0.8);
  assert.equal(player.plays[0].adjustment, -0.8);
  assert.equal(player.plays[0].displayPts, 2.2);
  assert.equal(player.displayedPoints, 2.2);
});

test('an unexplained stat line becomes a row only after the grace period', () => {
  const inputs = {
    playEvents: [],
    sleeperPointsById: { wr1: 5 },
    sleeperStatsById: { wr1: { rec: 2, rec_yd: 30 } },
  };
  let state = step(createReconciliationState(), { ...inputs, sleeperStatsFetchedAt: 1000, now: 1500 });
  assert.equal(state.players.get('wr1').fallbackEvents.length, 0, 'emitted on first sight');

  // The same fetch seen again is not a second observation.
  state = step(state, { ...inputs, sleeperStatsFetchedAt: 1000, now: 20000 });
  assert.equal(state.players.get('wr1').fallbackEvents.length, 0);

  // A second fetch, but inside the grace window.
  state = step(state, { ...inputs, sleeperStatsFetchedAt: 20000, now: 20500 });
  assert.equal(state.players.get('wr1').fallbackEvents.length, 0);

  state = step(state, { ...inputs, sleeperStatsFetchedAt: 34000, now: 34500 });
  const [row] = state.players.get('wr1').fallbackEvents;
  assert.equal(row.id, 'stat-update-wr1-1');
  assert.equal(row.source, 'stat-update');
  assert.equal(row.estimated, false);
  assert.equal(row.status, 'confirmed');
  assert.equal(row.adjustment, 0);
  assert.deepEqual(row.stats, { rec: 2, rec_yd: 30 });
  assert.equal(row.pts, 5);
  assert.equal(row.displayPts, 5);
  assert.equal(row.at, 34500);
  assert.ok(row.desc && row.desc !== '');
  assert.equal(row.kind, 'pass');
  // The row explains the whole stat line, so nothing is left over.
  assert.equal(state.players.get('wr1').adjustment, 0);
  assert.equal(state.players.get('wr1').displayedPoints, 5);
});

test('no fallback row when plays already explain the stat line', () => {
  const plays = [makePlay({ stats: { rec: 2, rec_yd: 30 }, pts: 5, order: 10 })];
  const inputs = {
    playEvents: plays,
    sleeperPointsById: { wr1: 5 },
    sleeperStatsById: { wr1: { rec: 2, rec_yd: 30 } },
  };
  let state = step(createReconciliationState(), { ...inputs, sleeperStatsFetchedAt: 1000, now: 1500 });
  state = step(state, { ...inputs, playEvents: [], sleeperStatsFetchedAt: 60000, now: 60500 });

  assert.equal(state.players.get('wr1').fallbackEvents.length, 0);
  assert.equal(state.players.get('wr1').plays[0].status, 'confirmed');
});

test('a play arriving late retires the fallback row it duplicates', () => {
  const inputs = {
    playEvents: [],
    sleeperPointsById: { wr1: 5 },
    sleeperStatsById: { wr1: { rec: 2, rec_yd: 30 } },
  };
  let state = step(createReconciliationState(), { ...inputs, sleeperStatsFetchedAt: 1000, now: 1500 });
  state = step(state, { ...inputs, sleeperStatsFetchedAt: 34000, now: 34500 });
  assert.equal(state.players.get('wr1').fallbackEvents.length, 1);

  const late = makePlay({ stats: { rec: 2, rec_yd: 30 }, pts: 5, order: 10 });
  state = step(state, {
    ...inputs,
    playEvents: [late],
    sleeperStatsFetchedAt: 64000,
    now: 64500,
  });
  const player = state.players.get('wr1');

  assert.equal(player.fallbackEvents.length, 0);
  assert.equal(player.plays.length, 1);
  assert.equal(player.plays[0].status, 'confirmed');
  assert.equal(player.displayedPoints, 5);
  assert.equal(state.feedEvents.filter((event) => event.source === 'stat-update').length, 0);
});

/** Runs the two stat-line fetches a fallback row needs before it is emitted. */
function emitFallbackRow({ stats, points }) {
  const inputs = {
    playEvents: [],
    sleeperPointsById: { wr1: points },
    sleeperStatsById: { wr1: stats },
  };
  let state = step(createReconciliationState(), { ...inputs, sleeperStatsFetchedAt: 1000, now: 1500 });
  state = step(state, { ...inputs, sleeperStatsFetchedAt: 34000, now: 34500 });
  assert.equal(state.players.get('wr1').fallbackEvents.length, 1, 'setup did not emit a row');
  return state;
}

test('two plays together retire the row that stood in for them', () => {
  const line = { rec: 2, rec_yd: 30 };
  let state = emitFallbackRow({ stats: line, points: 5 });

  const first = makePlay({ stats: { rec: 1, rec_yd: 15 }, pts: 2.5, order: 10 });
  state = step(state, {
    playEvents: [first],
    sleeperPointsById: { wr1: 5 },
    sleeperStatsById: { wr1: line },
    sleeperStatsFetchedAt: 64000,
    now: 64500,
  });
  let player = state.players.get('wr1');

  // Half the row is now the play's; the row keeps only what is left.
  assert.equal(player.fallbackEvents.length, 1);
  assert.deepEqual(player.fallbackEvents[0].stats, { rec: 1, rec_yd: 15 });
  assert.equal(player.fallbackEvents[0].pts, 2.5);
  assert.equal(player.plays[0].status, 'confirmed');
  assert.equal(player.displayedPoints, 5);

  const second = makePlay({ stats: { rec: 1, rec_yd: 15 }, pts: 2.5, order: 20 });
  state = step(state, {
    playEvents: [second],
    sleeperPointsById: { wr1: 5 },
    sleeperStatsById: { wr1: line },
    sleeperStatsFetchedAt: 94000,
    now: 94500,
  });
  player = state.players.get('wr1');

  assert.equal(player.fallbackEvents.length, 0, 'the row outlived the plays that explain it');
  assert.ok(player.plays.every((play) => play.status === 'confirmed'));
  assert.equal(player.displayedPoints, 5);
  assert.equal(
    player.plays.reduce((total, play) => total + play.displayPts, 0),
    5,
    'displayed total double counted the retired row',
  );
});

test('a row is consumed play by play and only then dropped', () => {
  const line = { rec: 3, rec_yd: 30 };
  let state = emitFallbackRow({ stats: line, points: 6 });
  const expected = [
    { rec: 2, rec_yd: 20 },
    { rec: 1, rec_yd: 10 },
    null,
  ];

  expected.forEach((remaining, index) => {
    state = step(state, {
      playEvents: [makePlay({ stats: { rec: 1, rec_yd: 10 }, pts: 2, order: 10 + index })],
      sleeperPointsById: { wr1: 6 },
      sleeperStatsById: { wr1: line },
      sleeperStatsFetchedAt: 64000 + index * 30000,
      now: 64500 + index * 30000,
    });
    const rows = state.players.get('wr1').fallbackEvents;
    if (remaining) {
      assert.equal(rows.length, 1);
      assert.deepEqual(rows[0].stats, remaining);
      assert.equal(rows[0].pts, 2 * (2 - index));
      assert.ok(rows[0].desc, 'a shrunken row lost its description');
    } else {
      assert.equal(rows.length, 0);
    }
    assert.equal(state.players.get('wr1').displayedPoints, 6);
  });

  assert.ok(state.players.get('wr1').plays.every((play) => play.status === 'confirmed'));
});

test('a play bigger than what is left of a row drops the row outright', () => {
  let state = emitFallbackRow({ stats: { rec: 1, rec_yd: 15 }, points: 2.5 });

  const late = makePlay({ stats: { rec: 2, rec_yd: 40 }, pts: 6, order: 10 });
  state = step(state, {
    playEvents: [late],
    sleeperPointsById: { wr1: 6 },
    sleeperStatsById: { wr1: { rec: 2, rec_yd: 40 } },
    sleeperStatsFetchedAt: 64000,
    now: 64500,
  });
  const player = state.players.get('wr1');

  assert.equal(player.fallbackEvents.length, 0);
  assert.equal(player.plays[0].status, 'confirmed');
  assert.equal(player.plays[0].confirmedBy, 'stats');
  assert.equal(player.displayedPoints, 6);
  assert.equal(player.plays[0].displayPts, 6);
});

test('a shrunken row still carries the residual when no play is confirmed yet', () => {
  // Sleeper scores this line 0.4 above the parser.
  let state = emitFallbackRow({ stats: { rec: 2, rec_yd: 30 }, points: 5.4 });
  assert.equal(state.players.get('wr1').fallbackEvents[0].displayPts, 5.4);

  // A touchdown catch lands: it explains part of the row, but is worth far
  // more than the points Sleeper has left unaccounted for, so it stays pending.
  const td = makePlay({ stats: { rec: 1, rec_yd: 15, rec_td: 1 }, pts: 8.5, order: 10 });
  state = step(state, {
    playEvents: [td],
    sleeperPointsById: { wr1: 5.4 },
    now: 64500,
  });
  const player = state.players.get('wr1');

  assert.equal(player.plays[0].status, 'pending');
  assert.deepEqual(player.fallbackEvents[0].stats, { rec: 1, rec_yd: 15 });
  assert.equal(player.fallbackEvents[0].pts, 2.5);
  assert.equal(player.fallbackEvents[0].adjustment, 2.9);
  assert.equal(player.fallbackEvents[0].displayPts, 5.4);
  assert.equal(player.displayedPoints, 13.9);
});

test('a surplus that disappears never becomes a row', () => {
  const inputs = {
    playEvents: [],
    sleeperPointsById: { wr1: 5 },
    sleeperStatsById: { wr1: { rec: 2, rec_yd: 30 } },
  };
  let state = step(createReconciliationState(), { ...inputs, sleeperStatsFetchedAt: 1000, now: 1500 });
  // The plays land before the second observation, so the watch resets.
  state = step(state, {
    playEvents: [makePlay({ stats: { rec: 2, rec_yd: 30 }, pts: 5, order: 10 })],
    sleeperPointsById: { wr1: 5 },
    sleeperStatsById: { wr1: { rec: 2, rec_yd: 30 } },
    sleeperStatsFetchedAt: 34000,
    now: 34500,
  });
  assert.equal(state.players.get('wr1').fallbackEvents.length, 0);
  assert.equal(state.surplusWatch.size, 0);
});

test('a yardage-only gap inside tolerance is not an unexplained stat line', () => {
  assert.deepEqual(computeStatSurplus({ rec: 1, rec_yd: 14 }, { rec: 1, rec_yd: 12 }), {});
  assert.deepEqual(computeStatSurplus({ rec: 1, rec_yd: 20 }, { rec: 1, rec_yd: 12 }), { rec_yd: 8 });
  assert.deepEqual(computeStatSurplus({ rec: 2, rec_yd: 12 }, { rec: 1, rec_yd: 12 }), { rec: 1 });
});

test('replaying the same poll changes nothing', () => {
  const plays = [
    makePlay({ stats: { rec: 1, rec_yd: 8 }, pts: 1.8, order: 10 }),
    makePlay({ stats: { rec: 1, rec_yd: 12 }, pts: 2.2, order: 20 }),
  ];
  const inputs = {
    playEvents: plays,
    sleeperPointsById: { wr1: 1.8 },
    sleeperStatsById: { wr1: { rec: 1, rec_yd: 8 } },
    sleeperStatsFetchedAt: 1000,
    now: 2000,
  };
  const once = step(createReconciliationState(), inputs);
  // Same events, same poll timestamps, and the duplicated play ids from a
  // second poll of an unchanged provider window.
  const twice = step(once, { ...inputs, playEvents: [...plays, ...plays] });

  assert.deepEqual(twice.feedEvents, once.feedEvents);
  assert.deepEqual(
    [...twice.players.get('wr1').plays],
    [...once.players.get('wr1').plays],
  );
  assert.equal(twice.plays.size, 2);
});

test('displayed total is Sleeper plus pending, across players', () => {
  const state = step(createReconciliationState(), {
    playEvents: [
      makePlay({ stats: { rec: 1, rec_yd: 8 }, pts: 1.8, order: 10 }),
      makePlay({ stats: { rec: 1, rec_yd: 12 }, pts: 2.2, order: 20 }),
      makePlay({ playerId: 'rb1', position: 'RB', stats: { rush_att: 1, rush_yd: 40, rush_td: 1 }, pts: 10, order: 15 }),
    ],
    sleeperPointsById: { wr1: 1.8, rb1: 0 },
    now: 100,
  });

  assert.equal(state.players.get('wr1').displayedPoints, 4);
  assert.equal(state.players.get('rb1').displayedPoints, 10);
  assert.equal(state.players.get('rb1').plays[0].status, 'pending');
  assert.equal(sumDisplayedPoints(state), 14);
  assert.equal(sumDisplayedPoints(state, ['wr1']), 4);
});

test('the feed is one flat list, newest first', () => {
  const state = step(createReconciliationState(), {
    playEvents: [
      makePlay({ stats: { rec: 1, rec_yd: 8 }, pts: 1.8, order: 10, at: 1000 }),
      makePlay({ playerId: 'rb1', position: 'RB', stats: { rush_att: 1, rush_yd: 4 }, pts: 0.4, order: 20, at: 3000 }),
      makePlay({ stats: { rec: 1, rec_yd: 12 }, pts: 2.2, order: 30, at: 2000 }),
    ],
    now: 5000,
  });

  assert.deepEqual(state.feedEvents.map((event) => event.at), [3000, 2000, 1000]);
  assert.ok(state.feedEvents.every((event) => event.status === 'pending'));
});

test('a play Sleeper never credited in a finished game stops counting', () => {
  // The real case: BDL parsed a fumble Sleeper never charged, so the feed
  // showed 31.68 against Sleeper's 33.68 for the rest of the week.
  const real = makePlay({ playerId: 'qb1', position: 'QB', stats: { pass_yd: 50, pass_td: 1 }, pts: 6, order: 10 });
  const phantom = makePlay({ playerId: 'qb1', position: 'QB', stats: { fum_lost: 1 }, pts: -2, order: 20 });
  const inputs = {
    playEvents: [real, phantom],
    sleeperPointsById: { qb1: 6 },
    sleeperStatsById: { qb1: { pass_yd: 50, pass_td: 1 } },
  };

  let state = step(createReconciliationState(), { ...inputs, sleeperStatsFetchedAt: 1000, now: 1500 });
  let player = state.players.get('qb1');
  assert.equal(player.plays[1].status, 'pending', 'condemned while the game was still live');
  assert.equal(player.displayedPoints, 4);

  state = step(state, { ...inputs, sleeperStatsFetchedAt: 2000, now: 2500, finalGameIds: ['game-1'] });
  player = state.players.get('qb1');

  assert.deepEqual(player.plays.map((play) => play.status), ['confirmed', 'unconfirmed']);
  assert.equal(player.plays[1].confirmedBy, null);
  assert.equal(player.plays[1].adjustment, 0);
  assert.equal(player.plays[1].displayPts, 0);
  assert.equal(player.plays[1].pts, -2, 'the play lost its own value');
  assert.equal(player.pendingPoints, 0);
  assert.equal(player.displayedPoints, 6, 'displayed total still disagrees with Sleeper');
});

test('a play pending past the TTL stops counting even while the game runs', () => {
  const phantom = makePlay({ stats: { rec: 1, rec_yd: 15 }, pts: 2.5, order: 10 });
  const inputs = {
    playEvents: [phantom],
    sleeperPointsById: { wr1: 0 },
    sleeperStatsById: { wr1: {} },
  };

  let state = step(createReconciliationState(), { ...inputs, sleeperStatsFetchedAt: 1000, now: 1000 });
  assert.equal(state.players.get('wr1').plays[0].status, 'pending');
  assert.equal(state.players.get('wr1').displayedPoints, 2.5);

  // One second short of the two-minute grace.
  state = step(state, { ...inputs, sleeperStatsFetchedAt: 120000, now: 120999 });
  assert.equal(state.players.get('wr1').plays[0].status, 'pending');

  state = step(state, { ...inputs, sleeperStatsFetchedAt: 121000, now: 121000 });
  const player = state.players.get('wr1');
  assert.equal(player.plays[0].status, 'unconfirmed');
  assert.equal(player.plays[0].displayPts, 0);
  assert.equal(player.displayedPoints, 0);
});

test('a stale stat line never condemns a play', () => {
  const play = makePlay({ stats: { rec: 1, rec_yd: 15 }, pts: 2.5, order: 10 });
  let state = step(createReconciliationState(), {
    playEvents: [play],
    sleeperPointsById: { wr1: 0 },
    sleeperStatsById: { wr1: {} },
    sleeperStatsFetchedAt: 1000,
    now: 1000,
  });
  // The stat-line poll has been failing for ten minutes; the game is final.
  state = step(state, {
    playEvents: [],
    sleeperPointsById: { wr1: 0 },
    sleeperStatsById: { wr1: {} },
    sleeperStatsFetchedAt: 1000,
    now: 600000,
    finalGameIds: ['game-1'],
  });

  assert.equal(state.players.get('wr1').plays[0].status, 'pending');
  assert.equal(state.players.get('wr1').displayedPoints, 2.5);
});

test('a Sleeper stat correction reinstates an unconfirmed play', () => {
  const play = makePlay({ stats: { rec: 1, rec_yd: 15 }, pts: 2.5, order: 10 });
  let state = step(createReconciliationState(), {
    playEvents: [play],
    sleeperPointsById: { wr1: 0 },
    sleeperStatsById: { wr1: {} },
    sleeperStatsFetchedAt: 1000,
    now: 1000,
    finalGameIds: ['game-1'],
  });
  assert.equal(state.players.get('wr1').plays[0].status, 'unconfirmed');

  // Sleeper posts the catch late.
  state = step(state, {
    playEvents: [],
    sleeperPointsById: { wr1: 2.5 },
    sleeperStatsById: { wr1: { rec: 1, rec_yd: 15 } },
    sleeperStatsFetchedAt: 2000,
    now: 2000,
    finalGameIds: ['game-1'],
  });
  const player = state.players.get('wr1');

  assert.equal(player.plays[0].status, 'confirmed');
  assert.equal(player.plays[0].confirmedBy, 'stats');
  assert.equal(player.plays[0].displayPts, 2.5);
  assert.equal(player.displayedPoints, 2.5);
});

test('an unconfirmed play does not block the plays after it', () => {
  // A carry Sleeper's line has no room for, then a catch it does.
  const phantom = makePlay({ stats: { rush_att: 1, rush_yd: 15 }, pts: 1.5, order: 10 });
  const real = makePlay({ stats: { rec: 1, rec_yd: 20, rec_td: 1 }, pts: 9, order: 20 });
  const state = step(createReconciliationState(), {
    playEvents: [phantom, real],
    sleeperPointsById: { wr1: 9 },
    sleeperStatsById: { wr1: { rec: 1, rec_yd: 20, rec_td: 1 } },
    sleeperStatsFetchedAt: 1000,
    now: 1000,
    finalGameIds: ['game-1'],
  });
  const player = state.players.get('wr1');

  assert.deepEqual(player.plays.map((play) => play.status), ['unconfirmed', 'confirmed']);
  assert.equal(player.plays[1].confirmedBy, 'stats');
  assert.equal(player.displayedPoints, 9);
  assert.equal(
    player.plays.reduce((total, play) => total + play.displayPts, 0),
    9,
  );
});

test('an unconfirmed play cannot explain away a Sleeper surplus', () => {
  // The player's own line is real; the mis-attributed play is not.
  const misattributed = makePlay({ stats: { rec: 2, rec_yd: 30 }, pts: 5, order: 10 });
  const inputs = {
    sleeperPointsById: { wr1: 5 },
    sleeperStatsById: { wr1: { rec: 2, rec_yd: 30 } },
  };
  let state = step(createReconciliationState(), {
    ...inputs,
    playEvents: [misattributed],
    // A different game, so the stat line cannot confirm this play.
    sleeperStatsById: { wr1: { rush_att: 2, rush_yd: 30 } },
    sleeperPointsById: { wr1: 3 },
    sleeperStatsFetchedAt: 1000,
    now: 1000,
    finalGameIds: ['game-1'],
  });
  assert.equal(state.players.get('wr1').plays[0].status, 'unconfirmed');

  state = step(state, {
    ...inputs,
    playEvents: [],
    sleeperStatsById: { wr1: { rush_att: 2, rush_yd: 30 } },
    sleeperPointsById: { wr1: 3 },
    sleeperStatsFetchedAt: 40000,
    now: 40000,
    finalGameIds: ['game-1'],
  });
  const player = state.players.get('wr1');

  assert.equal(player.fallbackEvents.length, 1, 'the phantom play hid a real Sleeper line');
  assert.deepEqual(player.fallbackEvents[0].stats, { rush_att: 2, rush_yd: 30 });
  assert.equal(player.displayedPoints, 3);
});

test('unconfirmed decisions are idempotent', () => {
  const inputs = {
    playEvents: [makePlay({ stats: { rec: 1, rec_yd: 15 }, pts: 2.5, order: 10 })],
    sleeperPointsById: { wr1: 0 },
    sleeperStatsById: { wr1: {} },
    sleeperStatsFetchedAt: 1000,
    now: 1000,
    finalGameIds: ['game-1'],
  };
  const once = step(createReconciliationState(), inputs);
  const twice = step(once, inputs);

  assert.deepEqual(twice.feedEvents, once.feedEvents);
  assert.equal(twice.players.get('wr1').displayedPoints, once.players.get('wr1').displayedPoints);
});
