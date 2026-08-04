import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_SCORING } from '../../src/utils/scoringEngine.js';
import {
  buildSharedDemoScoringEvents,
  limitPlayByPlayGames,
} from '../../src/utils/liveDemoPlays.js';

const sides = [
  {
    key: 'a',
    rows: [{
      id: 'receiver-a',
      player: { full_name: 'Alex Receiver', position: 'WR', team: 'BUF' },
    }],
  },
  {
    key: 'b',
    rows: [{
      id: 'defense-b',
      player: { full_name: 'Miami Dolphins', position: 'DEF', team: 'MIA' },
    }],
  },
];

describe('Fantasy Live shared demo play', () => {
  it('credits opposite fantasy sides at the exact same moment', () => {
    const events = buildSharedDemoScoringEvents({
      sides,
      scoringSettings: {
        ...DEFAULT_SCORING,
        rec: 1,
        fum_lost: -2,
        def_ff: 1,
        fum_rec: 2,
        def_td: 6,
        def_fum_td: 6,
      },
      progress: 0.63,
    });

    assert.equal(events.length, 2);
    assert.deepEqual(events.map((event) => event.playerId), ['receiver-a', 'defense-b']);
    assert.equal(events[0].sharedPlayId, events[1].sharedPlayId);
    assert.equal(events[0].progress, events[1].progress);
    assert.equal(events[0].desc, events[1].desc);
    assert.ok(events.every((event) => event.pts > 0));
    assert.ok(events.every((event) => event.pts >= 5));
    assert.equal(events[0].stats.rec_yd, 75);
    assert.equal(events[1].stats.def_fum_td, 1);
  });

  it('omits the shared snap when the matchup has no defensive starter', () => {
    const events = buildSharedDemoScoringEvents({
      sides: [sides[0], { key: 'b', rows: [] }],
      scoringSettings: DEFAULT_SCORING,
    });
    assert.deepEqual(events, []);
  });
});

describe('Fantasy Live mock game coverage', () => {
  it('keeps Monday night and every other relevant game in demo mode', () => {
    const games = Array.from({ length: 10 }, (_, index) => ({
      id: `game-${index + 1}`,
      day: index === 9 ? 'Monday' : 'Sunday',
    }));

    const demoGames = limitPlayByPlayGames(games, { mock: true, maxGames: 8 });
    const realGames = limitPlayByPlayGames(games, { mock: false, maxGames: 8 });

    assert.equal(demoGames.length, 10);
    assert.equal(demoGames.at(-1).day, 'Monday');
    assert.equal(realGames.length, 8);
  });
});
