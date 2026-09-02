# Draft Assistant

Back: [[Home]]

## Summary

Draft Assistant is a top-level Beta section for the `v8.0` release line. War Room connects to the active Sleeper league before the draft starts, reads the current draft room, keeps the Big Board primary, and opens a tall analytics sheet from player row taps. Phone layouts show the analytics as a bottom sheet; tablet and desktop layouts render it inline inside War Room where the board panel used to live. The War Room `Add` action still saves players to the user's local board, while the standalone Board view owns full board ranking, lane management, and reordering before or during a live draft. The Results route is labeled Picks while Sleeper reports the draft as pre-draft and shows the upcoming order. When the draft starts, the tab automatically becomes Results and renders a broadcast-style board of completed Sleeper picks, first pick first by default, focused on pick number, player, NFL team, position, and the drafting fantasy team.

Sleeper live draft updates are handled by polling the public draft metadata and picks endpoints. This first pass supports Sleeper `snake` and `linear` drafts only.

## Optional Draft Sync

Draft Sync is an opt-in, host-controlled feature. Set `GRIDSHIFT_DRAFT_SYNC_ENABLED=true` on the server to expose Draft Sync from the desktop Draft sidebar and the mobile app menu. The setup flow opens its own dialog so users can switch between instructions for setting up the current device and pairing another device. Leave it unset or `false` to keep Draft entirely local.

- The server stores only the minimal planning document shared by War Room and Board: saved Board membership/order, model weights, and keeper IDs. Sleeper draft metadata, picks, full player payloads, filters, analytics state, and comparison pins remain outside the synced document.
- The existing API sidecar stores the document in `${GRIDSHIFT_DRAFT_SYNC_DATA_DIR}/draft-sync.sqlite` using SQLite WAL transactions. Docker deployments should mount the configured directory to a persistent volume. A container restart or new app image preserves the document; deleting the volume does not.
- A device token authorizes sync. Pairing uses a one-time eight-character code such as `Q7XM-4K9P`, expires after the configured TTL, and is associated with the connected Sleeper user ID. The Sleeper ID is an identity check, not a secret.
- Local Draft edits render and persist immediately. Writes are debounced after changes, while visible War Room and Board surfaces poll for a changed server revision every two seconds using conditional requests. Polling pauses when Draft is inactive, hidden, or offline.
- Offline edits remain local and queue for retry. Authorization failures require pairing again. Revision conflicts preserve both copies and are resolved from the Draft Sync dialog without silently overwriting a Board.
- The server database is durable persistence, not an automatic off-site backup. Hosters should back up the Docker volume containing the SQLite file if they need recovery after volume deletion.

## Results View

- Route: `/draft/results` (`draftView === 'results'`, registered in `appRoutes.js` `DRAFT_VIEWS` and `DraftSubNav.jsx`). `DraftAssistant.jsx` dispatches `DraftResultsView`. Legacy `/draft/draft-order` routes normalize to `/draft/results`.
- `DraftResultsView` reuses the same Sleeper draft sync scaffold as War Room and Board — `resolveActiveDraftId` → fast `getDraft` metadata checks, event-driven `getDraftPicks`, and slower `getDraftTradedPicks` ownership refreshes. Live draft-room Sleeper calls use `cache: 'no-store'` plus a per-request cache-busting query parameter so browser or upstream cache layers cannot hold pause/resume changes for a stale 20-30 second window. Live rooms check Sleeper draft metadata every 1 second so pause/resume and clock changes are reflected quickly. Clock-only metadata is published through a small `useSyncExternalStore` subscriber used by `LiveDraftStatusBanner`; it must not be promoted back into parent Draft view state, because that makes every one-second clock poll re-render Results and Board. Pause/resume flips update only the banner clock state unless a pick, draft ID, timer setting, or terminal/pre-draft status changes, so tab focus does not rebuild the full Draft model. Pick refreshes run on initial load, actual pick/timer/draft transitions, local clock expiry, or a 5-second safety interval. Traded-pick refreshes run on initial load, draft changes, or a slower safety interval.
- While Sleeper reports pre-draft, the tab is labeled Picks and the view renders the Sleeper draft order with traded-pick ownership applied. After the draft starts, the tab is labeled Results. Once completed picks exist, rows are completed picks only (`normalizedPicks` with a `playerId`), sorted by overall **ascending** (first pick first) by default. The view can reverse the order, filter by fantasy team through a checkbox dropdown, and filter by position chips. The user's picks show the actual fantasy team name with a scoped "Your Team" marker rather than replacing the team name with "You". Tapping a row opens the player via the shared `onViewPlayer` handler.
- During a linked-year switch, Draft content waits until the loaded league season matches the selected season. This prevents completed historical picks from being synchronously rebuilt against the next season while the target league snapshot is still loading.
- Results renders the order and completed-pick rows from draft metadata/picks first. It only loads the Sleeper player DB, LeagueLogs market data, and completed-season stats after completed picks exist, then uses `buildDraftResultsViewModel` to enrich drafted rows with player identity details while keeping the row UI focused on who picked which player and when.
- Draft header: the shared `DraftStatusBanner` renders the broadcast-style live/paused state, the team on the clock, the next team up, and a likely pick for the on-clock team; the user's next upcoming pick is a compact summary line below the main banner. Before the draft, the same header shows Sleeper's scheduled `start_time` plus a local countdown when the league has a future draft date/time set; it stays hidden when no schedule exists, when the scheduled time has passed, or when Sleeper no longer reports `pre_draft`. `useDraftPickCountdown` seeds a local browser countdown from Sleeper's `pick_timer`, `last_picked`, and `metadata.elapsed_pick_timer`, then ticks locally with a monotonic browser clock. It only resyncs when a metadata poll reports a status/pick/timer change or clock drift above the threshold. Sleeper `paused` draft rooms keep the banner visible with a PAUSED badge and frozen time remaining. Untimed drafts hide the live pick countdown. The banner serves the active Draft views, so the scheduled start or live light/clock appear in Results when relevant.

## Board View

- Route: `/draft/my-board` (`draftView === 'my-board'`, registered in `appRoutes.js` `DRAFT_VIEWS` and `DraftSubNav.jsx`). `DraftAssistant.jsx` dispatches the shared board data view in Board mode.
- Uses the same local storage key as War Room: `draft_assistant_position_board_v2:<leagueId>:<season>:<draftId>`. War Room and Board therefore show the same saved board rows, saved overall order, availability state, LeagueLogs market ranks, and drafted-player owner markers.
- Saved-board players drafted during the live draft keep owner context on the board. Rows should show `Drafted by You` with the user-pick accent when the user's roster made the pick, or `Drafted by <fantasy team>` when another roster selected the player; do not collapse both states into a generic `Gone` badge.
- Desktop layout is viewport-locked: the Available rail, each position lane, and the roster tray live inside one fixed-height workspace so long player lists scroll internally instead of pushing the roster tray down the page. Board lanes have a content-safe minimum width, and every card reserves the same identity, metric/action, and pick-status tracks so labels never change a card's height.
- War Room and Board build the full candidate model outside the render phase and keep the page in a non-interactive "Preparing" state until the first usable model is ready. Matching model builds are cached in memory across Draft tab switches so returning from Results can paint immediately while fresh async data revalidates. Do not move `buildDraftAssistantViewModel` back into render-time `useMemo`; it can paint the UI and then block the main thread while ranking the full Sleeper player pool.
- The Available rail can be resized horizontally on desktop. The board lanes keep their own horizontal scroll, while each lane stack owns its vertical scroll.
- Mobile exposes Board view, card-label, and bye-conflict controls directly above the workspace; it does not hide those two controls inside a submenu. `View Available Players` opens the Available drawer, shows one active position lane at a time, favors tap controls over drag-only interaction, and fixes the roster tray above the bottom navigation with safe-area padding.
- Standalone Board layout is container-driven: the workspace shell uses `@container draft-board-workspace` and board-level sizing variables so lane/card dimensions respond to the actual available Draft content width rather than a viewport-only desktop cutoff.
- Drag/drop can add players from Available into eligible lanes and reorder within a lane. Player cards expose a dedicated grip, use a stable card preview while moving, highlight eligible or invalid lanes, and show an exact before/after insertion marker. A polite ARIA live region announces pickup, eligible destinations, the current destination, the drop result, invalid drops, and cancellation without using deprecated grabbed states. A player cannot be dropped into a position lane that is not present in that player's Sleeper fantasy positions. Add, move, and remove buttons remain available so the board is not drag-only.
- The desktop Available rail uses a visible resize grip and remains keyboard-resizable with Left and Right Arrow keys. Player cards themselves are not resizable, so they do not show selection resize handles.
- Board can toggle between Positional and Overall ranking. Overall is an editable saved order, not a temporary market sort. Positional lanes are derived from the saved overall order, so moving two same-position players in Overall changes their positional order, and moving two players within a position swaps their saved overall slots in the background.
- Projected Roster is built from current Sleeper roster players plus the user's live draft picks. Dedicated position slots always fill before any flex slot, regardless of the source roster-position array order. Flexible slots then fill from narrowest eligibility to broadest (for example WR/RB before RB/WR/TE before Superflex), with each flex comparing its eligible saved Board lanes by overall Board rank. Locked-player overflow follows that same flex specificity order, with overflow bench cells used when every declared roster slot is already filled. Bench slots remain open because they have no single positional priority. Flex labels support standard Sleeper/ESPN aliases plus compound labels such as `QB/WR/RB/TE FLEX`. Locked players use the shared team-gradient, headshot, and team-logo row treatment, display their bye week, and carry a compact padlock glyph; a separate warning glyph appears only when their bye overlaps another locked roster player.
- Bye week is an optional Board card metric for both the Available rail and saved Positional/Overall lanes. Conflict highlighting is a separate presentation toggle: managers can show bye weeks without highlights, or highlight conflicts while another card metric remains selected.
- Still-available saved Board targets compare with one another in every league format, excluding targets already drafted by another manager. Because saved targets represent alternatives the manager may select, these conflicts are symmetric: both still-available saved targets in the same conflicting pair receive the warning. Format-specific commitments are then added to that shared reference set. Dynasty adds the manager's existing roster plus their own completed picks in the active draft. Keeper adds commissioner-assigned keeper picks plus the manager's subsequent completed picks; other holdovers do not enter the reference set merely because they remain on the roster. Redraft adds the manager's own completed picks.
- Any same-week overlap in the active format's reference set is a conflict. An overlap at the same normalized exact position receives stronger severity; a different-position overlap remains a standard warning even when the players share FLEX, SUPER_FLEX, or IDP flex eligibility. Shared flex compatibility never elevates severity.
- Bye and conflict treatments are advisory UI only. They do not change Draft Rating, recommendations, sorting, saved overall order, position lanes, roster need, or drag/drop eligibility.
- Keeper toggles are stored locally with `draft_assistant_roster_keepers_v1:<leagueId>:<season>:<draftId>` and only affect roster-tray highlighting.
- Scrollable board regions show arrow controls in addition to native scrolling.
- The Available rail and Big Board search accept player names, jersey numbers, position names or abbreviations, and NFL team names, cities, nicknames, or abbreviations in any order. Recognized terms combine with AND logic, so `gb rb` finds Green Bay running backs while the existing position, availability, scope, and eligibility filters remain active.

## War Room Analytics Sheet

- War Room renders the Big Board as the primary surface. Tapping a player row opens `DraftPlayerAnalyticsSheet`; tapping the row `Add` action stops row propagation and only adds that player to the saved board. The same analytics component renders as a phone bottom sheet or an inline tablet/desktop panel depending on viewport width.
- The analytics sheet uses existing Draft Intelligence signals only. It does not fetch new data, change scoring/model logic, persist compare state, or modify the saved board schema.
- The hero shows player identity, position/team, Draft Rating, a `Pin Compare` control, and a prominent Statistics CTA. The CTA uses the existing Draft-to-Statistics handoff so Statistics opens in Fantasy mode with Draft as the back context.
- The first analytics block combines compact fantasy signal bars with a Reaviz scatterplot. Default axes are Market on X and Rating on Y, normalized to 0-100 so mixed signals stay readable.
- Scatter peer scope defaults to same-position players from the current Big Board scope, independent of search text. It renders up to 180 peer points and always includes the focused player plus any pinned comparison players.
- Axis chips are exactly Rating, Market, PPG, Workload, and Need. Missing values are counted and shown as unavailable rather than guessed.
- The compare tray is session-only UI state and caps at four pinned players. Mixed-position comparisons show normalized shared bars and raw position-aware rows for PPG, market rank, workload, roster need, schedule, tier, and trend.

## File Map

```
src/components/
  DraftSubNav.jsx

src/components/draft/
  DraftAssistant.jsx
  DraftAnalyticsScatterChart.jsx
  DraftPlayerAnalyticsSheet.jsx

src/utils/draftAssistant/
  analytics.js
  byeConflicts.js
  search.js
  byeWeeks.js
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
6. Draft derives bye weeks from the upcoming NFL schedule only when the schedule identifies the selected draft season and passes the complete-season contract: 18 regular-season weeks, 32 teams, 272 unique games, 17 games per team, no duplicate team appearance within a week, and exactly one missing week per team. The team's sole absent week is its bye. A valid Sleeper `bye_week` can remain a card-display fallback while the schedule is unavailable, but conflict analysis requires the complete matching schedule and fails closed on missing, partial, malformed, or season-mismatched data.
7. `projections.js` extracts season projection totals from Sleeper player payloads when present, but War Room labels derived past production as PPG/Rating rather than fabricating true projections.
8. `rosterNeed.js` estimates open starter and bench pressure from `league.roster_positions`.
9. `index.js` attaches Draft Intelligence signal groups to every candidate: `rank`, `scoringFit`, `workload`, `teamContext`, `schedule`, `draftRoom`, and `draftModel`.
10. `recommendations.js` turns market/search rank, past production, scoring fit, roster need, and personal board rank into explainable pre-draft recommendation rows.
11. `analytics.js` derives War Room snapshot rows, normalized scatter points, axis metadata, and compare rows from the existing candidate model.
12. Drafted players are excluded from the candidate pool, so `index.js` separately enriches each drafted player into `draftedCardsById` (a `Map` keyed by Sleeper player ID) using the same signal builders. This feeds the Results view without changing the candidate pool or War Room.

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
- `teamContext` appears in the UI as Team Environment. It uses available team usage totals for pass-play rate and position-specific environment hints such as QB receiving support or RB rushing context. Its preferred bye week comes from the authoritative, season-matched complete upcoming schedule described above; the top-level candidate contract mirrors the resolved value as `byeWeek` for Board cards and conflict inputs.
- `schedule` pairs two deliberately different seasons: fantasy points allowed per game by position come from the most recent **completed** season (the only real production data that exists at draft time), while the opponents come from the **upcoming** season's schedule in `public/season-schedule.json` — the same asset behind Statistics › Schedule, loaded through `useUpcomingScheduleMap`. Never derive upcoming opponents from the prior season's schedule map. The window is every week still to be played (all 18 for an offseason draft, the remaining weeks for an in-season draft), not a fixed leading slice. Tiers are assigned by **percentile within position** across all 32 teams — Very tough / Tough / Neutral / Favorable / Very favorable — because averaging a full slate pulls every team to within a few points of the league mean and fixed cutoffs collapse the whole board into one bucket. The mechanic is symmetric: every player-week credits the OPPONENT with the points that player scored, bucketed by the scorer's position. For an offensive player that reads as "how weak is the defense they face"; for an IDP or DST player the same table reads as "how generous is the OFFENSE they face" — sacks surrendered, turnovers, and low scoring output. Higher is favorable in every case, so tiering direction needs no special-casing, and defensive schedule strength is genuinely its own calculation rather than an echo of the team's offensive outlook. It is empirical, not modeled: O-line weakness enters through sacks actually surrendered, not as an explicit line-quality input. Positions are discovered from the league's own weekly stats rather than hardcoded, so kickers, team defenses, and IDP slots keep a schedule signal in leagues that roster them — never restrict the points-allowed table to skill positions. A position covered by fewer than 8 teams stays unavailable rather than tiering off noise. `scheduleStrength.js` owns this; if the data is absent, the signal stays unavailable instead of guessing.
- `draftRoom` keeps board rank, roster need, picks until the user, manager pressure, and recent position runs together for Big Board and recommendation UI.
- `draftModel` produces the user-facing Draft Rating by combining market rank, past PPG, scoring fit, roster need, and schedule using locally persisted user weights. The schedule component is scored from the percentile, not the raw index, so it contributes the same 0–100 spread as every other component. A missing schedule signal must score `null` (dropped from the weighted average), never `0`.
- `onClockRecommendation` is computed for the current pick owner using the standard default Draft model weights, that roster's current needs, and the available candidate pool. It intentionally ignores local model slider changes so the banner stays a neutral GridShift read.

## Product Rules

- Draft Assistant is a top-level Beta app section, not a Companion subview.
- `War Room` renders its full tools only while Sleeper reports the selected draft as `pre_draft`. For live, completed, or historical post-draft league years, the War Room route remains selected and revisitable but shows a centered, season-aware unavailable explanation until the user chooses another Draft view or returns to a pre-draft year. `Board` stays active during `pre_draft`, `drafting`, and `in_progress` draft states. `Results` stays active before, during, and after the draft.
- The shared Results route is labeled Picks while Sleeper reports pre-draft, then changes to Results when the draft starts. Picks shows the upcoming order; Results shows completed picks first pick first by default. Completed pick rows prioritize pick number, player photo, player name, NFL team, position, and drafting fantasy team over Draft Rating, Sleeper rank, or Tier because the post-draft view is a historical pick record rather than an active recommendation surface. When Insights are enabled, Draft Rank is rebuilt from that league's actual positional pick order (not the current market rank), while Season Finish uses the matching draft-year result. Each Outcome keeps a concise hover summary of the overall pick plus positional draft rank and season finish; the separate tappable `i` control beside Insights explains the Boom/Strong/Even/Weak/Bust calculation. The tolerance band is the greater of three spots or 15% of the draft rank, and `Even` is deliberately neutral, including a top positional pick who finishes a few spots lower.
- War Room is for Big Board review, quick Add, analytics, and comparison. Full saved-board ranking and player movement belong in the standalone Board view.
- The v8.2 feature tour follows the same draft-status presentation and always names the selected league year. It distinguishes the latest linked league year from historical league history, states whether the selected draft is pre-draft or in Results, previews future Results with tour-only placeholder teams and players, and points back to the latest year when the tour opens on a past season.
- The scheduled draft date/time, live red light, on-clock team, next team up, likely pick, pick countdown, and compact user-next-pick summary live in the shared `DraftStatusBanner`. Scheduled-start countdowns may only render from a future Sleeper `start_time` while the draft is still `pre_draft`; do not invent a schedule when Sleeper has no draft date/time. The running live pick countdown is browser-local between Sleeper polls and is resynced from `pick_timer`, `last_picked`, and `metadata.elapsed_pick_timer` when the server clock changes or drifts. The fast metadata lane must not force full picks/traded-picks refreshes every second; picks confirm actual selections, while the browser keeps visible time between Sleeper confirmations. Do not fabricate a timer when Sleeper does not provide enough clock data.
- Player rows must use the shared Companion row system for player photos, team gradients, team logos, position badges, and contrast.
- War Room and Board player rows surface Sleeper availability designations with body-part or brief injury-note context when Sleeper provides it. Narrow/mobile layouts keep the compact designation, and both draft player pools expose an Availability filter built from the designations present in the loaded player data.
- War Room and Board candidate pools must include only players who can fill at least one non-bench position in `league.roster_positions`. Flex slots expand to their eligible offensive or IDP positions; bench, reserve, IR, and taxi slots do not make otherwise unsupported positions draftable. Apply this before rankings, recommendations, analytics, position filters, and saved-board rendering so unsupported players cannot influence any Draft decision surface.
- Bye conflict analysis fails closed. If the selected draft season does not have one complete authoritative regular-season schedule, conflict highlighting remains inactive; do not fall back to a different season or infer a week from an incomplete slate. A valid current Sleeper `bye_week` may still appear as a neutral card-display fallback, but it cannot enable or drive conflict warnings.
- The bye metric and conflict-highlighting toggle are independent display choices. Highlight state must remain understandable without color alone and identify the conflicting week and reference players in accessible text. Every same-week overlap warns, but only the same normalized exact position elevates severity; shared flex compatibility does not.
- Bye conflicts are presentation-only and must never enter Draft Rating components, recommendation ordering or why copy, roster-need scores, Board persistence/order, or candidate eligibility.
- If Sleeper does not expose usable season projection totals, rank from LeagueLogs Market Index data when available and clearly label it as Overall or Market, not ADP. Do not invent fallback projected points.
- Treat oversized Sleeper `search_rank` values as unavailable rather than market signal. If no market or usable search rank exists, derive a local Draft pool rank from the visible candidate pool so Big Board cards never display sentinel values like `9999999`.
- Draft intelligence should use the most recent completed season for PPG, volume, trend, team environment, and defensive points allowed. Do not switch to current-season stat logic for this pre-draft surface. Upcoming opponents are the one exception: they must come from the draft season's own schedule.
- If workload, schedule, trend, or team-context data is missing, render the metric as unavailable. Do not infer unverified values from player reputation or visual placeholders.
- Availability pressure belongs to the future live Draft Room surface. Do not let it affect pre-draft Draft Rating, recommendation order, or why-line copy.
- LeagueLogs Market Index is an optional free enrichment source with no API key. It covers offensive skill positions only, so K, DEF, and IDP rows must keep working without market values. Any surface that displays LeagueLogs data must show the returned attribution link.
- Personal priority is stored locally as per-position membership plus a saved overall ranking per league, season, and draft ID. Positional rank order is projected from that overall ranking.
- War Room comparison pins are session UI state only and must not be written to localStorage.
- Board position lanes must use the shared Companion position colors from `companionAssetVisuals.js`.
- Overall Board ranking is saved local board state. Do not add temporary sort fields that make Overall diverge from the user's manual ranking.
- Upcoming pick ownership must come from the current pick owner. Use `draft/<draft_id>/traded_picks` to resolve acquired picks before calculating manager need pressure.
- War Room should not carry a separate pick-order sidebar; live upcoming picks belong in the banner, and full pick order / pick review belongs in Results.
- Recommendation weights belong in `src/utils/draftAssistant/`, not inline in the component.
- User-tunable model weights are persisted locally by league, season, and draft ID. Resetting the model returns to the shared Draft utility defaults.
