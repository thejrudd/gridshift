# NFL Predictor — Roadmap

Future planned work only. Completed items live in CHANGELOG.md. Bugs live in KNOWN_BUGS.md.
New features requested or planned should be added here.

---

## Planned Versions

### ~~v4.7 — Waiver Wire Enhancements~~ ✓ Complete — see CHANGELOG

---

### v4.8 — League Browser

Give users full visibility into the league: opponent rosters and the draft pick landscape across all teams.

- **Opponent roster view** — Browse any league member's full roster with the same depth as the existing Roster view: season stats, avg PPG, positional rank, and weekly breakdown. Accessible via a team selector on the Roster view or a new League sub-tab in Companion
- **Draft capital overview** — A league-wide picks grid showing every team's currently owned draft picks (round, originating team, year) pulled from Sleeper's picks/transactions data. Shows at a glance who is pick-rich and who has traded away future capital

---

### v4.9 — Player Comparison

Side-by-side player comparison in both the Companion (fantasy) and Statistics (career) contexts.

- **Companion comparison** — Pick any two players from the Sleeper player pool (rostered or on waivers in the league) and compare side-by-side: season pts, avg PPG, recent form (last 4 weeks), positional rank, projection range for the upcoming week, and scoring breakdown. Accessible via a Compare button on player cards or a dedicated Compare sub-tab
- **Statistics comparison** — Compare mode in `PlayerBrowser`: search and select any two ESPN players to view their career/season stats side-by-side with per-stat delta highlighting. Integrated into the existing Statistics tab as a toggle mode rather than a separate top-level tab

---

### v5.0 — Draft Coach & Trade Agent

Two new Companion tools: a rookie scouting hub for draft season, and an AI-assisted trade evaluator.

#### Draft Coach

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

#### Trade Agent

Assess trade value for any player and generate trade proposals in either direction.

- **Trade value assessment** — For any player in the league, display their estimated trade value and generate trade proposals: what you could offer from your roster + draft capital to acquire them, or what you could expect to receive in return for trading them away
- **Trade value data** — Primary: KeepTradeCut public API for live dynasty/redraft values. Fallback: in-app calculated value derived from projected pts, positional rank, roster scarcity, and draft capital position when KTC is unavailable or the player isn't found
- **Roster context** — Trade recommendations account for current roster composition (positional depth, starter quality), available waiver alternatives at that position, and draft capital — leveraging the data infrastructure built in v4.8
- **Two directions** — Evaluate trades involving your own players (what to give up) or target players on other rosters (what to offer), using the league roster browser from v4.8 and the comparison framework from v4.9

---

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
