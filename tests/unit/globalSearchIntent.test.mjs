import test from 'node:test';
import assert from 'node:assert/strict';

import { isEmptyQuery, parseGlobalQuery } from '../../src/utils/globalSearch/parseIntent.js';

// The regression net for the whole feature: every query shape global search
// claims to support, with the slots it must produce. Anything that changes the
// vocabulary or the matching order shows up here first.
const CASES = [
  // ── Player lookup shorthand ───────────────────────────────────────────────
  ['sea 11',        { teams: ['sea'], jersey: ['11'] }],
  ['seahawks 11',   { teams: ['sea'], jersey: ['11'] }],
  ['SEA #11',       { teams: ['sea'], jersey: ['11'] }],
  ['seattle jsn',   { teams: ['sea'], nameTerms: ['jsn'] }],
  ['seattle jaxon', { teams: ['sea'], nameTerms: ['jaxon'] }],
  ['sea wr',        { teams: ['sea'], positions: ['WR'] }],
  ['seattle wr',    { teams: ['sea'], positions: ['WR'] }],
  ['wr 11',         { positions: ['WR'], jersey: ['11'] }],

  // ── Weeks and schedule ────────────────────────────────────────────────────
  ['week 3',            { week: 3 }],
  ['wk3',               { week: 3 }],
  ['w3',                { week: 3 }],
  ['cardinals week 4',  { teams: ['ari'], week: 4 }],
  ['arizona games',     { teams: ['ari'], intents: ['schedule'] }],
  ['arizona schedule',  { teams: ['ari'], intents: ['schedule'] }],
  ['cardinals schedule', { teams: ['ari'], intents: ['schedule'] }],
  ['detroit bye week',  { teams: ['det'], intents: ['bye'] }],
  ["who's on bye week 7", { intents: ['bye'], week: 7 }],
  ['super bowl',        { week: 'sb' }],

  // ── Standings and records ─────────────────────────────────────────────────
  ['nfc west standings', { divisions: ['NFC West'], intents: ['standings'] }],
  ['my record',          { intents: ['record'], scope: 'self' }],
  ['seahawks record',    { teams: ['sea'], intents: ['record'] }],

  // ── Stat answers ──────────────────────────────────────────────────────────
  ['josh allen stats', { intents: ['stats'], nameTerms: ['josh', 'allen'] }],
  ['trevor lawrence passing yards this season', {
    stats: ['pass_yd'], nameTerms: ['trevor', 'lawrence'], timeframe: 'season',
  }],
  ['lv 17 last week', { teams: ['lv'], jersey: ['17'], timeframe: 'last_week' }],
  ['mahomes career tds', { stats: ['td'], nameTerms: ['mahomes'], timeframe: 'career' }],

  // ── Fantasy lookups ───────────────────────────────────────────────────────
  ['saquon barkley fantasy ranking', { intents: ['ranking'], nameTerms: ['saquon', 'barkley'] }],
  ['best available rb',    { positions: ['RB'], intents: ['waiver'], superlative: 'most' }],
  ['arizona defense vs wr', {
    teams: ['ari'], positions: ['WR'], intents: ['defenseVs'], operator: 'compare',
  }],
  ['trade value for jefferson', { intents: ['tradeValue'], nameTerms: ['jefferson'] }],

  // ── Leaders ───────────────────────────────────────────────────────────────
  ['most rushing yards',  { stats: ['rush_yd'], superlative: 'most' }],
  ['top wr this season',  { positions: ['WR'], timeframe: 'season', superlative: 'most' }],
  ['worst defense vs te', {
    positions: ['TE'], intents: ['defenseVs'], superlative: 'least', operator: 'compare',
  }],

  // ── Team stat groups ──────────────────────────────────────────────────────
  // A team plus a bare stat group is a leaders query for that roster.
  ['seahawks receiving', { teams: ['sea'], stats: ['rec_yd'] }],
  ['sea receiving',      { teams: ['sea'], stats: ['rec_yd'] }],
  ['bills rushing',      { teams: ['buf'], stats: ['rush_yd'] }],
  ['buffalo passing',    { teams: ['buf'], stats: ['pass_yd'] }],
  ['eagles sacks',       { teams: ['phi'], stats: ['sack'] }],
  ['seahawks tackles',   { teams: ['sea'], stats: ['tkl'] }],
  // The team unit, as distinct from the defenders on it.
  ['seahawks team defense sacks', { teams: ['sea'], positions: ['DEF'], stats: ['sack'] }],
  ['sea dst sacks',      { teams: ['sea'], positions: ['DEF'], stats: ['sack'] }],
  // The longer phrases still win the longest-first match.
  ['seahawks receiving tds', { teams: ['sea'], stats: ['rec_td'] }],
  // "tackle" stays a position: it was one before these were added, and the
  // depth-chart reading is the one people use it for.
  ['seahawks tackle',    { teams: ['sea'], positions: ['OL'] }],

  // ── Scoped leaders, standings and team season stats ───────────────────────
  // Any combination of conference, division, team, position and stat.
  ['nfc west rushing leader', { divisions: ['NFC West'], stats: ['rush_yd'], superlative: 'most' }],
  ['afc sacks',          { conferences: ['AFC'], stats: ['sack'] }],
  ['afc east wr receiving', {
    divisions: ['AFC East'], positions: ['WR'], stats: ['rec_yd'],
  }],
  ['seahawks record',    { teams: ['sea'], intents: ['record'] }],
  ['bills point differential', { teams: ['buf'], stats: ['diff'] }],
  ['chiefs strength of schedule', { teams: ['kc'], stats: ['sos'] }],
  ['seahawks points for', { teams: ['sea'], stats: ['pf'] }],
  // "points against" used to point at the Defenses view; after a team name it
  // means the team's points allowed.
  ['seahawks points against', { teams: ['sea'], stats: ['pa'] }],
  ['afc standings',      { conferences: ['AFC'], intents: ['standings'] }],
  ['fantasy standings',  { intents: ['standings'], scope: 'fantasy' }],
  ['my league standings', { intents: ['standings'], scope: 'fantasy' }],
  // The Defenses view keeps its own names.
  ['defense rankings',   { intents: ['defenseVs', 'ranking'] }],

  // ── Commands ──────────────────────────────────────────────────────────────
  ['dark mode',     { commands: ['theme.dark'] }],
  ["what's new",    { commands: ['whatsNew'] }],
  ['switch league', { commands: ['league.switch'] }],

  // ── Comparison ────────────────────────────────────────────────────────────
  ['josh allen vs lamar jackson', {
    nameTerms: ['josh', 'allen', 'lamar', 'jackson'], operator: 'compare',
  }],
];

for (const [query, expected] of CASES) {
  test(`parses ${JSON.stringify(query)}`, () => {
    const slots = parseGlobalQuery(query);
    for (const [slot, value] of Object.entries(expected)) {
      assert.deepEqual(slots[slot], value, `slot "${slot}" for ${JSON.stringify(query)}`);
    }
  });
}

test('natural phrasing reduces to its entities', () => {
  const slots = parseGlobalQuery('who do the seahawks play in week 5');
  assert.deepEqual(slots.teams, ['sea']);
  assert.equal(slots.week, 5);
  assert.deepEqual(slots.nameTerms, [], 'filler words never become name terms');
});

test('a week number is never claimed as a jersey number', () => {
  const week = parseGlobalQuery('cardinals week 4');
  assert.equal(week.week, 4);
  assert.deepEqual(week.jersey, []);

  const jersey = parseGlobalQuery('cardinals 4');
  assert.deepEqual(jersey.jersey, ['4']);
  assert.equal(jersey.week, null);
});

test('"bye week 7" keeps the bye intent and the week separate', () => {
  const slots = parseGlobalQuery('bye week 7');
  assert.deepEqual(slots.intents, ['bye']);
  assert.equal(slots.week, 7);
  assert.deepEqual(slots.jersey, [], 'the 7 belongs to the week, not a jersey');
});

test('a misspelled team both corrects and survives as a name term', () => {
  // The parser cannot know whether an unrecognized word is a typo or a name, so
  // it emits both readings and lets ranking settle it on the evidence.
  const slots = parseGlobalQuery('seahwaks');
  assert.deepEqual(slots.teams, ['sea']);
  assert.deepEqual(slots.nameTerms, ['seahwaks']);
  assert.deepEqual(slots.corrections, [{ from: 'seahwaks', to: 'seahawks' }]);
});

test('a surname one edit from a vocabulary word stays searchable as a name', () => {
  // "moss" is one edit from the superlative "most". Dropping the name term would
  // make the player unfindable; keeping both readings costs nothing.
  const slots = parseGlobalQuery('moss');
  assert.ok(slots.nameTerms.includes('moss'), 'the surname is still a name term');
  assert.equal(slots.superlative, 'most');
});

test('a corrected position does not remain as a required player-name term', () => {
  const slots = parseGlobalQuery('qaterback');
  assert.deepEqual(slots.positions, ['QB']);
  assert.deepEqual(slots.nameTerms, []);
  assert.deepEqual(slots.corrections, [{ from: 'qaterback', to: 'quarterback' }]);
});

test('a typo inside a multi-word phrase corrects from the surrounding words', () => {
  const slots = parseGlobalQuery('recieving yards leader');
  assert.deepEqual(slots.stats, ['rec_yd']);
  assert.equal(slots.superlative, 'most');
  assert.deepEqual(slots.corrections, [{ from: 'recieving', to: 'receiving' }]);
});

test('ambiguous shared-city queries return both teams', () => {
  assert.deepEqual(parseGlobalQuery('new york').teams, ['nyg', 'nyj']);
  assert.deepEqual(parseGlobalQuery('new york jets').teams, ['nyj']);
});

test('season years parse without colliding with jersey numbers', () => {
  const slots = parseGlobalQuery('seahawks 2024');
  assert.equal(slots.season, 2024);
  assert.deepEqual(slots.jersey, []);
});

test('repeated terms are recorded once', () => {
  const slots = parseGlobalQuery('seahawks seattle sea wr wr');
  assert.deepEqual(slots.teams, ['sea']);
  assert.deepEqual(slots.positions, ['WR']);
});

test('an empty or meaningless query is reported as empty', () => {
  assert.equal(isEmptyQuery(parseGlobalQuery('')), true);
  assert.equal(isEmptyQuery(parseGlobalQuery('   ')), true);
  assert.equal(isEmptyQuery(parseGlobalQuery('the a for')), true);
  assert.equal(isEmptyQuery(parseGlobalQuery('sea')), false);
});

test('parsing tolerates null and undefined', () => {
  assert.equal(isEmptyQuery(parseGlobalQuery(null)), true);
  assert.equal(isEmptyQuery(parseGlobalQuery(undefined)), true);
});
