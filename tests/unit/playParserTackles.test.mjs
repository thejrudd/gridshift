// Tackle credit from the gamebook, checked against Sleeper's stat lines for
// completed 2026 weeks. Each case is a real provider row; the expected credit
// is what Sleeper's final line for that game shows.
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPlayEvents, buildStarterNameIndex } from '../../src/utils/livePlaysFeed.js';
import { buildPlayerNameIndex, lookupPlayerByName } from '../../src/utils/nflPlays/playerNameIndex.js';
import { parsePlayNarrative, parseTacklers, parseTackleShares } from '../../src/utils/nflPlays/playNarrative.js';
import { getPricedTackleKey } from '../../src/utils/playByPlay/playStatDelta.js';
import { buildPlayPointsBreakdown } from '../../src/utils/matchupPlayBreakdown.js';

function game(id, away, home) {
  return { id, visitor_team: { abbreviation: away }, home_team: { abbreviation: home }, date: '2026-10-04T17:00:00.000Z' };
}

function eventsFor(rows, { plays, gameRecord, scoring }) {
  const index = buildStarterNameIndex(rows.map(({ id, name, position, team }) => ({ id, player: { full_name: name, position, team } })));
  return buildPlayEvents(
    { [gameRecord.id]: plays },
    index,
    scoring,
    new Map(rows.map(({ id, position }) => [id, position])),
    new Map([[String(gameRecord.id), gameRecord]]),
  );
}

const byPlayer = (events) => Object.fromEntries(events.map((event) => [event.playerId, event]));
const SPLIT_SCORING = { idp_tkl_solo: 1, idp_tkl_ast: 0.5 };

test('a tackle group naming a spaced surname keeps every tackler', () => {
  // 2026 week 3, MIN at TB: Sleeper credits K.Van Noy 5 tackles; the group
  // used to fail whole on "Van Noy" and drop both defenders.
  assert.deepEqual(
    parseTacklers('B.Irving right guard to MIN 44 for 3 yards (K.Van Noy; B.Cashman).'),
    ['K.Van Noy', 'B.Cashman'],
  );
});

test('"(A, B)" is a solo tackle for A and an assist for B; "(A; B)" is two assists', () => {
  // 2026 week 4, MIA at MIN: Sleeper gives Van Noy the solo tackle and
  // Van Ginkel the assist on this snap.
  assert.deepEqual(parseTackleShares('J.Wright left end to MIA 26 for -1 yards (K.Van Noy, A.Van Ginkel).'), [
    { name: 'K.Van Noy', share: 'solo' },
    { name: 'A.Van Ginkel', share: 'assisted' },
  ]);
  assert.deepEqual(parseTackleShares('C.Heyward up the middle to MIA 33 for 1 yard (J.Rodriguez; C.Johnson).').map((entry) => entry.share), ['assisted', 'assisted']);
  assert.deepEqual(parseTackleShares('A.Jeanty right end pushed ob at LV 30 for no gain (D.Williams).'), [{ name: 'D.Williams', share: 'solo' }]);

  const events = byPlayer(eventsFor([
    { id: 'wright', name: 'Jaylen Wright', position: 'RB', team: 'MIA' },
    { id: 'vannoy', name: 'Kyle Van Noy', position: 'LB', team: 'MIN' },
    { id: 'vanginkel', name: 'Andrew Van Ginkel', position: 'LB', team: 'MIN' },
  ], {
    gameRecord: game('mia-min', 'MIA', 'MIN'),
    scoring: SPLIT_SCORING,
    plays: [{ id: 'comma', type_slug: 'rush', team: { abbreviation: 'MIA' }, stat_yardage: -1,
      text: 'J.Wright left end to MIA 26 for -1 yards (K.Van Noy, A.Van Ginkel).',
      short_text: 'Jaylen Wright Rush, Loss of 1 Yd' }],
  }));
  assert.equal(events.vannoy.tackleShare, 'solo');
  assert.equal(events.vannoy.pts, 1);
  assert.equal(events.vanginkel.tackleShare, 'assisted');
  assert.equal(events.vanginkel.pts, 0.5);
  const card = buildPlayPointsBreakdown({ ...events.vannoy, rawPts: events.vannoy.pts }, SPLIT_SCORING);
  assert.deepEqual(card.rows.map((row) => row.key), ['idp_tkl_solo']);
  assert.equal(getPricedTackleKey(events.vannoy.play, { idp_tkl: 1 }, SPLIT_SCORING, 'assisted'), 'idp_tkl_ast');
});

test('a reversed play credits the tacklers of the corrected version', () => {
  // 2026 week 1, MIA at LV: Sleeper credits Rodriguez and C.Johnson, and gives
  // W.Gay (one assisted tackle all game) nothing on this snap.
  const text = 'C.Heyward up the middle to MIA 34 for no gain (W.Gay; Z.Anderson).The Replay Official reviewed the short of the line to gain ruling, and the play was REVERSED.C.Heyward up the middle to MIA 33 for 1 yard (J.Rodriguez; C.Johnson).';
  const narrative = parsePlayNarrative({ typeSlug: 'rush', shortText: 'Connor Heyward 1 Yd Rush', rawText: text, statYardage: 1 });
  assert.deepEqual(narrative.actors.filter((actor) => actor.role === 'tackler').map((actor) => actor.name), ['J.Rodriguez', 'C.Johnson']);
});

test('the gamebook\'s longer prefix and half a hyphenated surname resolve to the right teammate', () => {
  const normalize = (value) => String(value ?? '').toLowerCase().replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const index = buildPlayerNameIndex([
    { id: 'mack', name: 'Mack Wilson', team: 'ARI', position: 'LB' },
    { id: 'michael', name: 'Michael Wilson', team: 'ARI', position: 'WR' },
    { id: 'terrell', name: 'A.J. Terrell', team: 'ATL', position: 'CB' },
    { id: 'josephday', name: 'Sebastian Joseph-Day', team: 'PIT', position: 'DT' },
    { id: 'dorian', name: 'Dorian Williams', team: 'BUF', position: 'LB' },
    { id: 'daryl', name: 'Daryl Williams', team: 'BUF', position: 'OL' },
  ], { normalize });
  // 2026 weeks 1–10: Sleeper credits Mack Wilson every "Ma.Wilson" tackle.
  assert.equal(lookupPlayerByName(index, 'Ma.Wilson', { team: 'ARI', normalize })?.id, 'mack');
  assert.equal(lookupPlayerByName(index, 'Mi.Wilson', { team: 'ARI', normalize })?.id, 'michael');
  assert.equal(lookupPlayerByName(index, 'Aj.Terrell', { team: 'ATL', normalize })?.id, 'terrell');
  // 2026 week 5, IND at PIT: "S.Joseph" is Joseph-Day, 3 tackles in Sleeper's line.
  assert.equal(lookupPlayerByName(index, 'S.Joseph', { team: 'PIT', normalize })?.id, 'josephday');
  // "D.Williams" fits both; a defensive credit takes the defender.
  assert.equal(lookupPlayerByName(index, 'D.Williams', { team: 'BUF', normalize }), null);
  assert.equal(lookupPlayerByName(index, 'D.Williams', { team: 'BUF', normalize, prefer: (record) => record.position === 'LB' })?.id, 'dorian');
});

test('an offensive lineman who tackles a fumble returner is credited the tackle', () => {
  // 2026 week 1, DAL at NYG: Sleeper credits Andrew Thomas idp_tkl 1 (solo).
  const events = byPlayer(eventsFor([
    { id: 'tracy', name: 'Tyrone Tracy Jr.', position: 'RB', team: 'NYG' },
    { id: 'revel', name: 'Shavon Revel Jr.', position: 'DB', team: 'DAL' },
    { id: 'thomas', name: 'Andrew Thomas', position: 'OL', team: 'NYG' },
  ], {
    gameRecord: game('dal-nyg', 'DAL', 'NYG'),
    scoring: { ...SPLIT_SCORING, idp_fr: 2 },
    plays: [{ id: 'return', type_slug: 'fumble-recovery-opponent', team: { abbreviation: 'DAL' }, stat_yardage: -3,
      text: '(Shotgun) T.Tracy left end to DAL 21 for 8 yards (Q.Williams). FUMBLES (Q.Williams), RECOVERED by DAL-S.Revel at DAL 19. S.Revel to DAL 16 for -3 yards (A.Thomas).',
      short_text: 'Tyrone Tracy Jr. 8 Yd Rush Tyrone Tracy Jr. Fumble Shavon Revel Jr. -3 Yd Fumble Recovery' }],
  }));
  assert.equal(events.thomas.role, 'defense');
  assert.deepEqual(events.thomas.stats, { idp_tkl: 1 });
  assert.equal(events.thomas.tackleShare, 'solo');
});
