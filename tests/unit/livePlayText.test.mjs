import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizePlay } from '../../src/utils/livePlaysFeed.js';

test('Fantasy Live uses the Statistics Scores narrative for a provider touchdown', () => {
  const play = normalizePlay({
    id: 'multi-scorer-touchdown',
    type_slug: 'passing-touchdown',
    short_text: "Wan'Dale Robinson 39 Yd pass from Jameis Winston (Younghoe Koo Kick)",
    text: "J.Winston pass deep left to W.Robinson for 39 yards, TOUCHDOWN [B.Branch]. Y.Koo extra point is GOOD, Center-C.Kreiter, Holder-J.Gillan.",
    stat_yardage: 39,
  }, 'game-1');

  assert.equal(
    play.description,
    "Jameis Winston found Wan'Dale Robinson for a 39-yard touchdown.",
  );
});

test('Fantasy Live preserves the official description when the shared parser is not confident', () => {
  const official = 'A provider play shape the narrative parser does not recognize.';
  const play = normalizePlay({
    id: 'unknown-play',
    type_slug: 'unknown',
    short_text: 'Novel Provider Format',
    text: official,
  }, 'game-1');

  assert.equal(play.description, official);
});
