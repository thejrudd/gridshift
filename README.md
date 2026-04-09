# NFL Season Predictor

An interactive web app for predicting the 2026 NFL season — with full Sleeper fantasy league integration. Pick game-by-game outcomes for all 32 teams, view projected standings, generate playoff seeding, create a shareable infographic, and analyze your fantasy roster with week-by-week scoring breakdowns and projections — all in the browser.

![React](https://img.shields.io/badge/React-19-blue) ![Vite](https://img.shields.io/badge/Vite-7-purple) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-38bdf8) ![PWA](https://img.shields.io/badge/PWA-installable-green)

## Features

- **Game-by-Game Predictions** — Pick W/L/T for all 272 regular season games with automatic opponent syncing; picks stay in sync league-wide
- **Real-Time Validation** — Enforces league-wide balance (272 total wins), division constraints, and pairwise game limits
- **Division Standings** — Auto-generated standings sorted by wins, division record, and strength of schedule
- **Playoff Seeding** — AFC and NFC brackets with division winners and wild card spots
- **Shareable Infographic** — Build a custom bento-grid graphic with up to 11 insight sections. Drag and resize sections, add your name/handle, and export as an image
- **Team Search & Filter** — Search teams by name or abbreviation and filter by conference from the predictions view
- **Player Browser** — Browse all 32 rosters by conference, division, and position; search players by name across the league
- **Player Profiles** — Full profile pages with headshot, career stats, game log, and Pro Bowl / All-Pro honors
- **Sleeper League Integration** — Connect your Sleeper account, import a league, and sync custom scoring settings
- **League Browser** — Browse any league member's full roster with stats and weekly breakdowns; view a league-wide draft capital grid showing pick ownership by round and year
- **Fantasy Matchup View** — Head-to-head starter comparison with week-by-week points, projections, positional rankings, weather context, and game location
- **Player Projections** — Min/max/projected ranges using a recent-weighted blend of form and season average, factoring opponent strength, home/away, weather, and snap % trend
- **Heatmap** — 32-team grid of fantasy points allowed or scored per position per week; three scope modes, Vegas spread/O/U overlay, location filter, and per-cell player drilldowns
- **Scoring Breakdowns** — Drill into any player or full team score to see a stat-by-stat fantasy point breakdown
- **Favorite Team Theming** — Pick your favorite NFL team to theme the app; accent color applies across nav, progress bar, and filter toggles
- **Export/Import** — Save predictions as JSON; import JSON to restore picks
- **Dark Mode** — Toggle between light and dark themes; persists across sessions
- **PWA / Installable** — Install to your home screen on iOS and Android; runs in standalone mode with asset caching
- **Responsive Design** — Two-panel layout on desktop (sidebar + content), tab bar on mobile

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+

### Development

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build

```bash
npm run build
```

Output is written to `dist/`.

## Docker Deployment

```bash
docker compose up -d --build
```

The app will be available on port 80 by default. To use a different port:

```bash
PORT=8080 docker compose up -d --build
```

Direct client routes are already configured for SPA-safe refreshes in both places that matter for `v6.2` routing:
- `nginx.conf` uses `try_files ... /index.html` for direct browser loads
- `vite-plugin-pwa` uses `navigateFallback: '/index.html'` for navigations inside the installed PWA

To validate that setup after a production build:

```bash
npm run validate:routing
```

## Tech Stack

| Layer | Technology |
|---|---|
| UI framework | React 19 |
| Build tool | Vite 7 |
| Styling | Tailwind CSS 3 + CSS custom properties |
| Bento grid | react-grid-layout |
| Image export | html2canvas |
| Fantasy data | Sleeper API (client-side) |
| Player data | ESPN public APIs (client-side) |
| PWA | vite-plugin-pwa + Workbox |
| Production serving | nginx (Docker) |

## What's New in v6.2.0

- **Real app routing shipped** - Predictions, Statistics, Companion, and Trade now use canonical URL-backed navigation with refresh-safe deep links across major views.
- **Companion filter URLs expanded** - Rankings, Matchup, Waiver, League, and Heatmap now preserve their major filter and drilldown state in the URL so links and refreshes stay context-aware.
- **Trade and Companion performance pass** - Heavy Trade and Companion views were split, cached, narrowed, and deferred so tab switches and analysis flows feel materially faster.

For the full version history, see [CHANGELOG.md](CHANGELOG.md).

## Roadmap

- **v6.3 - Trade + Companion Performance Patch** - Continued responsiveness, result-surface polish, and heavy-work deferral after the routing foundation shipped.
- **v6.4 - Statistics / Fantasy Drilldown Unification** - One canonical player-analysis destination with mode-aware drilldowns across Statistics and Companion.
- **v6.5 - League-Scoped Shareable Links** - Share URLs that resolve against the intended Sleeper league and validate league ownership before opening.
- **v7.0 — Draft Coach** — Rookie scouting hub with draft slot, college production, combine metrics, consensus ranking, and dynasty rookie ADP.
- **Week-by-Week View** *(blocked on 2026 schedule data)* — Browse the full schedule by week with predictions reflected

## Project Structure

```
src/
├── App.jsx                        # Main app shell — sidebar, tab bar, routing
├── components/
│   ├── Sidebar.jsx                # Desktop sidebar: brand, nav, progress, dark mode toggle
│   ├── NavBar.jsx                 # Mobile sticky top nav bar
│   ├── BottomTabBar.jsx           # Mobile bottom tab bar (Season / Companion)
│   ├── SeasonSubNav.jsx           # Season sub-view tabs (Predictions / Standings / Playoffs)
│   ├── CompanionSubNav.jsx        # Companion sub-view tabs
│   ├── ActionSheet.jsx            # iOS-style bottom sheet for overflow menu
│   ├── FavoriteTeamPicker.jsx     # Full-screen team color theme picker
│   ├── companion/
│   │   ├── CompanionConnect.jsx   # Sleeper connect + league selection flow
│   │   ├── CompanionRoster.jsx    # Roster view with season ranks and avg PPG
│   │   ├── CompanionMatchup.jsx   # Weekly matchup: head-to-head, projections, breakdowns
│   │   ├── CompanionDefense.jsx   # Heatmap: pts allowed/scored per team/week with drilldowns
│   │   ├── CompanionWaiver.jsx    # Waiver wire view
│   │   ├── CompanionScoring.jsx   # Scoring settings viewer (synced from league)
│   │   └── PlayerMatchupBreakdown.jsx  # Per-player stat → fantasy point breakdown modal
│   ├── PlayerBrowser.jsx          # Team/roster browser with position filter and search
│   ├── PlayerProfile.jsx          # Player profile page with hero card, stats, and game log
│   ├── PlayerStatTable.jsx        # Accordion stat table with standard/advanced toggle
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
│   └── SleeperContext.jsx         # Sleeper API state: user, league, rosters, stats, scoring
├── api/
│   ├── sleeperApi.js              # Sleeper API fetches: users, leagues, rosters, stats
│   └── weatherApi.js              # Open-Meteo archive weather for game-day conditions
├── data/
│   ├── teamColors.js              # Official color palettes for all 32 teams (light + dark)
│   ├── honors.json                # Static Pro Bowl / All-Pro records by player and season
│   └── stadiums.js                # All 32 NFL stadiums: indoor flag, coordinates, week dates
└── utils/
    ├── playerApi.js               # ESPN API fetches: roster, stats, game log, bio
    ├── playerCache.js             # localStorage cache with per-key TTLs
    ├── playerMetrics.js           # Stat row definitions, headline metrics, career highlights
    ├── projectionEngine.js        # PPG averages, positional ranks, opponent strength, projections
    ├── scoringEngine.js           # Fantasy point calculation and DEFAULT_SCORING config
    ├── scheduleParser.js          # Team/division queries, strength of schedule
    ├── validation.js              # Constraint checking and balance validation
    ├── exportImport.js            # JSON export/import
    ├── exportStats.js             # Highlight stat computations for the infographic
    └── layoutUtils.js             # Bento grid layout constants, sizing, and RGL helpers
```
