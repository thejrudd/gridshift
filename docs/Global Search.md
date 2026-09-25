# Global Search

Back: [[Home]] · Routing: [[Where To Edit]]

One search surface reachable from anywhere — `Cmd/Ctrl+K` on desktop, the search
button in `NavBar` on mobile, the sidebar entry on desktop. It finds players, NFL
teams, games and weeks, fantasy teams, app destinations, and commands, and
answers some questions inline.

## Why it is built this way

**No model.** Every supported query is an entity plus qualifiers — slot filling,
not language understanding. A phrase table with typo tolerance covers the whole
surface, runs in single-digit milliseconds, and adds nothing to hosting cost.
Open-ended questions ("who should I start at flex") are out of scope and should
stay out: they are the thing this design deliberately does not attempt.

**No server.** The index is a static build artifact, precached by the service
worker and persisted to IndexedDB, so search works on a first-ever offline
launch. Nothing in the search path requires the network.

**Nothing derivable is shipped.** Player tokens are rebuilt from the name at
load rather than serialized, which is what keeps the artifact small.

**Identity is resolved at build time, not click time.** The statistics player
page is keyed on an ESPN id and Sleeper supplies one for only about a third of
the directory. `build-search-index.mjs` backfills the rest from the 32 ESPN
rosters, which is why a result opens immediately instead of paying for a network
lookup on tap.

## Measurements

Re-measure and update these whenever the index shape changes.

| | |
| --- | --- |
| Artifact size | 385.4 KB raw, 84.7 KB gzipped |
| Records | 3,370 — 359 static + 3,011 players |
| Players openable with no lookup | 92% (890 ids from Sleeper + 1,871 backfilled from ESPN rosters) |
| Hydrate + index build | ~42 ms for the full corpus |
| Query latency | 0–9 ms |
| Palette chunk | 39 KB (lazy). It carries `scoringEngine` and `statisticsStandings` for the answer resolvers, which is most of it; the shared `PlayerAvatar` adds 48 bytes on top of that. |

`scripts/build-search-index.mjs` fails the build above a 600 KB raw ceiling.
Narrow what is indexed rather than raising it.

## Files

| File | Owns |
| --- | --- |
| `src/utils/globalSearch/vocabulary.js` | **Canonical phrase table.** Teams, positions, divisions (moved here from `parseSearchQuery.js`, which re-exports it), plus stat keys, timeframes, superlatives, intents, commands, stopwords |
| `src/utils/globalSearch/parseIntent.js` | `parseGlobalQuery` — query to slots |
| `src/utils/globalSearch/correct.js` | Bounded Damerau-Levenshtein, vocabulary correction |
| `src/utils/globalSearch/tokenIndex.js` | Exact / prefix / trigram inverted indexes; no entity knowledge |
| `src/utils/globalSearch/buildIndex.js` | Composes adapters into slices and an index |
| `src/utils/globalSearch/rank.js` | Slot filtering, slot-agreement scoring, grouping |
| `src/utils/globalSearch/persist.js` | IndexedDB `gridshift-search`, version-busted on `__APP_VERSION__` |
| `src/utils/globalSearch/resolveRoute.js` | Result to route object; ESPN id fallback for players; game results pick Scores or team schedule at click time |
| `src/utils/globalSearch/detail.js` | Expanded-result content, derived from the index only |
| `src/utils/fantasyOwnership.js` | Who rosters a player; shared with the Statistics player header |
| `src/utils/globalSearch/entities/*.js` | One adapter per source; `record.js` holds the shape |
| `src/utils/globalSearch/answers/*.js` | Inline answer resolvers + dispatch |
| `src/utils/globalSearch/answers/scope.js` | Conference / division / team slots to a set of teams, shared by every scoped answer |
| `src/utils/globalSearch/answers/standings.js` | NFL and fantasy standings models and cards |
| `src/utils/globalSearch/answers/teamStats.js` | One team's season: record, PF, PA, differential, PPG, SOS |
| `src/hooks/useGlobalSearch.js` | Open state, `Cmd/Ctrl+K`, index lifecycle |
| `src/components/search/*.jsx` | Palette, result row, expanded detail, answer card, empty-state guide |
| `scripts/build-search-index.mjs` | Generates `public/search-index.v1.json` (`prebuild`) |

Shell integration is in `src/App.jsx` (overlay mount, navigation and command
handlers), `NavBar.jsx`, and `Sidebar.jsx`.

## Rules that are load-bearing

Each of these exists because its absence was a bug. Do not relax one without
reading why it is here.

**Evidence gates a result.** A record's base weight is a tiebreaker between
matches, never a reason to appear. Without this, a slot no record contradicts —
a bare `week 3`, or a command — lets the entire corpus through on weight alone.
See `rankResults` in `rank.js`.

**A fuzzy match must share the term's first letter.** Trigram similarity alone
cannot separate a typo from an unrelated word: `lamr`/`lamar` and `wire`/`zaire`
both score 0.50. What separates them is that people mistype the middle of a word,
not its first letter. An absent first-letter bucket means *no* record starts with
that letter, so every candidate fails — never treat it as "no constraint".

**Correction is bounded at both ends.** A token under 4 characters is never
corrected, and neither is a token corrected *into* one. NFL shorthand is dense
with short words one edit apart: `lamr` is one edit from the Rams' `lar`, and
accepting that turns a Lamar Jackson search into a Rams query that excludes him.

**Ambiguity is emitted, not guessed.** A standalone token that only matches after
correction lands in its slot and, when it can also identify a record, stays a name
term. `moss` is one edit from the superlative `most`; the parser cannot know which
was meant, so it offers both readings and ranking settles it on evidence. A
corrected position is the exception: like an exact position phrase, it filters
by position without requiring the typo to appear in a player's name. Consumers
that make a strong claim from a slot — answer cards — check `slots.correctedTypes`
and decline a corrected one.

**Soft terms are optional and exact.** Intent words ("standings", "matchup") are
also destination names, so they score against record text — but they are OR-ed
and optional, never AND-ed like name terms. `cardinals schedule` must still
return Arizona's games, none of which contain the word "schedule". They are also
matched without fuzz, since they came from the vocabulary already spelled right.

**A result must never fail silently.** `resolveResultRoute` returns a `reason`
alongside the route, the palette stays open while a result resolves, and a
failure is reported in the palette with the result still on screen. The original
implementation closed the palette first and returned early on a null route, so a
player the index had no ESPN id for — most of them, before the backfill — looked
like a tap that did nothing.

**A game result's destination is decided at click time.** The index is static, so
`routeForGameResult` compares the game's kickoff to now: kicked off (live or
final) opens its Statistics Scores page by `espnEventId`; an upcoming game
opens the Statistics Schedule matchup drill-in. A named team keeps its team
schedule (`focusTeamId`, set in `rank.js`); otherwise the result opens the
matching week with that game selected. A game without a usable kickoff keeps
its record route; an upcoming game can use its ESPN event id or static record id.

**The route lookup runs off the record, never the Sleeper directory.** A record
carries the team, name, and position, which is everything the roster match needs.
Depending on the in-memory player map meant the fallback only worked after the
app had downloaded the multi-megabyte directory for some other reason.

**Bump `SEARCH_CACHE_SCHEMA_VERSION` when the index content contract changes.**
The persisted slice is keyed on the app version, so a content fix that does not
ship a version bump would never reach a browser that already cached the old one.

**Detach the sheet history entry before routing.** `Modal`'s `useSheetHistory`
consumes its entry with a deferred `history.back()` on unmount. A search result
resolves asynchronously, so without detaching first the deferred back fires
*after* the new route is pushed and silently undoes it. Same reason
`openHistoricalMatchup` detaches before switching seasons. See
`detachSearchSheetEntry` in `App.jsx`.

## Marks

Every kind of result draws its own mark, and that is information rather than
decoration. Searching a team used to return a column of that team's logo, once
per row, where the avatar said nothing and the eye had nothing to sort by.

| Kind | Mark |
| --- | --- |
| Player | Round headshot on the team's gradient, via the shared `PlayerAvatar` |
| NFL team | The team's squared mark on its gradient |
| Game | Both crests, away over home, in the order the label reads |
| Fantasy team | Initials |
| Destination, command | A glyph per section |

Team colour comes from `getTeamVisualTheme` and headshots from `PlayerAvatar`'s
own headshot → team mark → initials chain. The palette defines neither: a record
already carries every id that chain needs, so drawing a face never touches the
Sleeper player directory.

## Ordering

Games and weeks are listed in kickoff order, not score order. A list of games
reads as a season, and a team's games all carry the same slot bonus, so their
"score order" was really the tiebreaker — alphabetical by label — presented as
if it meant something.

The ordering is applied **before** the group limit, never after. Trimming first
would pick six games at random from the season and only then put those six in
order. A query that names one week is exempt: there the ranking is the answer,
and the matching game has earned the top row.

## Expanding results

Each connected fantasy roster is searchable by team name, Sleeper manager
display name, and username; each match opens the same roster result. The active
result expands in place to show what is already known about it — a player's
position, number, next opponent with kickoff, and bye week; a team's division
and schedule facts; a game's matchup, kickoff, and broadcast. Player rows also
show height and weight when those values are available. A cached stat line is
added when the app happens to have one. A fantasy-team result also shows its
manager and the roster's current-season record, points for, points against, and
points per game when those values are available.

`buildResultDetail` in `detail.js` reads the result record and data the app
already holds. Player measurements travel in the compact player record so they
are available on the first offline launch. Fantasy-team totals use
`getFantasyRosterSeasonSummary` over the connected league's current roster
snapshot. **It never fetches.** Missing measurements, point totals, and averages
stay omitted rather than being filled with placeholders, and a result with no
cached stats shows fewer fields rather than a spinner, which is what keeps the
palette instant.

Commands and destinations do not expand. Their row already says everything;
expanding one would only echo the label back.

### The motion rule

**Nothing animates, and hover has no delay.** Expansion is instant and the
active result is selected on the first pointer *movement* over a row.

An earlier version animated the first expansion after a query changed and waited
120 ms for hover intent. It looked considered and felt slow: pointing is the
highest-frequency action in this surface, and every row you pointed at owed you a
third of a second before it admitted it had been pointed at.

The hover delay existed for a real reason and is not simply deleted. An expanding
row shifts the rows below it out from under a sweeping cursor, and under
`mouseenter` whatever lands beneath the pointer steals the selection. Tracking
`mousemove` instead is what makes removing the delay safe: a row that arrives
under a stationary cursor generates no movement, so it cannot select itself. If
you reintroduce `mouseenter` here, the delay has to come back with it.

The active row carries a signature rail (`.global-search-row-shell.is-active`),
which is what keeps a selection legible when it moves with no transition to
follow.

### Fantasy ownership

A player result names the fantasy team that rosters them and offers that team's
roster and matchup. The lookup is `buildFantasyOwnership`, built once per league
in `App.jsx` and passed through `answerData` — the palette asks the question on
every keystroke, and a per-lookup scan of the rosters is the kind of cost that
shows up as input lag.

With no league connected the section is omitted rather than rendered as "free
agent". With no rosters to check, every player looks unowned, and saying so would
be a claim the data does not support. Reserve and taxi count as rostered: it is
ownership, not the lineup slot, that decides who you would be trading with.

The same helper backs the Statistics player header's ownership chip, which names
the manager the page's trade buttons would be dealing with.

## Answers

Resolvers are pure `(slots, record, data) → model | null` and **never fetch**.
A cold cache returns null and the result degrades to a navigation row — opening
search must never trigger the multi-megabyte player or stats download.

Answer logic is read-only over the existing engines: `scoringEngine.js` for
points, `productionAdjustedValue` for trade value (preserving its null
propagation — a missing value renders as unavailable, never as `0`),
`defenseRankings.js` for defense splits. **No scoring or valuation logic is
defined in `answers/`.** If a resolver needs new scoring behaviour, that belongs
in `scoringEngine.js` with the call-site audit [[Scoring Call Sites]] requires.

Leader answers compute rank over the full field *before* the position filter and
render the carried rank, per the project's ranked-list rule.

**A team plus a stat is its own trigger.** "seahawks receiving" carries no
superlative, and requiring people to type "most" for the obvious reading is the
vocabulary tax this search exists to avoid. The team filter runs *after* ranking,
like the position filter, so a team leader keeps the rank they earned league-wide
— which the card says outright, since an unexplained "#14" on a team's best
receiver reads as a bug.

A team card carries its whole qualifying group and collapses to five, so "see
all" is answered in the palette rather than at a team-stat-leaders page that does
not exist; its `route` opens the team instead.

### Scope: conference, division, team

`resolveTeamScope` in `scope.js` turns the team, division and conference slots
into the set of teams an answer is about, plus a name for it. Leaders, standings
and team stats all call it, so `afc east` means the same four teams whichever
card answers.

**Slots are OR-ed within a type and AND-ed across types**, exactly as
`matchesSlots` filters results in `rank.js`. "seattle arizona receiving" is both
teams; "afc east seattle" is nobody. An empty intersection is a real answer and
the resolvers return null rather than widening back to the league — a card that
quietly ignored half the query would be worse than no card.

Naming no scope at all is `isLeagueWide`, not an empty set. Callers check that
flag; treating a null team set as "no results" would empty every unscoped
leaderboard.

### Standings

`standings.js` answers both competitions, because they are the same question
asked of two tables and keeping them in one file is what stops the column sets
drifting apart.

NFL rows come from `buildStatisticsStandings` — the same pure builder the
Statistics standings page uses — run over the hydrated schedule already in
App's memory, so search and that page can never disagree. Ordering uses that
module's `compareStandingRows` for the same reason. Fantasy rows come from
`getFantasyRosterSeasonSummary` over rosters SleeperContext hydrates from
localStorage at mount. **Neither fetches.**

The model is cached on the schedule object with a `WeakMap`: search rebuilds its
answer on every keystroke, and replaying a season of games each time is the kind
of cost that shows up as input lag.

Which competition is decided by evidence. A division or conference is
unambiguously the NFL; a fantasy scope word or a matching fantasy team name is
unambiguously the league. A bare "standings" resolves to the NFL, because that
reading always has an answer and the League standings destination is still one
row below.

Nothing played yet returns null rather than a table of 0-0 rows with every
derived column empty.

### Strength of schedule means two different things

The app already had one: `getStrengthOfSchedule` in `scheduleParser.js` is
**average opponent predicted wins**, belonging to the Predictions tab, and it
returns nothing until the user has made predictions.

Search uses **opponents' average win percentage**, derived from the standings
model over the full schedule — games still to come included, since SOS is about
the season a team was handed. It is the conventional reading, it is always
available, and the card labels it. A search result that said "unavailable" for a
number visible elsewhere in the app would be worse than a different,
well-labelled one. The two numbers will differ; that is expected.

### A player has no record

"jaxon smith-njigba record" answers with Seattle's season, subtitled *Jaxon
Smith-Njigba's team*. Answering the question behind the query beats declining
it, but the card never lets the number read as the player's own.

### Defensive stats live under two key sets

Sleeper files an individual defender's production under `idp_*` (`idp_sack`,
`idp_tkl`, `idp_int`, `idp_pass_def`) and a team defense's under the bare names
(`sack`, `int`). **Nothing carries both.** A defender's `sack` is always
undefined.

Reading only the bare key is why "seahawks sacks" answered with the Seahawks DEF
unit alone: it was the one record in the league with a `sack` key at all, and
every actual pass rusher summed to zero and was dropped by the zero filter.
`resolveStatKey` now picks the key set from the position, the same way it
already resolves a bare "yards".

Two further rules follow from that:

- **A defensive stat means the players who recorded it.** The team unit is held
  out of the leaderboard, because its team total would sit above every
  individual on it. Naming `team defense` / `dst` asks for the team total
  instead, and is the only way to get it.
- **"Interceptions" stays open to both readings.** One a quarterback threw and
  one a defender caught are the same word, and the position already resolves it
  per player, so the field is not narrowed — only the team unit is held out.

Sacks and tackles for loss are credited in halves, so `formatStatValue` keeps a
decimal for them rather than reporting a number the player did not record.

Covered today: player stat lines, fantasy ranking, trade value, leaders (league
wide or scoped to any conference, division and team combination), team stat
leaders, IDP stat lines and leaders, NFL and fantasy standings, and team season
stats (record, PF, PA, differential, points per game, strength of schedule).
Not covered: live scores and game status, league history, scout and draft.

## Index lifecycle

1. Palette opens → `persist.js` reads IndexedDB. Version match → ready.
2. Miss → fetch the precached `/search-index.v1.json`, hydrate, persist.
3. If the app already holds the Sleeper player directory for its own reasons, the
   live player slice supersedes the static one. Search never fetches it itself.
4. Fantasy-league records rebuild with the league; they are small and in memory.

The static slice has no Sleeper dependency, so player search now works for ESPN
users, where `loadPlayers` returns `{}`.

## Adding to the vocabulary

Add the phrase to the right table in `vocabulary.js`, then add a case to the
fixture table at the top of `tests/unit/globalSearchIntent.test.mjs`. That table
is the regression net for the whole feature — a vocabulary change that does not
appear there is untested.

Watch for collisions, of two kinds:

- A new single-word entry joins the correction dictionary and becomes a target
  every 4+ character token can correct into. Check it is not one edit from a
  common surname. `carry` was left out of the stat table for exactly this: it is
  one edit from Barry.
- A phrase that already exists under another type silently shadows it. `tackle`,
  `guard`, `center`, `corner` and `safety` are positions, so none of them can
  also be a stat. Moving a phrase between types is a behaviour change, not a
  rename: `points against` was an intent pointing at the Defenses view and is
  now a team stat, which is right after a team name and cost that destination one
  of its aliases. It still answers to `defenses`, `defense rankings` and
  `streaming defense`.
