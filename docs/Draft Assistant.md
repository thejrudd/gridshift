# Draft Assistant

Back: [[Home]]

## Summary

Draft Assistant is a top-level section for the `v8.0` release line. War Room connects to the active Sleeper league, reads the current draft room, lets users build per-position draft boards, and locally saves those boards by league, season, and draft ID. Draft Order is a separate active Draft view for pick order and made-pick review.

Gauntlet and Tiers/Runs are staged as Draft subnav routes. Sleeper live draft updates are handled by polling the public draft metadata and picks endpoints. This first pass supports Sleeper `snake` and `linear` drafts only.

## File Map

```
src/components/
  DraftSubNav.jsx

src/components/draft/
  DraftAssistant.jsx

src/utils/draftAssistant/
  index.js
  projections.js
  rosterNeed.js
  availability.js
  recommendations.js

src/api/
  sleeperApi.js
  leagueLogsApi.js
```

## Data Flow

1. `DraftAssistant.jsx` loads the Sleeper player DB, league drafts, active draft metadata, live picks, draft-specific traded picks, and the most recent completed season's stats package for Draft intelligence.
2. `src/utils/draftAssistant/index.js` normalizes picks, applies traded-pick ownership to the draft order, categorizes the active league scoring settings, and builds the view model used by React.
3. `DraftAssistant.jsx` stores the user's board as `{ [position]: playerId[] }`, scopes it to `leagueId + season + draftId`, and migrates the old flat board key when possible.
4. `DraftAssistant.jsx` fetches the LeagueLogs Market Index profile that best matches the league format, QB setup, and reception scoring, then passes the Sleeper-ID keyed market map into the draft view model.
5. `SleeperContext.jsx` exposes `loadStatsForSeason(season)` so Draft can read past-season weekly stats, aggregate season stats, and the schedule map without changing the selected league season.
6. `projections.js` extracts season projection totals from Sleeper player payloads when present, but War Room labels derived past production as PPG/Rating rather than fabricating true projections.
7. `rosterNeed.js` estimates open starter and bench pressure from `league.roster_positions`.
8. `index.js` attaches Draft Intelligence signal groups to every candidate: `rank`, `scoringFit`, `workload`, `teamContext`, `schedule`, `draftRoom`, and `draftModel`.
9. `recommendations.js` turns market/search rank, past production, scoring fit, roster need, and personal board rank into explainable pre-draft recommendation rows.

## Draft Intelligence Signals

- `rank` keeps overall rank, positional rank, rank source, tier, and trend separate so War Room can show transparent signals instead of a hidden black-box score.
- `scoringFit` uses the active Sleeper scoring settings to expose relevant levers by position, including passing, receiving, rushing, TE premium, first downs, big-play bonuses, kicker, DST, and IDP scoring.
- `workload` uses available season and weekly stats for primary volume, recent PPG, season PPG, targets, receptions, carries, attempts, target share, rush share, and workload trend.
- `teamContext` appears in the UI as Team Environment. It uses available team usage totals for bye week, pass-play rate, and position-specific environment hints such as QB receiving support or RB rushing context.
- `schedule` uses the existing schedule map plus weekly fantasy points allowed by position when available. If the data is absent, the signal stays unavailable instead of guessing.
- `draftRoom` keeps board rank, roster need, picks until the user, manager pressure, and recent position runs together for Big Board and recommendation UI.
- `draftModel` produces the user-facing Draft Rating by combining market rank, past PPG, scoring fit, and roster need using locally persisted user weights.

## Product Rules

- Draft Assistant is a top-level app section, not a Companion subview.
- `War Room` and `Draft Order` are active; `Gauntlet` and `Tiers/Runs` are staged routes only.
- Player rows must use the shared Companion row system for player photos, team gradients, team logos, position badges, and contrast.
- If Sleeper does not expose usable season projection totals, rank from LeagueLogs Market Index data when available and clearly label it as Overall or Market, not ADP. Do not invent fallback projected points.
- Treat oversized Sleeper `search_rank` values as unavailable rather than market signal. If no market or usable search rank exists, derive a local Draft pool rank from the visible candidate pool so Big Board cards never display sentinel values like `9999999`.
- Draft intelligence should use the most recent completed season for PPG, volume, trend, team environment, and schedule derivation. Do not switch to current-season stat logic for this pre-draft surface.
- If workload, schedule, trend, or team-context data is missing, render the metric as unavailable. Do not infer unverified values from player reputation or visual placeholders.
- Availability pressure belongs to the future live Draft Room surface. Do not let it affect pre-draft Draft Rating, recommendation order, or why-line copy.
- LeagueLogs Market Index is an optional free enrichment source with no API key. It covers offensive skill positions only, so K, DEF, and IDP rows must keep working without market values. Any surface that displays LeagueLogs data must show the returned attribution link.
- Personal priority is stored locally as per-position ranked boards per league, season, and draft ID.
- Upcoming pick ownership must come from the current pick owner. Use `draft/<draft_id>/traded_picks` to resolve acquired picks before calculating manager need pressure.
- War Room should not carry a separate pick-order sidebar; live upcoming picks belong in the banner, and full pick review belongs in Draft Order.
- Recommendation weights belong in `src/utils/draftAssistant/`, not inline in the component.
- User-tunable model weights are persisted locally by league, season, and draft ID. Resetting the model returns to the shared Draft utility defaults.
