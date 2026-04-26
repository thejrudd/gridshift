# BALLDONTLIE NFL Integration

Back: [[Home]]

This note captures how the BALLDONTLIE NFL API could be used in GridShift for live scoring, game context, and future premium-hosted experiences.

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

The docs currently show these tier/rate-limit constraints:

- Free: `5 requests/min`
- ALL-STAR: `60 requests/min`
- GOAT: `600 requests/min`

For this project specifically, the current working assumption should be:

- **current key available to the project: `5 requests/min`**

That matters because GridShift is currently a client-heavy app. Any live integration has to be designed around request budgeting from the beginning.

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

Potential new feature:

- a “Live” sub-view showing:
  - your active players
  - current points from live stats
  - game status and possession context
  - injury updates
  - remaining projection delta

This is probably the most compelling premium-style surface if live API costs need justification.

### 3. Enhanced Team / Schedule Context

The `games`, `standings`, and `odds` endpoints could improve:

- season predictions comparisons against live consensus lines
- weekly slate context
- current playoff race snapshots
- “what changed since your prediction” overlays

### 4. Play-by-Play Powered Micro-Features

The `plays` endpoint opens some more advanced ideas:

- drive summaries
- touchdown / turnover timeline cards
- “last big play” indicators on player or matchup screens
- live win-probability or momentum widgets if derived later

This is powerful, but probably not phase one because it increases both complexity and request volume.

## Technical Fit

### Strong Fit

- the app already has strong player/team/stat surfaces
- live game context slots naturally into existing views
- the OpenAPI spec is useful for typed clients or internal endpoint wrappers

### Weak Fit

- the app is currently deployed like a static client/PWA, which is the wrong place to expose a paid or valuable API key
- live polling from the browser would burn through rate limits quickly

## Recommended Integration Shape

Do **not** call BALLDONTLIE directly from the browser in production.

Recommended architecture:

1. Add a small backend-for-frontend or serverless proxy
2. Store the API key server-side only
3. Expose narrow internal endpoints such as:
   - `/api/live/games`
   - `/api/live/player-stats`
   - `/api/live/injuries`
   - `/api/live/standings`
4. Add caching and polling windows by endpoint type
5. Gate high-frequency live views behind authentication if needed

## Rate-Limit / Cost Strategy

If the app stays on the current `5 requests/min` tier, the live layer needs aggressive guardrails:

- cache responses per game window
- coalesce multiple client viewers onto one backend fetch
- poll slowly for standings/injuries
- poll more frequently only for visible live-game surfaces
- stop polling when no live games are relevant to the current user view

Good first rule:

- no page should independently poll BALLDONTLIE from the client
- one backend fetch fan-outs to many viewers

## Risks / Unknowns

- tier costs may not justify fully live features unless hosts want to monetize access
- free-tier docs currently show only `5 requests/min`, which is too low for naive live polling
- sportsbook/props data adds legal/product complexity depending on how prominently it is used
- because the app is open source, any key-handling pattern has to be safe for self-hosters and not assume a single hosted environment

## Recommendation

Best near-term plan:

1. Treat BALLDONTLIE as a future server-side live data provider
2. Use it first for:
   - live game state
   - live player stats
   - player injuries
   - standings
3. Leave play-by-play and odds/props for a later phase

Plain English:

This API is a strong fit for a future “Live” layer, but only if GridShift introduces a secure backend boundary first. With the current `5 requests/min` constraint, it is only practical for tightly scoped, cached live features rather than broad real-time polling across the app.
