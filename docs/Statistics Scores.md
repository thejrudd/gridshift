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

The drilldown contains Overview, Team Stats, Players, Scoring, and Play-by-Play. Player statistics use full tables on wider screens and priority cards on mobile. For provider-backed games, the Scores sidecar aggregates BALLDONTLIE's game, team-stat, player-stat, and play responses into the same normalized detail contract used by the development fixture. BALLDONTLIE play rows are grouped into display drives by the team that ran each play; the provider supplies individual plays rather than a documented drive object. See Drive Grouping below. ESPN-only scorebugs remain visible and live-updating but do not expose a drilldown because ESPN does not supply the required detail contract.

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

## Drive Grouping

The provider has no drive object, so drives are derived from the play list. A play's `team` names whoever holds the ball **after** the play, which on a kick or a turnover is the receiving side — so grouping on it filed every possession's last play at the top of the next drive, producing drives that spanned two possessions and were almost all labelled "Drive". Grouping goes through `getOffenseTeam()` instead, which is the single owner of that correction.

The rules that follow from it:

- A drive **ends** with the punt, field goal, missed kick or turnover that gave the ball up, and is named for that play. A scoring drive is named for its scoring play, because the ensuing kickoff belongs to the team that just scored and sits at the end of their drive.
- Halftime always breaks a drive, even when the same offense is on both sides of it. The provider's own end-of-half marker is filtered out before grouping, so the period is the only thing left to split on.
- The kickoff that opens a half has no drive of its own to end, so it leads into the possession that follows it rather than standing alone as a one-play drive.
- `playCount` is the offense's snaps. Clock stoppages and the ensuing kickoff stay in `plays` — they are still drawn and still readable in the feed — but they are not counted, so a 20-play drive reads as 20 rather than 22.
- Only a drive that actually scored carries a `score`. Every play reports the running score, so taking the latest one marked every drive as a scoring drive.

## Play-by-Play Presentation

The Play-by-Play tab renders the game drive by drive. A drive header collapses to result, play count, net yards, start time, and score; expanding it reveals the drive field — every play as a lane on one 120-yard field, with team-gradient end zones, yard lines, red-zone shading, and a yard axis — followed by one row per play.

A play row is a text line (down and distance, spot, the headshots of the players involved, a plain-language sentence, an outcome tag, clock) above a trajectory strip drawing the same play on the same field. Each play type has its own silhouette: passes arc, runs travel on the ground, incompletions fall as a colourless dashed arc into a slashed ring, sacks are dragged backwards into a red wall, kicks fly and their returns come back.

Anything that put points on the board is drawn in the signature yellow, whatever produced them — touchdowns, made field goals, extra points, two-point tries and defensive returns alike. `scoring_play` is the authority, because it is the only field that separates a made field goal from a missed one and it correctly says no when a penalty wipes a touchdown out; `isScoringPlay()` falls back to the slug for feeds that omit it. A kick that missed is not a score and keeps the neutral diamond.

Penalties share that yellow but never the fill: hatched on the drive field, dashed on a play strip, and carrying their own square outcome mark. The legend shows the fill rather than the colour for exactly that reason. Moving penalties to orange was tried and reverted — it collides with the team colour on Cleveland, Cincinnati, Chicago, Denver and Miami. Expanding a row breaks the play into each player's action in order — role, headshot, name, detail — followed by the official NFL description. The Overview tab carries a win-probability line for the whole game.

The feed runs kickoff-first, matching the order a completed game is read back in. While a game is live it flips to newest-first so the most recent play is at the top, and the quarter markers are suppressed because they only make sense against an unbroken chronology.

Two spot conventions differ deliberately from the provider. The label above each strip is derived from the same geometry the strip draws, because the feed's own `spot` falls back to the *end* of the play whenever it omits the start. On kicks, direction and start spot are read out of the description entirely: the feed files punts and kickoffs under the receiving team, so its possession fields would draw them backwards down the field.

`isTurnoverOnDowns` has to reject penalties explicitly. A flag on fourth down that awards a first down reports fourth down in, first down out, and fewer yards gained than were needed — which is indistinguishable from a defensive stop in these fields. Read as a turnover it hands the offense to the other team, and since `getOffenseTeam` is shared with `groupBdlPlaysIntoDrives`, the drive broke at the flag and every play after it was filed under, and drawn attacking toward, the wrong end of the field. A play that scored is rejected for the same reason.

A handful of clubs are spelled one way on the team record and another in the official description — Cleveland is reported as `CLE` and written `CLV`, and Washington, Arizona, Baltimore, Houston and Jacksonville have the same split. Every spot parsed out of a description therefore goes through `canonicalTeam` before it is compared to the home team; without it the comparison reads the spot as the *other* team's end and mirrors it, which drew a 62-yard punt to the Cleveland 10 as landing at the Cincinnati 10. This is shared with `getKickGeometry`, which reads its spots the same way.

The play parsing, name matching, field geometry, and field/momentum graphics live in `src/utils/nflPlays/` and `src/components/nflPlays/` rather than under `statistics/`, because Fantasy Live solves the same problems in `src/utils/livePlaysFeed.js` and is expected to adopt this layer. `PlayCard.jsx` is the only Statistics-specific piece.

The drive field and the play strips share one coordinate system — a 120-yard canvas of two 10-yard end zones plus 100 playing yards, mapped by `fieldX` — which is what lets the two line up yard for yard. Kick geometry has a single owner in `getKickGeometry`, so the two views can never disagree about where a punt landed. The turf surface is the one part of the design that swaps with the theme: a dark broadcast green in dark mode, a lighter turf green in light, each with the line colour that reads on it. The light surface started far paler and was deepened — it left the yard lines close to invisible, and gave a light team colour almost nothing to read against.

### Drive playback

The drive field header carries a **Play drive** toggle that swaps the stacked overview for an animated replay of the same drive. The stacked lanes answer "what shape was this drive" in one look; playback answers "what happened, in order". The overview stays the default because playback costs time to watch.

The ball rides the vertical centre of the field rather than a ground line at the bottom, and stays on that centre line the whole way down the field. Centring it keeps the thing you are actually watching in the middle of the graphic and frees the strip underneath for the down-and-distance flag, so nothing the play does is ever hidden behind it. Centring also halves the headroom above the ball, so `LIFT_SCALE` comes down with `GROUND_Y`. The binding case is a made field goal: it ends at a lift of 1.5 and carries an apex of 1.1 on top of that, peaking near 1.95 partway through the flight, which sent the kick off the top of the canvas before the scale was measured against it rather than guessed.

Playback starts running as soon as it is switched on, and picking a play from the scrubber starts it from there — asking for playback is asking to watch, and making either gesture cost a second click to do the obvious thing was worse. It holds one play on the field at a time and runs it on the same 120-yard canvas, at the same scale, in the same orientation as the overview above it. The field never pans or rescales between plays, so field position stays readable across the whole drive. Underneath, an accumulating beat log assembles the play as the ball reaches each moment — the drop back, the throw as it leaves the hand, the catch as it arrives, the tackle where the play was blown dead — then clears for the next snap. Named actors appear as dots on the field in the order they enter the play, with only the newest labelled, because three name plates collide on a whole-field view long before three dots do.

The down and distance is painted onto the turf the way a telecast paints it: a skewed flag carrying the offense's mark and their end-zone gradient, with chevrons in the signature yellow leading toward the line to gain — the same yellow the to-gain line itself is drawn in, because the arrow and the line it points at should not be two different colours. It is anchored by its leading edge to the line of scrimmage and trails back over ground the offense has already covered, so it reads as part of the field rather than as a label sitting on top of the picture. The flag is a rectangle: a skew was tried on the theory that it would read as the camera perspective a broadcast gets for free, and on a flat field it just reads as a graphic that isn't square.

The flag is sized by its contents, not by a share of the field. A fixed width in canvas percent was tried first and is wrong twice over: it made the graphic thirty yards long, and it left the text floating in the middle of an empty plate instead of filling it. Only the leading edge is positioned; the plate grows to fit what it says, which also means the text can never be clipped to a different down and distance on a narrow field. It sits under the ball, the trail and the markers on purpose — paint is on the field, and the play happens above it.

A score is carried past the goal line into the end zone rather than stopped on it. `end` is the goal line because that is where the field of play stops and the geometry stops with it, but a ball halted exactly on the line reads as though it were stopped short — the text announces the touchdown while the picture shows the ball at the boundary. On a touchdown pass this also moves the catch: the air-yards estimate measures from the snap and knows nothing about the goal line, so on a ball thrown into the end zone it can land exactly on it, drawing the completion at the boundary with the end zone empty behind it. A pass caught short and run in keeps its catch at the catch point; a pass thrown into the end zone is caught in the end zone.

Only downs get a flag. A kickoff or an extra point has no down and distance to paint, and a broadcast doesn't lay the graphic down for them either. The same facts also open the beat log, but that line scrolls away as the play develops and reading it means looking off the field, which is the one thing playback exists to avoid.

Points get confetti at the spot they were scored — a short burst of team-colour, signature-yellow and neutral particles that fly out and then fall. Each particle carries its own vector, duration, delay and spin as inline custom properties so twenty of them share a single keyframe, and the angles come from the particle's own index rather than from `Math.random()`, so a replay of the same touchdown looks the same every time. The burst is decorative motion and is withheld entirely under reduced motion.

Playback runs on two clocks that are deliberately not the same one. The ball's travel is the animation; the stationary pauses around it are reading time. Scaling both together was tried first and is the wrong dial — it produced a play that darted across the field and then sat frozen for several seconds while the log caught up, so you could watch the ball or read the sentence but never both, and most of a drive's length was dead air.

Travel is the dominant term instead. `MOTION_SCALE` in `playBeats.js` sets how slowly the ball moves and is the dial to reach for when playback needs to be slower; the `DEAD_*` group — the pre-snap hold, the settle at a catch, the beat of stillness after the last line — is time the field is frozen and stays deliberately small. `OUTCOME_MS` covers only letting the final line land, and the gap before the next snap belongs to `holdFor`; padding both was what made the end of every play feel like a stall. Across both fixture games this lands at roughly 56% of playback being motion, with a median drive around a minute at 1x, and the transport's 0.5x/1x/2x multiplies both clocks together.

Two unit tests hold the pacing in place. One asserts no two consecutive beats land less than a second apart, because the failure pacing exists to prevent is two lines arriving in the log at once and neither being read — it has caught this twice, both times on a play where the ball had nowhere to travel between two beats and the pause was the only thing separating them. The other asserts a completed pass, the densest common play, runs long enough to follow and not so long it drags.

The clock lives in a ref, and everything that ends a play — stopping on the last one, advancing to the next — happens in the body of the animation frame rather than inside a state updater. This is load-bearing rather than stylistic: a React state updater must be a pure function of the previous value, React is free to call it more than once, and StrictMode deliberately does. Advancing the play index from inside a `setElapsed` updater therefore ran twice and played every other play — 1, 3, 5 — which looked like a data problem and was not one.

Transport is play/pause, step back and forward, 0.5x/1x/2x, and a chip per play that jumps straight to it. Scoring plays and turnovers are outlined in the chip row so the drive's turning points are findable without playing through it. Plays auto-advance with a short gap, held longer on a score, a turnover, or a converted first down. Under `prefers-reduced-motion` the same timeline is sampled only at its beats: the text advances on exactly the schedule it would otherwise animate to, and the ball jumps between positions rather than gliding between them.

`playBeats.js` owns the timeline and composes the two things that already existed — `getPlayTrajectory()` for where the ball is and `parsePlayNarrative()` for what to say — rather than re-deriving either. Every play type in the captured fixtures is choreographed individually, and the shape is what tells them apart before a word is read:

- A **made field goal** keeps climbing through the uprights while a miss comes back down. That end-of-flight height is the whole tell.
- An **interception** is the only play that reverses direction mid-flight, so the throw, the moment it is picked off, and the return the other way are three separate movements around a spot only the description reports. Drawn as one line it was just a long gain in the wrong colour. A forward pass is always drawn forward: the feed sometimes credits the pick at a spot *behind* the line of scrimmage, and throwing the ball there sends it the way the offense came from, which reads as the entire play running backwards. When the reported spot is behind the line the ball is thrown to a target estimated from the depth the description states, the spot stops being spoken — the same rule the catch point follows — and the return still finishes where the feed says it did, so field position stays true. Only the return may reverse direction.
- A **fumble** separates the carrier going down, the ball coming loose where he was hit, and somebody else carrying it back. The loose ball is the one time in playback the ball leaves the ground without anyone having thrown or kicked it.
- A **penalty** has no action to trace, so the movement *is* the walk-off: the ball returns to the spot the foul was enforced at and is marched from there. A down that was wiped out never animates the play that did not count, because drawing it would say the opposite of what happened.
- A **turnover on downs** has no slug of its own — the play stays a rush or an incompletion — so a closing beat says the ball changed hands. Without it the drive's last snap reads as an ordinary tackle.
- A **missed kick** falls to the turf in red and is crossed out where it came down; a make climbs away in the signature gold. The two used to differ only in how high the ball was at the very end of the flight, which is the last thing anyone looks at, so they came out looking the same.
- A **punt or kickoff** hangs. At a pass's apex they came out as deep throws, which is the one shape they must not share, so the ball goes up roughly twice as high on a dashed trail — the same dash the drive field and the play strips use for a kick.

#### Losing the ball has to look like losing the ball

The trail is drawn in runs rather than as one stroke, because it changes colour partway through a play. The instant an interception is caught or a fumble recovered, the rest of the trail takes **the other team's colour**; ground lost on a sack or a tackle behind the line takes the accent red. Drawn as one stroke in the offense's colour, a pick read as that same offense running backwards — the drive field above had always coloured possession this way and playback was the odd one out.

Every trail is drawn over a dark halo. A team colour is chosen to read against the app's own surfaces rather than against turf, and a few clubs carry a deliberately near-white accent — the swap that keeps a very dark palette legible on dark backgrounds — which on a light field left their trail invisible. The under-stroke does the same job for the trail that its ring already does for the ball.

The colour carries the fact; a chip on the field carries the word. `INTERCEPTED`, `FUMBLE`, `RECOVERED`, `SACK`, `TURNOVER ON DOWNS`, `PENALTY` and `NO GOOD` appear at the spot they happened and stay up for the rest of the play, because a turnover is what the play is remembered by rather than a moment that passes. A penalty takes the signature yellow the drive field already flags penalties with, which means its text has to take `--color-signature-fg` rather than the white the others use. A turnover chip wears the recovering team's colour, so its text cannot be a fixed white either — that put white on white for the clubs with a near-white accent. `pickReadableForeground` chooses the ink, the same helper the team gradients use, and the plate is nudged 12% toward the ink's opposite because picking the better of black and white still left the mid-tone palettes at 4.46:1, just under the bar for text this small. Worst case across all 32 clubs in both modes is 5.36:1. The full set of alerts is pinned by a test — one on an ordinary completion would spend the whole device.

The `tone` rides on the timeline next to the position, so the trail can never change hands at a different spot from the ball.

The generic fall-back path still exists for anything the parser is not confident about: it travels the real start-to-end path, still speaks whatever sentence there is, and the panel says the play type has no animation yet rather than passing a generic slide off as bespoke. Nothing in the fixtures reaches it.

A play the replay official reversed is written out in full twice, with the corrected version last, so the turnover parsers read `authoritativeText` rather than the whole string — the same interception is described first as a 7-yard return and then as a 2-yard one.

#### Everything advances along the middle of the field

The description states which third of the field a play went to on 93% of non-kick snaps — `short left`, `deep middle` on a pass, and the blocking gap (`left end`, `right guard`, `up the middle`) on a run. `parseDirection` extracts it and the beat text says it out loud. It is deliberately **not** drawn: every play advances along the centre line.

Drawing it was built and reverted, and the reasons are worth keeping. The vertical axis is height — it is what makes a pass arc and a field goal clear the uprights — so a lateral position has to share that one axis with it, and the two compete directly: putting a full lateral offset halfway to the sideline forced the arc scale down far enough that a deep throw and a high one stopped looking different. The deeper problem is that the feed reports no hash mark, no lateral field and no coordinate of any kind, and the ESPN summary has none either, so every play would break from the middle of the field whatever the real hash was — the direction is real data sitting on top of an invented origin.

The sentence carries the direction instead, where it costs nothing and claims nothing.

#### The catch point is estimated, and never spoken

No field in BALLDONTLIE or the ESPN summary reports air yards, a catch spot, or yards after catch. The only depth signal in the entire feed is the "short"/"deep" qualifier inside the official description, which `parseDirection` already extracts. `estimateAirYards()` turns that into a catch point — under 15 yards in the air for short, at least 15 for deep, never past where the play actually ended — and that estimate is allowed to do exactly one thing: position the ball so the pass has a visible moment of arrival and a run after it.

It never becomes a number. The catch beat names the receiver and stops there; every figure in beat text — the yardage, the spot, the return distance — is one the feed reported. When the description states no depth at all, the pass collapses to a single arc onto the real end spot and no catch beat fires, because an invented moment is worse than a missing one. A unit test asserts that no catch beat anywhere in the fixtures contains a digit. If a source that reports air yards ever becomes available, `estimateAirYards()` is the only place to change.

### Where the sentence comes from

BALLDONTLIE returns two text fields per play. `short_text` uses full player names in a small, regular grammar ("Dak Prescott Pass Complete for 6 Yds to George Pickens") and drives the sentence and the primary actors. `text` is the official NFL description; it abbreviates names ("D.Prescott") but is the only place tacklers, penalties, and play direction appear.

`parsePlayNarrative` is conservative by contract. Any play that does not match a known grammar returns `confident: false`, and the card renders the original NFL description with no headshots. Showing a real player's face next to a wrong name is a far worse failure than a plain line of text, so the parser never guesses. Coverage is 100% of the 349 plays in `tests/fixtures/bdlNflPlays.json`; new play types should be added as grammars rather than by loosening the fallback.

### Where the photos come from

Play rows carry no player IDs. The bridge is the play ID itself: BALLDONTLIE sources NFL plays from ESPN and keeps ESPN's event ID as the leading nine digits (`401772510141` is event `401772510`, sequence `141`). ESPN's `summary?event=` endpoint then lists every player who recorded a stat in that specific game, each with a headshot.

The per-game summary is used deliberately in preference to a current team roster: rosters only describe today, so reading past seasons against them silently loses everyone who has since changed teams. The derived event ID is validated against the drilldown's two team abbreviations before any photo is shown — if it does not match, no faces are rendered at all.

Photo resolution is best-effort and never blocking. If ESPN is unreachable, the event ID cannot be derived, or the summary is the wrong game, plays render with their sentences and field strips and no headshots. Roughly 3% of named players legitimately have no photo — linemen and special-teamers flagged for penalties never record a stat, so they never appear in a box score — and those fall back to initials.

### Field geometry

`fieldGeometry.js` works in one absolute frame: a percentage across the field with the away team's own end zone at 0 and the home team's at 100, so the away team always drives left to right.

Position is read from the frame-free sources first and the possession fields only as a last resort:

1. `start_possession_text` / `end_possession_text` — the provider's own rendering of the spot, absolute by construction.
2. `start_yard_line` / `end_yard_line` — measured from the home team's goal line and never mirrored. `yardLineToPercent()` maps them. These agree with the spot text on every play of the captured games that carries both.
3. `start_yards_to_endzone` / `end_yards_to_endzone` — measured from whoever holds the ball at that moment, so they flip frame the instant possession moves and only mean something once the offense is known.

Preferring the yard lines is what fixed drives reading impossible net yardage. Two provider quirks caused it, and both defeat the possession fields alone:

- **Clock stoppages report `start_yards_to_endzone` as a flat 0.** Read as a snap, a timeout drew a bar from the goal line to wherever the ball actually sat and, being the drive's first play, measured the whole drive from there — one drive that gained 6 yards reported −89. `isNonSnapPlay()` now classifies stoppages as their own type; they never draw, never enter the play mix, and never bound a drive.
- **Possession-changing slugs are compound.** The same lost fumble arrives as `fumble-recovery-opponent` on one play and `sack-opp-fumble-recovery` on the next, so `isPossessionChangingPlay()` matches by pattern instead of against a list of exact slugs. An exact list caught the first form and missed the second, which filed a Houston possession under the Chargers and left the drive it ended labelled "Drive" rather than "Fumble". A fumble the offense fell on itself keeps the ball, so a fumble only counts when the slug says an opponent recovered.
- **A turnover on downs has no slug.** The play stays a `rush` or a `pass-incompletion` while `team` quietly names the side that took over, so the fourth down that ended a possession opened the next team's drive, mirrored. `isTurnoverOnDowns()` compares yardage gained against yardage needed — the only field that separates it from a converted fourth down — and `getOffenseTeam()` corrects it alongside the kicks and turnovers that do carry slugs.

Scores are the opposite case: the provider reports a null end *spot* because the ball left the field of play, and the yard line (or, failing that, the attacking end zone) fills the gap rather than leaving one. Kicks still refuse to draw rather than guess when the description names no landing spot.

Net yards for a drive run from the first snap's start to the last snap's end. Kicks are excluded — a punt is how a drive ended, not ground the offense gave back — and so is anything undrawable. When the drive ended on a turnover, it is measured to that snap's *start* rather than its end: the end spot is where the defense finished its return, and counting it read a drive that reached the Houston 24 and threw an interception there as 25 yards rather than 53. On a sack-fumble this ignores the sack itself, because the spot the quarterback went down is only ever named in the description, never in a field of its own.

### Quarter orientation

Teams change ends at the end of every quarter, so drives in the second and fourth quarters are drawn mirrored end for end: `isFieldFlipped(period)` decides, and `fieldX(yard, flipped)` is the only place the mirror is applied. Nothing upstream changes — every yard line stays in the one absolute frame — but the end zones, the axis team labels, the direction hint, and every arrowhead follow the flip so the graphic reads the way the drive was actually played. A drive keeps the orientation of the quarter it opened in, including one that runs across a quarter break, so a play strip can never face the other way from the drive field above it.

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
