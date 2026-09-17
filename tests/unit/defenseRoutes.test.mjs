import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAppPath, normalizeAppRoute, parseAppRoute } from '../../src/utils/appRoutes.js';

test('Defense rankings default to game stats, all positions, and total yards', () => {
  const route = parseAppRoute('/fantasy/defenses');

  assert.equal(route.defenseMode, 'stats');
  assert.equal(route.defensePosition, 'ALL');
  assert.equal(route.defenseStat, 'total_yd');
  assert.equal(buildAppPath(route), '/fantasy/defenses');
});

test('Defense ranking filters remain explicit when a non-default position is selected', () => {
  const route = normalizeAppRoute({
    activeTab: 'fantasy',
    companionView: 'defenses',
    defensePosition: 'QB',
    defenseStat: 'pass_td',
  });

  assert.equal(buildAppPath(route), '/fantasy/defenses?pos=QB&stat=pass_td');
});
