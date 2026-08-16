# BALLDONTLIE NFL Integration

Back: [[Home]]

This note is the provider-specific reference for GridShift's existing and planned BALLDONTLIE NFL integration. Current Statistics Scores behavior is documented in [[Statistics Scores]]; the approved shared-server, league-ingest, quota, clock, BYOK, and scale plan is [[Live Data Server Architecture]].

## What It Is

BALLDONTLIE offers an NFL API with endpoints for teams, players, games, standings, injuries, stats, season stats, team stats, play-by-play, betting odds, player props, and roster data.

Primary docs:

- [BALLDONTLIE NFL API docs](https://nfl.balldontlie.io/)
- [OpenAPI spec (`nfl.yml`)](https://www.balldontlie.io/openapi/nfl.yml)

The docs also explicitly position the OpenAPI spec as an AI-friendly integration surface, which is useful if GridShift ever wants codegen, internal tooling, or assistant-driven endpoint exploration.

## Relevant Capabilities

From the public docs and spec, the most relevant endpoints for this app are:

- `games` — live and historical game state
- `stats` — live-updating player box-score style stats
- `season_stats` / `team_season_stats` — broader season-level data
- `player_injuries` — status and injury notes
- `standings` — current season standings
- `plays` — play-by-play feed with wallclock ordering
- `odds` and `odds/player_props` — sportsbook context for games and players

As verified against the provider documentation on 2026-08-13, the tier/rate-limit constraints are:

- Free: `5 requests/min`
- ALL-STAR: `60 requests/min`
- GOAT: `600 requests/min`
- GOAT trial: GOAT endpoint capabilities with a `5 requests/min` trial limit

Games are available on every tier. Player Stats and Team Stats require ALL-STAR or GOAT; Plays requires GOAT. Capability tier and effective requests per minute must be represented separately, because the trial is the clearest case where they differ. Every cursor page and retry consumes provider budget.

## Best-Fit GridShift Uses

### 1. Live Scoring Layer for Statistics / Matchup / Companion

Most natural first use:

- current game status
- live fantasy stat accumulation
- in-progress scoreboard summaries
- injury/status context while games are underway

Strongest UX surfaces:

- `Statistics` player page: live game state + current stat line
- `Companion → Matchup`: live starter status and current scoring
- `Trade` / `Upgrades`: optional “currently active / scoring live” context during game windows

### 2. Companion Live Dashboard

The current Live sub-view shows:

- your active players
- current points from live stats
- game status and possession context
- injury updates
- remaining projection delta

### 3. Enhanced Team / Schedule Context

The `games` and `standings` endpoints could improve:

- weekly slate context
- current playoff race snapshots
- “what changed since your prediction” overlays

### 4. Play-by-Play Powered Micro-Features

The `plays` endpoint opens some more advanced ideas:

- drive summaries
- touchdown / turnover timeline cards
- “last big play” indicators on player or matchup screens
- live win-probability or momentum widgets if derived later

GridShift already consumes play rows for provider-backed drilldowns and Fantasy Live. The shared gateway makes that usage capability-aware and quota-safe rather than expanding it into betting-adjacent features.

BALLDONTLIE exposes individual play rows through `plays`; it does not document a separate NFL drive object in the public NFL API. GridShift can group adjacent plays by possession team for presentation, but those drive boundaries are an application-derived view rather than provider-authored drive records.

## Technical Fit

### Strong Fit

- the app already has strong player/team/stat surfaces
- live game context slots naturally into existing views
- the OpenAPI spec is useful for typed clients or internal endpoint wrappers

### Weak Fit

- the shared gateway is process-local, so multiple API replicas would still duplicate cache, quota, and upstream work
- Fantasy Live has not yet moved from browser-driven matchup-shaped polling to the planned league ingest lifecycle and fair-use allocation
- public game-detail validation and server-owner observability still need to be expanded beyond the protected selected-week route

## Integration Boundary

Do **not** call BALLDONTLIE directly from the browser in production. GridShift already provides the first security boundary: nginx/Vite proxies narrow browser routes to an Express sidecar, and the sidecar attaches the server-only credential.

One sidecar-wide gateway now coordinates the existing Fantasy Live and Statistics Scores handlers: canonical requests, bounded caches, in-flight coalescing, pagination, credential capabilities, page-aware quotas, protected Scores capacity, backoff, stale responses, and sanitized freshness metadata. See [[Live Data Server Architecture]] for the remaining league-ingest and horizontal-scale phases.

### Current Statistics Scores Boundary

Statistics Scores uses dedicated server-side provider status, selected-week live, season, and game-detail routes. A configured key plus verified capability profile and explicit effective request limit selects BALLDONTLIE independently of Fantasy Live session or league readiness; missing, low-limit, or unavailable provider status uses the clearly labeled ESPN fallback. ESPN fallback scorebugs remain visible and live-updating but do not open a drilldown because the required BALLDONTLIE detail contract is unavailable. The development ESPN source enforces the same boundary even when the local server has a key. With BALLDONTLIE active, drilldown navigation is limited to final, live, halftime, and in-game delayed states; scheduled and otherwise unavailable states do not request detail.

The current implementation intentionally does not accept a BALLDONTLIE key from the browser. Statistics Scores sends a server-side phase parameter and the proxy maps it to provider season types: the games collection uses array filters (`season_type[]=1` for Preseason; `season_type[]=2` and `season_type[]=3` for Regular), while game-detail collections use the required scalar filter (`season_type=1` or `season_type=2`). The selected-week live route adds one bounded week filter and never polls the full-season collection at one-second cadence. The detail route aggregates `/games/{id}`, fully paginated `/stats`, `/team_stats`, and tier-supported `/plays` responses. Phase and freshness are part of gateway cache identity. A key must not be placed in Vite environment variables intended for client code, local storage, or a client request header.

Phase 1 keeps the deployment-owner key and explicit league allowlist while adding league-scoped Fantasy Live ingests and a shared gateway. Phase 2 later adds encrypted league-managed keys, one active key per league, credential indexing, external rotation, and automatic dead-key cleanup. There is intentionally no browser-visible key removal endpoint; the provider remains the revocation authority. The complete lifecycle is in [[Live Data Server Architecture]].

## Rate-Limit / Cost Strategy

No page independently owns provider quota. The shared gateway counts every upstream page, protects an operating reserve and dedicated live-score capacity, and makes low-priority calls stop before they can consume that capacity. Simultaneous identical provider calls under the same credential and freshness class share one in-flight result. Per-league allocation and adaptive lane scheduling remain Phase 1 work.

Starting policy is tier-sensitive: Free cannot power provider-backed fantasy scoring; ALL-STAR can provide Stats and Team Stats at a slower adaptive cadence without Plays; GOAT can support the full planned cadence. A GOAT deployment operates below the documented 600 RPM maximum rather than treating it as a target. See [[Live Data Server Architecture]] for allocations, league ceilings, and degradation rules.

## Live Clock Constraint

The provider says in-progress Games data is updated in real time, but the published NFL Game schema does not guarantee a dedicated current clock or clock-running flag. Play rows include `clock_display` and `wallclock`, which describe an event rather than a continuously running clock.

Live preseason verification found the current game clock encoded in the Games `status` text, while multiple one-second responses could repeat the same value. GridShift therefore treats that value as an anchor: the UI animates a one-second display for at most ten seconds, accepts each provider correction, and freezes at stoppage/safety boundaries or when the anchor becomes stale. That display remains an approximation; it is not a provider-authored second-by-second clock.

## Risks / Unknowns

- tier cost and pagination growth can force slower live cadences on smaller deployments
- free-tier docs currently show only `5 requests/min`, which is too low for naive live polling
- because the app is open source, any key-handling pattern has to be safe for self-hosters and not assume a single hosted environment

## Recommendation

Keep the provider-specific adapter narrow and put operational policy in [[Live Data Server Architecture]]. The page-aware gateway, protected one-second GOAT Scores lane, ESPN fallback, and provider-anchored clock presentation are implemented. Complete league lifecycle, per-league budgets, broader observability/public-detail protection, and multi-instance coordination before raising league scale. Play-by-play remains GOAT-only. Odds, props, gambling, and betting-adjacent features remain excluded from GridShift.
