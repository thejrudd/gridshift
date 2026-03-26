# Architecture Map

Back: [[Home]]

## Top-Level Runtime Shape

- `src/main.jsx` bootstraps React, registers the service worker, and wraps the app with providers.
- `src/App.jsx` is the effective router and shell coordinator. There is no React Router.
- `src/index.css` defines the global design tokens and theme variables used by components.

## Main Entry Points

### `src/main.jsx`

- Registers the PWA service worker.
- Wraps the app with `ErrorBoundary`, `ThemeProvider`, and `PredictionProvider`.
- Renders `App`, which then adds `SleeperProvider`.

### `src/App.jsx`

- Owns the top-level UI state:
  - `activeTab`
  - `seasonView`
  - `companionView`
  - modal and sheet state
  - search/filter state
- Loads schedule data through `loadScheduleData()`.
- Coordinates desktop vs mobile shell pieces.
- Handles cross-feature navigation, such as jumping from Companion into Statistics or Trade.

## State Providers

### `src/context/PredictionContext.jsx`

- Stores season prediction state in localStorage.
- Syncs opposing game results across teams.
- Handles reset, import, and random prediction generation.

### `src/context/ThemeContext.jsx`

- Applies `.dark` to `<html>`.
- Persists dark mode and favorite team.
- Writes signature theme CSS variables to the root element.

### `src/context/SleeperContext.jsx`

- Owns Sleeper auth and league selection state.
- Persists selected Sleeper state in localStorage.
- Loads league rosters, league users, player database, weekly stats, and aggregate season stats.
- Re-derives scoring settings from the selected league.
- Performs player/team/opponent enrichment for weekly stat rows.

## Main Folders

### `src/components`

- App shell, views, modals, and feature UI.

### `src/components/companion`

- Fantasy league tools built on top of Sleeper state and scoring logic.

### `src/components/compare`

- Side-by-side player comparison across ESPN stats, fantasy output, and trade value.

### `src/utils`

- Most domain logic lives here: scoring, projections, trade math, export shaping, search parsing.

### `src/api`

- Thin wrappers for external data sources.

### `src/data`

- Static datasets such as team colors, honors, stadiums, and team history.

## Build And Runtime Config

- `package.json` defines the available npm scripts.
- `vite.config.js` wires the React plugin, PWA behavior, `__APP_VERSION__`, and the KTC proxy.
- `docker-compose.yml` and the Dockerfiles cover deployment.
