# Where To Edit

Back: [[Home]]

Routing table: match the task to a section, open the listed files, and read the linked deep doc before changing anything it covers. This page routes — it does not explain. Implementation rules live in the deep docs.

## Task Index

| Task involves | Section |
| --- | --- |
| Shell, tabs, sidebar, sub-navs, routing chrome | [Navigation And Layout](#navigation-and-layout) |
| Global search palette, query parsing, search index | [Global Search](#global-search) |
| Display density, type tokens, page frames | [Display Size, Typography, And Wide Layouts](#display-size-typography-and-wide-layouts) |
| Skeletons, loading placeholders, list reveal/stagger timing | [Loading Motion](#loading-motion) |
| Prediction picks, playoff seeding, and share cards | [Predictions And Share Cards](#predictions-and-share-cards) |
| Live fantasy scoring view (hero, pace chart, feed, win odds) | [Fantasy Live](#fantasy-live) |
| Rostered weekly injuries and player designations | [Fantasy Injuries](#fantasy-injuries) |
| Season-long fantasy pairings by week | [Fantasy Schedule](#fantasy-schedule) |
| NFL scoreboard, box scores, play-by-play visuals | [Statistics Scores And NFL Plays](#statistics-scores-and-nfl-plays) |
| NFL matchup drill-in from a team's schedule (unit vs unit, live tracker, Defenses hand-off) | [Statistics Schedule Matchup Drill-In](#statistics-schedule-matchup-drill-in) |
| Provider gateway, quotas, caches, sidecar server | [Live Data Server, Budgets, And Scaling](#live-data-server-budgets-and-scaling) |
| Sleeper connection and league loading | [Fantasy Connection And League Data](#fantasy-connection-and-league-data) |
| League history, season standings, transactions | [League History, Standings, And Activity](#league-history-standings-and-activity) |
| ESPN player search, profiles, stat tables | [ESPN Player Data And Profiles](#espn-player-data-and-profiles) |
| Fantasy point calculation or projections | [Scoring And Projections](#scoring-and-projections) |
| Compare tab panels | [Compare Tab](#compare-tab) |
| Trade values, proposals, picks, KTC, IDP | [Trade Value, Picks, And KTC](#trade-value-picks-and-ktc) |
| Player/asset selector rows anywhere in Companion or Trade | [Companion And Trade Selector Rows](#companion-and-trade-selector-rows) |
| Rookie scouting data and Scout tab | [Scout](#scout) |
| Draft Assistant, War Room, draft results | [Draft Assistant](#draft-assistant) |
| Share cards, export/import, shareable images | [Export / Import / Shareable Image](#export--import--shareable-image) |
| GridShift Trade rooms, proposals, expiring links, counters, acceptance, decline, Sleeper handoff, completion, reconciliation | [Trade Proposal Rooms](#trade-proposal-rooms) |
| Build, PWA, Docker, deployment | [Build, PWA, And Deployment](#build-pwa-and-deployment) |

## Global Search

Read first: [[Global Search]] (measurements, the load-bearing matching rules, and how to extend the vocabulary).

| File | Owns |
| --- | --- |
| `src/utils/globalSearch/vocabulary.js` | Canonical phrase table — teams, positions, divisions, stats, timeframes, intents, commands |
| `src/utils/globalSearch/parseIntent.js` | Query to slots |
| `src/utils/globalSearch/correct.js` | Bounded typo correction |
| `src/utils/globalSearch/tokenIndex.js` | Exact / prefix / trigram indexes |
| `src/utils/globalSearch/rank.js` | Slot filtering, scoring, grouping |
| `src/utils/globalSearch/persist.js` | IndexedDB record cache |
| `src/utils/globalSearch/resolveRoute.js` | Result to route object |
| `src/utils/globalSearch/entities/*.js` | Per-source record adapters |
| `src/utils/globalSearch/answers/*.js` | Inline answer resolvers (read-only over existing engines) |
| `src/hooks/useGlobalSearch.js` | Open state, Cmd/Ctrl+K, index lifecycle |
| `src/components/search/*.jsx` | Palette, result row, answer card, guide |
| `scripts/build-search-index.mjs` | Generates `public/search-index.v1.json` at `prebuild` |

`src/utils/parseSearchQuery.js` re-exports `SEARCH_PATTERNS` from the shared vocabulary; the player browser and global search must not drift apart.

## Navigation And Layout

| File | Owns |
| --- | --- |
| `src/App.jsx` | Two-panel shell, route mounting — start here |
| `src/components/Sidebar.jsx` | Desktop sidebar (lg+), version string |
| `src/components/NavBar.jsx` | Sticky top nav (mobile/tablet) |
| `src/components/BottomTabBar.jsx` | Bottom tab bar (mobile/tablet) |
| `src/components/SeasonSubNav.jsx` | Season view sub-nav |
| `src/components/CompanionSubNav.jsx` | Companion view sub-nav |
| `src/components/LeagueSubNav.jsx` | League view sub-nav |
| `src/components/HorizontalScrollCue.jsx` | Scroll affordance for horizontal rails |
| `src/components/PageShareSheet.jsx`, `src/utils/pageShare.js`, `vite.config.js` | Page-aware share metadata and retained future page-share support; prediction sharing is handled by the Share Card studio |
| `public/icons/` | PWA, Apple touch, favicon, and share-preview assets |
| `src/utils/appRoutes.js` | Canonical route table and aliases |
| `src/index.css` | Tokens and shared layout CSS |

## Display Size, Typography, And Wide Layouts

| File | Owns |
| --- | --- |
| `src/utils/displayPreferences.js` | Preset values, normalization, storage key, root attribute application |
| `src/context/ThemeContext.jsx` | Display preference state and setter |
| `src/components/DisplaySettingsModal.jsx` | Centered Compact/Comfortable/Large chooser |
| `src/components/Sidebar.jsx`, `src/components/ActionSheet.jsx` | Desktop, collapsed-rail, and mobile entry points |
| `src/index.css` | Semantic `--type-*` and density tokens; readable/data/workbench page-frame classes |

Rules: apply exactly one page-frame class to new route roots. Never detect display DPI, use CSS `zoom`, or add transform-based whole-app scaling.

## Loading Motion

Read first: [[Loading Motion]] (glossary of every knob — duration, stagger, show after, minimum hold, easing, entrance, texture, order, handoff — plus Fantasy rollout status and the known per-tab limits).

| File | Owns |
| --- | --- |
| `src/index.css` | `--gs-load-*` tokens, `.gs-skeleton` textures, `.gridshift-reveal*` entrances, `.gs-loadswap*` handoff |
| `src/utils/loadingMotion.js` | JS mirror of the profile, order/index/delay helpers |
| `src/hooks/useLoadingReveal.js` | The show-after / minimum-hold timing gate |
| `src/components/ui/LoadingSwap.jsx` | `LoadingSwap`, `RevealList`, `SkeletonRows` |
| `src/components/ui/Skeleton.jsx`, `src/components/ui/SectionSkeleton.jsx` | Placeholder shapes; the lazy-route Suspense fallback |
| `tests/unit/loadingMotion.test.mjs` | CSS/JS token parity — fails if the two drift |

Rules: retune in the tokens, never at a call site. A surface with sticky or fixed descendants inside the revealed subtree must use `entrance="fade"`, not the default `lift`. `loading` means "nothing to show yet", never "a request is in flight" — a populated list must never drop back to placeholders on a background refresh.

## Predictions And Share Cards

| File | Owns |
| --- | --- |
| `src/context/PredictionContext.jsx` | Prediction state — high blast radius, see CLAUDE.md State Risk Areas |
| `src/utils/predictionSnapshot.js` | Completion rules, season policy, immutable snapshot schema, import materialization |
| `src/utils/predictionPlayoffSeeding.js` | Canonical seed ordering shared by picker, validator, randomizer, share cards |
| `src/utils/playoffBracket.js` | NFL lowest-remaining-seed reseeding |
| `src/utils/scheduleParser.js` | Schedule ingestion |
| `src/utils/validation.js` | Prediction validation |
| `src/components/TeamList.jsx`, `src/components/TeamDetail.jsx` | Pick UI |
| `src/components/predictions/PredictionsRedesign.jsx` | Records, inline playoff picture, and playoff bracket UI |
| `src/components/predictions/share/`, `src/components/ExportPreview.jsx` | Share-card formats, ordered studio controls, and screenshot/link export |

## Fantasy Live

Read first: [[Fantasy Live]] (implementation rules — chart axis semantics, replay, win probability, play filter, state boundaries). Server-side behavior: [[Live Data Server Architecture]].

| File | Owns |
| --- | --- |
| `src/components/companion/CompanionLive.jsx` | Route state, session gate, matchup chip rail, filter state, pace/palette derivations |
| `src/components/companion/live/LiveHero.jsx` | Split hero, top scorers, cut-out headshots, win plate, odds rail |
| `src/components/companion/live/LivePaceChart.jsx` | Pace chart, milestone selection, zoom/scrub |
| `src/components/companion/live/LiveFeed.jsx` | Play feed, side filter, scoring-math expansion, `LiveFeedPlayFilter` chips |
| `src/components/companion/live/LivePlayerSheet.jsx` | Player drilldown record card |
| `src/components/companion/live/LivePerformerRail.jsx`, `LiveVerdict.jsx`, `LiveAtoms.jsx`, `liveVisuals.js` | Supporting surfaces and atoms |
| `src/utils/livePace.js` | Pace maths (`buildPaceSeries()`) |
| `src/utils/livePlaysFeed.js` | Starter matching, feed events, play → 0..1 game-progress axis (`getPlayProgress()`); play normalization and stat deltas come from `playByPlay/` |
| `src/utils/liveReconciliation.js` | Plays reconciled against Sleeper: pending/confirmed status, residual adjustment, displayed totals, stat-update fallback |
| `src/utils/liveWinProbability.js` | `explainWinProbability()`, `resolveStarterProjection()` |
| `src/data/liveWinProbabilityModel.js` | Generated coefficient contract — never hand-edit |
| `src/utils/liveFeedFilters.js` | League-derived filter groups and types |
| `src/utils/fantasyTeamIdentity.js` | Per-roster identity colours |
| `src/utils/liveDemoTimeline.js`, `src/utils/liveDemoPlays.js` | Mock play-by-play |
| `src/api/liveApi.js` | Browser-to-sidecar live requests |
| `server/liveHandlers.js` | Server-only credential, allowlist/session checks, proxy caching |
| `src/index.css` | The `.fl-*` block |

Rules: the chart x-axis is game progress, not wallclock. BDL plays are the only feed source in connected live and replay; Sleeper reconciles them and never writes a row of its own. The week comes from Sleeper `/state/nfl` — never add a week picker to Live. Starter projections change only in `resolveStarterProjection()`. Full rules: [[Fantasy Live]].

## Fantasy Injuries

| File | Owns |
| --- | --- |
| `src/components/companion/CompanionInjuries.jsx` | Current-week report, component-local filters, provider/fallback states, row disclosures |
| `src/utils/fantasyInjuries.js` | Roster/reserve/taxi assembly, concern merge, urgency order, owner/team filtering |
| `src/utils/providerPlayerIdentity.js` | Shared provider name/team normalization and Injuries position-family matching |
| `src/api/playerDesignationsApi.js` | Browser request to the fixed server designation route |
| `server/playerDesignationHandlers.js` | Query validation, actionable-row sanitization, 24-page weekly snapshot policy |

Rules: Sleeper roster status and BALLDONTLIE weekly status remain separate evidence. Match designations only through unique name + canonical NFL team + compatible position-family identity. A missing or `null` designation is unknown, including on bye weeks. `starter` and `did_not_play` are postgame facts, never projections. The current season/week comes only from Sleeper `/state/nfl`.

## Fantasy Schedule

| File | Owns |
| --- | --- |
| `src/components/companion/CompanionSchedule.jsx` | Season/league modes, team picker, week rail, completed/remaining filters, loading and empty states |
| `src/utils/fantasySeasonSchedule.js` | Week bounds, roster season summaries, week grouping, per-roster rows, rematches, remaining-opponent average |
| `src/utils/fantasyMatchups.js` | Shared pairing grouping (`buildFantasyMatchupGroups`) the schedule model builds on |
| `src/utils/appRoutes.js` | `scheduleMode`, `scheduleWeek`, `scheduleRosterId` |
| `src/index.css` | `.companion-schedule-*` table, pair, and week-group styles |

Rules: the view fetches weeks 1 through the last regular-season week once per league/season and caches the result; playoff weeks are never fetched or seeded here. Its default current week comes from `useSleeperLeague().currentFantasyWeek`, which is backed by the shared live Sleeper `/state/nfl` snapshot with a selected-league fallback. A week the provider has not returned is pending, a week returned without this roster is unscheduled, and a single-sided group is a bye — the three are distinct and none of them renders as another. A matchup is only treated as played when it is behind the league's current week and a side actually posted points, because unscored rows read 0. Past rows show the opponent's record and PPG entering that week, plus the result when scored; their Edge is the pregame PPG gap. Week 1 starts at 0–0 and has no prior PPG or Edge. If any earlier matchup is missing or unscored, historical values remain unavailable rather than partial. Other current and future rows use the latest roster summaries, and completed scores are labeled explicitly as points for/against.

## Statistics Schedule Matchup Drill-In

| File | Owns |
| --- | --- |
| `src/components/StatisticsSchedule.jsx` | By Team and regular-season By Week row hit areas, route open/close (`statisticsScheduleGameId`), history hand-off before leaving for Defenses or Game Stats |
| `src/components/statistics/schedule/NflMatchupModal.jsx` | Pregame / live / final panel, ESPN summary polling, unit and tracker panels |
| `src/components/statistics/schedule/NflMatchupModal.css` | `.nfl-matchup-*` pieces on top of the shared `.matchup-preview-*` frame |
| `src/utils/nflMatchupModel.js` | Season summaries, glance rows, unit panels, edge rule, keys, ESPN summary normalizer, pace tracker |
| `src/utils/defenseRankings.js` | `MATCHUP_UNITS`, `buildUnitMatchupTable()` (offense produced / defense allowed per game, ranked) |
| `server/nflTeamStatsHandlers.js`, `src/api/statisticsScoresApi.js` | `/api/statistics/scores/team-stats` ESPN season team statistics, flattened and cached |
| `src/components/companion/CompanionDefense.jsx`, `src/App.jsx`, `src/utils/appRoutes.js` | Pinned matchup defenses (`pin`), Back to matchup (`fromGame`, `fromTeam`) |
| `tests/unit/nflMatchupDrillIn.test.mjs` | Routes, unit table, model, and sidecar coverage |

Rules: NFL-only — no fantasy points and no betting lines. The team whose schedule is open is always the left column; By Week opens with the away team on the left. Regular-season games open from both schedule modes. Live and completed matchups link to Statistics Scores, including when the ESPN summary has not yet changed the scheduled kickoff to an in-progress status. Unit rank #1 is the strongest unit on both sides of the ball (offense: most produced per game; defense: fewest allowed per game); an edge needs a rank gap of 8+. Unit ranks and the Defenses links need a connected league for the same season (they use the league's season player stats); without one the section says so. Live and final numbers come from ESPN's game summary, refreshed every 30 seconds while live; live pace scales the game to 60 minutes, and final compares against the defense's average entering the week with ranks shown before → after. The panel body waits for all three sources (game summary, team stats, unit ranks) and enters as one beat, capped at 2.5s; see [[Loading Motion]].

## Statistics Scores And NFL Plays

Read first: [[Statistics Scores]] before production data wiring.

### Statistics-owned

| File | Owns |
| --- | --- |
| `src/components/statistics/scores/StatisticsScores.jsx` | Route state, masthead, season selector, week rail; current-season connected-league `Now` marker reads shared `currentFantasyWeek` |
| `src/components/statistics/scores/ScoresSeasonBoard.jsx` | Hero week + peek layout, chronological kickoff groups |
| `src/components/statistics/scores/GameScorebug.jsx` | Scheduled/live/final/favorite/delayed/offline/unavailable states |
| `src/components/statistics/scores/LatestPlayStrip.jsx` | Compact live latest-play row (from the selected-week canonical live snapshot) |
| `src/components/statistics/scores/ScoresGameDrilldown.jsx` | Overview, Team Stats, Players, Scoring, Play-by-Play |
| `src/components/statistics/scores/StoryStatsPanel.jsx`, `server/storyStatsHandlers.js`, `server/storyStatsScheduler.js` | Optional Game Story section, fixed stats/editorial StoryStats requests, automatic production primetime warming, and daily beta guard |
| `src/components/statistics/scores/PlayCard.jsx` | One play row: sentence, trajectory strip, per-player breakdown |
| `src/components/statistics/scores/StatisticsScores.css` | Feature-owned responsive styling |
| `src/api/statisticsScoresApi.js` | Browser-to-sidecar Scores requests |
| `server/statisticsScoresHandlers.js` | Provider selection, pagination/cache, ESPN snapshots, drilldown aggregation |
| `src/utils/statisticsScoresProvider.js`, `src/utils/balldontlieNflScoreboard.js`, `src/utils/espnNflScoreboard.js` | Source eligibility, normalized scoreboard adapters |
| `src/utils/statisticsPlayerQuarterStats.js` | Conservative play-derived quarter splits for expandable BALLDONTLIE player rows; the provider's full-game player totals remain authoritative |
| `src/utils/statisticsPlayerSort.js` | Display-value parsing and stable ascending/descending sorting for Statistics Scores player groups |
| `src/data/statisticsScoresFixtures.js` | Normalized local fixture contract |

### Shared play parsing and field graphics (NOT Statistics-owned — also feeds Fantasy Live)

| File | Owns |
| --- | --- |
| `src/utils/nflPlays/fieldSpots.js` | Shared NFL gamebook spot grammar, signed end-zone coordinates, and canonical team abbreviations |
| `src/utils/nflPlays/playNarrative.js` | Play text → sentence + actor list; add play types as grammars, never loosen the `confident: false` fallback |
| `src/utils/nflPlays/playerNameIndex.js` | Name variants and ambiguity rules (`livePlaysFeed.buildStarterNameIndex` adapts it for Fantasy Live) |
| `src/utils/nflPlays/participants.js` | ESPN per-game participant and headshot resolution |
| `src/utils/nflPlays/fieldGeometry.js` | Field coordinates (`fieldX`), play classification, trajectories, kick helper, `isScoringPlay()`, `playColor()`, `getOffenseTeam()` (single owner of possession correction) |
| `src/utils/nflPlays/playPresentation.js`, `latestPlayPresentation.js` | Shared outcome tags, compact scorecard projection |
| `src/utils/nflPlays/playBeats.js` | Play as scrubbable timeline; `estimateAirYards()` positions the ball but must never appear as a number in beat text |
| `src/utils/nflPlays/playSequenceContext.js` | Bounded cross-play inference (e.g. omitted passer on scoring-summary turnovers) |
| `src/utils/playByPlay/normalizePlay.js` | Canonical BALLDONTLIE play shape shared by Statistics Scores and Fantasy Live, plus `resolveOffenseDefenseTeams()`; returns every raw row — filtering is the consumer's: [[Play-By-Play Normalization]] |
| `src/utils/playByPlay/playStatDelta.js` | Per-play fantasy stat attribution, team-defense/IDP deltas, `estimatePlayPoints()`, `getPlayEventClassification()`, `PLAY_MATCH_STATS`; keys must match `scoringEngine.js` |
| `src/components/nflPlays/` | `fieldPrimitives.jsx`, `PlayTrajectoryStrip.jsx`, `DriveField.jsx`, `DrivePlayback.jsx`, `WinProbabilityChart.jsx`, `NflPlays.css` — all field visuals go through `fieldX` and the shared kick helper |
| `src/components/shared/PlayerAvatar.jsx` | Headshot → team mark → initials avatar (imported by Fantasy Live as `LiveAvatar`) |
| `tests/fixtures/bdlNflPlays.json`, `tests/fixtures/espnGameParticipants.json` | Captured provider payloads — read these instead of re-deriving field shapes |

## Live Data Server, Budgets, And Scaling

Read first: [[Live Data Server Architecture]] before changing provider cadence, credentials, caches, request limits, live clocks, or fallback behavior.

| File | Owns |
| --- | --- |
| `server/index.js` | One process-wide provider gateway; mounts both route groups |
| `server/balldontlieGateway.js` | Shared credential, capabilities, bounded cache, pagination, quota accounting, backoff, freshness metadata |
| `server/publicRequestGuard.js` | Bounded public Scores request/concurrency protection |
| `server/liveHandlers.js` | Fantasy Live session/league boundary, gateway-backed route projection |
| `server/statisticsScoresHandlers.js` | Public Scores provider selection, selected-week live lane, ESPN fallback |
| `server/playerDesignationHandlers.js` | Fixed weekly player-designations request, sanitization, five-minute cache and 24-hour stale fallback |
| `server/liveGameSnapshots.js` | Canonical provider play snapshot shared by Statistics and Fantasy Live |
| `src/api/liveApi.js`, `src/api/statisticsScoresApi.js`, `src/api/playerDesignationsApi.js` | Browser-to-sidecar client contracts |
| `src/components/companion/CompanionLive.jsx`, `src/components/statistics/scores/StatisticsScores.jsx` | Browser refresh triggers, visibility/offline behavior — neither owns provider play truth |
| `.env.example`, `docker-compose.yml`, `nginx.conf`, `vite.config.js` | Secrets, sidecar topology, proxy boundaries |
| `tests/unit/balldontlieGateway.test.mjs`, `playerDesignationHandlers.test.mjs`, `publicRequestGuard.test.mjs`, `liveConfigStatus.test.mjs`, `statisticsScoresHandlers.test.mjs`, `providerAnchoredGameClock.test.mjs` + live/Scores/Injuries E2E specs | Boundary coverage |

Rules: any change here must audit both Statistics Scores and Fantasy Live. Count every provider cursor page and retry. Keep browser throttling separate from the account-wide provider budget. No multiple sidecar replicas until the shared-store/leader phase ships.

## Fantasy Connection And League Data

| File | Owns |
| --- | --- |
| `src/context/SleeperContext.jsx` | League/roster state, shared live NFL state, and the season-aware `currentFantasyWeek` — widest blast radius in the app |
| `src/api/sleeperApi.js` | Sleeper API client |
| `src/components/companion/CompanionConnect.jsx` | Connect flow |

Sleeper is the supported fantasy connection. Current-week consumers should use `currentFantasyWeek` from this context rather than re-deriving from `last_scored_leg` or issuing their own `/state/nfl` request. Completed-week analytics may continue to use `last_scored_leg` when they explicitly need a settled-data boundary.

## League History, Standings, And Activity

Individual player matchup views, recorded pregame comparisons, and Heatmap-based peer visuals: read [[Player Matchup Drilldown]]. `PlayerMatchupBreakdown.jsx` owns the dialog; `playerDefensePerformance.js` and `fantasyHeatmapData.js` own shared analysis; `useMatchupProjectionBaselines.js` owns local pregame capture.

Fantasy Matchups: `CompanionMatchup.jsx` owns the player Tale of the Tape and the manager VS trigger. While games are live, a player row's projection and the header's `Projected final` are pace-adjusted with `PACE_PROJECTION_MODEL` in `liveWinProbability.js` (display-only 0.5 carryover; win probability stays on the neutral model). Rows use `getPaceAdjustedProjection()`; the header uses `paceExpectedA/B` from `buildMatchupWinProbability()`, which sums the same rounded per-player values (finished games count their actual points). Pregame and final rows keep the plain full-game projection. The VS trigger opens `MatchupPreviewModal.jsx`, the broadcast-style week preview; `matchupPreviewModel.js` normalizes starters, league rosters, the win-probability forecast and the rivalry into that panel's model, `matchupPreviewKeys.js` owns the Keys to the matchup detector engine, and `matchupPreviewKeyHistory.js` remembers which detectors fired for a pairing so keys rotate week to week. The preview's rivalry section renders the series, highlights, and latest meetings inline; `matchupRivalry.js` orients completed meetings and retains historical roster IDs. Its game-state labels come from each starter's `gameState` (`final`, `live`, `upcoming`, `bye`): only a started, unfinished game is live, so the chip, win-chance label, and movers title say live only when `model.liveNow`. Headline scores come from the `liveTotals` the caller passes (the matchup's displayed points); the win-probability model carries projections only. The per-side projected final, projection delta, and record/PF/PA line come from `headerExtras`, built from the same values as the primary `MatchupMasthead` so the two headers agree. The preview's "Who decided it" / movers section renders starters as shared `CompanionPlayerRow` cards (`PreviewPlayerCard`), and each mover carries `chip`, the projection delta on its own; "Where the rosters lead" stays the mirrored comparison rows. Rivalry meeting rows only open seasons in `linkedLeagueSeasonOptions`; otherwise the preview shows an inline notice instead of switching seasons. `App.jsx` shares historical season/week/roster navigation between this drilldown and League History. History loads only when the preview opens. The shared `gridshift-reveal` entrance in `src/index.css` staggers the drilldown panels (preview, team score breakdown, player drilldown, player compare); `gridshift-reveal--auto` is the index-free variant for dynamically built section lists.

| File | Owns |
| --- | --- |
| `src/utils/leagueHistory.js` | Season snapshot cache, participant identity, matchup/standings/bracket calculations, transaction normalization, record leaders, Draft Blueprint summaries |
| `src/hooks/useLeagueHistoryData.js` | Selected-season-plus-prior-lineage loading, focused error/retry state |
| `src/components/companion/CompanionStandings.jsx` | Current + historical tables, divisions, evidence-backed brackets (Toilet Bowl vs consolation) |
| `src/components/companion/CompanionHistory.jsx` | Lifetime leaderboard, champions, rivalries, records |
| `src/components/companion/CompanionActivity.jsx` | Transaction ledger, filters, drillable visuals, commissioner events hidden by default |
| `src/components/companion/LeagueHistoryIcon.jsx` | Shared archive glyph |
| `src/components/companion/LeagueHistoryState.jsx` | Shared centered loading/unavailable/error/empty treatment |
| `src/components/LeagueSubNav.jsx`, `src/utils/appRoutes.js`, `src/App.jsx` | League tab registration, `/league/*` routing, legacy `/companion/*` aliases, lazy mounting |

## ESPN Player Data And Profiles

Season stats, career stats, and game logs are stored server-side after one ESPN fetch. `playerApi.js` asks the sidecar's `/api/players/*` first and falls back to ESPN directly when the sidecar is unreachable, answers with a non-JSON page, or declines a request (400, for example seasons before `GRIDSHIFT_PLAYER_DATA_MIN_SEASON`). Only the sidecar's own JSON 404 means "ESPN has no data".

- **Lazy only.** The server contacts ESPN only when a user opens a player-season it has no fresh copy of. There is no seed, backfill, or scheduled job.
- **Completed seasons are final** and never refetched. The current season refreshes on a one-hour TTL, incrementally: only games not already stored are fetched. Career stats refresh on 24 hours. A completed season ESPN has no stats for is remembered for 30 days.
- **ESPN politeness** lives in `playerDataUpstream.js`: at most 2 concurrent requests server-wide (`GRIDSHIFT_PLAYER_DATA_UPSTREAM_CONCURRENCY`), a minimum gap between request starts, in-flight coalescing per key, and a circuit breaker that stops all ESPN calls after a 429/403 or a run of 5xx/timeouts and backs off exponentially. While it is open the sidecar serves stored data (marked `X-GridShift-Stale`) and the browser falls back to its own ESPN calls.
- **Career repair is defender-only.** ESPN's career endpoint reports 0 tackles for loss, so `espnPlayerFetch.js` rebuilds it from per-season stats. One athlete lookup decides whether the player is a defender and starts the lookups at their debut season; non-defenders skip it. If that lookup fails it runs in full. On the server those per-season lookups are background requests that queue behind the page's own.
- **Team data is shared.** Team abbreviation lookups and team schedules are the same for every player on a team, so the sidecar fetches them once (permanently for completed seasons, 5 minutes for the current one) and reuses them across players.
- **Incomplete data is never stored.** If any per-game, schedule, or team lookup fails transiently, the response carries `X-GridShift-Incomplete` and is neither persisted server-side nor cached in the browser.
- **Disk** is bounded by `GRIDSHIFT_PLAYER_DATA_MAX_BYTES` (default 1 GB); least recently read rows are evicted and simply refetched on demand. `/api/health` reports `playerData` rows, bytes, and breaker state.
- **Browser cache** is IndexedDB (`playerDataCache.js`), not `localStorage`: completed-season entries never expire and survive app-version busts, live entries are wiped on a release, and an expired entry is served if the refresh fails (offline). Bump `PLAYER_DATA_SCHEMA_VERSION` (or the key version) when a payload shape changes; the server keys (`stats_v2_`, `gamelog_v11_`) must change together so old rows are not served.

| File | Owns |
| --- | --- |
| `src/utils/espnPlayerFetch.js` | Pure ESPN season stats, career stats (with the tackles-for-loss repair), and game-log waterfall shared by the browser and the sidecar; `fetchImpl` is injected and results report `incomplete` |
| `src/utils/playerApi.js` | Player fetching: sidecar first, direct ESPN fallback; rosters, profiles, bios, depth charts, team defense, schedules |
| `src/utils/playerDataCache.js` | IndexedDB payload cache for season stats, career stats, and game logs |
| `src/utils/playerCache.js` | `localStorage` cache for rosters, bios, and smaller ESPN responses; release version bust |
| `server/playerDataHandlers.js` | `/api/players` routes, freshness rules, stale fallback, negative cache, incremental game-log refresh |
| `server/playerDataStore.js` | SQLite store (`player-data.sqlite` on the data volume): gzip bodies, size cap, least-recently-read eviction |
| `server/playerDataUpstream.js` | The only path to ESPN: concurrency limit, request spacing, circuit breaker |
| `server/playerDataConfig.js` | `GRIDSHIFT_PLAYER_DATA_*` settings |
| `src/utils/playerMetrics.js` | Derived metrics |
| `src/components/PlayerBrowser.jsx` | Search/browse UI |
| `src/components/PlayerProfile.jsx` | Profile view |
| `src/components/PlayerStatTable.jsx` | Stat tables |

## Scoring And Projections

Read first: [[Scoring Call Sites]] — every `calcPoints()` / `calcPointsFromTotals()` call must pass `position`; audit the full checklist before closing any scoring change.

| File | Owns |
| --- | --- |
| `src/utils/scoringEngine.js` | Core scoring — start here; `importLeagueScoring()` for Sleeper imports |
| `src/utils/projectionEngine.js` | Projections |
| `src/utils/starterProjections.js` | Shared starter projection assembly and BDL/Sleeper/current/prior-season fallback order |
| `src/utils/fantasyProjections.js` | Server projection normalization, BDL stat crosswalk, and Sleeper identity matching |
| `src/utils/sleeperProjections.js` | Sleeper weekly projection normalization and connected-league scoring |
| `src/api/fantasyProjectionsApi.js` | Optional browser-to-sidecar BDL weekly projection request |
| `src/api/sleeperApi.js` | Sleeper weekly projection request |
| `src/utils/draftAssistant/projections.js` | Draft-context projections |
| `src/utils/ktcApi.js` | KTC value adjustments |

Consumers to audit after any scoring change: `CompanionRoster.jsx`, `CompanionLeague.jsx`, `CompanionRankings.jsx`, `CompanionWaiver.jsx`, `CompanionMatchup.jsx`, `CompanionHeatmap.jsx`, `CompanionDefense.jsx`, `PlayerWeeklySheet.jsx`, `CompanionScoring.jsx`, `CompanionTrade.jsx` (all in `src/components/companion/`), plus `src/components/compare/CompareFantasyPanel.jsx` and `CompareTradePanel.jsx`.

## Compare Tab

| File | Owns |
| --- | --- |
| `src/components/compare/CompareTab.jsx` | Tab shell |
| `src/components/compare/ComparePickerSheet.jsx` | Player picker |
| `src/components/compare/CompareStatsPanel.jsx` | Stats comparison |
| `src/components/compare/CompareFantasyPanel.jsx` | Fantasy comparison |
| `src/components/compare/CompareTradePanel.jsx` | Trade comparison |
| `src/utils/espnSleeperMatch.js` | ESPN↔Sleeper player matching |

## Trade Value, Picks, And KTC

Read first: [[Trade Engine]] (must be updated in the same pass as any valuation/proposal/explanation change) and [[Trade Proposal Cards]] for card sizing rules.

| File | Owns |
| --- | --- |
| `src/components/companion/CompanionTrade.jsx` | Trade view shell |
| `src/components/companion/trade/TradeProposalBuilder.jsx` | Proposal construction UI |
| `src/components/companion/trade/TradeProposalPanel.jsx` | Proposal display |
| `src/components/companion/trade/UpgradeFinderPage.jsx` | Upgrade Finder |
| `src/components/companion/trade/ProposalPlayerCard.jsx` | Player/pick cards (fixed 5:7 ratio — see [[Trade Proposal Cards]]) |
| `src/components/companion/trade/ValuationInfoSheet.jsx` | Valuation explainer |
| `src/components/companion/trade/RosterBrowseModal.jsx` | Roster browsing |
| `src/components/companion/TradeRosterPicker.jsx` | Roster picker |
| `src/utils/tradeEngine.js` | Proposal generation and ranking |
| `src/utils/tradeValue.js` | Asset valuation |
| `src/utils/opportunityEngine.js`, `src/utils/opportunity/` | Opportunity analysis |
| `src/utils/ktcApi.js` | KTC values |
| `src/utils/idpEngine.js` | IDP valuation |

Rules: keep legacy provider guards intact where they prevent old persisted sessions from exposing unsupported Trade behavior. Watch the `productionAdjustedValue` null-propagation gotcha (CLAUDE.md).

## Companion And Trade Selector Rows

Read first: [[Companion Shared Rows]] — the design contract. Feature screens pass contextual data into these shared primitives; never rebuild row styling locally.

| File | Owns |
| --- | --- |
| `src/components/companion/CompanionPlayerRow.jsx` | Shared player row renderer and row slot API |
| `src/components/companion/CompanionAssetRow.jsx` | Shared player/pick/manager asset selector row |
| `src/components/companion/CompanionSelectorControls.jsx` | Shared rails, buttons, segmented controls, search fields |
| `src/components/companion/PlayerStatusBadge.jsx` | Availability/status badge |
| `src/hooks/useCompanionPlayerLocalContrast.js` | Local gradient contrast measurement |
| `src/utils/teamVisualTheme.js` | Canonical team theme/gradient/contrast source |
| `src/utils/companionAssetVisuals.js` | Player image, team logo, position badge, fallback visuals |
| `src/index.css` | `.companion-player-row`, selector, and asset-row CSS |

## Scout

Read first: [[Scout]] — APIs, CFBD importers, generated data contracts, real-data wiring checklist.

| File | Owns |
| --- | --- |
| `src/components/scout/ScoutTab.jsx` | Tab shell |
| `src/components/scout/ScoutPlayerCard.jsx` | Prospect card |
| `src/components/scout/ScoutPlayerSheet.jsx` | Prospect drilldown |
| `src/components/scout/ScoutStatisticsModal.jsx` | Prospect Statistics modal |
| `src/components/scout/scoutUtils.js` | Scout helpers |
| `src/data/rookies.js`, `src/data/draftPicks.js`, `src/data/draftResults.js` | Curated data |
| `src/data/rookieProduction.generated.js`, `src/data/rookieGameLogs.generated.js` | Generated data — regenerate via scripts, never hand-edit |
| `scripts/import-scout-production.mjs`, `scripts/import-scout-game-logs.mjs` | CFBD importers |

## Draft Assistant

Read first: [[Draft Assistant]].

| File | Owns |
| --- | --- |
| `src/components/draft/DraftAssistant.jsx` | Main view, incl. `DraftResultsView` (Blueprint default, first-round gradient, Pick List owns position/sort/team/rank controls) and `DraftResultRow` |
| `src/components/DraftSubNav.jsx` | Draft sub-nav |
| `src/utils/appRoutes.js` | Route registration |
| `src/utils/draftAssistant/index.js` | `getDraftResultsSeason(...)` (season *after* the draft — distinct from War Room's prior-season `getDraftStatsSeason(...)`), `buildDraftPositionRanks(...)` (actual selection order, never market rank), `buildRankSignal`'s `seasonFinishRank`/`seasonFinishLabel` (real season-end finish, not overridden by ADP), `computeDraftOutcomes(...)` (Boom/Strong/Even/Weak/Bust) |
| `src/utils/draftAssistant/projections.js` | Projection normalization |
| `src/utils/draftAssistant/rosterNeed.js` | Roster need |
| `src/utils/draftAssistant/availability.js` | Availability |
| `src/utils/draftAssistant/search.js` | Draft player search matching |
| `src/utils/draftAssistant/recommendations.js` | Recommendation heuristics |
| `src/utils/leagueHistory.js` | `buildDraftBlueprintSummaries(...)` — per-team position counts, named rounds 1–3, IDP-only defensive position exposure |
| `src/api/sleeperApi.js`, `src/api/leagueLogsApi.js` | Data sources |

## Export / Import / Shareable Image

Read first: [[Prediction Share Cards]] — product, privacy, state, recipient, and future-grading contracts.

| File | Owns |
| --- | --- |
| `src/components/ExportPreview.jsx` | Share-card studio, link/QR generation, copy, PNG download |
| `src/components/predictions/share/` | Six fixed-format card renderers, curated titles, export geometry; Team Record is screenshot-only |
| `src/components/PageShareSheet.jsx`, `src/utils/pageShare.js`, `vite.config.js` | Retained future page-share sheet, route-aware social metadata, and static preview entry files |
| `src/utils/predictionShareCodec.js` | Compressed, checksummed URL-fragment transport |
| `src/utils/predictionShareModel.js` | Pick-week context, snapshot-to-card projection |
| `src/components/ShareableImage.jsx` | Legacy shareable image |
| `src/utils/exportImport.js`, `src/utils/exportStats.js`, `src/utils/layoutUtils.js` | Export/import helpers |

## Trade Proposal Rooms

Read first: [[Trade Engine]] and [[Trade Proposal Cards]]. Proposal-room access is server-authoritative and must remain scoped to the exact Sleeper league and season. The visible surface is Proposals; `/trade/inbox` and `/api/trade-proposals/inbox` remain compatibility identifiers.

| File | Owns |
| --- | --- |
| `src/components/companion/CompanionTrade.jsx` | Creates snapshots from the local Agent/Intelligence/Upgrade proposal and opens send/counter sharing |
| `src/components/companion/TradeInbox.jsx` | Active incoming/outgoing proposal list, unread notifications, contextual response actions, accepted-state handoff guide for the accepting manager, completion action, decline states, and Sleeper reconciliation prompt |
| `src/components/companion/TradeShareLanding.jsx` | Rich link handoff and participant-only claim gate |
| `src/components/companion/trade/TradeShareSheet.jsx`, `TradeShareCard.jsx`, `tradeShare.css`, `tradeInbox.css` | Expiry selection, opaque-link QR generation, readable export/screenshot card, and responsive room styling |
| `src/hooks/useTradeProposals.js` | League/user-scoped participant session, in-app polling, proposal mutations, and local session-token storage |
| `src/api/tradeProposalApi.js` | Browser wrapper for proposal sessions, sharing, proposal-list actions, counters, acceptance, completion, and reconciliation |
| `src/utils/tradeProposal.js` | Portable snapshot normalization, expiry labels, asset fingerprints, and counter perspective helpers |
| `server/tradeProposalHandlers.js` | API/share routes, acceptance/completion authorization, and server-side Sleeper validation; never trust client league/roster/asset claims without rechecking |
| `server/tradeProposalStore.js` | Proposal/revision/event SQLite persistence, acceptance actor, expiry cleanup, and retention tombstones |
| `server/sleeperTradeApi.js` | Read-only Sleeper calls for league boundary and completed-transaction inspection |
| `server/tradeProposalConfig.js`, `server/tradeProposalCrypto.js` | Secret, data directory, retention, bounded payload, HMAC, and opaque-token contracts |
| `src/utils/appRoutes.js`, `src/App.jsx`, `src/components/TradeSubNav.jsx` | Proposals/share routes, unread badge, and route-level claim/counter/handoff navigation; legacy Inbox route remains supported |
| `nginx.conf`, `vite.config.js`, `docker-compose.yml`, `server/index.js` | Production/local proxying, persistent sidecar configuration, and route mounting |

Do not reuse the prediction fragment codec for server Trade rooms. Proposal revisions, revocation, expiry, participant authorization, and Sleeper reconciliation require a server-held payload and opaque capability URL.

## Build, PWA, And Deployment

| File | Owns |
| --- | --- |
| `package.json` | Version (drives PWA cache busting), scripts |
| `vite.config.js` | Build + PWA plugin + dev proxy + route-aware preview metadata |
| `nginx.conf` | Production serving |
| `src/main.jsx` | App entry |
| `src/hooks/usePWAInstall.js` | Install prompt |
| `docker-compose.yml`, `Dockerfile`, `Dockerfile.prebuilt`, `Dockerfile.server` | Container topology |
