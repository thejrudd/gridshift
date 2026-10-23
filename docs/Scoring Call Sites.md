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

## Live Provider Play And Reconciliation Boundary

Fantasy Live and Statistics Scores share the canonical provider semantics in
`src/utils/playByPlay/normalizePlay.js`,
`src/utils/nflPlays/playNarrative.js`, and
`src/utils/playByPlay/playStatDelta.js`. Keep this boundary aligned with the
scoring engine when adding or changing a stat key:

- `parseDefensiveActors()` may emit an IDP role only when the provider's
  narrative explicitly names that role and the resolved defense team supports
  the attribution. A defender merely mentioned in a description is not a
  fantasy event.
- `buildPlayStatDelta()` must emit the same Sleeper stat keys that
  `calcPoints()` consumes, including IDP tackles, sacks, interceptions, forced
  fumbles, recoveries, pass defenses, quarterback hits, safeties, blocked kicks,
  and defensive touchdowns where the active scoring profile supports them.
- A tackle stays generic `idp_tkl` in the stat delta, because provider text
  does not say solo or assisted. `estimatePlayPoints()` prices it the league's
  way when the league does not pay `idp_tkl`: one tackler named as
  `idp_tkl_solo`, several as `idp_tkl_ast` (each through `calcPoints()` with
  the player's position). Without this a solo/assisted IDP league priced every
  tackle at 0 and the play never reached the feed. The estimate is display
  only; Sleeper's line settles the exact total through reconciliation.
- IDP credits follow the gamebook's own markers: the parenthetical after an
  incomplete pass names a pass defender (`idp_pd`), square brackets name a
  quarterback hit (`idp_qbhit`), and "(A, B)" is a shared stop like "(A; B)".
  A sack is also a tackle and a quarterback hit (`idp_tkl`, `idp_qbhit`); a
  lone sacker, or a lone tackler stopping the carrier behind the line, also
  gets `idp_tkl_loss`. "Sack split by A and B" is `idp_sack: 0.5` each, with
  no tackle for loss — the way Sleeper's lines carry them.
- Penalty yards never count toward a player. On a play with an accepted
  penalty, rushing and receiving yards come from the narrative's
  `creditedYards` (short_text, the official credit), because the provider's
  `stat_yardage` nets the penalty in. A flag after the play (face mask,
  roughing, taunting) leaves the player the whole gain; an offensive foul
  during the play behind where it ended (holding, an illegal block) credits
  yards only to the spot of the foul ("ran for 8, holding enforced behind the
  run" credits 2; the provider reads -18). Checked against Sleeper's totals for
  every affected player in a week. The same credited yards decide a first down
  (`isFirstDownPlay()`: an automatic first down from a defensive flag is not
  the player's) and a fourth-down conversion (`isTurnoverOnDowns()`, shared
  with Statistics Scores' drives).
- The scoring-play hover (`buildPlayPointsBreakdown()` in
  `src/utils/matchupPlayBreakdown.js`) scores a play's stat delta through
  `buildFantasyScoringBreakdown()` with the player's position, and prices a
  generic tackle with the same `getPricedTackleKey()` as
  `estimatePlayPoints()`, so the card and the estimate never disagree.
- A touchdown row that carries its two-point try is scored as the touchdown;
  the try's passer, receiver or rusher get `pass_2pt` / `rec_2pt` /
  `rush_2pt` only when it succeeded (`credit.conversion` from the matcher).
  A fumble is charged to the ball carrier the gamebook names (`fum`, plus
  `fum_lost` when the other side recovered; `credit.fumble`), never inferred
  from the word "fumble".
- Team defenses score special teams through `buildTeamDefensePlayDelta()`'s
  `detail`: the receiving side's `def_kr_yd` / `def_pr_yd` and the kicking
  side's `def_st_tkl_solo` when one coverage tackler is named.
- Single-game threshold bonuses (`bonus_rush_att_20`, `bonus_pass_yd_300`,
  `bonus_rec_yd_100`, `bonus_tkl_10p`, `bonus_sack_2p`, `idp_pass_def_3p`, and
  the rest of `MILESTONE_BONUSES` in `livePlaysFeed.js`) are added to the play
  that carries the player across the line, priced through `calcPoints()` with
  the position, and taken back by a play that drops them under it.
- `liveReconciliation.js` treats tackles as one family (`idp_tkl`, or
  `idp_tkl_solo` + `idp_tkl_ast`): plays confirm, fallback rows are sized, and
  fallback rows retire on the tackle count, and a fallback row mirrors the
  tackle keys Sleeper reported so it scores exactly as Sleeper's line would.
- `PLAY_MATCH_STATS` in `playStatDelta.js` is the reconciliation coverage set,
  not a second scoring profile. Every positive key used to confirm an
  individual provider play or create a `Stat update` fallback must be covered,
  including supported aliases in `liveReconciliation.js`.
- `livePlaysFeed.js` remains the individual provider-row boundary. A shared NFL
  snap may produce multiple player rows; `liveReconciliation.js` keeps
  Sleeper-authoritative totals, pending/confirmed/unconfirmed state, and
  incremental fallback retirement. It must preserve negative values and never
  turn an unconfirmed estimate into a visible zero-point row.

Statistics Scores consumes the same canonical normalizer and stat delta, so
changes here require the relevant Statistics Scores normalization/stat-delta
tests in addition to the focused Fantasy Live suite.

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
| `src/components/companion/CompanionRankings.jsx` | `calcPointsFromTotals`, `createPointsCalculator`, and projected player scoring — all pass the player's position |
| `src/components/companion/CompanionMatchup.jsx` | `calcPoints` in weekly ranks loop and `enrichPlayer` — both pass `p.position`; `getAvgPPG` passes `p.position` |
| `src/components/companion/matchup/MatchupPlayerHoverCard.jsx` | Season view scores each prior week with `calcPoints(row, scoringSettings, player.position)` |
| `src/utils/teamScoringDrilldownModel.js` | Team scoring drilldown: projected categories via `buildPlayerProjectionBreakdown(projection, scoring, position)` and actual categories via `buildFantasyMatchupScoringBreakdown()` (which passes each starter's position); no direct `calcPoints` call |
| `src/hooks/useMatchupLiveFeed.js` | Live layer pipeline (moved from the retired `CompanionLive.jsx`): `calcPoints` for BDL and Sleeper stat lines and `calcPointsFromTotals` for season fallbacks all pass the starter's position |
| `src/components/companion/CompanionDefense.jsx` | `defenseScoredTable` getValue callback `(wEntry, pos)` — called as `getValue(wEntry, player.position)` |
| `src/components/companion/PlayerWeeklySheet.jsx` | `calcPoints` — passes `player?.position` |
| `src/components/companion/CompanionScoring.jsx` | `STAT_GROUPS` — add any new scoring field so it's visible in UI |
| `src/components/PlayerStatTable.jsx` | Fantasy labels, header labels, derived game-log fallback stats, and fantasy section grouping include new scoring field; `getCandidateSeasonTotal` (weekly `calcPoints`, `calcPointsFromTotals` fallback) feeds the Fantasy Values rank pool and passes the candidate's position |
| `src/utils/fantasyValueRanks.js` | Season rank distributions for Fantasy Values — scoring-agnostic, but new stat options must arrive through the caller's option-row builder to be rankable |
| `src/components/companion/LeagueScoringBadge.jsx` | Use `getFlatScoringSettings()` before reading display multipliers |
| `src/components/companion/trade/ValuationInfoSheet.jsx` | Read new scoring settings fields; add `AdjustmentRow` entries; update KTC baseline list |

## Statistics Player Dashboard

| File | What to check |
| --- | --- |
| `src/components/statistics/player/PlayList.jsx` | Per-play points, the per-stat breakdown, and the filtered total all call `calcPoints(play.fs, scoring, position)` with the dashboard group (QB, RB, WR, TE, K, DL, LB, DB) as the position. `play.fs` is `buildPlayStatDelta` output from the server, so new per-play stat keys come from `playStatDelta.js` |
| `src/components/statistics/player/PlayList.jsx` — `STAT_LABELS` | Add a label for any new per-play stat key so the breakdown reads in plain language |
| `src/utils/teamSeason/teamDashboardModel.js` — `linePoints` | Team dashboard fantasy points: `calcPoints(lineToFantasyStats(line), scoring, position)` with the player's group (QB, RB, WR, TE, K). `lineToFantasyStats` maps BALLDONTLIE box fields to scoring keys; add a field there when a new scoring key has a box-score source |

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
