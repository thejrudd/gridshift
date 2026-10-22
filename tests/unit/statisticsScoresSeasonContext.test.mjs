import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMatchupRanks,
  buildPlayerSeasonCard,
  buildRecentForm,
  buildSeasonLeaders,
  buildSeasonStatGroups,
  buildSeasonStatLookup,
  seasonRecord,
} from '../../src/utils/statisticsScoresSeasonContext.js';

// The shape of /api/statistics/teams/season (server/teamSeasonHandlers.js).
const teamLine = (overrides = {}) => ({
  total_yards: 350, net_passing_yards: 230, rushing_yards: 120, yards_per_play: 5.5, total_offensive_plays: 64,
  first_downs: 20, sacks: 2, turnovers: 1, third_down_conversions: 5, third_down_attempts: 12,
  fourth_down_conversions: 1, fourth_down_attempts: 2, red_zone_scores: 2, red_zone_attempts: 3,
  penalties: 6, penalty_yards: 50, possession_time_seconds: 1800, ...overrides,
});
const ranks = (team, pairs) => Object.entries(pairs).map(([key, r]) => ({ key, vals: [{ t: team, r }] }));

const KC = {
  standings: [{ t: 'KC', w: 2, l: 1, tie: 0 }],
  ranks: ranks('KC', { pts: 5, pass: 9, rush: 3, ptsA: 22, passA: 6, yds: 2 }),
  games: [
    { id: 11, week: 1, home: true, opp: 'DEN', pf: 31, pa: 10, ts: { me: teamLine({ total_yards: 392 }), opp: teamLine() },
      lines: [{ id: 1, n: 'Patrick Mahomes', pos: 'QB', passing_yards: 250, passing_completions: 20, passing_attempts: 30, passing_touchdowns: 2, passing_interceptions: 0 },
        { id: 2, n: 'Chris Jones', pos: 'DT', defensive_sacks: 1, tackles_for_loss: 1, total_tackles: 3 }] },
    { id: 12, week: 2, home: false, opp: 'IND', pf: 20, pa: 23, ts: { me: teamLine({ total_yards: 300 }), opp: teamLine() },
      lines: [{ id: 1, n: 'Patrick Mahomes', pos: 'QB', passing_yards: 300, passing_completions: 25, passing_attempts: 35, passing_touchdowns: 1, passing_interceptions: 1 }] },
    { id: 13, week: 4, home: true, opp: 'LV', pf: 30, pa: 27, ts: { me: teamLine({ total_yards: 399 }), opp: teamLine() }, lines: [] },
    { id: 14, week: 6, home: true, opp: 'LAC' }, // scheduled: no score yet
  ],
};
const LAC = {
  standings: [{ t: 'LAC', w: 0, l: 3, tie: 0 }],
  ranks: ranks('LAC', { pts: 30, pass: 30, rush: 10, ptsA: 6, passA: 19, yds: 25 }),
  games: [
    { id: 21, week: 1, home: true, opp: 'ARI', pf: 14, pa: 26, ts: { me: teamLine({ total_yards: 268 }), opp: teamLine() },
      lines: [{ id: 9, n: 'Justin Herbert', pos: 'QB', passing_yards: 200, passing_completions: 18, passing_attempts: 30, passing_touchdowns: 1, passing_interceptions: 2 }] },
  ],
};
const INPUT = { away: 'LAC', home: 'KC', awaySeason: LAC, homeSeason: KC };

test('records come from the standings', () => {
  assert.equal(seasonRecord(KC, 'KC'), '2-1');
  assert.equal(seasonRecord(LAC, 'LAC'), '0-3');
});

test('matchup ranks pair each offense with the matching defense, away always left', () => {
  const [chargersBall, chiefsBall] = buildMatchupRanks(INPUT);
  assert.equal(chargersBall.offense, 'LAC');
  const scoring = chargersBall.rows.find((row) => row.id === 'pts');
  assert.deepEqual(scoring.away, { label: 'Scoring offense', rank: 30 });
  assert.deepEqual(scoring.home, { label: 'Scoring defense', rank: 22 });
  const passing = chiefsBall.rows.find((row) => row.id === 'pass');
  assert.deepEqual(passing.away, { label: 'Pass defense', rank: 19 });
  assert.deepEqual(passing.home, { label: 'Passing offense', rank: 9 });
});

test('recent form lists finished games oldest first and skips the unplayed one', () => {
  assert.deepEqual(buildRecentForm(KC).map((game) => `${game.week}${game.result}`), ['1W', '2L', '4W']);
});

test('season leaders sum each player across games', () => {
  const offense = buildSeasonLeaders(INPUT).find((group) => group.unit === 'Offense');
  const quarterbacks = offense.rows.find((row) => row.pos === 'QB');
  assert.equal(quarterbacks.home.name, 'Patrick Mahomes');
  assert.equal(quarterbacks.home.value, 550);
  assert.equal(quarterbacks.home.line, '45/65 · 550 yds · 3 TD · 1 INT');
  assert.equal(quarterbacks.away.name, 'Justin Herbert');
  const defense = buildSeasonLeaders(INPUT).find((group) => group.unit === 'Defense');
  assert.equal(defense.rows.find((row) => row.pos === 'DL').home.line, '1 sack · 1 TFL · 3 tkl');
});

test('season Team Stats rows average the finished games and carry ranks and logs', () => {
  const offense = buildSeasonStatGroups(INPUT).find((group) => group.id === 'offense');
  const total = offense.stats.find((stat) => stat.label === 'Total yards');
  assert.equal(total.home, '363.7');
  assert.equal(total.away, '268.0');
  assert.deepEqual(total.season.ranks, { LAC: 25, KC: 2 });
  assert.deepEqual(total.season.logs.KC.map((game) => [game.week, game.display]), [[1, '392'], [2, '300'], [4, '399']]);
  const firstDowns = offense.stats.find((stat) => stat.label === 'First downs');
  assert.deepEqual(firstDowns.season.ranks, { LAC: null, KC: null });
  const third = buildSeasonStatGroups(INPUT).find((group) => group.id === 'situational').stats.find((stat) => stat.label === 'Third down');
  assert.equal(third.home, '42%');
  assert.equal(third.season.logs.KC[0].display, '5–12');
});

test('no finished games means no season rows', () => {
  assert.deepEqual(buildSeasonStatGroups({ away: 'LAC', home: 'KC', awaySeason: { games: [] }, homeSeason: { games: [] } }), []);
});

test('a live game\'s season lookup leaves the game itself out of the average', () => {
  const lookup = buildSeasonStatLookup(INPUT, { excludeGameId: 13 });
  // KC without week 4 (399): (392 + 300) / 2.
  assert.deepEqual(lookup.get('Total yards').KC, { average: '346.0', rank: 2 });
  assert.equal(lookup.get('Total yards').LAC.average, '268.0');
});

test('a player card lists the season tiles and a newest-first game log', () => {
  const card = buildPlayerSeasonCard(KC, 1);
  assert.equal(card.name, 'Patrick Mahomes');
  assert.equal(card.games, 2);
  assert.deepEqual(card.tiles.map((tile) => tile.value), ['550', '3', '1', '69%']);
  assert.deepEqual(card.columns, ['C/ATT', 'YDS', 'TD', 'INT', 'RUSH']);
  assert.deepEqual(card.log.map((game) => [game.week, game.result, game.values[0]]), [[2, 'L', '25/35'], [1, 'W', '20/30']]);
  assert.equal(buildPlayerSeasonCard(KC, 999), null);
});

test('ranks and records match a team the season route spells differently', () => {
  // The score feed says WSH; the season route says WAS.
  const WAS = { standings: [{ t: 'WAS', w: 1, l: 4, tie: 1 }], ranks: ranks('WAS', { pts: 20, ptsA: 4 }), games: [] };
  assert.equal(seasonRecord(WAS, 'WSH'), '1-4-1');
  const [washingtonBall] = buildMatchupRanks({ away: 'WSH', home: 'KC', awaySeason: WAS, homeSeason: KC });
  assert.deepEqual(washingtonBall.rows.find((row) => row.id === 'pts').away, { label: 'Scoring offense', rank: 20 });
});
