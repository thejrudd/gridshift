import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFantasyInjuryReport,
  filterFantasyInjuryReport,
  getFantasyInjuryPositionOptions,
  getFantasyInjurySleeperCandidateTeams,
  getFantasyInjuryPracticeLabel,
  isFantasyInjuryCurrentSeason,
  isFantasyInjuryLeagueSnapshotReady,
} from '../../src/utils/fantasyInjuries.js';

test('injury reports require the selected league snapshot to match the active season', () => {
  assert.equal(isFantasyInjuryLeagueSnapshotReady({ season: '2026', leagueSeason: '2026' }), true);
  assert.equal(isFantasyInjuryLeagueSnapshotReady({ season: '2026', leagueSeason: '2025' }), false);
  assert.equal(isFantasyInjuryLeagueSnapshotReady({ season: '2026', leagueSeason: '2026', seasonSwitching: '2026' }), false);
  assert.equal(isFantasyInjuryLeagueSnapshotReady({ season: '2026', leagueSeason: null }), false);
});

test('injury reports require Sleeper current NFL state to match the selected season', () => {
  assert.equal(isFantasyInjuryCurrentSeason({ selectedSeason: '2026', nflSeason: 2026 }), true);
  assert.equal(isFantasyInjuryCurrentSeason({ selectedSeason: '2025', nflSeason: 2026 }), false);
  assert.equal(isFantasyInjuryCurrentSeason({ selectedSeason: '2026', nflSeason: null }), false);
});

const users = [
  { user_id: 'u1', display_name: 'Justin', username: 'jruddick', avatar: 'a1', metadata: { team_name: 'Sunday Shift' } },
  { user_id: 'u2', display_name: 'Alex', username: 'waiver_wizard', metadata: { team_name: 'Fourth & Long' } },
];

function designation({ name, team = 'WAS', position = 'DT', ...facts }) {
  const parts = name.split(' ');
  return {
    player: { first_name: parts[0], last_name: parts.slice(1).join(' '), position_abbreviation: position },
    team: { abbreviation: team },
    ...facts,
  };
}

test('assembles players, reserve, and taxi once and attaches owner and fantasy-team identity', () => {
  const rows = buildFantasyInjuryReport({
    players: {
      p1: { full_name: 'Jordan Reed Jr.', position: 'DE', team: 'WAS', injury_status: 'Questionable' },
      p2: { full_name: 'Reserve Receiver', position: 'WR', team: 'BUF' },
      p3: { full_name: 'Taxi Safety', position: 'S', team: 'BUF', injury_status: 'PUP' },
    },
    rosters: [{ roster_id: 'r1', owner_id: 'u1', players: ['p1', 'p2'], reserve: ['p2'], taxi: ['p3'] }],
    leagueUsers: users,
    sleeperUser: { user_id: 'u1' },
    designationRows: [designation({
      name: 'Jordan Reed',
      game_status: 'Questionable',
      practice_reports: [{ date: '2026-09-10', status: 'Limited Participation' }],
    })],
  });

  assert.equal(rows.length, 3);
  assert.equal(rows.filter((row) => row.playerId === 'p2').length, 1);
  assert.equal(rows.find((row) => row.playerId === 'p2').sleeper.status, 'Injured Reserve');
  assert.equal(rows[0].isCurrentUser, true);
  assert.equal(rows[0].fantasyTeamName, 'Sunday Shift');
  assert.equal(rows[0].ownerName, 'Justin');
  assert.equal(rows[0].ownerAvatar, 'a1');
});

test('matches suffix aliases, team aliases, and compatible IDP position families for a Sleeper concern', () => {
  const rows = buildFantasyInjuryReport({
    players: { p1: { full_name: 'Jordan Reed Jr.', position: 'DE', team: 'WSH', injury_status: 'Questionable' } },
    rosters: [{ roster_id: 'r1', owner_id: 'u1', players: ['p1'] }],
    designationRows: [designation({
      name: 'Jordan Reed',
      team: 'WAS',
      position: 'DT',
      injury: 'Knee',
    })],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].position, 'DL');
  assert.equal(rows[0].bdl.injury, 'Knee');
});

test('requires a unique full identity and never falls back to name only', () => {
  const base = {
    players: { a: { full_name: 'Same Name', position: 'WR', team: 'BUF' } },
    rosters: [{ roster_id: 'r1', owner_id: 'u1', players: ['a'] }],
  };
  assert.equal(buildFantasyInjuryReport({
    ...base,
    designationRows: [{ player: { full_name: 'Same Name', position_abbreviation: 'WR' }, injury: 'Ankle' }],
  }).length, 0);
  assert.equal(buildFantasyInjuryReport({
    ...base,
    designationRows: [
      designation({ name: 'Same Name', team: 'BUF', position: 'WR', injury: 'Ankle' }),
      designation({ name: 'Same Name', team: 'BUF', position: 'WR', game_status: 'Out' }),
    ],
  }).length, 0);
});

test('does not attach an ambiguous provider identity to duplicate roster identities', () => {
  const rows = buildFantasyInjuryReport({
    players: {
      a: { full_name: 'Duplicate Player', position: 'CB', team: 'BUF' },
      b: { full_name: 'Duplicate Player', position: 'S', team: 'BUF' },
    },
    rosters: [
      { roster_id: 'r1', owner_id: 'u1', players: ['a'] },
      { roster_id: 'r2', owner_id: 'u2', players: ['b'] },
    ],
    designationRows: [designation({ name: 'Duplicate Player', team: 'BUF', position: 'CB', injury: 'Hamstring' })],
  });
  assert.equal(rows.length, 0);
});

test('excludes D/ST identities', () => {
  const rows = buildFantasyInjuryReport({
    players: { dst: { full_name: 'Buffalo Bills', position: 'DEF', team: 'BUF' } },
    rosters: [{ roster_id: 'r1', owner_id: 'u1', players: ['dst'] }],
    designationRows: [designation({ name: 'Buffalo Bills', team: 'BUF', position: 'DEF', injury: 'Unknown' })],
  });
  assert.equal(rows.length, 0);
});

test('preserves null availability facts and ignores healthy participation facts alone', () => {
  const base = {
    players: { a: { full_name: 'Active Player', position: 'WR', team: 'BUF' } },
    rosters: [{ roster_id: 'r1', owner_id: 'u1', players: ['a'] }],
  };
  assert.equal(buildFantasyInjuryReport({
    ...base,
    designationRows: [designation({ name: 'Active Player', team: 'BUF', position: 'WR', active: true, starter: true, did_not_play: false })],
  }).length, 0);

  const rows = buildFantasyInjuryReport({
    ...base,
    players: { a: { ...base.players.a, injury_status: 'Questionable' } },
    designationRows: [designation({ name: 'Active Player', team: 'BUF', position: 'WR', injury: 'Shoulder', active: null, starter: null, did_not_play: null })],
  });
  assert.equal(rows[0].bdl.active, null);
  assert.equal(rows[0].bdl.starter, null);
  assert.equal(rows[0].bdl.didNotPlay, null);
});

test('uses Sleeper concerns as the report candidate list and only requests their teams for enrichment', () => {
  const input = {
    players: {
      sleeperConcern: { full_name: 'Sleeper Concern', position: 'WR', team: 'BUF', injury_status: 'Questionable' },
      providerOnly: { full_name: 'Provider Only', position: 'RB', team: 'KC' },
      unmatchable: { full_name: 'Teamless Concern', position: 'WR', injury_status: 'Out' },
    },
    rosters: [{ roster_id: 'r1', owner_id: 'u1', players: ['sleeperConcern', 'providerOnly', 'unmatchable'] }],
  };
  assert.deepEqual(getFantasyInjurySleeperCandidateTeams(input), ['BUF']);

  const rows = buildFantasyInjuryReport({
    ...input,
    designationRows: [
      designation({ name: 'Sleeper Concern', team: 'BUF', position: 'WR', practice_reports: [{ date: '2026-09-10', status: 'limited' }] }),
      designation({ name: 'Provider Only', team: 'KC', position: 'RB', game_status: 'Out' }),
    ],
  });
  assert.deepEqual(rows.map((row) => row.playerId), ['unmatchable', 'sleeperConcern']);
  assert.equal(rows.find((row) => row.playerId === 'sleeperConcern').bdl.latestPractice.status, 'Limited practice');
  assert.equal(rows.some((row) => row.playerId === 'providerOnly'), false);
});

test('keeps a Sleeper-only concern when a bye or missing designation leaves BDL unknown', () => {
  const rows = buildFantasyInjuryReport({
    players: { a: { full_name: 'Bye Player', position: 'WR', team: 'BUF', injury_status: 'PUP' } },
    rosters: [{ roster_id: 'r1', owner_id: 'u1', players: ['a'] }],
    designationRows: [],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'PUP');
  assert.equal(rows[0].bdl, null);
  assert.equal(rows[0].urgency, 7);
});

test('sorts current user players first, then by urgency, owner name, and player name', () => {
  const players = {
    inactive: { full_name: 'Zulu Inactive', position: 'WR', team: 'BUF', injury_status: 'Questionable' },
    doubtful: { full_name: 'Doubtful Player', position: 'RB', team: 'BUF', injury_status: 'Doubtful' },
    questionable: { full_name: 'Questionable Player', position: 'TE', team: 'BUF', injury_status: 'Questionable' },
    dnp: { full_name: 'No Practice', position: 'LB', team: 'BUF', injury_status: 'Questionable' },
    limited: { full_name: 'Limited Player', position: 'CB', team: 'BUF', injury_status: 'Questionable' },
    context: { full_name: 'Injury Context', position: 'S', team: 'BUF', injury_status: 'Questionable' },
    reserve: { full_name: 'Reserve Player', position: 'QB', team: 'BUF', injury_status: 'IR' },
    outMe: { full_name: 'My Out', position: 'K', team: 'BUF', injury_status: 'Out' },
  };
  const rows = buildFantasyInjuryReport({
    players,
    rosters: [
      { roster_id: 'r1', owner_id: 'u2', players: ['inactive', 'doubtful', 'questionable', 'dnp', 'limited', 'context', 'reserve'] },
      { roster_id: 'r2', owner_id: 'u1', players: ['outMe'] },
    ],
    leagueUsers: users,
    sleeperUser: { user_id: 'u1' },
    designationRows: [
      designation({ name: 'Zulu Inactive', team: 'BUF', position: 'WR', active: false }),
      designation({ name: 'Doubtful Player', team: 'BUF', position: 'RB', game_status: 'Doubtful' }),
      designation({ name: 'Questionable Player', team: 'BUF', position: 'TE', game_status: 'Questionable' }),
      designation({ name: 'No Practice', team: 'BUF', position: 'LB', practice_reports: [{ date: '2026-09-10', status: 'DNP' }] }),
      designation({ name: 'Limited Player', team: 'BUF', position: 'CB', practice_reports: [{ date: '2026-09-10', status: 'Limited' }] }),
      designation({ name: 'Injury Context', team: 'BUF', position: 'S', injury: 'Knee' }),
      designation({ name: 'My Out', team: 'BUF', position: 'K', game_status: 'Out' }),
    ],
  });
  assert.deepEqual(rows.map((row) => row.urgency), [1, 1, 2, 3, 3, 3, 3, 7]);
  assert.equal(rows[0].displayName, 'My Out');
});

test('current user players lead even when another manager has a more urgent concern', () => {
  const rows = buildFantasyInjuryReport({
    players: {
      mine: { full_name: 'My Questionable', position: 'WR', team: 'BUF', injury_status: 'Questionable' },
      theirs: { full_name: 'Their Out', position: 'RB', team: 'BUF', injury_status: 'Out' },
    },
    rosters: [
      { roster_id: 'mine-roster', owner_id: 'u1', players: ['mine'] },
      { roster_id: 'their-roster', owner_id: 'u2', players: ['theirs'] },
    ],
    leagueUsers: users,
    sleeperUser: { user_id: 'u1' },
  });
  assert.deepEqual(rows.map((row) => row.displayName), ['My Questionable', 'Their Out']);
});

test('normalizes chronological practice history and compact DNP, LP, and FP labels', () => {
  const base = {
    players: { a: { full_name: 'Practice Player', position: 'WR', team: 'BUF', injury_status: 'Questionable' } },
    rosters: [{ roster_id: 'r1', owner_id: 'u1', players: ['a'] }],
  };
  const rows = buildFantasyInjuryReport({
    ...base,
    designationRows: [designation({
      name: 'Practice Player', team: 'BUF', position: 'WR', injury: 'Ankle',
      practice_reports: [
        { date: '2026-09-12', status: 'Full Participation' },
        { date: '2026-09-10', status: 'Did Not Participate' },
        { date: '2026-09-11', status: 'Limited Participation' },
      ],
    })],
  });
  assert.deepEqual(rows[0].bdl.practiceReports.map((report) => report.status), ['Did not practice', 'Limited practice', 'Full practice']);
  assert.equal(getFantasyInjuryPracticeLabel(rows[0], true), 'FP');
});

test('filters with AND between categories, OR within menus, and player-name search', () => {
  const rows = buildFantasyInjuryReport({
    players: {
      a: { full_name: 'Alex Search Trap', position: 'LB', team: 'BUF', injury_status: 'Out' },
      b: { full_name: 'B Player', position: 'CB', team: 'WAS', injury_status: 'Questionable' },
      c: { full_name: 'C Player', position: 'S', team: 'NYJ', injury_status: 'PUP' },
    },
    rosters: [
      { roster_id: 'r1', owner_id: 'u1', players: ['a'] },
      { roster_id: 'r2', owner_id: 'u2', players: ['b', 'c'] },
    ],
    leagueUsers: users,
  });
  assert.equal(filterFantasyInjuryReport(rows, { position: 'DB', nflTeams: ['WAS', 'NYJ'], rosterIds: ['r2'], playerQuery: 'Player' }).length, 2);
  assert.equal(filterFantasyInjuryReport(rows, { playerQuery: 'Alex' }).length, 1);
  assert.equal(filterFantasyInjuryReport(rows, { playerQuery: 'Search Trap' }).length, 1);
  assert.equal(filterFantasyInjuryReport(rows, { playerQuery: 'waiver' }).length, 0);
  assert.deepEqual(getFantasyInjuryPositionOptions(rows), ['DB', 'LB']);
});
