import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAppPath, normalizeAppRoute, parseAppRoute } from '../../src/utils/appRoutes.js';
import {
  buildFantasyRematchMap,
  buildFantasyRosterScheduleRows,
  buildFantasyScheduleWeeks,
  getFantasyRosterSeasonSummary,
  getFantasyScheduleEdge,
  getFantasyScheduleWeekBounds,
  getRemainingOpponentAverage,
} from '../../src/utils/fantasySeasonSchedule.js';

const league = {
  season: '2026',
  settings: { playoff_week_start: 15, playoff_teams: 6, playoff_round_type: 0 },
};

const rosters = [
  { roster_id: 1, owner_id: 'u1', settings: { wins: 2, losses: 1, ties: 0, fpts: 350, fpts_decimal: 40 } },
  { roster_id: 2, owner_id: 'u2', settings: { wins: 1, losses: 2, ties: 0, fpts: 300, fpts_decimal: 0 } },
  { roster_id: 3, owner_id: 'u3', settings: { wins: 3, losses: 0, ties: 0, fpts: 400, fpts_decimal: 50 } },
  { roster_id: 4, owner_id: 'u4', settings: { wins: 0, losses: 3, ties: 0, fpts: 250, fpts_decimal: 0 } },
];

const displayNames = { u1: 'Alpha', u2: 'Bravo', u3: 'Charlie', u4: 'Delta' };
const getUserDisplayName = (ownerId) => displayNames[ownerId] ?? 'Unknown';

// Weeks 1-2 are scored; week 3 is the current week and reads 0 everywhere.
const matchupsByWeek = {
  1: [
    { roster_id: 1, matchup_id: 1, points: 110.5 },
    { roster_id: 2, matchup_id: 1, points: 98.2 },
    { roster_id: 3, matchup_id: 2, points: 140.0 },
    { roster_id: 4, matchup_id: 2, points: 88.4 },
  ],
  2: [
    { roster_id: 1, matchup_id: 1, points: 101.0 },
    { roster_id: 3, matchup_id: 1, points: 132.1 },
    { roster_id: 2, matchup_id: 2, points: 120.6 },
    { roster_id: 4, matchup_id: 2, points: 95.3 },
  ],
  3: [
    { roster_id: 1, matchup_id: 1, points: 0 },
    { roster_id: 4, matchup_id: 1, points: 0 },
    { roster_id: 2, matchup_id: 2, points: 0 },
    { roster_id: 3, matchup_id: 2, points: 0 },
  ],
  4: [
    { roster_id: 1, matchup_id: 1, points: 0 },
    { roster_id: 2, matchup_id: 1, points: 0 },
    { roster_id: 3, matchup_id: 2, points: 0 },
    { roster_id: 4, matchup_id: 2, points: 0 },
  ],
};

function buildWeeks({ weeks = matchupsByWeek, regularSeasonWeeks = 4, currentWeek = 3 } = {}) {
  return buildFantasyScheduleWeeks({
    matchupsByWeek: weeks,
    rosters,
    getUserDisplayName,
    userRosterId: '1',
    regularSeasonWeeks,
    currentWeek,
  });
}

test('Schedule week bounds stop at the last regular-season week', () => {
  const bounds = getFantasyScheduleWeekBounds(league);

  assert.equal(bounds.playoffStartWeek, 15);
  assert.equal(bounds.regularSeasonWeeks, 14);
  assert.equal(bounds.maxWeek, 17);
});

test('A league with no playoff start treats every played week as regular season', () => {
  const bounds = getFantasyScheduleWeekBounds({ season: '2026', settings: {} });

  assert.equal(bounds.playoffStartWeek, null);
  assert.equal(bounds.regularSeasonWeeks, bounds.maxWeek);
});

test('Roster season summary derives games played from the record, not the week', () => {
  const summary = getFantasyRosterSeasonSummary(rosters[0]);

  assert.equal(summary.recordLabel, '2-1');
  assert.equal(summary.pointsFor, 350.4);
  assert.equal(summary.gamesPlayed, 3);
  assert.equal(summary.pointsPerGame, 116.8);
});

test('A roster with no scored game reports a null average rather than zero', () => {
  const summary = getFantasyRosterSeasonSummary({
    roster_id: 9,
    settings: { wins: 0, losses: 0, ties: 0, fpts: 0 },
  });

  assert.equal(summary.gamesPlayed, 0);
  assert.equal(summary.pointsPerGame, null);
});

test('Scored weeks carry a result; the current week does not', () => {
  const rows = buildFantasyRosterScheduleRows(buildWeeks(), '1');

  assert.equal(rows.length, 4);
  assert.equal(rows[0].isPlayed, true);
  assert.equal(rows[0].result, 'W');
  assert.equal(rows[0].pointsFor, 110.5);
  assert.equal(rows[0].opponent.name, 'Bravo');

  assert.equal(rows[1].result, 'L');
  assert.equal(rows[1].opponent.name, 'Charlie');

  // Week 3 is live: every side still reads 0, which is not a shutout.
  assert.equal(rows[2].isPlayed, false);
  assert.equal(rows[2].result, null);
  assert.equal(rows[2].isCurrent, true);
});

test('A week that never loaded is pending, not a bye', () => {
  const weeks = buildWeeks({ weeks: { ...matchupsByWeek, 4: null } });
  const rows = buildFantasyRosterScheduleRows(weeks, '1');

  assert.equal(rows[3].isPending, true);
  assert.equal(rows[3].isBye, false);
  assert.equal(rows[3].opponent, null);
});

test('A week the provider returned without this roster is unscheduled, not a bye', () => {
  const weeks = buildWeeks({ weeks: { ...matchupsByWeek, 4: [] } });
  const rows = buildFantasyRosterScheduleRows(weeks, '1');

  assert.equal(rows[3].isPending, false);
  assert.equal(rows[3].isUnscheduled, true);
  assert.equal(rows[3].isBye, false);
});

test('An unpaired roster reads as a fantasy bye', () => {
  const weeks = buildWeeks({
    weeks: { ...matchupsByWeek, 4: [{ roster_id: 1, matchup_id: null, points: 0 }] },
  });
  const rows = buildFantasyRosterScheduleRows(weeks, '1');

  assert.equal(rows[3].isBye, true);
  assert.equal(rows[3].opponent, null);
});

test('Rematches point back at the earlier meeting', () => {
  const rows = buildFantasyRosterScheduleRows(buildWeeks(), '1');
  const rematches = buildFantasyRematchMap(rows);

  // Roster 1 plays Bravo in week 1 and again in week 4.
  assert.equal(rematches.get(4), 1);
  assert.equal(rematches.has(3), false);
});

test('Scoring edge is null when either side has no scored game', () => {
  const played = { pointsPerGame: 116.8 };
  const unplayed = { pointsPerGame: null };

  assert.equal(getFantasyScheduleEdge(played, { pointsPerGame: 100 }), 16.8);
  assert.equal(getFantasyScheduleEdge(played, unplayed), null);
  assert.equal(getFantasyScheduleEdge(unplayed, played), null);
});

test('Remaining opponent average covers only unplayed weeks from the current week on', () => {
  const rows = buildFantasyRosterScheduleRows(buildWeeks(), '1');
  const summaryMap = new Map(
    rosters.map((roster) => {
      const summary = getFantasyRosterSeasonSummary(roster);
      return [summary.rosterId, summary];
    }),
  );

  // Weeks 3 and 4 remain: Delta (83.3 PPG) and Bravo (100.0 PPG).
  assert.equal(getRemainingOpponentAverage(rows, summaryMap, 3), 91.7);
  assert.equal(getRemainingOpponentAverage(rows, summaryMap, 99), null);
});

test('Schedule route defaults to the season view with no query', () => {
  const route = parseAppRoute('/fantasy/schedule');

  assert.equal(route.companionView, 'schedule');
  assert.equal(route.scheduleMode, 'season');
  assert.equal(route.scheduleWeek, null);
  assert.equal(buildAppPath(route), '/fantasy/schedule');
});

test('Schedule route round-trips the league view, week, and team', () => {
  const route = normalizeAppRoute({
    activeTab: 'fantasy',
    companionView: 'schedule',
    scheduleMode: 'league',
    scheduleWeek: '7',
    scheduleRosterId: '5',
  });

  const path = buildAppPath(route);
  assert.equal(path, '/fantasy/schedule?mode=league&week=7&team=5');

  const [pathname, search] = path.split('?');
  const parsed = parseAppRoute(pathname, search);
  assert.equal(parsed.scheduleMode, 'league');
  assert.equal(parsed.scheduleWeek, 7);
  assert.equal(parsed.scheduleRosterId, '5');
});

test('An unknown schedule mode falls back to the season view', () => {
  const route = normalizeAppRoute({
    activeTab: 'fantasy',
    companionView: 'schedule',
    scheduleMode: 'bracket',
  });

  assert.equal(route.scheduleMode, 'season');
});
