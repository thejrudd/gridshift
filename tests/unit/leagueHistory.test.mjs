import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateParticipantIdentities,
  buildActivitySeasonGroups,
  buildDraftBlueprintSummaries,
  buildLeagueHistoryModel,
  buildSeasonStandings,
  getLatestFinalizedWeek,
  getSeasonChampion,
  normalizeActivityTransaction,
  normalizeSeasonBrackets,
} from '../../src/utils/leagueHistory.js';

const users2024 = [
  { user_id: 'user-a', display_name: 'Alex', metadata: { team_name: 'Alpha' } },
  { user_id: 'user-b', display_name: 'Blair', metadata: { team_name: 'Beta' } },
];
const rosters2024 = [
  { roster_id: 1, owner_id: 'user-a', settings: { division: 1 } },
  { roster_id: 2, owner_id: 'user-b', settings: { division: 2 } },
];

const snapshot2024 = {
  season: '2024',
  completed: true,
  league: {
    settings: { last_scored_leg: 3, playoff_week_start: 3 },
    metadata: { division_1: 'North Division', division_2: 'South Division' },
  },
  users: users2024,
  rosters: rosters2024,
  matchupsByWeek: {
    1: [
      {
        matchup_id: 1,
        roster_id: 1,
        points: 100,
        starters: ['player-a', 'player-b'],
        players: ['player-a', 'player-b', 'player-c'],
        players_points: { 'player-a': 70, 'player-b': 30, 'player-c': 40 },
      },
      { matchup_id: 1, roster_id: 2, points: 90 },
    ],
    2: [{ matchup_id: 1, roster_id: 1, points: 80 }, { matchup_id: 1, roster_id: 2, points: 120 }],
    3: [{ matchup_id: 1, roster_id: 1, points: 101 }, { matchup_id: 1, roster_id: 2, points: 100 }],
  },
  winnersBracket: [{ r: 1, m: 1, t1: 1, t2: 2, w: 2, l: 1, p: 1 }],
  losersBracket: [],
  transactions: [
    { transaction_id: 'trade-1', type: 'trade', status: 'complete', roster_ids: [1, 2], created: 100 },
    { transaction_id: 'waiver-1', type: 'waiver', status: 'complete', adds: { p1: 1 }, drops: { p2: 1 }, created: 90 },
  ],
};

const snapshot2025 = {
  season: '2025',
  completed: false,
  league: { settings: { last_scored_leg: 1, playoff_week_start: 15 } },
  users: [
    { user_id: 'user-a', display_name: 'Alex', metadata: { team_name: 'Alpha Rebrand' } },
    { user_id: 'user-c', display_name: 'Casey', metadata: { team_name: 'Gamma' } },
  ],
  rosters: [
    { roster_id: 5, owner_id: 'user-a', settings: { division: 1 } },
    { roster_id: 6, owner_id: 'user-c', settings: { division: 1 } },
  ],
  matchupsByWeek: {
    1: [{ matchup_id: 1, roster_id: 5, points: 110 }, { matchup_id: 1, roster_id: 6, points: 95 }],
    2: [{ matchup_id: 1, roster_id: 5, points: 20 }, { matchup_id: 1, roster_id: 6, points: 40 }],
  },
  winnersBracket: [],
  losersBracket: [{ r: 1, m: 2, t1: 5, t2: 6, w: 6, l: 5, p: 7 }],
  transactions: [],
};

test('aggregates stable participant identity by Sleeper user ID across roster changes', () => {
  const participants = aggregateParticipantIdentities([snapshot2024, snapshot2025]);
  assert.equal(participants.size, 3);
  assert.deepEqual(participants.get('user-a').seasons, ['2024', '2025']);
  assert.deepEqual(participants.get('user-a').rosterIdsBySeason, { 2024: '1', 2025: '5' });
  assert.equal(participants.get('user-a').teamName, 'Alpha Rebrand');
});

test('falls back to a season-roster identity when a Sleeper user ID is unavailable', () => {
  const participants = aggregateParticipantIdentities([{ season: '2023', rosters: [{ roster_id: 9 }], users: [] }]);
  assert.equal(participants.has('2023:9'), true);
});

test('freezes current standings at the latest fully scored matchup week', () => {
  assert.equal(getLatestFinalizedWeek(snapshot2025), 1);
  const standings = buildSeasonStandings(snapshot2025);
  assert.equal(standings.throughWeek, 1);
  assert.equal(standings.rows[0].teamName, 'Alpha Rebrand');
  assert.deepEqual(standings.rows.map((row) => [row.wins, row.losses]), [[1, 0], [0, 1]]);
  assert.deepEqual(standings.rows.map((row) => row.recentForm), [['W'], ['L']]);
  assert.equal(standings.divisions.length, 1);
});

test('historical standings stop at the final regular-season week and retain league seeds', () => {
  const standings = buildSeasonStandings(snapshot2024, { historical: true });
  assert.equal(standings.throughWeek, 2);
  assert.equal(standings.rows[0].teamName, 'Beta');
  assert.deepEqual(standings.rows.map((row) => row.seed), [1, 2]);
  assert.deepEqual(standings.divisions.map((division) => division.label), ['North Division', 'South Division']);
});

test('detects championship and consolation brackets only from actual matchup evidence', () => {
  const completedBrackets = normalizeSeasonBrackets(snapshot2024);
  assert.equal(completedBrackets.hasChampionship, true);
  assert.equal(completedBrackets.hasConsolation, false);
  assert.equal(completedBrackets.championship[0].week, 3);
  assert.equal(completedBrackets.championship[0].team1Score, 101);
  assert.equal(completedBrackets.championship[0].team2Score, 100);
  assert.equal(getSeasonChampion(snapshot2024).participant.teamName, 'Beta');
  const currentBrackets = normalizeSeasonBrackets(snapshot2025);
  assert.equal(currentBrackets.hasConsolation, true);
  assert.equal(currentBrackets.losersBracketType, 'losers-bracket');

  const consolationBrackets = normalizeSeasonBrackets({
    ...snapshot2025,
    losersBracket: [{ r: 2, m: 3, t1_from: { w: 1 }, t2_from: { w: 2 } }],
  });
  assert.equal(consolationBrackets.losersBracketType, 'consolation');

  const toiletBowlBrackets = normalizeSeasonBrackets({
    ...snapshot2025,
    losersBracket: [{ r: 2, m: 3, t1_from: { l: 1 }, t2_from: { l: 2 } }],
  });
  assert.equal(toiletBowlBrackets.losersBracketType, 'toilet-bowl');

  const numericToiletBowlSetting = normalizeSeasonBrackets({
    ...snapshot2025,
    league: { ...snapshot2025.league, settings: { ...snapshot2025.league.settings, playoff_type: 0 } },
    losersBracket: [{ r: 2, m: 3, t1_from: { w: 1 }, t2_from: { w: 2 } }],
  });
  assert.equal(numericToiletBowlSetting.losersBracketType, 'toilet-bowl');

  const numericConsolationSetting = normalizeSeasonBrackets({
    ...snapshot2025,
    league: { ...snapshot2025.league, settings: { ...snapshot2025.league.settings, playoff_type: 1 } },
    losersBracket: [{ r: 2, m: 3, t1_from: { l: 1 }, t2_from: { l: 2 } }],
  });
  assert.equal(numericConsolationSetting.losersBracketType, 'consolation');

  const scoreDetectedToiletBowl = normalizeSeasonBrackets({
    ...snapshot2025,
    league: { settings: { last_scored_leg: 15, playoff_week_start: 15 } },
    matchupsByWeek: {
      15: [{ matchup_id: 1, roster_id: 5, points: 80 }, { matchup_id: 1, roster_id: 6, points: 100 }],
    },
    losersBracket: [{ r: 1, m: 1, t1: 5, t2: 6, w: 5, l: 6 }],
  });
  assert.equal(scoreDetectedToiletBowl.losersBracketType, 'toilet-bowl');

  const consolationWithPlacementGames = normalizeSeasonBrackets({
    ...snapshot2025,
    losersBracket: [
      { r: 2, m: 4, t1_from: { w: 1 }, t2_from: { w: 2 } },
      { p: 1, r: 3, m: 7, t1_from: { w: 4 }, t2_from: { w: 5 } },
      { p: 3, r: 3, m: 8, t1_from: { l: 4 }, t2_from: { l: 5 } },
    ],
  });
  assert.equal(consolationWithPlacementGames.losersBracketType, 'consolation');

  const resolvedBracket = normalizeSeasonBrackets({
    ...snapshot2024,
    winnersBracket: [
      { r: 1, m: 1, t1: 1, t2: 2, w: 1, l: 2 },
      { r: 2, m: 2, t1_from: { w: 1 }, t2_from: { l: 1 }, w: 1, l: 2, p: 1 },
    ],
  });
  assert.equal(resolvedBracket.championship[1].team1.teamName, 'Alpha');
  assert.equal(resolvedBracket.championship[1].team2.teamName, 'Beta');
});

test('models Sleeper playoff links with byes, resolved scores, and separate placement games', () => {
  const users = Array.from({ length: 6 }, (_, index) => ({
    user_id: `bracket-user-${index + 1}`,
    display_name: `Manager ${index + 1}`,
    metadata: { team_name: `Seed ${index + 1}` },
  }));
  const rosters = users.map((user, index) => ({ roster_id: index + 1, owner_id: user.user_id }));
  const bracket = normalizeSeasonBrackets({
    season: '2024',
    completed: true,
    league: { settings: { last_scored_leg: 5, playoff_week_start: 3 } },
    users,
    rosters,
    matchupsByWeek: {
      1: [
        { matchup_id: 1, roster_id: 1, points: 120 }, { matchup_id: 1, roster_id: 6, points: 90 },
        { matchup_id: 2, roster_id: 2, points: 118 }, { matchup_id: 2, roster_id: 5, points: 92 },
        { matchup_id: 3, roster_id: 3, points: 115 }, { matchup_id: 3, roster_id: 4, points: 100 },
      ],
      3: [
        { matchup_id: 17, roster_id: 3, points: 120 }, { matchup_id: 17, roster_id: 6, points: 100 },
        { matchup_id: 18, roster_id: 4, points: 110 }, { matchup_id: 18, roster_id: 5, points: 101 },
      ],
      4: [
        { matchup_id: 99, roster_id: 1, points: 130 }, { matchup_id: 99, roster_id: 3, points: 120 },
        { matchup_id: 100, roster_id: 2, points: 140 }, { matchup_id: 100, roster_id: 4, points: 110 },
        { matchup_id: 101, roster_id: 6, points: 80 }, { matchup_id: 101, roster_id: 5, points: 90 },
      ],
      5: [
        { matchup_id: 111, roster_id: 1, points: 150 }, { matchup_id: 111, roster_id: 2, points: 120 },
        { matchup_id: 112, roster_id: 3, points: 130 }, { matchup_id: 112, roster_id: 4, points: 100 },
      ],
    },
    winnersBracket: [
      { r: 1, m: 1, t1: 3, t2: 6, w: 3, l: 6 },
      { r: 1, m: 2, t1: 4, t2: 5, w: 4, l: 5 },
      { r: 2, m: 3, t1: 1, t2_from: { w: 1 }, w: 1, l: 3 },
      { r: 2, m: 4, t1: 2, t2_from: { w: 2 }, w: 2, l: 4 },
      { r: 2, m: 5, t1_from: { l: 1 }, t2_from: { l: 2 }, w: 6, l: 5, p: 5 },
      { r: 3, m: 6, t1_from: { w: 3 }, t2_from: { w: 4 }, w: 1, l: 2, p: 1 },
      { r: 3, m: 7, t1_from: { l: 3 }, t2_from: { l: 4 }, w: 3, l: 4, p: 3 },
    ],
    losersBracket: [],
  });

  const byeTeams = bracket.championship.filter((matchup) => matchup.isBye).map((matchup) => matchup.team1.teamName).sort();
  assert.deepEqual(byeTeams, ['Seed 1', 'Seed 2']);
  assert.equal(bracket.championship.some((matchup) => matchup.placement === 5), false);
  assert.deepEqual(bracket.championshipPlacement.map((matchup) => matchup.id), ['5']);
  const secondRound = bracket.championship.find((matchup) => matchup.id === '3');
  assert.equal(secondRound.team1Score, 130);
  assert.equal(secondRound.team2Score, 120);
});

test('includes Sleeper commissioner score adjustments in standings and toilet-bowl scores', () => {
  const snapshot = {
    season: '2025',
    completed: true,
    league: { settings: { last_scored_leg: 17, playoff_week_start: 17 } },
    users: [
      { user_id: 'adjusted-a', display_name: 'Manager A', metadata: { team_name: 'Phillip River\'s 11 Kids' } },
      { user_id: 'adjusted-b', display_name: 'Manager B', metadata: { team_name: 'Shrektastic' } },
    ],
    rosters: [
      { roster_id: 1, owner_id: 'adjusted-a' },
      { roster_id: 2, owner_id: 'adjusted-b' },
    ],
    matchupsByWeek: {
      16: [
        { matchup_id: 1, roster_id: 1, points: 139.8, custom_points: -0.1 },
        { matchup_id: 1, roster_id: 2, points: 113.11, custom_points: -0.5 },
      ],
      17: [
        { matchup_id: 1, roster_id: 1, points: 139.8, custom_points: -0.1 },
        { matchup_id: 1, roster_id: 2, points: 113.11, custom_points: -0.5 },
      ],
    },
    winnersBracket: [],
    losersBracket: [{ r: 1, m: 1, t1: 1, t2: 2, w: 2, l: 1, p: 1 }],
    transactions: [],
  };

  const standings = buildSeasonStandings(snapshot, { historical: true });
  assert.deepEqual(standings.rows.map((row) => row.pointsFor), [139.7, 112.61]);

  const brackets = normalizeSeasonBrackets(snapshot);
  assert.equal(brackets.losersBracketType, 'toilet-bowl');
  assert.deepEqual(
    [brackets.consolation[0].team1Score, brackets.consolation[0].team2Score],
    [139.7, 112.61],
  );
});

test('models the seven-team CTRL+ALT+DEFEAT Toilet Bowl as one linked bracket with a first-round bye', () => {
  const teams = [
    [8, 'SlingingMeat', 'Whiskey Tango Foxtrot'],
    [9, 'jma277', 'Purdy Much a Lock'],
    [10, 'Nerevar', 'Nerevar'],
    [11, 'DamnGoodFood', "Phillip River's 11 Kids"],
    [12, 'blazebeard', 'Globo Gym Purple Cobras'],
    [13, 'Shret', 'Shrektastic'],
    [14, 'AlloK', 'No Punt Intended'],
  ];
  const bracket = normalizeSeasonBrackets({
    season: '2025',
    completed: true,
    league: { total_rosters: 14, settings: { last_scored_leg: 17, playoff_week_start: 15, playoff_teams: 7 } },
    users: teams.map(([rosterId, managerName, teamName]) => ({
      user_id: `toilet-${rosterId}`,
      display_name: managerName,
      metadata: { team_name: teamName },
    })),
    rosters: teams.map(([rosterId]) => ({ roster_id: rosterId, owner_id: `toilet-${rosterId}` })),
    matchupsByWeek: {
      15: [
        { roster_id: 11, matchup_id: 1, points: 93.8 }, { roster_id: 10, matchup_id: 1, points: 139.8 },
        { roster_id: 13, matchup_id: 2, points: 58.16 }, { roster_id: 8, matchup_id: 2, points: 144.7 },
        { roster_id: 12, matchup_id: 3, points: 133.12 }, { roster_id: 9, matchup_id: 3, points: 171.35 },
      ],
      16: [
        { roster_id: 14, matchup_id: 4, points: 107.3 }, { roster_id: 11, matchup_id: 4, points: 86.44 },
        { roster_id: 13, matchup_id: 5, points: 110.49 }, { roster_id: 12, matchup_id: 5, points: 159.53 },
        { roster_id: 8, matchup_id: 6, points: 203.85 }, { roster_id: 9, matchup_id: 6, points: 136.9 },
      ],
      17: [
        { roster_id: 11, matchup_id: 7, points: 139.7 }, { roster_id: 13, matchup_id: 7, points: 112.61 },
        { roster_id: 14, matchup_id: 8, points: 79.4 }, { roster_id: 12, matchup_id: 8, points: 88.71 },
        { roster_id: 10, matchup_id: 9, points: 197.31 }, { roster_id: 9, matchup_id: 9, points: 118.37 },
      ],
    },
    winnersBracket: [],
    losersBracket: [
      { r: 1, m: 1, t1: 11, t2: 10, w: 10, l: 11 },
      { r: 1, m: 2, t1: 13, t2: 8, w: 8, l: 13 },
      { r: 1, m: 3, t1: 12, t2: 9, w: 9, l: 12 },
      { r: 2, m: 4, t1: 14, t2_from: { l: 1 }, w: 14, l: 11 },
      { r: 2, m: 5, t1_from: { l: 2 }, t2_from: { l: 3 }, w: 12, l: 13 },
      { r: 2, m: 6, t1_from: { w: 2 }, t2_from: { w: 3 }, w: 8, l: 9 },
      { r: 3, m: 7, t1_from: { l: 4 }, t2_from: { l: 5 }, w: 11, l: 13, p: 1 },
      { r: 3, m: 8, t1_from: { w: 4 }, t2_from: { w: 5 }, w: 12, l: 14, p: 3 },
      { r: 3, m: 9, t1_from: { w: 1 }, t2_from: { l: 6 }, w: 10, l: 9, p: 5 },
    ],
  });

  assert.equal(bracket.losersBracketType, 'toilet-bowl');
  assert.deepEqual(
    bracket.consolation.filter((matchup) => matchup.round === 1).map((matchup) => matchup.id),
    ['bye:4:team1', '1', '2', '3'],
  );
  assert.equal(bracket.consolation.find((matchup) => matchup.id === 'bye:4:team1').team1.managerName, 'AlloK');
  assert.deepEqual(
    [bracket.consolation.find((matchup) => matchup.id === '7').team1.managerName, bracket.consolation.find((matchup) => matchup.id === '7').team2.managerName],
    ['DamnGoodFood', 'Shret'],
  );
  assert.deepEqual(bracket.consolation.filter((matchup) => matchup.round === 3).map((matchup) => matchup.placement), [14, 12, 10]);
  assert.deepEqual(bracket.consolation.filter((matchup) => matchup.round === 3).map((matchup) => matchup.bracketPlacement), [1, 3, 5]);

  const matchupsById = new Map(bracket.consolation.map((matchup) => [matchup.id, matchup]));
  bracket.consolation.forEach((matchup) => {
    [['team1', 'team1Source'], ['team2', 'team2Source']].forEach(([teamKey, sourceKey]) => {
      const source = matchup[sourceKey];
      if (!source) return;
      const sourceMatchup = matchupsById.get(source.matchupId);
      const resolvedTeam = source.outcome === 'l' ? sourceMatchup?.loser : sourceMatchup?.winner;
      assert.equal(
        resolvedTeam?.id,
        matchup[teamKey]?.id,
        `${source.matchupId} ${source.outcome} must resolve into ${matchup.id} ${teamKey}`,
      );
    });
  });
});

test('matches the CTRL+ALT+DEFEAT 2025 Sleeper championship bracket exactly', () => {
  const teams = [
    [1, 'thejrudd', 'Fourth & F**ked'],
    [2, 'RubenZuben', 'Michael Vicks Dog Dealer'],
    [6, 'Saberek', 'The Redshirt Roster'],
    [8, 'lonehawk', 'Bijan Al Gaib'],
    [9, 'pointman44', 'Strained by McCaffrey'],
    [10, 'ShermSquad', 'Shermanator'],
    [11, 'NoiShinNinjutsu', "Stuart Littles Lil'Brotha"],
  ];
  const bracket = normalizeSeasonBrackets({
    season: '2025',
    completed: true,
    league: { settings: { last_scored_leg: 17, playoff_week_start: 15, playoff_teams: 7 } },
    users: teams.map(([rosterId, managerName, teamName]) => ({
      user_id: `ctrl-alt-${rosterId}`,
      display_name: managerName,
      metadata: { team_name: teamName },
    })),
    rosters: teams.map(([rosterId]) => ({ roster_id: rosterId, owner_id: `ctrl-alt-${rosterId}` })),
    matchupsByWeek: {
      15: [
        { roster_id: 8, matchup_id: 1, points: 193.64 }, { roster_id: 2, matchup_id: 1, points: 94.47 },
        { roster_id: 10, matchup_id: 2, points: 123.77 }, { roster_id: 11, matchup_id: 2, points: 154.15 },
        { roster_id: 1, matchup_id: 3, points: 142.13 }, { roster_id: 6, matchup_id: 3, points: 151.65 },
      ],
      16: [
        { roster_id: 9, matchup_id: 1, points: 132.72 }, { roster_id: 8, matchup_id: 1, points: 176.73 },
        { roster_id: 11, matchup_id: 2, points: 156.41 }, { roster_id: 6, matchup_id: 2, points: 124.15 },
        { roster_id: 10, matchup_id: 3, points: 201.36 }, { roster_id: 1, matchup_id: 3, points: 96.79 },
      ],
      17: [
        { roster_id: 8, matchup_id: 1, points: 199.48 }, { roster_id: 11, matchup_id: 1, points: 102.3 },
        { roster_id: 9, matchup_id: 2, points: 172.88 }, { roster_id: 6, matchup_id: 2, points: 115.15 },
        { roster_id: 2, matchup_id: 3, points: 98.47 }, { roster_id: 10, matchup_id: 3, points: 84.83 },
      ],
    },
    winnersBracket: [
      { m: 1, r: 1, l: 2, w: 8, t1: 8, t2: 2 },
      { m: 2, r: 1, l: 10, w: 11, t1: 10, t2: 11 },
      { m: 3, r: 1, l: 1, w: 6, t1: 1, t2: 6 },
      { m: 4, r: 2, l: 9, w: 8, t1: 9, t2: 8, t2_from: { w: 1 } },
      { m: 5, r: 2, l: 6, w: 11, t1: 11, t2: 6, t1_from: { w: 2 }, t2_from: { w: 3 } },
      { m: 6, r: 2, l: 1, w: 10, t1: 10, t2: 1, t1_from: { l: 2 }, t2_from: { l: 3 } },
      { p: 1, m: 7, r: 3, l: 11, w: 8, t1: 8, t2: 11, t1_from: { w: 4 }, t2_from: { w: 5 } },
      { p: 3, m: 8, r: 3, l: 6, w: 9, t1: 9, t2: 6, t1_from: { l: 4 }, t2_from: { l: 5 } },
      { p: 5, m: 9, r: 3, l: 10, w: 2, t1: 2, t2: 10, t1_from: { l: 1 }, t2_from: { w: 6 } },
    ],
    losersBracket: [],
  });

  assert.deepEqual(
    bracket.championship.filter((matchup) => !matchup.isBye).map((matchup) => matchup.id).sort(),
    ['1', '2', '3', '4', '5', '7', '8'],
  );
  assert.deepEqual(
    bracket.championship.filter((matchup) => matchup.isBye).map((matchup) => matchup.team1.teamName),
    ['Strained by McCaffrey'],
  );
  assert.deepEqual(bracket.championshipPlacement.map((matchup) => matchup.id).sort(), ['6', '9']);
  const semifinal = bracket.championship.find((matchup) => matchup.id === '5');
  assert.deepEqual([semifinal.team1Score, semifinal.team2Score], [156.41, 124.15]);
});

test('builds lifetime leaderboard, rivalries, champions, and core record leaders', () => {
  const model = buildLeagueHistoryModel([snapshot2024, snapshot2025], {
    'player-a': { full_name: 'Record Starter' },
    'player-b': { full_name: 'Second Starter' },
    'player-c': { full_name: 'Bench Hero' },
  });
  assert.equal(model.leaderboard.find((row) => row.id === 'user-a').games, 4);
  assert.equal(model.champions[0].participant.id, 'user-b');
  assert.equal(model.rivalries[0].games, 3);
  assert.equal(model.records.highestScore.score, 120);
  assert.equal(model.records.highestScore.rosterId, '2');
  assert.equal(model.records.highestScore.season, '2024');
  assert.equal(model.records.highestScore.week, 2);
  assert.equal(model.records.highestLosingScore.points, 100);
  assert.equal(model.records.highestLosingScore.week, 3);
  assert.equal(model.records.lowestWinningScore.points, 100);
  assert.equal(model.records.lowestWinningScore.week, 1);
  assert.equal(model.records.lowestScore.score, 80);
  assert.equal(model.records.highestCombinedScore.value, 205);
  assert.equal(model.records.biggestBlowout.value, 40);
  assert.equal(model.records.biggestBlowout.left.rosterId, '1');
  assert.equal(model.records.narrowestWin.value, 1);
  assert.equal(model.records.highestStarterScore.playerName, 'Record Starter');
  assert.equal(model.records.highestStarterScore.score, 70);
  assert.equal(model.records.highestBenchScore.playerName, 'Bench Hero');
  assert.equal(model.records.highestBenchScore.score, 40);
  assert.equal(model.records.mostBenchPoints.score, 40);
  assert.equal(model.records.largestStarterShare.share, 70);
  assert.equal(model.records.mostTrades.value, 1);
  assert.equal(model.records.mostWaiverAdds.participant.id, 'user-a');
});

test('normalizes completed Sleeper activity with team and player context', () => {
  const transaction = snapshot2024.transactions[1];
  const activity = normalizeActivityTransaction({
    transaction,
    snapshot: snapshot2024,
    players: {
      p1: { full_name: 'Added Runner', position: 'RB', team: 'BUF', espn_id: '1001' },
      p2: { full_name: 'Dropped Wideout', position: 'WR', team: 'MIA' },
    },
  });
  assert.equal(activity.label, 'Waiver claim processed');
  assert.equal(activity.adds[0].playerName, 'Added Runner');
  assert.equal(activity.adds[0].position, 'RB');
  assert.equal(activity.adds[0].nflTeam, 'BUF');
  assert.equal(activity.adds[0].espnId, '1001');
  assert.equal(activity.adds[0].team.teamName, 'Alpha');
  assert.equal(normalizeActivityTransaction({ transaction: { ...transaction, status: 'pending' }, snapshot: snapshot2024 }), null);
});

test('hides Sleeper Week 1 labels on offseason activity before regular-season kickoff', () => {
  const offseason = normalizeActivityTransaction({
    transaction: {
      transaction_id: 'offseason-add',
      type: 'free_agent',
      status: 'complete',
      status_updated: Date.UTC(2024, 5, 15),
      leg: 1,
      adds: { p1: 1 },
    },
    snapshot: snapshot2024,
  });
  const weekOne = normalizeActivityTransaction({
    transaction: {
      transaction_id: 'week-one-add',
      type: 'free_agent',
      status: 'complete',
      status_updated: Date.UTC(2024, 8, 5),
      leg: 1,
      adds: { p1: 1 },
    },
    snapshot: snapshot2024,
  });

  assert.equal(offseason.week, null);
  assert.equal(weekOne.week, 1);
});

test('groups selected-season activity with prior linked seasons in newest-first order', () => {
  const groups = buildActivitySeasonGroups([snapshot2024, snapshot2025], {});
  assert.deepEqual(groups.map((group) => group.season), ['2025', '2024']);
  assert.equal(groups[1].entries.length, 2);
  assert.deepEqual(groups[1].entries.map((entry) => entry.id), ['trade-1', 'waiver-1']);
});

test('builds standard draft blueprints without IDP positions', () => {
  const result = buildDraftBlueprintSummaries({
    league: { roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX'] },
    rosters: rosters2024,
    users: users2024,
    players: { qb: { full_name: 'First QB', position: 'QB' }, rb: { full_name: 'Runner', position: 'RB' } },
    picks: [{ roster_id: 1, player_id: 'qb', round: 1, pick_no: 1 }, { roster_id: 1, player_id: 'rb', round: 2, pick_no: 4 }],
    myRosterId: 1,
  });
  assert.equal(result.isIdp, false);
  assert.deepEqual(result.positions, ['QB', 'RB']);
  assert.equal(result.teams[0].pickCount, 2);
  assert.equal(result.teams[0].firstRoundPick.playerName, 'First QB');
  assert.deepEqual(result.teams[0].earlyPicks.map((pick) => pick.playerName), ['First QB', 'Runner']);
});

test('draft blueprints label a roster with the manager preserved on its historical picks', () => {
  const result = buildDraftBlueprintSummaries({
    league: { roster_positions: ['QB'] },
    rosters: [{ roster_id: 1, owner_id: 'replacement-manager' }],
    users: [
      { user_id: 'drafting-manager', display_name: 'Original Manager' },
      { user_id: 'replacement-manager', display_name: 'Replacement Manager', metadata: { team_name: 'New Team' } },
    ],
    players: { qb: { full_name: 'First QB', position: 'QB' } },
    picks: [{ roster_id: 1, player_id: 'qb', picked_by: 'drafting-manager', round: 1, pick_no: 1 }],
    myRosterId: 1,
    myUserId: 'replacement-manager',
  });

  assert.equal(result.teams[0].managerName, 'Original Manager');
  assert.equal(result.teams[0].teamName, 'Original Manager');
  assert.equal(result.teams[0].isMine, false);
});

test('draft blueprints do not assign rewritten picks to a replacement manager', () => {
  const result = buildDraftBlueprintSummaries({
    draft: { draft_order: { 'original-manager': 4 } },
    league: { roster_positions: ['QB'] },
    rosters: [{ roster_id: 4, owner_id: 'replacement-manager' }],
    users: [{ user_id: 'replacement-manager', display_name: 'Replacement Manager', metadata: { team_name: 'New Team' } }],
    players: { qb: { full_name: 'First QB', position: 'QB' } },
    picks: [{ roster_id: 4, player_id: 'qb', picked_by: 'replacement-manager', round: 1, pick_no: 1 }],
    myRosterId: 4,
    myUserId: 'replacement-manager',
  });

  assert.equal(result.teams[0].teamName, 'Roster 4');
  assert.equal(result.teams[0].managerName, 'Draft manager unavailable');
  assert.equal(result.teams[0].isMine, false);
});

test('shows individual defensive positions only for IDP league blueprints', () => {
  const result = buildDraftBlueprintSummaries({
    league: { roster_positions: ['QB', 'LB', 'DB', 'IDP_FLEX'] },
    rosters: rosters2024,
    users: users2024,
    players: { lb: { full_name: 'Linebacker', position: 'LB' }, cb: { full_name: 'Corner', position: 'CB' } },
    picks: [{ roster_id: 2, player_id: 'lb', round: 1 }, { roster_id: 2, player_id: 'cb', round: 2 }],
  });
  assert.equal(result.isIdp, true);
  assert.deepEqual(result.positions, ['LB', 'CB']);
  assert.deepEqual(result.teams[0].positionCounts, { LB: 1, CB: 1 });
});
