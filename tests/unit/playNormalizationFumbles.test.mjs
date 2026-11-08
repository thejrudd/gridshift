import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeBdlScorePlay } from '../../src/utils/balldontlieNflScoreboard.js';
import { parsePlayNarrative } from '../../src/utils/nflPlays/playNarrative.js';
import { normalizeCanonicalPlay } from '../../src/utils/playByPlay/normalizePlay.js';
import {
  buildPlayEvents,
  buildStarterNameIndex,
  groupSharedPlayEvents,
} from '../../src/utils/livePlaysFeed.js';

// Provider rows from the 2026 season (weeks 6-9), trimmed to the fields read.
const JAX_BAL = { id: 'jax-bal', visitor_team: { abbreviation: 'JAX' }, home_team: { abbreviation: 'BAL' } };

const HUNTER_FUMBLE = {
  id: 'hunter-fumble',
  type_slug: 'fumble-recovery-opponent',
  team: { abbreviation: 'BAL' },
  period: 3,
  clock_display: '5:15',
  text: '(Shotgun) T.Lawrence pass short left to T.Hunter to JAX 48 for -3 yards (M.Starks). FUMBLES (M.Starks), RECOVERED by BLT-T.Buchanan at 50.',
  short_text: 'Trevor Lawrence Pass Complete for Loss of 1 Yd to Travis Hunter Travis Hunter Fumble Teddye Buchanan 0 Yd Fumble Recovery',
  stat_yardage: 0,
  start_down: 2,
  start_distance: 1,
  end_down: 1,
  scoring_play: false,
};

const SCORING = {
  pass_yd: 0.04, rec: 1, rec_yd: 0.1, rec_fd: 0.5, fum: -1, fum_lost: -2,
  idp_tkl_solo: 1, idp_ff: 3, idp_fr: 2, def_ff: 1, def_fr: 2, kr_yd: 0.04, pr_yd: 0.04,
  pass_int: -2, idp_int: 3, idp_sack: 2, def_kr_yd: 0.04,
};

const starter = (id, full_name, position, team) => ({ id, player: { full_name, position, team } });

function eventsFor(plays, starters, game) {
  return buildPlayEvents(
    { [game.id]: plays },
    buildStarterNameIndex(starters),
    SCORING,
    new Map(starters.map((row) => [row.id, row.player.position])),
    new Map([[game.id, game]]),
  );
}

const statsOf = (events, playerId) => events.find((event) => event.playerId === playerId)?.stats;

test('a catch that ends in a lost fumble reads as the catch plus the fumble', () => {
  const play = normalizeCanonicalPlay(HUNTER_FUMBLE, { gameId: 'jax-bal', homeTeam: 'BAL', awayTeam: 'JAX' });
  // The official description's -3, not the compact text's "Loss of 1".
  assert.equal(play.narrative.sentence, 'Trevor Lawrence found Travis Hunter for a loss of 3 yards. M.Starks forced a fumble, recovered by Teddye Buchanan.');
  assert.equal(play.narrative.label, 'Fumble');
  assert.equal(play.offenseTeam, 'JAX');
  assert.deepEqual(
    play.narrative.actors.map(({ role, name }) => `${role}:${name}`),
    ['passer:Trevor Lawrence', 'receiver:Travis Hunter', 'recoverer:Teddye Buchanan', 'tackler:M.Starks'],
  );
});

test('Statistics and Fantasy Live read the same sentence from the shared engine', () => {
  // Statistics Scores parses its own play shape through the same parser.
  const scores = parsePlayNarrative(normalizeBdlScorePlay(HUNTER_FUMBLE, { id: 'jax-bal' }));
  const [live] = eventsFor([HUNTER_FUMBLE], [starter('hunter', 'Travis Hunter', 'WR', 'JAX')], JAX_BAL);
  assert.equal(scores.sentence, live.desc);
});

test('both managers scoring on the same fumble get their own rows with the right players', () => {
  const starters = [
    starter('lawrence', 'Trevor Lawrence', 'QB', 'JAX'),
    starter('hunter', 'Travis Hunter', 'WR', 'JAX'),
    starter('starks', 'Malaki Starks', 'DB', 'BAL'),
    starter('buchanan', 'Teddye Buchanan', 'LB', 'BAL'),
  ];
  const events = eventsFor([HUNTER_FUMBLE], starters, JAX_BAL);
  const sides = { lawrence: 'a', hunter: 'a', starks: 'b', buchanan: 'b' };

  // The catch is charged with the fumble, not a first down the defense earned.
  assert.deepEqual(statsOf(events, 'hunter'), { fum: 1, fum_lost: 1, rec: 1, rec_yd: -3, rec_0_4: 1 });
  assert.equal(statsOf(events, 'lawrence').pass_yd, -3);
  assert.equal(statsOf(events, 'starks').idp_ff, 1);
  assert.equal(statsOf(events, 'starks').idp_tkl, 1);
  assert.deepEqual(statsOf(events, 'buchanan'), { idp_fr: 1 });

  const grouped = groupSharedPlayEvents(events, (event) => sides[event.playerId]);
  assert.equal(grouped.length, 2);
  const bySide = Object.fromEntries(grouped.map((row) => [sides[row.contributors[0].playerId], row]));
  assert.deepEqual(bySide.a.contributors.map((c) => c.playerId).sort(), ['hunter', 'lawrence']);
  assert.deepEqual(bySide.b.contributors.map((c) => c.playerId).sort(), ['buchanan', 'starks']);
  // One snap, one sentence on both sides of the matchup.
  assert.equal(bySide.a.desc, bySide.b.desc);
  assert.equal(bySide.a.desc, 'Trevor Lawrence found Travis Hunter for a loss of 3 yards. M.Starks forced a fumble, recovered by Teddye Buchanan.');
});

test('a lost fumble after a long catch credits the catch, not the recovery return', () => {
  const play = {
    id: 'douglas-fumble',
    type_slug: 'fumble-recovery-opponent',
    team: { abbreviation: 'NYJ' },
    text: '(Shotgun) D.Maye pass deep right to D.Douglas to NYJ 33 for 39 yards (J.Sherwood). FUMBLES (J.Sherwood), RECOVERED by NYJ-M.Fitzpatrick at NYJ 25. M.Fitzpatrick pushed ob at NYJ 45 for 20 yards (H.Henry).',
    short_text: 'Drake Maye Pass Complete for 39 Yds to DeMario Douglas DeMario Douglas Fumble Minkah Fitzpatrick 20 Yd Fumble Recovery',
    stat_yardage: 20,
    start_distance: 10,
  };
  const game = { id: 'ne-nyj', visitor_team: { abbreviation: 'NE' }, home_team: { abbreviation: 'NYJ' } };
  const events = eventsFor([play], [
    starter('douglas', 'DeMario Douglas', 'WR', 'NE'),
    starter('fitzpatrick', 'Minkah Fitzpatrick', 'DB', 'NYJ'),
  ], game);
  assert.equal(statsOf(events, 'douglas').rec_yd, 39);
  assert.equal(statsOf(events, 'douglas').rec_fd, 1);
  assert.deepEqual(statsOf(events, 'fitzpatrick'), { idp_fr: 1, idp_fr_yd: 20 });
  assert.equal(events[0].play.narrative.sentence,
    'Drake Maye found DeMario Douglas for 39 yards. J.Sherwood forced a fumble, recovered by Minkah Fitzpatrick, who returned it 20 yards.');
});

test('a kickoff fumble the kicking team recovers keeps the returner on the receiving side', () => {
  const play = {
    id: 'branch-kickoff',
    type_slug: 'kickoff',
    team: { abbreviation: 'CHI' },
    text: 'C.Santos kicks 62 yards from CHI 35 to ATL 3. Z.Branch to ATL 29 for 26 yards (Z.Scott). FUMBLES (Z.Scott), touched at ATL 31, RECOVERED by CHI-N.McCloud at ATL 31.',
    short_text: 'Zachariah Branch Fumble Nick McCloud 0 Yd Fumble Recovery Cairo Santos 62 Yd Kickoff Zachariah Branch 26 Yd Kickoff Return',
    stat_yardage: 0,
  };
  const canonical = normalizeCanonicalPlay(play, { homeTeam: 'ATL', awayTeam: 'CHI' });
  assert.equal(canonical.offenseTeam, 'CHI');
  assert.equal(canonical.defenseTeam, 'ATL');
  const game = { id: 'chi-atl', visitor_team: { abbreviation: 'CHI' }, home_team: { abbreviation: 'ATL' } };
  const events = eventsFor([play], [
    starter('branch', 'Zachariah Branch', 'WR', 'ATL'),
    starter('scott', 'Zavier Scott', 'RB', 'CHI'),
  ], game);
  assert.deepEqual(statsOf(events, 'branch'), { kr_yd: 26, fum: 1, fum_lost: 1 });
  // The coverage running back who forced it is credited as in Sleeper's line.
  assert.deepEqual(statsOf(events, 'scott'), { st_tkl_solo: 1, idp_ff: 1, st_ff: 1 });
});

test('an interception returned for no gain still charges the thrower', () => {
  const play = {
    id: 'pierre-pick',
    type_slug: 'pass-interception-return',
    team: { abbreviation: 'MIN' },
    text: '(Shotgun) J.Goff pass short left intended for J.Williams INTERCEPTED by J.Pierre at MIN 46. J.Pierre pushed ob at MIN 46 for no gain (J.Williams).',
    short_text: 'James Pierre  Interception Return, No Gain',
    stat_yardage: 0,
  };
  const game = { id: 'det-min', visitor_team: { abbreviation: 'DET' }, home_team: { abbreviation: 'MIN' } };
  const events = eventsFor([play], [
    starter('goff', 'Jared Goff', 'QB', 'DET'),
    starter('pierre', 'James Pierre', 'DB', 'MIN'),
  ], game);
  // A lone play has no game context for full names, so the official abbreviations stand.
  assert.equal(events[0].play.narrative.sentence, "J.Goff's pass for J.Williams was intercepted by James Pierre at the Minnesota 46.");
  assert.equal(statsOf(events, 'goff').pass_int, 1);
  assert.equal(statsOf(events, 'pierre').idp_int, 1);
});

test('a sack with no yardage in the compact text names the sacker from the gamebook', () => {
  const play = normalizeCanonicalPlay({
    type_slug: 'sack',
    team: { abbreviation: 'CLE' },
    text: ' D.Watson sacked ob at TEN 48 for 0 yards (O.Oladejo).',
    short_text: 'Deshaun Watson Sacked ',
    stat_yardage: 0,
  });
  assert.equal(play.narrative.sentence, 'O.Oladejo sacked Deshaun Watson for no loss.');
});

test('a punt returned for no gain credits no return yards', () => {
  const play = {
    id: 'bachman-punt',
    type_slug: 'punt',
    team: { abbreviation: 'LAR' },
    text: 'B.Gillikin punts 41 yards to LA 14, Center-C.Kreiter. A.Bachman to LA 14 for no gain (K.Crawford; C.Kreiter).',
    short_text: 'Blake Gillikin 41 Yd Punt Alex Bachman Punt Return, No Gain',
    stat_yardage: 0,
  };
  const game = { id: 'ari-lar', visitor_team: { abbreviation: 'ARI' }, home_team: { abbreviation: 'LAR' } };
  const canonical = normalizeCanonicalPlay(play, { homeTeam: 'LAR', awayTeam: 'ARI' });
  assert.equal(canonical.narrative.sentence, 'Blake Gillikin punted 41 yards, returned for no gain by Alex Bachman, tackled by K.Crawford and C.Kreiter.');
  const events = eventsFor([play], [starter('bachman', 'Alex Bachman', 'WR', 'LAR')], game);
  // Worth nothing, so the feed leaves it out rather than crediting the punt's 41 yards.
  assert.equal(statsOf(events, 'bachman'), undefined);
});

test('a snap fumbled before the throw is told first, then the throw', () => {
  const play = normalizeCanonicalPlay({
    type_slug: 'fumble-recovery-own',
    team: { abbreviation: 'TEN' },
    text: '(No Huddle, Shotgun) C.Ward to TEN 24 for -5 yards. FUMBLES, and recovers at TEN 17. C.Ward pass incomplete deep right [M.Murphy].',
    short_text: 'Cam Ward Incomplete Pass Cam Ward Fumble Cam Ward 0 Yd Fumble Recovery Cam Ward Rush, No Gain',
  });
  assert.equal(play.narrative.sentence, 'Cam Ward fumbled the snap and recovered it. Cam Ward threw it away incomplete. Cam Ward was hit by M.Murphy on the throw.');
});

test('a snap fumbled and recovered by the quarterback reads plainly', () => {
  const play = normalizeCanonicalPlay({
    type_slug: 'fumble-recovery-own',
    text: '(Shotgun) C.Williams FUMBLES (Aborted) at CHI 37, and recovers at CHI 34.',
    short_text: 'Caleb Williams Aborted Snap Caleb Williams Fumble Caleb Williams 0 Yd Fumble Recovery',
  });
  assert.equal(play.narrative.sentence, 'Caleb Williams fumbled the snap and recovered it.');
});

test('the end of regulation is an administrative row', () => {
  const play = normalizeCanonicalPlay({ type_slug: 'end-of-regulation', text: 'END QUARTER 4', short_text: 'End Quarter 4' });
  assert.equal(play.narrative.sentence, 'End of regulation.');
});

test('an interception names the thrower, the target, and the spot in full when the game spells them out', async () => {
  const { collectPlayNames } = await import('../../src/utils/nflPlays/playNarrative.js');
  const rows = [
    { type_slug: 'pass-reception', short_text: 'Sam Darnold Pass Complete for 9 Yds to Tory Horton', text: 'S.Darnold pass short left to T.Horton to SEA 40 for 9 yards (P.Surtain).' },
    {
      type_slug: 'pass-interception-return',
      team: { abbreviation: 'DEN' },
      text: '(No Huddle) S.Darnold pass short left intended for T.Horton INTERCEPTED by K.Abrams-Draine at DEN 31. K.Abrams-Draine to DEN 31 for no gain (T.Horton).',
      short_text: 'Kris Abrams-Draine  Interception Return, No Gain',
      stat_yardage: 0,
    },
  ];
  const play = normalizeCanonicalPlay(rows[1], { nameHints: collectPlayNames(rows) });
  assert.equal(play.narrative.sentence, "Sam Darnold's pass for Tory Horton was intercepted by Kris Abrams-Draine at the Denver 31.");
  assert.ok(play.narrative.actors.some((actor) => actor.role === 'passer' && actor.name === 'Sam Darnold'));
});

// ── Special teams, defensive scores, and penalties (Sleeper's own keys) ─────

test('the engine scores Sleeper D/ST special-teams keys from league settings', async () => {
  const { calcPoints, importLeagueScoring } = await import('../../src/utils/scoringEngine.js');
  const scoring = importLeagueScoring({ def_st_td: 6, def_st_ff: 3, def_st_fum_rec: 3, ff: 1, st_ff: 1, st_fum_rec: 1 });
  assert.equal(calcPoints({ def_st_td: 1, def_st_ff: 1, def_st_fum_rec: 1 }, scoring, 'DEF'), 12);
  // Sleeper's D/ST forced fumble is plain `ff`; the live estimate emits `def_ff`.
  assert.equal(calcPoints({ ff: 1 }, scoring, 'DEF'), 1);
  assert.equal(calcPoints({ def_ff: 1 }, scoring, 'DEF'), 1);
  assert.equal(calcPoints({ st_ff: 1, st_fum_rec: 1 }, scoring, 'RB'), 2);
});

test('an offense touchdown never credits the defense that gave it up', async () => {
  const { buildTeamDefensePlayDelta } = await import('../../src/utils/playByPlay/playStatDelta.js');
  const passingTouchdown = {
    type: 'passing-touchdown', scoring: true, yards: 50,
    description: 'Bryce Young found Darren Waller for a 50-yard touchdown.', raw: { text: 'Darren Waller 50 Yd pass from Bryce Young' },
  };
  assert.deepEqual(buildTeamDefensePlayDelta(passingTouchdown), {});
});

test('a kickoff fumble the coverage team recovers credits special-teams stats on both sides', () => {
  const kickoff = {
    id: 'branch-ko', type_slug: 'kickoff', team: { abbreviation: 'CHI' },
    text: 'C.Santos kicks 62 yards from CHI 35 to ATL 3. Z.Branch to ATL 29 for 26 yards (Z.Scott). FUMBLES (Z.Scott), touched at ATL 31, RECOVERED by CHI-N.McCloud at ATL 31.',
    short_text: 'Zachariah Branch Fumble Nick McCloud 0 Yd Fumble Recovery Cairo Santos 62 Yd Kickoff Zachariah Branch 26 Yd Kickoff Return',
    stat_yardage: 0,
  };
  const game = { id: 'chi-atl', visitor_team: { abbreviation: 'CHI' }, home_team: { abbreviation: 'ATL' } };
  const starters = [
    starter('scott', 'Zavier Scott', 'RB', 'CHI'),
    starter('mccloud', 'Nick McCloud', 'CB', 'CHI'),
    { id: 'CHI', player: { first_name: 'Chicago', last_name: 'Bears', position: 'DEF', team: 'CHI' } },
    { id: 'ATL', player: { first_name: 'Atlanta', last_name: 'Falcons', position: 'DEF', team: 'ATL' } },
  ];
  const events = buildPlayEvents(
    { [game.id]: [kickoff] },
    buildStarterNameIndex(starters),
    { st_tkl_solo: 1, st_ff: 1, st_fum_rec: 1, idp_ff: 1, def_st_ff: 1, def_st_fum_rec: 1, def_st_tkl_solo: 1, def_kr_yd: 0.1 },
    new Map(starters.map((row) => [row.id, row.player.position])),
    new Map([[game.id, game]]),
  );
  // As in Sleeper's lines: a running back on coverage earns st_ff and st_tkl_solo.
  assert.deepEqual(statsOf(events, 'scott'), { st_tkl_solo: 1, idp_ff: 1, st_ff: 1 });
  assert.deepEqual(statsOf(events, 'mccloud'), { st_fum_rec: 1 });
  assert.deepEqual(statsOf(events, 'CHI'), { def_st_tkl_solo: 1, def_st_ff: 1, def_st_fum_rec: 1 });
  assert.deepEqual(statsOf(events, 'ATL'), { def_kr_yd: 26 });
});

test('a blocked punt returned for a score is the special-teams touchdown', () => {
  const play = {
    id: 'blocked', type_slug: 'blocked-punt-touchdown', team: { abbreviation: 'TEN' }, scoring_play: true,
    text: 'R.Sanchez punt is BLOCKED by J.Chestnut, Center-L.Rhodes, RECOVERED by TEN-O.Oladejo at IND 14. O.Oladejo for 14 yards, TOUCHDOWN.',
    short_text: 'Oluwafemi Oladejo 14 Yd return of blocked punt (J.Slye kick)',
  };
  const game = { id: 'ten-ind', visitor_team: { abbreviation: 'TEN' }, home_team: { abbreviation: 'IND' } };
  const starters = [
    starter('oladejo', 'Oluwafemi Oladejo', 'DL', 'TEN'),
    { id: 'TEN', player: { first_name: 'Tennessee', last_name: 'Titans', position: 'DEF', team: 'TEN' } },
  ];
  const events = buildPlayEvents(
    { [game.id]: [play] }, buildStarterNameIndex(starters),
    { st_td: 6, def_st_td: 6, blk_kick: 2, def_td: 6, idp_fr: 1 },
    new Map(starters.map((row) => [row.id, row.player.position])), new Map([[game.id, game]]),
  );
  assert.deepEqual(statsOf(events, 'oladejo'), { st_td: 1 });
  assert.deepEqual(statsOf(events, 'TEN'), { blk_kick: 1, def_st_td: 1, blk_kick_ret_td: 1 });
  assert.equal(events[0].play.narrative.sentence, "J.Chestnut blocked R.Sanchez's punt, and Oluwafemi Oladejo returned it 14 yards for a touchdown.");
});

test('a flag on a play that stands names the player, team, number, yards, and next spot', async () => {
  const { buildPlayerNumbers } = await import('../../src/utils/nflPlays/playNarrative.js');
  const play = normalizeCanonicalPlay({
    type_slug: 'pass-reception', team: { abbreviation: 'DEN' },
    text: '(Shotgun) B.Nix pass short right to M.Mims to DEN 29 for 8 yards (B.Murphy).PENALTY on SEA-B.Murphy, Face Mask, 15 yards, enforced at DEN 29.Penalty on SEA-B.Murphy, Defensive Offside, declined.',
    short_text: 'Bo Nix Pass Complete for 8 Yds to Marvin Mims Jr. Byron Murphy II 15 Yd Pnlty',
    end_possession_text: 'DEN 44',
  }, { playerNumbers: buildPlayerNumbers([{ team: 'SEA', name: 'Byron Murphy II', number: 91 }]) });
  // The accepted flag stands even with a declined one on the same snap.
  assert.equal(play.narrative.penalty.declined, false);
  assert.equal(play.narrative.sentence,
    'Bo Nix found Marvin Mims Jr. for 8 yards, tackled by B.Murphy. Byron Murphy II (Seattle, #91) was flagged for a face mask, 15 yards. Ball at the Denver 44.');
});

test('a flag that wipes out a score leads with the score it cost', () => {
  const play = normalizeCanonicalPlay({
    type_slug: 'penalty', team: { abbreviation: 'JAX' },
    text: 'B.Tuten right end for 3 yards, TOUCHDOWN NULLIFIED by Penalty.PENALTY on JAX-B.Strange, Offensive Holding, 10 yards, enforced at HST 3 - No Play.',
    short_text: 'Bhayshul Tuten 3 Yd Rush Brenton Strange 10 Yd Pnlty',
    end_possession_text: 'HST 13',
  });
  assert.equal(play.narrative.sentence,
    'Touchdown called back: Bhayshul Tuten ran it in from 3 yards out, but Brenton Strange (Jacksonville) was flagged for holding, 10 yards. Ball at the Houston 13.');
});

test('offsetting flags say the down is replayed', () => {
  const play = normalizeCanonicalPlay({
    type_slug: 'pass-interception-return', team: { abbreviation: 'NO' },
    text: '(Shotgun) J.Winston pass deep right intended for D.Mooney INTERCEPTED by Q.Riley at NO 46. Q.Riley ran ob at NYG 39 for 15 yards (M.Fields).Penalty on NO-C.Jordan, Defensive Offside, offsetting, enforced at NYG 16 - No Play.Penalty on NYG-F.Mauigoa, Offensive Holding, offsetting.',
    short_text: 'Quincy Riley 15 Yd Interception Return',
  });
  assert.match(play.narrative.sentence, /^Interception erased: .*, but offsetting penalties were called on C\.Jordan \(New Orleans\) for offside and F\.Mauigoa \(Giants\) for holding\. The down is replayed\.$/);
});

test('a reversed punt sent with a "null" compact text reads from the corrected description', () => {
  const play = normalizeCanonicalPlay({
    type_slug: 'fumble-recovery-opponent', short_text: 'null', team: { abbreviation: 'LAC' },
    text: 'J.Scott punts 35 yards to LAC 37, Center-J.Harris. N.Remigio to LAC 41 for -4 yards (T.Dye). FUMBLES (T.Dye), recovered by KC-Ca.Jones at LAC 41.Los Angeles Chargers challenged the loose ball recovery ruling, and the play was REVERSED.J.Scott punts 35 yards to LAC 37, Center-J.Harris. N.Remigio to LAC 41 for -4 yards (T.Dye). FUMBLES (T.Dye), RECOVERED by LAC-C.Murphy at LAC 41.',
  });
  assert.equal(play.narrative.sentence, 'J.Scott punted 35 yards, returned for a loss of 4 yards by N.Remigio. T.Dye forced a fumble, recovered by C.Murphy.');
});

test('a loose snap pitched on and fumbled away charges each fumbler', () => {
  const play = {
    id: 'mayfield', type_slug: 'rush', team: { abbreviation: 'ATL' },
    text: 'B.Mayfield to ATL 17 for -2 yards. FUMBLES, and recovers at ATL 18. B.Mayfield to ATL 16 for 2 yards. Lateral to B.Irving to ATL 1 for 15 yards (J.Bates). FUMBLES (J.Bates), ball out of bounds in End Zone, Touchback.',
    short_text: 'Bucky Irving 14 Yd Rush Bucky Irving Fumble Baker Mayfield Fumble Baker Mayfield 0 Yd Fumble Recovery Baker Mayfield Rush, No Gain',
    start_distance: 10,
  };
  const game = { id: 'atl-tb', visitor_team: { abbreviation: 'ATL' }, home_team: { abbreviation: 'TB' } };
  const starters = [starter('irving', 'Bucky Irving', 'RB', 'TB'), starter('mayfield', 'Baker Mayfield', 'QB', 'TB')];
  const events = buildPlayEvents(
    { [game.id]: [play] }, buildStarterNameIndex(starters), { rush_yd: 0.1, fum: -1, fum_lost: -2 },
    new Map(starters.map((row) => [row.id, row.player.position])), new Map([[game.id, game]]),
  );
  assert.equal(events[0].play.narrative.sentence,
    'Baker Mayfield fumbled the snap and recovered it, then lateraled to Bucky Irving, who gained 14 yards. J.Bates forced a fumble out of the end zone for a touchback.');
  assert.equal(statsOf(events, 'irving').fum_lost, 1);
  assert.equal(statsOf(events, 'irving').rush_yd, 14);
  assert.deepEqual(statsOf(events, 'mayfield'), { fum: 1 });
});
