# GridShift — Roadmap

Roadmap and active release work. Completed items live in CHANGELOG.md. Bugs live in KNOWN_BUGS.md.
New features requested or planned should be added here.

---

## Planned Versions

## Optimizations

- **Trade proposal card desktop sizing polish** - Continue refining desktop card sizing so larger cards remain crisp and readable without reintroducing vertical text overflow or awkward package wrapping on narrower desktop widths.
- **Lint modernization / cleanup pass** - Resolve the current ESLint backlog across the app so `npm run lint` passes cleanly. Prioritize the new Trade surfaces and active Companion areas first, then address broader React hook/state-effect warnings, unused vars, Fast Refresh export issues, and config globals like `__APP_VERSION__`.
- **Trade valuation path deduplication** - Consolidate roster search, roster browse, partner preview, and side-card value calculations onto a shared helper so player availability, estimated values, and additive totals stay consistent across all Trade entry points.
- **Companion tab load-time optimization** - Improve initial and first-open load times across all Companion tabs by preloading shared data more intentionally, deferring non-critical derivations, reducing duplicate calculations between tabs, and minimizing context-driven rerenders.
- **Companion Heatmap first-open performance** - Optimize initial load by reducing eager table computation, avoiding unnecessary recomputes after stat enrichment, and limiting context-driven rerenders from unrelated state like progress updates.
- **Draft tab load-time optimization** - Keep Draft tab switching responsive by reusing cached draft sync state and matching Draft model builds across War Room, Board, and Results instead of rebuilding everything on every tab return.
- **Reduce Heatmap `loadSeasonStats` fetch time** - Companion -> Heatmap now avoids blocking on pass-2 enhancement and uses a faster local offense table builder, but the next likely optimization is reducing the raw `loadSeasonStats` fetch cost. This is a different class of optimization and riskier because it touches the shared season-stats loading path.

## Backlog (Unversioned)

### Scout

- **Next-season fantasy projection layer for rookies** - Add a fantasy-facing projection surface for the upcoming NFL season so Scout can serve both standard rookie boards and IDP-aware formats without overloading the current prospect filters. Scope should cover offensive and IDP leagues, projection source-of-truth, display hierarchy, and how projections interact with draft status and college production.

### Deferred / Tabled

- **Companion Roster draft-market lens (tabled)** - Revisit ADP or draft-market roster values after identifying a reliable, legally usable data source with broad offensive coverage, configurable league format support, and a clear plan for IDP or missing-player estimates. The Fantasy Football Calculator attempt was removed because API coverage left many rostered players blank.
- **League-scoped shareable links (tabled from v6.5)** - Revisit after current performance and drilldown unification priorities. Scope remains: league-aware Companion/Trade URLs, league id format decision, ownership validation, connect-flow handoff, mismatch UX, and strict shareability boundaries.
- **Shareable-link first phase (tabled from v6.3)** - Revisit page + selected-player URL sharing after the current Companion/Trade stabilization passes are complete.

### New Technologies

- **Open Pencil evaluation** - Investigate how Open Pencil's drafting, editing, and text-workflow concepts could inform future GridShift writing surfaces such as player narratives, matchup writeups, trade explanations, export copy, or guided content-generation tools.
- **Pretext evaluation** - Investigate how Pretext's rich-text / structured-editor concepts could support future in-app note-taking, report building, annotation, or editorial workflows tied to Trade, Draft Coach, or Statistics drilldowns.
- **balldontlie NFL API evaluation** - Evaluate whether BALLDONTLIE NFL can power a live scoring layer for games, drives, injuries, standings, play-by-play, and betting-adjacent context, with strict rate-limit protection and a server-side key boundary before any production use.
- **LeagueLogs fantasy API evaluation** - Evaluate whether the free LeagueLogs API can supplement Trade, Companion, or Scout with redraft/dynasty player values, rookie pick values, Sleeper-keyed player data, player status/news blurbs, and NFL state. Verify data provenance, refresh cadence, attribution requirements, durability, and licensing before use. Reddit note: [Built a free fantasy football API](https://www.reddit.com/r/fantasyfootballcoding/comments/1t1xzg4/built_a_free_fantasy_football_api_redraft_dynasty/); docs: [developer.leaguelogs.com](https://developer.leaguelogs.com).
- **Authentication / memberships architecture** - Design a self-host-friendly auth system that lets hosts control access, optionally charge memberships to cover hosting/API costs, and leaves room for a future licensing model that could support commercial hosting with royalties back to the project owner.

### Season Predictions (Unblocked When Data Available)

- **Interactive week-by-week picks** - Extend the schedule surface with a week-first prediction flow so users can pick games directly from the full weekly slate instead of entering game picks only through a team drilldown.

### Fantasy Companion
- **Team tendencies and usage projections** - Add team offense/defense rankings, sortable league/conference/division tables, fantasy matchup context, and the usage-based projection model. See `docs/Projection Usage Model Plan.md`.
- **Rankings week filter** - Let users view weekly player performances while keeping Season as the default Rankings view.
- **Fantasy-team identity in Rankings** - Show each rostered player's fantasy team when space allows and remove the redundant “Rostered” label in those layouts.
- **Backtested player projection model** - Build a walk-forward player projection model from historical Sleeper lineups/scoring and nflverse play-by-play, with rolling player usage plus as-of-week NFL team and opponent strength. Validate it against an untouched holdout before replacing projections outside Fantasy Live.
- **Matchup-linked league records** - Link highest score, biggest blowout, and narrowest win records directly to their referenced Fantasy Matchups week and team, including linked historical seasons.
- **Visual League Activity feed** - Add player headshots, NFL team-color identity, Sleeper fantasy-team avatars, glanceable transaction glyphs, and default-collapsed summaries for large multi-move entries.
- **Roster player drilldown - stat category filter** - Allow filtering weekly stats by category (Pass, Rush, Rec, Defense, All) with a position-appropriate default.
- **Start/sit recommendations** - Companion view that runs `projectPlayer()` across all rostered players and ranks them by projected output within each position group. Surfaces a clear start recommendation for each roster slot.
- **Expanded league-history records** - Add highest score in a loss, lowest score in a win, lowest team score, highest combined matchup score, highest individual starter and bench scores, most points left on the bench, and the largest share of a weekly team score from one starter.

### Season Predictions

- **Season Narrative** - Auto-generate a text summary of your predicted season (e.g. "The Bills go 14-3 and clinch the AFC East in Week 15..."). Punted from versioned roadmap - revisit when Apple Intelligence or a viable in-browser LLM option matures.
- **Historical Comparison** - Show how your predicted record compares to each team's actual results from recent seasons. Highlight where you're more bullish or bearish than history.
- **Compare Mode** - Import a friend's exported JSON predictions and diff against yours: side-by-side records, agree/disagree highlights, biggest divergences.
- **Image Export Redesign** - Redesign as a compact ~1080x1080 shareable summary instead of a raw page screenshot.

### Player Info

- **Player Info & Rosters - Expanded** - Interesting tidbits and facts, team history and records, career length (starting year), player rankings.
- **Flavor text for player cards** - Fun (and sometimes not so fun) facts about certain players, that function like flavor text on a trading card.
- **Per-team detail theming** - When opening a team detail modal, adopt that specific team's colors. Deferred from v3.0; global favorite-team theming (v3.1) covers app-wide accent.

### Analytics

- **Strength of Schedule Visualization** - Chart or ranking showing each team's predicted strength of schedule based on your picks.
- **Draft Order Projection** - Show projected draft order for non-playoff teams based on predicted records.
- **Win Probability Overlay** - Pull Vegas odds or public power rankings to show how your picks compare to consensus.
- **Monte Carlo Simulation** - 1,000 in-browser simulations using win probabilities; playoff odds as percentages. Web Worker for scale. All logic in `/utils/simEngine.ts`.
- **Playoff Leverage Index** - For each game, show the playoff probability delta between the two outcomes. Built on Monte Carlo.

### Polish

- **Confetti / Animations** - Celebrate when all 32 teams are predicted and the season is valid.
- **Richer PWA Install UI** - Add `screenshots` to the web manifest for the enhanced Chrome install dialog. Requires desktop (1280x800) and mobile (390x844) screenshots in `public/screenshots/` referenced in `vite.config.js`. Non-blocking - basic install prompt works without this.
- **Shareable Links** - Encode predictions into a URL hash for sharing without import/export.
- **Undo/Redo** - Allow users to back out of recent changes without a full reset.
