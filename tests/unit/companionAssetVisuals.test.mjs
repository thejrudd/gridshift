import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getCompanionPlayerImageUrl,
  getEspnPlayerImageUrl,
} from '../../src/utils/companionAssetVisuals.js';

describe('companion asset visuals', () => {
  it('uses ESPN headshots for ESPN-normalized player IDs', () => {
    assert.equal(
      getEspnPlayerImageUrl('espn:101'),
      'https://a.espncdn.com/i/headshots/nfl/players/full/101.png',
    );
    assert.equal(
      getCompanionPlayerImageUrl({ id: 'espn:101' }),
      'https://a.espncdn.com/i/headshots/nfl/players/full/101.png',
    );
  });

  it('honors ESPN-provided player image fields before generated URLs', () => {
    assert.equal(
      getCompanionPlayerImageUrl({ id: 'espn:101', image_url: 'https://img.example/player.png' }),
      'https://img.example/player.png',
    );
  });
});
