import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { normalizeBdlScorePlay } from '../../src/utils/balldontlieNflScoreboard.js';
import { classifyPlay, getPlayTrajectory, isNonSnapPlay, isTurnoverOnDowns } from '../../src/utils/nflPlays/fieldGeometry.js';
import {
  ballAt,
  beatsThrough,
  estimateAirYards,
  getDriveTimelines,
  getPlayTimeline,
  TONE,
} from '../../src/utils/nflPlays/playBeats.js';

const FIXTURE = JSON.parse(fs.readFileSync(new URL('../fixtures/bdlNflPlays.json', import.meta.url), 'utf8'));

function eachPlay(callback) {
  FIXTURE.games.forEach((game) => {
    const homeTeam = game.home_team.abbreviation;
    const awayTeam = game.visitor_team.abbreviation;
    const context = { away: { id: awayTeam }, home: { id: homeTeam } };
    game.plays.forEach((raw) => callback(normalizeBdlScorePlay(raw, context), { homeTeam, awayTeam }));
  });
}

function findPlay(predicate) {
  let found = null;
  eachPlay((play, context) => {
    if (found || !predicate(play, context)) return;
    found = { play, context };
  });
  return found;
}

test('every beat fires within the timeline it belongs to, in order', () => {
  let checked = 0;
  eachPlay((play, context) => {
    const line = getPlayTimeline(play, context);
    if (!line) return;
    checked += 1;
    assert.ok(line.duration > 0, `zero-length timeline on ${play.shortText}`);
    let previous = -1;
    line.beats.forEach((beat) => {
      assert.ok(beat.at >= previous, `beats out of order on ${play.shortText}`);
      assert.ok(beat.at <= line.duration, `beat past the end on ${play.shortText}`);
      assert.ok(beat.text, `empty beat on ${play.shortText}`);
      previous = beat.at;
    });
  });
  assert.ok(checked > 100, `expected a meaningful sample, checked ${checked}`);
});

test('the ball starts at the snap spot and ends where the play ended', () => {
  eachPlay((play, context) => {
    const line = getPlayTimeline(play, context);
    if (!line || !line.bespoke) return;
    const geometry = getPlayTrajectory(play, context);
    const { flag } = classifyPlay(play);
    assert.equal(Math.round(ballAt(line.segments, 0).yard), Math.round(geometry.start), `wrong start on ${play.shortText}`);
    // An incompletion has no end spot — the ball travelled to a target and the
    // offense re-snapped from the same line — so only plays that finished
    // somewhere are held to the end spot.
    if (flag === 'incomplete' || flag === 'fg') return;
    const finish = ballAt(line.segments, line.duration).yard;
    // A score is carried past the goal line rather than stopped on it, so it is
    // held to the end zone instead of to the end spot the geometry reports.
    if (geometry.scoring) {
      const beyond = geometry.dir > 0 ? finish - geometry.end : geometry.end - finish;
      assert.ok(beyond > 0, `a score stopped on the line on ${play.shortText}`);
      return;
    }
    const expected = geometry.kick ? geometry.kick.finish : geometry.end;
    assert.ok(Math.abs(finish - expected) < 0.5, `wrong end on ${play.shortText}: ${finish} vs ${expected}`);
  });
});

test('the segments cover the timeline with no gaps', () => {
  eachPlay((play, context) => {
    const line = getPlayTimeline(play, context);
    if (!line) return;
    let cursor = 0;
    line.segments.forEach((segment) => {
      assert.equal(segment.start, cursor, `segment gap on ${play.shortText}`);
      cursor += segment.ms;
    });
    assert.equal(cursor, line.duration, `duration mismatch on ${play.shortText}`);
  });
});

test('beatsThrough reveals the play one beat at a time', () => {
  const found = findPlay((play) => play.typeSlug === 'pass-reception');
  const line = getPlayTimeline(found.play, found.context);
  assert.ok(line.beats.length >= 4, 'a completed pass should break into at least four beats');
  assert.equal(beatsThrough(line.beats, -1).length, 0);
  assert.equal(beatsThrough(line.beats, line.duration).length, line.beats.length);
  line.beats.forEach((beat, index) => {
    assert.equal(beatsThrough(line.beats, beat.at).length, index + 1, 'a beat must be visible the instant it fires');
  });
});

test('a completed pass releases, arrives, and is brought down in that order', () => {
  const found = findPlay((play) => play.typeSlug === 'pass-reception' && /short|deep/.test(play.rawText ?? ''));
  const line = getPlayTimeline(found.play, found.context);
  const kinds = line.beats.map((beat) => beat.kind);
  assert.ok(kinds.indexOf('release') < kinds.indexOf('catch'), 'the ball must be thrown before it is caught');
  assert.ok(kinds.indexOf('catch') < kinds.length - 1, 'the catch must not be the last beat of a completed pass');
  // The ball leaves the ground between the release and the catch — that lift is
  // the whole difference between a pass and a run.
  const release = line.beats.find((beat) => beat.kind === 'release');
  const caught = line.beats.find((beat) => beat.kind === 'catch');
  const apex = ballAt(line.segments, (release.at + caught.at) / 2);
  assert.ok(apex.lift > 0.3, `the pass never left the ground: lift ${apex.lift}`);
});

test('the catch beat never states a yard line or a yards-after-catch figure', () => {
  // The feed reports no air yards and no catch spot, so the catch point is an
  // estimate. It may position the ball; it may not put a number in the text.
  let checked = 0;
  eachPlay((play, context) => {
    const line = getPlayTimeline(play, context);
    if (!line) return;
    line.beats.filter((beat) => beat.kind === 'catch').forEach((beat) => {
      checked += 1;
      assert.ok(!/\d/.test(beat.text), `the catch beat quoted a number: "${beat.text}"`);
    });
  });
  assert.ok(checked > 10, `expected completed passes in the fixture, found ${checked}`);
});

test('air yards are estimated only when the description states the depth', () => {
  assert.equal(estimateAirYards('short left', 20), 7);
  assert.equal(estimateAirYards('short right', 4), 4, 'the catch can never be beyond where the play ended');
  assert.equal(estimateAirYards('deep middle', 40), 28);
  assert.equal(estimateAirYards('deep left', 18), 15, 'a deep ball is at least fifteen yards in the air');
  assert.equal(estimateAirYards(null, 20), null, 'no stated depth means no invented catch point');
  assert.equal(estimateAirYards('short left', -3), null, 'a catch behind the line has no separate air phase');
});

test('a pass with no stated depth arcs straight to the real end spot', () => {
  const play = {
    id: '1', team: 'DAL', typeSlug: 'pass-reception', down: '1st & 10',
    shortText: 'Dak Prescott Pass Complete for 12 Yds to CeeDee Lamb',
    rawText: 'D.Prescott pass to C.Lamb to PHI 40 for 12 yards.',
    description: 'D.Prescott pass to C.Lamb to PHI 40 for 12 yards.',
    startDown: 1, startDistance: 10, endDown: 1, startYardLine: 48, endYardLine: 60, statYardage: 12,
  };
  const line = getPlayTimeline(play, { homeTeam: 'PHI', awayTeam: 'DAL' });
  assert.ok(line.bespoke);
  assert.equal(line.beats.filter((beat) => beat.kind === 'catch').length, 1);
  // With no depth to work from there is no separate run-after-catch phase: the
  // ball arcs once, onto the spot the feed actually reported.
  const geometry = getPlayTrajectory(play, { homeTeam: 'PHI', awayTeam: 'DAL' });
  const caught = line.beats.find((beat) => beat.kind === 'catch');
  assert.ok(Math.abs(ballAt(line.segments, caught.at).yard - geometry.end) < 0.5);
});

test('a field goal that is good keeps climbing and a miss comes down', () => {
  const good = findPlay((play) => play.typeSlug === 'field-goal-good');
  const goodLine = getPlayTimeline(good.play, good.context);
  assert.ok(ballAt(goodLine.segments, goodLine.duration).lift > 1, 'a made kick must clear the uprights');

  const missed = findPlay((play) => /field-goal-(missed|blocked)/.test(play.typeSlug ?? ''));
  if (!missed) return;
  const missLine = getPlayTimeline(missed.play, missed.context);
  assert.ok(ballAt(missLine.segments, missLine.duration).lift < 1, 'a miss must not read as a make');
});

test('a punt with a return fields the ball before the return begins', () => {
  const found = findPlay((play) => play.typeSlug === 'punt' && /Punt Return/i.test(play.shortText ?? ''));
  if (!found) return;
  const line = getPlayTimeline(found.play, found.context);
  const kinds = line.beats.map((beat) => beat.kind);
  assert.ok(kinds.includes('catch'), 'a returned punt must be fielded');
  const geometry = getPlayTrajectory(found.play, found.context);
  const fielded = line.beats.find((beat) => beat.kind === 'catch');
  assert.ok(Math.abs(ballAt(line.segments, fielded.at).yard - geometry.kick.land) < 0.5, 'the ball is fielded where it landed');
});

test('an interception turns around at the spot it was picked off', () => {
  const found = findPlay((play) => /interception/.test(play.typeSlug ?? ''));
  const line = getPlayTimeline(found.play, found.context);
  assert.equal(line.bespoke, true, 'an interception is choreographed, not a long gain in another colour');

  const kinds = line.beats.map((beat) => beat.kind);
  assert.ok(kinds.indexOf('release') < kinds.indexOf('turnover'), 'the ball is thrown before it is picked off');

  const pick = line.beats.find((beat) => beat.kind === 'turnover');
  const at = ballAt(line.segments, pick.at).yard;
  const before = ballAt(line.segments, pick.at - 200).yard;
  const after = ballAt(line.segments, line.duration).yard;
  // The throw and the return travel in opposite directions, which is the whole
  // shape of the play and the thing a single straight line cannot show.
  assert.ok(Math.sign(at - before) !== 0, 'the throw has to be moving when it is picked off');
  if (Math.abs(after - at) > 0.5) {
    assert.notEqual(Math.sign(after - at), Math.sign(at - before), 'the return must come back the other way');
  }
});

test('a fumble comes loose where the carrier was hit and changes hands there', () => {
  const found = findPlay((play) => /fumble/.test(play.typeSlug ?? ''));
  const line = getPlayTimeline(found.play, found.context);
  assert.equal(line.bespoke, true);
  const turnovers = line.beats.filter((beat) => beat.kind === 'turnover');
  assert.equal(turnovers.length, 2, 'the ball coming loose and being recovered are two moments');
  const looseAt = ballAt(line.segments, turnovers[0].at).yard;
  const recoveredAt = ballAt(line.segments, turnovers[1].at).yard;
  assert.ok(Math.abs(looseAt - recoveredAt) < 0.5, 'the recovery happens where the ball came loose');
  // The ball leaves the ground between the two: it is the only time in playback
  // that happens without anyone throwing or kicking it.
  const mid = ballAt(line.segments, (turnovers[0].at + turnovers[1].at) / 2);
  assert.ok(mid.lift > 0.1, 'the loose ball should bounce');
});

test('a penalty marches the ball off rather than running a play that did not count', () => {
  const found = findPlay((play) => play.typeSlug === 'penalty' && /No Play/i.test(play.rawText ?? ''));
  const line = getPlayTimeline(found.play, found.context);
  assert.equal(line.bespoke, true);
  assert.ok(line.beats.some((beat) => beat.kind === 'flag'), 'a penalty has to show the flag');
  assert.ok(
    line.beats.some((beat) => /no play/i.test(beat.text)),
    'a wiped-out down must say so rather than implying the yardage counted',
  );
});

test('a clock stoppage is never playable', () => {
  eachPlay((play, context) => {
    if (!isNonSnapPlay(play)) return;
    assert.equal(getPlayTimeline(play, context), null, `a stoppage became a play: ${play.description}`);
  });
});

test('a drive reduces to only the plays that can be trusted to draw', () => {
  const game = FIXTURE.games[0];
  const homeTeam = game.home_team.abbreviation;
  const awayTeam = game.visitor_team.abbreviation;
  const context = { away: { id: awayTeam }, home: { id: homeTeam } };
  const plays = game.plays.map((raw) => normalizeBdlScorePlay(raw, context));
  const timelines = getDriveTimelines(plays, { homeTeam, awayTeam });
  assert.ok(timelines.length > 0);
  assert.ok(timelines.length < plays.length, 'stoppages and undrawable plays must be dropped');
  timelines.forEach(({ play, timeline }) => {
    assert.ok(!isNonSnapPlay(play));
    assert.ok(timeline.duration > 0);
  });
});

test('names are expanded through the caller-supplied resolver', () => {
  const found = findPlay((play) => /\(\w\.\w+\)\.?$/.test(play.rawText ?? '') && play.typeSlug === 'rush');
  const line = getPlayTimeline(found.play, {
    ...found.context,
    resolveName: (name) => (/^[A-Z]\.[A-Za-z]/.test(name) ? `EXPANDED ${name}` : name),
  });
  assert.ok(line.beats.some((beat) => beat.text.includes('EXPANDED')), 'abbreviated tacklers must go through the resolver');
});

test('a rushing touchdown is choreographed as a rush, not dropped to the generic path', () => {
  const found = findPlay((play) => /rushing-touchdown|rush.*touchdown/.test(play.typeSlug ?? '')
    || (classifyPlay(play).type === 'rush' && classifyPlay(play).flag === 'td'));
  if (!found) return;
  const line = getPlayTimeline(found.play, found.context);
  assert.equal(line.bespoke, true, 'a run into the end zone is still a run');
  const score = line.beats.find((beat) => beat.kind === 'score');
  assert.ok(score, 'a touchdown must fire a score beat');
  assert.ok(score.text.length > 'Touchdown.'.length, 'the score beat should say how it happened');
});

test('only the down-and-distance line is a setup beat', () => {
  // `setup` is styled as an overline. Anything else marked with it gets shouted
  // in capitals in the log.
  eachPlay((play, context) => {
    const line = getPlayTimeline(play, context);
    if (!line) return;
    const setups = line.beats.filter((beat) => beat.kind === 'setup');
    assert.ok(setups.length <= 1, `more than one overline on ${play.shortText}`);
    setups.forEach((beat) => {
      assert.ok(/ at the /.test(beat.text), `a non-positional beat was marked setup: "${beat.text}"`);
    });
  });
});

test('consecutive beats are spaced far enough apart to be read', () => {
  // The pacing regression this guards against is beats landing on top of each
  // other: two lines arriving in the log at once means neither gets read. It is
  // the reason `PACE` exists, so it is worth asserting rather than eyeballing.
  let checked = 0;
  eachPlay((play, context) => {
    const line = getPlayTimeline(play, context);
    if (!line || line.beats.length < 2) return;
    checked += 1;
    line.beats.slice(1).forEach((beat, index) => {
      const gap = beat.at - line.beats[index].at;
      assert.ok(gap >= 1000, `beats ${gap}ms apart on ${play.shortText}`);
    });
  });
  assert.ok(checked > 100, `expected a meaningful sample, checked ${checked}`);
});

test('a drive plays back slowly enough to follow', () => {
  const found = findPlay((play) => play.typeSlug === 'pass-reception');
  const line = getPlayTimeline(found.play, found.context);
  // A completed pass is the densest common play — drop back, throw, catch, run,
  // tackle. If it fits in a couple of seconds the log is unreadable.
  assert.ok(line.duration > 6000, `a completed pass ran in ${line.duration}ms`);
  assert.ok(line.duration < 30000, `a completed pass took ${line.duration}ms`);
});

test('a scoring play finishes inside the end zone, never on the goal line', () => {
  // The goal line is where the geometry stops because it is where the field of
  // play stops. Leaving the ball there announces the score in text while the
  // picture shows it halted at the boundary.
  let checked = 0;
  eachPlay((play, context) => {
    const line = getPlayTimeline(play, context);
    if (!line || !line.geometry.scoring || line.geometry.type === 'kick') return;
    checked += 1;
    const { dir, end } = line.geometry;
    const finish = ballAt(line.segments, line.duration).yard;
    const beyond = dir > 0 ? finish - end : end - finish;
    assert.ok(beyond > 0, `stopped on the goal line: ${play.shortText}`);
    // Inside the end zone, not through the back of it.
    assert.ok(finish >= -10 && finish <= 110, `left the canvas on ${play.shortText}: ${finish}`);
  });
  assert.ok(checked > 2, `expected scoring plays in the fixtures, found ${checked}`);
});

test('a touchdown pass is caught in the end zone when it was thrown there', () => {
  // Caught short and run in, the catch belongs at the catch point. Thrown into
  // the end zone, it belongs in the end zone — the air-yards estimate measures
  // from the snap and knows nothing about the goal line, so left alone it draws
  // the catch on the boundary.
  const found = findPlay((play) => /passing-touchdown|pass.*touchdown/.test(play.typeSlug ?? ''));
  if (!found) return;
  const line = getPlayTimeline(found.play, found.context);
  const caught = line.beats.find((beat) => beat.kind === 'catch');
  assert.ok(caught, 'a touchdown pass must still show the completion');
  const { dir, end } = line.geometry;
  const catchYard = ballAt(line.segments, caught.at).yard;
  // The catch is at or past the spot the throw reached, never short of the
  // snap, and the ball ends up in the end zone either way.
  const finish = ballAt(line.segments, line.duration).yard;
  assert.ok(dir > 0 ? finish > end : finish < end, 'the score must finish in the end zone');
  assert.ok(dir > 0 ? catchYard <= finish : catchYard >= finish, 'the catch cannot be past where the play ended');
});

test('every play advances along the middle of the field', () => {
  // Which third of the field a play went to is reported, and the beat text says
  // it. Drawing it was tried and reverted: the vertical axis is height, and the
  // hash a play started from is never reported, so a lateral position would have
  // to be invented from the middle of the field on every snap. Nothing in a
  // timeline carries a lateral component.
  eachPlay((play, context) => {
    const line = getPlayTimeline(play, context);
    if (!line) return;
    line.segments.forEach((segment) => {
      assert.equal(segment.from.side, undefined, `a lateral crept back in on ${play.shortText}`);
      assert.equal(segment.to.side, undefined, `a lateral crept back in on ${play.shortText}`);
    });
    assert.equal(ballAt(line.segments, line.duration).side, undefined);
  });
});

test('a fourth down that came up short says the ball changed hands', () => {
  // The provider has no slug for a turnover on downs — the play stays a rush or
  // an incompletion — so the drive's last snap would otherwise animate as an
  // ordinary tackle with nothing said about losing the ball.
  let checked = 0;
  eachPlay((play, context) => {
    const line = getPlayTimeline(play, context);
    if (!line || !isTurnoverOnDowns(play)) return;
    checked += 1;
    assert.ok(
      line.beats.some((beat) => /turned over on downs/i.test(beat.text)),
      `no turnover beat on ${play.shortText}`,
    );
  });
  assert.ok(checked > 0, 'expected a turnover on downs in the fixtures');
});

test('possession changing hands changes what the trail is drawn in', () => {
  // The drive field above already draws possession by colour. Playback drew the
  // whole play in the offense's colour, so an interception read as that same
  // offense running backwards.
  const int = findPlay((play) => /interception/.test(play.typeSlug ?? ''));
  const intLine = getPlayTimeline(int.play, int.context);
  const intTones = intLine.segments.map((segment) => segment.tone);
  assert.ok(intTones.includes(TONE.turnover), 'the return must be drawn as the other team');
  // And only after the pick, never before it.
  const pick = intLine.beats.find((beat) => beat.kind === 'turnover');
  assert.equal(ballAt(intLine.segments, pick.at - 400).tone, null, 'the throw is still the offense');

  const fumble = findPlay((play) => /fumble/.test(play.typeSlug ?? ''));
  assert.ok(
    getPlayTimeline(fumble.play, fumble.context).segments.some((segment) => segment.tone === TONE.turnover),
    'a recovered fumble must change hands on screen',
  );
});

test('ground lost is drawn as ground lost', () => {
  const sack = findPlay((play) => /sack/.test(play.typeSlug ?? ''));
  const line = getPlayTimeline(sack.play, sack.context);
  assert.ok(line.segments.some((segment) => segment.tone === TONE.loss), 'a sack travels backwards in the loss tone');
});

test('a kick is toned as a kick and flies higher than a throw', () => {
  const kick = findPlay((play) => /punt|kickoff/.test(play.typeSlug ?? ''));
  const kickLine = getPlayTimeline(kick.play, kick.context);
  assert.ok(kickLine.segments.some((segment) => segment.tone === TONE.kick), 'the flight must be marked as a kick');

  const peak = (line) => Math.max(...line.segments.map((segment) => segment.apex ?? 0));
  const pass = findPlay((play) => play.typeSlug === 'pass-reception');
  // At a pass's apex a punt came out looking like a deep throw, which is the one
  // shape it must not share.
  assert.ok(peak(kickLine) > peak(getPlayTimeline(pass.play, pass.context)) * 1.5, 'a kick has to hang');
});

test('an alert is raised only when the offense lost something', () => {
  // The alert is the loudest thing on the field, so the set of moments that get
  // one is pinned: a change of possession, ground lost, a flag, and a kick that
  // missed. One on an ordinary completion would spend the whole device.
  const alerts = new Set();
  eachPlay((play, context) => {
    const line = getPlayTimeline(play, context);
    if (!line) return;
    line.beats.filter((beat) => beat.alert).forEach((beat) => {
      alerts.add(beat.alert);
      assert.ok(
        ['turnover', 'stop', 'flag', 'miss'].includes(beat.kind),
        `an alert on a beat that cost the offense nothing: ${beat.text}`,
      );
    });
  });
  assert.deepEqual(
    [...alerts].sort(),
    ['Fumble', 'Intercepted', 'No good', 'Penalty', 'Recovered', 'Sack', 'Turnover on downs'],
  );
});

test('a made and a missed field goal do not look alike', () => {
  // They used to differ only in how high the ball was at the very end of the
  // flight, which is the last thing anyone looks at.
  const good = findPlay((play) => play.typeSlug === 'field-goal-good');
  const goodLine = getPlayTimeline(good.play, good.context);
  assert.ok(goodLine.segments.some((segment) => segment.tone === TONE.score), 'a make climbs away in the scoring tone');
  assert.ok(!goodLine.beats.some((beat) => beat.alert), 'a make is not an alert');

  const missed = findPlay((play) => /field-goal-(missed|blocked)/.test(play.typeSlug ?? ''));
  if (!missed) return;
  const missLine = getPlayTimeline(missed.play, missed.context);
  assert.ok(missLine.segments.some((segment) => segment.tone === TONE.loss), 'a miss falls in the loss tone');
  const alert = missLine.beats.find((beat) => beat.alert);
  assert.equal(alert.alert, 'No good');
  assert.equal(alert.kind, 'miss', 'the miss beat is what the cross on the field keys off');
});

test('a forward pass is always thrown forward, even when the pick is reported behind the line', () => {
  // The feed sometimes credits an interception at a spot behind the line of
  // scrimmage. Drawing the throw to it sends the ball the way the offense came
  // from, which reads as the whole play running backwards. Only the return may
  // reverse direction.
  const context = { homeTeam: 'BUF', awayTeam: 'CAR' };
  // An interception is filed under the team that ends up with the ball.
  const play = {
    id: 'x', team: 'BUF', typeSlug: 'pass-interception-return', down: '2nd & 20',
    startDown: 2, startDistance: 20, endDown: 1, period: 4,
    startYardLine: 67, endYardLine: 74, statYardage: 0,
    startPossessionText: 'CAR 33', endPossessionText: 'CAR 26',
    shortText: 'Kani Walker 0 Yd Interception Return',
    rawText: 'K.Trask pass short right intended for M.Davis INTERCEPTED by K.Walker at CAR 26. K.Walker to CAR 26 for no gain.',
    description: 'interception',
  };

  const line = getPlayTimeline(play, context);
  const { dir } = line.geometry;
  const at = (ms) => ballAt(line.segments, ms).yard;
  const throwBeat = line.beats.find((beat) => beat.kind === 'release');
  const pickBeat = line.beats.find((beat) => beat.kind === 'turnover');

  const thrown = (at(pickBeat.at) - at(throwBeat.at)) * dir;
  assert.ok(thrown > 0, `the throw travelled backwards by ${-thrown}`);

  // The return still finishes where the feed says it did, so field position
  // stays true even though the catch point was estimated.
  const finish = at(line.duration);
  assert.ok((finish - at(pickBeat.at)) * dir < 0, 'the return must come back the other way');
  assert.ok(Math.abs(finish - 26) < 0.5, `the play must end at the reported spot, not ${finish}`);

  // An estimated catch point is never spoken, the same rule the catch beat on a
  // completion follows.
  assert.ok(!/\d/.test(pickBeat.text), `the pick beat quoted a spot it guessed: "${pickBeat.text}"`);

  // A pick genuinely downfield keeps its reported spot and still says it.
  const downfield = getPlayTimeline({
    ...play,
    rawText: 'K.Trask pass short right intended for M.Davis INTERCEPTED by K.Walker at CAR 45. K.Walker to CAR 38 for 7 yards.',
  }, context);
  const named = downfield.beats.find((beat) => beat.kind === 'turnover');
  assert.match(named.text, /CAR 45/);
});
