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

## Fantasy Connection And League Data

- `src/context/SleeperContext.jsx`
- `src/api/sleeperApi.js`
- `src/components/companion/CompanionConnect.jsx`

Sleeper is the only supported fantasy connection. Legacy ESPN adapter and sidecar files remain for compatibility and tests, but must not be surfaced or expanded.

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
- Sleeper imports use `importLeagueScoring()`. Legacy ESPN scoring-profile readers remain compatibility-only.
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
