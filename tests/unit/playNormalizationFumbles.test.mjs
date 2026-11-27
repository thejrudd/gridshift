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
import { getPricedTackleKey } from '../../src/utils/playByPlay/playStatDelta.js';

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
  // The compact text's "Loss of 1" is the official credit (Hunter: 1 catch
  // for -1 in Week 9), not the gamebook's -3, where the ball came out.
  assert.equal(play.narrative.sentence, 'Trevor Lawrence found Travis Hunter for a loss of 1 yard. M.Starks forced a fumble, recovered by Teddye Buchanan.');
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
  assert.deepEqual(statsOf(events, 'hunter'), { fum: 1, fum_lost: 1, rec: 1, rec_yd: -1, rec_0_4: 1 });
  assert.equal(statsOf(events, 'lawrence').pass_yd, -1);
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
  assert.equal(bySide.a.desc, 'Trevor Lawrence found Travis Hunter for a loss of 1 yard. M.Starks forced a fumble, recovered by Teddye Buchanan.');
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
  // Week 6 of 2026, NYJ at NE: the catch reached the line before the fumble,
  // but Sleeper's line counts no first down for it (Douglas rec_fd 3, not 4).
  assert.equal(statsOf(events, 'douglas').rec_fd, undefined);
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
    'Bo Nix found Marvin Mims Jr. for 8 yards, tackled by B.Murphy. Byron Murphy II (Seattle, #91) was flagged for a face mask, 15 yards. Ball at the Denver 44. Byron Murphy II (Seattle, #91) was flagged for offside, declined.');
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

test('a run ending in a lost fumble credits the run, not the defense\'s recovery return', () => {
  // Week 2 LAC–LV: Omarion Hampton officially gained 2; Jeremy Chinn returned
  // the fumble 43 (the provider's stat_yardage).
  const game = { id: 'lac-lv', visitor_team: { abbreviation: 'LAC' }, home_team: { abbreviation: 'LV' } };
  const play = {
    id: 'hampton-fumble',
    type_slug: 'fumble-recovery-opponent',
    team: { abbreviation: 'LV' },
    period: 2,
    clock_display: '3:52',
    text: '(Shotgun) O.Hampton up the middle to LV 46 for 2 yards (N.Dean). FUMBLES (N.Dean), RECOVERED by LV-J.Chinn at LV 47. J.Chinn to LAC 10 for 43 yards (J.Herbert).',
    short_text: 'Omarion Hampton 2 Yd Rush Omarion Hampton Fumble Jeremy Chinn 43 Yd Fumble Recovery',
    stat_yardage: 43,
    scoring_play: false,
  };
  const events = eventsFor([play], [starter('hampton', 'Omarion Hampton', 'RB', 'LAC')], game);
  assert.equal(statsOf(events, 'hampton').rush_yd, 2);
  assert.equal(statsOf(events, 'hampton').fum_lost, 1);
});

// ── Several turnovers on one snap ───────────────────────────────────────────
// Expectations are Sleeper's final lines for the completed weeks named. Every
// key weighs something, so no credit is dropped as worth nothing.
const CHAIN_SCORING = Object.fromEntries([
  'pass_att', 'pass_cmp', 'pass_inc', 'pass_int', 'pass_sack', 'pass_fd', 'rec', 'rec_fd', 'rush_att', 'rush_fd',
  'fum', 'fum_lost', 'idp_tkl', 'idp_tkl_solo', 'idp_tkl_ast', 'idp_tkl_loss', 'idp_sack', 'idp_int', 'idp_ff', 'idp_fr',
  'idp_pd', 'idp_qbhit', 'xpm', 'xpmiss', 'int', 'fum_rec', 'def_ff', 'sack', 'tkl_loss', 'def_pass_def', 'def_td',
].map((key) => [key, 1]).concat([
  'pass_yd', 'rec_yd', 'rush_yd', 'idp_int_ret_yd', 'idp_fr_yd', 'idp_sack_yd', 'int_ret_yd', 'fum_ret_yd', 'sack_yd',
].map((key) => [key, 0.01])));

function chainEvents(plays, starters, game) {
  return buildPlayEvents(
    { [game.id]: plays },
    buildStarterNameIndex(starters),
    CHAIN_SCORING,
    new Map(starters.map((row) => [row.id, row.player.position])),
    new Map([[game.id, game]]),
  );
}
const teamDefense = (team) => ({ id: `dst-${team}`, player: { full_name: `${team} Defense`, position: 'DEF', team, player_id: team } });
const pick = (stats, keys) => Object.fromEntries(keys.filter((key) => stats?.[key] != null).map((key) => [key, stats[key]]));

// The owner's play: a pick at midfield, returned and fumbled back to the team
// that threw it. Confirmed against Sleeper's completed 2026 week 10 BUF@NYJ
// lines: Igbinosun idp_int 1, idp_int_ret_yd 17, fum_lost 1; Ruckert idp_ff 1
// and an assisted tackle; Hall an assisted tackle; Myers idp_fum_rec 1; BUF
// DEF int 1, int_ret_yd 17; NYJ DEF fum_rec 1 (BUF lost one fumble all game)
// and ff_misc 1 for Ruckert's force.
const IGBINOSUN_PICK_FUMBLE = {
  id: 'nyj-int-fumble',
  type_slug: 'fumble-recovery-opponent',
  team: { abbreviation: 'NYJ' },
  period: 2,
  text: '(Shotgun) C.Klubnik pass deep right intended for G.Wilson INTERCEPTED by D.Igbinosun at 50. D.Igbinosun to NYJ 33 for 17 yards (J.Ruckert; B.Hall). FUMBLES (J.Ruckert), RECOVERED by NYJ-J.Myers at NYJ 23.',
  short_text: 'Davison Igbinosun 17 Yd Interception Return Davison Igbinosun Fumble Jamien Myers 0 Yd Fumble Recovery',
  start_possession_text: 'NYJ 27',
  end_possession_text: 'NYJ 23',
  stat_yardage: 17,
};
const NYJ_BUF = { id: 'nyj-buf', visitor_team: { abbreviation: 'BUF' }, home_team: { abbreviation: 'NYJ' } };
const NYJ_BUF_STARTERS = [
  starter('klubnik', 'Cade Klubnik', 'QB', 'NYJ'),
  starter('wilson', 'Garrett Wilson', 'WR', 'NYJ'),
  starter('ruckert', 'Jeremy Ruckert', 'TE', 'NYJ'),
  starter('hall', 'Breece Hall', 'RB', 'NYJ'),
  starter('myers', 'Jamien Myers', 'WR', 'NYJ'),
  starter('igbinosun', 'Davison Igbinosun', 'CB', 'BUF'),
  teamDefense('NYJ'),
  teamDefense('BUF'),
];

test('a pick returned and fumbled back keeps the ball with the team that threw it', async () => {
  const { getOffenseTeam, getPlaySegment, possessionTextToPercent } = await import('../../src/utils/nflPlays/fieldGeometry.js');
  const canonical = normalizeCanonicalPlay(IGBINOSUN_PICK_FUMBLE, { gameId: 'nyj-buf', homeTeam: 'NYJ', awayTeam: 'BUF' });
  // Two turnovers: possession did not change, and `team` is the offense.
  assert.equal(canonical.offenseTeam, 'NYJ');
  // The field graphics ask the geometry directly, from the canonical shape.
  assert.equal(getOffenseTeam(canonical, { homeTeam: 'NYJ', awayTeam: 'BUF' }), 'NYJ');
  // The slug alone (one opponent recovery) would have flipped it.
  assert.equal(getOffenseTeam({ team: 'NYJ', typeSlug: 'fumble-recovery-opponent' }, { homeTeam: 'NYJ', awayTeam: 'BUF' }), 'BUF');
  assert.equal(canonical.defenseTeam, 'BUF');
  assert.equal(canonical.narrative.sentence,
    "C.Klubnik's pass for G.Wilson was intercepted by Davison Igbinosun at midfield and returned 17 yards. Davison Igbinosun fumbled, forced by J.Ruckert, and Jamien Myers recovered it.");
  assert.equal(canonical.narrative.turnover, false);
  const segment = getPlaySegment(canonical, { homeTeam: 'NYJ', awayTeam: 'BUF' });
  assert.equal(segment.endPct, possessionTextToPercent('NYJ 23', { homeTeam: 'NYJ' }));
});

test('a pick returned and fumbled back credits each player and both team defenses', () => {
  const events = chainEvents([IGBINOSUN_PICK_FUMBLE], NYJ_BUF_STARTERS, NYJ_BUF);
  const stats = (id) => statsOf(events, id);
  assert.deepEqual(pick(stats('klubnik'), ['pass_att', 'pass_int', 'pass_cmp']), { pass_att: 1, pass_int: 1 });
  assert.equal(stats('wilson'), undefined);
  // The intercepter fumbled it away: charged with the fumble and its loss.
  assert.deepEqual(stats('igbinosun'), { idp_pd: 1, idp_int: 1, idp_int_ret_yd: 17, fum: 1, fum_lost: 1 });
  // "(J.Ruckert; B.Hall)" is a shared stop: an assist each.
  assert.deepEqual(stats('ruckert'), { idp_tkl: 1, idp_ff: 1 });
  assert.deepEqual(stats('hall'), { idp_tkl: 1 });
  assert.equal(getPricedTackleKey(events.find((event) => event.playerId === 'hall').play, { idp_tkl: 1 }, { idp_tkl_ast: 1, idp_tkl_solo: 1 }), 'idp_tkl_ast');
  // Recovering the other team's fumble.
  assert.deepEqual(stats('myers'), { idp_fr: 1 });
  assert.deepEqual(stats('dst-BUF'), { int: 1, int_ret_yd: 17, def_pass_def: 1 });
  // A force by the offense after a turnover is Sleeper's `ff_misc`, which no
  // league scores, so the passing team's defense gets the recovery alone.
  assert.deepEqual(stats('dst-NYJ'), { fum_rec: 1 });
});

test('a compound turnover reads from the gamebook when the compact text is missing', () => {
  const events = chainEvents([{ ...IGBINOSUN_PICK_FUMBLE, short_text: 'null' }], NYJ_BUF_STARTERS, NYJ_BUF);
  assert.deepEqual(statsOf(events, 'igbinosun'), { idp_pd: 1, idp_int: 1, idp_int_ret_yd: 17, fum: 1, fum_lost: 1 });
  assert.deepEqual(statsOf(events, 'dst-NYJ'), { fum_rec: 1 });
});

test('a pick fumbled and recovered by a teammate is no recovery (week 3 of 2026, LV at NO)', () => {
  const play = {
    id: '4018729614001',
    type_slug: 'fumble-recovery-own',
    team: { abbreviation: 'LV' },
    period: 3,
    text: '(Shotgun) T.Shough pass short left intended for B.Lance INTERCEPTED by H.Masses [M.Koonce] at NO 43. H.Masses to NO 8 for 35 yards (J.Johnson). FUMBLES (J.Johnson), touched at NO 7, recovered by LV-A.Butler at NO 4.',
    short_text: 'Hezekiah Masses 35 Yd Interception Return Hezekiah Masses Fumble Adam Butler 0 Yd Fumble Recovery',
    end_possession_text: 'NO 4',
    stat_yardage: 35,
  };
  const game = { id: 'lv-no', visitor_team: { abbreviation: 'LV' }, home_team: { abbreviation: 'NO' } };
  assert.equal(normalizeCanonicalPlay(play, { homeTeam: 'NO', awayTeam: 'LV' }).offenseTeam, 'NO');
  const events = chainEvents([play], [
    starter('shough', 'Tyler Shough', 'QB', 'NO'),
    starter('juwan', 'Juwan Johnson', 'TE', 'NO'),
    starter('masses', 'Hezekiah Masses', 'CB', 'LV'),
    starter('butler', 'Adam Butler', 'DL', 'LV'),
    starter('koonce', 'Malcolm Koonce', 'DL', 'LV'),
    starter('jpj', 'Jackson Powers-Johnson', 'OL', 'LV'),
    teamDefense('LV'),
    teamDefense('NO'),
  ], game);
  const stats = (id) => statsOf(events, id);
  // Sleeper: Masses fum 1, no fum_lost, idp_int 1, idp_int_ret_yd 35; Butler
  // no recovery; Juwan Johnson idp_ff 1 and a solo tackle; LV DEF int 1 and
  // int_ret_yd 35, no fum_rec; NO DEF only `ff_misc`.
  assert.deepEqual(stats('masses'), { idp_pd: 1, idp_int: 1, idp_int_ret_yd: 35, fum: 1 });
  assert.equal(stats('butler'), undefined);
  assert.equal(stats('jpj'), undefined);
  assert.deepEqual(stats('juwan'), { idp_tkl: 1, idp_ff: 1 });
  assert.deepEqual(pick(stats('shough'), ['pass_att', 'pass_int']), { pass_att: 1, pass_int: 1 });
  assert.deepEqual(stats('koonce'), { idp_qbhit: 1 });
  assert.deepEqual(stats('dst-LV'), { int: 1, int_ret_yd: 35, def_pass_def: 1 });
  assert.equal(stats('dst-NO'), undefined);
});

test('a sack-fumble recovered, returned and fumbled again charges both fumblers (week 3 of 2026, HOU at IND)', () => {
  const play = {
    id: '401872951242',
    type_slug: 'fumble-recovery-own',
    team: { abbreviation: 'HOU' },
    text: 'D.Jones sacked at IND 39 for -8 yards (W.Anderson). FUMBLES (W.Anderson), touched at IND 44, RECOVERED by HST-W.Anderson at IND 42. W.Anderson to IND 40 for 2 yards (M.Alie-Cox). FUMBLES (M.Alie-Cox), recovered by HST-K.Lassiter at IND 40.',
    short_text: 'Daniel Jones Sacked Daniel Jones Fumble Will Anderson Jr. Fumble Will Anderson Jr. 2 Yd Fumble Recovery Kamari Lassiter 0 Yd Fumble Recovery by Will A',
    stat_yardage: 2,
  };
  const game = { id: 'hou-ind', visitor_team: { abbreviation: 'HOU' }, home_team: { abbreviation: 'IND' } };
  assert.equal(normalizeCanonicalPlay(play, { homeTeam: 'IND', awayTeam: 'HOU' }).offenseTeam, 'IND');
  const events = chainEvents([play], [
    starter('jones', 'Daniel Jones', 'QB', 'IND'),
    starter('aliecox', 'Mo Alie-Cox', 'TE', 'IND'),
    starter('anderson', 'Will Anderson Jr.', 'DL', 'HOU'),
    starter('lassiter', 'Kamari Lassiter', 'DB', 'HOU'),
    teamDefense('HOU'),
    teamDefense('IND'),
  ], game);
  const stats = (id) => statsOf(events, id);
  assert.deepEqual(pick(stats('jones'), ['pass_sack', 'fum', 'fum_lost']), { pass_sack: 1, fum: 1, fum_lost: 1 });
  // Sleeper: the sack, the force, the recovery and its 2 yards, and a fumble
  // his own side recovered (no fum_lost).
  assert.deepEqual(pick(stats('anderson'), ['idp_sack', 'idp_ff', 'idp_fr', 'idp_fr_yd', 'fum', 'fum_lost']),
    { idp_sack: 1, idp_ff: 1, idp_fr: 1, idp_fr_yd: 2, fum: 1 });
  assert.deepEqual(stats('aliecox'), { idp_tkl: 1, idp_ff: 1 });
  assert.equal(stats('lassiter'), undefined);
  assert.deepEqual(pick(stats('dst-HOU'), ['sack', 'fum_rec', 'fum_ret_yd', 'def_ff', 'int']), { sack: 1, fum_rec: 1, fum_ret_yd: 2, def_ff: 1 });
  assert.equal(stats('dst-IND'), undefined);
});

test('a lost fumble recovered and fumbled again credits the catch from the compact text (week 5 of 2026, CIN at MIA)', () => {
  const play = {
    id: '4018729821612',
    type_slug: 'fumble-recovery-own',
    team: { abbreviation: 'MIA' },
    text: '(Shotgun) J.Burrow pass short left to C.Brown to MIA 7 for 3 yards (C.Johnson). FUMBLES (C.Johnson), RECOVERED by MIA-C.Robinson at MIA 7. C.Robinson to MIA 18 for 11 yards (J.Chase). FUMBLES (J.Chase), recovered by MIA-J.Uche at MIA 23.',
    short_text: 'Joe Burrow Pass Complete for 3 Yds to Chase Brown Chase Brown Fumble Chop Robinson Fumble Chop Robinson 11 Yd Fumble Recovery Josh Uche 0 Yd Fumble Re',
    stat_yardage: 11,
    start_distance: 10,
    end_down: 1,
  };
  const game = { id: 'cin-mia', visitor_team: { abbreviation: 'CIN' }, home_team: { abbreviation: 'MIA' } };
  const canonical = normalizeCanonicalPlay(play, { homeTeam: 'MIA', awayTeam: 'CIN' });
  assert.equal(canonical.offenseTeam, 'CIN');
  assert.equal(canonical.narrative.sentence,
    'Joe Burrow found Chase Brown for 3 yards. Chase Brown fumbled, forced by C.Johnson, and Chop Robinson recovered it and returned it 11 yards. Chop Robinson fumbled, forced by J.Chase, and Josh Uche recovered it.');
  const events = chainEvents([play], [
    starter('burrow', 'Joe Burrow', 'QB', 'CIN'),
    starter('brown', 'Chase Brown', 'RB', 'CIN'),
    starter('chase', "Ja'Marr Chase", 'WR', 'CIN'),
    starter('robinson', 'Chop Robinson', 'DL', 'MIA'),
    starter('uche', 'Josh Uche', 'LB', 'MIA'),
    teamDefense('MIA'),
    teamDefense('CIN'),
  ], game);
  const stats = (id) => statsOf(events, id);
  assert.deepEqual(pick(stats('brown'), ['rec', 'rec_yd', 'rec_fd', 'fum', 'fum_lost']), { rec: 1, rec_yd: 3, fum: 1, fum_lost: 1 });
  assert.deepEqual(pick(stats('robinson'), ['idp_fr', 'idp_fr_yd', 'fum', 'fum_lost']), { idp_fr: 1, idp_fr_yd: 11, fum: 1 });
  assert.deepEqual(stats('chase'), { idp_tkl: 1, idp_ff: 1 });
  assert.equal(stats('uche'), undefined);
  // C.Johnson's force was the defense's; J.Chase's, after the turnover, is
  // CIN's `ff_misc`.
  assert.deepEqual(pick(stats('dst-MIA'), ['fum_rec', 'fum_ret_yd', 'def_ff']), { fum_rec: 1, fum_ret_yd: 11, def_ff: 1 });
  assert.equal(stats('dst-CIN'), undefined);
});

test('a fumble kept, then fumbled away, charges the second carrier with the loss (week 9 of 2026, WAS vs LAR)', () => {
  const play = {
    id: '4018730434645',
    type_slug: 'fumble-recovery-opponent',
    team: { abbreviation: 'LAR' },
    text: '(Shotgun) J.Daniels pass short middle to C.Okonkwo to LA 11 for 20 yards (J.McCollough). FUMBLES (J.McCollough), recovered by WAS-R.White at LA 15. R.White to LA 17 for -2 yards (Q.Lake). FUMBLES (Q.Lake), RECOVERED by LA-B.Young at LA 21.',
    short_text: 'Jayden Daniels Pass Complete for 16 Yds to Chig Okonkwo Rachaad White Fumble Chig Okonkwo Fumble Rachaad White -6 Yd Fumble Recovery Byron Young 0 Yd',
    stat_yardage: 0,
  };
  const game = { id: 'lar-was', visitor_team: { abbreviation: 'LAR' }, home_team: { abbreviation: 'WAS' } };
  assert.equal(normalizeCanonicalPlay(play, { homeTeam: 'WAS', awayTeam: 'LAR' }).offenseTeam, 'WAS');
  const events = chainEvents([play], [
    starter('okonkwo', 'Chig Okonkwo', 'TE', 'WAS'),
    starter('white', 'Rachaad White', 'RB', 'WAS'),
    starter('lake', 'Quentin Lake', 'DB', 'LAR'),
    starter('mccollough', 'Jaylen McCollough', 'DB', 'LAR'),
    starter('young', 'Byron Young', 'LB', 'LAR'),
    teamDefense('LAR'),
  ], game);
  const stats = (id) => statsOf(events, id);
  // The summary's "for 16 Yds" is the catch's official credit.
  assert.deepEqual(pick(stats('okonkwo'), ['rec', 'rec_yd', 'fum', 'fum_lost']), { rec: 1, rec_yd: 16, fum: 1 });
  assert.deepEqual(stats('white'), { fum: 1, fum_lost: 1 });
  assert.deepEqual(stats('lake'), { idp_tkl: 1, idp_ff: 1 });
  assert.deepEqual(stats('mccollough'), { idp_tkl: 1, idp_ff: 1 });
  // The recovery that changed hands; White's own recovery advance is not his.
  assert.deepEqual(stats('young'), { idp_fr: 1 });
  assert.deepEqual(stats('dst-LAR'), { fum_rec: 1, def_ff: 2 });
});

test('a fumble returned for a defensive score credits the catch, not the touchdown, and the scoring side\'s try (week 5 of 2026, MIN at NO)', () => {
  const play = {
    id: '4018729872643',
    type_slug: 'fumble-return-touchdown',
    team: { abbreviation: 'NO' },
    scoring_play: true,
    text: '(Shotgun) K.Murray pass short left to M.Price to NO 12 for 7 yards (M.Emerson; P.Werner). FUMBLES (M.Emerson), RECOVERED by NO-J.Sanker at NO 13. J.Sanker for 87 yards, TOUCHDOWN. D.Carlson extra point is No Good, Wide Left, Center-C.Adomitis, Holder-R.Wright.',
    short_text: 'Jonas Sanker 87 Yd Fumble Return (Daniel Carlson PAT Failed)',
    stat_yardage: 87,
  };
  const game = { id: 'min-no', visitor_team: { abbreviation: 'MIN' }, home_team: { abbreviation: 'NO' } };
  assert.equal(normalizeCanonicalPlay(play, { homeTeam: 'NO', awayTeam: 'MIN' }).offenseTeam, 'MIN');
  const events = chainEvents([play], [
    starter('murray', 'Kyler Murray', 'QB', 'MIN'),
    starter('price', 'Myles Price', 'WR', 'MIN'),
    starter('sanker', 'Jonas Sanker', 'DB', 'NO'),
    starter('carlson', 'Daniel Carlson', 'K', 'NO'),
    teamDefense('NO'),
  ], game);
  const stats = (id) => statsOf(events, id);
  assert.equal(stats('murray').pass_td, undefined);
  assert.equal(stats('price').rec_td, undefined);
  assert.deepEqual(pick(stats('price'), ['rec', 'fum', 'fum_lost']), { rec: 1, fum: 1, fum_lost: 1 });
  assert.equal(stats('sanker').idp_fr, 1);
  assert.deepEqual(stats('carlson'), { xpmiss: 1 });
  assert.deepEqual(pick(stats('dst-NO'), ['fum_rec', 'def_td', 'def_ff']), { fum_rec: 1, def_td: 1, def_ff: 1 });
});

test('the turnover chain counts every change of possession on the snap', async () => {
  const { parseTurnoverChain } = await import('../../src/utils/nflPlays/playNarrative.js');
  const chain = parseTurnoverChain(IGBINOSUN_PICK_FUMBLE.text);
  assert.deepEqual(chain.events.map((event) => [event.type, event.changed ?? true]), [['interception', true], ['fumble', true]]);
  assert.equal(chain.changes, 2);
  assert.equal(chain.finalSide, 'offense');
  // Midfield is written bare.
  assert.equal(chain.events[0].at, '50');
});

test('a pick a flag wiped out changes nothing (week 1 of 2026, TB at CIN)', async () => {
  const { getOffenseTeam } = await import('../../src/utils/nflPlays/fieldGeometry.js');
  const play = normalizeCanonicalPlay({
    id: '4018729251137',
    type_slug: 'penalty',
    team: { abbreviation: 'TB' },
    text: 'B.Mayfield pass short left intended for E.Egbuka INTERCEPTED by T.Davis at CIN 16. T.Davis ran ob at CIN 20 for 4 yards (E.Egbuka).PENALTY on CIN-T.Davis, Defensive Pass Interference, 12 yards, enforced at CIN 29 - No Play.',
  }, { homeTeam: 'CIN', awayTeam: 'TB' });
  assert.equal(play.offenseTeam, 'TB');
  assert.equal(getOffenseTeam(play, { homeTeam: 'CIN', awayTeam: 'TB' }), 'TB');
});

// Punts the provider filed under the fumble that followed them. Expectations
// are Sleeper's final lines for the completed weeks named.
const KICK_SCORING = {
  st_tkl_solo: 1, st_ff: 1, st_fum_rec: 1, idp_ff: 1, idp_tkl: 1, idp_fr: 1, fum: 1, fum_lost: 1, pr_yd: 0.01,
  def_st_tkl_solo: 1, def_st_ff: 1, def_st_fum_rec: 1, def_pr_yd: 0.01, fum_rec: 1, def_ff: 1, def_4_and_stop: 1,
};
const kickEvents = (plays, starters, game) => buildPlayEvents(
  { [game.id]: plays }, buildStarterNameIndex(starters), KICK_SCORING,
  new Map(starters.map((row) => [row.id, row.player.position])), new Map([[game.id, game]]),
);

test('a punt filed under a fumble slug is the kick it was (week 4 of 2026, DEN at SF)', () => {
  // Sleeper: S.Neal st_tkl_solo 1, idp_ff 1, st_ff 1, st_fum_rec 1, no idp_tkl
  // or idp_fum_rec; M.Mims fum 1, fum_lost 1; SF DEF def_st_ff and
  // def_st_fum_rec from this punt, no fum_rec, ff or def_4_and_stop.
  const punt = {
    id: '4018729752717', type_slug: 'fumble-recovery-opponent', team: { abbreviation: 'SF' },
    text: 'C.Waitman punts 61 yards to DEN 28, Center-J.Weeks. M.Mims to DEN 29 for 1 yard (S.Neal). FUMBLES (S.Neal), RECOVERED by SF-S.Neal at DEN 28. S.Neal to DEN 28 for no gain (M.Mims).',
    short_text: 'Corliss Waitman 61 Yd Punt Marvin Mims Jr. Punt Return, No Gain Marvin Mims Jr. Fumble Siran Neal 0 Yd Fumble Recovery',
    stat_yardage: 0, start_down: 4, start_distance: 7, start_yards_to_endzone: 11, end_down: 1, end_distance: 10, end_yards_to_endzone: 28,
  };
  const game = { id: 'den-sf', visitor_team: { abbreviation: 'DEN' }, home_team: { abbreviation: 'SF' } };
  const play = normalizeCanonicalPlay(punt, { gameId: game.id, homeTeam: 'SF', awayTeam: 'DEN' });
  assert.equal(play.offenseTeam, 'SF');
  assert.equal(play.turnoverOnDowns, false);
  const events = kickEvents([punt], [
    starter('neal', 'Siran Neal', 'CB', 'SF'),
    starter('mims', 'Marvin Mims Jr.', 'WR', 'DEN'),
    teamDefense('SF'),
  ], game);
  assert.deepEqual(statsOf(events, 'neal'), { st_tkl_solo: 1, idp_ff: 1, st_ff: 1, st_fum_rec: 1 });
  assert.deepEqual(pick(statsOf(events, 'mims'), ['fum', 'fum_lost']), { fum: 1, fum_lost: 1 });
  assert.deepEqual(statsOf(events, 'dst-SF'), { def_st_tkl_solo: 1, def_st_ff: 1, def_st_fum_rec: 1 });
});

test('a punt-return fumble the returning side kept is no recovery (week 5 of 2026, DET at ARI)', () => {
  // Sleeper: S.Fehoko idp_ff 1, st_ff 1; T.Martin nothing; C.Simon no
  // idp_tkl; A.St. Brown fum 1 here (2 in the game), not lost; ARI DEF
  // def_st_ff 1; DET DEF def_pr_yd includes the 31.
  const punt = {
    id: '4018729911380', type_slug: 'fumble-recovery-own', team: { abbreviation: 'DET' },
    text: 'B.Gillikin punts 54 yards to DET 17, Center-C.Kreiter. A.St. Brown to DET 48 for 31 yards (S.Fehoko; C.Simon). FUMBLES (S.Fehoko), recovered by DET-T.Martin at ARZ 47.',
    short_text: 'Blake Gillikin 54 Yd Punt Amon-Ra St. Brown 31 Yd Punt Return Amon-Ra St. Brown Fumble Tay Martin 0 Yd Fumble Recovery',
    stat_yardage: 31, start_down: 4, start_distance: 7, start_yards_to_endzone: 29, end_down: 1, end_distance: 10, end_yards_to_endzone: 47,
  };
  const game = { id: 'det-ari', visitor_team: { abbreviation: 'DET' }, home_team: { abbreviation: 'ARI' } };
  const events = kickEvents([punt], [
    starter('fehoko', 'Simi Fehoko', 'WR', 'ARI'),
    starter('simon', 'Cody Simon', 'LB', 'ARI'),
    starter('stbrown', 'Amon-Ra St. Brown', 'WR', 'DET'),
    starter('martin', 'Tay Martin', 'WR', 'DET'),
    teamDefense('ARI'),
    teamDefense('DET'),
  ], game);
  assert.deepEqual(statsOf(events, 'fehoko'), { idp_ff: 1, st_ff: 1 });
  assert.equal(statsOf(events, 'martin'), undefined);
  assert.equal(statsOf(events, 'simon'), undefined);
  assert.deepEqual(statsOf(events, 'stbrown'), { pr_yd: 31, fum: 1 });
  assert.deepEqual(statsOf(events, 'dst-ARI'), { def_st_ff: 1 });
  assert.deepEqual(statsOf(events, 'dst-DET'), { def_pr_yd: 31 });
});

test('a reversed punt-return fumble filed under a fumble slug credits the coverage team (week 6 of 2026, LAC at KC)', () => {
  // Sleeper: T.Dye idp_ff 1, st_ff 1, st_tkl_solo 1 (his two idp_tkl come from
  // other snaps); C.Murphy st_fum_rec 1, no idp_fum_rec; N.Remigio fum 1,
  // fum_lost 1; LAC DEF def_st_ff 1, def_st_fum_rec 1, no ff or fum_rec.
  const punt = {
    id: '4018730063033', type_slug: 'fumble-recovery-opponent', team: { abbreviation: 'LAC' },
    text: 'J.Scott punts 35 yards to LAC 37, Center-J.Harris. N.Remigio to LAC 41 for -4 yards (T.Dye). FUMBLES (T.Dye), recovered by KC-Ca.Jones at LAC 41.PENALTY on KC-J.Briningstool, Illegal Block Above the Waist, 10 yards, enforced at LAC 37.Los Angeles Chargers challenged the loose ball recovery ruling, and the play was REVERSED.J.Scott punts 35 yards to LAC 37, Center-J.Harris. N.Remigio to LAC 41 for -4 yards (T.Dye). FUMBLES (T.Dye), RECOVERED by LAC-C.Murphy at LAC 41.Penalty on KC-J.Briningstool, Illegal Block Above the Waist, declined.',
    short_text: 'null',
    stat_yardage: 0, start_down: 4, start_distance: 9, start_yards_to_endzone: 98, end_down: 1, end_distance: 10, end_yards_to_endzone: 59,
  };
  const game = { id: 'lac-kc', visitor_team: { abbreviation: 'LAC' }, home_team: { abbreviation: 'KC' } };
  const events = kickEvents([punt], [
    starter('dye', 'Troy Dye', 'LB', 'LAC'),
    starter('murphy', 'Caleb Murphy', 'DE', 'LAC'),
    teamDefense('LAC'),
  ], game);
  assert.deepEqual(statsOf(events, 'dye'), { st_tkl_solo: 1, idp_ff: 1, st_ff: 1 });
  assert.deepEqual(statsOf(events, 'murphy'), { st_fum_rec: 1 });
  assert.deepEqual(statsOf(events, 'dst-LAC'), { def_st_tkl_solo: 1, def_st_ff: 1, def_st_fum_rec: 1 });
});

test('a punt after a fumbled snap keeps the slug reading (week 9 of 2026, NYG at PHI)', async () => {
  const { isKickFiledUnderFumble } = await import('../../src/utils/nflPlays/fieldGeometry.js');
  assert.equal(isKickFiledUnderFumble({
    typeSlug: 'fumble-recovery-own',
    rawText: 'B.Mann to PHI 28 for -14 yards. FUMBLES, and recovers at PHI 21. B.Mann punts -2 yards to PHI 40, out of bounds.',
  }), false);
  // A flag that wiped the punt out leaves it to the slug as well.
  assert.equal(isKickFiledUnderFumble({
    typeSlug: 'penalty',
    rawText: 'M.Wishnowsky punts 38 yards to SEA 14, Center-J.Ashby, fair catch by R.Shaheed.PENALTY on SEA-C.Surratt, Roughing the Kicker, 15 yards, enforced at NE 48 - No Play.',
  }), false);
});

// Quarterback hits, as Sleeper's lines for the completed weeks named carry them.
test('a sack out of bounds is no quarterback hit (week 1 of 2026, NE at SEA)', () => {
  // Sleeper: D.Thomas idp_sack 1, idp_qb_hit 1 — the hit is the bracketed
  // incompletion, not the sack.
  const game = { id: 'ne-sea', visitor_team: { abbreviation: 'NE' }, home_team: { abbreviation: 'SEA' } };
  const sack = { id: '4018726563765', type_slug: 'sack', team: { abbreviation: 'NE' }, text: '(Shotgun) D.Maye sacked ob at NE 43 for -2 yards (D.Thomas).', stat_yardage: -2 };
  const hit = { id: '4018726561585', type_slug: 'pass-incompletion', team: { abbreviation: 'NE' }, text: '(Shotgun) D.Maye pass incomplete deep right to D.Douglas [D.Thomas].' };
  const starters = [starter('thomas', 'Drake Thomas', 'LB', 'SEA')];
  const events = chainEvents([sack, hit], starters, game);
  const total = (key) => events.filter((event) => event.playerId === 'thomas').reduce((sum, event) => sum + (event.stats?.[key] ?? 0), 0);
  assert.equal(total('idp_sack'), 1);
  assert.equal(total('idp_qbhit'), 1);
});

test('a strip-sack credits the quarterback hit to the bracketed defender only (weeks 1 and 5 of 2026)', () => {
  // Week 1, BAL at IND — Sleeper: A.Key idp_qb_hit 1, idp_sack 0.5, idp_ff 1;
  // L.Latu idp_sack 0.5 and no hit all game.
  const split = {
    id: '4018726591821', type_slug: 'sack-opp-fumble-recovery', team: { abbreviation: 'IND' },
    text: 'L.Jackson sacked at BLT 20 for -10 yards (sack split by A.Key and L.Latu). FUMBLES (A.Key) [A.Key], RECOVERED by IND-D.Buckner at BLT 15. D.Buckner to BLT 15 for no gain (R.Stanley).',
    stat_yardage: 0,
  };
  const balInd = { id: 'bal-ind', visitor_team: { abbreviation: 'BAL' }, home_team: { abbreviation: 'IND' } };
  const splitEvents = chainEvents([split], [
    starter('key', 'Arden Key', 'DE', 'IND'),
    starter('latu', 'Laiatu Latu', 'DL', 'IND'),
  ], balInd);
  assert.deepEqual(pick(statsOf(splitEvents, 'key'), ['idp_sack', 'idp_qbhit', 'idp_ff']), { idp_sack: 0.5, idp_qbhit: 1, idp_ff: 1 });
  assert.deepEqual(pick(statsOf(splitEvents, 'latu'), ['idp_sack', 'idp_qbhit']), { idp_sack: 0.5 });
  // Week 5, PHI at JAX — Sleeper: J.Carter idp_sack 2, idp_ff 2, no hit.
  const strip = {
    id: '401872981191', type_slug: 'fumble-recovery-own', team: { abbreviation: 'JAX' },
    text: '(Shotgun) T.Lawrence sacked at JAX 19 for -9 yards (J.Carter). FUMBLES (J.Carter), recovered by JAX-R.Hainsey at JAX 13.',
    stat_yardage: -9,
  };
  const phiJax = { id: 'phi-jax', visitor_team: { abbreviation: 'PHI' }, home_team: { abbreviation: 'JAX' } };
  const stripEvents = chainEvents([strip], [starter('carter', 'Jalen Carter', 'DL', 'PHI')], phiJax);
  assert.deepEqual(pick(statsOf(stripEvents, 'carter'), ['idp_sack', 'idp_qbhit', 'idp_ff']), { idp_sack: 1, idp_ff: 1 });
});

test('a split sack with a spaced surname credits both sackers (week 3 of 2026, MIN at TB)', () => {
  // Sleeper: K.Van Noy idp_sack 1.5 (this half and a solo sack), idp_qb_hit 2;
  // I.Pace idp_sack 0.5.
  const play = {
    id: '4018729592976', type_slug: 'sack', team: { abbreviation: 'TB' },
    text: ' (Shotgun) B.Mayfield sacked at TB 29 for -6 yards (sack split by I.Pace and K.Van Noy).', stat_yardage: -6,
  };
  const game = { id: 'min-tb', visitor_team: { abbreviation: 'MIN' }, home_team: { abbreviation: 'TB' } };
  const events = chainEvents([play], [
    starter('pace', 'Ivan Pace Jr.', 'LB', 'MIN'),
    starter('vannoy', 'Kyle Van Noy', 'LB', 'MIN'),
  ], game);
  assert.deepEqual(pick(statsOf(events, 'pace'), ['idp_sack', 'idp_qbhit']), { idp_sack: 0.5, idp_qbhit: 1 });
  assert.deepEqual(pick(statsOf(events, 'vannoy'), ['idp_sack', 'idp_qbhit']), { idp_sack: 0.5, idp_qbhit: 1 });
});

// Team defense lines, as Sleeper's for the completed weeks named carry them.
test('a stop for loss is the solo tackler\'s and counts once for the team; a shared one counts none (week 1 of 2026)', () => {
  // Sleeper's team tkl_loss is the sum of its players' idp_tkl_loss (281 of
  // 300 team lines in weeks 1–10). NYJ at TEN: A.Hooker idp_tkl_loss 1 from
  // "(A.Hooker, A.Hill)". GB at MIN: "(A; B)" is no one's tackle for loss.
  const solo = { id: '4018729243300', type_slug: 'rush', team: { abbreviation: 'NYJ' }, text: 'B.Allen right guard to TEN 47 for -1 yards (A.Hooker, A.Hill).', short_text: 'Braelon Allen Rush, Loss of 1 Yd', stat_yardage: -1 };
  const nyjTen = { id: 'nyj-ten', visitor_team: { abbreviation: 'NYJ' }, home_team: { abbreviation: 'TEN' } };
  const soloEvents = chainEvents([solo], [starter('hooker', 'Amani Hooker', 'DB', 'TEN'), starter('hill', 'Amani Hill', 'DB', 'TEN'), teamDefense('TEN')], nyjTen);
  assert.equal(statsOf(soloEvents, 'hooker')?.idp_tkl_loss, 1);
  assert.equal(statsOf(soloEvents, 'hill')?.idp_tkl_loss, undefined);
  assert.equal(statsOf(soloEvents, 'dst-TEN')?.tkl_loss, 1);
  const shared = { id: '4018729272767', type_slug: 'rush', team: { abbreviation: 'GB' }, text: 'M.Lloyd left tackle to MIN 8 for -1 yards (T.Ingram-Dawkins; L.Rodriguez).', short_text: 'MarShawn Lloyd Rush, Loss of 1 Yd', stat_yardage: -1 };
  const gbMin = { id: 'gb-min', visitor_team: { abbreviation: 'GB' }, home_team: { abbreviation: 'MIN' } };
  const sharedEvents = chainEvents([shared], [starter('itd', 'Tyrion Ingram-Dawkins', 'DE', 'MIN'), teamDefense('MIN')], gbMin);
  assert.equal(statsOf(sharedEvents, 'itd')?.idp_tkl_loss, undefined);
  assert.equal(statsOf(sharedEvents, 'dst-MIN')?.tkl_loss, undefined);
});

test('a strip-sack is a tackle for loss from the sack clause, not the provider yardage (week 1 of 2026, TB at CIN)', () => {
  // Sleeper: B.Mafe idp_tkl_loss 1; the row's stat_yardage is 0.
  const play = {
    id: '4018729253399', type_slug: 'sack-opp-fumble-recovery', team: { abbreviation: 'CIN' },
    text: '(Shotgun) B.Mayfield sacked at TB 39 for -7 yards (B.Mafe). FUMBLES (B.Mafe) [B.Mafe], touched at TB 43, RECOVERED by CIN-T.Slaton at TB 44.',
    short_text: 'Baker Mayfield Sacked Baker Mayfield Fumble T.J. Slaton Jr. 0 Yd Fumble Recovery', stat_yardage: 0,
  };
  const game = { id: 'tb-cin', visitor_team: { abbreviation: 'TB' }, home_team: { abbreviation: 'CIN' } };
  const events = chainEvents([play], [starter('mafe', 'Boye Mafe', 'DE', 'CIN'), teamDefense('CIN')], game);
  assert.equal(statsOf(events, 'mafe')?.idp_tkl_loss, 1);
  assert.equal(statsOf(events, 'dst-CIN')?.tkl_loss, 1);
});

test('a safety summary row credits the team that scored it (weeks 2 and 8 of 2026)', () => {
  // Sleeper: LV safe 1 (LV at LAC), CIN safe 1 (TEN at CIN); the row's team.
  const scoring = { safe: 2 };
  const run = (row, game, teams) => buildPlayEvents(
    { [game.id]: [row] }, buildStarterNameIndex(teams.map(teamDefense)), scoring,
    new Map(teams.map((team) => [`dst-${team}`, 'DEF'])), new Map([[game.id, game]]),
  );
  const lv = run({ id: '4018729414219', type_slug: 'pass-incompletion', team: { abbreviation: 'LV' }, scoring_play: true, text: 'Team Safety', short_text: 'Team Safety' },
    { id: 'lv-lac', visitor_team: { abbreviation: 'LV' }, home_team: { abbreviation: 'LAC' } }, ['LV', 'LAC']);
  assert.deepEqual(lv.map((event) => [event.playerId, event.stats?.safe]), [['dst-LV', 1]]);
  const cin = run({ id: '4018730313455', type_slug: 'safety', team: { abbreviation: 'CIN' }, scoring_play: true, text: 'Demetrius Knight Jr. Safety', short_text: 'Demetrius Knight Jr. Safety' },
    { id: 'ten-cin', visitor_team: { abbreviation: 'TEN' }, home_team: { abbreviation: 'CIN' } }, ['TEN', 'CIN']);
  assert.deepEqual(cin.map((event) => [event.playerId, event.stats?.safe]), [['dst-CIN', 1]]);
});

test('a blocked extra point is the defense\'s blocked kick (week 1 of 2026, WAS at PHI)', () => {
  // Sleeper: J.Carter idp_blk_kick 1; PHI DEF blk_kick 1.
  const play = {
    id: '4018729291861', type_slug: 'rushing-touchdown', team: { abbreviation: 'WSH' }, scoring_play: true,
    text: 'J.Croskey-Merritt left guard for 1 yard, TOUCHDOWN. D.Stevens extra point is Blocked (J.Carter), Center-T.Ott, Holder-T.Way.',
  };
  const game = { id: 'was-phi', visitor_team: { abbreviation: 'WSH' }, home_team: { abbreviation: 'PHI' } };
  const starters = [starter('carter', 'Jalen Carter', 'DL', 'PHI'), teamDefense('PHI')];
  const events = buildPlayEvents({ [game.id]: [play] }, buildStarterNameIndex(starters), { idp_blk_kick: 1, blk_kick: 1 },
    new Map(starters.map((row) => [row.id, row.player.position])), new Map([[game.id, game]]));
  assert.deepEqual(statsOf(events, 'carter'), { idp_blk_kick: 1 });
  assert.deepEqual(statsOf(events, 'dst-PHI'), { blk_kick: 1 });
});

test('a declined flag is told after the play, and only from the standing text', () => {
  // Week 13 GB at LAR: a team flag declined on a run that counted.
  const declined = parsePlayNarrative({
    typeSlug: 'rush',
    rawText: 'B.Corum left tackle to GB 44 for 5 yards (E.Williams). PENALTY on GB, Defensive Too Many Men on Field, 5 yards, declined.',
    shortText: 'Blake Corum 5 Yd Rush',
    team: 'LAR',
  });
  assert.equal(declined.sentence, 'Blake Corum ran for 5 yards, tackled by E.Williams. Green Bay was flagged for defensive too many men on field, declined.');

  // A declined flag in the overturned ruling is not repeated after a reversal.
  const reversed = parsePlayNarrative({
    typeSlug: 'penalty',
    rawText: '(Shotgun) M.Stafford pass short right to K.Mumpfield for 2 yards, TOUCHDOWN [B.Cisse].Penalty on GB-J.Bullard, Defensive Holding, declined.The Replay Official reviewed the pass completion ruling, and the play was REVERSED.(Shotgun) M.Stafford pass incomplete short right to K.Mumpfield (K.Nixon) [B.Cisse].PENALTY on GB-J.Bullard, Defensive Holding, 1 yard, enforced at GB 2 - No Play.',
    shortText: 'Matthew Stafford Incomplete Pass, Intended For Konata Mumpfield Javon Bullard 1 Yd Pnlty',
    team: 'LAR',
  });
  assert.doesNotMatch(reversed.sentence, /declined/);
});
