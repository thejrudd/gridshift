# NFL Predictor — Changelog

All notable changes, oldest first. Add new entries at the bottom.

---

## v2.3 — Team Search & Conference Filter
*2026-02-27*

- **Team Search** — Search teams by name or abbreviation directly from the predictions view.
- **Conference Filter** — Filter predictions by AFC/NFC from an inline filter bar below the header.
- **v2.3.1** — Fixed iOS auto-zoom on search inputs by enforcing `font-size: 16px` on all inputs.

---

## v3.0 — Broadcast Editorial Visual Overhaul
*2026-03-07*

- **Sidebar + bottom tab bar navigation** — Fixed 240px sidebar on desktop; sticky top nav + bottom tab bar on mobile/tablet.
- **Unified design token system** — CSS custom properties for color, spacing, and typography across all views.
- **Broadcast Editorial aesthetic** — Barlow Condensed display type, signature amber accent (`#F5B700`).
- **Redesigned prediction cards, standings, and playoff bracket.**
- **Polished mobile experience** with touch-optimized interactions.

---

## v3.1 — Favorite Team Theming
*2026-03-07*

- **Favorite Team Theming** — Pick your favorite NFL team to theme the app. The team's primary color overrides the signature amber accent across tab underlines, sidebar nav indicator, progress bar, bottom tab bar, and conference filter toggles. Selection persists in localStorage. Accessible via "My Team" in the sidebar footer (desktop) and the mobile action sheet.

---

## v4.0 — Sleeper Fantasy League Integration
*2026-03-14*

- **Sleeper Integration** — Connect via Sleeper username, select a league, sync scoring settings.
- **Companion Tab** — Fantasy tools: Connect, Roster, Matchup, Waiver, and Scoring views.
- **Fantasy Matchup** — Side-by-side starter comparison with full scoring breakdowns.
- **Positional Rankings** — Week and season rank per player in the matchup view.
- **Projections** — Min/max/projected ranges factoring opponent strength, home/away, weather, and snap trend.
- **Custom Scoring Engine** — PPR / Half-PPR / Standard with per-stat multipliers; imports from Sleeper league.

---

## v4.1 — Matchup Enhancements
*2026-03-14*

- **Matchup Difficulty Badge** — Easy / Avg / Hard badge per player based on defensive points allowed to that position vs league average (requires 3+ games of data).
- **Redesigned Matchup Player Card** — Cleaner three-line layout: name + team, scored / projected range, vs OPP + location + badge.
- **Enhanced Player Drilldown** — Rankings (week rank, season rank, avg PPG) and Game Context sections above the stat breakdown.
- **Snap % Projection Factor** — Recent snap usage (last 4 games) vs season average as a fourth projection multiplier.
- **Companion Guide** — Full guide content for the Companion tab.

---

## v4.2 — Defense Matrix
*2026-03-15*

- **Defense Matrix** — New Companion tab showing all 32 teams' fantasy points allowed (Offense Allowed) or scored (Defense Scored) per position per week in a scrollable heatmapped table.
- **Heatmap** — Multi-stop red→orange→yellow→green color spectrum; three scope options (Overall, By Week, By Team).
- **Drilldown** — Tap any cell to see per-player stat breakdown with signed point contributions for that matchup.
- **Position & Stat Filters** — Offense mode: All/QB/RB/WR/TE/K + Fantasy Pts/Rec Yds/Rush Yds; Defense mode: All/DL/LB/DB.
- **Column Sorting** — Click any column header to sort; Team column has A–Z, Conference, and Division sub-sorts.
- **QB Opp Fix** — Fetches per-QB Sleeper stats to resolve `opp` field for QBs who changed teams in the offseason.
- **Beta Badge** — Companion tab marked Beta in sidebar and bottom tab bar.

---

## v4.3 — Defense Matrix Enhancements + Matchup Improvements
*2026-03-15*

- **Team Colors & Logos** — Each team row in the Defense grid is tinted with its official primary color and shows its ESPN logo.
- **Opponent Labels** — Each cell shows the opponent abbreviation below the value.
- **Game Score mode** — New "Game Score" stat filter in Allowed view shows actual NFL scores per game.
- **Scored view stat filters** — Defense Scored view now has 8 stat filters: Fantasy Pts, Sacks, INT, Forced Fumbles, TFL, Passes Defended, QB Hits, Defensive TDs.
- **Team Color Heatmap Toggle** — Optional toggle (when a favorite team is set) to use team colors instead of the default heatmap palette.
- **Conference/Division labels** — Team cells show a conference or division sub-label when sorting by those modes.
- **Drilldown redesign** — Compact one-line player rows; header shows "Week N — Away @ Home" with team logos; player names link to their Statistics profile page.
- **5-Level Matchup Difficulty** — Replaced 3-level ±10% threshold with a percentile-based ranking across all 32 teams: Difficult / Challenging / Average / Favorable / Easy.
- **Score Range Coloring** — Post-game final score color-coded by where it lands relative to the projected range.
- **Roster Slot Labels** — Center badge now shows the actual roster slot (FLEX, SF, IDP, DST, etc.) from the league's `roster_positions`.
- **Home/Away Fix** — Matchup screen now correctly shows home vs away for all players.
- **Season Picker** — Derives available seasons from `league.season` + `league.previous_league_id`; hidden for single-season leagues.
- **Statistics Deep-Link Fix** — Clicking a player name in the Defense drilldown now correctly routes to their ESPN stats page.
- **Average calculation fix** — Average now divides by games played (not weeks with data).

---

## v4.3.1 — Polish & Bug Fixes
*2026-03-15*

- **Defense drilldown scroll lock** — Background page no longer scrolls while the drilldown panel is open.
- **Season progress bar visibility** — "Season X/32" progress bar in the sidebar is now hidden when not on the Predictions tab.
- **PWA cache bust** — `package.json` version bump forces service worker refresh so users receive the latest build automatically.

---

## v4.3.2 — Projection Footnotes
*2026-03-15*

- **Matchup factor footnotes** — Added plain-English explanations for the Matchup and Snap use projection factors in the drilldown math panel, alongside the existing Floor/Ceiling footnote.

---

## v4.3.3 — Defense Tab Layout
*2026-03-15*

- **Full-bleed table layout** — Defense grid now runs edge-to-edge on all screen sizes using negative margin technique (`-mx-4 sm:-mx-6 lg:-mx-8`), taking full advantage of available width.
- **Unified labeled filter bar** — View, Position, Stat, Color, and Team Colors controls are now labeled and arranged in a single horizontal row on wide screens, wrapping naturally on mobile.
- **Wide-screen table expansion** — Added `width: 100%` alongside `minWidth: max-content` so the table fills available space on wide screens instead of leaving dead space.

---

## v4.3.4 — Defense Grid Bug Fixes
*2026-03-16*

- **Frozen header row** — Header row now sticks to the top of the table viewport as you scroll down. Root cause: `overflow-x: auto` implicitly forces `overflow-y: auto` per CSS spec; without a defined height, sticky `top: 0` never triggered. Fixed by adding `maxHeight` + `overflowY: auto` to the container.
- **Opaque sticky first column** — Team column background is now a solid blended color (`blendColor()`) instead of semi-transparent `rgba`, so scrolled heatmap cells no longer bleed through.
- **Independent scroll on mobile** — Table now scrolls independently from the page on all screen sizes.
- **BYE week labels** — Bye weeks are now labeled "BYE" in the grid instead of showing blank cells. Applies to both Allowed and Scored views.

---

## v4.3.5 — Bye Week Fixes + Roster Drilldown OPP Column
*2026-03-16*

- **Defense Scored — bye week filter** — `defenseScoredTable` now filters entries through `scheduleMap`, removing phantom bye-week stats that Sleeper occasionally records for weeks a team didn't play.
- **Matchup — BYE WEEK badge** — When a starter's team has no game scheduled for the current week, their matchup card now shows a "BYE WEEK" badge instead of a blank opponent line.
- **Roster drilldown — OPP column** — Player weekly sheet now includes an opponent column showing the opponent abbreviation (e.g. `KC`, `BUF`) for each played week, sourced from the stat entry or ESPN schedule.
- **Roster drilldown — BYE rows** — Bye weeks now appear as a dedicated "BYE" row in the weekly sheet instead of being silently omitted. DNP rows (game played, no stats logged) are also preserved.

---

## v4.3.6 — Defense Grid Visual Fixes
*2026-03-16*

- **WAS/LAR team colors** — Washington and LA Rams rows now show correct team colors. STADIUMS uses `WAS`/`LAR` while TEAM_COLORS uses `wsh`/`la`; added `TEAM_COLOR_KEY` alias map to bridge the mismatch.
- **Opaque header row** — Header row background changed from `--color-fill-secondary` (~5% opacity) to `--color-bg` (fully opaque), so the header stays readable when scrolling.
- **Opaque sticky column borders** — Borders on the frozen Team column and corner cell now use `--color-separator-opaque` (solid color) instead of the semi-transparent `--color-separator`, eliminating the bleedthrough gap visible between rows when scrolling horizontally.
- **Responsive table height** — Added `--defense-grid-max-height` CSS variable with breakpoints: `100dvh - 260px` on mobile, `100dvh - 160px` on desktop (lg+), giving the grid significantly more vertical space on larger screens.

---

## v4.3.7 — Defense Grid Rendering Fixes
*2026-03-16*

- **Sticky column/header borders** — Fixed the frozen Team column and header row visually bleeding scrolled content through their borders. Root cause: `borderCollapse: 'collapse'` shares borders between sticky and non-sticky cells; browsers render shared borders on the wrong compositing layer during scroll. Fixed by switching to `borderCollapse: 'separate'` + `borderSpacing: 0` and replacing sticky cell borders with `box-shadow`, which always renders in the element's own stacking context above scrolled content.
- **Team color opacity in light mode** — Row team color tints in the Defense grid were too washed out in light mode. Increased blend alpha from 0.75 → 0.90 for a richer, more readable tint.
- **Team name contrast** — Defense grid team name text now uses WCAG-luminance-aware contrast color (`#111` or `#fff`) based on the blended background, ensuring readability against any team color in both light and dark mode.

---

## v4.4 — Defense Grid Team Attribution Fix
*2026-03-17*

**Problem:** The Defense Matrix grid and drilldown incorrectly attributed stats for any player who was traded or signed after the season ended. Sleeper's bulk stats endpoint (`/stats/nfl/regular/{season}/{week}`) returns raw stats only — no team, opponent, or game metadata. The only available signal was `player.team` from Sleeper's players DB, which always reflects the player's *current* roster, not the team they played for during the season. For example, Justin Fields (traded to KC after the 2025 season) had all his NYJ stats attributed to KC's opponents, corrupting the defensive rankings for multiple teams.

**Solution — three-layer ESPN cross-reference:**

- **Pass 1: ESPN eventlog enhancement** — ESPN's per-athlete eventlog endpoint returns a `statistics.$ref` URL per game that embeds the ESPN competitor ID (franchise ID). This ID is baked into the game record at game time and never changes on a trade. The `fetchSeasonSchedule` call now also captures ESPN event IDs and competitor IDs from the scoreboard, enabling a cross-reference: for each offensive player (QB/RB/WR/TE/K) with an `espn_id`, one eventlog fetch resolves every game to a confirmed `{ team, opp }` pair, merged into the weekly stat entry as `wEntry.team`, `wEntry.opp`, and `wEntry._teamSource = 'espn'`.
- **Pass 2: ESPN roster name-match for null-espn_id players** — Nearly two-thirds of offensive players in Sleeper's DB have `espn_id: null`, excluding them from Pass 1. A second pass fetches each team's ESPN roster, matches players by normalized name (stripping periods, suffixes like Jr/II/III), resolves the missing ESPN athlete ID, then runs the same eventlog pipeline. This resolved ~511 of 531 affected players.
- **Inferred season team fallback** — For partially-resolved players (some weeks enhanced, others not), `buildDefenseTable` and the drilldown filter now infer the player's historical season team from their other ESPN-enhanced weeks rather than falling back to `player.team`.
- **est. badge** — The drilldown displays an **est.** badge with a tooltip on any player whose team attribution is using the `player.team` fallback, so users can identify potentially misattributed entries at a glance.
- **WAS/JAX abbreviation aliases** — Added `WAS: 'wsh'` and `JAX: 'jax'` to `TEAM_ESPN_ID` to bridge Sleeper ↔ ESPN team abbreviation mismatches that caused roster lookups to fail for Washington (20 players) and Jacksonville.

---

## v4.4.1 — Defense Grid Polish
*2026-03-17*

- **Defense Scored drilldown attribution fix** — Applied the same inferred-season-team fallback from v4.4 to the Scored (defensive player) drilldown. Previously, IDP players (DL/LB/DB) in the Scored drilldown used `player.team` directly instead of ESPN-confirmed game-time team data, causing the same misattribution bug for traded defensive players. The fix uses `wEntry.team` (ESPN-confirmed) first, falls back to other enhanced weeks in the same season, then `player.team`. The **est.** badge now also appears in the Scored drilldown for unverified entries.
- **Player name navigation** — Player names in the Defense grid drilldown are now clickable for all players, including those whose `espn_id` is null in Sleeper's DB. Pass 2 resolved ESPN IDs are now stored in a `espnIdOverrides` context map and used as a fallback for navigation.
- **Contextual back navigation** — When navigating from the Defense grid drilldown to a player's Statistics page, the back button now reads **"← Defense"** and returns to the Defense grid. In all other cases the button continues to read **"← Statistics"** and returns to the statistics browser.
- **Home/away in drilldown header** — The drilldown matchup header now uses `@` notation (standard NFL: AWAY @ HOME) instead of `vs` when home/away data is available from the scheduleMap. Falls back to `vs` when home/away is unknown.
- **Roadmap file renamed** — `to-do list.md` renamed to `TO_DO.md`; restructured to chronological version order with backlog at the bottom.

---

## v4.5 — Heatmap Refresh
*2026-03-17*

- **Renamed "Defense" tab to "Heatmap"** — Companion sub-navigation label updated across the app, including the back-navigation label from the Statistics page.
- **Phase filter** — The "View: Allowed / Scored" toggle is now "Phase: Offense / Defense" for clearer terminology.
- **Filter bar reordered** — New order: Stat → Phase → Position → Color → Location.
- **Home/Away location filter** — New Location filter (All / Home / Away) on the Heatmap. Filters both the cell values and the AVG column denominator to only include games matching the selection. Filtered-out weeks show a dimmed dash and are not drillable.
- **Companion sub-nav overflow fix** — Tabs (Roster, Rankings, Matchup, etc.) now scroll horizontally within the nav strip on mobile instead of overflowing the page and causing erroneous horizontal scrolling.
- **Scoring badge removed from Roster** — The league scoring summary badge has been removed from the Roster screen. Scoring details are available in the dedicated Scoring tab.

---

## v4.5.1 — Heatmap Mobile Fixes
*2026-03-17*

- **Sub-nav vertical scroll fix** — Companion sub-navigation tab strip no longer scrolls vertically in addition to horizontally on mobile.
- **Heatmap bottom inset fix** — Heatmap grid on mobile PWA now scrolls fully to the bottom row. The bottom tab bar / safe-area inset was obscuring the last rows, requiring whole-page scrolling that broke navigation.

---

## v4.6 — Heatmap Continued
*2026-03-19*

- **Spread stat mode** — New "Spread" option in the Stat filter. Cells show each team's spread for that week (e.g. `-3.0`, `+7.5`), colored green (covered) or red (didn't cover). Requires the bundled `odds.js` data (generated from nflverse historical odds).
- **Score stat mode drilldown** — Tapping a cell in Score mode opens a full box score for that game (final score, passing/rushing/receiving leaders for both teams) instead of the standard player drilldown.
- **Spread mode drilldown** — Tapping a cell in Spread mode opens the same box score layout. The game header shows each team's spread and O/U line directly under the matchup; covered results are green, didn't cover is red; Over/Under result is shown without color.
- **Color filter hidden in Spread mode** — The Color filter is hidden when Spread is selected (it has no meaning for cover/no-cover coloring), except the team colors toggle remains visible when a favorite team is set.
- **"Covers" column header** — The AVG column header changes to "Covers" when viewing Spread mode, reflecting the win-loss cover record shown.
- **Renamed filters** — "Vegas Odds" → "Spread", "Game Score" → "Score".
- **Player data cache auto-clear on version bump** — The `nfl_pc_*` localStorage cache is now automatically cleared when the app version changes, preventing stale player data (wrong team attribution, missing ESPN IDs) from persisting across deploys.
- **Phase filter hidden for offense-only modes** — The Phase (Offense/Defense) filter is no longer shown when Rec Yds, Rush Yds, Score, or Spread is selected — those modes are offense-only.
- **Home/Away filter respected in week sort** — Filtered cells now correctly show a faded dash (instead of live color/value) when the week sort is active and the game doesn't match the location filter.
- **Desktop heatmap height fix** — Grid now fills available vertical space on desktop. The tab bar height (49px) was incorrectly subtracted even though the tab bar is hidden at lg+.
- **Heatmap → Statistics year range fix** — Player links from the heatmap now open the correct full career year range. `playerMeta.experience` was absent, causing the year list to default to current year only.
- **Heatmap initial render fix** — Heatmap now renders immediately after Load Stats without needing to visit another Companion tab first. `loadPlayers()` is now called on mount.

---

## v4.6.1 — Score Mode Cell Fix
*2026-03-19*

- **Score mode inline display** — Heatmap cells in Score mode now show the final score as `X-X` (team score · opponent score) with both team abbreviations in small text underneath (e.g. `28-14` / `KC · DEN`), replacing the previous stacked single-number layout.

---

## v4.6.2 — Matchup Projection Overhaul
*2026-03-20*

- **Recent-weighted projection base** — Projection now blends recent form (60% last 4 games) with season average (40%), so hot or cold streaks propagate into the projected value within weeks instead of waiting for the full season average to move.
- **oppFactor accuracy fix** — `getLeagueAvgPPG` now aggregates fantasy points by team-game (matching the scale of `ptsAllowedPerGame`). Previously it returned a per-player-game average (~10 pts) while `ptsAllowedPerGame` was a team-game aggregate (~30 pts), causing `oppFactor` to always be inflated and pinned to the 1.45× cap regardless of actual defense quality.
- **Projection range fix** — Floor/ceiling are now expressed as fractions of `seasonAvg` applied to the projected value, guaranteeing the projection always falls within its own min–max range. Previously, percentile bounds anchored to `seasonAvg` could produce a ceiling below the `blendedBase`-driven projected value.
- **IQR floor/ceiling** — Floor/ceiling now use the true 25th/75th percentile (IQR) of historical game scores instead of averaging the lower/upper quartile halves, producing a tighter and more representative range.
- **Home/Away factor threshold** — Lowered from ≥3 games to ≥1 game, so the location factor activates from the first game played.
- **Home/Away row hidden when neutral** — The Home/Away breakdown row is no longer shown when the location factor is effectively 1.00× (no meaningful split data).
- **Matchup drilldown Stats link** — Player name header in the matchup drilldown now includes a **Stats →** button that navigates directly to the player's Statistics page.
- **Heatmap filter bar tooltip** — Vegas Odds info text replaced with an ℹ icon tooltip inline in the filter bar row; no longer pushes the heatmap grid down when switching stat modes.
- **AVG column hidden in Spread mode** — The AVG column is hidden when viewing Spread/O/U mode since it has no meaningful signal (was showing 0.0).
- **Heatmap tile width consistency** — Score mode cells are now the same width as all other stat modes (40px).
- **Heatmap filter bar wrapping fix** — Filter bar no longer wraps to a second line when switching stat modes.
- **Player stats year range fix** — Statistics page accordion no longer lists years a player had no recorded activity. Years with no data are now silently probed and hidden before the user expands them.
- **Heatmap offense mode data fix** — Fantasy Points / Rec Yds / Rush Yds in offense mode now shows each team's own offensive output (points allowed by that defense) instead of the opposing offense's stats.
- **Heatmap player link year range fix** — Player links from the heatmap now open the correct full career year range on the Statistics page.

---

## v4.6.3 — Browser Back Navigation + Bug Fixes
*2026-03-21*

- **Browser back button** — The browser back button now navigates within the app. Tab changes, sub-navigation, and Statistics team/player drill-downs are each tracked as browser history entries. Pressing back walks through navigation in reverse instead of exiting the app.
- **Statistics external navigation fix** — The Statistics page now renders identically whether accessed via manual browse or an external link (Heatmap player link, Matchup Stats → link). External navigation now passes the player's position at all call sites, and `PlayerBrowser` enriches the player object from the cached ESPN roster to fill in jersey number, full position name, and status — making the hero card and stat columns complete.
- **Heatmap offense color scheme fix** — High points allowed (easy matchup) now correctly shows green and low points (tough matchup) shows red in Offense phase. The gradient was previously inverted.

---

## v4.7 — Waiver Wire Enhancements
*2026-03-21*

- **Player links** — Player names in the Waiver list now link to the player's Statistics page, with a contextual "← Waiver" back button matching the pattern used in the Heatmap and Matchup drilldown
- **Projected points column** — A new Proj column shows each player's projected fantasy points for the upcoming week using `projectPlayer()`, factoring in opponent strength, home/away, and recent form
- **Sortable columns** — All three data columns (Proj, Season, 4-Wk Avg) are now clickable column headers that sort the list; the active sort column is highlighted and shows a ↓ indicator
- **Trending indicator** — Players whose recent 4-week average is ≥ 25% above their season average (and at least 2 pts higher) show a green ↑ HOT badge next to their name
- **Upcoming opponent** — Each player row now shows their next opponent abbreviation in small text below their position/team line

---

## v4.7.1 — Waiver Performance Patch
*2026-03-21*

- **Defense table pre-computation** — `buildDefenseTable()` now runs once when stats load instead of `getOpponentStrength()` being called per player. Defense strength lookups are now O(1) table reads instead of a full weekly-stats scan per player.
- **League average pre-computation** — `getLeagueAvgPPG()` is pre-computed once per position (5 total) and passed into `projectPlayer()` instead of recomputing it for every waiver player. `getLeagueAvgPPG` is now exported from `projectionEngine.js`; `projectPlayer` accepts optional `leagueAvg` and `skipOpponentLookup` params to allow callers to bypass the internal scan entirely.
- **Projection/filter memo split** — Projection enrichment is now a separate memo from filtering and sorting. Changing position filter, sort column, or search term no longer triggers projection recomputation — only underlying data changes do.
- **Debounced search** — The search input is debounced at 200ms, preventing per-keystroke re-renders of the player list.
- **`myRoster()` memoized** — The `myRoster()` context function is now called inside a `useMemo` in the waiver component instead of on every render.

---

## v4.8 — League Browser
*2026-03-21*

- **League tab** — New "League" sub-tab added to the Companion section, positioned between Waiver and Heatmap.
- **Opponent roster view** — Browse any league member's full roster via a scrollable owner selector that defaults to your own team. Each roster shows the same depth as the Roster tab: players grouped by position with season pts, avg PPG, positional rank, and a tappable weekly breakdown sheet.
- **Draft capital grid** — League-wide horizontally scrollable grid showing every team's currently owned draft picks organized by year and round (capped at 5 rounds). Own picks show as filled amber dots; acquired picks show the originating team's abbreviation as a blue badge; traded-away picks show as an empty dim circle. Teams are sorted by total picks held so pick-rich teams surface to the top. Year columns are grouped with round sub-headers (R1, R2…).
- **Picks data** — Fetches `/league/{leagueId}/traded_picks` from the Sleeper API on demand. Constructs the full pick ownership matrix: each team implicitly owns all their own picks; traded picks are resolved to their current owner. Handles edge cases including picks traded back to the original team.

---

## v4.8.1 — Draft Picks Round Cap Fix
*2026-03-21*

- **Raised round limit** — Draft capital grid now shows all rounds from the league's `draft_rounds` setting instead of truncating at 5. Raises the internal cap to 36 to accommodate dynasty startup drafts (25+ rounds) and deep redraft leagues.

---

## v4.9 — Player Comparison
*2026-03-21*

- **Companion Compare tab** — New "Compare" sub-tab in the Companion view. Search any two players from your Sleeper player pool (rostered or free agents) and compare them side-by-side: season pts, avg PPG, last 4-week form, positional rank, projected points, floor/ceiling range, and season stat totals. The winner of each stat is highlighted in amber. Supports all skill positions (QB/RB/WR/TE/K).
- **Statistics Compare mode** — "Compare" toggle button in the Statistics player browser launches a side-by-side mode. Search any two ESPN-rostered players and view their current-season and career stats head-to-head with per-stat delta highlighting. Compare mode is position-aware — stat rows shown depend on the position group of the selected players.

---

## v5.0 — Unified Compare Tab
*2026-03-22*

- **New top-level Compare tab** — Replaces the separate compare experiences in Statistics and Companion with a single unified 4th top-level tab ("Compare"), accessible from the sidebar (desktop) and bottom tab bar (mobile). Removed the "Compare" sub-tab from Companion and the "Compare" toggle from Statistics.
- **Single picker, all 32 rosters** — Player search uses the shared ESPN roster search with full smart-search: player names, team nicknames/cities/abbreviations, position full names and plurals, conference, division, and natural language ("RBs in Detroit", "QBs playing for the Bears"). Tappable search guide chips shown when the picker is empty.
- **Stats panel** — Year navigation (2018–current + Career totals) with on-demand fetching and per-year caching. Shows GP, GS, Snap%, and full position-specific stats. Inline loading spinners per slot. Win highlighting in amber.
- **Fantasy panel** — Visible when a Sleeper league is connected. Shows season pts, avg PPG, last 4 weeks, positional rank, and projection range (floor/projected/ceiling). Automatically matches ESPN players to Sleeper IDs via `espn_id` field with name+position fallback.
- **Trade panel** — Stub placeholder for the Trade Agent (coming later in v5.0).
- **Shared utilities** — Extracted `parseSearchQuery`, `SEARCH_PATTERNS`, `matchesFilter` to `src/utils/parseSearchQuery.js`. Added `src/utils/espnSleeperMatch.js` for ESPN→Sleeper player ID matching.

---

## v5.1 — Compare Upgrades
*2026-03-22*

- **Team-colored player slot backgrounds** — Each filled player slot in the Compare tab now renders a team-colored hero gradient (matching the Statistics player profile style), complete with a city map watermark at low opacity and a vertically centered team logo watermark on the right edge. Text and button colors adapt to light/dark based on background luminance.
- **Cross-position stat coverage** — Compare mode now calls `getStatRows()` for each player's position independently and merges the resulting sections. A RB vs QB comparison shows both Rushing and Passing stat sections, with `—` where a player has no data for the opposing position's stats.

---

## v5.0.1 — Compare Mode Fixes
*2026-03-22*

- **Stats panel — full position coverage** — Replaced hand-coded `COMPARE_STATS` table with `getStatRows()` from `playerMetrics.js`, the same source used by the Statistics tab. All positions now show the full section-grouped stat set with an Advanced toggle.
- **Stats panel — rank badges** — Per-stat ESPN rank badges now display under each value using `buildRankMap()`.
- **Stats panel — TD/INT ratio** — QB advanced stats TD/INT ratio now renders correctly per player. Previously always showed `—` because derived rows had `key: null`; fixed by adding a `computeForMap` callback that computes the ratio from each player's individual stat map.
- **Stats panel — year selector** — Year pills are now filtered to years from each player's rookie season onwards (derived from `experience` field), hiding irrelevant historical years.
- **Search modal** — Player picker converted from a bottom sheet to a centered fixed-size modal. The search box stays stationary as results load in. Background scroll is locked while the modal is open.
- **Statistics → Compare** — Player profile hero cards in the Statistics tab now include a Compare button. Tapping it navigates to the Compare tab and pre-populates that player in slot A.
- **Fantasy panel — season total header** — Each player's season fantasy total is now displayed prominently at the top of the Fantasy panel as a large number, above the stat table.
- **Fantasy panel — scoring rate labels** — Each stat row in the breakdown now shows the scoring multiplier (e.g. "+4 pts", "0.04 pts") as a sub-label under the stat name in the center column.
- **Fantasy panel — season high/low** — Added Season High and Season Low rows showing the player's actual best and worst single-game point totals for the season.
- **Fantasy panel — snap % and games played** — Added Games and Snap % rows to the Season section, computed from Sleeper season stats (`gp`, `off_snp`, `tm_off_snp`).
- **Player status** — Injury and roster status now displayed as colored badges in the Statistics player profile hero, the Compare tab player slots (ESPN status), and the Fantasy panel player header (Sleeper `injury_status`).
- **Alpha badge** — Compare tab now shows an α badge in the sidebar nav and bottom tab bar.
- **Guide** — Added Compare mode content to the Guide modal with 7 steps covering search, stats, year navigation, fantasy, rankings, ESPN→Sleeper matching, and the Trade panel stub.

---

## v5.5 — Trade Agent
*2026-03-22*

- **Trade tab** — New "Trade" sub-tab in the Companion section. Build full multi-player, multi-pick trade proposals with live KTC-powered valuations.
- **Two-column trade builder** — Your side and their side displayed side-by-side (stacked on mobile). Add players and draft picks to either side; each asset shows its individual KTC value and the projected new side total after adding it.
- **Owner carousel** — Select a trade partner from the league's owner list. The partner's roster automatically populates the "Their Side" picker. "Search All Players" remains available at all times to add players from any roster.
- **Live KTC values** — Trade values fetched from KeepTradeCut via the existing proxy. Format (Dynasty/Redraft) and league type (1QB/Superflex) are auto-detected from your Sleeper league settings — no manual toggles.
- **Draft pick valuation** — Draft picks are valued using KTC's RDP (dynasty pick) entries. Pick quality (Early/Mid/Late) is determined from current standings. Dynasty data is always fetched alongside redraft data so picks have values regardless of league type.
- **League-adjusted values** — KTC baseline values are tuned to your league's specific scoring settings. Adjustments cover: reception scoring (PPR/HPPR), passing TD points, TE premium, interception penalty, fumble penalty, big-play yardage bonuses (300/400 pass, 100/200 rush, 100/200 receiving), first-down bonuses, and positional scarcity from starter slot counts. Multipliers are clamped to ±40% to prevent distortion. Recalculate automatically from live Sleeper settings.
- **Trade verdict** — Value gap bar and verdict label (Fair / Favors You / Favors Them) update live as assets are added or removed.
- **Suggest Package** — Auto-suggests 1–3 asset combinations from the deficit side's available roster to close the value gap.
- **Valuation info modal** — "How values are calculated" modal explains KTC methodology, baseline assumptions, and all league-specific adjustments applied to your league with a position multiplier table.
- **Entry points** — "Trade" button on your own Roster player rows pre-populates that player on your side. "Trade" button on opponent players in the League tab pre-populates the player on their side and auto-sets the trade partner. "Build Full Trade" button in the Compare tab's Trade panel navigates to the Trade tab with both compared players pre-loaded.

---

## v5.5.1 — Trade Agent Polish
*2026-03-22*

- **TE premium bug fix** — `bonus_rec_te` was silently dropped by `importLeagueScoring` because it isn't a raw stat key. Fixed by extending the import filter to accept any key in `DEFAULT_SCORING`. `calcPoints` and `calcPointsFromTotals` now accept an optional `position` parameter and apply the TE reception bonus when `position === 'TE'`. The Trade picker's season pts display and KTC multiplier for TE position now correctly reflect the league's TE premium.
- **Filter pill theming** — Selected state of pill filter buttons (Compare tab panel selector, Trade action buttons) now uses `var(--color-signature)` instead of `var(--color-accent)`, so they follow the optional team color theme.
- **Search All Players** — Moved from a small inline button to a full-width prominent button below the roster carousel in Trade Agent view. Always visible when KTC data is loaded.
- **"Trade Agent" label** — Section header renamed from "Trade Partner" to "Trade Agent".
- **"Refine Trade" button** — "Suggest Package" renamed to "Refine Trade" throughout the Trade Agent UI.

---

## v5.5.2 — Trade Picker Player Cards
*2026-03-22*

- **Team-colored player rows** — Each player row in the Trade picker is tinted with the player's team primary color (light/dark mode aware via `TEAM_COLORS`). A 3px left border uses the full team color as an accent; the background is a subtle `~13%` opacity tint so text remains legible against `var(--color-label)`.
- **Team logo watermark** — Each row renders the team logo at 10% opacity as a watermark behind the player info, via ESPN's logo CDN.
- **Positional rank** — Shows `#N POS` (e.g., `#3 WR`) next to position/team using `computePositionalRanks` across all rostered players. Rank label inherits the team accent color.
- **Avg PPG** — Displays the player's season average points-per-game (`season pts ÷ gp`) as `X.X avg` on the subtitle line.
- **Sleeper → TEAM_COLORS key normalization** — Added `SLEEPER_TEAM_MAP` to handle abbreviation differences (LAR → la, WAS → wsh, JAC → jax, LVR → lv) so Rams, Commanders, Jaguars, and Raiders rows render correctly.

---

## v5.5.3 — Trade Builder Team Theming
*2026-03-22*

- **Team colors in trade builder** — Player cards in the main Trade Agent view (both sides of the trade and the partner roster preview) now use the same team color theming introduced in v5.5.2: a 3px left border in the team primary color, a subtle tint background (~13% opacity), and a team logo watermark at 10% opacity. Light/dark mode aware via `TEAM_COLORS`.

---

## v5.5.4 — Trade Theming Refinements
*2026-03-22*

- **Their Side unthemed** — Team color theming (tint bg, left border, logo watermark) now only applies to "Your Side" player cards. "Their Side" cards use the flat neutral fill background.
- **ValueBar simplified** — The value comparison bar now uses `var(--color-accent)` (blue) for your share and `var(--color-label-quaternary)` (dim) for their share, consistently, regardless of who is leading. Removed the signature/team color from the bar.

---

## v5.5.5 — Trade Agent Stats & Logo Fix
*2026-03-22*

- **Positional rank + avg PPG in Trade Agent** — Player cards in the main Trade Agent builder now show positional rank (e.g. `#3 RB`) and average fantasy PPG for the season, matching the detail level of the picker modal.
- **Logo overlap fix** — Team logo watermark in the trade picker modal is now scoped inside the player text area, preventing it from overlapping the KTC value column when browsing opponent rosters.

---

## v5.5.6 — Compare Mode Theming & Navigation
*2026-03-22*

- **Stats / Fantasy / Trade tab bar** — Replaced the pill-style panel selector in the Compare tab with a proper horizontal tab bar using the `season-tabs` / `season-tab` pattern, consistent with the Companion sub-navigation. Active tab has the signature underline indicator.
- **Team color theming in Compare player slots** — Filled player slots now use the same treatment as Trade Agent cards: team primary color 3px left border, subtle ~13% opacity tint background, and a team logo watermark scoped inside the text area. Light/dark mode aware. Replaces the previous gradient + city map hero style.
- **Team color theming in Compare picker** — Player rows in the search modal now show team color tint background, left border, and logo watermark — matching `TradeRosterPicker`. Headshot size unified to 36px.

---

## v5.5.7 — Compare Trade & Roster Bug Fixes
*2026-03-22*

- **Compare year pill theming** — Active year pill in the Compare Stats panel now uses `var(--color-signature)` (amber/team color) instead of the fixed blue accent, consistent with the rest of the app's active states.
- **Trade Agent carousel scrollbar** — Hidden the browser scrollbar on the owner carousel in the Trade Agent (desktop). Scroll remains functional but the track is no longer visible.
- **Companion Roster column alignment** — Season and Avg/G column headers are now correctly aligned above their respective data columns. The Trade button's reserved width is now accounted for in the header row spacer.
- **Compare → Trade format auto-detection** — Removed the Dynasty/Redraft and 1QB/Superflex manual toggles from the Compare Trade panel. Format and league type are now auto-detected from Sleeper league settings, matching the Trade Agent behavior.
- **Trade analysis copy** — Changed "additional assets" to "additional asset value" in the Compare Trade analysis text for clarity.
- **Build Full Trade button theming** — Button now uses `var(--color-signature)` (amber/team color) instead of the fixed blue accent.
- **Compare Trade hero cards** — Player cards in Compare → Trade now use the full Trade Agent card style: team color 3px left border, tint background, headshot avatar, and team logo watermark. Light/dark mode aware.
- **Build Full Trade roster guard** — Button is now disabled and greyed out unless exactly one of the two compared players is on your own roster. The player on your roster is always routed to the "Your Side" of the trade. If neither or both players are on your roster, the button is non-clickable.
- **Roster → Trade entry point** — Clicking Trade on a player in Companion Roster now immediately shows the player card in the Trade Agent even before KTC data finishes loading. Player name and avatar appear instantly; the KTC value populates once the data resolves.

---

## v5.5.8 — Compare & Trade Agent Polish
*2026-03-23*

- **Compare tabs at top** — Stats/Fantasy/Trade tab bar is now always rendered at the very top of the Compare view, above the player slot headers, matching the position of tabs in Statistics and Companion. Tabs are always visible regardless of whether players are selected.
- **Compare Trade — no duplicate player headers** — Player name and avatar removed from the Compare Trade value cards; the player slots above already show this information. Cards now show only the KTC value, value bar, and "not in KTC data" notice.
- **Build Full Trade — disabled explanation** — When the Build Full Trade button is greyed out, a hint line now explains why: "One player must be on your roster to build a trade."
- **Roster → Trade entry point fixed** — Clicking Trade on a player in Companion Roster now correctly pre-populates that player on Your Side when you subsequently select a trade partner. Previously, selecting a partner cleared the entire trade (including pre-populated players from entry points); now only Their Side and picks are reset on partner change.
- **Their Side team color theming** — Opponent player cards on Their Side in the Trade Agent now display the same team color treatment as Your Side: team primary color 3px left border, subtle tint background, and team logo watermark. Light/dark mode aware.

---

## v5.5.9 — Compare Hero Card Unification & Light Mode Border Fix
*2026-03-23*

- **Compare Trade unified hero card** — The KTC asset value is now embedded directly inside the player slot hero card in the Trade tab. The value number and value bar appear below the player name/position as an inline extension of the card, so the team logo watermark, player identity, and trade value all live in one unified card. The separate value card section below has been removed.
- **Light mode team color border contrast** — Team color left borders on player cards (Compare player slots, Trade Agent cards) are now darkened by 45% when the team's primary color has high luminance in light mode (e.g. Steelers gold `#FFB612`). The border is now clearly visible against the light cream background without affecting the subtle tint background or dark mode appearance.

---

## v5.6.0 — Compare Polish & Trade Analysis
*2026-03-23*

- **Compare hero card logo overlap fixed** — The KTC value bar and divider line in the Trade tab player hero card no longer render behind the team logo watermark. Right padding (`pr-10`) pushes the bar and border to clear the logo area.
- **Beta badge contrast fixed** — The "Beta" label on the Companion tab (sidebar and bottom tab bar) now uses `var(--color-signature-fg)` instead of hardcoded `#000`. When a dark team color overrides `--color-signature`, the badge text remains legible.
- **Compare → Statistics link** — Player names in the Compare view hero card are now clickable links (underlined, accent-colored) that navigate directly to that player's Statistics page with a "← Compare" back button.
- **Compare → Fantasy hero card** — The season total hero now also shows the player's average PPG and fantasy positional rank (e.g. `WR7`) in addition to season points.
- **Trade Analysis — fairness tier** — A color-coded verdict label ("Fair Trade", "Minor Edge", "Moderate Overpay", "Significant Overpay") is now shown at the top of the Trade Analysis section based on the gap percentage.
- **Trade Analysis — pick equivalence** — When there is a value gap, the analysis now includes a note showing the closest KTC draft pick entry by value (e.g. "Gap is roughly equivalent to a 2026 Mid 2nd (2,100)"), giving a concrete reference point for what the deficit is worth.

---

## v5.6.1 — Trade Analysis KTC Enrichment
*2026-03-23*

- **Trade Analysis — age & dynasty window** — Each player's age (from KTC) is now shown in a compact two-column row at the bottom of the Trade Analysis section, with a dynasty window label: Emerging (< 23), Prime (23–26), Late prime (27–29), Veteran (30+).
- **Trade Analysis — 7-day value trend** — KTC's `overall7DayTrend` for each player is shown as a color-coded "7d Trend" row (▲ green for rising, ▼ red for falling). Only displayed when at least one player has a trend of ±5 or greater; flat weeks are suppressed.
- **Compare Trade hero card cleanup** — Removed the divider line and value bar from the player hero card KTC extension. Now shows a clean "Trade Value X,XXX" label in-line with the player info.

---

## v5.6.2 — Global Signature Color Contrast Fix
*2026-03-23*

- **Signature background text contrast — global fix** — All pill filters, tab buttons, carousel selections, and section headers that use `var(--color-signature)` as a background were using hardcoded `#0C0F14` (near-black) for the text color. When a dark team color overrides `--color-signature` (e.g. Ravens purple, Bears navy), this produced dark-on-dark unreadable text. All instances now use `var(--color-signature-fg)`, which is computed dynamically (white for dark signature colors, dark for light ones). Fixed in: `CompanionLeague`, `CompanionTrade` (owner carousel + YOUR SIDE header), `CompanionDefense`, `CompanionWaiver`, `CompanionRankings`, `CompanionConnect`, `ScoringSettings`, `App.jsx`.

---

## v5.6.3 — Trade Analysis Deep Insights
*2026-03-23*

- **Position-adjusted dynasty windows** — Age phase labels (Emerging, Prime, Late Prime, Veteran) are now calibrated per position. QBs peak later and age more gracefully than RBs (QB prime: 25–35, RB prime: 22–26, WR prime: 23–29, TE prime: 24–30).
- **Trade Analysis — Buy/Hold/Sell signal** — Each player now shows a color-coded signal badge (green Buy / amber Hold / red Sell) derived from their career phase and 7-day market trend.
- **Trade Analysis — Prime Years Left** — In dynasty mode, each player shows how many prime seasons they likely have remaining based on their age and position. Color-coded: green (4+), amber (2–3), red (0–1).
- **Trade Analysis — Player Outlook blurbs** — A concise narrative sentence per player now synthesizes their age, position, prime window, and prime years remaining into an actionable insight (e.g. "Mahomes has ~5 prime years left as a QB — a core dynasty asset.").
- **Trade Analysis layout** — The analysis section now uses a labeled "Player Outlook" sub-header, and the two-column rows for Age, Signal, Prime Left, and 7d Trend are consistently formatted.

---

## v5.6.4 — Trade Agent Polish
*2026-03-23*

- **"Your Side" / "Their Side" header contrast fixed** — The header label text in Trade Agent used hardcoded `#0C0F14` when that side was the leader (highlighted with `var(--color-signature)` background). Now uses `var(--color-signature-fg)` so dark team color overrides remain readable.
- **Refine Trade — % difference shown** — Each suggested package now shows the point delta as a percentage of the total gap (e.g. "+500 (+8%)"), making it easier to judge how close a suggestion comes to balancing the trade.
- **Value comparison bar redesigned** — The favorability bar section is now a card with both side totals prominently labeled, the gap value and % displayed center-stage, a taller bar, and the verdict label below. Values are immediately scannable without reading the side cards.
- **Draft picks beyond round 3 now valued** — `MAX_ROUNDS` cap removed from `buildRosterPicks`; the round count is now driven entirely by `league.settings.draft_rounds` and traded pick data. Picks in rounds 4+ that KTC doesn't publish values for are now estimated by scaling a mid-3rd round pick by a decay factor (Round 4 ≈ 25%, Round 5 ≈ 12%, Round 6+ ≈ 5% of mid-3rd value), so they appear in the trade builder with a reasonable non-zero value rather than "—".

---

## v5.6.5 — Trade Refinement: Remove & Swap Suggestions
*2026-03-23*

- **Refinement Options now suggest removals and swaps, not just additions** — "Refine Trade" previously only added assets to the weaker side (trade creep). It now evaluates four strategies:
  - **Add** (existing): add assets from the deficit side's roster to close the gap
  - **Remove**: drop an asset from the surplus side whose value is closest to the gap
  - **Swap (surplus side)**: replace an expensive asset on the stronger side with a cheaper one from that same roster
  - **Swap (deficit side)**: upgrade a lower-value asset on the weaker side to a higher-value one from that same roster
- **Refinement Options renamed** — Section header changed from "Suggested Additions (Your/Their Side)" to "Refinement Options", with per-option colored action badges (ADD / REMOVE / SWAP) and the target side labeled in the description line.
- **Remaining gap shown per suggestion** — Each option now shows the gap that would remain after applying it (e.g. "~500 remaining (8% of gap)") rather than the raw delta, making it easy to compare how close each option gets to even.

---

## v5.6.6 — Redraft Pick Valuation Overhaul
*2026-03-23*

- **Draft picks now valued correctly for redraft leagues** — KTC's RDP (dynasty pick) values are designed for dynasty leagues and wildly misprice picks in a redraft context: they front-load nearly all value into rounds 1–3 and make later rounds near-worthless. For redraft leagues, pick values are now computed from KTC's actual redraft player rankings: all non-pick KTC players are sorted by their redraft value and bucketed into draft rounds (league size players per round). The value for each round is the median player value in that bucket, discounted 15% for pick uncertainty. This model scales correctly to any number of rounds (e.g. 17-round bestball drafts), and ensures that a 5th-round pick is valued like a 5th-round player — not like a throwaway.
- **Pick valuation is league-size aware** — A 3rd-round pick in a 10-team league corresponds to picks 21–30 overall, while in a 14-team league it's picks 29–42. The bucketing accounts for this automatically.
- **Dynasty leagues unchanged** — KTC RDP entries continue to be used directly for dynasty-format leagues, where they are the correct model.
---

## v5.6.7 — Trade Analysis: Fantasy Performance Stats
*2026-03-23*

- **Buy/Hold/Sell signals removed from Trade Analysis** — These signals were derived from KTC 7-day market trends and dynasty career phase logic. They are not applicable to redraft leagues, and misleading when used outside a dynasty context. The Signal row has been removed from the Player Outlook section.
- **Season PPG added to Trade Analysis** — Player Outlook now shows each player's points-per-game for the current season, calculated using the league's actual scoring settings. Requires Sleeper stats to be loaded.
- **Recent Form added to Trade Analysis** — Shows the player's average fantasy points over their last 1–4 active (non-zero) weeks, with a green/red color indicator for hot/cold streaks relative to season average. Labeled with the number of weeks used (e.g. "18.4 L4").

---

## v5.6.8 — Player Outlook Enhancements
*2026-03-23*

- **Team row added to Player Outlook** — Always shows each player's NFL team (from Sleeper roster data) without requiring stats to be loaded.
- **Season Rank row added to Player Outlook** — Shows each player's positional rank for the season (e.g. "WR4") once stats are loaded, using the same ranking computation as the Trade Agent.
- **Stats auto-load when Compare Trade panel is open** — Previously, Season PPG and Recent Form only appeared if the user had already visited the Companion tab. The Trade panel now triggers `loadSeasonStats` and `loadPlayers` automatically when a Sleeper league is connected and stats aren't loaded yet. A "loading stats…" label appears next to "Player Outlook" while loading.

---

## v5.6.9 — Player Outlook: Top-10 Finishes + Defense Split
*2026-03-23*

- **Top-10 Wks row** — Shows how many weeks each player finished in the top 10 at their position (e.g. "8/16"). Color-coded: green ≥50%, amber ≥30%, red <30%. Requires Sleeper stats.
- **D Split row** — Shows each player's average fantasy score against tough defenses (bottom-third pts allowed) vs. soft defenses (top-third pts allowed), displayed as "14.2 · 22.8". Red = tough, green = soft. A wide gap indicates a matchup-dependent player; similar values indicate consistency. Uses the same defense table as the heatmap defense view. Requires Sleeper stats + schedule map.
- Both metrics are scored using your league's actual scoring settings, not KTC data.

---

## v5.7.0 — Trade Analysis: Per-Stat Position Rankings
*2026-03-23*

- **Stat Rankings section in Player Outlook** — Shows a row for each stat category where either player ranks in the top 15 at their position. Both players' ranks are shown side by side even if one doesn't crack the top 10 (shown as `—` if no meaningful output in that category). Sorted by the stronger rank between the two players. Color-coded: green = top 5, amber = top 10, default = 11–15.
- **Position-specific stat categories**: QB (Pass TDs, Pass Yds, Rush TDs, Rush Yds), RB (Rush TDs, Rush Yds, Rec TDs, Rec Yds, Receptions), WR/TE (Rec TDs, Rec Yds, Receptions). All ranked within the player's own position group.
- **Works across positions** — When comparing a QB to a RB (e.g., evaluating a trade), each player is ranked within their own position group. Overlapping categories (e.g., Rush TDs) show both players' ranks from their respective pools.
- **Team row removed** from Player Outlook — redundant with the player hero card.
- **Top-10 Wks row removed** — replaced by the per-stat ranking breakdown.
- All rankings are based on Sleeper season stats scored with your league's settings.

---

## v5.7.1 — Player Outlook Clarity: Fantasy vs Raw vs Defense
*2026-03-23*

- **Player Outlook reorganized into labeled sections**:
  - **Fantasy Performance** — Szn Rank, Szn PPG, Recent L4. All use your league's scoring settings.
  - **Raw Stat Leaders** — Per-stat positional rankings (Pass TDs, Rush Yds, etc.). In-game stats only, not fantasy-scored.
  - **vs [Position] D** — Defense analysis with fpts by tier (see below).
  - Career metadata (Age, Prime Left) and KTC market data (7d Trend) remain at top/bottom.
- **Defense analysis redesigned**:
  - Position-specific sub-header: "vs Pass D" for QB, "vs Rush D" for RB, "vs WR D" for WR, "vs TE D" for TE.
  - Three tiers shown as separate rows: **Tough D** (red), **Mid D** (neutral), **Soft D** (green). Values are fantasy points from your scoring settings.
  - Defenses ranked by pts allowed to the player's own position group (QB fpts for Pass D, RB fpts for Rush D, etc.).
  - **TE combination view**: TE players also show a "vs WR D · passing game context" section — defenses ranked by WR pts allowed, TE player's fpts measured against those same defenses. Shows whether a TE's production tracks with passing game quality regardless of specific TE coverage.

---

## v5.7.2 — Player Outlook Tooltip & Label Polish
*2026-03-23*

- **Defense tier labels renamed** — "Tough D", "Mid D", and "Soft D" rows are now labeled "Tough Defense", "Mid Defense", and "Soft Defense" for clarity.
- **InfoTooltip added to Player Outlook sub-sections** — An ℹ icon appears next to each sub-section header explaining what data is shown and how it's computed:
  - **Fantasy Performance** — explains pts use league scoring settings; defines Szn Rank, Szn PPG, and Recent.
  - **Raw Stat Leaders** — clarifies in-game production only, not fantasy-scored; explains what "top 15" means.
  - **vs [Position] D** — explains defense tier split (thirds by pts allowed), what fpts values represent, and the specific position being ranked.
  - **vs WR D · passing game context** (TE only) — explains the WR defense proxy and what the TE's fpts values represent.
- **OutlookRow center column widened** — Increased from 68px to 96px to accommodate the longer "Tough Defense" / "Mid Defense" / "Soft Defense" labels without wrapping.

---

## v5.8.6 — Per-Tab Companion Guide
*2026-03-24*

- **Guide is now tab-aware in Companion** — The Guide action opens a guide specific to whichever Companion sub-tab is active (Roster, Rankings, Matchup, Waiver, League, Heatmap, Trade, Scoring). Each guide is concise: 2–4 steps covering what the tab does and how to use it. The previous single monolithic Companion guide has been replaced.
- **Trade Agent instructional text updated** — "Build your trade" card copy revised to: "Select a trade partner above, or begin adding players or picks to either side. Or tap Search All Players to search for any rostered player, including your own."

---

## v5.8.7 — Trade Agent: Partner Selection & Multi-Add
*2026-03-24*

- **Team chip now selects partner only** — Tapping a team chip updates the active trade partner and clears their side without auto-opening a roster modal. Re-tapping the same chip is a no-op.
- **View Roster & Picks modal** — New "View Roster & Picks" button (appears when a partner is selected) opens a full multi-add modal showing all of that partner's players (sorted by trade value) and owned draft picks. Each row has a `+` button; items can be added one-by-one without closing the modal. Already-added items show a checkmark and dim.
- **Search All Rostered Players: open by default** — The all-rosters picker now shows all players immediately on open (sorted by value, grouped by position) instead of displaying a search guide. No typing required to browse.
- **Position filter chips in search picker** — ALL / QB / RB / WR / TE / K / DL chips narrow the all-rosters player list independent of the text search.
- **Partial team name matching** — Typing a city or partial team name (e.g. "New", "Kansas", "Tampa") now matches rostered players on those teams, not just exact abbreviations.
- **Browse/search buttons moved below trade builder** — "View Roster & Picks" and "Search All Rostered Players" now appear below the Your Side / Their Side columns rather than above them.
- **Rankings: rank numbers stable during search** — Searching in Companion → Rankings no longer renumbers players; each player retains their true overall rank regardless of search filter.
- **Trade Agent: Their Side +Player locks to partner roster** — When a trade partner is selected, tapping "+Player" on Their Side opens a picker locked to that partner's roster instead of global search.
- **Trade Agent: adding to Their Side no longer wipes Your Side** — Selecting a partner for the first time via global search now only resets Their Side; Your Side players are preserved.
- **League → Trade button for own roster** — Players on your own roster in Companion → League now show a "Trade" button that navigates to Trade Agent with that player pre-loaded on Your Side.

---

## v5.8.5 — Trade Agent: Natural Language Search & Inline Builder
*2026-03-24*

- **Natural language player search** — Trade Agent's "Search All Players" picker now uses the same `parseSearchQuery` engine as Compare. Supports name, team nickname/city/abbreviation, position (full name, plural, abbreviation), conference, division, and combined queries ("WRs in Detroit", "QBs in the AFC North"). Shows a SearchGuide with example chips when the field is empty, identical to the Compare experience.
- **Trade builder always visible** — The Your Side / Their Side columns are shown immediately on load instead of behind a "select a trade partner" gate. No blank launch screen.
- **Instructions instead of favorability bar** — Before any player or pick is added, a "Build your trade" card explains how to use the builder. The Favorability bar and all analysis sections appear only after the first item is added to either side. KTC loading and error states are surfaced inline in the same card.
- **Their Side pick button disabled without partner** — The "+ Pick" button on Their Side is dimmed and non-interactive until a trade partner is selected, since pick ownership requires a specific roster.
- **Picker UI polish** — Picker modal header now matches Compare's style: bold title, × close button, magnifying glass icon in the search field, and click-outside-to-dismiss.

---

## v5.8.4 — Trade Agent: Own-Roster Search
*2026-03-23*

- **Search All Players includes your own roster** — The global "Search All Players" button now searches every rostered player in the league, including your own team. Own players are labeled "Your Roster" in accent color to distinguish them from opponents. Selecting your own player from global search routes the addition to Your Side automatically (no partner change, no reset). Selecting an opponent still sets the trade partner as before.
- **Correct empty-state copy** — Instructional text under the launch icon now reads "Choose a league member above, or tap Search All Players to find any opposing player."
- **Duplicate exclusion in global search** — Players already on either side of the trade are excluded from global search results (previously only the "Their Side" list was excluded).

---

## v5.8.3 — Full Sleeper API Scoring Coverage
*2026-03-23*

- **Complete Companion → Scoring coverage** — Every scoring option available in the Sleeper API now has a corresponding row visible when the "All" toggle is selected. Nine new sections added: Tiered Reception Bonuses (`rec_0_4` through `rec_30_39`), Position First Down Bonuses (`bonus_fd_qb/rb/wr/te`), Special Teams Player stats (`kr_yd`, `pr_yd`, `st_tkl_solo`, etc.), Game Threshold Bonuses (`bonus_pass_cmp_25`, `bonus_rush_att_20`), Combined Yardage Bonuses (`bonus_rush_rec_yd_100/200`), 2+ Sack and 10+ Tackle game bonuses, Kicker per-yard scoring (`fgm_yds`, `fgm_yds_over_30`), and three Team DST sections (Turnovers & Scoring, Points Allowed tiers ×7, Yards Allowed tiers ×9 + miscellaneous team stats). Defense big-play bonuses (`bonus_def_fum_td_50p/int_td_50p`) and the 3+ Pass Deflection bonus (`idp_pass_def_3p`) also added to existing IDP/Big-Play sections.

---

## v5.8.2 — Scoring Import Fix & Active-Only Toggle
*2026-03-23*

- **Big-play bonus values now import correctly from Sleeper** — Sleeper's `scoring_settings` endpoint omits the `bonus_` prefix for big-play fields (e.g. `pass_td_40p: 1` instead of `bonus_pass_td_40p: 1`). `importLeagueScoring` was storing the value under the short key but `calcPoints` looks up the `bonus_*` key, so all 9 big-play bonuses silently stayed at 0. Fixed by adding the 9 short-form keys to `SCORING_SETTINGS_ALIASES` so they resolve to the correct internal `bonus_*` keys on import.
- **Companion → Scoring active-only toggle** — A segmented control ("Active" / "All") now appears next to the Sync button. Both options are always visible so the current selection is unambiguous. Default is "Active" — only scoring categories with non-zero values are shown. Switching to "All" reveals every supported scoring field including zeros.
- **Pick 6 Thrown now scored** — `pass_int_td` added to `DEFAULT_SCORING`, `STAT_TO_SCORING_KEY`, and `SCORING_SETTINGS_ALIASES` (maps Sleeper's `int_ret_td` key). Added to Companion → Scoring Passing section and to `ValuationInfoSheet` adjustment rows. KTC multiplier: a -5 pt/pick-6 penalty reduces QB values by ~7.5% vs baseline (rare event, ~0.3 pick-6s per game for an average QB).

---

## v5.8.1 — Big-Play Bonus Scoring
*2026-03-23*

- **9 big-play bonus fields now supported** — All Sleeper `bonus_*` fields for explosive plays are now scored, imported from Sleeper, displayed in Companion → Scoring, and factored into KTC value multipliers:
  - `bonus_pass_td_40p` / `bonus_pass_td_50p` — bonus pts per 40+/50+ yard passing TD (boosts QB)
  - `bonus_pass_cmp_40p` — bonus pts per 40+ yard completion (boosts QB)
  - `bonus_rush_td_40p` / `bonus_rush_td_50p` — bonus pts per 40+/50+ yard rushing TD (boosts RB)
  - `bonus_rec_td_40p` / `bonus_rec_td_50p` — bonus pts per 40+/50+ yard receiving TD (boosts WR/TE)
  - `bonus_rec_40p` — bonus pts per 40+ yard reception (boosts WR/TE)
  - `bonus_rush_40p` — bonus pts per 40+ yard run (boosts RB)
- **`STAT_TO_SCORING_KEY` extended** — Sleeper's weekly stat keys (`pass_td_40p`, `rec_40p`, etc.) now map to the correct scoring settings, so these events are counted from raw game data.
- **Companion → Scoring** — New "Big-Play Bonuses" section lists all nine fields with position context notes.
- **KTC multipliers updated** — `computeKtcMultipliers` factors each big-play setting into positional adjustments. Elite QBs, explosive WRs/TEs, and speed RBs are proportionally boosted when these settings are active.
- **ValuationInfoSheet** — Three new adjustment rows ("Big passing play bonus", "Big rushing play bonus", "Big receiving play bonus") appear when any of these settings are non-zero. KTC baseline now notes "Big-play TD/completion bonuses: None."
- **Matchup point values now show two decimal places** — Player scores in the head-to-head row were displaying to one decimal (e.g. `14.3 pts`) instead of two (`14.32 pts`).
- **IDP Hit on QB and Pass Defended now score correctly** — Sleeper's weekly stats use `idp_qb_hit` and `idp_pass_def` as stat keys, but `STAT_TO_SCORING_KEY` only mapped `idp_qbhit` and `idp_pd`. Both alternate keys are now aliased so these stats are picked up when calculating fantasy points from raw weekly data.
- **Position context propagated to all remaining scoring call sites** — 7 additional `calcPoints` calls were missing position, causing position-specific bonuses (`bonus_rec_te`, `bonus_rec_rb`, `bonus_rec_wr`, `bonus_rush_att`, big-play bonuses) to be silently skipped in the following paths:
  - `projectPlayer` in `projectionEngine.js` — `gamePts`, `recentPts`, and home/away split calculations all passed `pos` to `calcPoints`; projections for TEs/RBs/WRs in leagues with position bonuses were underestimating
  - `getDefenseStrength` — both the primary (opp-field) and secondary (schedule-derived) accumulation passes now pass `player.position`; defense strength ratings and matchup difficulty were understating pts allowed to premium-position players
  - `getLeagueAvgPPG` — league average PPG baseline now position-aware; affected `oppFactor` normalization in all projections
  - `CompanionDefense.jsx` — Defense Scored table computation and drilldown `getDefVal` callback both updated to pass `player.position`; IDP fantasy totals were undercounted for any position bonus setting

---

## v5.8.0 — Scoring True-Up
*2026-03-23*

- **`bonus_rush_att` now scored** — Per-carry bonus (e.g. 0.1 pts/carry for high-volume rushers) added to `DEFAULT_SCORING`, applied in `calcPoints` for RBs, surfaced in Companion → Scoring, and factored into KTC value multipliers (+1.5% per 0.1 bonus unit for RBs).
- **Position context threaded through all scoring call sites** — `bonus_rec_te`, `bonus_rec_rb`, `bonus_rec_wr`, and `bonus_rush_att` require knowing a player's position to apply correctly. Previously these bonuses were silently skipped everywhere except Companion → Trade. Fixed in:
  - `calcSeasonPoints`, `getRecentForm`, `getRecentAvg` in `scoringEngine.js` — all now accept optional `position` param
  - `getAvgPPG` in `projectionEngine.js` — accepts `position`; season PPG for TEs, RBs, and WRs now includes position-specific bonuses
  - `computePositionalRanks` — season scores use player's own position when ranking, so TE rankings properly include TE premium
  - `buildDefenseTable` — default value function now passes player position to `calcPoints`, fixing defense pts-allowed accuracy for TE/RB/WR-heavy weeks
  - **Companion → Roster, League, Rankings, Waiver, Matchup**: all per-player PPG and season pts calculations now pass position
  - **Compare → Fantasy panel**: Season Pts, Avg PPG, Last 4, Season High/Low all position-aware
  - **PlayerWeeklySheet**: per-week pts now includes position bonuses
  - **CompanionDefense drilldown**: pts breakdown and `getScoreBreakdown` now show position-specific bonus line items (e.g. "TE Rec Bonus", "Carry Bonus")
- **`ValuationInfoSheet`**: Carry bonus adjustment row added; baseline assumptions updated to list "Position reception bonuses" and "Per-carry bonus."

---

## v5.7.5 — Reception Bonus Import Fix
*2026-03-23*

- **Scoring settings now re-derived on startup** — `scoringSettings` was initialized from stale localStorage on every app load instead of re-importing from the persisted league data. `bonus_rec_te`, `bonus_rec_rb`, `bonus_rec_wr`, and any other fields added after the user's last league selection were silently missing. Now, if a league is saved, scoring settings are freshly derived from `league.scoring_settings` on every startup — no re-connection required.
- **TE/RB/WR reception bonuses visible in Companion → Scoring** — "TE Reception Bonus", "RB Reception Bonus", and "WR Reception Bonus" rows added to the Receiving section so per-position bonuses are visible alongside the base reception rate.

---

## v5.7.4 — Per-Position Reception Bonus Scoring
*2026-03-23*

- **`bonus_rec_rb` and `bonus_rec_wr` now scored** — Leagues that award extra per-reception points to RBs or WRs (independent of the base PPR rate) now have those bonuses applied when computing fantasy points. Previously only `bonus_rec_te` (the TE premium) was handled; RB and WR equivalents were silently dropped when importing from Sleeper.
- **KTC value multipliers updated** — `computeKtcMultipliers` now factors in `bonus_rec_rb` (+10% per bonus unit) and `bonus_rec_wr` (+12% per bonus unit) so league-adjusted trade values reflect per-position reception bonuses.
- **ValuationInfoSheet updated** — RB/WR reception bonus rows now appear in the "Your League's Adjustments" section when those settings are non-zero, alongside the existing TE premium row. The KTC baseline note now references TE/RB/WR reception bonuses collectively.

---

## v5.7.3 — Fantasy Stat Leaders
*2026-03-23*

- **Fantasy Stat Leaders section added to Player Outlook** — New section between Fantasy Performance and Raw Stat Leaders. Shows each player's positional rank for each stat category ranked by fantasy points earned, not counting stats. Only stat categories that have a non-zero scoring multiplier in your league are shown (e.g. receptions are excluded in standard scoring, included in PPR). Top-10 only. Color-coded: green = top 3, amber = top 7, default = 8–10.
- **TE premium aware** — For TEs, the receptions rank accounts for both the base reception points and the TE premium (`bonus_rec_te`), giving an accurate fantasy-weighted ranking.
- **Distinct from Raw Stat Leaders** — Fantasy Stat Leaders reflects scoring value (how many pts did this player generate from each stat); Raw Stat Leaders reflects production volume (how many yards, TDs, receptions). A player can rank lower in raw stats but higher in fantasy pts if their league values that stat heavily.

---

## v5.8.8 — Trade Agent Defensive Values & Wiki Seed
*2026-03-26*

- **IDP / D/ST fallback values in Trade Agent** — Defensive players with no KTC listing now get production-based fallback trade values anchored to the same value-per-PPG scale as skill positions. `aggregateSeasonStats()` now backfills `gp` from weekly entry count when Sleeper omits it for defensive rows, preventing active IDP/DST assets from collapsing to zero.
- **Trade pickers aligned for defensive players** — The selected-roster `+ Player` modal now uses the same defensive fallback value path as `View Roster & Picks`, exposes LB / DB / D/ST filter chips in global search, groups defensive sub-positions under DL / LB / DB / DEF, adds inline multi-add with persistent checkmarks in roster pickers, and suppresses misleading additive side totals when selecting a player would switch partners.
- **Trade picker UX polish** — Search inputs in the player picker now disable browser autocomplete/autofill behavior, sticky position headers in roster pickers render with an opaque background while scrolling, and already-added assets are visibly dimmed and locked from re-selection.
- **Valuation modal defensive scoring cleanup** — "How Values Are Calculated" now shows a shorter defensive valuation explanation and only renders IDP or D/ST scoring rows when that scoring type is actually enabled and active for the league.
- **Heatmap load-time optimization** — Companion → Heatmap now builds offense tables through a cached local path, shows a lightweight "Preparing heatmap…" loading state during stat enhancement, and avoids unnecessary table work while background enhancement is still running.
- **Repo docs starter** — Added an Obsidian-friendly `docs/` folder with linked notes for architecture, feature areas, edit entry points, and project conventions to seed a future in-repo wiki.

---

## v6.0 — Trade Suite
*2026-03-28*

- **Trade promoted to a top-level section** — Trade now lives outside Companion as its own app area, with sub-tabs for Agent, Intelligence, Upgrades, and Compare. Compare was moved under Trade, and the guide/navigation flows were updated to match.
- **Agent page simplified around the manual builder** — The former Trade Agent view now focuses on the core builder while proposal-heavy UI moved into its own Intelligence tab, reducing visual clutter in the main trade workflow.
- **Trade Intelligence split into two proposal modes** — Added `Fix Needs` for starter/depth upgrades and `Use Surplus` for moving roster strength into picks, need-fit players, or mixed return packages.
- **Partner-aware proposal engine expanded** — Trade Intelligence can now build packages up to three assets on either side, including player-plus-pick bundles, compensation picks coming back, and broader surplus-driven offers instead of only simple one-for-one ideas.
- **Proposal reasoning overhauled** — Suggestions now carry structured reason types and clearer copy for starter upgrades, thin depth, no playable fallback, surplus, schedule pressure, bye pressure, and pick compensation. Position labels in explanations remain uppercase, and low-value partner benefits now use depth language instead of misleading `0.0 PPG` upgrade phrasing.
- **Pick logic explained in the UI** — When draft picks are included, the reasoning text now explains why the pick is part of the package for both sides instead of treating picks as silent throw-ins.
- **Trade Intelligence cards redesigned as trading cards** — Proposal assets now render as portrait-style cards with team-color gradients, player headshots, featured KTC values, Give/Get badges, and responsive stat layouts that scale from compact mobile summaries to fuller desktop breakdowns.
- **Multi-asset proposal layout cleaned up** — Each player in a package now renders as its own card, picks are shown as distinct supporting chips instead of duplicated card content, and desktop rows pack more efficiently with wrap-aware layouts, orphan-row centering, and dense backfilling.
- **Trade entry points were rewired across the app** — Roster, League, Compare, and Trade proposal apply actions now route into the correct Trade sub-view, and Trade CTAs can send position-specific requests into Waiver with the relevant filter preselected.
- **Trade labeling and release badges updated** — The top-level Trade section is now marked Beta, Agent and Intelligence are tagged Beta, Upgrades is tagged Alpha, and Compare no longer carries a beta badge.

---

## v6.0.1 — Trade Card Desktop Readability
*2026-03-29*

- **Desktop proposal cards enlarged** — Trade proposal player and draft cards now use larger desktop width caps so the card face reads more comfortably on wider displays without falling back to blurry fractional scaling.
- **Desktop stat panels made more readable** — The `Game Stats`, `Fantasy`, and draft-card `Proj. Pick` sections now use larger desktop typography and spacing, improving legibility inside the lower info boxes.
- **Height syncing changed to content-safe min-height** — Proposal-card equalization now uses a synced minimum height instead of a fixed height, so larger cards can still grow tall enough for stat content without clipping while both sides of a package remain aligned.
- **Project memory updated for future card changes** — Added an explicit repo note that any proposal-card size adjustment must also be checked for desktop text fit, vertical expansion, and equal-height behavior.

---

## v6.0.3 — Upgrades Card Polish
*2026-03-29*

- **Upgrades Step 2 selected cards now stay uniform** — The selected-player rail in Trade → Upgrades now uses its own shared height sync, so multiple outgoing cards stay aligned instead of ending up at different heights.
- **Desktop selected-card proportions improved** — Upgrades selected cards now size more responsively on desktop and use a slightly wider desktop image proportion so they feel closer to real trading cards without changing the mobile layout.
- **Card copy and micro-interactions cleaned up** — Player-card stat headers now read `Stats`, and the Step 2 remove affordance now swaps the team-logo badge into an `X` in the exact same corner position instead of overlaying a second control.

---

## v6.0.4 — Trade Flow Cleanup + Mixed Asset Cards
*2026-03-29*

- **Stale Trade entry points removed** — Trade → Intelligence no longer exposes `View Roster and Picks`, so that page can no longer mutate Agent selections through an outdated control path.
- **Agent pickers now support multi-add** — Your Side player selection and both pick pickers in Trade → Agent now stay open for multi-select flows instead of closing after a single add.
- **Upgrades search state now invalidates correctly** — Trade → Upgrades clears stale loaded results when the selected target, outgoing pool, or pick/posture settings change, including after removing a selected player.
- **Empty outgoing pools now stay pick-led** — Trade → Intelligence / Upgrades no longer fabricate outgoing player packages when no outgoing players are selected, keeping search results aligned with the UI copy.
- **Mixed player-plus-pick proposals now render full draft cards** — Trade → Intelligence now renders draft picks as full cards in mixed packages instead of collapsing them into pill callouts, including mobile layouts.
- **Proposal card proportions tuned further** — Desktop card slots now widen more as equal-height syncing makes a package taller, improving the trading-card silhouette while preserving the shared-height behavior.

---

## v6.1 — Heatmap & League Polish
*2026-04-01*

- **Mouse-tracking border glow on proposal cards** — Interactive trade proposal player cards now show a team-colored border glow that follows the mouse cursor, intensifying at the nearest edge. Implemented via a new `useCardGlow` hook (`src/hooks/useCardGlow.jsx`) using CSS `mask-composite: exclude` on a radial-gradient overlay.
- **Automatic glow color contrast** — When a team's glow color is too similar to the card background (e.g. Browns orange-on-orange), the hook detects Euclidean RGB distance and swaps to a contrasting neutral (white in dark mode, dark navy in light mode).
- **Light mode directional outer shadow** — Light mode adds a directional `box-shadow` that shifts toward the mouse position, providing a soft colored glow outside the card border since the masked border alone is too subtle against the light page background.
- **Glow uses team primary color** — The glow color is derived from the team's vivid primary color rather than the palette's `accentColor`, which was contrast-adjusted for text and resolved to near-white for most teams in light mode.
- **Heatmap — uniform tile sizing** — Switched the Defense grid table to `table-layout: fixed` with a `<colgroup>` pinning the team column, so all stat columns share the remaining width equally. Tiles are now the same size regardless of which stat mode or location filter is selected.
- **Heatmap — viewport-scaling tiles** — Table width is `100%` with a `minWidth` floor, so tiles scale up to fill available horizontal space on wider screens instead of leaving dead space.
- **Heatmap — AVG column moved to the end** — The AVG/Covers column now always renders as the last column. When hidden (Spread mode), a placeholder column of equal width keeps all week tiles the same size and prevents the grid from shifting.
- **Heatmap — reduced cell padding** — Horizontal padding on metric cells reduced to `2px` per side; `HEATMAP_CELL_HEIGHT` constant (`40px`) enforces consistent row height.
- **Heatmap — stable team column width** — Team column width is computed once from `ALL_TEAMS` (empty `[]` deps) via canvas text measurement, measuring the main name line, conference/division sub-label, and the sort chips row. Sort chip labels shortened to `Conf` / `Div` so all three chips fit on one row within the measured width.
- **League → Draft Picks — dynamic team column width** — The owner name column in the Draft Capital grid is now sized by measuring the longest display name via canvas, eliminating truncation at `max-width: 76px`.
- **League → Draft Picks — dark mode traded-away ring contrast** — The empty circle indicator for traded-away picks now uses `--color-label-tertiary` (35% opacity) with no extra opacity reduction, making it clearly visible as a light ring against dark backgrounds. Previously used `--color-label-quaternary` at `opacity: 0.35` (~7% visible).
- **League → Draft Picks — grid spacing fixes** — Cell width tightened from 52px to 48px (on-grid), year header vertical padding increased to `8px`, sticky round sub-header `top` offset corrected to `32px`, pick cell padding adjusted to `4px 0`, abbreviation text size increased from `7px` to `8px`, and fallback avatar font size from `9px` to `10px`.
- **Companion list views visually normalized** - League adopted the newer Roster card treatment, Roster / League / Waiver / Rankings now share the same stronger team-tint path in dark mode, the League owner strip hides its horizontal scrollbar, and the Season / Avg-G style metric columns were re-centered to line up with their values.
- **Matchup restyled into the Broadcast Editorial system** - Matchup now uses a stronger score header, squared editorial side panels, mirrored team-tinted player cards, larger avatars, restored hover glow, improved metadata contrast, and a clearer bench toggle with result-state treatment.
- **Matchup team score breakdowns now reconcile to the displayed total** - The team-header modal now aggregates through the actual scoring-engine mappings and position-specific bonus paths instead of a smaller stat-label subset, preventing missing scoring rows from silently lowering the modal total.
- **Heatmap team-column and week-window logic refined** - The sticky Team column now sizes to its visible content shape, the number of displayed weeks follows the league's actual fantasy season, and stat columns stay width-stable across filters including Spread.
- **Heatmap stat and layout correctness fixes** - Pass Def / QB Hit cells and drilldowns now respect Sleeper alias keys, Conference / Division team sorting no longer changes row height, and the sticky Team logo / abbreviation alignment was corrected.
