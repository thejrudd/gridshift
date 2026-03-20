# NFL Predictor — Roadmap

Future planned work only. Completed items live in CHANGELOG.md. Bugs live in KNOWN_BUGS.md.
New features requested or planned should be added here.

---

## Planned Versions

### v4.6 — Heatmap Continued

- **O/U filter** - Add a filter when viewing in "Spread" on the heatmap to see a heatmap of which matchups hit the over vs. the under.

### v5.0 — Draft Coach

A new Companion tab to assist with fantasy football drafts, focused on rookies and newly-available players. Surfaces publicly available scouting and evaluation data to help users make informed draft decisions.

#### Scope

**Draft Profile Card** — Per-player card showing:
- NFL Draft slot (round, pick, overall, drafting team)
- College (school, conference, final season stats by position — e.g. completions/attempts/TDs/INTs for QBs, carries/yards/TDs for RBs, targets/catches/yards/TDs for WRs/TEs)
- NFL Combine results: 40-yard dash, vertical, broad jump, 3-cone, shuttle, bench press, height/weight — with percentile grades relative to positional peers
- Consensus big-board rank at time of draft (e.g. Pro Football Focus, The Athletic, PFF dynasty)
- Dynasty rookie ADP (average draft position in dynasty/rookie drafts)

**Position Filters** — Filter the full rookie list by QB, RB, WR, TE (IDP stretch: DL, LB, DB)

**Sort Controls** — Sort by: Overall Draft Pick, Dynasty ADP, Big Board Rank, 40-yard dash, College Production (yards, TDs)

**Rookie Comparison** — Select two rookies to view side-by-side: draft slot, combine, college stats, rankings

**Data Sources** — All data is static/bundled (no live API dependency at launch). Sources:
- Draft results: published post-NFL Draft (April) — scraped or hand-entered into `/src/data/rookies.js`
- Combine stats: publicly available via NFL.com and Pro Football Reference
- Dynasty ADP: KeepTradeCut or Sleeper dynasty consensus at draft time
- Big-board ranks: aggregated from 2–3 major sources, stored as an average rank

**Stretch Goals (post-launch)**
- Prospect comparison against historical rookie comps (e.g. "similar combine profile to Justin Jefferson")
- Live dynasty ADP via KeepTradeCut public API (if available)
- Depth chart position within the drafting team (Day 1 starter vs. depth)


---
## Backlog (Unversioned)

### Season Predictions (Unblocked When Data Available)

- **Week-by-Week View** *(blocked on 2026 schedule data)* — Browse the full schedule by week: all matchups for a given week with current predictions reflected. Navigate between weeks via prev/next controls. When the NFL releases the 2026 schedule, update the schedule data source and implement this view. Read-only at launch (reflects existing team-level picks); interactive game picking from the week view is a future enhancement.

### Fantasy Companion

- **Matchup player drilldown — stats page link** — Include a link to the player's stats page from within the Matchup player drilldown.
- **Roster player drilldown — stat category filter** — Allow filtering weekly stats by category (Pass, Rush, Rec, Defense, All) with a position-appropriate default.
- **Start/sit recommendations** — Companion view that runs `projectPlayer()` across all rostered players and ranks them by projected output within each position group. Surfaces a clear start recommendation for each roster slot.
- **Waiver wire with projections** — Enhance `CompanionWaiver.jsx` with a projected pts column (next-game projection via `projectPlayer()`), a projection-based sort option, and a "trending" indicator for players with recent breakout weeks.
- **Fantasy player comparison (Companion)** — New Companion tab: pick two players from the Sleeper player pool and compare side-by-side: season pts, avg PPG, recent form, positional rank, projection range, and scoring breakdown.
- **Stats player comparison (Statistics)** — Compare mode in `PlayerBrowser`: select two players and view their ESPN career/season stats side-by-side with per-stat deltas highlighted.

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
