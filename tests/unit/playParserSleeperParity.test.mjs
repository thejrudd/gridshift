// Parser rules checked against Sleeper's final stat lines for completed 2026
// weeks (v9.5 parser pass, phase 2). Each case is a real provider row; the
// expected credit is what Sleeper's line for that game shows.
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPlayEvents, buildStarterNameIndex } from '../../src/utils/livePlaysFeed.js';

function game(id, away, home) {
  return { id, visitor_team: { abbreviation: away }, home_team: { abbreviation: home }, date: '2026-10-04T17:00:00.000Z' };
}

const SCORING = {
  pass_att: 1, pass_cmp: 1, pass_yd: 0.04, pass_fd: 1, rush_att: 1, rush_yd: 0.1, rush_fd: 1,
  rec: 1, rec_yd: 0.1, rec_fd: 1, fum: -1, fum_lost: -2, idp_tkl: 1,
};

function statsFor(rows, { plays, gameRecord, scoring = SCORING }) {
  const index = buildStarterNameIndex(rows.map(({ id, name, position, team }) => ({ id, player: { full_name: name, position, team } })));
  const events = buildPlayEvents(
    { [gameRecord.id]: plays },
    index,
    scoring,
    new Map(rows.map(({ id, position }) => [id, position])),
    new Map([[String(gameRecord.id), gameRecord]]),
  );
  const totals = {};
  events.forEach((event) => {
    const line = (totals[event.playerId] ??= {});
    Object.entries(event.stats ?? {}).forEach(([key, value]) => { line[key] = (line[key] ?? 0) + value; });
  });
  return totals;
}

// ── First downs ──────────────────────────────────────────────────────────

test('a fourth down stopped short of the line is no first down', () => {
  // W1 BUF at HOU: J.Allen 4th and 1 for -2. The row ends "1st and 10" for
  // Houston; Sleeper's line has no rush_fd for it (0 for the game).
  const stats = statsFor([{ id: 'allen', name: 'Josh Allen', position: 'QB', team: 'BUF' }], {
    gameRecord: game('buf-hou', 'BUF', 'HOU'),
    plays: [{ id: '401872660206', type_slug: 'rush', team: { abbreviation: 'HOU' }, text: '(Shotgun) J.Allen left end to HST 36 for -2 yards (K.Lassiter).', short_text: 'Josh Allen Rush, Loss of 2', stat_yardage: -2, scoring_play: false, period: 1, clock_display: '11:18', start_down: 4, start_distance: 1, end_down: 1, end_distance: 10 }],
  });
  assert.equal(stats.allen.rush_att, 1);
  assert.equal(stats.allen.rush_fd, undefined);
});

test('a catch that reached the line and was fumbled away is no first down', () => {
  // W1 SF at LAR: T.Higbee 5 yards on 2nd and 2, stripped and recovered by
  // SF. Sleeper: Higbee rec_fd 0, Stafford pass_fd 5 (this snap not counted).
  const stats = statsFor([
    { id: 'stafford', name: 'Matthew Stafford', position: 'QB', team: 'LAR' },
    { id: 'higbee', name: 'Tyler Higbee', position: 'TE', team: 'LAR' },
  ], {
    gameRecord: game('sf-lar', 'SF', 'LAR'),
    plays: [{ id: '4018726573154', type_slug: 'fumble-recovery-opponent', team: { abbreviation: 'SF' }, text: '(No Huddle, Shotgun) M.Stafford pass short middle to T.Higbee to LA 44 for 5 yards (F.Warner; D.Greenlaw). FUMBLES (F.Warner), RECOVERED by SF-K.White at LA 43.', short_text: 'Matthew Stafford Pass Complete for 4 Yds to Tyler Higbee Tyler Higbee Fumble Keion White 0 Yd Fumble Recovery', stat_yardage: 0, scoring_play: false, period: 4, clock_display: '11:19', start_down: 2, start_distance: 2, end_down: 1, end_distance: 10 }],
  });
  assert.equal(stats.higbee.rec, 1);
  assert.equal(stats.higbee.fum_lost, 1);
  assert.equal(stats.higbee.rec_fd, undefined);
  assert.equal(stats.stafford.pass_fd, undefined);
});

test('a catch and lateral that reach the line give the catcher the first down', () => {
  // W4 DAL at HOU: D.Schultz 2 yards, lateral to D.Montgomery 19 (pushed out
  // of bounds) on 3rd and 14. Sleeper: Schultz rec 2, rec_yd 9, rec_fd 1;
  // Montgomery rec_yd 19 and no catch or rec_fd; Stroud pass_fd 12.
  const stats = statsFor([
    { id: 'stroud', name: 'C.J. Stroud', position: 'QB', team: 'HOU' },
    { id: 'schultz', name: 'Dalton Schultz', position: 'TE', team: 'HOU' },
    { id: 'montgomery', name: 'David Montgomery', position: 'RB', team: 'HOU' },
  ], {
    gameRecord: game('dal-hou', 'DAL', 'HOU'),
    plays: [{ id: '4018729673957', type_slug: 'pass-reception', team: { abbreviation: 'HOU' }, text: '(Shotgun) C.Stroud pass short right to D.Schultz to DAL 25 for 2 yards. Lateral to D.Montgomery pushed ob at DAL 6 for 19 yards (D.Winters; A.Speed).', short_text: 'C.J. Stroud Pass Complete for 2 Yds to Dalton Schultz', stat_yardage: 21, scoring_play: false, period: 4, clock_display: '2:34', start_down: 3, start_distance: 14, end_down: 1, end_distance: 6 }],
  });
  assert.deepEqual(
    { rec: stats.schultz.rec, rec_yd: stats.schultz.rec_yd, rec_fd: stats.schultz.rec_fd },
    { rec: 1, rec_yd: 2, rec_fd: 1 },
  );
  assert.equal(stats.montgomery.rec, undefined);
  assert.equal(stats.montgomery.rec_yd, 19);
  assert.equal(stats.montgomery.rec_fd, undefined);
  assert.equal(stats.stroud.pass_fd, 1);
  assert.equal(stats.stroud.pass_yd, 21);
});

test('a fumble the offense kept is measured over the whole snap for the first down', () => {
  // W10 NE at DET: R.Gilliam 6 yards on 1st and 10, fumbled, A.Brown fell on
  // it at NE 25 (12 net). Sleeper: Gilliam rec 1, rec_yd 6, rec_fd 1.
  const stats = statsFor([
    { id: 'gilliam', name: 'Reggie Gilliam', position: 'RB', team: 'NE' },
  ], {
    gameRecord: game('ne-det', 'NE', 'DET'),
    plays: [{ id: '4018730533051', type_slug: 'fumble-recovery-own', team: { abbreviation: 'NE' }, text: 'T.DeVito pass short right to R.Gilliam to NE 19 for 6 yards (C.Clark). FUMBLES (C.Clark), recovered by NE-A.Brown at NE 25.', short_text: 'Tommy DeVito Pass Complete for 6 Yds to Reggie Gilliam Reggie Gilliam Fumble A.J. Brown 0 Yd Fumble Recovery', stat_yardage: 12, scoring_play: false, period: 3, clock_display: '4:10', start_down: 1, start_distance: 10, end_down: 1, end_distance: 10 }],
  });
  assert.deepEqual(
    { rec: stats.gilliam.rec, rec_yd: stats.gilliam.rec_yd, rec_fd: stats.gilliam.rec_fd, fum: stats.gilliam.fum },
    { rec: 1, rec_yd: 6, rec_fd: 1, fum: 1 },
  );
});

test('an injury note does not make a lineman the receiver', () => {
  // W2 CIN at HOU: the compact text omits the passer, so the row is read from
  // the gamebook. Sleeper credits T.Higgins the catch and A.Mims nothing.
  const stats = statsFor([
    { id: 'higgins', name: 'Tee Higgins', position: 'WR', team: 'CIN' },
    { id: 'mims', name: 'Amarius Mims', position: 'OL', team: 'CIN' },
  ], {
    gameRecord: game('cin-hou', 'CIN', 'HOU'),
    plays: [{ id: '4018729341698', type_slug: 'pass-reception', team: { abbreviation: 'CIN' }, text: '(Shotgun) J.Burrow pass short middle to T.Higgins to HST 32 for 23 yards (A.Al-Shaair). ** Injury Update: CIN-A.Mims has returned to the game.', short_text: 'Pass Complete for 23 Yds to Tee Higgins', stat_yardage: 23, scoring_play: false, period: 2, clock_display: '4:21', start_down: 3, start_distance: 4, end_down: 1, end_distance: 10 }],
  });
  assert.equal(stats.higgins.rec, 1);
  assert.equal(stats.mims, undefined);
});

test('a lateral after a catch by a spaced surname credits the catcher, not the lateral', () => {
  // W4 DET at CAR: A.St. Brown 4 yards, lateral to J.Gibbs 9 on 4th and 20.
  // Sleeper: St. Brown rec 8 (this catch among them), Gibbs rec 4 (not this
  // snap), and no first down for either.
  const stats = statsFor([
    { id: 'stbrown', name: 'Amon-Ra St. Brown', position: 'WR', team: 'DET' },
    { id: 'gibbs', name: 'Jahmyr Gibbs', position: 'RB', team: 'DET' },
  ], {
    gameRecord: game('det-car', 'DET', 'CAR'),
    plays: [{ id: '4018729784069', type_slug: 'pass-reception', team: { abbreviation: 'CAR' }, text: '(Shotgun) J.Goff pass short right to A.St. Brown to CAR 21 for 4 yards. Lateral to J.Gibbs to CAR 12 for 9 yards (D.Lloyd).', short_text: 'Jared Goff Pass Complete for 4 Yds to Amon-Ra St. Brown', stat_yardage: 13, scoring_play: false, period: 4, clock_display: '7:10', start_down: 4, start_distance: 20, end_down: 1, end_distance: 10 }],
  });
  assert.deepEqual({ rec: stats.stbrown.rec, rec_yd: stats.stbrown.rec_yd, rec_fd: stats.stbrown.rec_fd }, { rec: 1, rec_yd: 4, rec_fd: undefined });
  assert.deepEqual({ rec: stats.gibbs.rec, rec_yd: stats.gibbs.rec_yd, rec_fd: stats.gibbs.rec_fd }, { rec: undefined, rec_yd: 9, rec_fd: undefined });
});

test('a lateral carried in for a touchdown credits the last carrier with it', () => {
  // W3 ARI at SF: M.Evans 2 yards, lateral to D.Samuel 80 yards for the
  // touchdown (no spot in the text). Sleeper: Samuel rec_yd 80, rec_td 1, no
  // catch; Evans one catch for 2 here. A touchdown is no first down.
  const stats = statsFor([
    { id: 'evans', name: 'Mike Evans', position: 'WR', team: 'SF' },
    { id: 'samuel', name: 'Deebo Samuel Sr.', position: 'WR', team: 'SF' },
  ], {
    gameRecord: game('ari-sf', 'ARI', 'SF'),
    plays: [{ id: '401872958503', type_slug: 'passing-touchdown', team: { abbreviation: 'SF' }, text: '(Shotgun) B.Purdy pass short left to M.Evans to SF 20 for 2 yards. Lateral to D.Samuel for 80 yards, TOUCHDOWN. E.Pineiro extra point is GOOD, Center-J.Weeks, Holder-C.Waitman.', short_text: 'Brock Purdy complete pass to Mike Evans for 2 yards, lateral to Deebo Samuel for 80 yards (Eddy Pineiro Kick)', stat_yardage: 82, scoring_play: true, period: 1, clock_display: '8:26', start_down: 3, start_distance: 12, end_down: -1, end_distance: 10 }],
  });
  assert.deepEqual({ rec: stats.evans.rec, rec_yd: stats.evans.rec_yd, rec_td: stats.evans.rec_td, rec_fd: stats.evans.rec_fd }, { rec: 1, rec_yd: 2, rec_td: undefined, rec_fd: undefined });
  assert.deepEqual({ rec: stats.samuel.rec, rec_yd: stats.samuel.rec_yd, rec_td: stats.samuel.rec_td }, { rec: undefined, rec_yd: 80, rec_td: 1 });
});

// ── Penalties and reversals ─────────────────────────────────────────────

test('a flag on a player with a spaced surname leaves the run or catch credited', () => {
  // W8 MIN at DET: S.Vaki 8 yards on 2nd and 7, then A.St. Brown's taunting
  // foul. Sleeper: Vaki rush_att 11, rush_yd 65, rush_fd 3 (this run counts).
  // W2 GB at NYJ: B.Allen's 8-yard catch with L.Van Ness's roughing foul.
  // Sleeper: Allen rec 1, rec_yd 8.
  const stats = statsFor([
    { id: 'vaki', name: 'Sione Vaki', position: 'RB', team: 'DET' },
  ], {
    gameRecord: game('min-det', 'MIN', 'DET'),
    plays: [{ id: '401873030281', type_slug: 'rush', team: { abbreviation: 'DET' }, text: '(Shotgun) S.Vaki left end to MIN 21 for 8 yards (J.Metellus; E.Wilson).PENALTY on DET-A.St. Brown, Taunting, 15 yards, enforced at MIN 21.', short_text: 'Sione Vaki 8 Yd Rush Amon-Ra St. Brown 15 Yd Pnlty', stat_yardage: -22, scoring_play: false, period: 1, clock_display: '11:25', start_down: 2, start_distance: 7, end_down: 1, end_distance: 10 }],
  });
  assert.deepEqual({ att: stats.vaki.rush_att, yd: stats.vaki.rush_yd, fd: stats.vaki.rush_fd }, { att: 1, yd: 8, fd: 1 });

  const allen = statsFor([{ id: 'allen', name: 'Braelon Allen', position: 'RB', team: 'NYJ' }], {
    gameRecord: game('gb-nyj', 'GB', 'NYJ'),
    plays: [{ id: '4018729362924', type_slug: 'pass-reception', team: { abbreviation: 'NYJ' }, text: '(Shotgun) G.Smith pass short right to B.Allen to GB 11 for 8 yards (E.Williams).PENALTY on GB-L.Van Ness, Roughing the Passer, 6 yards, enforced at GB 11.', short_text: 'Geno Smith Pass Complete for 8 Yds to Braelon Allen Lukas Van Ness 6 Yd Pnlty', stat_yardage: 8, scoring_play: false, period: 3, clock_display: '3:05', start_down: 1, start_distance: 10, end_down: 1, end_distance: 5 }],
  });
  assert.deepEqual({ rec: allen.allen.rec, rec_yd: allen.allen.rec_yd }, { rec: 1, rec_yd: 8 });
});

test('a flag after a lost fumble leaves the catch and the fumble credited', () => {
  // W2 PIT at NE: R.Stevenson's 3-yard catch, stripped, then J.Ramsey's
  // taunting foul. Sleeper: Stevenson rec 1, rec_yd 3, fum 1, fum_lost 1.
  const stats = statsFor([{ id: 'stevenson', name: 'Rhamondre Stevenson', position: 'RB', team: 'NE' }], {
    gameRecord: game('pit-ne', 'PIT', 'NE'),
    plays: [{ id: '401872946243', type_slug: 'fumble-recovery-opponent', team: { abbreviation: 'PIT' }, text: 'D.Maye pass short left to R.Stevenson to PIT 31 for 3 yards (N.Herbig). FUMBLES (N.Herbig), RECOVERED by PIT-P.Wilson at PIT 31.PENALTY on PIT-J.Ramsey, Taunting, 15 yards, enforced at PIT 31.', short_text: 'Drake Maye Pass Complete for 3 Yds to Rhamondre Stevenson Rhamondre Stevenson Fumble Payton Wilson 0 Yd Fumble Recovery Jalen Ramsey 15 Yd Pnlty', stat_yardage: -15, scoring_play: false, period: 1, clock_display: '11:32', start_down: 1, start_distance: 10, end_down: 1, end_distance: 10 }],
  });
  assert.deepEqual(
    { rec: stats.stevenson.rec, rec_yd: stats.stevenson.rec_yd, fum: stats.stevenson.fum, fum_lost: stats.stevenson.fum_lost },
    { rec: 1, rec_yd: 3, fum: 1, fum_lost: 1 },
  );
});

test('a flag the compact text writes first leaves the catch credited, and its player gets nothing', () => {
  // W2 JAX at DEN: T.Hufanga's delay of game after Q.Morris' 7-yard catch.
  // Sleeper: Morris rec 1, rec_yd 7.
  const stats = statsFor([{ id: 'morris', name: 'Quintin Morris', position: 'TE', team: 'JAX' }], {
    gameRecord: game('jax-den', 'JAX', 'DEN'),
    plays: [{ id: '4018729401999', type_slug: 'pass-reception', team: { abbreviation: 'JAX' }, text: '(Shotgun) T.Lawrence pass short right to Q.Morris to DEN 31 for 7 yards (A.Singleton; P.Surtain).PENALTY on DEN-T.Hufanga, Defensive Delay of Game, 5 yards, enforced at DEN 31.', short_text: 'Talanoa Hufanga 5 Yd Pnlty Trevor Lawrence Pass Complete for 7 Yds to Quintin Morris', stat_yardage: 7, scoring_play: false, period: 2, clock_display: '0:16', start_down: 1, start_distance: 10, end_down: 1, end_distance: 10 }],
  });
  assert.deepEqual({ rec: stats.morris.rec, rec_yd: stats.morris.rec_yd }, { rec: 1, rec_yd: 7 });

  // W2 IND at KC, a row with only the compact text: Sleeper gives the
  // flagged lineman K.Suamataia no carry.
  const kc = statsFor([{ id: 'suamataia', name: 'Kingsley Suamataia', position: 'OL', team: 'KC' }], {
    gameRecord: game('ind-kc', 'IND', 'KC'),
    plays: [{ id: '4018729451477', type_slug: 'rush', team: { abbreviation: 'KC' }, text: 'Kingsley Suamataia 10 Yd Pnlty Kenneth Walker III 3 Yd Rush', short_text: 'Kingsley Suamataia 10 Yd Pnlty Kenneth Walker III 3 Yd Rush', stat_yardage: -10, scoring_play: false, period: 2, clock_display: '8:55', start_down: 2, start_distance: 4, end_down: 2, end_distance: 14 }],
  });
  assert.equal(kc.suamataia, undefined);
});

test('a replay that overturns a "No Play" restores the play', () => {
  // W3 LAC at BUF: the fumble and the No Play flag were reversed; J.Allen's
  // 8-yard run stands with a flag on top. Sleeper: Allen rush_att 8, rush_yd
  // 22 (this run among them); A.Mesidor an assisted tackle.
  const stats = statsFor([
    { id: 'allen', name: 'Josh Allen', position: 'QB', team: 'BUF' },
    { id: 'mesidor', name: 'Akheem Mesidor', position: 'DL', team: 'LAC' },
  ], {
    gameRecord: game('lac-buf', 'LAC', 'BUF'),
    plays: [{ id: '4018729533610', type_slug: 'penalty', team: { abbreviation: 'BUF' }, text: '(Shotgun) J.Allen scrambles right end to LAC 32 for 8 yards (A.Mesidor; C.Hart). FUMBLES (A.Mesidor), RECOVERED by LAC-T.Tuipulotu at LAC 27.PENALTY on LAC-R.Shelley, Defensive Holding, 5 yards, enforced at LAC 40 - No Play.The Replay Official reviewed the runner was not down by contact ruling, and the play was REVERSED.(Shotgun) J.Allen scrambles right end to LAC 32 for 8 yards (C.Hart; A.Mesidor).PENALTY on LAC-R.Shelley, Defensive Holding, 5 yards, enforced at LAC 32.', short_text: 'Josh Allen 8 Yd Rush Rodney Shelley 5 Yd Pnlty', stat_yardage: 13, scoring_play: false, period: 4, clock_display: '9:36', start_down: 2, start_distance: 26, end_down: 1, end_distance: 10 }],
  });
  assert.deepEqual({ att: stats.allen.rush_att, yd: stats.allen.rush_yd, fum: stats.allen.fum }, { att: 1, yd: 8, fum: undefined });
  assert.equal(stats.mesidor.idp_tkl, 1);

  // W4 PIT at CLE: a pass interference "No Play" reversed to the
  // interception (the pass was tipped). Sleeper: R.Spears-Jennings idp_int 1
  // and a pass defensed; J.Sawyer a pass defensed and a QB hit.
  const pit = statsFor([
    { id: 'rsj', name: 'Robert Spears-Jennings', position: 'DB', team: 'PIT' },
    { id: 'sawyer', name: 'Jack Sawyer', position: 'DL', team: 'PIT' },
  ], {
    gameRecord: game('pit-cle', 'PIT', 'CLE'),
    scoring: { ...SCORING, idp_int: 1, idp_pd: 1, idp_qbhit: 1 },
    plays: [{ id: '4018729643321', type_slug: 'pass-interception-return', team: { abbreviation: 'PIT' }, text: '(Shotgun) D.Watson pass deep middle intended for D.Boston INTERCEPTED by R.Spears-Jennings [J.Sawyer] at PIT 23. R.Spears-Jennings to PIT 23 for no gain (D.Boston).PENALTY on PIT-D.Everette, Defensive Pass Interference, 42 yards, enforced at CLV 35 - No Play.The Replay Official reviewed the pass was not tipped ruling, and the play was REVERSED.(Shotgun) D.Watson pass deep middle intended for D.Boston INTERCEPTED by R.Spears-Jennings (J.Sawyer) [J.Sawyer] at PIT 23. R.Spears-Jennings to PIT 23 for no gain (D.Boston).', short_text: 'null', stat_yardage: 0, scoring_play: false, period: 4, clock_display: '14:19', start_down: 1, start_distance: 10, end_down: 1, end_distance: 10 }],
  });
  assert.deepEqual({ int: pit.rsj.idp_int, pd: pit.rsj.idp_pd }, { int: 1, pd: 1 });
  assert.deepEqual({ pd: pit.sawyer.idp_pd, hit: pit.sawyer.idp_qbhit }, { pd: 1, hit: 1 });
});

// ── Edge cases (step 3) ─────────────────────────────────────────────────

test('a lineman who fumbles the snap is charged the fumble only; the quarterback who runs with it gets the gain', () => {
  // W8 NE at MIA: J.Wilson's loose snap, D.Maye fell on it and ran to MIA 22
  // (net 1 from the line). Sleeper: Wilson fum 1 and no carry; Maye's
  // rush_yd includes the 1.
  const stats = statsFor([
    { id: 'maye', name: 'Drake Maye', position: 'QB', team: 'NE' },
    { id: 'wilson', name: 'Jared Wilson', position: 'OL', team: 'NE' },
  ], {
    gameRecord: game('ne-mia', 'NE', 'MIA'),
    plays: [{ id: '4018730341534', type_slug: 'fumble-recovery-own', team: { abbreviation: 'NE' }, text: '(Shotgun) D.Maye Aborted. J.Wilson FUMBLES at MIA 24, recovered by NE-D.Maye at MIA 29. D.Maye to MIA 22 for 7 yards (M.Taaffe).', short_text: 'Drake Maye Aborted Snap Jared Wilson Fumble Drake Maye 0 Yd Fumble Recovery', stat_yardage: 1, scoring_play: false, period: 2, clock_display: '3:07', start_down: 3, start_distance: 4, end_down: 4, end_distance: 3 }],
  });
  assert.deepEqual(stats.wilson, { fum: 1 });
  assert.deepEqual({ att: stats.maye.rush_att, yd: stats.maye.rush_yd, fd: stats.maye.rush_fd }, { att: 1, yd: 1, fd: undefined });

  // W2 MIN at CHI: C.Williams' own aborted snap, then 19 yards to MIN 45 (17
  // net) on 2nd and 3. Sleeper: rush_yd 42 = 25 elsewhere + 17, rush_fd 3.
  const chi = statsFor([{ id: 'williams', name: 'Caleb Williams', position: 'QB', team: 'CHI' }], {
    gameRecord: game('min-chi', 'MIN', 'CHI'),
    plays: [{ id: '401872937336', type_slug: 'fumble-recovery-own', team: { abbreviation: 'CHI' }, text: 'C.Williams FUMBLES (Aborted) at CHI 37, and recovers at CHI 36. C.Williams to MIN 45 for 19 yards (J.Metellus).', short_text: 'Caleb Williams Aborted Snap Caleb Williams Fumble Caleb Williams 0 Yd Fumble Recovery', stat_yardage: 17, scoring_play: false, period: 1, clock_display: '10:24', start_down: 2, start_distance: 3, end_down: 1, end_distance: 10 }],
  });
  assert.deepEqual({ att: chi.williams.rush_att, yd: chi.williams.rush_yd, fd: chi.williams.rush_fd, fum: chi.williams.fum }, { att: 1, yd: 17, fd: 1, fum: 1 });

  // W6 CAR at PHI: J.Majors' loose snap, T.McKee fell on it 7 yards back.
  // Sleeper: Majors fum 1, no carry; McKee rush_yd 0.
  const phi = statsFor([
    { id: 'mckee', name: 'Tanner McKee', position: 'QB', team: 'PHI' },
    { id: 'majors', name: 'Jake Majors', position: 'OL', team: 'PHI' },
  ], {
    gameRecord: game('car-phi', 'CAR', 'PHI'),
    plays: [{ id: '4018729984147', type_slug: 'fumble-recovery-own', team: { abbreviation: 'PHI' }, text: '(Shotgun) T.McKee Aborted. J.Majors FUMBLES at PHI 43, recovered by PHI-T.McKee at PHI 36. ** Injury Update: PHI-D.Wicks has returned to the game.', short_text: 'Tanner McKee Aborted Snap Jake Majors Fumble Tanner McKee 0 Yd Fumble Recovery', stat_yardage: -12, scoring_play: false, period: 4, clock_display: '9:32', start_down: 1, start_distance: 10, end_down: 2, end_distance: 22 }],
  });
  assert.deepEqual(phi.majors, { fum: 1 });
  assert.equal(phi.mckee.rush_yd, 0);
});

test('a blocked field goal gives the snapper, holder and coverage no carries', () => {
  // W4 DEN at SF: Sleeper has no rushing line for J.Weeks, C.Waitman,
  // L.Farrell or C.McKivitz.
  const stats = statsFor([
    { id: 'weeks', name: 'Jon Weeks', position: 'LS', team: 'SF' },
    { id: 'waitman', name: 'Corliss Waitman', position: 'P', team: 'SF' },
    { id: 'farrell', name: 'Luke Farrell', position: 'TE', team: 'SF' },
    { id: 'mckivitz', name: 'Colton McKivitz', position: 'OL', team: 'SF' },
  ], {
    gameRecord: game('den-sf', 'DEN', 'SF'),
    plays: [{ id: '4018729752223', type_slug: 'blocked-field-goal', team: { abbreviation: 'DEN' }, text: 'E.Pineiro 54 yard field goal is BLOCKED (Z.Allen), Center-J.Weeks, Holder-C.Waitman, RECOVERED by DEN-T.Hufanga at DEN 37. T.Hufanga to DEN 42 for 5 yards (L.Farrell). FUMBLES (L.Farrell), recovered by DEN-D.Key at DEN 42. D.Key to DEN 46 for 4 yards (L.Farrell; C.McKivitz).', short_text: 'Talanoa Hufanga Fumble Devon Key 4 Yd Fumble Recovery Blocked Kick Recovered by Talanoa Hufanga (DEN) Blocked Kick Recovered by Zach Allen (DEN) Eddy', stat_yardage: 0, scoring_play: false, period: 2, clock_display: '0:04', start_down: 3, start_distance: 5, end_down: 1, end_distance: 10 }],
  });
  ['weeks', 'waitman', 'farrell', 'mckivitz'].forEach((id) => assert.equal(stats[id]?.rush_att, undefined, id));
});

test('a full name is never matched to a defender, nor to a teammate with the same initial', () => {
  // W5 MIN at NO: "Kendre Miller" (no longer on NO's roster) used to fall
  // back to defensive tackle Christen Miller; Sleeper gives him no carries.
  const stats = statsFor([{ id: 'christen', name: 'Christen Miller', position: 'DL', team: 'NO' }], {
    gameRecord: game('min-no', 'MIN', 'NO'),
    plays: [{ id: '4018729872261', type_slug: 'rush', team: { abbreviation: 'NO' }, text: 'K.Miller right end to MIN 47 for -1 yards (B.Cashman).', short_text: 'Kendre Miller Rush, Loss of 1 Yd', stat_yardage: -1, scoring_play: false, period: 3, clock_display: '9:31', start_down: 1, start_distance: 10, end_down: 2, end_distance: 11 }],
  });
  assert.equal(stats.christen, undefined);

  // W8 PHI at WAS: "Hollywood Brown" is Marquise Brown, the only Brown on
  // PHI, though the league-wide surname is too common to index. Sleeper:
  // rec 2, rec_yd 17, rec_fd 2 (this catch one of them).
  const phi = statsFor([
    { id: 'marquise', name: 'Marquise Brown', position: 'WR', team: 'PHI' },
    { id: 'dyami', name: 'Dyami Brown', position: 'WR', team: 'WAS' },
    { id: 'derrick', name: 'Derrick Brown', position: 'DL', team: 'CAR' },
  ], {
    gameRecord: game('phi-was', 'PHI', 'WAS'),
    plays: [{ id: '4018730353407', type_slug: 'pass-reception', team: { abbreviation: 'PHI' }, text: '(Shotgun) T.McKee pass short left to M.Brown to WAS 30 for 8 yards (R.Douglas).', short_text: 'Tanner McKee Pass Complete for 8 Yds to Hollywood Brown', stat_yardage: 8, scoring_play: false, period: 4, clock_display: '13:02', start_down: 3, start_distance: 8, end_down: 1, end_distance: 10 }],
  });
  assert.deepEqual({ rec: phi.marquise.rec, rec_yd: phi.marquise.rec_yd, rec_fd: phi.marquise.rec_fd }, { rec: 1, rec_yd: 8, rec_fd: 1 });
});

test('a defender the gamebook names by legal first name is the one defender with that surname', () => {
  // W1 WAS at PHI: "T.Woolen" is Riq Woolen; every Woolen, Dru Phillips,
  // Sauce Gardner and C.J. Okoye line in weeks 1–10 matches Sleeper with this.
  const stats = statsFor([{ id: 'woolen', name: 'Riq Woolen', position: 'DB', team: 'PHI' }], {
    gameRecord: game('was-phi', 'WAS', 'PHI'),
    scoring: { ...SCORING, idp_tkl_solo: 1 },
    plays: [{ id: '4018729293179', type_slug: 'rush', team: { abbreviation: 'WAS' }, text: '(Shotgun) J.Daniels scrambles right tackle to WAS 46 for 13 yards (T.Woolen).', short_text: 'Jayden Daniels 13 Yd Rush', stat_yardage: 13, scoring_play: false, period: 3, clock_display: '0:40', start_down: 1, start_distance: 10, end_down: 1, end_distance: 10 }],
  });
  assert.equal(stats.woolen.idp_tkl, 1);
});

test('a muffed punt is the returner\'s fumble, lost when the kicking team recovers', () => {
  // W2 JAX at DEN: P.Washington fell on his own muff. Sleeper: fum 1.
  const jax = statsFor([{ id: 'washington', name: 'Parker Washington', position: 'WR', team: 'JAX' }], {
    gameRecord: game('jax-den', 'JAX', 'DEN'),
    plays: [{ id: '401872940153', type_slug: 'punt', team: { abbreviation: 'JAX' }, text: 'J.Crawshaw punts 48 yards to JAX 28, Center-M.Fraboni. P.Washington MUFFS catch, and recovers at JAX 28. P.Washington to JAX 28 for no gain (J.Skinner).', short_text: 'Jeremy Crawshaw 48 Yd Punt Parker Washington 0 Yd Fumble Recovery Parker Washington Punt Return, No Gain', stat_yardage: 0, scoring_play: false, period: 1, clock_display: '13:11', start_down: 4, start_distance: 10, end_down: 1, end_distance: 10 }],
  });
  assert.equal(jax.washington.fum, 1);
  assert.equal(jax.washington.fum_lost, undefined);

  // W6 CHI at ATL: Z.Branch's muff recovered by CHI. Sleeper: fum and
  // fum_lost for it.
  const atl = statsFor([{ id: 'branch', name: 'Zachariah Branch', position: 'WR', team: 'ATL' }], {
    gameRecord: game('chi-atl', 'CHI', 'ATL'),
    plays: [{ id: '4018729991786', type_slug: 'muffed-punt-recovery-opponent', team: { abbreviation: 'CHI' }, text: 'T.Taylor punts 50 yards to ATL 10, Center-S.Daly. Z.Branch MUFFS catch, RECOVERED by CHI-J.Blackwell at ATL 10.', short_text: 'Tory Taylor 50 Yd Punt Zachariah Branch Punt Return, No Gain Josh Blackwell 0 Yd Fumble Recovery', stat_yardage: 0, scoring_play: false, period: 2, clock_display: '1:52', start_down: 4, start_distance: 1, end_down: 1, end_distance: 10 }],
  });
  assert.deepEqual({ fum: atl.branch.fum, lost: atl.branch.fum_lost }, { fum: 1, lost: 1 });
});

test('an interception return summary filed under a fumble slug is the defense\'s pick and touchdown', () => {
  // W9 LV at SF: Sleeper credits SF int 1, int_ret_yd 35, def_td 1, and
  // J.Dugger the interception; E.Pineiro the extra point.
  const stats = statsFor([
    { id: 'SF', name: 'San Francisco 49ers', position: 'DEF', team: 'SF' },
    { id: 'LV', name: 'Las Vegas Raiders', position: 'DEF', team: 'LV' },
    { id: 'dugger', name: 'Jaden Dugger', position: 'LB', team: 'SF' },
  ], {
    gameRecord: game('lv-sf', 'LV', 'SF'),
    scoring: { ...SCORING, int: 2, int_ret_yd: 0.1, def_td: 6, idp_int: 3 },
    plays: [{ id: '4018730471924', type_slug: 'fumble-recovery-own', team: { abbreviation: 'SF' }, text: 'Jaden Dugger 35 Yd Interception Return (Eddy Pineiro Kick)', short_text: 'Jaden Dugger 35 Yd Interception Return (Eddy Pineiro Kick)', stat_yardage: 35, scoring_play: true, period: 3, clock_display: '14:43', start_down: 1, start_distance: 10, end_down: -1, end_distance: 10 }],
  });
  assert.deepEqual({ int: stats.SF.int, ret: stats.SF.int_ret_yd, td: stats.SF.def_td }, { int: 1, ret: 35, td: 1 });
  assert.equal(stats.LV?.int, undefined);
  assert.equal(stats.dugger.idp_int, 1);
});

test('a kick return with a lateral counts every carrier\'s yards for the team', () => {
  // W9 LV at SF: D.Laube 18, lateral to D.Young 4. Sleeper's LV def_kr_yd
  // (222) is 25 more than the first carriers' alone over this and one more.
  const stats = statsFor([{ id: 'LV', name: 'Las Vegas Raiders', position: 'DEF', team: 'LV' }], {
    gameRecord: game('lv-sf', 'LV', 'SF'),
    scoring: { ...SCORING, def_kr_yd: 0.1 },
    plays: [{ id: '4018730473538', type_slug: 'kickoff', team: { abbreviation: 'LV' }, text: 'E.Pineiro kicks 65 yards from SF 35 to LV 0. D.Laube to LV 18 for 18 yards. Lateral to D.Young to LV 22 for 4 yards (S.Neal).', short_text: 'Eddy Pineiro 65 Yd Kickoff Dylan Laube 18 Yd Kickoff Return', stat_yardage: 18, scoring_play: false, period: 4, clock_display: '5:21', start_down: 0, start_distance: 0, end_down: 1, end_distance: 10 }],
  });
  assert.equal(stats.LV.def_kr_yd, 22);
});

// ── Leftovers (step 4) ───────────────────────────────────────────────────

test('a fourth down ended by an interception is the defense\'s fourth-down stop', () => {
  // W10 KC at ATL: N.Williams' pick on 4th and 10. Sleeper: KC
  // def_4_and_stop 2 (the other is a turnover on downs).
  const stats = statsFor([{ id: 'KC', name: 'Kansas City Chiefs', position: 'DEF', team: 'KC' }], {
    gameRecord: game('kc-atl', 'KC', 'ATL'),
    scoring: { ...SCORING, int: 2, def_4_and_stop: 1 },
    plays: [{ id: '4018730584353', type_slug: 'pass-interception-return', team: { abbreviation: 'KC' }, text: '(Shotgun) M.Penix pass deep middle intended for C.Blair INTERCEPTED by N.Williams at KC -3. N.Williams to KC 17 for 20 yards.', short_text: 'Nohl Williams 20 Yd Interception Return', stat_yardage: 20, scoring_play: false, period: 4, clock_display: '2:39', start_down: 4, start_distance: 10, end_down: 1, end_distance: 10 }],
  });
  assert.deepEqual({ int: stats.KC.int, stop: stats.KC.def_4_and_stop }, { int: 1, stop: 1 });
});

test('a "No Play" snap filed under a turnover slug keeps the ball with the offense', async () => {
  // W2 JAX at DEN: a strip-sack wiped out by illegal contact; JAX ran the
  // next snap.
  const { getOffenseTeam } = await import('../../src/utils/nflPlays/fieldGeometry.js');
  const play = { team: 'JAX', typeSlug: 'sack-opp-fumble-recovery', rawText: 'W.Milum reported in as eligible.  T.Lawrence sacked at JAX 34 for -9 yards (N.Bonitto). FUMBLES (N.Bonitto), RECOVERED by DEN-A.Singleton at JAX 30. A.Singleton to JAX 21 for 9 yards (B.Tuten).PENALTY on DEN-R.Moss, Illegal Contact, 5 yards, enforced at JAX 43 - No Play.' };
  assert.equal(getOffenseTeam(play, { homeTeam: 'DEN', awayTeam: 'JAX' }), 'JAX');
});
