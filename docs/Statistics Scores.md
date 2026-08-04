# Statistics Scores

The v8.4 Statistics Scores Beta combines a development/test-only regular-season design fixture with a live, keyless ESPN preseason scoreboard feed. Production never renders the fixture slate: regular-season Scores remains unavailable until provider-backed coverage is ready, while preseason supports real schedule and score testing without a server route or secret.

## Route And Ownership

- Route: `/statistics/scores`
- Navigation: `src/components/StatisticsSubNav.jsx`
- Screen orchestration and week rail: `src/components/statistics/scores/StatisticsScores.jsx`
- Shared NFL phase toggle: `src/components/statistics/SeasonPhaseToggle.jsx`
- ESPN preseason scoreboard adapter: `src/utils/espnNflScoreboard.js`
- Selected-week hero board and neighboring-week peeks: `src/components/statistics/scores/ScoresSeasonBoard.jsx`
- Matchup scorebug and compact peek scorebug: `src/components/statistics/scores/GameScorebug.jsx`
- Game drilldown: `src/components/statistics/scores/ScoresGameDrilldown.jsx`
- Feature styling: `src/components/statistics/scores/StatisticsScores.css`
- Normalized local fixtures: `src/data/statisticsScoresFixtures.js`

## Current Experience

In development and test environments, the desktop default is the Claude **Hero week + peek** design: the selected week is grouped chronologically by kickoff window, followed by compact Previous and Up Next week summaries. Mobile shows only the selected week beneath the shared horizontal week rail. Production does not bundle or display this placeholder slate.

The drilldown contains Overview, Team Stats, Players, Scoring, and Play-by-Play. Player statistics use full tables on wider screens and priority cards on mobile. Play-by-Play includes team filtering and expandable drive details.

Statistics Scores keeps its Regular / Preseason control. Statistics Schedule instead starts with regular-season weeks only and exposes an unchecked **Include preseason** checkbox; enabling it prepends the four ESPN preseason slates to the same week rail and adds preseason games to team schedules. PrimeTime is not offered while a preseason week is selected. Scores chooses the active preseason slate from kickoff dates and refreshes the visible week every 30 seconds while the page is visible. Live preseason scorebugs do not open the fixture-backed drilldown.

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
- Define live refresh cadence, visibility/offline behavior, stale-data timestamps, and retry policy.
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
