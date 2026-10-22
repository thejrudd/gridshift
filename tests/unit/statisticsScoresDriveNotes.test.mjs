import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { groupBdlPlaysIntoDrives } from '../../src/utils/balldontlieNflScoreboard.js';
import { getPlayTrajectory } from '../../src/utils/nflPlays/fieldGeometry.js';
import { drivePlayNote, nextSnapFor } from '../../src/components/statistics/scores/scoresDetailFormat.js';

// Captured BALLDONTLIE plays: DAL at PHI, 2025 Week 1.
const FIXTURE = JSON.parse(fs.readFileSync(new URL('../fixtures/bdlNflPlays.json', import.meta.url), 'utf8'));
const GAME = FIXTURE.games.find((entry) => entry.id === 423945);
const CONTEXT = { id: GAME.id, away: { id: 'DAL' }, home: { id: 'PHI' } };
const DRIVES = groupBdlPlaysIntoDrives(GAME.plays, CONTEXT);
const plays = DRIVES.flatMap((drive) => drive.plays);

test('a lane note gives the down and who did what', () => {
  const pass = plays.find((play) => play.typeSlug === 'pass-reception' && play.startDown === 3 && play.startDistance === 1);
  assert.deepEqual(drivePlayNote(pass), { down: '3&1', text: 'Prescott to Lamb' });
  const rush = plays.find((play) => play.typeSlug === 'rush');
  assert.match(drivePlayNote(rush).text, /^\S.* rush$/);
  assert.equal(drivePlayNote(plays.find((play) => play.typeSlug === 'punt')).text, 'Punt');
  assert.match(drivePlayNote(plays.find((play) => play.typeSlug === 'sack')).text, /sacked$/);
});

test('a goal-to-go snap reads as G and a suffix never stands in for a surname', () => {
  const goal = plays.find((play) => play.startDown && play.startYardsToEndzone > 0 && play.startDistance >= play.startYardsToEndzone);
  assert.match(drivePlayNote(goal).down, /&G$/);
  const strong = { typeSlug: 'rush', shortText: 'Pierre Strong Jr. 10 Yd Rush', rawText: 'P.Strong Jr. left end for 10 yards.', startDown: 1, startDistance: 10 };
  assert.equal(drivePlayNote(strong).text, 'Strong rush');
});

test('the next snap sits where the last play left the ball, with the line to gain', () => {
  const drive = DRIVES.find((entry) => entry.plays.some((play) => play.endDownDistanceText && play.endDistance > 0 && !/goal/i.test(play.endDownDistanceText)));
  const geometryOf = (play) => getPlayTrajectory(play, { homeTeam: 'PHI', awayTeam: 'DAL' });
  const snap = nextSnapFor(drive, geometryOf);
  const last = [...drive.plays].reverse().find((play) => play.endDownDistanceText && play.endYardsToEndzone != null);
  const geometry = geometryOf(last);
  assert.equal(snap.at, geometry.end);
  assert.equal(snap.text, last.endDownDistanceText.replace(/\s+/g, ' ').trim());
  assert.equal(snap.label, snap.text.split(/ at /i)[0]);
  if (snap.firstDown != null) assert.equal(snap.firstDown, Math.max(0, Math.min(100, geometry.end + last.endDistance * geometry.dir)));
  assert.equal(nextSnapFor({ plays: [] }, geometryOf), null);
});
