import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getGameLogColumns,
  getMetrics,
  getStatRows,
  positionGroup,
} from '../../src/utils/playerMetrics.js';

describe('playerMetrics', () => {
  it('treats team defense as a Statistics position group', () => {
    assert.equal(positionGroup('DEF'), 'DEF');
    assert.equal(positionGroup('DST'), 'DEF');
    assert.equal(positionGroup('D/ST'), 'DEF');
  });

  it('builds D/ST season stat sections and game-log columns', () => {
    const statsMap = {
      gamesPlayed: 2,
      pts_allow: 35,
      yds_allow: 710,
      sack: 5,
      int: 3,
      fum_rec: 1,
      def_td: 1,
      tkl: 123,
      tkl_solo: 80,
      tkl_loss: 9,
      qb_hit: 12,
      def_pass_def: 7,
    };

    const { standard, advanced } = getStatRows(statsMap, 'DEF');
    assert.deepEqual(standard.map((section) => section.heading), ['Usage', 'Impact Plays', 'Tackling']);
    assert.equal(standard[0].rows.find((row) => row.label === 'Pts Allowed')?.value, '35');
    assert.equal(standard[1].rows.find((row) => row.label === 'Sacks')?.value, '5.0');
    assert.equal(advanced[0].rows.find((row) => row.label === 'Pass Def')?.value, '7');

    const columns = getGameLogColumns('DEF');
    assert.deepEqual(columns.standard.map((column) => column.key), ['pts_allow', 'yds_allow', 'sack', 'int', 'fum_rec', 'def_td']);
  });

  it('derives D/ST headline metrics', () => {
    const metrics = getMetrics({ sack: 4, int: 2, fum_rec: 1, pts_allow: 17 }, 'DEF');
    assert.deepEqual(metrics.map((metric) => metric.label), ['SACKS', 'TAKEAWAYS', 'PTS ALLOWED']);
  });
});
