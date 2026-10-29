# Independent Fantasy Platform Plan

Back: [[Home]] · Routing: [[Where To Edit]]

Last updated: 2026-10-29 (Stage 5.1 design foundation, awaiting visual approval).

## Purpose and maintenance

This is the source of truth for GridShift's independent fantasy-platform pilot and its path toward a future iOS/Android app. Update this document in the same pass as changes to agreed scope, rules, architecture, implementation stages, validation, or implementation status. Record product decisions here rather than leaving them only in chat.

Keep agreed requirements, proposed defaults, open decisions, and implemented behavior distinct. A proposal is not approval, and an implementation is not evidence of browser acceptance or deployment. Preserve the user's decisions; ask about material changes before implementing them. Keep the roadmap and routing references aligned when ownership or scope changes.

## Agreed direction

- Target an independent platform before native mobile distribution. The long-term 10.0 goal is an invite-only season pilot, not a broad public replacement for existing hosts.
- The immediate test environment is internet-accessible but invite-only: one four-team redraft/IDP league, with the user as commissioner and manager plus three other managers.
- Keep GridShift ad-free, free of gambling promotion, open source, and practical to self-host. Optional hosted services must not become a requirement for the existing companion.
- Build league operations behind shared server APIs and keep domain rules independent of React so web and eventual mobile clients use the same authoritative behavior.
- Reuse GridShift's responsive UI, matchups, roster views, analysis, scoring utilities, and League Activity where responsibilities align. They are useful foundations, not an already-implemented independent league engine.
- Preserve the existing Sleeper-connected experience while adding GridShift-owned leagues. Authentication and durable personal league storage apply to participating in independent leagues; do not impose them on the existing account-free companion.
- Native store distribution, mobile framework selection, broad public onboarding, and production-scale hosting are later milestones. This plan does not authorize a version bump, commit, push, or deployment.

## Pilot capabilities

| Area | Required capability |
| --- | --- |
| Identity and membership | Independent manager identities; expiring/revocable invites; join a league; team ownership; server-enforced commissioner/manager permissions; access recovery and membership revocation |
| League configuration | League name, season, four teams, offense and IDP scoring, starter composition, bench, IR/injury slots, position limits, and total roster limits |
| Commissioner | Configure rules; grant/remove players; set lineups; lock lineups and/or transactions; set league waiver priority; adjust scores; replace/reassign managers; record overrides |
| Team management | Set weekly lineups; move eligible players between slots; add/drop free agents; submit, reorder, and cancel waiver claims; view processing outcomes |
| Trading | Propose, counter, decline, cancel, accept, and execute player trades with ownership/eligibility/capacity revalidation and atomic transfers |
| Competition | Weekly lineup snapshots; schedule/matchups; scoring; provisional/final results; correction handling; standings and a defined test-season endpoint |
| Communication | Persistent league chat and member-to-member DMs; unread indicators; optional notifications and preferences; participant-only DM access |
| Activity | Extend the existing League Activity feed with committed GridShift events, commissioner changes, score adjustments, and IR movements |
| Test operations | Inspect actions; reset/clone isolated test state; backups and tested restoration; deterministic deadline/claim/correction scenarios |

League waiver priority and a manager's ordered claims are separate concepts. Roster composition defines slots; position limits constrain ownership. Lineup locks and transaction locks must be separately understandable. Exact scoring/slot counts, processing times, and competition rules remain open below.

## Agreed IR and injury-slot rules

### Eligibility

| Policy | Statuses |
| --- | --- |
| Eligible by default | Injured Reserve (IR), Physically Unable to Perform (PUP), Non-Football Injury/Illness (NFI), Out |
| Independent commissioner toggles, off by default | Doubtful, Questionable, Suspended |
| Never grant eligibility through status settings | Exempt, Did Not Report/Holdout (DNR), Not Available (NA), Inactive, Did Not Play (DNP), Healthy/Active, Retired |

- Missing, unknown, or unrecognized status does not grant eligibility. Probable, generic Reserve, and COVID-19 labels are not independently qualifying pilot statuses.
- Eligibility comes from current verified player status, not from fantasy IR-slot membership. Do not reuse a display fallback that labels a player IR because the player is already in a reserve slot.
- A verified current qualifying NFL reserve designation remains effective alongside a weekly Questionable tag. Preserve underlying roster and weekly status evidence rather than flattening them into whichever label happens to render first.
- Where supplied, retain active/reserve PUP and NFI details. Provider normalization and freshness rules must be specified before ingestion is connected; no speculative inference from injury notes or lack of game participation.
- Slot counts are commissioner-configurable; exact pilot counts remain to be chosen.

### Players who lose eligibility

The commissioner selects the enforcement policy. Apply it both to verified designation changes and eligibility-setting changes.

| Policy | Behavior |
| --- | --- |
| Restrict acquisitions — default | Allow lineup edits, drops, and corrective moves out of injury slots. Block free-agent adds, successful waiver acquisitions, and incoming trades unless the completed action leaves the roster valid. |
| Lock roster moves — strict | Block ordinary lineup edits, adds, waiver acquisitions, trades, and roster moves until the violation is resolved. Still permit corrective activation/removal, dropping the ineligible player, and dropping another player to create room for activation. |
| Warn only | Display the violation and allow actions that otherwise satisfy ownership, roster, deadline, and permission rules. |

- Never automatically drop or move a player because status or settings changed.
- Preserve corrective paths in strict mode. Dropping another player may create room for activation without immediately resolving the violation; restrictions continue until activation/removal resolves it.
- Commissioner corrections remain possible and must be recorded in League Activity with actor, reason, and before/after state. This does not grant managers unrestricted overrides.
- Show the offending player, selected policy, and how to resolve the violation.
- Revalidate pending claims/trades when they execute. Earlier submission cannot bypass a later restriction. Check resulting rosters for every affected team.
- A grace-period policy is deferred; it was proposed but not selected.

## Reuse and architecture boundaries

### Server authority and persistence

The server owns membership, player ownership, eligible lineups, locks/deadlines, waivers, executed trades, scoring revisions, and commissioner actions. Browser/mobile state may cache reads and display pending actions, but may not declare a write successful before server confirmation.

Mutations must validate permissions and the current league rules/state. Ownership transfers and their committed activity records must persist atomically. Retried requests and restarted jobs must not execute twice. Waiver processing and deadlines must not require an open browser. Preserve weekly lineup snapshots and separate provider-derived scores from commissioner adjustments.

Existing sidecar SQLite/WAL patterns are candidates for the small pilot. The independent league database, migrations, identity mechanism, and job implementation are proposals to specify before integration, not existing capabilities. A durable database is not an off-site backup; test restoration separately.

### Existing feature integration

- `src/context/SleeperContext.jsx` exposes the shared fantasy hooks but still contains provider-specific state/loading. Add an independent provider boundary without allowing unrelated Sleeper snapshots, caches, seasons, or roster IDs to cross into GridShift leagues. Stage 5.0 started this boundary as the [[League Provider Contract]] (Standings only); `SleeperContext.jsx` itself is unchanged.
- Existing Draft observes Sleeper drafts. A live GridShift draft engine is deferred; commissioner-assigned rosters are the proposed initial bootstrap.
- Existing score calculations are reusable, but supported provider stat coverage, offensive/IDP attribution, corrections, and finalization need verification before GridShift becomes authoritative.
- Existing trade proposals are useful presentation/workflow foundations. Acceptance in an independent league must actually execute validated asset transfers; never confuse proposal acceptance with external Sleeper execution.
- League Activity already lives in `src/components/companion/CompanionActivity.jsx`, with normalization in `src/utils/leagueHistory.js` and loading in `src/hooks/useLeagueHistoryData.js`. Reuse that surface; extend its Sleeper-only loading/rendering gates and event presentation for independent leagues.
- The current activity normalizer accepts only completed trade/waiver/free-agent/commissioner transactions. Add explicit descriptions for settings, score adjustments, locks, and injury-slot moves rather than forcing them into player add/drop rows.
- Private pending claims and DMs must not appear in league-visible activity. Commissioner permissions do not automatically grant DM access.

### Mobile preparation

Use explicit API boundaries, stable league/player identities, and UI-independent rules. Keep device storage, notification delivery, sharing, deep links, and lifecycle integration separable from league logic. Future installed clients will need an explicit server endpoint and API compatibility policy; native packaging itself is deferred.

### Implemented Stage 0 interfaces

`src/utils/independentInjurySlotRules.js` exports:

- `DEFAULT_INJURY_SLOT_SETTINGS`: the three optional eligibility toggles are false; `ineligiblePolicy` is `restrict_acquisitions`.
- `normalizeInjurySlotSettings(settings)`: merges defaults and rejects unknown keys, non-boolean toggles, and unsupported policies. Policy values are `restrict_acquisitions`, `lock_roster_moves`, and `warn_only`.
- `getInjurySlotEligibility(statusCodes, settings)`: accepts explicit normalized current verified codes; returns `eligible`, `qualifyingStatus`, and a reason. It does not read raw provider objects, fetch statuses, or infer eligibility from slot membership. Base codes are `IR`, `PUP`, `NFI`, `OUT`; optional codes are `DOUBTFUL`, `QUESTIONABLE`, `SUSPENDED`.
- `checkInjurySlotAction(facts)`: evaluates only the agreed IR restriction. Supported actions are `lineup_change`, `roster_move`, `free_agent_add`, `waiver_acquisition`, `incoming_trade`, `outgoing_trade`, `activate_from_injury`, and `drop`; returns `allowed` and a reason. Ownership, deadlines, general roster legality, and authorization remain separate mandatory checks.

The future server command layer must derive `hasIneligiblePlayer`, `resultingRosterValid`, `removesIneligiblePlayer`, and `createsActivationSpace` from authoritative current/proposed state inside the mutation boundary. Never expose them as trusted request flags. In particular, activation space means a drop reduces a binding total/position capacity constraint preventing activation of a specific ineligible player; an arbitrary drop or an already-free slot does not qualify. A corrective move may address one of several violations without unlocking all subsequent actions. Commissioner overrides must be authorized and audited outside this helper.

This module is not yet connected to any UI, provider adapter, endpoint, or live league. It establishes the rule contract and tests, not persisted roster enforcement.

## Dependency and impact checks

| Change | First effect | Downstream effect | Required handling |
| --- | --- | --- | --- |
| Scoring settings | Player/team points change | Results, standings, ranks, history, and projections may change | Explicit effective timing, impact preview, versioned settings, controlled recalculation |
| Slots/limits/eligibility | Rosters or lineups may become invalid | Claims, trades, and acquisitions may become blocked | Identify affected teams, apply chosen enforcement, preserve corrective moves |
| Player transfers | Ownership/availability changes | Pending claims/offers and future lineups can become stale | Atomic writes, execution-time validation, truthful outcomes, historical lineup preservation |
| Past score/lineup override | Historical score/result changes | Standings and records may change | Auditable correction and affected-result recalculation |
| Independent identity | League participation becomes authenticated | Reads, writes, DMs, invites, and recovery need permission boundaries | League isolation and server-side authorization; retain companion access |
| Notifications | Deliver events outside an open view | Delivery can fail or repeat | Persistent in-app outcomes, preferences, deduplication, optional delivery channels |
| Future mobile app | Installed runtime and release cadence | Server/client versions and storage/lifecycle differ | Shared rules/API plus explicit device adapters and compatibility |

Read the routed feature documents before touching their implementation. Scoring work requires [[Scoring Call Sites]], trade work requires [[Trade Engine]] and [[Trade Proposal Cards]], shared rows require [[Companion Shared Rows]], and live-provider work requires [[Live Data Server Architecture]]. Audit direct consumers before changing shared fantasy state.

## Implementation stages and acceptance

| Stage | Deliverable | Acceptance |
| --- | --- | --- |
| 0 — Agreed rules | Pure IR eligibility/enforcement rules and focused tests; documented interfaces | Agreed defaults/toggles/never-eligible cases, unknown status, corrective exceptions, and policy behavior verified without changing existing leagues |
| 1 — Create and join | Identity, invitations, persistent league settings/teams, commissioner-assigned rosters, initial activity recording | Four distinct managers join; outsiders cannot read/write private league state; one team per manager; restarts preserve state; unauthorized commissioner operations fail |
| 2 — Manage and compete | Legal weekly lineups, slots/limits/IR, locks, matchups, scoring, standings, corrections | Offense/IDP and IR scenarios pass; server deadlines hold; historical starters persist; adjusted scores agree across views |
| 3 — Transact | Free agents, ordered claims, durable processing, executed trades | Competing claims have deterministic outcomes; retries/restarts do not double-award players; transfers obey ownership, limits, and IR policies; activity agrees with committed state |
| 4 — Communicate and rehearse | League chat, private DMs, in-app notifications/preferences, recovery and isolated replay tooling | Conversation access is correct; unread state persists; a four-manager rehearsal covers transactions/corrections/recovery and records user acceptance |

Basic audit, isolation, persistence, and recovery requirements expand with each stage; they are not postponed to the last stage. Complete each coherent slice with its appropriate evidence before broadening scope.

### Validation boundary

- Use focused domain/API tests for authorization, concurrency, execution-time rules, retries, corrections, and restart recovery; disposable local fixtures are allowed.
- For UI work, Codex verifies behavior and basic browser interactions. The user and three invited managers own detailed live usage acceptance unless a different boundary is agreed.
- Before each UI implementation slice, confirm whether the user wants to test alongside Codex. Record exact scenarios and any untested/blocked browser coverage.
- Live NFL weeks plus isolated historical replay are proposed for testing; clock/replay configuration remains open. Never let a replay mutate a live league.
- Use Implemented, Validated, and Complete as described in [[Agent Workflow]]. Deployment and user acceptance require their own evidence.

## Stage 5 in core: GridShift leagues through the provider contract

The platform lives in its own repository (`thejrudd/GridShift-Fantasy-Platform`); its `docs/Plan.md` is the source of truth for platform scope, rules, and the Stage 5 phases (5.0 to 5.9, with 5.2b). Its later decisions supersede this document's earlier stage details where they differ (for example the 2026-10-07 username/password sign-in choice: the platform uses passwordless email-link sign-in; see that plan's Conflict resolutions). This section records the core side.

Decided by the user on 2026-10-27 (recorded in the platform plan): league screens live in GridShift core, fed by the platform; a person signed in with a GridShift league gets all of core's fantasy functionality on that league; the four-tester pilot stays on the platform's minimal `web/` client until Stage 5 finishes; core never depends on the platform repository, and the GridShift-league provider is enabled only when a platform API URL is configured and only for an account that belongs to a league or holds an invite.

Phase 5.0 (integration spike) in core, implemented on branch `stage5-0-integration-spike`:

- The provider-neutral contract, capabilities, and the audit of every fantasy view with the components needing change: [[League Provider Contract]].
- Standings renders through the contract: the Sleeper path is an adapter over the same data and produces identical markup; a GridShift league's Standings reads `GET /api/leagues`, `/api/leagues/:id`, `/teams`, `/standings`, `/weeks`, and `/matchups`.
- Sign-in uses the platform's email-link flow through a same-origin dev proxy; `npm run dev:platform` runs core with a local platform API (PGlite).

Phase 5.1 (design foundation) in core, in progress on branch `stage5-1-design-foundation`, awaiting the user's visual approval:

- Semantic tokens for the six-level text hierarchy, colour roles, interaction states, and flat-layout spacing, plus the short component set (Section and PageHeader, DataTable, ListRow, Tabs, FormField, Dialog, and the `.gs-button` class) in `src/components/ui/`. Rules and tokens: [[Design System Quick Ref]] and [[Design Tokens]] › Design Foundation.
- Applied to exactly two reference screens: League › Standings with the GridShift league header (the shared Standings view, so a Sleeper league's Standings changes the same way), and Fantasy › Rosters for a Sleeper league. Presentation only; no data path changed. Other screens, including the League and Fantasy sub-navigation, are unchanged until the look is approved and rolled out.

Decisions on the spike's open questions (user, 2026-10-28), replacing the proposals below:

- Production wiring: same-origin reverse proxy of the platform routes from core's host.
- One active league: when a GridShift league is selected, every tab follows it; views not yet on the contract show an unavailable state, never Sleeper data (from 5.2).
- Account features (invite acceptance, usernames, account settings, admin league creation) stay in the platform's `web/` for now; sign-in is in core.
- Player identity: use core's existing cross-provider identity layer (`src/utils/providerPlayerIdentity.js`, as `src/utils/fantasyProjections.js` uses it for BALLDONTLIE rows) to line GridShift-league players up with core's Sleeper-keyed data. Core and the platform are meant to unify, so the platform may borrow core code for this.
- Ports: the platform runs on 3101 in the core dev arrangement.

Original proposals (kept for history):

1. Production wiring: same-origin reverse proxy of the platform routes from core's host (implemented for dev, recommended) versus cross-origin calls with CORS and `SameSite=None` cookies.
2. Scope of the GridShift selection: League tab only (spike) versus one active league for every tab, with views not yet on the contract showing an unavailable state (recommended for 5.2).
3. Where sign-in, account, invites, and admin live once `web/` retires (the platform plan defers this to 5.0's choice): the spike signs in inside core's connect flow but keeps account, invite acceptance, and admin in `web/`.
4. Ports: the platform's dev default (3001) collides with core's sidecar; the launcher runs the platform on 3101.
5. Player identity across providers (Sleeper ids versus platform `nfl_player` uuids) before Matchups, Roster, Rankings, Heatmap, and Trade can run on a GridShift league.

## Deferred features

Defer FAAB, a live snake draft, existing-league migration, co-managers, multi-team trades, polls, attachments/reactions, external email/browser/native push delivery, grace-period IR enforcement, and broad public hosting/onboarding. IR/injury slots are explicitly included. Optional notifications remain in scope through in-app events/preferences; external delivery channels can follow later.

## Open decisions before affected implementation

1. Manager sign-in is confirmed: invite-only username/password without an email service. Specify account recovery, invite issuance/redemption, session lifecycle, and league-creation authority before identity integration.
2. Exact redraft/IDP scoring profile, starter/bench/injury-slot composition, limits, and pilot season.
3. Initial roster population: commissioner assignments are recommended; a real draft and migration are deferred.
4. Waiver priority behavior, claim/drop processing times, league timezone, free-agent windows, and started-player add/drop restrictions.
5. Kickoff-lock rules, trade execution/review/deadline, rule-change effective timing, finalization/tiebreakers, and test-season endpoint.
6. Current verified designation/stat source, status freshness/conflict handling, and full supported IDP stat coverage.
7. Public test hostname/host, access/recovery operations, backup location/retention, and live versus replay clock setup. Local implementation does not authorize public deployment.

Resolve decisions when their implementation stage approaches; do not require every later-stage choice before beginning agreed isolated rules.

## Implementation status

| Item | Status | Evidence/gap |
| --- | --- | --- |
| Pilot plan and maintenance instructions | Validated | Dedicated plan linked from Home, routing, and roadmap; AGENTS.md/CLAUDE.md maintenance rules mirrored byte-identically; scoped diff check passed |
| Independent league engine | Planned | No independent league creation, membership, or authoritative transaction engine implemented |
| Stage 0 IR rules | Validated (isolated rules) | 10/10 focused tests passed; changed module ESLint passed; no provider/API/UI integration or usage acceptance yet |
| Existing League Activity reuse | Investigated | Existing feed/normalizer confirmed; independent loading and new event types pending |
| Public four-manager environment | Planned | Not deployed; no multi-manager acceptance performed |
| Stage 5.0 league provider contract and GridShift Standings | Implemented | Branch `stage5-0-integration-spike`. Unit: `tests/unit/leagueProviderStandings.test.mjs` (Sleeper Standings markup hash-identical to main 9c8b5bd in six states; adapter parity; GridShift mapping from platform responses captured locally; unconfigured client makes no request). Browser: agent-run Playwright checks against a local platform API seeded through its HTTP API (see the contract doc). Not reviewed by the user; not deployed; other views not migrated |
| Stage 5.1 design foundation (tokens, primitives, two reference screens) | In progress | Branch `stage5-1-design-foundation`. Implemented and agent-checked: unit `tests/unit/designFoundation.test.mjs`; Standings parity test re-pinned for the redesigned current/completed markup with text content still pinned to main; agent-run Playwright before/after screenshots (light, dark, desktop, mobile) and a keyboard-focus check against mocked Sleeper fixtures and a local platform API. Awaiting the user's visual approval of the two reference screens; not rolled out to other screens; old nested-card styles removed only for these screens |

## Decision record

- 2026-10-07: Documented independent-platform-first direction with future mobile support; four-manager redraft/IDP pilot; commissioner/team/communication scope; reuse of League Activity.
- 2026-10-07: Confirmed IR/PUP/NFI/Out default eligibility; Doubtful/Questionable/Suspended optional off-by-default toggles; other listed statuses cannot grant eligibility.
- 2026-10-07: Confirmed commissioner-selectable ineligible-IR policies: acquisition restriction default, strict roster lock with corrective exceptions, or warn only; no automatic movement/drop.
- 2026-10-07: User requested this maintained plan, mirrored project instructions, and implementation following documentation.
- 2026-10-07: User selected invite-only username/password sign-in; no email service required.
- 2026-10-07: Implemented isolated IR eligibility/settings/action policy rules and 10 focused tests. The next slice is identity/invitations/league creation; existing leagues remain unchanged by this unconnected module.
- 2026-10-28: Stage 5.0 spike implemented in core: league provider contract, Sleeper adapter (no behavior change), GridShift-league Standings from the platform API, and the core-plus-local-platform dev environment. Five open decisions recorded above.
- 2026-10-28: User decided the Stage 5.0 open questions: same-origin proxy in production; one active league across tabs; account features stay in `web/`; player identity through core's cross-provider identity layer (`providerPlayerIdentity.js`), with platform reuse of core code permitted.
- 2026-10-29: Stage 5.1 design foundation implemented on two reference screens (Standings with the GridShift league header; Rosters); in progress until the user approves the look.
