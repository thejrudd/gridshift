# Feature Map

Back: [[Home]]

## Predictions

- Main shell entry: `src/App.jsx`
- Primary components:
  - `src/components/TeamList.jsx`
  - `src/components/TeamDetail.jsx`
  - `src/components/StandingsTable.jsx`
  - `src/components/PlayoffSeeding.jsx`
- Supporting logic:
  - `src/context/PredictionContext.jsx`
  - `src/utils/scheduleParser.js`
  - `src/utils/validation.js`

## Statistics

- Main components:
  - `src/components/PlayerBrowser.jsx`
  - `src/components/PlayerProfile.jsx`
  - `src/components/PlayerStatTable.jsx`
- Supporting logic:
  - `src/utils/playerApi.js`
  - `src/utils/playerMetrics.js`
  - `src/utils/playerCache.js`

## Companion

- Navigation entry:
  - `src/components/CompanionSubNav.jsx`
- League connection and setup:
  - `src/components/companion/CompanionConnect.jsx`
  - `src/context/SleeperContext.jsx`
  - `src/api/sleeperApi.js`
- Main feature areas:
  - `CompanionRoster.jsx`
  - `CompanionRankings.jsx`
  - `CompanionMatchup.jsx`
  - `CompanionWaiver.jsx`
  - `CompanionLeague.jsx`
  - `CompanionDefense.jsx`
  - `CompanionTrade.jsx`
  - `CompanionScoring.jsx`

## Compare

- Main entry:
  - `src/components/compare/CompareTab.jsx`
- Panels:
  - `CompareStatsPanel.jsx`
  - `CompareFantasyPanel.jsx`
  - `CompareTradePanel.jsx`
- Cross-system matching:
  - `src/utils/espnSleeperMatch.js`

## Export And Share

- Main components:
  - `src/components/ExportPreview.jsx`
  - `src/components/ShareableImage.jsx`
- Supporting logic:
  - `src/utils/exportImport.js`
  - `src/utils/exportStats.js`
  - `src/utils/layoutUtils.js`

## Theme And Shell

- `src/components/Sidebar.jsx`
- `src/components/NavBar.jsx`
- `src/components/BottomTabBar.jsx`
- `src/components/SeasonSubNav.jsx`
- `src/context/ThemeContext.jsx`
- `src/index.css`
