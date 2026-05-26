# ESPN Fantasy Scoring

This note tracks ESPN-specific fantasy scoring behavior that does not map cleanly to Sleeper-style raw stat calculation.

## D/ST Applied Totals

ESPN D/ST weekly fantasy points may not be present in `playerPoolEntry.stats`. For Eagles D/ST in the 2025 ESPN league debugging session, the correct weekly FPTS lived on schedule roster entries as:

```js
entry.appliedStatTotal
```

The matching D/ST player id is the negative ESPN team defense id, for example:

```js
PHI -> espn:-16021
```

Do not rely on visible public D/ST game-log columns to reproduce ESPN fantasy totals. ESPN can score D/ST items that are not present in the public statistics table, including special-teams and return-yard scoring. When an ESPN schedule roster entry has `appliedStatTotal`, that total is authoritative for the weekly fantasy total. If the same entry also has `appliedStats`, preserve those as `_fantasyContributions` so the Statistics fantasy columns can explain the applied total. Known ESPN stat IDs should map to normal GridShift scoring keys; still-unknown applied stat IDs should be kept as individual `espn_stat_<id>` contribution keys so each fantasy-valued ESPN item renders in its own column.

ESPN D/ST scoring IDs 100 and 110-112 are scoring units, not raw box-score names:

- `100` is `sack_half` (ESPN "1/2 Sack"), derived as sacks times 2 when public game-log data is the fallback.
- `110` is `tkl_3` (every 3 total tackles), and `111` is `tkl_5` (every 5 total tackles).
- `112` is `tkl_loss` / stuffs.
- `114` and `115` are reused by ESPN: base scoring maps to player `kr_yd` / `pr_yd`, while DEF position overrides map to `def_kr_yd` / `def_pr_yd`.
- `116`-`119` are kickoff/punt return-yard interval scoring units.
- `187`-`196` mirror D/ST points-allowed scoring buckets and should map to the normal points-allowed keys.
- `209` is `def_1pt_safe` (ESPN "1pt Safety").

## Duplicate ESPN References

The same D/ST can appear in multiple places in the league payload:

- `schedule[*].home/away.rosterForCurrentScoringPeriod.entries`
- `schedule[*].home/away.rosterForMatchupPeriod.entries`
- `teams[*].roster.entries`
- nested `playerPoolEntry.player` references

Some duplicates carry cumulative or current-roster totals instead of the weekly total. Weekly fantasy rows must be built from schedule entries with a real week/scoring period, not from unscoped team roster snapshots.

When fetching one ESPN week at a time, pass the requested `scoringPeriodId` into `normalizeEspnLeaguePayload()`. The adapter must filter schedule contexts and weekly stat rows to that requested week before converting `entry.appliedStatTotal` into a weekly row. Without this, playoff payloads can leak the selected scoring period's applied total or unscoped team-roster stat rows into other matchup periods, which showed up as Eagles D/ST weeks 16-18 using the wrong totals.

For playoff matchups, `matchupPeriodId` can span more than one scoring period. In that shape, `rosterForCurrentScoringPeriod` belongs to the requested `scoringPeriodId`, even if the enclosing matchup's `matchupPeriodId` is a different week. Do not discard those rows just because the matchup period differs from the requested scoring period.

When a weekly schedule roster entry contains both `entry.appliedStatTotal` and a nested stat row `appliedTotal`, prefer the schedule entry total. ESPN can leave nested weekly stat-row totals stale or partial while the schedule roster entry carries the correct fantasy score used by the matchup and Statistics views.

For ESPN QB/RB/WR/TE rows, raw game-log recalculation is preferred when raw scoring stats are present. ESPN applied totals can omit league-specific categories that are visible in the raw stat breakdown, such as completion/incompletion scoring or team result scoring. Applied totals remain authoritative for K, D/ST, IDP, and applied-only rows because ESPN can score items that are not present or not granular enough in public raw stats.

## Profile Data Flow

Statistics profile fantasy rows use this priority after an ESPN profile refresh:

1. Freshly fetched `fantasyRowsByYear[year]`
2. Active context weekly stats
3. Derived public game-log fallback

For ESPN D/ST profiles, skip active context weekly stats entirely and go straight to the profile weekly fetch. The active context can contain raw-derived D/ST rows from the initial league payload, which makes the page look "loaded" and prevents the applied-total fetch from running on normal route load.

Do not seed ESPN D/ST profile rows with the unscoped base league payload. Use the per-week payloads only. The base payload can carry cumulative/current totals that look like valid weekly rows and can overwrite playoff weeks.

When an ESPN total still cannot be fully explained by mapped `appliedStats`, `PlayerStatTable` should show an `Unmapped ESPN Scoring` residual column rather than silently showing raw-derived columns that do not add up to the total.

The forced browser helper must bypass active context rows:

```js
const debug = window.__GRIDSHIFT_STATISTICS_PROFILE_FANTASY_DEBUG__();
const refreshResult = await debug.refreshActiveYear();
console.log(refreshResult);
```

For a healthy ESPN D/ST import, `refreshResult` should show:

```js
{
  source: 'espn-weekly-league-fallback',
  rowCount: 17,
  rowTotals: [{ week: 1, fantasyPoints: 23 }, ...]
}
```

If the UI table still disagrees after `refreshResult.rowTotals` are correct, the problem is render precedence or `PlayerStatTable` merging, not ESPN fetching.

## Companion Full-Season Load

The initial ESPN league payload can contain only the current scoring period or sparse player-pool rows. Companion season views must not treat the first roster weekly stat as proof that the season is loaded.

For ESPN leagues, `loadSeasonStats()` should fetch each scoring period with both `scoringPeriodId` and `matchupPeriodId`, merge the weekly applied totals, fetch the NFL schedule map, and request the free-agent player pool through `kona_player_info` with ESPN's `x-fantasy-filter` proxy header. Roster, League, Rankings, Matchup, Waiver, and Heatmap should then read from the merged full-weekly context instead of the initial league payload alone.

Companion scoring breakdown sheets should preserve ESPN's weekly applied fantasy total as authoritative, but offensive QB/RB/WR/TE rows may use ESPN public game-log rows to explain that total when the league payload only supplies a final score. Keep that fallback behind ESPN-only helpers so Sleeper weekly rows continue to use Sleeper's native stat payload.

## Console Probe

Use this shape probe when ESPN D/ST scoring regresses:

```js
async function getDstAppliedTotal(week, playerId = '-16021') {
  const params = new URLSearchParams({
    seasonId: '2025',
    scoringPeriodId: String(week),
    matchupPeriodId: String(week),
  });
  ['mRoster', 'mMatchup', 'mMatchupScore', 'mBoxscore', 'kona_player_info'].forEach((view) => params.append('view', view));

  const res = await fetch(`/api/espn/league/2025/81322841?${params}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  const data = await res.json();

  const refs = [];
  function scan(obj, path = '') {
    if (!obj || typeof obj !== 'object') return;
    if (
      String(obj.playerId) === playerId
      || String(obj?.player?.id) === playerId
      || String(obj?.playerPoolEntry?.player?.id) === playerId
    ) {
      refs.push({
        path,
        playerId: obj.playerId,
        appliedStatTotal: obj.appliedStatTotal,
        playerPoolAppliedStatTotal: obj.playerPoolEntry?.appliedStatTotal,
        lineupSlotId: obj.lineupSlotId,
      });
    }
    for (const [key, value] of Object.entries(obj)) scan(value, `${path}.${key}`);
  }
  scan(data, 'data');

  return {
    week,
    totals: [...new Set(refs.map((ref) => ref.appliedStatTotal ?? ref.playerPoolAppliedStatTotal).filter((value) => value != null))],
    refs,
  };
}

console.table((await Promise.all([1,2,3,4,5,6,7,8,10,11,12,13,14,15,16,17,18].map(getDstAppliedTotal))).map((row) => ({
  week: row.week,
  totals: row.totals.join(', '),
  refCount: row.refs.length,
})));
```

The first weekly total from the schedule entry matched ESPN's visible FPTS during the Eagles D/ST investigation.

## Regression Checklist

- Verify `normalizeEspnLeaguePayload()` creates weekly rows from schedule `entry.appliedStatTotal` when `playerPoolEntry.stats` is empty.
- Verify weekly ESPN payload normalization passes `scoringPeriodId` and only builds applied-only rows and weekly stat rows for that requested week.
- Verify requested ESPN `rosterForCurrentScoringPeriod` rows survive playoff payloads where `matchupPeriodId` spans multiple scoring periods.
- Ignore applied-only rows when the schedule week is missing or non-positive.
- Prefer schedule rows over unscoped team roster snapshots.
- Prefer raw stat rows over applied-only rows when both are for the same player/week.
- In `PlayerProfile`, ensure forced ESPN refresh bypasses active context rows and that fetched profile rows render before stale context rows.
- In `PlayerProfile`, ensure ESPN D/ST normal page load also bypasses active context rows, otherwise the route can render raw-derived values without ever fetching ESPN applied totals.
- In `PlayerProfile`, ensure ESPN D/ST profile rows are not seeded from the base league payload; per-week payloads are the authoritative row source.
- In `PlayerStatTable`, split unknown `_fantasyContributions` into individual ESPN stat-ID columns before calculating any residual. If `_fantasyPoints` and visible contribution rows still do not add up, show an `Unmapped ESPN Scoring` residual column so the fantasy table reconciles to the displayed total.
- In `PlayerStatTable`, remember `calcPoints()` returns `_fantasyPoints` before recalculating from raw stats.
