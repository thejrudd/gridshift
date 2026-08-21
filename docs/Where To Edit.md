# Where To Edit

Back: [[Home]]

This page is the quick "open these files first" guide.

## Navigation And Layout

- Start in `src/App.jsx`.
- Then check:
  - `src/components/Sidebar.jsx`
  - `src/components/NavBar.jsx`
  - `src/components/BottomTabBar.jsx`
  - `src/components/SeasonSubNav.jsx`
  - `src/components/CompanionSubNav.jsx`
  - `src/components/LeagueSubNav.jsx`
  - `src/components/HorizontalScrollCue.jsx`
  - `src/index.css`

## Display Size, Typography, And Wide Layouts

- `src/utils/displayPreferences.js` — supported preset values, normalization, storage key, and root attribute application.
- `src/context/ThemeContext.jsx` — display preference state and setter.
- `src/components/DisplaySettingsModal.jsx` — centered Compact/Comfortable/Large chooser.
- `src/components/Sidebar.jsx` and `src/components/ActionSheet.jsx` — desktop, collapsed-rail, and mobile entry points.
- `src/index.css` — semantic `--type-*` and density tokens plus readable/data/workbench page-frame classes.

Apply exactly one page-frame class to new route roots. Do not detect display DPI, use CSS `zoom`, or add transform-based whole-app scaling.

## Predictions And Standings

- `src/context/PredictionContext.jsx`
- `src/utils/scheduleParser.js`
- `src/utils/validation.js`
- `src/components/TeamList.jsx`
- `src/components/TeamDetail.jsx`
- `src/components/StandingsTable.jsx`
- `src/components/PlayoffSeeding.jsx`

## Fantasy Live

- `src/components/companion/CompanionLive.jsx` — route state, live session gate, the matchup chip rail (scoreboard chips on the shared `CompanionSelectorRail`), and the pace/palette derivations that feed every piece below.
- `src/api/liveApi.js` — browser-to-sidecar live session, games, stats, and plays requests.
- `server/liveHandlers.js` — server-only BALLDONTLIE credential, league allowlist/session checks, proxy caching, and current downstream request guard.
- [[Live Data Server Architecture]] — approved cross-feature plan for tier capabilities, page-aware quotas, league ingest lifecycle, safe coalescing, clock anchors, and later horizontal scale.
- `src/components/companion/live/LiveHero.jsx` — split hero: team gradients on the diagonal, edge scores, top-three scorer lists, neutral win plate, odds rail. Each side's “Top scorers” block always shows the three leading names and point totals, and every scorer opens their player breakdown. Faces are ESPN cut-out headshots when the hero itself has enough inline room and the spotlight strip below that. Each half shows its top scorer in the foreground and adds the second- and third-highest scorer as the hero widens. The ranked portrait group and scorer list crossfade when their order changes. Both top scorers must resolve before cut-out mode activates, so a matchup with a missing featured headshot drops cleanly to spotlight instead of substituting a team logo; missing secondary cut-outs do not remove their score line.

Sleeper leaves `espn_id` null for roughly three quarters of startable skill players, so `CompanionLive` folds `espnIdOverrides` (the context's ESPN roster cross-reference) into each starter's `espnId` before anything resolves imagery. Any new surface that shows a player photo should do the same.
- `src/components/companion/live/LivePlayerSheet.jsx` — the drill-in record card: framed portrait, pace strip, Scoring / Box score / Plays. On every layout it replaces the pace graph inside the shared analysis slot while the performer list and play feed remain available; closing it restores the graph.
- `src/components/companion/live/LivePaceChart.jsx` — scoring vs projected pace; drag to rewind the day, or pick a milestone to select and expand that exact play in the feed. A chosen moment persists across the chart and hero until another selection or Back to live. The feed jumps on pointer release, never mid-drag. Milestone selection clears a player-only feed focus and widens an opposing side filter to Both when needed so the target row cannot remain hidden.

Hovering or focusing a milestone shows the scoring player's name beneath the compact clock/action readout. Player identity comes from the matchup's `entriesById` map in `CompanionLive.jsx`; keep it optional so fallback chart data and unresolved players still render cleanly.

The production chart's x-axis is **game progress, not wallclock**: a 1pm and a 4pm game sit at different points of their own stories at the same moment, and pace is about the game. `getPlayProgress()` (`src/utils/livePlaysFeed.js`) puts every play on that 0..1 axis and `buildPaceSeries()` (`src/utils/livePace.js`) turns them into the stepped curve plus its milestones. Per-play points are estimates, so historical steps keep their event-time estimates; never rescale them with a later authoritative total. Replay prefers a complete persisted v3 snapshot recorded at or before the selected play. When none exists, the canonical engine reconstructs each starter independently from the points observed by that moment and that starter's own kickoff/game-progress timeline. `livePace.js` must not derive a second probability formula. Only the final chart point receives the current authoritative score and live snapshot directly, keeping the chart, hero, verdict, and explainer identical. Feed anchoring uses the same axis (`anchorProgress`), so any new event source must carry a `progress` value or it cannot be placed.

The chart always reserves the complete 0..1 week axis. Actual score lines and their filled areas stop at NOW, while the neutral future field and full-week projection rays remain visible; do not renormalize partial-week data to the full plot width. On desktop, SVG height is derived from the measured chart viewport width and clamped between 240px and 420px, so the chart grows proportionally across the workbench and recomputes when a player drilldown changes the available width. Mobile keeps the compact 128px plot. Chromium `ctrl+wheel` trackpad pinch events and Safari gesture events continuously expand only the horizontal time axis from 1× to 3×, with animation-frame batching and the gesture midpoint held in place. The View buttons remain discrete shortcuts to useful 1×, 1.5×, 2×, and 3× anchors. `.fl-chart__viewport` owns horizontal scrolling and contains overscroll so the document keeps its own scroll position. Fit restores the full-week view. At fit width, horizontal drag scrubs the exact X-position; once zoomed, touch panning belongs to the chart viewport and a tap selects that point on the visible path unless it lands inside a score dot's snap radius.

Mock play-by-play is the deliberate exception. `src/utils/liveDemoTimeline.js` reads the week's real kickoff dates, removes days without games, and gives each relevant game one consecutive chart segment in kickoff order. Day ticks therefore adapt to Thanksgiving, Christmas, and Saturday slates while busy game days receive proportionally more navigable room. Generated mock plays are distributed through all four quarters inside each segment. `src/utils/liveDemoPlays.js` adds a shared reception/fumble-return touchdown that credits an offensive starter and the opposing fantasy defense at the exact same chart position, using the active league scoring settings for both breakdowns. Mock generation covers every relevant scheduled game so late windows such as Monday night cannot be removed by the real play-by-play eight-game request budget. This keeps the demo chart steadily readable without changing production live-scoring behavior.

On desktop the matchup selector is the top sticky layer, but the chart/feed workspace moves normally with the document. When the main pane is at least 720px wide, that workspace becomes a shared row: the independently scrolling play feed occupies the narrower left rail and the performer/analysis surface occupies the wider right side. The performer list always sits above the analysis slot; selecting a player swaps the pace graph for that player's drilldown without moving or hiding the feed. CSS size containment makes this right column define the row height so the feed cannot stretch the page; narrower main panes return to the same components in a linear stack. Once the full hero scrolls away, the chart header crossfades from chart context to a compact score/odds summary without changing height. Chart selection positions the matching row directly beneath the feed's own sticky filter without moving the document.

Matchup navigation is also a state boundary. Before `matchupIndex` changes, Fantasy Live clears expanded feed plays, persisted chart moments, chart/feed anchors, side and player filters, player drilldowns, and saved mobile feed scroll so returning to a matchup always starts without stale selections.

Everything drawn in that SVG is `pointer-events: none` except the milestones, so the scrub indicator drawn last cannot swallow a milestone click. The tracking line follows the pointer's exact X-position and samples each team's visible score path there. It snaps to a scoring milestone only inside that dot's two-dimensional hit radius, so crossing the same X-position above or below a dot does not make the tracker jump. Team paths use each point's scoring-side metadata and retain distinct same-X totals; every rendered score dot must sit on its own team's path.
- `src/components/companion/live/LiveFeed.jsx` — side filter with counts and the play rows, including the inline scoring-math expansion.
- `src/components/companion/live/LivePerformerRail.jsx`, `LiveVerdict.jsx`, `LiveAtoms.jsx`, `liveVisuals.js`.
- `src/utils/livePace.js` and `src/utils/fantasyTeamIdentity.js` — pace maths and per-roster identity colours.
- `src/index.css` — the `.fl-*` block.

- The hero's win-probability plate opens an explainer built from `explainWinProbability()` (`src/utils/liveWinProbability.js`): each side's live points, what its unplayed starters still project to add, the projected margin, and the swing still available. Each starter is evaluated against the share of their pregame target expected by that point in their NFL game. Hover and keyboard focus open it on pointer devices; tap toggles it on touch. Touch fires `focus` before `click`, so both handlers check the last pointer type — changing one without the other makes the panel flicker shut on tap.

Any change to a starter's projected number belongs in `resolveStarterProjection()` (`src/utils/liveWinProbability.js`) so the odds and the pace lines stay in agreement.

`src/data/liveWinProbabilityModel.js` is generated from the local historical calibration workflow and is the only production coefficient contract. Do not ship league IDs, raw Sleeper payloads, or nflverse rows. Unfinished probabilities stay inside the model's open interval and render with tail labels; exact 0%/100% requires every starter to be officially final or on a bye proved by a complete schedule, followed by a fresh no-store Sleeper matchup response containing both final team totals and every starter's official points. Incomplete final responses retry quietly and remain projected.

The week is derived from Sleeper's `/state/nfl` response, not selectable: Fantasy Live shows a matchup only while Sleeper reports an active NFL regular-season week. That league-week label remains visible between NFL game windows; the red live pulse and “matchup games live” count appear only when a game involving a starter in the currently selected fantasy matchup is in progress. Preseason, offseason, and historical-league states must stay weekless rather than falling back to the league's frozen `last_scored_leg`. Historical weeks and their play history belong to Fantasy Matchups (`CompanionMatchup.jsx`, which owns `MatchupWeekPickerModal`). Do not add a week picker back to Live.

## Statistics Scores

- `src/components/statistics/scores/StatisticsScores.jsx` — route-level state, masthead, season selector, and week rail.
- `src/components/statistics/scores/ScoresSeasonBoard.jsx` — selected-week Hero week + peek layout and chronological kickoff groups.
- `src/components/statistics/scores/GameScorebug.jsx` — scheduled, live, final, favorite, delayed, offline, and unavailable matchup states.
- `src/components/statistics/scores/ScoresGameDrilldown.jsx` — Overview, Team Stats, Players, Scoring, and Play-by-Play.
- `src/components/statistics/scores/PlayCard.jsx` — one play in the feed: the text line (down and distance, spot, sentence with headshots, outcome tag, clock), the trajectory strip beneath it, and the expandable per-player breakdown. The only Statistics-specific piece of the play-by-play presentation.
- `src/components/statistics/scores/StatisticsScores.css` — feature-owned responsive and density-aware styling.

Play parsing and the field graphics are **not** Statistics-owned. Edit them in the shared layer:

- `src/utils/nflPlays/playNarrative.js` — raw play text to a plain-language sentence and an ordered actor list. Add new play types as grammars; never loosen the `confident: false` fallback.
- `src/utils/nflPlays/playerNameIndex.js` — name variants and ambiguity rules for matching play text to players. `livePlaysFeed.buildStarterNameIndex` is a thin adapter over it, so changes here reach Fantasy Live.
- `src/utils/nflPlays/participants.js` — ESPN per-game participant and headshot resolution.
- `src/utils/nflPlays/fieldGeometry.js` — yards-to-endzone to absolute field coordinates, the 120-yard canvas mapping (`fieldX`), play type/outcome classification, per-play trajectory geometry, and the shared kick helper. `isScoringPlay()` decides what reads as a score, and `playColor()` is the single owner of play colouring. `getOffenseTeam()` is the single owner of the possession correction — the feed's `team` names whoever holds the ball after the play, so on kicks and turnovers it is the receiving side. Both the field graphics and `groupBdlPlaysIntoDrives()` ask it rather than reading `team` directly. Kick direction and start spot come from the play description, because the numeric fields are inconsistent on punts.
- `src/utils/nflPlays/playBeats.js` — one play as a scrubbable timeline: the ball's position over time plus the beats that fire as it reaches each moment. It composes `getPlayTrajectory()` and `parsePlayNarrative()` and owns no geometry or parsing of its own. Add a new play type as a branch that builds segments and beats; anything unhandled falls through to the generic path, which still travels the real start-to-end path and still speaks the full sentence. `estimateAirYards()` is the single owner of the estimated catch point — the feed reports no air yards, no catch spot and no yards after catch, so the estimate may position the ball and must never appear as a number in beat text.
- `src/components/nflPlays/` — `fieldPrimitives.jsx` (end zones, yard lines, red zones, axis, glyphs, outcome marks, legend), `PlayTrajectoryStrip.jsx` (one play drawn in the Trajectory vocabulary), `DriveField.jsx` (the drive as stacked lanes on one field, and the Play drive toggle), `DrivePlayback.jsx` (the drive animated one snap at a time, with transport, scrubber and beat log), `WinProbabilityChart.jsx`, and their `NflPlays.css`. Both field views share one 120-yard canvas so a play strip lines up yard for yard with the drive field above it; any new field visual must go through `fieldX` and the shared kick helper rather than compute its own coordinates.
- `src/components/shared/PlayerAvatar.jsx` — the headshot → team mark → initials avatar, shared with Fantasy Live (which imports it as `LiveAvatar` from `LiveAtoms.jsx`).
- `tests/fixtures/bdlNflPlays.json` and `tests/fixtures/espnGameParticipants.json` — captured provider payloads. Read these instead of re-deriving field shapes.
- `src/api/statisticsScoresApi.js` — browser-to-sidecar Scores requests.
- `server/statisticsScoresHandlers.js` — public provider selection, BALLDONTLIE pagination/cache, ESPN snapshots, and drilldown aggregation.
- `src/utils/statisticsScoresProvider.js`, `src/utils/balldontlieNflScoreboard.js`, and `src/utils/espnNflScoreboard.js` — source eligibility and normalized scoreboard adapters.
- `src/data/statisticsScoresFixtures.js` — normalized local fixture contract. See `docs/Statistics Scores.md` before production data wiring.

## Live Data Server, Budgets, And Scaling

Start with [[Live Data Server Architecture]] before changing provider cadence, credential handling, caches, request limits, live clocks, or fallback behavior.

- `server/index.js` — constructs the one process-wide provider gateway and mounts both route groups.
- `server/balldontlieGateway.js` — shared credential, capabilities, bounded cache, pagination, quota accounting, backoff, and freshness metadata.
- `server/publicRequestGuard.js` — bounded public Scores request/concurrency protection.
- `server/liveHandlers.js` — Fantasy Live session/league boundary and gateway-backed route projection.
- `server/statisticsScoresHandlers.js` — public Scores provider selection, selected-week live lane, details, and ESPN fallback.
- `src/api/liveApi.js` and `src/api/statisticsScoresApi.js` — client contracts for the two server route groups.
- `src/components/companion/CompanionLive.jsx` and `src/components/statistics/scores/StatisticsScores.jsx` — current browser polling and visibility/offline behavior.
- `.env.example`, `docker-compose.yml`, `nginx.conf`, and `vite.config.js` — secrets, sidecar topology, and development/production proxy boundaries.
- `tests/unit/balldontlieGateway.test.mjs`, `tests/unit/publicRequestGuard.test.mjs`, `tests/unit/liveConfigStatus.test.mjs`, `tests/unit/statisticsScoresHandlers.test.mjs`, `tests/unit/providerAnchoredGameClock.test.mjs`, and the live/Scores E2E specs — current boundary coverage.

Any change here must audit both Statistics Scores and Fantasy Live. Count every provider cursor page and retry, keep downstream browser throttling separate from the account-wide provider budget, and do not run multiple live-data sidecar replicas until the shared-store/leader phase is implemented.

## Fantasy Connection And League Data

- `src/context/SleeperContext.jsx`
- `src/api/sleeperApi.js`
- `src/components/companion/CompanionConnect.jsx`

Sleeper is the supported fantasy connection.

## League History, Standings, And Activity

- `src/utils/leagueHistory.js` — shared season snapshot cache, stable participant identity, matchup/standings/bracket calculations, transaction normalization, record leaders, and Draft Blueprint summaries.
- `src/hooks/useLeagueHistoryData.js` — selected-season-plus-prior-lineage loading and focused error/retry state.
- `src/components/companion/CompanionStandings.jsx` — finalized-week current table, named divisions, historical final table, and evidence-backed brackets (including Toilet Bowl versus consolation labels).
- `src/components/companion/CompanionHistory.jsx` — lifetime leaderboard, champions, rivalries, and core records.
- `src/components/companion/CompanionActivity.jsx` — selected-season completed Sleeper transaction ledger with type filters, drillable player/NFL-team visuals and responsive team logos, fantasy-team avatars, action glyphs, large-entry collapse behavior, and commissioner events hidden by default.
- `src/components/companion/LeagueHistoryIcon.jsx` — shared archive glyph treatment used by record tiles, standings brackets, and the Activity timeline.
- `src/components/companion/LeagueHistoryState.jsx` — shared centered loading/unavailable/error/empty treatment.
- `src/components/LeagueSubNav.jsx`, `src/utils/appRoutes.js`, and `src/App.jsx` — League tab registration, canonical `/league/*` routing, legacy `/companion/*` aliases, and lazy route mounting.

## ESPN Player Data And Profiles

- `src/utils/playerApi.js`
- `src/utils/playerMetrics.js`
- `src/utils/playerCache.js`
- `src/components/PlayerBrowser.jsx`
- `src/components/PlayerProfile.jsx`
- `src/components/PlayerStatTable.jsx`

## Scoring And Projections

- Start in `src/utils/scoringEngine.js`.
- Sleeper imports use `importLeagueScoring()`.
- Then audit:
  - `src/utils/draftAssistant/projections.js`
  - `src/utils/projectionEngine.js`
  - `src/components/companion/CompanionRoster.jsx`
  - `src/components/companion/CompanionLeague.jsx`
  - `src/components/companion/CompanionRankings.jsx`
  - `src/components/companion/CompanionWaiver.jsx`
  - `src/components/companion/CompanionMatchup.jsx`
  - `src/components/companion/CompanionHeatmap.jsx`
  - `src/components/companion/CompanionDefense.jsx`
  - `src/components/companion/PlayerWeeklySheet.jsx`
  - `src/components/companion/CompanionScoring.jsx`
  - `src/components/companion/CompanionTrade.jsx`
  - `src/components/compare/CompareFantasyPanel.jsx`
  - `src/components/compare/CompareTradePanel.jsx`
  - `src/utils/ktcApi.js`

## Compare Tab

- `src/components/compare/CompareTab.jsx`
- `src/components/compare/ComparePickerSheet.jsx`
- `src/components/compare/CompareStatsPanel.jsx`
- `src/components/compare/CompareFantasyPanel.jsx`
- `src/components/compare/CompareTradePanel.jsx`
- `src/utils/espnSleeperMatch.js`

## Trade Value, Picks, And KTC

- `src/components/companion/CompanionTrade.jsx`
- `src/components/companion/trade/TradeProposalBuilder.jsx`
- `src/components/companion/trade/TradeProposalPanel.jsx`
- `src/components/companion/trade/UpgradeFinderPage.jsx`
- `src/components/companion/trade/ProposalPlayerCard.jsx`
- `src/components/companion/trade/ValuationInfoSheet.jsx`
- `src/components/companion/trade/RosterBrowseModal.jsx`
- `src/components/companion/TradeRosterPicker.jsx`
- `src/utils/tradeEngine.js`
- `src/utils/tradeValue.js`
- `src/utils/opportunityEngine.js`
- `src/utils/opportunity/`
- `src/utils/ktcApi.js`
- `src/utils/idpEngine.js`

Keep legacy provider guards intact where they prevent old persisted sessions from exposing unsupported Trade behavior.

## Companion And Trade Selector Rows

Start with [[Companion Shared Rows]] for the design contract.

- `src/components/companion/CompanionPlayerRow.jsx` — shared player row renderer and row slot API.
- `src/components/companion/CompanionAssetRow.jsx` — shared player/pick/manager asset selector row.
- `src/components/companion/CompanionSelectorControls.jsx` — shared rails, buttons, segmented controls, and search fields.
- `src/components/companion/PlayerStatusBadge.jsx` — shared availability/status badge.
- `src/hooks/useCompanionPlayerLocalContrast.js` — local gradient contrast measurement for badges and row overlay labels.
- `src/utils/teamVisualTheme.js` — canonical team theme/gradient/contrast source.
- `src/utils/companionAssetVisuals.js` — player image, team logo, position badge, and fallback visual helpers.
- `src/index.css` — `.companion-player-row`, selector, and asset-row CSS.

Feature screens such as Rosters, Rankings, Waivers, Matchups, Heatmap drilldowns, Trade pickers, roster browse, and Upgrade Finder should pass contextual data into these shared primitives instead of rebuilding row styling locally.

## Scout

- `src/components/scout/ScoutTab.jsx`
- `src/components/scout/ScoutPlayerCard.jsx`
- `src/components/scout/ScoutPlayerSheet.jsx`
- `src/components/scout/ScoutStatisticsModal.jsx`
- `src/components/scout/scoutUtils.js`
- `src/data/rookies.js`
- `src/data/draftPicks.js`
- `src/data/draftResults.js`
- `src/data/rookieProduction.generated.js`
- `src/data/rookieGameLogs.generated.js`
- `scripts/import-scout-production.mjs`
- `scripts/import-scout-game-logs.mjs`
- `docs/Scout.md`

## Draft Assistant

- `src/components/draft/DraftAssistant.jsx`
- `src/components/DraftSubNav.jsx`
- `src/utils/appRoutes.js`
- `src/utils/draftAssistant/index.js`
- `src/utils/draftAssistant/projections.js`
- `src/utils/draftAssistant/rosterNeed.js`
- `src/utils/draftAssistant/availability.js`
- `src/utils/draftAssistant/recommendations.js`
- `src/api/sleeperApi.js`
- `src/api/leagueLogsApi.js`
- `docs/Draft Assistant.md`

### Draft Results: Blueprint, Pick List, rank toggle, and outcome grading

- `src/utils/draftAssistant/index.js` — `getDraftResultsSeason(...)` (the season played after the draft; keep distinct from War Room's prior-season `getDraftStatsSeason(...)`), `buildDraftPositionRanks(...)` (actual historical positional selection order, never market rank), `buildRankSignal`'s `seasonFinishRank`/`seasonFinishLabel` (real season-end positional finish, e.g. RB12, unconditional — not overridden by market/ADP data), and `computeDraftOutcomes(...)` (a positional draft-cost vs. matching-season finish comparison that returns Boom, Strong, Even, Weak, or Bust).
- `src/utils/leagueHistory.js` — `buildDraftBlueprintSummaries(...)` derives actual per-team position counts and named rounds 1–3 from completed picks and league roster settings, exposing individual defensive positions only for IDP leagues.
- `src/components/draft/DraftAssistant.jsx` — `DraftResultsView` defaults to Blueprint, renders the first-round selection on its NFL team gradient, and hands a selected fantasy team into the separate Pick List; Pick List exclusively owns position/sort/team/rank controls. `DraftResultRow` retains fixed aligned rank/outcome metric columns and `CompanionPlayerMetric` tone handling.

## Export / Import / Shareable Image

- `src/components/ExportPreview.jsx`
- `src/components/ShareableImage.jsx`
- `src/utils/exportImport.js`
- `src/utils/exportStats.js`
- `src/utils/layoutUtils.js`

## Build, PWA, And Deployment

- `package.json`
- `vite.config.js`
- `nginx.conf`
- `src/main.jsx`
- `src/hooks/usePWAInstall.js`
- `docker-compose.yml`
- `Dockerfile`
- `Dockerfile.prebuilt`
- `Dockerfile.server`

## Fantasy Live play filter

The feed's play-type tiers and the pace chart's dot filtering.

| Concern | File |
| --- | --- |
| Which groups and types a league gets, and what matches | `src/utils/liveFeedFilters.js` |
| The two-tier chip UI | `LiveFeedPlayFilter` in `src/components/companion/live/LiveFeed.jsx` |
| Chip styling | `.fl-playfilter*` in `src/index.css` |
| Filter state, counts, and applying it | `src/components/companion/CompanionLive.jsx` |

The filter set is **derived from the league**, never hardcoded: a group or type
appears only when `activeScoringSettings` (or a roster slot) makes it scorable,
so a kickerless league has no FG chip and a redraft league has no Defense
group. Adding a type means declaring what has to score for it to exist.

Filters read an event's `mechanism` (the football action) alongside its `kind`
(the fantasy result), so a rushing touchdown belongs to both Rush and TD.
"Big play" is pegged to the cheapest touchdown the league pays for, so it means
the same thing at 4-point passing as at 6.

The chart filters **marks only**. Lines are built from `points` and are never
touched, so narrowing to touchdowns changes which dots are drawn without
altering the shape of the week.
