import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { normalizeBdlScorePlay } from '../../src/utils/balldontlieNflScoreboard.js';
import {
  PLAY_ROLES,
  parsePenaltyClause,
  parsePlayNarrative,
  parseTacklers,
} from '../../src/utils/nflPlays/playNarrative.js';

const FIXTURE = JSON.parse(fs.readFileSync(new URL('../fixtures/bdlNflPlays.json', import.meta.url), 'utf8'));

function normalizedPlays(gameId) {
  const game = FIXTURE.games.find((entry) => entry.id === gameId);
  const context = { away: { id: game.visitor_team.abbreviation }, home: { id: game.home_team.abbreviation } };
  return game.plays.map((play) => normalizeBdlScorePlay(play, context));
}

function findByShortText(gameId, fragment) {
  const play = normalizedPlays(gameId).find((entry) => entry.shortText?.includes(fragment));
  assert.ok(play, `no fixture play matching ${fragment}`);
  return play;
}

const actorNames = (narrative, role) => narrative.actors.filter((a) => a.role === role).map((a) => a.name);

test('every play in the captured games parses confidently', () => {
  const unparsed = FIXTURE.games.flatMap((game) => {
    const context = { away: { id: game.visitor_team.abbreviation }, home: { id: game.home_team.abbreviation } };
    return game.plays
      .map((play) => ({ raw: play, narrative: parsePlayNarrative(normalizeBdlScorePlay(play, context)) }))
      .filter(({ narrative }) => !narrative.confident)
      .map(({ raw }) => `${raw.type_slug}: ${raw.short_text}`);
  });
  assert.deepEqual(unparsed, []);
});

test('a completed pass names the passer, receiver, and tackler', () => {
  const narrative = parsePlayNarrative(findByShortText(423945, 'Pass Complete for 6 Yds to George Pickens'));
  assert.equal(narrative.sentence, 'Dak Prescott found George Pickens for 6 yards, tackled by Q.Mitchell.');
  assert.deepEqual(actorNames(narrative, PLAY_ROLES.PASSER), ['Dak Prescott']);
  assert.deepEqual(actorNames(narrative, PLAY_ROLES.RECEIVER), ['George Pickens']);
  assert.deepEqual(actorNames(narrative, PLAY_ROLES.TACKLER), ['Q.Mitchell']);
  assert.equal(narrative.yards, 6);
});

test('a sack credits the defender and reports negative yardage', () => {
  const narrative = parsePlayNarrative(findByShortText(423945, 'Sacked by Marshawn Kneeland'));
  assert.equal(narrative.sentence, 'Marshawn Kneeland sacked Jalen Hurts for a loss of 8 yards.');
  assert.deepEqual(actorNames(narrative, PLAY_ROLES.SACKER), ['Marshawn Kneeland']);
  assert.equal(narrative.yards, -8);
});

test('a rushing touchdown reads as a score and carries the extra point', () => {
  const narrative = parsePlayNarrative(findByShortText(423945, 'Saquon Barkley 10 Yd Rush'));
  assert.equal(narrative.playKind, 'touchdown');
  assert.equal(narrative.label, 'Touchdown');
  assert.equal(narrative.sentence, 'Saquon Barkley ran it in from 10 yards out.');
  assert.deepEqual(actorNames(narrative, PLAY_ROLES.KICKER), ['Jake Elliott']);
});

test("a penalty does not absorb the penalized player's name into the receiver's", () => {
  // short_text appends "Adoree' Jackson 0 Yd Pnlty" with no delimiter, so a
  // naive split yields the receiver "CeeDee Lamb Adoree'".
  const narrative = parsePlayNarrative(findByShortText(423945, "CeeDee Lamb Adoree' Jackson 0 Yd Pnlty"));
  assert.deepEqual(actorNames(narrative, PLAY_ROLES.RECEIVER), ['CeeDee Lamb']);
  assert.deepEqual(actorNames(narrative, PLAY_ROLES.PENALIZED), ['A.Jackson']);
  assert.equal(narrative.penalty.infraction, 'Defensive Pass Interference');
});

test('a generational suffix does not break the penalized-name split', () => {
  const narrative = parsePlayNarrative(findByShortText(423948, 'David Njoku Harold Fannin Jr.'));
  assert.deepEqual(actorNames(narrative, PLAY_ROLES.RECEIVER), ['David Njoku']);
  assert.deepEqual(actorNames(narrative, PLAY_ROLES.PENALIZED), ['H.Fannin']);
});

test('a play wiped out by penalty says so and reports no yardage', () => {
  const narrative = parsePlayNarrative(findByShortText(423945, 'Miles Sanders Tyler Smith 10 Yd Pnlty'));
  assert.equal(narrative.negated, true);
  assert.equal(narrative.yards, null);
  assert.match(narrative.sentence, /Wiped out by offensive holding on DAL\.$/);
});

test('a team penalty with no named player still parses', () => {
  const narrative = parsePlayNarrative(findByShortText(423945, 'DAL 5 Yd Pnlty'));
  assert.equal(narrative.confident, true);
  assert.equal(narrative.playKind, 'penalty');
  assert.deepEqual(narrative.actors, []);
});

test('a kickoff with a return credits both the kicker and the returner', () => {
  const narrative = parsePlayNarrative(findByShortText(423945, 'KaVontae Turpin 27 Yd Kickoff Return'));
  assert.deepEqual(actorNames(narrative, PLAY_ROLES.KICKER), ['Jake Elliott']);
  assert.deepEqual(actorNames(narrative, PLAY_ROLES.RETURNER), ['KaVontae Turpin']);
});

test('a fumble names the ball carrier and the recovering defender', () => {
  const narrative = parsePlayNarrative(findByShortText(423945, 'Fumble Quinyon Mitchell'));
  assert.deepEqual(actorNames(narrative, PLAY_ROLES.FUMBLER), ['Miles Sanders']);
  assert.deepEqual(actorNames(narrative, PLAY_ROLES.RECOVERER), ['Quinyon Mitchell']);
});

test('a missed field goal reports the direction it missed', () => {
  const narrative = parsePlayNarrative(findByShortText(423948, 'Missed 36 Yd FG'));
  assert.equal(narrative.sentence, 'Andre Szmyt missed a 36 yard field goal, wide right.');
});

test('administrative stoppages are flagged and carry no actors', () => {
  const timeout = parsePlayNarrative(findByShortText(423945, 'Timeout #1 By Dal'));
  assert.equal(timeout.administrative, true);
  assert.equal(timeout.sentence, 'Timeout, DAL.');
  assert.deepEqual(timeout.actors, []);

  const quarter = parsePlayNarrative(normalizedPlays(423945).find((p) => p.typeSlug === 'end-period'));
  assert.equal(quarter.administrative, true);
  assert.match(quarter.sentence, /^End of the \d(?:st|nd|rd|th) quarter\.$/);
});

test('an unrecognized play is reported as not confident rather than guessed at', () => {
  const narrative = parsePlayNarrative({
    typeSlug: 'rush',
    shortText: 'something the provider has never emitted before',
    rawText: 'something the provider has never emitted before',
  });
  assert.equal(narrative.confident, false);
  assert.equal(narrative.sentence, null);
  assert.deepEqual(narrative.actors, []);
});

test('a play with no short_text falls back rather than parsing the official text', () => {
  const narrative = parsePlayNarrative({ typeSlug: 'rush', shortText: '', rawText: 'J.Williams left tackle for 7 yards.' });
  assert.equal(narrative.confident, false);
});

test('formation notes are not mistaken for tacklers', () => {
  assert.deepEqual(parseTacklers('(Shotgun) J.Williams up the middle to PHI 33 for 3 yards (A.Mukuba).'), ['A.Mukuba']);
  assert.deepEqual(parseTacklers('(No Huddle, Shotgun) D.Prescott pass incomplete short left to C.Lamb.'), []);
  assert.deepEqual(parseTacklers('K.Turpin to DAL 24 for 22 yards (J.Uche; J.Trotter).'), ['J.Uche', 'J.Trotter']);
});

test('trailing clauses after the play are not scanned for tacklers', () => {
  const text = 'J.Battle to CLV 29 for 7 yards (H.Fannin; J.Ford).\nThe Replay Official reviewed the play (J.Jeudy).';
  assert.deepEqual(parseTacklers(text), ['H.Fannin', 'J.Ford']);
});

test('the penalty clause is read out of the official description', () => {
  const penalty = parsePenaltyClause('PENALTY on PHI-Q.Mitchell, Defensive Pass Interference, 34 yards, enforced at DAL 12.');
  assert.deepEqual(penalty, {
    team: 'PHI',
    name: 'Q.Mitchell',
    infraction: 'Defensive Pass Interference',
    yards: 34,
    declined: false,
    // The spot the foul was walked off from, and whether the down it was called
    // on counted. Playback marches the ball between the two, so both are read
    // off the clause rather than guessed from the yardage.
    enforcedAt: 'DAL 12',
    noPlay: false,
  });
  const wiped = parsePenaltyClause('PENALTY on DAL-T.Smith, Offensive Holding, 10 yards, enforced at PHI 33 - No Play.');
  assert.equal(wiped.noPlay, true);
  assert.equal(wiped.enforcedAt, 'PHI 33');
  assert.equal(parsePenaltyClause('J.Williams left tackle to PHI 46 for 7 yards.'), null);
});
