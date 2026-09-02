# GridShift — Roadmap

Roadmap and active release work. Completed items live in CHANGELOG.md. Bugs live in KNOWN_BUGS.md.
New features requested or planned should be added here.

---

## Product Principles

GridShift is a labor-of-love project: it should create something genuinely useful or fun, not maximize revenue or feature volume.

- **Free and open source** — Keep the core app free to use, openly licensed, and practical to self-host.
- **No sportsbook or wagering product** — Fantasy football contests, league management, projections, and relevant football analytics are in scope. GridShift will not facilitate sportsbook wagers, prop bets, wager placement, sportsbook or affiliate links, betting calls to action, or betting monetization.
- **Privacy and simplicity first** — The core app should remain device-first and usable without authentication or required server-side personal-data storage.
- **Optional cost boundaries** — Paid data sources and hosted deployments may exist when necessary, but they must remain optional, transparent, and separate from the core application.
- **Sustainable stewardship** — Support the project through voluntary contributions, sponsorships, paid official hosting, or support services.
- **Quality over slop** — Prefer thoughtful, well-tested features that make GridShift more useful or enjoyable over novelty, growth, or monetization for its own sake.

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

### Live Data Infrastructure

- **Broaden play-by-play fixture coverage** - Capture postseason and weather-affected games and extend playback and narration for any remaining fallbacks, especially laterals, muffed punts, blocked kicks, safeties, and multi-penalty plays.
- **Replace estimated pass-flight geometry when source data exists** - BALLDONTLIE and the ESPN summary do not expose air yards, catch spots, or yards after catch, so playback currently uses the official description's short/deep qualifier only to position the ball. Keep displayed yardage provider-backed; replace the estimate only if a reliable source becomes available.

- **Complete Phase 1 league isolation** - Build first-viewer/two-minute-warm Fantasy Live ingest lifecycle, per-league fair-use allocations, the five-hot-league GOAT ceiling, full operational metrics, broader public detail validation, and tier-adaptive Fantasy Live degradation. The shared page-aware gateway, bounded cache/coalescing, protected near-live Statistics Scores lane, provider-anchored clock, public live-route guard, backoff, and ESPN fallback are implemented. See `docs/Live Data Server Architecture.md`.
- **Phase 2 — League-managed BALLDONTLIE keys** - Let a league-session holder attach one league-specific credential without exposing it to the browser, logs, or other leagues. Store keys with envelope encryption, isolate budgets and caches by credential, enforce tier-based league limits, support provider-side rotation instead of a GridShift remove action, and run scheduled suspect/dead-key cleanup with a non-secret credential index.
- **Phase 3 — Horizontally scalable live-data delivery** - Move snapshots, rate state, credential indexes, and ingest leases out of process memory; add a shared cache and one elected/dedicated poller, stateless API replicas, bounded retention, backpressure, and changed-snapshot delivery through SSE or equivalent. Load-test and certify the path from 100 toward 1,000 active leagues/viewers.

### Deferred / Tabled

- **Companion Roster draft-market lens (tabled)** - Revisit extending optional draft-market context into roster values only after validating coverage, league-format behavior, and a clear plan for IDP or missing-player estimates. The current server-only BALLDONTLIE ADP enrichment is limited to preseason Rankings and Draft decisions and does not replace league-aware roster values.
- **League-scoped shareable links (tabled from v6.5)** - Revisit after current performance and drilldown unification priorities. Scope remains: league-aware Companion/Trade URLs, league id format decision, ownership validation, connect-flow handoff, mismatch UX, and strict shareability boundaries.
- **Dynamic social/embed cards** - Vite now serves route-aware HTML metadata during development and emits static preview entry points for the main routes and known NFL team pages; the client also updates metadata after navigation. Add server-side or edge-rendered metadata for arbitrary query-driven player/game pages, canonical preview images, and a focused public iframe route when social crawlers and league-safe embeds are worth the added hosting boundary.
- **Season Narrative (deferred)** - Revisit only if a practical in-browser generation path matures; keep the core feature free and avoid making a hosted AI service or paywall a requirement.
- **Per-team detail theming (deferred from v3.0)** - Do not pursue as a separate feature while global favorite-team theming remains the app-wide accent model.

### New Technologies

- **Open Pencil evaluation** - Investigate how Open Pencil's drafting, editing, and text-workflow concepts could inform future GridShift writing surfaces such as player narratives, matchup writeups, trade explanations, export copy, or guided content-generation tools.
- **Pretext evaluation** - Investigate how Pretext's rich-text / structured-editor concepts could support future in-app note-taking, report building, annotation, or editorial workflows tied to Trade, Draft Coach, or Statistics drilldowns.
- **LeagueLogs fantasy API evaluation** - Evaluate whether the free LeagueLogs API can supplement Trade, Companion, or Scout with redraft/dynasty player values, rookie pick values, Sleeper-keyed player data, player status/news blurbs, and NFL state. Verify data provenance, refresh cadence, attribution requirements, durability, and licensing before use. Reddit note: [Built a free fantasy football API](https://www.reddit.com/r/fantasyfootballcoding/comments/1t1xzg4/built_a_free_fantasy_football_api_redraft_dynasty/); docs: [developer.leaguelogs.com](https://developer.leaguelogs.com).
- **Optional hosted-deployment architecture** — Keep GridShift free, open source, ad-free, and self-hostable without authentication. If future hosted deployments need access control or optional memberships to cover their own hosting/API costs, keep those services opt-in, host-controlled, and separate from the core application. Support project sustainability through voluntary contributions, sponsorships, paid official hosting, or support services—not required royalties on independent hosts.

### Draft Assistant

- **Draft strategy modes (tabled)** — Revisit the former Gauntlet and Tiers/Runs concepts only after defining the user problem, workflow, and success criteria; they are intentionally not part of the current Draft navigation or route model.

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

- **Historical Comparison** - Show how your predicted record compares to each team's actual results from recent seasons. Highlight where you're more bullish or bearish than history.
- **Compare Mode** - Import a friend's exported JSON predictions and diff against yours: side-by-side records, agree/disagree highlights, biggest divergences.
- **Prediction outcome grading** - Compare a saved, season-stamped prediction snapshot with the completed NFL season, explain what was right or wrong, and award a transparent letter grade. Reuse the v8.8 snapshot schema so exported/shared picks and later grading evaluate the same committed prediction set.

### Player Info

- **Player Info & Rosters - Expanded** - Interesting tidbits and facts, team history and records, career length (starting year), player rankings.
- **Flavor text for player cards** - Fun (and sometimes not so fun) facts about certain players, that function like flavor text on a trading card.

### Analytics

- **Strength of Schedule Visualization** - Chart or ranking showing each team's predicted strength of schedule based on your picks.
- **Draft Order Projection** - Show projected draft order for non-playoff teams based on predicted records.
- **Public Consensus Comparison** - Pull public, non-betting power rankings or consensus projections to show how your picks compare to external expectations. Do not use sportsbook odds, spreads, props, or gambling links.
- **Monte Carlo Simulation** - 1,000 in-browser simulations using win probabilities; playoff probabilities as percentages. Web Worker for scale. All logic in `/utils/simEngine.ts`.
- **Playoff Leverage Index** - For each game, show the playoff probability delta between the two outcomes. Built on Monte Carlo.

### Polish

- **Confetti / Animations** - Celebrate when all 32 teams are predicted and the season is valid.
- **Richer PWA Install UI** - Add `screenshots` to the web manifest for the enhanced Chrome install dialog. Requires desktop (1280x800) and mobile (390x844) screenshots in `public/screenshots/` referenced in `vite.config.js`. Non-blocking - basic install prompt works without this.
- **Undo/Redo** - Allow users to back out of recent changes without a full reset.
