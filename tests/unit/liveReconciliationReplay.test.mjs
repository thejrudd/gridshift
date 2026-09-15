import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildPlayEvents,
  buildStarterNameIndex,
  normalizePlay,
} from '../../src/utils/livePlaysFeed.js';
import { PLAY_ROLES } from '../../src/utils/nflPlays/playNarrative.js';
import { calcPoints } from '../../src/utils/scoringEngine.js';
import {
  createReconciliationState,
  reconcileLivePlays,
} from '../../src/utils/liveReconciliation.js';

const FIXTURE = JSON.parse(fs.readFileSync(new URL('../fixtures/bdlNflPlays.json', import.meta.url), 'utf8'));

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

// How far Sleeper trails the play feed in this replay, in fixture wallclock.
const LAG_MS = 90000;
const ROLE_POSITION = {
  [PLAY_ROLES.PASSER]: 'QB',
  [PLAY_ROLES.KICKER]: 'K',
  [PLAY_ROLES.RUSHER]: 'RB',
  [PLAY_ROLES.RECEIVER]: 'WR',
};
// One name can act in several roles across a game (a quarterback also runs).
// The most specific role wins so the starter's position stays stable.
const POSITION_RANK = { QB: 0, K: 1, RB: 2, WR: 3 };

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * Starters taken from the fixture's own play actors, so every scoring play in
 * the file belongs to somebody. Teams are left null: the fixture has no
 * roster, and the name index only uses team to break ambiguity.
 */
function buildStarterRows() {
  const positionByName = new Map();
  FIXTURE.games.forEach((game) => {
    game.plays.forEach((raw) => {
      const play = normalizePlay(raw, String(game.id));
      if (!play?.narrative?.confident) return;
      play.narrative.actors.forEach((actor) => {
        const position = ROLE_POSITION[actor.role];
        if (!position) return;
        const known = positionByName.get(actor.name);
        if (!known || POSITION_RANK[position] < POSITION_RANK[known]) {
          positionByName.set(actor.name, position);
        }
      });
    });
  });
  return [...positionByName].map(([name, position], index) => ({
    id: `starter-${index}`,
    player: { full_name: name, position, team: null },
  }));
}

function buildFixtureEvents(rows) {
  const positionsById = new Map(rows.map((row) => [row.id, row.player.position]));
  const playsByGame = {};
  const gamesById = new Map();
  FIXTURE.games.forEach((game) => {
    playsByGame[String(game.id)] = game.plays;
    gamesById.set(String(game.id), game);
  });
  const events = buildPlayEvents(
    playsByGame,
    buildStarterNameIndex(rows),
    SCORING,
    positionsById,
    gamesById,
  );
  return { events, positionsById };
}

/** Sleeper's view at time `T`: everything the feed showed before `T − lag`. */
function synthesizeSleeper(events, cutoff, positionsById) {
  const statsById = {};
  events.forEach((event) => {
    if (event.order > cutoff) return;
    const line = statsById[event.playerId] ?? (statsById[event.playerId] = {});
    Object.entries(event.stats ?? {}).forEach(([key, value]) => {
      line[key] = (Number(line[key]) || 0) + (Number(value) || 0);
    });
  });
  const pointsById = {};
  Object.entries(statsById).forEach(([playerId, stats]) => {
    pointsById[playerId] = round2(calcPoints(stats, SCORING, positionsById.get(playerId)));
  });
  return { statsById, pointsById };
}

function assertAdjustmentPinning(player, label) {
  const confirmed = player.plays.filter((play) => play.status === 'confirmed');
  const rows = player.fallbackEvents;
  // The latest confirmed play carries the residual; a player with no confirmed
  // play has only its latest stat-update row to carry it.
  const latestId = confirmed.length
    ? confirmed[confirmed.length - 1].id
    : (rows.length ? rows[rows.length - 1].id : null);
  [...player.plays, ...rows].forEach((event) => {
    if (event.id === latestId) return;
    assert.equal(event.adjustment, 0, `${label}: ${event.id} carried a residual it does not own`);
  });
}

function stepTimes(events, count) {
  const orders = [...new Set(events.map((event) => event.order))].sort((a, b) => a - b);
  const stride = Math.max(1, Math.floor(orders.length / count));
  const times = orders.filter((_, index) => index % stride === 0);
  if (times[times.length - 1] !== orders[orders.length - 1]) times.push(orders[orders.length - 1]);
  return times;
}

function replay({ events, positionsById, visibleFilter = () => true, lagMs = LAG_MS, onStep }) {
  let state = createReconciliationState();
  const times = stepTimes(events, 30);
  times.forEach((time) => {
    const { statsById, pointsById } = synthesizeSleeper(events, time - lagMs, positionsById);
    state = reconcileLivePlays(state, {
      playEvents: events.filter((event) => event.order <= time && visibleFilter(event)),
      sleeperPointsById: pointsById,
      sleeperStatsById: statsById,
      sleeperStatsFetchedAt: time,
      scoringSettings: SCORING,
      positionsById,
      now: time,
    });
    onStep?.(state, time);
  });

  // Settle: the last snap is behind us, Sleeper has caught up, and the stat
  // line is polled twice more so any surplus clears its grace period.
  const end = times[times.length - 1];
  const final = synthesizeSleeper(events, Infinity, positionsById);
  [end + 60000, end + 120000, end + 180000].forEach((time) => {
    state = reconcileLivePlays(state, {
      playEvents: events.filter(visibleFilter),
      sleeperPointsById: final.pointsById,
      sleeperStatsById: final.statsById,
      sleeperStatsFetchedAt: time,
      scoringSettings: SCORING,
      positionsById,
      now: time,
    });
    onStep?.(state, time);
  });
  return { state, final };
}

test('the fixture replays to agreement with a lagging Sleeper stream', () => {
  const rows = buildStarterRows();
  const { events, positionsById } = buildFixtureEvents(rows);
  assert.ok(events.length > 100, 'fixture produced too few play events to be a replay');

  const { state, final } = replay({
    events,
    positionsById,
    onStep: (stepState, time) => {
      stepState.players.forEach((player, playerId) => {
        assertAdjustmentPinning(player, `t=${time} ${playerId}`);
        // Rule 3, at every step: Sleeper's last word plus what it has not
        // covered yet — never lagging the feed, never double counting.
        const pending = round2(player.plays
          .filter((play) => play.status === 'pending')
          .reduce((total, play) => total + play.pts, 0));
        assert.equal(player.pendingPoints, pending);
        assert.equal(
          player.displayedPoints,
          round2((player.sleeperPoints ?? 0) + pending),
          `t=${time} ${playerId} displayed total drifted`,
        );
        assert.equal(player.fallbackEvents.length, 0, `t=${time} ${playerId} invented a stat-update row`);
      });
    },
  });

  const seen = new Set();
  state.feedEvents.forEach((event) => {
    const key = `${event.playerId}:${event.sharedPlayId}`;
    assert.ok(!seen.has(key), `duplicate feed row for ${key}`);
    seen.add(key);
  });
  assert.equal(state.feedEvents.length, events.length);

  state.players.forEach((player, playerId) => {
    assert.ok(
      player.plays.every((play) => play.status === 'confirmed'),
      `${playerId} still has pending plays after the game ended`,
    );
    const displayed = round2(player.plays.reduce((total, play) => total + play.displayPts, 0));
    assert.ok(
      Math.abs(displayed - final.pointsById[playerId]) <= 0.01,
      `${playerId} displayed ${displayed} against Sleeper ${final.pointsById[playerId]}`,
    );
    assert.equal(player.displayedPoints, round2(final.pointsById[playerId]));
    assertAdjustmentPinning(player, `final ${playerId}`);
  });
});

test('withholding one game leaves stat-update rows explaining its points', () => {
  const rows = buildStarterRows();
  const { events, positionsById } = buildFixtureEvents(rows);
  const withheldGameId = String(FIXTURE.games[1].id);
  const withheldPlayers = new Set(events
    .filter((event) => event.gameId === withheldGameId)
    .map((event) => event.playerId));
  assert.ok(withheldPlayers.size > 5, 'withheld game has too few players to test');

  const { state, final } = replay({
    events,
    positionsById,
    // The provider has no plays for this game — the free-tier / coverage-gap
    // case the fallback row exists for.
    visibleFilter: (event) => event.gameId !== withheldGameId,
  });

  withheldPlayers.forEach((playerId) => {
    const player = state.players.get(playerId);
    const sleeperPoints = final.pointsById[playerId];
    assert.equal(player.plays.length, 0, `${playerId} should have no plays`);
    if (Math.abs(sleeperPoints) < 1) return;
    assert.ok(player.fallbackEvents.length > 0, `${playerId} has unexplained Sleeper points`);
    player.fallbackEvents.forEach((row) => {
      assert.equal(row.source, 'stat-update');
      assert.equal(row.estimated, false);
      assert.equal(row.status, 'confirmed');
      assert.ok(row.id.startsWith(`stat-update-${playerId}-`));
      assert.ok(row.desc);
    });
    // Rows are emitted from a surplus and never revised downward, so a later
    // yardage loss leaves a small residual on the newest row rather than
    // rewriting a row the user already read.
    const explained = round2(player.fallbackEvents.reduce((total, row) => total + row.pts, 0));
    assert.ok(
      Math.abs(explained - sleeperPoints) <= 1,
      `${playerId} stat-update rows explain ${explained} of ${sleeperPoints}`,
    );
    const displayed = round2(player.fallbackEvents.reduce((total, row) => total + row.displayPts, 0));
    assert.equal(displayed, round2(sleeperPoints));
    assert.equal(player.displayedPoints, round2(sleeperPoints));
  });

  // The covered game is untouched: its plays still carry the feed.
  state.players.forEach((player, playerId) => {
    if (withheldPlayers.has(playerId)) return;
    assert.equal(player.fallbackEvents.length, 0, `${playerId} got a row despite full coverage`);
    assert.ok(player.plays.every((play) => play.status === 'confirmed'));
  });
});
