import assert from 'node:assert/strict';
import test from 'node:test';
import { getLatestPlayPresentation } from '../../src/utils/nflPlays/latestPlayPresentation.js';
import { getPlayTag, withReplayReview } from '../../src/utils/nflPlays/playPresentation.js';

const game = {
  away: { id: 'TEN' },
  home: { id: 'SF' },
};

test('shared play tags identify penalties before negative yardage', () => {
  assert.deepEqual(
    getPlayTag({ startDown: 2, startDistance: 8 }, {
      flag: 'penalty',
      yards: -8,
      type: 'pass',
      scoring: false,
    }),
    ['', 'Penalty'],
  );
});

test('latest-play presentation calls out a change in possession', () => {
  const presentation = getLatestPlayPresentation({
    id: 'pick',
    team: 'SF',
    typeSlug: 'interception',
    type: 'Interception',
    description: 'Intercepted by SF at the TEN 24.',
    rawText: 'Intercepted by SF at the TEN 24.',
    startDown: 2,
    startDistance: 8,
    startYardLine: 76,
    endYardLine: 76,
    startPossessionText: 'TEN 24',
    endPossessionText: 'SF 24',
    down: '2nd & 8',
    quarter: '1st',
    time: '04:12',
    spot: 'TEN 24',
  }, game);

  assert.equal(presentation.possessionChanged, true);
  assert.equal(presentation.possessionTeam, 'SF');
  assert.deepEqual(presentation.tag, ['loss', 'Intercepted']);
  assert.equal(presentation.time, '04:12');
});

test('latest-play text preserves out of bounds when the parsed sentence omits it', () => {
  const play = {
    team: 'TEN',
    typeSlug: 'rush',
    rawText: 'T.Spears right end pushed ob at TEN 41 for 6 yards.',
    narrative: { confident: true, sentence: 'T. Spears ran for 6 yards.' },
  };
  assert.equal(getLatestPlayPresentation(play, game).sentence, 'T. Spears ran for 6 yards. Out of bounds.');
});

test('play text keeps a reported review and uses the ruling once available', () => {
  const play = { rawText: 'Pass complete. The play is under review.' };
  assert.equal(withReplayReview(play, 'Pass complete.'), 'Pass complete. Under review.');
  assert.equal(withReplayReview(play, play.rawText), play.rawText);

  const reviewed = {
    rawText: 'Pass complete. The ruling on the field was REVERSED. Pass incomplete.',
    narrative: { confident: true, sentence: 'Pass incomplete.' },
  };
  assert.equal(getLatestPlayPresentation(reviewed, game).sentence, 'Pass incomplete. Ruling reversed.');
});
