import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDrilldownOpponentContext,
  buildPlayerOutlook,
  buildPlayerProjectionBreakdown,
  buildPlayerStatComparison,
  getNoteworthyWeather,
  getPlayerPerformanceTarget,
  getPlayerMatchupPhase,
  getRangeMarkerPosition,
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
