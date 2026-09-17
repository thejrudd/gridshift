# Player Matchup Drilldown

The Fantasy Matchups individual-player drilldown is an evidence-led weekly decision briefing. It classifies the available outlook as Strong, Favorable, Mixed, Risky, or Very risky and explains that classification with visible numbers. It does not issue an absolute start/sit command or recommend the player over a specific roster alternative.

## Views and ownership

- `src/components/companion/PlayerMatchupBreakdown.jsx` owns the dialog, its phase-derived slot selection, hero and evidence bars, estimated play-contribution timeline, higher-projected bench callout, and visual ranking strips. Its scoped styles live in `PlayerMatchupBreakdown.css`, where the design's slot shell uses `pmd-*` classes and retained disclosure content keeps the older `matchup-*` classes.
- `CompanionMatchup.jsx` resolves the selected player from the current enriched starters/bench on every update. The dialog must not keep using the player object copied when it first opened.
- `src/utils/playerMatchupPresentation.js` owns game-phase interpretation, the phase-aware headline sentence (`buildPlayerHeadlineParts`, returned as emphasis parts rather than markup), and raw-stat comparison assembly. Existing `buildFantasyScoringBreakdown` remains authoritative for scoring detail; scoring-engine rules are unchanged.

Before the player's own NFL kickoff, only the projection-led briefing is shown. It keeps the weekly projection, expected range, season average, season-points positional rank, opponent fantasy points allowed/rank, venue, home/away, and available weather in the first visual tier. There is no empty actual-stats panel or performance switcher. The expected range reuses the shared projection's historical 25th-to-75th-percentile profile and is never described as a guaranteed floor or ceiling. Projected raw stats and scoring math remain collapsed.

There is no performance view switcher. Game phase alone selects the content, so the dialog always reflects the player's actual state without the user choosing a mode. Live shows accumulating fantasy points, the delta against the elapsed-game expected pace target, and estimated play contributions; the full-game projection remains the disclosed benchmark tick. Final shows the settled total, its delta against the full-game projection, and the biggest scoring contributions as evidence cells. The retained pregame projection is used when one exists; otherwise a shared projection appears as an explicitly labelled **Available estimate** and is not treated as a pregame comparison. Missing reported points remain unavailable; a reported zero is displayed as zero. A total that has not been reported states that explicitly rather than rendering as a dash alone.

The hero number carries its own tone: during a live game it is green when the actual score is at or above the points expected by that point in the game, and red when it is behind that pace. At final it is green above the full-game projection and red below it. This is deliberate visual cueing against the appropriate disclosed benchmark, and it replaces the earlier neutral-final-score rule.

The header and phase strip remain outside the scrolling body, and the body is the single scrolling region so expanded disclosures stay reachable. At final the strip's second row shows the settled NFL score with the winning side emphasised, taken from the schedule entry's `ptsFor`/`ptsAgainst` (populated only for completed games), and the first row drops the kickoff time for the date alone. The header uses the canonical NFL team visual theme, keeps injury/availability beside player identity, and retains the existing statistics-navigation actions. The context row shows the known local kickoff, opponent identity, venue, home/away state, and available outdoor weather.

The body is a slot system following the Claude Design "Player Drilldown — Responsive" study: hero, headline, rank, cells, plays, ladder, bench option, disclosures. The order is identical at every width. Phones stack every slot; a container at 700px goes two columns and at 1000px three, driven by container queries on the dialog rather than viewport media queries. The hero spans two columns with the rank beside it; headline, cells and disclosures span the full width. A wide slot (ladder or plays) only yields its third column when a companion card actually follows it, so no dead cell is left in the row.

The hero's bullet bar shows the likely range as a band and a benchmark tick — the season average before kickoff, the projection afterwards. Evidence cells carry a value, a supporting detail and a proportional mini bar: opponent allowance, season average and conditions before kickoff; the largest scoring contributions after it.

The rank slot is the player's rank by total season fantasy points before and during the game. Once the NFL week has fully concluded it switches to the already-computed weekly positional rank (`weekRank`) and is labelled **Week N finish**. Projected finish, starter-pool rank, and rank movement since kickoff are still not inferred.

A five-game form ladder uses horizontal fantasy-point bars, green at or above the season average and red below it, with a clearly labelled season-average marker. GridShift does not retain historical weekly projections, so historical rows keep that season-average comparison. When a recorded pregame baseline exists for the selected week, that row also shows a distinct recorded-projection marker and its bar color compares the actual score with that target; the legend names both benchmarks. Usage trends are intentionally not presented.

Disclosures are flat chevron rows carrying an optional summary value on the right. Deeper season, defense splits, projection methodology, opponent sample methodology, and scoring calculations remain collapsed behind them.

Two of those expanded areas follow the Claude Design "Player Drilldown — Splits Rework" study.

**Projected stat line.** The scoring rows stay exactly as `buildFantasyScoringBreakdown` produced them; `groupFantasyBreakdownRows()` in `playerMatchupPresentation.js` only decides which heading each row sits under. Groups read Passing, Rushing, Receiving, Kicking, Defense, Special teams, Bonuses, Negative plays, Model; a bonus follows the stat family it rewards, and a bonus spanning two families falls to Bonuses. A composition stack and key show the positive groups' share, each row carries a bar proportional to the largest absolute row, and the disclosed projected total closes the table. It remains a real table with a caption, column headers and row headers; the bars are decorative.

**Season performance and defense splits.** Every rank shares one percentile axis instead of a separate slider per metric, so fantasy points per game and the common stat ranks are directly comparable, and the qualifying-games caveat appears once per section rather than on every row. The defense measure control comes first because it governs everything below it: the three tiers as one comparable graphic with the current opponent's tier highlighted, the opponent's placement in the full defense pool, then the contributing games per tier. Tier counts are derived from the same `ceil(teamCount / 4)` split the classification uses. Unavailable ranks and empty tiers stay explicitly unavailable; they are never drawn as zero.

Blocks the design study specifies but GridShift cannot source — remaining opportunity, teammate cannibalization, snap share, live rank movement, per-week projection history — render as explicitly labelled dashed placeholders only when `VITE_DRILLDOWN_SLOTS=true` in a dev build (`src/utils/drilldownDevSlots.js`). They never ship to users and are never faked with invented values.

## Weekly outlook and opponent context

The outlook is presentation guidance, not a new projection source. `buildPlayerOutlook()` compares the existing weekly projection with the player's visible season average and compares the opponent's positional allowance with the same ranked league-wide allowance set. It never compares one player's projection directly with the opponent's aggregate allowance to the whole position. It then applies only disclosed availability and noteworthy-weather risk. Its concise explanatory sentence exposes the numerical performance and opponent basis; the weather evidence cell exposes available conditions and whether the projection model promoted them as a risk. When neither season nor opponent benchmarks exist, the outlook remains Mixed rather than inventing certainty.

Opponent fantasy points allowed uses active league scoring and ranks lower allowance as tougher. Equal allowance values share the same competition rank. The direct comparison is opponent allowance versus the league-average allowance from that same evidence set. Through the first four current-season games, `buildDrilldownOpponentContext()` progressively replaces a prior-season baseline with current-season results at 25 percentage points per observed game. The surface explicitly labels Current season, Prior-season context, or Early-season blend and discloses both samples in the methodology expansion. Prior data must have at least three games; unsupported one- or two-game current samples do not stand alone.

This blend is isolated to the drilldown's editorial context. It does not change the shared projection's opponent factor, `defStrength` / `defPercentile`, Fantasy Heatmap aggregation, or `playerDefensePerformance` yardage classifications. Previous-season stats are loaded through Week 4 only to support this labeled briefing context and the existing projection fallback.

## Recorded pregame projections

`useMatchupProjectionBaselines.js` captures the latest projection observed while Fantasy Matchups is open and the player's known kickoff is still in the future. It captures displayed starters and bench players, without requiring the individual drilldown to open.

`matchupProjectionBaseline.js` scopes each record to league, season, week, player, and a canonical fingerprint of the active scoring settings. It stores projection/stat-line/source/range details plus capture time and scheduled kickoff. Started/completed games, unknown kickoff, and unavailable/non-finite scores cannot create baselines. No live or historical projection is presented as a reconstructed pregame baseline.

Records are local to the browser/device. Each observation has a separate localStorage key under `gridshift-matchup-projection-baselines-v2:`. Reading chooses the newest valid observation per scope; pruning retains the latest 400 scopes. Separate observation keys prevent unrelated concurrent tabs from replacing one aggregate store, and a delayed older observation cannot replace a newer timestamp. Scoring changes require a matching pregame record. Blocked storage falls back to memory for the session. This is not a server archive or cross-device sync; unobserved/evicted historical baselines remain unavailable.

## Heatmap consistency and defense measures

`src/utils/fantasyHeatmapData.js` extracts the existing Heatmap offensive aggregation unchanged. Both Heatmap and the new analysis consume it. Its table is keyed by the offense producing the stats, uses Heatmap's existing positive-value semantics, and uses the same historical team attribution/fallback. The drilldown follows the reciprocal NFL schedule to derive what each opposing defense allowed.

The measures are **receiving yards allowed** and **rushing yards allowed** per completed game across all supported NFL offensive positions. These are explicit Heatmap yardage measures, not a new composite pass-defense rating. Compare with Heatmap using the same weeks, all offensive positions, and the opposing offensive team for each game. Missing team/week yardage data is unavailable, never a zero. NFL defense quartiles remain unavailable until the selected period has observed coverage for the full defense pool. Explicitly reported zero yardage remains zero.

`src/utils/playerDefensePerformance.js` takes only current-season stats and fully completed NFL weeks, as verified by the shared `isFullGameWeekComplete`. In-progress or incomplete slates are excluded. The same current classification through the latest completed week is applied to all past opponents; it is not the defense's historical rank before each game.

Lower allowed yardage ranks as stronger. The strongest quarter, middle half, and weakest quarter use tied-value midpoint placement so tied defenses are not split arbitrarily. A current opponent's measurement includes its rank, defense count, yards allowed per game, and sample size. Offensive defense splits apply to QB/RB/WR/TE; defensive players and kickers retain positional performance context without these offensive splits.

## Player rankings and evidence

The primary season-points rank comes from Fantasy Matchups' existing positional ranking and is always labelled **Season points rank** and **by total season fantasy points**. Its pool includes only players with recorded fantasy-stat fields, but it retains valid zero and negative fantasy totals; players with no recorded fantasy stats are excluded rather than treated as zero. It is distinct from the deeper current-season fantasy-points-per-game analysis below.

Player performance is fantasy points per qualifying game under active league scoring, using `calcPoints` with the player's position. It retains zero and negative fantasy games and requires a valid scheduled opponent. Explicit zero games played and bye/phantom rows are excluded. Ties share rank. These PPG rankings have a different, explicitly named metric from existing total-points positional finishes.

Peers are NFL players at the same position regardless of fantasy ownership. QB peer eligibility requires explicit starter metadata (depth-chart QB order 1 or a recorded start in the completed period). The selected player never joins that pool solely because they were selected. When starter eligibility or league-wide starter coverage is unavailable, factual target results remain visible but the rank stays unavailable.

Results and game counts use whatever current-season data is available once at least one game in the selected week has finished; earlier weeks continue to require complete-week evidence. Alongside fantasy PPG, common position-specific stats such as passing yards, rushing yards, receptions, touchdowns, field goals, or extra points receive the same factual ranking treatment. Rank markers require at least three qualifying games for the fantasy-PPG strip; stat rankings show the available sample and pool directly. A compact ranking strip shows relative value, rank, pool count, and sample size. Each defense category can expand to show the contributing weeks/opponents/points. The current season period is visible.

## Estimated play contributions

While the player's game is live, `usePlayerMatchupTimeline.js` loads the selected player's supported play-by-play feed and `playerMatchupTimeline.js` converts attributable plays into estimated signed fantasy-point contributions under the active league scoring. Positive and negative events are retained in chronological order; zero-contribution events are omitted. The official headline fantasy total and `buildFantasyScoringBreakdown` remain authoritative.

The timeline is labelled **What earned the points** and always discloses that bonuses, corrections, and missing plays can differ from the official total. It belongs to the live phase only; once the game is settled the same evidence is carried by the scoring-contribution cells and the full scoring breakdown, so the timeline is not fetched or rendered. Loading, empty, unavailable, error, and stale states remain explicit. The timeline does not infer pace, remaining opportunity, teammate effects, kickoff-rank movement, or a reconstructed pregame projection.

## Higher projected bench option

Before kickoff, `playerMatchupBenchOption.js` may return one informational bench comparison when the selected starter belongs to the user and the highest eligible bench player's projection is at least 2.0 points higher. Both players need known future kickoffs. Bye, unavailable, inactive, injured-reserve, taxi, and position-ineligible candidates are excluded. Eligibility is a direct fit for the selected starter slot; the model does not chain multiple lineup moves.

The callout is labelled **Higher projected option on your bench**, shows the candidate and projected difference, and opens that player's drilldown. It never changes the fantasy-platform lineup. The callout disappears when either relevant game reaches kickoff.

## Validation

Focused automated coverage:

- `tests/unit/playerMatchupPresentation.test.mjs`: projected stat-line grouping, own-kickoff phase, null/zero distinctions, projected league scoring, raw-stat comparison, early-season opponent blending, tied opponent ranks, five-level outlook inputs, outdoor-only weather promotion, and expected-range markers.
- `tests/unit/playerMatchupRendering.test.mjs`: actual component server-render checks for the pregame briefing range/evidence/headline, labelled season-points rank, kickoff/injury/venue context, phase-derived live and final views with no switcher present, projection-cued final score, estimated-timeline disclosure, eligible bench option, unavailable points, scoring detail, and the grouped projected stat line. This does not establish browser geometry or interaction correctness.
- `tests/unit/playerMatchupTimeline.test.mjs`: supported feed normalization, signed contribution scoring, zero omission, coverage/error states, and official-total separation.
- `tests/unit/playerMatchupBenchOption.test.mjs`: direct slot eligibility, 2.0-point threshold, future kickoff requirements, inactive/reserve exclusions, and single highest candidate selection.
- `tests/unit/matchupProjectionBaseline.test.mjs`: pregame-only capture, latest observation, scope isolation, corrupt/blocked storage, retention, and interleaved observations.
- `tests/unit/playerDefensePerformance.test.mjs`: unchanged Heatmap aggregation, current full-week period, zero/negative performance, missing defense coverage, tied PPG rank, game eligibility, and QB starter eligibility.

The user owns final live usage acceptance for this change. Check an upcoming player with and without an eligible bench option, an in-progress player with positive and negative timeline events, a final zero-point player, a game without a recorded baseline, a three-game defense split, and an early-season/unknown-starter case. Verify the stacked phone layout, tablet two-column geometry, packed desktop three-column geometry, controls and close/navigation actions at Large display size, and confirm the open pregame dialog switches to Actual and removes the bench callout at that player's kickoff.
