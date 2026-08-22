import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BDL_SEASON_TYPES,
  buildScoreDetailFromGame,
  groupBdlPlaysIntoDrives,
  normalizeBdlScoreboardGame,
  normalizeBdlScoreboardSeason,
  normalizeBdlScoreboardWeek,
} from '../../src/utils/balldontlieNflScoreboard.js';
import {
  NFL_SEASON_PHASES,
  normalizeEspnScoreboardSeason,
} from '../../src/utils/espnNflScoreboard.js';
import { getPlayTimeline } from '../../src/utils/nflPlays/playBeats.js';

const game = {
  id: 7001,
  visitor_team: { abbreviation: 'BAL', full_name: 'Baltimore Ravens' },
  home_team: { abbreviation: 'KC', full_name: 'Kansas City Chiefs' },
  venue: 'GEHA Field at Arrowhead Stadium',
  week: 1,
  date: '2026-09-06T00:20:00.000Z',
  status: 'Final',
  season: 2026,
  home_team_score: 27,
  visitor_team_score: 20,
  home_team_q1: 7,
  home_team_q2: 6,
  home_team_q3: 7,
  home_team_q4: 7,
  visitor_team_q1: 7,
  visitor_team_q2: 3,
  visitor_team_q3: 0,
  visitor_team_q4: 10,
};

test('normalizes BALLDONTLIE games into the scorebug contract', () => {
  const normalized = normalizeBdlScoreboardGame(game);
  assert.equal(BDL_SEASON_TYPES[NFL_SEASON_PHASES.REGULAR], 2);
  assert.equal(normalized.id, 'bdl-7001');
  assert.equal(normalized.provider, 'balldontlie');
  assert.equal(normalized.away.id, 'BAL');
  assert.equal(normalized.home.id, 'KC');
  assert.deepEqual(normalized.score, { away: 20, home: 27 });
  assert.deepEqual(normalized.quarterScores.away, [7, 3, 0, 10]);
});

test('uses BALLDONTLIE status_state and parses the live clock from status', () => {
  const live = normalizeBdlScoreboardGame({
    ...game,
    status_state: 'in_progress',
    status: '10:03 - 1st',
    visitor_team_score: 7,
    home_team_score: 10,
  });

  assert.equal(live.status, 'live');
  assert.equal(live.statusLabel, 'Q1 · 10:03');
  assert.deepEqual(live.live, {
    period: '1',
    clock: '10:03',
    possession: null,
    downDistance: null,
    fieldPosition: null,
    redZone: false,
    awayTimeouts: null,
    homeTimeouts: null,
  });
  assert.deepEqual(live.score, { away: 7, home: 10 });
});

test('normalizes halftime, final, and scheduled BALLDONTLIE states truthfully', () => {
  const halftime = normalizeBdlScoreboardGame({
    ...game,
    status_state: 'in_progress',
    status: 'Halftime',
    visitor_team_score: 14,
    home_team_score: 17,
  });
  const final = normalizeBdlScoreboardGame({
    ...game,
    status_state: 'completed',
    status: '00:00 - 4th',
  });
  const scheduled = normalizeBdlScoreboardGame({
    ...game,
    status_state: 'scheduled',
    status: '8:20 pm ET',
    visitor_team_score: 0,
    home_team_score: 0,
  });

  assert.equal(halftime.status, 'halftime');
  assert.equal(halftime.statusLabel, 'Halftime');
  assert.deepEqual(halftime.score, { away: 14, home: 17 });
  assert.equal(halftime.live, null);

  assert.equal(final.status, 'final');
  assert.equal(final.statusLabel, 'Final');
  assert.equal(final.completed, true);
  assert.deepEqual(final.score, { away: 20, home: 27 });
  assert.equal(final.live, null);

  assert.equal(scheduled.status, 'scheduled');
  assert.equal(scheduled.statusLabel, '8:20 pm ET');
  assert.deepEqual(scheduled.score, { away: null, home: null });
  assert.equal(scheduled.live, null);
});

test('creates all expected phase weeks while preserving the BDL games in their week', () => {
  const season = normalizeBdlScoreboardSeason({ data: [game] }, { season: 2026, phase: NFL_SEASON_PHASES.REGULAR });
  assert.equal(season.weeks.length, 18);
  assert.equal(season.weeks[0].games[0].providerGameId, '7001');
  assert.equal(season.weeks[17].games.length, 0);
});

test('uses server capabilities to keep unsupported detail and play-by-play non-interactive', () => {
  const gamesOnly = normalizeBdlScoreboardSeason({
    data: [game],
    capabilities: { games: true, stats: false, teamStats: false, plays: false },
  }, { season: 2026, phase: NFL_SEASON_PHASES.REGULAR });
  const fullDetail = normalizeBdlScoreboardSeason({
    data: [game],
    capabilities: { games: true, stats: true, teamStats: true, plays: true },
  }, { season: 2026, phase: NFL_SEASON_PHASES.REGULAR });

  assert.equal(gamesOnly.weeks[0].games[0].detailsAvailable, false);
  assert.equal(gamesOnly.weeks[0].games[0].playByPlayAvailable, false);
  assert.equal(fullDetail.weeks[0].games[0].detailsAvailable, true);
  assert.equal(fullDetail.weeks[0].games[0].playByPlayAvailable, true);
});

test('keeps the preseason Hall of Fame CAR–ARI game in the first preseason slate', () => {
  const season = normalizeBdlScoreboardSeason({ games: [{
    id: 7002,
    visitor_team: { abbreviation: 'CAR', full_name: 'Carolina Panthers' },
    home_team: { abbreviation: 'ARI', full_name: 'Arizona Cardinals' },
    venue: 'Tom Benson Hall of Fame Stadium',
    date: '2026-08-06T23:00:00.000Z',
    status: '8:00 pm ET',
    postseason: false,
    visitor_team_score: 0,
    home_team_score: 0,
  }] }, { season: 2026, phase: NFL_SEASON_PHASES.PRESEASON });

  assert.equal(season.weeks.length, 4);
  assert.equal(season.weeks[0].shortLabel, 'HOF');
  assert.equal(season.weeks[0].games[0].away.id, 'CAR');
  assert.equal(season.weeks[0].games[0].home.id, 'ARI');
});

test('excludes January regular-season games from preseason even when UTC dates render in December locally', () => {
  const januaryRegularGames = [
    {
      ...game,
      id: 7101,
      date: '2027-01-01T00:30:00.000Z',
      week: 17,
      postseason: false,
    },
    {
      ...game,
      id: 7102,
      date: '2027-01-03T00:30:00.000Z',
      week: 17,
      postseason: false,
    },
  ];
  const season = normalizeBdlScoreboardSeason(
    { games: januaryRegularGames },
    { season: 2026, phase: NFL_SEASON_PHASES.PRESEASON },
  );

  assert.equal(season.metadata.totalGames, 0);
  assert.ok(season.weeks.every((week) => week.games.length === 0));
});

test('honors numeric BALLDONTLIE season types before using date inference', () => {
  const preseason = normalizeBdlScoreboardSeason({ games: [{
    ...game,
    id: 7201,
    date: '2026-06-30T23:00:00.000Z',
    season_type: 1,
  }] }, { season: 2026, phase: NFL_SEASON_PHASES.PRESEASON });
  const regular = normalizeBdlScoreboardSeason({ games: [{
    ...game,
    id: 7202,
    date: '2026-08-15T23:00:00.000Z',
    season_type: 2,
  }] }, { season: 2026, phase: NFL_SEASON_PHASES.REGULAR });

  assert.equal(preseason.metadata.totalGames, 1);
  assert.equal(regular.metadata.totalGames, 1);
});

test('keeps postseason games out of both preseason and regular-season boards', () => {
  const playoff = { ...game, id: 7301, date: '2027-01-16T01:00:00.000Z', postseason: true };

  const preseason = normalizeBdlScoreboardSeason(
    { games: [playoff] },
    { season: 2026, phase: NFL_SEASON_PHASES.PRESEASON },
  );
  const regular = normalizeBdlScoreboardSeason(
    { games: [playoff] },
    { season: 2026, phase: NFL_SEASON_PHASES.REGULAR },
  );

  assert.equal(preseason.metadata.totalGames, 0);
  assert.equal(regular.metadata.totalGames, 0);
});

test('separates HOF and Preseason Week 1 by date and venue when raw week values collide', () => {
  const season = normalizeBdlScoreboardSeason({ games: [
    {
      ...game,
      id: 7401,
      date: '2026-08-07T00:00:00.000Z',
      venue: 'Tom Benson Hall of Fame Stadium',
      week: 1,
      postseason: false,
    },
    {
      ...game,
      id: 7402,
      date: '2026-08-14T00:00:00.000Z',
      venue: 'Gillette Stadium',
      week: 1,
      postseason: false,
    },
  ] }, { season: 2026, phase: NFL_SEASON_PHASES.PRESEASON });

  assert.deepEqual(season.weeks[0].games.map((entry) => entry.providerGameId), ['7401']);
  assert.deepEqual(season.weeks[1].games.map((entry) => entry.providerGameId), ['7402']);
  assert.equal(season.weeks[0].label, 'Hall of Fame Weekend');
  assert.equal(season.weeks[1].label, 'Preseason Week 1');
});

test('keeps week selection aligned when a partial payload uses raw week one for both preseason slates', () => {
  const payload = { games: [
    {
      ...game,
      id: 7403,
      date: '2026-08-07T00:00:00.000Z',
      venue: 'Tom Benson Hall of Fame Stadium',
      week: 1,
      postseason: false,
    },
    {
      ...game,
      id: 7404,
      date: '2026-08-14T00:00:00.000Z',
      venue: 'Gillette Stadium',
      week: 1,
      postseason: false,
    },
  ] };

  const hof = normalizeBdlScoreboardWeek(payload, {
    season: 2026,
    phase: NFL_SEASON_PHASES.PRESEASON,
    week: 1,
  });
  const ordinary = normalizeBdlScoreboardWeek(payload, {
    season: 2026,
    phase: NFL_SEASON_PHASES.PRESEASON,
    week: 2,
  });

  assert.deepEqual(hof.games.map((entry) => entry.providerGameId), ['7403']);
  assert.deepEqual(ordinary.games.map((entry) => entry.providerGameId), ['7404']);
});

test('labels the first ordinary preseason slate Week 1 when no HOF game is present', () => {
  const payload = { games: [{
    ...game,
    id: 7501,
    date: '2026-08-14T00:00:00.000Z',
    venue: 'Gillette Stadium',
    week: 2,
    postseason: false,
  }] };
  const season = normalizeBdlScoreboardSeason(payload, {
    season: 2026,
    phase: NFL_SEASON_PHASES.PRESEASON,
  });
  const week = normalizeBdlScoreboardWeek(payload, {
    season: 2026,
    phase: NFL_SEASON_PHASES.PRESEASON,
    week: 2,
  });

  assert.equal(season.weeks[0].games.length, 0);
  assert.equal(season.weeks[1].games[0].providerGameId, '7501');
  assert.equal(week.label, 'Preseason Week 1');
  assert.equal(week.games[0].providerGameId, '7501');
});

test('does not re-bucket a partial preseason live payload into the requested week', () => {
  const payload = {
    games: [{
      ...game,
      id: 7502,
      date: '2026-08-21T23:00:00.000Z',
      week: 3,
      season_type: 1,
      status_state: 'in_progress',
      status: '12:27 - 1st',
    }],
  };

  const weekTwo = normalizeBdlScoreboardWeek(payload, {
    season: 2026,
    phase: NFL_SEASON_PHASES.PRESEASON,
    week: 2,
  });
  const weekThree = normalizeBdlScoreboardWeek(payload, {
    season: 2026,
    phase: NFL_SEASON_PHASES.PRESEASON,
    week: 3,
  });

  assert.equal(weekTwo.games.length, 0);
  assert.equal(weekThree.games[0].providerGameId, '7502');
});

test('rejects December and January regular-season rows from an unknown-phase preseason payload', () => {
  const makeGame = (id, date, week) => ({
    id,
    visitor_team: { abbreviation: 'CAR', full_name: 'Carolina Panthers' },
    home_team: { abbreviation: 'ARI', full_name: 'Arizona Cardinals' },
    date,
    week,
    status: 'Final',
    postseason: false,
    visitor_team_score: 20,
    home_team_score: 17,
  });
  const season = normalizeBdlScoreboardSeason({ games: [
    makeGame(7101, '2026-08-06T23:00:00.000Z', 1),
    makeGame(7102, '2026-12-20T18:00:00.000Z', 16),
    makeGame(7103, '2027-01-03T18:00:00.000Z', 18),
  ] }, { season: 2026, phase: NFL_SEASON_PHASES.PRESEASON });

  assert.deepEqual(season.games.map((entry) => entry.providerGameId), ['7101']);
  assert.equal(season.metadata.totalGames, 1);
});

test('keeps BALLDONTLIE preseason week labels aligned with the ESPN calendar contract', () => {
  const calendar = [{
    value: '1',
    entries: [
      { label: 'Hall of Fame Weekend', alternateLabel: 'HOF' },
      { label: 'Preseason Week 1', alternateLabel: 'Pre Wk 1' },
      { label: 'Preseason Week 2', alternateLabel: 'Pre Wk 2' },
      { label: 'Preseason Week 3', alternateLabel: 'Pre Wk 3' },
    ],
  }];
  const espnSeason = normalizeEspnScoreboardSeason(
    Array.from({ length: 4 }, () => ({ leagues: [{ calendar }], events: [] })),
    { season: 2026, phase: NFL_SEASON_PHASES.PRESEASON },
  );
  const bdlSeason = normalizeBdlScoreboardSeason(
    { games: [] },
    { season: 2026, phase: NFL_SEASON_PHASES.PRESEASON },
  );
  const labels = (season) => season.weeks.map(({ label, shortLabel }) => ({ label, shortLabel }));

  assert.deepEqual(labels(bdlSeason), labels(espnSeason));
});

test('derives a drive-style display grouping from individual BDL plays', () => {
  const plays = [
    {
      id: 'p1', text: 'Rush for 5 yards.', period: 1, clock_display: '12:00',
      team: { abbreviation: 'BAL' }, scoring_play: false, wallclock: '2026-09-06T00:30:00.000Z',
      away_score: 0, home_score: 0,
    },
    {
      id: 'p2', text: 'Touchdown.', period: 1, clock_display: '10:00',
      team: { abbreviation: 'BAL' }, scoring_play: true, wallclock: '2026-09-06T00:32:00.000Z',
      away_score: 6, home_score: 0,
    },
    {
      id: 'p3', text: 'Pass complete.', period: 1, clock_display: '09:00',
      team: { abbreviation: 'KC' }, scoring_play: false, wallclock: '2026-09-06T00:34:00.000Z',
      away_score: 6, home_score: 0,
    },
  ];
  const normalizedGame = normalizeBdlScoreboardGame(game);
  const drives = groupBdlPlaysIntoDrives(plays, normalizedGame);
  assert.equal(drives.length, 2);
  assert.equal(drives[0].plays.length, 2);
  assert.equal(drives[0].result, 'Touchdown');
  assert.equal(drives[1].team, 'KC');
});

test('normalizes reverse-ordered BDL play payloads before deriving the latest play', () => {
  const normalizedGame = normalizeBdlScoreboardGame(game);
  const plays = [
    {
      id: 'early', text: 'Early drive play.', period: 2, clock_display: '01:47',
      team: { abbreviation: 'IND' }, scoring_play: false, wallclock: '2026-08-14T01:00:00.000Z',
    },
    {
      id: 'late', text: 'Late drive play.', period: 2, clock_display: '00:13',
      team: { abbreviation: 'IND' }, scoring_play: false, wallclock: null,
    },
    {
      id: 'latest-drive', text: 'Latest drive play.', period: 2, clock_display: '00:05',
      team: { abbreviation: 'NE' }, scoring_play: false, wallclock: '2026-08-14T01:02:00.000Z',
    },
  ];

  const drives = groupBdlPlaysIntoDrives([...plays].reverse(), normalizedGame);

  assert.deepEqual(drives[0].plays.map((play) => play.id), ['early', 'late']);
  assert.equal(drives.at(-1).plays.at(-1).id, 'latest-drive');
});

test('removes provider period markers before grouping BDL plays into drives', () => {
  const normalizedGame = normalizeBdlScoreboardGame(game);
  const drives = groupBdlPlaysIntoDrives([
    { id: 'real-1', text: 'Rush for 4 yards.', period: 4, clock_display: '0:25', team: { abbreviation: 'BAL' } },
    { id: 'real-2', text: 'Quarterback kneels.', period: 4, clock_display: '0:16', team: { abbreviation: 'BAL' } },
    { id: 'q1', text: 'END QUARTER 1', period: 1, clock_display: '0:00' },
    { id: 'half', type_text: 'End of Half', period: 2, clock_display: '0:00' },
    { id: 'q3', text: 'END OF QUARTER 3', period: 3, clock_display: '0:00' },
    { id: 'game-end', text: 'END GAME', period: 4, clock_display: '0:00' },
  ], normalizedGame);

  assert.equal(drives.length, 1);
  assert.equal(drives[0].summary, '2 plays');
  assert.deepEqual(drives[0].plays.map((play) => play.id), ['real-1', 'real-2']);
  assert.equal(drives[0].plays.some((play) => /END/i.test(play.description)), false);
});

test('describes a final game that the provider ends at the two-minute warning', () => {
  const normalizedGame = normalizeBdlScoreboardGame(game);
  const terminalAt = '2026-08-22T02:26:29.000Z';
  const earlyEnding = buildScoreDetailFromGame(normalizedGame, {
    providerDetail: { plays: [
      {
        id: 'last-snap', text: 'Rush for 3 yards.', type_slug: 'rush', period: 4,
        clock_display: '2:30', wallclock: '2026-08-22T02:25:50.000Z', team: { abbreviation: 'BAL' },
      },
      {
        id: 'warning', text: 'Two-Minute Warning', type_slug: 'two-minute-warning', period: 4,
        clock_display: '2:00', wallclock: terminalAt, team: { abbreviation: 'BAL' },
      },
      {
        id: 'game-end', text: 'END GAME', type_slug: 'end-of-game', period: 4,
        clock_display: '0:00', wallclock: terminalAt,
      },
    ] },
    detailStatus: 'ready',
  });
  assert.deepEqual(earlyEnding.terminal, {
    kind: 'ended-with-time-remaining',
    clock: '2:00',
  });

  const ordinaryEnding = buildScoreDetailFromGame(normalizedGame, {
    providerDetail: { plays: [
      {
        id: 'kneel', text: 'Quarterback kneels.', type_slug: 'rush', period: 4,
        clock_display: '0:16', wallclock: '2026-09-06T03:29:44.000Z', team: { abbreviation: 'BAL' },
      },
      {
        id: 'game-end', text: 'END GAME', type_slug: 'end-of-game', period: 4,
        clock_display: '0:00', wallclock: '2026-09-06T03:29:44.000Z',
      },
    ] },
    detailStatus: 'ready',
  });
  assert.equal(ordinaryEnding.terminal, null);
});

test('keeps provider coverage explicit when BDL plays are unavailable', () => {
  const normalizedGame = normalizeBdlScoreboardGame(game);
  const detail = buildScoreDetailFromGame(normalizedGame, { playsStatus: 'error', playsError: 'Unauthorized' });
  assert.equal(detail.coverage.scoreboard, true);
  assert.equal(detail.coverage.plays, false);
  assert.equal(detail.coverage.playsStatus, 'error');
  assert.equal(detail.coverage.teamStats, false);
});

test('builds the real drilldown contract from BALLDONTLIE team, player, and play detail', () => {
  const normalizedGame = normalizeBdlScoreboardGame({
    ...game,
    status_state: 'completed',
    visitor_team_q1: null,
    visitor_team_q2: 10,
    visitor_team_q3: 0,
    visitor_team_q4: 10,
  });
  const player = (firstName, lastName, team, values) => ({
    player: { first_name: firstName, last_name: lastName },
    team: { abbreviation: team },
    ...values,
  });
  const providerDetail = {
    game: {
      ...game,
      visitor_team_q1: null,
      visitor_team_q2: 10,
      visitor_team_q3: 0,
      visitor_team_q4: 10,
    },
    teamStats: [
      {
        team: { abbreviation: 'BAL' }, total_yards: 355, net_passing_yards: 250,
        rushing_yards: 105, yards_per_play: 5.9, first_downs: 21,
        third_down_conversions: 5, third_down_attempts: 11,
        fourth_down_conversions: 1, fourth_down_attempts: 1,
        red_zone_scores: 2, red_zone_attempts: 3, turnovers: 1,
        penalties: 4, penalty_yards: 35, possession_time: '31:10',
        possession_time_seconds: 1870, total_offensive_plays: 60,
      },
      {
        team: { abbreviation: 'KC' }, total_yards: 330, net_passing_yards: 240,
        rushing_yards: 90, yards_per_play: 5.4, first_downs: 19,
        third_down_conversions: 4, third_down_attempts: 10,
        fourth_down_conversions: 0, fourth_down_attempts: 1,
        red_zone_scores: 3, red_zone_attempts: 4, turnovers: 2,
        penalties: 7, penalty_yards: 58, possession_time: '28:50',
        possession_time_seconds: 1730, total_offensive_plays: 61,
      },
    ],
    playerStats: [
      player('Lamar', 'Jackson', 'BAL', {
        passing_completions: 20, passing_attempts: 29, passing_yards: 250,
        passing_touchdowns: 2, passing_interceptions: 1, qb_rating: 104.2,
        rushing_attempts: 8, rushing_yards: 55, yards_per_rush_attempt: 6.9,
      }),
      player('Patrick', 'Mahomes', 'KC', {
        passing_completions: 22, passing_attempts: 34, passing_yards: 240,
        passing_touchdowns: 2, passing_interceptions: 2, qb_rating: 86.4,
      }),
      player('Derrick', 'Henry', 'BAL', {
        rushing_attempts: 16, rushing_yards: 80, yards_per_rush_attempt: 5,
        rushing_touchdowns: 1, long_rushing: 18,
      }),
      player('Zay', 'Flowers', 'BAL', {
        receptions: 7, receiving_targets: 9, receiving_yards: 96,
        yards_per_reception: 13.7, receiving_touchdowns: 1,
      }),
      player('Travis', 'Kelce', 'KC', {
        receptions: 6, receiving_targets: 8, receiving_yards: 88,
        yards_per_reception: 14.7, receiving_touchdowns: 1,
      }),
      player('Roquan', 'Smith', 'BAL', {
        total_tackles: 9, solo_tackles: 6, defensive_sacks: 1,
        tackles_for_loss: 2, passes_defended: 1,
      }),
      player('Chris', 'Jones', 'KC', { defensive_sacks: 2 }),
      player('Justin', 'Tucker', 'BAL', {
        field_goals_made: 2, field_goal_attempts: 2, long_field_goal_made: 48,
        extra_points_made: 2, total_points: 8,
      }),
    ],
    plays: [
      {
        id: 'detail-p1', text: 'Pass complete for 12 yards.', period: 1,
        clock_display: '12:00', team: { abbreviation: 'BAL' }, scoring_play: false,
        start_down: 1, start_distance: 10, start_possession_text: 'BAL 25',
        away_score: 0, home_score: 0,
      },
      {
        id: 'detail-p2', text: 'Touchdown pass.', type_text: 'Passing Touchdown', period: 1,
        clock_display: '10:00', team: { abbreviation: 'BAL' }, scoring_play: true,
        start_down: 2, start_distance: 4, start_possession_text: 'KC 8',
        away_score: 7, home_score: 0,
      },
    ],
    cache: { hit: false },
  };

  const detail = buildScoreDetailFromGame(normalizedGame, {
    providerDetail,
    detailStatus: 'ready',
  });

  assert.deepEqual(detail.quarterLabels, ['1', '2', '3', '4', 'T']);
  assert.deepEqual(detail.lineScore.away, [0, 10, 0, 10, 20]);
  assert.deepEqual(detail.lineScore.home, [7, 6, 7, 7, 27]);
  assert.equal(detail.leaders.find((entry) => entry.label === 'Passing').away, 'L. Jackson · 250 YDS, 2 TD');
  assert.deepEqual(detail.playerGroups.find((entry) => entry.id === 'passing').columns, ['C/ATT', 'YDS', 'TD', 'INT', 'RTG']);
  assert.deepEqual(detail.playerGroups.find((entry) => entry.id === 'passing').rows[0].values, ['20/29', '250', '2', '1', '104.2']);
  assert.equal(detail.statGroups.find((entry) => entry.id === 'defense').stats.find((entry) => entry.label === 'Passing yards allowed').away, 240);
  assert.equal(detail.statGroups.find((entry) => entry.id === 'defense').stats.find((entry) => entry.label === 'Sacks').home, 2);
  assert.equal(detail.scoring[0].quarter, '1st');
  assert.equal(detail.drives[0].result, 'Touchdown');
  assert.equal(detail.coverage.teamStats, true);
  assert.equal(detail.coverage.playerStats, true);
  assert.equal(detail.coverage.plays, true);
});

test('preserves provider play order when wallclock timestamps are absent', () => {
  const normalizedGame = normalizeBdlScoreboardGame(game);
  const plays = [
    { id: 'first', text: 'First provider row.', team: { abbreviation: 'BAL' }, period: 1, clock_display: '15:00' },
    { id: 'second', text: 'Second provider row.', team: { abbreviation: 'BAL' }, period: 1, clock_display: '14:30', wallclock: '2026-09-06T00:30:00.000Z' },
  ];

  assert.deepEqual(groupBdlPlaysIntoDrives(plays, normalizedGame)[0].plays.map((play) => play.id), ['first', 'second']);
});

test('translates provider field coordinates into the possessing team and opponent yard line', () => {
  const normalizedGame = normalizeBdlScoreboardGame(game);
  const drives = groupBdlPlaysIntoDrives([
    { id: 'own-side', text: 'Rush.', team: { abbreviation: 'BAL' }, period: 1, start_yards_to_endzone: 71 },
    { id: 'opponent-side', text: 'Touchdown.', team: { abbreviation: 'KC' }, period: 1, start_yards_to_endzone: 4 },
  ], normalizedGame);

  assert.equal(drives[0].plays[0].spot, 'BAL 29');
  assert.equal(drives[1].plays[0].spot, 'BAL 4');
});

// ── drive boundaries ────────────────────────────────────────────────────────
//
// `team` on a BDL play names whoever holds the ball once the play is over. On
// a kick or a turnover that is the receiving team, so grouping on it filed the
// punt under the returners and opened every drive with the previous
// possession's last play.

const normalizedGame = () => normalizeBdlScoreboardGame(game); // BAL at KC

test('a punt ends the punting team’s drive instead of opening the returners’', () => {
  const drives = groupBdlPlaysIntoDrives([
    { id: 'a1', text: 'L.Jackson pass short right to Z.Flowers to BAL 30 for 5 yards.', type_slug: 'pass-reception', team: { abbreviation: 'BAL' }, period: 1, clock_display: '12:00', start_down: 1, start_distance: 10 },
    { id: 'a2', text: 'D.Henry up the middle to BAL 32 for 2 yards.', type_slug: 'rush', team: { abbreviation: 'BAL' }, period: 1, clock_display: '11:20', start_down: 2, start_distance: 5 },
    // Reported under KC because KC receives it — but BAL kicked it.
    { id: 'a3', text: 'J.Stout punts 45 yards to KC 23, Center-N.Moore, fair catch by M.Hardman.', type_slug: 'punt', team: { abbreviation: 'KC' }, period: 1, clock_display: '10:35' },
    { id: 'b1', text: 'P.Mahomes pass short left to T.Kelce to KC 31 for 8 yards.', type_slug: 'pass-reception', team: { abbreviation: 'KC' }, period: 1, clock_display: '10:28', start_down: 1, start_distance: 10 },
  ], normalizedGame());

  assert.equal(drives.length, 2);
  assert.equal(drives[0].team, 'BAL');
  assert.deepEqual(drives[0].plays.map((play) => play.id), ['a1', 'a2', 'a3']);
  assert.equal(drives[0].result, 'Punt');
  assert.equal(drives[1].team, 'KC');
  assert.deepEqual(drives[1].plays.map((play) => play.id), ['b1']);
});

test('a turnover ends the drive that lost the ball', () => {
  const drives = groupBdlPlaysIntoDrives([
    { id: 'a1', text: 'L.Jackson pass short right to Z.Flowers to BAL 30 for 5 yards.', type_slug: 'pass-reception', team: { abbreviation: 'BAL' }, period: 2, clock_display: '08:00', start_down: 1, start_distance: 10 },
    { id: 'a2', text: 'L.Jackson pass deep middle intended for M.Andrews INTERCEPTED by T.McDuffie at KC 40.', type_slug: 'pass-interception-return', team: { abbreviation: 'KC' }, period: 2, clock_display: '07:20' },
    { id: 'b1', text: 'I.Pacheco right guard to KC 44 for 4 yards.', type_slug: 'rush', team: { abbreviation: 'KC' }, period: 2, clock_display: '07:12', start_down: 1, start_distance: 10 },
  ], normalizedGame());

  assert.equal(drives.length, 2);
  assert.deepEqual(drives[0].plays.map((play) => play.id), ['a1', 'a2']);
  assert.equal(drives[0].result, 'Interception');
  assert.equal(drives[1].team, 'KC');
});

test('a summary-only pick-six inherits its passer from the same Statistics drive', () => {
  const drives = groupBdlPlaysIntoDrives([
    {
      id: '401873286469', period: 1, clock_display: '8:18', type_slug: 'interception-return-touchdown',
      type_text: 'Interception Return Touchdown', team: { abbreviation: 'HOU' },
      short_text: "Wade Woodaz 80 Yd Interception Return (Ka'imi Fairbairn Kick)",
      text: "Wade Woodaz 80 Yd Interception Return (Ka'imi Fairbairn Kick)",
      start_down: 1, start_distance: 10, start_yard_line: 24, end_yard_line: 100,
      start_yards_to_endzone: 24, end_yards_to_endzone: 0, stat_yardage: 80, scoring_play: true,
    },
    {
      id: '401873286447', period: 1, clock_display: '9:16', type_slug: 'rush',
      team: { abbreviation: 'LV' }, short_text: 'Mike Washington Jr. 33 Yd Rush',
      text: 'M.Washington up the middle to HST 24 for 33 yards (J.Smith).', stat_yardage: 33,
    },
    {
      id: '401873286422', period: 1, clock_display: '9:56', type_slug: 'pass-reception',
      team: { abbreviation: 'LV' }, short_text: 'Fernando Mendoza Pass Complete for 22 Yds to Jalen Nailor',
      text: '(Shotgun) F.Mendoza pass short right to J.Nailor to LV 43 for 22 yards (J.Reed).', stat_yardage: 22,
    },
  ], { away: { id: 'LV' }, home: { id: 'HOU' } });
  const pickSix = drives.flatMap((drive) => drive.plays)
    .find((play) => play.id === '401873286469');

  assert.equal(pickSix.inferredPasserName, 'Fernando Mendoza');
  const timeline = getPlayTimeline(pickSix, { homeTeam: 'HOU', awayTeam: 'LV' });
  assert.match(timeline.beats.find((beat) => beat.role === 'passer')?.text ?? '', /^Fernando Mendoza drops back/);
  assert.match(timeline.beats.find((beat) => beat.kind === 'release')?.text ?? '', /^Fernando Mendoza throws/);
});

test('a missed field goal ends the kicking team’s drive and is not called a make', () => {
  const drives = groupBdlPlaysIntoDrives([
    { id: 'a1', text: 'D.Henry up the middle to KC 20 for 3 yards.', type_slug: 'rush', team: { abbreviation: 'BAL' }, period: 3, clock_display: '05:00', start_down: 3, start_distance: 8 },
    { id: 'a2', text: 'J.Tucker 41 yard field goal is No Good, Wide Right, Center-N.Moore.', type_slug: 'field-goal-missed', team: { abbreviation: 'KC' }, period: 3, clock_display: '04:20' },
    { id: 'b1', text: 'P.Mahomes kneels.', type_slug: 'rush', team: { abbreviation: 'KC' }, period: 3, clock_display: '04:12', start_down: 1, start_distance: 10 },
  ], normalizedGame());

  assert.deepEqual(drives[0].plays.map((play) => play.id), ['a1', 'a2']);
  assert.equal(drives[0].team, 'BAL');
  assert.equal(drives[0].result, 'Missed FG');
});

test('the kickoff that opens a half does not stand as a drive of its own', () => {
  const drives = groupBdlPlaysIntoDrives([
    { id: 'k', text: 'H.Butker kicks 65 yards from KC 35 to end zone, Touchback.', type_slug: 'kickoff', team: { abbreviation: 'BAL' }, period: 1, clock_display: '15:00' },
    { id: 'a1', text: 'D.Henry up the middle to BAL 28 for 3 yards.', type_slug: 'rush', team: { abbreviation: 'BAL' }, period: 1, clock_display: '14:55', start_down: 1, start_distance: 10 },
  ], normalizedGame());

  assert.equal(drives.length, 1);
  assert.equal(drives[0].team, 'BAL');
  assert.deepEqual(drives[0].plays.map((play) => play.id), ['k', 'a1']);
});

test('a drive counts the offense’s plays, not clock stoppages or the ensuing kickoff', () => {
  const drives = groupBdlPlaysIntoDrives([
    { id: 'a1', text: 'D.Henry up the middle to KC 8 for 3 yards.', type_slug: 'rush', team: { abbreviation: 'BAL' }, period: 1, clock_display: '09:00', start_down: 1, start_distance: 10 },
    { id: 'a2', text: 'D.Henry up the middle for 8 yards, TOUCHDOWN.', type_slug: 'rushing-touchdown', team: { abbreviation: 'BAL' }, period: 1, clock_display: '08:30', scoring_play: true, away_score: 7, home_score: 0 },
    { id: 'to', text: 'Official Timeout at 08:30.', type_slug: 'official-timeout', team: { abbreviation: 'BAL' }, period: 1, clock_display: '08:30' },
    { id: 'ko', text: 'J.Tucker kicks 65 yards from BAL 35 to end zone, Touchback.', type_slug: 'kickoff', team: { abbreviation: 'KC' }, period: 1, clock_display: '08:30' },
  ], normalizedGame());

  assert.equal(drives.length, 1);
  assert.equal(drives[0].plays.length, 4, 'the stoppage and the kickoff stay in the play list');
  assert.equal(drives[0].playCount, 2, 'but only the offense’s snaps are counted');
  assert.equal(drives[0].summary, '2 plays');
  assert.equal(drives[0].result, 'Touchdown');
});

test('only a drive that scored carries a score', () => {
  // Every play reports the running score, so taking the latest one marked
  // every drive as a scoring drive and underlined all of them.
  const drives = groupBdlPlaysIntoDrives([
    { id: 'a1', text: 'D.Henry up the middle to BAL 30 for 3 yards.', type_slug: 'rush', team: { abbreviation: 'BAL' }, period: 1, clock_display: '09:00', start_down: 1, start_distance: 10, away_score: 7, home_score: 3 },
    { id: 'a2', text: 'J.Stout punts 45 yards to KC 23, fair catch.', type_slug: 'punt', team: { abbreviation: 'KC' }, period: 1, clock_display: '08:20', away_score: 7, home_score: 3 },
    { id: 'b1', text: 'P.Mahomes pass short left to T.Kelce for 12 yards, TOUCHDOWN.', type_slug: 'passing-touchdown', team: { abbreviation: 'KC' }, period: 1, clock_display: '07:40', scoring_play: true, away_score: 7, home_score: 10 },
  ], normalizedGame());

  assert.equal(drives[0].score, '');
  assert.ok(drives[1].score, 'the scoring drive keeps its score');
});

test('halftime breaks the drive even when the same offense is on both sides of it', () => {
  // The provider's end-of-half marker is filtered out before grouping, so
  // without a period check the second-half kickoff lands at the end of that
  // team's last first-half possession.
  const drives = groupBdlPlaysIntoDrives([
    { id: 'q2a', text: 'L.Jackson scrambles left end to BAL 35 for 1 yard.', type_slug: 'rush', team: { abbreviation: 'BAL' }, period: 2, clock_display: '00:12', start_down: 2, start_distance: 9 },
    { id: 'q3k', text: 'J.Tucker kicks 63 yards from BAL 35 to KC 2.', type_slug: 'kickoff', team: { abbreviation: 'KC' }, period: 3, clock_display: '15:00' },
    { id: 'q3a', text: 'I.Pacheco right guard to KC 30 for 4 yards.', type_slug: 'rush', team: { abbreviation: 'KC' }, period: 3, clock_display: '14:52', start_down: 1, start_distance: 10 },
  ], normalizedGame());

  assert.equal(drives.length, 2);
  assert.deepEqual(drives[0].plays.map((play) => play.id), ['q2a']);
  assert.equal(drives[0].team, 'BAL');
  // The kickoff that opens a half has no drive of its own to end, so it leads
  // into the possession that follows it.
  assert.deepEqual(drives[1].plays.map((play) => play.id), ['q3k', 'q3a']);
  assert.equal(drives[1].team, 'KC');
});

test('a drive that runs out the clock is named for the half it ended', () => {
  const endOfGame = groupBdlPlaysIntoDrives([
    { id: 'a1', text: 'J.Hurts kneels to DAL 36 for -1 yards.', type_slug: 'rush', team: { abbreviation: 'BAL' }, period: 4, clock_display: '00:40', start_down: 1, start_distance: 10 },
  ], normalizedGame());
  assert.equal(endOfGame[0].result, 'End of game');

  const endOfHalf = groupBdlPlaysIntoDrives([
    { id: 'a1', text: 'L.Jackson kneels to BAL 36 for -1 yards.', type_slug: 'rush', team: { abbreviation: 'BAL' }, period: 2, clock_display: '00:03', start_down: 1, start_distance: 10 },
  ], normalizedGame());
  assert.equal(endOfHalf[0].result, 'End of half');
});

test('a drive is named for the play it ended on, not the stoppage after it', () => {
  const drives = groupBdlPlaysIntoDrives([
    { id: 'a1', text: 'L.Jackson pass short right to Z.Flowers to BAL 30 for 5 yards.', type_slug: 'pass-reception', team: { abbreviation: 'BAL' }, period: 4, clock_display: '02:10', start_down: 3, start_distance: 9 },
    { id: 'a2', text: 'J.Stout punts 45 yards to KC 23, fair catch.', type_slug: 'punt', team: { abbreviation: 'KC' }, period: 4, clock_display: '02:02' },
    { id: 'a3', text: 'Two-Minute Warning', type_slug: 'two-minute-warning', team: { abbreviation: 'KC' }, period: 4, clock_display: '02:00' },
  ], normalizedGame());

  assert.equal(drives[0].result, 'Punt');
});
