# Scoring Call Sites

When making any change to scoring logic (new fields in `DEFAULT_SCORING`/`STAT_TO_SCORING_KEY`, position bonuses, new Sleeper stat keys), audit every location in this checklist:

## Core Engine (update first)

| File | What to check |
|---|---|
| `src/utils/scoringEngine.js` — `DEFAULT_SCORING` | Add new scoring field with `0.0` default |
| `src/utils/scoringEngine.js` — `STAT_TO_SCORING_KEY` | Map Sleeper weekly stat key → scoring key; add alias keys for variants |
| `src/utils/scoringEngine.js` — `SCORING_SETTINGS_ALIASES` | Map Sleeper `scoring_settings` key → internal key when they differ |
| `src/utils/scoringEngine.js` — `importLeagueScoring` | Keep ESPN-only fields, such as Team Win / Team Loss, out of Sleeper-imported settings |
| `src/utils/scoringEngine.js` — `importEspnScoringProfile` | Map ESPN stat IDs and slot/position overrides into a `ScoringProfile` |
| `src/utils/scoringEngine.js` — `getFlatScoringSettings` / `getPositionScoringSettings` | Keep flat Sleeper reads valid while applying ESPN position overrides during calculation |
| `src/utils/scoringEngine.js` — `calcPoints` position block | Add position-specific bonus handling |
| `src/context/SleeperContext.jsx` | Verify startup re-derives from `league.scoring_settings` via `importLeagueScoring` or `normalizeScoringProfile` |
| `src/utils/espnFantasyAdapter.js` | Preserve ESPN `appliedTotal` / `appliedStats`; only use mapped raw stat IDs as fallback calculation data. For D/ST, also preserve schedule `entry.appliedStatTotal` when `playerPoolEntry.stats` is empty; see [[ESPN Fantasy Scoring]] |
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
| `src/components/PlayerStatTable.jsx` | Fantasy labels, header labels, derived game-log fallback stats, and fantasy section grouping include new scoring field |
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
