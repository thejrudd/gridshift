import { DEFAULT_SCORING } from '../../src/utils/scoringEngine.js';

export const TEST_SEASON = '2026';
export const TEST_LEAGUE_ID = 'league-73';
export const TEST_USER_ID = 'user-me';

export const league = {
  league_id: TEST_LEAGUE_ID,
  name: 'GridShift Test League',
  season: TEST_SEASON,
  previous_league_id: null,
  settings: {
    type: 0,
    playoff_week_start: 15,
    last_scored_leg: 6,
    draft_rounds: 3,
  },
  scoring_settings: {
    rec: 1,
    pass_td: 4,
    rush_yd: 0.1,
    rec_yd: 0.1,
    pass_yd: 0.04,
    pass_int: -2,
    rush_td: 6,
    rec_td: 6,
  },
  roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'BN', 'BN', 'BN'],
};

export const sleeperUser = {
  user_id: TEST_USER_ID,
  username: 'gridshift_tester',
  display_name: 'GridShift Tester',
};

export const leaguesBySeason = {
  [TEST_SEASON]: [league],
};

export const leagueUsers = [
  { user_id: TEST_USER_ID, display_name: 'You', username: 'you', metadata: { team_name: 'Your Team' }, avatar: null },
  { user_id: 'user-partner', display_name: 'Trade Partner', username: 'partner', metadata: { team_name: 'Partner Team' }, avatar: null },
  { user_id: 'user-third', display_name: 'Third Manager', username: 'third', metadata: { team_name: 'Third Team' }, avatar: null },
];

export const rosters = [
  {
    roster_id: 1,
    owner_id: TEST_USER_ID,
    players: ['101', '102', '103', '104', '105', '106'],
    reserve: [],
    settings: { wins: 4, losses: 2, ties: 0, fpts: 720, fpts_decimal: 50 },
  },
  {
    roster_id: 2,
    owner_id: 'user-partner',
    players: ['201', '202', '203', '204', '205', '206'],
    reserve: [],
    settings: { wins: 2, losses: 4, ties: 0, fpts: 640, fpts_decimal: 10 },
  },
  {
    roster_id: 3,
    owner_id: 'user-third',
    players: ['301', '302', '303', '304', '305', '306'],
    reserve: [],
    settings: { wins: 3, losses: 3, ties: 0, fpts: 670, fpts_decimal: 25 },
  },
];

export const players = {
  101: player('101', 'Pocket Commander', 'QB', 'BUF', '1001'),
  102: player('102', 'Volume Runner', 'RB', 'KC', '1002'),
  103: player('103', 'Flex Receiver', 'WR', 'DET', '1003'),
  104: player('104', 'Target Magnet', 'WR', 'DAL', '1004'),
  105: player('105', 'Chain Tight End', 'TE', 'SF', '1005'),
  106: player('106', 'Bench Runner', 'RB', 'GB', '1006'),
  201: player('201', 'Upgrade Runner', 'RB', 'MIA', '2001'),
  202: player('202', 'Partner Quarterback', 'QB', 'LAC', '2002'),
  203: player('203', 'Partner Receiver', 'WR', 'CIN', '2003'),
  204: player('204', 'Partner Tight End', 'TE', 'BAL', '2004'),
  205: player('205', 'Depth Runner', 'RB', 'CHI', '2005'),
  206: player('206', 'Depth Receiver', 'WR', 'NYJ', '2006'),
  301: player('301', 'Third Runner', 'RB', 'ATL', '3001'),
  302: player('302', 'Third Quarterback', 'QB', 'PHI', '3002'),
  303: player('303', 'Third Receiver', 'WR', 'SEA', '3003'),
  304: player('304', 'Third Tight End', 'TE', 'MIN', '3004'),
  305: player('305', 'Third Bench Runner', 'RB', 'ARI', '3005'),
  306: player('306', 'Third Bench Receiver', 'WR', 'PIT', '3006'),
};

export const ktcPlayers = [
  ktc('1001', 'Pocket Commander', 'QB', 4200),
  ktc('1002', 'Volume Runner', 'RB', 3300),
  ktc('1003', 'Flex Receiver', 'WR', 2800),
  ktc('1004', 'Target Magnet', 'WR', 3600),
  ktc('1005', 'Chain Tight End', 'TE', 2500),
  ktc('1006', 'Bench Runner', 'RB', 1600),
  ktc('2001', 'Upgrade Runner', 'RB', 5600),
  ktc('2002', 'Partner Quarterback', 'QB', 3900),
  ktc('2003', 'Partner Receiver', 'WR', 3000),
  ktc('2004', 'Partner Tight End', 'TE', 2200),
  ktc('2005', 'Depth Runner', 'RB', 1400),
  ktc('2006', 'Depth Receiver', 'WR', 1300),
  ktc('3001', 'Third Runner', 'RB', 4900),
  ktc('3002', 'Third Quarterback', 'QB', 3800),
  ktc('3003', 'Third Receiver', 'WR', 3100),
  ktc('3004', 'Third Tight End', 'TE', 2100),
  ktc('3005', 'Third Bench Runner', 'RB', 1200),
  ktc('3006', 'Third Bench Receiver', 'WR', 1100),
  ktc('9001', '2027 Early 1st', 'RDP', 5200),
  ktc('9002', '2027 Mid 1st', 'RDP', 4300),
  ktc('9003', '2027 Late 1st', 'RDP', 3400),
  ktc('9004', '2027 Early 2nd', 'RDP', 2400),
  ktc('9005', '2027 Mid 2nd', 'RDP', 1900),
  ktc('9006', '2027 Late 2nd', 'RDP', 1400),
  ktc('9007', '2027 Early 3rd', 'RDP', 950),
  ktc('9008', '2027 Mid 3rd', 'RDP', 700),
  ktc('9009', '2027 Late 3rd', 'RDP', 500),
];

export const tradedPicks = [
  { season: '2027', round: 2, roster_id: 1, owner_id: 2 },
  { season: '2027', round: 3, roster_id: 2, owner_id: 1 },
];

export const drafts = [
  {
    draft_id: 'draft-2026',
    season: TEST_SEASON,
    status: 'complete',
    settings: { rounds: 3 },
    draft_order: { [TEST_USER_ID]: 1, 'user-partner': 2, 'user-third': 3 },
  },
];

export function persistedSleeperState() {
  return {
    sleeperUser,
    leagues: [league],
    selectedLeagueId: TEST_LEAGUE_ID,
    league,
    rosters,
    leagueUsers,
    season: TEST_SEASON,
    availableSeasons: [TEST_SEASON],
    leaguesBySeason,
    scoringSettings: { ...DEFAULT_SCORING, ...league.scoring_settings },
  };
}

export function weeklyStatsForWeek(week) {
  return Object.fromEntries(
    Object.entries({
      101: { pass_yd: 260, pass_td: 2, pass_int: week % 5 === 0 ? 1 : 0, gp: 1 },
      102: { rush_yd: 82, rush_td: week % 3 === 0 ? 1 : 0, rec: 3, rec_yd: 24, gp: 1 },
      103: { rec: 4, rec_yd: 48, rec_td: week % 4 === 0 ? 1 : 0, gp: 1 },
      104: { rec: 7, rec_yd: 92, rec_td: week % 3 === 0 ? 1 : 0, gp: 1 },
      105: { rec: 5, rec_yd: 44, gp: 1 },
      106: { rush_yd: 34, rec: 1, rec_yd: 8, gp: 1 },
      201: { rush_yd: 112, rush_td: week % 2 === 0 ? 1 : 0, rec: 4, rec_yd: 35, gp: 1 },
      202: { pass_yd: 240, pass_td: 2, pass_int: 0, gp: 1 },
      203: { rec: 5, rec_yd: 58, gp: 1 },
      204: { rec: 4, rec_yd: 38, gp: 1 },
      205: { rush_yd: 28, rec: 1, rec_yd: 7, gp: 1 },
      206: { rec: 2, rec_yd: 22, gp: 1 },
      301: { rush_yd: 98, rush_td: week % 3 === 0 ? 1 : 0, rec: 2, rec_yd: 18, gp: 1 },
      302: { pass_yd: 235, pass_td: 1, pass_int: 0, gp: 1 },
      303: { rec: 6, rec_yd: 68, gp: 1 },
      304: { rec: 3, rec_yd: 31, gp: 1 },
      305: { rush_yd: 21, gp: 1 },
      306: { rec: 2, rec_yd: 18, gp: 1 },
    }).map(([id, stats]) => [id, { ...stats, week }]),
  );
}

export function matchupsForWeek(week) {
  const myPoints = {
    101: 20.4 + (week % 3),
    102: 14.2 + (week % 4),
    103: 9.4,
    104: 16.7,
    105: 17.15,
    106: 5.7,
  };
  const partnerPoints = {
    201: 21.9,
    202: 1.92 + (week % 2),
    203: 10.1,
    204: 18.3,
    205: 15,
    206: 6.2,
  };
  const thirdPoints = {
    301: 18.4,
    302: 12.5,
    303: 11.3,
    304: 8.6,
    305: 3.2,
    306: 4.8,
  };

  return [
    matchup(1, 1, ['101', '102', '103', '104', '105'], ['101', '102', '103', '104', '105', '106'], myPoints),
    matchup(2, 1, ['202', '201', '204', '203', '205'], ['201', '202', '203', '204', '205', '206'], partnerPoints),
    matchup(3, 2, ['302', '301', '303', '304', '305'], ['301', '302', '303', '304', '305', '306'], thirdPoints),
  ];
}

function player(id, fullName, position, team, mflid) {
  const [first_name, ...lastParts] = fullName.split(' ');
  return {
    player_id: id,
    first_name,
    last_name: lastParts.join(' '),
    full_name: fullName,
    position,
    team,
    mflid,
    espn_id: mflid,
    years_exp: 3,
    number: '1',
    fantasy_positions: [position],
    active: true,
  };
}

function matchup(rosterId, matchupId, starters, rosterPlayers, playersPoints) {
  return {
    roster_id: rosterId,
    matchup_id: matchupId,
    starters,
    players: rosterPlayers,
    players_points: playersPoints,
    points: Math.round(Object.values(playersPoints).reduce((sum, value) => sum + value, 0) * 100) / 100,
  };
}

function ktc(mflid, playerName, position, value) {
  return {
    mflid,
    playerName,
    position,
    oneQBValues: {
      value,
      overall7DayTrend: 0,
      overallTrend: 0,
    },
    superflexValues: {
      value,
      overall7DayTrend: 0,
      overallTrend: 0,
    },
  };
}

export function ktcHtml() {
  return `<html><body><script>var playersArray = ${JSON.stringify(ktcPlayers)};</script></body></html>`;
}
