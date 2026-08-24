import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  appendWinProbPoint,
  calibrateWinProbability,
  computeSideOutlook,
  computeWinProbability,
  explainWinProbability,
  formatWinProbabilityPair,
  getStarterOutlook,
  projectSideOutlookAtMoment,
  resolveStarterProjection,
} from '../../src/utils/liveWinProbability.js';

const starter = ({ current, projected, fraction }) => getStarterOutlook({
  current,
  position: 'RB',
  projection: { projected, min: projected * 0.6, max: projected * 1.4 },
  fallbackAvg: null,
  fraction,
});

describe('resolveStarterProjection', () => {
  it('prefers the supplied projection', () => {
    const result = resolveStarterProjection({
      position: 'QB',
      projection: { projected: 21, min: 14, max: 28 },
      fallbackAvg: 9,
    });
    assert.equal(result.projected, 21);
    assert.equal(result.source, 'projection');
  });

  it('falls back to the season average, then the position default', () => {
    assert.deepEqual(
      resolveStarterProjection({ position: 'QB', projection: null, fallbackAvg: 12 }).source,
      'seasonAvg',
    );
    const fallback = resolveStarterProjection({ position: 'QB', projection: null, fallbackAvg: null });
    assert.equal(fallback.source, 'posDefault');
    assert.equal(fallback.projected, 17);
  });
});

describe('explainWinProbability', () => {
  it('breaks the odds into the parts they were built from', () => {
    const sideA = computeSideOutlook([
      starter({ current: 18, projected: 20, fraction: 0 }),
      starter({ current: 4, projected: 16, fraction: 0.5 }),
    ]);
    const sideB = computeSideOutlook([
      starter({ current: 12, projected: 14, fraction: 0 }),
      starter({ current: 0, projected: 12, fraction: 1 }),
    ]);
    const result = computeWinProbability(sideA, sideB);
    const explain = explainWinProbability(result, sideA, sideB);

    assert.equal(explain.settled, false);
    // 22 live, plus half of the second starter's 16-point projection.
    assert.equal(explain.a.current, 22);
    assert.equal(explain.a.remaining, 8);
    assert.equal(explain.a.expected, 30);
    assert.equal(explain.b.expected, 24);
    assert.equal(explain.margin, 6);
    assert.equal(explain.marginLeaderKey, 'a');
    // Only the starters with games left count as still to play.
    assert.equal(explain.playersRemaining, 2);
    assert.ok(explain.swing > 0);
    assert.equal(explain.a.keyMovers[0].paceDelta, -4);
  });

  it('reports a settled matchup with nothing left to swing', () => {
    const side = (current) => computeSideOutlook([starter({ current, projected: 15, fraction: 0 })]);
    const sideA = side(30);
    const sideB = side(20);
    const explain = explainWinProbability(
      computeWinProbability(sideA, sideB, { settledConfirmed: true }),
      sideA,
      sideB,
    );

    assert.equal(explain.settled, true);
    assert.equal(explain.playersRemaining, 0);
    assert.equal(explain.swing, 0);
    assert.equal(explain.margin, 10);
  });

  it('returns null without both side outlooks', () => {
    assert.equal(explainWinProbability(null, {}, {}), null);
    assert.equal(explainWinProbability({}, null, {}), null);
  });
});

describe('win-probability guardrails and calibration', () => {
  it('never returns exact certainty while the matchup is unsettled', () => {
    const sideA = computeSideOutlook([starter({ current: 60, projected: 20, fraction: 0.01 })]);
    const sideB = computeSideOutlook([starter({ current: 0, projected: 10, fraction: 1 })]);
    const result = computeWinProbability(sideA, sideB);

    assert.equal(result.settled, false);
    assert.equal(result.probA, 99.9);
    assert.deepEqual(formatWinProbabilityPair(result.probA), { a: '>99%', b: '<1%' });
    assert.deepEqual(formatWinProbabilityPair(Number.NaN), { a: '—', b: '—' });
  });

  it('waits for explicit final reconciliation even when no player time remains', () => {
    const sideA = computeSideOutlook([starter({ current: 30, projected: 15, fraction: 0 })]);
    const sideB = computeSideOutlook([starter({ current: 20, projected: 15, fraction: 0 })]);
    const pending = computeWinProbability(sideA, sideB);
    const confirmed = computeWinProbability(sideA, sideB, { settledConfirmed: true });

    assert.equal(pending.settled, false);
    assert.equal(pending.settlementPending, true);
    assert.notEqual(pending.probA, 100);
    assert.equal(confirmed.settled, true);
    assert.equal(confirmed.probA, 100);
    assert.deepEqual(formatWinProbabilityPair(confirmed.probA, { settled: true }), { a: '100%', b: '0%' });
  });

  it('applies bounded ahead-or-behind-pace carryover per starter', () => {
    const model = {
      mean: { paceCarryover: 0.5, carryoverClamp: 0.25 },
      variance: {
        remainingExponent: 1,
        positionScale: { RB: 1, FLEX: 1 },
        sourceScale: { projection: 1 },
      },
    };
    const ahead = getStarterOutlook({
      current: 12,
      position: 'RB',
      projection: { projected: 16, min: 8, max: 24 },
      fraction: 0.5,
      model,
    });

    assert.equal(ahead.expectedAtNow, 8);
    assert.equal(ahead.paceDelta, 4);
    assert.equal(ahead.baseRemaining, 8);
    assert.equal(ahead.paceCarryover, 1);
    assert.equal(ahead.remainingProj, 9);
  });

  it('fails open to a full game remaining when progress is unavailable', () => {
    const outlook = getStarterOutlook({
      current: 0,
      position: 'RB',
      projection: { projected: 16, min: 8, max: 24 },
      fraction: undefined,
    });

    assert.equal(outlook.fraction, 1);
    assert.equal(outlook.remainingProj, 16);
  });

  it('does not add a second full projection once fallback progress is known', () => {
    const outlook = getStarterOutlook({
      current: 8,
      position: 'RB',
      projection: { projected: 16, min: 8, max: 24 },
      fraction: 0.5,
    });

    assert.equal(outlook.current + outlook.remainingProj, 16);
  });

  it('interpolates a frozen monotonic calibration table', () => {
    const model = {
      calibration: {
        knots: [
          { raw: 0, calibrated: 0 },
          { raw: 0.5, calibrated: 0.5 },
          { raw: 1, calibrated: 0.9 },
        ],
      },
    };
    assert.equal(calibrateWinProbability(0.75, model), 0.7);
  });
});

describe('win-probability history', () => {
  it('keeps a final tie even when its probability matches the prior snapshot', () => {
    const unsettled = {
      t: 1,
      p: 50,
      a: 100,
      b: 100,
      settled: false,
      settlementPending: true,
      modelId: 'model',
    };
    const settled = { ...unsettled, t: 2, settled: true, settlementPending: false };
    assert.deepEqual(appendWinProbPoint([unsettled], settled), [unsettled, settled]);
  });
});

describe('historical starter reconstruction', () => {
  it('uses each starter’s own score and remaining fraction without endpoint totals', () => {
    const endpoint = computeSideOutlook([
      getStarterOutlook({
        current: 24,
        playerId: 'early',
        position: 'RB',
        projection: { projected: 20, min: 10, max: 30 },
        fraction: 0,
      }),
      getStarterOutlook({
        current: 18,
        playerId: 'late',
        position: 'WR',
        projection: { projected: 16, min: 8, max: 24 },
        fraction: 0.2,
      }),
    ]);
    const replay = projectSideOutlookAtMoment(endpoint, {
      currentByPlayer: new Map([['early', 6]]),
      fractionByPlayer: new Map([
        ['early', 0.5],
        ['late', 1],
      ]),
    });

    assert.equal(replay.current, 6);
    assert.equal(replay.outlooks[0].current, 6);
    assert.equal(replay.outlooks[0].fraction, 0.5);
    assert.equal(replay.outlooks[1].current, 0);
    assert.equal(replay.outlooks[1].fraction, 1);
    assert.equal(replay.playersRemaining, 2);
    assert.equal(replay.remainingProj, 26);
  });
});
