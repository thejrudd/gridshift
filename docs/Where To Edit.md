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
  - `src/utils/projectionEngine.js`
  - `src/components/companion/CompanionRoster.jsx`
  - `src/components/companion/CompanionLeague.jsx`
  - `src/components/companion/CompanionRankings.jsx`
  - `src/components/companion/CompanionWaiver.jsx`
  - `src/components/companion/CompanionMatchup.jsx`
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
- `src/utils/tradeEngine.js`
- `src/utils/ktcApi.js`
- `src/utils/idpEngine.js`

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
