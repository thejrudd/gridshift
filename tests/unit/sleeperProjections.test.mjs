import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SCORING } from '../../src/utils/scoringEngine.js';
import {
  buildSleeperProjection,
  mapSleeperProjectionsToPlayers,
} from '../../src/utils/sleeperProjections.js';

test('maps a Sleeper projected stat line with connected league scoring', () => {
  const projection = buildSleeperProjection({
    player_id: '13377',
    updated_at: 1_789_444_813_621,
    stats: {
      idp_tkl: 5,
      idp_tkl_solo: 2.71,
      idp_tkl_ast: 2.29,
      idp_tkl_loss: 0.32,
      idp_sack: 0.19,
      idp_qbhit: 0.42,
      pts_ppr: 0.45,
    },
    player: { position: 'LB' },
  }, {
    ...DEFAULT_SCORING,
    idp_tkl: 1,
    idp_tkl_solo: 1,
    idp_tkl_ast: 0.5,
    idp_tkl_loss: 2,
    idp_sack: 4,
    idp_qbhit: 1,
  });

  assert.equal(projection.projected, 10.7);
  assert.equal(projection.factors.source, 'sleeper');
  assert.equal(projection.factors.providerId, '13377');
  assert.equal(projection.factors.providerCollectedAt, 1_789_444_813_621);
});

test('ignores Sleeper rows that contain only ADP metadata', () => {
  assert.equal(buildSleeperProjection({
    player_id: '13377',
    stats: { adp_dd_ppr: 999 },
    player: { position: 'LB' },
  }, DEFAULT_SCORING), null);
});

test('maps Sleeper projections by player ID and ignores unknown players', () => {
  const mapped = mapSleeperProjectionsToPlayers({
    players: {
      '13377': { full_name: 'Arvell Reese', position: 'LB', team: 'NYG' },
    },
    scoringSettings: { ...DEFAULT_SCORING, idp_tkl: 1 },
    projectionRows: [
      { player_id: 'unknown', stats: { idp_tkl: 10 }, player: { position: 'LB' } },
      { player_id: '13377', stats: { idp_tkl: 5 }, player: { position: 'LB' } },
    ],
  });

  assert.equal(mapped.size, 1);
  assert.equal(mapped.get('13377').projected, 5);
});
