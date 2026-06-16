# GridShift

An interactive web app for the 2026 NFL season — with full Sleeper fantasy league integration. Pick game-by-game outcomes for all 32 teams, view projected standings, generate playoff seeding, create a shareable infographic, prep for your fantasy draft, and analyze your roster with week-by-week scoring breakdowns and projections — all in the browser.

![React](https://img.shields.io/badge/React-19-blue) ![Vite](https://img.shields.io/badge/Vite-7-purple) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-38bdf8) ![PWA](https://img.shields.io/badge/PWA-installable-green)

## Features

- **Game-by-Game Predictions** — Predict records or drill into each team's full schedule with automatic opponent syncing; picks stay in sync league-wide
- **Prediction Constraints** — Keeps win/loss/tie totals, division records, and synced opponent picks within possible NFL bounds
- **Division Standings** — Auto-generated standings sorted by wins, division record, and strength of schedule
- **Playoff Seeding** — AFC and NFC brackets with division winners and wild card spots
- **Shareable Infographic** — Build a custom bento-grid graphic with up to 11 insight sections. Drag and resize sections, add your name/handle, and export as an image
- **Team Search & Filters** — Search teams, players, and schedule views across the Statistics and Companion surfaces
- **Player Browser** — Browse all 32 rosters by conference, division, and position; search players by name across the league
- **Player Profiles** — Full profile pages with headshot, career stats, game log, and Pro Bowl / All-Pro honors
- **Statistics Schedule** — Browse the NFL schedule by week or team with international, PrimeTime, and holiday filters
- **Statistics Standings** — View division and conference standings from final schedule results inside the Statistics section
- **Sleeper League Integration** — Connect your Sleeper account, import a league, and sync custom scoring settings
- **Draft Assistant (Beta)** — Use a top-level Sleeper draft room with War Room rankings, a saved Draft Board, live status timing, and consolidated pick Results
- **League Browser** — Browse any league member's full roster with stats and weekly breakdowns; view a league-wide draft capital grid showing pick ownership by round and year
- **Fantasy Matchup View** — Head-to-head starter comparison with week-by-week points, projections, positional rankings, weather context, and game location
- **Player Projections** — Min/max/projected ranges using a recent-weighted blend of form and season average, factoring opponent strength, home/away, weather, and snap % trend
- **Heatmap** — 32-team grid of fantasy points allowed or scored per position per week; three scope modes, Vegas spread/O/U overlay, location filter, and per-cell player drilldowns
- **Trade Agent & Upgrades** — Build trades with roster shelves, draft picks, value context, drag-and-drop actions, and guided upgrade suggestions
- **Scout (Beta)** — Rookie scouting hub with 2026 prospects, all-position filters, draft-status handling, combine metrics, and side-by-side prospect comparison
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

## Live Scoring Configuration

GridShift's public client can stay open source while paid live-data access remains server-only. Real secrets belong in the deployment environment or a local `.env` file copied from `.env.example`; never commit `.env` or paste paid API keys into client code.

Server-only variables:

| Variable | Purpose |
|---|---|
| `GRIDSHIFT_SESSION_SECRET` | Signs/encrypts server-managed session values in production. |
| `GRIDSHIFT_BDL_API_KEY` | BALLDONTLIE API key for server-side NFL live data. Never prefix this with `VITE_`. |
| `GRIDSHIFT_BDL_TIER` | BALLDONTLIE plan tier, such as `goat` or `all-star`, used for capability checks. |
| `GRIDSHIFT_LIVE_ALLOWED_LEAGUE_IDS` | Comma-separated Sleeper league IDs allowed to use paid live scoring on this instance. |
| `GRIDSHIFT_LIVE_ACCESS_CODE` | Optional shared league code required before an allowlisted league member can use paid live mode. |
| `GRIDSHIFT_LIVE_COOKIE_SECRET` | Optional live-scoring cookie secret; falls back to `GRIDSHIFT_SESSION_SECRET` when blank. |
| `GRIDSHIFT_LIVE_CACHE_TTL_MS` | Server cache duration for upstream live-data responses. |
| `GRIDSHIFT_LIVE_MAX_REQ_PER_MIN` | Local guardrail for provider request volume. |
| `GRIDSHIFT_COOKIE_SECURE` | Set `true` for HTTPS production cookies; use `false` only for local HTTP testing. |

Hosted owners can enable paid live scoring for selected leagues by setting these variables on the server and keeping `GRIDSHIFT_LIVE_ALLOWED_LEAGUE_IDS` narrow. Self-hosters should supply their own BALLDONTLIE key and league allowlist. Variables prefixed with `VITE_` are public because Vite embeds them in the browser bundle, so paid keys and access codes must always use `GRIDSHIFT_` server variables.

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
| Live data | Optional BALLDONTLIE NFL API via server-side GridShift API |
| PWA | vite-plugin-pwa + Workbox |
| Production serving | nginx (Docker) + optional Node API sidecar |

## What's New in v8.0.1

- **Sleeper-only sign-in** - Removed the ESPN provider option from the initial sign-in screen and Switch League flow.
- **Connection flow clarity** - New users now land directly on the supported Sleeper account lookup without an unavailable ESPN sign-in path.
- **ESPN work deferred** - Known ESPN league integration issues are tracked as deferred while this release line stays focused on Sleeper support.
- **PWA cache refresh** - Bumped the app version so installed clients receive the updated connection screen.

For the full version history, see [CHANGELOG.md](CHANGELOG.md).

## Roadmap

- **v8.1 - Draft Rank Calibration** - Add a transparent scoring-adjusted GridShift Rank for Draft.
- **v8.2 - ESPN League Integration** - ESPN league import and read-only Companion/Statistics parity after Draft rank calibration.
- **v8.3 - ESPN Trade Suite** - ESPN-aware Trade support after ESPN Companion and Statistics parity.
- **v9.0 - Live Fantasy Scoring** - Sleeper-first live matchup experience with server-protected BALLDONTLIE support for allowlisted leagues.
- **Scout Rookie Projection Layer** - Add next-season rookie projections that work for standard and IDP-focused draft prep without overloading the current Scout board.
- **Trade follow-through** - Continue polishing Trade drilldowns, remaining explanation copy, and proposal-card readability after the v7.3 module split.

## Project Structure

```
src/
├── App.jsx                        # Main app shell — sidebar, tab bar, routing
├── components/
│   ├── Sidebar.jsx                # Desktop sidebar: brand, nav, progress, dark mode toggle
│   ├── NavBar.jsx                 # Mobile sticky top nav bar
│   ├── BottomTabBar.jsx           # Mobile bottom tab bar (Season / Companion)
│   ├── SeasonSubNav.jsx           # Season sub-view tabs (Predictions / Standings / Playoffs)
│   ├── StatisticsSubNav.jsx       # Statistics sub-view tabs (Stats / Schedule / Standings)
│   ├── CompanionSubNav.jsx        # Companion sub-view tabs
│   ├── ActionSheet.jsx            # iOS-style bottom sheet for overflow menu
│   ├── FavoriteTeamPicker.jsx     # Full-screen team color theme picker
│   ├── companion/
│   │   ├── CompanionConnect.jsx   # Sleeper connect + league selection flow
│   │   ├── CompanionRoster.jsx    # Roster view with season ranks and avg PPG
│   │   ├── CompanionMatchup.jsx   # Weekly matchup: head-to-head, projections, breakdowns
│   │   ├── CompanionHeatmap.jsx   # Heatmap: pts allowed/scored per team/week with drilldowns
│   │   ├── CompanionDefense.jsx   # Defense rankings by stats/fantasy points allowed
│   │   ├── CompanionWaiver.jsx    # Waiver wire view
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
    ├── statisticsStandings.js     # Schedule-result standings model
    ├── validation.js              # Constraint checking and balance validation
    ├── exportImport.js            # JSON export/import
    ├── exportStats.js             # Highlight stat computations for the infographic
    └── layoutUtils.js             # Bento grid layout constants, sizing, and RGL helpers
```
