# Scoring Call Sites

When making any change to scoring logic (new fields in `DEFAULT_SCORING`/`STAT_TO_SCORING_KEY`, position bonuses, new Sleeper stat keys), audit every location in this checklist:

## Core Engine (update first)

| File | What to check |
|---|---|
| `src/utils/scoringEngine.js` — `DEFAULT_SCORING` | Add new scoring field with `0.0` default |
| `src/utils/scoringEngine.js` — `STAT_TO_SCORING_KEY` | Map Sleeper weekly stat key → scoring key; add alias keys for variants |
| `src/utils/scoringEngine.js` — `SCORING_SETTINGS_ALIASES` | Map Sleeper `scoring_settings` key → internal key when they differ |
| `src/utils/scoringEngine.js` — `importEspnScoringProfile` | Map ESPN stat IDs and slot/position overrides into a `ScoringProfile` |
| `src/utils/scoringEngine.js` — `getFlatScoringSettings` / `getPositionScoringSettings` | Keep flat Sleeper reads valid while applying ESPN position overrides during calculation |
| `src/utils/scoringEngine.js` — `calcPoints` position block | Add position-specific bonus handling |
| `src/context/SleeperContext.jsx` | Verify startup re-derives from `league.scoring_settings` via `importLeagueScoring` or `normalizeScoringProfile` |
| `src/utils/espnBigPlayBonuses.js` / `src/context/SleeperContext.jsx` | ESPN-only scoring-play enrichment derives long TD counters and successful two-point conversions from NFL scoring plays; keep it behind `platform === 'espn'` so Sleeper calculations stay API-native |

## Projection / Analytics Engine (pass `position` everywhere)

| File | Function | What to check |
|---|---|---|
| `src/utils/projectionEngine.js` | `getDefenseStrength` | Both `calcPoints` calls must pass `player.position` |
| `src/utils/projectionEngine.js` | `getLeagueAvgPPG` | `calcPoints` call must pass `player.position` |
| `src/utils/projectionEngine.js` | `projectPlayer` | All three `calcPoints` calls must pass `pos` |
| `src/utils/projectionEngine.js` | `buildDefenseTable` | Default `valueFn` uses `(wEntry, position)` — verify new calls also pass position |
| `src/utils/projectionEngine.js` | `computePositionalRanks` | `calcPoints` must pass `p.position` |
| `src/utils/projectionEngine.js` | `getAvgPPG` | Verify signature passes position through to `calcPoints` |
| `src/utils/draftAssistant/index.js` | `computeDraftPositionalRanks` | `calcPoints` must pass `player?.position` |
| `src/utils/draftAssistant/index.js` | `computeDraftPositionalRanks` / `computeDraftOutcomes` | `calcPoints` must pass `player?.position` when calculating the matching season's positional finish |

## Companion Tab Components

| File | What to check |
|---|---|
| `src/components/companion/CompanionRoster.jsx` | `calcPointsFromTotals` and `getAvgPPG` — both pass `p.position` |
| `src/components/companion/CompanionLeague.jsx` | `calcPointsFromTotals` and `getAvgPPG` — both pass `p.position` |
| `src/components/companion/CompanionRankings.jsx` | `calcPointsFromTotals` — passes `p.position` |
| `src/components/companion/CompanionWaiver.jsx` | `calcPointsFromTotals`, `getRecentAvg`, inline `calcPoints` — all pass `pos` |
| `src/components/companion/CompanionMatchup.jsx` | `calcPoints` in weekly ranks loop and `enrichPlayer` — both pass `p.position`; `getAvgPPG` passes `p.position` |
| `src/components/companion/CompanionDefense.jsx` | `defenseScoredTable` getValue callback `(wEntry, pos)` — called as `getValue(wEntry, player.position)` |
| `src/components/companion/PlayerWeeklySheet.jsx` | `calcPoints` — passes `player?.position` |
| `src/components/companion/CompanionScoring.jsx` | `STAT_GROUPS` — add any new scoring field so it's visible in UI |
| `src/components/PlayerStatTable.jsx` | Fantasy labels, header labels, derived game-log fallback stats, and fantasy section grouping include new scoring field; `getCandidateSeasonTotal` (weekly `calcPoints`, `calcPointsFromTotals` fallback) feeds the Fantasy Values rank pool and passes the candidate's position |
| `src/utils/fantasyValueRanks.js` | Season rank distributions for Fantasy Values — scoring-agnostic, but new stat options must arrive through the caller's option-row builder to be rankable |
| `src/components/companion/LeagueScoringBadge.jsx` | Use `getFlatScoringSettings()` before reading display multipliers |
| `src/components/companion/trade/ValuationInfoSheet.jsx` | Read new scoring settings fields; add `AdjustmentRow` entries; update KTC baseline list |

## Compare Tab Components

| File | What to check |
|---|---|
| `src/components/compare/CompareFantasyPanel.jsx` | `calcPointsFromTotals`, `getAvgPPG`, `getRecentAvg`, weekly `calcPoints` — all pass `pos` |
| `src/components/compare/CompareTradePanel.jsx` | `calcPointsFromTotals` — passes `position` in all 3 call sites |

## KTC Value Adjustments

| File | What to check |
|---|---|
| `src/utils/ktcApi.js` — `computeKtcMultipliers` | Add multiplier logic for any new scoring field that materially affects positional value |

**Before closing any scoring-related change:** grep for `calcPoints(` and `calcPointsFromTotals(` across the repo and verify every call site either (a) passes position or (b) is in a context where position is genuinely unavailable. For ESPN fixture changes, also run adapter tests that prove `appliedTotal` wins over recalculated raw stats.

## Derived Game-Log Stats vs Provider Rows

Two invariants introduced by the v8.5.1 Rankings/Statistics divergence fix:

- **Exclusive yardage tiers.** Sleeper weekly rows carry only the highest cleared yardage-tier bonus (a 457-yard game has `bonus_pass_yd_400: 1` and *no* `bonus_pass_yd_300` key). Any builder that derives Sleeper-format stats from ESPN game logs (`buildSleeperStatsFromGameLogStats` in `PlayerStatTable.jsx`, `buildFantasyStatsFromGameLogStats` in `src/utils/fantasyGameLogRows.js`) must reproduce this exclusive convention via `setRangeStat`, never independent `>=` thresholds per tier.
- **Provider rows are scoring truth.** When a Sleeper weekly row exists for a week, ESPN-derived data must never back-fill scoring stat keys into it — Sleeper omits zero/unearned keys, so a plain spread lets derived values fill every absent key. `mergeFantasyRowsWithDerivedStats` only merges the `DERIVED_ROW_META_KEYS` whitelist (row metadata plus `team_win`/`team_loss`/`team_tie`, which Sleeper rows never carry).

Regression coverage: `tests/unit/fantasyTierBonuses.test.mjs` asserts tier exclusivity and the invariant that summing weekly `calcPoints` equals `calcPointsFromTotals` on the season aggregate.
