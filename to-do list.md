# NFL Predictor — Roadmap

## Versioned Releases

### ~~v2.3 — Search / Filter~~
~~Quick-find a team or filter by division/conference directly from the main predictions view. A search icon in the existing controls row (alongside dark mode toggle, count badge, menu button) expands an inline search/filter bar that slides in below the header between the header and the first team card. Dismissed via X button or completing a search. Zero permanent screen space cost, no interaction with the scroll/collapse system.~~ **Shipped in v2.3.**

### v3.1 — Historical Comparison
Show how your predicted record for each team compares to their actual results from recent seasons. Highlight where you're more bullish or bearish than history.

### v3.0 — Visual Overhaul
A ground-up redesign of the app's visual language and UI consistency. Goals:
- **Bottom tab bar navigation** — split the app into two distinct top-level domains: "Season" (Make Predictions, Standings, Playoff Seeding) and "Players" (Player Browser, Player Profiles, future Fantasy/Sleeper integration). Each tab has its own scroll context and sub-navigation. This is the standard pattern for mobile sports apps (ESPN, NFL app) and scales naturally as each domain grows.
- Unified design system — consistent spacing, typography scale, and color tokens across all views
- Redesigned prediction cards and team rows with richer visual hierarchy
- Improved standings and playoff bracket presentation
- Polished mobile experience with touch-optimized interactions
- Smoother transitions and micro-animations throughout
- **Team color theming** — when viewing a specific team's detail or profile, the UI adopts that team's colors: styled buttons, accent highlights, and iconography derived from the team identity. Requires separate light and dark palettes per team since some primaries contrast better on dark backgrounds and others on light. Highlight/accent colors should be derived from the team's secondary color where the primary is too saturated or low-contrast.

### ~~v4.0 — Fantasy Football / Sleeper League Integration~~ **Shipped in v4.0.**
~~Allow users to connect their Sleeper league and surface fantasy-relevant insights from player stat data. Should include:~~
- ~~Sleeper league import (connect via Sleeper username or league ID)~~ ✓
- ~~Per-player fantasy point totals calculated from historical and current-season stats~~ ✓
- ~~Week to week fantasy scoring updates, rankings, insights, and projections~~ ✓
- ~~Minimum and maximum scoring predictions for each rostered player based on opponent's strength/weakness against their specific position~~ ✓
- ~~Season-long projections and rankings by position under the user's scoring system~~ ✓

**Remaining v4.0 backlog (future):**
- Start/sit recommendations surfaced as an explicit view
- Team rankings for defense against each position (QB, RB, WR, TE) as a standalone table
- Waiver wire / pickup suggestions based on available players and projected output

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
