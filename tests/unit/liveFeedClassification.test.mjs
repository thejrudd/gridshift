import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getPlayEventClassification } from '../../src/utils/livePlaysFeed.js';
import { getEventClassification } from '../../src/utils/liveScoringFeed.js';

describe('live scoring event classification', () => {
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
