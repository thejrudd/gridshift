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
