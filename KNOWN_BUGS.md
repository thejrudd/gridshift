# GridShift — Known Bugs

Open bugs are listed first, fixed bugs below. Add new entries at the bottom of each section.

---

## Open

| Bug |
|-----|
| Trade section pages still repeat too much instructional copy, making Agent, Intelligence, and Upgrades feel more verbose than necessary |
| Companion → Matchup player projection formula hover can fail to stay open from the `i` control, hiding the projection math before it can be read |
| Statistics player profile career highlights can show 0 TFL for defensive players when ESPN's career aggregate omits tackles for loss even though season-level defensive stats include them |
| Companion → Defense averages round values to the nearest whole number instead of showing the nearest tenth decimal |

---

## Fixed

| Bug | Fixed In |
|-----|----------|
| Desktop sidebar cannot be collapsed — always occupies 240px regardless of available screen width or user preference | v8.0 |
| Draft War Room Big Board and Board can still have post-add overflow or confusing saved-board ranking edge cases | v8.0 |
| Draft War Room Board loses useful Overall sorting controls when switching from position groups to the Overall view | v8.0 |
| Draft Board can drag players into position lanes they are not eligible for | v8.0 |
| Draft Board player cards can compress player identity, photo, and action controls until content overlaps | v8.0 |
| Draft Board still relies on viewport cutoffs and fixed lane widths, causing cramped desktop boards on narrower available content areas | v8.0 |
| Draft live status banner can lose timing usefulness because full pick and traded-pick refreshes are coupled too tightly to the 1-second clock metadata poll | v8.0 |
| Draft live status banner can take 20-30 seconds to catch Sleeper mock draft pause/resume changes because draft-room API responses can be served from stale browser or upstream cache layers | v8.0 |
| Draft War Room stays capped to the normal draft page max-width when the browser is manually zoomed out, leaving unused horizontal space that Draft Board already fills | v8.0 |
| Draft Results loads slowly because it builds the full War Room candidate model before rendering completed picks or the pre-draft order | v8.0 |
| Draft Results stays capped to the normal draft page max-width when the browser is manually zoomed out, leaving unused horizontal space that Draft Board already fills | v8.0 |
| Draft Board roster tray can show raw Sleeper flex slot keys such as `REC_FLEX` and `IDP_FLEX` instead of readable roster-slot labels | v8.0 |
| Draft War Room player rows could fail to open Statistics for players whose Sleeper record had no ESPN id, even when the player could be resolved from their ESPN team roster | v8.0 |
| Draft War Room Big Board rows could drift out of horizontal alignment when metric text changed row width, and Sleeper sentinel-scale search ranks such as 9999999 could render as meaningless rank values | v8.0 |
| Draft War Room Big Board could leave PPG, volume, trend, and schedule fields blank because it did not load a completed-season stats package for Draft intelligence | v8.0 |
| Draft War Room could label Sleeper fallback ranking data as ADP even though Sleeper only provides search-rank style ordering, and LeagueLogs attribution was not shown when market data was displayed | v8.0 |
| Companion → Draft Assistant could visibly refresh back to the loading state on every live-pick polling interval because background polls reused the initial page-loading flag | v8.0 |
| Companion → Draft Assistant availability modeling could treat original draft-slot owners as upcoming pick owners, ignoring traded draft picks when estimating which managers could select a player before the user's next pick | v8.0 |
| Companion → Draft Assistant could stop at a projection-unavailable empty state for normal Sleeper drafts because it only ranked players when season projection totals were embedded in the Sleeper player payload | v8.0 |
| Statistics Standings tab initially appeared before Schedule in the Statistics sub-navigation instead of to the right of Schedule | v7.6 |
| Statistics schedule can horizontally scroll the full page on mobile, and the mobile week rail is missing the documented horizontal scroll arrow cue | v7.5.1 |
| Statistics player profile stat mode toggle was squished on mobile when Game Stats, Fantasy Values, and Visual shared the same row as the explanatory copy | v7.4 |
| Statistics Visual could hang when switching to another season because the historical weekly stats request was cancelled by its own loading-state update | v7.4 |
| Statistics Visual historical seasons could omit opponent team logos and show 0 defense averages because the chart only used the active season schedule map | v7.4 |
| Statistics Visual could replace the filter controls with a no-data/loading card when a selected season had no player stats, trapping users on the empty year | v7.4 |
| Statistics Visual could leave the offense line on stale y-positions after switching one axis to negative fantasy scoring and the other axis to positive game stats | v7.4 |
| Trade Agent selected asset cards used noisy type copy, showing "Player" on player cards and "Draft Asset" instead of the clearer "Draft Pick" on pick cards | v7.4 |
| Heatmap Defense phase can render blank in leagues that roster and score D/ST because the phase aggregates only individual defensive players; Heatmap stat filters can also show categories with no scoring value in the selected league | v7.4 |
| Heatmap Defense phase in D/ST-only leagues still shows an `All` position chip even though D/ST is the only meaningful defensive bucket | v7.4 |
| Heatmap D/ST Fantasy Points drilldown shows only the total points and omits the line-by-line scoring breakdown | v7.4 |
| Trade player cards can show a leading separator before metadata on mobile, making the row read like it starts with a stray dash or bullet | v7.4 |
| Statistics player stat section labels can be unreadable in dark mode when the team border color has low contrast against the dark card background, such as Bills blue on navy | v7.4 |
| Statistics player view Build Trade opens Trade Agent with the target player but does not select that player's fantasy roster, leaving Suggest Adjustment and other partner-aware features without context | v7.4 |
| Statistics Visual Defense Fantasy Points can flatten negative offensive events like QB interceptions to 0, and the visual is missing QB sacks and offensive fumbles as selectable stats | v7.4 |
| Statistics Visual centers zero on both axes even when both plotted series are entirely negative, leaving unused positive y-axis space above the chart | v7.4 |
| Statistics Visual hover card can be clipped by the chart container instead of floating above page content | v7.4 |
| Companion → Defense column headers can show Defense Desc while still sorting teams ascending, and Per Game is not selectable as its own sort header | v7.4 |
| Companion → Defense position changes default the Stat filter to a representative stat instead of the first visible stat chip, so RB opens on Rush Yds instead of Carries | v7.4 |
| Companion → Defense uses section padding, row height, identity font weight, and logo sizing that do not visually align with Rankings, Roster, and Waiver | v7.4 |
| Companion → Defense detail modal uses a missing background token and lets the table behind bleed through the weekly breakdown | v7.4 |
| Mobile NavBar adds a scroll-state separator above the top tab bar, making the frozen header area look visually compressed while scrolling | v7.3 |
| Companion drillable player rows could feel unresponsive because opening a player waited on slower drilldown data without showing a loading indicator | v7.3 |
| Trade Intelligence proposal apply actions could mismatch the displayed package by pairing the incoming target with the wrong outgoing asset, or by adding only one side of the proposal instead of the full deal | v7.3 |
| Trade → Upgrades could suggest unrealistic one-sided upgrades because it underweighted the other roster's actual needs and did not always treat the selected outgoing pool as true payment pressure | v7.3 |
| Trade Intelligence → Use Surplus could combine multiple individually-movable players into one package without rechecking the full package depth, causing explanations to claim playable depth remained after a deal that actually cleared out the position | v7.3 |
| Trade Intelligence → Fix Needs could skew too heavily toward 2-player and 3-player incoming packages, crowding out more balanced player-plus-pick returns on the other team’s side | v7.3 |
| Trade → Intelligence could hard-freeze on initial open, visibly repopulate proposal text/assets after partner switches, or get stuck on the "Preparing partner-specific trade ideas..." loading card for specific teams | v7.3 |
| Companion → Rankings player drilldown `Statistics` action could fail for players whose base Sleeper `espn_id` is null even though the app has a resolved `espnIdOverrides` entry, so some players navigated correctly while others did nothing | v7.3 |
| Trade Intelligence reset the selection area and cleared active filters the first time a new partner was selected, while previously visited partners preserved state, creating inconsistent partner-switch behavior and forcing users to reapply filters | v7.3 |
| Trade Agent "View Roster & Picks" button remained visible even when the roster shelf was present and covered the same functionality | v7.3 |
| Trade Agent mobile roster shelf rendered as a horizontal scrolling strip instead of a vertical list, making it difficult to read and navigate | v7.3 |
| Trade Agent mobile YOU/PARTNER shelf toggle was unresponsive because tap targets were too small to register reliably on mobile devices | v7.3 |
| Trade Agent mobile shelf position filter chips were too small, with chip height and font size not calibrated for mobile touch targets | v7.3 |
| Trade Agent color commentary bar spanned only the right TradePlate instead of extending the full width of both plates | v7.3 |
| Trade Agent Color Commentary appeared when only one side of a trade had assets, producing a verdict before a complete trade package existed | v7.3 |
| Trade Agent player card score value was baseline-aligned with the name text, causing it to overlap the team logo watermark on desktop | v7.3 |
| Trade player/team card treatments had weak visual contrast: player names were too low-contrast in dark mode, while light-mode team color backgrounds were too muted to feel intentional | v7.3 |
| Trade Agent Value Trends dropdown could render empty because cached trade-value details dropped the original KTC trend metadata, and toggling it refreshed Color Commentary text due to render-time randomization | v7.3 |
| Trade → Upgrades result cards could be cut off inside the Give/Get side when the side-by-side result viewport was narrower than the card row's desktop width assumptions | v7.3 |
| Draft picks could change value when applying a Trade → Upgrades proposal into Trade Agent because upgrade pick assets used a separate discount/fallback path from Trade Agent valuation | v7.3 |
| Statistics "more stats" horizontal overflow indicator only pointed right, instead of aligning with the design guidance for scroll direction affordances | v7.3 |
| Trade Agent player selection "Add Player" modal did not follow the Trade section's standard selection-row design, making it visually inconsistent with the rest of Trade | v7.3 |
| Mobile player statistics snapshot sheet could be cut off by the bottom navigation or cramped viewport height, hiding lower stat rows instead of resizing or trimming lower-priority information | v7.3 |
| Player statistics tables let `BYE` cells in the Opponent column scroll horizontally with the stat columns instead of staying frozen with the rest of the Opponent column | v7.3 |
| Trade Agent roster browse modal could crash with `ReferenceError: ROSTER_BROWSE_OFFENSE_POSITIONS is not defined` when opening `View Roster & Picks` for a selected partner | v7.0 |
| Trade Intelligence `0 players` outgoing filtering was too broad: Fix Needs under-surfaced pick-only packages, while Use Surplus exposed an unsupported dead-end 0-player option | v6.2.6 |
| Trade Intelligence explanation text could name a non-traded fallback player from the partner roster without clearly signaling that the player was only remaining post-trade depth, making the write-up read as if extra assets were included in the deal | v6.2.6 |
| Statistics browser on the `v7.0.1` line lost its restored team-card treatment and `darkMode` handoff during the `v7.0` branch split, causing the page to fall back to a flatter team list presentation | v7.0.1 |
| Statistics browser light mode still showed the Rams gradient in the wrong direction and rendered the Jets card with incorrect text contrast after the `v7.0.1` recovery | v7.0.2 |
| Desktop sidebar can still scroll on shorter laptop viewports in Predictions because the shell allows sidebar overflow instead of keeping the desktop rail fixed in place | v6.2.0 |
| Companion -> Roster week-row handoff into Companion -> Matchup could feel laggy and unresponsive, with a noticeable delay before the destination week and player drilldown were ready | v6.2.5 |
| Companion -> Matchup player weekly modal header could truncate the player name behind the Fantasy/Statistics actions instead of growing cleanly with the content | v6.2.5 |
| Statistics player view Trade button could be cut off on mobile and could crash with a `fromGlobalSearch` reference error when tapped | v6.2.5 |
| Sleeper league connect flow only exposes a limited season window and asks for season before username, instead of discovering the account's actual available league years from the API after username lookup | v6.2.0 |
| Statistics excludes kickers from team rosters, search results, and player views because ESPN roster position abbreviations are not normalized to the app's expected `K` format | v6.2.0 |
| Companion → Roster player weekly fantasy modal can omit the player's bye week and instead show fantasy output for every week, even though each player should always have one bye week represented | v6.2.5 |
| Companion → Roster player weekly fantasy modal can render weeks outside the league's fantasy season, including Week 18 even when the league season should stop earlier | v6.2.5 |
| Several modal and sheet overlays still allow background scrolling because they do not use the shared `useBodyScrollLock` hook; confirmed offenders include Companion → Roster `PlayerWeeklySheet`, Companion Matchup overlays, ActionSheet, FavoriteTeamPicker, ScoringSettings, and TeamDetail | v6.2.6 |
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
| Draft capital grid truncated all leagues to 5 rounds — `MAX_ROUNDS` constant capped at 5 regardless of `league.settings.draft_rounds` | v4.8.1 |
| Compare mode showed "Select two players to compare side-by-side" twice — once in CompareStatsPanel, once in CompareTab | v5.0.1 |
| Compare mode stat table sub-header showed "Jr.", "III", etc. instead of last name for players with name suffixes — `.split(' ').pop()` returned the suffix token | v5.0.1 |
| Fantasy panel in Compare mode always showed empty state — Sleeper player DB (`players`) was null at match time; fixed by awaiting `loadPlayers()` before calling `matchEspnToSleeper` | v5.0.1 |
| Compare mode should have all available stats from the Statistics screen in the Stats filter — replaced hand-coded COMPARE_STATS with `getStatRows()` from playerMetrics | v5.0 |
| Fantasy view in Compare mode had null values for everything — `loadSeasonStats()` was never called; dynamic stat sections now cover all scored stat keys | v5.0 |
| Year selector in Compare mode showed all years regardless of player career — filtered to rookie year onwards using `experience` field | v5.0.1 |
| TD/INT ratio null in Compare mode for QBs — `pushVal` rows had `key: null` so per-player lookup failed; added `computeForMap` callback to derive value per player | v5.0.1 |
| TE premium (`bonus_rec_te`) not imported from Sleeper league settings — `importLeagueScoring` filtered it out because it wasn't in `STAT_TO_SCORING_KEY`; TE season pts in Trade picker and KTC multiplier for TE were both unaffected by the league's TE bonus | v5.5.1 |
| Compare → Trade year pill active state used fixed blue accent instead of `var(--color-signature)` | v5.5.7 |
| Trade Agent owner carousel showed native browser scrollbar on desktop | v5.5.7 |
| Companion Roster Season/Avg/G column headers misaligned — Trade button's width was not accounted for in the header row | v5.5.7 |
| Compare → Trade had manual Dynasty/Redraft and 1QB/Superflex toggles — now auto-detected from Sleeper league settings | v5.5.7 |
| Compare Trade analysis said "additional assets" — changed to "additional asset value" | v5.5.7 |
| Build Full Trade button used fixed blue accent instead of `var(--color-signature)` | v5.5.7 |
| Compare → Trade player hero cards used plain fill style instead of Trade Agent card style (avatar, tint, left border, logo) | v5.5.7 |
| Build Full Trade button always enabled even when neither or both compared players were on own roster | v5.5.7 |
| Roster → Trade entry point — player not visible in Trade Agent until KTC data finished loading (~1-2s) | v5.5.7 |
| Compare tabs appeared below player slots instead of at the top like other views | v5.5.8 |
| Compare → Trade value cards duplicated player name/avatar already shown in the player slot headers | v5.5.8 |
| Build Full Trade button greyed out with no explanation | v5.5.8 |
| Roster → Trade: selecting a trade partner after arriving from Roster wiped the pre-populated player (clearTrade reset yourPlayers) | v5.5.8 |
| Their Side player cards in Trade Agent had no team color theming | v5.5.8 |
| Compare Trade value cards separate from player slot headers — KTC value now shown inline in the player hero card, extending it to include the asset value and bar | v5.5.9 |
| Light mode team color borders nearly invisible for teams with light primary colors (e.g. Steelers gold) — border color now darkened by 45% when the team's primary color has high luminance in light mode | v5.5.9 |
| Compare → Trade: KTC value bar/divider lines overlap the team logo watermark in the player hero card — right padding added to KTC extension div | v5.6.0 |
| Beta badge used hardcoded `color: '#000'` which becomes unreadable when a dark team color overrides `--color-signature` — changed to `var(--color-signature-fg)` | v5.6.0 |
| Compare → Trade hero card KTC value shown with divider line and bar — replaced with clean "Trade Value X,XXX" label text | v5.6.1 |
| All active pill filters, tab buttons, and section headers using `var(--color-signature)` as background had hardcoded `#0C0F14` text — unreadable when a dark team color overrides the signature variable. Fixed across 9 files. | v5.6.2 |
| Trade Analysis dynasty window labels (Emerging/Prime/Late Prime/Veteran) used flat age thresholds instead of position-adjusted ones — RBs and QBs were treated identically | v5.6.3 |
| Trade Agent "Your Side" / "Their Side" header text used hardcoded `#0C0F14` when highlighted — unreadable against dark team color overrides | v5.6.4 |
| Draft picks in rounds 4+ had no value in Trade Agent — `MAX_ROUNDS` capped at 5 and KTC has no RDP entries for late rounds; fixed by removing cap and adding late-round decay estimation | v5.6.4 |
| Trade refinement only suggested additions, leading to trade creep — now also suggests removals from the surplus side and swaps on either side | v5.6.5 |
| Draft pick values in redraft leagues used KTC dynasty RDP entries — wildly front-loaded (rounds 4+ near zero) and not calibrated to redraft; replaced with tier-based model derived from KTC redraft player rankings | v5.6.6 |
| Refinement Options "Favors You/Them" label was inverted — "Your Side"/"Their Side" refer to what each party gives, so the surplus giver determines who benefits; logic corrected | v5.6.6 |
| Trade Analysis showed Buy/Hold/Sell signals not applicable to redraft leagues — removed Signal row; replaced with Season PPG and Recent Form rows computed from Sleeper stats | v5.6.7 |
| Compare → Trade Analysis Player Outlook only showed Age — Season PPG/Recent Form required stats that never loaded in Compare tab; fixed by auto-triggering loadSeasonStats + loadPlayers; added Team and Season Rank rows | v5.6.8 |
| Player Outlook had no defense context or weekly ranking data — added Top-10 Wks (weekly positional finishes) and D Split (avg pts vs tough/soft defenses) using heatmap defense table | v5.6.9 |
| Player Outlook Top-10 Wks was an aggregate count with no per-stat detail — replaced with Stat Rankings section showing each player's positional rank per stat category, both shown side-by-side | v5.7.0 |
| D Split was unlabeled and binary (tough/soft) with no position context — redesigned with position-specific sub-header (Pass D/Rush D/WR D/TE D), 3 tiers (Tough/Mid/Soft), and TE combination WR D view | v5.7.1 |
| Player Outlook mixed fantasy and raw stat rows with no labeling — reorganized into Fantasy Performance, Raw Stat Leaders, and Defense Analysis sub-sections | v5.7.1 |
| `bonus_rec_te`, `bonus_rec_rb`, `bonus_rec_wr` not imported from Sleeper — `scoringSettings` was initialized from stale localStorage instead of re-deriving from persisted `league.scoring_settings` on startup; TE premium showed as "None" even when set in Sleeper | v5.7.5 |
| TE/RB/WR per-position reception bonuses not visible in Companion → Scoring — missing from `STAT_GROUPS` | v5.7.5 |
| Position-specific scoring bonuses (`bonus_rec_te`, `bonus_rec_rb`, `bonus_rec_wr`, `bonus_rush_att`) silently skipped in all Companion views, rankings, projections, and Compare except Trade — `calcPoints` was called without position context at 14+ call sites | v5.8.0 |
| `bonus_rush_att` (per-carry bonus) not scored or displayed anywhere — missing from DEFAULT_SCORING, calcPoints, and CompanionScoring | v5.8.0 |
| 9 big-play bonus fields (`bonus_pass_td_40p`, `bonus_pass_cmp_40p`, `bonus_rec_40p`, etc.) not scored, not displayed in Companion → Scoring, and missing from KTC multipliers | v5.8.1 |
| Point values in Companion → Matchup player rows rounded to 1 decimal place instead of 2 | v5.8.1 |
| IDP Hit on QB and Pass Defended not scoring — Sleeper weekly stats use `idp_qb_hit` / `idp_pass_def` but `STAT_TO_SCORING_KEY` only had `idp_qbhit` / `idp_pd` | v5.8.1 |
| Position-specific bonuses silently skipped in `projectPlayer`, `getDefenseStrength`, `getLeagueAvgPPG`, and CompanionDefense Defense Scored — 7 `calcPoints` calls missing the position argument | v5.8.1 |
| Big-play bonus fields (`bonus_pass_td_40p`, etc.) imported from Sleeper under wrong key — Sleeper `scoring_settings` uses short form (`pass_td_40p`) but `calcPoints` looks up `bonus_pass_td_40p`; all 9 big-play bonuses stayed at 0 despite non-zero league settings | v5.8.2 |
| Pick 6 Thrown (`pass_int_td` / `int_ret_td`) missing entirely — not in DEFAULT_SCORING, STAT_TO_SCORING_KEY, or CompanionScoring | v5.8.2 |
| Trade Agent: players absent from KTC redraft rankings (but present in dynasty) showed "—" instead of an estimated value — dynasty fallback existed in `valueSide` but `dynastyKtcPlayers` was not passed to `TradeRosterPicker` or applied to `adjustedDynastyKtcPlayers` | v5.8.7 |
| Dynasty fallback multiplier (35%) produced values far too low relative to directly-ranked players — raised to 60% | v5.8.7 |
| Dynasty fallback applied to raw (unadjusted) dynasty values — `applyKtcMultipliers` was not called on `dynastyKtcPlayers`, so TE premium and other league-specific adjustments were skipped | v5.8.7 |
| Trade Agent "Search All Players" button locked to selected opponent's roster — tapping a team chip set `partnerRosterId`, which changed the button label to "Browse Their Roster" with no way to revert to all-player search | v5.8.7 |
| Trade Agent: adding a player to "Their Side" removed the player from "Your Side" — switching partners reset `yourPlayers` unnecessarily | v5.8.7 |
| Companion → Rankings rank numbers changed during search — rank was derived from filtered list index instead of overall sorted position | v5.8.7 |
| Trade Agent "+Player" on Their Side showed global player search even when a partner was selected — should lock to partner's roster | v5.8.7 |
| Trade Agent: tapping a different team chip showed their roster modal but did not update the selected partner — chip highlight and "+Player"/"+Pick" still targeted the original partner | v5.8.7 |
| Trade Agent: IDP players can show 0 trade value even when they have season production — defensive fallback valuation relied on `seasonStats.gp` that may be missing from aggregated Sleeper IDP stats, and `TradeRosterPicker` did not use the IDP/DST fallback map | v5.8.8 |
| Trade Agent: selected-roster `+ Player` modal can show defensive players as `0` even when the same roster’s `View Roster & Picks` modal shows a non-zero estimated asset value | v5.8.8 |
| Trade Agent: selected-roster `+ Player` modal and `View Roster & Picks` modal do not expose the same player set — some rostered players appear in one view but not the other | v5.8.8 |
| Trade Agent: selected-roster `+ Player` modal lacks the inline `+` multi-add affordance used in `View Roster & Picks`, and sticky section headers in roster modals render partially transparent while scrolling | v5.8.8 |
| Trade Agent: not all players on your own roster appear in the `+ Player` modal — some defensive positions are omitted from the rendered position groups | v5.8.8 |
| Trade Agent: `+ Player` search input can trigger browser autofill/autocomplete suggestions instead of behaving like a plain player search field | v5.8.8 |
| Trade Agent: `Search All Rostered Players` lacks defensive position filter chips for LB / DB / D/ST | v5.8.8 |
| Trade Agent: `Search All Rostered Players` shows projected side totals for players from other rosters even when selecting them would switch partners and replace the current opponent assets | v5.8.8 |
| Trade Intelligence proposal cards could fall out of shared height sync, leaving player and draft-pick cards mismatched within the same package | v6.0.1 |
| Trade → Upgrades Step 2 selected player cards could render at mismatched heights and feel too narrow on desktop, making the selected package look uneven and harder to read | v6.0.3 |
| Trade Intelligence pick-only multi-pick packages could show one draft-pick card plus text chips instead of rendering the full pick package consistently | v6.0 |
| Trade Intelligence player cards could show blank Game Stats for some defensive players such as Myles Garrett, Maxx Crosby, and Montez Sweat even when season production exists | v6.0 |
| Trade Intelligence → Use Surplus could stamp unrelated package shapes with the `Two-Player Swap` label because proposal labeling was derived too narrowly from one side of the trade | v6.0 |
| Trade Intelligence still showed stale `Upgrade Finder` and `Hide` controls inside the standalone Intelligence tab after Upgrades moved into its own Trade tab | v6.0 |
| Trade Intelligence midpoint swap arrow could sit above center on mobile instead of aligning vertically between both sides of the package | v6.0 |
| Trade → Intelligence exposed a stale `View Roster and Picks` entry point that could still mutate Agent selections even though Intelligence no longer owned the manual trade-builder flow | v6.0.4 |
| Trade → Agent pickers closed after a single add instead of supporting the same multi-select flow for your players and picks on both sides | v6.0.4 |
| Trade → Intelligence / Upgrades could still model outgoing player packages even when no outgoing players were selected, contradicting the pick-led search copy | v6.0.4 |
| Trade → Upgrades could keep stale loaded results visible after the selected target, outgoing pool, or pick/posture settings changed, including after removing a selected player | v6.0.4 |
| Trade → Intelligence mixed player-plus-pick packages could collapse draft picks into pill callouts instead of rendering them as full cards | v6.0.4 |
| Trade clickable player-card hover glow is effectively invisible in light mode, so interactive cards do not provide a clear mouse affordance outside dark mode | v6.1 |
| Heatmap Pass Def / QB Hit drilldowns could show "No data found for this matchup" even when the cell had a value because alias stat keys were ignored in the modal path | v6.1 |
| Heatmap team rows changed height when Team sort switched to Conference or Division because the sticky cell only rendered the second metadata line in those modes | v6.1 |
| Matchup team score breakdown modal total could differ from the displayed matchup score because it omitted some scoring mappings and position-specific bonus rows | v6.1 |
| Heatmap → Phase `Defense` with Stat `INT` could render valued grid cells without any heat coloring when all populated cells shared the same value | v6.1.1 |
| Companion -> Waiver grid could collapse after column-sizing changes, stacking metric columns under player content; free-agent rows could render taller than rostered rows and the Season metric could drift out of alignment | v6.1.2 |
| Companion -> Matchup mobile layout could clip header text and overcrowd row metadata because the side headers, shared team-name sizing, center slot rail, and row details did not compress enough on narrow viewports | v6.1.5 |
| Heatmap mobile layout could drag the whole page off-screen horizontally instead of keeping movement contained to the tab strip, filter bar, and grid scroller | v6.1.2 |
| Companion mobile list views could keep using desktop spacing on real iPhone-sized screens, causing Roster / Rankings / League / Waiver rows to truncate names and mis-balance metadata, logos, and action columns | v6.1.5 |
| Matchup slot compare controls could lose their compact-phone affordance on real devices, leaving the position color, compare glyph, and tap target too cramped to read or use reliably | v6.1.5 |
| Companion -> Matchup week picker could expose weeks outside the connected fantasy league's actual season length and did not clearly distinguish playoff weeks from regular-season weeks | v6.1.5 |
| Desktop sidebar could scroll with the full page instead of remaining fixed in place, causing the shell navigation to drift vertically with content | v6.1.6 |
| Companion → Waiver could flash `No Players Found` during initial load before free-agent ranking finished, making the page look idle instead of actively preparing data | v6.3 |
| Companion → Matchup could render side panels before advanced matchup data was ready, causing a piecemeal load and disruptive loading flashes when switching weeks | v6.3 |
| Matchup weather lookups could repeatedly request invalid Open-Meteo endpoints for the selected date, producing console 400s and unnecessary weather fetch batches | v6.3 |
| Statistics team card nickname text cut off vertically (e.g. Vikings 'k' clipped) due to `leading-none` collapsing line-height below Barlow Condensed descenders | v7.0.5 |
| Companion → Matchup drilldown displayed raw Sleeper stat keys (`idp_int_ret_yd`, `idp_sack_yd`, `idp_fr_yd`) instead of human-readable labels for IDP yardage stats — missing from `STAT_LABELS` in `PlayerMatchupBreakdown.jsx` | v7.0.6 |
| Companion → Matchup player drilldown total can differ from the player row score because `PlayerMatchupBreakdown` rebuilds points from raw stat mappings instead of the shared `calcPoints()` engine, omitting position-specific bonus paths and fallback Sleeper point fields | v7.0.7 |
| Trade Intelligence → Fix Needs could return no visible ideas after filtering to `With Picks` because viable pick-inclusive proposals were crowded out by player-only packages before final proposal selection | v7.1.0 |
| Trade proposal cards could keep matching height while still drifting into a too-tall, too-narrow silhouette on desktop because width did not expand enough to preserve a trading-card proportion | v7.1.0 |
| Trade Agent roster shelf picks view not implemented — shelf only showed players, so draft picks owned by each roster were not accessible from the shelf | v7.1.0 |
| Trade Agent partner selection used a horizontal scrolling carousel instead of a dropdown menu, making it hard to find specific partners in larger leagues | v7.1.0 |
| Trade Agent BroadcastScoreboard header appeared washed out in dark mode because it used a light-resolving label color as its background | v7.1.0 |
| Trade Agent roster shelf missed K and IDP position filter chips, so kickers and defensive players could not be isolated | v7.1.0 |
| Trade Agent drag-and-drop from roster shelf to trade plates was not implemented; shelf items were tap-only with no drag affordance | v7.1.0 |
| Trade Agent BroadcastScoreboard showed `YOU` as the user-side team name instead of the connected user's actual display name | v7.1.0 |
| Trade Agent BroadcastScoreboard displayed redundant `HOME · YOU GIVE` / `AWAY · YOU GET` secondary labels above team names | v7.1.0 |
| Companion shared player rows could render low-contrast overlay labels on team gradients: Matchup score values, player status badges, and Rankings `ROSTERED` labels used fixed start/end row contrast instead of measuring the label's actual rendered position across desktop and mobile gradients | v7.3 |
| Companion → Rankings team logos were horizontally misaligned between rostered and unrostered rows because the `ROSTERED` label conditionally occupied space in the same status/logo cluster | v7.3 |
| Companion → Waiver player rows could collapse identity text into the avatar column when a player headshot failed to load, because the shared row removed the broken avatar image from the grid instead of preserving the avatar cell with a fallback | v7.3 |
| Companion → Matchup bye-week rows displayed both `Bye Week` and `0.00` points, duplicating the inactive-week state instead of showing only the bye badge | v7.3 |
| Companion → Roster player names could truncate in team-colored rows instead of preserving the full player identity as the highest-priority row content | v7.3 |
| Mobile Statistics game logs reserved too much fixed width for the Result column, leaving excessive blank space before the first stat column in both normal stats and More Stats | v7.3 |
| Companion player drilldowns from a 2026 league opened Statistics in Fantasy Values mode while the expanded stats accordion stayed on the app's default 2025 season, so the view incorrectly showed "No fantasy values are available for this season" instead of opening the selected league year | v7.3.2 |
| Companion → Statistics historical weekly rows could disappear after changing league years because an empty game-log response could be reused from cache, pushing the table away from its ESPN Team/Opponent/Result data | v7.3.2 |
| Companion player drilldowns and direct Statistics player routes could resolve different player metadata, causing Companion-opened pages to miss weekly game logs when the Sleeper player had no current team; Statistics search also omitted free agents and recent retirees because it only searched current ESPN rosters | v7.3.2 |
| Companion Matchup, Rankings, and Waiver could show misleading empty controls or terse "No players found" states before Sleeper schedules and season stats were published | v7.3.2 |
| Mobile PWA top content could render underneath the frozen NavBar/sub-navigation rows on real iPhones, hiding the first items in the scrollable area even though desktop mobile emulation looked correct | v7.3 |
| Companion mobile horizontal scroll cue arrows could let tab text show underneath the cue because the cue did not cover the full-bleed scroll rail edge | v7.3.1 |
| Companion Heatmap mobile filter chips started at uneven horizontal positions because only Phase/Position reserved a fixed label column and Result was pushed to the right | v7.3.1 |
| Companion Heatmap mobile filters consumed too much vertical space, leaving the heatmap itself crowded below the controls | v7.3.1 |
| Statistics Visual filter chips could crowd together on mobile because the season/stat/mode controls and scale selector stayed split into left and right header groups instead of stacking | v7.4 |
| Companion → Defense ranks most-allowed defenses as #1 and keeps the summary copy static when filters or sort order change | v7.5 |
| Predictions Choose Record can allow impossible division records, including every team in a division reaching 4-2 | v7.5 |
| Predictions Choose Record can allow an impossible overall/division combination, such as 17-0 overall with 0-6 in the division | v7.5 |
| Predictions Choose Record does not propagate forced wins or losses to affected opponents when selecting an undefeated or winless record | v7.5 |
| Predictions right-rail Live Seeds populates playoff teams before any records have been entered | v7.5 |
| Predictions right-rail Live Seeds fills remaining seed slots with unentered teams after the first record is entered | v7.5 |
| Predictions Advanced Mode team header only shows the team gradient on hover instead of at rest | v7.5 |
| Predictions Advanced Mode team header record does not live-update while staged Game Picks are being edited | v7.5 |
| Predictions Advanced Mode can crash when rendering the placeholder bye week row because the row has no game id | v7.5 |
| Predictions Advanced Mode bye week label is not horizontally aligned with opponent team abbreviations | v7.5 |
| Predictions Choose Record rows can overlap team identity, record status, and steppers on narrower laptop viewports | v7.5 |
| Predictions Choose Record stepper pills can stretch too wide when rows switch into their narrower responsive layout | v7.5 |
| Predictions Advanced Mode team rows lack a clear hover affordance even though the rows are clickable | v7.5 |
| Companion scoring preview Hold toggle can reset Companion tab scroll position to the top, making Rankings jump while comparing scoring systems | v7.5 |
| Predictions Playoffs tab populates the bracket before any team records have been selected | v7.5 |
| Predictions Choose Record Division stepper is coupled to Wins and can auto-fill division wins instead of letting users adjust Division directly | v7.5 |
| Statistics player profiles can show the 2026 season before any 2026 stats have been recorded | v7.5 |
| Statistics Visual is only enabled for the most recent displayed season, so players whose newest displayed year has no stats cannot use Visual for their latest stat-bearing season | v7.5 |
| Statistics Visual is unavailable without a connected fantasy league even though Game Stats visualizations can run without league scoring | v7.5 |
