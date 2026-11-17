# Play-By-Play Normalization

One owner for BALLDONTLIE NFL play-by-play semantics, shared by Statistics
Scores and Fantasy Live.

## Purpose

Both surfaces read the same provider rows. Each used to own a private
normalizer, and the two disagreed — most visibly about which team ran a snap,
and about whether a description-less row existed at all. The disagreement was
invisible until the two surfaces described the same play differently.

`src/utils/playByPlay/` now owns provider-shape semantics. Presentation stays
with the consumer.

## Files

| File | Owns |
| --- | --- |
| `src/utils/playByPlay/normalizePlay.js` | `normalizeCanonicalPlay()`, `resolveOffenseDefenseTeams()`; re-exports the stat-delta surface |
| `src/utils/playByPlay/attributePlayActors.js` | `attributePlayActors()`, `collectPlayActors()`, `getActorExpectedTeam()`, `lookupActor()`: named actor → roster record, shared by Fantasy Live and Statistics Scores (see Actor attribution) |
| `src/utils/playByPlay/playOrder.js` | `sortPlaysChronologically()`: the one chronological order (see Game clock and ordering) |
| `src/utils/playByPlay/gameClock.js` | `parseClockSeconds()`, `getElapsedSeconds()`, `getGameProgress()`: game-clock arithmetic with explicit strictness, missing-clock, and overtime arguments |
| `src/utils/nflGameStatus.js` | `classifyNflGameStatus()`: scheduled \| live \| halftime \| delayed \| postponed \| final (see Game status) |
| `src/utils/playByPlay/playStatDelta.js` | `buildPlayStatDelta()`, `buildTeamDefensePlayDelta()`, `isTeamDefenseScoringPlay()`, `estimatePlayPoints()`, `getPlayEventClassification()`, `isFirstDownPlay()`, `extractYardsFromText()`, `extractReturnYards()`, `PLAY_MATCH_STATS` |
| `src/utils/nflPlays/fieldGeometry.js` | Still the single owner of the possession correction (`getOffenseTeam()`, `isPossessionChangingPlay()`, `isTurnoverOnDowns()`). The resolver calls it; it does not restate it |
| `src/utils/nflPlays/playNarrative.js` | Still the single owner of play text → sentence + actors. The canonical normalizer calls it |

Consumers:

- `src/utils/balldontlieNflScoreboard.js` — `normalizeBdlScorePlay()` is a thin
  Statistics Scores adapter over the canonical play. Its Scores-only fields are
  presentation (`time`, `quarter`, `down`, `spot`, `description`, `score`); it
  also carries the canonical `narrative` (the full parse, confident or not),
  `offenseTeam`, `defenseTeam`, and `defensiveActors`, so no Scores consumer
  re-parses. Consumers read the narrative through `readPlayNarrative(play)`
  (`normalizePlay.js`), which falls back to a fresh parse for ESPN, fixture, and
  hand-built plays.
- `src/utils/livePlaysFeed.js` — `normalizePlay()` is a thin Fantasy Live
  adapter, and re-exports the stat-delta surface for its existing importers
  (`liveReconciliation.js` imports `PLAY_MATCH_STATS` from `livePlaysFeed.js`;
  that path still works).

## Completeness rule

`normalizeCanonicalPlay(raw, options)` returns **one object for every raw row**
and returns `null` only for a null/undefined row. It never drops a play for a
missing description, a missing type, a period boundary, or a lack of fantasy
relevance.

Every filter is a consumer-side choice and must stay in the consumer:

| Filter | Owner | Why |
| --- | --- | --- |
| Drop a play with no `rawDescription` | `livePlaysFeed.normalizePlay()` | The feed has no row to render for it |
| Drop a per-player involvement worth `pts === 0` | `livePlaysFeed.buildPlayEvents()` | The feed shows fantasy-relevant involvements only |
| Substitute `'Play unavailable'` | `balldontlieNflScoreboard.normalizeBdlScorePlay()` | Statistics Scores shows the row either way |
| Skip period-boundary rows | `balldontlieNflScoreboard.groupBdlPlaysIntoDrives()` | Drive grouping rule, unchanged |

A future surface that needs the complete provider sequence (play counts, drive
integrity, replay reconstruction) reads the canonical module and applies no
filter at all.

## Canonical schema

`normalizeCanonicalPlay(raw, { gameId, homeTeam, awayTeam, inferredPasserName, normalizeTeam })`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string/number | Provider `id`, else `` `${gameId}-${sequence ?? description.slice(0,24)}` `` |
| `gameId` | any | Passed through from options |
| `period` | number \| null | `period` ?? `quarter` |
| `clock` | string \| null | `clock_display` / `clock` / `time` |
| `wallclock` | number \| null | Parsed ms; null when unparseable |
| `typeSlug` | string \| null | `type_slug` / `type_abbreviation` |
| `typeDisplay` | string \| null | `type_text` / `type_abbreviation` / `type_slug` |
| `rawDescription` | string \| null | `text` / `description` / `short_text` / `desc`, verbatim; **may be null** |
| `shortText` | string \| null | `short_text` |
| `narrative` | object \| null | `parsePlayNarrative()` output, non-null only when the parser is confident. Parsing is always attempted, including without a description |
| `parsedNarrative` | object | The same parse, confident or not (Statistics Scores reads `playKind`, `penalty`, `administrative` off unconfident parses). The parser's `statYardage` input reads reported values only: a null `stat_yardage` stays unknown (`yards: null`) rather than `Number(null) = 0` |
| `team` | string \| null | The provider's possession team, **uncorrected** — whoever holds the ball when the play ends |
| `offenseTeam` | string \| null | Who ran the play (see below) |
| `defenseTeam` | string \| null | The other side |
| `startDown`, `startDistance`, `endDown`, `endDistance` | number \| null | `asNumberOrNull`: unreported stays null, never 0 |
| `startYardsToEndzone`, `endYardsToEndzone` | number \| null | Measured from whoever holds the ball at that moment |
| `startYardLine`, `endYardLine` | number \| null | Absolute, from the home goal line |
| `startPossessionText`, `endPossessionText`, `endDownDistanceText` | string \| null | Provider spot/down text |
| `statYardage` | number \| null | `stat_yardage` only |
| `homeWinProbability` | number \| null | |
| `yards` | number \| null | `yards_gained` / `yards` / `net_yards` / `stat_yardage` |
| `awayScore`, `homeScore` | number \| null | Both provider alias lists |
| `scoring` | boolean \| null | The provider flag (`scoring_play` / `touchdown`) only; null when the row says nothing |
| `scoringInferred` | boolean | `scoring` ?? `/touchdown\|field goal is good/i` against the description |
| `inferredPasserName` | string \| null | App-owned context from `playSequenceContext.js`, never presented as a provider field |
| `raw` | object | The provider row, intact, plus `gridshift_inferred_passer_name` when one was supplied |

`scoring` and `scoringInferred` stay separate on purpose: Statistics Scores
reads the provider flag alone, Fantasy Live has always read the text fallback,
and collapsing them would silently change one of them.

## Shared team-resolution rule

`resolveOffenseDefenseTeams(play, { homeTeam, awayTeam, normalizeTeam })`
accepts a canonical play or any play carrying the provider row at `.raw`.

1. An explicit provider `defense_team` / `defensive_team` wins outright — it is
   the only field that states the answer rather than implying it. The offense is
   then the other side of the game.
2. Otherwise `nflPlays/fieldGeometry.getOffenseTeam()` decides. It flips the
   provider's `team` on kickoffs, punts, missed or blocked field goals,
   interceptions, opponent-recovered fumbles (`isPossessionChangingPlay`), and
   turnovers on downs (`isTurnoverOnDowns`). A fumble the offense fell on
   itself, a converted fourth down, a penalty, and a scoring play do not flip.
   When the gamebook text is there (and no flag wiped the snap out), the
   turnovers are counted through the chain (`parseTurnoverChain`, see
   "Several turnovers on one snap"): possession changed only if the ball
   changed hands an odd number of times. A pick returned and fumbled back to
   the passing team is two changes, so `team` is the offense. The slug names
   one turnover, often the last (`fumble-recovery-own` follows an interception
   or a lost fumble), and is only the fallback for rows without text. A kick
   row filed under a fumble slug keeps the slug reading.

`normalizeTeam` lets a caller apply its own abbreviation aliasing so the
comparison against home/away is like-for-like. Fantasy Live passes
`liveScoringFeed.getTeamAbbr`; Statistics Scores passes nothing.

With no `homeTeam`/`awayTeam` the provider's `team` is carried through
uncorrected and the defense is `null`.

The geometry input the resolver reads is deliberately wider than
`canonical.typeSlug`: it falls back through `type_text` / `play_type` / `type`
when the provider sends no slug, because some summary rows carry only
`type_text` ("Interception Return Touchdown") and would otherwise never flip. It
also always reads the provider's own `scoring_play` / `touchdown` flag rather
than `scoringInferred`, so `isTurnoverOnDowns` cannot answer differently for the
two consumers on the same row.

### Approved behavior change (Fantasy Live)

Fantasy Live's private rule only flipped possession on interceptions and
opponent-recovered fumbles. It now uses the rule above, so **punts, kickoffs,
missed/blocked field goals, and turnovers on downs resolve differently than they
did** — matching Statistics Scores' drive grouping and field graphics. This was
signed off as an intentional behavior change, not a regression.

### Kick plays split the two sides across roles

On a kickoff, punt, or missed/blocked field goal, BDL's `team` names the
**receiving** side — whoever ends up with the ball — so after the flip the
kicking team is the resolved offense and the receiving team is the resolved
defense. The named players do not all follow the possession, though:

| Actor | Roster to check against |
| --- | --- |
| Kicker / punter | `offenseTeamAbbr` (kicking team) |
| Returner | `defenseTeamAbbr` (receiving team) |
| Coverage tackler / recoverer / sacker | `offenseTeamAbbr` (kicking team) |

`getActorExpectedTeam()` in `playByPlay/attributePlayActors.js` is the gate,
for Fantasy Live and Statistics Scores alike. Sending every
non-offensive role to the resolved defense checked kick-coverage tacklers
against the returning roster, where they do not exist, and their `idp_tkl`
events vanished silently. `isKickReturnPlay()` is exported from the shared
module and is backed by `fieldGeometry.isKickPossessionPlay()`, which
`isPossessionChangingPlay()` also calls — one owner of the kick pattern.

The other attribution path, `getExpectedCandidateTeam()` in
`matchPlayToStarters`, needs no equivalent: it skips defensive positions
entirely, so only the returner and the kicker/punter reach it.

**Known gap (Phase 2 review, 2026-09-15):** the table above assumes the
defensive-side actor on a kick is a coverage player. A blocked field goal or a
recovered onside kick inverts that: the blocker or recoverer belongs to the
*receiving* side, but `getActorExpectedTeam` still checks them against the
kicking roster. No captured fixture play (0 of 514) produces such an actor
today, because `parsePlayNarrative` is not confident on gamebook-only
blocked-kick text and emits no actors for those rows. If the narrative parser
learns those shapes, route blocker/recoverer on `field-goal-blocked` and onside
recoveries to the resolved defense in `getActorExpectedTeam` and pin it with a
test. (A recoverer with no team in the text now goes to the possession team.)

## Actor attribution

`attributePlayActors(play, nameIndex, options)` returns every named actor with
the roster record it resolves to: `[{ actor, textPos, expectedTeam, record,
playerId }]`. It is the only owner of which roster an actor is checked
against (`getActorExpectedTeam`) and of the lookup itself
(`nflPlays/playerNameIndex.lookupPlayerByName`). With a team, a name that does
not resolve on that roster stays unmatched — there is no league-wide fallback.

| Actor | Roster |
| --- | --- |
| Any actor the parser placed on a side (`actor.side`, several turnovers on one snap; the try's kicker after a defensive or return touchdown) | That side |
| Passer, receiver, rusher, kicker, punter, fumbler | Resolved offense |
| Kick blocker, and every defensive role on a blocked kick | Resolved defense |
| Returner | Resolved defense (the receiving side) |
| Tackler on an interception | Resolved offense (the team that threw) |
| Tackler named only in a lost fumble's return clause | Resolved offense |
| Recoverer | Its own team from the text, else the possession team (whoever ended with the ball) |
| Other defensive roles on a kick | Resolved offense (coverage) |
| Other defensive roles | Resolved defense |

The consumer layers on top:

- **Fantasy Live** (`livePlaysFeed.matchPlayToStarters`): merges the gamebook's
  `defensiveActors`, uses `normalizeStarterName` and a surname fallback for
  full-name nicknames, then assigns starter roles, team-defense credits, and the
  fumble/lateral passes, and prices the result.
- **Statistics Scores** (`statisticsPlayerQuarterStats.attributePlays` and
  `buildPlayerQuarterStats`): the narrative's actors plus a recovered passer on
  an interception, the shared name index keyed by box-score row key, sides from
  the play's carried `offenseTeam`/`defenseTeam` (else
  `resolveOffenseDefenseTeams` with `canonicalTeam`). Quarter buckets and Team
  Stats tallies are built from the matches. `matchName(name, team)` resolves a
  name the narrative did not list; with `team: null` it must be unique in the
  game.

Fixed in Statistics Scores by moving onto the shared rule (Fantasy Live
already behaved this way): kick-coverage tacklers were checked against the
receiving roster; an interception returner's tackler against the intercepting
roster; a provider `defense_team` was ignored; and any name that failed the
team check was matched league-wide. On the two fixture games with a roster of
every full-name actor, quarter splits, Team Stats breakdowns, and play-stat
tallies are unchanged: the old league-wide fallback had been papering over the
wrong team choices. The pinned cases are in
`tests/unit/playByPlayAttributeActors.test.mjs`.

## Game clock and ordering

`sortPlaysChronologically(plays)` orders by game clock (period and time left,
read from `clock_display` / `clock` / `time`), then wallclock, then arrival
order, and returns a new array. Fantasy Live's feed build
(`buildPlayEvents`), Statistics Scores' drive grouping and latest play
(`groupBdlPlaysIntoDrives`, `getLatestBdlScorePlay`, which the server's
snapshot store also calls), and the player season dashboard
(`playerSeasonGames.buildPlayerGame`) all use it.

Fantasy Live's old key mixed scales — wallclock epoch ms for timed rows,
`period × 10000 + elapsed` for untimed ones — so every row missing a wallclock
sorted ahead of every row with one, and a milestone bonus (`bonus_rush_yd_100`
and the rest) could fire on the wrong play. The season dashboard read a missing
clock as the end of its period and had no wallclock tie-break; it now falls
through to wallclock and arrival order.

`gameClock.js` owns the arithmetic. Each caller states its own choices:

| Caller | Clock | Missing clock | Overtime |
| --- | --- | --- | --- |
| `livePlaysFeed.getPlayProgress` (pace axis), `parseGlanceProgress` | Loose (`"Q3 7:12"`) | Mid-quarter (450 s left) | Progress clamps to 1 |
| `matchupReplay.getLiveGameProgress` | Strict | null | Progress clamps to 1 |
| `balldontlieNflScoreboard` scorecard merges and final-terminal clock | Strict | null | 900 s periods |
| `playerSeasonGames.gameSecond` | Its own `M:SS` split | End of period | 600 s periods |

## Game status

`classifyNflGameStatus(game)` (`src/utils/nflGameStatus.js`) reads `status` and
`status_state`. First match wins: postponed → final → delayed → halftime →
scheduled (explicit state) → live → scheduled. A final game is never live.

- `balldontlieNflScoreboard` scorecard status is the classifier.
- `liveScoringFeed.isLiveGame` is live or halftime, plus a delay the provider
  still reports as in progress.
- `liveScoringFeed.isFinalGame` gates server caching and the finished-game
  archive, so it uses `finalFromState: false`: final only on the provider's
  final text, never on `status_state` alone.
- `isNflGameActive` (live, halftime, or delayed) is for a poller that keeps
  watching a stopped game; the server's private `isLiveBdlGame` can move onto
  it.

## Per-player sentences

One provider row can credit players who did different things. A touchdown row
from the scoring summary also carries the extra point ("Cam Skattebo 16 Yd Run
(Dominic Zvada Kick)"), so the kicker is credited from the touchdown row.
`parsePlayNarrative()` returns `extraPoint: { good, kicker, sentence }` for that
shape, and `livePlaysFeed.describePlayForRole(play, role)` picks the sentence
for one credited player. Every per-player row uses it rather than
`play.description`: Fantasy Live events (`buildPlayEvents`, which feeds the
matchup feed and player drilldowns) and Statistics player plays
(`playerSeasonGames.js`).

Every defender the official text credits is named in the play sentence, so a
row never shows points the sentence cannot explain: tacklers ("tackled by"),
pass defenders on an incompletion ("broken up by"), the forcer on a fumble
("forced by"), and quarterback hitters on a pass ("was hit by … on the
throw"). `parsePlayNarrative()` reads them through `parseDefensiveActors()`,
the same reader that credits them.

## Defensive and IDP fields

The stat-delta helpers read a **consumer-shaped** play — `description`, `type`,
`yards`, `scoring`, `narrative`, `raw` — which is the shape
`livePlaysFeed.normalizePlay()` produces. They were moved without behavior
change.

Every key below must stay in step with `scoringEngine.js`'s
`STAT_TO_SCORING_KEY` / `DEFAULT_SCORING` — see [[Scoring Call Sites]].

- Individual defense (`role: 'defense'`): `idp_sack`, `idp_int`, `idp_ff`,
  `idp_fr`, `idp_fr_yd`, `idp_safety`, `idp_pd`, `idp_def_td`, `idp_int_td`,
  `idp_int_ret_yd`, `idp_fr_td`, `bonus_def_int_td_50p`,
  `bonus_def_fum_td_50p`, and `idp_tkl` as the fallback when nothing else in
  the sentence applies.
- Team defense (`role: 'team_defense'`, via `buildTeamDefensePlayDelta()`):
  `sack`, `sack_yd`, `int`, `safe`, `def_pass_def`, `def_ff`, `def_td`,
  `def_int_td`, `int_ret_yd`, `def_fum_td`, `fum_ret_yd`, and the same two
  50-yard bonuses.
- `isTeamDefenseScoringPlay()` is simply "the team-defense delta is non-empty".

`estimatePlayPoints(play, role, position, scoringSettings, roleDetail)` is the
one place per-play fantasy points are rounded (two decimals). `buildPlayEvents`
calls it rather than inlining `calcPoints(buildPlayStatDelta(...))`.

## Compound plays and attribution rules

Measured against weeks 6–9 of 2026 (43 games, 7,939 rows): the narrative was
unconfident on 155 rows (1.95%) before v9.3.8 and 37 (0.47%) after. The rest
are onside kicks, muffed punts, center-fumbled snaps, and one-off shapes, which
render the official description.

- **Fumble clause.** `short_text` writes a fumble after the play it ended
  ("… to Travis Hunter Travis Hunter Fumble Teddye Buchanan 0 Yd Fumble
  Recovery"), or before it on a kick. `splitFumbleClause()` lifts the clause
  out and the base grammar must match the rest. The fumbler must be that play's
  ball carrier: the receiver of a pass, the rusher, the sacked passer, the
  returner, or the aborted-snap holder. A passer fumbling on a pass play, or a
  fumbler who keeps the play going after recovering (`fumbleContinues()`), is
  a botched snap ahead of the real play and stays unparsed.
- The fumbler keeps their base role (no second `fumbler` actor), so a kick
  returner is still checked against the receiving roster. `narrative.fumble`
  carries `{ fumbler, recoverer, returnYards }`; `narrative.returnYards` stays
  the kick return.
- The base gain and tackle come from the official description **before**
  FUMBLES. The compact text can measure to the recovery, and the last tackle
  group can be the recovery-return tackle. On a lost fumble the provider's
  `stat_yardage` is the defense's return, so `buildPlayStatDelta` credits
  `narrative.creditedYards` whenever `narrative.fumble` is set.
- After an opponent recovery, the carrier earns a first down only if their own
  credited yards reached the line (`isFirstDownPlay`).
- A returner is credited `narrative.returnYards` (yards to a return foul's
  spot; zero on "Return, No Gain") rather than the provider's net.
- An interception narrative names the thrower from the official description,
  so the passer is charged even when the compact text names only the defender.
- **Kick recovered by the kicking team.** The gamebook capitalizes RECOVERED
  for a change of possession. A kick with `FUMBLES`/`MUFFS … RECOVERED by` has
  changed hands twice, `team` already names the kicking team, and
  `isPossessionChangingPlay()` does not flip it.
- **Recovering your own side's fumble is no recovery.** The gamebook writes
  "recovered by" (lowercase) when the side holding the ball kept it. That
  recoverer carries `ownRecovery: true` and Fantasy Live credits them nothing
  (no `idp_fr`, no team `fum_rec`), as Sleeper's lines read (week 3 of 2026,
  LV at NO: A.Butler). Statistics Scores does not read the flag yet.
- **A forcer correction note.** "… RECOVERED by HST-T.Togiai at HST 46. Fumble
  Forced by 55-D.Hunter." replaces the defender in parentheses
  (`parseFumbleCredit`, the chain); Sleeper credits the note's player (week 3
  of 2026: D.Hunter, M.Crosby, D.Henley).
- Fantasy Live's `describePassFumble()` wording is used only when the narrative
  did not parse the fumble (lateral chains). Otherwise the feed row, the shared
  Matchups row (`groupSharedPlayEvents`), and Statistics read the same
  sentence.

## Several turnovers on one snap

`parseTurnoverChain(rawText)` (`nflPlays/playNarrative.js`) reads every
turnover in the standing gamebook text, in order: the interception (defender,
the defender who tipped it, spot, return, the return's tacklers), then each
`FUMBLES` clause (who had the ball, who forced it, who came up with it, and the
return and its tacklers). Sides are relative to the snap: `offense` ran it. The
gamebook capitalizes `RECOVERED` when the ball changes hands and writes
"recovered by" when the side holding it kept it; checked against every fumble
in weeks 1–9 of 2026 (410 rows: the chain's final holder is the provider's
`team` on every one but turnovers on downs). A kick in the text starts the
chain with the ball on the receiving side. `complete: false` means a clause
this reader does not know; callers fall back.

- **Possession** counts the chain (see the shared team-resolution rule).
- **Narrative.** A snap with more than one turnover (`isCompoundTurnover`), or a
  defensive score whose scoring summary replaced the play ("Jonas Sanker 87 Yd
  Fumble Return"), is told from the chain: the play that started it from the
  compact text when it can be read there (its gain is the official credit: "Pass
  Complete for 16 Yds"), else from the gamebook; then one sentence per fumble
  naming who had the ball ("Davison Igbinosun fumbled, forced by J.Ruckert, and
  Jamien Myers recovered it."). The compact text cannot carry the rest: the
  feed cuts it off and can list the fumblers out of order. Laterals keep their
  own readers.
- **`narrative.fumbles`** lists every fumbler with `side` and `lost` (the other
  side came up with it); the matcher charges each one, looked up on that side's
  roster, so an intercepter who fumbles is charged `fum` (and `fum_lost` when
  the passing team recovered). `narrative.fumble` is the recovery that changed
  hands, for the credited gain and the recovery's own advance.
  `narrative.turnover` is true when the defense ended with the ball; a
  touchdown then is the defense's, never the passer's, receiver's or runner's.
- **Actors.** `parseDefensiveActors` gives each chain forcer, recoverer and
  tackler a `side`. After a turnover the offense defends: a tight end who strips
  the interception returner earns `idp_ff` and the tackle, as in Sleeper's lines
  (week 3: J.Johnson, M.Alie-Cox; week 5: J.Chase).
- **Midfield** is written bare ("INTERCEPTED by K.Medrano at 50").
  `FIELD_SPOT_PATTERN` accepts a bare `50` (never another bare number or a
  distance), and `possessionTextToPercent` / `spotPhrase` read it as midfield.
- **Interceptions** credit the defender `idp_pd` as well as `idp_int`, and the
  defender who tipped it ("INTERCEPTED by N.Pritchett (R.Thomas) at SEA 3") with
  `idp_pd`: every interceptor's line in weeks 1–9 of 2026 (155 of 155) carries a
  pass defensed per pick. A return that runs out of bounds or scores ("J.Trotter
  for 38 yards, TOUCHDOWN") is read for its yards.
- **The try after a defensive or return touchdown** rides on the scoring
  summary ("Josiah Trotter 38 Yd Interception Return (Chase McLaughlin Kick)").
  The feed has no separate extra-point row, so the kicker is an actor of that
  row with `side` set to the side that scored. Every such kicker in weeks 1–9 of
  2026 was one extra point short of Sleeper's line without it.

Known gaps: tackles on a chain are priced by the play's whole tackler count, so
two solo stops in different returns read as assisted; a summary-only pick row
filed under `fumble-recovery-own` (week 9, LV at SF) is not flipped; Statistics
Scores still counts an own-side recovery.

## Tackles (v9.5 parser pass, weeks 1–10 of 2026)

Every rule here was checked against Sleeper's final lines for completed weeks.

- **Solo or assisted.** `parseTackleShares()` reads the tackle group: one name
  is a solo tackle; "(A; B)" is an assisted tackle each (5,858 of 5,866 in
  Sleeper's lines); "(A, B)" is A's solo tackle and B's assist (160 of 162
  pairs, never the reverse). Each defensive actor carries `share`; chains carry
  `baseTackleShares` and per-event `tackleShares`, so a lone tackler of a
  return is solo however many names the first stop had.
- **Spaced surnames.** A credit group may name "K.Van Noy" or "L.Van Ness";
  such a group used to fail whole and drop every tackler in it.
- **Gamebook prefixes.** "Ma.Wilson", "Jar.Jones", "Aj.Terrell" and "Dr.Jones"
  resolve through the initial plus a first-name prefix check
  (`lookupPlayerByName`); "S.Joseph" matches a hyphenated surname's first half.
- **Two teammates on one key.** A defensive credit on the snap's defense, away
  from a kick, takes the one candidate at a defensive position
  (`attributePlayActors` → `prefer`): "D.Williams" is linebacker Dorian, not
  tackle Daryl.
- **Reversed plays.** The narrative reads its tacklers from the corrected
  version (`authoritativeText`), not the overturned one.
- **Offense tackling after a lost fumble.** A tackler on the offense's roster
  on a non-kick snap is credited `idp_tkl` at any position (Sleeper credits
  linemen and quarterbacks). Rows whose text is a kick are left out until kicks
  filed under fumble slugs are read as kicks.
- **Unchanged, by evidence.** Tackles on "No Play" rows are not credited
  (crediting them broke 469 matching lines and fixed 11). Kick-coverage
  tackles stay `st_tkl_solo` and out of `idp_tkl` (924 to 1).

## Game context, penalties, and the remaining shapes (v9.3.8, second pass)

Over weeks 6–9 of 2026 every one of 7,939 rows now parses.

- **Game context.** `collectPlayNames(rows)` gathers the full names a game's
  compact texts spell out; pass it as `nameHints`. `buildPlayerNumbers(rows)`
  turns roster rows into the `playerNumbers` lookup. Both reach
  `parsePlayNarrative` through `normalizeCanonicalPlay`, Fantasy Live's
  `normalizePlay` / `buildPlayEvents(…, { playerNumbers })`, and Statistics'
  `normalizeBdlScorePlay` / `groupBdlPlaysIntoDrives(…, { playerNumbers })`.
  Fantasy takes numbers from Sleeper's player list; Statistics from the game's
  BDL player lines (players without stats, usually linemen, have none there).
- **Interceptions** read "Sam Darnold's pass for Tory Horton was intercepted by
  Kris Abrams-Draine at the Denver 31." (`spotPhrase`: shared cities use the
  nickname). The thrower is a passer actor so the interception is charged.
- **Penalties.** `parsePenaltyClause` reads every flag on the snap and returns
  the one that stands (or `offsetting` when both teams' flags cancel). The
  sentence names the player, team and number, the foul, the yards, and the
  next spot: "Byron Murphy II (Seattle, #91) was flagged for a face mask, 15
  yards. Ball at the Denver 44." A flag that wipes the play out leads with what
  it cost: "Touchdown called back: …", "Interception erased: …", "…'s 12-yard
  run didn't count." A play that lost nothing just adds the flag.
- **Shapes added:** a snap fumbled before the real play (`fumble.snap`), muffed
  punts, onside kicks, summary-only rows (return TD, fumble-recovery TD, safety,
  defensive conversion, blocked-kick return), a sack-fumble return touchdown
  told from the gamebook, completed-pass lateral chains (`lateral-pass`, from
  `parsePassLaterals`), a loose snap pitched on and fumbled away
  (`snap-lateral`, with every fumbler in `narrative.fumbles`), and a kick row
  whose compact text is missing or the literal string `"null"`.
- `narrative.chain` marks a lateral chain: the field animation draws it only
  from confirmed lateral geometry, never as a plain catch.
- Possession: a kick the kicking team recovered (capital `RECOVERED by` after
  `FUMBLES`/`MUFFS`) and a fumble out of the defense's end zone for a touchback
  are both read as possession changes by `isPossessionChangingPlay()`.

## Tests

| Behavior | Test | Command |
| --- | --- | --- |
| Completeness, canonical fields, shared team resolution, team-defense/IDP deltas, `estimatePlayPoints` equivalence | `tests/unit/playByPlayNormalizePlay.test.mjs` | `node --test tests/unit/playByPlayNormalizePlay.test.mjs` |
| Statistics Scores adapter output and drive grouping | `tests/unit/balldontlieNflScoreboard.test.mjs` | `node --test tests/unit/balldontlieNflScoreboard.test.mjs` |
| Fantasy Live adapter, matching, and feed events | `tests/unit/livePlayGrouping.test.mjs`, `tests/unit/livePlayText.test.mjs`, `tests/unit/liveFeedClassification.test.mjs` | `node --test tests/unit/livePlayGrouping.test.mjs` |
| Shared actor attribution: coverage tackler, no cross-team match, `defense_team`, interception tackler, carried narrative | `tests/unit/playByPlayAttributeActors.test.mjs` | `node --test tests/unit/playByPlayAttributeActors.test.mjs` |
| Chronological order with mixed wallclocks; milestone bonus on the crossing play | `tests/unit/playByPlayOrder.test.mjs` | `node --test tests/unit/playByPlayOrder.test.mjs` |
| Game-clock arithmetic | `tests/unit/playByPlayGameClock.test.mjs` | `node --test tests/unit/playByPlayGameClock.test.mjs` |
| Game status classifier and its wrappers | `tests/unit/nflGameStatus.test.mjs` | `node --test tests/unit/nflGameStatus.test.mjs` |
| Possession correction itself | `tests/unit/nflFieldGeometry.test.mjs` | `node --test tests/unit/nflFieldGeometry.test.mjs` |
| Compound fumbles, no-gain returns and picks, sacker-less sacks, kick recoveries, both-sides shared rows, several turnovers on one snap (completed-week regressions) | `tests/unit/playNormalizationFumbles.test.mjs` | `node --test tests/unit/playNormalizationFumbles.test.mjs` |
