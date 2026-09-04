# Where To Edit

Back: [[Home]]

Routing table: match the task to a section, open the listed files, and read the linked deep doc before changing anything it covers. This page routes — it does not explain. Implementation rules live in the deep docs.

## Task Index

| Task involves | Section |
| --- | --- |
| Shell, tabs, sidebar, sub-navs, routing chrome | [Navigation And Layout](#navigation-and-layout) |
| Display density, type tokens, page frames | [Display Size, Typography, And Wide Layouts](#display-size-typography-and-wide-layouts) |
| Prediction picks, playoff seeding, and share cards | [Predictions And Share Cards](#predictions-and-share-cards) |
| Live fantasy scoring view (hero, pace chart, feed, win odds) | [Fantasy Live](#fantasy-live) |
| NFL scoreboard, box scores, play-by-play visuals | [Statistics Scores And NFL Plays](#statistics-scores-and-nfl-plays) |
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
| `src/utils/livePlaysFeed.js` | Play → 0..1 game-progress axis (`getPlayProgress()`) |
| `src/utils/liveWinProbability.js` | `explainWinProbability()`, `resolveStarterProjection()` |
| `src/data/liveWinProbabilityModel.js` | Generated coefficient contract — never hand-edit |
| `src/utils/liveFeedFilters.js` | League-derived filter groups and types |
| `src/utils/fantasyTeamIdentity.js` | Per-roster identity colours |
| `src/utils/liveDemoTimeline.js`, `src/utils/liveDemoPlays.js` | Mock play-by-play |
| `src/api/liveApi.js` | Browser-to-sidecar live requests |
| `server/liveHandlers.js` | Server-only credential, allowlist/session checks, proxy caching |
| `src/index.css` | The `.fl-*` block |

Rules: the chart x-axis is game progress, not wallclock. The week comes from Sleeper `/state/nfl` — never add a week picker to Live. Starter projections change only in `resolveStarterProjection()`. Full rules: [[Fantasy Live]].

## Statistics Scores And NFL Plays

Read first: [[Statistics Scores]] before production data wiring.

### Statistics-owned

| File | Owns |
| --- | --- |
| `src/components/statistics/scores/StatisticsScores.jsx` | Route state, masthead, season selector, week rail |
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
| `src/data/statisticsScoresFixtures.js` | Normalized local fixture contract |

### Shared play parsing and field graphics (NOT Statistics-owned — also feeds Fantasy Live)

| File | Owns |
| --- | --- |
| `src/utils/nflPlays/playNarrative.js` | Play text → sentence + actor list; add play types as grammars, never loosen the `confident: false` fallback |
| `src/utils/nflPlays/playerNameIndex.js` | Name variants and ambiguity rules (`livePlaysFeed.buildStarterNameIndex` adapts it for Fantasy Live) |
| `src/utils/nflPlays/participants.js` | ESPN per-game participant and headshot resolution |
| `src/utils/nflPlays/fieldGeometry.js` | Field coordinates (`fieldX`), play classification, trajectories, kick helper, `isScoringPlay()`, `playColor()`, `getOffenseTeam()` (single owner of possession correction) |
| `src/utils/nflPlays/playPresentation.js`, `latestPlayPresentation.js` | Shared outcome tags, compact scorecard projection |
| `src/utils/nflPlays/playBeats.js` | Play as scrubbable timeline; `estimateAirYards()` positions the ball but must never appear as a number in beat text |
| `src/utils/nflPlays/playSequenceContext.js` | Bounded cross-play inference (e.g. omitted passer on scoring-summary turnovers) |
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
| `server/liveGameSnapshots.js` | Canonical provider play snapshot shared by Statistics and Fantasy Live |
| `src/api/liveApi.js`, `src/api/statisticsScoresApi.js` | Client contracts for the two route groups |
| `src/components/companion/CompanionLive.jsx`, `src/components/statistics/scores/StatisticsScores.jsx` | Browser refresh triggers, visibility/offline behavior — neither owns provider play truth |
| `.env.example`, `docker-compose.yml`, `nginx.conf`, `vite.config.js` | Secrets, sidecar topology, proxy boundaries |
| `tests/unit/balldontlieGateway.test.mjs`, `publicRequestGuard.test.mjs`, `liveConfigStatus.test.mjs`, `statisticsScoresHandlers.test.mjs`, `providerAnchoredGameClock.test.mjs` + live/Scores E2E specs | Boundary coverage |

Rules: any change here must audit both Statistics Scores and Fantasy Live. Count every provider cursor page and retry. Keep browser throttling separate from the account-wide provider budget. No multiple sidecar replicas until the shared-store/leader phase ships.

## Fantasy Connection And League Data

| File | Owns |
| --- | --- |
| `src/context/SleeperContext.jsx` | League/roster state — widest blast radius in the app |
| `src/api/sleeperApi.js` | Sleeper API client |
| `src/components/companion/CompanionConnect.jsx` | Connect flow |

Sleeper is the supported fantasy connection.

## League History, Standings, And Activity

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

| File | Owns |
| --- | --- |
| `src/utils/playerApi.js` | ESPN player fetching |
| `src/utils/playerMetrics.js` | Derived metrics |
| `src/utils/playerCache.js` | Caching |
| `src/components/PlayerBrowser.jsx` | Search/browse UI |
| `src/components/PlayerProfile.jsx` | Profile view |
| `src/components/PlayerStatTable.jsx` | Stat tables |

## Scoring And Projections

Read first: [[Scoring Call Sites]] — every `calcPoints()` / `calcPointsFromTotals()` call must pass `position`; audit the full checklist before closing any scoring change.

| File | Owns |
| --- | --- |
| `src/utils/scoringEngine.js` | Core scoring — start here; `importLeagueScoring()` for Sleeper imports |
| `src/utils/projectionEngine.js` | Projections |
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
