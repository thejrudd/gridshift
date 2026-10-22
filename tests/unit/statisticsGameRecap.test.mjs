import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { normalizeBdlScorePlay } from '../../src/utils/balldontlieNflScoreboard.js';
import { buildGameRecap } from '../../src/utils/statisticsGameRecap.js';

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/bdlNflPlays.json', import.meta.url)));

function detailFor(index, { status = 'final', throughPeriod = null } = {}) {
  const raw = fixture.games[index];
  const away = { id: raw.visitor_team.abbreviation, name: raw.visitor_team.full_name };
  const home = { id: raw.home_team.abbreviation, name: raw.home_team.full_name };
  const game = { id: raw.id, away, home };
  const plays = raw.plays
    // A live cut stops mid-quarter: drop the period-ending marker of the last quarter.
    .filter((play) => throughPeriod == null || play.period < throughPeriod
      || (play.period === throughPeriod && !/^end-/.test(play.type_slug)))
    .map((play) => normalizeBdlScorePlay(play, game));
  const last = plays.at(-1);
  return {
    status,
    away,
    home,
    score: status === 'final' ? { away: last.awayScore, home: last.homeScore } : null,
    drives: [{ id: 'all', plays }],
  };
}

test('final recap names the winner, the lead-for-good score, and each quarter newest first', () => {
  const recap = buildGameRecap(detailFor(1));
  assert.deepEqual(recap.sections.map((section) => section.heading), ['Final', 'Fourth quarter', 'Third quarter', 'Second quarter', 'First quarter']);
  const [finalText, leadForGood] = recap.sections[0].paragraphs;
  assert.match(finalText, /^Cincinnati Bengals beat Cleveland Browns 17-16\.$/);
  assert.equal(leadForGood, 'Cincinnati Bengals took the lead for good with 2:48 left in the third quarter. Evan McPherson made a 35 yard field goal.');
  assert.equal(
    recap.sections[1].paragraphs[0],
    'Neither team scored. DJ Turner II intercepted the pass and returned it 7 yards. Cincinnati Bengals led 17-16 at the end of regulation.',
  );
  assert.match(recap.sections[4].paragraphs[0], /^Chase Brown ran it in from 5 yards out\. Cincinnati Bengals led 7-0 after the first quarter\.$/);
});

test('a lost fumble is recapped, and a tied quarter reads as tied', () => {
  const recap = buildGameRecap(detailFor(0));
  const first = recap.sections.find((section) => section.heading === 'First quarter').paragraphs[0];
  assert.match(first, /The game was tied 7-7 after the first quarter\.$/);
  const third = recap.sections.find((section) => section.heading === 'Third quarter').paragraphs[0];
  assert.match(third, /Miles Sanders fumbled, recovered by Quinyon Mitchell/);
});

test('a live game only recaps finished quarters', () => {
  const recap = buildGameRecap(detailFor(1, { status: 'live', throughPeriod: 3 }));
  assert.deepEqual(recap.sections.map((section) => section.heading), ['Second quarter', 'First quarter']);
  assert.match(recap.sections[0].paragraphs[0], /at halftime\.$/);
});

test('a live first quarter returns an explanatory note instead of sections', () => {
  const recap = buildGameRecap(detailFor(1, { status: 'live', throughPeriod: 1 }));
  assert.deepEqual(recap.sections, []);
  assert.equal(recap.note, 'The recap starts once the first quarter ends.');
});

test('no play-by-play means no recap', () => {
  assert.equal(buildGameRecap({ status: 'final', drives: [] }), null);
  assert.equal(buildGameRecap(null), null);
});

test('a scoring play the narrative cannot read falls back to a factual sentence', () => {
  const away = { id: 'AAA', name: 'Away Team' };
  const home = { id: 'HHH', name: 'Home Team' };
  const recap = buildGameRecap({
    status: 'final',
    away,
    home,
    score: { away: 0, home: 3 },
    drives: [{ plays: [
      { id: '1', period: 1, time: '4:00', scoring: true, typeSlug: 'unknown', shortText: '', awayScore: 0, homeScore: 3 },
    ] }],
  });
  assert.equal(recap.sections[1].paragraphs[0], 'Home Team scored a field goal. Home Team led 3-0 after the first quarter.');
});
