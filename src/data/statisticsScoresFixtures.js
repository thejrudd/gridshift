const TEAM_FIXTURES = {
  BUF: { id: 'BUF', name: 'Bills' },
  MIA: { id: 'MIA', name: 'Dolphins' },
  NE: { id: 'NE', name: 'Patriots' },
  NYJ: { id: 'NYJ', name: 'Jets' },
  BAL: { id: 'BAL', name: 'Ravens' },
  CIN: { id: 'CIN', name: 'Bengals' },
  CLE: { id: 'CLE', name: 'Browns' },
  PIT: { id: 'PIT', name: 'Steelers' },
  HOU: { id: 'HOU', name: 'Texans' },
  IND: { id: 'IND', name: 'Colts' },
  JAX: { id: 'JAX', name: 'Jaguars' },
  TEN: { id: 'TEN', name: 'Titans' },
  DEN: { id: 'DEN', name: 'Broncos' },
  KC: { id: 'KC', name: 'Chiefs' },
  LV: { id: 'LV', name: 'Raiders' },
  LAC: { id: 'LAC', name: 'Chargers' },
  DAL: { id: 'DAL', name: 'Cowboys' },
  NYG: { id: 'NYG', name: 'Giants' },
  PHI: { id: 'PHI', name: 'Eagles' },
  WAS: { id: 'WAS', name: 'Commanders' },
  CHI: { id: 'CHI', name: 'Bears' },
  DET: { id: 'DET', name: 'Lions' },
  GB: { id: 'GB', name: 'Packers' },
  MIN: { id: 'MIN', name: 'Vikings' },
  ATL: { id: 'ATL', name: 'Falcons' },
  CAR: { id: 'CAR', name: 'Panthers' },
  NO: { id: 'NO', name: 'Saints' },
  TB: { id: 'TB', name: 'Buccaneers' },
  ARI: { id: 'ARI', name: 'Cardinals' },
  LAR: { id: 'LAR', name: 'Rams' },
  SF: { id: 'SF', name: '49ers' },
  SEA: { id: 'SEA', name: 'Seahawks' },
};

const TEAM_IDS = Object.keys(TEAM_FIXTURES);
const REGULAR_WEEKS = Array.from({ length: 18 }, (_, index) => ({
  id: String(index + 1),
  label: `Week ${index + 1}`,
  shortLabel: `W${index + 1}`,
  phase: 'regular',
}));

const POSTSEASON_WEEKS = [
  { id: 'wc', label: 'Wild Card', shortLabel: 'WC', phase: 'postseason' },
  { id: 'div', label: 'Divisional', shortLabel: 'DIV', phase: 'postseason' },
  { id: 'conf', label: 'Conference', shortLabel: 'CONF', phase: 'postseason' },
  { id: 'sb', label: 'Super Bowl', shortLabel: 'SB', phase: 'postseason' },
];

function team(id) {
  return TEAM_FIXTURES[id] ?? { id, name: id };
}

const GAME_WINDOWS = [
  { slot: 'thursday-night', label: 'Thursday Night', day: 'Thu', time: '8:15 PM' },
  { slot: 'saturday', label: 'Saturday', day: 'Sat', time: '1:00 PM' },
  { slot: 'saturday-night', label: 'Saturday Night', day: 'Sat', time: '8:00 PM' },
  { slot: 'sunday-early', label: 'Sunday Early Window', day: 'Sun', time: '1:00 PM' },
  { slot: 'sunday-early', label: 'Sunday Early Window', day: 'Sun', time: '1:00 PM' },
  { slot: 'sunday-early', label: 'Sunday Early Window', day: 'Sun', time: '1:00 PM' },
  { slot: 'sunday-early', label: 'Sunday Early Window', day: 'Sun', time: '1:00 PM' },
  { slot: 'sunday-late', label: 'Sunday Late Window', day: 'Sun', time: '4:05 PM' },
  { slot: 'sunday-late', label: 'Sunday Late Window', day: 'Sun', time: '4:25 PM' },
  { slot: 'sunday-late', label: 'Sunday Late Window', day: 'Sun', time: '4:25 PM' },
  { slot: 'sunday-night', label: 'Sunday Night', day: 'Sun', time: '8:20 PM' },
  { slot: 'monday-night', label: 'Monday Night', day: 'Mon', time: '8:15 PM' },
];

function recordFor(weekIndex, gameIndex, side) {
  const wins = 2 + ((weekIndex + (gameIndex * 3) + (side === 'away' ? 1 : 4)) % 10);
  return `${wins}-${Math.max(0, 13 - wins)}`;
}

function scheduledGame(weekIndex, gameIndex, awayId, homeId) {
  const window = GAME_WINDOWS[gameIndex % GAME_WINDOWS.length];
  const dayNumber = 4 + weekIndex + (window.day === 'Sat' ? 2 : window.day === 'Sun' ? 3 : window.day === 'Mon' ? 4 : 0);
  return {
    id: `fixture-${weekIndex + 1}-${gameIndex + 1}`,
    provider: 'fixture',
    status: 'scheduled',
    statusLabel: window.time,
    slot: window.slot,
    slotLabel: window.label,
    dateLabel: `${window.day} · Oct ${dayNumber}`,
    kickoffLabel: window.time,
    network: gameIndex % 2 ? 'CBS' : 'FOX',
    venue: `${team(homeId).name} Stadium`,
    away: team(awayId),
    home: team(homeId),
    records: {
      away: recordFor(weekIndex, gameIndex, 'away'),
      home: recordFor(weekIndex, gameIndex, 'home'),
    },
    score: { away: null, home: null },
  };
}

function finalGame(weekIndex, gameIndex, awayId, homeId) {
  const awayScore = 13 + ((weekIndex * 3 + gameIndex * 7) % 24);
  const homeScore = 16 + ((weekIndex * 5 + gameIndex * 4) % 22);
  return {
    ...scheduledGame(weekIndex, gameIndex, awayId, homeId),
    status: 'final',
    statusLabel: 'Final',
    score: { away: awayScore, home: homeScore },
    quarterScores: {
      away: [3, 7, 3, Math.max(0, awayScore - 13)],
      home: [7, 3, 6, Math.max(0, homeScore - 16)],
    },
  };
}

function gamesForWeek(week, weekIndex) {
  const gameCount = week.phase === 'postseason'
    ? ({ wc: 6, div: 4, conf: 2, sb: 1 }[week.id] ?? 2)
    : 12;
  const games = Array.from({ length: gameCount }, (_, gameIndex) => {
    const awayId = TEAM_IDS[(weekIndex * 5 + gameIndex * 2) % TEAM_IDS.length];
    const homeId = TEAM_IDS[(weekIndex * 5 + gameIndex * 2 + 1) % TEAM_IDS.length];
    return weekIndex < 6
      ? finalGame(weekIndex, gameIndex, awayId, homeId)
      : scheduledGame(weekIndex, gameIndex, awayId, homeId);
  });

  if (week.id === '2') {
    games[2] = {
      ...finalGame(weekIndex, 2, 'DET', 'GB'),
      id: 'fixture-favorite-final',
      favorite: true,
      favoriteTeamId: 'DET',
      statusLabel: 'Final OT',
      score: { away: 31, home: 28 },
      quarterScores: { away: [7, 10, 7, 4, 3], home: [7, 7, 7, 7, 0] },
    };
  }

  if (week.id === '7') {
    games[0] = {
      ...scheduledGame(weekIndex, 0, 'DET', 'MIN'),
      id: 'fixture-live-favorite',
      favorite: true,
      favoriteTeamId: 'DET',
      status: 'live',
      statusLabel: '3rd · 08:42',
      score: { away: 24, home: 17 },
      live: {
        period: '3rd', clock: '08:42', possession: 'DET', downDistance: '2nd & 6',
        fieldPosition: 'MIN 18', redZone: true, awayTimeouts: 3, homeTimeouts: 2,
      },
    };
    games[1] = {
      ...scheduledGame(weekIndex, 1, 'BAL', 'KC'),
      id: 'fixture-halftime',
      status: 'halftime',
      statusLabel: 'Halftime',
      score: { away: 14, home: 13 },
    };
    games[2] = {
      ...scheduledGame(weekIndex, 2, 'BUF', 'MIA'),
      id: 'fixture-live',
      status: 'live',
      statusLabel: '4th · 02:11',
      score: { away: 27, home: 24 },
      live: {
        period: '4th', clock: '02:11', possession: 'MIA', downDistance: '3rd & 4',
        fieldPosition: 'BUF 36', redZone: false, awayTimeouts: 1, homeTimeouts: 2,
      },
    };
    games[3] = {
      ...scheduledGame(weekIndex, 3, 'NYJ', 'NE'),
      id: 'fixture-delayed',
      status: 'delayed',
      statusLabel: 'Weather delay',
      score: { away: 3, home: 7 },
    };
  }

  if (week.id === '8') {
    games[1] = {
      ...games[1],
      id: 'fixture-partial',
      status: 'partial',
      statusLabel: 'Score pending',
      dataNotice: 'Some game details are temporarily unavailable.',
    };
  }

  if (week.id === '9') {
    games[0] = {
      ...games[0],
      id: 'fixture-postponed',
      status: 'postponed',
      statusLabel: 'Postponed',
    };
  }

  if (week.id === '10') {
    games[4] = {
      ...games[4],
      id: 'fixture-unavailable',
      status: 'unavailable',
      statusLabel: 'Data unavailable',
      dataNotice: 'The score feed could not be reached.',
    };
  }

  if (week.id === '11') {
    games[7] = {
      ...games[7],
      id: 'fixture-offline',
      status: 'offline',
      statusLabel: '3rd · 09:12',
      score: { away: 14, home: 17 },
      asOf: '4:12 PM ET',
      dataNotice: 'Showing cached score. Reconnect for live updates.',
    };
  }

  return games;
}

const ALL_WEEKS = [...REGULAR_WEEKS, ...POSTSEASON_WEEKS].map((week, index) => ({
  ...week,
  dateRange: week.phase === 'regular' ? `Sep ${3 + index}–${7 + index}` : 'January',
  games: gamesForWeek(week, index),
}));

const PRESEASON_FIXTURE_WEEKS = [
  {
    id: 'pre-1',
    week: 1,
    label: 'Hall of Fame Weekend',
    shortLabel: 'HOF',
    dateRange: 'Aug 6',
    games: [
      { awayId: 'CAR', homeId: 'ARI', kickoff: '2026-08-06T23:00:00.000Z', status: 'final', awayScore: 33, homeScore: 30 },
    ],
  },
  {
    id: 'pre-2',
    week: 2,
    label: 'Preseason Week 1',
    shortLabel: 'P1',
    dateRange: 'Aug 13–17',
    games: [
      { awayId: 'DET', homeId: 'CIN', kickoff: '2026-08-13T23:00:00.000Z' },
      { awayId: 'GB', homeId: 'PIT', kickoff: '2026-08-13T23:00:00.000Z' },
      { awayId: 'IND', homeId: 'NE', kickoff: '2026-08-13T23:30:00.000Z' },
      { awayId: 'ARI', homeId: 'LV', kickoff: '2026-08-14T00:00:00.000Z' },
    ],
  },
  {
    id: 'pre-3',
    week: 3,
    label: 'Preseason Week 2',
    shortLabel: 'P2',
    dateRange: 'Aug 20–24',
    games: [
      { awayId: 'BUF', homeId: 'PHI', kickoff: '2026-08-20T23:00:00.000Z' },
      { awayId: 'KC', homeId: 'DAL', kickoff: '2026-08-21T00:00:00.000Z' },
    ],
  },
  {
    id: 'pre-4',
    week: 4,
    label: 'Preseason Week 3',
    shortLabel: 'P3',
    dateRange: 'Aug 27–30',
    games: [
      { awayId: 'MIA', homeId: 'TB', kickoff: '2026-08-27T23:00:00.000Z' },
      { awayId: 'SEA', homeId: 'SF', kickoff: '2026-08-28T00:00:00.000Z' },
    ],
  },
].map((week) => ({
  ...week,
  phase: 'preseason',
  games: week.games.map((game, index) => {
    const kickoff = new Date(game.kickoff);
    const status = game.status ?? 'scheduled';
    return {
      id: `fixture-${week.id}-${index + 1}`,
      provider: 'fixture',
      phase: 'preseason',
      status,
      statusLabel: status === 'final'
        ? 'Final'
        : kickoff.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }),
      slot: game.kickoff.slice(0, 10),
      slotLabel: kickoff.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long' }),
      dateLabel: kickoff.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' }),
      kickoffLabel: kickoff.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }),
      kickoff: game.kickoff,
      network: 'TV TBD',
      venue: `${team(game.homeId).name} Stadium`,
      away: team(game.awayId),
      home: team(game.homeId),
      records: { away: null, home: null },
      score: {
        away: status === 'final' ? game.awayScore : null,
        home: status === 'final' ? game.homeScore : null,
      },
      completed: status === 'final',
      detailsAvailable: false,
    };
  }),
}));

export const SCORES_FIXTURE_SEASONS = [2026, 2025, 2024, 2023];
export const SCORES_FIXTURE_CURRENT_WEEK = '7';

export const STATISTICS_SCORES_FIXTURE = {
  season: 2026,
  currentWeekId: SCORES_FIXTURE_CURRENT_WEEK,
  updatedLabel: 'Fixture data · refreshed 14 sec ago',
  connectionState: 'offline-cache',
  weeks: ALL_WEEKS,
};

export const STATISTICS_SCORES_PRESEASON_FIXTURE = {
  season: 2026,
  phase: 'preseason',
  updatedLabel: 'Fixture data · deterministic preseason slate',
  weeks: PRESEASON_FIXTURE_WEEKS,
  games: PRESEASON_FIXTURE_WEEKS.flatMap((week) => week.games),
};

export const SCORE_DETAIL_FIXTURE = {
  status: 'live',
  statusLabel: '3rd Quarter · 08:42',
  venue: 'U.S. Bank Stadium · Minneapolis, MN',
  network: 'FOX',
  away: team('DET'),
  home: team('MIN'),
  score: { away: 24, home: 17 },
  possession: 'DET',
  quarterLabels: ['1', '2', '3', '4', 'T'],
  lineScore: { away: [7, 10, 7, '—', 24], home: [7, 3, 7, '—', 17] },
  leaders: [
    { label: 'Passing', away: 'J. Goff · 238 YDS, 2 TD', home: 'J. McCarthy · 181 YDS, TD' },
    { label: 'Rushing', away: 'J. Gibbs · 82 YDS', home: 'A. Jones · 64 YDS' },
    { label: 'Receiving', away: 'A. St. Brown · 96 YDS', home: 'J. Jefferson · 88 YDS' },
  ],
  statGroups: [
    {
      id: 'offense', label: 'Offense', stats: [
        { label: 'Total yards', away: 371, home: 298, direction: 'higher' },
        { label: 'Passing yards', away: 238, home: 181, direction: 'higher' },
        { label: 'Rushing yards', away: 133, home: 117, direction: 'higher' },
        { label: 'Yards per play', away: 6.4, home: 5.1, direction: 'higher' },
        { label: 'First downs', away: 22, home: 18, direction: 'higher' },
      ],
    },
    {
      id: 'defense', label: 'Defense', stats: [
        { label: 'Passing yards allowed', away: 181, home: 238, direction: 'lower' },
        { label: 'Rushing yards allowed', away: 117, home: 133, direction: 'lower' },
        { label: 'Sacks', away: 3, home: 1, direction: 'higher' },
        { label: 'Takeaways', away: 2, home: 1, direction: 'higher' },
      ],
    },
    {
      id: 'situational', label: 'Situational', stats: [
        { label: 'Third down', away: '6–10', home: '4–11', awayRatio: 0.6, homeRatio: 0.36, direction: 'higher' },
        { label: 'Fourth down', away: '1–1', home: '0–1', awayRatio: 1, homeRatio: 0, direction: 'higher' },
        { label: 'Red zone', away: '3–4', home: '2–3', awayRatio: 0.75, homeRatio: 0.67, direction: 'higher' },
      ],
    },
    {
      id: 'discipline', label: 'Discipline', stats: [
        { label: 'Turnovers', away: 1, home: 2, direction: 'lower' },
        { label: 'Penalties', away: '4–35', home: '7–58', awayRatio: 35, homeRatio: 58, direction: 'lower' },
      ],
    },
    {
      id: 'possession', label: 'Possession', stats: [
        { label: 'Time of possession', away: '24:18', home: '20:42', awayRatio: 1458, homeRatio: 1242, direction: 'neutral' },
        { label: 'Offensive plays', away: 58, home: 55, direction: 'neutral' },
      ],
    },
  ],
  playerGroups: [
    { id: 'passing', label: 'Passing', columns: ['C/ATT', 'YDS', 'TD', 'INT', 'RTG'], rows: [
      { team: 'DET', player: 'Jared Goff', values: ['20/27', '238', '2', '0', '112.4'] },
      { team: 'MIN', player: 'J.J. McCarthy', values: ['16/25', '181', '1', '1', '82.3'] },
    ] },
    { id: 'rushing', label: 'Rushing', columns: ['CAR', 'YDS', 'AVG', 'TD', 'LONG'], rows: [
      { team: 'DET', player: 'Jahmyr Gibbs', values: ['14', '82', '5.9', '1', '22'] },
      { team: 'DET', player: 'David Montgomery', values: ['10', '51', '5.1', '0', '14'] },
      { team: 'MIN', player: 'Aaron Jones', values: ['13', '64', '4.9', '1', '19'] },
    ] },
    { id: 'receiving', label: 'Receiving', columns: ['REC', 'TGT', 'YDS', 'AVG', 'TD'], rows: [
      { team: 'DET', player: 'Amon-Ra St. Brown', values: ['7', '9', '96', '13.7', '1'] },
      { team: 'MIN', player: 'Justin Jefferson', values: ['6', '8', '88', '14.7', '1'] },
    ] },
    { id: 'defense', label: 'Defense', columns: ['TOT', 'SOLO', 'SACK', 'TFL', 'PD'], rows: [
      { team: 'DET', player: 'Jack Campbell', values: ['9', '6', '1.0', '2', '1'] },
      { team: 'MIN', player: 'Blake Cashman', values: ['8', '5', '0.0', '1', '1'] },
    ] },
    { id: 'kicking', label: 'Kicking', columns: ['FG', 'LONG', 'XP', 'PTS'], rows: [
      { team: 'DET', player: 'Jake Bates', values: ['1/1', '42', '3/3', '6'] },
      { team: 'MIN', player: 'Will Reichard', values: ['1/1', '38', '2/2', '5'] },
    ] },
    { id: 'punting', label: 'Punting', columns: ['PUNTS', 'AVG', 'IN 20', 'LONG'], rows: [
      { team: 'DET', player: 'Jack Fox', values: ['2', '48.5', '1', '55'] },
      { team: 'MIN', player: 'Ryan Wright', values: ['3', '46.0', '2', '51'] },
    ] },
    { id: 'returns', label: 'Returns', columns: ['RET', 'YDS', 'AVG', 'LONG'], rows: [
      { team: 'DET', player: 'Kalif Raymond', values: ['2', '31', '15.5', '19'] },
      { team: 'MIN', player: 'Myles Price', values: ['2', '43', '21.5', '24'] },
    ] },
  ],
  scoring: [
    { quarter: '1st', time: '11:48', team: 'DET', title: 'A. St. Brown 14-yard reception', detail: 'J. Bates extra point good', score: 'DET 7–0' },
    { quarter: '1st', time: '04:22', team: 'MIN', title: 'J. Jefferson 22-yard reception', detail: 'W. Reichard extra point good', score: '7–7' },
    { quarter: '2nd', time: '09:17', team: 'DET', title: 'J. Gibbs 8-yard rush', detail: 'J. Bates extra point good', score: 'DET 14–7' },
    { quarter: '2nd', time: '01:34', team: 'DET', title: 'J. Bates 42-yard field goal', detail: 'Drive: 9 plays, 51 yards', score: 'DET 17–7' },
    { quarter: '2nd', time: '00:05', team: 'MIN', title: 'W. Reichard 38-yard field goal', detail: 'Drive: 7 plays, 44 yards', score: 'DET 17–10' },
    { quarter: '3rd', time: '12:03', team: 'MIN', title: 'A. Jones 5-yard rush', detail: 'W. Reichard extra point good', score: '17–17' },
    { quarter: '3rd', time: '09:11', team: 'DET', title: 'S. LaPorta 19-yard reception', detail: 'J. Bates extra point good', score: 'DET 24–17' },
  ],
  drives: [
    {
      id: 'drive-1', quarter: '1st', team: 'DET', result: 'Touchdown', score: 'DET 7–0', summary: '8 plays · 75 yards · 4:02',
      plays: [
        { down: '1st & 10', spot: 'DET 25', time: '15:00', description: 'J. Goff pass complete to A. St. Brown for 12 yards.' },
        { down: '2nd & 4', spot: 'MIN 31', time: '12:16', description: 'J. Gibbs rush up the middle for 11 yards.' },
        { down: '1st & Goal', spot: 'MIN 14', time: '11:48', description: 'J. Goff pass complete to A. St. Brown for 14 yards. Touchdown.', scoring: true },
      ],
    },
    {
      id: 'drive-2', quarter: '1st', team: 'MIN', result: 'Touchdown', score: '7–7', summary: '7 plays · 68 yards · 3:31',
      plays: [
        { down: '1st & 10', spot: 'MIN 32', time: '07:53', description: 'A. Jones rush off left tackle for 8 yards.' },
        { down: '3rd & 7', spot: 'DET 22', time: '04:22', description: 'J.J. McCarthy pass complete to J. Jefferson for 22 yards. Touchdown.', scoring: true },
      ],
    },
    {
      id: 'drive-3', quarter: '2nd', team: 'DET', result: 'Field Goal', score: 'DET 17–7', summary: '9 plays · 51 yards · 4:44',
      plays: [
        { down: '3rd & 5', spot: 'DET 44', time: '05:31', description: 'J. Goff pass complete to S. LaPorta for 13 yards.' },
        { down: '4th & 3', spot: 'MIN 24', time: '01:34', description: 'J. Bates 42-yard field goal is good.', scoring: true },
      ],
    },
    {
      id: 'drive-4', quarter: '3rd', team: 'MIN', result: 'Touchdown', score: '17–17', summary: '10 plays · 80 yards · 2:52',
      plays: [
        { down: '2nd & 8', spot: 'DET 38', time: '13:44', description: 'J.J. McCarthy pass complete to J. Jefferson for 21 yards.' },
        { down: '1st & Goal', spot: 'DET 5', time: '12:03', description: 'A. Jones rush for 5 yards. Touchdown.', scoring: true },
      ],
    },
    {
      id: 'drive-5', quarter: '3rd', team: 'DET', result: 'Touchdown', score: 'DET 24–17', summary: '6 plays · 67 yards · 2:52',
      plays: [
        { down: '2nd & 6', spot: 'MIN 37', time: '10:02', description: 'J. Gibbs rush around right end for 18 yards.' },
        { down: '1st & 10', spot: 'MIN 19', time: '09:11', description: 'J. Goff pass complete to S. LaPorta for 19 yards. Touchdown.', scoring: true },
      ],
    },
  ],
};

export function getScoreDetailFixture(game) {
  if (!game) return SCORE_DETAIL_FIXTURE;
  return {
    ...SCORE_DETAIL_FIXTURE,
    status: game.status,
    statusLabel: game.statusLabel,
    away: game.away,
    home: game.home,
    score: game.score,
    possession: game.live?.possession ?? SCORE_DETAIL_FIXTURE.possession,
  };
}
