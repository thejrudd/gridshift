import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildPlayerNameIndex,
  getNameVariants,
  lookupPlayerByName,
  normalizePlayerName,
} from '../../src/utils/nflPlays/playerNameIndex.js';
import { buildStarterNameIndex } from '../../src/utils/livePlaysFeed.js';
import { normalizeName } from '../../src/utils/liveScoringFeed.js';
import { toParticipantIndex } from '../../src/utils/nflPlays/participants.js';
import { normalizeBdlScorePlay } from '../../src/utils/balldontlieNflScoreboard.js';
import { parsePlayNarrative } from '../../src/utils/nflPlays/playNarrative.js';
import { deriveEspnEventId } from '../../src/utils/nflPlays/participants.js';

const PLAYS = JSON.parse(fs.readFileSync(new URL('../fixtures/bdlNflPlays.json', import.meta.url), 'utf8'));
const PARTICIPANTS = JSON.parse(fs.readFileSync(new URL('../fixtures/espnGameParticipants.json', import.meta.url), 'utf8'));

const ROSTER = [
  { id: 1, name: 'Saquon Barkley', team: 'PHI', position: 'RB' },
  { id: 2, name: "Adoree' Jackson", team: 'PHI', position: 'CB' },
  { id: 3, name: 'Tyler Smith', team: 'DAL', position: 'OL' },
  { id: 4, name: 'Nolan Smith Jr.', team: 'PHI', position: 'DE' },
  { id: 5, name: 'Philadelphia Eagles', team: 'PHI', position: 'DEF' },
];

test('names normalize past diacritics, punctuation, and generational suffixes', () => {
  assert.equal(normalizePlayerName("Adoree' Jackson"), 'adoree jackson');
  assert.equal(normalizePlayerName('José Álvarez Jr.'), 'jose alvarez');
  assert.equal(normalizePlayerName('Amon-Ra St. Brown'), 'amon ra st brown');
});

test('a name indexes under every form play text might use', () => {
  assert.deepEqual(getNameVariants('saquon barkley'), ['saquon barkley', 's barkley', 'sbarkley', 'barkley']);
  assert.deepEqual(getNameVariants('philadelphia'), ['philadelphia']);
  assert.deepEqual(getNameVariants(''), []);
});

test('abbreviated names in play text resolve to the right player', () => {
  const index = buildPlayerNameIndex(ROSTER);
  assert.equal(lookupPlayerByName(index, 'S.Barkley')?.name, 'Saquon Barkley');
  assert.equal(lookupPlayerByName(index, 'A.Jackson')?.name, "Adoree' Jackson");
  assert.equal(lookupPlayerByName(index, 'Saquon Barkley')?.name, 'Saquon Barkley');
});

test('a shared surname is left unresolved rather than attributed to the wrong player', () => {
  const index = buildPlayerNameIndex(ROSTER);
  assert.equal(lookupPlayerByName(index, 'Smith'), null);
  assert.equal(lookupPlayerByName(index, 'T.Smith')?.name, 'Tyler Smith');
  assert.equal(lookupPlayerByName(index, 'N.Smith')?.name, 'Nolan Smith Jr.');
});

test('a single owner is rejected when the requested team does not match', () => {
  const index = buildPlayerNameIndex(ROSTER);
  // Saquon Barkley is the only owner of "S.Barkley" in ROSTER, but he's PHI —
  // asking for CAR must not fall back to the sole owner.
  assert.equal(lookupPlayerByName(index, 'S.Barkley', { team: 'CAR' }), null);
  assert.equal(lookupPlayerByName(index, 'S.Barkley', { team: 'PHI' })?.name, 'Saquon Barkley');
});

test('a single owner with no team on file still matches regardless of the requested team', () => {
  const roster = [{ id: 1, name: 'Byron Young', team: null, position: 'LB' }];
  const index = buildPlayerNameIndex(roster);
  assert.equal(lookupPlayerByName(index, 'B.Young', { team: 'CAR' })?.name, 'Byron Young');
});

test('a lookup with no team requested keeps matching a sole owner regardless of team', () => {
  const index = buildPlayerNameIndex(ROSTER);
  assert.equal(lookupPlayerByName(index, 'S.Barkley')?.name, 'Saquon Barkley');
});

test('an unknown name resolves to nothing', () => {
  const index = buildPlayerNameIndex(ROSTER);
  assert.equal(lookupPlayerByName(index, 'Nobody Here'), null);
  assert.equal(lookupPlayerByName(index, ''), null);
});

test('team defenses are indexed by team', () => {
  const index = buildPlayerNameIndex(ROSTER);
  assert.deepEqual([...(index.teamDefenseIds.get('PHI') ?? [])], [5]);
});

test('the Fantasy Live adapter keeps its existing index shape and behavior', () => {
  const index = buildStarterNameIndex([
    { id: 'a', player: { full_name: 'Saquon Barkley', team: 'PHI', position: 'RB' } },
    { id: 'b', player: { first_name: 'Tyler', last_name: 'Smith', team: 'DAL', position: 'OL' } },
    { id: 'c', player: { full_name: 'Nolan Smith', team: 'PHI', position: 'DE' } },
    { id: 'd', player: null },
  ]);
  assert.deepEqual(index.index.get('s barkley'), ['a']);
  assert.deepEqual(index.index.get('sbarkley'), ['a']);
  assert.deepEqual(index.index.get('barkley'), ['a']);
  // Ambiguous bare surnames are dropped; the initialed forms survive.
  assert.equal(index.index.get('smith'), undefined);
  assert.deepEqual(index.index.get('t smith'), ['b']);
  assert.deepEqual(index.meta.get('a'), { team: 'PHI', position: 'RB', normalizedName: 'saquon barkley' });
});

test('a rostered defender does not absorb a same-initial passer on another team', () => {
  // The bug this exists to prevent: with only Byron Young (LAR, LB) rostered,
  // a Panthers pass by Bryce Young ("B.Young") must not resolve to him.
  const index = buildStarterNameIndex([
    { id: 'byron', player: { full_name: 'Byron Young', team: 'LAR', position: 'LB' } },
  ]);
  assert.equal(lookupPlayerByName(index, 'B.Young', { team: 'CAR', normalize: normalizeName }), null);
});

const WILLIAMS_ROSTER = [
  { id: 'jameson', name: 'Jameson Williams', team: 'DET', position: 'WR' },
];

test('a full first name does not fall back to a same-team, same-initial teammate', () => {
  // The bug this exists to prevent: only Jameson Williams (DET) is rostered.
  // "Dak Prescott found Javonte Williams for a 17-yard touchdown" named a
  // different real player who shares Jameson's initial and last name — the
  // team check alone doesn't catch this when both would be DET, so a full
  // first name that doesn't exactly match must not fall through to the bare
  // "j williams" initial key and grab the sole owner there.
  const index = buildPlayerNameIndex(WILLIAMS_ROSTER, { normalize: normalizeName });
  assert.equal(lookupPlayerByName(index, 'Javonte Williams', { team: 'DET', normalize: normalizeName }), null);
});

test('a full first name matches its own player exactly', () => {
  const index = buildPlayerNameIndex(WILLIAMS_ROSTER, { normalize: normalizeName });
  assert.equal(lookupPlayerByName(index, 'Jameson Williams', { team: 'DET', normalize: normalizeName })?.name, 'Jameson Williams');
});

test('an abbreviated initial still matches, unaffected by the full-first-name check', () => {
  const index = buildPlayerNameIndex(WILLIAMS_ROSTER, { normalize: normalizeName });
  assert.equal(lookupPlayerByName(index, 'J.Williams', { team: 'DET', normalize: normalizeName })?.name, 'Jameson Williams');
});

test('a hyphenated first name resolves both spelled out and abbreviated with an internal period', () => {
  const roster = [{ id: 'stbrown', name: 'Amon-Ra St. Brown', team: 'DET', position: 'WR' }];
  const index = buildPlayerNameIndex(roster, { normalize: normalizeName });
  assert.equal(lookupPlayerByName(index, 'Amon-Ra St. Brown', { normalize: normalizeName })?.name, 'Amon-Ra St. Brown');
  // "A.St. Brown" — the raw first token is just "A" (an initial split off by
  // the period), so this must keep matching like any other abbreviation even
  // though normalizeName's period-stripping merges "a" and "st" into "ast".
  assert.equal(lookupPlayerByName(index, 'A.St. Brown', { normalize: normalizeName })?.name, 'Amon-Ra St. Brown');
});

test('the Fantasy Live adapter carries normalizedName through so the full-first-name check works end to end', () => {
  const index = buildStarterNameIndex([
    { id: 'jameson', player: { full_name: 'Jameson Williams', team: 'DET', position: 'WR' } },
  ]);
  assert.equal(lookupPlayerByName(index, 'Javonte Williams', { team: 'DET', normalize: normalizeName }), null);
  assert.equal(lookupPlayerByName(index, 'Jameson Williams', { team: 'DET', normalize: normalizeName })?.normalizedName, 'jameson williams');
  assert.equal(lookupPlayerByName(index, 'J.Williams', { team: 'DET', normalize: normalizeName })?.normalizedName, 'jameson williams');
});

test('an ESPN event id is derived from a play id, and rejected when the shape changes', () => {
  assert.equal(deriveEspnEventId([{ id: '401772510141' }]), '401772510');
  assert.equal(deriveEspnEventId([{ id: '40177283040' }]), '401772830');
  assert.equal(deriveEspnEventId([{ id: 'abc' }, { id: '12' }]), null);
  assert.equal(deriveEspnEventId([]), null);
});

test('participants are refused when the summary is a different game', () => {
  const payload = PARTICIPANTS.events['401772510'];
  assert.equal(toParticipantIndex(payload, ['KC', 'LAC']), null);
  assert.equal(toParticipantIndex({ athletes: [] }, []), null);
  assert.ok(toParticipantIndex(payload, payload.teams));
});

test('nearly every player named in a real game resolves to a headshot', () => {
  let named = 0;
  let resolved = 0;
  PLAYS.games.forEach((game) => {
    const context = { away: { id: game.visitor_team.abbreviation }, home: { id: game.home_team.abbreviation } };
    const payload = PARTICIPANTS.events[deriveEspnEventId(game.plays)];
    const index = toParticipantIndex(payload, payload.teams);
    game.plays.forEach((raw) => {
      parsePlayNarrative(normalizeBdlScorePlay(raw, context)).actors.forEach((actor) => {
        named += 1;
        if (lookupPlayerByName(index, actor.name)?.imageUrl) resolved += 1;
      });
    });
  });
  // The rest are linemen and special-teamers flagged for penalties who never
  // record a stat, so they never appear in the box score. They fall back to
  // initials, which is the intended behavior.
  assert.ok(named > 600, `expected a meaningful sample, saw ${named}`);
  assert.ok(resolved / named > 0.97, `only ${resolved}/${named} resolved`);
});
