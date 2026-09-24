import test from 'node:test';
import assert from 'node:assert/strict';

import { correctToken, editDistanceWithin } from '../../src/utils/globalSearch/correct.js';
import {
  CORRECTION_DICTIONARY,
  PHRASE_WORD_DICTIONARY,
} from '../../src/utils/globalSearch/vocabulary.js';

test('bounded edit distance reports in-range distances exactly', () => {
  assert.equal(editDistanceWithin('seahawks', 'seahawks', 2), 0);
  assert.equal(editDistanceWithin('seahwaks', 'seahawks', 2), 1, 'adjacent transposition is one edit');
  assert.equal(editDistanceWithin('cardnals', 'cardinals', 2), 1);
  assert.equal(editDistanceWithin('quaterback', 'quarterback', 2), 1);
});

test('bounded edit distance stops at the bound instead of computing the true distance', () => {
  assert.equal(editDistanceWithin('kitten', 'sitting', 2), 3, 'over the bound reports max + 1');
  assert.equal(editDistanceWithin('kitten', 'sitting', 3), 3);
  assert.equal(editDistanceWithin('abc', 'abcdefgh', 2), 3, 'length gap alone exceeds the bound');
});

test('bounded edit distance handles empty inputs', () => {
  assert.equal(editDistanceWithin('', '', 1), 0);
  assert.equal(editDistanceWithin('', 'ab', 2), 2);
  assert.equal(editDistanceWithin('ab', '', 1), 2);
});

test('corrects misspelled team and position words', () => {
  assert.equal(correctToken('seahwaks'), 'seahawks');
  assert.equal(correctToken('cardnals'), 'cardinals');
  assert.equal(correctToken('quaterback'), 'quarterback');
  assert.equal(correctToken('qaterback'), 'quarterback');
  assert.equal(correctToken('commaders'), 'commanders');
  assert.equal(correctToken('jaguors'), 'jaguars');
});

test('leaves already-valid vocabulary words untouched', () => {
  for (const word of ['seahawks', 'quarterback', 'cardinals', 'most', 'schedule']) {
    assert.equal(correctToken(word), null, `${word} is already valid`);
  }
});

test('never corrects short tokens, where NFL shorthand is one edit apart', () => {
  // "sea" is one edit from "sf"/"ne"-adjacent shorthand and two from many more;
  // correcting three-letter abbreviations turns a precise query into a wrong one.
  for (const word of ['sea', 'sf', 'lv', 'wr', 'rb', 'qb', 'gb', 'nyg']) {
    assert.equal(correctToken(word), null, `${word} must not be corrected`);
  }
});

test('does not correct a standalone token into a multi-word phrase fragment', () => {
  // "card" only exists inside "wild card"; correcting the surname Ward into it
  // would be meaningless on its own.
  assert.equal(correctToken('ward'), null);
  assert.equal(correctToken('hall'), null);
  assert.ok(!CORRECTION_DICTIONARY.includes('card'));
  assert.ok(PHRASE_WORD_DICTIONARY.includes('card'));
});

test('the wider phrase-word dictionary corrects words inside multi-word phrases', () => {
  assert.equal(correctToken('recieving', PHRASE_WORD_DICTIONARY), 'receiving');
  assert.equal(correctToken('rushng', PHRASE_WORD_DICTIONARY), 'rushing');
  assert.equal(correctToken('passin', PHRASE_WORD_DICTIONARY), 'passing');
});

test('correction is deterministic for equally close candidates', () => {
  const first = correctToken('ariona');
  for (let i = 0; i < 5; i++) assert.equal(correctToken('ariona'), first);
});

test('never corrects into a short abbreviation', () => {
  // Regression: "lamr" is one edit from the Rams' "lar". Accepting that turned
  // "lamr jackson" into a Rams query and excluded Lamar Jackson entirely.
  assert.equal(correctToken('lamr'), null);
  assert.equal(correctToken('seaa'), null, 'not into the SEA abbreviation either');
  assert.equal(correctToken('wrs'), null);
});
