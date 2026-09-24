import test from 'node:test';
import assert from 'node:assert/strict';

import { parseGlobalQuery } from '../../src/utils/globalSearch/parseIntent.js';
import { resolveAnswer } from '../../src/utils/globalSearch/answers/index.js';
import { resolvePlayerStatAnswer, resolveStatKey } from '../../src/utils/globalSearch/answers/playerStat.js';
import { resolveLeadersAnswer } from '../../src/utils/globalSearch/answers/leaders.js';
import { resolveFantasyAnswer } from '../../src/utils/globalSearch/answers/fantasyLookup.js';
import { buildPlayerRecords } from '../../src/utils/globalSearch/entities/players.js';

const PLAYERS = {
  qb: { full_name: 'Dalton Pryor', team: 'BUF', position: 'QB', number: 17, search_rank: 5, active: true },
  wr1: { full_name: 'Marcus Vane', team: 'MIN', position: 'WR', number: 18, search_rank: 3, active: true },
  wr2: { full_name: 'Elias Roan', team: 'SEA', position: 'WR', number: 11, search_rank: 8, active: true },
  rb1: { full_name: 'Kofi Adeyemi', team: 'PHI', position: 'RB', number: 26, search_rank: 10, active: true },
};

const WEEKLY_STATS = {
  qb: [
    { week: 1, pass_yd: 300, pass_td: 3, pass_int: 1, rush_yd: 20 },
    { week: 2, pass_yd: 250, pass_td: 2, pass_int: 0, rush_yd: 35 },
  ],
  wr1: [
    { week: 1, rec: 8, rec_yd: 120, rec_td: 1, rec_tgt: 11 },
    { week: 2, rec: 5, rec_yd: 60, rec_td: 0, rec_tgt: 8 },
  ],
  wr2: [
    // Carries on end-arounds, so this receiver appears in a rushing-yards
    // ranking below the running back — which is what makes the
    // rank-before-filter behaviour observable.
    { week: 1, rec: 4, rec_yd: 55, rec_td: 0, rec_tgt: 6, rush_att: 1, rush_yd: 12 },
    { week: 2, rec: 6, rec_yd: 95, rec_td: 1, rec_tgt: 9, rush_att: 2, rush_yd: 18 },
  ],
  rb1: [
    { week: 1, rush_att: 18, rush_yd: 95, rush_td: 1, rec: 3, rec_yd: 25 },
    { week: 2, rush_att: 22, rush_yd: 140, rush_td: 2, rec: 1, rec_yd: 5 },
  ],
};

const SCORING = { pass_yd: 0.04, pass_td: 4, pass_int: -2, rush_yd: 0.1, rush_td: 6, rec: 1, rec_yd: 0.1, rec_td: 6 };

const RECORDS = buildPlayerRecords(PLAYERS);
const recordFor = (id) => RECORDS.find((record) => record.id === id);

// The team list search scopes against, in the shape the rest of the app uses.
const NFL_TEAMS = [
  { id: 'SEA', name: 'Seattle Seahawks', division: 'NFC West', conference: 'NFC' },
  { id: 'ARI', name: 'Arizona Cardinals', division: 'NFC West', conference: 'NFC' },
  { id: 'MIN', name: 'Minnesota Vikings', division: 'NFC North', conference: 'NFC' },
  { id: 'PHI', name: 'Philadelphia Eagles', division: 'NFC East', conference: 'NFC' },
  { id: 'BUF', name: 'Buffalo Bills', division: 'AFC East', conference: 'AFC' },
];

const DATA = {
  weeklyStats: WEEKLY_STATS,
  players: PLAYERS,
  scoring: SCORING,
  currentWeek: 3,
  nflTeams: NFL_TEAMS,
};

// ── Player stat answers ─────────────────────────────────────────────────────

test('a stats query returns the position-appropriate line', () => {
  const answer = resolvePlayerStatAnswer(parseGlobalQuery('dalton pryor stats'), recordFor('qb'), DATA);
  assert.equal(answer.kind, 'playerStat');
  assert.equal(answer.title, 'Dalton Pryor');

  const byKey = Object.fromEntries(answer.values.map((value) => [value.key, value.display]));
  assert.equal(byKey.pass_yd, '550', 'season passing yards are summed');
  assert.equal(byKey.pass_td, '5');
  assert.equal(byKey.pass_int, '1');
});

test('a named stat narrows the line to that stat', () => {
  const answer = resolvePlayerStatAnswer(
    parseGlobalQuery('marcus vane receiving yards this season'),
    recordFor('wr1'),
    DATA,
  );
  assert.deepEqual(answer.values.map((value) => value.key), ['rec_yd']);
  assert.equal(answer.values[0].display, '180');
  assert.equal(answer.values[0].label, 'Receiving yards', 'labels are plain language, not stat keys');
});

test('"last week" resolves against the league current week', () => {
  // currentWeek is 3, so "last week" is week 2 — the most recent completed one.
  const answer = resolvePlayerStatAnswer(parseGlobalQuery('dalton pryor stats last week'), recordFor('qb'), DATA);
  assert.equal(answer.subtitle.includes('Week 2'), true);
  const byKey = Object.fromEntries(answer.values.map((value) => [value.key, value.display]));
  assert.equal(byKey.pass_yd, '250', 'week 2 only, not the season total');
});

test('an explicit week wins over a timeframe', () => {
  const answer = resolvePlayerStatAnswer(parseGlobalQuery('dalton pryor stats week 1'), recordFor('qb'), DATA);
  assert.equal(answer.subtitle.includes('Week 1'), true);
  const byKey = Object.fromEntries(answer.values.map((value) => [value.key, value.display]));
  assert.equal(byKey.pass_yd, '300');
});

test('ambiguous stat words resolve by position', () => {
  assert.equal(resolveStatKey('yards', 'QB'), 'pass_yd');
  assert.equal(resolveStatKey('yards', 'RB'), 'rush_yd');
  assert.equal(resolveStatKey('yards', 'WR'), 'rec_yd');
  assert.equal(resolveStatKey('td', 'QB'), 'pass_td');
  assert.equal(resolveStatKey('rec_yd', 'QB'), 'rec_yd', 'an unambiguous key is untouched');
});

test('a stat answer is null when the data is cold, rather than showing zeroes', () => {
  // The contract that keeps the palette fast: no data means no answer, and the
  // result falls back to a plain navigation row.
  const slots = parseGlobalQuery('dalton pryor stats');
  assert.equal(resolvePlayerStatAnswer(slots, recordFor('qb'), { ...DATA, weeklyStats: null }), null);
  assert.equal(resolvePlayerStatAnswer(slots, recordFor('qb'), { ...DATA, weeklyStats: {} }), null);
});

test('a query that is not asking for stats gets no stat answer', () => {
  assert.equal(resolvePlayerStatAnswer(parseGlobalQuery('dalton pryor'), recordFor('qb'), DATA), null);
});

test('a non-player record never produces a stat answer', () => {
  const slots = parseGlobalQuery('seahawks stats');
  assert.equal(resolvePlayerStatAnswer(slots, { kind: 'nflTeam', label: 'Seattle' }, DATA), null);
});

// ── Leaders ─────────────────────────────────────────────────────────────────

test('a leaders query ranks the field by the named stat', () => {
  const answer = resolveLeadersAnswer(parseGlobalQuery('most rushing yards'), DATA);
  assert.equal(answer.kind, 'leaders');
  assert.equal(answer.rows[0].label, 'Kofi Adeyemi');
  assert.equal(answer.rows[0].display, '235');
  assert.equal(answer.rows[0].rank, 1);
});

test('a least superlative reverses the ordering', () => {
  const most = resolveLeadersAnswer(parseGlobalQuery('most receiving yards'), DATA);
  const fewest = resolveLeadersAnswer(parseGlobalQuery('fewest receiving yards'), DATA);
  assert.notEqual(most.rows[0].label, fewest.rows[0].label);
  assert.equal(most.title.startsWith('Most'), true);
  assert.equal(fewest.title.startsWith('Fewest'), true);
});

test('rank is computed before the position filter and carried through', () => {
  // The project rule for filtered ranked lists: a filtered row keeps the rank it
  // earned in the full field. Renumbering would make "WR1" mean something
  // different here than everywhere else in the app.
  const all = resolveLeadersAnswer(parseGlobalQuery('most rushing yards'), DATA);
  const wrs = resolveLeadersAnswer(parseGlobalQuery('most rushing yards wr'), DATA);

  assert.equal(all.rows[0].label, 'Kofi Adeyemi', 'the back leads the unfiltered field');
  assert.equal(all.rows[0].rank, 1);
  assert.ok(wrs, 'the receiver with carries still ranks');
  assert.equal(wrs.rows[0].label, 'Elias Roan');
  assert.ok(
    wrs.rows[0].rank > 1,
    'the filtered receiver keeps the rank he earned rather than restarting at 1',
  );
});

test('a leaders query with a position but no stat ranks by fantasy points', () => {
  const answer = resolveLeadersAnswer(parseGlobalQuery('top wr this season'), DATA);
  assert.ok(answer.title.includes('fantasy points'));
  assert.deepEqual(answer.rows.map((row) => row.label).sort(), ['Elias Roan', 'Marcus Vane']);
});

test('leaders returns null without a superlative or with cold data', () => {
  assert.equal(resolveLeadersAnswer(parseGlobalQuery('rushing yards'), DATA), null);
  assert.equal(resolveLeadersAnswer(parseGlobalQuery('most rushing yards'), { ...DATA, weeklyStats: null }), null);
  assert.equal(resolveLeadersAnswer(parseGlobalQuery('most rushing yards'), { ...DATA, players: null }), null);
});

// ── Fantasy lookups ─────────────────────────────────────────────────────────

test('a ranking query reports the position rank', () => {
  const answer = resolveFantasyAnswer(parseGlobalQuery('marcus vane fantasy ranking'), recordFor('wr1'), DATA);
  assert.equal(answer.kind, 'fantasyRanking');
  const byKey = Object.fromEntries(answer.values.map((value) => [value.key, value.display]));
  assert.equal(byKey.rank, 'WR1', 'the better receiver ranks first');
  assert.ok(Number(byKey.ppg) > 0);
});

test('trade value preserves null propagation instead of reporting zero', () => {
  // productionAdjustedValue returns the unadjusted value when production is
  // missing; it must never coerce a missing value into 0.
  const ktcPlayers = [{ playerName: 'Marcus Vane', position: 'WR', team: 'MIN', oneQBValue: 5000, value: 5000 }];
  const answer = resolveFantasyAnswer(
    parseGlobalQuery('trade value for marcus vane'),
    recordFor('wr1'),
    { ...DATA, ktcPlayers, positionalAvgPPG: null },
  );

  if (answer) {
    const value = answer.values.find((entry) => entry.key === 'value');
    assert.notEqual(value.display, '0', 'a missing adjustment never renders as zero');
  }

  assert.equal(
    resolveFantasyAnswer(parseGlobalQuery('trade value for marcus vane'), recordFor('wr1'), DATA),
    null,
    'no trade data means no answer, not a zero value',
  );
});

test('a fantasy answer is null for an intent it does not handle', () => {
  assert.equal(resolveFantasyAnswer(parseGlobalQuery('marcus vane stats'), recordFor('wr1'), DATA), null);
});

// ── Dispatch ────────────────────────────────────────────────────────────────

function groupsWith(record) {
  return [{ kind: 'player', label: 'Players', results: [{ record, score: 10 }] }];
}

test('dispatch prefers a leaders answer, which needs no top player', () => {
  const answer = resolveAnswer(parseGlobalQuery('most rushing yards'), [], DATA);
  assert.equal(answer.kind, 'leaders');
});

test('dispatch prefers a fantasy answer over a stat line for a ranking query', () => {
  const answer = resolveAnswer(
    parseGlobalQuery('marcus vane fantasy ranking'),
    groupsWith(recordFor('wr1')),
    DATA,
  );
  assert.equal(answer.kind, 'fantasyRanking');
});

test('dispatch falls through to the stat line', () => {
  const answer = resolveAnswer(parseGlobalQuery('marcus vane stats'), groupsWith(recordFor('wr1')), DATA);
  assert.equal(answer.kind, 'playerStat');
});

test('dispatch returns null when nothing applies', () => {
  assert.equal(resolveAnswer(parseGlobalQuery('seattle'), [], DATA), null);
  assert.equal(resolveAnswer(parseGlobalQuery('marcus vane stats'), [], DATA), null);
});

test('a superlative that only exists via typo correction never triggers an answer', () => {
  // "Test" is one edit from "best". Without the guard, a player lookup for a
  // surname near a superlative turns into a leaderboard.
  const slots = parseGlobalQuery('test receiver stats');
  assert.equal(slots.superlative, 'most', 'the parser still offers the reading');
  assert.ok(slots.correctedTypes.includes('superlative'), 'and marks it as corrected');
  assert.equal(resolveLeadersAnswer(slots, DATA), null, 'but the answer card declines it');
});

// ── Team stat leaders ───────────────────────────────────────────────────────
// "seahawks receiving" is how people ask for a roster's leaders in a stat, and
// it carries no superlative at all.

test('a team plus a stat answers without a superlative', () => {
  const answer = resolveLeadersAnswer(parseGlobalQuery('seattle receiving'), DATA);
  assert.ok(answer, 'a team and a stat are evidence enough on their own');
  assert.ok(answer.rows.every((row) => row.sublabel.includes('SEA')));
  assert.equal(answer.rows[0].label, 'Elias Roan');
});

test('a team leaders card is titled for the team, not for a superlative', () => {
  const answer = resolveLeadersAnswer(parseGlobalQuery('seattle receiving'), DATA);
  assert.match(answer.title, /^Seattle Seahawks — receiving yards$/);
  assert.equal(answer.footnote, 'Rank is across the NFL');
});

test('a team leader keeps the rank it earned league-wide', () => {
  // Rank before filtering, per the project's ranked-list rule: Seattle's top
  // receiver is second in the league here, and the card must say 2.
  const answer = resolveLeadersAnswer(parseGlobalQuery('seattle receiving'), DATA);
  assert.equal(answer.rows[0].rank, 2);
});

test('a bare stat with no team and no superlative answers nothing', () => {
  // Otherwise typing a stat word mid-query would turn any lookup into a
  // leaderboard.
  assert.equal(resolveLeadersAnswer(parseGlobalQuery('receiving'), DATA), null);
});

test('a team that exists only because of a correction does not answer', () => {
  const slots = {
    ...parseGlobalQuery('seattle receiving'),
    correctedTypes: ['team'],
  };
  assert.equal(resolveLeadersAnswer(slots, DATA), null);
});

test('a team card carries the full group behind a collapse point', () => {
  const answer = resolveLeadersAnswer(parseGlobalQuery('seattle receiving'), DATA);
  assert.equal(answer.collapseAfter, 5);
  assert.deepEqual(answer.route, {
    activeTab: 'statistics',
    statisticsView: 'team',
    statisticsTeamId: 'SEA',
  });
});

test('two teams in one query scopes to both of them', () => {
  // Slots are OR-ed within a type and AND-ed across types, exactly as rank.js
  // filters results, so naming two teams asks about both.
  const answer = resolveLeadersAnswer(parseGlobalQuery('seattle minnesota receiving'), DATA);
  const teams = new Set(answer.rows.map((row) => row.sublabel.split(' · ')[1]));
  assert.deepEqual([...teams].sort(), ['MIN', 'SEA']);
});

// ── IDP ─────────────────────────────────────────────────────────────────────
// Sleeper files an individual defender's production under `idp_*` and a team
// defense's under the bare names, and nothing carries both. Reading only the
// bare key answered "seahawks sacks" with the Seahawks DEF unit alone, because
// it was the one record in the league that had a `sack` key at all.

const IDP_PLAYERS = {
  ...PLAYERS,
  lb1: { full_name: 'Roan Teague', team: 'SEA', position: 'LB', number: 54, search_rank: 400, active: true },
  de1: { full_name: 'Micah Sole', team: 'SEA', position: 'DE', number: 91, search_rank: 420, active: true },
  cb1: { full_name: 'Amari Vance', team: 'SEA', position: 'CB', number: 22, search_rank: 500, active: true },
  seaDef: { full_name: 'Seattle Seahawks', team: 'SEA', position: 'DEF', search_rank: 300, active: true },
};

const IDP_STATS = {
  ...WEEKLY_STATS,
  lb1: [
    { week: 1, idp_tkl: 9, idp_sack: 1, idp_int: 1, idp_pass_def: 2 },
    { week: 2, idp_tkl: 7, idp_sack: 0.5, idp_pass_def: 1 },
  ],
  de1: [
    { week: 1, idp_tkl: 3, idp_sack: 2.5 },
    { week: 2, idp_tkl: 4, idp_sack: 1 },
  ],
  cb1: [
    { week: 1, idp_tkl: 5, idp_int: 2, idp_pass_def: 4 },
    { week: 2, idp_tkl: 2, idp_pass_def: 1 },
  ],
  // The team unit's own totals, under the bare keys.
  seaDef: [{ week: 1, sack: 3, int: 2 }, { week: 2, sack: 2, int: 1 }],
};

const IDP_DATA = { ...DATA, players: IDP_PLAYERS, weeklyStats: IDP_STATS };

test('a team sacks query ranks the defenders who recorded them', () => {
  const answer = resolveLeadersAnswer(parseGlobalQuery('seattle sacks'), IDP_DATA);
  assert.deepEqual(answer.rows.map((row) => row.label), ['Micah Sole', 'Roan Teague']);
  // Half sacks are credited in halves; rounding would report a number the
  // player did not record.
  assert.equal(answer.rows[0].display, '3.5');
  assert.equal(answer.rows[1].display, '1.5');
});

test('the team defense unit stays out of a defensive leaderboard', () => {
  // Its team total would sit above every player who made the plays.
  const answer = resolveLeadersAnswer(parseGlobalQuery('seattle sacks'), IDP_DATA);
  assert.ok(answer.rows.every((row) => !row.sublabel.startsWith('DEF')));
});

test('naming the team defense asks for the team total instead', () => {
  const answer = resolveLeadersAnswer(parseGlobalQuery('seattle team defense sacks'), IDP_DATA);
  assert.deepEqual(answer.rows.map((row) => row.label), ['Seattle Seahawks']);
  assert.equal(answer.rows[0].display, '5');
});

test('tackles and interceptions read from the defensive keys too', () => {
  const tackles = resolveLeadersAnswer(parseGlobalQuery('seattle tackles'), IDP_DATA);
  assert.equal(tackles.rows[0].label, 'Roan Teague');
  assert.equal(tackles.rows[0].display, '16');

  const picks = resolveLeadersAnswer(parseGlobalQuery('seattle interceptions'), IDP_DATA);
  assert.equal(picks.rows[0].label, 'Amari Vance');
});

test("a defender's stat line is their own, not four offensive zeroes", () => {
  const [record] = buildPlayerRecords({ lb1: IDP_PLAYERS.lb1 });
  const answer = resolvePlayerStatAnswer(parseGlobalQuery('roan teague stats'), record, IDP_DATA);
  assert.deepEqual(answer.values.map((value) => value.label), [
    'Tackles', 'Sacks', 'Interceptions', 'Passes defended',
  ]);
  assert.deepEqual(answer.values.map((value) => value.display), ['16', '1.5', '1', '3']);
});

test("a quarterback's interceptions are still the ones he threw", () => {
  const answer = resolvePlayerStatAnswer(
    parseGlobalQuery('dalton pryor interceptions'),
    recordFor('qb'),
    IDP_DATA,
  );
  assert.equal(answer.values[0].label, 'Interceptions');
  assert.equal(answer.values[0].display, '1');
});
