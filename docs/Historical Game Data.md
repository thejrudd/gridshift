# Historical NFL Game Data

Back: [[Home]]

## Scope Decision

GridShift's historical NFL data boundary is the 1999 season. The storage model, import pipeline, and server APIs must support every season from 1999 forward without later schema changes.

Statistics Scores will initially expose only the five most recent NFL seasons. For the 2026 application season, that window is 2022–2026, including the active season. The visible window is a server configuration and product decision, not a storage limitation.

The first release must contain real data only. It must never fall back to synthetic matchups under a historical season label.

## Product Boundaries

### Initial Statistics Scores release

- Visible seasons: 2022, 2023, 2024, 2025, and 2026.
- Season phases: preseason, regular season, and postseason when the source provides them.
- Scoreboard: accurate schedule, kickoff, teams, status, final score, venue, broadcast, and records where available.
- Drilldown: real team/player box scores, scoring summary, drives, and play-by-play only when that game advertises the corresponding coverage.
- Current season: refreshable; completed seasons: immutable except for explicit data repairs.

### Eventual archive

- Backfill 1999–2021 through the same importers and schema.
- Keep the public Statistics Scores selector capped to its configured five-season window until the product scope is intentionally expanded.
- Permit internal validation and future features to query any imported season without rebuilding the database.

## Source Strategy

Use nflverse as the bulk historical foundation and ESPN as the display/detail cross-reference:

- nflverse schedules provide the canonical season/game list from 1999 forward, including an ESPN identifier where available.
- nflverse play-by-play provides the bulk historical play archive from 1999 forward.
- ESPN scoreboards and summaries provide current-season refreshes plus the fields needed by the existing scorebug and drilldown designs.
- Every imported record retains source, source version, fetched/imported timestamp, and checksum.

Before production import, document attribution and redistribution requirements for both sources. Do not make an undocumented provider payload the only canonical copy.

## Measured Storage Envelope

The current nflverse schedules file contains approximately 7,548 games from 1999 forward. Its published play-by-play Parquet assets total approximately 488 MB.

| Scope | Scores and catalog | Compressed details | Operational allocation |
| --- | ---: | ---: | ---: |
| Initial five seasons | 5–15 MB | Approximately 75–200 MB | 500 MB |
| Full 1999-forward archive | 10–30 MB | Approximately 0.8–1.5 GB | 3 GB |

Measured ESPN samples were approximately 138 KB per 16-game scoreboard week (14 KB gzip) and 419–435 KB per complete modern game summary (34–46 KB gzip). Across the 1999-forward game count, complete summaries would be roughly 3.1 GB raw or 0.3 GB gzip before nflverse play data and database indexes.

Storage is not the limiting factor. Coverage validation, source terms, stable game identity, and clean partial-detail behavior are the important constraints.

## Canonical Game Identity

Store each game once. Never duplicate a game under both participating teams.

- Use an internal immutable `game_id` as the primary key.
- Retain `nflverse_game_id`, `espn_event_id`, and any future provider IDs as unique nullable crosswalk fields.
- Normalize historical franchise aliases at import time while preserving the source abbreviation.
- Team and season schedules query the same game row through indexed home/away fields.
- Do not derive identity from display names, week labels, or kickoff strings alone.

## Persistent Server Architecture

The Express sidecar is currently stateless apart from in-memory live caches. Historical data must use a persistent archive mounted outside the container image.

### SQLite catalog

Use one SQLite database under `GRIDSHIFT_DATA_DIR`, defaulting to `/data` in the server container.

Core tables:

- `seasons`: season, visible status, phase coverage, source version, sealed timestamp.
- `games`: canonical identity, season, phase, week, kickoff, teams, scores, status, venue, neutral-site flag, broadcast, and provider IDs.
- `team_game_stats`: normalized team box-score fields by game and team.
- `player_game_stats`: normalized player box-score fields by game and player.
- `game_coverage`: booleans/status for scoreboard, box score, scoring summary, drives, plays, and player stats.
- `game_artifacts`: compressed document key, kind, encoding, byte size, checksum, source, and source timestamp.
- `import_runs`: importer version, source manifest, counts, warnings, failures, and publish status.

Required indexes:

- `(season, phase, week, kickoff)`
- `(home_team, season, kickoff)`
- `(away_team, season, kickoff)`
- Unique indexes for populated nflverse and ESPN IDs.

### Compressed artifacts

Keep complete provider documents and play data compressed rather than expanding every source field into SQLite. Normalize only fields required for filters, scoreboards, validation, and the current drilldown.

Partition artifacts by season and kind. Avoid one loose file per play, and avoid embedding the entire archive in the application image. Checksums make imports repeatable and detect partial/corrupt downloads.

### Docker persistence

- Mount a named volume at `/data` for `gridshift-api`.
- Keep database and artifact backups together.
- Use atomic import publication: stage, validate, then promote a complete season.
- A failed import must leave the previously published season untouched.

## Server API

- `GET /api/nfl/seasons?surface=scores&limit=5` — visible Statistics Scores seasons plus coverage/status.
- `GET /api/nfl/seasons/:season/games?phase=&week=&team=` — normalized schedule/scoreboard rows.
- `GET /api/nfl/games/:gameId` — canonical game header and coverage flags.
- `GET /api/nfl/games/:gameId/box-score` — real team/player box score when covered.
- `GET /api/nfl/games/:gameId/scoring` — scoring summary when covered.
- `GET /api/nfl/games/:gameId/plays` — drives/play-by-play when covered.
- Administrative CLI import, verify, seal, repair, and backfill commands; no public mutation endpoint.

Completed seasons return long-lived cache headers and ETags. The active season uses a short server TTL appropriate to game state. Every response includes source and coverage metadata so unavailable detail is distinguishable from an outage.

## Import Pipeline

Each importer follows the same five steps:

1. **Fetch** — download a versioned source asset into staging.
2. **Crosswalk** — resolve nflverse, ESPN, franchise, player, and team identities.
3. **Normalize** — write canonical rows and compressed artifacts.
4. **Validate** — run season/game counts, identity, score, coverage, and reconciliation checks.
5. **Publish** — atomically expose the season and record its manifest/checksums.

Importers are idempotent. Re-running an unchanged source produces no duplicate rows or new artifacts.

## Delivery Roadmap

### Milestone 0 — Contracts and source gate

1. Confirm nflverse/ESPN attribution and redistribution requirements.
2. Freeze normalized contracts for season, game, box score, player row, scoring event, drive, and play.
3. Define the coverage flags used by the UI to enable or suppress drilldown sections.
4. Define the five-season window as server configuration with `5` as the initial value.
5. Create a 2022–2026 coverage matrix before importing.

Exit gate: every requested UI field has a named source or an explicit unavailable state.

### Milestone 1 — Persistent archive foundation

1. Add `GRIDSHIFT_DATA_DIR`, SQLite initialization/migrations, and the Docker `/data` volume.
2. Add the canonical game/provider-ID crosswalk and season manifest tables.
3. Build shared staging, checksum, validation, and atomic-publication helpers.
4. Add administrative import/verify/seal commands.
5. Add backup and restore documentation.

Exit gate: an interrupted or invalid import cannot damage a published season.

### Milestone 2 — Five-season accurate Scores

1. Import 2022–2026 schedules and scoreboards, including all supported phases.
2. Implement seasons and season-games APIs.
3. Generate the Statistics Scores selector from `/api/nfl/seasons`; remove `SCORES_FIXTURE_SEASONS` from production behavior.
4. Replace regular-season scorebug fixtures with server results.
5. Preserve selected season/phase/week in route state.
6. Show centered, unframed loading/error/unavailable reasons when coverage is missing.

Validation includes the 2025 Week 1 Bills–Ravens Sunday-night game as a named regression fixture.

Exit gate: every visible season/week is factual, and no production route imports `statisticsScoresFixtures.js` for scoreboard data.

### Milestone 3 — Five-season real drilldowns

1. Import team/player box scores and scoring summaries for 2022–2026.
2. Import and map drives/play-by-play for those seasons.
3. Reconcile scoring plays and box-score totals with each game's final score.
4. Replace fictional drilldown sections incrementally, guarded by coverage flags.
5. Lazy-load detail endpoints; season pages must never download play data.

Exit gate: every rendered detail is source-backed, with unsupported sections clearly unavailable instead of synthesized.

### Milestone 4 — Current-season operations

1. Refresh scheduled/live games with state-aware TTLs and in-flight request deduplication.
2. Seal completed weeks and the completed season after validation.
3. Add health metrics for source age, coverage, import failures, archive size, and last successful refresh.
4. Add bounded retry/backoff and last-known-good behavior.

Exit gate: a provider outage does not replace good data or mislabel stale data as live.

### Milestone 5 — Backfill 1999–2021

1. Import seasons in bounded batches through the unchanged pipeline.
2. Publish only seasons that pass the same acceptance gates as 2022–2026.
3. Audit franchise aliases, relocations, postseason week labels, and source gaps by era.
4. Keep the public selector at five seasons until a separate product decision expands it.
5. Run a full archive reconciliation and storage-budget report.

Exit gate: 1999-forward is queryable internally without schema/API changes, and expanding the UI requires only configuration/product work.

## Validation Gates

- Expected game and phase counts per season.
- Exactly two distinct teams per game.
- No duplicate provider IDs or canonical matchups.
- Valid final scores for completed games.
- Chronological week ordering across year boundaries.
- Box-score and scoring-play reconciliation against final scores.
- Play sequence and final scoring-state reconciliation where play data exists.
- Named regression games across all five visible seasons.
- Source outage, partial coverage, corrupt artifact, and interrupted-import tests.
- Immutable cache-header and ETag tests for sealed seasons.
- Storage report enforced against a configurable maximum.

## Recommendation

Allocate 500 MB for the initial 2022–2026 release and 3 GB for the eventual 1999-forward archive. Build the schema and APIs once for 1999-forward, but import and expose only 2022–2026 first. This keeps the first delivery bounded while making the later backfill an importer operation rather than a redesign.

## Data References

- nflverse automated releases: https://github.com/nflverse/nflverse-data
- nflverse schedules release: https://github.com/nflverse/nflverse-data/releases/tag/schedules
- nflverse play-by-play release: https://github.com/nflverse/nflverse-data/releases/tag/pbp
