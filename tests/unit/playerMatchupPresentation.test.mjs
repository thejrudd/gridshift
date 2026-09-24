import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDrilldownOpponentContext,
  buildPlayerOutlook,
  buildPlayerProjectionBreakdown,
  buildPlayerStatComparison,
  describePlayerNegativeStats,
  describePlayerStandoutStat,
  getNoteworthyWeather,
  getPaceAdjustedProjection,
  getPlayerPerformanceTarget,
  getPlayerMatchupPhase,
  getRangeMarkerPosition,
  groupFantasyBreakdownRows,
  matchupNumber,
} from '../../src/utils/playerMatchupPresentation.js';

test('player view follows its own kickoff, preserves pregame zeros, and recognizes final', () => {
  const kickoff = '2026-09-13T17:00:00Z';
  const before = Date.parse(kickoff) - 1;
  assert.equal(getPlayerMatchupPhase({ scheduleEntry: { kickoff }, gameStarted: true, hasStats: true, now: before }), 'pregame');
  assert.equal(getPlayerMatchupPhase({ scheduleEntry: { kickoff }, now: before + 1 }), 'live');
  assert.equal(getPlayerMatchupPhase({ scheduleEntry: { kickoff, completed: true }, now: before }), 'final');
  assert.equal(getPlayerMatchupPhase({ scheduleEntry: { kickoff, isFinal: true }, now: before }), 'final');
  assert.equal(getPlayerMatchupPhase({ scheduleEntry: { kickoff, final: true }, now: before }), 'final');
  assert.equal(getPlayerMatchupPhase({ scheduleEntry: { kickoff, completed: false, statusType: 'STATUS_FINAL' }, now: before }), 'pregame');
  assert.equal(getPlayerMatchupPhase({ scheduleEntry: { gameStatus: 'post-game' } }), 'final');
  assert.equal(getPlayerMatchupPhase({ scheduleEntry: { status: 'STATUS_IN_PROGRESS' } }), 'live');
  assert.equal(getPlayerMatchupPhase({ scheduleEntry: { status: 'STATUS_FINAL' } }), 'final');
  assert.equal(getPlayerMatchupPhase(), 'pregame');
});

test('missing actual or projected values never become a reported zero', () => {
  for (const value of [null, undefined, '', NaN, Infinity]) assert.equal(matchupNumber(value), null);
  assert.equal(matchupNumber(0), 0);
  assert.equal(buildPlayerProjectionBreakdown({ projected: 18 }, {}, 'QB'), null);
});

test('live performance target follows elapsed pace while final uses the full projection', () => {
  const kickoff = Date.parse('2026-09-15T17:00:00Z');
  const target = getPlayerPerformanceTarget({
    phase: 'live',
    total: 6.46,
    projected: 14.2,
    scheduleEntry: { kickoff: '2026-09-15T17:00:00Z' },
    now: kickoff + 60 * 60 * 1000,
  });
  assert.equal(target, 3.55);
  assert.equal(getPlayerPerformanceTarget({ phase: 'final', total: 6.46, projected: 14.2 }), 14.2);
  assert.equal(getPlayerPerformanceTarget({ phase: 'pregame', projected: 14.2 }), null);
});

test('projection breakdown respects league scoring and position bonuses', () => {
  const result = buildPlayerProjectionBreakdown({ projected: 9, projectedStats: { rec: 3, rec_yd: 30 } }, { rec: 1, rec_yd: 0.1, bonus_rec_te: 1 }, 'TE');
  assert.equal(result.total, 9);
  assert.equal(result.rows.reduce((total, row) => total + row.pts, 0), 9);
  assert.ok(result.rows.some(row => row.key === 'bonus_rec_te'));
});

test('projected stat-line grouping keeps every row and routes bonuses to their stat family', () => {
  const rows = [
    { key: 'rush_yd', statKey: 'rush_yd', pts: 5.62 },
    { key: 'rec_yd', statKey: 'rec_yd', pts: 2.16 },
    { key: 'bonus_rush_40p', statKey: 'bonus_rush_40p', pts: 0.18 },
    { key: 'bonus_rec_40p', statKey: 'bonus_rec_40p', pts: 0.17 },
    { key: 'bonus_rush_rec_yd_100', statKey: 'bonus_rush_rec_yd_100', pts: 0.4 },
    { key: 'fum_lost', statKey: 'fum_lost', pts: -0.09 },
    { key: 'pass_int', statKey: 'pass_int', pts: -0.32 },
    { key: 'scoring_adjustment', statKey: 'scoring_adjustment', pts: 0.02 },
  ];
  const groups = groupFantasyBreakdownRows(rows);
  assert.deepEqual(groups.map(group => group.id), ['rushing', 'receiving', 'bonus', 'negative', 'model']);
  assert.equal(groups.flatMap(group => group.rows).length, rows.length);
  assert.equal(groups.find(group => group.id === 'rushing').sum, 5.8);
  assert.equal(groups.find(group => group.id === 'negative').sum, -0.41);
  assert.deepEqual(groups.find(group => group.id === 'bonus').rows.map(row => row.key), ['bonus_rush_rec_yd_100']);
  assert.deepEqual(groupFantasyBreakdownRows([]), []);
});

test('stat comparison keeps unreported actuals and absent projected fields unavailable', () => {
  const actual = [{ statKey: 'pass_yd', label: 'Passing yards', statVal: 120 }, { statKey: 'scoring_adjustment', label: 'Adjustment', statVal: null }];
  const projected = [{ statKey: 'pass_yd', label: 'Passing yards', statVal: 240 }, { statKey: 'pass_td', label: 'Passing TD', statVal: 2 }];
  assert.deepEqual(buildPlayerStatComparison([], projected, false).map(row => row.actual), [null, null]);
  const result = buildPlayerStatComparison(actual, projected, true);
  assert.equal(result.length, 2);
  assert.equal(result[0].difference, -120);
  assert.equal(result[1].actual, 0);
  assert.equal(result[1].difference, -2);
  assert.equal(buildPlayerStatComparison(actual, [], true)[0].projected, null);
});

test('standout metric follows position and the authoritative scoring contribution', () => {
  const quarterback = {
    position: 'QB',
    statByKey: new Map([
      ['pass_td', { statVal: 2, pts: 8 }],
      ['pass_yd', { statVal: 315, pts: 12.6 }],
    ]),
  };
  const receiver = {
    position: 'WR',
    statByKey: new Map([
      ['rec_td', { statVal: 1, pts: 6 }],
      ['rec_yd', { statVal: 112, pts: 11.2 }],
    ]),
  };
  const defender = {
    position: 'LB',
    statByKey: new Map([
      ['idp_sack', { statVal: 1, pts: 4 }],
      ['idp_tkl', { statVal: 9, pts: 9 }],
    ]),
  };
  const teamDefense = {
    position: 'DEF',
    statByKey: new Map([
      ['def_td', { statVal: 1, pts: 6 }],
      ['sack', { statVal: 5, pts: 5 }],
    ]),
  };

  assert.equal(describePlayerStandoutStat(quarterback), '315 passing yards');
  assert.equal(describePlayerStandoutStat(receiver), '112 receiving yards');
  assert.equal(describePlayerStandoutStat(defender), '9 tackles');
  assert.equal(describePlayerStandoutStat(teamDefense), '1 defensive touchdown');
});

test('standout metric preserves missing and reported-zero semantics', () => {
  assert.equal(describePlayerStandoutStat(null), null);
  assert.equal(describePlayerStandoutStat({ position: 'QB', statByKey: new Map([['pass_td', { statVal: 0, pts: 0 }]]) }), null);
  assert.equal(describePlayerStandoutStat({ position: 'WR', statByKey: new Map([['rec_yd', { statVal: null, pts: null }]]) }), null);
  assert.equal(describePlayerStandoutStat({ position: 'QB', statByKey: new Map([['rec_td', { statVal: 3, pts: 18 }]]) }), null);
  assert.equal(describePlayerStandoutStat({ position: 'QB', statByKey: new Map([['pass_yd', { statVal: 80, pts: null }]]) }), '80 passing yards');
});

test('negative recap metrics preserve factual sacks, interceptions, and missing data', () => {
  const quarterback = {
    position: 'QB',
    statByKey: new Map([
      ['pass_sack', { statVal: 4, pts: 0 }],
      ['pass_int', { statVal: 1, pts: -2 }],
    ]),
  };
  assert.equal(describePlayerNegativeStats(quarterback), '4 sacks and 1 interception');
  assert.equal(describePlayerNegativeStats({ position: 'QB', statByKey: new Map([['pass_sack', { statVal: 0, pts: 0 }]]) }), null);
  assert.equal(describePlayerNegativeStats({ position: 'RB', statByKey: new Map([['pass_int', { statVal: 1, pts: -2 }]]) }), null);
  assert.equal(describePlayerNegativeStats({ position: 'QB', statByKey: new Map([['pass_sack', { statVal: null, pts: null }]]) }), null);
});

test('drilldown opponent context progressively replaces prior-season evidence without changing shared defense data', () => {
  const currentDefenseTable = {
    CLE: { QB: { 1: 10, 2: 20 } },
    BAL: { QB: { 1: 8, 2: 12 } },
  };
  const priorDefenseTable = {
    CLE: { QB: { 1: 20, 2: 22, 3: 24, 4: 26 } },
    BAL: { QB: { 1: 12, 2: 14, 3: 16, 4: 18 } },
  };
  const result = buildDrilldownOpponentContext({ currentDefenseTable, priorDefenseTable, oppTeam: 'CLE', position: 'QB', beforeWeek: 3 });
  assert.equal(result.evidenceKind, 'blended');
  assert.equal(result.currentWeight, 0.5);
  assert.equal(result.ptsAllowedPerGame, 19);
  assert.equal(result.rank, 2);
  assert.equal(result.teamCount, 2);
  assert.equal(result.leagueAveragePtsAllowed, 15.75);
  assert.equal(result.differenceFromLeagueAverage, 3.25);
  assert.deepEqual(currentDefenseTable.CLE.QB, { 1: 10, 2: 20 });
});

test('opponent defense rank uses shared competition ranking for tied allowances', () => {
  const result = buildDrilldownOpponentContext({
    currentDefenseTable: {
      CLE: { QB: { 1: 15, 2: 15, 3: 15 } },
      BAL: { QB: { 1: 15, 2: 15, 3: 15 } },
      PIT: { QB: { 1: 10, 2: 10, 3: 10 } },
    },
    oppTeam: 'CLE',
    position: 'QB',
    beforeWeek: 4,
  });
  assert.equal(result.rank, 2);
  assert.equal(result.teamCount, 3);
});

test('weekly outlook stays evidence-led and treats availability as risk', () => {
  const strong = buildPlayerOutlook({
    projection: 20,
    seasonAverage: 16,
    opponentContext: { team: 'CLE', position: 'QB', ptsAllowedPerGame: 19, leagueAveragePtsAllowed: 15 },
  });
  assert.equal(strong.label, 'Strong outlook');
  assert.match(strong.sentence, /season average/);
  assert.match(strong.sentence, /CLE's 19.0 QB allowance/);

  const unavailable = buildPlayerOutlook({ projection: 20, seasonAverage: 16, availabilityStatus: 'Out' });
  assert.equal(unavailable.label, 'Very risky outlook');
  assert.match(unavailable.sentence, /availability risk/);
});

test('weather promotion is outdoor-only and range markers clamp to the expected band', () => {
  const weather = { temp_c: -2, wind_kph: 30, precipitation_mm: 4 };
  assert.equal(getNoteworthyWeather({ weather, isIndoor: true, position: 'QB' }), null);
  assert.match(getNoteworthyWeather({ weather, isIndoor: false, position: 'QB' }).sentence, /volatility/);
  assert.equal(getRangeMarkerPosition(15, 10, 20), 50);
  assert.equal(getRangeMarkerPosition(25, 10, 20), 100);
  assert.equal(getRangeMarkerPosition(null, 10, 20), null);
});

test('getPaceAdjustedProjection moves a live projection with pace and leaves other phases alone', () => {
  const now = Date.parse('2026-09-13T18:00:00Z');
  const scheduleEntry = { kickoff: '2026-09-13T17:00:00Z', completed: false };
  const args = { phase: 'live', projected: 20, scheduleEntry, now };
  const target = getPlayerPerformanceTarget({ ...args, total: 0 });
  const onPace = getPaceAdjustedProjection({ ...args, total: target });
  const ahead = getPaceAdjustedProjection({ ...args, total: target + 8 });
  const behind = getPaceAdjustedProjection({ ...args, total: 0 });
  assert.ok(Math.abs(onPace - 20) < 0.2);
  assert.ok(ahead > onPace);
  assert.ok(behind < onPace);
  assert.equal(getPaceAdjustedProjection({ ...args, phase: 'pregame', total: 0 }), null);
  assert.equal(getPaceAdjustedProjection({ ...args, phase: 'final', total: 22 }), null);
  assert.equal(getPaceAdjustedProjection({ ...args, projected: null, total: 5 }), null);
});
