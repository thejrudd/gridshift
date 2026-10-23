// Fantasy Live play pricing against provider rows taken from real 2026 games.
// Each case is a play the feed used to price wrongly; the expected stats are
// what Sleeper's own stat lines credited for that snap.
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPlayEvents, buildStarterNameIndex } from '../../src/utils/livePlaysFeed.js';
import { buildPlayerNameIndex, lookupPlayerByName } from '../../src/utils/nflPlays/playerNameIndex.js';
import { parseFumbleCredit, parsePlayNarrative } from '../../src/utils/nflPlays/playNarrative.js';

function game(id, away, home) {
  return { id, visitor_team: { abbreviation: away }, home_team: { abbreviation: home }, date: '2026-10-18T17:00:00.000Z' };
}

function eventsFor(rows, { plays, gameRecord, scoring = {} }) {
  const index = buildStarterNameIndex(rows.map(({ id, name, position, team }) => ({
    id,
    player: { full_name: name, position, team },
  })));
  const positions = new Map(rows.map(({ id, position }) => [id, position]));
  return buildPlayEvents(
    { [gameRecord.id]: plays },
    index,
    scoring,
    positions,
    new Map([[String(gameRecord.id), gameRecord]]),
  );
}

function statsByPlayer(events) {
  return Object.fromEntries(events.map((event) => [event.playerId, event.stats]));
}

test('a run with a penalty enforced behind it is credited the yards short_text states', () => {
  const events = eventsFor(
    [{ id: 'swift', name: "D'Andre Swift", position: 'RB', team: 'CHI' }],
    {
      gameRecord: game('ne-chi', 'NE', 'CHI'),
      scoring: { rush_yd: 0.1 },
      plays: [{
        id: 'swift-holding',
        type_slug: 'rush',
        team: { abbreviation: 'CHI' },
        text: 'L.Newman reported in as eligible.  D.Swift left end to CHI 26 for 8 yards (C.Woodson).PENALTY on CHI-Z.Thomas, Offensive Holding, 10 yards, enforced at CHI 20.',
        short_text: "D'Andre Swift 2 Yd Rush Zavion Thomas 10 Yd Pnlty",
        stat_yardage: -18,
        period: 4,
        clock_display: '5:27',
      }],
    },
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].stats.rush_yd, 2);
  assert.equal(events[0].pts, 0.2);
});

test('a touchdown with a two-point try credits the scorer, the passer, and the try separately', () => {
  const rows = [
    { id: 'pitts', name: 'Kyle Pitts Sr.', position: 'TE', team: 'ATL' },
    { id: 'penix', name: 'Michael Penix Jr.', position: 'QB', team: 'ATL' },
    { id: 'branch', name: 'Zachariah Branch', position: 'WR', team: 'ATL' },
  ];
  const events = eventsFor(rows, {
    gameRecord: game('atl-chi', 'ATL', 'CHI'),
    scoring: { rec: 1, rec_td: 6, pass_td: 4, pass_2pt: 2, rec_2pt: 2 },
    plays: [{
      id: 'pitts-td',
      type_slug: 'passing-touchdown',
      team: { abbreviation: 'ATL' },
      scoring_play: true,
      text: '(Shotgun) M.Penix pass short left to K.Pitts for 10 yards, TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. M.Penix pass to Z.Branch is complete. ATTEMPT SUCCEEDS.',
      short_text: 'Kyle Pitts Sr. 10 Yd pass from Michael Penix Jr. (Michael Penix Jr. Pass to Zachariah Branch for Two-Point Conversion)',
      stat_yardage: 10,
      period: 2,
      clock_display: '4:10',
    }],
  });
  const stats = statsByPlayer(events);
  assert.equal(stats.pitts.rec_td, 1);
  assert.equal(stats.pitts.rec_yd, 10);
  assert.equal(stats.pitts.rec_2pt, undefined);
  assert.equal(stats.penix.pass_td, 1);
  assert.equal(stats.penix.pass_2pt, 1);
  assert.deepEqual(stats.branch, { rec_2pt: 1 });
});

test('a failed two-point try still leaves the touchdown standing', () => {
  const events = eventsFor(
    [{ id: 'hubbard', name: 'Chuba Hubbard', position: 'RB', team: 'CAR' }],
    {
      gameRecord: game('car-dal', 'CAR', 'DAL'),
      scoring: { rush_td: 6, rush_2pt: 2 },
      plays: [{
        id: 'hubbard-td',
        type_slug: 'rushing-touchdown',
        team: { abbreviation: 'CAR' },
        scoring_play: true,
        text: 'C.Hubbard left end for 1 yard, TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. B.Young pass to J.Metchie is incomplete. ATTEMPT FAILS.',
        short_text: 'Chuba Hubbard 1 Yd Rush (Two-Point Pass Conversion Failed)',
        stat_yardage: 1,
        period: 3,
        clock_display: '2:00',
      }],
    },
  );
  assert.equal(events[0].stats.rush_td, 1);
  assert.equal(events[0].stats.rush_2pt, undefined);
  assert.match(events[0].desc, /Two-point try failed\./);
});

test('a declined penalty never stands in for the play it was called on', () => {
  const narrative = parsePlayNarrative({
    typeSlug: 'passing-touchdown',
    shortText: 'Ryan Flournoy 6 Yd pass from Dak Prescott (Two-Point Pass Conversion Failed)',
    rawText: '(Shotgun) D.Prescott pass short right to R.Flournoy for 6 yards, TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. D.Prescott pass to C.Lamb is incomplete. ATTEMPT FAILS.Penalty on DAL-T.Steele, Offensive Holding, declined.',
    statYardage: 6,
  });
  assert.equal(narrative.playKind, 'touchdown');
  assert.equal(narrative.penalty.declined, true);
});

test('generational suffixes do not hide a starter named by initial in the play text', () => {
  const events = eventsFor(
    [{ id: 'hill', name: 'Anthony Hill Jr.', position: 'LB', team: 'TEN' }],
    {
      gameRecord: game('ind-ten', 'IND', 'TEN'),
      scoring: { idp_tkl_solo: 1.4 },
      plays: [{
        id: 'hill-tackle',
        type_slug: 'rush',
        team: { abbreviation: 'IND' },
        text: 'J.Taylor up the middle to TEN 40 for 3 yards (A.Hill).',
        short_text: 'Jonathan Taylor 3 Yd Rush',
        stat_yardage: 3,
      }],
    },
  );
  assert.deepEqual(events.map((event) => [event.playerId, event.stats.idp_tkl]), [['hill', 1]]);
});

test('two players sharing an initial and surname are told apart by team', () => {
  const index = buildPlayerNameIndex([
    { id: 'byron', name: 'Byron Young', team: 'LAR', position: 'LB' },
    { id: 'bryce', name: 'Bryce Young', team: 'CAR', position: 'QB' },
  ]);
  assert.equal(lookupPlayerByName(index, 'B.Young', { team: 'LAR' })?.id, 'byron');
  assert.equal(lookupPlayerByName(index, 'B.Young', { team: 'CAR' })?.id, 'bryce');
  // The bare surname alone is still too ambiguous to attribute.
  assert.equal(index.index.has('young'), false);
});

test('defensive credits follow the gamebook: pass defended, quarterback hit, split sack', () => {
  const rows = [
    { id: 'benton', name: 'Keeanu Benton', position: 'DL', team: 'PIT' },
    { id: 'diaby', name: 'Yaya Diaby', position: 'DE', team: 'TB' },
    { id: 'allen', name: 'Zach Allen', position: 'DE', team: 'DEN' },
    { id: 'bonitto', name: 'Nik Bonitto', position: 'LB', team: 'DEN' },
  ];
  const scoring = { idp_pd: 5, idp_qbhit: 1, idp_sack: 4, idp_tkl_ast: 0.8, idp_tkl_solo: 1.4 };
  const pit = eventsFor(rows, {
    gameRecord: game('tb-pit', 'TB', 'PIT'),
    scoring,
    plays: [
      {
        id: 'benton-pd',
        type_slug: 'pass-incompletion',
        team: { abbreviation: 'TB' },
        text: '(Shotgun) J.Daniels pass incomplete short right to C.Otton (K.Benton).',
        short_text: 'Jayden Daniels Incomplete Pass, Intended For Cade Otton',
      },
      {
        id: 'diaby-hit',
        type_slug: 'pass-reception',
        team: { abbreviation: 'PIT' },
        text: '(Shotgun) A.Rodgers pass short left to G.Bernard to TB 40 for 2 yards (Y.Diaby) [T.Smith].',
        short_text: 'Aaron Rodgers Pass Complete for 2 Yds to Giovani Bernard',
        stat_yardage: 2,
      },
    ],
  });
  const pitStats = statsByPlayer(pit);
  assert.deepEqual(pitStats.benton, { idp_pd: 1 });
  assert.equal(pitStats.diaby.idp_tkl, 1);

  const den = eventsFor(rows, {
    gameRecord: game('sea-den', 'SEA', 'DEN'),
    scoring,
    plays: [{
      id: 'split-sack',
      type_slug: 'sack',
      team: { abbreviation: 'SEA' },
      text: '(Shotgun) S.Darnold sacked at SEA 33 for -14 yards (sack split by Z.Allen and N.Bonitto).',
      short_text: 'Sam Darnold Sacked by Zach Allen For 14 Yd Loss',
      stat_yardage: -14,
    }],
  });
  const denStats = statsByPlayer(den);
  assert.equal(denStats.allen.idp_sack, 0.5);
  assert.equal(denStats.bonitto.idp_sack, 0.5);
  assert.equal(denStats.bonitto.idp_tkl_loss, undefined);
});

test('a fumble is charged to the ball carrier, and lost only when the other side recovers', () => {
  assert.equal(parseFumbleCredit('(Shotgun) D.Maye pass short right to A.Brown to NYJ 12 for 8 yards (A.Thomas, D.Bailey). FUMBLES (D.Bailey), and recovers at NYJ 12.').fumbledBy, 'A.Brown');
  assert.equal(parseFumbleCredit('W.Lutz kicks 60 yards from DEN 35 to SEA 5. R.Shaheed to SEA 44 for 39 yards (K.Abrams-Draine; Q.Robinson). FUMBLES (K.Abrams-Draine), ball out of bounds at SEA 44.').fumbledBy, 'R.Shaheed');

  const events = eventsFor(
    [{ id: 'penix', name: 'Michael Penix Jr.', position: 'QB', team: 'ATL' }],
    {
      gameRecord: game('atl-chi', 'ATL', 'CHI'),
      scoring: { pass_sack: -2, fum: -2.5, fum_lost: -1.5 },
      plays: [
        {
          id: 'own-recovery',
          type_slug: 'fumble-recovery-own',
          team: { abbreviation: 'ATL' },
          text: '(Shotgun) M.Penix sacked at ATL 2 for -8 yards (K.Gordon). FUMBLES (K.Gordon), recovered by ATL-R.Neuzil at ATL 3.',
          short_text: 'Michael Penix Jr. Sacked Michael Penix Jr. Fumble Ryan Neuzil 0 Yd Fumble Recovery by Kyler Gordon For 7 Yd Loss',
          period: 1,
          clock_display: '9:00',
        },
        {
          id: 'lost',
          type_slug: 'sack-opp-fumble-recovery',
          // The provider names the side that ends up with the ball.
          team: { abbreviation: 'CHI' },
          text: '(Shotgun) M.Penix sacked at ATL 14 for -8 yards (K.Gordon). FUMBLES (K.Gordon) [K.Gordon], RECOVERED by CHI-D.Bush at ATL 28. D.Bush to ATL 28 for no gain (M.Bergeron).',
          short_text: 'Michael Penix Jr. Sacked Michael Penix Jr. Fumble Devin Bush 0 Yd Fumble Recovery',
          period: 4,
          clock_display: '1:00',
        },
      ],
    },
  );
  const byId = Object.fromEntries(events.map((event) => [event.id, event]));
  assert.deepEqual(byId['play-own-recovery-penix'].stats, { pass_sack: 1, fum: 1 });
  assert.deepEqual(byId['play-lost-penix'].stats, { pass_sack: 1, fum: 1, fum_lost: 1 });
});

test('team defenses score kick return yards and coverage tackles', () => {
  const rows = [
    { id: 'TB', name: 'Tampa Bay Buccaneers', position: 'DEF', team: 'TB' },
    { id: 'PIT', name: 'Pittsburgh Steelers', position: 'DEF', team: 'PIT' },
  ];
  const events = eventsFor(rows, {
    gameRecord: game('tb-pit', 'TB', 'PIT'),
    scoring: { def_kr_yd: 0.1, def_st_tkl_solo: 0.5 },
    plays: [{
      id: 'kick',
      type_slug: 'kickoff',
      team: { abbreviation: 'TB' },
      text: 'C.Boswell kicks 60 yards from PIT 35 to TB 5. T.Johnson to TB 30 for 25 yards (D.Slaughter).',
      short_text: 'Chris Boswell 60 Yd Kickoff Tyler Johnson 25 Yd Kickoff Return',
    }],
  });
  const stats = statsByPlayer(events);
  assert.deepEqual(stats.TB, { def_kr_yd: 25 });
  assert.deepEqual(stats.PIT, { def_st_tkl_solo: 1 });
});

test('a game milestone is earned on the play that reaches it', () => {
  const plays = Array.from({ length: 20 }, (_, index) => ({
    id: `carry-${index + 1}`,
    sequence: index + 1,
    type_slug: 'rush',
    team: { abbreviation: 'CHI' },
    text: `D.Swift up the middle to CHI 30 for ${index === 19 ? 0 : 1} yard (C.Woodson).`,
    short_text: `D'Andre Swift ${index === 19 ? 0 : 1} Yd Rush`,
    stat_yardage: index === 19 ? 0 : 1,
    period: 1 + Math.floor(index / 5),
    clock_display: `${14 - (index % 5)}:00`,
  }));
  const events = eventsFor(
    [{ id: 'swift', name: "D'Andre Swift", position: 'RB', team: 'CHI' }],
    { gameRecord: game('ne-chi', 'NE', 'CHI'), scoring: { rush_yd: 0.1, bonus_rush_att_20: 1 }, plays },
  );
  const twentieth = events.find((event) => event.id === 'play-carry-20-swift');
  // A no-gain carry is worth nothing on its own; the bonus keeps it in the feed.
  assert.equal(twentieth?.stats.bonus_rush_att_20, 1);
  assert.equal(twentieth.pts, 1);
  assert.equal(events.filter((event) => event.stats.bonus_rush_att_20).length, 1);
});

test('a flag after the play leaves the player the whole gain and none of the penalty yards', () => {
  const events = eventsFor(
    [{ id: 'golden', name: 'Matthew Golden', position: 'WR', team: 'GB' }],
    {
      gameRecord: game('gb-dal', 'GB', 'DAL'),
      scoring: { rec: 1, rec_yd: 0.1 },
      plays: [{
        id: 'golden-taunt',
        type_slug: 'pass-reception',
        team: { abbreviation: 'GB' },
        text: '(Shotgun) J.Love pass deep right to M.Golden to DAL 9 for 37 yards (D.Bland).PENALTY on GB-M.Golden, Taunting, 15 yards, enforced at DAL 9.',
        short_text: 'Jordan Love Pass Complete for 37 Yds to Matthew Golden Matthew Golden 15 Yd Pnlty',
        stat_yardage: 7,
      }],
    },
  );
  assert.equal(events[0].stats.rec_yd, 37);
});

test('an offensive flag after a fourth-down conversion does not hand the ball to the defense', () => {
  const events = eventsFor(
    [{ id: 'flournoy', name: 'Ryan Flournoy', position: 'WR', team: 'DAL' }],
    {
      gameRecord: game('dal-gb', 'DAL', 'GB'),
      scoring: { rec: 1, rec_yd: 0.1, rec_fd: 0.5 },
      plays: [{
        id: 'flournoy-4th',
        type_slug: 'pass-reception',
        team: { abbreviation: 'DAL' },
        text: '(Shotgun) D.Prescott pass short left to R.Flournoy to GB 12 for 11 yards (C.Valentine; J.Bullard).PENALTY on DAL-T.Booker, Unnecessary Roughness, 15 yards, enforced at GB 12.',
        short_text: 'Dak Prescott Pass Complete for 11 Yds to Ryan Flournoy Tyler Booker 15 Yd Pnlty',
        stat_yardage: -19,
        start_down: 4,
        start_distance: 5,
        end_down: 1,
        end_distance: 10,
      }],
    },
  );
  assert.deepEqual(events[0]?.stats, { rec: 1, rec_yd: 11, rec_fd: 1 });
});

test('an automatic first down from a defensive flag is not the runner\'s first down', () => {
  const events = eventsFor(
    [{ id: 'kamara', name: 'Alvin Kamara', position: 'RB', team: 'NO' }],
    {
      gameRecord: game('no-nyg', 'NO', 'NYG'),
      scoring: { rush_yd: 0.1, rush_fd: 0.5 },
      plays: [{
        id: 'kamara-short',
        type_slug: 'rush',
        team: { abbreviation: 'NO' },
        text: 'A.Kamara up the middle to NYG 40 for 3 yards (B.Okereke).PENALTY on NYG-D.Banks, Defensive Holding, 5 yards, enforced at NYG 40.',
        short_text: 'Alvin Kamara 3 Yd Rush Deonte Banks 5 Yd Pnlty',
        stat_yardage: 8,
        start_down: 3,
        start_distance: 6,
        end_down: 1,
        end_distance: 10,
      }],
    },
  );
  assert.deepEqual(events[0]?.stats, { rush_att: 1, rush_yd: 3 });
});

test('a scoring play breakdown prices each stat and always sums to the points shown', async () => {
  const { buildPlayPointsBreakdown } = await import('../../src/utils/matchupPlayBreakdown.js');
  const scoring = { rush_yd: 0.1, bonus_rush_att_20: 1, idp_tkl_solo: 1.4, idp_tkl_ast: 0.8 };
  const carry = buildPlayPointsBreakdown(
    { position: 'RB', pts: 1.4, rawPts: 1.4, stats: { rush_att: 1, rush_yd: 4, bonus_rush_att_20: 1 } },
    scoring,
  );
  assert.deepEqual(carry.rows.map(({ key, statVal, pts }) => [key, statVal, pts]), [
    ['bonus_rush_att_20', 1, 1],
    ['rush_yd', 4, 0.4],
  ]);

  // A generic tackle shows as the assisted tackle it was priced as, and the
  // reconciliation residual gets its own row so the card adds up.
  const tackle = buildPlayPointsBreakdown(
    {
      position: 'LB',
      pts: 1.8,
      rawPts: 0.8,
      adjustment: 1,
      stats: { idp_tkl: 1 },
      play: { defensiveActors: [{ role: 'tackler' }, { role: 'tackler' }] },
    },
    scoring,
  );
  assert.deepEqual(tackle.rows.map(({ key, pts }) => [key, pts]), [['idp_tkl_ast', 0.8], ['official_adjustment', 1]]);
  assert.equal(tackle.rows.reduce((sum, row) => sum + row.pts, 0), tackle.total);
});
