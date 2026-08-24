import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GAME_DURATION_MS,
  describeReplayInstant,
  getGameProgress,
  getReplayInstant,
  getReplayWindow,
  getReplayActiveDuration,
  getReplaySegments,
  getScoreAtProgress,
  projectGameAtProgress,
  projectGamesAtProgress,
  projectStatRowAtProgress,
  projectStatsAtProgress,
  getReplayProgressAtInstant,
  getSlateProgressForGameProgress,
  spreadEventsAcrossInterval,
} from '../../src/dev/liveSandbox/liveSandboxReplay.js';

const EARLY = '2025-11-23T18:00:00.000Z';
const LATE = '2025-11-24T01:20:00.000Z';

function makeGame(overrides = {}) {
  return {
    id: 1,
    date: EARLY,
    status: 'Final',
    status_state: 'final',
    home_team: { abbreviation: 'CHI' },
    visitor_team: { abbreviation: 'PIT' },
    home_team_score: 31,
    home_team_q1: 7,
    home_team_q2: 10,
    home_team_q3: 7,
    home_team_q4: 7,
    visitor_team_score: 28,
    visitor_team_q1: 7,
    visitor_team_q2: 14,
    visitor_team_q3: 0,
    visitor_team_q4: 7,
    ...overrides,
  };
}

test('replay window spans first kickoff through the end of the last game', () => {
  const games = [makeGame(), makeGame({ id: 2, date: LATE })];
  const window = getReplayWindow(games);
  assert.equal(window.start, Date.parse(EARLY));
  assert.equal(window.end, Date.parse(LATE) + GAME_DURATION_MS);
});

test('replay window is null when no game has a parseable date', () => {
  assert.equal(getReplayWindow([]), null);
  assert.equal(getReplayWindow([{ id: 1, date: 'nonsense' }]), null);
});

test('games stagger: a late game is still pregame when an early game is final', () => {
  const games = [makeGame(), makeGame({ id: 2, date: LATE })];
  // Halfway through the slate the early game has long finished while the
  // late game has not kicked off.
  const instant = getReplayInstant(games, 0.5);
  assert.equal(getGameProgress(games[0], instant), 1);
  assert.equal(getGameProgress(games[1], instant), 0);
});

test('dead time between separated games is collapsed out of the timeline', () => {
  const games = [makeGame(), makeGame({ id: 2, date: LATE })];
  const segments = getReplaySegments(games);
  // The two games do not overlap, so they stay two segments and the long gap
  // between them is excluded from the scrubbable duration.
  assert.equal(segments.length, 2);
  assert.equal(getReplayActiveDuration(games), GAME_DURATION_MS * 2);
  const window = getReplayWindow(games);
  assert.ok(window.durationMs > getReplayActiveDuration(games));
});

test('simultaneous games merge into one segment rather than being replayed twice', () => {
  const games = [makeGame(), makeGame({ id: 2 }), makeGame({ id: 3 })];
  assert.equal(getReplaySegments(games).length, 1);
  assert.equal(getReplayActiveDuration(games), GAME_DURATION_MS);
});

test('almost every scrub position lands on a game actually in progress', () => {
  const games = [makeGame(), makeGame({ id: 2, date: LATE })];
  const samples = 200;
  let inPlay = 0;
  for (let step = 0; step <= samples; step += 1) {
    const instant = getReplayInstant(games, step / samples);
    const playing = games.some((game) => {
      const progress = getGameProgress(game, instant);
      return progress > 0 && progress < 1;
    });
    if (playing) inPlay += 1;
  }
  // Only the exact endpoints and the seam between segments sit on a kickoff or
  // a final whistle, so effectively the whole slider is live football. Across
  // real wall-clock time this ratio would be roughly a fifth.
  assert.ok(inPlay / (samples + 1) > 0.95, `only ${inPlay}/${samples + 1} positions were in play`);
});

test('replay progress advances monotonically through the timeline', () => {
  const games = [makeGame(), makeGame({ id: 2, date: LATE })];
  let previous = -Infinity;
  for (let step = 0; step <= 100; step += 1) {
    const instant = getReplayInstant(games, step / 100);
    assert.ok(instant >= previous, `instant went backwards at ${step}%`);
    previous = instant;
  }
});

test('the timeline starts at the first kickoff and ends at the last whistle', () => {
  const games = [makeGame(), makeGame({ id: 2, date: LATE })];
  assert.equal(getReplayInstant(games, 0), Date.parse(EARLY));
  assert.equal(getReplayInstant(games, 1), Date.parse(LATE) + GAME_DURATION_MS);
});

test('game progress is clamped to the 0..1 range', () => {
  const game = makeGame();
  assert.equal(getGameProgress(game, Date.parse(EARLY) - 5_000), 0);
  assert.equal(getGameProgress(game, Date.parse(EARLY) + GAME_DURATION_MS * 4), 1);
});

test('scores rebuild from real quarter scoring rather than interpolating', () => {
  const game = makeGame();
  assert.equal(getScoreAtProgress(game, 'home', 0), 0);
  // End of Q1.
  assert.equal(getScoreAtProgress(game, 'home', 0.25), 7);
  // End of Q3: 7 + 10 + 7.
  assert.equal(getScoreAtProgress(game, 'home', 0.75), 24);
  assert.equal(getScoreAtProgress(game, 'home', 1), 31);
  assert.equal(getScoreAtProgress(game, 'visitor', 0.5), 21);
});

test('a partial quarter never exceeds the final score', () => {
  const game = makeGame();
  for (let step = 0; step <= 100; step += 1) {
    const value = getScoreAtProgress(game, 'home', step / 100);
    assert.ok(value <= game.home_team_score, `score ${value} exceeded final at ${step}%`);
  }
});

test('scores never move backwards as the clock advances', () => {
  const game = makeGame();
  let previous = 0;
  for (let step = 0; step <= 100; step += 1) {
    const value = getScoreAtProgress(game, 'home', step / 100);
    assert.ok(value >= previous, `score dropped from ${previous} to ${value}`);
    previous = value;
  }
});

test('a game is projected as scheduled, in progress, then final', () => {
  const game = makeGame();
  const pre = projectGameAtProgress(game, 0);
  assert.equal(pre.status_state, 'pre');
  assert.equal(pre.home_team_score, 0);
  assert.equal(pre.period, null);

  const live = projectGameAtProgress(game, 0.4);
  assert.equal(live.status_state, 'in');
  assert.equal(live.period, 2);
  assert.match(live.time, /^\d{1,2}:\d{2}$/);

  const final = projectGameAtProgress(game, 1);
  assert.equal(final.status_state, 'final');
  assert.equal(final.home_team_score, 31);
});

test('period stays within regulation at the very end of the game', () => {
  assert.equal(projectGameAtProgress(makeGame(), 0.999).period, 4);
});

test('counting stats scale with progress and floor to whole events', () => {
  const row = { passing_yards: 300, passing_touchdowns: 3, receptions: 9 };
  const half = projectStatRowAtProgress(row, 0.5);
  assert.equal(half.passing_yards, 150);
  // A partial touchdown is not a thing; it must floor to a whole number.
  assert.equal(half.passing_touchdowns, 1);
  assert.equal(half.receptions, 4);
});

test('rate and long stats are never scaled', () => {
  const row = { qbr: 82.5, qb_rating: 85.2, yards_per_pass_attempt: 6.6, long_rushing: 13, passing_yards: 100 };
  const half = projectStatRowAtProgress(row, 0.5);
  assert.equal(half.qbr, 82.5);
  assert.equal(half.qb_rating, 85.2);
  assert.equal(half.yards_per_pass_attempt, 6.6);
  assert.equal(half.long_rushing, 13);
  assert.equal(half.passing_yards, 50);
});

test('negative counting stats scale toward zero rather than away from it', () => {
  const half = projectStatRowAtProgress({ rushing_yards: -10 }, 0.5);
  assert.equal(half.rushing_yards, -5);
});

test('a completed game returns its untouched final stat line', () => {
  const row = { passing_yards: 301, passing_touchdowns: 3 };
  assert.deepEqual(projectStatRowAtProgress(row, 1), row);
});

test('stat totals never move backwards as the clock advances', () => {
  const row = { receiving_yards: 137, receptions: 9, receiving_touchdowns: 2 };
  let previous = { receiving_yards: 0, receptions: 0, receiving_touchdowns: 0 };
  for (let step = 0; step <= 100; step += 1) {
    const next = projectStatRowAtProgress(row, step / 100);
    Object.keys(previous).forEach((field) => {
      assert.ok(next[field] >= previous[field], `${field} dropped at ${step}%`);
    });
    previous = next;
  }
});

test('stats are sliced per game, so a pregame game has an empty stat line', () => {
  const games = [makeGame(), makeGame({ id: 2, date: LATE })];
  const statsByGame = {
    1: [{ passing_yards: 300, passing_touchdowns: 3 }],
    2: [{ passing_yards: 280, passing_touchdowns: 2 }],
  };
  const sliced = projectStatsAtProgress(statsByGame, games, 0.5);
  assert.equal(sliced['1'][0].passing_yards, 300);
  assert.equal(sliced['2'][0].passing_yards, 0);
  assert.equal(sliced['2'][0].passing_touchdowns, 0);
});

test('projecting the whole slate leaves the source games untouched', () => {
  const games = [makeGame(), makeGame({ id: 2, date: LATE })];
  const projected = projectGamesAtProgress(games, 0.5);
  assert.equal(projected.length, 2);
  assert.equal(games[0].home_team_score, 31, 'source game was mutated');
  assert.equal(projected[1].home_team_score, 0);
});

test('the replay label counts live, final, and upcoming games', () => {
  const games = [makeGame(), makeGame({ id: 2, date: LATE })];
  assert.match(describeReplayInstant(games, 0.5), /1 live · 1 final · 0 upcoming|0 live · 1 final · 1 upcoming/);
  assert.equal(describeReplayInstant([], 0.5), '—');
});

test('a batch of deltas is spread across the slate time it covers', () => {
  const events = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const xs = spreadEventsAcrossInterval(events, 0.2, 0.5).map((e) => Number(e.slateProgress.toFixed(2)));
  // Without spreading these would all sit at 0.5 and stack vertically at NOW.
  assert.deepEqual(xs, [0.3, 0.4, 0.5]);
});

test('only the final event of a batch lands on the current moment', () => {
  const events = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const xs = spreadEventsAcrossInterval(events, 0, 0.8).map((e) => e.slateProgress);
  assert.equal(xs.filter((x) => x === 0.8).length, 1);
  assert.equal(xs[xs.length - 1], 0.8);
});

test('spread positions increase in the order events were produced', () => {
  const events = Array.from({ length: 8 }, (_, i) => ({ id: i }));
  const xs = spreadEventsAcrossInterval(events, 0.1, 0.9).map((e) => e.slateProgress);
  xs.forEach((value, index) => {
    if (index > 0) assert.ok(value > xs[index - 1], `position fell at ${index}`);
  });
});

test('a zero-length interval collapses onto the current moment', () => {
  const xs = spreadEventsAcrossInterval([{ id: 1 }, { id: 2 }], 0.4, 0.4)
    .map((e) => e.slateProgress);
  assert.deepEqual(xs, [0.4, 0.4]);
});

test('spreading leaves per-game progress untouched', () => {
  // The win-probability replay reads gameProgress to work out how much of a
  // starter's own game is left; the slate axis must not overwrite it.
  const events = [{ id: 1, gameProgress: 0.5 }];
  const spread = spreadEventsAcrossInterval(events, 0.1, 0.9);
  assert.equal(spread[0].gameProgress, 0.5);
  assert.equal(spread[0].slateProgress, 0.9);
  assert.equal(events[0].slateProgress, undefined);
});

test('slate progress round-trips through the replay instant', () => {
  const games = [makeGame(), makeGame({ id: 2, date: LATE })];
  [0, 0.25, 0.5, 0.75, 1].forEach((value) => {
    const instant = getReplayInstant(games, value);
    const back = getReplayProgressAtInstant(games, instant);
    assert.ok(Math.abs(back - value) < 1e-9, `${value} round-tripped to ${back}`);
  });
});

test('a position inside a game maps onto the shared slate axis', () => {
  const games = [makeGame(), makeGame({ id: 2, date: LATE })];
  // The first game occupies the first half of the collapsed timeline, so its
  // halfway point sits a quarter of the way through the slate.
  assert.ok(Math.abs(getSlateProgressForGameProgress(games, 1, 0.5) - 0.25) < 1e-9);
  // The same position in the later game sits in the second half.
  assert.ok(Math.abs(getSlateProgressForGameProgress(games, 2, 0.5) - 0.75) < 1e-9);
});

test('staggered games keep their real order on the slate axis', () => {
  const games = [makeGame(), makeGame({ id: 2, date: LATE })];
  // The late game only kicks off after the early one has finished, so even its
  // opening play must sit after the early game's closing one.
  const earlyEnd = getSlateProgressForGameProgress(games, 1, 1);
  const lateStart = getSlateProgressForGameProgress(games, 2, 0);
  assert.ok(lateStart >= earlyEnd, `late game started at ${lateStart}, before ${earlyEnd}`);
});

test('an unknown game has no slate position', () => {
  assert.equal(getSlateProgressForGameProgress([makeGame()], 999, 0.5), null);
});

test('yardage advances only when the play that produced it lands', () => {
  // 12 rushing yards on 3 carries: the yards must arrive in three steps, not
  // as a continuous dribble of one-yard gains.
  const row = { rushing_yards: 12, rushing_attempts: 3 };
  const seen = [];
  for (let step = 0; step <= 100; step += 1) {
    seen.push(projectStatRowAtProgress(row, step / 100).rushing_yards);
  }
  const distinct = [...new Set(seen)];
  assert.deepEqual(distinct, [0, 4, 8, 12]);
});

test('receiving yards follow receptions, not the clock', () => {
  const row = { receiving_yards: 90, receptions: 2 };
  const distinct = [...new Set(
    Array.from({ length: 101 }, (_, i) => projectStatRowAtProgress(row, i / 100).receiving_yards),
  )];
  assert.deepEqual(distinct, [0, 45, 90]);
});

test('yardage with no recorded plays falls back to scaling smoothly', () => {
  // Real box scores always pair yards with the plays that produced them, but a
  // missing count must not freeze the stat at zero for the whole game.
  const row = { rushing_yards: 8, rushing_attempts: 0 };
  assert.equal(projectStatRowAtProgress(row, 0.5).rushing_yards, 4);
  assert.equal(projectStatRowAtProgress(row, 1).rushing_yards, 8);
});
