import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { groupBdlPlaysIntoDrives, normalizeBdlScorePlay } from '../../src/utils/balldontlieNflScoreboard.js';
import {
  END_ZONE_WIDTH_PCT,
  classifyPlay,
  fieldX,
  formatFieldSpot,
  getDriveExtent,
  getDriveNetYards,
  getFirstDownMarkerPercent,
  getOffenseTeam,
  getPlaySegment,
  getPlayTrajectory,
  isFieldFlipped,
  isNonSnapPlay,
  isScoringPlay,
  isTurnoverOnDowns,
  playColor,
  possessionTextToPercent,
  toFieldPercent,
  yardLineToPercent,
} from '../../src/utils/nflPlays/fieldGeometry.js';

const FIXTURE = JSON.parse(fs.readFileSync(new URL('../fixtures/bdlNflPlays.json', import.meta.url), 'utf8'));

const ADMINISTRATIVE = new Set([
  'timeout', 'official-timeout', 'two-minute-warning', 'end-period', 'end-of-half', 'end-of-game',
]);

function eachPlay(callback) {
  FIXTURE.games.forEach((game) => {
    const homeTeam = game.home_team.abbreviation;
    const awayTeam = game.visitor_team.abbreviation;
    const context = { away: { id: awayTeam }, home: { id: homeTeam } };
    game.plays.forEach((raw) => callback(normalizeBdlScorePlay(raw, context), { homeTeam, awayTeam }));
  });
}

test('the away team occupies the low end of the field and the home team the high end', () => {
  // yards_to_endzone is measured from whoever has the ball, so the same number
  // means opposite ends of the field depending on possession.
  assert.equal(toFieldPercent(20, { possessionTeam: 'DAL', homeTeam: 'PHI' }), 80);
  assert.equal(toFieldPercent(20, { possessionTeam: 'PHI', homeTeam: 'PHI' }), 20);
  assert.equal(toFieldPercent(50, { possessionTeam: 'DAL', homeTeam: 'PHI' }), 50);
});

test('field position is null when the play does not report it', () => {
  assert.equal(toFieldPercent(null, { possessionTeam: 'DAL', homeTeam: 'PHI' }), null);
  assert.equal(toFieldPercent(20, { possessionTeam: null, homeTeam: 'PHI' }), null);
});

test('a possession string resolves to the same absolute position', () => {
  assert.equal(possessionTextToPercent('PHI 36', { homeTeam: 'PHI' }), 64);
  assert.equal(possessionTextToPercent('DAL 26', { homeTeam: 'PHI' }), 26);
  assert.equal(possessionTextToPercent('not a spot', { homeTeam: 'PHI' }), null);
});

test("the numeric field agrees with the provider's own spot text on every play that has both", () => {
  let compared = 0;
  eachPlay((play, { homeTeam }) => {
    const numeric = toFieldPercent(play.endYardsToEndzone, { possessionTeam: play.team, homeTeam });
    const text = possessionTextToPercent(play.endPossessionText, { homeTeam });
    if (numeric == null || text == null) return;
    compared += 1;
    assert.equal(numeric, text, `spot mismatch on ${play.shortText}`);
  });
  assert.ok(compared > 300, `expected a meaningful sample, compared ${compared}`);
});

test('every play except clock stoppages can be drawn', () => {
  const undrawable = [];
  eachPlay((play, teams) => {
    if (ADMINISTRATIVE.has(play.typeSlug)) return;
    if (!getPlaySegment(play, teams).drawable) undrawable.push(play.shortText);
  });
  assert.deepEqual(undrawable, []);
});

test('a score ends in the attacking end zone rather than nowhere', () => {
  // The provider reports a null end spot on a touchdown — the ball left the
  // field of play — which would otherwise leave the graphic with a gap.
  eachPlay((play, teams) => {
    if (!String(play.typeSlug).includes('touchdown')) return;
    const segment = getPlaySegment(play, teams);
    assert.equal(play.endYardsToEndzone, null);
    assert.equal(segment.scored, true);
    assert.equal(segment.endPct, segment.attackingEndzonePct);
  });
});

test('movement is measured toward the attacking end zone, so a loss is negative', () => {
  const away = getPlaySegment(
    { team: 'DAL', typeSlug: 'rush', startYardsToEndzone: 50, endYardsToEndzone: 42 },
    { homeTeam: 'PHI', awayTeam: 'DAL' },
  );
  assert.equal(away.gained, 8);
  assert.equal(away.direction, 'right');

  const home = getPlaySegment(
    { team: 'PHI', typeSlug: 'rush', startYardsToEndzone: 50, endYardsToEndzone: 58 },
    { homeTeam: 'PHI', awayTeam: 'DAL' },
  );
  assert.equal(home.gained, -8);
  assert.equal(home.direction, 'left');
});

test('a possession-changing play refuses to draw without an explicit end spot', () => {
  // On a kick the two numeric fields are measured from different teams, so a
  // guess here would draw the ball moving the wrong way.
  const segment = getPlaySegment(
    { team: 'PHI', typeSlug: 'kickoff', startYardsToEndzone: 65, endYardsToEndzone: 53, endPossessionText: null },
    { homeTeam: 'PHI', awayTeam: 'DAL' },
  );
  assert.equal(segment.drawable, false);
  assert.equal(segment.endPct, null);
});

test('the first-down marker sits ahead of the ball in the direction of the drive', () => {
  const away = getFirstDownMarkerPercent(
    { team: 'DAL', startDown: 1, startDistance: 10, startYardsToEndzone: 60 },
    { homeTeam: 'PHI' },
  );
  assert.equal(away, 50);

  const home = getFirstDownMarkerPercent(
    { team: 'PHI', startDown: 1, startDistance: 10, startYardsToEndzone: 60 },
    { homeTeam: 'PHI' },
  );
  assert.equal(home, 50);
});

test('there is no first-down marker without a reported down and distance', () => {
  assert.equal(getFirstDownMarkerPercent({ team: 'DAL', startDown: 0, startDistance: 10, startYardsToEndzone: 60 }, { homeTeam: 'PHI' }), null);
  assert.equal(getFirstDownMarkerPercent({ team: 'DAL', startDown: 1, startDistance: null, startYardsToEndzone: 60 }, { homeTeam: 'PHI' }), null);
});

test('a drive extent spans its plays with padding and stays on the field', () => {
  const plays = [
    { team: 'DAL', typeSlug: 'rush', startYardsToEndzone: 75, endYardsToEndzone: 70 },
    { team: 'DAL', typeSlug: 'rush', startYardsToEndzone: 70, endYardsToEndzone: 40 },
  ];
  const extent = getDriveExtent(plays, { homeTeam: 'PHI', awayTeam: 'DAL' });
  assert.equal(extent.min, 19);
  assert.equal(extent.max, 66);
  assert.equal(getDriveExtent([], { homeTeam: 'PHI', awayTeam: 'DAL' }), null);
});

// ── the 120-yard canvas ─────────────────────────────────────────────────────

test('the canvas maps the field between its two end zones', () => {
  // The end zones take 10 of the 120 yards at each end, so a goal line sits at
  // 1/12 of the canvas and midfield lands exactly halfway across it.
  assert.equal(Math.round(fieldX(0) * 1000) / 1000, 8.333);
  assert.equal(fieldX(50), 50);
  assert.equal(Math.round(fieldX(100) * 1000) / 1000, 91.667);
  assert.equal(END_ZONE_WIDTH_PCT, fieldX(0));
});

test('the play type comes from the slug, not from text the play drags along', () => {
  // A touchdown's description carries the extra point with it. Reading the text
  // first would classify every score as a kick and stop it drawing.
  assert.deepEqual(
    classifyPlay({ typeSlug: 'rushing-touchdown', description: 'J.Williams up the middle for 1 yard, TOUCHDOWN. B.Aubrey extra point is GOOD.' }),
    { type: 'rush', flag: 'td' },
  );
  assert.deepEqual(classifyPlay({ typeSlug: 'pass-incompletion', description: 'D.Prescott pass incomplete.' }), { type: 'pass', flag: 'incomplete' });
  assert.deepEqual(classifyPlay({ typeSlug: 'sack', description: 'J.Hurts sacked for -8 yards.' }), { type: 'pass', flag: 'sack' });
  assert.deepEqual(classifyPlay({ typeSlug: 'pass-interception-return', description: '' }), { type: 'pass', flag: 'int' });
  assert.deepEqual(classifyPlay({ typeSlug: 'punt', description: 'B.Mann punts 51 yards.' }), { type: 'kick', flag: 'punt' });
});

test('the play type falls back to the description when the slug says nothing', () => {
  assert.deepEqual(classifyPlay({ typeSlug: null, description: 'B.Mann punts 51 yards to DAL 26.' }), { type: 'kick', flag: 'punt' });
});

test('a kick reads its direction from the named spots, not from possession', () => {
  // The feed files a punt under the *receiving* team, so the possession fields
  // point the ball the wrong way down the field.
  const punt = getPlayTrajectory(
    { team: 'PHI', typeSlug: 'punt', startYardsToEndzone: 27, description: 'B.Anger punts 49 yards to PHI 24, Center-T.Sieg, fair catch by J.Dotson.' },
    { homeTeam: 'PHI', awayTeam: 'DAL' },
  );
  assert.equal(punt.drawable, true);
  assert.equal(punt.dir, 1, 'DAL punts toward the PHI end zone');
  assert.equal(punt.start, 27, 'a 49-yard punt landing on PHI 24 was kicked from DAL 27');
  assert.equal(punt.kick.land, 76);
  assert.equal(punt.kick.returnYards, 0);
});

test('a kickoff takes its start spot from the description too', () => {
  const kickoff = getPlayTrajectory(
    { team: 'DAL', typeSlug: 'kickoff', startYardsToEndzone: 65, description: 'J.Elliott kicks 60 yards from PHI 35 to DAL 5. K.Turpin pushed ob at DAL 32 for 27 yards (K.Granson).' },
    { homeTeam: 'PHI', awayTeam: 'DAL' },
  );
  assert.equal(kickoff.dir, -1);
  assert.equal(kickoff.start, 65, 'PHI 35');
  assert.equal(kickoff.kick.land, 5, 'DAL 5');
  assert.equal(kickoff.kick.finish, 32, 'returned to DAL 32');
  assert.equal(kickoff.kick.returnYards, 27);
});

test('a touchback has no return, and never borrows the penalty spot for one', () => {
  const kickoff = getPlayTrajectory(
    { team: 'PHI', typeSlug: 'kickoff', startYardsToEndzone: 65, description: 'B.Aubrey kicks 65 yards from DAL 35 to end zone, Touchback to the PHI 35.PENALTY on PHI-M.Epps, Illegal Motion, 5 yards.' },
    { homeTeam: 'PHI', awayTeam: 'DAL' },
  );
  assert.equal(kickoff.dir, 1);
  assert.equal(kickoff.start, 35, 'DAL 35');
  assert.equal(kickoff.kick.land, 100);
  assert.equal(kickoff.kick.returnYards, 0);
  assert.equal(kickoff.kick.finish, 100);
});

test('a field goal flies at the goal line rather than its stated distance', () => {
  // "58 yard field goal" measures from the holder through the back of the end
  // zone; drawn literally it would leave the canvas.
  const attempt = getPlayTrajectory(
    { team: 'PHI', typeSlug: 'field-goal-good', startYardsToEndzone: 40, description: 'J.Elliott 58 yard field goal is GOOD.' },
    { homeTeam: 'PHI', awayTeam: 'DAL' },
  );
  assert.equal(attempt.dir, -1);
  assert.equal(attempt.kick.land, 0);
  assert.equal(attempt.kick.finish, 0);
});

test('a kick that names no landing spot does not draw', () => {
  const punt = getPlayTrajectory(
    { team: 'PHI', typeSlug: 'punt', startYardsToEndzone: 27, description: 'Punt formation.' },
    { homeTeam: 'PHI', awayTeam: 'DAL' },
  );
  assert.equal(punt.drawable, false);
});

test('every non-administrative play in the fixture draws', () => {
  const undrawable = [];
  eachPlay((play, context) => {
    if (ADMINISTRATIVE.has(String(play.typeSlug))) return;
    const trajectory = getPlayTrajectory(play, context);
    if (!trajectory.drawable) undrawable.push(`${play.typeSlug}: ${play.description}`);
    if (trajectory.drawable) {
      assert.ok(trajectory.start >= 0 && trajectory.start <= 100, `start on the field: ${play.description}`);
      assert.ok(trajectory.end >= 0 && trajectory.end <= 100, `end on the field: ${play.description}`);
    }
  });
  assert.deepEqual(undrawable, []);
});

test('a spot is written the way a broadcast writes it', () => {
  const teams = { homeTeam: 'PHI', awayTeam: 'DAL' };
  assert.equal(formatFieldSpot(35, teams), 'DAL 35');
  assert.equal(formatFieldSpot(65, teams), 'PHI 35');
  assert.equal(formatFieldSpot(50, teams), '50');
  assert.equal(formatFieldSpot(0, teams), 'DAL Goal');
  assert.equal(formatFieldSpot(100, teams), 'PHI Goal');
  assert.equal(formatFieldSpot(null, teams), null);
});

test('a drive nets the ground it gained, ignoring the kick that ended it', () => {
  const plays = [
    { team: 'DAL', typeSlug: 'rush', startDown: 1, startDistance: 10, startYardsToEndzone: 75, endYardsToEndzone: 68 },
    { team: 'DAL', typeSlug: 'rush', startDown: 2, startDistance: 3, startYardsToEndzone: 68, endYardsToEndzone: 55 },
    { team: 'DAL', typeSlug: 'punt', startYardsToEndzone: 55, description: 'B.Anger punts 40 yards to PHI 5.' },
  ];
  assert.equal(getDriveNetYards(plays, { homeTeam: 'PHI', awayTeam: 'DAL' }), 20);
});

test('the offense is the team that ran the play, not the one left holding the ball', () => {
  const teams = { homeTeam: 'PHI', awayTeam: 'DAL' };
  // A normal play reports its own offense.
  assert.equal(getOffenseTeam({ team: 'DAL', typeSlug: 'rush' }, teams), 'DAL');
  assert.equal(getOffenseTeam({ team: 'DAL', typeSlug: 'field-goal-good' }, teams), 'DAL');
  // A kick or a turnover reports whoever ends up with the ball.
  assert.equal(getOffenseTeam({ team: 'DAL', typeSlug: 'punt' }, teams), 'PHI');
  assert.equal(getOffenseTeam({ team: 'DAL', typeSlug: 'kickoff' }, teams), 'PHI');
  assert.equal(getOffenseTeam({ team: 'DAL', typeSlug: 'field-goal-missed' }, teams), 'PHI');
  assert.equal(getOffenseTeam({ team: 'DAL', typeSlug: 'pass-interception-return' }, teams), 'PHI');
  assert.equal(getOffenseTeam({ team: 'DAL', typeSlug: 'fumble-recovery-opponent' }, teams), 'PHI');
  // Nothing to correct against.
  assert.equal(getOffenseTeam({ team: 'DAL', typeSlug: 'punt' }, {}), 'DAL');
  assert.equal(getOffenseTeam({ team: null, typeSlug: 'punt' }, teams), null);
});

test('a missed field goal flies at the end zone the kicker was aiming for', () => {
  // Reported under the team taking over on downs, so reading `team` as the
  // offense sent the kick at the opposite end zone.
  const attempt = getPlayTrajectory(
    { team: 'CIN', typeSlug: 'field-goal-missed', startYardsToEndzone: 18, endPossessionText: 'CIN 18', description: 'A.Szmyt 36 yard field goal is No Good, Wide Right.' },
    { homeTeam: 'CLE', awayTeam: 'CIN' },
  );
  assert.equal(attempt.dir, -1, 'CLE attacks the low end of the field');
  assert.equal(attempt.start, 18, 'a 36-yard attempt is kicked from the 18');
  assert.equal(attempt.kick.land, 0);
});

test('a turnover is drawn travelling the way the offense was going', () => {
  const interception = getPlayTrajectory(
    { team: 'CIN', typeSlug: 'pass-interception-return', startYardsToEndzone: 81, endPossessionText: 'CLE 34', description: 'J.Flacco pass deep middle INTERCEPTED by J.Battle at CLV 36.' },
    { homeTeam: 'CLE', awayTeam: 'CIN' },
  );
  assert.equal(interception.dir, -1, 'CLE threw it');
  assert.equal(interception.start, 81, "CLE's own 19");
  assert.equal(interception.flag, 'int');
});

test('a play that scored is gold, whatever put the points up', () => {
  const gold = 'var(--color-signature)';
  const teamColor = '#0076B6';
  assert.equal(playColor({ scoring: true, type: 'kick', flag: 'fg' }, teamColor), gold, 'made field goal');
  assert.equal(playColor({ scoring: true, type: 'rush', flag: 'td' }, teamColor), gold, 'touchdown');
  assert.equal(playColor({ scoring: true, type: 'kick', flag: null }, teamColor), gold, 'extra point');
  assert.equal(playColor({ scoring: true, type: 'pass', flag: 'int', yards: -30 }, teamColor), gold, 'pick six');
  // A kick that missed is not a score and keeps the neutral treatment.
  assert.equal(playColor({ scoring: false, type: 'kick', flag: 'fg' }, teamColor), teamColor, 'missed field goal');
  assert.equal(playColor({ scoring: false, type: 'rush', flag: null, yards: -4 }, teamColor), 'var(--color-accent-red)');
  assert.equal(playColor({ scoring: false, type: 'rush', flag: null, yards: 6 }, teamColor), teamColor);
  // A penalty keeps the signature yellow but is told apart by its fill, never
  // by its colour — orange collides with the team colour on too many teams.
  assert.equal(playColor({ scoring: false, type: 'penalty', flag: 'penalty' }, teamColor), 'var(--color-signature)');
});

test('the scoreboard decides what scored, not the play type', () => {
  // The only thing separating a made field goal from a missed one.
  assert.equal(isScoringPlay({ scoring: true, typeSlug: 'field-goal-good' }), true);
  assert.equal(isScoringPlay({ scoring: false, typeSlug: 'field-goal-missed' }), false);
  // A touchdown wiped out by a penalty did not score.
  assert.equal(isScoringPlay({ scoring: false, typeSlug: 'rushing-touchdown' }), false);
  // Falling back to the slug when the feed omits the flag.
  assert.equal(isScoringPlay({ typeSlug: 'extra-point-good' }), true);
  assert.equal(isScoringPlay({ typeSlug: 'extra-point-failed' }), false);
  assert.equal(isScoringPlay({ typeSlug: 'two-point-pass-good' }), true);
  assert.equal(isScoringPlay({ typeSlug: 'safety' }), true);
  assert.equal(isScoringPlay({ typeSlug: 'punt' }), false);
  assert.equal(isScoringPlay({ typeSlug: 'rush' }, 'td'), true);
});

test('every scoring play in the fixture is drawn gold and no other kick is', () => {
  eachPlay((play, teams) => {
    const trajectory = getPlayTrajectory(play, teams);
    const colour = playColor(trajectory, '#0076B6');
    if (play.scoring) {
      assert.equal(colour, 'var(--color-signature)', `scored but not gold: ${play.description}`);
    }
    if (String(play.typeSlug) === 'field-goal-missed') {
      assert.notEqual(colour, 'var(--color-signature)', 'a miss is not a score');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The newer feed shape: absolute yard lines, phantom stoppage spots, and the
// turnover on downs the provider never names. Captured from a real preseason
// game whose drives were reading -89 net yards.

const PRESEASON = JSON.parse(fs.readFileSync(new URL('../fixtures/bdlNflPlaysPreseason.json', import.meta.url), 'utf8'));

function eachPreseasonPlay(callback) {
  PRESEASON.games.forEach((game) => {
    const homeTeam = game.home_team.abbreviation;
    const awayTeam = game.visitor_team.abbreviation;
    const context = { away: { id: awayTeam }, home: { id: homeTeam } };
    game.plays.forEach((raw) => callback(normalizeBdlScorePlay(raw, context), { homeTeam, awayTeam }));
  });
}

function eachPreseasonDrive(callback) {
  PRESEASON.games.forEach((game) => {
    const homeTeam = game.home_team.abbreviation;
    const awayTeam = game.visitor_team.abbreviation;
    const context = { away: { id: awayTeam }, home: { id: homeTeam } };
    groupBdlPlaysIntoDrives(game.plays, context).forEach((drive) => callback(drive, { homeTeam, awayTeam }));
  });
}

test('the yard line and the spot text name the same place on every play that has both', () => {
  // The yard line is the frame-free source the graphics read first, so it has
  // to agree with the provider's own rendering of the spot wherever both exist.
  let compared = 0;
  eachPreseasonPlay((play, { homeTeam }) => {
    const text = possessionTextToPercent(play.endPossessionText, { homeTeam });
    if (text == null) return;
    compared += 1;
    assert.equal(yardLineToPercent(play.endYardLine), text, `spot mismatch on ${play.shortText}`);
  });
  assert.ok(compared > 100, `expected a meaningful sample, compared ${compared}`);
});

test('a clock stoppage is not a play type and never draws', () => {
  // The provider reports a stoppage with start_yards_to_endzone pinned at 0.
  // Read as a snap it drew a bar from the goal line to wherever the ball
  // actually sat, and opened the drive there — which is what put -89 net yards
  // on a drive that gained 6.
  const stoppage = normalizeBdlScorePlay({
    type_slug: 'official-timeout',
    text: 'Official Timeout at 01:35.',
    team: { abbreviation: 'HOU' },
    start_yard_line: 5,
    end_yard_line: 5,
    start_yards_to_endzone: 0,
    end_yards_to_endzone: 95,
    end_possession_text: 'HOU 5',
  }, { home: { id: 'HOU' }, away: { id: 'LAC' } });

  assert.equal(isNonSnapPlay(stoppage), true);
  assert.deepEqual(classifyPlay(stoppage), { type: 'stoppage', flag: null });
  assert.equal(getPlayTrajectory(stoppage, { homeTeam: 'HOU', awayTeam: 'LAC' }).drawable, false);

  let stoppages = 0;
  eachPreseasonPlay((play, teams) => {
    if (!isNonSnapPlay(play)) return;
    stoppages += 1;
    assert.equal(getPlayTrajectory(play, teams).drawable, false, `stoppage drew: ${play.description}`);
  });
  assert.ok(stoppages > 10, `expected the capture to carry stoppages, found ${stoppages}`);
});

test('a fourth down that came up short belongs to the offense that ran it', () => {
  // Nothing in the row says the ball changed hands: the slug stays `rush` and
  // `team` quietly names the side that took over. Uncorrected, the play opened
  // the new offense's drive and drew itself mirrored down the field.
  const teams = { homeTeam: 'HOU', awayTeam: 'LAC' };
  const failed = normalizeBdlScorePlay({
    type_slug: 'rush',
    text: 'G.Mertz up the middle to LAC 15 for no gain (T.Edwards; J.Colson).',
    team: { abbreviation: 'LAC' },
    start_down: 4,
    start_distance: 1,
    end_down: 1,
    end_distance: 10,
    stat_yardage: 0,
    start_yard_line: 85,
    end_yard_line: 85,
    start_yards_to_endzone: 15,
    end_yards_to_endzone: 85,
    end_possession_text: 'LAC 15',
  }, { home: { id: 'HOU' }, away: { id: 'LAC' } });

  assert.equal(isTurnoverOnDowns(failed), true);
  assert.equal(getOffenseTeam(failed, teams), 'HOU');
  const segment = getPlaySegment(failed, teams);
  assert.equal(segment.startPct, 15, 'the snap was at LAC 15, not mirrored to HOU 15');
  assert.equal(segment.endPct, 15);
  assert.equal(segment.gained, 0);

  // A fourth down the offense converted looks identical in every other field.
  const converted = { ...failed, statYardage: 2, startDistance: 1 };
  assert.equal(isTurnoverOnDowns(converted), false);
  assert.equal(getOffenseTeam(converted, teams), 'LAC');
});

test('a kick never counts as a turnover on downs', () => {
  const punt = { typeSlug: 'punt', team: 'LAC', startDown: 4, startDistance: 13, endDown: 1, statYardage: -4 };
  assert.equal(isTurnoverOnDowns(punt), false);
  // It is still a possession change — the slug settles that on its own.
  assert.equal(getOffenseTeam(punt, { homeTeam: 'HOU', awayTeam: 'LAC' }), 'HOU');
});

test('every drive in the capture gains a believable number of yards', () => {
  // A drive is bounded by the field it is played on, and no offense in this
  // game lost ground across a whole possession. Before the fix four drives
  // came back between -52 and -89.
  let drives = 0;
  eachPreseasonDrive((drive, teams) => {
    const net = getDriveNetYards(drive.plays, teams);
    if (net == null) return;
    drives += 1;
    assert.ok(net > -30 && net <= 100, `${drive.result} drive for ${drive.team} netted ${net} yards`);
  });
  assert.ok(drives > 15, `expected a full game of drives, found ${drives}`);
});

test('a drive is measured from its first snap to its last, ignoring the kick that ended it', () => {
  const teams = { homeTeam: 'HOU', awayTeam: 'LAC' };
  const drive = [
    { typeSlug: 'official-timeout', description: 'Official Timeout at 01:35.', team: 'HOU', startYardLine: 5, endYardLine: 5, startYardsToEndzone: 0, endYardsToEndzone: 95 },
    { typeSlug: 'rush', description: 'J.Pitsenberger right guard to HST 8 for 3 yards.', team: 'HOU', startYardLine: 5, endYardLine: 8 },
    { typeSlug: 'pass-reception', description: 'G.Mertz pass short left to J.Wayne to HST 11 for 3 yards.', team: 'HOU', startYardLine: 8, endYardLine: 11 },
    { typeSlug: 'punt', description: 'K.Kroeger punts 46 yards to LAC 43, Center-A.Brinkman.', team: 'LAC', startYardLine: 11, endYardLine: 67 },
  ];
  assert.equal(getDriveNetYards(drive, teams), 6);
  // Without the punt and the stoppage there is nothing left to measure.
  assert.equal(getDriveNetYards([drive[0], drive[3]], teams), null);
});

test('the canvas mirrors end for end in the quarters the teams changed ends', () => {
  assert.equal(isFieldFlipped(1), false);
  assert.equal(isFieldFlipped(2), true);
  assert.equal(isFieldFlipped(3), false);
  assert.equal(isFieldFlipped(4), true);
  // Overtime opens with a fresh choice of ends and takes the odd orientation.
  assert.equal(isFieldFlipped(5), false);
  assert.equal(isFieldFlipped(null), false);

  // Mirroring is drawing only: the same yard line lands on the opposite side.
  assert.equal(fieldX(0, true), fieldX(100));
  assert.equal(fieldX(100, true), fieldX(0));
  assert.equal(fieldX(50, true), fieldX(50));
  assert.equal(fieldX(25, true), fieldX(75));
});

test('a lost fumble changes possession however the provider spells the slug', () => {
  const teams = { homeTeam: 'HOU', awayTeam: 'LAC' };
  // Two slugs for the same event. The compound one is why a Houston possession
  // was filed under the Chargers and the drive it ended read "Drive".
  const recovery = { typeSlug: 'fumble-recovery-opponent', team: 'LAC' };
  const sackFumble = { typeSlug: 'sack-opp-fumble-recovery', team: 'LAC' };
  assert.equal(getOffenseTeam(recovery, teams), 'HOU');
  assert.equal(getOffenseTeam(sackFumble, teams), 'HOU');
  // A fumble the offense fell on itself keeps the ball.
  assert.equal(getOffenseTeam({ typeSlug: 'rush-fumble-recovery-own', team: 'HOU' }, teams), 'HOU');
  // And the other compound forms the provider uses.
  assert.equal(getOffenseTeam({ typeSlug: 'pass-interception-return-touchdown', team: 'LAC' }, teams), 'HOU');
  assert.equal(getOffenseTeam({ typeSlug: 'field-goal-blocked', team: 'LAC' }, teams), 'HOU');
});

test('a drive is measured to the last line of scrimmage, not to the end of the return', () => {
  const teams = { homeTeam: 'HOU', awayTeam: 'LAC' };
  const drive = [
    { typeSlug: 'rush', description: 'A run to LAC 40.', team: 'LAC', startYardLine: 77, endYardLine: 60 },
    { typeSlug: 'pass-reception', description: 'A catch at the HOU 24.', team: 'LAC', startYardLine: 60, endYardLine: 24 },
    // Intercepted at the Houston 24 and returned all the way back.
    { typeSlug: 'pass-interception-return', description: 'Intercepted and returned to LAC 48.', team: 'HOU', startYardLine: 24, endYardLine: 52, endPossessionText: 'LAC 48' },
  ];
  // LAC 23 to the HOU 24 is 53 yards. Counting the return home made it 25.
  assert.equal(getDriveNetYards(drive, teams), 53);
});

test('a penalty is never a turnover on downs, whatever the down fields say', () => {
  // A flag on fourth down that awards a first down looks exactly like a stop in
  // these fields: fourth down in, first down out, fewer yards than were needed.
  // Read as a turnover it hands the offense to the other team, which reverses
  // the direction the play is drawn and — because drive grouping asks the same
  // question — breaks the drive at the flag and files everything after it under
  // the wrong side.
  const flag = {
    team: 'DAL', typeSlug: 'penalty', startDown: 4, startDistance: 10, endDown: 1,
    startYardLine: 60, endYardLine: 55, statYardage: 5,
  };
  assert.equal(isTurnoverOnDowns(flag), false);
  assert.equal(getOffenseTeam(flag, { homeTeam: 'PHI', awayTeam: 'DAL' }), 'DAL');
  assert.equal(getPlayTrajectory(flag, { homeTeam: 'PHI', awayTeam: 'DAL' }).direction, 'right');

  // The same shape without the flag is a genuine turnover on downs and must
  // still be caught.
  assert.equal(isTurnoverOnDowns({ ...flag, typeSlug: 'rush', statYardage: 3 }), true);
});

test('a play that scored did not turn the ball over on downs', () => {
  const scored = {
    team: 'DAL', typeSlug: 'rush', startDown: 4, startDistance: 10, endDown: 1,
    startYardLine: 8, endYardLine: 0, statYardage: 8, scoring: true,
  };
  assert.equal(isTurnoverOnDowns(scored), false);
  assert.equal(getOffenseTeam(scored, { homeTeam: 'PHI', awayTeam: 'DAL' }), 'DAL');
});

test('a drive is not broken in two by a fourth-down flag', () => {
  const drive = [
    { id: '1', team: { abbreviation: 'DAL' }, type_slug: 'rush', start_down: 3, start_distance: 10, end_down: 4, start_yard_line: 65, end_yard_line: 60, stat_yardage: 5, period: 1, clock_display: '5:30', text: 'J.Williams up the middle for 5 yards.' },
    { id: '2', team: { abbreviation: 'DAL' }, type_slug: 'penalty', start_down: 4, start_distance: 10, end_down: 1, start_yard_line: 60, end_yard_line: 55, stat_yardage: 5, period: 1, clock_display: '5:00', text: 'PENALTY on PHI-Q.Mitchell, Defensive Holding, 5 yards, enforced at DAL 40 - No Play.' },
    { id: '3', team: { abbreviation: 'DAL' }, type_slug: 'rush', start_down: 1, start_distance: 10, end_down: 2, start_yard_line: 55, end_yard_line: 50, stat_yardage: 5, period: 1, clock_display: '4:20', text: 'J.Williams up the middle for 5 yards.' },
  ];
  const drives = groupBdlPlaysIntoDrives(drive, { away: { id: 'DAL' }, home: { id: 'PHI' } });
  assert.equal(drives.length, 1, 'the flag must not start a new possession');
  assert.equal(drives[0].team, 'DAL');
  assert.equal(drives[0].plays.length, 3);
});
