# NFL Season Predictor

An interactive web app for predicting the 2026 NFL season — with full Sleeper fantasy league integration. Pick game-by-game outcomes for all 32 teams, view projected standings, generate playoff seeding, create a shareable infographic, and analyze your fantasy roster with week-by-week scoring breakdowns and projections — all in the browser.

![React](https://img.shields.io/badge/React-19-blue) ![Vite](https://img.shields.io/badge/Vite-7-purple) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-38bdf8) ![PWA](https://img.shields.io/badge/PWA-installable-green)

## Features

- **Game-by-Game Predictions** — Pick W/L/T for all 272 regular season games with automatic opponent syncing; picks stay in sync league-wide
- **Real-Time Validation** — Enforces league-wide balance (272 total wins), division constraints, and pairwise game limits
- **Division Standings** — Auto-generated standings sorted by wins, division record, and strength of schedule
- **Playoff Seeding** — AFC and NFC brackets with division winners and wild card spots
- **Shareable Infographic** — Build a custom bento-grid graphic with up to 11 insight sections (Best & Worst Records, Playoff Seeds, Division Winners, Conference Showdown, Toughest Division, Bold Predictions, Worst Division, Strength of Schedule, Closest Division Race, Wild Card Teams, Parity Index). Drag and resize sections, add your name/handle, and export as an image.
- **Team Search & Filter** — Search teams by name or abbreviation and filter by conference (AFC/NFC) from the predictions view
- **Player Browser** — Browse all 32 rosters by conference, division, and position; search players by name across the league
- **Player Profiles** — Full profile pages with headshot, career stats, game log, and Pro Bowl / All-Pro honors
- **Favorite Team Theming** — Pick your favorite NFL team to theme the app; accent color applies to nav indicators, progress bar, and filter toggles
- **Export/Import** — Save predictions as JSON; import JSON to restore picks
- **Sleeper League Integration** — Connect your Sleeper account, import a league, and analyze your fantasy roster with custom scoring settings synced from your league
- **Fantasy Matchup View** — Head-to-head starter comparison with week-by-week points, projections, positional rankings (week and season), weather context, and game location
- **Defense Matrix** — 32-team heatmap of fantasy points allowed (or scored) per position per week; clickable cells drill into per-player stat breakdowns
- **Scoring Breakdowns** — Drill into any player or your full team score to see a stat-by-stat fantasy point breakdown (e.g. Rush Yards · 112 · +11.2 pts)
- **Player Projections** — Min/max/projected point ranges factoring opponent strength, home/away, weather, snap % trend, and scoring format
- **Dark Mode** — Toggle between light and dark themes; persists across sessions
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

```bash
docker compose up -d --build
```

The app will be available on port 80 by default. To use a different port:

```bash
PORT=8080 docker compose up -d --build
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

## What's New in v4.3.3

- **Defense tab — full-bleed layout** — Table now runs edge-to-edge on all screen sizes, taking full advantage of available width
- **Defense tab — unified filter bar** — View, Position, Stat, Color, and Team Colors controls are now labeled and arranged in a single horizontal row on wide screens, wrapping naturally on mobile

## What's New in v4.3.2

- **Projection footnotes** — Matchup and Snap use factors now have plain-English explanations in the projection math drilldown, alongside the existing Floor/Ceiling footnote

## What's New in v4.3.1

- **Defense drilldown scroll lock** — Background page no longer scrolls while the drilldown panel is open
- **Season progress bar** — "Season X/32" progress bar in the sidebar is now hidden when not on the Predictions tab
- **PWA cache bust** — `package.json` version bumped to force service worker refresh so users receive the latest build automatically

## What's New in v4.3

### Defense Matrix — Enhancements
- **Team Colors & Logos** — Each team row in the grid is tinted with its official primary color and shows its ESPN logo for faster visual scanning
- **Opponent Labels** — Each cell shows the opponent abbreviation in small text below the value
- **Game Score Mode** — New "Game Score" stat filter in Allowed view shows the actual NFL score for each game (pulled from ESPN schedule data)
- **Scored View Stat Filters** — Defense Scored view now has 8 stat filters: Fantasy Pts, Sacks, INT, Forced Fumbles, TFL, Passes Defended, QB Hits, Defensive TDs
- **View Labels** — "Offense Allowed" → "Allowed", "Defense Scored" → "Scored"
- **Team Color Heatmap Toggle** — Optional toggle (when a favorite team is set) to use team colors instead of the default red–green heatmap palette
- **Conference/Division Labels** — Team cells show a conference or division sub-label when sorting by those modes
- **Drilldown Redesign** — Compact one-line player rows (name · pos · value); header shows "Week N — Away @ Home" with team logos; player names link directly to their Statistics profile page
- **Bug Fixes** — Average calculation now divides by games played (not weeks with data); Conference sort no longer falls through to Division sort

### Matchup — Enhancements
- **5-Level Matchup Difficulty** — Replaced the 3-level ±10% threshold system with a percentile-based ranking across all 32 teams. Levels: Difficult / Challenging / Average / Favorable / Easy. Requires ≥ 3 games of data per team and ≥ 5 teams with data; does not apply to IDP/defensive players
- **Score Range Coloring** — Post-game final score is now color-coded by where it lands relative to the projected range: red (below range), orange (bottom 30%), white (middle 40%), light green (top 30%), green (above range). Replaces the +/- diff badge
- **Roster Slot Labels** — Center badge now shows the actual roster slot (FLEX, SF, IDP, FLX, DST, etc.) from the league's `roster_positions` instead of the player's raw position
- **Home/Away Fix** — Matchup screen was incorrectly showing all players as Away; fixed by preferring ESPN schedule data over Sleeper's unreliable `home` field
- **Season Picker** — Header now derives available seasons from `league.season` and `previous_league_id`; hidden entirely for first-year leagues. Removed the confusing "N players" stat count

### Other
- **Statistics Deep-Link Fix** — Clicking a player name in the Defense drilldown now correctly routes to their ESPN stats page (was using Sleeper player IDs instead of ESPN IDs)
- **Guide Updates** — Companion guide rewritten to accurately describe the projection formula, floor/ceiling calculation, and all Defense tab features

## What's New in v4.2

- **Defense Matrix** — New Companion tab showing all 32 teams' fantasy points allowed (Offense Allowed) or scored (Defense Scored) per position per week in a scrollable heat-mapped table
- **Heatmap** — Multi-stop red→orange→yellow→green color spectrum; three scope options (Overall, By Week, By Team) each with independent scales; AVG column has its own scale
- **Drilldown** — Tap any cell to see the per-player stat breakdown with signed point contributions for that matchup
- **Position & Stat Filters** — Offense mode: All/QB/RB/WR/TE/K + Fantasy Pts/Rec Yds/Rush Yds; Defense mode: All/DL/LB/DB
- **Column Sorting** — Click any column header to sort; Team column has A–Z, Conference, and Division sub-sorts
- **QB Opp Fix** — Fetches per-QB Sleeper stats to get game-time `opp` field (bulk stats endpoint never includes it), resolving under-counted defensive game totals for QBs who changed teams in the offseason
- **Beta Badge** — Companion tab marked Beta in sidebar and bottom tab bar

## What's New in v4.1

- **Matchup Difficulty Badge** — Easy / Avg / Hard badge per player based on defensive points allowed to that position vs league average (requires 3+ games of data)
- **Redesigned Matchup Player Card** — Cleaner three-line layout: name + team, scored / projected range, vs OPP + location + badge
- **Enhanced Player Drilldown** — Rankings (week rank, season rank, avg PPG) and Game Context sections above the stat breakdown
- **Snap % Projection Factor** — Recent snap usage (last 4 games) vs season average as a fourth projection multiplier
- **Companion Guide** — Full guide content for the Companion tab

## What's New in v4.0

- **Sleeper Integration** — Connect via Sleeper username, select a league, sync scoring settings
- **Companion Tab** — Fantasy tools: Connect, Roster, Matchup, Waiver, and Scoring views
- **Fantasy Matchup** — Side-by-side starter comparison with full scoring breakdowns
- **Positional Rankings** — Week and season rank per player in the matchup view
- **Projections** — Min/max/projected ranges factoring opponent strength, home/away, weather, and snap trend
- **Custom Scoring Engine** — PPR / Half-PPR / Standard with per-stat multipliers; imports from Sleeper league

## Roadmap

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
│   ├── CompanionSubNav.jsx        # Companion sub-view tabs
│   ├── ActionSheet.jsx            # iOS-style bottom sheet for overflow menu
│   ├── FavoriteTeamPicker.jsx     # Full-screen team color theme picker
│   ├── companion/
│   │   ├── CompanionConnect.jsx   # Sleeper connect + league selection flow
│   │   ├── CompanionRoster.jsx    # Roster view with season ranks and avg PPG
│   │   ├── CompanionMatchup.jsx   # Weekly matchup: head-to-head, projections, breakdowns
│   │   ├── CompanionDefense.jsx   # Defense matrix: heatmap of pts allowed/scored per team/week
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
