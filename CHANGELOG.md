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
