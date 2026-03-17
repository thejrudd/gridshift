# NFL Predictor — Roadmap

Future planned work only. Completed items live in CHANGELOG.md. Bugs live in KNOWN_BUGS.md.
New features requested or planned should be added here.

---

## Planned Versions

### v4.5.1 — Heatmap Continued

- **Vegas Odds stat mode** — Add a "Vegas Odds" option to the Stat filter. Instead of Position, show a spread/moneyline/total filter. Color cells red-to-green based on whether the odds were covered (e.g. favored team won by more than the spread = green). Requires a historical odds data source.
- **Game Score box score drill-in** — When the Stat is set to Game Score, tapping a cell opens a box score for that game (final score, key stats) rather than the standard player drilldown.

### v4.6 — Week-by-Week View *(blocked)*

Browse the full schedule by week — see all matchups for a given week, with current predictions reflected. Navigate between weeks via prev/next controls. **Blocked on 2026 season schedule data.** When the NFL releases the 2026 schedule, update the schedule data source and implement this view. Read-only in v4.5 (reflects existing team-level picks); interactive game picking from the week view is a future enhancement.

---
## Backlog (Unversioned)

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
