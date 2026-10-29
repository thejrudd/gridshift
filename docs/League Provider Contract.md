# League Provider Contract

Back: [[Home]] · Routing: [[Where To Edit]] · Plan: [[Independent Fantasy Platform Plan]]

Last updated: 2026-10-29 (Stage 5.2 shared league screens).

Fantasy views read league data through one provider-neutral contract, so the same component can show a Sleeper league or a GridShift league (a league hosted by the separate GridShift fantasy platform API). Sleeper is the default and needs no configuration. The GridShift-league provider is optional: it exists only when `VITE_GRIDSHIFT_PLATFORM_URL` is set, and lists leagues only for a signed-in account that belongs to a league or holds an invite. Core never imports or depends on the platform repository; it only calls the platform's HTTP API.

Status (Stage 5.2): **Standings** (5.0), **Matchups**, **Rosters** with lineup editing, and **League Activity** show a GridShift league through the contract; each is the same screen component for both providers. For a Sleeper league, Standings and Activity render a contract model built by the Sleeper adapter; Matchups and Rosters keep their Sleeper data path unchanged and share their presentational components with the GridShift path. Every other view shows a plain "not available for this league yet" state when a GridShift league is selected, and still reads `SleeperContext` directly for a Sleeper league.

## Rules

- A provider maps its own source into the contract shapes. It never hands another provider's ids, caches, seasons, names, or roster numbers to a view. Sleeper data must never appear in a GridShift league, and the Sleeper path must behave exactly as before.
- Views read capabilities, not provider names. A view that a provider cannot supply shows a plain unavailable state; it never falls back to Sleeper data.
- Copy stays provider-neutral; where a provider has to be named, use `getLeagueProvider(id).label`.
- Row order and seeds come from the provider. GridShift standings keep the platform's tiebreakers; core never re-sorts them.
- Platform-only functions (commissioner area, draft management, live transactions, lineup editing) are capabilities of a GridShift league only.
- One active league: when a GridShift league is selected, every tab follows it (user decision, 2026-10-28). Views not on the contract show a plain centered unavailable state; the Sleeper-only app chrome (season chip, scoring override banner, draft notice, Trade proposal polling, global search's league answers) is off.
- The platform decides every league rule. Core arranges a lineup and saves it immediately (no Save button; user decision 2026-10-29); a refusal rolls the screen back to the lineup the platform last confirmed and shows the platform's message and each violation. Error copy names the platform through `getLeagueProvider(id).label`.

## Files

| File | Owns |
| --- | --- |
| `src/utils/leagueProviderContract.js` | Provider ids, capability names, per-provider `capabilities` (what it supplies) and `consumed` (what core reads through the contract today), JSDoc shapes |
| `src/utils/sleeperLeagueAdapter.js` | Sleeper implementation: pure mapping over data the Sleeper path already loads (`buildSleeperStandingsModel`, `mapSleeperLeagueSummary`). No new requests |
| `src/utils/gridshiftLeagueAdapter.js` | GridShift implementation: pure mappers from platform API responses (`buildGridShiftStandingsModel`, `mapGridShiftLeagueSummary`, `mapGridShiftTeams`, recent form, last final week) |
| `src/api/gridshiftPlatformApi.js` | Platform API client: same-origin requests, uniform `{ error: { code, message } }` handling, off when unconfigured |
| `src/context/LeagueSourceContext.jsx`, `LeagueSourceContext.js` | Which provider the League tab reads; the selected GridShift league (remembered per browser in `gridshift.leagueSource.v1`, ignored when the platform is not configured). `useLeagueSource()` reports the Sleeper path outside the provider |
| `src/hooks/useGridShiftStandings.js` | Loads one GridShift league's Standings into a `StandingsModel` |
| `src/hooks/useGridShiftLeague.js` | GridShift loading for Rosters, Matchups, and Activity: league base (league, teams, weeks, owned players, viewer), week points, matchups and records, lineups, the lineup editor, the activity model |
| `src/utils/gridshiftLineup.js` | Lineup arrangement: slot order and labels, the platform's slot-position rule, offered moves (locks, IR eligibility), optimistic move, refusal text |
| `src/utils/gridshiftActivity.js` | Platform activity feed to `ActivityEntry` rows, settings and lineup diffs, filters |
| `src/components/companion/CompanionMatchup.jsx` | `GridShiftMatchupView` (masthead, pickers, head-to-head rows) beside the unchanged Sleeper view |
| `src/components/companion/CompanionLeague.jsx` | `GridShiftRosterView` and `GridShiftLineup` (lineup slots, locks, IR reasons, real-time editing) beside the unchanged Sleeper roster view |
| `src/components/companion/CompanionActivity.jsx` | One `ActivityView` fed by either provider's `ActivityModel` |
| `src/components/companion/GridShiftLeagueAccess.jsx` | Email-link sign-in, league list, sign out; inside `CompanionConnect` (connect page and league switcher). Renders nothing when unconfigured |
| `src/components/companion/CompanionStandings.jsx` | One `StandingsView` fed by either provider's `StandingsModel` |
| `vite.config.js` | Dev proxy for the platform routes, added only when the variable is set |
| `scripts/dev-platform.mjs` | Development: starts a local platform API and core together |
| `tests/unit/leagueProviderStandings.test.mjs` | Sleeper parity (markup hashes from main at 9c8b5bd), adapter, GridShift mapping from captured platform responses, unconfigured client |
| `tests/unit/leagueProviderScreens.test.mjs`, `tests/fixtures/gridshiftPlatformStage52.json` | Matchups, Rosters, Activity: Sleeper text pinned to main at 0b818b0, lineup rules, GridShift mapping from responses captured from the platform at a236658, both modes rendered |

## Providers and capabilities

| Capability | Sleeper | GridShift league | Read through the contract (5.2) |
| --- | --- | --- | --- |
| `standings`, `activity` | Yes | Yes | **Both providers** |
| `league`, `teams`, `rosters`, `matchups`, `players` | Yes | Yes (platform API) | **GridShift** (Sleeper Matchups and Rosters keep their own data path) |
| `lineupEditing` | No (Sleeper owns it) | Yes | **GridShift** |
| `stats`, `scoring`, `transactions` | Yes | Yes (platform API) | No (week points are read for Matchups and Rosters only) |
| `history`, `brackets`, `draftPicks`, `projections`, `liveScoring` | Yes | No (not served yet) | No |
| `commissioner`, `draft`, `liveTransactions` | No (Sleeper owns them) | Yes | No |

`canUseLeagueCapability(provider, capability)` is true only when the provider supplies it and core reads it through the contract.

## Shapes

Ids are provider-scoped strings and are never compared across providers.

| Shape | Fields | Sleeper source | GridShift source |
| --- | --- | --- | --- |
| `LeagueSummary` | `provider`, `leagueId`, `name`, `season`, `viewerRole` (`commissioner`, `manager`, or null) | `useFantasyLeague()` league | `GET /api/leagues`, `GET /api/leagues/:id` |
| `LeagueTeam` | `teamId`, `name`, `managerName`, `isViewer` | rosters + league users (`getUserDisplayName`) | `GET /api/leagues/:id/teams` |
| `Roster` / `LineupView` (GridShift implemented) | the platform's lineup view as returned: `assignment` (slot type → player ids or null), `lockedPlayerIds`, `irEligiblePlayerIds`, `irEligibility` (`{ eligible, reason, message }`), `rosterLock`; shown as slot sections (`buildGridShiftLineupSections`) with "Left roster" and "Not in lineup" for mid-week changes | Sleeper rosters (unchanged path) | `GET …/teams/:teamId/lineup?week=` (current week from `/weeks`), `PUT` the same path to save, `GET …/player-directory?availability=owned`, `GET …/points?week=` |
| `Matchup` (GridShift implemented) | `id`, `week`, `kind`, `status` (`scheduled`, `provisional`, `final`), `mine`/`opponent` `{ teamId, name, managerName, isViewer, providerPoints, adjustments, total, record }`, viewer on the left; head-to-head rows by slot with week points | `loadMatchups`, `getLiveMatchups` (unchanged path) | `GET …/matchups`, `/standings` (records), `/weeks`, both teams' lineups, `/points?week=` |
| `StandingsModel` (implemented) | `provider`, `status` (`loading`, `error`, `signed-out`, `empty`, `unsupported`, `ready`), `season`, `error`, `retry`, `historical`, `standings` (`season`, `throughWeek`, `playoffTeamCount`, `rows`, `divisions`), `brackets`, `finalPlacements`, `postseason` (`bracket` with first playoff week, or `championship` with its week) | `useLeagueHistoryData()` + `buildSeasonStandings`, `normalizeSeasonBrackets`, `buildFinalPlacements` | `GET /api/leagues/:id`, `/teams`, `/standings` (final results only), `/weeks`, `/matchups` |
| `StandingRow` | `participantId`, `seed`, `teamName`, `managerName`, `wins`, `losses`, `ties`, `recentForm` (up to five, oldest first), `pointsFor`, `pointsAgainst` | as above | platform `rank` is the seed; recent form from final regular-season matchups (adjustments included) |
| `Player` (GridShift implemented) | `playerId`, `name`, `position`, `nflTeam`, `injuryStatus` (canonical label), `game`, `seasonPoints`, `positionRank`, `ownerTeamId`, `sleeperId` (matched core catalog id or '') | Sleeper players DB | `GET …/player-directory?availability=owned&limit=200`; matched to core's catalog by `providerPlayerIdentity.js` for portraits and player pages only |
| `Stats` / `Scoring` (planned) | weekly stat lines in scoring-engine keys; scoring settings; points per player-week | Sleeper weekly/season stats, `activeScoringSettings` | `GET …/points`, `GET …/scoring` (the platform vendors this repository's scoring engine) |
| `ActivityModel` / `ActivityEntry` (implemented) | `status`, `season`, `entries`, `filters`, `hideCommissionerByDefault`; entries keep the `normalizeActivityTransaction` shape and add `tags`, `changes` (`{ label, before, after }`), and `description` for GridShift types `draft`, `adjustment`, `settings`, `league` | `buildSleeperActivityModel` over `buildActivitySeasonGroups` (unchanged output) | `GET …/activity?limit=200`, `/teams`, owned players (`buildGridShiftActivityEntries`) |

## Audit: what each fantasy view reads today

All hooks below come from `src/context/SleeperContext.jsx` (`useSleeper*` are aliases of `useFantasy*`). Direct `src/api/sleeperApi.js` calls are listed separately; they bypass the context and must move behind the provider.

| View (route) | Component | Context fields | Direct Sleeper calls | Status / change needed |
| --- | --- | --- | --- | --- |
| Standings (`/league/standings`) | `CompanionStandings.jsx` | via `useLeagueHistoryData()`: `platform`, `season`, `linkedLeagueHistory` | `leagueHistory.js`: `getLeagueRosters`, `getLeagueUsers`, `getMatchups`, `getWinnersBracket`, `getLosersBracket`, `getLiveLeague` | **On the contract (5.0).** GridShift: no completed-season table, brackets, or final placement yet |
| League History (`/league/history`) | `CompanionHistory.jsx` | `useFantasyStats`: `players`, `loadPlayers`; history hook as above | as Standings plus `getTransactions` | 5.2b. GridShift shows "not available for this league yet" |
| League Activity (`/league/activity`) | `CompanionActivity.jsx` | `useFantasyStats`: `loadPlayers` (catalog only for GridShift); history hook (Sleeper) | `getTransactions` via `leagueHistory.js` (Sleeper) | **On the contract (5.2), both providers.** GridShift adds free agents, waivers, trades, draft, settings (roster lock and freeze included), adjustments, and commissioner roster changes with before/after; lineup and IR-slot moves are not activity (user decision) |
| Matchups (`/fantasy/matchups`) | `CompanionMatchup.jsx`, `useMatchupLiveFeed.js` | `selectedLeagueId`, `league`, `season`, `currentFantasyWeek`, `rosters`, `players`, `loadPlayers`, `weeklyStats`, `seasonStats`, `scheduleMap`, `loadSeasonStats`, `statsBySeason`, `loadStatsForSeason`, `statsLoading`, `activeScoringSettings`, `scoringOverride`, `myRoster`, `getUserDisplayName`, `leagueUsers`, `espnIdOverrides`, `loadMatchups`, `linkedLeagueHistory`, `linkedLeagueSeasonOptions`, stats progress/enhancing | `getLiveMatchups`, `getWeeklyProjections`; `getLeagueHistorySnapshot` (rivalry) | **GridShift on the contract (5.2):** platform matchups, lineups, week points, records; no projections, win chance, live layer, team drilldown, preview, or tale of the tape yet. Sleeper path unchanged |
| Rosters (`/fantasy/rosters`) | `CompanionLeague.jsx` (`CompanionRoster.jsx` is a compatibility wrapper) | `platform`, `season`, `leagueUsers`, `rosters`, `myRoster`, `getUserDisplayName`, `players`, `loadPlayers`, `weeklyStats`, `seasonStats`, `loadSeasonStats`, `statsLoading`, `activeScoringSettings`; picks view: `selectedLeagueId`, `league`, `getTradedPicksForLeague`, `getLeagueDraftsForLeague` | none (through context helpers) | **GridShift on the contract (5.2):** weekly lineup by slot, locks, IR reasons, real-time lineup editing through the platform; Draft Picks tab shows unavailable. Sleeper path unchanged |
| Rankings, incl. the former Waiver view (`/fantasy/rankings`; `/fantasy/waivers` is an alias with the unrostered filter) | `CompanionRankings.jsx` | `players`, `loadPlayers`, `seasonStats`, `weeklyStats`, `loadSeasonStats`, `scheduleMap`, `statsLoading`, `activeScoringSettings`, `scoringOverride`, `scoringOverridePaused`, `rosters`, `leagueUsers`, `league`, `season`, `currentFantasyWeek`, `myRoster`, `getUserDisplayName` | none | 5.2b; there is no separate `CompanionWaiver` component; GridShift shows unavailable |
| Schedule (`/fantasy/schedule`) | `CompanionSchedule.jsx` | `platform`, `selectedLeagueId`, `league`, `season`, `currentFantasyWeek`, `rosters`, `leagueUsers`, `getUserDisplayName`, `myRoster`, `loadMatchups` | none | 5.2b (platform schedule via weeks + matchups); GridShift shows unavailable |
| Injuries (`/fantasy/injuries`) | `CompanionInjuries.jsx` | `platform`, `selectedLeagueId`, `league`, `season`, `seasonSwitching`, `connectLoading`, `nflState*`, `rosters`, `leagueUsers`, `sleeperUser`, `players`, `loadPlayers` | none | 5.2b; GridShift shows unavailable |
| Heatmap (`/fantasy/heatmap`) | `CompanionHeatmap.jsx` | `weeklyStats`, `players`, `rosters`, `scheduleMap`, `activeScoringSettings`, `espnIdOverrides`, `loadPlayers`, `loadSeasonStats`, `statsLoading`, `refreshLiveWeeklyStats`, `league`, `season`, `nflState`, `platform`, `selectedLeagueId` | none | 5.2b; needs player-id mapping (below); GridShift shows unavailable |
| Defenses (`/fantasy/defenses`) | `CompanionDefense.jsx` | `hasLeague`, `season`, `players`, `weeklyStats`, `scheduleMap`, `statsLoading`, `loadPlayers`, `loadSeasonStats`, `activeScoringSettings`, `currentFantasyWeek` | none | 5.2b; GridShift shows unavailable |
| Scoring (`/fantasy/scoring`) | `CompanionScoring.jsx`, `ScoringOverrideBanner.jsx`, `LeagueScoringBadge.jsx` | `scoringSettings`, `activeScoringSettings`, `scoringOverride`, `setScoringOverride`, `clearScoringOverride`, `setScoringOverridePaused`, `league`, `season`, `selectedLeagueId`, `linkedLeagueHistory`, `linkedLeagueSeasonOptions`, `players`, `statsBySeason`, `loadPlayers`, `loadStatsForSeason` | `getLeague` (Sleeper), `getEspnLeague` | 5.2b: platform scoring settings; the local override must not change a GridShift league's official scoring; GridShift shows unavailable |
| Trade (`/trade/*`) | `CompanionTrade.jsx`, `TradeHistory.jsx`, `trade/TradeProposalPanel.jsx`, `CompanionOpportunity.jsx`, `useTradeProposals.js` | `platform`, `rosters`, `leagueUsers`, `myRoster`, `selectedLeagueId`, `league`, `season`, `getUserDisplayName`, `currentFantasyWeek`, `sleeperUser`, `scoringSettings`, pick helpers; stats fields | `getNflState`; server-side Sleeper validation in Trade proposal rooms | 5.2b: analysis reusable; proposals must become platform trades (validated transfers), never Sleeper handoff; GridShift shows unavailable |
| Draft (`/draft/*`) | `DraftAssistant.jsx`, `App.jsx` draft notice | league, rosters, users | `getDraft`, `getDraftPicks`, `getDraftTradedPicks`, `getLeagueDrafts`, `getUserById` | 5.6: platform live draft is separate from the Sleeper observer; GridShift shows unavailable |
| Sub-navigation | `CompanionSubNav.jsx`, `LeagueSubNav.jsx` | none (fixed view lists) | none | 5.2b: filter or mark views by capability; platform tabs (Commissioner, Draft, Team settings) as capabilities |
| App shell | `App.jsx` (gates on `hasLeague`, season chip, league header, league switcher), `Sidebar.jsx`, global search (`utils/globalSearch/answers/standings.js`, `entities/fantasyTeams.js`) | `hasLeague`, `league`, `season`, `linkedLeagueSeasonOptions`, … | `getDraft`, `getLeagueDrafts` | 5.2: one active league across tabs (GridShift league header in the Fantasy and League sub-navigation, Sleeper-only chrome off, unavailable states); the rest follows each view |

Other `SleeperContext` consumers outside the fantasy tab (player profile and stats modals, Compare, Statistics) read players and stats only; they move with the `Player`/`Stats` slice.

## Stage 5.2: what changed

- **Matchups** (`/fantasy/matchups`): for a GridShift league, the week picker (league weeks, current week from the platform), matchup picker, masthead (team names, live or final totals with commissioner adjustments, record and PF/PA from final standings), an adjustment note, and head-to-head rows by lineup slot with the week's provider points. Rows open core's player page only for catalog-matched players.
- **Rosters** (`/fantasy/rosters`): for a GridShift league, the team selector (viewer's team first) and the current week's lineup by slot with Rank (position rank) and Season points from the player directory, the week's points as the metric label, locks, IR eligibility from the platform, a "Left roster" badge in the status column for players traded or dropped after the week's lineup was saved, and a "Not in lineup" section for players added since. The team's manager (or a commissioner, for any team) edits in real time: Move, then a destination; the move shows at once and the whole lineup is `PUT` immediately; later moves queue behind it; a refusal rolls back to the last confirmed lineup, drops queued moves, and shows "GridShift did not accept that lineup change." with the platform's message and violations; warnings and the roster lock show as notes. Draft Picks shows unavailable.
- **League Activity** (`/league/activity`): one `ActivityView` for both providers; Sleeper output pinned to main. GridShift filters: All, Trades, Waivers, Free agents, Draft, Scores, Settings, Commissioner; commissioner changes are shown, not hidden. Lineup changes, including commissioner-set lineups and IR-slot moves, are left out (user decision, 2026-10-29).
- **App shell** (`App.jsx`): a selected GridShift league is the active league on every tab: Fantasy shows its sub-navigation with the GridShift league header (desktop); Rankings, Schedule, Injuries, Heatmap, Defenses, Scoring, Trade, Draft, and League History show "… is not available for this league yet."; the season chip, scoring override banner, Sleeper draft notice, Trade proposal polling, and global search league answers are off; the phone action sheet shows the GridShift league with Switch League.
- Names never wrap (user decision): Matchups player names and masthead team names, League Activity player and team names: one line, ellipsis, full name in `title` (both providers; text unchanged).
- Nothing in `SleeperContext.jsx`, `scoringEngine.js`, or `appRoutes.js` changed.

### Platform gaps found in 5.2 (degraded visibly in core)

- **A started week's saved lineup is not reconciled** (platform change decided, not built yet). After a mid-week trade or pickup, the week's lineup still holds the departed player and leaves the new one in no slot; any save that does not place the new player is refused (`Player … must be in a slot.`). The user decided the platform will auto-fit the lineup on save (departed players removed, newly added players benched). Until it does, core shows the "Left roster" badge and the "Not in lineup" section and lets the manager place the new player; keep that handling working after the platform change.
- **Player directory is per page (`limit` ≤ 200).** Core reads owned players only, so Activity shows players no longer rostered without position or NFL team ("NFL player"); matchups name them from the week's points.
- **No per-player projections, game clock, or play-by-play** for a GridShift league in core, so Matchups has no win chance, projected final, live chart, or tale of the tape.

## Stage 5.0: what changed

- `CompanionStandings` renders a `StandingsModel`. With no GridShift league selected it calls the Sleeper adapter over the same `useLeagueHistoryData()` output; markup is identical to main for current, completed (brackets and final placement), loading, error, empty, and ESPN states (hash-pinned in the unit test). Stage 5.1 then made Standings a design reference screen: current and completed markup now use the flat primitives (re-pinned), their text content is still pinned to main, and loading, error, empty, and ESPN markup are unchanged.
- `App.jsx`: when a GridShift league is selected, the League tab shows that league's header (name, season, Switch) and Standings; History and Activity show "not available for this league yet"; the mobile season chip is hidden on the League tab. Fantasy, Trade, and Draft tabs are unchanged and keep the Sleeper league.
- `CompanionConnect`: the GridShift section appears below the Sleeper connect form and in the league switcher, only when configured. Choosing a Sleeper league clears the GridShift selection.
- Nothing in `SleeperContext.jsx`, `scoringEngine.js`, or `appRoutes.js` changed.

## Development environment

The production-like arrangement is core plus a local platform API (PGlite, console mailer), with the platform's routes proxied through core's dev server so the platform's session cookie is first-party and the platform's Origin rule (`APP_ORIGINS`) simply lists core's origin.

1. Check out `thejrudd/GridShift-Fantasy-Platform` beside this repository and run `npm ci` there.
2. In this repository: `GRIDSHIFT_PLATFORM_DIR=../GridShift-Fantasy-Platform npm run dev:platform`.
   - Starts the platform's `npm run dev` on port **3101** (`GRIDSHIFT_PLATFORM_PORT`; core's own sidecar already uses 3001) with `BASE_URL=http://localhost:5173` and `APP_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`, and core's `npm run dev` with `VITE_GRIDSHIFT_PLATFORM_URL=http://127.0.0.1:3101`.
   - Add `PLATFORM_ADMIN_EMAILS=you@example.test` to create leagues through `POST /api/admin/leagues`. The platform's own `.env` also applies; variables set by the script win.
3. Open **http://localhost:5173** (use this spelling: the sign-in link and cookie use it), go to League or Fantasy, and use "GridShift leagues": enter an email, then open the sign-in link that the platform prints in the terminal (`[mail] To: …`). The link goes through core's proxy, sets the session, and returns to the page.
4. Choose a league. Standings shows it; Switch returns to the league switcher.

Stage 5.2 seed (agent-run, not in either repository): NFL data written to PGlite as below plus one player status on IR and one Questionable and a status sync marked current; then through HTTP a commissioner-run snake draft, schedule weeks 5–8, results for weeks 5–7 (week 7 live), a score adjustment, IR-rule and roster-lock settings changes, a commissioner IR move, free-agent moves, a waiver claim (awarded by running the platform's `processWaivers` with the API stopped), a trade, and a role change.

Seeding: NFL players, games, and stats have no HTTP write path (they come from the platform's data adapter), so a local league needs them written to the platform's PGlite directory first, as the platform's `web/e2e/seed-players.mjs` does. League, members, rosters, schedule, and results are then created through the HTTP API: admin `POST /api/admin/leagues`; commissioner invites and members redeem; `POST …/teams/:teamId/players`; `PATCH …/settings { startWeek }`; `POST …/schedule`; `POST …/results/refresh { week }` for finished weeks. A seeding script belongs in the platform repository.

Proxy details: `vite.config.js` adds one entry, `^/api/(auth|me|leagues|invites)(/|\?|$)`, only when the variable is set. These paths do not overlap the sidecar's routes. `VITE_GRIDSHIFT_PLATFORM_URL` is a URL, not a secret; it is also baked into a production build as an on/off flag, and the browser never calls it directly. `.env` stays untracked; `.env.example` lists the variable commented out.

Production is not set up: a production host would need the same same-origin forwarding (for example nginx `location` blocks for those four prefixes) and `Secure` cookies over HTTPS. See the plan's open decisions.

## Known gaps and risks for 5.1 to 5.2b

- **Player identity.** Core's player-centric views key everything by Sleeper player ids (`players`, `weeklyStats`, ESPN enrichment, KTC values, projections). Platform players are `nfl_player` uuids from Balldontlie. Matchups, Roster, Rankings, Heatmap, and Trade need a cross-provider player identity (or a GridShift-native player and stats source) before they can run on a GridShift league.
- **Scoring.** The platform vendors this repository's scoring engine, so keys agree, but official GridShift points come from the platform (`GET …/points`, results); core must not recompute official results locally, and the local scoring override must stay a what-if.
- **League-tab-only selection.** Resolved in 5.2: the GridShift selection is the one active league for every tab.
- **Season model.** Sleeper league lineage (seasons, renewals) has no GridShift equivalent yet; a GridShift league is one season. A completed GridShift season (final table, championship result) is not modelled.
- **Session and access.** The client reads `GET /api/auth/get-session`; expired sessions show "Sign in to view this league." Invites are counted but cannot be accepted in core yet.
- **Two clients, one origin list.** The platform uses the first `APP_ORIGINS` entry for invite and email-change links (its `web/` pages). With core first, those links point at pages core does not have.

## Decisions (user, 2026-10-29, on the Stage 5.2 report)

- Phone Matchups names stay one line with an ellipsis and the full name in `title` (no change).
- League Activity is for roster adds, drops, and changes, not for moving players in and out of slots: lineup changes, including commissioner-set lineups and IR-slot moves, are not shown. Manager lineup and IR-slot moves and kickoff locks recording no activity is therefore by design, not a gap. Roster-lock and freeze setting changes stay (as settings).
- The platform will auto-fit a started week's lineup on save (departed players removed, newly added players benched); core keeps its mid-week handling working meanwhile.
- Sleeper Matchups and Rosters keep their own data path until 5.2b.

## Decisions (user, 2026-10-28)

- Production uses the same-origin proxy described above.
- One active league: every tab follows the selected league; a view not yet on the contract shows its unavailable state.
- Player identity: GridShift-league players are matched to core's Sleeper-keyed data through `src/utils/providerPlayerIdentity.js` (unique normalized name, canonical NFL team, compatible position family), the same layer `fantasyProjections.js` uses for BALLDONTLIE rows. Unmatched players render without Sleeper-sourced extras; matched ones never import Sleeper league data.
- Account features stay in the platform's `web/`; sign-in is in core.
