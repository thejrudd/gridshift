import test from 'node:test';
import assert from 'node:assert/strict';

import { buildReplayDeltaEvents } from '../../src/dev/liveSandbox/liveSandboxPlays.js';
import { splitDeltaIntoPlays } from '../../src/dev/liveSandbox/liveSandboxReplay.js';
import { LIVE_SANDBOX_FIXTURE } from '../../src/data/liveSandboxFixture.js';
import {
  buildPlayEvents,
  buildStarterNameIndex,
  groupSharedPlayEvents,
} from '../../src/utils/livePlaysFeed.js';

const tdsIn = (plays, key) => plays.map((play) => Number(play[key] ?? 0));

test('a single carry stays a single play', () => {
  const plays = splitDeltaIntoPlays({ rush_att: 1, rush_yd: 7 });
  assert.equal(plays.length, 1);
  assert.deepEqual(plays[0], { rush_att: 1, rush_yd: 7 });
});

test('two rushing touchdowns are dealt to separate plays', () => {
  // The bug this exists to prevent: one entry claiming two scores.
  const plays = splitDeltaIntoPlays({ rush_att: 4, rush_yd: 40, rush_td: 2 });
  assert.equal(plays.length, 4);
  assert.deepEqual(tdsIn(plays, 'rush_td'), [0, 0, 1, 1]);
  plays.forEach((play) => assert.ok((play.rush_td ?? 0) <= 1, 'a play scored twice'));
});

test('a play never carries more than one touchdown of any kind', () => {
  const plays = splitDeltaIntoPlays({
    pass_cmp: 12, pass_yd: 289, pass_td: 1,
    rush_att: 6, rush_yd: 40, rush_td: 2,
  });
  plays.forEach((play) => {
    const scores = Number(play.pass_td ?? 0) + Number(play.rush_td ?? 0) + Number(play.rec_td ?? 0);
    assert.ok(scores <= 1, `a play carried ${scores} touchdowns`);
  });
});

test('rushing and receiving are separate plays for the same player', () => {
  const plays = splitDeltaIntoPlays({ rush_att: 2, rush_yd: 10, rec: 3, rec_yd: 30 });
  assert.equal(plays.length, 5);
  assert.equal(plays.filter((play) => play.rush_att).length, 2);
  assert.equal(plays.filter((play) => play.rec).length, 3);
  // No play mixes a carry with a catch.
  plays.forEach((play) => assert.ok(!(play.rush_att && play.rec)));
});

test('yardage is shared out and still sums to the original', () => {
  const plays = splitDeltaIntoPlays({ rush_att: 3, rush_yd: 116 });
  assert.equal(plays.reduce((sum, play) => sum + play.rush_yd, 0), 116);
});

test('negative yardage stays negative and still sums', () => {
  const plays = splitDeltaIntoPlays({ rush_att: 2, rush_yd: -6 });
  assert.equal(plays.reduce((sum, play) => sum + play.rush_yd, 0), -6);
});

test('yardage with no recorded attempt still produces one play', () => {
  const plays = splitDeltaIntoPlays({ rec_yd: 14 });
  assert.equal(plays.length, 1);
  assert.equal(plays[0].rec_yd, 14);
});

test('more touchdowns than recorded attempts still get their own plays', () => {
  const plays = splitDeltaIntoPlays({ rush_td: 2 });
  assert.equal(plays.length, 2);
  assert.deepEqual(tdsIn(plays, 'rush_td'), [1, 1]);
});

test('kicks are one play each', () => {
  const plays = splitDeltaIntoPlays({ fgm: 4, xpm: 2 });
  assert.equal(plays.length, 6);
  assert.equal(plays.filter((play) => play.fgm === 1).length, 4);
  assert.equal(plays.filter((play) => play.xpm === 1).length, 2);
});

test('turnovers are their own plays', () => {
  const plays = splitDeltaIntoPlays({ pass_cmp: 2, pass_yd: 20, pass_int: 1 });
  assert.equal(plays.filter((play) => play.pass_int).length, 1);
  assert.equal(plays.length, 3);
});

test('stats with no play structure ride along rather than vanishing', () => {
  const plays = splitDeltaIntoPlays({ rush_att: 1, rush_yd: 3, fum_rec: 1 });
  assert.equal(plays.length, 1);
  assert.equal(plays[0].fum_rec, 1);
});

test('a delta of only structureless stats still yields one play', () => {
  const plays = splitDeltaIntoPlays({ idp_tkl: 3 });
  assert.equal(plays.length, 1);
  assert.equal(plays[0].idp_tkl, 3);
});

test('an empty delta yields nothing', () => {
  assert.deepEqual(splitDeltaIntoPlays(null), []);
  assert.deepEqual(splitDeltaIntoPlays({}), []);
});

test('real play enrichment preserves the authoritative snapshot point change', () => {
  const previous = new Map([['runner', { stats: { rush_att: 0, rush_yd: 0 }, points: 0 }]]);
  const next = new Map([['runner', { stats: { rush_att: 2, rush_yd: 20 }, points: 2 }]]);
  const events = buildReplayDeltaEvents(previous, next, new Map([
    ['runner', { position: 'RB' }],
  ]), {
    now: 100,
    playsByPlayer: new Map([['runner', [
      { id: 'real-1', playerId: 'runner', kind: 'rush', desc: 'First run', pts: 0.2 },
      { id: 'real-2', playerId: 'runner', kind: 'rush', desc: 'Second run', pts: 0.2 },
    ]]]),
    playCursor: new Map(),
  });

  assert.equal(events.length, 3);
  assert.equal(events.reduce((sum, event) => sum + event.pts, 0), 2);
  assert.deepEqual(events.map((event) => event.desc), [
    'First run',
    'Second run',
    'Snapshot scoring reconciliation',
  ]);
});

test('provider play points stay equal to their stat breakdown when interval reconciliation differs', () => {
  const previous = new Map([['wr', { stats: { rec: 0, rec_yd: 10 }, points: 2 }]]);
  const next = new Map([['wr', { stats: { rec: 0, rec_yd: 11 }, points: 2.1 }]]);
  const events = buildReplayDeltaEvents(previous, next, new Map([['wr', { position: 'WR' }]]), {
    scoringSettings: { rec: 1, rec_yd: 0.1 },
    now: 150,
    playsByPlayer: new Map([['wr', [{
      id: 'brown-11',
      sharedPlayId: 'hurts-brown-11',
      playerId: 'wr',
      position: 'WR',
      kind: 'pass',
      desc: 'Jalen Hurts found A.J. Brown for 11 yards.',
      stats: { rec: 1, rec_yd: 11 },
      slateProgress: 0.7,
    }]]]),
    playCursor: new Map(),
    throughProgress: 0.7,
  });

  const provider = events.find((event) => event.source === 'replay-play');
  const reconciliation = events.find((event) => event.source === 'replay-reconciliation');
  assert.equal(provider.pts, 2.1);
  assert.equal(provider.sharedPlayId, 'hurts-brown-11');
  assert.equal(reconciliation.pts, -2);
  assert.equal(reconciliation.sharedPlayId, undefined);
  assert.equal(Math.round(events.reduce((sum, event) => sum + event.pts, 0) * 10) / 10, 0.1);
});

test('real plays keep their own scoring when synthetic categories have a different order', () => {
  const scoring = { pass_yd: 0.04, pass_td: 4, rush_yd: 0.1 };
  const previous = new Map([['qb', {
    stats: { pass_cmp: 0, pass_yd: 0, pass_td: 0, rush_att: 0, rush_yd: 0 },
    points: 0,
  }]]);
  const next = new Map([['qb', {
    stats: { pass_cmp: 2, pass_yd: 31, pass_td: 1, rush_att: 1, rush_yd: 5 },
    points: 5.7,
  }]]);
  const events = buildReplayDeltaEvents(previous, next, new Map([
    ['qb', { position: 'QB' }],
  ]), {
    scoringSettings: scoring,
    now: 400,
    playsByPlayer: new Map([['qb', [
      { id: 'play-rush-qb', playerId: 'qb', sharedPlayId: 'rush', kind: 'rush', desc: 'QB ran for 5 yards.', stats: { rush_att: 1, rush_yd: 5 } },
      { id: 'play-pass-short-qb', playerId: 'qb', sharedPlayId: 'short', kind: 'pass', desc: 'QB completed for 11 yards.', stats: { pass_cmp: 1, pass_yd: 11 } },
      { id: 'play-pass-td-qb', playerId: 'qb', sharedPlayId: 'td', kind: 'td', desc: 'QB completed for a 20-yard touchdown.', stats: { pass_cmp: 1, pass_yd: 20, pass_td: 1 } },
    ]]]),
    playCursor: new Map(),
  });

  assert.deepEqual(events.map((event) => event.pts), [0.5, 0.4, 4.8]);
  assert.equal(events.reduce((sum, event) => sum + event.pts, 0), 5.7);
  assert.deepEqual(events.map((event) => event.id), [
    'replay-play-rush-qb',
    'replay-play-pass-short-qb',
    'replay-play-pass-td-qb',
  ]);
});

test('sandbox replay emits partial player slices immediately and still groups a complete shared snap', () => {
  const scoring = { pass_yd: 0.04, rec_yd: 0.1, rec: 1 };
  const previous = new Map([
    ['qb', { stats: { pass_cmp: 0, pass_yd: 0 }, points: 0 }],
    ['wr', { stats: { rec: 0, rec_yd: 0 }, points: 0 }],
  ]);
  const next = new Map([
    ['qb', { stats: { pass_cmp: 1, pass_yd: 19 }, points: 0.8 }],
    ['wr', { stats: { rec: 1, rec_yd: 19 }, points: 2.9 }],
  ]);
  const meta = new Map([['qb', { position: 'QB' }], ['wr', { position: 'WR' }]]);
  const qbPlay = {
    id: 'play-shared-qb', sharedPlayId: 'shared-pass', gameId: 'game-1',
    playerId: 'qb', position: 'QB', kind: 'pass', desc: 'QB found WR for 19 yards.',
    stats: { pass_cmp: 1, pass_yd: 19 }, slateProgress: 0.5,
  };
  const wrPlay = {
    id: 'play-shared-wr', sharedPlayId: 'shared-pass', gameId: 'game-1',
    playerId: 'wr', position: 'WR', kind: 'pass', desc: 'QB found WR for 19 yards.',
    stats: { rec: 1, rec_yd: 19 }, slateProgress: 0.5,
  };
  const partialCursor = new Map();

  const incomplete = buildReplayDeltaEvents(previous, next, meta, {
    scoringSettings: scoring,
    playsByPlayer: new Map([['qb', [qbPlay]], ['wr', []]]),
    playCursor: partialCursor,
    throughProgress: 0.5,
  });
  assert.equal(incomplete.length, 2);
  assert.equal(incomplete.filter((event) => event.source === 'replay-play').length, 1);
  assert.equal(incomplete.reduce((sum, event) => sum + event.pts, 0), 3.7);
  assert.equal(partialCursor.get('qb').size, 1);

  const complete = buildReplayDeltaEvents(previous, next, meta, {
    scoringSettings: scoring,
    playsByPlayer: new Map([['qb', [qbPlay]], ['wr', [wrPlay]]]),
    playCursor: new Map(),
    throughProgress: 0.5,
  });
  const grouped = groupSharedPlayEvents(complete, () => 'a');

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].id, 'shared-shared-pass-a');
  assert.deepEqual(grouped[0].contributorIds, ['qb', 'wr']);
  assert.deepEqual(grouped[0].contributors.map(({ pts }) => pts), [0.8, 2.9]);
  assert.equal(grouped[0].pts, 3.7);
});

test('sandbox fixture builds and replays a raw Hurts to Brown provider row as one shared play', () => {
  const fixture = LIVE_SANDBOX_FIXTURE;
  const starterIds = fixture.matchups.flatMap((matchup) => matchup.starters);
  const starterRows = starterIds.map((id) => ({ id, player: fixture.players[id] }));
  const rawPlay = {
    id: 'hurts-brown-19',
    type_slug: 'pass-reception',
    team: { abbreviation: 'PHI' },
    short_text: 'A.J. Brown 19 Yd pass from Jalen Hurts',
    text: 'J.Hurts pass short left to A.Brown for 19 yards.',
    stat_yardage: 19,
    scoring_play: false,
    period: 4,
    clock_display: '10:56',
  };
  const providerEvents = buildPlayEvents(
    { 'game-phi': [rawPlay] },
    buildStarterNameIndex(starterRows),
    fixture.league.scoring_settings,
    new Map(starterRows.map(({ id, player }) => [id, player.position])),
    new Map(),
  ).map((event) => ({ ...event, slateProgress: 0.75 }));
  assert.deepEqual(providerEvents.map(({ playerId }) => playerId), ['6904', '5859']);

  const playsByPlayer = new Map();
  providerEvents.forEach((event) => {
    const current = playsByPlayer.get(event.playerId) ?? [];
    current.push(event);
    playsByPlayer.set(event.playerId, current);
  });
  const previous = new Map([
    ['6904', { stats: { pass_cmp: 0, pass_yd: 0 }, points: 0 }],
    ['5859', { stats: { rec: 0, rec_yd: 0 }, points: 0 }],
  ]);
  const next = new Map([
    ['6904', { stats: { pass_cmp: 1, pass_yd: 19 }, points: 0.8 }],
    ['5859', { stats: { rec: 1, rec_yd: 19 }, points: 2.9 }],
  ]);
  const replayEvents = buildReplayDeltaEvents(previous, next, new Map([
    ['6904', { position: 'QB' }], ['5859', { position: 'WR' }],
  ]), {
    scoringSettings: fixture.league.scoring_settings,
    playsByPlayer,
    playCursor: new Map(),
    throughProgress: 0.75,
  });
  const grouped = groupSharedPlayEvents(replayEvents, () => 'b');

  assert.equal(grouped.length, 1);
  assert.deepEqual(grouped[0].contributorIds, ['6904', '5859']);
  assert.deepEqual(grouped[0].contributors.map(({ pts }) => pts), [0.8, 2.9]);
});

test('provider stat coverage emits multiple same-category plays without count coupling', () => {
  const previous = new Map([['qb', { stats: { pass_cmp: 0, pass_yd: 0 }, points: 0 }]]);
  const next = new Map([['qb', { stats: { pass_cmp: 2, pass_yd: 30 }, points: 1.2 }]]);
  const cursor = new Map();
  const events = buildReplayDeltaEvents(previous, next, new Map([['qb', { position: 'QB' }]]), {
    scoringSettings: { pass_yd: 0.04 },
    playsByPlayer: new Map([['qb', [
      { id: 'pass-1', playerId: 'qb', stats: { pass_cmp: 1, pass_yd: 11 }, slateProgress: 0.4 },
      { id: 'pass-2', playerId: 'qb', stats: { pass_cmp: 1, pass_yd: 19 }, slateProgress: 0.5 },
    ]]]),
    playCursor: cursor,
    throughProgress: 0.5,
  });

  assert.notEqual(events, null);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(({ pts }) => pts), [0.4, 0.8]);
  assert.equal(cursor.get('qb').size, 2);
});

test('partial play enrichment keeps fallback rows so no scoring delta disappears', () => {
  const previous = new Map([['runner', { stats: { rush_att: 0, rush_yd: 0 }, points: 0 }]]);
  const next = new Map([['runner', { stats: { rush_att: 3, rush_yd: 30 }, points: 3 }]]);
  const events = buildReplayDeltaEvents(previous, next, new Map([
    ['runner', { position: 'RB' }],
  ]), {
    now: 200,
    playsByPlayer: new Map([['runner', [
      { id: 'real-1', playerId: 'runner', kind: 'rush', desc: 'Known run', pts: 1 },
    ]]]),
    playCursor: new Map(),
  });

  assert.equal(events.length, 3);
  assert.equal(events.reduce((sum, event) => sum + event.pts, 0), 3);
  assert.equal(events.filter((event) => event.source === 'replay-play').length, 1);
});

test('partial enrichment falls back for the missing category rather than provider array order', () => {
  const scoring = { pass_yd: 0.04, rush_yd: 0.1 };
  const previous = new Map([['qb', {
    stats: { pass_cmp: 0, pass_yd: 0, rush_att: 0, rush_yd: 0 },
    points: 0,
  }]]);
  const next = new Map([['qb', {
    stats: { pass_cmp: 1, pass_yd: 10, rush_att: 1, rush_yd: 5 },
    points: 0.9,
  }]]);
  const events = buildReplayDeltaEvents(previous, next, new Map([
    ['qb', { position: 'QB' }],
  ]), {
    scoringSettings: scoring,
    now: 500,
    playsByPlayer: new Map([['qb', [
      { id: 'known-rush', playerId: 'qb', kind: 'rush', desc: 'Known rush', stats: { rush_att: 1, rush_yd: 5 } },
    ]]]),
    playCursor: new Map(),
  });

  assert.equal(events.length, 2);
  assert.equal(events[0].pts, 0.5);
  assert.equal(events[1].stats.pass_cmp, 1);
  assert.equal(events[1].stats.rush_att, undefined);
  assert.equal(events.reduce((sum, event) => sum + event.pts, 0), 0.9);
});

test('a zero-weight reconstructed stat still carries the authoritative point change', () => {
  const previous = new Map([['defender', { stats: { idp_tkl: 0 }, points: 0 }]]);
  const next = new Map([['defender', { stats: { idp_tkl: 3 }, points: 3 }]]);
  const events = buildReplayDeltaEvents(previous, next, new Map([
    ['defender', { position: 'LB' }],
  ]), { now: 300 });

  assert.equal(events.length, 1);
  assert.equal(events[0].pts, 3);
});
