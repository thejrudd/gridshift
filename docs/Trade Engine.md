# Trade Engine

This note explains how the Trade system works at a product level and at a code level.

It is written for two audiences:
- someone trying to understand why the app suggested a trade
- someone modifying the Trade engine and needing to know where each decision is made

If you change Trade logic, Trade explanation text, trade valuation, or proposal ranking/selection, update this file in the same pass.

## What the Trade system does

The app has three different Trade surfaces:
- `Agent`: manual trade building, valuation, and refinement
- `Intelligence`: partner-specific trade ideas driven by roster needs and surplus
- `Upgrades`: league-wide search for better players at a chosen position or target slot

These surfaces share some underlying valuation inputs, but they do not all use the exact same pipeline.

## Core file map

- `src/components/companion/CompanionTrade.jsx`
  UI shell for all Trade modes. Owns filters, modal/sheet behavior, proposal rendering, and explanation cards.
- `src/utils/tradeValue.js`
  Shared player trade-value detail builder. This is the common source for blended trade values used across Trade surfaces.
- `src/utils/tradeAnalytics.js`
  Precomputes Trade analytics snapshots: positional averages, value-per-PPG, IDP/DST computed values, and the optional opportunity layer.
- `src/utils/tradeEngine.js`
  Manual Trade Agent logic: side valuation, pick ownership, candidate pool building, trade evaluation, and refinement suggestions.
- `src/utils/opportunityEngine.js`
  Trade Intelligence and Upgrade engine. Builds roster opportunity cards, partner-specific proposals, and league-wide upgrade groups.

## High-level data flow

### Shared inputs

Most Trade flows start from the same source data:
- Sleeper league and rosters
- Sleeper player map
- season stats / weekly stats
- scoring settings
- adjusted KTC datasets
- current draft pick ownership

### Shared valuation layer

`tradeValue.js` computes a `value` for each player by blending:
- adjusted KTC value when available
- production context from scoring + season stats
- positional rank adjustment
- dynasty fallback when redraft KTC is missing
- IDP/DST estimated value when KTC has no direct entry

This shared value is what reduced earlier drift between Agent, Intelligence, and Upgrade surfaces.

### Agent flow

`CompanionTrade.jsx` -> `tradeEngine.js`

Main responsibilities:
- build draft pick ownership maps
- value each side of a user-built trade
- evaluate fairness / imbalance
- generate refinement ideas and candidate additions/removals

### Intelligence flow

`CompanionTrade.jsx` -> `tradeAnalytics.js` -> `opportunityEngine.js`

Main responsibilities:
- analyze each roster by position
- identify weak starters, lack of depth, surplus positions, and waiver support
- build partner-specific need-driven (`Fix Needs`) and surplus-driven (`Use Surplus`) proposals
- rank and dedupe proposals into a smaller final result set

### Upgrade flow

`CompanionTrade.jsx` -> `opportunityEngine.js` (`findLeagueWideUpgradeGroups`)

Main responsibilities:
- choose a target player or target slot to upgrade
- search each partner roster for stronger incoming players
- score allowed outgoing players/picks as payment
- build candidate packages and compensation picks
- evaluate whether the package is viable for both sides
- rank and group the best upgrade paths by manager

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
- `getPickQuality(...)`
  Estimates Early / Mid / Late from current standings.
- `valueDraftPick(...)`
  Single source of truth for draft pick valuation. Redraft picks use `pickValueMap` plus `pickYearDiscount(...)`; dynasty/fallback picks use KTC RDP entries. Trade Agent, pick pickers, roster browse, Trade Intelligence, and Trade Upgrades must call this helper instead of duplicating pick value math.
- `draftPickDisplay.js`
  Centralizes user-facing draft pick labels, locked/projected pick display, and chronological pick-card sorting.
- `valueSide(...)`
  Values a list of players and picks.
- `evaluateTrade(...)`
  Compares both sides and returns trade balance.
- `suggestPackage(...)`
  Suggests a path toward fairer balance.
- `buildCandidatePool(...)`
  Builds likely refinement candidates.

When modifying Agent, verify:
- roster-id comparisons remain tolerant of string vs number inputs
- draft pick valuation still flows through `valueDraftPick(...)` so applied proposals keep the same values in Trade Upgrades and Trade Agent
- side valuation still falls back correctly for dynasty-only players and IDP/DST

## Intelligence reference

Main logic in `opportunityEngine.js`:
- `buildRosterOpportunityLayer(...)`
  Builds analyzed roster state for the whole league.
- `buildPartnerTradeIntelligence(...)`
  Builds need-driven and surplus-driven proposals for a selected partner.
- `buildTradeProposals(...)`
  `Fix Needs` proposal generator.
- `buildSurplusTradeProposals(...)`
  `Use Surplus` proposal generator.
- `selectNeedDrivenTradeProposals(...)`
  Final reservation and dedupe for need-driven proposals.
- `selectSurplusTradeProposals(...)`
  Final reservation and dedupe for surplus-driven proposals.

Known design behavior:
- Partner switching must keep `TradeProposalPanel` mounted through analytics loading and partner-specific generation so active filters do not reset when a manager is selected for the first time
- Partner-specific proposal caches are keyed by roster id; never render cached proposals unless they match the currently selected partner
- First-time partner generation should show an inline preparing state inside the panel, not replace the whole Intelligence area
- Proposal card dimensions should come from the responsive card sizing contract, not from how many assets are on either side of the package; side-by-side one-row proposal cards are reserved for wide `2xl` layouts
- Trade proposal card layout rules live in `docs/Trade Proposal Cards.md`; keep card sizing, identity text, stat fit, and no-clipping behavior aligned with that contract.
- Proposal pick cards sort chronologically within each side of a trade: year, then round, then locked/projected slot. Player cards keep their generated order; pick cards are sorted among the pick group.
- Draft pick labels must use `draftPickDisplay.js`, not duplicated string formatting. Sleeper league `status` values are expected to be `pre_draft`, `drafting`, `in_season`, or `complete`; `complete` means the upcoming pick can be shown as locked when the draft has not happened yet.
- Draft pick values must use `valueDraftPick(...)`, not duplicated redraft discounts or KTC RDP lookup. Pass KTC players and league type into proposal engines so dynasty/fallback pick values match Trade Agent.
- Upcoming-year picks show as projected while the league is not complete. Once the league is complete, they show a locked pick number from the completed draft order when available, or from final standings. Picks more than one year out display only year + round and value as a middle pick because future team performance is not knowable.
- `Use Surplus` is structurally player-first; do not expose UI options that imply unsupported pick-only outgoing behavior there
- `Fix Needs` can use picks, but proposal selection must explicitly protect pick-inclusive and pick-only shapes if the product wants them visible
- proposal explanations depend heavily on `buildProposalContext(...)`; if the text looks wrong, inspect context first before changing the renderer

## Upgrade reference

Main logic in `opportunityEngine.js`:
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

Current UI behavior in `CompanionTrade.jsx`:
- the Bargaining Table starts with the target player or target slot as the hero context, then keeps bargaining controls close to the target instead of burying them in the results
- the visible mover pool is selected-first: explicitly selected players appear before the broader value-based suggestions, so user intent can shape packages without turning the table into a manual trade builder
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
- `src/utils/tradeAnalytics.js`
- `src/utils/tradeValue.js`
- Trade explanation wording in `src/components/companion/CompanionTrade.jsx`

If the change is tiny, a short note update is enough. If the change alters engine behavior or ranking logic, update the relevant section in detail.
