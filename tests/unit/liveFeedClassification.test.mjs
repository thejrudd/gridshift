import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getPlayEventClassification } from '../../src/utils/livePlaysFeed.js';
import {
  buildDeltaEvents,
  describeDelta,
  getEventClassification,
  mapBdlStatsToGridShift,
  resolveCurrentPlayerPoints,
} from '../../src/utils/liveScoringFeed.js';

describe('current live player points', () => {
  it('keeps completed fixture points out of an unmatched replay snapshot', () => {
    assert.equal(resolveCurrentPlayerPoints({
      sleeperPoints: 44.8,
      sleeperDerivedPoints: 43.2,
      suppressFallback: true,
    }), 0);
  });

  it('uses time-sliced mapped points during replay once they arrive', () => {
    assert.equal(resolveCurrentPlayerPoints({
      hasMappedStats: true,
      livePoints: 6.7,
      sleeperPoints: 44.8,
      suppressFallback: true,
    }), 6.7);
  });

  it('preserves the official Sleeper fallback outside replay', () => {
    assert.equal(resolveCurrentPlayerPoints({
      sleeperPoints: 18.4,
      sleeperDerivedPoints: 17.9,
    }), 18.4);
  });
});

describe('live scoring event classification', () => {
  it('retains the stats used by the expanded scoring breakdown', () => {
    const previous = new Map([['player-1', {
      stats: { rec: 1, rec_yd: 8 },
      points: 1.8,
    }]]);
    const next = new Map([['player-1', {
      stats: { rec: 2, rec_yd: 19 },
      points: 3.9,
    }]]);

    const [event] = buildDeltaEvents(previous, next, new Map([
      ['player-1', { position: 'WR' }],
    ]), { now: 1234 });

    assert.deepEqual(event.stats, { rec: 1, rec_yd: 11 });
    assert.equal(event.pts, 2.1);
    assert.equal(event.desc, '1 rec, +11 rec yds');
  });

  it('keeps touchdown outcomes while preserving their mechanism', () => {
    assert.deepEqual(getEventClassification({ pass_td: 1, pass_yd: 24 }, 'QB'), {
      kind: 'td',
      mechanism: 'pass',
    });
    assert.deepEqual(getEventClassification({ rush_td: 1, rush_yd: 7 }, 'RB'), {
      kind: 'td',
      mechanism: 'rush',
    });
    assert.deepEqual(getEventClassification({ idp_def_td: 1, idp_int: 1 }, 'DB'), {
      kind: 'td',
      mechanism: 'def',
    });
  });

  it('distinguishes field goals from extra points', () => {
    assert.deepEqual(getEventClassification({ fgm: 1 }, 'K'), {
      kind: 'fg',
      mechanism: null,
    });
    assert.deepEqual(getEventClassification({ xpm: 1 }, 'K'), {
      kind: 'xp',
      mechanism: null,
    });
    assert.deepEqual(getEventClassification({ xpmiss: 1 }, 'K'), {
      kind: 'xp',
      mechanism: null,
    });
  });

  it('derives missed kicks only when the provider supplies attempts', () => {
    assert.deepEqual(
      (({ fgm, fgmiss, xpm, xpmiss }) => ({ fgm, fgmiss, xpm, xpmiss }))(mapBdlStatsToGridShift({
        field_goals_made: 2,
        field_goal_attempts: 3,
        extra_points_made: 1,
        extra_point_attempts: 2,
      })),
      { fgm: 2, fgmiss: 1, xpm: 1, xpmiss: 1 },
    );
    assert.equal(mapBdlStatsToGridShift({ extra_points_made: 1 }).xpmiss, 0);
  });

  it('preserves the action behind turnovers and ordinary plays', () => {
    assert.deepEqual(getEventClassification({ pass_int: 1, pass_att: 1 }, 'QB'), {
      kind: 'to',
      mechanism: 'pass',
    });
    assert.deepEqual(getEventClassification({ rush_yd: 12, rush_att: 1 }, 'RB'), {
      kind: 'rush',
      mechanism: null,
    });
    assert.deepEqual(getEventClassification({ idp_sack: 1 }, 'LB'), {
      kind: 'def',
      mechanism: null,
    });
  });

  it('keeps partial and return-only stat updates readable', () => {
    assert.equal(describeDelta({ pass_cmp: 1 }), '1 completion');
    assert.deepEqual(getEventClassification({ pr_yd: 14 }, 'WR'), {
      kind: 'return',
      mechanism: null,
    });
  });
});

describe('play-by-play event classification', () => {
  it('does not credit a pick-six as a touchdown to the passer', () => {
    const play = {
      scoring: true,
      type: 'interception',
      yards: 42,
      description: 'Quarterback pass intercepted and returned 42 yards for a touchdown',
    };

    assert.deepEqual(getPlayEventClassification(play, 'passer', 'QB'), {
      kind: 'to',
      mechanism: 'pass',
    });
    assert.deepEqual(getPlayEventClassification(play, 'team_defense', 'DEF'), {
      kind: 'td',
      mechanism: 'def',
    });
  });

  it('uses a dedicated extra-point outcome', () => {
    const play = {
      scoring: true,
      type: 'extra_point',
      yards: 0,
      description: 'Extra point is good',
    };
    assert.deepEqual(getPlayEventClassification(play, 'kicker', 'K'), {
      kind: 'xp',
      mechanism: null,
    });
  });
});
