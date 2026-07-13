# GridShift

An interactive web app for the 2026 NFL season — with full Sleeper fantasy league integration. Pick game-by-game outcomes for all 32 teams, view projected standings, generate playoff seeding, create a shareable infographic, prep for your fantasy draft, and analyze your roster with week-by-week scoring breakdowns and projections — all in the browser.

![React](https://img.shields.io/badge/React-19-blue) ![Vite](https://img.shields.io/badge/Vite-7-purple) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-38bdf8) ![PWA](https://img.shields.io/badge/PWA-installable-green)

## Features

### Season Planning

- Predictions — Game picks, constraints, standings, playoff seeding, and shareable infographic export.
- Statistics — Schedules, standings, team/player profiles, game logs, honors, and scoring breakdowns.

### Fantasy Companion

- Sleeper integration — League connection, custom scoring, rosters, and season navigation.
- Matchups — Weekly starter comparisons with projections, ranks, weather, game context, and scoring details.
- League analysis — Player stats, fantasy points allowed, team defense, heatmaps, and roster/draft capital.
- Trade tools — Roster-and-pick proposals, guided upgrades, and searchable multi-season trade history.

### Draft & Scouting

- Draft Assistant (Beta) — War Room rankings, Draft Board, live timing, and consolidated Results.
- Scout (Beta) — 2026 prospects, filters, draft status, combine metrics, and comparisons.

### Sharing & App Experience

- Export/import — Save and restore predictions as JSON.
- Themes and display — Favorite-team theming, dark mode, responsive layouts, and installable PWA.

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
| `GRIDSHIFT_LIVE_FINAL_TTL_MS` | Server retention tail for finalized live games before hot cache cleanup. |
| `GRIDSHIFT_LIVE_ARCHIVE_ENABLED` | Enables normalized finalized-game play archives when live data supports them. |
| `GRIDSHIFT_LIVE_MAX_REQ_PER_MIN` | Local guardrail for provider request volume. |
| `GRIDSHIFT_COOKIE_SECURE` | Set `true` for HTTPS production cookies; use `false` only for local HTTP testing. |

Hosted owners can enable paid live scoring for selected Sleeper leagues by setting these variables on the server and keeping `GRIDSHIFT_LIVE_ALLOWED_LEAGUE_IDS` narrow. Self-hosters should supply their own BALLDONTLIE key and league allowlist. Variables prefixed with `VITE_` are public because Vite embeds them in the browser bundle, so paid keys and access codes must always use `GRIDSHIFT_` server variables.

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

## What's New in v8.2.0

- **Trade History** — Browse finalized trades from the selected league season and every linked season before it, with manager filters, search, expandable asset details, and player drilldowns.
- **Draft Picks and Results** — The Draft tab now shows Picks before the draft and automatically becomes Results after it starts, with clearer season-aware guidance.
- **Reliable upgrade tours** — Multi-version upgrades now omit superseded feature explanations and validate every effective step on desktop and mobile.
- **Trade workspace polish** — Improved partner selection, roster switching, value attribution, responsive controls, and shared styling across Trade surfaces.

For the full version history, see [CHANGELOG.md](CHANGELOG.md).

## Roadmap

- v8.3 - Live Fantasy Scoring & Team Tendencies — Sleeper-first live scoring, server-protected BALLDONTLIE support, win probability, team rankings/tables, fantasy context, and usage-based projections.
- Scout Rookie Projection Layer — Add next-season rookie projections for standard and IDP-focused draft prep.
- Trade follow-through — Continue polishing Trade drilldowns, explanation copy, and proposal-card readability.

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
