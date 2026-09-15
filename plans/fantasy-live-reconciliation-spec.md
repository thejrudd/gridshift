# Fantasy Live — BDL play feed reconciled against Sleeper (implementation spec)

Owner decisions (Justin, 2026-09-14). These are settled; do not re-open them.

1. **Only BDL plays create feed entries.** Sleeper never generates a feed row. The old
   box-score-diff rows (`buildDeltaEvents` / `source: 'stats-delta'`) and the Codex
   `source: 'sleeper-reconciliation'` ("Sleeper scoring update") rows are removed from
   connected live. One narrow fallback survives (rule 6).
2. **Each play is scored from its own parsed stat delta with the league's Sleeper scoring
   settings** (`buildPlayStatDelta` + `calcPoints`, already in `livePlaysFeed.js`).
3. **Displayed player total = last Sleeper `players_points` + Σ pts of pending plays Sleeper
   has not covered yet.** Never lags BDL, never disagrees with Sleeper for longer than one
   poll. Side total = Σ player displayed totals. Hero, performer rail, pace chart, player
   sheet, feed header all read this one number.
4. **Plays are `pending` until Sleeper confirms them, then `confirmed`.** The UI shows a small
   pending marker; confirmed rows have none.
5. **Residual** (Sleeper points − Σ confirmed play pts) is pinned to the player's latest
   confirmed play as a separate `adjustment` field. The play's own `pts` is never rewritten;
   `displayPts = pts + adjustment`. The scoring-math expansion shows the adjustment line
   ("Sleeper adjustment +0.30"). Residual may be negative (stat corrections).
6. **Fallback row.** When Sleeper's stat line for a player shows stats that no BDL play
   (pending or confirmed) explains — free tier with no plays endpoint, parser miss, coverage
   gap — after a grace period one row per unexplained batch is emitted with `source:
   'stat-update'`, `desc` from `describeDelta(stats)`, `pts = calcPoints(stats)`, status
   `confirmed`, clearly labelled "Stat update" in the UI. It is retired if a later BDL play
   arrives whose stat line matches it (`statLinesMatch`). Never emitted when a play covered it.
7. **Polling.** Sleeper matchups (`getLiveMatchups`, `players_points`) every live refresh (5s
   paid / 60s free, existing cadence). Sleeper stat lines (`getWeeklyStats(season, week)`)
   every 30s while any relevant game is live; once when none are. Stat lines are "fresh" for
   90s after a successful fetch.
8. **Confirmation rule.**
   - Stat-line confirmation (preferred, when fresh): for a player walk pending plays oldest
     first. A play confirms when, for every stat key in the play with a positive value that is
     in `PLAY_MATCH_STATS`, `sleeperStat[key] ≥ confirmedCumulative[key] + play[key] − tol`,
     where tol = 0 for counting stats and 3 for yardage keys (`*_yd`). Out-of-order confirmation
     is allowed only when an older pending play cannot be satisfied and the newer one can.
   - Points-provisional confirmation (always applied after stat-line step, and alone when stat
     lines are stale/absent): `uncovered = sleeperPoints − Σ confirmed pts − Σ adjustments`. If
     `uncovered > 0`, pending plays oldest-first whose cumulative pts ≤ uncovered + 0.5 become
     confirmed (`confirmedBy: 'points'`). This is what stops the displayed total from double
     counting while stat lines are up to 30s behind.
   - Before Sleeper has any data for a player (`players_points[id]` absent): every play is
     pending, displayed = Σ play pts, no adjustment.
9. **State is pure and testable.** `reconcileLivePlays(previousState, inputs)` → newState. Inputs:
   `{ playEvents, sleeperPointsById, sleeperStatsById, sleeperStatsFetchedAt, scoringSettings,
   positionsById, now }`. Output per player: `{ sleeperPoints, pendingPoints, displayedPoints,
   adjustment, plays: [{ ...event, status, confirmedBy, adjustment, displayPts }],
   fallbackEvents }` plus a flat `feedEvents` list newest-first. Deterministic for the same inputs.
10. **Replay sandbox** gets a synthesized Sleeper stream derived from the sliced BDL box
    scores at `(progress − lag)`, scored with the fixture league's settings, plus stat lines from
    the same slice. Lag is configurable (default ≈ 20s of replay slate time); rounding to 0.01.
    So the replay exercises pending→confirmed flips, residual pinning, and the fallback path.
11. **Docs** to update in the same pass: `docs/Fantasy Live.md` (axis-semantics paragraph about
    the "authoritative stat-delta feed" is now wrong), `docs/Fantasy Live Sandbox.md` (feed
    section), `docs/Where To Edit.md` (new util), `KNOWN_BUGS.md` if a tracked bug is closed.
    Keep AGENTS.md and CLAUDE.md untouched unless a rule changes (then byte-identical).
12. **Unconfirmed plays.** A pending play Sleeper has had a fair chance to credit and has not
    becomes `status: 'unconfirmed'`. Two triggers, both requiring fresh stat lines and the play
    still not fitting the stat line: (a) the play's game is final (`finalGameIds` input), or
    (b) the play has been pending longer than `PENDING_TTL_MS` (120000) measured from the
    `firstSeenAt` the engine records on ingest. Never on points alone — points lag too much to
    condemn a play. Unconfirmed plays are excluded from `pendingPoints` and `displayedPoints`,
    keep their `pts`, and carry `displayPts: 0`, `adjustment: 0`, `confirmedBy: null`. They are
    not sticky: a later stat line that fits reinstates the play and confirms it by `'stats'`,
    and the points-provisional walk skips them. Their stats do not count as coverage for the
    rule 6 surplus. Without this a play the parser invented — a fumble Sleeper never charged,
    a snap attributed to the wrong player — moves the displayed total for the rest of the week
    (observed: 31.68 shown against Sleeper's 33.68 in a final game, and +51 of mis-attributed
    plays stacked on one player). The UI labels these rows "Not credited".

## Files

| File | Change |
| --- | --- |
| `src/utils/liveReconciliation.js` | NEW. The pure engine (rules 3–9). |
| `src/utils/livePlaysFeed.js` | Keep `buildPlayEvents`, `buildPlayStatDelta`, `statLinesMatch` (export it), `PLAY_MATCH_STATS` (export it). `mergePlayEvents` stays for demo/preseason only or is deleted if unused. |
| `src/utils/liveScoringFeed.js` | Remove the `sleeper-reconciliation` branch from `buildDeltaEvents` (restore `if (!delta) return;`); `buildDeltaEvents` remains for demo/preseason only. Keep `describeDelta`, `getEventClassification`, `mapBdlStatsToGridShift`, `mergeLiveScoringStats`, `reconcileLiveFantasyPoints` (used by player sheet). |
| `src/components/companion/CompanionLive.jsx` | Connected live: feed = reconciler output. `points` per row = `displayedPoints`. Add 30s stat-line poll. Delete the `preferAuthoritative` path and the `scoped = merged.filter(source !== 'play')` line for connected live. Keep demo timeline and preseason behaviour. |
| `src/components/companion/live/LiveFeed.jsx` | Pending marker, "Stat update" label, adjustment line in scoring-math expansion. Use existing `.fl-*` tokens; no new colours. |
| `src/dev/liveSandbox/liveSandboxSource.js`, `liveSandboxReplay.js`, `index.js` | Synthesized Sleeper stream (rule 10). Replay's `loadMatchups` returns the sliced stream; expose `getWeeklyStatsSlice()`. |
| `tests/unit/liveReconciliation.test.mjs` | NEW. Unit coverage of rules 3–9. |
| `tests/unit/liveReconciliationReplay.test.mjs` | NEW. Fixture replay: `tests/fixtures/bdlNflPlays.json` plays → `buildPlayEvents` → step the reconciler through time with a synthesized lagged Sleeper stream; assert no duplicate `(playerId, sharedPlayId)` rows, every play ends confirmed, Σ displayPts == Sleeper final for each player, adjustment only on latest confirmed play, no fallback rows when coverage is complete, fallback rows appear when plays for one game are withheld. |
| `tests/unit/liveSandboxSleeperStream.test.mjs` | NEW. Synthesized stream is monotone, lagged, rounded, and equals the final when progress = 1. |

## Non-goals

No changes to win-probability, pace-chart geometry, Statistics Scores, the server, or the
Sleeper API client beyond calling existing functions. No new CSS colours. No commits.
