import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUpcomingDraftWindow } from '../../src/utils/draftAssistant/pickProgress.js';

const order = Array.from({ length: 208 }, (_, i) => ({
  overall: i + 1, rosterId: String(i % 16 + 1),
}));
const selected = (overall) => ({ overall, playerId: `player-${overall}` });

test('live keeper draft stays at Redshirt slot 5.14 despite ten future keepers', () => {
  const picks = [...Array.from({ length: 77 }, (_, i) => selected(i + 1)),
    ...[83, 98, 100, 104, 137, 140, 144, 153, 194, 200].map(selected)];
  assert.equal(picks.length + 1, 88); // Previous banner incorrectly showed 6.08.
  const window = buildUpcomingDraftWindow(order, '14', picks);
  assert.equal(window.currentOverall, 78);
  assert.equal(window.currentPick.rosterId, '14');
  assert.equal(window.nextMyPick.overall, 78);
  assert.equal(window.picksBeforeUser.length, 0);
});

test('upcoming turns and picks away skip future keeper slots', () => {
  const picks = [...Array.from({ length: 81 }, (_, i) => selected(i + 1)), selected(83)];
  const window = buildUpcomingDraftWindow(order, '4', picks);
  assert.equal(window.currentOverall, 82);
  assert.equal(window.upcomingPicks[1].overall, 84);
  assert.equal(window.nextMyPick.overall, 84);
  assert.equal(window.picksBeforeUser.length, 1);
});

test('duplicates, unordered selections and empty placeholders do not advance progress', () => {
  const window = buildUpcomingDraftWindow(order, null, [selected(3), selected(1), selected(1), { overall: 2, playerId: null }]);
  assert.equal(window.currentOverall, 2);
  assert.equal(window.nextMyPick, null);
});

test('normal drafts advance, completed drafts have no upcoming pick, undo reopens a slot', () => {
  const smallOrder = order.slice(0, 3);
  assert.equal(buildUpcomingDraftWindow(smallOrder).currentOverall, 1);
  assert.equal(buildUpcomingDraftWindow(smallOrder, '2', [selected(1)]).currentOverall, 2);
  const done = buildUpcomingDraftWindow(smallOrder, '2', [1, 2, 3].map(selected));
  assert.equal(done.currentOverall, 4);
  assert.equal(done.currentPick, null);
  assert.equal(done.nextMyPick, null);
  assert.deepEqual(done.upcomingPicks, []);
  assert.equal(buildUpcomingDraftWindow(smallOrder, '2', [1, 3].map(selected)).currentOverall, 2);
});
