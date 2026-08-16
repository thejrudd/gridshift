# Statistics Scores

The v8.5 Statistics Scores Beta combines a development/test-only regular-season design fixture with server-proxied BALLDONTLIE live data and an explicit ESPN fallback. With a verified paid profile and effective request limit, BALLDONTLIE owns the selected week's near-live score, game state, period, and clock anchor as well as richer game drilldowns. ESPN remains the broadcast/network metadata source for BALLDONTLIE-backed games because BALLDONTLIE does not expose that field; the metadata overlay does not replace BALLDONTLIE score or live-state data. Without a usable BALLDONTLIE games lane, ESPN supplies the scoreboard slate. Fantasy Live league readiness does not control either source.

## Route And Ownership

- Route: `/statistics/scores`
- Navigation: `src/components/StatisticsSubNav.jsx`
- Screen orchestration and week rail: `src/components/statistics/scores/StatisticsScores.jsx`
- Shared NFL phase toggle: `src/components/statistics/SeasonPhaseToggle.jsx`
- ESPN scoreboard adapter: `src/utils/espnNflScoreboard.js`
- Server-only provider selection and BALLDONTLIE game boundary: `server/statisticsScoresHandlers.js`
- Scores provider status, server-side game requests, and aggregated provider-backed drilldown requests: `src/api/statisticsScoresApi.js`
- BALLDONTLIE scoreboard adapter: `src/utils/balldontlieNflScoreboard.js`
- Provider eligibility: `src/utils/statisticsScoresProvider.js`
- Selected-week hero board and neighboring-week peeks: `src/components/statistics/scores/ScoresSeasonBoard.jsx`
- Matchup scorebug and compact peek scorebug: `src/components/statistics/scores/GameScorebug.jsx`
- Game drilldown: `src/components/statistics/scores/ScoresGameDrilldown.jsx`
- Feature styling: `src/components/statistics/scores/StatisticsScores.css`
- Normalized local fixtures: `src/data/statisticsScoresFixtures.js`

## Current Experience

In development and test environments, the desktop default is the Claude **Hero week + peek** design: the selected week starts with one **Live** section for live, halftime, and delayed games, followed by calendar-day sections in chronological order. Calendar headings and scorebug date/time metadata use the NFL's `America/New_York` day boundary so UTC kickoff timestamps cannot place Friday games under Thursday or produce a conflicting card label. Compact Previous and Up Next week summaries follow the selected slate. Mobile shows only the selected week beneath the shared horizontal week rail. Production does not bundle or display the placeholder slate.

The drilldown contains Overview, Team Stats, Players, Scoring, and Play-by-Play. Player statistics use full tables on wider screens and priority cards on mobile. For provider-backed games, the Scores sidecar aggregates BALLDONTLIE's game, team-stat, player-stat, and play responses into the same normalized detail contract used by the development fixture. BALLDONTLIE play rows are grouped into approximate display drives by possession-team changes; the provider supplies individual plays rather than a documented drive object. ESPN-only scorebugs remain visible and live-updating but do not expose a drilldown because ESPN does not supply the required detail contract.

Statistics Scores keeps its Regular / Preseason control. Statistics Schedule instead starts with regular-season weeks only and exposes an unchecked **Include preseason** checkbox; enabling it prepends the four ESPN preseason slates to the same week rail and adds preseason games to team schedules. PrimeTime is not offered while a preseason week is selected. Scores advances preseason slates at the start of the next slate's first NFL calendar day in `America/New_York`; regular-season slates retain kickoff-time rollover. The week rail retains the selected underline and current-week “Now” metadata without repeating that state in a separate toolbar control. Provider-backed scorebugs open the real-data detail shell in both Regular and Preseason only after a game starts; final, live, halftime, and in-game delayed states are eligible. Scheduled, postponed, partial, offline, and unavailable states remain non-interactive. Local fixture detail remains regular-season only and follows the same game-state boundary.

### Live Refresh Contract

- A verified paid GOAT profile with an explicit 600 RPM account limit enables a one-second, selected-week BALLDONTLIE Games snapshot. The narrow request is expected to fit one provider page and is cached/coalesced by one sidecar-wide gateway. It never re-fetches the paginated full-season collection at one-second cadence.
- The browser uses the server-advertised cadence and freshness metadata. Outside live play it refreshes every 30 seconds. Polling pauses while the page is hidden or offline, resumes with one fresh request, and exponentially backs off to a maximum two-minute interval.
- BALLDONTLIE currently supplies the live clock anchor through its status text. The board animates that anchor once per second for presentation, accepts provider corrections in either direction, and freezes after ten seconds without a changed anchor, at `2:00` and `0:00`, during halftime/delays/final states, while hidden/offline, or whenever the feed is stale. The provider snapshot remains the source of truth because no clock-running flag is documented.
- If the paid live lane is unavailable or fails, the same route returns a clearly labeled ESPN snapshot and fallback reason. ESPN live games retain the existing eight-second cadence and do not use local clock interpolation.
- An open BALLDONTLIE live, halftime, or delayed drilldown refreshes its aggregated team, player, scoring, and play detail every 30 seconds to align with the shared server cache. Detail refresh pauses while the page is hidden or offline and retains the last good box score after a transient failure.
- BALLDONTLIE remains the source for richer drilldown data such as team comparisons, player box scores, leaders, scoring events, and play-by-play. Stable provider game IDs are preserved while live snapshots overlay the selected week, so refreshing a scorebug does not close or retarget an open drilldown.

## Provider Responsibilities

- BALLDONTLIE is the production selected-week scoreboard source when the server reports a configured key, supported tier, and sufficient explicit effective limit. This choice is independent of the connected fantasy platform, league, or Fantasy Live browser session. ESPN is the deliberate no-key, unsupported-profile, low-limit, or temporary-failure fallback.
- The dedicated Scores detail proxy loads the game record, fully paginated player stats, team stats, and tier-supported plays. The BALLDONTLIE key never enters the browser bundle.
- Statistics Scores and Fantasy Live now share one sidecar-wide gateway for credential attachment, canonical cache keys, in-flight coalescing, bounded response retention, cursor pagination, page-aware quota accounting, protected Scores capacity, provider backoff, and stale-on-error behavior. `GRIDSHIFT_LIVE_MAX_REQ_PER_MIN` remains a separate incoming Fantasy Live client guard.
- BALLDONTLIE requests are phase-scoped at the server boundary: the games collection uses `season_type[]=1` for Preseason and `season_type[]=2` plus `season_type[]=3` for Regular, while detail collections use the provider's scalar `season_type=1` or `season_type=2`. The phase is part of every server cache key, so switching phases cannot reuse an empty or cross-phase detail response.
- ESPN scoreboards provide scores and game state here, but not the production detail contract. When BALLDONTLIE detail is unavailable, ESPN scorebugs are non-interactive and no drilldown is offered.

## Remaining Shared Live-Data Work

The rollout plan is [[Live Data Server Architecture]]. The shared gateway, selected-week live Scores lane, public live-route guard, server-advertised cadence/freshness metadata, ESPN fallback, and provider-anchored clock presentation are current. Remaining Phase 1 work includes league ingest lifecycle and per-league allocations, broader public detail validation, complete operational metrics, and tier-adaptive Fantasy Live behavior. Redis/leader coordination and push delivery remain later scale work.

## Local Developer Source Modes

Run `npm run dev`, open [http://localhost:5173/statistics/scores](http://localhost:5173/statistics/scores), and use the development-only **Data source** control. Every local page load starts on **Fixture** so development stays deterministic. The control is not rendered in production; production uses the server-selected BALLDONTLIE games lane when its configured capability supports the route and otherwise uses the clearly labeled ESPN fallback.

| Local source | Setup | Expected behavior |
|---|---|---|
| **Fixture** | None | Dynamically loads the normalized local fixture only in development. Regular Week 7 restores the complete earlier drilldown—Overview, Team Stats, Players, Scoring, and Play-by-Play—for completed and in-progress games without making provider requests. Scheduled games remain score-only, and fixture modules are excluded from production entry points. |
| **ESPN live** | None | Uses the live ESPN schedule and scoreboard feed for both phases. Scorebugs remain live-updating but non-interactive, even when the local server has a BALLDONTLIE key, so the forced source faithfully represents ESPN-only/no-key behavior. |
| **BALLDONTLIE API** | Add the server key, capability tier, and explicit effective limit to the repo-root `.env`, restart `npm run dev`, then select the source. | Uses the Scores server sidecar and phase-specific BALLDONTLIE season/detail requests plus the narrow selected-week live snapshot. Temporary live-snapshot failures return the labeled ESPN fallback while the base provider configuration and drilldown errors remain explicit. |

For local BALLDONTLIE testing, put the key only in `/Users/justinruddick/Documents/GitHub/gridshift/.env`:

```dotenv
GRIDSHIFT_BDL_API_KEY=replace_with_your_local_key
GRIDSHIFT_BDL_TIER=goat
GRIDSHIFT_BDL_EFFECTIVE_MAX_REQ_PER_MIN=600
```

`scripts/dev.mjs` reads that repo-root `.env` into the server process. It does not read `.env.local` for server configuration. The key must never be named `VITE_GRIDSHIFT_BDL_API_KEY`, placed in a `VITE_*` variable, added to client source or public assets, stored in browser storage, or sent from browser code to BALLDONTLIE. Vite-prefixed variables are exposed to the client bundle. Keep the committed `.env.example` value blank and never commit a real key.

The development launcher runs the API sidecar in Node watch mode, so later server-route edits restart it automatically. After pulling or applying the change that introduced watch mode, stop and restart an already-running `npm run dev` process once. Statistics Scores validates the phase returned by the sidecar and shows an explicit restart message instead of rendering an empty or cross-phase week rail when an older process is still running.

## Automated Source Matrix

| Contract | Automated coverage | Focused command |
|---|---|---|
| The server accepts exactly the three developer overrides, keeps Fixture and ESPN off the paid upstream, scopes BALLDONTLIE by phase, aggregates tier-supported detail, requests one narrow live week, and returns a truthful ESPN fallback. | `tests/unit/statisticsScoresHandlers.test.mjs` | `node --test tests/unit/statisticsScoresHandlers.test.mjs` |
| The shared gateway keeps the tier and effective limit separate, canonicalizes requests, counts every cursor page, coalesces in-flight work, bounds cache growth, serves stale on provider failure, and protects the live Scores allocation from detail traffic. | `tests/unit/balldontlieGateway.test.mjs` | `node --test tests/unit/balldontlieGateway.test.mjs` |
| The public live route uses bounded per-IP and concurrency protection independently of the provider quota. | `tests/unit/publicRequestGuard.test.mjs` | `node --test tests/unit/publicRequestGuard.test.mjs` |
| Client source normalization accepts only Fixture, ESPN, and BALLDONTLIE; local overrides remain explicit; automatic provider resolution accepts a ready BALLDONTLIE status and otherwise resolves to ESPN. | `tests/unit/statisticsScoresProvider.test.mjs` | `node --test tests/unit/statisticsScoresProvider.test.mjs` |
| ESPN scheduled/live/final normalization, phase/week requests, full regular-season loading, direct ESPN week replacement, and ESPN snapshot overlays that preserve BALLDONTLIE detail identity. | `tests/unit/espnNflScoreboard.test.mjs` | `node --test tests/unit/espnNflScoreboard.test.mjs` |
| BALLDONTLIE scorebug normalization, `status_state` lifecycle handling, live clock parsing, phase week construction, fixture-compatible team/player/leader/line-score normalization, detail coverage flags, and play grouping. | `tests/unit/balldontlieNflScoreboard.test.mjs` | `node --test tests/unit/balldontlieNflScoreboard.test.mjs` |
| Provider-anchored clock parsing, one-second display movement, corrections, ten-second stale freeze, stoppage boundaries, and unchanged-anchor aging. | `tests/unit/providerAnchoredGameClock.test.mjs` | `node --test tests/unit/providerAnchoredGameClock.test.mjs` |
| Current-week resolution, including preseason calendar-day rollover and regular-season kickoff rollover. | `tests/unit/statisticsScoresWeek.test.mjs` | `node --test tests/unit/statisticsScoresWeek.test.mjs` |
| Selected-week Live extraction and NFL Eastern calendar-day grouping, including UTC-midnight and legacy fixture-window regressions. | `tests/unit/statisticsScoresGrouping.test.mjs` | `node --test tests/unit/statisticsScoresGrouping.test.mjs` |
| The local source selector keeps Fixture provider-free, preserves the ESPN eight-second path, uses the BALLDONTLIE live-week route, visibly ticks a provider-anchored clock before holding stale data, preserves provider game identity for a preseason drilldown, reproduces the Aug. 13 rollover, and stays contained on a narrow phone. | `tests/e2e/statistics-scores-sources.spec.js` | `npx playwright test tests/e2e/statistics-scores-sources.spec.js` |
| Drilldown game-state eligibility accepts final, live, halftime, and delayed games while rejecting scheduled, postponed, partial, offline, and unavailable states. | `tests/unit/statisticsScoresDrilldown.test.mjs` | `node --test tests/unit/statisticsScoresDrilldown.test.mjs` |
| Full unit regression across all three data paths and their downstream consumers. | All unit tests | `npm run test:unit` |

## Fixture Contract

The scoreboard consumes a normalized season object:

```text
season
└── weeks[]
    ├── id, label, shortLabel, phase, dateRange
    └── games[]
        ├── id, status, statusLabel
        ├── slot, slotLabel, dateLabel, kickoffLabel
        ├── network, venue
        ├── away, home, records, score
        ├── favorite, favoriteTeamId
        ├── live { period, clock, possession, downDistance,
        │          fieldPosition, redZone, awayTimeouts, homeTimeouts }
        └── dataNotice, asOf
```

Detailed games add quarter labels and line scores, leaders, grouped team comparisons, grouped player tables, scoring events, and drives with individual plays. Components depend only on this normalized shape; the persistent production archive and adapter plan lives in [[Historical Game Data]].

## Production Work Still Required

- Build the 1999-forward persistent server schema and import pipeline described in [[Historical Game Data]].
- Import and expose 2022–2026 as the initial five-season Statistics Scores window.
- Generate the season selector from server coverage instead of the static fixture year list.
- Confirm nflverse and ESPN attribution/redistribution requirements; keep any credentials outside the client bundle.
- Surface explicit stale-data timestamps when a live refresh is paused or backing off.
- Derive the current week and season from the real NFL calendar.
- Resolve favorite-team highlighting from the persisted GridShift preference.
- Persist season, week, selected game, and drilldown section in route state if deep linking is desired.
- Normalize provider availability for possession, timeout, down-distance, player defense, kicking, punting, returns, and play-by-play fields.
- Replace the representative 12-game regular-season fixtures with complete production slates.

## Design Rules

- Preserve the Broadcast Editorial hierarchy and token-only palette.
- Keep color scarce: team gradients belong to the favorite scorebug and split drilldown hero, not every matchup.
- Winner, live, delayed, red-zone, and unavailable states must remain understandable without color.
- Keep horizontal overflow inside the week rail, tabs, or statistical table that owns it.
- Preserve the mobile priority-card treatment for player tables and reduced-motion handling for live indicators.
