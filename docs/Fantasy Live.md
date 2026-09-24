# Fantasy Live

Back: [[Home]]

Implementation reference for the Fantasy Live view (`companionView: 'live'`): the hero, pace chart, play feed, win probability, and the league-derived play filter. File routing lives in [[Where To Edit]]; server/provider architecture lives in [[Live Data Server Architecture]].

## File Ownership

- `src/components/companion/CompanionLive.jsx` — route state, live session gate, the matchup chip rail (scoreboard chips on the shared `CompanionSelectorRail`), and the pace/palette derivations that feed every piece below. Also owns filter state, counts, and applying the play filter.
- `src/api/liveApi.js` — browser-to-sidecar live session, games, stats, and plays requests.
- `server/liveHandlers.js` — server-only BALLDONTLIE credential, league allowlist/session checks, proxy caching, and current downstream request guard.
- `src/components/companion/live/LiveHero.jsx` — split hero: team gradients on the diagonal, edge scores, top-three scorer lists, neutral win plate, odds rail.
- `src/components/companion/live/LivePlayerSheet.jsx` — the drill-in record card: framed portrait, pace strip, Scoring / Box score / Plays.
- `src/components/companion/live/LivePaceChart.jsx` — scoring vs projected pace, milestone selection, zoom/scrub.
- `src/components/companion/live/LiveFeed.jsx` — side filter with counts and the play rows, including the pending marker, the "Stat update" label, the inline scoring-math expansion and its "Sleeper adjustment" line, plus the two-tier `LiveFeedPlayFilter` chip UI.
- `src/components/companion/live/LivePerformerRail.jsx`, `LiveVerdict.jsx`, `LiveAtoms.jsx`, `liveVisuals.js` — supporting surfaces and atoms.
- `src/utils/liveScoringFeed.js` — stat lines, explicit starter game states, complete-schedule bye proof, authoritative Sleeper final-score checks, and split snapshot deltas for the fallback feed.
- `src/utils/playByPlay/normalizePlay.js` and `src/utils/playByPlay/playStatDelta.js` — the shared BALLDONTLIE play normalizer and per-play stat attribution, owned jointly with Statistics Scores: [[Play-By-Play Normalization]]. The canonical normalizer returns every provider row; Fantasy Live's description-less drop and its `pts === 0` fantasy-relevance filter stay in `livePlaysFeed.js`.
- `src/utils/livePlaysFeed.js` — starter name matching, feed-event assembly, shared feed ordering, and the 0..1 per-game progress value (`getPlayProgress()`); routes its name index through `nflPlays/playerNameIndex.js`, its play normalization and stat deltas through `playByPlay/`, and re-exports `PLAY_MATCH_STATS`, `buildPlayStatDelta`, `buildTeamDefensePlayDelta`, `estimatePlayPoints`, and `getPlayEventClassification` for existing importers.
- `src/utils/livePlaySplitting.js` — turns an aggregate stat change between polls into separate fantasy-valued play stat lines.
- `src/utils/liveReconciliation.js` — the pure engine that reconciles those plays against Sleeper: `reconcileLivePlays(previousState, inputs)` returns each player's `sleeperPoints`, `pendingPoints`, `displayedPoints`, `displayedEventPoints`, `unattributedPoints`, `adjustment`, their plays with `status`/`displayPts`, any `stat-update` fallback rows, and one flat newest-first `feedEvents` list. No clock reads and no I/O — `now` comes from the caller, so replay steps it on the slate clock and connected live on wall time.
- `src/utils/livePace.js` — pace curves (`buildPaceSeries()`), verdict copy, featured starters, and performer ordering.
- `src/utils/fantasyTeamIdentity.js` — per-roster identity colours.
- `src/utils/liveWinProbability.js` — player-level outlooks, calibrated odds, explanations, and persisted replay snapshots; `explainWinProbability()` and `resolveStarterProjection()` (the single projection source shared by pace and odds).
- `src/data/liveWinProbabilityModel.js` — generated production coefficient contract.
- `src/utils/liveFeedFilters.js` — which filter groups and types a league gets, and what matches.
- `src/utils/liveDemoTimeline.js` and `src/utils/liveDemoPlays.js` — mock play-by-play generation.
- `src/index.css` — the `.fl-*` block, including `.fl-playfilter*` chip styling.

### Live Access Session

The browser requests `/api/live/status?leagueId=<selected Sleeper league>` so the server can report whether that specific league is allowlisted. An allowlisted league with no `GRIDSHIFT_LIVE_ACCESS_CODE` establishes the required browser session automatically; a configured access code remains an explicit second gate and keeps the enable prompt. The server still requires the encrypted session cookie on every games, stats, and plays request, and status does not treat a session for another league as active for the selected league.

## Hero

Each side's "Top scorers" block always shows the three leading names and point totals, and every scorer opens their player breakdown. Faces are ESPN cut-out headshots when the hero itself has enough inline room and the spotlight strip below that. Each half shows its top scorer in the foreground and adds the second- and third-highest scorer as the hero widens. The ranked portrait group and scorer list crossfade when their order changes. Both top scorers must resolve before cut-out mode activates, so a matchup with a missing featured headshot drops cleanly to spotlight instead of substituting a team logo; missing secondary cut-outs do not remove their score line.

Sleeper leaves `espn_id` null for roughly three quarters of startable skill players, so `CompanionLive` folds `espnIdOverrides` (the context's ESPN roster cross-reference) into each starter's `espnId` before anything resolves imagery. Any new surface that shows a player photo should do the same.

## Player Drilldown

`LivePlayerSheet.jsx` is the drill-in record card. On every layout it replaces the pace graph inside the shared analysis slot while the performer list and play feed remain available; closing it restores the graph.

## Pace Chart

Drag to rewind the day, pick a milestone to select and expand that exact play in the feed, or select a play in the feed to highlight the matching chart marker. A chosen moment persists across the chart and hero until another selection or Back to live. The feed jumps on pointer release, never mid-drag. Milestone selection clears a player-only feed focus and widens an opposing side filter to Both when needed so the target row cannot remain hidden.

Hovering or focusing a milestone shows the scoring player's name beneath the compact clock/action readout. Player identity comes from the matchup's `entriesById` map in `CompanionLive.jsx`; keep it optional so fallback chart data and unresolved players still render cleanly.

### Axis Semantics

The production chart and feed use a **kickoff-ordered full-week slate axis**, not a raw per-game clock or refresh timestamp: every game returned for the selected season/week receives one consecutive 0..1 segment in kickoff order, including games unrelated to the selected fantasy matchup. This keeps a late live game after an earlier completed game and preserves the Thursday-through-Monday shape even when only one game is active. Play/stat requests may remain limited to matchup-relevant games; the axis is deliberately broader than the fetched event set. `getPlayProgress()` (`src/utils/livePlaysFeed.js`) still records where a play happened inside its own game for pace and win-probability calculations; `CompanionLive` maps it to the shared axis before `buildPaceSeries()` (`src/utils/livePace.js`) builds the cumulative scoring curve and milestones. Solid actual-score paths connect each team's scoring dots directly, including distinct same-moment changes, and hover continuously samples the visible segment between those dots; win probability remains independently interpolated. Every fantasy-relevant provider play or split snapshot-delta play gets its own feed row. A shared NFL snap can therefore produce separate rows for each rostered contributor, and zero-value/non-fantasy changes are omitted; the chart consumes those same individual rows. Connected BDL plays are reconciled against Sleeper, which never writes a row of its own. Defensive roles are attributed only from explicit provider evidence and the resolved defensive team; generic mentions fail closed. Each play is scored from its own parsed stat delta with the league's scoring settings, and a play stays **pending** until Sleeper's own numbers account for it — by stat line where a fresh one exists, otherwise by points — at which point it becomes **confirmed**. Pending rows carry a small marker; confirmed rows carry none. An unconfirmed provider play remains in reconciliation state for possible reinstatement but is omitted from the scored feed and chart; its original estimate is never rendered as a visible `0.00` row. A play's own `pts` is never rewritten: the residual (Sleeper's points minus the confirmed plays' points) is pinned to that player's latest confirmed play as a separate `adjustment`, and `displayPts = pts + adjustment` is what the feed headline, the chart and the hero consume. The residual may be negative, because stat corrections are. **Displayed player total = displayed provider rows + displayed stat-update rows + residual adjustment = Sleeper's authoritative player total plus still-pending play points**; `displayedEventPoints` and `unattributedPoints` make that invariant inspectable. The side total is the sum of those, and the hero, performer rail, pace chart, verdict, player sheet and feed header all read that one number. Only the settled final-official branch replaces it with Sleeper's own team total. One fallback survives: when Sleeper's stat line shows stats no play explains — free tier, a parser miss, a coverage gap — a single `source: 'stat-update'` row per unexplained batch appears after a grace period, labelled "Stat update", and is retired incrementally if matching plays arrive later. Replay prefers a complete persisted v3 snapshot recorded at or before the selected play. When none exists, the canonical engine reconstructs each starter independently from the points observed by that moment and that starter's own kickoff/game-progress timeline. `livePace.js` must not derive a second probability formula. Only the final chart point receives the current authoritative score and live snapshot directly, keeping the chart, hero, verdict, and explainer identical; in replay that close must equal the accumulated event total so it cannot introduce a corrective wall at NOW. Feed anchoring uses the same axis (`anchorProgress`), so any new event source must carry a `progress` value or it cannot be placed. Plays carry their own game progress and are mapped to the slate segment; a stat-update row has no clock at all, so `CompanionLive` falls back to the starter's team → game → pace progress before it can be anchored.

Leader visuals use a separate eligibility rule from feed/chart participation: only current fantasy totals greater than zero enter top-scorer text, hero portraits, spotlight cutouts, and the performer rail. Zero-point starters therefore do not appear as leaders, while negative events remain valid feed/chart contributions. If a side has no positive leader, the existing empty/no-scoring state remains authoritative. The Live record also uses a shared finality contract: a week counts only when every non-bye starter in the matchup has final-game evidence (or the bounded stale-schedule fallback) and complete official Sleeper starter points. A live total by itself never settles the current week, and ties/custom commissioner points are applied once.

Polling follows from that division: Sleeper's matchup `players_points` refreshes on every live tick (5s paid, 60s free — the same cadence that pulls BDL games and stats, and in replay the synthesized stream is re-sliced on each tick), while `getWeeklyStats(season, week)` — the reconciler's stat-line evidence — is polled every 30s only while a game involving a matchup starter is live, and fetched once otherwise. Stat lines are trusted for confirmation for 90s after a successful fetch and fall back to points-only confirmation when stale.

### Layout, Zoom, And Scrub

The chart always reserves the complete 0..1 week axis. Actual score lines and their filled areas stop at NOW, while the neutral future field and full-week projection rays remain visible; do not renormalize partial-week data to the full plot width. On desktop, SVG height is derived from the measured chart viewport width and clamped between 240px and 420px, so the chart grows proportionally across the workbench and recomputes when a player drilldown changes the available width. Mobile keeps the compact 128px plot. Chromium `ctrl+wheel` trackpad pinch events and Safari gesture events continuously expand only the horizontal time axis from 1× to 3×, with animation-frame batching and the gesture midpoint held in place. The View buttons remain discrete shortcuts to useful 1×, 1.5×, 2×, and 3× anchors. `.fl-chart__viewport` owns horizontal scrolling and contains overscroll so the document keeps its own scroll position. Fit restores the full-week view. At fit width, horizontal drag scrubs the exact X-position; once zoomed, touch panning belongs to the chart viewport and a tap selects that point on the visible path unless it lands inside a score dot's snap radius.

Everything drawn in that SVG is `pointer-events: none` except the milestones, so the scrub indicator drawn last cannot swallow a milestone click. The tracking line follows the pointer's exact X-position and continuously samples each team's visible path there. It snaps to a scoring milestone only inside that dot's two-dimensional hit radius, so crossing the same X-position above or below a dot does not make the tracker jump. Team paths use each point's scoring-side metadata and retain distinct same-X totals; every rendered score dot must sit on its own team's path.

### Mock Play-By-Play

Mock play-by-play uses the same kickoff-ordered segment axis. `src/utils/liveDemoTimeline.js` reads every game returned for the selected week, removes days without games, and gives each game one consecutive chart segment in kickoff order. Day ticks therefore adapt to Thanksgiving, Christmas, and Saturday slates while busy game days receive proportionally more navigable room. Generated mock plays are distributed through all four quarters inside each segment. `src/utils/liveDemoPlays.js` adds a reception/fumble-return touchdown that credits an offensive starter and the opposing fantasy defense at the exact same chart position; those are separate feed rows with separate scoring breakdowns, using the active league scoring settings for both. Mock generation covers every scheduled game in the full-week axis so late windows such as Monday night cannot be removed by the real play-by-play eight-game request budget.

## Desktop Workspace Layout

On desktop the matchup selector is the top sticky layer, but the chart/feed workspace moves normally with the document. When the main pane is at least 720px wide, that workspace becomes a shared row: the independently scrolling play feed occupies the narrower left rail and the performer/analysis surface occupies the wider right side. The performer list always sits above the analysis slot; selecting a player swaps the pace graph for that player's drilldown without moving or hiding the feed. CSS size containment makes this right column define the row height so the feed cannot stretch the page; narrower main panes return to the same components in a linear stack. Once the full hero scrolls away, the chart header crossfades from chart context to a compact score/odds summary without changing height. Chart selection positions the matching row directly beneath the feed's own sticky filter without moving the document.

## Matchup Navigation State Boundary

Matchup navigation is a state boundary. Before `matchupIndex` changes, Fantasy Live clears expanded feed plays, persisted chart moments, chart/feed anchors, side and player filters, player drilldowns, and saved mobile feed scroll so returning to a matchup always starts without stale selections.

## Win Probability

The hero's win-probability plate opens an explainer built from `explainWinProbability()` (`src/utils/liveWinProbability.js`): each side's live points, what its unplayed starters still project to add, the projected margin, and the swing still available. Each starter is evaluated against the share of their pregame target expected by that point in their NFL game. Hover and keyboard focus open it on pointer devices; tap toggles it on touch. Touch fires `focus` before `click`, so both handlers check the last pointer type — changing one without the other makes the panel flicker shut on tap.

Any change to a starter's projected number belongs in `resolveStarterProjection()` (`src/utils/liveWinProbability.js`) so the odds and the pace lines stay in agreement.

`src/data/liveWinProbabilityModel.js` is generated from the local historical calibration workflow and is the only production coefficient contract. Do not ship league IDs, raw Sleeper payloads, or nflverse rows. Unfinished probabilities stay inside the model's open interval and render with tail labels; exact 0%/100% requires every starter to be officially final or on a bye proved by a complete schedule, followed by a fresh no-store Sleeper matchup response containing both final team totals and every starter's official points. Incomplete final responses retry quietly and remain projected.

## Week Derivation

The week is derived from the shared `SleeperContext` `/state/nfl` snapshot, not selectable: Fantasy Live shows a matchup only while Sleeper reports an active NFL regular-season week. That league-week label remains visible between NFL game windows; the red live pulse and "matchup games live" count appear only when a game involving a starter in the currently selected fantasy matchup is in progress. Preseason, offseason, and historical-league states must stay weekless rather than falling back to the league's frozen `last_scored_leg`. Historical weeks and their play history belong to Fantasy Matchups (`CompanionMatchup.jsx`, which owns `MatchupWeekPickerModal`). Do not add a week picker back to Live.

## Play Filter

The feed's play-type tiers and the pace chart's dot filtering.

| Concern | File |
| --- | --- |
| Which groups and types a league gets, and what matches | `src/utils/liveFeedFilters.js` |
| The two-tier chip UI | `LiveFeedPlayFilter` in `src/components/companion/live/LiveFeed.jsx` |
| Chip styling | `.fl-playfilter*` in `src/index.css` |
| Filter state, counts, and applying it | `src/components/companion/CompanionLive.jsx` |

The filter set is **derived from the league**, never hardcoded: a group or type appears only when `activeScoringSettings` (or a roster slot) makes it scorable, so a kickerless league has no FG chip and a redraft league has no Defense group. Adding a type means declaring what has to score for it to exist.

Filters read an event's `mechanism` (the football action) alongside its `kind` (the fantasy result), so a rushing touchdown belongs to both Rush and TD. "Big play" is pegged to the cheapest touchdown the league pays for, so it means the same thing at 4-point passing as at 6.

The chart filters **marks only**. Lines are built from `points` and are never touched, so narrowing to touchdowns changes which dots are drawn without altering the shape of the week.
