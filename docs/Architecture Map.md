# Architecture Map

Back: [[Home]]

Layer-by-layer ownership map: who owns which state, where domain logic lives, and where the client/server boundary sits. For task-to-file routing, use [[Where To Edit]].

## Top-Level Runtime Shape

- `src/main.jsx` bootstraps React, registers the service worker, and wraps the app with providers.
- `src/App.jsx` is the effective router and shell coordinator. **There is no React Router.**
- `src/index.css` defines the global design tokens and theme variables used by components.
- `src/utils/pageShare.js` derives route-aware share titles/descriptions and updates the client document metadata; it deliberately does not serialize connected league state into public links.

## Entry Points

| File | Responsibilities |
| --- | --- |
| `src/main.jsx` | Registers the PWA service worker; applies the persisted display-size attribute *before* React mounts (prevents post-render typography/layout shift); wraps the app with `ErrorBoundary`, `ThemeProvider`, `PredictionProvider`; renders `App`, which adds `FantasyProvider` |
| `src/App.jsx` | Top-level UI state (`activeTab`, `seasonView`, `companionView`, `leagueView`, modal/sheet state, search/filter state); loads schedule data via `loadScheduleData()`; coordinates desktop vs mobile shell; cross-feature navigation (e.g. Fantasy → Statistics or Trade) |

## State Providers

| Provider | Owns |
| --- | --- |
| `src/context/PredictionContext.jsx` | Season-scoped prediction state in localStorage; syncs opposing game results across teams; reset/import/random generation; playoff selections and a restorable backup when a recipient applies a shared snapshot. Contracts: [[Prediction Share Cards]] |
| `src/context/ThemeContext.jsx` | `.dark` on `<html>`; persisted dark mode and favorite team; signature theme CSS variables on the root; the `compact`/`comfortable`/`large` display preference and `data-display-size` on `<html>` |
| `src/context/SleeperContext.jsx` | The Sleeper fantasy platform layer — see below |

### Responsive Display Layer

| File | Owns |
| --- | --- |
| `src/utils/displayPreferences.js` | Normalizes, reads, persists, and applies the display-size contract |
| `src/components/DisplaySettingsModal.jsx` | Shared centered chooser (desktop sidebar + mobile options) |
| `src/index.css` | Semantic typography, density/control tokens, readable/data/workbench page-frame tiers |

Rule: browser zoom stays native — never app-level DPI detection or whole-page transforms.

### `src/context/SleeperContext.jsx`

- Owns the Sleeper fantasy platform layer; still exports the temporary `useSleeper*` compatibility hooks.
- `FantasyProvider`, `useFantasyLeague`, `useFantasyStats`, and `useFantasy` are the platform-neutral entry points.
- Sleeper is the only supported user-facing fantasy connection.
- Persists normalized, non-secret fantasy state in localStorage.
- Loads league rosters, users, player database, weekly stats, aggregate season stats, matchups, and scoring settings through Sleeper.
- Re-derives scoring settings from the selected league on startup, so newly supported scoring fields are picked up without re-selecting the league.
- Performs Sleeper player/team/opponent enrichment for weekly stat rows via the three-pass algorithm below.

#### Stats Enhancement — Three-Pass Algorithm

**Root problem:** Sleeper's bulk stats endpoint has no team or opponent metadata. `player.team` (current roster) is wrong for any traded or signed player mid-season.

**Solution:** After bulk weekly stats, the players DB, and scheduleMap are all loaded, each player's weekly stat entries are enriched with confirmed game-time team and opponent:

| Pass | Source | Method |
|---|---|---|
| 1 | ESPN eventlog | Players with a valid `espn_id` in Sleeper's DB |
| 2 | ESPN roster name-match | Players with `espn_id: null` — matched by name, then same eventlog pipeline |
| 3 | Schedule verification | Remaining unresolved players — `player.team` confirmed against `scheduleMap` for that week |

Entries resolved via Pass 1 or 2 are marked `_teamSource = 'espn'`; Pass 3 entries `_teamSource = 'schedule'`. Unmarked entries fall back to `player.team`. Covers all offensive (QB, RB, WR, TE, K) and IDP (DL, LB, DB, etc.) positions.

## Folder Map

| Folder | Owns |
| --- | --- |
| `src/components` | App shell, views, modals, feature UI. `PageShareSheet.jsx` is retained for a future current-page share flow; prediction share cards live under `src/components/predictions/share/`; `ExportPreview.jsx` is the responsive studio around its fixed 1080px canvases |
| `src/components/companion` | Fantasy league tools on top of Sleeper state and scoring logic — see below |
| `src/components/compare` | Side-by-side player comparison across ESPN stats, fantasy output, and trade value |
| `src/components/scout` | Rookie scouting UI (Prospects, Picks, Results); reads static/generated Scout datasets from `src/data`; local-only CFBD import scripts |
| `src/components/nflPlays` | Shared surface-agnostic field/momentum graphics — see the shared play layer below |
| `src/utils` | Most domain logic: scoring, projections, trade math, export shaping, search parsing — see below |
| `src/api` | Thin wrappers for external data sources — see the client/server boundary below |
| `server` | The GridShift sidecar: provider gateway, quotas, live-data route groups, and persistent league-scoped Trade proposal rooms — see below |
| `src/data` | Static datasets (team colors, honors, stadiums, team history); Scout datasets (`rookies.js`, `draftPicks.js`, `draftResults.js`, `rookieProduction.generated.js`, `rookieGameLogs.generated.js`); `liveWinProbabilityModel.js` (frozen generated coefficient contract) |
| `scripts` | Scout importers (`import-scout-production.mjs`, `import-scout-game-logs.mjs`) call CFBD locally with `CFBD_API_KEY` and write generated data files. API keys must not enter the client bundle |

### `src/components/companion`

- `CompanionStandings.jsx`, `CompanionHistory.jsx`, and `CompanionActivity.jsx` power the top-level League routes. Their page-level loading, unavailable, error, and empty reasons stay centered and unframed.
- Trade keeps `CompanionTrade.jsx` as the public route component, with extracted Agent/Intelligence/Upgrade leaf modules in `src/components/companion/trade/`.
- Fantasy Live: `CompanionLive.jsx` owns the route's data plumbing (session, snapshots, projections, win probability, persisted replay selection, play feed) and composes presentation from `src/components/companion/live/`. Full file ownership and implementation rules: [[Fantasy Live]].
- Shared player/asset selector rendering lives here: `CompanionPlayerRow.jsx`, `CompanionAssetRow.jsx`, and `CompanionSelectorControls.jsx` are the canonical row/control primitives for Companion and Trade-adjacent picker surfaces. Read [[Companion Shared Rows]] before changing player-row styling, team logos, status badges, or selector controls.

### `src/utils` domain modules

| Module(s) | Owns |
| --- | --- |
| `predictionSnapshot.js`, `predictionShareCodec.js`, `predictionShareModel.js`, `predictionPlayoffSeeding.js`, `playoffBracket.js` | Validated prediction snapshots, database-free share fragments, card-ready projections, canonical record-to-seed ordering, NFL reseeding. Contracts: [[Prediction Share Cards]] |
| `leagueHistory.js` | Shared Sleeper league-lineage data layer: loads and caches season rosters, users, matchups, transactions, and real bracket payloads; exposes normalized participants, finalized standings (named divisions, recent form), score-backed brackets, Toilet Bowl vs consolation progression, activity entries, history aggregates, record leaders, Draft Blueprint summaries. Stable participant identity uses Sleeper user ID with a season-roster fallback |
| `opportunityEngine.js` + `opportunity/` | Trade opportunity logic — `opportunityEngine.js` is the public facade, implementation modules under `src/utils/opportunity/` |
| `liveScoringFeed.js`, `livePlaysFeed.js`, `liveWinProbability.js`, `livePace.js`, `fantasyTeamIdentity.js` | The live-scoring split. Per-module ownership and the projection/probability rules: [[Fantasy Live]] |
| `nflPlays/` | Shared play-by-play parsing layer — see below |

### Shared NFL Play Layer (`src/utils/nflPlays/` + `src/components/nflPlays/`)

Surface-agnostic play-by-play: narrative parsing, player name indexing, ESPN participant/headshot resolution, field geometry, and the field/momentum graphics. Per-file ownership: [[Where To Edit]] § Statistics Scores And NFL Plays.

Rules:

- The field visuals (`fieldPrimitives.jsx`, `PlayTrajectoryStrip.jsx`, `DriveField.jsx`, `DrivePlayback.jsx`) share one 120-yard canvas through `fieldX`, and all kick geometry goes through `getKickGeometry`. A new field visual must reuse both rather than derive its own coordinates.
- `playBeats.js` is the time layer over that geometry: one play as the ball's position over time plus the beats that fire as it travels, composing `getPlayTrajectory()` and `parsePlayNarrative()` without duplicating either. `DrivePlayback.jsx` is its only consumer and draws nothing the other field visuals don't already define.
- Statistics Scores consumes this layer today; `livePlaysFeed.js` already routes its name index through `nflPlays/playerNameIndex.js`, but the rest of the Fantasy Live migration is still outstanding. New play-parsing work belongs here, never under a feature folder.
- `src/components/shared/PlayerAvatar.jsx` owns the headshot fallback chain for both surfaces and is re-exported as `LiveAvatar` for existing Fantasy Live call sites.

## Client/Server Boundary

### `src/api` (browser side)

| File | Owns |
| --- | --- |
| `sleeperApi.js` | Calls Sleeper directly from the browser |
| `liveApi.js`, `statisticsScoresApi.js` | Call the GridShift sidecar; they **never** send a BALLDONTLIE credential from the browser |

### `server` (sidecar)

Deep doc: [[Live Data Server Architecture]].

| File | Owns |
| --- | --- |
| `index.js` | Creates one process-wide BALLDONTLIE gateway and one canonical live-game snapshot store, injects both into the live-data route groups |
| `balldontlieGateway.js` | Server credential, capability profile, canonical bounded cache, in-flight coalescing, cursor pagination, stale/backoff policy, page-aware quota, protected live-score allocation |
| `liveGameSnapshots.js` | Canonical per-game play snapshot and newest-play selection shared by Statistics scorecards, Statistics drilldowns, and Fantasy Live |
| `publicRequestGuard.js` | Bounded downstream request/concurrency protection for the public near-live Scores route — separate from provider quota accounting |
| `liveHandlers.js` | Fantasy Live session/league boundary; routes all provider work through the shared gateway |
| `statisticsScoresHandlers.js` | Public Statistics Scores provider boundary, narrow selected-week live route, detail composition, ESPN fallback; projects canonical play snapshots rather than creating a Scores-only play source |
| `tradeProposalHandlers.js` | Participant-token sessions, exact Sleeper league/roster/asset validation, proposal revisions, inbox actions, expiring share capabilities, and cautious Sleeper reconciliation |
| `tradeProposalStore.js` | Separate SQLite/WAL proposal database. Stores immutable revision payloads and event state; expired payloads are removed while a bounded tombstone remains for the retention window |
| `tradeProposalCrypto.js`, `tradeProposalConfig.js` | HMAC token hashing, opaque proposal/session capabilities, bounded expiry/retention settings, and production secret/data-directory configuration |
| `sleeperTradeApi.js` | Server-side read-only Sleeper boundary used to validate league membership/ownership and inspect completed transactions |

Rule: gateway state is process-local. Running multiple sidecar replicas would multiply upstream work until the shared-store/leader phase in [[Live Data Server Architecture]].

## Build And Runtime Config

| File | Owns |
| --- | --- |
| `package.json` | npm scripts; version drives PWA cache busting |
| `vite.config.js` | React plugin, route-aware social/share HTML metadata in development and production entry files, PWA behavior, `__APP_VERSION__`, KTC proxy, and local sidecar proxies including Trade proposals/share metadata |
| `nginx.conf` | Production proxying of `/api/live/`, `/api/statistics/scores/`, `/api/fantasy/`, `/api/draft-sync/`, `/api/predictions-sync/`, `/api/trade-proposals/`, and `/trade/share/` to the sidecar. Bearer credentials are forwarded and server-backed routes are `no-store` |
| `docker-compose.yml`, `Dockerfile`, `Dockerfile.prebuilt`, `Dockerfile.server` | Deployment |
