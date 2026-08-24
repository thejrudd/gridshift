import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ESPN_CURRENT_USER_ID,
  getEspnTeamDefensePlayerId,
  normalizeEspnLeaguePayload,
} from '../../src/utils/espnFantasyAdapter.js';
import { calcPoints } from '../../src/utils/scoringEngine.js';

const fixture = {
  id: 321,
  _gridshift: { currentTeamId: 1 },
  settings: {
    name: 'Adapter League',
    seasonId: 2025,
    size: 2,
    scoringSettings: {
      scoringItems: [
        { statId: 24, points: 0.1, pointsOverrides: { 2: 0.2 } },
        { statId: 53, points: 1 },
      ],
    },
    rosterSettings: {
      lineupSlotCounts: { 0: 1, 2: 2, 4: 2, 6: 1, 20: 6 },
    },
    scheduleSettings: { matchupPeriodCount: 14, playoffMatchupPeriodLength: 2 },
  },
  teams: [
    {
      id: 1,
      primaryOwner: '{USER-GUID}',
      name: 'Home Team',
      abbrev: 'HME',
      record: { overall: { wins: 3, losses: 1, ties: 0, pointsFor: 450 } },
      roster: {
        entries: [
          {
            lineupSlotId: 2,
            playerId: 101,
            playerPoolEntry: {
              appliedStatTotal: 8,
              player: { id: 101, fullName: 'Example Runner', firstName: 'Example', lastName: 'Runner', defaultPositionId: 2, proTeamId: 2, headshot: { href: 'https://img.example/runner.png' } },
              stats: [
                { statSourceId: 0, statSplitTypeId: 1, scoringPeriodId: 1, stats: { 24: 50, 53: 3 }, appliedStats: { 24: 10 }, appliedTotal: 8 },
                { statSourceId: 0, statSplitTypeId: 0, stats: { 24: 50, 53: 3 }, appliedTotal: 8 },
              ],
            },
          },
        ],
      },
    },
    {
      id: 2,
      primaryOwner: '{OTHER-GUID}',
      name: 'Away Team',
      abbrev: 'AWY',
      record: { overall: { wins: 1, losses: 3, ties: 0, pointsFor: 320 } },
      roster: { entries: [] },
    },
  ],
  schedule: [
    {
      id: 9001,
      matchupPeriodId: 1,
      home: {
        teamId: 1,
        totalPoints: 88,
        rosterForCurrentScoringPeriod: {
          entries: [
            {
              lineupSlotId: 2,
              playerId: 101,
              playerPoolEntry: {
                appliedStatTotal: 8,
                player: { id: 101, fullName: 'Example Runner', firstName: 'Example', lastName: 'Runner', defaultPositionId: 2, proTeamId: 2, headshot: { href: 'https://img.example/runner.png' } },
                stats: [{ statSourceId: 0, statSplitTypeId: 1, scoringPeriodId: 1, stats: { 24: 50 }, appliedTotal: 8 }],
              },
            },
          ],
        },
      },
      away: { teamId: 2, totalPoints: 70, rosterForCurrentScoringPeriod: { entries: [] } },
    },
  ],
};

function cloneFixture() {
  return JSON.parse(JSON.stringify(fixture));
}

function makeRosterEntry({ id, lineupSlotId, fullName, defaultPositionId }) {
  const [firstName, ...rest] = fullName.split(' ');
  return {
    lineupSlotId,
    playerId: id,
    playerPoolEntry: {
      appliedStatTotal: 0,
      player: {
        id,
        fullName,
        firstName,
        lastName: rest.join(' '),
        defaultPositionId,
        proTeamId: 2,
      },
      stats: [],
    },
  };
}

describe('ESPN fantasy adapter', () => {
  it('normalizes league, roster, player, stats, and matchup data', () => {
    const normalized = normalizeEspnLeaguePayload(fixture, { season: 2025, leagueId: 321 });

    assert.equal(normalized.platform, 'espn');
    assert.equal(normalized.league.league_id, '321');
    assert.equal(normalized.rosters[0].owner_id, ESPN_CURRENT_USER_ID);
    assert.equal(normalized.rosters[1].owner_id, 'espn:team:2');
    assert.equal(normalized.players['espn:101'].position, 'RB');
    assert.equal(normalized.players['espn:101'].team, 'BUF');
    assert.equal(normalized.players['espn:101'].imageUrl, 'https://img.example/runner.png');
    assert.equal(normalized.weeklyStats['espn:101'][0]._fantasyPoints, 8);
    assert.equal(normalized.weeklyStats['espn:101'][0]._fantasyContributions.rush_yd, 10);
    assert.equal(normalized.seasonStats['espn:101']._fantasyPoints, 8);
    assert.equal(normalized.league.settings.playoff_week_start, 15);
    assert.equal(normalized.matchupsByWeek[1][0].points, 88);
    assert.equal(normalized.matchupsByWeek[1][0].players_points['espn:101'], 8);
  });

  it('marks one-sided ESPN schedule rows as fantasy byes', () => {
    const byeFixture = cloneFixture();
    byeFixture.schedule = [{
      id: 9004,
      matchupPeriodId: 4,
      home: {
        teamId: 1,
        totalPoints: 412.5,
        rosterForCurrentScoringPeriod: {
          entries: [byeFixture.teams[0].roster.entries[0]],
        },
      },
    }];

    const normalized = normalizeEspnLeaguePayload(byeFixture, { season: 2025, leagueId: 321 });
    const rows = normalized.matchupsByWeek[4];

    assert.equal(rows.length, 1);
    assert.equal(rows[0].roster_id, 1);
    assert.equal(rows[0].points, 412.5);
    assert.equal(rows[0].metadata.platform, 'espn');
    assert.equal(rows[0].metadata.isBye, true);
  });

  it('prefers ESPN schedule entry applied totals over stale nested weekly totals', () => {
    const staleNestedFixture = cloneFixture();
    const scheduleEntry = JSON.parse(JSON.stringify(staleNestedFixture.teams[0].roster.entries[0]));
    scheduleEntry.appliedStatTotal = 103.16;
    scheduleEntry.playerPoolEntry.appliedStatTotal = 97.01;
    scheduleEntry.playerPoolEntry.stats = [
      {
        statSourceId: 0,
        statSplitTypeId: 1,
        scoringPeriodId: 1,
        stats: { 24: 50, 53: 3 },
        appliedStats: { 24: 90, 53: 13.16 },
        appliedTotal: 97.01,
      },
    ];
    staleNestedFixture.schedule[0].home.rosterForCurrentScoringPeriod.entries = [scheduleEntry];

    const normalized = normalizeEspnLeaguePayload(staleNestedFixture, { season: 2025, leagueId: 321 });
    const row = normalized.weeklyStats['espn:101'][0];

    assert.equal(row._fantasyPoints, 103.16);
    assert.equal(row.fantasy_points, 103.16);
    assert.equal(normalized.matchupsByWeek[1][0].players_points['espn:101'], 103.16);
  });

  it('preserves ESPN roster applied totals as season stats when stat rows are empty', () => {
    const rosterOnlyFixture = cloneFixture();
    rosterOnlyFixture.teams[0].roster.entries[0].playerPoolEntry.appliedStatTotal = 123.4;
    rosterOnlyFixture.teams[0].roster.entries[0].playerPoolEntry.stats = [];
    rosterOnlyFixture.schedule = [];

    const normalized = normalizeEspnLeaguePayload(rosterOnlyFixture, { season: 2025, leagueId: 321 });

    assert.equal(normalized.seasonStats['espn:101']._fantasyPoints, 123.4);
    assert.equal(calcPoints(normalized.seasonStats['espn:101'], normalized.scoringSettings, 'RB'), 123.4);
  });

  it('prefers ESPN applied scoring rows over duplicate raw-only weekly rows', () => {
    const duplicateFixture = cloneFixture();
    duplicateFixture.teams[0].roster.entries[0].playerPoolEntry.stats = [
      { statSourceId: 0, statSplitTypeId: 1, scoringPeriodId: 1, stats: { 24: 50, 53: 3 } },
    ];
    duplicateFixture.schedule[0].home.rosterForCurrentScoringPeriod.entries = [
      {
        ...duplicateFixture.teams[0].roster.entries[0],
        playerPoolEntry: {
          ...duplicateFixture.teams[0].roster.entries[0].playerPoolEntry,
          stats: [
            {
              statSourceId: 0,
              statSplitTypeId: 1,
              scoringPeriodId: 1,
              stats: { 24: 50, 53: 3 },
              appliedStats: { 24: 4.4, 53: 2.1 },
            },
          ],
        },
      },
    ];

    const normalized = normalizeEspnLeaguePayload(duplicateFixture, { season: 2025, leagueId: 321 });
    const row = normalized.weeklyStats['espn:101'][0];

    assert.equal(row.rush_yd, 50);
    assert.equal(row.rec, 3);
    assert.equal(row._fantasyPoints, 6.5);
    assert.equal(row._fantasyContributions.rush_yd, 4.4);
    assert.equal(row._fantasyContributions.rec, 2.1);
    assert.equal(normalized.matchupsByWeek[1][0].players_points['espn:101'], 6.5);
  });

  it('preserves ESPN schedule applied totals when the stat row only has raw stats', () => {
    const parentTotalFixture = cloneFixture();
    parentTotalFixture.teams[0].roster.entries[0].playerPoolEntry.stats = [
      { statSourceId: 0, statSplitTypeId: 1, scoringPeriodId: 1, stats: { 24: 50, 53: 3 } },
    ];
    parentTotalFixture.schedule[0].home.rosterForCurrentScoringPeriod.entries = [
      {
        ...parentTotalFixture.teams[0].roster.entries[0],
        playerPoolEntry: {
          ...parentTotalFixture.teams[0].roster.entries[0].playerPoolEntry,
          appliedStatTotal: 8.75,
          stats: [
            { statSourceId: 0, statSplitTypeId: 1, scoringPeriodId: 1, stats: { 24: 50, 53: 3 } },
          ],
        },
      },
    ];

    const normalized = normalizeEspnLeaguePayload(parentTotalFixture, { season: 2025, leagueId: 321 });
    const row = normalized.weeklyStats['espn:101'][0];

    assert.equal(row.rush_yd, 50);
    assert.equal(row.rec, 3);
    assert.equal(row._fantasyPoints, 8.75);
    assert.equal(normalized.matchupsByWeek[1][0].players_points['espn:101'], 8.75);
  });

  it('imports ESPN position-aware scoring profiles', () => {
    const normalized = normalizeEspnLeaguePayload(fixture, { season: 2025, leagueId: 321 });
    assert.equal(normalized.scoringSettings.provider, 'espn');
    assert.equal(normalized.scoringSettings.positionOverrides.RB.rush_yd, 0.2);
  });

  it('preserves ESPN team result stats on weekly rows', () => {
    const resultFixture = cloneFixture();
    resultFixture.settings.scoringSettings.scoringItems.push(
      { statId: 155, points: 3 },
      { statId: 156, points: -3 },
    );
    delete resultFixture.teams[0].roster.entries[0].playerPoolEntry.appliedStatTotal;
    resultFixture.teams[0].roster.entries[0].playerPoolEntry.stats = [
      { statSourceId: 0, statSplitTypeId: 1, scoringPeriodId: 1, stats: { 24: 50, 53: 3, 155: 1 } },
    ];
    resultFixture.schedule[0].home.rosterForCurrentScoringPeriod.entries = [
      resultFixture.teams[0].roster.entries[0],
    ];

    const normalized = normalizeEspnLeaguePayload(resultFixture, { season: 2025, leagueId: 321 });
    const row = normalized.weeklyStats['espn:101'][0];

    assert.equal(row.team_win, 1);
    assert.equal(normalized.scoringSettings.settings.team_win, 3);
    assert.equal(calcPoints(row, normalized.scoringSettings, 'RB'), 16);
  });

  it('normalizes ESPN D/ST entries with their weekly scoring rows', () => {
    const dstFixture = cloneFixture();
    dstFixture.settings.rosterSettings.lineupSlotCounts = { 16: 1, 20: 1 };
    dstFixture.settings.scoringSettings.scoringItems = [
      { statId: 89, points: 10 },
      { statId: 95, points: 2 },
      { statId: 99, points: 1 },
    ];
    const defenseEntry = {
      lineupSlotId: 16,
      playerId: -16021,
      playerPoolEntry: {
        player: {
          id: -16021,
          fullName: 'Eagles D/ST',
          firstName: 'Eagles',
          lastName: 'D/ST',
          defaultPositionId: 16,
          proTeamId: 21,
        },
        stats: [
          { statSourceId: 0, statSplitTypeId: 1, scoringPeriodId: 1, stats: { 89: 1, 95: 2, 99: 3 }, appliedTotal: 17 },
          { statSourceId: 0, statSplitTypeId: 0, stats: { 89: 1, 95: 2, 99: 3 }, appliedTotal: 17 },
        ],
      },
    };
    dstFixture.teams[0].roster.entries = [defenseEntry];
    dstFixture.schedule[0].home.rosterForCurrentScoringPeriod.entries = [defenseEntry];

    const normalized = normalizeEspnLeaguePayload(dstFixture, { season: 2025, leagueId: 321 });
    const row = normalized.weeklyStats['espn:-16021'][0];

    assert.equal(normalized.players['espn:-16021'].position, 'DEF');
    assert.equal(normalized.players['espn:-16021'].team, 'PHI');
    assert.equal(row.pts_allow_0, 1);
    assert.equal(row.int, 2);
    assert.equal(row.sack, 3);
    assert.equal(calcPoints(row, normalized.scoringSettings, 'DEF'), 17);
  });

  it('uses ESPN schedule entry applied totals when D/ST entries omit stat rows', () => {
    const dstFixture = cloneFixture();
    dstFixture.settings.rosterSettings.lineupSlotCounts = { 16: 1, 20: 1 };
    const defenseEntry = {
      lineupSlotId: 16,
      playerId: -16021,
      appliedStatTotal: 30,
      appliedStats: { 96: 2, 110: 6, 112: 1, 114: 18, 9999: 3 },
      playerPoolEntry: {
        player: {
          id: -16021,
          fullName: 'Eagles D/ST',
          firstName: 'Eagles',
          lastName: 'D/ST',
          defaultPositionId: 16,
          proTeamId: 21,
        },
        stats: [],
      },
    };
    dstFixture.teams[0].roster.entries = [{
      ...defenseEntry,
      appliedStatTotal: 78.5,
    }];
    dstFixture.schedule[0].home.rosterForCurrentScoringPeriod.entries = [defenseEntry];

    const normalized = normalizeEspnLeaguePayload(dstFixture, { season: 2025, leagueId: 321 });
    const row = normalized.weeklyStats['espn:-16021'][0];

    assert.equal(row._fantasyPoints, 30);
    assert.equal(row._fantasyContributions.fum_rec, 2);
    assert.equal(row._fantasyContributions.tkl_3, 6);
    assert.equal(row._fantasyContributions.tkl_loss, 1);
    assert.equal(row._fantasyContributions.def_kr_yd, 18);
    assert.equal(row._fantasyContributions.espn_stat_9999, 3);
    assert.equal(calcPoints(row, normalized.scoringSettings, 'DEF'), 30);
  });

  it('filters ESPN weekly applied rows to the requested scoring period', () => {
    const dstFixture = cloneFixture();
    dstFixture.teams = [{
      id: 1,
      roster: {
        entries: [{
          lineupSlotId: 16,
          playerId: -16021,
          appliedStatTotal: 94,
          playerPoolEntry: {
            player: {
              id: -16021,
              fullName: 'Eagles D/ST',
              firstName: 'Eagles',
              lastName: 'D/ST',
              defaultPositionId: 16,
              proTeamId: 21,
            },
            stats: [
              { statSourceId: 0, statSplitTypeId: 1, scoringPeriodId: 16, stats: { 95: 2 } },
              { statSourceId: 0, statSplitTypeId: 1, scoringPeriodId: 17, stats: { 95: 5 } },
            ],
          },
        }],
      },
    }, { id: 2, roster: { entries: [] } }];
    const makeDefenseEntry = (appliedStatTotal) => ({
      lineupSlotId: 16,
      playerId: -16021,
      appliedStatTotal,
      playerPoolEntry: {
        player: {
          id: -16021,
          fullName: 'Eagles D/ST',
          firstName: 'Eagles',
          lastName: 'D/ST',
          defaultPositionId: 16,
          proTeamId: 21,
        },
        stats: [],
      },
    });
    dstFixture.schedule = [
      {
        id: 9016,
        matchupPeriodId: 16,
        home: { teamId: 1, rosterForCurrentScoringPeriod: { entries: [makeDefenseEntry(49.5)] } },
        away: { teamId: 2, rosterForCurrentScoringPeriod: { entries: [] } },
      },
      {
        id: 9018,
        matchupPeriodId: 18,
        home: { teamId: 1, rosterForCurrentScoringPeriod: { entries: [makeDefenseEntry(42.5)] } },
        away: { teamId: 2, rosterForCurrentScoringPeriod: { entries: [] } },
      },
    ];

    const normalized = normalizeEspnLeaguePayload(dstFixture, { season: 2025, leagueId: 321, scoringPeriodId: 18 });
    const rows = normalized.weeklyStats['espn:-16021'];

    assert.equal(rows.length, 1);
    assert.equal(rows[0].week, 18);
    assert.equal(rows[0]._fantasyPoints, 42.5);
  });

  it('uses requested scoring period totals when ESPN playoff matchups span multiple weeks', () => {
    const makeDefenseEntry = (appliedStatTotal, lineupSlotId = 16) => ({
      lineupSlotId,
      playerId: -16021,
      playerPoolEntry: {
        appliedStatTotal,
        player: {
          id: -16021,
          fullName: 'Eagles D/ST',
          firstName: 'Eagles',
          lastName: 'D/ST',
          defaultPositionId: 16,
          proTeamId: 21,
        },
        stats: [],
      },
    });
    const makePayload = (currentTotal, staleMatchupTotal, staleRosterTotal) => ({
      ...cloneFixture(),
      settings: {
        ...cloneFixture().settings,
        scheduleSettings: {},
      },
      teams: [{
        id: 8,
        roster: { entries: [makeDefenseEntry(staleRosterTotal)] },
      }],
      schedule: [{
        id: 9110,
        matchupPeriodId: 17,
        away: {
          teamId: 8,
          rosterForCurrentScoringPeriod: { entries: [makeDefenseEntry(currentTotal)] },
          rosterForMatchupPeriod: { entries: [makeDefenseEntry(staleMatchupTotal, 0)] },
        },
        home: { teamId: 2, rosterForCurrentScoringPeriod: { entries: [] } },
      }],
    });

    const week17 = normalizeEspnLeaguePayload(makePayload(51.5, 94, 101), {
      season: 2025,
      leagueId: 321,
      scoringPeriodId: 17,
    }).weeklyStats['espn:-16021'];
    const week18 = normalizeEspnLeaguePayload(makePayload(42.5, 94, 94), {
      season: 2025,
      leagueId: 321,
      scoringPeriodId: 18,
    }).weeklyStats['espn:-16021'];

    assert.equal(week17.length, 1);
    assert.equal(week17[0].week, 17);
    assert.equal(week17[0]._fantasyPoints, 51.5);
    assert.equal(week18.length, 1);
    assert.equal(week18[0].week, 18);
    assert.equal(week18[0]._fantasyPoints, 42.5);
  });

  it('maps NFL team abbreviations to ESPN fantasy D/ST player ids', () => {
    assert.equal(getEspnTeamDefensePlayerId('PHI'), 'espn:-16021');
    assert.equal(getEspnTeamDefensePlayerId('WSH'), 'espn:-16028');
  });

  it('uses an ESPN team URL teamId as the current roster hint', () => {
    const normalized = normalizeEspnLeaguePayload({
      ...fixture,
      _gridshift: { currentTeamId: 2 },
    }, { season: 2025, leagueId: 321, teamId: '1' });

    assert.equal(normalized.rosters[0].owner_id, ESPN_CURRENT_USER_ID);
    assert.equal(normalized.rosters[1].owner_id, 'espn:team:2');
  });

  it('falls back to the latest schedule roster snapshot when ESPN offseason rosters are empty', () => {
    const normalized = normalizeEspnLeaguePayload({
      ...fixture,
      teams: fixture.teams.map((team) => ({
        ...team,
        roster: { entries: [] },
      })),
    }, { season: 2025, leagueId: 321 });

    assert.deepEqual(normalized.rosters[0].players, ['espn:101']);
    assert.deepEqual(normalized.rosters[0].starters, ['espn:101']);
    assert.equal(normalized.rosters[0].metadata.rosterSource, 'schedule');
    assert.equal(normalized.rosters[1].metadata.rosterSource, 'empty');
  });

  it('falls back to team roster starters when matchup schedule sides omit roster snapshots', () => {
    const normalized = normalizeEspnLeaguePayload({
      ...fixture,
      schedule: [{
        ...fixture.schedule[0],
        home: { teamId: 1, totalPoints: 88, rosterForCurrentScoringPeriod: { entries: [] } },
        away: { teamId: 2, totalPoints: 70, rosterForCurrentScoringPeriod: { entries: [] } },
      }],
    }, { season: 2025, leagueId: 321 });

    assert.deepEqual(normalized.matchupsByWeek[1][0].players, ['espn:101']);
    assert.deepEqual(normalized.matchupsByWeek[1][0].starters, ['espn:101']);
    assert.equal(normalized.matchupsByWeek[1][0].points, 88);
  });

  it('orders ESPN starters by lineup slot before Matchup pairs players with slot labels', () => {
    const unorderedFixture = cloneFixture();
    unorderedFixture.settings.rosterSettings.lineupSlotCounts = { 0: 1, 2: 1, 4: 1, 20: 1 };
    unorderedFixture.teams[0].roster.entries = [
      makeRosterEntry({ id: 203, lineupSlotId: 4, fullName: 'Slot Receiver', defaultPositionId: 3 }),
      makeRosterEntry({ id: 202, lineupSlotId: 2, fullName: 'Slot Runner', defaultPositionId: 2 }),
      makeRosterEntry({ id: 201, lineupSlotId: 0, fullName: 'Slot Passer', defaultPositionId: 1 }),
      makeRosterEntry({ id: 204, lineupSlotId: 20, fullName: 'Bench Receiver', defaultPositionId: 3 }),
    ];
    unorderedFixture.schedule = [{
      id: 9002,
      matchupPeriodId: 1,
      home: { teamId: 1, totalPoints: 42, rosterForCurrentScoringPeriod: { entries: [] } },
      away: { teamId: 2, totalPoints: 0, rosterForCurrentScoringPeriod: { entries: [] } },
    }];

    const normalized = normalizeEspnLeaguePayload(unorderedFixture, { season: 2025, leagueId: 321 });

    assert.deepEqual(normalized.league.roster_positions.filter((slot) => slot !== 'BN'), ['QB', 'RB', 'WR']);
    assert.deepEqual(normalized.rosters[0].starters, ['espn:201', 'espn:202', 'espn:203']);
    assert.deepEqual(normalized.matchupsByWeek[1][0].starters, ['espn:201', 'espn:202', 'espn:203']);
  });

  it('infers roster slot counts when ESPN omits rosterSettings lineup counts', () => {
    const normalized = normalizeEspnLeaguePayload({
      ...fixture,
      settings: {
        ...fixture.settings,
        rosterSettings: {},
      },
    }, { season: 2025, leagueId: 321 });

    assert.deepEqual(normalized.league.roster_positions, ['RB']);
  });
});
