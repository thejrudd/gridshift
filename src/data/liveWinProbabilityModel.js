// Generated production contract for Fantasy Live win probability.
//
// Historical league ids, raw matchup payloads, and nflverse play-by-play stay
// local and ignored. Only aggregate parameters that pass the holdout gates
// belong in the client bundle. Until calibration clears those gates, the model
// deliberately uses the neutral coefficients below while the correctness and
// finality safeguards remain active.

export const LIVE_WIN_PROBABILITY_MODEL = Object.freeze({
  schemaVersion: 1,
  modelId: 'live-win-probability-neutral-v1',
  status: 'neutral-fallback',
  trainedThrough: null,
  mean: {
    paceCarryover: 0,
    carryoverClamp: 0.5,
  },
  variance: {
    remainingExponent: 1,
    matchupSigmaFloor: 3,
    positionScale: {
      QB: 1,
      RB: 1,
      WR: 1,
      TE: 1,
      K: 1,
      DEF: 1,
      IDP: 1,
      FLEX: 1,
    },
    sourceScale: {
      projection: 1,
      seasonAvg: 1,
      posDefault: 1,
    },
  },
  calibration: {
    method: 'symmetric-linear-v1',
    knots: [
      { raw: 0, calibrated: 0 },
      { raw: 0.5, calibrated: 0.5 },
      { raw: 1, calibrated: 1 },
    ],
  },
  guardrails: {
    unsettledMinimum: 0.001,
    unsettledMaximum: 0.999,
  },
  provenance: {
    trainingSeasons: [2023, 2024],
    pairedTrainingMatchups: 731,
    reconciledTrainingMatchups: 137,
    evaluationSeason: 2025,
    pairedEvaluationMatchups: 490,
    reconciledEvaluationMatchups: 101,
    pairedLateEvaluationMatchups: 71,
    reconciledLateEvaluationMatchups: 10,
    dataFingerprint: null,
  },
});

export default LIVE_WIN_PROBABILITY_MODEL;
