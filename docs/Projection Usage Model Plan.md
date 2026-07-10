# Projection Usage Model Plan (v8.2)

Deferred implementation spec for the next projection-accuracy iteration: rebuild skill-position projections around **usage (volume) × efficiency** with **touchdown-rate regression**, instead of averaging past fantasy points. Deferred from the v8.1 Live rework by explicit decision — this document is the reference for implementing it later.

## Why

Fantasy points are a noisy target: they blend stable signals (targets, carries, attempts) with volatile ones (touchdowns, long plays). Averaging points chases the volatile parts. Projecting volume and efficiency separately, each regressed appropriately, keys the projection to the stable part of a player's role.

Current production baseline to beat (see `docs/Projection Backtest Report.md`, Iteration 7): **weighted score 8.27, MAE 6.30, RMSE 8.46** on league `1203147305117560832`, season 2025.

## Model spec

Applies to `QB`, `RB`, `WR`, `TE` inside `projectPlayer()` in `src/utils/projectionEngine.js`. `K`, `DEF`, and IDP positions keep the current points-average path.

### 1. Volume components

Per player, from `weeklyArr` (Sleeper weekly stats already loaded app-wide), using the same prior-weeks filter and recent/season blend machinery as the current baseline (`RECENT_WEIGHT_BY_POSITION`):

- QB: `pass_att`, `rush_att`
- RB: `rush_att`, targets (`rec_tgt`; fall back to `rec` if targets are absent from the stat lines)
- WR/TE: targets (`rec_tgt` → `rec` fallback), `rush_att` when nonzero

Volume gets the same empirical-Bayes shrinkage treatment as Iteration 7 (upper-half positional prior per component, prior strength tuned by backtest).

### 2. Efficiency components

Shrunk toward positional baselines (computed league-wide from the same weekly stats, cached like `computePlayerPPGPriorByPosition`):

- yards per pass attempt, yards per carry, yards per target, catch rate
- Shrinkage: `(n·playerRate + m·posBaseline) / (n + m)` with `n` = component opportunities (attempts/targets, not games) and `m` tuned per component via the variant backtest (expect `m` in the 20–60 opportunity range for rates).

### 3. Touchdown regression

- Replace trailing TD production with `expectedTD = opportunities × blendedTDRate`, where `blendedTDRate = (opp·playerRate + m_td·posBaselineRate) / (opp + m_td)`.
- Start with a single per-opportunity rate per position (pass TD per attempt, rush TD per carry, rec TD per target); a red-zone-weighted split is a second-order refinement only if the flat version wins.
- `m_td` tuned via backtest; expect it to be large (TD rates are mostly noise at season sample sizes).

### 4. Recompose and score

Build a projected stat line `{ pass_yd, pass_td, pass_att, pass_cmp, rush_att, rush_yd, rush_td, rec, rec_yd, rec_td }` from volume × efficiency, then score it with `calcPoints(statLine, scoringSettings, position)` — **always pass position** (CLAUDE.md scoring rule). This automatically respects league scoring (PPR variants, bonuses).

### 5. Blend with the current path

Do not replace the points-average model outright. Final projection:

```
projected = usageWeight × usageProjection + (1 − usageWeight) × currentProjection
```

Start `usageWeight = 0.6`, tune per position via `scripts/projection-variant-backtest.mjs`. Existing multiplicative factors (opponent, weather) apply after the blend, unchanged.

## Acceptance criteria

- Run `node --experimental-loader ./scripts/node-esm-extension-loader.mjs scripts/projection-backtest.mjs --league 1203147305117560832 --season 2025`.
- Ship only if overall weighted score beats **8.27** without materially regressing any single position group (per-position tables in the harness output).
- Record results as a new iteration section in `docs/Projection Backtest Report.md`, including the tuned constants (`usageWeight` per position, `m` per rate, `m_td`).
- Verify rolling-window holdouts (weeks 15–18) improve too, not just full-season averages — the harness's `--context`/window output covers this.

## Implementation notes

- All data needed is already loaded client-side (`weeklyStats` via SleeperContext); no new API calls.
- Add per-component priors through cached helpers following the `computePlayerPPGPriorByPosition` pattern (WeakMap chain on stats/players/scoring, keyed by week).
- Keep `projectPlayer`'s public signature and return shape (`{ projected, min, max, factors }`) unchanged; add usage diagnostics under `factors` (e.g., `usageProjection`, `usageWeight`, component rates) so the Matchup breakdown UI can surface them later.
- Consumers (Companion Matchup, Companion Live win probability, Waiver, Compare) inherit the change automatically via `src/utils/starterProjections.js` / direct calls — no UI work required to ship the accuracy gain.
