import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MATCH_EXACT,
  MATCH_PREFIX,
  createIndex,
  initialismOf,
  normalizeText,
  scoreTerm,
  scoreTerms,
  tokenizeText,
  trigramsOf,
} from '../../src/utils/globalSearch/tokenIndex.js';
import { makeRecord, nameTokens } from '../../src/utils/globalSearch/entities/record.js';
import {
  buildPlayerRecords,
  mergeEspnRoster,
  packPlayerRecords,
  unpackPlayerRecords,
} from '../../src/utils/globalSearch/entities/players.js';
import { buildNflTeamRecords } from '../../src/utils/globalSearch/entities/nflTeams.js';
import { buildGameRecords, buildWeekRecords } from '../../src/utils/globalSearch/entities/games.js';
import { buildFantasyTeamRecords } from '../../src/utils/globalSearch/entities/fantasyTeams.js';

test('normalization strips accents, suffixes, and punctuation', () => {
  assert.equal(normalizeText('Michael Pittman Jr.'), 'michael pittman');
  assert.equal(normalizeText('Amon-Ra St. Brown'), 'amon ra st brown');
  assert.equal(normalizeText('Odell Beckham Jr'), 'odell beckham');
  assert.deepEqual(tokenizeText("Ja'Marr Chase"), ['ja', 'marr', 'chase']);
});

test('initialisms cover the shorthand people actually type', () => {
  assert.equal(initialismOf('Jaxon Smith-Njigba'), 'jsn');
  assert.equal(initialismOf('Amon-Ra St. Brown'), 'arsb');
  assert.equal(initialismOf('Cher'), '', 'a single word has no initialism');
});

test('name tokens include the words, the whole name, and the initialism', () => {
  const tokens = nameTokens('Jaxon Smith-Njigba');
  assert.ok(tokens.includes('jaxon'));
  assert.ok(tokens.includes('njigba'));
  assert.ok(tokens.includes('jaxon smith njigba'), 'the whole name scores as one strong hit');
  assert.ok(tokens.includes('jsn'));
});

test('trigrams are padded so word starts and ends are distinguishable', () => {
  const grams = trigramsOf('abc');
  assert.deepEqual(grams, ['~ab', 'abc', 'bc~']);
});

function fixtureIndex() {
  return createIndex([
    makeRecord({ kind: 'player', id: '1', label: 'Jaxon Smith-Njigba', tokens: nameTokens('Jaxon Smith-Njigba') }),
    makeRecord({ kind: 'player', id: '2', label: 'Justin Jefferson', tokens: nameTokens('Justin Jefferson') }),
    makeRecord({ kind: 'player', id: '3', label: 'Jaxon Jones', tokens: nameTokens('Jaxon Jones') }),
  ]);
}

test('exact matches outscore prefix matches, which outscore fuzzy matches', () => {
  const index = fixtureIndex();
  const exact = scoreTerm(index, 'njigba').get(0);
  const prefix = scoreTerm(index, 'njig').get(0);
  const fuzzy = scoreTerm(index, 'jefersn').get(1);

  assert.equal(exact, MATCH_EXACT);
  assert.equal(prefix, MATCH_PREFIX);
  assert.ok(fuzzy > 0 && fuzzy < MATCH_PREFIX, 'a typo scores below a real prefix hit');
});

test('a misspelled name still finds its player', () => {
  const index = fixtureIndex();
  const scores = scoreTerm(index, 'jefersn');
  assert.ok(scores.has(1), 'Justin Jefferson is reachable from "jefersn"');
});

test('terms are AND-ed: every term must match', () => {
  const index = fixtureIndex();
  assert.ok(scoreTerms(index, ['jaxon', 'njigba']).has(0));
  assert.equal(scoreTerms(index, ['jaxon', 'njigba']).has(2), false, 'Jaxon Jones fails the second term');
  assert.equal(scoreTerms(index, ['jaxon', 'jefferson']).size, 0, 'no record satisfies both');
});

test('fuzzy matching can be turned off for terms known to be spelled correctly', () => {
  const index = fixtureIndex();
  assert.ok(scoreTerm(index, 'jefersn', { fuzzy: true }).has(1));
  assert.equal(scoreTerm(index, 'jefersn', { fuzzy: false }).has(1), false);
});

test('an empty term list matches nothing rather than everything', () => {
  const index = fixtureIndex();
  assert.equal(scoreTerms(index, []).size, 0);
  assert.equal(scoreTerms(index, ['']).size, 0);
});

// ── Entity adapters ─────────────────────────────────────────────────────────

const SCHEDULE_DATA = {
  season: 2026,
  teams: [
    { id: 'SEA', name: 'Seattle Seahawks', division: 'NFC West', conference: 'NFC', city: 'Seattle', nickname: 'Seahawks' },
    { id: 'ARI', name: 'Arizona Cardinals', division: 'NFC West', conference: 'NFC', city: 'Arizona', nickname: 'Cardinals' },
  ],
};

const SEASON_SCHEDULE = {
  season: 2026,
  weeks: {
    1: [{ id: '2026-W01-ARI-SEA', week: 1, awayTeam: 'ARI', homeTeam: 'SEA', kickoff: '2026-09-10T00:20:00.000Z', network: 'NBC' }],
    2: [{ id: '2026-W02-SEA-ARI', week: 2, awayTeam: 'SEA', homeTeam: 'ARI', kickoff: '2026-09-17T00:20:00.000Z', network: 'FOX' }],
  },
};

test('team records carry routing and division metadata', () => {
  const [seattle] = buildNflTeamRecords(SCHEDULE_DATA);
  assert.equal(seattle.label, 'Seattle Seahawks');
  assert.equal(seattle.id, 'sea');
  assert.equal(seattle.route.statisticsTeamId, 'SEA');
  assert.equal(seattle.meta.division, 'NFC West');
  assert.ok(seattle.tokens.includes('seahawks'));
  assert.ok(seattle.tokens.includes('seattle'));
  assert.ok(seattle.tokens.includes('sea'));
});

test('game records are findable by either team and carry their week', () => {
  const games = buildGameRecords(SEASON_SCHEDULE, SCHEDULE_DATA);
  assert.equal(games.length, 2);
  const [opener] = games;
  assert.equal(opener.meta.week, 1);
  assert.equal(opener.meta.awayTeam, 'ARI');
  assert.equal(opener.meta.homeTeam, 'SEA');
  assert.ok(opener.tokens.includes('ari'));
  assert.ok(opener.tokens.includes('sea'));
  assert.equal(opener.route.statisticsScheduleWeek, 1);
});

test('week records give a bare week somewhere to land', () => {
  const weeks = buildWeekRecords(SEASON_SCHEDULE);
  assert.deepEqual(weeks.map((week) => week.label), ['Week 1', 'Week 2']);
  assert.equal(weeks[0].route.statisticsScheduleMode, 'week');
});

test('player records index names only, with team and jersey as metadata', () => {
  const [record] = buildPlayerRecords({
    1: { full_name: 'Jaxon Smith-Njigba', team: 'SEA', position: 'WR', number: 11, search_rank: 8, active: true, espn_id: '4426515' },
  });

  assert.equal(record.label, 'Jaxon Smith-Njigba');
  assert.equal(record.meta.team, 'SEA');
  assert.equal(record.meta.jersey, '11');
  assert.equal(record.meta.espnId, '4426515');
  assert.ok(record.tokens.includes('jsn'));
  assert.equal(record.tokens.includes('sea'), false, 'team is a slot filter, not a search token');
  assert.equal(record.tokens.includes('11'), false, 'jersey is a slot filter, not a search token');
});

test('player measurements survive the compact offline search-index round trip', () => {
  const [record] = buildPlayerRecords({
    1: {
      full_name: 'Jaxon Smith-Njigba', team: 'SEA', position: 'WR', number: 11,
      search_rank: 8, active: true, height: `6' 2\"`, weight: '205',
    },
  });
  const [restored] = unpackPlayerRecords(packPlayerRecords([record]));

  assert.equal(restored.meta.height, '6′ 2″');
  assert.equal(restored.meta.weight, '205 lb');
  assert.equal(restored.weight, record.weight, 'physical weight does not replace search ranking weight');
});

test('ESPN roster measurements fill directory gaps without replacing existing values', () => {
  const [existing] = buildPlayerRecords({
    1: { full_name: 'Jaxon Smith-Njigba', team: 'SEA', position: 'WR', active: true, height: `6' 1\"` },
  });
  const [merged] = mergeEspnRoster([existing], [{
    id: '4426515', displayName: 'Jaxon Smith-Njigba', position: 'WR',
    displayHeight: `6' 2\"`, displayWeight: '198 lbs',
  }], 'SEA');

  assert.equal(merged.meta.height, '6′ 1″');
  assert.equal(merged.meta.weight, '198 lb');
  assert.equal(merged.meta.espnId, '4426515');
});

test('every rostered player is indexed, not just fantasy positions', () => {
  // "raiders 74" has to reach a lineman, so roster membership is the test, not
  // whether the position is startable.
  const records = buildPlayerRecords({
    1: { full_name: 'Kolton Miller', team: 'LV', position: 'OT', number: 74, search_rank: 5000, active: true },
  });
  assert.equal(records.length, 1);
});

test('unrostered players are indexed only when they are plausible pickups', () => {
  const records = buildPlayerRecords({
    1: { full_name: 'Notable Free Agent', team: null, position: 'RB', number: 20, search_rank: 150, active: true },
    2: { full_name: 'Deep Free Agent', team: null, position: 'RB', number: 21, search_rank: 5000, active: true },
    3: { full_name: 'Free Agent Guard', team: null, position: 'OG', number: 60, search_rank: 100, active: true },
  });
  assert.deepEqual(records.map((record) => record.label), ['Notable Free Agent']);
});

test('retired and nameless player entries are skipped', () => {
  const records = buildPlayerRecords({
    1: { full_name: 'Retired Guy', team: 'SEA', position: 'WR', active: false },
    2: { team: 'SEA', position: 'WR', active: true },
    3: { full_name: 'No Position', team: 'SEA', active: true },
  });
  assert.deepEqual(records, []);
});

test('player names split across first and last name fields still index', () => {
  const [record] = buildPlayerRecords({
    1: { first_name: 'Puka', last_name: 'Nacua', team: 'LAR', position: 'WR', number: 17, search_rank: 20, active: true },
  });
  assert.equal(record.label, 'Puka Nacua');
  assert.ok(record.tokens.includes('nacua'));
});

test('a more popular player carries more weight than an obscure namesake', () => {
  const [star, scrub] = buildPlayerRecords({
    1: { full_name: 'Josh Allen', team: 'BUF', position: 'QB', number: 17, search_rank: 5, active: true },
    2: { full_name: 'Josh Allen', team: 'JAX', position: 'LB', number: 41, search_rank: 900, active: true },
  });
  assert.ok(star.weight > scrub.weight);
});

test('fantasy team records are findable by team name and manager name', () => {
  const [record] = buildFantasyTeamRecords({
    rosters: [{ roster_id: 3, owner_id: 'u1' }],
    leagueUsers: [{ user_id: 'u1', metadata: { team_name: 'Gridiron Giants' } }],
    getUserDisplayName: () => 'Dana',
  });

  assert.equal(record.label, 'Gridiron Giants');
  assert.equal(record.sublabel, 'Dana');
  assert.ok(record.tokens.includes('gridiron'));
  assert.ok(record.tokens.includes('dana'));
  assert.equal(record.route.leagueRosterId, '3');
  assert.equal(record.meta.rosterId, 3);
});

test('a fantasy team with no custom name falls back to its manager', () => {
  const [record] = buildFantasyTeamRecords({
    rosters: [{ roster_id: 5, owner_id: 'u2' }],
    leagueUsers: [{ user_id: 'u2' }],
    getUserDisplayName: () => 'Sam',
  });
  assert.equal(record.label, 'Sam');
});

test('adapters tolerate missing and empty sources', () => {
  assert.deepEqual(buildNflTeamRecords(), []);
  assert.deepEqual(buildNflTeamRecords({}), []);
  assert.deepEqual(buildGameRecords(), []);
  assert.deepEqual(buildWeekRecords(), []);
  assert.deepEqual(buildPlayerRecords(), []);
  assert.deepEqual(buildFantasyTeamRecords(), []);
});

test('a fuzzy match must share the term first letter', () => {
  // Regression: "wire" and "zaire" share 50% of their trigrams — exactly as many
  // as the real typo "lamr"/"lamar". Similarity alone cannot tell them apart, so
  // fuzzy matching additionally requires the first letter to agree.
  const index = createIndex([
    makeRecord({ kind: 'player', id: '1', label: 'Zaire Franklin', tokens: nameTokens('Zaire Franklin') }),
    makeRecord({ kind: 'player', id: '2', label: 'Lamar Jackson', tokens: nameTokens('Lamar Jackson') }),
  ]);

  assert.equal(scoreTerm(index, 'wire').has(0), false, 'wire must not reach Zaire');
  assert.ok(scoreTerm(index, 'lamr').has(1), 'a same-letter typo still reaches its player');
});
