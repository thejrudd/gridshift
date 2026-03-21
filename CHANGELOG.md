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
