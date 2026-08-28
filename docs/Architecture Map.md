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

- Stores season-scoped prediction state in localStorage.
- Syncs opposing game results across teams.
- Handles reset, import, and random prediction generation.
- Persists playoff selections and a restorable backup when a recipient explicitly applies a shared prediction snapshot.
- See [[Prediction Share Cards]] for the snapshot, portable-link, recipient, and export contracts.

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
- Loads league rosters, league users, player database, weekly stats, aggregate season stats, matchups, and scoring settings through Sleeper.
- Re-derives scoring settings from the selected league on startup, so newly supported scoring fields are picked up without requiring the user to re-select their league.
- Performs Sleeper player/team/opponent enrichment for weekly stat rows via a three-pass algorithm.

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
- Prediction share-card rendering lives under `src/components/predictions/share/`; `ExportPreview.jsx` is the responsive studio around its fixed 1080px canvases.

### `src/components/companion`

- Fantasy league tools built on top of Sleeper state and scoring logic.
- `CompanionStandings.jsx`, `CompanionHistory.jsx`, and `CompanionActivity.jsx` power the top-level League routes. Their page-level loading, unavailable, error, and empty reasons stay centered and unframed.
- Trade keeps `CompanionTrade.jsx` as the public route component, with extracted Agent/Intelligence/Upgrade leaf modules in `src/components/companion/trade/`.
- Fantasy Live (`CompanionLive.jsx`) owns the live-scoring route's data plumbing — session, snapshots, projections, win probability, persisted replay selection, and play feed — and composes the presentation from `src/components/companion/live/`: `LiveHero.jsx` (split team-gradient hero with crossfading top-three scorer lists and one-to-three container-responsive portraits per side), `LiveVerdict.jsx`, `LivePerformerRail.jsx` (the player selector above the shared analysis slot), `LivePaceChart.jsx` (the default analysis view; scoring vs projected pace, draggable and selectable to rewind), `LivePlayerSheet.jsx` (the selected-player analysis view that replaces the chart), `LiveFeed.jsx` (independently scrolling desktop feed, side filter, and play rows with inline scoring math), and the `LiveAtoms.jsx` / `liveVisuals.js` pair for imagery and the play-glyph vocabulary. Its styles are the `.fl-*` block in `src/index.css`.
- Shared player/asset selector rendering lives here too: `CompanionPlayerRow.jsx`, `CompanionAssetRow.jsx`, and `CompanionSelectorControls.jsx` are the canonical row/control primitives for Companion and Trade-adjacent picker surfaces. See [[Companion Shared Rows]] before changing player-row styling, team logos, status badges, or selector controls.

### `src/components/compare`

- Side-by-side player comparison across ESPN stats, fantasy output, and trade value.

### `src/components/scout`

- Rookie scouting UI for Prospects, Picks, and Results.
- Reads static/generated Scout datasets from `src/data`.
- Uses local-only import scripts for CFBD production and game-log data.

### `src/utils`

- Most domain logic lives here: scoring, projections, trade math, export shaping, search parsing.
- `predictionSnapshot.js`, `predictionShareCodec.js`, `predictionShareModel.js`, `predictionPlayoffSeeding.js`, and `playoffBracket.js` own validated prediction snapshots, database-free share fragments, card-ready projections, canonical record-to-seed ordering, and NFL reseeding. See [[Prediction Share Cards]].
- `leagueHistory.js` is the shared Sleeper league-lineage data layer. It loads and caches season rosters, users, matchups, transactions, and real bracket payloads, then exposes normalized participants, finalized standings with named divisions and recent form, score-backed brackets, Toilet Bowl versus consolation progression, activity entries, history aggregates, record leaders, and Draft Blueprint summaries with named early-round picks. Stable participant identity uses Sleeper user ID with a season-roster fallback.
- Trade opportunity logic keeps `src/utils/opportunityEngine.js` as the public facade, with implementation modules under `src/utils/opportunity/`.
- Live scoring splits into `liveScoringFeed.js` (stat lines, explicit starter game states, complete-schedule bye proof, and authoritative Sleeper final-score checks), `livePlaysFeed.js` (play-by-play matching and per-play stat deltas), `liveWinProbability.js` (player-level outlooks, calibrated odds, explanations, and persisted replay snapshots), `livePace.js` (pace curves, verdict copy, featured starters, and performer ordering), and `fantasyTeamIdentity.js` (per-roster identity colours). `resolveStarterProjection()` in `liveWinProbability.js` is the single projection source shared by pace and odds, while `src/data/liveWinProbabilityModel.js` is the frozen production coefficient contract. Exact 0%/100% is allowed only after every starter is officially final or on a confirmed bye and a fresh, cache-bypassed Sleeper matchup response supplies both totals plus every starter's official points.

### `src/api`

- Thin wrappers for external data sources.
- `sleeperApi.js` calls Sleeper directly from the browser.
- `liveApi.js` and `statisticsScoresApi.js` call the GridShift sidecar; they never send a BALLDONTLIE credential from the browser.

### `server`

- `index.js` creates one process-wide BALLDONTLIE gateway and one canonical live-game snapshot store, then injects both into the live-data route groups.
- `balldontlieGateway.js` owns the server credential, capability profile, canonical bounded cache, in-flight coalescing, cursor pagination, stale/backoff policy, page-aware quota, and protected live-score allocation.
- `liveGameSnapshots.js` owns the canonical per-game play snapshot and newest-play selection shared by Statistics scorecards, Statistics drilldowns, and Fantasy Live.
- `publicRequestGuard.js` provides bounded downstream request and concurrency protection for the public near-live Scores route; it is separate from provider quota accounting.
- `liveHandlers.js` owns the Fantasy Live session/league boundary and routes all provider work through the shared gateway.
- `statisticsScoresHandlers.js` owns the public Statistics Scores provider boundary, narrow selected-week live route, detail composition, and ESPN fallback; it projects canonical play snapshots rather than creating a Scores-only play source.
- `src/utils/nflPlays/` and `src/components/nflPlays/` are the shared, surface-agnostic play-by-play layer: narrative parsing, player name indexing, ESPN participant/headshot resolution, field geometry, and the field/momentum graphics. The field visuals (`fieldPrimitives.jsx`, `PlayTrajectoryStrip.jsx`, `DriveField.jsx`, `DrivePlayback.jsx`) share one 120-yard canvas through `fieldX`, and all kick geometry goes through `getKickGeometry`; a new field visual must reuse both rather than derive its own coordinates. `playBeats.js` is the time layer over that geometry: it turns one play into the ball's position over time plus the beats that fire as it travels, composing `getPlayTrajectory()` and `parsePlayNarrative()` without duplicating either. `DrivePlayback.jsx` is its only consumer and draws nothing the other field visuals don't already define. Statistics Scores consumes it today and `livePlaysFeed.js` already routes its name index through `nflPlays/playerNameIndex.js`; the rest of the Fantasy Live migration is still outstanding. New play-parsing work belongs here rather than under a feature folder. `src/components/shared/PlayerAvatar.jsx` owns the headshot fallback chain for both surfaces and is re-exported as `LiveAvatar` for existing Fantasy Live call sites.
- Gateway state is process-local. Running multiple sidecar replicas would still multiply upstream work until the shared-store/leader phase in [[Live Data Server Architecture]].

### `src/data`

- Static datasets such as team colors, honors, stadiums, and team history.
- Scout datasets include `rookies.js`, `draftPicks.js`, `draftResults.js`, `rookieProduction.generated.js`, and `rookieGameLogs.generated.js`.

### `scripts`

- Scout importers such as `import-scout-production.mjs` and `import-scout-game-logs.mjs` call CFBD locally with `CFBD_API_KEY` and write generated data files. API keys must not enter the client bundle.

## Build And Runtime Config

- `package.json` defines the available npm scripts.
- `vite.config.js` wires the React plugin, PWA behavior, `__APP_VERSION__`, the KTC proxy, and local `/api/espn`, `/api/live`, and `/api/statistics/scores` sidecar proxies.
- `nginx.conf` proxies production `/api/live/`, `/api/statistics/scores/`, `/api/fantasy/`, `/api/draft-sync/`, and `/api/predictions-sync/` traffic to the sidecar. Device-sync routes forward bearer and conditional-revision headers; all server-only provider routes are marked `no-store`.
- `docker-compose.yml`, `Dockerfile`, `Dockerfile.prebuilt`, and `Dockerfile.server` cover deployment.
