import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCHEDULE_TIERS,
  buildPointsAllowedByOpponent,
  buildScheduleStrengthTable,
  buildUpcomingScheduleMap,
  getFirstRemainingWeek,
  getScheduleSignal,
  scoreScheduleSignal,
} from '../../src/utils/draftAssistant/scheduleStrength.js';

const TEAMS = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
  'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
  'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
  'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS',
];

// Round-robin-ish 17-week slate: each week pairs the teams by a rotating offset so
// every team draws a different mix of soft and stingy defenses.
function buildSyntheticSeasonSchedule({ season = 2026, weeks = 17, kickoffBase = '2026-09-10T00:00:00.000Z' } = {}) {
  const baseMs = Date.parse(kickoffBase);
  const weekEntries = [];
  for (let week = 1; week <= weeks; week += 1) {
    const rotated = [TEAMS[0], ...TEAMS.slice(1).slice(week - 1), ...TEAMS.slice(1).slice(0, week - 1)];
    const games = [];
    for (let i = 0; i < rotated.length / 2; i += 1) {
      games.push({
        id: `${season}-W${week}-${i}`,
        week,
        awayTeam: rotated[i],
        homeTeam: rotated[rotated.length - 1 - i],
        kickoff: new Date(baseMs + (week - 1) * 7 * 24 * 3600 * 1000).toISOString(),
      });
    }
    weekEntries.push({ week, games });
  }
  return { season, weeks: weekEntries };
}

// Prior-season production: every defense faces one RB each week, and the points that
// RB scores is a fixed per-defense level. That makes "points allowed" a clean ranking.
function buildSyntheticPriorSeason() {
  const players = {};
  const weeklyStats = {};
  const scheduleMap = {};
  const prior = buildSyntheticSeasonSchedule({ season: 2025 });

  for (const weekEntry of prior.weeks) {
    scheduleMap[weekEntry.week] = {};
    for (const game of weekEntry.games) {
      scheduleMap[weekEntry.week][game.homeTeam] = { opp: game.awayTeam, home: true };
      scheduleMap[weekEntry.week][game.awayTeam] = { opp: game.homeTeam, home: false };
    }
  }

  // One player per position per team, so the fixture exercises kickers, team defenses,
  // and IDP slots the same way it exercises skill positions.
  const FIXTURE_POSITIONS = ['RB', 'WR', 'QB', 'TE', 'K', 'DEF', 'LB', 'DL', 'DB'];

  TEAMS.forEach((team, teamIndex) => {
    for (const position of FIXTURE_POSITIONS) {
      const playerId = `${position.toLowerCase()}-${team}`;
      players[playerId] = { player_id: playerId, position, fantasy_positions: [position], team };
      weeklyStats[playerId] = [];
      for (const weekEntry of prior.weeks) {
        const opponent = scheduleMap[weekEntry.week][team]?.opp;
        if (!opponent) continue;
        // Yardage scales with the OPPONENT's softness index, so each defense allows a
        // distinct, stable amount and the league spread is wide by construction.
        const softness = TEAMS.indexOf(opponent);
        weeklyStats[playerId].push({
          week: weekEntry.week,
          team,
          opp: opponent,
          rush_yd: 30 + softness * 4,
          rush_att: 12,
        });
      }
      assert.ok(weeklyStats[playerId].length > 0, `expected weekly rows for ${team} ${position} (${teamIndex})`);
    }
  });

  return { players, weeklyStats, scheduleMap };
}

const SCORING = { rush_yd: 0.1, rush_att: 0, rec: 1, rec_yd: 0.1 };

test('buildUpcomingScheduleMap normalizes ESPN abbreviations to Sleeper spelling', () => {
  const map = buildUpcomingScheduleMap({
    weeks: [{ week: 1, games: [{ week: 1, awayTeam: 'WSH', homeTeam: 'JAC', kickoff: '2026-09-13T17:00:00.000Z' }] }],
  });
  assert.deepEqual(Object.keys(map[1]).sort(), ['JAX', 'WAS']);
  assert.equal(map[1].WAS.opp, 'JAX');
  assert.equal(map[1].JAX.home, true);
});

test('getFirstRemainingWeek skips weeks that have already kicked off', () => {
  const map = buildUpcomingScheduleMap(buildSyntheticSeasonSchedule());
  const beforeSeason = getFirstRemainingWeek(map, Date.parse('2026-08-01T00:00:00.000Z'));
  assert.equal(beforeSeason, 1, 'an offseason draft evaluates the whole season');

  const midSeason = getFirstRemainingWeek(map, Date.parse('2026-10-20T00:00:00.000Z'));
  assert.ok(midSeason > 1, 'an in-season draft skips weeks already played');
});

test('buildPointsAllowedByOpponent divides by games played, not weeks with production', () => {
  const { players, weeklyStats, scheduleMap } = buildSyntheticPriorSeason();
  const allowed = buildPointsAllowedByOpponent({ players, weeklyStats, scheduleMap, scoringSettings: SCORING });

  const entry = allowed.KC?.RB;
  assert.ok(entry, 'expected KC RB points allowed');
  assert.equal(entry.games, 17);
  assert.ok(entry.avg > 0);

  // The softest defense in the fixture is the last team in TEAMS order.
  const softest = allowed[TEAMS[TEAMS.length - 1]].RB.avg;
  const stingiest = allowed[TEAMS[0]].RB.avg;
  assert.ok(softest > stingiest, 'defense ranking should follow the fixture softness gradient');
});

test('schedule tiers spread the league instead of collapsing into Neutral', () => {
  const { players, weeklyStats, scheduleMap } = buildSyntheticPriorSeason();
  const pointsAllowedByOpponent = buildPointsAllowedByOpponent({
    players,
    weeklyStats,
    scheduleMap,
    scoringSettings: SCORING,
  });
  const upcomingScheduleMap = buildUpcomingScheduleMap(buildSyntheticSeasonSchedule());
  const table = buildScheduleStrengthTable({
    pointsAllowedByOpponent,
    upcomingScheduleMap,
    nowMs: Date.parse('2026-08-01T00:00:00.000Z'),
  });

  assert.ok(table, 'expected a schedule strength table');
  assert.equal(table.fromWeek, 1);

  const labels = TEAMS.map((team) => getScheduleSignal(table, team, 'RB').label);
  assert.equal(labels.filter((label) => label === 'Unavailable').length, 0);

  const counts = new Map();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);

  // Every tier is populated, and no single tier owns the board — the exact failure
  // mode of the old fixed 92/108 cutoffs.
  for (const tier of SCHEDULE_TIERS) {
    assert.ok(counts.get(tier.label) > 0, `expected at least one team tiered "${tier.label}"`);
  }
  const neutralShare = (counts.get('Neutral') ?? 0) / TEAMS.length;
  assert.ok(neutralShare <= 0.3, `Neutral should not dominate the board (was ${neutralShare})`);
});

test('schedule counts every remaining week, not a fixed six-game window', () => {
  const { players, weeklyStats, scheduleMap } = buildSyntheticPriorSeason();
  const pointsAllowedByOpponent = buildPointsAllowedByOpponent({
    players,
    weeklyStats,
    scheduleMap,
    scoringSettings: SCORING,
  });
  const upcomingScheduleMap = buildUpcomingScheduleMap(buildSyntheticSeasonSchedule());

  const preseason = buildScheduleStrengthTable({
    pointsAllowedByOpponent,
    upcomingScheduleMap,
    nowMs: Date.parse('2026-08-01T00:00:00.000Z'),
  });
  assert.equal(getScheduleSignal(preseason, 'KC', 'RB').gamesRemaining, 17);

  const midseason = buildScheduleStrengthTable({
    pointsAllowedByOpponent,
    upcomingScheduleMap,
    nowMs: Date.parse('2026-11-01T00:00:00.000Z'),
  });
  const remaining = getScheduleSignal(midseason, 'KC', 'RB').gamesRemaining;
  assert.ok(remaining > 0 && remaining < 17, `mid-season draft should shrink the window (was ${remaining})`);
});

test('scoreScheduleSignal feeds the model a full 0-100 spread', () => {
  const { players, weeklyStats, scheduleMap } = buildSyntheticPriorSeason();
  const pointsAllowedByOpponent = buildPointsAllowedByOpponent({
    players,
    weeklyStats,
    scheduleMap,
    scoringSettings: SCORING,
  });
  const table = buildScheduleStrengthTable({
    pointsAllowedByOpponent,
    upcomingScheduleMap: buildUpcomingScheduleMap(buildSyntheticSeasonSchedule()),
    nowMs: Date.parse('2026-08-01T00:00:00.000Z'),
  });

  const scores = TEAMS.map((team) => scoreScheduleSignal(getScheduleSignal(table, team, 'RB')));
  assert.ok(scores.every((score) => Number.isFinite(score)));
  assert.ok(Math.min(...scores) < 20, 'toughest schedule should score low');
  assert.ok(Math.max(...scores) > 80, 'softest schedule should score high');

  assert.equal(scoreScheduleSignal({ percentile: null }), null);
  assert.equal(scoreScheduleSignal(null), null);
});

test('kickers, team defenses, and IDP positions get a schedule signal too', () => {
  const { players, weeklyStats, scheduleMap } = buildSyntheticPriorSeason();
  const pointsAllowedByOpponent = buildPointsAllowedByOpponent({
    players,
    weeklyStats,
    scheduleMap,
    scoringSettings: SCORING,
  });
  const table = buildScheduleStrengthTable({
    pointsAllowedByOpponent,
    upcomingScheduleMap: buildUpcomingScheduleMap(buildSyntheticSeasonSchedule()),
    nowMs: Date.parse('2026-08-01T00:00:00.000Z'),
  });

  // Leagues that roster kickers, defenses, or IDP must not silently lose the column.
  for (const position of ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB']) {
    const labels = TEAMS.map((team) => getScheduleSignal(table, team, position).label);
    assert.equal(
      labels.filter((label) => label === 'Unavailable').length,
      0,
      `every team should have a ${position} schedule signal`,
    );
    assert.ok(new Set(labels).size > 1, `${position} tiers should vary across the league`);
  }

  // Sleeper's DST spelling resolves to the same entry as DEF.
  assert.equal(getScheduleSignal(table, 'KC', 'DST').label, getScheduleSignal(table, 'KC', 'DEF').label);
});

test('a position with too little coverage stays unavailable instead of inventing tiers', () => {
  const sparse = {
    KC: { RB: { avg: 20, games: 17, total: 340 } },
    BUF: { RB: { avg: 25, games: 17, total: 425 } },
    DAL: { RB: { avg: 30, games: 17, total: 510 } },
  };
  const table = buildScheduleStrengthTable({
    pointsAllowedByOpponent: sparse,
    upcomingScheduleMap: buildUpcomingScheduleMap(buildSyntheticSeasonSchedule()),
    nowMs: Date.parse('2026-08-01T00:00:00.000Z'),
  });
  assert.equal(getScheduleSignal(table, 'KC', 'RB').label, 'Unavailable');
});

test('unknown teams fall back to an unavailable signal rather than throwing', () => {
  const table = { fromWeek: 1, byTeam: { KC: { RB: { label: 'Favorable', percentile: 75 } } } };
  assert.equal(getScheduleSignal(table, 'FA', 'RB').label, 'Unavailable');
  assert.equal(getScheduleSignal(table, 'KC', 'DEF').label, 'Unavailable');
  assert.equal(getScheduleSignal(null, 'KC', 'RB').label, 'Unavailable');
});
