# NFL Predictor — Roadmap

## Versioned Releases

### ~~v2.3 — Search / Filter~~
~~Quick-find a team or filter by division/conference directly from the main predictions view. A search icon in the existing controls row (alongside dark mode toggle, count badge, menu button) expands an inline search/filter bar that slides in below the header between the header and the first team card. Dismissed via X button or completing a search. Zero permanent screen space cost, no interaction with the scroll/collapse system.~~ **Shipped in v2.3.**

### ~~v3.1 — Favorite Team Theming~~
~~Pick a favorite NFL team to theme the app around their official colors. The team's primary color (with dark-mode-aware variants) overrides the signature amber accent across tab underlines, sidebar nav indicator, progress bar, bottom tab bar, and conference filter toggles. Selection persists in localStorage. Accessible via "My Team" in the sidebar footer (desktop) and the mobile action sheet.~~ **Shipped in v3.1.**

### ~~v3.0 — Visual Overhaul~~
~~A ground-up redesign of the app's visual language and UI consistency.~~ **Shipped in v3.0.**
- ~~**Sidebar + bottom tab bar navigation** — fixed 240px sidebar on desktop; sticky top nav + bottom tab bar on mobile/tablet~~
- ~~Unified design token system — CSS custom properties for color, spacing, and typography across all views~~
- ~~Broadcast Editorial aesthetic — Barlow Condensed display type, signature amber accent~~
- ~~Redesigned prediction cards, standings, and playoff bracket~~
- ~~Polished mobile experience with touch-optimized interactions~~

> **Note:** Per-team color theming inside the team detail modal (adopting that specific team's colors when you open their schedule) was part of the original v3.0 spec but was deferred. The v3.1 global favorite-team theming covers the app-wide accent; in-context detail theming remains a future enhancement.

### ~~v4.0 — Fantasy Football / Sleeper League Integration~~ **Shipped in v4.0.**
~~Allow users to connect their Sleeper league and surface fantasy-relevant insights from player stat data. Should include:~~
- ~~Sleeper league import (connect via Sleeper username or league ID)~~ ✓
- ~~Per-player fantasy point totals calculated from historical and current-season stats~~ ✓
- ~~Week to week fantasy scoring updates, rankings, insights, and projections~~ ✓
- ~~Minimum and maximum scoring predictions for each rostered player based on opponent's strength/weakness against their specific position~~ ✓
- ~~Season-long projections and rankings by position under the user's scoring system~~ ✓

**Remaining v4.0 backlog (future):**
- ~~**Matchup view — opponent defensive strength**: Show how many pts/gm the opponent allows to the player's position alongside an Easy / Avg / Hard difficulty badge. Data already computed by `getOpponentStrength()` in `projectionEngine.js`; needs to be surfaced in the `GameContext` strip of `CompanionMatchup.jsx`.~~ **Shipped in v4.1.**
- ~~**Defense rankings table**: Standalone Companion tab showing all 32 teams ranked by pts allowed per game at each position (QB, RB, WR, TE).~~ **Shipped as Defense Matrix in v4.2/v4.3** — full heatmap with per-position filters, stat modes, team color tinting, drilldown, and sorting.
- **Start/sit recommendations**: Explicit Companion view that runs `projectPlayer()` across all rostered players and ranks them by projected output within each position group. Surfaces a clear start recommendation for each roster slot.
- **Waiver wire with projections**: Enhance `CompanionWaiver.jsx` with a projected pts column (next-game projection via `projectPlayer()`), a projection-based sort option, and a "trending" indicator for players with recent breakout weeks.
- **Fantasy player comparison (Companion)**: New Companion tab — pick two players from the Sleeper player pool and compare them side-by-side: season pts, avg PPG, recent form, positional rank, projection range, and scoring breakdown.
- **Stats player comparison (Statistics)**: Compare mode in `PlayerBrowser` — select two players and view their ESPN career/season stats side-by-side with per-stat deltas highlighted.

### v4.3.3 — Defense Tab Layout *(shipped)*
- ~~Full-bleed table layout on all screen sizes~~ ✓
- ~~Unified labeled filter bar, side-by-side on wide screens~~ ✓

### v4.3.2 — Projection Footnotes *(shipped)*
- ~~Matchup and Snap use plain-English explanations added to projection math drilldown~~ ✓

### v4.3.1 — Polish & Bug Fixes *(shipped)*
- ~~Defense drilldown scroll lock — background no longer scrolls while panel is open~~ ✓
- ~~Season X/32 progress bar hidden outside Predictions tab~~ ✓
- ~~PWA cache bust via package.json version bump~~ ✓

### v4.5 — Week-by-Week View
Browse the full schedule by week — see all matchups for a given week, with current predictions reflected. Navigate between weeks via prev/next controls. **Blocked on 2026 season schedule data.** When the NFL releases the 2026 schedule, update the schedule data source and implement this view. Read-only in v4.5 (reflects existing team-level picks); interactive game picking from the week view is a future enhancement.

---

## Features (Unversioned)

### Season Narrative
Auto-generate a text summary of your predicted season (e.g. "The Bills go 14-3 and clinch the AFC East in Week 15..."). Could include division race storylines, upset picks, and playoff implications. Punted from versioned roadmap — revisit when Apple Intelligence or a viable in-browser LLM option matures.

### Image Export Redesign
Redesign as a compact, shareable summary (~1080x1080, Instagram post size) instead of a raw page screenshot. Show all team picks in a clean grid layout rather than dumping every app view into one tall image.

### Player Info & Rosters — Expanded
The basic player browser and profiles are live. Future expansion should include:
- Interesting tidbits and facts about the player
- Team history and historical records
- Player rankings
- Career length (starting year)

### Historical Comparison
Show how your predicted record for each team compares to their actual results from recent seasons. Highlight where you're more bullish or bearish than history. Originally scoped for v3.1 but replaced by the global team theming feature.

### Compare Mode
Import a friend's exported JSON predictions and diff them against yours — highlight where you agree/disagree, show side-by-side records, and surface the biggest divergences.

---

## ChatGPT Suggested

### Shareable Prediction Card
A dedicated `<PredictionCard />` component that renders a clean per-team card showing:
- Team name and logo
- Predicted record
- Projected seed
- Division finish

Export via canvas (`useRef` → render to canvas → `toBlob()`), avoiding HTML screenshot limitations.

### Monte Carlo Simulation (Client-Side)
Run 1,000 in-memory simulations using win probabilities derived from binary picks. Store results in a `Map` and calculate playoff odds as a percentage. Use a Web Worker if scaling above 5,000 simulations.

Architecture: all simulation logic isolated in `/utils/simEngine.ts`, triggered only when picks change (not on every re-render).

### Playoff Leverage Index
For each game, run two simulations — one with each team winning — and compare the resulting playoff probability delta. Display something like: *"This game swings playoff odds by 18%."* Built on top of the Monte Carlo simulation engine.

### Strength of Schedule Bias Slider
A global "Team Rating Bias" slider that bumps win probability by ~5–7% per unit and applies the modifier before simulation runs.

### Future Analytics (Post-Simulation)
- Weekly playoff probability graph (Recharts)
- Momentum graph per team
- Seed movement animation (Tailwind transitions)

---

## Claude Suggested

### Community & Social

#### Shareable Links
Encode predictions into a URL hash so users can share a link instead of a file — no import/export needed, just copy and send.

#### Leaderboard / Accuracy Tracker
Once the real season starts, track how accurate each user's predictions were week by week. Compare predicted outcomes to actual results as the season unfolds.

### UX Enhancements

#### Undo/Redo
Add undo support so users can back out of recent changes without resetting everything.

### Data & Analytics

#### Strength of Schedule Visualization
A chart or ranking showing each team's predicted strength of schedule based on your picks.

#### Win Probability Overlay
Pull Vegas odds or public power rankings to show how your picks compare to consensus.

#### Draft Order Projection
Show projected draft order for non-playoff teams based on predicted records.

### Polish

#### Richer PWA Install UI *(backburner)*
Add `screenshots` to the web manifest so Chrome shows the enhanced install dialog with app previews. Requires one desktop screenshot (1280×800, `form_factor: wide`) and one mobile screenshot (390×844, `form_factor: narrow`) saved to `public/screenshots/` and referenced in the `screenshots` array in `vite.config.js`. Non-blocking — basic install prompt works without this.

#### Confetti / Animations
Celebrate when all 32 teams are predicted and the season is valid.
