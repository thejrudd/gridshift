# Team Dashboard

The Statistics team page opens with its hero (`TeamHero.jsx`): logo, name, city, founding year, and stadium; one row of pods for the selected season's record (home and away split), division place (and who leads), Super Bowls (with years), and division titles; View Schedule; and, for the current season, a next-game line (opponent, kickoff, venue, week) under a rule. The next-game line opens that matchup's drill-in on Statistics Schedule (By Team, `?game=<season>-W<week>-<away>-<home>`); the schedule matches that id with team aliases normalized, so `WAS` and `WSH` find the same row. The team palette reaches the hero through `--statistics-team-hero-*` custom properties set by `TeamPage.jsx`. `TeamPage.jsx` owns the season choice and the one team-season fetch, so the hero and the dashboard read the same season. Below the hero sit the season picker and Fantasy points switch, then four tabs:

1. **Season** — Team stats as a headerless rail directly under the tabs (points, points allowed, yards, and yards allowed per game, then point differential, turnover differential, third-down rate, and red-zone scoring, each with league rank; hovering a figure lists each game's value, then the average and rank), the results tape (finished games, then upcoming weeks), Division standings beside Splits, then Scoring and drives:
   - **Points by quarter** and **How they scored** filter each other. Selecting a quarter narrows the scoring rows to that quarter; selecting a scoring row narrows the bars to that kind of score for both teams. A chip names the active filter and clears it; selecting the same item again clears it too. The filter row keeps one height, so the chip never moves the charts.
   - **How they scored** rows: Passing TD and Rushing TD at 6 points, Field goal, Extra point and Two-point conversion (made of attempted), Defensive scores (defensive touchdowns and safeties), and Return TD when there is one. Extra point, Two-point conversion, and Defensive scores show even at zero.
   - How drives ended, then game-by-game trends.
2. **Players** — **Position leaders** first: one card per position (QB, RB, three WRs, TE; EDGE, DL, LB, CB, S, plus the interceptions leader; K, P), then the sortable stat tables. Each card is the team's production leader for that role, labeled with his depth-chart standing: "Starter at LDE", or a **Backup** badge with the spot and who is ahead ("2nd at SLB, behind Nwosu"). Receiver cards are tagged and ordered WR1–WR3 by depth-chart spot. The interceptions card reads its player's standing at his own role. Offense, Defense, and Special teams each take a full row on one shared card track, so the rows line up. Cards open the player's Statistics page; a bar in a card's per-game chart opens that game in Scores on Players, at the card's stat table (passing, rushing, receiving, defense, kicking, punting) with that player's quarter split expanded.
3. **Depth** — ESPN's current depth chart by unit (Offense, Defense, Special teams) as one flat table: Pos, Starter, 2nd, 3rd, 4th. Positions show only their abbreviation (the full name is the hover title). Offense rows sit under Backfield, Receivers, and Offensive line labels; defense under Defensive line, Linebackers, and Secondary; special teams is ungrouped. Starters are marked by a bold name and a team-color ring on the headshot, not a column fill. Hovering a row tints it; hovering a player tints and underlines that player. Sub-package players such as a nickel back appear in their group. Names wrap only between words: columns size to fit each name's longest word, and the table scrolls sideways when four columns can't fit. Phones show last names only.
4. **League** — 20 unit ranks against all 32 teams.

The page offers the last three seasons from 2022 on. The depth chart is always ESPN's current one, so for a past season the cards pair that season's production with today's depth chart.

## Data

**`GET /api/statistics/teams/season?season&team`** (`server/teamSeasonHandlers.js`), proxied in Vite and nginx:

- The team's finished regular-season games, built from Statistics Scores game details by `buildTeamGame` (`src/utils/teamSeason/teamSeasonModel.js`): box lines for the team's players, both team stat lines, quarter scores, how every drive ended, and every scoring play. A finished game is cached for the life of the process once its plays have landed.
- The remaining schedule, every team's record and division record (`buildStandings`), and league unit ranks (`buildTeamRanks`) from every finished team-game stat line, pulled through the shared BALLDONTLIE gateway and refreshed every 15 minutes.
- Drives are rebuilt from play order with the shared offense/defense rule (`resolveOffenseDefenseTeams`); they match the provider's own drive count per team.
- Each scoring play carries its total `pts` plus `playPts` (6 for a touchdown, 3 for a field goal, 2 for a safety), `try` (`Extra point` or `Two-point conversion`), `tryGood`, and `tryPts`, read from the play text by `scoringParts` ("extra point is GOOD / No Good", "TWO-POINT CONVERSION ATTEMPT … ATTEMPT SUCCEEDS / FAILS"). In the browser, `scoringPartsOf`, `scoringBreakdown`, and `quarterPoints` (`teamDashboardModel.js`) build both scoring views from those parts, so their totals always agree with the quarter scores. A game cached before tries were read keeps its whole score on the play until the server restarts.

**`GET /api/statistics/teams/depth-chart?team`** (same router) fetches ESPN's depth chart server-side and caches it for an hour; ESPN's depth chart endpoint sends no CORS header, so browsers cannot call it directly. `team` is ESPN's lowercase abbreviation (`toEspnTeamId`).

In the browser, `fetchDepthChartUnits` (`src/utils/playerApi.js`) reads that route and keeps ESPN's units, slots, and order. ESPN gives each receiver spot its own slot (`wr1`–`wr3`, each with backups); those are labeled WR1–WR3. Box-score players are linked to ESPN's roster and depth chart by name, ignoring suffixes and punctuation. Card roles follow the defensive front: in a 3-4 the ends and nose are the defensive line and the outside (weakside, strongside) linebackers are edge rushers; in a 4-3 the ends are edge rushers, the tackles are the defensive line, and all three linebackers play off the ball. Without a depth chart a listed defensive end is the edge rusher.

## Fantasy points

A Fantasy points switch (remembered per browser) scores box lines with `calcPoints` (`src/utils/teamSeason/teamDashboardModel.js`):

- **PPR, Half PPR, Standard** — the default scoring with that reception value, plus 3 points per field goal and 1 per extra point, because box lines carry no kick distances.
- **League scoring** — when a league is connected it is the only scoring used (shown as a label, no format picker; PPR, Half PPR, and Standard are for users without a league); it scores QB, RB, WR, and TE and leaves kickers out for the same reason.

Offense and kicker leader cards switch to fantasy points; defense and punter cards keep their stats, and so does the kicker card under league scoring, where kickers are unscored. Player stats gains a Fantasy points table first. Box lines carry no bonus or distance tiers, so totals can differ from a league's own.

## UI rules

- Components live in `src/components/statistics/team/` and reuse the player dashboard's pieces (`.player-dash-*` styles, the tap/hover tooltip, `RankStrips`, `TeamMark`, `Segmented`, `Switch`) — see [[Player Dashboard]]. Team-only styles are `.team-dash-*` in `src/index.css`.
- Flat layout, shared with the player dashboard: sections stand apart through their headers, a full-width rule above each top-level section, and spacing, not boxes. Surfaces, table wraps, the results tape, and leader cards have no frame; the stat rail and trend tiles are open columns split by hairline rules; hero figures are separated by dividers, and the hero's background logo sits fully inside the banner.
- Header levels, shared with the player dashboard: the header that opens a top-level section (`.player-dash-heading`, or a `SectionHead` that opens a block directly under the panel or a top-level grid) is 24px (`--type-heading-md`, weight 800); headings further inside a section are 18px subheads (`--type-heading-sm`).
- "This team" is the team's mode-aware primary color through `getLegibleTeamColor`.
- Games open in Statistics Scores on the Team section. In `npm run dev`, Scores starts on its local fixture source; pick BALLDONTLIE in its developer source picker to follow these links.
- On phones, line-of-scrimmage spots in the formation (offensive and defensive line, tight end) show only their position label; the table names them. Edge spots stay inside the field.

## Validation

- `tests/unit/teamSeasonDashboard.test.mjs` — standings, upcoming games, ranks, team game drives and scoring, depth roles and backup labels, fantasy scoring, season totals, and route validation.
