# Architecture Map

Back: [[Home]]

## Top-Level Runtime Shape

- `src/main.jsx` bootstraps React, registers the service worker, and wraps the app with providers.
- `src/App.jsx` is the effective router and shell coordinator. There is no React Router.
- `src/index.css` defines the global design tokens and theme variables used by components.

## Main Entry Points

### `src/main.jsx`

- Registers the PWA service worker.
- Applies the persisted display-size attribute before React mounts, preventing a post-render typography/layout shift.
- Wraps the app with `ErrorBoundary`, `ThemeProvider`, and `PredictionProvider`.
- Renders `App`, which then adds `FantasyProvider`.

### `src/App.jsx`

- Owns the top-level UI state:
  - `activeTab`
  - `seasonView`
  - `companionView`
  - `leagueView`
  - modal and sheet state
  - search/filter state
- Loads schedule data through `loadScheduleData()`.
- Coordinates desktop vs mobile shell pieces.
- Handles cross-feature navigation, such as jumping from Fantasy into Statistics or Trade.

## State Providers

### `src/context/PredictionContext.jsx`

- Stores season prediction state in localStorage.
- Syncs opposing game results across teams.
- Handles reset, import, and random prediction generation.

### `src/context/ThemeContext.jsx`

- Applies `.dark` to `<html>`.
- Persists dark mode and favorite team.
- Writes signature theme CSS variables to the root element.
- Owns the `compact` / `comfortable` / `large` display preference and writes `data-display-size` to `<html>`.

### Responsive Display Layer

- `src/utils/displayPreferences.js` normalizes, reads, persists, and applies the display-size contract.
- `src/components/DisplaySettingsModal.jsx` is the shared centered chooser opened from desktop sidebar and mobile options.
- `src/index.css` owns semantic typography, density/control tokens, and the readable/data/workbench page-frame tiers. Browser zoom remains native and is never replaced with app-level DPI detection or whole-page transforms.

### `src/context/SleeperContext.jsx`

- Owns the Sleeper fantasy platform layer and still exports the temporary `useSleeper*` compatibility hooks.
- `FantasyProvider`, `useFantasyLeague`, `useFantasyStats`, and `useFantasy` are the platform-neutral entry points.
- Sleeper is the only supported user-facing fantasy connection.
- Persists normalized, non-secret fantasy state in localStorage.
- Loads league rosters, league users, player database, weekly stats, aggregate season stats, matchups, and scoring settings through the active provider.
- Re-derives scoring settings from the selected league on startup, so newly supported scoring fields are picked up without requiring the user to re-select their league.
- Performs Sleeper player/team/opponent enrichment for weekly stat rows via a three-pass algorithm. ESPN data arrives pre-normalized through `src/utils/espnFantasyAdapter.js`.

#### Legacy ESPN Fantasy Compatibility

ESPN Fantasy connections are deprecated and are not offered in the GridShift interface. The adapter, sidecar, and defensive rendering branches remain only as legacy compatibility code and test infrastructure; do not surface an ESPN connection path or expand its feature coverage.

- `src/api/espnFantasyApi.js`, `src/utils/espnFantasyAdapter.js`, and the `/api/espn/*` sidecar are legacy compatibility modules.
- `ScoringProfile.positionOverrides`, `appliedTotal`, and `appliedStats` remain readable so old persisted fixtures and sessions fail safely.
- New Fantasy and League work should target Sleeper contracts only while preserving harmless legacy guards.

#### Stats Enhancement — Three-Pass Algorithm

**Root problem:** Sleeper's bulk stats endpoint has no team or opponent metadata. `player.team` (current roster) is wrong for any traded or signed player mid-season.

**Solution:** After bulk weekly stats, the players DB, and scheduleMap are all loaded, each player's weekly stat entries are enriched with confirmed game-time team and opponent using three passes:

| Pass | Source | Method |
|---|---|---|
| 1 | ESPN eventlog | Players with a valid `espn_id` in Sleeper's DB |
| 2 | ESPN roster name-match | Players with `espn_id: null` — matched by name, then same eventlog pipeline |
| 3 | Schedule verification | Remaining unresolved players — `player.team` confirmed against `scheduleMap` for that week |

Entries resolved via Pass 1 or 2 are marked `_teamSource = 'espn'`. Pass 3 entries are marked `_teamSource = 'schedule'`. Unmarked entries fall back to `player.team`. Covers all offensive (QB, RB, WR, TE, K) and IDP (DL, LB, DB, etc.) positions.

## Main Folders

### `src/components`

- App shell, views, modals, and feature UI.

### `src/components/companion`

- Fantasy league tools built on top of Sleeper state and scoring logic.
- `CompanionStandings.jsx`, `CompanionHistory.jsx`, and `CompanionActivity.jsx` power the top-level League routes. Their page-level loading, unavailable, error, and empty reasons stay centered and unframed.
- Trade keeps `CompanionTrade.jsx` as the public route component, with extracted Agent/Intelligence/Upgrade leaf modules in `src/components/companion/trade/`.
- Shared player/asset selector rendering lives here too: `CompanionPlayerRow.jsx`, `CompanionAssetRow.jsx`, and `CompanionSelectorControls.jsx` are the canonical row/control primitives for Companion and Trade-adjacent picker surfaces. See [[Companion Shared Rows]] before changing player-row styling, team logos, status badges, or selector controls.

### `src/components/compare`

- Side-by-side player comparison across ESPN stats, fantasy output, and trade value.

### `src/components/scout`

- Rookie scouting UI for Prospects, Picks, and Results.
- Reads static/generated Scout datasets from `src/data`.
- Uses local-only import scripts for CFBD production and game-log data.

### `src/utils`

- Most domain logic lives here: scoring, projections, trade math, export shaping, search parsing.
- `leagueHistory.js` is the shared Sleeper league-lineage data layer. It loads and caches season rosters, users, matchups, transactions, and real bracket payloads, then exposes normalized participants, finalized standings with named divisions and recent form, score-backed brackets, Toilet Bowl versus consolation progression, activity entries, history aggregates, record leaders, and Draft Blueprint summaries with named early-round picks. Stable participant identity uses Sleeper user ID with a season-roster fallback.
- Trade opportunity logic keeps `src/utils/opportunityEngine.js` as the public facade, with implementation modules under `src/utils/opportunity/`.

### `src/api`

- Thin wrappers for external data sources.
- `sleeperApi.js` calls Sleeper directly from the browser.
- `espnFantasyApi.js` is retained only for deprecated compatibility and is not exposed by the connection UI.

### `server`

- Express sidecar API for ESPN Fantasy.
- `server/sessionCrypto.js` validates ESPN session values and encrypts them into the `gridshift_espn_session` HttpOnly cookie.
- `server/espnHandlers.js` exposes `/api/espn/session`, `/api/espn/leagues`, and `/api/espn/league/:season/:leagueId`.
- The handler shape is intentionally serverless-ready: route logic is separated from `server/index.js`.

### `src/data`

- Static datasets such as team colors, honors, stadiums, and team history.
- Scout datasets include `rookies.js`, `draftPicks.js`, `draftResults.js`, `rookieProduction.generated.js`, and `rookieGameLogs.generated.js`.

### `scripts`

- Scout importers such as `import-scout-production.mjs` and `import-scout-game-logs.mjs` call CFBD locally with `CFBD_API_KEY` and write generated data files. API keys must not enter the client bundle.

## Build And Runtime Config

- `package.json` defines the available npm scripts.
- `vite.config.js` wires the React plugin, PWA behavior, `__APP_VERSION__`, the KTC proxy, and the local ESPN sidecar proxy.
- `nginx.conf` proxies `/api/espn/` to the sidecar and marks authenticated responses `no-store`.
- `docker-compose.yml`, `Dockerfile`, `Dockerfile.prebuilt`, and `Dockerfile.server` cover deployment.
