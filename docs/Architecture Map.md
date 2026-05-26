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
- Renders `App`, which then adds `FantasyProvider`.

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

- Owns the fantasy platform layer and still exports the temporary `useSleeper*` compatibility hooks.
- `FantasyProvider`, `useFantasyLeague`, `useFantasyStats`, and `useFantasy` are the platform-neutral entry points.
- Supports mutually exclusive Sleeper and ESPN league sessions. Switching platforms clears the active platform state.
- Persists normalized, non-secret fantasy state in localStorage. ESPN `SWID` and `espn_s2` never enter localStorage.
- Loads league rosters, league users, player database, weekly stats, aggregate season stats, matchups, and scoring settings through the active provider.
- Re-derives scoring settings from the selected league on startup, so newly supported scoring fields are picked up without requiring the user to re-select their league.
- Performs Sleeper player/team/opponent enrichment for weekly stat rows via a three-pass algorithm. ESPN data arrives pre-normalized through `src/utils/espnFantasyAdapter.js`.

#### ESPN Fantasy Integration

- `src/api/espnFantasyApi.js` calls the local `/api/espn/*` sidecar endpoints with browser credentials.
- `src/components/companion/CompanionConnect.jsx` presents ESPN as a pasted-link import first. Users paste an ESPN team/league URL such as `/football/team?leagueId=...&teamId=...&seasonId=...` or a league ID; GridShift parses league, team, and season hints, then imports public leagues directly. Private leagues reveal secure manual session import only when ESPN rejects public access, with a desktop Chrome helper link for extracting `SWID` and `espn_s2`.
- `src/utils/espnFantasyAdapter.js` normalizes ESPN Fantasy v3 league payloads into the same UI contract used by Sleeper: users, leagues, rosters, players, stats, matchups, and scoring.
- ESPN scoring uses `ScoringProfile` support in `src/utils/scoringEngine.js`: flat settings remain readable, while `positionOverrides` preserve ESPN position-specific rules.
- ESPN actual fantasy results keep `appliedTotal` / `appliedStats` as source-of-truth points; raw stat ID mapping is the fallback calculation layer.
- ESPN Trade is player-only in v8.0. Draft picks return empty provider data and pick UI is hidden.
- The PWA cannot read cookies or post-sign-in URLs from ESPN's domain, even when the same browser profile is already signed in. Private ESPN leagues require secure manual session import; mobile private-league setup is a known compromise until ESPN/Disney provides an official redirect-based authorization flow for GridShift.

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
- Trade opportunity logic keeps `src/utils/opportunityEngine.js` as the public facade, with implementation modules under `src/utils/opportunity/`.

### `src/api`

- Thin wrappers for external data sources.
- `sleeperApi.js` calls Sleeper directly from the browser.
- `espnFantasyApi.js` calls the local sidecar so ESPN Fantasy cookies remain HttpOnly and encrypted.

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
