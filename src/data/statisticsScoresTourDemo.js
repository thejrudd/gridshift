const AWAY = { id: 'DET', name: 'Lions' };
const HOME = { id: 'GB', name: 'Packers' };

function tourPlay({
  id,
  type,
  text,
  shortText,
  description,
  down,
  spot,
  time,
  start,
  end,
  startSpot,
  endSpot,
  yards,
  scoring = false,
}) {
  return {
    id,
    typeSlug: type,
    typeText: type === 'rush' ? 'Rush' : 'Pass Reception',
    rawText: text,
    shortText,
    description,
    down,
    spot,
    quarter: '1st',
    time,
    clockDisplay: time,
    period: 1,
    team: AWAY.id,
    startYardLine: start,
    endYardLine: end,
    startDown: 1,
    startDistance: 10,
    endDown: 1,
    endDistance: 10,
    startPossessionText: startSpot,
    endPossessionText: endSpot,
    statYardage: yards,
    scoring,
  };
}

export const STATISTICS_SCORES_TOUR_GAME = Object.freeze({
  id: 'fixture-tour-play-by-play',
  provider: 'fixture',
  status: 'final',
  statusLabel: 'Final',
  dateLabel: 'Sun · Tour preview',
  away: AWAY,
  home: HOME,
  records: { away: '11-6', home: '10-7' },
  score: { away: 24, home: 17 },
});

export const STATISTICS_SCORES_TOUR_DETAIL = Object.freeze({
  status: 'final',
  statusLabel: 'Final',
  venue: 'Tour preview',
  network: 'Game detail demo',
  away: AWAY,
  home: HOME,
  score: { away: 24, home: 17 },
  possession: null,
  drives: [{
    id: 'tour-drive',
    quarter: '1st',
    team: AWAY.id,
    result: 'Touchdown',
    score: `${AWAY.id} 7–0`,
    playCount: 4,
    plays: [
      tourPlay({
        id: 'tour-play-1',
        type: 'pass-reception',
        text: `Pass complete for 12 yards from ${AWAY.id} 25 to ${AWAY.id} 37.`,
        shortText: '12 Yd Pass Reception',
        description: `Pass complete for 12 yards to the ${AWAY.id} 37.`,
        down: '1st & 10',
        spot: `${AWAY.id} 25`,
        time: '15:00',
        start: 75,
        end: 63,
        startSpot: `${AWAY.id} 25`,
        endSpot: `${AWAY.id} 37`,
        yards: 12,
      }),
      tourPlay({
        id: 'tour-play-2',
        type: 'rush',
        text: `Rush up the middle for 17 yards from ${AWAY.id} 37 to ${HOME.id} 46.`,
        shortText: '17 Yd Rush',
        description: `Rush up the middle for 17 yards to the ${HOME.id} 46.`,
        down: '1st & 10',
        spot: `${AWAY.id} 37`,
        time: '14:18',
        start: 63,
        end: 46,
        startSpot: `${AWAY.id} 37`,
        endSpot: `${HOME.id} 46`,
        yards: 17,
      }),
      tourPlay({
        id: 'tour-play-3',
        type: 'pass-reception',
        text: `Deep pass complete for 32 yards from ${HOME.id} 46 to ${HOME.id} 14.`,
        shortText: '32 Yd Pass Reception',
        description: `Deep pass complete for 32 yards to the ${HOME.id} 14.`,
        down: '1st & 10',
        spot: `${HOME.id} 46`,
        time: '13:31',
        start: 46,
        end: 14,
        startSpot: `${HOME.id} 46`,
        endSpot: `${HOME.id} 14`,
        yards: 32,
      }),
      tourPlay({
        id: 'tour-play-4',
        type: 'rush',
        text: `Rush for 14 yards. Touchdown ${AWAY.id}.`,
        shortText: '14 Yd Rushing Touchdown',
        description: `Rush for 14 yards. Touchdown ${AWAY.id}.`,
        down: '1st & 10',
        spot: `${HOME.id} 14`,
        time: '12:49',
        start: 14,
        end: 0,
        startSpot: `${HOME.id} 14`,
        endSpot: `${HOME.id} 0`,
        yards: 14,
        scoring: true,
      }),
    ],
  }],
});

/* ---------- Team Stats breakdown tour preview ---------- */

// Gamebook-style plays with the provider's short highlight text, so the shared
// narrative parser credits each player exactly as it does for live games.
function breakdownPlay(id, team, drive, time, shortText, text, { slug, start, end, yards, scoring = false, awayScore = 0, homeScore = 0 }) {
  return {
    id,
    typeSlug: slug,
    typeText: slug,
    shortText,
    rawText: text,
    description: text,
    quarter: '1st',
    time,
    clockDisplay: time,
    period: 1,
    team,
    startDown: 1,
    startDistance: 10,
    endDown: 1,
    endDistance: 10,
    startYardsToEndzone: start,
    endYardsToEndzone: end,
    statYardage: yards,
    scoring,
    awayScore,
    homeScore,
    driveId: drive,
  };
}

const boxRow = (team, player, position, values) => ({ team, player, position, values });

export const STATISTICS_SCORES_TOUR_TEAM_GAME = Object.freeze({
  ...STATISTICS_SCORES_TOUR_GAME,
  id: 'fixture-tour-team-breakdown',
});

export const STATISTICS_SCORES_TOUR_TEAM_DETAIL = Object.freeze({
  ...STATISTICS_SCORES_TOUR_DETAIL,
  statGroups: [
    { id: 'offense', label: 'Offense', stats: [
      { label: 'Total yards', away: 75, home: 15, direction: 'higher' },
      { label: 'Passing yards', away: 44, home: 7, direction: 'higher' },
      { label: 'Rushing yards', away: 31, home: 0, direction: 'higher' },
      { label: 'First downs', away: 4, home: 1, direction: 'higher' },
    ] },
    { id: 'defense', label: 'Defense', stats: [
      { label: 'Sacks', away: 1, home: 0, direction: 'higher' },
    ] },
    { id: 'discipline', label: 'Discipline', stats: [
      { label: 'Penalties', away: '1–20', home: '0–0', awayRatio: 20, homeRatio: 0, direction: 'lower' },
    ] },
  ],
  playerGroups: [
    { id: 'passing', label: 'Passing', columns: ['C/ATT', 'YDS', 'TD', 'INT'], rows: [
      boxRow(AWAY.id, 'Jared Goff', 'QB', ['2/2', '44', '0', '0']),
      boxRow(HOME.id, 'Jordan Love', 'QB', ['1/2', '15', '0', '0']),
    ] },
    { id: 'rushing', label: 'Rushing', columns: ['CAR', 'YDS', 'TD'], rows: [
      boxRow(AWAY.id, 'Jahmyr Gibbs', 'RB', ['2', '31', '1']),
    ] },
    { id: 'receiving', label: 'Receiving', columns: ['REC', 'YDS', 'TD'], rows: [
      boxRow(AWAY.id, 'Jameson Williams', 'WR', ['1', '32', '0']),
      boxRow(AWAY.id, 'Amon-Ra St. Brown', 'WR', ['1', '12', '0']),
      boxRow(HOME.id, 'Tucker Kraft', 'TE', ['1', '15', '0']),
    ] },
    { id: 'defense', label: 'Defense', columns: ['TOT', 'SACK'], rows: [
      boxRow(AWAY.id, 'Aidan Hutchinson', 'DE', ['1', '1.0']),
      boxRow(AWAY.id, 'Kerby Joseph', 'S', ['0', '0.0']),
    ] },
  ],
  drives: [
    {
      id: 'tour-team-drive-1',
      quarter: '1st',
      team: AWAY.id,
      result: 'Touchdown',
      score: `${AWAY.id} 7–0`,
      playCount: 4,
      plays: [
        breakdownPlay('tour-team-1', AWAY.id, 'tour-team-drive-1', '15:00', 'Jared Goff Pass Complete for 12 Yds to Amon-Ra St. Brown',
          'J.Goff pass short right to A.St. Brown to DET 37 for 12 yards (X.McKinney).', { slug: 'pass-reception', start: 75, end: 63, yards: 12 }),
        breakdownPlay('tour-team-2', AWAY.id, 'tour-team-drive-1', '14:18', 'Jahmyr Gibbs 17 Yd Rush',
          'J.Gibbs left end to GB 46 for 17 yards (E.Cooper).', { slug: 'rush', start: 63, end: 46, yards: 17 }),
        breakdownPlay('tour-team-3', AWAY.id, 'tour-team-drive-1', '13:31', 'Jared Goff Pass Complete for 32 Yds to Jameson Williams',
          'J.Goff pass deep left to J.Williams to GB 14 for 32 yards (K.Nixon).', { slug: 'pass-reception', start: 46, end: 14, yards: 32 }),
        breakdownPlay('tour-team-4', AWAY.id, 'tour-team-drive-1', '12:49', 'Jahmyr Gibbs 14 Yd Rush',
          'J.Gibbs up the middle for 14 yards, TOUCHDOWN.', { slug: 'rushing-touchdown', start: 14, end: 0, yards: 14, scoring: true, awayScore: 7 }),
      ],
    },
    {
      id: 'tour-team-drive-2',
      quarter: '1st',
      team: HOME.id,
      result: 'Drive',
      score: '',
      playCount: 3,
      plays: [
        breakdownPlay('tour-team-5', HOME.id, 'tour-team-drive-2', '12:40', 'Jordan Love Pass Complete for 15 Yds to Tucker Kraft',
          'J.Love pass short middle to T.Kraft to GB 40 for 15 yards (J.Campbell).', { slug: 'pass-reception', start: 75, end: 60, yards: 15, awayScore: 7 }),
        breakdownPlay('tour-team-6', HOME.id, 'tour-team-drive-2', '12:01', 'Jordan Love Sacked by Aidan Hutchinson For 8 Yd Loss',
          'J.Love sacked at GB 32 for -8 yards (A.Hutchinson).', { slug: 'sack', start: 60, end: 68, yards: -8, awayScore: 7 }),
        breakdownPlay('tour-team-7', HOME.id, 'tour-team-drive-2', '11:20', 'Jordan Love Incomplete Pass, Intended For Christian Watson Kerby Joseph 20 Yd Pnlty',
          'J.Love pass deep right intended for C.Watson INCOMPLETE. PENALTY on DET-K.Joseph, Defensive Pass Interference, 20 yards, enforced at GB 32 - No Play.', { slug: 'penalty', start: 68, end: 48, yards: 20, awayScore: 7 }),
      ],
    },
  ],
});

/* ---------- Pregame matchup tour preview ---------- */

export const STATISTICS_SCORES_TOUR_PREGAME_GAME = Object.freeze({
  id: 'fixture-tour-pregame',
  provider: 'fixture',
  status: 'scheduled',
  statusLabel: 'Sun 1:00 PM',
  dateLabel: 'Sun · Tour preview',
  away: AWAY,
  home: HOME,
  score: { away: null, home: null },
});

export const STATISTICS_SCORES_TOUR_PREGAME_DETAIL = Object.freeze({
  status: 'scheduled',
  statusLabel: 'Sun 1:00 PM',
  venue: 'Tour preview',
  network: 'Game detail demo',
  away: AWAY,
  home: HOME,
  score: { away: null, home: null },
  possession: null,
  statGroups: [],
  playerGroups: [],
  leaders: [],
  drives: [],
});

const teamLine = (yards, passing, rushing, turnovers, third, red) => ({
  total_yards: yards, net_passing_yards: passing, rushing_yards: rushing,
  total_offensive_plays: 62, first_downs: Math.round(yards / 17), sacks: 2, turnovers,
  third_down_conversions: third, third_down_attempts: 12, fourth_down_conversions: 1, fourth_down_attempts: 1,
  red_zone_scores: red, red_zone_attempts: 4, penalties: 6, penalty_yards: 48, possession_time_seconds: 1800,
});

// One season's worth of a player's weekly box lines, scaled per game.
const seasonPlayer = (id, n, pos, perGame) => (week) => ({ id, n, pos, ...Object.fromEntries(Object.entries(perGame).map(([key, value]) => [key, Math.round(value * (0.8 + (week % 3) * 0.2))])) });

function tourSeason(team, { record, ranks, results, players }) {
  return {
    standings: [{ t: team, w: record[0], l: record[1], tie: 0 }],
    ranks: Object.entries(ranks).map(([key, r]) => ({ key, vals: [{ t: team, r }] })),
    games: results.map(([week, opp, home, pf, pa, line], index) => ({
      id: `tour-${team}-${week}`,
      week,
      opp,
      home,
      pf,
      pa,
      ts: { me: teamLine(...line), opp: teamLine(320, 220, 100, 1, 5, 2) },
      lines: players.map((player) => player(week + index)),
    })),
  };
}

export const STATISTICS_SCORES_TOUR_SEASONS = Object.freeze({
  away: tourSeason(AWAY.id, {
    record: [4, 1],
    ranks: { pts: 2, pass: 5, rush: 4, td3: 3, rz: 6, ptsA: 11, passA: 14, rushA: 8, td3A: 12, rzA: 9, yds: 3 },
    results: [
      [1, 'CHI', true, 31, 20, [402, 268, 134, 0, 7, 3]],
      [2, 'TB', false, 24, 27, [366, 251, 115, 2, 5, 2]],
      [3, 'MIN', true, 34, 17, [421, 280, 141, 1, 8, 4]],
      [4, 'SEA', false, 28, 24, [389, 244, 145, 1, 6, 3]],
      [5, 'DAL', true, 30, 13, [411, 262, 149, 0, 7, 3]],
    ],
    players: [
      seasonPlayer(1, 'Jared Goff', 'QB', { passing_completions: 24, passing_attempts: 33, passing_yards: 262, passing_touchdowns: 2, passing_interceptions: 0.6 }),
      seasonPlayer(2, 'Jahmyr Gibbs', 'RB', { rushing_attempts: 16, rushing_yards: 88, rushing_touchdowns: 1, receptions: 3, receiving_yards: 24 }),
      seasonPlayer(3, 'Amon-Ra St. Brown', 'WR', { receptions: 7, receiving_yards: 89, receiving_touchdowns: 0.8 }),
      seasonPlayer(4, 'Sam LaPorta', 'TE', { receptions: 4, receiving_yards: 46, receiving_touchdowns: 0.4 }),
      seasonPlayer(5, 'Aidan Hutchinson', 'DE', { defensive_sacks: 1, tackles_for_loss: 1.5, total_tackles: 4 }),
      seasonPlayer(6, 'Jack Campbell', 'LB', { total_tackles: 8, tackles_for_loss: 1, defensive_sacks: 0.4 }),
      seasonPlayer(7, 'Terrion Arnold', 'CB', { passes_defended: 1.4, defensive_interceptions: 0.4, total_tackles: 4 }),
      seasonPlayer(8, 'Kerby Joseph', 'S', { total_tackles: 5, defensive_interceptions: 0.4, passes_defended: 1 }),
      seasonPlayer(9, 'Jake Bates', 'K', { field_goals_made: 2, field_goal_attempts: 2, long_field_goal_made: 52, extra_points_made: 3 }),
      seasonPlayer(10, 'Jack Fox', 'P', { punts: 3, punt_yards: 145, punts_inside_20: 1 }),
    ],
  }),
  home: tourSeason(HOME.id, {
    record: [3, 2],
    ranks: { pts: 9, pass: 12, rush: 7, td3: 10, rz: 14, ptsA: 5, passA: 6, rushA: 10, td3A: 4, rzA: 7, yds: 11 },
    results: [
      [1, 'DET', false, 20, 23, [338, 230, 108, 1, 5, 2]],
      [2, 'WAS', true, 27, 18, [371, 248, 123, 0, 6, 3]],
      [3, 'CLE', false, 10, 13, [289, 190, 99, 2, 4, 1]],
      [4, 'DAL', true, 31, 24, [402, 276, 126, 1, 7, 3]],
      [5, 'CIN', false, 17, 20, [318, 214, 104, 1, 5, 2]],
    ],
    players: [
      seasonPlayer(21, 'Jordan Love', 'QB', { passing_completions: 21, passing_attempts: 32, passing_yards: 241, passing_touchdowns: 1.6, passing_interceptions: 0.6 }),
      seasonPlayer(22, 'Josh Jacobs', 'RB', { rushing_attempts: 18, rushing_yards: 79, rushing_touchdowns: 0.8, receptions: 2, receiving_yards: 15 }),
      seasonPlayer(23, 'Christian Watson', 'WR', { receptions: 4, receiving_yards: 68, receiving_touchdowns: 0.6 }),
      seasonPlayer(24, 'Tucker Kraft', 'TE', { receptions: 5, receiving_yards: 58, receiving_touchdowns: 0.6 }),
      seasonPlayer(25, 'Rashan Gary', 'DE', { defensive_sacks: 0.8, tackles_for_loss: 1, total_tackles: 4 }),
      seasonPlayer(26, 'Quay Walker', 'LB', { total_tackles: 9, tackles_for_loss: 0.8, defensive_sacks: 0.2 }),
      seasonPlayer(27, 'Jaire Alexander', 'CB', { passes_defended: 1.2, defensive_interceptions: 0.2, total_tackles: 3 }),
      seasonPlayer(28, 'Xavier McKinney', 'S', { total_tackles: 6, defensive_interceptions: 0.6, passes_defended: 1 }),
      seasonPlayer(29, 'Brandon McManus', 'K', { field_goals_made: 2, field_goal_attempts: 2.4, long_field_goal_made: 50, extra_points_made: 2 }),
      seasonPlayer(30, 'Daniel Whelan', 'P', { punts: 4, punt_yards: 188, punts_inside_20: 1.4 }),
    ],
  }),
});
