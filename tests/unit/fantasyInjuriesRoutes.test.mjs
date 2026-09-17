import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAppPath, isSameAppRoute, normalizeAppRoute, parseAppRoute } from '../../src/utils/appRoutes.js';

test('Fantasy Injuries has a canonical route without filter query state', () => {
  const route = parseAppRoute('/fantasy/injuries', '?position=RB&team=3&q=manager');

  assert.equal(route.activeTab, 'fantasy');
  assert.equal(route.companionView, 'injuries');
  assert.equal(buildAppPath(route), '/fantasy/injuries');
});

test('Fantasy Injuries remains valid through route normalization', () => {
  const route = normalizeAppRoute({ activeTab: 'fantasy', companionView: 'injuries' });

  assert.equal(route.companionView, 'injuries');
  assert.equal(buildAppPath(route), '/fantasy/injuries');
});

test('Fantasy Injuries route equality ignores view-local filter query state', () => {
  const canonical = parseAppRoute('/fantasy/injuries');
  const withIgnoredFilters = parseAppRoute('/fantasy/injuries', '?position=WR&teams=BUF&q=owner');

  assert.equal(isSameAppRoute(canonical, withIgnoredFilters), true);
  assert.equal(isSameAppRoute(canonical, parseAppRoute('/fantasy/matchups')), false);
});
