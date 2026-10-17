# Player Dashboard

The Statistics player page opens on a play-by-play dashboard. Tabs depend on the player's position group; **Seasons** is the season-by-season page that existed before (Game Stats, Fantasy Values, Visual, season rows, career).

| Group | Tabs |
| --- | --- |
| QB | Overview · Passing · Rushing · Every play · Seasons |
| RB | Overview · Rushing · Receiving · Every play · Seasons |
| WR, TE | Overview · Receiving · Every play · Seasons |
| K | Overview · Kicking · Every play · Seasons |
| DL | Overview · Pass rush · Tackling · Every play · Seasons |
| LB | Overview · Tackling · Pass rush · Every play · Seasons |
| DB | Overview · Coverage · Tackling · Every play · Seasons |

Positions without a group (OL, P, LS, team defense) show the Seasons page alone. The last-opened tab is remembered for the browser session; a tab the next player's group lacks falls back to Overview.

## Data

Two server routes under `/api/statistics/players` (`server/playerSeasonHandlers.js`), proxied in Vite and nginx:

- **`GET /season?season&team&name&position&sleeperId`** — the player's finished regular-season games. Each game comes from the Statistics Scores game detail (BALLDONTLIE game, player and team stat lines, plays), so it shares the gateway, its rate limits, and the canonical play snapshots. A finished game's compact result is cached in memory for the life of the process; a game whose plays have not landed is not cached.
- **`GET /pools?season&group`** — league rank pools and team-week offense lines, built from Sleeper's public weekly stats (`api.sleeper.com/stats/nfl/{season}/{week}`), which carry team, opponent, position, snaps, and offensive, kicking, and IDP lines. Finished weeks are cached for the life of the process; the current week refreshes every 15 minutes.

Play-by-play starts with the 2022 season; the page offers the player's last three seasons from 2022 on.

### Identity

- **Which team, which week.** When the player has a Sleeper row for a week, that row's team decides which game is his — this covers past seasons on another team and mid-season trades. Without Sleeper rows, the requested team is used.
- **Sleeper ID.** The browser sends the profile's matched Sleeper ID. When the profile could not match one, the server finds the player by name on the requested team, then by name in the same position group, and returns `sleeperId`.
- **Rank group.** Ranks use Sleeper's position group (`rankGroup`), which can differ from ESPN's — an edge rusher ESPN lists as LB ranks among DL. The page layout still follows ESPN's position.
- **BALLDONTLIE row.** The player's box line is matched by name and team, ignoring generational suffixes ("James Cook" vs "James Cook III").

### Play credit

Plays are credited through Fantasy Live's path — `normalizePlay` → `matchPlayToStarters` → `buildPlayStatDelta` (`src/utils/livePlaysFeed.js`, `src/utils/playByPlay/playStatDelta.js`) — so a play credits the same player, role, and stat delta on both surfaces. The browser scores each play's delta with the connected league's settings (see [[Scoring Call Sites]]).

Dashboard-only additions in `src/utils/playerSeason/playerSeasonGames.js`:

- **Pass defensed on an incomplete pass.** `parseDefensiveActors` reads the gamebook parenthetical after an incomplete pass as a tackle; the gamebook means the defender who broke it up. The builder remaps that credit to a pass defensed (credit and stat delta). Remove this once the shared parser is fixed.
- **QB hits in brackets.** Gamebook "[G.Rousseau]" marks a QB hit. It counts toward pressures for display only and never feeds a fantasy delta.
- **Pressure** is a sack or a QB hit. A split sack counts as half.
- Box-score totals (tackles, solo, TFL, sacks) come from the game's stat line; per-play credit can trail them because assisted tackles are not always named.

## Ranks and opponents

`src/utils/playerSeason/dashboardModel.js` owns the rank metrics per group, the pool rules, and opponent context.

- **Qualified pools** follow the NFL's per-team-game leaderboard rules where one exists (QB 14 attempts, RB 6.25 carries, WR/TE 1.875 catches, K 0.75 field goal tries); defenders need 3+ games and half their team's defensive snaps.
- **All starters** is anyone with one starter-workload game (QB 14+ attempts, RB 10+ touches, WR 4+ targets, TE 3+ targets, any kick attempt, defenders 30+ snaps). The player is always included so his page can show where he sits.
- Ties share a rank.
- **Opponent context** for a game uses the opponent's other games: what a defense allowed to the player's position, or, for defenders, what the opposing offense usually does. Opponent ranks put the easiest matchup for the player first.

## UI rules

- Components live in `src/components/statistics/player/`; non-component helpers (tooltip attributes, the width hook, zone and gap keys) live in `dashboardUi.js` so component files only export components.
- **Tooltips** (`DashboardTip.jsx`): plain text through `data-tip-title` / `data-tip`. Mouse hover follows the pointer; keyboard focus shows it; a touch tap pins it on elements that only carry details, and tapping again, tapping elsewhere, scrolling, or Escape closes it. Elements that act keep acting on tap.
- **Win-probability lines**: hover reads the line; on touch the first tap reads and a second tap at the same spot opens the game.
- **Every play filters** work like radio buttons; Ctrl/⌘-click adds or removes a choice, and on touch screens a Select several switch does the same.
- **Charts draw at their on-screen width** (`useMeasuredWidth`), so labels keep their size on phones and tablets; the field maps spread the five gaps evenly and split gap labels onto two lines below 480px.
- "This player" is the team's mode-aware primary color, lifted for dark mode by `getLegibleTeamColor` (`src/utils/teamVisualTheme.js`), with a readable foreground for text on it.
- Games open in Statistics Scores (`onViewGameStats` with the BALLDONTLIE game ID and a `section`): game cards open Team, plays and win-probability lines open Play-by-Play. In `npm run dev`, Scores starts on its local fixture source, which cannot open live games; pick BALLDONTLIE in its developer source picker to follow these links.
- Rank-strip dots for other players open their Statistics page with a back link to this player.

## Validation

- `tests/unit/playerSeasonDashboard.test.mjs` — pools, ranks, opponent context, play credit (including the pass-defensed remap and suffixed names), and the pools route.
