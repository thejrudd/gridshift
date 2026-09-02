# Fantasy Live Sandbox

A development-only harness for exercising Fantasy Live outside the NFL regular
season. It substitutes a synthetic fantasy league built from a real, completed
NFL week and replays that week forward on a scrubbable clock.

Related: [[Live Data Server Architecture]], [[BALLDONTLIE NFL Integration]],
[[Architecture Map]]

## Why it exists

Fantasy Live is unusable outside the season for two reasons:

1. `resolveFantasyLiveAvailability()` gates the view to `season_type === 'regular'`,
   so in the preseason and offseason the route renders an empty state.
2. The roster comes from a connected fantasy league via `useSleeperBase()`, so
   there is nothing to score even if the gate is bypassed.

The sandbox addresses both, without changing production behaviour.

## Two modes

| Mode | Fixture | Data | Use |
| --- | --- | --- | --- |
| Replay (default) | `liveSandboxFixture.js` | Time-sliced replay of a completed week | Testing any time, at any point of a week |
| Preseason | `liveSandboxPreseasonFixture.js` | Real live routes, scoped to the preseason | Watching real preseason games as they happen |

Both are always available and switch from the **Replay / Preseason** buttons in
the sandbox panel — no rebuild, no restart. The choice persists in
`localStorage`, so a reload keeps it.

Preseason is live rather than replayed, so the clock and scrubber hide in that
mode. Everything else — the fixture league, the regular-season gate override,
the connect-gate bypass — works the same in both.

Switching modes is a hard reset, not a filter: the two fixtures cover different
seasons entirely (2025 week 12 versus 2026 preseason week 3). `setSandboxMode()`
drops the cached slate and rewinds the clock, which also clears the feed, plays,
and win-probability trail gathered under the previous mode.

`VITE_LIVE_SANDBOX_MODE` still exists, but only sets which mode a browser opens
in before it has chosen one.

## Enabling it

Two settings, both local only:

```
# .env.local
VITE_LIVE_SANDBOX=true

# .env — the server gates /api/live/* behind an allowlisted league
GRIDSHIFT_LIVE_ALLOWED_LEAGUE_IDS=<your ids>,gridshift-live-sandbox
```

Restart the dev server after editing `.env`: `scripts/dev.mjs` reads it once at
startup and `node --watch` does not watch it.

Then open `/fantasy/live`. Because the sandbox league is allowlisted, its live
session starts automatically when no local access code is configured. If a
local `GRIDSHIFT_LIVE_ACCESS_CODE` is set, enter that code through the normal
**Turn on Live** gate. The sandbox renders without a connected league.

Never allowlist `gridshift-live-sandbox` in production.

### Preseason mode

The mode itself is a panel toggle, but the server still has to be willing to
serve preseason at all:

```
# .env — production is regular/postseason-only and ignores this
GRIDSHIFT_LIVE_ALLOW_PRESEASON=true
```

The live routes deliberately refuse BALLDONTLIE's preseason season type. That
guard still stands: `isPreseasonAllowed()` in `server/liveHandlers.js` opens it
only outside production *and* only with the flag above set.

Preseason and regular-season weeks share numbering, so an unscoped request for
week 3 returns both slates. Preseason mode passes `seasonType=pre` so the
server asks for season type 1 alone; every other caller keeps the
regular/postseason behaviour untouched.

### Building the preseason roster

```bash
node scripts/generateLiveSandboxPreseasonFixture.mjs 2026 3
```

A preseason week has not been played, so there are no box scores to rank
players by. The generator instead picks for *likely snaps*: active skill
players from ESPN rosters, sorted by fewest years of experience, with each
team's established starters removed (best Sleeper `search_rank` at each
position — those players take a series at most). The result is a roster of
rookies spread across nearly every game on the slate.

## How it works

### The fixture league

`src/data/liveSandboxFixture.js` is generated, not hand-written:

```bash
node scripts/generateLiveSandboxFixture.mjs 2025 12
```

The generator also resolves ESPN athlete ids from ESPN's team rosters and bakes
them into the fixture. Sleeper leaves `espn_id` null for most startable skill
players, and the app normally backfills them through a roster cross-reference
the sandbox has no access to, so without this step player headshots fall back
to team logos.

The generator pulls the week's real games and box scores from BALLDONTLIE,
ranks every skill player by PPR scoring, and builds two eight-slot lineups
spread across as many distinct games as possible so the feed, pace chart, and
play-by-play all have several games in flight. Sleeper player IDs are matched by
name so player drill-in navigation still works.

Rosters are derived from the replayed week rather than from today's Sleeper
player list for a specific reason: the live feed joins stats on
`normalizedName|teamAbbr`, so a fixture player must carry the team they played
for **during that week**. Using current teams would silently break the join for
every player who changed teams since.

### The replay clock

`liveSandboxReplay.js` holds the slicing logic as pure functions of
(final data, progress), so the replay is deterministic and scrubs backwards as
well as forwards:

- Games are projected to scheduled / in progress / final, with scores rebuilt
  from the game's real quarter-by-quarter scoring rather than interpolated.
- Counting stats scale with game progress and floor to whole events, so
  touchdowns and receptions tick up in believable steps. Rate and "long" stats
  are never scaled.
- Dead air between games is collapsed. An NFL week is mostly gaps — Thursday
  night, then nothing until Sunday — so the timeline is built from merged game
  intervals. Every part of the slider lands on football while stagger and
  overlap stay true to life.

`liveSandboxClock.js` owns progress, play/pause, and speed at module scope. The
panel's **Full** action stops playback and jumps progress directly to 100%,
making the entire demo week available without waiting for the accelerated
clock. Its `version` counter triggers a fresh slice in `CompanionLive`, but it
is excluded from request identity so a 500 ms clock tick cannot cancel slower
hydration for the same matchup.

### The feed and pace chart accumulate

The sandbox turns the demo play feed **off** (`demoFeedEnabled` in
`CompanionLive`). That path — `buildDemoTimeline` plus
`buildSharedDemoScoringEvents` — synthesises a whole week of scoring from the
starters' current totals, which renders the feed and pace chart fully populated
the moment the page loads. With it off, both build from real observed activity:

- Feed events come from stat deltas between replay snapshots, so points arrive
  in small real increments as each game progresses.
- Play-by-play comes from the week's actual plays, sliced to those that had
  happened by the current instant. It enriches the complete stat-delta batch
  with real descriptions and field position without replacing that batch's
  authoritative fantasy-point change, blocking the feed while provider slices
  catch up, or dropping reconstructed remainder rows.
- The pace chart plots only events observed so far, drawing up to a `NOW`
  marker with the rest of the week left empty. Actual-score paths connect each
  team's cumulative scoring dots directly, and hover interpolates continuously
  along that same visible line.

Two details make this work. Plays are refetched whenever replay progress
changes: the live throttle (`PLAYS_REFRESH_MIN_MS`, 45s of wall time) would
otherwise freeze them, and refetching is cheap because the sandbox source
caches the week and only re-slices. Win-probability history is also kept in
memory rather than persisted, since a stored trail is recorded against wall
time and would pre-fill the chart on the next run.

### One timeline: why events sit where they do

`buildPaceSeries` plots each point's **x** from the event's position and derives
its **y** from the running total of every event that happened *earlier in
time*. Those two only agree while games run in step with the wall clock. Live,
they do. A replay breaks it in two ways, and both produced visible artefacts:

- Positions came from `getRemainingGameFraction()`, which reads a game's status
  and clock and reports 0 for scheduled and 1 for final — collapsing batches
  onto kickoff and onto the current moment.
- Positions were *per game* while times were wall-clock. A Sunday game at 10%
  of its own clock carries a late timestamp but an early x, so points landed
  out of order and the running total jumped up and down. That is what made
  already-drawn plays appear to change value.

Everything in the sandbox is therefore expressed on one **slate axis**: 0 is
the week's first kickoff, 1 is the last whistle, gaps removed.
`getSlateProgressForGameProgress()` restates a position inside a game onto it,
and events are stamped with `instantAt()` — the real moment that slate position
corresponds to — rather than with `Date.now()`. Delta events and play events
both go through this, and the chart's span uses the replay clock, so ordering
by time and ordering along the chart are the same ordering.

A replay step also covers far more game time than a five-second live poll, so a
batch would still share one position and stack vertically at NOW.
`spreadEventsAcrossInterval()` lays each batch across the slate time that just
elapsed, leaving exactly one point on the current moment.

### Stats advance by the play, not by the clock

Yardage does not accrue continuously. Scaling it smoothly turned one 12-yard
run into a dozen one-yard dribbles in the feed. Each yardage stat is instead
quantised to the player's own count of the plays that produce it — rushing
yards to `rushing_attempts`, receiving yards to `receptions`, passing yards to
`passing_completions`. James Cook's 116 yards now arrive as 17 carries because
he had 17 carries. A stat with no recorded count falls back to smooth scaling
rather than freezing at zero.

The limitation worth knowing: carries within a game are evenly sized and evenly
spaced, since the box score says how many there were but not how each one went.
Driving stats from the play-by-play itself would fix that, at the cost of
depending on play data for every game.

### Two positions per event, not one

Events carry both, and they are not interchangeable:

- `progress` — the **slate** position. The chart plots x from it and orders
  events by it.
- `gameProgress` — the position inside that event's **own game**.
  `getStarterReplayRemainingFraction()` reads it to work out how much of a
  starter's game is left, which feeds the win-probability model.

Overwriting `gameProgress` with the slate value corrupts every starter's
remaining-game fraction. That looked like a side leaping 195 → 303 on a single
play, stalling for a long stretch, then sliding backwards.

### Scoring comes from deltas, not plays

`mergePlayEvents()` collapses a play and the stat delta it produced into one
row, but only when it can pair them one to one: same player, same kind, points
within 1.5, timestamps within two minutes. A replay step covers many plays at
once, so a batched delta never matches a single play and **both survive** —
double-counting every score. Measured mid-replay, one side accumulated 436.6
against a true total of 217.6, almost exactly twice.

Deltas are the source to keep. They come from the box scores, so they cover
every game and sum to the exact side totals (244.8 / 189.6 at the final
whistle, matching the fixture). Play-by-play is fetched for a limited number of
games — 8 of 14 in practice — so standalone play rows are duplicates *and*
incomplete: plays alone gave one side 57 of its 189.6. Replay mode therefore
drops rows whose `source` is `play`, keeping plays only where they enriched a
delta with its description.

### The chart plots the real running total

`buildPaceSeries` accepts a `snapshotAt` callback that reconstructs each side's
score at a past moment, because a live session keeps only sparse snapshots of a
chart it has to redraw. Its result is spread over the computed point, so it
*overrides* the running totals. A replay has every event, so those totals are
already exact and monotonic — the reconstruction could only make them worse,
and did, overshooting the real total and then sliding back down to it. Replay
mode keeps the callback's probability output and drops its scores, and passes
no historical snapshots.

The fixture's `players_points` values are the completed week's official result,
not a current replay snapshot. Until a starter has a time-sliced provider stat
row, replay mode counts that starter at zero instead of falling back to the
fixture total. Otherwise a slow stat request leaks the final score into an early
replay and the chart draws a vertical jump from the observed events to that
future total at `NOW`.

Replay clock ticks trigger new snapshot and play slices, but they do not cancel
an in-flight request for the same matchup. Only a hard context change — league,
week, matchup, mode, or session — invalidates it. Failed play enrichment remains
retryable, including while the replay is paused; stat deltas still provide the
canonical feed and scoring totals when play-by-play is unavailable.

### The first snapshot counts

A live session joins a week already under way, so its first snapshot is a
starting point rather than scoring to report. A replay starts at zero, so
whatever the first snapshot holds genuinely happened. Swallowing it into the
baseline left the opening stretch of the week flat, with no scoring until well
after kickoff.

### Projections need history

`buildProjectionContext()` returns null without `weeklyStats`, and a fixture
league has none. Every starter then loses its projection, `pace.projected`
collapses to roughly "current plus a little", and the value drifts on every
tick — which moves each side's pace ray and, because `maxY` scales to include
projections, rescales the whole chart underneath the scoring lines.

The generator therefore pulls each fixture player's prior weeks from
BALLDONTLIE (`player_ids[]` returns a whole season in one request) and stores
them under `weeklyStats`, keyed by Sleeper id in the same stat-key shape the
app uses elsewhere. The sandbox passes that through, so the real projection
pipeline runs on realistic inputs: Jahmyr Gibbs' ten prior games imply a ~20
point average, and the chart's projections settle instead of drifting.

The preseason fixture has no history — those games have not been played — so
its projections behave as they would for any unplayed slate.

### The projection anchors the y-axis

The leading projection is the chart's reference point, so it is pinned to the
top of the plot: its ray lands in the top-right corner and stays there while
its *value* moves. Three things had to agree for that to hold.

`maxY` no longer adds 1.2× headroom above the projection. Growing the axis past
the reference point means a rising projection silently shrinks everything
already drawn — the scoring history appears to flatten although nothing about
it changed.

The ray, the gutter label and the ceiling now all read `pace.liveProjected`
(current points plus what is still expected). The ray was previously drawn at
`pace.projected`, the pre-game figure, while the label showed `liveProjected` —
so the ray could not sit where the label said it landed, and pinning the axis
to one moved the other.

The fixture's matchups carry the week's real official points. Once every
starter settles, the view reconciles to those numbers; with zeros there, both
sides' scores and projections collapsed to nothing the moment the last game
ended.

Measured across a replay, the leading ray holds a constant y while its value
climbs 131.4 → 164.2 → 241.1 → 244.8, and the trailing ray moves only relative
to it.

### Scrubbing into the middle of a week

`buildDeltaEvents()` skips any player it has no previous entry for, so an empty
baseline reports nothing at all — jumping straight to mid-week left the feed
and chart blank even though the scores were right. Replay mode seeds a
zero baseline instead, so everything scored up to that point arrives as one
batch, spread across the slate time it covers.

### One event per play

Diffing two snapshots gives everything a player did across the step, and the
live view emits that as a single event. At live cadence that is one play; in a
replay it produced entries like "Passing TD, 2 rushing TDs, +289 pass yds" — a
snap no player has ever had.

`splitDeltaIntoPlays()` rebuilds the individual plays from the delta before any
event is created. Splitting is per category, since a carry, a catch and a
completion are different plays, and touchdowns are dealt to separate plays so
none can carry two. Yardage is shared across the plays and still sums to the
original. `buildReplayDeltaEvents()` then emits one event per play, apportioning
the snapshot's real point change across them so the running total the chart
plots still lands exactly on the side's score.

Two *different* players on the same snap — a passing touchdown and the matching
receiving touchdown — were already separate entries and remain so, because
events are built per player.

### Real plays behind each event

Where a player's game has play-by-play loaded, replay events are their *actual*
plays — real yardage, the official description, and the provider row itself —
rather than reconstructions. `buildReplayDeltaEvents()` takes as many real plays
as the reconstruction says the delta represents, handing them out in order via a
per-player cursor, and apportions the snapshot's real point change across them
so side totals stay exact. Only where no plays are loaded does it fall back to
reconstructing them.

That is what lets the expanded feed row draw the play on a field, reusing
`PlayTrajectoryStrip` from the Statistics play-by-play. The feed's own
`normalizePlay()` flattens the geometry away, so the provider row is kept on the
play as `raw` and re-normalised through `normalizeBdlScorePlay()` for the
visual. An event with no real play behind it simply shows no field rather than a
fabricated one.

The visual is gated to replay mode (`showPlayField`) while it is being proven
outside the season; live scoring keeps its existing expanded row.

**Known gap:** a player whose provider surname carries a generational suffix —
"Cook III" — never matches play text that says "J.Cook", so their events stay
reconstructed. The fixture stores the provider's spelling because the stat join
depends on it, so this is not fixable by renaming alone.

### The animated play recap

An expanded row plays the snap back on the *same* component Statistics
play-by-play uses — `DrivePlayback` — rather than a Fantasy-specific field. It
already runs the ball along its real path, assembles the beat text as the ball
reaches each moment, and carries its own transport controls and speeds.

Fantasy Live adds one thing through opt-in props, so Statistics renders exactly
as before when it passes none: the running score travels with the ball.

**Points come from scoring the stat line, not from interpolating the total.**
`buildPartialPlayStats()` builds the line as it stands partway through — whole
yards from where the ball is, and a discrete stat only once its beat has fired —
and that partial line goes through the league's own `calcPoints()`. In a league
paying 0.1 a yard and 1 a reception, the yards tick a tenth at a time and the
reception arrives as a single point at the catch, rather than as ten tenths
smeared across it. A touchdown lands at the score beat. Measured on a 10-yard
PPR reception: `+0.0 → +0.2 → +0.5 → +1.8 → +2.0`.

Two things follow from reading yardage off the **ball** rather than the clock:
nothing accrues while a quarterback drops back, because the ball has not moved;
and the count stops when the ball stops, instead of drifting on through the
beats that follow the whistle.

**Framing note:** `DrivePlayback` deliberately keeps every play on one 120-yard
canvas so field position stays comparable across a drive. A short play therefore
occupies a small part of the field rather than zooming to fill it. Matching the
Statistics styling and zooming per play are in tension; the styling won.

### The wall at NOW: positions, not accumulation

The pace chart drew a vertical wall at NOW for a long time, and it survived
three fixes because it was being diagnosed wrongly. The events were not missing
and the totals were never wrong: every event in a batch was landing on the *same
x*, stacking into a vertical line.

`spreadEventsAcrossInterval()` lays a batch across `[baseline, now]`. The
baseline was being advanced at the end of **every** snapshot, including ones
that produced no deltas — so the next real batch got `[now, now]`, an interval
with no width, and every event in it collapsed onto the current moment. The
baseline now moves only when something was actually recorded.

A note on measuring this: "largest jump between consecutive points" looks
healthy while this is happening, because each step in the stack is small. The
measurement that finds it is the **distribution of x across the plotted points**
— sixty points with fifty-nine of them in the last tenth. Check that, not step
size.

### The chart accumulates along its own axis

`buildPaceSeries` normally builds each point's running total from every event
with an earlier *timestamp*, while placing it at its *position*. A live session
can rely on those agreeing: plays arrive in order and are stamped as they land.

A replay cannot. Position comes from where a play sits in the week; the
timestamp is reconstructed. Any disagreement leaves early points holding a
near-empty total and the last one holding all of it — which draws as a wall
straight up at NOW. Three separate attempts to force the two into agreement
each fixed one cause and left the class of bug intact.

Replay mode therefore passes `accumulateInOrder`, and the running total is built
strictly along the axis the points are plotted on. Monotonic by construction,
and immune to the clock entirely. Live scoring keeps the default.

Real play rows remain enrichment rather than scoring authority. A replay batch
apportions its exact point change across every reconstructed play, substitutes
real descriptions where available, and retains fallback rows for the rest. The
event total therefore reaches the authoritative current score at the last
observed event, allowing the solid path and fill to hold flat through `NOW`
instead of silently interpolating missing points across scoreless time.

`tests/unit/livePaceAccumulation.test.mjs` pins it, including the negative case:
with clock ordering the point before the close is *not* the side's total, which
is precisely the wall.

### Keep every replay event

The live feed keeps a bounded window of 80 events. That costs nothing in
production, where the chart's values come from win-probability snapshots rather
than from the events themselves. A replay plots the running total of the events,
so trimming them makes the curve under-count — and the closing point at the
authoritative total then draws a vertical line straight up at NOW. Replay mode
keeps them all; a full week is a few hundred.

### Chart scale toggle

The pace chart reserves headroom for each side's projected total, so early in a
week the scoring sits in a thin band at the bottom. That is deliberate in
production, but it makes progression hard to read while testing, so the panel
offers **Proj scale** / **Score scale**:

- `projection` — production behaviour, unchanged and the default everywhere.
- `scoring` — `maxY` follows points actually on the board, so progression fills
  the chart. The pace rays run off the top; their gutter labels are clamped and
  separated so they stay readable.

`LivePaceChart` takes this as a `scaleMode` prop defaulting to `projection`.
Only the sandbox ever passes anything else, so production rendering is
untouched — the toggle exists to compare the two before deciding whether the
alternative is worth shipping.

### Verifying a change here

`scripts/` has no simulator, but the properties this section describes are easy
to check offline: step a replay through the pure functions, build the pace
series, and assert that x never decreases, that neither side's running total
ever falls, and that no two events share a position. A regression in any of
those is what the sawtooth and the vertical stack looked like.

### Play-by-play and rate limits

With the demo feed off, plays come from the real BALLDONTLIE play-by-play, one
request per game to warm the cache. `GRIDSHIFT_LIVE_MAX_REQ_PER_MIN` limits
GridShift's own routes per client (documented default 300), and a low value
makes that warm-up trip the limiter. Failed play fetches back off for a few
seconds rather than retrying every tick, so the cache fills in gradually
instead of holding the limiter open.

### Weather

Weather is skipped whenever the sandbox is active. `fetchGameWeather()` reads
Open-Meteo's *archive*, which serves past dates only: the replayed week sits
outside its window and preseason games have not been played. Requesting either
just produces failures, so the lookup is skipped rather than attempted.

### Rewinding

Scrubbing backwards fires a rewind signal (`subscribeToRewind`), and
`CompanionLive` drops the accumulated feed, fetched plays, and win-probability
trail — all of it describes a part of the week no longer reached.

The stat baseline needs one extra guard. After a rewind the previous fetch's
higher totals are still on screen until fresh data lands, and diffing against
them emits large negative "scoring" events (a −55.4 Gibbs entry, say). So any
snapshot older than the moment of the rewind is discarded rather than allowed
to seed the baseline. Gating on the data's own timestamp rather than on the
clock position matters here: renders and fetches interleave, and a
position-based check can pair the new progress with the old stats.

### Where it plugs in

Slicing happens at the API boundary, so every downstream code path — stat
index, scoring, delta feed, pace chart, win probability — runs unmodified:

| File | Role |
| --- | --- |
| `src/api/liveDataSource.js` | Indirection Fantasy Live reads through; real `liveApi` unless the sandbox is on |
| `src/dev/liveSandbox/index.js` | Public entry: flag, hook, panel, data source |
| `src/dev/liveSandbox/liveSandboxSource.js` | Fetches the week once, serves time-sliced views |
| `src/dev/liveSandbox/LiveSandboxPanel.jsx` | Play/pause, scrub, speed, and full-week controls |
| `src/dev/liveSandbox/production-stub.js` | Inert stand-in aliased in at build time |

`CompanionLive` merges the sandbox over `useSleeperBase()`, so anything the
sandbox omits falls through to the real context. `App.jsx` allows the
`/fantasy/live` route past the connect gate when the sandbox is active.

## Production exclusion

`vite.config.js` aliases the sandbox entry to `production-stub.js` for builds.
This is deliberate rather than relying on tree-shaking: the disabled branch
could not be proven dead across module boundaries, and an earlier version
shipped the fixture and panel into the production bundle.

Verify after touching any of this:

```bash
npm run build && grep -rl "gridshift-live-sandbox\|Live Sandbox" dist/
```

That grep must return nothing.

## Tests

`tests/unit/liveSandboxReplay.test.mjs` covers the replay math — monotonic
scores and stats, quarter-accurate scoreboards, gap collapsing, and the
guarantee that projection never mutates the source games.

`tests/unit/liveSandboxClock.test.mjs` covers the clock, in particular that a
rewind signals exactly when progress moves backwards and that the new position
is already in place when it fires.

One thing worth knowing when changing the sandbox entry: `useLiveSandbox()`
returns a fresh object each tick, but `base` and `nflState` inside it are built
once. Rebuilding them per tick gives `loadMatchups` a new identity every frame,
which restarts matchup loading continuously.
