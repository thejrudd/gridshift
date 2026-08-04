import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NFL_SEASON_PHASES,
  fetchEspnScoreboardWeek,
  normalizeEspnScoreboardEvent,
  normalizeEspnScoreboardSeason,
  replaceEspnScoreboardWeek,
} from '../../src/utils/espnNflScoreboard.js';

function makeEvent({ id = '401873271', state = 'pre', completed = false, awayScore = '0', homeScore = '0' } = {}) {
  return {
    id,
    date: '2026-08-07T00:00Z',
    status: {
      type: {
        name: state === 'post' ? 'STATUS_FINAL' : state === 'in' ? 'STATUS_IN_PROGRESS' : 'STATUS_SCHEDULED',
        state,
        completed,
        description: state === 'post' ? 'Final' : state === 'in' ? 'In Progress' : 'Scheduled',
        shortDetail: state === 'post' ? 'Final' : state === 'in' ? '2nd · 08:42' : '8/6 - 8:00 PM EDT',
      },
    },
    competitions: [{
      neutralSite: true,
      venue: {
        fullName: 'Tom Benson Hall of Fame Stadium',
        address: { city: 'Canton', state: 'OH', country: 'USA' },
      },
      broadcasts: [{ names: ['NBC'] }],
      competitors: [
        {
          homeAway: 'home',
          score: homeScore,
          team: { abbreviation: 'ARI', shortDisplayName: 'Cardinals' },
          records: [{ type: 'total', summary: '0-0' }],
        },
        {
          homeAway: 'away',
          score: awayScore,
          team: { abbreviation: 'CAR', shortDisplayName: 'Panthers' },
          records: [{ type: 'total', summary: '0-0' }],
        },
      ],
    }],
  };
}

test('normalizes a scheduled ESPN event for schedule and scorebug consumers', () => {
  const game = normalizeEspnScoreboardEvent(makeEvent());

  assert.equal(game.id, '401873271');
  assert.equal(game.phase, NFL_SEASON_PHASES.PRESEASON);
  assert.equal(game.away.id, 'CAR');
  assert.equal(game.home.id, 'ARI');
  assert.equal(game.awayTeam, 'CAR');
  assert.equal(game.homeTeam, 'ARI');
  assert.equal(game.status, 'scheduled');
  assert.deepEqual(game.score, { away: null, home: null });
  assert.equal(game.network, 'NBC');
  assert.equal(game.neutralSite, true);
  assert.equal(game.venueCountry, 'USA');
  assert.equal(game.location, 'Tom Benson Hall of Fame Stadium, Canton, OH, USA');
});

test('preserves live and final ESPN scores', () => {
  const live = normalizeEspnScoreboardEvent(makeEvent({ state: 'in', awayScore: '7', homeScore: '10' }));
  const final = normalizeEspnScoreboardEvent(makeEvent({ state: 'post', completed: true, awayScore: '21', homeScore: '17' }));

  assert.equal(live.status, 'live');
  assert.deepEqual(live.score, { away: 7, home: 10 });
  assert.equal(final.status, 'final');
  assert.equal(final.completed, true);
  assert.deepEqual(final.score, { away: 21, home: 17 });
});

test('normalizes four preseason weeks with ESPN calendar labels', () => {
  const calendar = [{
    value: '1',
    entries: [
      { label: 'Hall of Fame Weekend', alternateLabel: 'HOF', detail: 'Aug 6-12' },
      { label: 'Preseason Week 1', alternateLabel: 'Pre Wk 1', detail: 'Aug 13-19' },
    ],
  }];
  const payloads = [
    { leagues: [{ calendar }], events: [makeEvent()] },
    { leagues: [{ calendar }], events: [] },
    { leagues: [{ calendar }], events: [] },
    { leagues: [{ calendar }], events: [] },
  ];

  const season = normalizeEspnScoreboardSeason(payloads, { season: 2026 });

  assert.equal(season.phase, 'preseason');
  assert.equal(season.weeks.length, 4);
  assert.equal(season.weeks[0].shortLabel, 'HOF');
  assert.equal(season.weeks[1].label, 'Preseason Week 1');
  assert.equal(season.metadata.totalGames, 1);
});

test('fetches a requested ESPN season type and week', async () => {
  let requestUrl = '';
  const payload = { events: [makeEvent()] };
  const result = await fetchEspnScoreboardWeek({
    season: 2026,
    week: 1,
    fetcher: async (url) => {
      requestUrl = url;
      return { ok: true, json: async () => payload };
    },
  });

  assert.equal(result, payload);
  assert.match(requestUrl, /seasontype=1/);
  assert.match(requestUrl, /week=1/);
  assert.match(requestUrl, /dates=2026/);
});

test('replaces one live week without discarding neighboring weeks', () => {
  const season = normalizeEspnScoreboardSeason([
    { events: [makeEvent({ id: 'old' })] },
    { events: [makeEvent({ id: 'neighbor' })] },
  ], { season: 2026 });

  const updated = replaceEspnScoreboardWeek(season, { events: [makeEvent({ id: 'new', state: 'in', awayScore: '7', homeScore: '3' })] }, 1);

  assert.equal(updated.weeks[0].games[0].id, 'new');
  assert.equal(updated.weeks[1].games[0].id, 'neighbor');
  assert.equal(updated.weeks[0].games[0].status, 'live');
});
