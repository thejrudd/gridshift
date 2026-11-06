import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBdlScorePlay, groupBdlPlaysIntoDrives } from '../../src/utils/balldontlieNflScoreboard.js';
import { parsePassLaterals, parsePlayNarrative } from '../../src/utils/nflPlays/playNarrative.js';
import { getDriveNetYards, getPlayTrajectory } from '../../src/utils/nflPlays/fieldGeometry.js';
import { ballAt, getPlayTimeline, getTouchdownMoment } from '../../src/utils/nflPlays/playBeats.js';
import { getPlayTag, isPossessionChange } from '../../src/utils/nflPlays/playPresentation.js';
import { buildPartialPlayStats, getYardageProgress } from '../../src/utils/nflPlays/playRecapFraming.js';
import { resolveOffenseDefenseTeams } from '../../src/utils/playByPlay/normalizePlay.js';
import { lateralPlayText, lateralPlayRaw, lateralGame, lateralContext } from '../fixtures/nflLateralPlay.js';

const normalize = (patch = {}) => normalizeBdlScorePlay({ ...lateralPlayRaw, ...patch }, lateralGame);
const trajectory = (patch = {}) => getPlayTrajectory(normalize(patch), lateralContext);

test('the compound play preserves each reported carrier, recovery, and return', () => {
  const parsed = parsePassLaterals(lateralPlayText);
  assert.deepEqual(parsed.carriers, [
    { name: 'T.McMillan', to: 'CAR 24', yards: 8 },
    { name: 'J.Coker', to: 'CAR 26', yards: 2 },
  ]);
  assert.equal(parsed.fumble.fumbledBy, 'J.Coker');
  assert.equal(parsed.fumble.forcedBy, 'J.Bullard');
  assert.equal(parsed.fumble.at, 'CAR 25');
  assert.equal(parsed.fumble.returnTo, 'CAR 22');
  assert.deepEqual(parsed.tacklers, ['B.Young']);
  // Do not make the general narrative matcher more permissive.
  assert.equal(parsePlayNarrative(normalize()).confident, false);
});

test('original offense, net advance, and drive grouping agree despite the retained pass slug', () => {
  const play = normalize();
  const geometry = trajectory();
  assert.equal(geometry.offenseTeam, 'CAR');
  assert.equal(geometry.defendingTeam, 'GB');
  assert.equal(geometry.dir, 1);
  assert.equal(geometry.type, 'pass');
  assert.equal(geometry.flag, 'fumble');
  assert.equal(geometry.yards, 9);
  assert.equal(geometry.end, 22);
  assert.equal(geometry.turnover.at, 25);
  assert.equal(geometry.turnover.finish, 22);
  assert.equal(getDriveNetYards([play], lateralContext), 9);
  assert.equal(isPossessionChange(play, geometry), true);
  const drives = groupBdlPlaysIntoDrives([lateralPlayRaw], lateralGame);
  assert.equal(drives.length, 1);
  assert.equal(drives[0].team, 'CAR');
  for (const input of [play, { raw: lateralPlayRaw }, lateralPlayRaw]) {
    assert.deepEqual(resolveOffenseDefenseTeams(input, lateralContext), { offenseTeam: 'CAR', defenseTeam: 'GB' });
  }
});

test('playback stages the transfer, loose ball, recovery and return at their reported spots', () => {
  const line = getPlayTimeline(normalize(), lateralContext);
  assert.equal(line.bespoke, true);
  assert.deepEqual(line.beats.map((beat) => beat.kind), [
    'setup', 'snap', 'release', 'catch', 'lateral', 'turnover', 'turnover', 'stop',
  ]);
  assert.match(line.beats[1].text, /takes the snap in shotgun/);
  assert.equal(ballAt(line.segments, line.beats[2].at).yard, line.geometry.start - 5 * line.geometry.dir);
  const loose = line.beats.find((beat) => beat.alert === 'Fumble');
  const recovered = line.beats.find((beat) => beat.alert === 'Recovered');
  assert.equal(ballAt(line.segments, loose.at).yard, 26);
  assert.equal(ballAt(line.segments, recovered.at).yard, 25);
  assert.equal(ballAt(line.segments, recovered.at).tone, 'turnover');
  assert.equal(ballAt(line.segments, line.duration).yard, 22);
  assert.match(line.beats.at(-1).text, /B.Young.*CAR 22.*3 yards/);
  assert.doesNotMatch(line.beats.find((beat) => beat.kind === 'catch').text, /\d/);
  line.beats.slice(1).forEach((beat, index) => assert.ok(beat.at - line.beats[index].at >= 1000));
  assert.ok(line.segments.every((segment) => segment.from.side === undefined && segment.to.side === undefined));
});

test('multiple laterals, including a negative leg, play without inventing another reception', () => {
  const text = 'B.Young pass short middle to T.McMillan to CAR 24 for 8 yards. Lateral to J.Coker to CAR 26 for 2 yards. Lateral to C.Hubbard to CAR 23 for -3 yards (J.Bullard).';
  const play = normalize({ text, team: { abbreviation: 'CAR' }, end_possession_text: 'CAR 23', end_yard_line: 77, stat_yardage: 7 });
  const geometry = getPlayTrajectory(play, lateralContext);
  const line = getPlayTimeline(play, lateralContext);
  assert.equal(geometry.yards, 7);
  assert.equal(geometry.turnover, null);
  assert.equal(isPossessionChange(play, geometry), false);
  assert.equal(line.beats.filter((beat) => beat.kind === 'catch').length, 1);
  assert.equal(line.beats.filter((beat) => beat.kind === 'lateral').length, 2);
  assert.equal(ballAt(line.segments, line.duration).yard, 23);
});

test('an offense-retained fumble keeps its direction and includes the subsequent advance', () => {
  const text = lateralPlayText.replace('GB-B.Cox at CAR 25. B.Cox to CAR 22 for 3 yards (B.Young).', 'CAR-C.Hubbard at CAR 25. C.Hubbard to CAR 28 for 3 yards (J.Bullard).');
  const play = normalize({ text, team: { abbreviation: 'CAR' }, end_possession_text: 'CAR 28', end_yard_line: 72 });
  const geometry = getPlayTrajectory(play, lateralContext);
  const line = getPlayTimeline(play, lateralContext);
  assert.equal(geometry.offenseTeam, 'CAR');
  assert.equal(geometry.yards, 12);
  assert.equal(geometry.turnover, null);
  assert.equal(geometry.lateral.changesPossession, false);
  assert.equal(isPossessionChange(play, geometry), false);
  assert.equal(ballAt(line.segments, line.duration).yard, 28);
  assert.ok(line.segments.every((segment) => segment.tone !== 'turnover'));
});

test('the original offense can be the home team or play under a fumble-only slug', () => {
  const reversed = lateralPlayText.replaceAll('CAR ', 'GB ').replace('by GB-B.Cox', 'by CAR-B.Cox');
  const play = normalize({ text: reversed, team: { abbreviation: 'CAR' }, type_slug: 'fumble-recovery-opponent',
    start_possession_text: 'GB 16', end_possession_text: 'GB 22', start_yard_line: 16, end_yard_line: 22 });
  const geometry = getPlayTrajectory(play, lateralContext);
  assert.equal(geometry.type, 'pass');
  assert.equal(geometry.dir, -1);
  assert.equal(geometry.offenseTeam, 'GB');
  assert.equal(geometry.yards, 9);
  assert.equal(getPlayTimeline(play, lateralContext).bespoke, true);
});

test('a recovery with no return ends at recovery, and a short fourth-down lateral says downs', () => {
  const play = normalize({ text: lateralPlayText.replace(' B.Cox to CAR 22 for 3 yards (B.Young).', ''),
    end_possession_text: 'CAR 25', end_yard_line: 75 });
  const line = getPlayTimeline(play, lateralContext);
  assert.equal(ballAt(line.segments, line.duration).yard, 25);
  assert.deepEqual(line.geometry.lateral.sequence.tacklers, []);
  const fourth = normalize({ text: 'B.Young pass short middle to T.McMillan to CAR 24 for 8 yards. Lateral to J.Coker to CAR 26 for 2 yards (J.Bullard).',
    start_down: 4, stat_yardage: 10, end_possession_text: 'CAR 26', end_yard_line: 74 });
  const downs = getPlayTimeline(fourth, lateralContext);
  assert.equal(downs.geometry.offenseTeam, 'CAR');
  assert.equal(downs.beats.at(-1).alert, 'Turnover on downs');
});

test('unknown clauses, flags, incomplete chains and inconsistent geometry retain the fallback', () => {
  for (const text of [
    lateralPlayText + ' PENALTY on CAR-X.Test, Holding, 10 yards.',
    lateralPlayText.replace('CAR 26 for 2 yards', 'an unknown spot'),
    lateralPlayText.replace('RECOVERED by GB-B.Cox at CAR 25.', 'RECOVERED by GB-B.Cox.'),
    lateralPlayText + ' Lateral to another player.',
  ]) {
    assert.equal(parsePassLaterals(text), null, text);
    assert.equal(getPlayTrajectory(normalize({ text }), lateralContext).lateral, null);
    if (!/PENALTY/.test(text)) assert.equal(getPlayTimeline(normalize({ text }), lateralContext).bespoke, false);
  }
  for (const patch of [
    { start_yard_line: null, start_possession_text: null },
    { end_yard_line: 70, end_possession_text: 'CAR 30' },
    { text: lateralPlayText.replace('CAR 24 for 8 yards', 'CAR 24 for 7 yards') },
    { text: lateralPlayText.replace('CAR 26 for 2 yards', 'CAR 26 for 3 yards') },
    { text: lateralPlayText.replace('CAR 24', 'SEA 24') },
  ]) {
    const play = normalize(patch);
    assert.equal(getPlayTrajectory(play, lateralContext).lateral, null);
    assert.notEqual(getPlayTimeline(play, lateralContext)?.bespoke, true);
  }
});

test('compound yardage settles at the final beat even when the return finishes at or behind the snap', () => {
  for (const [finish, returned] of [[22, 3], [16, 9], [10, 15]]) {
    const play = normalize({ text: lateralPlayText.replace('CAR 22 for 3 yards', `CAR ${finish} for ${returned} yards`),
      end_possession_text: `CAR ${finish}`, end_yard_line: 100 - finish });
    const line = getPlayTimeline(play, lateralContext);
    const stats = { rec: 1, rec_yd: 8 };
    for (const position of [16, 22, 24, 26, 25, finish]) {
      const fired = new Set(['catch', 'lateral', 'turnover']);
      const progress = getYardageProgress(line.geometry, position, { fired });
      assert.equal(progress, 0);
      assert.deepEqual(buildPartialPlayStats(stats, { totalYards: 1, yardsSoFar: progress, fired }), { rec: 1, rec_yd: 0 });
    }
    const fired = new Set(line.beats.map((beat) => beat.kind));
    const progress = getYardageProgress(line.geometry, finish, { fired });
    assert.equal(progress, 1);
    assert.deepEqual(buildPartialPlayStats(stats, { totalYards: 1, yardsSoFar: progress, fired }), stats);
  }
});

test('lateral touchdowns finish beyond the correct plane and keep the scoring tag', () => {
  for (const patch of [
    { text: 'B.Young pass short middle to T.McMillan to CAR 24 for 8 yards. Lateral to J.Coker to GB 0 for 76 yards, TOUCHDOWN.', end_possession_text: 'GB 0', end_yard_line: 0 },
    { text: lateralPlayText.replace('CAR 22 for 3 yards (B.Young)', 'CAR 0 for 25 yards, TOUCHDOWN'), end_possession_text: 'CAR 0', end_yard_line: 100 },
    { text: lateralPlayText.replace('GB-B.Cox at CAR 25. B.Cox to CAR 22 for 3 yards (B.Young)', 'CAR-C.Hubbard at CAR 25. C.Hubbard to GB 0 for 75 yards, TOUCHDOWN'), team: { abbreviation: 'CAR' }, end_possession_text: 'GB 0', end_yard_line: 0 },
  ]) {
    const play = normalize({ ...patch, scoring_play: true });
    const line = getPlayTimeline(play, lateralContext);
    assert.equal(line.bespoke, true);
    assert.deepEqual(getPlayTag(play, line.geometry), ['td', 'Touchdown']);
    assert.ok(getTouchdownMoment(line) < line.duration);
    const expected = patch.end_possession_text === 'CAR 0' ? -5 : 105;
    assert.equal(ballAt(line.segments, line.duration).yard, expected);
  }
});
