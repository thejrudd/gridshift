import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getRankingsImageDimensions,
  getRankingsImageRows,
  formatRankingsStatsLabel,
  normalizeRankingsImageCount,
  RANKINGS_IMAGE_MAX_COUNT,
} from '../../src/utils/rankingsExport.js';

describe('rankings image export helpers', () => {
  it('keeps the requested count inside the available rankings', () => {
    assert.equal(normalizeRankingsImageCount(12, 40), 12);
    assert.equal(normalizeRankingsImageCount(0, 40), 1);
    assert.equal(normalizeRankingsImageCount(99, 40), 40);
    assert.equal(normalizeRankingsImageCount('not-a-number', 12), 12);
    assert.equal(normalizeRankingsImageCount(10, 0), 0);
  });

  it('caps very large exports at the supported image limit', () => {
    assert.equal(normalizeRankingsImageCount(500, 500), RANKINGS_IMAGE_MAX_COUNT);
  });

  it('preserves current row order when taking the top X players', () => {
    const rows = [{ player: 'Third' }, { player: 'First' }, { player: 'Second' }];
    assert.deepEqual(getRankingsImageRows(rows, 2), rows.slice(0, 2));
  });

  it('grows the image for longer rankings while keeping a useful minimum canvas', () => {
    assert.deepEqual(getRankingsImageDimensions(1), { width: 1080, height: 720, rowHeight: 72 });
    assert.equal(getRankingsImageDimensions(25).height, 2182);
  });

  it('names the NFL-stat season used to calculate the exported rankings', () => {
    assert.equal(formatRankingsStatsLabel('2025'), 'Calculated using 2025 NFL stats');
    assert.equal(formatRankingsStatsLabel(null), 'NFL stat season unavailable');
  });
});
