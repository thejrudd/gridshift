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
| `src/utils/playByPlay/playStatDelta.js` | `buildPlayStatDelta()`, `buildTeamDefensePlayDelta()`, `isTeamDefenseScoringPlay()`, `estimatePlayPoints()`, `getPlayEventClassification()`, `isFirstDownPlay()`, `extractYardsFromText()`, `extractReturnYards()`, `PLAY_MATCH_STATS` |
| `src/utils/nflPlays/fieldGeometry.js` | Still the single owner of the possession correction (`getOffenseTeam()`, `isPossessionChangingPlay()`, `isTurnoverOnDowns()`). The resolver calls it; it does not restate it |
| `src/utils/nflPlays/playNarrative.js` | Still the single owner of play text → sentence + actors. The canonical normalizer calls it |

Consumers:

- `src/utils/balldontlieNflScoreboard.js` — `normalizeBdlScorePlay()` is a thin
  Statistics Scores adapter over the canonical play.
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

`matchNarrativeActors` in `livePlaysFeed.js` is the gate, via
`getActorExpectedTeam(play, actorRole, isKickReturnPlay(play))`. Sending every
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
recoveries to `defenseTeamAbbr` and pin it with a test.

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

## Tests

| Behavior | Test | Command |
| --- | --- | --- |
| Completeness, canonical fields, shared team resolution, team-defense/IDP deltas, `estimatePlayPoints` equivalence | `tests/unit/playByPlayNormalizePlay.test.mjs` | `node --test tests/unit/playByPlayNormalizePlay.test.mjs` |
| Statistics Scores adapter output and drive grouping | `tests/unit/balldontlieNflScoreboard.test.mjs` | `node --test tests/unit/balldontlieNflScoreboard.test.mjs` |
| Fantasy Live adapter, matching, and feed events | `tests/unit/livePlayGrouping.test.mjs`, `tests/unit/livePlayText.test.mjs`, `tests/unit/liveFeedClassification.test.mjs` | `node --test tests/unit/livePlayGrouping.test.mjs` |
| Possession correction itself | `tests/unit/nflFieldGeometry.test.mjs` | `node --test tests/unit/nflFieldGeometry.test.mjs` |
