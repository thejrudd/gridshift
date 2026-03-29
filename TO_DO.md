# NFL Predictor — Roadmap

Future planned work only. Completed items live in CHANGELOG.md. Bugs live in KNOWN_BUGS.md.
New features requested or planned should be added here.

---

## Planned Versions

### v6.1 — Trade Detail Drilldowns

Builds on the Trade suite by making proposal assets interactive and easier to evaluate without leaving the flow.

- **Clickable Trade Asset Cards** — Allow player cards in Trade → Intelligence, Agent, and Upgrades to be tapped/clicked to open a centered player detail modal
- **Shared Player Stats Modal** — Use the same underlying player-stat data source that powers the Statistics section so modal data stays aligned with the rest of the app
- **Direct Link to Full Player Stats Page** — Include a clear CTA from the modal to jump straight into that player’s dedicated Statistics view for deeper analysis

### v7.0 — Draft Coach

Surfaces publicly available scouting and evaluation data to help users make informed draft decisions.

- **Draft Profile Card** — Per-player card showing: NFL Draft slot (round, pick, overall, drafting team), college stats by position (completions/attempts/TDs/INTs for QBs, carries/yards/TDs for RBs, targets/catches/yards/TDs for WRs/TEs), NFL Combine results (40-yard dash, vertical, broad jump, 3-cone, shuttle, bench press, height/weight) with percentile grades relative to positional peers, consensus big-board rank, and dynasty rookie ADP
- **Position Filters** — Filter the full rookie list by QB, RB, WR, TE (IDP stretch: DL, LB, DB)
- **Sort Controls** — Sort by: Overall Draft Pick, Dynasty ADP, Big Board Rank, 40-yard dash, College Production (yards, TDs)
- **Rookie Comparison** — Select two rookies to view side-by-side: draft slot, combine results, college stats, rankings
- **Data Sources** — All data is static/bundled (no live API dependency at launch): draft results hand-entered into `/src/data/rookies.js`, combine stats from NFL.com / Pro Football Reference, dynasty ADP from KeepTradeCut or Sleeper consensus, big-board ranks averaged from 2–3 major sources

**Stretch Goals (post-launch)**
- Prospect comparison against historical rookie comps (e.g. "similar combine profile to Justin Jefferson")
- Live dynasty ADP via KeepTradeCut public API (if available)
- Depth chart position within the drafting team (Day 1 starter vs. depth)

---

## Optimizations

- **Trade proposal card desktop sizing polish** — Continue refining desktop card sizing so larger cards remain crisp and readable without reintroducing vertical text overflow or awkward package wrapping on narrower desktop widths.
- **Lint modernization / cleanup pass** — Resolve the current ESLint backlog across the app so `npm run lint` passes cleanly. Prioritize the new Trade surfaces and active Companion areas first, then address broader React hook/state-effect warnings, unused vars, Fast Refresh export issues, and config globals like `__APP_VERSION__`.
- **Trade valuation path deduplication** — Consolidate roster search, roster browse, partner preview, and side-card value calculations onto a shared helper so player availability, estimated values, and additive totals stay consistent across all Trade entry points.
- **Companion tab load-time optimization** — Improve initial and first-open load times across all Companion tabs by preloading shared data more intentionally, deferring non-critical derivations, reducing duplicate calculations between tabs, and minimizing context-driven rerenders.
- **Companion Heatmap first-open performance** — Optimize initial load by reducing eager table computation, avoiding unnecessary recomputes after stat enrichment, and limiting context-driven rerenders from unrelated state like progress updates.
- **Reduce Heatmap `loadSeasonStats` fetch time** — Companion → Heatmap now avoids blocking on pass-2 enhancement and uses a faster local offense table builder, but the next likely optimization is reducing the raw `loadSeasonStats` fetch cost. This is a different class of optimization and riskier because it touches the shared season-stats loading path.

## Backlog (Unversioned)

### Season Predictions (Unblocked When Data Available)

- **Week-by-Week View** *(blocked on 2026 schedule data)* — Browse the full schedule by week: all matchups for a given week with current predictions reflected. Navigate between weeks via prev/next controls. When the NFL releases the 2026 schedule, update the schedule data source and implement this view. Read-only at launch (reflects existing team-level picks); interactive game picking from the week view is a future enhancement.

### Fantasy Companion

- **Roster player drilldown — stat category filter** — Allow filtering weekly stats by category (Pass, Rush, Rec, Defense, All) with a position-appropriate default.
- **Start/sit recommendations** — Companion view that runs `projectPlayer()` across all rostered players and ranks them by projected output within each position group. Surfaces a clear start recommendation for each roster slot.

### Season Predictions

- **Season Narrative** — Auto-generate a text summary of your predicted season (e.g. "The Bills go 14-3 and clinch the AFC East in Week 15..."). Punted from versioned roadmap — revisit when Apple Intelligence or a viable in-browser LLM option matures.
- **Historical Comparison** — Show how your predicted record compares to each team's actual results from recent seasons. Highlight where you're more bullish or bearish than history.
- **Compare Mode** — Import a friend's exported JSON predictions and diff against yours: side-by-side records, agree/disagree highlights, biggest divergences.
- **Image Export Redesign** — Redesign as a compact ~1080x1080 shareable summary instead of a raw page screenshot.

### Player Info

- **Player Info & Rosters — Expanded** — Interesting tidbits and facts, team history and records, career length (starting year), player rankings.
- **Per-team detail theming** — When opening a team detail modal, adopt that specific team's colors. Deferred from v3.0; global favorite-team theming (v3.1) covers app-wide accent.

### Analytics

- **Strength of Schedule Visualization** — Chart or ranking showing each team's predicted strength of schedule based on your picks.
- **Draft Order Projection** — Show projected draft order for non-playoff teams based on predicted records.
- **Win Probability Overlay** — Pull Vegas odds or public power rankings to show how your picks compare to consensus.
- **Monte Carlo Simulation** — 1,000 in-browser simulations using win probabilities; playoff odds as percentages. Web Worker for scale. All logic in `/utils/simEngine.ts`.
- **Playoff Leverage Index** — For each game, show the playoff probability delta between the two outcomes. Built on Monte Carlo.

### Polish

- **Confetti / Animations** — Celebrate when all 32 teams are predicted and the season is valid.
- **Richer PWA Install UI** — Add `screenshots` to the web manifest for the enhanced Chrome install dialog. Requires desktop (1280×800) and mobile (390×844) screenshots in `public/screenshots/` referenced in `vite.config.js`. Non-blocking — basic install prompt works without this.
- **Shareable Links** — Encode predictions into a URL hash for sharing without import/export.
- **Undo/Redo** — Allow users to back out of recent changes without a full reset.
