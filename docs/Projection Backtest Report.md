# Projection Backtest Report

## Scope

- League requested: `1203147305117560832`
- League name: `CTRL+ALT+DEFEAT`
- Season: `2025`
- Player pool: rostered fantasy-relevant players with enough prior games for GridShift to produce a projection
- Actual scoring: recomputed from weekly Sleeper stat lines using imported league scoring settings
- Projection source: GridShift's current `projectPlayer()` algorithm in `src/utils/projectionEngine.js`
- Model split: position groups `QB`, `RB`, `WR`, `TE`, `K`, `DL`, `LB`, `DB`

## Baseline Results

Corrected current-model run:

- Rows: `3,052`
- Minimum prior scored games: `2`
- Weather: disabled in this standalone run
- Actual scoring: recomputed from Sleeper weekly stats using the league scoring settings
- Opponent strength: league average now comes from the same defense-table path as Matchup UI

| Scope | N | MAE | RMSE | Bias | P90 Abs Error | Weighted Score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Overall | 3,052 | 6.74 | 9.13 | 0.02 | 14.60 | 9.03 |
| DB | 263 | 5.57 | 8.40 | 0.10 | 11.56 | 7.62 |
| DL | 322 | 7.81 | 10.53 | -0.32 | 16.69 | 10.40 |
| K | 197 | 2.63 | 3.37 | 0.23 | 5.84 | 3.49 |
| LB | 341 | 5.71 | 7.93 | 0.44 | 12.60 | 7.75 |
| QB | 282 | 8.67 | 10.66 | -0.20 | 16.82 | 10.90 |
| RB | 671 | 7.59 | 10.10 | -0.24 | 16.70 | 10.17 |
| TE | 312 | 6.55 | 8.67 | -0.04 | 13.54 | 8.58 |
| WR | 664 | 6.82 | 8.88 | 0.25 | 14.27 | 8.93 |

Interpretation:

- The model is almost unbiased overall (`+0.02`), so the average projection level is close.
- The main weakness is volatility and ceiling misses, especially `QB`, `DL`, and `RB`.
- Kicker projections are comparatively stable, but that is also a lower-scoring position.
- IDP big-play positions, especially `DL`, need a different treatment than offensive volume positions.
- The explicit opponent-strength factor made the corrected baseline worse than the neutral matchup run (`9.03` vs `8.78` weighted score), so matchup favorability should be dampened or disabled by position until a stronger signal is found.

## Iteration 1 Results

The variant runner is:

```bash
node --loader ./scripts/node-esm-extension-loader.mjs scripts/projection-variant-backtest.mjs --league <sleeperLeagueId> --season 2025
```

Variants tested:

- `currentNoMatchup`: current GridShift model with opponent multiplier disabled
- `firstMatrix`: conservative per-position base blend, home/away gating, softer matchup clamps, and usage trend rules
- `firstMatrixNoMatchup`: same conservative matrix with opponent multiplier disabled

| Variant | MAE | RMSE | Bias | P90 Abs Error | Weighted Score | Delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Current baseline | 6.74 | 9.13 | 0.02 | 14.60 | 9.03 | — |
| Current no matchup | 6.60 | 8.92 | 0.04 | 14.05 | 8.78 | -0.25 |
| First matrix | 6.58 | 8.97 | -0.34 | 14.50 | 8.88 | -0.15 |
| First matrix no matchup | 6.57 | 8.94 | -0.29 | 14.30 | 8.83 | -0.20 |

Best full-season variant by position:

| Position | Best Variant | Weighted Score | Baseline | Improvement |
| --- | --- | ---: | ---: | ---: |
| DB | First matrix no matchup | 7.36 | 7.62 | 0.26 |
| DL | First matrix | 9.98 | 10.40 | 0.42 |
| K | First matrix no matchup | 3.26 | 3.49 | 0.23 |
| LB | First matrix no matchup | 7.41 | 7.75 | 0.34 |
| QB | First matrix | 10.64 | 10.90 | 0.26 |
| RB | Current no matchup | 9.91 | 10.17 | 0.26 |
| TE | Current no matchup | 8.20 | 8.58 | 0.38 |
| WR | Current no matchup | 8.62 | 8.93 | 0.31 |

Rolling-window checks:

- `currentNoMatchup` was the best overall variant in all three windows: weeks `11-14`, `13-16`, and holdout `15-18`.
- `firstMatrix` consistently helped `DL` and helped `QB`, though QB developed a meaningful under-projection bias.
- `currentNoMatchup` was the cleanest signal for `RB`, `TE`, and `WR`.
- `LB` improved full-season but regressed on the holdout window, so it should not be shipped yet without another IDP-specific pass.

## Iteration 2 Results

Additional variants tested:

- Base-only no matchup: current 60/40 base, no home/away, no snap, no matchup
- Location-only no matchup: base plus raw home/away
- Usage-only no matchup: base plus snap/usage trend
- Gated location + usage no matchup
- Base-weight grids for skill positions and IDP
- Dampened QB/DL matchup: only QB and DL, at least six prior opponent games, power-transformed and tightly clamped

Compact result:

| Variant | Weighted Score |
| --- | ---: |
| Current baseline before tuning | 9.03 |
| Current no matchup | 8.78 |
| Base-only no matchup | 8.78 |
| Usage-only no matchup | 8.87 |
| Conservative skill no matchup | 8.82 |
| Conservative IDP no matchup | 8.82 |
| Dampened QB/DL matchup | 8.82 |
| Production candidate | 8.77 |

Best by rolling window:

| Window | Best Variant | Weighted Score | Baseline | Improvement |
| --- | --- | ---: | ---: | ---: |
| Weeks 11-14 | Base-only no matchup | 8.20 | 8.43 | 0.23 |
| Weeks 13-16 | Base-only no matchup | 8.32 | 8.59 | 0.27 |
| Weeks 15-18 holdout | Iteration 2 hybrid | 8.39 | 8.74 | 0.35 |

Production change selected:

- Neutralize home/away multiplier.
- Neutralize snap multiplier.
- Neutralize matchup multiplier for all positions except `QB` and `DL`.
- For `QB`, apply matchup only after six opponent games, using `rawFactor ** 0.35`, clamped `0.94-1.06`.
- For `DL`, apply matchup only after six opponent games, using `rawFactor ** 0.40`, clamped `0.93-1.08`.

Post-change `projectPlayer()` baseline:

| Scope | N | MAE | RMSE | Bias | P90 Abs Error | Weighted Score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Overall | 3,052 | 6.55 | 8.86 | -0.03 | 14.20 | 8.77 |
| DB | 263 | 5.47 | 8.18 | 0.09 | 11.14 | 7.42 |
| DL | 322 | 7.71 | 10.38 | -0.40 | 16.10 | 10.19 |
| K | 197 | 2.56 | 3.21 | 0.19 | 5.14 | 3.27 |
| LB | 341 | 5.53 | 7.63 | 0.46 | 12.00 | 7.45 |
| QB | 282 | 8.44 | 10.52 | -0.18 | 17.72 | 10.92 |
| RB | 671 | 7.37 | 9.81 | -0.38 | 16.20 | 9.87 |
| TE | 312 | 6.29 | 8.34 | -0.26 | 12.14 | 8.08 |
| WR | 664 | 6.62 | 8.49 | 0.33 | 13.77 | 8.61 |

Next iteration should focus on:

- Position-specific base weights that can beat the production candidate, not just the old baseline.
- A cleaner IDP usage pass once defensive snap field availability is measured directly.
- A weather-specific historical sample, because weather remains enabled but was not isolated in the 2025 batch run.

## Iteration 3 Results

Defensive-player field audit:

```bash
node --loader ./scripts/node-esm-extension-loader.mjs scripts/projection-field-audit.mjs --league 1203147305117560832 --season 2025
```

Sleeper's 2025 stat rows have enough IDP workload data to test usage:

| Scope | Rows | Defensive Snap Share Coverage | Any IDP Stat | Tackles | Pass Rush | Coverage | Disruption |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| All IDP | 1,154 | 93.3% | 97.7% | 95.0% | 43.0% | 26.2% | 12.2% |
| DL | 416 | 93.0% | 96.2% | 92.5% | 71.4% | 15.9% | 14.2% |
| LB | 416 | 93.0% | 98.3% | 96.2% | 40.1% | 22.4% | 12.5% |
| DB | 322 | 94.1% | 98.8% | 96.6% | 9.9% | 44.4% | 9.3% |

Useful fields found:

- Defensive snaps: `def_snp`
- Team defensive snaps: `tm_def_snp`
- Core IDP production: `idp_tkl`, `idp_tkl_solo`, `idp_tkl_ast`, `idp_tkl_loss`, `idp_sack`, `idp_qbhit`, `idp_pd`, `idp_int`, `idp_ff`, `idp_fr`

Variant tested:

- `productionIdpUsage`: current production candidate everywhere, with only `DL/LB/DB` allowed to use recent defensive snap-share and IDP-opportunity trend multipliers.
- IDP usage clamps: `DL 0.88-1.12`, `LB 0.86-1.14`, `DB 0.88-1.12`.
- Active zero-game handling: count IDP games with enough defensive snap share even if fantasy points were zero.

Result:

| Scope | Production Candidate | IDP Usage Variant | Delta |
| --- | ---: | ---: | ---: |
| Overall | 8.77 | 8.79 | +0.02 |
| DB | 7.42 | 7.52 | +0.10 |
| DL | 10.19 | 10.41 | +0.22 |
| LB | 7.45 | 7.61 | +0.16 |

Interpretation:

- Defensive snap and IDP opportunity data are available, but using recent workload as a direct multiplier made every IDP group worse.
- The likely issue is not field availability; it is multiplier shape. Recent snap/opportunity changes amplify noise and big-play volatility, especially for `DL`.
- Do not ship raw IDP usage multipliers. Revisit IDP workload as a baseline sample filter, role classification, or floor/ceiling input instead of multiplying the mean projection.

## Iteration 4 Results

Base-weight grid tested recent-vs-season blend by position while keeping usage neutral and leaving the current dampened `QB/DL` matchup rules in place.

Best production-relative combined candidate:

| Variant | QB | RB | WR | TE | K | DL | LB | DB | Weighted Score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Current production | 0.60 | 0.60 | 0.60 | 0.60 | 0.60 | 0.60 | 0.60 | 0.60 | 8.77 |
| `combinedIdpLowReceivers` | 0.50 | 0.60 | 0.50 | 0.50 | 0.35 | 0.30 | 0.35 | 0.30 | 8.73 |

Rolling windows:

| Window | Best Variant | Weighted Score | Baseline | Improvement |
| --- | --- | ---: | ---: | ---: |
| Weeks 11-14 | `combinedIdpLowReceivers` | 8.13 | 8.19 | 0.06 |
| Weeks 13-16 | `combinedIdpLowReceivers` | 8.23 | 8.31 | 0.08 |
| Weeks 15-18 holdout | `combinedIdpLowReceivers` | 8.35 | 8.42 | 0.07 |

Production change selected:

- Use position-specific recent weights instead of fixed `0.60`.
- Keep `RB` at `0.60`.
- Reduce recent weighting for `QB`, `WR`, `TE`, `K`, and all IDP groups.
- Keep matchup rules unchanged from Iteration 2.

Post-change `projectPlayer()` baseline:

| Scope | N | MAE | RMSE | Bias | P90 Abs Error | Weighted Score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Overall | 3,052 | 6.53 | 8.82 | -0.03 | 14.10 | 8.73 |
| DB | 263 | 5.42 | 8.10 | 0.13 | 10.70 | 7.28 |
| DL | 322 | 7.63 | 10.26 | -0.55 | 15.80 | 10.05 |
| K | 197 | 2.52 | 3.17 | 0.19 | 5.08 | 3.23 |
| LB | 341 | 5.50 | 7.56 | 0.56 | 11.70 | 7.36 |
| QB | 282 | 8.40 | 10.46 | -0.22 | 17.60 | 10.86 |
| RB | 671 | 7.37 | 9.81 | -0.38 | 16.20 | 9.87 |
| TE | 312 | 6.28 | 8.31 | -0.28 | 12.04 | 8.04 |
| WR | 664 | 6.61 | 8.48 | 0.32 | 13.60 | 8.57 |

## Iteration 5 Results

After freezing the tuned base weights, matchup rules were retested around the production candidate:

- `tunedNoMatchup`
- `tunedCurrentQbDl`
- `tunedTightQbDl`
- `tunedQbOnly`
- `tunedDlOnly`
- `tunedWideQbDl`

Result:

| Variant | Weighted Score |
| --- | ---: |
| Tuned no matchup | 8.73 |
| Tuned current QB/DL matchup | 8.73 |
| Tuned tight QB/DL matchup | 8.75 |
| Tuned QB only | 8.73 |
| Tuned DL only | 8.73 |
| Tuned wide QB/DL matchup | 8.73 |

Interpretation:

- Matchup rules did not produce a meaningful improvement after base tuning.
- The current dampened `QB/DL` rules are not harmful at the overall precision shown here, but there is not enough evidence to widen matchup effects.
- Keep `RB/WR/TE/K/LB/DB` matchup neutral.

## Weather And Context Audit

Historical weather/team-context testing is feasible, but should be isolated as its own pass.

Available repo sources:

- Weather: `src/api/weatherApi.js` uses Open-Meteo archive data.
- Stadium context: `src/data/stadiums.js` includes indoor flags and coordinates.
- Schedule context: `src/utils/playerApi.js` fetches ESPN schedule, home/away, opponent, scores, and event IDs.
- Odds/team context: `src/data/odds.js` and `scripts/extract_odds.py` provide nflverse-derived odds data.

Blockers before weather should influence production:

- Weather dates should come from actual ESPN event dates, not only primary Sunday week dates.
- Kickoff-time weather is not yet aligned; current Open-Meteo utility samples a fixed local time.
- Historical depth chart and injury context are not available safely from current repo data.

## Iteration 6 Results

Context mode in the variant runner:

```bash
node --loader ./scripts/node-esm-extension-loader.mjs scripts/projection-variant-backtest.mjs --league 1203147305117560832 --season 2025 --compact --context
```

Coverage:

| Rows | Indoor Rows | Weather Known Rows | Odds Known Rows |
| ---: | ---: | ---: | ---: |
| 3,052 | 957 | 2,891 | 2,891 |

Context variants tested:

- `weatherCurrent`: current weather penalties using ESPN event date, home stadium indoor flag, and Open-Meteo archive weather.
- `weatherNoMatchup`: weather plus matchup neutralized.
- `teamTotalTiny`: tiny implied-team-total multiplier from nflverse odds.
- `teamTotalModerate`: stronger implied-team-total multiplier.
- `weatherTeamTotalTiny`: weather plus tiny implied-team-total multiplier.
- `weatherNoMatchupTeamTotalTiny`: weather, no matchup, plus tiny implied-team-total multiplier.

Overall results:

| Variant | MAE | RMSE | Bias | P90 Abs Error | Weighted Score |
| --- | ---: | ---: | ---: | ---: | ---: |
| Current tuned baseline | 6.53 | 8.82 | -0.03 | 14.10 | 8.73 |
| Weather current | 6.50 | 8.80 | -0.13 | 14.10 | 8.71 |
| Weather no matchup | 6.51 | 8.81 | -0.12 | 14.10 | 8.71 |
| Team total tiny | 6.53 | 8.82 | 0.03 | 14.00 | 8.71 |
| Team total moderate | 6.54 | 8.83 | 0.05 | 14.10 | 8.74 |
| Weather + team total tiny | 6.51 | 8.81 | -0.07 | 14.00 | 8.70 |
| Weather no matchup + team total tiny | 6.51 | 8.81 | -0.06 | 14.00 | 8.70 |

Rolling windows:

| Window | Best Variant | Weighted Score | Baseline | Improvement |
| --- | --- | ---: | ---: | ---: |
| Weeks 11-14 | `weatherNoMatchup` | 8.04 | 8.13 | 0.09 |
| Weeks 13-16 | `weatherNoMatchupTeamTotalTiny` | 8.14 | 8.23 | 0.09 |
| Weeks 15-18 holdout | `weatherCurrent` | 8.32 | 8.35 | 0.03 |

Interpretation:

- Weather is a small but consistent positive signal and is already part of production projection inputs when weather is available.
- Implied team total helped overall only when combined with weather, but it worsened several position groups (`WR`, `RB`, `K`, and `QB`) enough that it should remain experimental.
- Disabling the current `QB/DL` matchup factor did not clearly beat weather-current once weather was included.

Production change selected:

- Keep the existing weather factor.
- Do not ship implied-team-total multipliers yet.
- Improve live weather alignment by carrying ESPN event dates through `fetchSeasonSchedule()` and using the actual event date for Matchup weather fetches instead of the primary Sunday date for the week.

## Implementation Finding

The Matchup UI was passing `activeScoringSettings` into `projectPlayer()`, but the engine expects the prop name `scoringSettings`. That meant displayed matchup projections could silently fall back to default scoring inside projection calculations. This has been corrected in `src/components/companion/CompanionMatchup.jsx`.

## Data Caveat

The standalone backtest does not yet run the full browser-side ESPN player team/opponent enrichment pass from `SleeperContext.jsx`. The current run still has enough schedule data to infer opponent for most projected rows, but traded players and rows missing `opp` can still be noisier than the live app.

## Harness Added

The repeatable report runner is:

```bash
node --loader ./scripts/node-esm-extension-loader.mjs scripts/projection-backtest.mjs --league <sleeperLeagueId> --season 2025
```

It fetches the league, rosters, Sleeper players, weekly stats, and ESPN schedule, then replays the current projection model for each eligible player-week before the actual result is known.

Output metrics:

- `MAE`: average absolute miss
- `RMSE`: penalizes large misses
- `bias`: positive means GridShift over-projected, negative means under-projected
- `p90AbsError`: miss size at the 90th percentile
- `weightedScore`: `50% MAE + 30% RMSE + 20% p90AbsError`

## Current Model Audit

After the production-candidate tuning, `projectPlayer()` currently uses:

- `blendedBase`: position-specific recent-vs-season blend over the last four scored games
  - `QB 0.50`, `RB 0.60`, `WR 0.50`, `TE 0.50`, `K 0.35`, `DL 0.30`, `LB 0.35`, `DB 0.30`
- `locationFactor`: neutral `1.0`; raw home/away split is retained only for diagnostics
- `oppFactor`: neutral for all positions except dampened `QB` and `DL` matchup rules after at least six opponent games
- `weatherFactor`: cold, wind, and precipitation penalties, mostly affecting passing positions
- `snapFactor`: neutral `1.0`; raw offensive snap trend is retained only for diagnostics
- floor/ceiling: historical 25th/75th percentile profile scaled around projected score

Important limitations shown by the first run:

- Zero-point games are filtered out of the baseline, which may overstate volatile or part-time players.
- Home/away factor can be based on very small samples.
- Recent form uses fixed 60/40 weighting across all positions.
- Weather is not available in the historical batch harness yet, so the first numeric backtest should isolate non-weather model accuracy.
- Defensive-player projections use the same baseline/matchup structure, but snap factor currently only applies to offensive positions.

## First Tuning Candidates

These should be tested by position using rolling train/test windows, not fit on the full season at once.

- Base blend: compare `season only`, `50/50 recent-season`, `60/40`, exponentially weighted recent games, and median/trimmed mean baselines.
- Zero-game handling: compare excluding zeroes vs including active games with `gp > 0`; this is especially important for IDP, kickers, and fringe flex players.
- Matchup factor: test softer clamps by position, such as QB/WR `0.85-1.15`, RB/TE `0.80-1.20`, IDP `0.90-1.10`.
- Location factor: require at least three home and three away samples before applying; otherwise use neutral `1.0`.
- Snap/use factor: add defensive snap share for `DL/LB/DB`; test route participation, targets, carries, tackles, and pass-rush opportunity where data exists.
- Team context: add implied team total, game total, spread, offensive plays per game, pace, and red-zone opportunities when available.
- ESPN correlates: evaluate per-position correlation for attempts, targets, receptions, carries, snap share, yards per route, air yards proxy, red-zone touches, QB hits, tackles, pass deflections, sacks, team points, opponent points allowed, and depth-chart rank.

## Recommended Iteration Plan

1. Run the current-model baseline and save overall plus by-position metrics.
2. Tune only the base projection family first; it is likely the largest error source.
3. Add position-specific matchup clamps and verify whether they improve weighted score out of sample.
4. Add usage features by position, starting with snap/target/carry/tackle trends.
5. Add weather and team-context features last, because they are lower-frequency or require cleaner external data alignment.
