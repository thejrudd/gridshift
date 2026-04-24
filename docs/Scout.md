# Scout Tab — Architecture & Implementation Reference

Introduced in v7.0 Alpha. Scout is a top-level rookie evaluation hub backed by static 2026 prospect data. It supports a pre-draft state with ranked prospects and nullable draft result fields, then can be updated after each pick with actual round, pick, overall, and team.

---

## Design Decisions

| Decision | Choice |
|---|---|
| Tab name | Scout |
| Navigation | Top-level tab alongside Predictions, Statistics, Companion, Trade |
| Release badge | Alpha |
| Layout | Single scroll page on mobile; split panel (list left, detail right) on desktop (lg+) |
| Mobile detail | Bottom sheet (flat top edge, no rounded corners) |
| Spotlight layout | Fantasy-first QB/RB/WR/TE cards derived from the current sorted rookie data |
| Aesthetic | Digital war room + Broadcast Editorial hybrid — position identity colors, tier badges, letter grades |
| Rounded corners | None on player info elements; chip filters intentionally keep rounded corners |
| Player photos | ESPN college headshots when `espnCollegeId` is available; Sleeper CDN is a later fallback via `sleeperPlayerId`; otherwise default player silhouette |
| Compare | Ad-hoc trigger from list rows or detail card; sheet on mobile, centered modal on md+ |
| Data | Static bundled data in `src/data/rookies.js`; richer top-prospect records plus Jordan Reid's ESPN top 499 board as broad fallback coverage; combine measurements/testing layered in from static source maps; no live API dependency |

---

## File Map

```
src/components/scout/
  ScoutTab.jsx                  Shell — state, filter/sort toolbar, layout orchestration
  ScoutPositionalSpotlight.jsx  Fantasy-first editorial header
  ScoutRosterList.jsx           Sortable, filterable ranked list
  ScoutPlayerCard.jsx           Detail card content — Draft → College → Combine
  ScoutPlayerSheet.jsx          Wrapper: bottom sheet or desktop right panel
  ScoutCompareSheet.jsx         Side-by-side compare overlay
  scoutUtils.js                 Shared formatters, colors, photo helpers

src/data/
  rookies.js                    Static 2026 rookie/prospect dataset
```

---

## Data Model

`ROOKIES_2026` exports an array of rookie records. Every record includes:

```js
{
  id: string,
  name: string,
  position: string,
  positionGroup: 'QB' | 'RB' | 'WR' | 'TE' | 'DL' | 'LB' | 'DB' | 'OL' | 'ST',
  college: string,
  sleeperPlayerId: string | null,
  espnCollegeId: string | null,
  draftStatus: 'prospect' | 'drafted' | 'undrafted',
  draftRound: number | null,
  draftPick: number | null,
  draftOverall: number | null,
  draftTeam: string | null,
  draftTeamName: string | null,
  projectedOverall: number | null,
  bigBoardRank: number | null,
  nflGrade: number | null,
  dynastyAdp: number | null,
  tier: 'Elite' | 'Starter' | 'Rotational' | 'Developmental',
  collegeStats: object | null,
  combine: object,
  combinePercentiles: object,
  sources: object
}
```

Pre-draft records keep draft result fields as `null`; UI must render “Not drafted yet” rather than placeholder pick/team values. Post-draft updates should only fill verified `draftStatus`, `draftRound`, `draftPick`, `draftOverall`, `draftTeam`, and `draftTeamName`.

Fantasy positions (`QB`, `RB`, `WR`, `TE`) can include richer `collegeStats` and dynasty ADP when verified. Non-fantasy positions remain lighter cards: rank, NFL grade, tier, college, draft slot, and combine where available.

The bundled dataset is intentionally layered: `RICH_ROOKIES_2026` keeps the manually curated records with NFL tracker grades, fantasy stat placeholders, and verified photo IDs; `ESPN_TOP_499_BOARD` adds full-board prospect coverage from Jordan Reid's 2026 ESPN ranking; `rookieCombine.js` layers in static combine measurements and testing. The final `ROOKIES_2026` export de-dupes by normalized player name, preserves richer records first, and computes combine percentiles automatically from the imported class data by position group.

For pre-draft player photos, prefer verified ESPN college athlete IDs because most prospects will not have Sleeper player photos yet. Add `espnCollegeId` from the ESPN college football profile URL (`/player/_/id/<id>/...`); `scoutUtils.playerPhotoUrl()` maps it to ESPN's college-football headshot CDN.

---

## UI Behavior

- Scout is organized into three top-level views:
  - `Prospects` is the pre-draft board, filters, player profile panel, and compare flow.
  - `Picks` is the full 2026 draft order by round, sourced from `src/data/draftPicks.js` unless a live feed URL is configured.
  - `Results` is the post-draft outcome view, populated from `drafted` records in `ROOKIES_2026`.
- Filters: `All`, `Fantasy`, `QB`, `RB`, `WR`, `TE`, `DL`, `LB`, `DB`, `OL`, `ST`.
- `Fantasy` filters the board to QB/RB/WR/TE only.
- `Combine Data` filters to prospects with verified combine drill results, not measured-only players.
- Sorts: Projected Pick, Prospect Rank, NFL Grade, Dynasty ADP, 40-Yard Dash, Rush Yards, Rec Yards.
- Null sort values always sort last so blank draft/ADP/combine data never floats above verified data.
- Rank (`i + 1`) is assigned on the full sorted list before position/search filtering, per the ranked-list gotcha in `AGENTS.md`.
- Search covers player name, college, position, position group, team abbreviation, and team name.
- Top Prospects is derived dynamically from the current sorted dataset, taking the first available QB/RB/WR/TE.
- `projectedOverall` is the current pre-draft default sort. In alpha it is a bundled, position-adjusted board heuristic, not a live consensus mock feed.
- Prospect tiers are editorial labels: `Elite` for blue-chip prospects, `Starter` for players with a realistic starting path, and `Rotational` for role-player or depth contributors.
- The in-app Scout guide should be updated when Scout's user workflow or mental model changes in a meaningful way (new tabs, new core filters, new comparison behavior, new data surfaces). Do not update it for minor copy, spacing, or visual-only polish.
- Combine status is surfaced in Scout UI as `Tested`, `Measured Only`, `Invitee`, `Pro Day Only`, or `No Combine`.

### Live Picks Feed

The Picks tab uses static bundled draft order by default. To reflect draft-day pick trades without rebuilding the app, configure a public or proxied JSON feed:

```bash
VITE_SCOUT_DRAFT_PICKS_URL=https://example.com/scout-draft-picks.json
VITE_SCOUT_DRAFT_PICKS_INTERVAL_MS=60000
VITE_SCOUT_DRAFT_RESULTS_URL=https://example.com/scout-draft-results.json
VITE_SCOUT_DRAFT_RESULTS_INTERVAL_MS=30000
VITE_SCOUT_USE_ESPN_DRAFT_RESULTS=true
```

The client polls these URLs with `cache: 'no-store'`, falls back to bundled data if a feed fails, and never requires a secret in the browser. The picks feed can be either an array or `{ "picks": [...] }`; the results feed can be an array, `{ "results": [...] }`, or `{ "picks": [...] }`.

If `VITE_SCOUT_DRAFT_RESULTS_URL` is not set, Scout Results defaults to ESPN's undocumented public draft rounds endpoint. Set `VITE_SCOUT_USE_ESPN_DRAFT_RESULTS=false` to disable that best-effort integration. ESPN is not a guaranteed contract; keep the manual `src/data/draftResults.js` fallback current for critical draft-night data.

Required pick fields:

```js
{
  round: 1,
  overall: 1,
  teamName: 'Las Vegas Raiders',
  note: 'from Panthers' // optional
}
```

Optional result fields such as `playerName`, `position`, `college`, and `source` are accepted but not required by the Picks view today.

Required result fields:

```js
{
  round: 1,
  pick: 1,
  overall: 1,
  teamName: 'Las Vegas Raiders',
  playerName: 'Fernando Mendoza',
  position: 'QB',
  college: 'Indiana'
}
```

---

## Post-Draft Update Workflow

1. Update only `src/data/rookies.js`.
2. For each drafted player, set `draftStatus: 'drafted'` and fill round, pick, overall, team abbreviation, and team name.
3. Leave undrafted players as `prospect` until the draft ends, then mark confirmed undrafted priority players as `undrafted`.
4. Add verified combine, college production, and dynasty ADP only when a source is available; leave unknown values `null`.
5. When combine data is updated, let `rookieCombine.js` continue deriving percentile bars automatically instead of hand-entering `combinePercentiles`.
5. Run `npm run build` and `npm run validate:routing`.

## ESPN Photo ID Helper

Use `scripts/scout-espn-ids.mjs` to track and apply ESPN college athlete IDs for pre-draft photos.

```bash
node scripts/scout-espn-ids.mjs --missing
node scripts/scout-espn-ids.mjs --set "Rueben Bain Jr.=https://www.espn.com/college-football/player/_/id/1234567/rueben-bain-jr"
node scripts/scout-espn-ids.mjs --map tmp/scout-espn-ids.json
```

The helper normalizes names for matching and extracts the numeric ID from ESPN profile URLs, but it does not scrape ESPN automatically. Only apply IDs after verifying that the ESPN profile is the correct player.

## Combine Audit Helper

Use `scripts/scout-combine-audit.mjs` to compare Scout against the official NFL combine invite list and confirm coverage.

```bash
node scripts/scout-combine-audit.mjs
```

The audit reports total invitees, matched invitees in `ROOKIES_2026`, any unmatched names, and the current split between `Tested`, `Measured Only`, and `Invitee` records.

---

## College Production Import

Scout college production is imported from CollegeFootballData.com with a local Node script. React never calls CFBD directly, and CFBD keys must stay in shell environment variables only. Do not put `CFBD_API_KEY` or any paid API key in `.env`, `VITE_*`, source files, generated data, screenshots, or docs examples.

```bash
CFBD_API_KEY=... node scripts/import-scout-production.mjs --year 2025
CFBD_API_KEY=... node scripts/import-scout-production.mjs --year 2024,2025 --dry-run
```

The script fetches `/stats/player/season` for offensive, defensive, turnover, kicking, punting, and return categories by default using `Authorization: Bearer <key>`, normalizes player names and college/team names, matches rows to records in `ROOKIES_2026`, and writes `src/data/rookieProduction.generated.js`. The generated file is a static data artifact consumed by `src/data/rookies.js`; it contains no secrets and does not mutate curated rookie records.

`rookies.js` merges generated `collegeStats` conservatively: curated non-null stat fields win and generated values fill missing fields. Scout renders fantasy production for QB/RB/WR/TE, defensive production for DL/LB/DB, and kicking/punting/return production for ST. Offensive linemen usually do not receive meaningful individual CFBD player-season production; keep OL cards tolerant of missing stats unless a separate verified source is added for starts, snaps, pressures, or sacks allowed.

After each import, review the script summary: matched count, unmatched production rows, prospects missing production, and output path. Investigate unmatched rows before treating the generated file as complete, especially transfers and same-name players.

---

## Route And Navigation

Scout uses canonical route segments for its top-level views:

- `/scout` — Prospects
- `/scout/picks` — Picks
- `/scout/results` — Results

- `src/App.jsx` lazy-loads `ScoutTab`.
- `src/utils/appRoutes.js` parses, normalizes, and builds Scout view routes.
- `src/components/Sidebar.jsx` and `src/components/BottomTabBar.jsx` show Scout as Alpha.
