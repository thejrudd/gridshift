import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getPlayEventClassification } from '../../src/utils/livePlaysFeed.js';
import {
  buildDeltaEvents,
  describeDelta,
  getEventClassification,
  mapBdlStatsToGridShift,
  mergeLiveScoringStats,
  reconcileLiveFantasyPoints,
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

  it('uses Sleeper as the connected-live authority while preserving replay slices', () => {
    assert.equal(resolveCurrentPlayerPoints({
      hasMappedStats: true,
      livePoints: 28.9,
      sleeperPoints: 33.68,
      sleeperDerivedPoints: 33.68,
      preferAuthoritative: true,
    }), 33.68);
    assert.equal(resolveCurrentPlayerPoints({
      hasMappedStats: true,
      livePoints: 28.9,
      sleeperPoints: 33.68,
      suppressFallback: true,
      preferAuthoritative: true,
    }), 28.9);
  });

  it('reports the exact Sleeper-to-BDL reconciliation adjustment', () => {
    assert.deepEqual(reconcileLiveFantasyPoints({
      derivedPoints: 28.9,
      authoritativePoints: 33.68,
    }), {
      status: 'adjusted',
      derivedPoints: 28.9,
      authoritativePoints: 33.68,
      adjustment: 4.78,
    });
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

  it('splits a polling batch into separate fantasy-valued play rows', () => {
    const previous = new Map([['player-1', {
      stats: { rec: 0, rec_yd: 0 },
      points: 0,
    }]]);
    const next = new Map([['player-1', {
      stats: { rec: 2, rec_yd: 20 },
      points: 4,
    }]]);

    const events = buildDeltaEvents(previous, next, new Map([
      ['player-1', { position: 'WR' }],
    ]), {
      now: 1234,
      scoringSettings: { rec: 1, rec_yd: 0.1 },
    });

    assert.equal(events.length, 2);
    assert.equal(new Set(events.map((event) => event.id)).size, 2);
    assert.deepEqual(events.map((event) => event.stats), [
      { rec: 1, rec_yd: 10 },
      { rec: 1, rec_yd: 10 },
    ]);
    assert.deepEqual(events.map((event) => event.pts), [2, 2]);
  });

  it('does not emit a stat row when the delta has no fantasy value', () => {
    const previous = new Map([['player-1', {
      stats: { rec: 0 },
      points: 0,
    }]]);
    const next = new Map([['player-1', {
      stats: { rec: 1 },
      points: 0,
    }]]);

    assert.deepEqual(buildDeltaEvents(previous, next, new Map([
      ['player-1', { position: 'WR' }],
    ]), {
      now: 1234,
      scoringSettings: { rec: 0 },
    }), []);
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

  it('maps incomplete passes and preserves first-down scoring inputs', () => {
    const mapped = mapBdlStatsToGridShift({
      passing_attempts: 34,
      passing_completions: 22,
      passing_first_downs: 13,
      rushing_first_downs: 2,
      receiving_first_downs: 1,
    });

    assert.deepEqual(
      (({ pass_inc, pass_fd, rush_fd, rec_fd }) => ({ pass_inc, pass_fd, rush_fd, rec_fd }))(mapped),
      { pass_inc: 12, pass_fd: 13, rush_fd: 2, rec_fd: 1 },
    );
  });

  it('overlays weekly first-down and incompletion stats without replacing live box-score fields', () => {
    const merged = mergeLiveScoringStats(
      { pass_yd: 240, pass_att: 30, pass_cmp: 19, pass_inc: 11, pass_fd: 0, rush_fd: 0, rec_fd: 0 },
      { pass_inc: 10, pass_fd: 12, rush_fd: 2, rec_fd: 7 },
    );

    assert.deepEqual(merged, {
      pass_yd: 240,
      pass_att: 30,
      pass_cmp: 19,
      pass_inc: 10,
      pass_fd: 12,
      rush_fd: 2,
      rec_fd: 7,
    });
  });

  it('maps assisted tackles and field-goal yard bonus inputs without leaking IDP stats to offense', () => {
    const assisted = mapBdlStatsToGridShift({
      total_tackles: 4,
      solo_tackles: 2,
      assisted_tackles: 2,
    }, 'LB');
    assert.equal(assisted.idp_tkl_ast, 2);
    assert.equal(mapBdlStatsToGridShift({ assisted_tackles: 2 }, 'WR').idp_tkl_ast, 0);

    const merged = mergeLiveScoringStats(
      { fgm: 1, fgm_yds: 0, fgm_yds_over_30: 0, idp_tkl_ast: 0 },
      { field_goal_yards: 52, field_goal_yards_over_30: 22, assisted_tackles: 2 },
    );
    assert.deepEqual(
      (({ fgm_yds, fgm_yds_over_30, idp_tkl_ast }) => ({ fgm_yds, fgm_yds_over_30, idp_tkl_ast }))(merged),
      { fgm_yds: 52, fgm_yds_over_30: 22, idp_tkl_ast: 2 },
    );
  });

  it('stays silent when only the point total moved', () => {
    // A points-only change is a Sleeper correction with no football behind it;
    // liveReconciliation pins it to the play it belongs to instead.
    const previous = new Map([['player-1', {
      stats: { rec: 1 },
      points: 1,
    }]]);
    const next = new Map([['player-1', {
      stats: { rec: 1 },
      points: 3.68,
    }]]);

    const events = buildDeltaEvents(previous, next, new Map([
      ['player-1', { position: 'WR' }],
    ]), { now: 1234 });

    assert.deepEqual(events, []);
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
