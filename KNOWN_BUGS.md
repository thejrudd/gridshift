# GridShift — Known Bugs

Open bugs are listed first, deferred work next, fixed bugs below. Add new entries at the bottom of each section.

---

## Open

| Bug |
|-----|
| *(No open bugs currently assigned to v8.9.1.)* |

---

## Fixed

| Bug | Fixed In |
|-----|----------|
| Trade Agent draft-pick cards and values could imply a projected slot even though Sleeper only guarantees a future pick's year and round, causing redundant metadata and taller selected cards. | v8.9.1 |
| The desktop sidebar did not show an unread notification glyph on Trade when Proposals contained unread updates. | v8.9.0 |
| Trade Proposals continued showing a live expiry countdown after a proposal was accepted or declined instead of preserving the terminal event time. | v8.9.0 |
| Trade Agent selected player cards could truncate or obscure team, rank, and average metadata, or wrap optional estimate text onto a third line, when the row's fixed controls left limited identity space. | v8.8.3 |
| Before the active NFL season recorded production, IDP players received a trade value of 0 because KTC has no IDP market data and GridShift's generated IDP values only read the empty active-season stats package. | v8.8.3 |
| Prediction playoff seeding is calculated independently by the picker, snapshot validator, and share-card renderer with conflicting tied-record ordering, so a visibly valid AFC or NFC wild-card winner can be rejected as not belonging to that matchup. | v8.8.2 |
| Prediction JSON exports omit playoff picks, while importing a record-only file silently preserves the browser's existing bracket, allowing newly imported seeds to be combined with stale winners that are not in their matchups. | v8.8.2 |
| Device Sync setup can appear independent between Draft and Predictions because Sleeper identity hydration or account switching can overwrite or erase the shared locally stored device credential before the paired user's token is restored. | v8.8.1 |
| Prediction Share Cards can render without NFL team logos, leaving team identity incomplete in the visible card and downloaded image. | v8.8.1 |
| Prediction Share Card PNG downloads are reconstructed by `html2canvas` instead of capturing the rendered card faithfully, causing collapsed, overlapping layouts that do not match the in-app preview. | v8.8.1 |
| Prediction Share Cards can say “Complete the playoff bracket” even after picks are present, because the export uses a separate readiness flag instead of validating the exact records and playoff selections it will encode. | v8.8.1 |
| “Complete Regular Season To Share” incorrectly requires every Advanced Mode matchup when Advanced Mode is selected, instead of becoming available when all team records are complete. | v8.8.1 |
| Predictions sidebar progress mixes aggregate record slots with canonical Advanced Mode matchups, allowing a completed-looking record slate to show values such as 31/32 teams and 263.5/272 games. | v8.8.1 |
| Predict Record allows league-wide win totals that cannot balance against the 272-game NFL schedule, such as assigning all 32 teams nine wins, without preventing or clearly identifying the impossible season. | v8.8.1 |
| Changing a manual 17–0 or 0–17 prediction back to a non-perfect record can preserve its forced 17 Advanced Mode results and mirrored opponent picks, leaving records and matchup-level data inconsistent. | v8.8.1 |
| Fantasy Roster player availability designations can retain the wrong foreground contrast after switching between light and dark mode, making status text unreadable on some team gradients. | v8.8.0 |
| Fantasy Scoring's league-year model control no longer applies a selected year's rules across Fantasy, preventing managers from evaluating one results season with another linked league year's scoring. | v8.8.0 |
| Fantasy Rankings image exports identify the active scoring model but omit the NFL-stat season used to calculate the rankings. | v8.8.0 |
| Some players aren't searchable in Statistics Stats, for example Najee Harris. | v8.8.0 |
| Predictions playoff reseeding can send the wrong wild-card winner to the No. 1 seed after an upset, causing the interactive bracket and any exported full-bracket image to show an invalid divisional matchup. | v8.8.0 |
| Prediction share-card readiness can remain stuck on “Complete Picks To Share” after every regular-season matchup has been filled. | v8.8.0 |
| Randomize Predictions fills regular-season predictions but leaves the playoff bracket empty, preventing the randomized season from becoming share-ready. | v8.8.0 |
| Prediction share-card studio controls use nested rounded containers, uneven control padding, and clipped header/identity text at desktop display sizes. | v8.8.0 |
| Division Winners share cards allow team records to overflow below their division tiles. | v8.8.0 |
| Full Bracket share cards overlap conference rounds, team rows, and the Super Bowl champion banner in exported images. | v8.8.0 |
| Playoff Seeding share cards allow some team logos to exceed the vertical bounds of their seed rows. | v8.8.0 |
| Predictions Sync cannot reach the server because production nginx and the local Vite proxy omit `/api/predictions-sync/`, returning the SPA instead of JSON; initial pairing must seed from the code-generating authoritative device before the joining device reads and retries, must not ask the user to choose initial authority, routine local-first saves should not interrupt each pick with a sync message, and ongoing propagation should match Draft Sync rather than waiting on a 12-second poll. | v8.8.0 |
| Focusing the Device Sync pairing-code input on mobile can trigger browser auto-zoom because the field renders below the 16px mobile input floor. | v8.8.0 |
| Device Sync “Cancel setup” revokes the generating device token but does not invalidate its pending one-time pairing code, allowing that code to remain claimable until it expires. | v8.8.0 |
| Device Sync presents both “Revoke device” and a local-only disconnect action, even though the latter leaves an unused but still-valid credential authorized on the server. | v8.8.0 |
| Draft Sync's setup dialog did not expose the pairing-code field for the device joining an existing synced draft plan, and generated-code setup had no clear way to cancel back to the unpaired choices. | v8.7.0 |
| Draft Board hid the remove control after a saved player was drafted by another manager, leaving the stale target on the board with no visible way to clear it. | v8.7.0 |
| The live draft banner clock renders long slow-draft pick timers as minutes-only (e.g. 419:25), overflowing its clock cell on laptop widths instead of formatting as HH:MM:SS, and the banner does not scale responsively to the viewport it is displayed on. | v8.5.1 |
| Draft Results can show the Projected Selection as unavailable ("Waiting for draft model") while Draft Board simultaneously projects a player, and the projected player can be one who is not available in the draft — already rostered in dynasty leagues, or excluded by the Sleeper draft player pool (rookies-only, vets-only, or all players). | v8.5.1 |
| Fantasy Rankings season fantasy points can disagree with the Statistics Stats drilldown for the same player, league, and season (e.g. Matthew Stafford 2025: 291.0 in Rankings vs 293.98 in Statistics against a true score of 290.98), indicating the Statistics fantasy-value path computes points differently from the league scoring used by Rankings. | v8.5.1 |
| On iOS installed as a PWA, the device's rounded display corners cover the bottom-left and bottom-right of the bottom navigation bar because the bar's content does not account for the corner safe areas. | v8.5.1 |
| Statistics Scores mobile portrait scorebug does not keep each team's score on its respective side of the matchup layout. | v8.5.1 |
| Statistics Scores allows horizontal page scrolling on mobile even when no content extends beyond the viewport; the vertically-aligned page should be fixed-width and scroll only vertically. | v8.5.1 |
| Statistics Scores drilldown game metadata (stadium, broadcast channel, and date) has insufficient contrast against the team-gradient background. | v8.5.1 |
| QB first downs can be double-counted in leagues that score them because Sleeper weekly rows already carry `bonus_fd_qb` as a count that is scored directly, while `scoringEngine.js` also adds `(pass_fd + rush_fd) × bonus_fd_qb`. | v8.5.1 |
| Fantasy Rosters' Season and Avg/G column headers overlap each other on phones and are not centered over the values they label. | v8.5.1 |
| Fantasy Rosters renders a player's availability designation (Questionable, IR, PUP) to the right of the season and average values, so rows with a designation shift those values left and break column alignment against rows without one. | v8.5.1 |
| Draft Board player cards truncate the position/team line and availability badge to bare ellipses as the Available rail or a lane narrows, because the identity/meta column had no minimum width and the availability badge's compact mode was gated to a phone-width media query instead of the card's own (much narrower) container width. | v8.5.1 |
| Draft War Room reported nearly every player as "Neutral schedule": the schedule index was tiered against fixed 92/108 cutoffs, but averaging a slate of opponents compresses all 32 teams into roughly 95–105, so no team could reach either cutoff. | v8.5.1 |
| Draft War Room derived a player's upcoming opponents from the prior season's schedule map — the same package as the prior-season defensive stats — so a 2026 draft was graded against each team's 2025 opponents. | v8.5.1 |
| Draft War Room's schedule signal always read the first six weeks of the schedule regardless of the current week, so an in-season draft was graded on games that had already been played. | v8.5.1 |
| Draft War Room's Draft Rating gave the schedule component no default weight, so schedule never influenced player rankings unless a user raised the slider manually. | v8.5.1 |
| Statistics player drilldown Fantasy Values shows NFL weeks the connected league never plays a matchup in (e.g. week 18 in a 17-week league), because the fantasy week ceiling was floored at 18 instead of being derived from the league's matchup schedule. | v8.5.1 |
| Statistics Scores can keep Hall of Fame Weekend marked as the current preseason slate until Preseason Week 1's evening kickoff, instead of advancing at the start of the new slate's calendar day. | v8.5.0 |
| Statistics Scores' conditional “This Week” toolbar control disappears and reappears while switching between Regular and Preseason, shifting the season controls. | v8.5.0 |
| Statistics Scores can classify BALLDONTLIE's January regular-season games as preseason and group them under Hall of Fame Weekend when game rows do not include an explicit season type. | v8.5.0 |
| Statistics Scores uses different preseason week labels for ESPN and BALLDONTLIE, making the week rail change from “Pre Wk 1” to “P1” when switching sources. | v8.5.0 |
| Statistics Scores can trail live action because its 30-second browser polling compounds with a 30-second server cache, while BALLDONTLIE live rows whose state is provided through `status_state` can be misclassified as scheduled. | v8.5.0 |
| Statistics Scores disables the game drilldown for every preseason scorebug, including BALLDONTLIE games with a valid provider game ID, and its detail fetch incorrectly depends on a separate Fantasy Live session. | v8.5.0 |
| Statistics Scores' real-data drilldown can show an empty box score and play feed for valid BALLDONTLIE preseason games because detail requests omit `season_type=1` and the client only wires play rows instead of the provider's game, team-stat, and player-stat responses. | v8.5.0 |
| Statistics Scores can render duplicate weekday sections and place Friday games under Thursday because it groups games by the kickoff's UTC date while labeling the section in the viewer's local calendar; active games also inherit a weekday heading instead of a dedicated Live section. | v8.5.0 |
| Statistics Scores can treat a reverse-ordered BALLDONTLIE play response as chronological, causing Latest Play and the play feed to disagree about the game's final play. | v8.5.0 |
| Statistics Scores' ESPN developer source can still open game drilldowns when a server-side BALLDONTLIE key exists, so the forced source does not faithfully represent ESPN-only or no-key behavior. | v8.5.0 |
| Statistics Scores can offer game drilldowns before kickoff even though scheduled games do not yet have meaningful box-score, scoring, or play-by-play detail. | v8.5.0 |
| The What's New tour could reload the current route when advancing because its navigation buttons did not declare a non-submit button type, interrupting the historical tour. | v8.4.1 |
| Fantasy Scoring could report that prior-season production was unavailable even when the connected Sleeper league had a linked previous season with enough data to calculate Position Strength. | v8.4.1 |
| Fantasy Live could derive its “current” week from a league's last scored matchup, so offseason and other inactive periods remained stuck on a stale week and showed provider-specific missing-matchup copy instead of explaining that no fantasy matchup was active. | v8.4.1 |
| Fantasy Live's red status pulse followed whether a live-data browser session was enabled instead of whether the selected fantasy matchup had a starter-relevant NFL game currently in progress. | v8.4.1 |
| The What's New tour E2E gate can exit before Playwright starts because the dev launcher still sets retired `ESPN_API_*` host/port variables while the API server reads `GRIDSHIFT_API_*`, causing the test sidecar to collide with the default port. | v8.4 |
| Fantasy Scoring's “See it scored” curated player samples can render initials instead of player photos because several samples omit their ESPN player IDs. | v8.4 |
| Fantasy Scoring crashes while rendering because `CompanionScoring` uses `CompanionSelectorRail` without importing the shared component. | v8.4 |
| Statistics Scores matchup rails normalize each team independently and mute one side, so the bar lengths do not represent each team's share of the measured metric and the team colors are unclear. | v8.4 |
| Statistics Scores drilldown content can paint through the transparent offset above the sticky section tabs while scrolling. | v8.4 |
| Statistics Scores drilldown sticky-tab shield can paint over the scorebug hero before the tabs become sticky, leaving only the team-gradient edge visible. | v8.4 |
| Statistics Scores' regular-season year selector changes only the displayed season label while continuing to show the same synthetic fixture slate, making historical seasons such as 2025 inaccurate. | v8.4 |
| Fantasy Scoring's league summary can omit tight-end premium rules, report team defense as active when only D/ST special-teams rules score, and incorrectly group kicker scoring under Special Teams. | v8.4 |
| Fantasy Scoring's “See it scored” can reuse the same curated player on every page load; each load should vary its eligible, nonzero-value player samples without requiring a manual refresh control. | v8.4 |
| Fantasy Scoring's “See it scored” special-teams sample can show an individual returner even when the selected league awards those points to the team D/ST. | v8.4 |
| The expanded desktop sidebar can clip lower utility options and the version on shorter laptop screens because its fixed spacing exceeds the viewport height while overflow is hidden. | v8.4 |
| Fantasy Scoring can label Special Teams as generally active without clarifying that return touchdowns and blocked kicks apply only to rostered individual players when the league has no D/ST roster slot. | v8.4 |
| Fantasy Scoring's “See it scored” can show team special-teams examples and a Defense tab even when the league has no D/ST roster slot. | v8.4 |
| Fantasy Scoring's Detailed Scoring “Active” filter can show Team D/ST rules even when the league has no D/ST roster slot. | v8.4 |
| Fantasy Live's pace chart draws a straight two-point line with no selectable scoring milestones, because it plots the sparse persisted win-probability history instead of the matchup's own scoring plays. | v8.4 |
| Fantasy Live can restore an expanded scoring play and scroll back to its feed position after leaving a matchup and later returning, because chart/feed selection state persists across matchup navigation. | v8.4 |
| Fantasy Live demo scoring can omit Monday-night data points because mock play generation inherits the real play-by-play eight-game request cap and can drop the latest relevant game. | v8.4 |
| Fantasy Live's pace chart moves vertically while interacting with scoring milestones because the player-name readout changes the chart header's layout height as it appears and disappears. | v8.4 |
| Fantasy Live matchup selector chips can size unevenly and let long team names or scores overflow their borders. | v8.4 |
| Fantasy Live's desktop pace chart stays at a shallow fixed height and stretches partial-week scoring across nearly its full width instead of filling the fixed week timeline as games are played. | v8.4 |
| Fantasy Live stacks the pace chart and play feed into one sticky vertical sequence on desktop, preventing both surfaces from remaining visible together and making document/feed scrolling compete. | v8.4 |
| Fantasy Live can display an exact 100% win probability while starters still have games remaining, allowing an unfinished matchup to appear decided even when the projected winner can still lose. | v8.4 |
| Fantasy Live can double-count projected output when a starter already has points but the live provider omits or does not recognize that player's game state. | v8.4 |
| Fantasy Live commissioner score adjustments can be omitted from in-progress win probability and then appear abruptly in the reconciled final result. | v8.4 |
| Fantasy Live replay can reconstruct earlier scores and odds using the current endpoint total and one shared progress value, allowing later information to influence a rewound moment. | v8.4 |
| Fantasy Live can retain stale scheduled-game completion metadata because current-season schedule rows are cached as if they were permanent historical results. | v8.4 |
| Fantasy Live can remain projected after the entire week ends when a starter has no current NFL team and therefore cannot be matched to a game or bye. | v8.4 |
| Fantasy Live can briefly apply a late stats response from the previously selected matchup after the user navigates to another matchup. | v8.4 |
| Fantasy Live can omit the settled replay point for a final tie when the preceding unsettled snapshot was also 50%. | v8.4 |
| Fantasy Live's pace chart can scale beyond its own panel and paint over the performer rail and matchup hero when the rendered SVG width diverges from its measured intrinsic size. | v8.4 |
| Fantasy Live's local demo can accumulate fabricated play estimates above 400 points before dropping to the authoritative score near 160 at the live endpoint. | v8.4 |
| Fantasy Live's pace chart includes the opponent's scoring timestamps in each team's path, creating flat kinks that make direct score-to-score lines look stepped. | v8.4 |
| Fantasy Live's pace chart hides dots for scoring changes below the milestone threshold, including small negative scores, even though scrubbing still changes the displayed total at those points. | v8.4 |
| Statistics Schedule classifies every preseason game as International and PrimeTime, so those filters remain selectable even when the preseason slate has no matching games. | v8.4 |
| Fantasy Live's pace chart can leave trailing score dots off their team's connecting line, while its tracking line jumps between the nearest event X positions instead of following the pointer and snapping only when the pointer is close to a score dot. | v8.4 |
| Desktop Edge could revert a Fantasy Matchups picker selection to the previously displayed matchup after closing the picker. | v8.3.1 |
| The What’s New tour test could ignore its dedicated API port when a local `.env` defined `PORT`, causing its ESPN sidecar to exit during startup. | v8.3.1 |
| Companion Activity timeline entries can paint through the transparent sticky offset above the filter chips while scrolling. | v8.3.0 |
| Sleeper League History standings and playoff brackets omit commissioner `custom_points` adjustments, so displayed totals can diverge from Sleeper. | v8.3.0 |
| Companion Standings drops visual bye slots from uneven Sleeper Toilet Bowls, orders loser-advances branches like a winner bracket, and detaches championship placement games into an unwanted standalone bracket. | v8.3.0 |
| Desktop typography and control density do not scale coherently across 1080p, 1440p, high-DPI, and browser-zoomed displays, leaving meaningful metadata too small and wide layouts difficult to scan. | v8.3.0 |
| The v8.3 What's New tour skips League History and Standings steps when those views are loading, unavailable, or have no completed data because their empty-state wrappers do not provide the required tour anchors. | v8.3.0 |
| Mobile League Standings playoff brackets can scroll horizontally without showing directional arrow cues. | v8.3.0 |
| League Activity labels offseason Sleeper transactions as Week 1 because Sleeper uses transaction leg 1 before the NFL regular season begins. | v8.3.0 |
| League History rivalry bars reserve visible space for a winless team, so undefeated series such as 3–0 do not fully fill toward the winning side. | v8.3.0 |
| Mobile bottom-navigation labels use the condensed display font instead of the established Figtree UI font. | v8.3.0 |
| League History record tiles shift upward by two pixels on mouse hover. | v8.3.0 |
| League History record values do not share a consistent horizontal baseline when tile labels or details wrap to different line counts. | v8.3.0 |
| Historical Sleeper Draft Results attribute picks to a roster's replacement owner instead of the draft pick's preserved `picked_by` user, conflating managers after mid-season ownership changes. | v8.3.0 |
| Sleeper roster changes could remain stale in GridShift after commissioner drops, adds, trades, or reserve/taxi updates because persisted rosters were not revalidated while a league remained connected. | v8.2.2 |
| On mobile Draft Board, expanded Available Players could overlap board position filters, fail to scroll, and leave unused space above My Roster. | v8.2.2 |
| The What's New Draft tour could describe a historical league year as though the user's current draft had already started, without naming the selected year, current league year, or selected draft phase. | v8.2.1 |
| Draft Results could appear to hang when switching from a historical league year back to the current league year because completed historical picks were rebuilt against the new season before its league snapshot loaded. | v8.2.1 |
| Switching from the current-year Draft War Room to a historical league year briefly showed the unavailable message, then automatically redirected to Draft Results instead of keeping War Room selected and revisitable. | v8.2.1 |
| Trade History can label pre-season trades as Week 1 because Sleeper's transaction leg does not distinguish pre-season timing. | v8.2.0 |
| Trade History season rows can paint through the transparent sticky offset above the locked search and manager filters while scrolling. | v8.2.0 |
| The What's New tour spotlight can repeatedly reset to its full-screen resolving scrim, making the Trade History step flash for a single frame every few seconds. | v8.2.0 |
| Multi-version feature tours can show an obsolete earlier feature beside its later replacement, producing contradictory bullets and invalid tour steps. | v8.2.0 |
| Mobile Companion player preview could time out on "Open Full Statistics" because the already-resolved player metadata was discarded and the full Statistics route started a second asynchronous player lookup | v8.1.1 |
| Trade section pages repeated too much instructional copy, making Agent, Intelligence, and Upgrades feel more verbose than necessary | v8.1.0 |
| Companion → Matchup player projection formula hover could fail to stay open from the `i` control, hiding the projection math before it could be read | v8.1.0 |
| Companion Live could obscure matchup context through abbreviated team names, provider-specific fallbacks, win-share presentation, season-vs-week PF/PA, unclear Starter Swing axes, misplaced chevrons, missing images, and empty Sleeper-backed stat details | v8.1.0 |
| Companion Live player drilldowns could miss NFL game context, show unclear or redundant labels, overlap hero controls, over-frame photos, lack player/team hero treatment, and show the wrong matchup record season | v8.1.0 |
| Companion Live could show a starter as "Bye week · No NFL game" despite having weekly stats and fantasy points | v8.1.0 |
| Companion desktop subnav could overlap league switcher controls at approximately 1280px widths | v8.1.0 |
| Draft War Room "Expand chart" could crash because `FullscreenScatter` used `axisOptions` without receiving it as a prop | v8.1.0 |
| Draft War Room Big Board sort header was hidden on mobile, leaving users without sort controls | v8.1.0 |
| Companion → Roster player preview sheet used a misplaced square close control instead of a circular close inside the hero | v8.1.0 |
| Companion → Roster player preview sheet left a dead band below "Open Full Statistics" and doubled safe-area padding | v8.1.0 |
| Companion → Roster column headers "SEASON" and "AVG/G" collided on compact phones | v8.1.0 |
| Companion → Scoring Active/All toggle did not show its selected amber state | v8.1.0 |
| Companion → Scoring header row overflowed narrow phones and cut off the Active/All toggle | v8.1.0 |
| Companion → Scoring stat rows overlapped on narrow phones because value text could not shrink | v8.1.0 |
| Companion → Scoring league-picker errors used a nonexistent destructive color token | v8.1.0 |
| Draft Results evaluated Season Finish against the year before the draft | v8.1.0 |
| Draft Results used present-day market rank instead of historical draft positional rank | v8.1.0 |
| Draft Results insight columns could shift horizontally between rows | v8.1.0 |
| Statistics exposed opponent-defense Visual mode for D/ST and IDP profiles | v8.1.0 |
| Statistics Visual hover details could extend beyond the desktop viewport | v8.1.0 |
| Companion → Defense averages round values to the nearest whole number instead of showing the nearest tenth decimal | v8.0.1 |
| Companion → Defense drilldown still opens as a centered modal on mobile instead of using the slide-up sheet pattern | v8.0.1 |
| Companion → Defense mobile drilldown stacks Rank, Total Allowed, and Per Game even when phone layouts have room for a single stat row | v8.0.1 |
| Companion → Defense mobile/tablet column headers can drift out of alignment with the row metric columns | v8.0.1 |
| Companion → Defense sort headers show abbreviated Asc/Desc text instead of a compact direction indicator | v8.0.1 |
| Companion → Defense lacks an All position filter for aggregate points and yardage allowed | v8.0.1 |
| v8.0.1 Draft Results prior-year player cards can overflow, misalign, and cut off text on tablet and phone layouts | v8.0.1 |
| Draft War Room positional map included inactive, practice-squad, sentinel-ranked, and very low-signal players that skewed the comparison plot | v8.0 |
| Draft War Room positional map trend line did not reliably update with every X/Y axis pairing | v8.0 |
| Draft War Room positional map hover tooltip could disappear before users could click Pin to Compare, and dot-click selection did not update the focused player on desktop | v8.0 |
| Draft War Room positional map could scroll the page during wheel zoom or crash during drag when transform state was temporarily null | v8.0 |
| Draft War Room rookie analytics showed PPG and volume as negative-looking values instead of neutral unavailable metrics | v8.0 |
| Draft War Room mobile Big Board hid player photos on compact cards and nested column headers inside the collapsed Filters menu | v8.0 |
| Draft War Room mobile filter/search controls could stack awkwardly or inflate the search box instead of keeping filters left and search right | v8.0 |
| Draft War Room scheduled draft banner could cover the LeagueLogs attribution on tablet/mobile layouts | v8.0 |
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
| Mobile Statistics Fantasy Values showed only season fantasy total and omitted fantasy points per game, making mobile player profiles less useful for per-game comparison | v7.6.2 |
| Companion Rankings mobile rows hid Avg PPG when the separate average column collapsed, leaving only the season fantasy total visible | v7.6.2 |
| Fantasy PPG could treat explicit inactive rows with `gp: 0` as played games when season stats backfilled games played from weekly rows | v7.6.2 |
| Statistics player profile career highlights can show 0 TFL for defensive players when ESPN's career aggregate omits tackles for loss even though season-level defensive stats include them | v7.6.2 |
| Companion roster-adjacent player drilldowns could silently do nothing when the Sleeper player record had no ESPN ID, affecting rookies and other sparse player records | v7.6.1 |
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
| Draft War Room player metadata can truncate team, availability, bye, or schedule text at laptop widths after injury designations were added. | v8.6.0 |
| Draft War Room and Board can show players whose positions are not rosterable in the selected league, including IDP players in leagues without IDP slots. | v8.6.0 |
| Statistics Scores play-by-play drive headers can report impossible net yardage (for example −89 yards on a drive that gained 6), and the drive field draws a full-length bar no individual play accounts for, because clock stoppages report a phantom goal-line start spot and a turnover on downs is filed under the team that took over. | v8.6.0 |
| Statistics Scores field graphics place every spot read out of a play description at the wrong end of the field for teams the official play-by-play spells differently from the team records (Cleveland is reported as CLE but written CLV, and likewise Washington, Arizona, Baltimore, Houston and Jacksonville). A 62-yard punt to the Cleveland 10 was drawn landing at the Cincinnati 10. Affects punt and kickoff geometry on every game involving one of those teams. | v8.6.0 |
| Statistics Scores can show a newer BALLDONTLIE Latest Play beneath an older score snapshot, so the scorecard can trail a scoring play until the next scoreboard refresh. | v8.6.0 |
| Statistics Scores reverses the direction of play after a penalty on fourth down. A flag that awards a first down reports fourth down in, first down out, and fewer yards than were needed — indistinguishable from a defensive stop — so it is read as a turnover on downs, which hands the offense to the other team. The play is drawn attacking the wrong end zone, and because drive grouping asks the same question the drive breaks at the flag and every play after it is filed under the opposing team. | v8.6.0 |
| Statistics Scores drive playback draws the throw on an interception travelling backwards when the feed credits the pick at a spot behind the line of scrimmage, making the offense look like it ran the wrong way for the whole play. | v8.6.0 |
| Statistics Scores and Fantasy Live drive playback do not give “Kickoff Short of Landing Zone” penalties their kickoff animation because the provider reports the result as “placed at” without a numeric yardage; the shared penalty parser rejects that clause and the kick falls back to generic movement. | v8.6.0 |
| Statistics Scores' static play card describes a short-of-landing-zone kickoff using the enforced net field-position change (25 yards in HOU–LV) instead of the provider-reported kick distance (41 yards), even though drive playback uses the correct flight distance. | v8.6.0 |
| Fantasy Live replay can show no scoring feed and draw tall chart spikes at NOW because its 500 ms clock invalidates slower stat hydration, while temporarily unmatched starters fall back to the completed fixture's final fantasy points instead of the score observed at the current replay moment. | v8.6.0 |
| Fantasy Live play replay can display the combined fantasy value of multiple scorers on the same NFL play instead of showing only the points earned by the player on the viewer's fantasy team. The feed value remains correct. | v8.6.0 |
| Fantasy Live play replay awards touchdown fantasy points only after the animated ball reaches the middle of the end zone instead of when a runner crosses the goal line or a receiver catches the ball in the end zone. | v8.6.0 |
| Fantasy Live renders raw provider play descriptions instead of the human-friendly normalized play text used by Statistics Scores play-by-play. | v8.6.0 |
| A production PWA worker previously installed on the Vite development origin can keep serving an older GridShift bundle after the dev server starts, hiding current source changes and sandbox controls behind stale cached UI. | v8.6.0 |
| Fantasy Live replay can show correct matchup scores but an empty play feed because replay-wide provider-coverage and exact progress/timestamp synchronization gates suppress every stat-delta event when independently sliced play data does not match exactly. | v8.6.0 |
| Fantasy Live can omit the replay from provider-backed live scoring plays and omit the fantasy scoring breakdown from unmatched snapshot-delta plays because real live mode suppresses the field visual, resolved game metadata is not carried with the play, and the calculated stat delta is discarded before rendering. | v8.6.0 |
| Statistics Scores scorecards, Statistics Scores drilldowns, and Fantasy Live independently fetch and reconcile live game clocks and play feeds, allowing “Clock held,” Latest Play, and the expanded feeds to represent different provider snapshots for the same game. | v8.6.0 |
| Statistics Scores can label a BALLDONTLIE field-goal play as “Red Zone” when the snap began outside the opponent 20 because the scorecard derives the label from the play's ending distance while displaying its starting down, distance, and field position. | v8.6.0 |
| Statistics Scores hides BALLDONTLIE's terminal END GAME marker, so a final game that ends with time remaining appears to have a truncated play feed at its last clock event. | v8.6.0 |
| Fantasy Live can animate a provider scoring-summary pick-six as one offense-colored ground run: the quarterback's throw and interception are omitted, the return never changes to the intercepting team's color, and the touchdown can be awarded at the reported post-play spot instead of at the goal line. | v8.6.0 |
| Fantasy Live can attribute a compound touchdown play's rushing yards and touchdown to a rostered kicker named only in a trailing failed-PAT clause, showing the scorer's full fantasy value instead of the kicker's league-configured missed-extra-point penalty. | v8.6.0 |
| Fantasy Live crashes outside the local sandbox with “Cannot access 'liveStatus' before initialization” because demo-feed capability is derived before the `liveStatus` state is declared. | v8.6.0 |
| Fantasy Rosters sizes its desktop identity column from player names alone, truncating position, team, keeper, and reserve metadata even when the row has available space. | v8.6.1 |
| Draft Board cards can change height when their label, availability, or pick state changes, hide the drafting team behind a generic “Gone” state, and tuck mobile card-label and bye-conflict controls into an unnecessary submenu. | v8.6.1 |
| Fantasy Live's solid score paths and hover values regressed from direct interpolation to step-after geometry, making every scoring event read as a vertical wall instead of the preferred continuous line between score dots. | v8.6.1 |
| Fantasy Rankings can show “No matched ADP rankings are available” for a connected preseason league while its league-position metadata is still initializing, even though the shared ADP matcher has valid player matches. | v8.6.1 |
| Statistics Scores mobile drilldowns crowd charts and comparison visuals against the viewport edges, wrap player-stat tabs, hide standings columns behind horizontal scrolling, and render live win-probability fill as if the game were already complete. | v8.6.1 |
| Statistics Schedule does not select the active preseason or regular-season week when its season scope changes, and its mobile team picker lacks the shared team-gradient identity and touch-safe sizing used elsewhere. | v8.6.1 |
| Draft War Room mobile analytics can report roster fit above 100%, render peer values as non-interactive vertical bars, bury search and priority controls inside nested filters, and clip ranking values and the add-to-board action from player rows. | v8.6.1 |
| Trade Agent exposes “Select Partner's Roster” before a trade partner exists, allowing an action whose required context has not been selected. | v8.6.1 |
| Fantasy mobile data surfaces can overlap Position Strength headers, reflow the player preview sheet between tabs, wrap Statistics position filters, omit an obvious Heatmap sheet close action, misorder roster draft-round markers, and leave Defense filters permanently expanded. | v8.6.1 |
| Predictions Predict Record crowds its primary mobile work surface against the viewport edges. | v8.6.1 |
| Fantasy Live's play feed can paint scrolled rows through the top inset above its sticky team filter header on mobile and tablet widths. | v8.6.1 |
| Fantasy Live preseason charts can oscillate and collapse to zero because cross-game events are plotted and accumulated on different timelines, while the performer rail falls back to zero fixture totals when play-by-play exists but provider box scores do not. | v8.6.1 |
| Fantasy Live preseason play values can ignore the connected league's scoring profile, and incompletions or penalty-negated passes can be credited as completed passes with positive fantasy points. | v8.6.1 |
| Draft Board's Highlight conflicts toggle can show no warning between saved targets with the same bye week in keeper and dynasty leagues. | v8.6.1 |
| Fantasy Rankings and Draft can omit valid BALLDONTLIE ADP when the provider includes a terminal generational suffix such as Jr., Sr., or III that Sleeper omits. | v8.6.2 |
