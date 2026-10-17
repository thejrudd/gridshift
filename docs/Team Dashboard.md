# Team Dashboard

The Statistics team page opens with its hero (`TeamHero.jsx`): logo, name, city, founding year, and stadium; one row of pods for the selected season's record (home and away split), division place (and who leads), Super Bowls (with years), and division titles; View Schedule; and, for the current season, a next-game line (opponent, kickoff, venue, week) under a rule. The next-game line opens that matchup's drill-in on Statistics Schedule (By Team, `?game=<season>-W<week>-<away>-<home>`); the schedule matches that id with team aliases normalized, so `WAS` and `WSH` find the same row. The team palette reaches the hero through `--statistics-team-hero-*` custom properties set by `TeamPage.jsx`. `TeamPage.jsx` owns the season choice and the one team-season fetch, so the hero and the dashboard read the same season. Below the hero, the dashboard leads with the players, then the numbers:

1. **Position leaders** — one card per position: QB, RB, three WRs, TE; EDGE, DL, LB, CB, S; K, P. Each card is the team's production leader for that role, labeled with his depth-chart standing: "Starter at LDE", or a **Backup** badge with the spot and who is ahead ("2nd at SLB, behind Nwosu"). Receiver cards are tagged and ordered WR1–WR3 by depth-chart spot. Cards open the player's Statistics page.
2. **Depth chart** — ESPN's current depth chart by unit (Offense, Defense, Special teams): the base 11 on a field, then a flat table (Starter, 2nd, 3rd, 4th). Sub-package players such as a nickel back are listed in the table and named under the field.
3. **Tabs** — Season (team stat ranks, results tape, schedule and results, division standings, splits, scoring and drives, game-by-game trends) · Player stats (team leaders and sortable stat tables) · League ranks (20 unit ranks against all 32 teams) · Full roster (ESPN's current roster with season stat lines).

The page offers the last three seasons from 2022 on. The depth chart and roster are always ESPN's current ones, so for a past season the cards pair that season's production with today's depth chart.

## Data

**`GET /api/statistics/teams/season?season&team`** (`server/teamSeasonHandlers.js`), proxied in Vite and nginx:

- The team's finished regular-season games, built from Statistics Scores game details by `buildTeamGame` (`src/utils/teamSeason/teamSeasonModel.js`): box lines for the team's players, both team stat lines, quarter scores, how every drive ended, and every scoring play. A finished game is cached for the life of the process once its plays have landed.
- The remaining schedule, every team's record and division record (`buildStandings`), and league unit ranks (`buildTeamRanks`) from every finished team-game stat line, pulled through the shared BALLDONTLIE gateway and refreshed every 15 minutes.
- Drives are rebuilt from play order with the shared offense/defense rule (`resolveOffenseDefenseTeams`); they match the provider's own drive count per team.

**`GET /api/statistics/teams/depth-chart?team`** (same router) fetches ESPN's depth chart server-side and caches it for an hour; ESPN's depth chart endpoint sends no CORS header, so browsers cannot call it directly. `team` is ESPN's lowercase abbreviation (`toEspnTeamId`).

In the browser, `fetchDepthChartUnits` (`src/utils/playerApi.js`) reads that route and keeps ESPN's units, slots, and order. ESPN gives each receiver spot its own slot (`wr1`–`wr3`, each with backups); those are labeled WR1–WR3. Box-score players are linked to ESPN's roster and depth chart by name, ignoring suffixes and punctuation. Card roles follow the defensive front: in a 3-4 the ends and nose are the defensive line and the outside (weakside, strongside) linebackers are edge rushers; in a 4-3 the ends are edge rushers, the tackles are the defensive line, and all three linebackers play off the ball. Without a depth chart a listed defensive end is the edge rusher.

## Fantasy points

A Fantasy points switch (remembered per browser) scores box lines with `calcPoints` (`src/utils/teamSeason/teamDashboardModel.js`):

- **PPR, Half PPR, Standard** — the default scoring with that reception value, plus 3 points per field goal and 1 per extra point, because box lines carry no kick distances.
- **League scoring** — when a league is connected it is the only scoring used (shown as a label, no format picker; PPR, Half PPR, and Standard are for users without a league); it scores QB, RB, WR, and TE and leaves kickers out for the same reason.

Offense and kicker leader cards switch to fantasy points; defense and punter cards keep their stats, and so does the kicker card under league scoring, where kickers are unscored. Player stats gains a Fantasy points table first. Box lines carry no bonus or distance tiers, so totals can differ from a league's own.

## UI rules

- Components live in `src/components/statistics/team/` and reuse the player dashboard's pieces (`.player-dash-*` styles, the tap/hover tooltip, `RankStrips`, `TeamMark`, `Segmented`, `Switch`) — see [[Player Dashboard]]. Team-only styles are `.team-dash-*` in `src/index.css`.
- "This team" is the team's mode-aware primary color through `getLegibleTeamColor`.
- Games open in Statistics Scores on the Team section. In `npm run dev`, Scores starts on its local fixture source; pick BALLDONTLIE in its developer source picker to follow these links.
- On phones, line-of-scrimmage spots in the formation (offensive and defensive line, tight end) show only their position label; the table names them. Edge spots stay inside the field.

## Validation

- `tests/unit/teamSeasonDashboard.test.mjs` — standings, upcoming games, ranks, team game drives and scoring, depth roles and backup labels, fantasy scoring, season totals, and route validation.
