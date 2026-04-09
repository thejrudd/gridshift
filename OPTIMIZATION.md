# NFL Predictor - Optimization Plan

Detailed implementation plan for the Companion and Trade performance audit.

This document is intentionally implementation-focused and deferred. It captures
what should change, why it should change, how the work should be sequenced, and
how success should be validated, but it does not authorize starting the work
immediately.

Current product direction:

- v6.2 work remains the active implementation focus
- Companion / Trade optimization is documented now and should be executed after
  the agreed 6.2 foundation work
- User preference for this work:
  - Prioritize first-load improvements, even if some heavy areas lazy-load on
    first open
  - Virtualization is acceptable where it improves responsiveness
  - Heavy Trade intelligence should run when the user opens or explicitly
    refreshes it, not continuously in the background
  - All league types must remain supported: redraft, dynasty, 1QB, superflex,
    IDP, and D/ST

---

## Current Implementation Progress

This plan has now moved from documentation-only into active implementation.

Completed or in-flight work:

- Matchup no longer blocks first open on the full season-insights pipeline.
  Core matchup data can render before advanced season analytics finish loading.
- Matchup weather requests are now batched into a single state commit instead
  of retriggering repeated full projection recalculations.
- Shared projection-engine caching is in progress for:
  - season positional ranks
  - selected-week positional ranks
  - defense table generation
  - league-average points-per-position lookups
- Matchup projections now consume the shared league-average lookup and skip the
  expensive opponent-strength fallback path when precomputed data is available.
- Trade now defers full opportunity analysis until the user actually opens
  Intelligence or Upgrade Finder instead of paying that cost on basic Agent
  open.
- Trade season stats loading is now requested on idle for Agent mode and
  requested immediately only when a heavy analytics view is opened.
- KTC player matching now uses cached lookup tables keyed by the fetched KTC
  array, which removes repeated linear scans from Trade, Compare, and picker
  hot paths.
- The all-rosters Trade picker now avoids the old blank-open full-league
  enrichment path. It shows a search guide by default, defers search input, and
  enriches only the filtered result set instead of every rostered player.
- `statsProgress` is now isolated behind a separate context hook, and the main
  Trade / Matchup / Compare hot consumers have been moved off the broader
  `useSleeper()` path so progress ticks no longer fan out through those screens.
- The remaining Companion stat-heavy screens now follow the same narrower
  subscription pattern:
  - Rankings
  - Roster
  - League roster view
  - Waiver
- Trade card-height equalization now uses a single scheduled measurement pass
  plus a container-level `ResizeObserver` per card group instead of per-card
  observers with nested animation-frame measurement loops.
- Trade now builds a shared analytics snapshot for:
  - positional ranks
  - positional average PPG
  - positional value-per-PPG
  - league average multiplier
  - IDP / D/ST fallback values
  - on-demand player trade values
  - on-demand opportunity analysis
- Trade Intelligence and Upgrade Finder now reuse that shared snapshot, and
  partner changes no longer force a rebuild of the underlying league-wide
  opportunity layer.
- Trade opportunity analysis now reuses per-pass cached pick-asset lookups and
  cached roster position/bench indexes inside `opportunityEngine`, which cuts
  duplicate roster pick rebuilding and repeated bench-membership scans during
  Intelligence and Upgrade Finder runs.
- Trade partner intelligence no longer clones roster-analysis payloads before
  returning proposal data, removing an extra full-structure copy from the hot
  path.
- Trade proposal engines now defer full proposal-context and reason-string
  synthesis until after shortlist selection, so discarded candidate deals no
  longer pay the full context-building cost.
- Upgrade Finder search submission now runs in a React transition so the
  control surface stays responsive while result generation settles.
- Trade side totals and roster-browse enrichment now reuse shared analytics
  metadata for player averages, rank info, and precomputed trade-value details
  instead of recalculating those fields on each render pass.
- Trade proposal rendering now caches per-proposal asset summaries, reuses those
  cached counts for filtering and desktop row layout, and memoizes unchanged
  proposal cards so Intelligence and Upgrade lists do less repeat work while
  browsing large result sets.
- Trade proposal card media now lazy-decodes player headshots and team logos,
  and Upgrade result groups reuse cached manager-name metadata instead of
  scanning rosters during each render pass.
- Trade now reuses shared roster and league-user maps across the shell, which
  removes repeated `rosters.find(...)` and `leagueUsers.find(...)` scans from
  partner chips, Intelligence headers, roster-browse modal setup, and pick
  attribution inside Trade.
- Upgrade Finder results now render through memoized result-group and
  proposal-context components, and proposal detail summaries are cached per
  proposal object instead of being rebuilt inline on every page-state change.
- Trade analytics are now requested once per session after the user first
  signals intent to open Upgrade Finder or Trade Intelligence, using the Trade
  subnav hover / focus / touch path to prewarm the heavy analytics before the
  actual view switch.
- Trade Intelligence partner analysis and Upgrade Finder result generation now
  run through cached deferred effects instead of synchronous render-time
  `useMemo` calls, so tab switches can paint first and heavy proposal analysis
  settles immediately after.
- Agent-only Trade builder calculations now stay gated to the Agent view, so
  value-bar enrichment, side totals, and candidate-pool preparation no longer
  run while browsing Intelligence or Upgrade Finder.
- Trade partner chips now reuse precomputed display names and avatar hashes
  instead of repeating owner lookups and sort-time name formatting during tab
  navigation.
- Trade proposal explanation text and Upgrade context cards now defer their
  heavier detail blocks until idle after the proposal cards mount, so results
  paint sooner and fill in the deeper reasoning immediately after.
- Upgrade Finder now enriches only the currently selected player cards by
  default, reuses the parent owner-name map for manager-group labeling, and
  only materializes full picker `allowedIds` arrays while a picker is open.
- The heavy `TradeProposalPanel` and `UpgradeFinderPage` subtrees are now
  memoized so parent-shell rerenders do not automatically force full
  Intelligence and Upgrade rerenders when their props are unchanged.
- `TradeRosterPicker` and `RosterBrowseModal` now cache per-player trade
  enrichment results across refilters and reopen paths, so those modal surfaces
  reuse prior valuation work instead of recomputing it every time.
- Trade Intelligence partner analysis and Upgrade Finder result generation now
  run through cached deferred effects instead of synchronous render-time
  `useMemo` calls, so tab switches can paint first and heavy proposal analysis
  settles immediately after.
- Once warmed, Upgrade Finder and Trade Intelligence keep their heavy analytics
  inputs hot across view changes so returning to Upgrade does not rebuild the
  opportunity layer and latest result inputs from scratch.
- Compare picker search now hydrates a cached ESPN roster corpus once per team
  set, then filters it locally with deferred input instead of refetching every
  roster on each query.
- Export-only `react-grid-layout` / `react-resizable` CSS is now loaded from
  the lazy export surface instead of the global app shell, and the Google Fonts
  request has been trimmed to the two families the UI actively uses.
- `SleeperContext` no longer pushes `statsEnhancing` through the shared base
  provider; that flag now lives behind its own context so the heatmap-specific
  enhancement state does not fan out through unrelated consumers.
- The all-rosters Trade picker now virtualizes its grouped results once the
  list grows large enough, so opening and scrolling through league-wide search
  results no longer mounts the full grouped DOM at once.
- Trade Intelligence and Upgrade result lists now use `content-visibility`
  boundaries on the heavier offscreen rows and result groups, which reduces
  layout and paint work before those proposal blocks are actually near the
  viewport.
- Phase 1 app-shell code splitting has started for the heaviest lazy-boundary
  candidates:
  - Trade
  - Compare
  - Matchup
  - Waiver
  - Heatmap
  - Export preview

Still queued from the original plan:

- Split `SleeperContext` or introduce selector-style consumption to reduce
  rerenders from progress-state churn
- Expand the current explicit open/refresh model to any remaining heavy
  intelligence flows that still do more work than needed on entry
- Virtualize the remaining large pickers and result lists beyond the all-rosters
  Trade picker
- Remove remaining non-critical initial-load assets from the app shell

---

## Scope

Primary audit targets:

- Companion section responsiveness
- Trade section responsiveness
- Related Compare flows that duplicate Trade computations
- Initial JS/CSS/font load that affects entry into those sections

Out of scope for the first optimization pass:

- Visual redesign
- Changing trade valuation formulas for product reasons
- Removing league-type support
- Rewriting the app architecture around a new framework

---

## Summary Of Findings

### 1. Initial app load is heavier than necessary

The app currently ships one large main bundle and eagerly imports all major
Companion and Trade surfaces in the main shell. That means users pay for Trade,
Compare, export tooling, and multiple heavy Companion views before they open
them.

Observed evidence:

- `dist/assets/index-Cjlur_qB.js`: about 1.14 MB raw, about 306 KB gzipped
- `src/App.jsx`: static imports for all major Companion and Trade views
- `src/components/ExportPreview.jsx`: eagerly imports export-only UI
- `src/main.jsx`: globally imports `react-grid-layout` CSS
- `index.html`: requests several font families that do not appear essential to
  the main application shell

### 2. Trade does too much whole-league work during render setup

`CompanionTrade.jsx` performs many large derivations at once:

- pick ownership map
- positional rank map
- positional average PPG
- positional value-per-PPG map
- league average multiplier
- IDP and D/ST derived value maps
- full player trade value map
- full opportunity layer
- trade intelligence
- upgrade finder results

Some of those calculations rebuild similar datasets multiple times, and some
are duplicated again in pickers, modals, Compare panels, and utilities.

### 3. The same expensive computations are repeated across multiple screens

The app currently recalculates league-wide maps independently in:

- Trade Agent
- Trade roster picker
- Compare Trade panel
- Compare Fantasy panel
- Companion Roster
- Companion League
- Companion Rankings
- Opportunity / intelligence utilities

This leads to stacked costs during screen changes and data updates.

### 4. `SleeperContext` is too broad for hot-path performance

The provider publishes one large object containing:

- player DB
- weekly stats
- season stats
- progress state
- enhancement state
- connection state
- actions and helpers

That broad context makes many consumers eligible to rerender whenever unrelated
parts of the Sleeper state change.

### 5. Trade search and proposal surfaces are doing expensive work on the hot path

Examples:

- All-rosters Trade picker computes enriched value data for a large player set
  before filtering and rendering
- Proposal cards use repeated DOM measurement and equalized-height logic
- Upgrade Finder builds and displays heavy result structures after full-league
  opportunity analysis

### 6. Compare has additional avoidable cost

`ComparePickerSheet` currently fans out to every ESPN roster on search instead
of searching a cached index. Compare panels also recompute rank/defense maps
that overlap with Trade / Companion logic.

### 7. Dev-mode cost is amplified by `StrictMode`

Responsiveness is more noticeably degraded in development because React
`StrictMode` increases visible render/effect churn during local work. This does
not remove the underlying issues, but it makes them easier to notice in dev.

---

## User-Centered Optimization Goals

The optimization pass should improve the interactions users actually feel:

### Highest-priority interactions

1. Opening the Trade section
2. Running the Upgrade Finder

### Secondary interactions

1. Opening Trade pickers and roster browse modals
2. Searching all rostered players
3. Switching Trade partners
4. Scrolling proposal lists
5. Entering Companion views that depend on season stats

### Product rules that must be preserved

- No league-type regression
- No scoring-support regression
- Trade intelligence can become explicitly triggered rather than always-live
- First open of heavy areas may show a loading boundary if it materially
  improves overall performance

---

## Target Outcomes

This pass should aim for the following practical results:

- App shell loads without forcing Trade/Compare/export code into the critical
  path
- Entering Trade feels fast even before heavy intelligence finishes loading
- Trade intelligence and Upgrade Finder compute on demand rather than on every
  state change
- Search and long lists remain responsive on mobile
- Companion sub-views no longer duplicate large league-wide derivations
- Dev mode becomes materially more usable, even if it remains slower than
  production

---

## Implementation Strategy

The plan is organized into phases so the work can be paused safely after any
phase.

### Phase 0 - Baseline And Guardrails

Purpose:

- Establish a before/after baseline before touching behavior

Tasks:

- Capture current bundle composition from a clean production build
- Record Trade open timing in dev and production
- Record Upgrade Finder timing for representative league shapes:
  - redraft 1QB
  - dynasty superflex
  - IDP-enabled league
- Add a lightweight profiling checklist for manual testing
- Identify which derived datasets are purely shared and which are view-specific

Deliverables:

- Before metrics in this file or a linked note
- List of representative test leagues and interactions

### Phase 1 - App Shell Code Splitting

Purpose:

- Remove Trade/Compare/export cost from the initial load path

Tasks:

- Lazy-load top-level heavy sections with `React.lazy` and `Suspense`
- Candidate first-wave lazy boundaries:
  - Trade tab shell
  - Compare tab
  - ExportPreview
  - CompanionDefense
  - CompanionMatchup
  - CompanionWaiver
- Keep the shell, nav, and current visible section lightweight
- Move export-only dependencies behind export entry points
- Remove global imports that are only required for export surfaces
- Trim unused font families from `index.html`

Expected effect:

- Faster first load
- Lower parse/execute cost before opening Companion or Trade
- Smaller main chunk

Acceptance criteria:

- Main initial bundle decreases materially
- App shell still loads correctly on desktop and mobile
- Opening a lazy-loaded section shows a controlled loading state instead of
  blocking the entire shell

### Phase 2 - Shared Derived Data Layer

Purpose:

- Stop recomputing the same league-wide maps in multiple screens

Tasks:

- Create a shared analytics layer for Companion / Trade derived datasets
- Candidate shared outputs:
  - positional ranks
  - positional average PPG
  - positional value-per-PPG
  - defense table
  - league average multiplier
  - player ownership lookup
  - indexed KTC lookup tables
  - player trade value map
- Make the layer keyed by the real invalidation inputs only:
  - league
  - rosters
  - scoring settings
  - players
  - season stats
  - weekly stats
  - season
- Replace repeated per-screen calls with shared consumption

Expected effect:

- Lower CPU cost when entering Trade
- Lower rerender setup cost across Companion / Compare
- Cleaner separation between data preparation and view rendering

Acceptance criteria:

- The same full-league maps are no longer recomputed independently in Trade,
  Compare, and Companion views
- Entering Trade or Compare after stats are loaded reuses existing derived data

### Phase 3 - Narrow Sleeper State Fanout

Purpose:

- Reduce rerender cascades from broad context updates

Tasks:

- Split `SleeperContext` into narrower providers or selector-style consumers
- Separate hot-changing progress/loading state from large stable data blobs
- Candidate slices:
  - connection/session state
  - player database
  - stats payloads
  - stats progress/enhancement UI state
  - actions/helpers
- Ensure views subscribe only to what they actually use

Expected effect:

- Fewer rerenders during stat load/enhancement
- Better dev responsiveness
- Less unnecessary refresh in unrelated Companion/Trade screens

Acceptance criteria:

- Updating `statsProgress` or enhancement state does not force every
  Companion/Trade consumer to rerender
- Core navigation between sections remains stable during stats loading

### Phase 4 - Indexed KTC Lookup And Value Reuse

Purpose:

- Remove repeated linear scans across KTC datasets

Tasks:

- Build indexed KTC lookup maps:
  - by `mflid`
  - by normalized `name + position`
  - by normalized `name`
- Build them once per fetched KTC dataset
- Update trade/compare utilities to use indexed lookups
- Reuse already-computed player values where possible instead of recomputing in
  pickers and modals

Expected effect:

- Lower CPU time in player enrichment loops
- Lower cost when building large picker lists and trade value maps

Acceptance criteria:

- Hot paths no longer call repeated `.find()` scans for every player lookup
- KTC-backed screens preserve exact matching behavior or improve it without
  regressions

### Phase 5 - On-Demand Trade Intelligence

Purpose:

- Align Trade behavior with the agreed product preference: heavy intelligence
  should run when the user opens or refreshes it, not continuously

Tasks:

- Stop computing heavy opportunity/intelligence outputs during baseline Trade
  render
- Separate the Trade surface into tiers:
  - Tier 1: basic trade builder and value bar
  - Tier 2: trade intelligence
  - Tier 3: upgrade finder
- Compute Tier 2 only when the user opens the intelligence surface
- Compute Tier 3 only when the user opens or reruns Upgrade Finder
- Cache the last successful results by the inputs that matter
- Provide explicit refresh actions when upstream state has changed

Expected effect:

- Faster Trade entry
- Better perceived responsiveness
- Predictable cost model for heavy analysis

Acceptance criteria:

- Opening Trade does not eagerly compute all intelligence paths
- Running Upgrade Finder only computes when the user submits the search
- Changing unrelated UI state does not rebuild opportunity/intelligence outputs

### Phase 6 - List And Search Optimization

Purpose:

- Make long pickers and result lists responsive on mobile and lower-end devices

Tasks:

- Virtualize long scrollable lists:
  - all-rosters Trade player picker
  - Trade proposal/result lists if needed
  - large roster browse modals if needed
- Use deferred search input for large client-side filters
- Avoid building fully enriched objects before a user narrows the result set
  when practical
- Lazy-load remote images in lists
- Add `loading="lazy"` and `decoding="async"` where appropriate
- Reduce duplicate remote image work for offscreen items

What virtualization means here:

- Only render the rows currently visible in the scroll viewport, plus a small
  overscan buffer
- Do not mount hundreds of offscreen rows at once
- Keep the logical list intact while reducing DOM size and React work

Expected effect:

- Faster picker open
- Smoother scrolling
- Better typing responsiveness
- Lower memory usage on mobile

Acceptance criteria:

- All-rosters Trade search remains smooth while typing
- Scrolling long result lists does not hitch noticeably on mobile
- Visual behavior remains correct for sticky headers, sections, and selection

### Phase 7 - Proposal Card And Layout Measurement Cleanup

Purpose:

- Reduce layout thrash in proposal rendering

Tasks:

- Audit whether equal-height proposal cards are worth their current measurement
  cost
- Prefer CSS-driven alignment where possible over repeated DOM measurement
- Reduce `useLayoutEffect`, `ResizeObserver`, and double `requestAnimationFrame`
  usage in proposal grids
- Measure only visible proposal groups when virtualization is present
- Re-evaluate whether every proposal card needs equalization on every state
  change

Expected effect:

- Smoother proposal rendering
- Less main-thread layout work during proposal list updates

Acceptance criteria:

- Proposal grids remain visually coherent
- Opening or filtering proposals does not cause visible layout jank

### Phase 8 - Compare Search And Shared Data Cleanup

Purpose:

- Remove extra work in Compare that is closely related to the Trade audit

Tasks:

- Build and cache the ESPN player search corpus instead of refetching every team
  roster on each Compare search
- Reuse shared derived data from the analytics layer in Compare Fantasy and
  Compare Trade
- Reduce repeated defense/rank/stat ranking builds

Expected effect:

- Faster Compare picker searches
- Lower duplicate work between Compare and Trade

Acceptance criteria:

- Compare search does not fan out to all team rosters per query
- Compare panels reuse shared derivations where possible

### Phase 9 - Final Validation

Purpose:

- Confirm the optimization pass actually improved the targeted interactions

Tasks:

- Re-run baseline measurements from Phase 0
- Validate in:
  - dev
  - production build
  - desktop
  - iPhone-sized viewport
  - Android-sized viewport
  - tablet viewport
- Validate league types:
  - redraft 1QB
  - redraft superflex
  - dynasty 1QB
  - dynasty superflex
  - IDP-enabled league
  - D/ST-only defense setups
- Confirm no scoring/value regressions
- Confirm PWA entry and lazy-loaded sections still work correctly

Acceptance criteria:

- Trade opens materially faster than before
- Upgrade Finder remains responsive and runs on demand
- No league-type support regression
- No broken deep interactions caused by lazy loading or virtualization

---

## Priority Order

Recommended implementation order:

1. Phase 1 - App shell code splitting
2. Phase 5 - On-demand Trade intelligence
3. Phase 2 - Shared derived data layer
4. Phase 4 - Indexed KTC lookup and value reuse
5. Phase 3 - Narrow Sleeper state fanout
6. Phase 6 - List and search optimization
7. Phase 7 - Proposal card and layout measurement cleanup
8. Phase 8 - Compare cleanup
9. Phase 9 - Final validation

Reasoning:

- Phase 1 gives the clearest first-load win
- Phase 5 directly targets the user-reported pain points
- Phases 2 and 4 remove the largest repeated compute costs
- Phase 3 improves systemic rerender behavior
- Phase 6 addresses mobile and list UX once the underlying data path is lighter

---

## Risks And Watchouts

### 1. Lazy-loading can shift latency from app start to first-open

This is acceptable per current preference, but only if loading boundaries are
clear and the app shell remains usable.

### 2. Shared caches can become stale if invalidation rules are wrong

All shared derived layers must be keyed to the exact inputs that affect value
or ranking results.

### 3. Virtualization can complicate sticky section headers and dynamic heights

The all-rosters picker currently groups by position and uses sticky headers.
That behavior must be preserved or intentionally redesigned.

### 4. Trade intelligence must remain explainable

If heavy analysis becomes explicit and refresh-based, the UI must make it clear
when proposals are current versus stale.

### 5. Dev and production will not behave identically

Development will still feel somewhat slower because of React dev-mode behavior.
The goal is improvement, not identical parity.

### 6. League-type support increases test surface significantly

Every optimization that touches values, rankings, or pick calculations must be
validated across redraft, dynasty, superflex, IDP, and D/ST contexts.

---

## Concrete Refactor Targets

These are the current high-probability hotspots that should be revisited during
implementation:

- `src/App.jsx`
- `src/main.jsx`
- `index.html`
- `src/context/SleeperContext.jsx`
- `src/components/companion/CompanionTrade.jsx`
- `src/components/companion/TradeRosterPicker.jsx`
- `src/components/compare/CompareTradePanel.jsx`
- `src/components/compare/CompareFantasyPanel.jsx`
- `src/components/compare/ComparePickerSheet.jsx`
- `src/components/companion/CompanionRoster.jsx`
- `src/components/companion/CompanionLeague.jsx`
- `src/components/companion/CompanionRankings.jsx`
- `src/utils/ktcApi.js`
- `src/utils/opportunityEngine.js`
- `src/utils/projectionEngine.js`
- `src/utils/tradeEngine.js`

---

## Recommended Non-Goals For The First Pass

To keep this effort disciplined, do not combine it with:

- route-system migration work from v6.2
- scoring-model redesign
- Trade UX redesign
- broad component rewrite for style consistency
- migrating the entire app to a separate state library purely for fashion

---

## Sign-Off Criteria Before Starting Implementation

Before this optimization plan moves from document to active work:

1. Confirm that v6.2 routing/navigation foundation work has reached an
   acceptable stopping point.
2. Confirm whether the first implementation slice should be load-speed-first or
   Trade-open-speed-first.
3. Confirm whether Trade intelligence should default to collapsed until loaded,
   or open a placeholder shell with an explicit "Run Analysis" action.
4. Confirm whether proposal-card equal-height behavior is a hard UI requirement
   or optional if it costs too much.

---

## Current Recommendation

Do not start this implementation until the active 6.2 feature work reaches the
next safe boundary. When work begins, start with:

1. app-shell lazy loading,
2. on-demand Trade intelligence,
3. shared derived analytics/cache layer.

That combination should produce the highest practical improvement for the
reported pain points while keeping the change surface controlled.

- Broad `useSleeper()` consumers across the app shell, Compare, scoring
  surfaces, player modals, and Companion views were moved onto
  `useSleeperLeague()`, `useSleeperStats()`, and progress-only hooks so
  unrelated league/stats updates stop fanning out through those trees.

- `TradeProposalPanel` now combines Intelligence filtering and desktop row
  packing into one memoized pass, and `RosterBrowseModal` now prebuilds player
  sections once while using `content-visibility` on long player/pick rows to
  reduce tab-switch and modal-scroll render cost.

- Partner switches in `CompanionTrade` now run in a transition and
  Intelligence uses a deferred partner key before rebuilding analysis, while
  additional app-shell surfaces are lazy-loaded behind local `Suspense`
  boundaries to keep the main bundle and navigation path lighter.
