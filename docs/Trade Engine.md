# Trade Engine

This note explains how the Trade system works at a product level and at a code level.

It is written for two audiences:
- someone trying to understand why the app suggested a trade
- someone modifying the Trade engine and needing to know where each decision is made

If you change Trade logic, Trade explanation text, trade valuation, or proposal ranking/selection, update this file in the same pass.

## What the Trade system does

The app has four different Trade surfaces:
- `Agent`: manual trade building, valuation, and refinement
- `Intelligence`: partner-specific trade ideas driven by roster needs and surplus
- `Upgrades`: league-wide search for better players at a chosen position or target slot
- `History`: a factual archive of finalized trades from the selected linked-league season and earlier; its current-season workspace is available when the latest linked-league season is selected
- `Proposals`: private GridShift proposal rooms for the two connected Sleeper participants in the active league; includes both incoming and outgoing proposals

Agent, Intelligence, Upgrades, History, and Proposals are current-season surfaces. When a prior linked-league season is selected, the Trade section remains visible and navigable but shows a current-season hint with a one-tap switch back to the latest linked-league season. Trade actions from roster/player views and proposal polling remain unavailable until then. Historical league data and finalized transaction records remain available through the League views.

These surfaces share a canonical player-value map and use one fantasy-viability scale. Ranking, opportunity context, and pick uncertainty remain separate inputs to their own workflows.

## Player and pick value scale

Every player is valued from 0–100 by what losing them would cost a manager in this league. About 15 is what the waiver wire offers at the position, 50 is the league's median starter, 90 is a top-5% starter, and 0 means no realistic path to playing time. The same approach applies to offense, IDP, kickers, and D/ST.

- **Production (60 of the 75 local points).** Points per game under the active scoring settings, measured against two lines per position:
  - **Starter line:** the last player who would start at that position if every team filled its lineup. Dedicated slots fill first, then flex slots (narrowest first) with the best remaining eligible player, so league size, superflex, IDP flex, and deeper lineups move it without hand tuning. A position that reaches the lineup only through flex, with nobody good enough to start there, uses that flex slot's cutoff.
  - **Waiver line:** the average of the three best players at the position whom nobody has rostered (`players`, `reserve`, and `taxi` all count as rostered), with their short samples trusted like everyone else's. Free agents who are Doubtful, Out, suspended, or on a reserve list are skipped because they cannot replace anyone this week. Actual rosters are used once the league holds at least half of its lineup-plus-bench capacity. Before that (a league still drafting, a mock, or missing roster data), bench spots (`BN`) are spread across positions in proportion to starter slots, except kickers and D/ST, and capped by Sleeper's `settings.position_limit_<position>` (for example `position_limit_dl`), to estimate how deep each position is rostered. The waiver line can sit above the starter line when managers leave better players on waivers than some they start; points are then measured against the waiver line alone.
  - **Value over waivers:** points above the starter line count in full, points between the waiver and starter lines count at half weight (they help only as a fill-in or as cover for a starter), and points below the waiver line are negative. When a position has plenty of viable free agents, its waiver line sits close to its starter line and every player there is worth less in a trade.
  - **Starting point (last season):** a player with 4+ games last season starts from last season's points per game, blended with this season's games. Both numbers were fitted per position on 2023→2024 and 2024→2025 under a 16-team IDP league's scoring, using games with 15+ snaps (20+ for QBs): how many current-season games last season is worth when predicting weeks 8–18 from weeks 1–7 (QB 5, RB 6, WR 3.5, TE 4, K 10.5, D/ST 2.5, DL 9.5, LB 6.5, DB 12), and the share of the blended edge over the position's starter line that actually held up (QB 0.5, RB 0.95, WR 0.8, TE 0.95, K 0.35, D/ST 0.7, DL 0.85, LB 0.65, DB 0.45). Blending beat this-season-only at every position. Dynasty weighs last season at least as much as this season's games. Once games are underway, a player who has not played this season keeps last season only when an injury designation (Doubtful, Out, IR, PUP, NFI, suspended) explains the absence; otherwise neither last season's points nor its snaps count.
  - **No recent season:** rookies and players without 4+ games last season settle toward the waiver line in proportion to games played, as games / (games + c). Each position's c comes from measured game-to-game reliability of fantasy scoring: odd-week vs. even-week points per game for regular players in 2024 and 2025 (selected by playing time, not points, to avoid selection bias), stepped up to one game with Spearman-Brown, c = (1 − ρ) / ρ, geometric mean of both seasons: QB 5, RB 1.5, WR 2, TE 1.5, LB 4, DL 5, DB 20, K 30, D/ST 30. A player who was active but did not play counts as a zero-point game. Both lines are computed from these settled numbers, so a free agent's short hot streak does not set the bar, and they ignore players with fewer than two games this season once the season has that many.
  - **Curve:** one logistic curve for every position, fixed at the waiver line (15), the league's median starter (50), and the 95th-percentile starter (90). Players below the waiver line approach zero smoothly instead of being cut off.
- **Role (15 of the 75 local points).** Share of team snaps over the team's four most recent games (offensive snaps for QB/RB/WR/TE, defensive snaps for IDP); a game the player sat out counts as zero. A share at or above the position's 90th percentile counts as a full role. When snaps are not reported, opportunity volume (attempts, targets, tackles and splash plays, kicks, D/ST plays) is used the same way. Kickers and D/ST get no role credit because every rostered one plays its whole phase; their volume stands in only when production is missing. Role is pulled toward the middle when fewer than four team games are available.
- **Availability.** A mild current-status discount applies to the local score: Questionable ×0.97, Doubtful ×0.90, Out ×0.85, Suspended ×0.80, and IR/PUP/NFI ×0.70. Dynasty halves the discount. A fresh BDL game status takes precedence over the provider's injury designation.

Missing production or role is redistributed to the available local signal. There is no hard replacement-player cutoff; an asset with a plausible path to playing time stays above zero when evidence supports it.

KTC is a peer market signal with a 25% weight when available. Players match KTC by MFL ID, then name and position; a name-only match is used only when no other Sleeper player shares the normalized name, so a suffix-stripped namesake (a WR "Kenneth Walker" vs. RB Kenneth Walker III) never inherits another player's value. Positive KTC values are normalized into a 0–100 percentile score; a raw value of 0 remains an unvalued placeholder. If either production or role is missing, the available local evidence is used; KTC can also provide an estimate when local inputs are absent. Missing KTC never blocks local valuation. Missing all evidence leaves an asset unavailable instead of assigning a misleading zero. Market trends may still show KTC's original history, separate from Trade's player scale.

Both formats load the prior completed season as each player's starting point; dynasty weighs it more. A fresh BDL weekly projection counts as two games of production evidence, blended with the season's points per game; BDL is optional and never a valuation prerequisite. Missing keys, unsupported capabilities, stale data, and failed responses are optional-context gaps. Injury designations apply the availability discount above; practice reports remain display context. Postgame starter and did-not-play fields are deliberately omitted because they are not future lineup projections.

Redraft pick values use the canonical Trade values of the scoring-aware neutral draft pool, summarized by round and discounted for uncertainty. If that pool is not usable, normalized KTC percentiles can supply the pick estimate. Dynasty picks use normalized KTC pick baselines where available. Pick values use the same 0–100 range, but trade-side totals add assets and can exceed 100. FAAB is checked for ownership and feasibility only; it has no numeric Trade value.

New proposal snapshots identify `fantasy-baseline-0-100-v3`. Snapshots from the prior `fantasy-viability-0-100-v2` and `league-utility-0-100-v1` scales and snapshots with no scale identifier are legacy; proposal cards preserve the values captured when sent and label them as legacy. Proposal cards never recalculate a stored asset against current values.

## GridShift Trade Proposal Rooms

Trade valuation remains local and is captured into an immutable snapshot when a proposal is sent. The server does not recompute KTC or roster-fit recommendations; it authorizes and persists the proposal only after checking the exact Sleeper league, season, two roster owners, and current player/draft-pick/FAAB ownership. The Proposals list includes the proposal for both participants, so the sender can review the outgoing conversation after sending it.

The sidecar stores a separate `trade-proposals.sqlite` database under the persistent `/data` volume. Participant sessions and share capabilities are HMAC-hashed. A proposal can be sent from the Agent, Intelligence, or Upgrade surfaces, then revised through alternating counter-proposals. Each revision chooses one of the bounded expiries: 1 hour, end of day, 24 hours, 2 days, or 1 week. There is no permanent proposal option. Each revision snapshot treats its author as the current sender for status, expiry, and action semantics; when a viewer identity is available, the card presents that viewer's manager on the left and the other participant on the right, with an unidentified viewer falling back to the revision sender first. The proposal envelope retains both participants for access and original-proposal actions. The revision retains that sender's IANA time zone, so `end of day` is resolved from the sender's calendar day and the card can show the expiry in sender time; active proposal cards recalculate the countdown in real time and include seconds, while accepted or declined cards preserve a fixed terminal event time.

When an open proposal expires, its full snapshot, revisions, and notifications are deleted. A proposal that reaches `accepted` leaves the response window and remains available until the accepting manager marks the Sleeper transaction done. A small tombstone retains the league/roster scope, fingerprint, expiry, and any recorded Sleeper outcome for the configured retention window (30 days by default), allowing the UI to explain that an unaccepted link expired without retaining the trade payload.

Share URLs are opaque server capabilities. The dynamic `/trade/share/:token` page exposes the accepted rich bearer preview metadata to link unfurlers, while the GridShift page and all actions remain participant-gated. QR codes encode that same revocable URL; they do not carry raw trade JSON. Export image mode renders the readable trade snapshot and QR together in the screenshot view.

The Proposals surface polls while GridShift is open and exposes `Counter`, a contextual `Withdraw` or `Decline` action, and `Accept`. Only the participant who authored the latest revision can withdraw it; the other participant can decline or accept that current offer. Acceptance changes the GridShift conversation to `accepted`, records which participant accepted the current revision and when, and creates a recipient-only acceptance message for the other manager. Once accepted, neither participant can counter, decline, or withdraw the proposal.

Only the accepting manager sees the `What to do next` handoff: re-create the same Sends and Receives in Sleeper, send the actual trade to the other manager, return after Sleeper processes it, and use `Check Sleeper` followed by `Mark Done`. GridShift cannot submit the transaction to Sleeper. The accepted state, Sleeper's `possible_match` reconciliation result, and the final GridShift completion mark are separate states; an exact match is preferred, but the published Sleeper transaction payload may omit `adds`/`drops`, so a missing detail never becomes an automatic completion or decline.

## Core file map

- `src/components/companion/CompanionTrade.jsx`
  Public Trade entry point and orchestration shell for all Trade modes. It keeps state, routing/query sync, caches, modal orchestration, and default export compatibility.
- `src/components/companion/trade/`
  Extracted Trade UI modules. `TradeProposalBuilder.jsx` owns the Agent builder surface, `TradeProposalPanel.jsx` owns Intelligence and proposal result rendering, `UpgradeFinderPage.jsx` owns the Upgrade flow, `ProposalPlayerCard.jsx` owns proposal player/pick cards, `ValuationInfoSheet.jsx` owns value explanation content, and `RosterBrowseModal.jsx` owns partner roster browsing.
- `src/components/companion/TradeHistory.jsx`
  Read-only Trade History route. It owns season grouping, manager/search filters, expandable transactions, responsive asset cards, and loading/empty/error states without starting the valuation pipeline.
- `src/utils/tradeHistory.js`
  Fetches and caches weekly Sleeper transactions by league season, filters to completed trades, and normalizes manager, player, draft-pick, and FAAB movement.
- `src/utils/tradeValue.js`
  Shared player trade-value detail builder. This is the common source for blended trade values used across Trade surfaces.
- `src/components/compare/CompareTradePanel.jsx`
  Two-player Trade comparison. Its displayed player scores use the same fantasy-viability map and normalized KTC context as Companion Trade; KTC trend and source values remain separate market context.
- `src/utils/tradeAnalytics.js`
  Precomputes Trade analytics snapshots: positional averages, value-per-PPG, IDP/DST/kicker computed values, and the optional opportunity layer.
- `src/utils/tradeEngine.js`
  Manual Trade Agent logic: side valuation, pick ownership, candidate pool building, trade evaluation, and refinement suggestions.
- `src/utils/opportunityEngine.js`
  Compatibility facade for the Trade Intelligence and Upgrade engine. Keep public imports pointed here unless there is a deliberate internal-module edit.
- `src/utils/opportunity/`
  Focused opportunity-engine modules: `rosterAnalysis.js`, `proposalBuilder.js`, `upgradePackaging.js`, `opportunityCards.js`, `leagueWideUpgrades.js`, `opportunityPositions.js`, and `opportunityShared.js`.

## High-level data flow

### Shared inputs

Most Trade flows start from these local and optional market inputs:
- the active fantasy provider's normalized league and rosters
- normalized player map
- season stats / weekly stats
- scoring settings
- adjusted KTC datasets, when available
- current draft pick ownership

Sleeper is the supported fantasy provider for players and draft picks.

### Shared valuation layer

`tradeValue.js` computes a `value` for each player from:
- fantasy production over each position's waiver line, with full credit above the league's starter line and half credit between the two, trusted by sample size and position stability
- league size, lineup slots, bench spots, position limits, and who is actually rostered, through the starter and waiver lines
- expected role from snap share (or opportunity volume when snaps are unreported)
- a mild availability discount from current injury status
- a normalized KTC peer signal weighted at 25% when available
- current-season production and role for redraft, plus prior-season evidence for dynasty

This shared value is what reduced earlier drift between Agent, Intelligence, and Upgrade surfaces.

KTC does not publish IDP or kicker market values, so their values come from local scoring and role evidence. Explicit DL/LB/DB roster slots and IDP flex slots (`IDP_FLEX`, `FLEX_IDP`, or `DP`) enable values for the relevant IDP groups; a `DEF` slot enables D/ST, and a `K` slot enables kickers. Trade ignores KTC rows for these positions, including zero-valued placeholders. All positions use the same baseline-and-role approach on one curve, so a top defender is compared with offense by points over its own position's starter and waiver lines rather than by rank within a deep defensive pool. IDP positions where many viable defenders go unrostered score lower. No hard replacement threshold or minimum games requirement can force a viable player to zero. Unknown evidence remains unavailable (`—`). A trade side containing an unavailable asset cannot receive a fairness verdict until all of its assets have values.

### Agent flow

`CompanionTrade.jsx` -> `TradeProposalBuilder.jsx` -> `tradeEngine.js`

Main responsibilities:
- build draft pick ownership maps
- value each side of a user-built trade
- evaluate fairness / imbalance
- generate refinement ideas and candidate additions/removals

The in-progress Agent draft (selected players, picks, and partner roster) is
saved in browser storage under the connected Sleeper user, league, and season.
It is restored after leaving Trade or reloading the app; explicit entry points
such as Build Trade and counter-proposal editing replace the saved draft, while
Clear Trade saves the cleared asset state.

### Intelligence flow

`CompanionTrade.jsx` -> `TradeProposalPanel.jsx` -> `tradeAnalytics.js` -> `opportunityEngine.js` facade -> `src/utils/opportunity/*`

Main responsibilities:
- analyze each roster by position
- identify weak starters, lack of depth, surplus positions, and waiver support
- build partner-specific need-driven (`Fix Needs`) and surplus-driven (`Use Surplus`) proposals
- rank and dedupe proposals into a smaller final result set

### Upgrade flow

`CompanionTrade.jsx` -> `UpgradeFinderPage.jsx` -> `opportunityEngine.js` facade -> `leagueWideUpgrades.js`

Main responsibilities:
- choose a target player or target slot to upgrade
- search each partner roster for stronger incoming players
- score allowed outgoing players/picks as payment
- build candidate packages and compensation picks
- evaluate whether the package is viable for both sides
- rank and group the best upgrade paths by manager

### History flow

`App.jsx` -> `TradeHistory.jsx` -> `tradeHistory.js` -> Sleeper transactions

Main responsibilities:
- follow the existing linked-league lineage and treat the selected season as a hard upper bound
- fetch transaction rounds 0 through 18 for each eligible league season and cache completed seasons permanently
- include only `trade` transactions with `status: complete`
- display factual asset movement without loading KTC values, grading trades, or declaring a winner

## What each engine optimizes for

### Agent

Agent is explicit and user-controlled.
It answers:
- what is this trade worth?
- who is ahead?
- what small changes would move it closer to fair?

### Intelligence

Intelligence is suggestion-driven.
It answers:
- which partners line up with my roster needs?
- which deals help my weak spots?
- which players or picks can I move from positions of strength?

### Upgrades

Upgrades is target-driven.
It answers:
- if I want a better player at this spot, which managers can provide that?
- what would I have to give up?
- which upgrade packages are most plausible?

## Important internal concepts

### Trade value

Trade value is not identical to fantasy points.
It is a blended score used to compare assets across players and picks.

### Need severity

`opportunityEngine.js` scores how urgent a roster's need is at each position based on:
- weak starter quality
- shortage of starters
- bench depth
- bye and schedule pressure

That severity feeds Intelligence and Upgrade ranking.

### Room size vs playable options

The engine tracks more than one kind of depth.

User-facing meaning:
- `room size`: total players at that position on the roster
- `playable options`: players at that position who clear the engine's internal usability threshold

Important rule:
- use roster-size language in user-facing explanations by default
- keep `playable options` internal to the engine unless the user explicitly asks for diagnostic detail
- do not expose internal counts with vague labels like `depth` on their own

### Primary upgrade vs additional depth pieces

In multi-player outgoing packages, the engine usually picks one same-position outgoing player as the primary upgrade comparison piece.
Other same-position players in the package are treated as additional depth pieces.

When explanation text references a PPG delta, it should name the reference player explicitly.
Do not show `+X.X PPG` without saying who that delta is against.

## Explanation text rules

Trade explanations are generated in `opportunityEngine.js` and summarized again in `CompanionTrade.jsx`.

Current product rules:
- if a delta is shown, name the comparison player
- if a player name appears in explanation text but is not part of the package, make that clear
- if a card refers to before/after state, label which side is before and which is after
- use fantasy-football language, not internal engine terms

Examples of good explanation framing:
- `Primary gain +2.1 PPG vs Chris Rodriguez`
- `Best Remaining QB After Trade`
- `Adds 2 RBs to the roster`
- `RB roster 3 -> 5`

Examples to avoid:
- `Drop-off 0.0`
- `Current playable depth 3`
- `Playable options 1 -> 2`
- `Gain +2.1 PPG` with no named reference

## Agent reference

Main logic in `tradeEngine.js`:
- `buildRosterPicks(...)`
  Builds full pick ownership by roster and round/year.
- `getPicksForRoster(...)`
  Flattens owned picks for a roster.
- `valueDraftPick(...)`
  Single source of truth for draft pick valuation. Picks use one flat value per year and round, with redraft values coming from `pickValueMap` plus `pickYearDiscount(...)`, and dynasty/fallback values coming from a round-level KTC RDP baseline plus the same year discount. Trade Agent, pick pickers, roster browse, Trade Intelligence, and Trade Upgrades must call this helper instead of duplicating pick value math.
- `draftPickDisplay.js`
  Centralizes user-facing year-plus-round pick labels and chronological pick-card sorting.
- `valueSide(...)`
  Values a list of players and picks.
- `evaluateTrade(...)`
  Compares both sides and returns trade balance.
- `suggestPackage(...)`
  Suggests a path toward fairer balance.
- `buildCandidatePool(...)`
  Builds likely refinement candidates.
- `detectLeagueType(league)`
  Shared 1QB/superflex detection from `roster_positions`, used by Companion Trade to keep trade valuation on one league-format check.

### Redraft pick calibration

Redraft picks stand for the range of players expected across a round. `CompanionTrade.jsx` builds a neutral Draft candidate order from the available Draft market, prior-production, scoring-fit, and—during the supported preseason window—strictly matched BALLDONTLIE ADP signals under the active league scoring rules. It deliberately excludes personal board placement, team need, and on-the-clock recommendation logic because a pick is a league-wide asset. ADP is additive only: unavailable or unsupported ADP, including the normal absence of IDP ADP, is removed from that player's weighted signal calculation rather than treated as zero.

`computeRedraftPickValues(...)` then takes the median canonical Trade value of the available players across each full round. This lets IDP-heavy or scoring-specific leagues price picks against the players they could actually become, rather than against an offense-only KTC list. It then applies a round-risk discount: earlier rounds remain more valuable, while later rounds receive progressively larger discounts; future-year discounts apply separately. If fewer than half of a round's expected players have a trustworthy Trade value, that round falls back to the adjusted KTC-based calculation instead of inventing a value.

When modifying Agent, verify:
- roster-id comparisons remain tolerant of string vs number inputs
- draft pick valuation still flows through `valueDraftPick(...)` so applied proposals keep the same values in Trade Upgrades and Trade Agent
- side valuation still falls back correctly for dynasty-only players and IDP/DST

## Intelligence reference

Public imports still come from `opportunityEngine.js`; implementation lives in `src/utils/opportunity/`.

Main logic:
- `buildRosterOpportunityLayer(...)`
  Builds analyzed roster state for the whole league in `rosterAnalysis.js`.
- `buildPartnerTradeIntelligence(...)`
  Builds need-driven and surplus-driven proposals for a selected partner in `proposalBuilder.js`.
- `buildTradeProposals(...)`
  `Fix Needs` proposal generator.
- `buildSurplusTradeProposals(...)`
  `Use Surplus` proposal generator.
- `selectNeedDrivenTradeProposals(...)`
  Final reservation and dedupe for need-driven proposals in `upgradePackaging.js`.
- `selectSurplusTradeProposals(...)`
  Final reservation and dedupe for surplus-driven proposals in `upgradePackaging.js`.

Known design behavior:
- Intelligence owns an in-view manager selector. Selecting a manager updates the same `partnerRosterId` context used by Agent and keeps the proposal panel mounted while partner-specific ideas prepare.
- Partner switching must keep `TradeProposalPanel` mounted through analytics loading and partner-specific generation so active filters do not reset when a manager is selected for the first time
- Partner-specific proposal caches are keyed by roster id; never render cached proposals unless they match the currently selected partner
- First-time partner generation should show an inline preparing state inside the panel, not replace the whole Intelligence area
- Intelligence results render as Upgrade-style Give/Get deal rows with side totals, Apply actions, two-column explanation copy, UI-only sort chips, and compact player/pick filters.
- Proposal card dimensions should come from the responsive card sizing contract, not from how many assets are on either side of the package; Intelligence and Upgrade result rows can use side-fitted card math at the `1200px` result-row breakpoint
- Trade proposal card layout rules live in `docs/Trade Proposal Cards.md`; keep card sizing, identity text, stat fit, and no-clipping behavior aligned with that contract.
- Proposal pick cards sort chronologically within each side of a trade: year, then round. Player cards keep their generated order; pick cards are sorted among the pick group.
- Draft pick labels must use `draftPickDisplay.js`, not duplicated string formatting. Sleeper's traded-pick data identifies a tradable asset by season and round; Trade surfaces therefore display only year plus round and never infer a future slot from standings or draft setup metadata.
- Draft pick values must use `valueDraftPick(...)`, not duplicated redraft discounts or KTC RDP lookup. Pass KTC players and league type into proposal engines so dynasty/fallback pick values match Trade Agent.
- Once the current season's draft is complete (Sleeper draft status, else league status `in_season`/`post_season`/`complete`), `buildRosterPicks(...)` offers only future-year picks; Sleeper keeps returning spent traded picks, so they are filtered out.
- All tradable picks display only year plus round. Actual used draft results, if needed in a historical surface later, should come from Sleeper's completed draft-picks records rather than being inferred in the Trade model.
- `Use Surplus` is structurally player-first; do not expose UI options that imply unsupported pick-only outgoing behavior there
- `Fix Needs` can use picks, but proposal selection must explicitly protect pick-inclusive and pick-only shapes if the product wants them visible
- proposal explanations depend heavily on `buildProposalContext(...)`; if the text looks wrong, inspect context first before changing the renderer

## Upgrade reference

Public imports still come from `opportunityEngine.js`; implementation lives in `src/utils/opportunity/leagueWideUpgrades.js` and `upgradePackaging.js`.

Main logic:
- `findLeagueWideUpgradeGroups(...)`
  Searches all partner rosters for valid upgrades.
- `buildUpgradeFinderPackageCandidates(...)`
  Builds outgoing package combinations from allowed players and picks.
- `buildIncomingCompensationChoices(...)`
  Adds incoming pick compensation when needed.
- `evaluateUpgradePackage(...)`
  Tests whether the outgoing package provides enough value and enough partner benefit.

Current ranking behavior:
- your upgrade delta matters a lot
- partner need severity matters
- package posture distance matters
- weak partner benefit should be penalized so obviously one-sided upgrades do not dominate the results

Current UI behavior in `UpgradeFinderPage.jsx` and `UpgradeBargainingTable.jsx`:
- the Bargaining Table starts with the target player or target slot as the hero context, then keeps bargaining controls close to the target instead of burying them in the results
- the visible mover pool keeps row positions stable while users select movers; changing a mover filter or sort chip captures the current selected players and pins that snapshot above the filtered suggestions by descending trade value until another chip change, page revisit, or refresh
- pick intent toggles describe how picks may be used in packages; avoid labels that imply unsupported pick-only behavior unless the engine supports that shape
- package size is a real control: `Auto up to 3` enables multi-asset package construction, while the single-asset setting limits generated packages to one outgoing asset
- the posture strip is a compact continuous control/status surface for package stance; the anchor labels use user-facing bargaining language, while drag positions between labels interpolate the engine's posture ratios
- results render below the table so the target, selected movers, pick intent, and posture remain stable while proposals refresh
- Upgrade results render as manager-grouped `Upgrade Paths Found` rows with side totals, visible Apply actions, functional sort chips, integrated `Why It Helps` copy, and starter PPG delta
- roster-size before/after is the user-facing depth metric
- playable-option counts remain internal and should not appear in normal explanation text

Upgrade Bargaining Table terminology:
- use `target` for the incoming upgrade focus
- use `movers` for assets the user is willing to send
- use `pick intent` for pick-inclusion controls
- use `posture` for conservative / balanced / aggressive package stance
- keep internal terms like candidate pool, selected-first pool, and posture distance out of normal cards unless clearly diagnostic

## Where wording bugs usually come from

If Trade text looks wrong, the cause is usually one of these:
- `buildProposalContext(...)` chose the wrong reference player
- same-position package logic collapsed a multi-player package into a single-player summary
- before/after counts were mixed together under one label
- fallback/remaining-cover text named a non-traded player without clarifying that it was post-trade context

## Safe modification workflow

When changing the Trade engine:
1. Identify which surface is actually affected: Agent, Intelligence, Upgrade, or shared valuation.
2. Change the lowest-level file that owns the behavior.
3. Update this document if logic, terminology, or file ownership changed.
4. If user-facing explanation text changed, verify that labels are understandable without knowledge of internal helper functions.
5. If valuation or proposal-shape rules changed, review `KNOWN_BUGS.md` for stale entries.

## Minimum documentation update rule

Update this file whenever you change any of the following:
- `src/utils/tradeEngine.js`
- `src/utils/opportunityEngine.js`
- `src/utils/opportunity/*`
- `src/utils/tradeAnalytics.js`
- `src/utils/tradeValue.js`
- Trade explanation wording in `src/components/companion/CompanionTrade.jsx`

If the change is tiny, a short note update is enough. If the change alters engine behavior or ranking logic, update the relevant section in detail.
