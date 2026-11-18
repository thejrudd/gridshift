# Play Feed Audit

GridShift has to score plays correctly from the play feed alone, with no fantasy league connected. Parsing and play-pricing rules improve from evidence: completed weeks are rebuilt from the feed and compared stat by stat with the official record, and real mismatches are fixed at their cause. Don't add rules for problems no audit has shown.

## Running it

```
npm run audit:plays -- --week 8          # one week
npm run audit:plays -- --weeks 1-8       # a range
npm run audit:plays                      # the last fully completed week
```

The BALLDONTLIE key is read from `.env` and stays local. Raw downloads are cached under `tmp/play-audit/cache/`; finished games never change, and `--refresh` refetches them.

Output per week, in `tmp/play-audit/<season>/week-<n>/`:

- `summary.md`: the match rate for each stat, the team defense table, and both mismatch lists.
- `mismatches.json`: one row per player and stat, with GridShift's value, Sleeper's official value, ESPN's box-score value where ESPN has one, whether the two official sources agree, the plays that credited the stat, and any feed rows naming the player that credited nothing.

## How it compares

- Plays go through `buildPlayEvents()` exactly as Fantasy Live reads them, with the name index built from both full rosters plus everyone the game's ESPN box score lists, on the team they played for (players traded since are still found).
- Official values are Sleeper's final weekly stat lines, using the reconciler's aliases (`idp_pass_def`, `idp_qb_hit`, `idp_fum_rec`); tackles are compared as one total and as the solo/assisted split each play is priced at (`getPricedTackleKey` with the event's `tackleShare`), skipped for a line that reports no split. ESPN's box score is the cross-check.
- Every stat must match exactly. Audit scoring gives counts a weight of 1 and yards 0.01, so no play is dropped as worth nothing.
- Team defense lines (Sleeper's DEF rows, keyed by team abbreviation) are compared separately, in Sleeper's keys: `int`, `int_ret_yd`, `fum_rec`, `fum_ret_yd`, `ff` (GridShift's `def_ff`), `sack`, `sack_yd`, `safe`, `def_td`, `blk_kick`, `tkl_loss`, `def_pass_def`, `def_4_and_stop`, and the special-teams `def_st_*`, `def_kr_yd`, `def_pr_yd`. They have their own table and mismatch list (`teamMismatches`) and never mix into the player totals. Sleeper files a force or tackle by the offense after a turnover as `ff_misc` / `tkl_solo_misc`, which no league scores and the audit does not compare.

## Reading mismatches

- **Parser or pricing error**: GridShift read the feed wrong. Fix the rule, test the old and new rule across all audited weeks, and add a regression test from the real play.
- **The official sources disagree**: usually a stat correction one of them hasn't applied yet. Recheck after Wednesday before treating it as evidence.
- **Provider gap**: the official stat has a play no feed row records (week 8: one of Tony Pollard's carries is missing from both BALLDONTLIE and ESPN play-by-play). The play feed can't fix this; note it and move on.

## Results

v9.5 parser pass, phase 2 (weeks 1–10 of 2026, offline from the cached
downloads): player stats 27,931/28,757 → 28,240/28,760 (826 → 520
mismatches; 595 → 293 without the solo/assisted tackle split), team defense
2,582/2,721 → 2,600/2,721 (139 → 121). First downs 159 → 4. The rules and
their evidence are in [[Play-By-Play Normalization]] ("First downs",
"Penalties and reversals", "Edge cases checked against Sleeper").

A weekly scheduled run audits the latest completed week every Wednesday morning and publishes a report. It changes no code: clear causes come with a proposed fix, and unclear ones are written up for a decision.
