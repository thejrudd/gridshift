import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fetchPlayerGameLogRaw } from '../../src/utils/espnPlayerFetch.js';

// A defender traded from TEN (ESPN team 10) to CHI (ESPN team 3) before week 8.
const CORE = 'http://sports.core.api.espn.com/v2/sports/football/leagues/nfl';
const GAMES = [
  ...[1, 2, 3, 4, 5, 6, 7].map((week) => ({ id: 400 + week, week, team: 10, played: true })),
  { id: 408, week: 8, team: 3, played: true },
  { id: 410, week: 10, team: 3, played: false },
];
const SCHEDULES = {
  ten: [1, 2, 3, 4, 5, 6, 7, 9, 10].map((week) => ({ id: week < 8 ? 400 + week : 500 + week, week, opp: 'NYJ' })),
  chi: [
    ...[1, 2, 3, 4, 5, 6, 7].map((week) => ({ id: 600 + week, week, opp: 'DET' })),
    { id: 408, week: 8, opp: 'GB' },
    { id: 410, week: 10, opp: 'MIN' },
  ],
};
const ABBREV = { 10: 'TEN', 3: 'CHI' };

function createFetch({ chiPlayoffs = [] } = {}) {
  const calls = [];
  const respond = (url) => {
    if (/eventlog/.test(url)) {
      return {
        events: {
          items: GAMES.map((g) => ({
            played: g.played,
            event: { $ref: `${CORE}/events/${g.id}?lang=en` },
            ...(g.played
              ? { statistics: { $ref: `${CORE}/events/${g.id}/competitions/${g.id}/competitors/${g.team}/roster/99/statistics/0` } }
              : {}),
          })),
        },
      };
    }
    let match = url.match(/\/teams\/(\d+)\?lang/);
    if (match) return { abbreviation: ABBREV[match[1]] };
    match = url.match(/teams\/(\w+)\/schedule\?season=\d+&seasontype=(\d)/);
    if (match) {
      const team = match[1].toUpperCase();
      const events = match[2] === '2' ? SCHEDULES[match[1]] : (match[1] === 'chi' ? chiPlayoffs : []);
      return {
        events: events.map((e) => ({
          id: e.id,
          week: { number: e.week },
          competitions: [{
            status: { type: { completed: true } },
            competitors: [
              { homeAway: 'home', team: { abbreviation: team }, score: '20' },
              { homeAway: 'away', team: { abbreviation: e.opp }, score: '10' },
            ],
          }],
        })),
      };
    }
    match = url.match(/events\/(\d+)\/competitions\/\d+\/competitors\/(\d+)\/roster/);
    if (match) return { splits: { categories: [{ name: 'defensive', stats: [{ name: 'totalTackles', value: Number(match[1]) }] }] } };
    return null;
  };
  const fetchImpl = async (url) => {
    calls.push(url);
    const body = respond(url);
    return { ok: body != null, status: body != null ? 200 : 404, json: async () => body };
  };
  return { fetchImpl, calls };
}

describe('player game log: mid-season trade', () => {
  it('attributes each game to the team he played it for', async () => {
    const { fetchImpl } = createFetch();
    const { games, incomplete } = await fetchPlayerGameLogRaw(fetchImpl, { playerId: '99', teamId: 'CHI', season: 2026 });
    assert.equal(incomplete, false);

    const byWeek = Object.fromEntries(games.map((g) => [g.meta.week, g]));
    assert.equal(byWeek[1].meta.myTeam, 'TEN');
    assert.equal(byWeek[7].meta.myTeam, 'TEN');
    assert.equal(byWeek[8].meta.myTeam, 'CHI');
    assert.equal(byWeek[8].meta.opponent, 'vs GB');
    assert.equal(byWeek[8].meta.result, 'W');
    assert.equal(byWeek[8].statsJson.splits.categories[0].stats[0].value, 408);
    assert.equal(byWeek[9].meta.isBye, true, 'CHI week 9 bye, not TEN week 9');
    assert.equal(byWeek[9].meta.myTeam, 'CHI');
    assert.equal(byWeek[10].meta.isInactive, true);
    assert.equal(byWeek[10].meta.opponent, 'vs MIN', 'an inactive game uses the team he was on');
    assert.deepEqual(games.map((g) => g.meta.week), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('takes postseason games from the team he finished with', async () => {
    const { fetchImpl, calls } = createFetch({ chiPlayoffs: [{ id: 701, week: 1, opp: 'LAR' }] });
    const { games } = await fetchPlayerGameLogRaw(fetchImpl, { playerId: '99', teamId: 'CHI', season: 2026 });
    const playoff = games.find((g) => g.meta.isPostseason);
    assert.equal(playoff.meta.myTeam, 'CHI');
    assert.ok(calls.some((u) => /events\/701\/competitions\/701\/competitors\/3\/roster\/99/.test(u)));
  });
});
