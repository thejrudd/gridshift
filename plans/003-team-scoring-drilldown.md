# 003 — Team scoring drilldown

Replace the Fantasy Matchups team scoring sheet (`TeamScoreBreakdown` in `CompanionMatchup.jsx`) with the team scoring drilldown from the Claude Design study "Team Scoring Options".

Status: IMPLEMENTED (uncommitted, pending live acceptance). Severity: MEDIUM.

Resolved: built on the current `v9.3-dashboard-updates` working tree; group colours and names follow the app (`BREAKDOWN_GROUPS`, player-drilldown tones). Changed after review: the Final layout shows every point — each spot's full final score by group against its projection plus a table of every category that scored (stat and points, no projection data) — instead of differences only.

## Agreed decisions

- One drilldown. The app picks the layout from game state; there are no Pregame / Live / Final tabs inside it.
  - Pregame → **Projection board**: projected total, "Where the projection comes from" bar, By Position, category table.
  - Live → **Scoreboard**: points so far, pace bar, By Position (scored, split by scoring group, against projection), biggest so far.
  - Final → **Beat or missed**: final against projection, each position's difference split by scoring group, categories that beat or missed.
- It replaces the current By category / By player sheet. Its category and player detail is carried by the category table.
- By Position lists every starting lineup spot in the league's roster order (`league.roster_positions` without BN/IR), so a league with DEF, SUPER_FLEX or IDP shows those spots, and an unfilled spot shows as Empty.
- By Position bars are split by scoring group, in the same colours as "Where the projection comes from".
- "Where the projection comes from" and By Position cross-filter each other and the category table: a scoring group filters By Position to that group's points; a lineup spot shows its share of each group. Selecting either never redraws the charts.
- Every number comes from the same source Matchups already shows (see Data contract). No new projection or scoring source.

## What already exists (reuse, don't rebuild)

| Need | Existing piece |
| --- | --- |
| Lineup spots, players, per-starter projection, game state | `enrichedSlots` (`slotPos`, `mine`, `opp`) in `CompanionMatchup.jsx`; `starterPositions` |
| Per-category projected points under league scoring | `buildPlayerProjectionBreakdown(projection, scoring, position)` in `playerMatchupPresentation.js` (its "Projection adjustment" row reconciles to the projection total) |
| Per-category actual points, reconciled to official totals | `buildFantasyMatchupScoringBreakdown()` in `fantasyMatchupBreakdown.js` (`playerRows[].breakdown`, "Other Scoring Adjustments") |
| Scoring groups | `groupFantasyBreakdownRows()` / `BREAKDOWN_GROUPS` in `playerMatchupPresentation.js` |
| Group colours | `.pmd-proj [data-group=…]` tones in `PlayerMatchupBreakdown.css` |
| Live projected finish | `getPaceAdjustedProjection()` per starter; team value `paceExpectedA/B` from `buildMatchupWinProbability()` |
| Pregame projection once settled | Recorded baselines (`useMatchupProjectionBaselines`, `summarizeRecordedPregameProjection`), then current external projection, then forecast — same order as the masthead |
| ESPN derived rows | The `loadEspnFantasyGameLogWeekRow` effect inside `TeamScoreBreakdown` |
| Dialog frame and reveal | `PlayerMatchupBreakdown` dialog (`Modal`, mobile sheet, container queries), `gridshift-reveal` |
| Demo data | `src/dev/liveSandbox/*` (Sandbox Squad, 2025 Week 12) |

## Data contract — one source with Matchups

The drilldown receives values Matchups has already computed rather than recomputing them:

- **Projected total** = the masthead's projection for that side (recorded pregame → external → forecast once settled; plain projection before kickoff).
- **Live projected finish** = `paceExpectedA/B`; each spot's "still to come" = its pace-adjusted projection minus points so far. (The design study used projection × game time left; the app's pace model with carryover wins.)
- **Points so far / final** = the displayed matchup points (`myDisplayPoints` / `oppDisplayPoints`, official `custom_points` when present).
- Category rows must add up to those totals; any gap stays visible as the existing adjustment rows, never hidden.

## Steps

1. **Model** — new pure `src/utils/teamScoringDrilldownModel.js`. Input: one side's `enrichedSlots` entries with `slotPos`, the totals above, scoring settings, weekly stats, player points, recorded baselines, ESPN derived rows, phase. Output: `phase`, `spots[]` (key, label, player or empty, game status, projected / actual / pace values, grouped projected and actual rows), group totals, category rows tagged with spot, player and group, and team totals. Export `getFantasyBreakdownGroupId` if the model needs it rather than duplicating the mapping.
2. **Component** — new `src/components/companion/TeamScoringDrilldown.jsx` and `TeamScoringDrilldown.css` (`tsd-*` classes, semantic tokens only). Phase rule: no starter started → Pregame; started and not settled → Live; `matchupIsSettled` → Final. Cross-filter state `{ spot, group }` lives in the component; bars keep stable keys and change by class and width transitions, so selection never remounts a chart. Interactive parts are buttons with `aria-pressed`; the category table stays a real table. A source line names where the numbers come from.
3. **Wire up** — replace both `TeamScoreBreakdown` mounts (bye week and normal) and pass the side's slots and totals; opponent scorecards open the same drilldown. Move the ESPN derived-row effect into the new component, then delete `TeamScoreBreakdown`.
4. **Tests** — `tests/unit/teamScoringDrilldownModel.test.mjs`: totals equal the masthead values at pregame, a live replay moment and final (sandbox fixture: 125.07 / pace / 244.84); empty and extra lineup spots; negative groups; adjustment rows; ESPN path. Add a rendering test modelled on `playerMatchupRendering.test.mjs`. Keep `fantasyMatchupBreakdown.test.mjs` passing.
5. **Docs** — `docs/Fantasy Live.md` (drill-ins), `docs/Where To Edit.md` (new files), `docs/Scoring Call Sites.md` (new scoring call site), `docs/Loading Motion.md` (reveal), and a `TO_DO.md` entry. AGENTS.md / CLAUDE.md unchanged.

## Validation

- `npm run lint`, `npm run test:unit`.
- Live Sandbox in `npm run dev`: open both scorecards before kickoff, mid-Sunday and after the last game, on desktop and phone width; check the totals match the masthead and that selecting groups or spots doesn't redraw bars.
- Detailed live UI acceptance is the user's (per AGENTS.md). Edits stay uncommitted for review.

## Open questions

1. **Branch** — `v9.3-dashboard-updates` already has ~49 uncommitted `src` files. Build on top of that working tree, or start a new branch from it?
2. **Group colours** — the app's player drilldown uses Receiving = orange, Kicking = signature yellow; the design study used the reverse. Recommendation: use the app's tones so the team and player drilldowns agree.
3. **Group names** — the study's "Turnovers" and "Projection floor" become the app's "Negative plays" and "Model" groups. Recommendation: keep the app's names.
