import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EMPTY_FEED_FILTER,
  buildFeedFilterModel,
  getBigPlayThreshold,
  matchesFeedFilter,
  toggleFilterValue,
} from '../../src/utils/liveFeedFilters.js';

const PPR = {
  pass_yd: 0.04, pass_td: 4, pass_int: -2,
  rush_yd: 0.1, rush_td: 6,
  rec: 1, rec_yd: 0.1, rec_td: 6,
  fum_lost: -2, fgm: 3, xpm: 1,
};

const groupIds = (model) => model.map((group) => group.id);
const typeIds = (model, id) => model.find((group) => group.id === id)?.types.map((type) => type.id);

test('a standard league gets scoring, offense, special teams and highlights', () => {
  const model = buildFeedFilterModel({ scoringSettings: PPR, rosterPositions: ['QB', 'RB', 'WR', 'TE', 'K'] });
  assert.deepEqual(groupIds(model), ['scoring', 'offense', 'special', 'highlights']);
  // No defensive slot and no IDP scoring, so a Defense chip would never match.
  assert.ok(!groupIds(model).includes('defense'));
});

test('a league with a defence slot gets the defence group', () => {
  const model = buildFeedFilterModel({ scoringSettings: PPR, rosterPositions: ['QB', 'RB', 'WR', 'DEF'] });
  assert.ok(groupIds(model).includes('defense'));
});

test('IDP scoring brings in defence even with no named slot', () => {
  const model = buildFeedFilterModel({
    scoringSettings: { ...PPR, idp_sack: 4, idp_int: 6 },
    rosterPositions: ['QB', 'RB', 'WR'],
  });
  assert.ok(groupIds(model).includes('defense'));
});

test('a kickerless league loses field goals and extra points', () => {
  const { fgm, xpm, ...noKicking } = PPR;
  const model = buildFeedFilterModel({ scoringSettings: noKicking, rosterPositions: ['QB', 'RB', 'WR', 'TE'] });
  assert.deepEqual(typeIds(model, 'scoring'), ['td']);
  // Special teams has nothing left to offer without kicking or return scoring.
  assert.ok(!groupIds(model).includes('special'));
});

test('return scoring keeps special teams alive without a kicker', () => {
  const { fgm, xpm, ...noKicking } = PPR;
  const model = buildFeedFilterModel({
    scoringSettings: { ...noKicking, kr_td: 6, pr_td: 6 },
    rosterPositions: ['QB', 'RB', 'WR'],
  });
  assert.deepEqual(typeIds(model, 'special'), ['return']);
});

test('highlights are always offered, since any league can have a big or negative play', () => {
  const model = buildFeedFilterModel({ scoringSettings: {}, rosterPositions: [] });
  assert.deepEqual(typeIds(model, 'highlights'), ['big', 'negative']);
});

test('the big-play bar tracks the cheapest touchdown in the league', () => {
  // Six-point rushing, four-point passing: a passing score still counts as big.
  assert.equal(getBigPlayThreshold(PPR), 4);
  assert.equal(getBigPlayThreshold({ pass_td: 6, rush_td: 6, rec_td: 6 }), 6);
  assert.equal(getBigPlayThreshold({}), 5);
});

test('an empty filter admits everything', () => {
  assert.equal(matchesFeedFilter({ kind: 'rush', pts: 0.4 }, EMPTY_FEED_FILTER), true);
});

test('a rushing touchdown belongs to Rush as well as TD', () => {
  const event = { kind: 'td', mechanism: 'rush', pts: 6 };
  assert.equal(matchesFeedFilter(event, { group: 'offense', types: ['rush'] }, { threshold: 4 }), true);
  assert.equal(matchesFeedFilter(event, { group: 'scoring', types: ['td'] }, { threshold: 4 }), true);
  // ...and not to Pass.
  assert.equal(matchesFeedFilter(event, { group: 'offense', types: ['pass'] }, { threshold: 4 }), false);
});

test('selecting no types means the whole group', () => {
  const rush = { kind: 'rush', mechanism: 'rush', pts: 0.7 };
  const pass = { kind: 'pass', mechanism: 'pass', pts: 1.2 };
  assert.equal(matchesFeedFilter(rush, { group: 'offense', types: [] }), true);
  assert.equal(matchesFeedFilter(pass, { group: 'offense', types: [] }), true);
});

test('types within a group are ORed', () => {
  const fg = { kind: 'fg', pts: 3 };
  const xp = { kind: 'xp', pts: 1 };
  const td = { kind: 'td', mechanism: 'rush', pts: 6 };
  const filter = { group: 'scoring', types: ['fg', 'xp'] };
  assert.equal(matchesFeedFilter(fg, filter), true);
  assert.equal(matchesFeedFilter(xp, filter), true);
  assert.equal(matchesFeedFilter(td, filter), false);
});

test('group and position are ANDed', () => {
  const event = { kind: 'rush', mechanism: 'rush', pts: 0.7 };
  const filter = { group: 'offense', types: [], positions: ['RB'] };
  assert.equal(matchesFeedFilter(event, filter, { position: 'RB' }), true);
  assert.equal(matchesFeedFilter(event, filter, { position: 'WR' }), false);
});

test('big plays follow the league threshold rather than a fixed number', () => {
  const passingTd = { kind: 'td', mechanism: 'pass', pts: 4 };
  const filter = { group: 'highlights', types: ['big'] };
  assert.equal(matchesFeedFilter(passingTd, filter, { threshold: 4 }), true);
  // The same play in a six-point league is below the bar for a "big" play.
  assert.equal(matchesFeedFilter(passingTd, filter, { threshold: 6 }), false);
});

test('negative plays are picked out by their points, not their kind', () => {
  const fumble = { kind: 'to', mechanism: 'rush', pts: -2 };
  assert.equal(matchesFeedFilter(fumble, { group: 'highlights', types: ['negative'] }), true);
  assert.equal(matchesFeedFilter(fumble, { group: 'highlights', types: ['turnover'] }), true);
  const gain = { kind: 'rush', mechanism: 'rush', pts: 0.7 };
  assert.equal(matchesFeedFilter(gain, { group: 'highlights', types: ['negative'] }), false);
});

test('special teams covers kicks and returns but not scrimmage plays', () => {
  const filter = { group: 'special', types: [] };
  assert.equal(matchesFeedFilter({ kind: 'fg', pts: 3 }, filter), true);
  assert.equal(matchesFeedFilter({ kind: 'td', mechanism: 'return', pts: 6 }, filter), true);
  assert.equal(matchesFeedFilter({ kind: 'td', mechanism: 'rush', pts: 6 }, filter), false);
});

test('toggling a value adds it then removes it', () => {
  assert.deepEqual(toggleFilterValue([], 'td'), ['td']);
  assert.deepEqual(toggleFilterValue(['td'], 'fg'), ['td', 'fg']);
  assert.deepEqual(toggleFilterValue(['td', 'fg'], 'td'), ['fg']);
});
