# Season Schedule Format

`public/season-schedule.json` feeds the week-by-week Predictions schedule UI. Keep it valid JSON and sparse-friendly: empty weeks are allowed and should be represented as empty arrays.

## Top-Level Shape

```json
{
  "season": 2026,
  "weeks": {
    "1": [],
    "2": []
  }
}
```

- `season`: NFL season year as a number.
- `weeks`: object keyed by week number strings from `"1"` through `"18"`.
- Each week value is an array of game objects. Use `[]` until that week's real schedule is known.

## Game Shape

```json
{
  "id": "2026-W01-DAL-PHI",
  "week": 1,
  "awayTeam": "DAL",
  "homeTeam": "PHI",
  "kickoff": "2026-09-10T00:20:00Z",
  "network": "NBC",
  "broadcasts": [
    {
      "name": "NBC",
      "logo": "https://a.espncdn.com/.../default.png",
      "darkLogo": "https://a.espncdn.com/.../default-dark.png"
    }
  ],
  "location": "Lincoln Financial Field"
}
```

Required when adding real games:

- `awayTeam`: uppercase GridShift/NFL team id.
- `homeTeam`: uppercase GridShift/NFL team id.

Optional:

- `id`: stable id. If omitted, the app derives one from season, week, away, home, and index.
- `week`: useful for readability; the week key still controls placement.
- `kickoff`: ISO timestamp when known, preferably UTC.
- `network`, `broadcasts`, `location`, `neutralSite`, `status`: display metadata for schedule UI.
- `broadcasts`: optional array of broadcaster display objects. `name` is required per object; `logo` and `darkLogo` are optional image URLs. Keep `network` as a text fallback.

## Population Rules

- Keep all 18 week keys present, even if some are empty.
- Do not invent kickoff times. Leave `kickoff` out if unknown.
- Use team ids already used by GridShift, such as `BUF`, `KC`, `LAR`, `WSH`.
- One NFL game appears once, under its actual week, with one `awayTeam` and one `homeTeam`.
- Avoid comments and trailing commas; this file must remain strict JSON.

## Live Result Hydration

The static file ships without scores, so every schedule-driven surface would read
0-0 forever. `src/hooks/useSeasonScheduleResults.js` merges live results into the
loaded schedule before it reaches `buildPredictionScheduleModel` in `src/App.jsx`,
which is what Statistics Standings, Statistics Schedule, and the Game view all
consume.

- `src/utils/seasonScheduleResults.js` owns the merge. It matches on
  `espnEventId` first and falls back to the `AWAY@HOME` matchup inside the week.
- Only `status`, `statusDetail`, `awayScore`, `homeScore`, and `completed` are
  rewritten. Game ids, weeks, and matchups are never touched, because
  `createScheduleFingerprint` is built from exactly those fields and a change
  would invalidate every synced prediction snapshot.
- Weeks are requested through the server-proxied ESPN scoreboard only once their
  first kickoff has passed. Polling runs while a started week still holds a
  non-final game and stops once every started week is settled.
- Do not add scores to the static JSON to work around a stale surface; fix the
  hydration path instead.
