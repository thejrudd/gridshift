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
  - `src/index.css`

## Predictions And Standings

- `src/context/PredictionContext.jsx`
- `src/utils/scheduleParser.js`
- `src/utils/validation.js`
- `src/components/TeamList.jsx`
- `src/components/TeamDetail.jsx`
- `src/components/StandingsTable.jsx`
- `src/components/PlayoffSeeding.jsx`

## Sleeper Connection And League Data

- `src/context/SleeperContext.jsx`
- `src/api/sleeperApi.js`
- `src/components/companion/CompanionConnect.jsx`

## ESPN Player Data And Profiles

- `src/utils/playerApi.js`
- `src/utils/playerMetrics.js`
- `src/utils/playerCache.js`
- `src/components/PlayerBrowser.jsx`
- `src/components/PlayerProfile.jsx`
- `src/components/PlayerStatTable.jsx`

## Scoring And Projections

- Start in `src/utils/scoringEngine.js`.
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

Feature screens such as Roster, League, Rankings, Waiver, Matchup, Heatmap drilldowns, Trade pickers, roster browse, and Upgrade Finder should pass contextual data into these shared primitives instead of rebuilding row styling locally.

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

## Export / Import / Shareable Image

- `src/components/ExportPreview.jsx`
- `src/components/ShareableImage.jsx`
- `src/utils/exportImport.js`
- `src/utils/exportStats.js`
- `src/utils/layoutUtils.js`

## Build, PWA, And Deployment

- `package.json`
- `vite.config.js`
- `src/main.jsx`
- `src/hooks/usePWAInstall.js`
- `docker-compose.yml`
- `Dockerfile`
- `Dockerfile.prebuilt`
