import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { groupBdlPlaysIntoDrives } from '../../src/utils/balldontlieNflScoreboard.js';
import { buildPlayStatGroups, mergeStatGroups, tallyPlayStats } from '../../src/utils/statisticsScoresPlayStats.js';
import { buildTeamStatBreakdown } from '../../src/utils/statisticsTeamStatBreakdown.js';

// Captured BALLDONTLIE plays: DAL at PHI (20-24) and CIN at CLE (17-16), 2025 Week 1.
const FIXTURE = JSON.parse(fs.readFileSync(new URL('../fixtures/bdlNflPlays.json', import.meta.url), 'utf8'));
const drivesFor = (id) => {
  const game = FIXTURE.games.find((entry) => entry.id === id);
  const context = { id, away: { id: game.visitor_team.abbreviation }, home: { id: game.home_team.abbreviation } };
  return { drives: groupBdlPlaysIntoDrives(game.plays, context), awayTeam: context.away.id, homeTeam: context.home.id };
};
const DAL_PHI = drivesFor(423945);
const stat = (groups, label) => groups.flatMap((group) => group.stats).find((entry) => entry.label === label);

test('drive points add up to each final score', () => {
  const tallies = tallyPlayStats(DAL_PHI);
  assert.equal(tallies.DAL.drivePoints, 20);
  assert.equal(tallies.PHI.drivePoints, 24);
});

test('special teams rows read the kicks in the official text', () => {
  const groups = buildPlayStatGroups(DAL_PHI);
  // Dallas returned five kickoffs: Turpin's 27, 22, 23, and 9, and Tolbert's 20.
  assert.equal(stat(groups, 'Kick return average').away, '20.2');
  // Every punt in this game was a fair catch or went out of bounds, so the
  // return row is absent rather than a run of zero-yard returns.
  assert.equal(stat(groups, 'Punt return average'), undefined);
  // PHI's punts: 51, 44, and 51 yards with no returns.
  assert.equal(stat(groups, 'Net punting').home, '48.7');
  assert.equal(stat(groups, 'Field goals').away, '2–2');
});

test('a punt the shared grammar reads as zero yards keeps its gross distance', () => {
  const tallies = tallyPlayStats(drivesFor(423948));
  // "R.Rehkow punts 49 yards to CLV 1, ... downed by" — counted at 49, not 0.
  assert.ok(tallies.CIN.netPuntYards / tallies.CIN.punts > 30);
});

test('success rate and explosive plays count snaps, not kicks', () => {
  const tallies = tallyPlayStats(DAL_PHI);
  for (const team of ['DAL', 'PHI']) {
    assert.ok(tallies[team].snaps > 40, `${team} should have a full game of snaps`);
    assert.ok(tallies[team].successes <= tallies[team].snaps);
  }
  assert.equal(stat(buildPlayStatGroups(DAL_PHI), 'Passes of 20+ yards').away, 3);
});

test('play rows join the matching provider group and new groups follow the order', () => {
  const provider = [
    { id: 'offense', label: 'Offense', stats: [{ label: 'Total yards', away: 1, home: 2 }] },
    { id: 'possession', label: 'Possession', stats: [{ label: 'Time of possession', away: '30:00', home: '30:00' }] },
  ];
  const merged = mergeStatGroups(provider, buildPlayStatGroups(DAL_PHI));
  assert.deepEqual(merged.map((group) => group.id), ['offense', 'situational', 'drives', 'possession', 'special']);
  assert.equal(merged[0].stats[0].label, 'Total yards');
  assert.ok(merged[0].stats.some((entry) => entry.label === 'Success rate'));
});

test('kicking breakdowns credit the kicker, returner, and punter', () => {
  const plays = DAL_PHI.drives.flatMap((drive) => drive.plays.map((play) => ({ ...play, driveId: drive.id })));
  const roster = [
    ['DAL', 'Brandon Aubrey', 'K'], ['DAL', 'KaVontae Turpin', 'WR'], ['PHI', 'Braden Mann', 'P'],
  ].map(([team, name, position]) => ({ key: `${team}:${name.toLowerCase().replace(/[^a-z]/g, '')}`, name, team, position }));
  const breakdown = buildTeamStatBreakdown({ plays, roster, homeTeam: 'PHI', awayTeam: 'DAL' });
  assert.equal(breakdown.fieldGoals.DAL[0].key, 'DAL:brandonaubrey');
  assert.equal(breakdown.fieldGoals.DAL[0].value, '2–2');
  const turpin = breakdown.kickReturns.DAL.find((row) => row.key === 'DAL:kavontaeturpin');
  assert.equal(turpin.detail, '4 returns · 81 yds');
  assert.equal(breakdown.netPunting.PHI[0].value, '48.7');
});
