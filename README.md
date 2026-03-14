# NFL Season Predictor

An interactive web app for predicting the 2026 NFL season — with full Sleeper fantasy league integration. Pick game-by-game outcomes for all 32 teams, view projected standings, generate playoff seeding, create a shareable infographic, and analyze your fantasy roster with week-by-week scoring breakdowns and projections — all in the browser.

![React](https://img.shields.io/badge/React-19-blue) ![Vite](https://img.shields.io/badge/Vite-7-purple) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-38bdf8)

## Features

- **Game-by-Game Predictions** — Pick winners for all 272 regular season games with automatic opponent syncing
- **Real-Time Validation** — Enforces league-wide balance (272 total wins), division constraints, and pairwise limits
- **Division Standings** — Auto-generated standings sorted by wins, division record, and strength of schedule
- **Playoff Seeding** — AFC and NFC brackets with division winners and wild card spots
- **Shareable Infographic** — Create a custom bento-grid graphic with up to 11 insight sections (Best & Worst Records, Playoff Seeds, Division Winners, Conference Showdown, Toughest Division, Bold Predictions, Worst Division, Strength of Schedule, Closest Division Race, Wild Card Teams, Parity Index). Drag and resize sections to build your layout.
- **Team Search & Filter** — Search teams by name or abbreviation and filter by conference (AFC/NFC) from the predictions view; toggled via a search icon in the header controls with zero persistent screen cost
- **Player Browser** — Browse all 32 rosters by conference, division, and position; search players by name across the league
- **Player Profiles** — Full profile pages with headshot, career stats, game log, and Pro Bowl / All-Pro honors
- **Export/Import** — Save predictions as JSON; import JSON to restore picks
- **Sleeper League Integration** — Connect your Sleeper account, import a league, and analyze your fantasy roster with custom scoring settings synced from your league
- **Fantasy Matchup View** — Head-to-head starter comparison with week-by-week points, projections, positional rankings (week and season), weather context, and game location
- **Scoring Breakdowns** — Drill into any player or your full team score to see a stat-by-stat fantasy point breakdown (e.g. Rush Yards · 112 · +11.2 pts)
- **Player Projections** — Min/max/projected point ranges factoring opponent strength, home/away, weather, and scoring format
- **Dark Mode** — Toggle between light and dark themes
- **PWA / Installable** — Install to your home screen on iOS and Android; runs in standalone mode with asset caching
- **Responsive Design** — Two-panel layout on desktop (sidebar + content), tab bar on mobile
- **Client-Side Only** — All prediction data stored in localStorage; Sleeper data fetched live from the Sleeper API

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

### Build and run on the server

```bash
docker compose up -d --build
```

The app will be available on port 80 by default. To use a different port:

```bash
PORT=8080 docker compose up -d --build
```

## Tech Stack

- **React 19** — UI framework
- **Vite** — Build tool and dev server
- **Tailwind CSS** — Utility-first styling
- **react-grid-layout** — Drag-and-resize bento grid for the export infographic
- **nginx** — Production static file serving (Docker)

## What's New in v4.0

- **Sleeper Integration** — Connect via Sleeper username, select a league, and sync scoring settings with one tap. Supports 2023–2025 seasons.
- **Companion Tab** — Dedicated bottom-tab section for fantasy tools: Connect, Roster, Matchup, and Scoring views
- **Fantasy Matchup** — Side-by-side starter comparison for your weekly matchup. Tap either team's score to see a full scoring category breakdown (TDs, rush yards, receptions, etc.) aggregated across all starters. Tap any player to drill into their individual stat-by-stat breakdown for that week.
- **Positional Rankings** — Each matchup player shows their positional rank for both the selected week (e.g. RB3 week) and the full season (e.g. RB14 season)
- **Projections** — Min/max/projected scoring range per player factoring opponent strength, home/away, weather conditions (via Open-Meteo), and indoor/outdoor stadium
- **Custom Scoring Engine** — Full PPR / Half-PPR / Standard support with per-stat multipliers; imports directly from your Sleeper league's scoring settings
- **Week Selector** — Navigate any week 1–18; regular season and playoff weeks are visually distinguished

## What's New in v3.0

- **Broadcast Editorial Design** — New visual language: deep slate-charcoal dark mode, warm newsprint light mode, amber `#F5B700` signature accent, Barlow Condensed display font, Figtree body font
- **Desktop Sidebar** — Persistent 240px left sidebar on large screens with brand, nav, dark mode toggle, and league progress
- **Mobile Bottom Tab Bar** — Bottom tab navigation splitting Season and Companion (fantasy) sections
- **Two-Panel Layout** — Sidebar + full-width content on desktop; tab bar + scroll on mobile/tablet

## What's New in v2.3.1

- **iOS Auto-Zoom Fix** — All text inputs (player search, team filter bar, export username field) bumped to `font-size: 16px`; iOS Safari no longer zooms in when tapping a search field

## What's New in v2.3

- **Team Search** — Type a team name or abbreviation (e.g. "Patriots" or "buf") to instantly filter the predictions view to matching divisions
- **Conference Filter** — All / AFC / NFC chips in the filter bar let you narrow to one conference with a single tap
- **Space-Efficient Design** — The filter bar is hidden by default and slides in below the header via a search icon in the controls row; no persistent screen space used, no interaction with the collapsing header
- **Auto-Clears on Navigation** — Filter state resets whenever you switch to a different view

## What's New in v2.2

- **Collapsing Header** — On mobile, the app title, progress bar, and view tabs slide out of view when scrolling down, leaving only the essential controls visible; full header restores on scroll up
- **Navigation in Menu** — When the header is collapsed, the hamburger menu shows a "Navigate" section at the top for quick access to all four views
- **Desktop Unaffected** — Header always stays fully expanded on wider screens; collapse only activates below the Tailwind `sm` breakpoint (640px)
- **iOS Overscroll Fix** — Scroll position clamped to prevent the elastic rubber-band bounce at the bottom of the page from triggering spurious collapse/expand flicker

## What's New in v2.1

- **PWA Support** — Install the app to your home screen on iOS and Android; runs in standalone mode with no browser chrome
- **Asset Caching** — Static assets, team logos, and data file precached on install for faster repeat loads
- **ESPN API Caching** — Roster, stats, and game log requests cached at the service worker level (network-first with offline fallback)
- **Install Button** — "Install App" button appears in the header on supported browsers (Chrome, Edge)

## What's New in v2.0

- **Player Browser** — Browse all 32 rosters by conference, division, and position filter; search players by name across the league
- **Depth Chart Ordering** — When filtering by position, players are sorted by their ESPN depth chart rank (RB1, RB2, etc.)
- **Player Profiles** — Full player profile pages with headshot, career highlight pods, and per-season stat accordions
- **Season Stats** — Grouped stat sections (Passing, Rushing, Negative Plays, etc.) with standard and advanced stat toggles
- **Game Log** — Per-game stat table with an advanced stats toggle, for every season on record
- **Awards & Honors** — Pro Bowl, All-Pro, and major award badges displayed on each season's accordion header
- **Career Totals** — Lifetime stat pods shown in the player hero card, color-coded by stat type

## Roadmap

**v3.1** — Historical comparison (predicted records vs. each team's actual past results)
**v4.5** — Week-by-week schedule view *(blocked on 2026 season schedule data)*

## Project Structure

```
src/
├── App.jsx                        # Main app shell — sidebar, tab bar, routing
├── components/
│   ├── Sidebar.jsx                # Desktop sidebar: brand, nav, progress, dark mode toggle
│   ├── NavBar.jsx                 # Mobile sticky top nav bar
│   ├── BottomTabBar.jsx           # Mobile bottom tab bar (Season / Companion)
│   ├── SeasonSubNav.jsx           # Season sub-view tabs (Predictions / Standings / Playoffs)
│   ├── ActionSheet.jsx            # iOS-style bottom sheet for overflow menu
│   ├── companion/
│   │   ├── CompanionConnect.jsx   # Sleeper connect + league selection flow
│   │   ├── CompanionRoster.jsx    # Roster view with season ranks and avg PPG
│   │   ├── CompanionMatchup.jsx   # Weekly matchup: head-to-head, projections, breakdowns
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
│   ├── ThemeContext.jsx           # Dark mode state
│   └── SleeperContext.jsx         # Sleeper API state: user, league, rosters, stats, scoring
├── api/
│   ├── sleeperApi.js              # Sleeper API fetches: users, leagues, rosters, stats
│   └── weatherApi.js              # Open-Meteo archive weather for game-day conditions
├── data/
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
