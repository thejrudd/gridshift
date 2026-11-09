# Self-hosting GridShift

This guide supplements the [README](../README.md). GridShift needs an internet connection for connected data. Paid data credentials are optional and must remain on the server.

## Docker Compose

The included `docker-compose.yml` describes a deployment behind a Cloudflare tunnel, not a ready-made local port 80 setup. It requires `GRIDSHIFT_SESSION_SECRET`, `GRIDSHIFT_LIVE_COOKIE_SECRET`, and `CLOUDFLARE_TUNNEL_TOKEN` in the Compose environment. Review the file and `.env.example`, provide your own secrets and tunnel configuration, and then run `docker compose up -d --build`. The Compose file does not publish a host port; a direct-access deployment needs an appropriate port mapping and reverse-proxy configuration. Do not commit secrets.

### Down page

When the host or tunnel is down, Cloudflare shows its own error page (error 1033, HTTP 530; or 502 when `cloudflared` cannot reach the app). The optional Worker in `cloudflare/down-page-worker/` serves a GridShift page instead. It works on Cloudflare's Free plan.

- Every request passes straight through to the tunnel. Only a 502, 503, 504 or 530 response, or a failed origin fetch, is replaced.
- Page loads get the down page with status 503. `/api/` requests keep the origin's error response, or get a JSON `503 {"error":"unavailable"}` when the origin can't be reached.
- The Worker is deployed with Wrangler, separately from the Docker deploy, and does not depend on the app version.

| File | Owns |
| --- | --- |
| `cloudflare/down-page-worker/src/index.js` | Which responses are replaced, page vs API detection, response headers |
| `cloudflare/down-page-worker/src/downPage.js` | The page's HTML, copy and styles |
| `cloudflare/down-page-worker/wrangler.toml` | Worker name and route (`gridshiftapp.com/*` for the official deployment) |
| `tests/unit/downPageWorker.test.mjs` | Pass-through, replacement and API behavior |

#### Changing the page

The page is one self-contained HTML string because the app's stylesheet and fonts are unreachable while it is showing. It cannot import `src/index.css`, so its tokens are copied by hand.

- Keep its colors in step with the light and dark tokens in `src/index.css`. The wordmark mirrors `.sidebar-brand__wordmark`, the heading mirrors `.predictions-empty-state h3`, and the button mirrors `.predictions-empty-state__action`. Update them together if those change.
- Light and dark follow the visitor's system setting, since the app's saved theme is unavailable.
- Keep it small and dependency-free. Google Fonts is the only external resource, and the page falls back to system fonts without it.
- After a change, run `node --test tests/unit/downPageWorker.test.mjs` and deploy again. Redeploying replaces the live Worker within seconds.

#### Deploying

1. For your own hostname, set the `routes` entry in `wrangler.toml` (for example `gridshift.example.com/*`), or add the route in the dashboard after deploying.
2. Run `npx wrangler login` once, then `npx wrangler deploy --config cloudflare/down-page-worker/wrangler.toml`.
3. Set the route to fail open: domain > Workers Routes > edit the route > Request limit failure mode. Free-plan Workers allow 100,000 requests a day, and the default fail-closed setting shows an error page past that limit.
4. Test it: stop the `gridshift` container (502), then stop `cloudflared` (530), and load the site in a private window. Installed copies of the app may load from the service worker's cache instead.

To remove it, delete the route or the Worker in the Cloudflare dashboard, and requests go straight to the tunnel again.

## Self-hosting without BALLDONTLIE

BALLDONTLIE is optional and its key stays on the server. The matrix describes the current implementation when no key is configured; a configured key also needs the appropriate account capabilities, and provider outages can limit the same features. Other data sources, an internet connection, or the GridShift API sidecar may still be required.

| Feature | Without BALLDONTLIE | With BALLDONTLIE |
|---|---|---|
| Predictions, standings, playoffs, sharing, themes, and app navigation | Supported | No BALLDONTLIE dependency |
| Sleeper league connection, rosters, schedule, standings, history, scoring, heatmaps, defense, and trade tools | Supported with Sleeper and other existing data sources | Optional projections and player designations can enrich supported views |
| Matchups and weekly projections | Supported; projections fall back through Sleeper and GridShift's current- and prior-season estimates when available | Optional provider projections can supplement the fallback sources |
| Injuries and player availability | Sleeper information remains available; weekly designation details may be unknown | Adds matching weekly player designations when available |
| Draft Assistant and Scout | Core draft and scouting tools remain available; BALLDONTLIE ADP is unavailable | Optional preseason ADP can enrich draft decisions |
| Fantasy Rankings preseason ADP mode | ADP mode is unavailable; other ranking views remain available | Available when the configured account supplies ADP |
| Statistics schedules, standings, player profiles, and existing season-by-season stats | Supported through existing non-BALLDONTLIE sources | Additional dashboard data is available as described below |
| Statistics player season dashboard | Season-by-season view remains available; play-based season tabs lack a non-BALLDONTLIE fallback and can incorrectly say there are no finished games | Game and play details support the season dashboard, subject to coverage and account capabilities |
| Statistics team season dashboard | Depth chart remains available through ESPN; season, player and league tabs lack a non-BALLDONTLIE fallback and can report that the team has no games | Game details and team statistics support the other dashboard tabs, subject to coverage and account capabilities |
| Statistics Scores | ESPN scoreboard fallback is available; game drilldowns, play-by-play and drive replay are unavailable | Game drilldowns and additional game, player and play details are available with the required capabilities |
| Game-week data export | Sleeper data and ESPN scoreboard data are available; NFL box scores and play-by-play are marked unavailable | Eligible game details can add NFL box scores and play-by-play, with coverage reported per export |
| Fantasy Live and matchup player play timeline | Unavailable; ordinary Matchups remains available | Live requires a configured key, suitable capabilities and an enabled league; the play timeline also requires play access |

Data coverage and availability vary by season, provider, and account tier. A fallback is not necessarily equivalent to the paid data.

## Live Scoring Configuration

GridShift's public client can stay open source while paid live-data access remains server-only. Real secrets belong in the deployment environment or a local `.env` file copied from `.env.example`; never commit `.env` or paste paid API keys into client code.

Server-only variables:

| Variable | Purpose |
|---|---|
| `GRIDSHIFT_SESSION_SECRET` | Signs/encrypts server-managed session values in production. |
| `GRIDSHIFT_BDL_API_KEY` | BALLDONTLIE API key for server-side NFL live data. Never prefix this with `VITE_`. |
| `GRIDSHIFT_BDL_TIER` | BALLDONTLIE capability profile: `free`, `all-star`, `goat`, or `trial`. Unknown values fail conservatively. |
| `GRIDSHIFT_BDL_EFFECTIVE_MAX_REQ_PER_MIN` | Actual account limit. Set this explicitly because a GOAT trial has GOAT endpoint access but only a 5 RPM limit. |
| `GRIDSHIFT_BDL_INTERNAL_MAX_REQ_PER_MIN` | Optional operating ceiling. When blank, the shared gateway reserves 25% of the effective limit; paid GOAT therefore operates at 450 of 600 RPM. |
| `GRIDSHIFT_BDL_CACHE_MAX_ENTRIES` | Maximum entries in the shared, bounded BALLDONTLIE response cache. |
| `GRIDSHIFT_TRUST_PROXY_HOPS` | Number of trusted reverse-proxy hops used when resolving client IPs for public-route protection. Leave `0` when Node is reached directly. |
| `GRIDSHIFT_LIVE_ALLOWED_LEAGUE_IDS` | Comma-separated Sleeper league IDs allowed to use paid live scoring on this instance. |
| `GRIDSHIFT_LIVE_ACCESS_CODE` | Optional second gate for allowlisted league members; when blank, allowlisted leagues start Live automatically. |
| `GRIDSHIFT_LIVE_COOKIE_SECRET` | Optional live-scoring cookie secret; falls back to `GRIDSHIFT_SESSION_SECRET` when blank. |
| `GRIDSHIFT_LIVE_CACHE_TTL_MS` | Server cache duration for upstream live-data responses. |
| `GRIDSHIFT_LIVE_FINAL_TTL_MS` | Server retention tail for finalized live games before hot cache cleanup. |
| `GRIDSHIFT_LIVE_ARCHIVE_ENABLED` | Advertises archive mode in current server status. A persistence/archive writer is still planned. |
| `GRIDSHIFT_LIVE_MAX_REQ_PER_MIN` | Per-league/client guardrail for incoming Fantasy Live proxy requests. This is not an account-wide BALLDONTLIE quota. |
| `GRIDSHIFT_COOKIE_SECURE` | Set `true` for HTTPS production cookies; use `false` only for local HTTP testing. |
| `GRIDSHIFT_DRAFT_SYNC_ENABLED` | Enables optional device-to-device Draft War Room/Board sync. Defaults to `false`. |
| `GRIDSHIFT_DRAFT_SYNC_DATA_DIR` | Persistent directory for the Draft Sync SQLite file. Mount this directory to a durable Docker volume when enabled. |
| `GRIDSHIFT_DRAFT_SYNC_PAIRING_TTL_MS` | Lifetime of a one-time pairing code. Defaults to 10 minutes. |
| `GRIDSHIFT_DRAFT_SYNC_MAX_PAYLOAD_BYTES` | Maximum synchronized Draft JSON payload size. Defaults to 64 KiB. |

Hosted owners can enable paid live scoring for selected Sleeper leagues by setting these variables on the server and keeping `GRIDSHIFT_LIVE_ALLOWED_LEAGUE_IDS` narrow. Self-hosters who want Fantasy Live need their own BALLDONTLIE key and league allowlist. A paid GOAT account uses `GRIDSHIFT_BDL_TIER=goat` with `GRIDSHIFT_BDL_EFFECTIVE_MAX_REQ_PER_MIN=600`; keep the effective limit at `5` for a GOAT trial or any unverified account. Variables prefixed with `VITE_` are public because Vite embeds them in the browser bundle, so paid keys and access codes must always use `GRIDSHIFT_` server variables.

Draft Sync is an optional capability of the existing API sidecar, not a required database service. When enabled, the sidecar stores a small SQLite database under `GRIDSHIFT_DRAFT_SYNC_DATA_DIR`; the Docker Compose example mounts `/data` as a persistent volume. A volume restart preserves sync state, but deleting the volume removes it. Hosters should include that volume in their normal backup process; Draft Sync does not provide off-site backups automatically.


## Supported League Features & Current Limitations

GridShift's Sleeper league support is feature-specific; a supported league connection does not mean every league format is supported by every tool.

- **Auction drafts** — Draft Assistant's War Room, Board, and Results do not support auction drafts yet. Snake and linear drafts are supported.
- **FAAB** — FAAB waiver budgets are separate from auction drafts. Companion trade and history flows recognize FAAB transfers and validate ownership, but FAAB has no numeric Trade value.
- **Extra matchup against the median** — GridShift does not yet include Sleeper's second regular-season win, loss, or tie against the league median in weekly results, standings, or playoff seeding. The planned v9.5-and-later behavior uses Sleeper's result when exposed, or derives it from official weekly scores; the median is the average of the two middle scores, and the feature does not apply to playoff or consolation weeks. GridShift will infer enablement from Sleeper's recorded matchup count and aggregate W/L/T outcomes, which double the team outcomes relative to head-to-head matchup games.

