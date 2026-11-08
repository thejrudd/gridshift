# Project reference

[Back to README](../README.md)

## Project Principles

GridShift is a labor-of-love project: it should create something useful or fun, not maximize revenue or feature volume. It is free, open source, ad-free, and practical to self-host. The core app should remain device-first and usable without authentication or required server-side storage of personal data.

GridShift supports fantasy football and relevant football analytics, but will not facilitate sportsbook wagers, prop bets, wager placement, sportsbook or affiliate links, betting calls to action, or betting monetization. Paid data and hosted deployments may exist when necessary, but they remain optional, transparent, and separate from the core application. Project stewardship may be supported through voluntary contributions, sponsorships, paid official hosting, or support services, without required royalties on independent hosts.

Prefer thoughtful, well-tested work that makes GridShift more useful or enjoyable over novelty, growth, or monetization for its own sake.

Keep the product focused and balanced: build enough depth to make its core workflows genuinely useful, while keeping the overall range navigable and approachable. Favor information-dense experiences that remain easy to understand. Add a feature when it strengthens that product, not simply to make the feature list longer.

## Tech Stack

| Layer | Technology |
|---|---|
| UI framework | React 19 |
| Build tool | Vite 7 |
| Styling | Tailwind CSS 3 + CSS custom properties |
| Bento grid | react-grid-layout |
| Share-card capture | Browser-native screenshot view |
| Fantasy data | Sleeper API (client-side) |
| Player data | ESPN public APIs (server cache with direct browser fallback) |
| Live data | Optional BALLDONTLIE NFL API via server-side GridShift API |
| PWA | vite-plugin-pwa + Workbox |
| Production serving | nginx (Docker) + optional Node API sidecar |

## Project Structure

```
src/
├── App.jsx                        # Main app shell — sidebar, tab bar, routing
├── components/
│   ├── Sidebar.jsx                # Desktop sidebar: brand, nav, progress, dark mode toggle
│   ├── NavBar.jsx                 # Mobile sticky top nav bar
│   ├── BottomTabBar.jsx           # Mobile top-level Fantasy / League / NFL navigation
│   ├── SeasonSubNav.jsx           # Season sub-view tabs (Predictions / Standings / Playoffs)
│   ├── StatisticsSubNav.jsx       # Statistics sub-view tabs (Stats / Schedule / Standings)
│   ├── CompanionSubNav.jsx        # Fantasy sub-view tabs
│   ├── LeagueSubNav.jsx           # League Standings / History / Activity tabs
│   ├── HorizontalScrollCue.jsx    # Shared touch cue + clickable desktop rail controls
│   ├── ActionSheet.jsx            # iOS-style bottom sheet for overflow menu
│   ├── FavoriteTeamPicker.jsx     # Full-screen team color theme picker
│   ├── companion/
│   │   ├── CompanionConnect.jsx   # Sleeper connect + league selection flow
│   │   ├── CompanionLeague.jsx    # Canonical Rosters + nested Draft Picks view
│   │   ├── CompanionRoster.jsx    # Legacy compatibility wrapper for Rosters
│   │   ├── CompanionRankings.jsx  # League rankings, free agents, and weekly projections
│   │   ├── CompanionMatchup.jsx   # All weekly matchups: projections, cycling, breakdowns
│   │   ├── CompanionSchedule.jsx  # Season-long fantasy pairings by week or team (Beta)
│   │   ├── CompanionStandings.jsx # Finalized-week and historical fantasy standings/brackets
│   │   ├── CompanionHistory.jsx   # Lifetime league record book and rivalries
│   │   ├── CompanionActivity.jsx  # Selected-season filtered transaction ledger
│   │   ├── CompanionHeatmap.jsx   # Heatmap: pts allowed/scored per team/week with drilldowns
│   │   ├── CompanionDefense.jsx   # Defense rankings by stats/fantasy points allowed
│   │   ├── CompanionScoring.jsx   # Scoring settings viewer (synced from league)
│   │   └── PlayerMatchupBreakdown.jsx  # Per-player stat → fantasy point breakdown modal
│   ├── PlayerBrowser.jsx          # Team/roster browser with position filter and search
│   ├── PlayerProfile.jsx          # Player profile page with hero card, stats, and game log
│   ├── PlayerStatTable.jsx        # Accordion stat table with standard/advanced toggle
│   ├── StatisticsSchedule.jsx     # NFL schedule browser by week/team/special slate
│   ├── StatisticsStandings.jsx    # NFL standings by division and conference
│   ├── StatisticsGame.jsx         # Game-level box score route for final games
│   ├── predictions/
│   │   └── PredictionsRedesign.jsx # Record-first predictions, advanced team picks, standings, playoffs
│   ├── TeamList.jsx               # Division cards with team rows and tooltips
│   ├── TeamDetail.jsx             # Modal for editing team predictions
│   ├── StandingsTable.jsx         # Division standings view
│   ├── PlayoffSeeding.jsx         # Playoff bracket view
│   ├── RecordSetter.jsx           # Win-loss-tie record controls
│   ├── GameResultToggle.jsx       # Individual game outcome toggle
│   ├── DivisionMatrix.jsx         # Head-to-head results grid
│   ├── ExportPreview.jsx          # Export modal with section toggles and layout controls
│   ├── ShareableImage.jsx         # Interactive bento-grid infographic with 11 sections
│   └── Guide.jsx                  # Getting-started guide modal
├── context/
│   ├── PredictionContext.jsx      # Prediction state and localStorage sync
│   ├── ThemeContext.jsx           # Dark mode + favorite team theming state
│   └── SleeperContext.jsx         # Fantasy platform state: league lineage, rosters, stats, scoring
├── api/
│   ├── sleeperApi.js              # Sleeper API fetches: users, leagues, rosters, stats
│   └── weatherApi.js              # Open-Meteo archive weather for game-day conditions
├── data/
│   ├── teamColors.js              # Official color palettes for all 32 teams (light + dark)
│   ├── honors.json                # Static Pro Bowl / All-Pro records by player and season
│   └── stadiums.js                # All 32 NFL stadiums: indoor flag, coordinates, week dates (home stadiums only; a neutral-site game uses the schedule entry's ESPN `venue`)
└── utils/
    ├── playerApi.js               # ESPN API fetches: roster, stats, game log, bio
    ├── playerCache.js             # localStorage cache with per-key TTLs
    ├── playerMetrics.js           # Stat row definitions, headline metrics, career highlights
    ├── projectionEngine.js        # PPG averages, positional ranks, opponent strength, projections
    ├── scoringEngine.js           # Fantasy point calculation and DEFAULT_SCORING config
    ├── leagueHistory.js           # Sleeper season snapshots, history, standings, activity, blueprints
    ├── scheduleParser.js          # Team/division queries, strength of schedule
    ├── statisticsStandings.js     # Schedule-result standings model
    ├── validation.js              # Constraint checking and balance validation
    ├── exportImport.js            # JSON export/import
    ├── exportStats.js             # Highlight stat computations for the infographic
    └── layoutUtils.js             # Bento grid layout constants, sizing, and RGL helpers
```
