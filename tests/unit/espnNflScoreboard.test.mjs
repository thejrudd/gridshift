import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NFL_SEASON_PHASES,
  fetchEspnRegularSeason,
  fetchEspnScoreboardWeek,
  normalizeEspnScoreboardEvent,
  normalizeEspnScoreboardSeason,
  overlayEspnBroadcastsWeek,
  overlayEspnScoreboardWeek,
  replaceEspnScoreboardWeek,
} from '../../src/utils/espnNflScoreboard.js';

function makeEvent({
  id = '401873271',
  date = '2026-08-07T00:00Z',
  state = 'pre',
  completed = false,
  awayScore = '0',
  homeScore = '0',
  period = state === 'in' ? 2 : 0,
  displayClock = state === 'in' ? '8:42' : '0:00',
} = {}) {
  return {
    id,
    date,
    status: {
      period,
      displayClock,
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
      situation: state === 'in' ? {
        shortDownDistanceText: '3rd & 4',
        possessionText: 'CAR 45',
        isRedZone: false,
      } : null,
      competitors: [
        {
          homeAway: 'home',
          score: homeScore,
          team: { abbreviation: 'ARI', shortDisplayName: 'Cardinals' },
          records: [{ type: 'total', summary: '0-0' }],
          timeouts: 3,
        },
        {
          homeAway: 'away',
          score: awayScore,
          team: { abbreviation: 'CAR', shortDisplayName: 'Panthers' },
          records: [{ type: 'total', summary: '0-0' }],
          timeouts: 2,
          possession: state === 'in',
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

test('formats ESPN scorebug dates on the NFL Eastern calendar', () => {
  const game = normalizeEspnScoreboardEvent(makeEvent({ date: '2026-08-14T04:30:00.000Z' }));

  assert.equal(game.slotLabel, 'Friday');
  assert.equal(game.dateLabel, 'Fri, Aug 14');
  assert.equal(game.kickoffLabel, '12:30 AM');
});

test('preserves live and final ESPN scores', () => {
  const live = normalizeEspnScoreboardEvent(makeEvent({ state: 'in', awayScore: '7', homeScore: '10' }));
  const final = normalizeEspnScoreboardEvent(makeEvent({ state: 'post', completed: true, awayScore: '21', homeScore: '17' }));

  assert.equal(live.status, 'live');
  assert.deepEqual(live.score, { away: 7, home: 10 });
  assert.deepEqual(live.live, {
    period: '2',
    clock: '8:42',
    possession: 'CAR',
    downDistance: '3rd & 4',
    fieldPosition: 'CAR 45',
    redZone: false,
    awayTimeouts: 2,
    homeTimeouts: 3,
  });
  assert.equal(final.status, 'final');
  assert.equal(final.completed, true);
  assert.deepEqual(final.score, { away: 21, home: 17 });
});

test('anchors live games from the initial ESPN season fetch', () => {
  const observedAt = Date.parse('2026-08-07T00:21:00.000Z');
  const season = normalizeEspnScoreboardSeason(
    [{ events: [makeEvent({ state: 'in' })] }],
    { season: 2026, observedAt },
  );

  assert.equal(season.weeks[0].games[0].live.providerClockAnchor.changedAt, observedAt);
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

test('normalizes regular-season weeks with regular calendar labels', () => {
  const calendar = [{
    value: '2',
    entries: [{ label: 'Week 1', alternateLabel: 'W1', detail: 'Sep 3-8' }],
  }];
  const season = normalizeEspnScoreboardSeason(
    [{ leagues: [{ calendar }], events: [makeEvent()] }],
    { season: 2026, phase: NFL_SEASON_PHASES.REGULAR },
  );

  assert.equal(season.weeks[0].id, 'reg-1');
  assert.equal(season.weeks[0].label, 'Week 1');
  assert.equal(season.weeks[0].shortLabel, 'W1');
  assert.equal(season.weeks[0].phase, NFL_SEASON_PHASES.REGULAR);
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

test('fetches all regular-season weeks from ESPN', async () => {
  const requestUrls = [];
  const season = await fetchEspnRegularSeason({
    season: 2026,
    fetcher: async (url) => {
      requestUrls.push(url);
      return { ok: true, json: async () => ({ events: [] }) };
    },
  });

  assert.equal(season.weeks.length, 18);
  assert.equal(requestUrls.length, 18);
  assert.ok(requestUrls.every((url) => url.includes('seasontype=2')));
  assert.ok(requestUrls.some((url) => url.includes('week=18')));
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

test('overlays ESPN live truth while preserving BALLDONTLIE drilldown identity', () => {
  const bdlGame = {
    id: 'bdl-7001',
    provider: 'balldontlie',
    providerGameId: '7001',
    bdlGameId: '7001',
    detailsAvailable: true,
    playByPlayAvailable: true,
    kickoff: '2026-08-07T00:20:00.000Z',
    away: { id: 'CAR', name: 'Carolina Panthers' },
    home: { id: 'ARI', name: 'Arizona Cardinals' },
    score: { away: 0, home: 0 },
    status: 'live',
  };
  const season = {
    provider: 'balldontlie',
    phase: NFL_SEASON_PHASES.PRESEASON,
    weeks: [{ id: 'pre-1', week: 1, games: [bdlGame] }],
    games: [bdlGame],
    metadata: { provider: 'balldontlie' },
  };
  const espnEvent = makeEvent({
    id: '401-live',
    state: 'in',
    awayScore: '7',
    homeScore: '10',
  });

  const providerFetchedAt = Date.parse('2026-08-07T00:21:00.000Z');
  const updated = overlayEspnScoreboardWeek(season, { events: [espnEvent] }, 1, {
    observedAt: providerFetchedAt + 2_000,
    providerFetchedAt,
  });
  const game = updated.weeks[0].games[0];

  assert.equal(game.id, 'bdl-7001');
  assert.equal(game.provider, 'balldontlie');
  assert.equal(game.providerGameId, '7001');
  assert.equal(game.bdlGameId, '7001');
  assert.equal(game.espnEventId, '401-live');
  assert.equal(game.scoreboardProvider, 'espn');
  assert.equal(game.detailsProvider, 'balldontlie');
  assert.equal(game.status, 'live');
  assert.deepEqual(game.score, { away: 7, home: 10 });
  assert.equal(game.live.clock, '8:42');
  assert.equal(game.live.providerClockAnchor.changedAt, providerFetchedAt);
  assert.equal(game.playByPlayAvailable, true);
});

test('overlays ESPN broadcast metadata without replacing BALLDONTLIE game state', () => {
  const bdlGame = {
    id: 'bdl-7001',
    provider: 'balldontlie',
    providerGameId: '7001',
    bdlGameId: '7001',
    kickoff: '2026-08-07T00:20:00.000Z',
    away: { id: 'CAR', name: 'Carolina Panthers' },
    home: { id: 'ARI', name: 'Arizona Cardinals' },
    network: 'TV TBD',
    broadcasts: [],
    score: { away: 3, home: 7 },
    status: 'live',
  };
  const season = {
    provider: 'balldontlie',
    phase: NFL_SEASON_PHASES.PRESEASON,
    weeks: [{ id: 'pre-1', week: 1, games: [bdlGame] }],
    games: [bdlGame],
    metadata: {},
  };

  const updated = overlayEspnBroadcastsWeek(season, {
    events: [makeEvent({ state: 'post', completed: true, awayScore: '21', homeScore: '17' })],
  }, 1);
  const game = updated.weeks[0].games[0];

  assert.equal(game.network, 'NBC');
  assert.deepEqual(game.broadcasts, [{ name: 'NBC' }]);
  assert.equal(game.broadcastProvider, 'espn');
  assert.equal(game.status, 'live');
  assert.deepEqual(game.score, { away: 3, home: 7 });
});

test('matches ESPN team aliases without dropping unmatched BALLDONTLIE games', () => {
  const makeBdlGame = (id, away, home) => ({
    id: `bdl-${id}`,
    provider: 'balldontlie',
    providerGameId: String(id),
    bdlGameId: String(id),
    kickoff: '2026-09-06T00:20:00.000Z',
    away: { id: away, name: away },
    home: { id: home, name: home },
    score: { away: 0, home: 0 },
    status: 'scheduled',
  });
  const washington = makeBdlGame(1, 'WAS', 'ARI');
  const unmatched = makeBdlGame(2, 'BUF', 'MIA');
  const espnEvent = makeEvent({ id: 'washington', state: 'in', awayScore: '3', homeScore: '0' });
  espnEvent.competitions[0].competitors.find((team) => team.homeAway === 'away').team.abbreviation = 'WSH';
  espnEvent.competitions[0].competitors.find((team) => team.homeAway === 'away').possession = true;
  espnEvent.competitions[0].competitors.find((team) => team.homeAway === 'home').possession = false;
  const season = {
    provider: 'balldontlie',
    phase: NFL_SEASON_PHASES.REGULAR,
    weeks: [{ id: 'reg-1', week: 1, games: [washington, unmatched] }],
    games: [washington, unmatched],
    metadata: {},
  };

  const updated = overlayEspnScoreboardWeek(season, { events: [espnEvent] }, 1);

  assert.equal(updated.weeks[0].games.length, 2);
  assert.equal(updated.weeks[0].games[0].id, 'bdl-1');
  assert.equal(updated.weeks[0].games[0].live.possession, 'WAS');
  assert.equal(updated.weeks[0].games[1], unmatched);
});
