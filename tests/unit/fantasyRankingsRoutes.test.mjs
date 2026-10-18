import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAppPath, isSameAppRoute, parseAppRoute } from '../../src/utils/appRoutes.js';

test('legacy Fantasy Waivers URLs open projected unrostered Rankings', () => {
  const route = parseAppRoute('/fantasy/waivers', '?position=RB');

  assert.equal(route.companionView, 'rankings');
  assert.equal(route.rankingsPosition, 'RB');
  assert.equal(route.rankingsSort, 'projected');
  assert.equal(route.rankingsUnrosteredOnly, true);
  assert.equal(buildAppPath(route), '/fantasy/rankings?pos=RB&sort=projected&unrostered=1');
});

test('legacy Companion Waiver aliases preserve the selected position', () => {
  const route = parseAppRoute('/companion/waiver', '?position=DL');

  assert.equal(route.companionView, 'rankings');
  assert.equal(route.rankingsPosition, 'DL');
  assert.equal(route.rankingsSort, 'projected');
  assert.equal(route.rankingsUnrosteredOnly, true);
  assert.equal(buildAppPath(route), '/fantasy/rankings?pos=DL&sort=projected&unrostered=1');
});

test('projected sort is valid Rankings state and distinct from season rankings', () => {
  const projected = parseAppRoute('/fantasy/rankings', '?sort=projected&unrostered=1');
  const season = parseAppRoute('/fantasy/rankings');

  assert.equal(projected.rankingsSort, 'projected');
  assert.equal(projected.rankingsUnrosteredOnly, true);
  assert.equal(buildAppPath(projected), '/fantasy/rankings?sort=projected&unrostered=1');
  assert.equal(isSameAppRoute(projected, season), false);
});
