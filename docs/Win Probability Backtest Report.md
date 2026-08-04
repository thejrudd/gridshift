# Win Probability Backtest Report

## Result

- Status: **neutral-failed-closed**
- Selected runtime recommendation: `{"calibration": {"knots": [{"calibrated": 0.0, "raw": 0.0}, {"calibrated": 0.5, "raw": 0.5}, {"calibrated": 1.0, "raw": 1.0}], "method": "symmetric-linear-v1"}, "guardrails": {"unsettledMaximum": 0.999, "unsettledMinimum": 0.001}, "mean": {"carryoverClamp": 0.5, "paceCarryover": 0.0}, "modelId": "live-win-probability-offline-v1", "provenance": {"evaluationSeason": 2025, "trainingSeasons": [2023, 2024]}, "schemaVersion": 1, "status": "neutral-fallback", "trainedThrough": null, "variance": {"matchupSigmaFloor": 3.0, "positionScale": {"DEF": 1.0, "FLEX": 1.0, "IDP": 1.0, "K": 1.0, "QB": 1.0, "RB": 1.0, "TE": 1.0, "WR": 1.0}, "remainingExponent": 1.0, "sourceScale": {"posDefault": 1.0, "projection": 1.0, "seasonAvg": 1.0}}}`
- The fitted coefficients are diagnostic only and must not replace the neutral runtime while any gate fails.
- Historical league identifiers, labels, raw plays, and matchup rows are intentionally omitted.

## Aggregate Sample

| Season | League-seasons | Paired matchups | Reconciled matchups |
| --- | ---: | ---: | ---: |
| 2023 | 4 | 349 | 73 |
| 2024 | 4 | 382 | 64 |
| 2025 | 5 | 490 | 101 |

- Total unsettled snapshots: **51,673**
- 2025 Weeks 15–18 paired/reconciled matchups: **71 / 10**

## Holdout Metrics

| Scope | Model | Brier | Log loss | ECE | Sharpness | Snapshots |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| evaluation | Neutral | 0.1456 | 0.4285 | 0.0386 | 0.1138 | 21991 |
| evaluation | Fitted | 0.1483 | 0.4416 | 0.0329 | 0.0899 | 21991 |
| evaluationWeeks1To14 | Neutral | 0.1527 | 0.4469 | 0.0452 | 0.1115 | 19669 |
| evaluationWeeks1To14 | Fitted | 0.1541 | 0.4564 | 0.0332 | 0.0873 | 19669 |
| late | Neutral | 0.0808 | 0.2609 | 0.1355 | 0.1346 | 2322 |
| late | Fitted | 0.0954 | 0.3070 | 0.1591 | 0.1135 | 2322 |
| early | Neutral | 0.2103 | 0.6054 | 0.0788 | 0.0716 | 8108 |
| early | Fitted | 0.2090 | 0.6007 | 0.0396 | 0.0503 | 8108 |
| middle | Neutral | 0.1349 | 0.4022 | 0.0436 | 0.1141 | 7458 |
| middle | Fitted | 0.1386 | 0.4201 | 0.0624 | 0.0899 | 7458 |
| lateGame | Neutral | 0.0759 | 0.2346 | 0.0268 | 0.1671 | 6425 |
| lateGame | Fitted | 0.0824 | 0.2648 | 0.0527 | 0.1401 | 6425 |

## Candidate Parameters

- Fitted candidate: `{"calibrationKnots": [{"calibrated": 0.01321, "raw": 0.0}, {"calibrated": 0.01321, "raw": 0.013085}, {"calibrated": 0.0706, "raw": 0.074762}, {"calibrated": 0.144963, "raw": 0.123374}, {"calibrated": 0.144963, "raw": 0.175542}, {"calibrated": 0.202835, "raw": 0.224602}, {"calibrated": 0.262045, "raw": 0.275036}, {"calibrated": 0.339029, "raw": 0.326405}, {"calibrated": 0.420234, "raw": 0.375467}, {"calibrated": 0.443554, "raw": 0.424115}, {"calibrated": 0.5, "raw": 0.476942}, {"calibrated": 0.5, "raw": 0.5}, {"calibrated": 0.5, "raw": 0.523058}, {"calibrated": 0.556446, "raw": 0.575885}, {"calibrated": 0.579766, "raw": 0.624533}, {"calibrated": 0.660971, "raw": 0.673595}, {"calibrated": 0.737955, "raw": 0.724964}, {"calibrated": 0.797165, "raw": 0.775398}, {"calibrated": 0.855037, "raw": 0.824458}, {"calibrated": 0.855037, "raw": 0.876626}, {"calibrated": 0.9294, "raw": 0.925238}, {"calibrated": 0.98679, "raw": 0.986915}, {"calibrated": 0.98679, "raw": 1.0}], "paceCarryover": 0.5, "remainingExponent": 0.8, "sigmaFloor": 8.0, "sigmaScale": 1.35}`

## Gates

| Gate | Result | Detail |
| --- | --- | --- |
| timestampCoverage | PASS | 100.0% (minimum 99%) |
| offenseKDstMapping | FAIL | 96.2% (minimum 98%) |
| idpMapping | PASS | 98.3% (minimum 95%) |
| supportedScoring | FAIL | 2 unsupported nonzero keys |
| reconstructionSurvival | FAIL | 19.5% (minimum 70%) |
| trainingMatchups | FAIL | 137 (minimum 250) |
| evaluationMatchups | PASS | 101 (minimum 60) |
| lateEvaluationMatchups | FAIL | 10 (minimum 60) |
| snapshotCount | PASS | 51673 (minimum 4,000) |
| evaluationEce | PASS | 0.0329 (maximum 0.0400) |
| evaluationEceImprovement | PASS | 14.6% relative improvement when required |
| evaluationBrier | FAIL | +0.0027 versus baseline (maximum +0.0020) |
| evaluationLogLoss | FAIL | +0.0132 versus baseline (maximum +0.0050) |
| sharpness | FAIL | 79.0% of baseline (minimum 90%) |
| lateEvaluationEce | FAIL | 0.1591 (maximum 0.0700) |

## Reconstruction Notes

- nflverse play-by-play supplies event order, UTC wall-clock timestamps, game clocks, GSIS IDs, and offensive, kicking, defensive, and return attribution.
- Sleeper supplies lineups, league scoring, authoritative final player points, and matchup outcomes.
- BALLDONTLIE is not used. Sleeper plus nflverse are sufficient for this offline backtest.
- Each starter's baseline projection uses only that season's outcomes from earlier weeks. Current scoring is compared with the elapsed share of that projection, so being ahead of or behind pace directly affects the remaining mean.
- Snapshots are sampled every 15 minutes while at least one NFL game is active, plus kickoff and final transitions; idle overnight gaps are not repeated.
- Earlier snapshots are never rescaled with final Sleeper totals. Final totals are used only for labels and reconciliation gates.
- Model parameters are fitted only on 2023–2024. All 2025 metrics are holdout results.
- Unsupported nonzero scoring keys found: **2**.
- Unsupported keys: `st_ff`, `st_fum_rec`
