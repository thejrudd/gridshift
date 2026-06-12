# Draft Assistant

Back: [[Home]]

## Summary

Draft Assistant is a top-level section for the `v8.0` release line. War Room connects to the active Sleeper league before the draft starts, reads the current draft room, lets users build per-position draft boards, and locally saves those boards by league, season, and draft ID. Board is a standalone active Draft view for the same saved board, available before and during a live draft. Results shows the Sleeper pick order before picks are made, then becomes a broadcast-style board of completed Sleeper picks, first pick first by default, with War-Room-grade player metrics (GridShift Rating, Sleeper, Tier, position, and NFL team) as enrichment data becomes available.

Gauntlet and Tiers/Runs are staged as Draft subnav routes. Sleeper live draft updates are handled by polling the public draft metadata and picks endpoints. This first pass supports Sleeper `snake` and `linear` drafts only.

## Results View

- Route: `/draft/results` (`draftView === 'results'`, registered in `appRoutes.js` `DRAFT_VIEWS` and `DraftSubNav.jsx`). `DraftAssistant.jsx` dispatches `DraftResultsView`. Legacy `/draft/draft-order` routes normalize to `/draft/results`.
- `DraftResultsView` reuses the same Sleeper draft sync scaffold as War Room and Board — `resolveActiveDraftId` → fast `getDraft` metadata checks, event-driven `getDraftPicks`, and slower `getDraftTradedPicks` ownership refreshes. Live draft-room Sleeper calls use `cache: 'no-store'` plus a per-request cache-busting query parameter so browser or upstream cache layers cannot hold pause/resume changes for a stale 20-30 second window. Live rooms check Sleeper draft metadata every 1 second so pause/resume and clock changes are reflected quickly. Clock-only metadata is published through a small `useSyncExternalStore` subscriber used by `LiveDraftStatusBanner`; it must not be promoted back into parent Draft view state, because that makes every one-second clock poll re-render Results and Board. Pause/resume flips update only the banner clock state unless a pick, draft ID, timer setting, or terminal/pre-draft status changes, so tab focus does not rebuild the full Draft model. Pick refreshes run on initial load, actual pick/timer/draft transitions, local clock expiry, or a 5-second safety interval. Traded-pick refreshes run on initial load, draft changes, or a slower safety interval.
- Before completed picks exist, Results renders the Sleeper draft order with traded-pick ownership applied. Once completed picks exist, rows are completed picks only (`normalizedPicks` with a `playerId`), sorted by overall **ascending** (first pick first) by default. The view can reverse the order, filter by fantasy team through a checkbox dropdown, and filter by position chips. The user's picks show the actual fantasy team name with a scoped "Your Team" marker rather than replacing the team name with "You". Tapping a row opens the player via the shared `onViewPlayer` handler.
- Results renders the order and completed-pick rows from draft metadata/picks first. It only loads the Sleeper player DB, LeagueLogs market data, and completed-season stats after completed picks exist, then uses `buildDraftResultsViewModel` to enrich drafted rows with the same GridShift Rating, Sleeper, and Tier metrics used by War Room.
- Draft header: the shared `DraftStatusBanner` renders the broadcast-style live/paused state, the team on the clock, the next team up, and a likely pick for the on-clock team; the user's next upcoming pick is a compact summary line below the main banner. Before the draft, the same header shows Sleeper's scheduled `start_time` plus a local countdown when the league has a future draft date/time set; it stays hidden when no schedule exists, when the scheduled time has passed, or when Sleeper no longer reports `pre_draft`. `useDraftPickCountdown` seeds a local browser countdown from Sleeper's `pick_timer`, `last_picked`, and `metadata.elapsed_pick_timer`, then ticks locally with a monotonic browser clock. It only resyncs when a metadata poll reports a status/pick/timer change or clock drift above the threshold. Sleeper `paused` draft rooms keep the banner visible with a PAUSED badge and frozen time remaining. Untimed drafts hide the live pick countdown. The banner serves the active Draft views, so the scheduled start or live light/clock appear in Results when relevant.

## Board View

- Route: `/draft/my-board` (`draftView === 'my-board'`, registered in `appRoutes.js` `DRAFT_VIEWS` and `DraftSubNav.jsx`). `DraftAssistant.jsx` dispatches the shared board data view in Board mode.
- Uses the same local storage key as War Room: `draft_assistant_position_board_v2:<leagueId>:<season>:<draftId>`. War Room and Board therefore show the same saved board rows, saved overall order, availability state, LeagueLogs market ranks, and drafted-player owner markers.
- Saved-board players drafted during the live draft keep owner context on the board. Rows should show `Drafted by You` with the user-pick accent when the user's roster made the pick, or `Drafted by <fantasy team>` when another roster selected the player; do not collapse both states into a generic `Gone` badge.
- Desktop layout is viewport-locked: the Available rail, each position lane, and the roster tray live inside one fixed-height workspace so long player lists scroll internally instead of pushing the roster tray down the page.
- War Room and Board build the full candidate model outside the render phase and keep the page in a non-interactive "Preparing" state until the first usable model is ready. Matching model builds are cached in memory across Draft tab switches so returning from Results can paint immediately while fresh async data revalidates. Do not move `buildDraftAssistantViewModel` back into render-time `useMemo`; it can paint the UI and then block the main thread while ranking the full Sleeper player pool.
- The Available rail can be resized horizontally on desktop. The board lanes keep their own horizontal scroll, while each lane stack owns its vertical scroll.
- Mobile collapses Available into a drawer, shows one active position lane at a time, favors tap controls over drag-only interaction, and fixes the roster tray above the bottom navigation with safe-area padding.
- Standalone Board layout is container-driven: the workspace shell uses `@container draft-board-workspace` and board-level sizing variables so lane/card dimensions respond to the actual available Draft content width rather than a viewport-only desktop cutoff.
- Drag/drop can add players from Available into eligible lanes and reorder within a lane. A player cannot be dropped into a position lane that is not present in that player's Sleeper fantasy positions. Add, move, and remove buttons remain available so the board is not drag-only.
- Board can toggle between Positional and Overall ranking. Overall is an editable saved order, not a temporary market sort. Positional lanes are derived from the saved overall order, so moving two same-position players in Overall changes their positional order, and moving two players within a position swaps their saved overall slots in the background.
- The roster tray is built from current Sleeper roster players plus the user's live draft picks. Exact position slots fill first, then eligible flex or bench slots, with overflow bench cells used when every declared roster slot is already filled.
- Keeper toggles are stored locally with `draft_assistant_roster_keepers_v1:<leagueId>:<season>:<draftId>` and only affect roster-tray highlighting.
- Scrollable board regions show arrow controls in addition to native scrolling.

## File Map

```
src/components/
  DraftSubNav.jsx

src/components/draft/
  DraftAssistant.jsx

src/utils/draftAssistant/
  index.js
  draftStatus.js
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
3. `DraftAssistant.jsx` stores the user's board as `{ byPosition: { [position]: playerId[] }, overall: playerId[] }`, scopes it to `leagueId + season + draftId`, and migrates older per-position or flat board keys when possible. `src/utils/draftAssistant/board.js` owns the pure add/remove/reorder/drop helpers used by both War Room and Board.
4. `DraftAssistant.jsx` fetches the LeagueLogs Market Index profile that best matches the league format, QB setup, and reception scoring, then passes the Sleeper-ID keyed market map into the draft view model.
5. `SleeperContext.jsx` exposes `loadStatsForSeason(season)` so Draft can read past-season weekly stats, aggregate season stats, and the schedule map without changing the selected league season.
6. `projections.js` extracts season projection totals from Sleeper player payloads when present, but War Room labels derived past production as PPG/Rating rather than fabricating true projections.
7. `rosterNeed.js` estimates open starter and bench pressure from `league.roster_positions`.
8. `index.js` attaches Draft Intelligence signal groups to every candidate: `rank`, `scoringFit`, `workload`, `teamContext`, `schedule`, `draftRoom`, and `draftModel`.
9. `recommendations.js` turns market/search rank, past production, scoring fit, roster need, and personal board rank into explainable pre-draft recommendation rows.
10. Drafted players are excluded from the candidate pool, so `index.js` separately enriches each drafted player into `draftedCardsById` (a `Map` keyed by Sleeper player ID) using the same signal builders. This feeds the Results view without changing the candidate pool or War Room.

## Development Mock Draft Testing

- In development only, `DraftAssistant.jsx` can override the connected league draft ID with `?sleeperDraftId=<draft_id>` in the URL or `VITE_SLEEPER_DRAFT_ID_OVERRIDE=<draft_id>` in the Vite environment. The legacy `?draftId=<draft_id>` query is accepted and normalized to `sleeperDraftId` by the app router.
- The override still requires a connected Sleeper league because Draft uses that league for rosters, scoring, user labels, and local board storage. Only the draft metadata / picks / traded-picks source is replaced.
- Sleeper mock picks can return `roster_id: null`; Draft resolves the fantasy team from `draft_slot` through `draft.slot_to_roster_id`.
- Production builds ignore the override path entirely.

## Global Draft Notice

- Predictions, Statistics, Companion, Trade, and Scout show a compact notice above their sub-navigation when the connected league draft is live or paused.
- Mock or override drafts only show this global notice when the connected Sleeper user appears in Sleeper's `draft_order` participant map; otherwise the notice is hidden.
- The notice reuses the app shell's draft-status poll and links back to Draft Results. It does not change the full live Draft banner inside the Draft section.

## Draft Intelligence Signals

- `rank` keeps overall rank, positional rank, rank source, tier, and trend separate so War Room can show transparent signals instead of a hidden black-box score.
- `scoringFit` uses the active Sleeper scoring settings to expose relevant levers by position, including passing, receiving, rushing, TE premium, first downs, big-play bonuses, kicker, DST, and IDP scoring.
- `workload` uses available season and weekly stats for primary volume, recent PPG, season PPG, targets, receptions, carries, attempts, target share, rush share, and workload trend.
- `teamContext` appears in the UI as Team Environment. It uses available team usage totals for bye week, pass-play rate, and position-specific environment hints such as QB receiving support or RB rushing context.
- `schedule` uses the existing schedule map plus weekly fantasy points allowed by position when available. If the data is absent, the signal stays unavailable instead of guessing.
- `draftRoom` keeps board rank, roster need, picks until the user, manager pressure, and recent position runs together for Big Board and recommendation UI.
- `draftModel` produces the user-facing Draft Rating by combining market rank, past PPG, scoring fit, and roster need using locally persisted user weights.
- `onClockRecommendation` is computed for the current pick owner using the standard default Draft model weights, that roster's current needs, and the available candidate pool. It intentionally ignores local model slider changes so the banner stays a neutral GridShift read.

## Product Rules

- Draft Assistant is a top-level app section, not a Companion subview.
- `War Room` is active only while Sleeper reports the selected draft as `pre_draft`; completed, live, or in-progress draft years should route to Results instead. `Board` stays active during `pre_draft`, `drafting`, and `in_progress` draft states. `Results` stays active before, during, and after the draft; `Gauntlet` and `Tiers/Runs` are staged routes only.
- Results shows the pick order before picks are made, then completed picks first pick first by default. Completed pick rows must surface GridShift Rating, Sleeper, and Tier metrics consistent with War Room once enrichment data is ready. It reuses the saved model weights so Rating values do not diverge between views.
- The scheduled draft date/time, live red light, on-clock team, next team up, likely pick, pick countdown, and compact user-next-pick summary live in the shared `DraftStatusBanner`. Scheduled-start countdowns may only render from a future Sleeper `start_time` while the draft is still `pre_draft`; do not invent a schedule when Sleeper has no draft date/time. The running live pick countdown is browser-local between Sleeper polls and is resynced from `pick_timer`, `last_picked`, and `metadata.elapsed_pick_timer` when the server clock changes or drifts. The fast metadata lane must not force full picks/traded-picks refreshes every second; picks confirm actual selections, while the browser keeps visible time between Sleeper confirmations. Do not fabricate a timer when Sleeper does not provide enough clock data.
- Player rows must use the shared Companion row system for player photos, team gradients, team logos, position badges, and contrast.
- If Sleeper does not expose usable season projection totals, rank from LeagueLogs Market Index data when available and clearly label it as Overall or Market, not ADP. Do not invent fallback projected points.
- Treat oversized Sleeper `search_rank` values as unavailable rather than market signal. If no market or usable search rank exists, derive a local Draft pool rank from the visible candidate pool so Big Board cards never display sentinel values like `9999999`.
- Draft intelligence should use the most recent completed season for PPG, volume, trend, team environment, and schedule derivation. Do not switch to current-season stat logic for this pre-draft surface.
- If workload, schedule, trend, or team-context data is missing, render the metric as unavailable. Do not infer unverified values from player reputation or visual placeholders.
- Availability pressure belongs to the future live Draft Room surface. Do not let it affect pre-draft Draft Rating, recommendation order, or why-line copy.
- LeagueLogs Market Index is an optional free enrichment source with no API key. It covers offensive skill positions only, so K, DEF, and IDP rows must keep working without market values. Any surface that displays LeagueLogs data must show the returned attribution link.
- Personal priority is stored locally as per-position membership plus a saved overall ranking per league, season, and draft ID. Positional rank order is projected from that overall ranking.
- Board position lanes must use the shared Companion position colors from `companionAssetVisuals.js`.
- Overall Board ranking is saved local board state. Do not add temporary sort fields that make Overall diverge from the user's manual ranking.
- Upcoming pick ownership must come from the current pick owner. Use `draft/<draft_id>/traded_picks` to resolve acquired picks before calculating manager need pressure.
- War Room should not carry a separate pick-order sidebar; live upcoming picks belong in the banner, and full pick order / pick review belongs in Results.
- Recommendation weights belong in `src/utils/draftAssistant/`, not inline in the component.
- User-tunable model weights are persisted locally by league, season, and draft ID. Resetting the model returns to the shared Draft utility defaults.
