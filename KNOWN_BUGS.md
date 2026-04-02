# NFL Predictor — Known Bugs

Open bugs are listed first, fixed bugs below. Add new entries at the bottom of each section.

---

## Open

| Bug |
|-----|
| Trade Intelligence proposal apply actions can mismatch the displayed package by pairing the incoming target with the wrong outgoing asset, or by adding only one side of the proposal instead of the full deal |
| Trade → Upgrades can appear unresponsive after clicking "Find Matches" because the results state is not surfaced clearly enough and the returned matches may render below the fold with little immediate feedback |
| Trade → Upgrades can still suggest unrealistic one-sided upgrades because it underweights the other roster's actual needs and does not always treat the selected outgoing pool as true payment pressure |
| Trade → Upgrades and Trade Intelligence proposals can diverge from Agent's displayed asset values because the opportunity engine still uses a separate player-value proxy instead of the shared Trade valuation model |
| Trade Intelligence lacks a `0 players` package filter and still under-surfaces pick-only or pick-heavy alternatives even when equivalent draft-capital offers should be possible |
| Trade Intelligence → Fix Needs can return no visible ideas after filtering to `With Picks` because viable pick-inclusive proposals are often crowded out by player-only packages before the final proposal set is chosen |
| Trade Intelligence → Use Surplus can combine multiple individually-movable players into one package without rechecking the full package depth, causing explanations to claim playable depth remains after a deal that actually clears out the position |
| Trade Intelligence → Fix Needs can skew too heavily toward 2-player and 3-player incoming packages, crowding out more balanced player-plus-pick returns on the other team’s side |
| Trade section pages still repeat too much instructional copy, making Agent, Intelligence, and Upgrades feel more verbose than necessary |
| Trade proposal cards can keep matching height while still drifting into a too-tall, too-narrow silhouette on desktop because width does not yet expand enough to preserve a more realistic trading-card proportion as card content grows |
| Companion → Roster player weekly fantasy modal can omit the player's bye week and instead show fantasy output for every week, even though each player should always have one bye week represented |
| Companion → Roster player weekly fantasy modal can render weeks outside the league's fantasy season, including Week 18 even when the league season should stop earlier |
| Companion -> Roster week-row handoff into Companion -> Matchup can feel laggy and unresponsive, with a noticeable 1-2 second delay before the destination week and player drilldown are ready |

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
