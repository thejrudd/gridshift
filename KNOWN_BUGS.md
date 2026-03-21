# NFL Predictor — Known Bugs

Open bugs are listed first, fixed bugs below. Add new entries at the bottom of each section.

---

## Open

| Bug |
|-----|

---

## Fixed

| Bug | Fixed In |
|-----|----------|
| Defense drilldown allowed background page scrolling while open | v4.3.1 |
| Season X/32 progress bar visible on non-Predictions tabs | v4.3.1 |
| Defense drilldown player links used Sleeper player IDs instead of ESPN IDs | v4.3 |
| Matchup view incorrectly showed all players as Away | v4.3 |
| Defense grid average column divided by weeks-with-data instead of games-played | v4.3 |
| Defense grid header row not frozen when scrolling vertically | v4.3.4 |
| Defense grid not independently scrollable on mobile | v4.3.4 |
| Bye weeks showed blank instead of "BYE" in Defense grid cells | v4.3.4 |
| Defense Scored view showed stats for bye weeks (Sleeper phantom data not filtered by scheduleMap) | v4.3.5 |
| Matchup page showed blank card for players on bye week (no BYE indication) | v4.3.5 |
| Roster drilldown weekly sheet missing opponent column and bye week rows | v4.3.5 |
| WAS team row fully transparent in Defense grid (STADIUMS uses `WAS`, TEAM_COLORS uses `wsh`) | v4.3.6 |
| LA Rams team row no color in Defense grid (STADIUMS uses `LAR`, TEAM_COLORS uses `la`) | v4.3.6 |
| Defense grid not filling available vertical screen space on desktop | v4.3.6 |
| Defense grid frozen header row and first column borders showed scrolled grid content behind them when scrolling | v4.3.7 |
| Defense grid team color tints too washed out in light mode | v4.3.7 |
| Defense grid team name text had low contrast against team color row tints in light mode | v4.3.7 |
| Defense grid — wrong player attribution for traded/signed players | v4.4 |
| Defense Scored drilldown — wrong player attribution for traded/signed defensive players (IDP: DL/LB/DB); used `player.team` instead of ESPN-confirmed or inferred season team | v4.4.1 |
| Defense grid drilldown — player names not clickable for Pass 2 players (espn_id: null in Sleeper DB, resolved via ESPN roster name-match) because resolved ESPN IDs were not stored in context | v4.4.1 |
| Companion sub-navigation tabs overflow the screen on mobile, causing erroneous horizontal page scrolling | v4.5 |
| Phase (Offense/Defense) filter visible on heatmap when Rec Yds, Rush Yds, Game Score, or Vegas Odds stat mode is selected — those modes are offense-only and have no defense equivalent | v4.6 |
| Home/Away filter ignored when sorting by week — filtered cells displayed color and value instead of the faded dash | v4.6 |
| Desktop heatmap grid shorter than available screen height — tab bar height (49px) was subtracted even though the tab bar is hidden at lg+ | v4.6 |
| Heatmap → Statistics player link showed only current season — playerMeta.experience was absent so year list defaulted to current year only instead of full career window | v4.6 |
| Heatmap didn't render after Load Stats — CompanionDefense never called loadPlayers(), so players stayed null until another Companion tab was visited | v4.6 |
| Companion sub-navigation tab strip scrolls vertically in addition to horizontally | v4.5.1 |
| Heatmap grid on mobile PWA does not scroll to the bottom — bottom tab bar/safe-area inset obscures the last rows, requiring whole-page scrolling which breaks navigation | v4.5.1 |
| Player data cache not auto-clearing on version bump — stale player data (wrong team attribution, missing ESPN IDs) persisted across deploys until the user manually disconnected | v4.6 |
| Heatmap tile widths inconsistent across stat modes — Score mode cells were wider (50px) than all other modes (40px) | v4.6.2 |
| Heatmap filter bar wrapped to a second line when switching stat modes, pushing the grid down | v4.6.2 |
| Player stats page listed years the player had no recorded activity — accordion rows showed "Failed to load stats." for those years | v4.6.2 |
| Heatmap Fantasy Points / Rec Yds / Rush Yds offense mode showed stats for the opposing offense (points allowed by each defense) instead of each team's own offensive output; drilldown showed opposing players | v4.6.2 |
| Heatmap player links opened Statistics page showing years back to 2016 for all players — `experience` was not passed in the navigation payload so the year list defaulted to a 10-year window | v4.6.2 |
| Matchup projection — "Difficult" defense matchups showed positive score multiplier — `getLeagueAvgPPG` returned per-player-game average while `ptsAllowedPerGame` is a team-game aggregate, causing `oppFactor` to always be inflated (≥1); fixed by aggregating `leagueAvg` by opponent-team-week | v4.6.2 |
| Matchup projection — Home/Away factor always showed 1.00× — required ≥3 home and ≥3 away games before activating; lowered threshold to ≥1 so the factor applies from the first game | v4.6.2 |
| Heatmap Vegas Odds disclaimer shown as plain text below filter bar — replaced with an ℹ icon tooltip | v4.6.2 |
| Heatmap Spread/O/U view showed an AVG column with 0.0 values — column hidden in vegas_odds mode since it offers no signal | v4.6.2 |
| Matchup projection range too wide (20+ pt spread) — floor/ceiling used quartile averages (extremes of the extreme); replaced with true 25th/75th percentile values for a tighter band | v4.6.2 |
| Matchup projection fell outside its own floor–ceiling range — percentile floor/ceiling were anchored to seasonAvg while projection used recent-weighted blendedBase; fixed by expressing floor/ceiling as fractions of seasonAvg applied to projected (guarantees min ≤ projected ≤ max always) | v4.6.2 |
| Matchup drilldown had no link to the player's Statistics page | v4.6.2 |
| Matchup projection Home/Away row shown as 1.00× when no split data available — row now hidden when locationFactor is effectively neutral | v4.6.2 |
| Statistics page looked different when navigated from Heatmap/Matchup — missing jersey, position name, and career stat columns; external nav only passed `{ id, displayName, teamId, experience }` without `position`; fixed by passing `position` at all call sites and enriching from cached ESPN roster in `PlayerBrowser` | v4.6.3 |
| Heatmap Offense phase color scheme reversed — high points allowed (easy matchup) showed red and low points (tough matchup) showed green; `t` was incorrectly inverted (`1 - raw`) for offense mode | v4.6.3 |
| Waiver tab running extremely slowly — `projectPlayer()` called `getOpponentStrength()` and `getLeagueAvgPPG()` per player (each an O(n) full scan of all weekly stats); projections recomputed on every filter/sort/search change; search not debounced | v4.7.1 |
