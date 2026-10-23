import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { normalizeBdlScorePlay } from '../../src/utils/balldontlieNflScoreboard.js';
import { buildTeamStatBreakdown } from '../../src/utils/statisticsTeamStatBreakdown.js';

// Captured BALLDONTLIE plays: DAL at PHI, 2025 Week 1.
const FIXTURE = JSON.parse(fs.readFileSync(new URL('../fixtures/bdlNflPlays.json', import.meta.url), 'utf8'));
const GAME = FIXTURE.games.find((entry) => entry.id === 423945);
const CONTEXT = { away: { id: 'DAL' }, home: { id: 'PHI' } };
const PLAYS = GAME.plays.map((play) => normalizeBdlScorePlay(play, CONTEXT));

// A slice of the box score, keyed the way normalized player rows are.
const ROSTER = [
  ['DAL', 'Dak Prescott', 'QB'],
  ['DAL', 'George Pickens', 'WR'],
  ['DAL', 'KaVontae Turpin', 'WR'],
  ['PHI', 'Jalen Hurts', 'QB'],
  ['PHI', 'Saquon Barkley', 'RB'],
  ['PHI', 'Jalen Carter', 'DT'],
  ['PHI', 'Jake Elliott', 'K'],
].map(([team, name, position]) => ({ key: `${team}:${name.toLowerCase().replace(/[^a-z]/g, '')}`, name, team, position }));
const keyOf = (name) => ROSTER.find((row) => row.name === name).key;

const sumShortText = (pattern) => GAME.plays.reduce((total, play) => {
  const match = pattern.exec(play.short_text ?? '');
  return total + (match ? Number(match[1]) : 0);
}, 0);

const breakdown = buildTeamStatBreakdown({ plays: PLAYS, roster: ROSTER, homeTeam: 'PHI', awayTeam: 'DAL' });
const row = (id, team, name) => breakdown[id][team].find((entry) => entry.key === keyOf(name));

test('receiving and rushing yards are credited to the player who gained them', () => {
  assert.equal(row('passingYards', 'DAL', 'George Pickens').sort, sumShortText(/Pass Complete for (-?\d+) Yds to George Pickens/));
  // Barkley's official line in this game: 18 carries, 60 yards (losses included).
  assert.equal(row('rushingYards', 'PHI', 'Saquon Barkley').sort, 60);
  assert.equal(row('rushingYards', 'PHI', 'Saquon Barkley').detail, '18 carries');
  // A player never appears under the other team.
  assert.equal(breakdown.passingYards.PHI.some((entry) => entry.key === keyOf('George Pickens')), false);
});

test('a flag is credited to the flagged player with its call and yards', () => {
  const carter = row('penalties', 'PHI', 'Jalen Carter');
  assert.ok(carter, 'Jalen Carter should carry the disqualification');
  assert.match(carter.detail, /Disqualification/);
  assert.match(carter.value, /^1–15$/);
});

test('a flagged player missing from the box score keeps the official name', () => {
  const named = Object.values(breakdown.penalties).flat().filter((entry) => entry.name);
  assert.ok(named.length > 0, 'linemen are not in this roster slice, so their flags arrive by name');
  assert.ok(named.every((entry) => /\./.test(entry.name) || entry.name === 'Team'));
});

test('third-down attempts per player add up to whole-number conversions', () => {
  for (const team of ['DAL', 'PHI']) {
    for (const entry of breakdown.thirdDown[team]) assert.match(entry.value, /^\d+–\d+$/);
  }
});
