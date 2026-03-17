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
