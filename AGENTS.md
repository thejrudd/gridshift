# GridShift — Agent Working Contract

## Project boundary

- GridShift is a React 19 + Vite 7 + Tailwind CSS 3 application.
- Barlow Condensed is the display/brand font; Figtree is the body/UI font.
- Dark mode uses the .dark class on html.
- Treat actual Git state and package metadata as authoritative; do not maintain a current-version or active-branch claim here.

## Core working rules

### Task startup

1. Identify the smallest set of files likely involved.
2. Use docs/Where To Edit.md to route to the relevant implementation and architecture references.
3. Read only the references needed for the task. Do not scan the whole repository unless targeted exploration fails.
4. Check TO_DO.md when the task affects planned work.
5. Check KNOWN_BUGS.md when the task fixes or investigates a tracked bug.
6. Preserve unrelated modified, untracked, ignored, and scratch files.
7. Delegate only when independent work can run in parallel or materially improves confidence; a single coherent change normally stays with the parent.
8. Keep AGENTS.md and CLAUDE.md byte-identical; mirror any instruction or project-memory change in both during the same pass.

### Investigation and scope

- For a non-trivial bug, regression, or architectural change, establish the likely cause and affected surfaces before editing.
- Prefer targeted searches, call-site tracing, and small reversible experiments over broad refactors.
- Match the solution to the request. Do not introduce abstractions, cleanup, or speculative follow-up work without a reason.
- Before creating a component, hook, utility, formatter, token, data model, or shared pattern, search for an equivalent and extend it only when responsibilities genuinely align.
- Once the requested behavior and proportionate checks are complete, stop editing.

### Decisions and authority

- The user’s explicit request and choices take precedence over guidelines in a skill.
- For a material product, design, architecture, security, data-integrity, billing, irreversible-action, or validation-boundary choice, ask before implementation. Present concise options, identify a recommendation, and let the user accept it or choose another.
- For low-risk reversible implementation details, choose the lowest-risk interpretation and state the assumption; do not ask preference questions merely to offload routine decisions.
- After a scoped change is authorized, carry it through implementation and appropriate checks without repeated approval stops.
- If a skill causes a pause, permission request, unfinished work, or divergence, name the exact SKILL.md, distinguish its requirement from your interpretation, and explain the effect.

## Model and subagent routing

Use docs/Agent Workflow.md for the full routing rubric, output contracts, completion states, and validation tiers.

- Stay local for one coherent owner, a known isolated edit, or a rapid edit–inspect–adjust loop.
- Use Luna for bounded lookup, code tracing, focused review, isolated implementation, and routine validation.
- Use Terra for uncertain root causes, difficult debugging, multi-file or cross-surface behavior, and high-risk architecture or data work.
- Sol/high may own complex multi-file implementation when first-pass quality is likely to reduce total expected cost. Sol/max is reserved for exceptional unresolved judgment, contradictory evidence, or an explicitly requested maximum-quality review.
- Astra may be used for a demanding, clearly bounded end-to-end workflow, architectural reconciliation, or high-ambiguity cross-surface work when its stronger synthesis is likely to reduce rework. State Astra and its effort explicitly in the routing handoff. Do not use it for routine or one-file work.
- Delegate only when the work is independently separable and the expected confidence, latency, or rework benefit justifies the context and coordination cost.
- Normal fan-out is zero to two read-only investigators, one implementation owner, and a reviewer only when a risk trigger applies. Do not recursively delegate without a new parent-owned decision.
- Assign one writer per file or tightly coupled file set. The parent owns final integration, evidence synthesis, and the task status.
- Keep delegated prompts compact, and include the purpose, selected model and effort, applicable skillset, and expected deliverable.

## Validation and completion

- Use proportionate checks; do not require a full suite or build for every copy, documentation, or isolated edit.
- Local tests with disposable fixtures may run without repeated approval. Repair and rerun failures caused by the requested change.
- For actual UI work, Codex verifies underlying behavior and basic interaction; the user owns detailed live UI testing unless a different boundary is explicitly agreed.
- A blocked browser or environment launch is not a passing check. Report the exact gap and the user-owned scenario that remains.
- Use the three statuses from docs/Agent Workflow.md: Implemented, Validated, and Complete. Do not imply that implementation, validation, user acceptance, or shipping are the same thing.

## Project skills

- Project skills live under .agents/skills and are tracked only when they are focused, portable GridShift workflow assets.
- Keep skill descriptions short and discriminating. Use SKILL.md as a router and load supporting references only when the current task needs them.
- Skills must not override the model, expand authorization, or force exhaustive output. Preserve user intent and the project’s authority boundaries.
- Optional creative-taste and image-generation skills moved out of the project are personal, explicit-only resources; general-purpose interface guidance may remain discoverable when its narrow trigger matches.
- When a selected skill is available, read its SKILL.md completely before acting and follow only the relevant supporting references.

## Documentation routing

- docs/Where To Edit.md — feature-to-file routing and ownership map.
- docs/Architecture Map.md — application boundaries and file ownership.
- docs/Design System Quick Ref.md and docs/Design Tokens.md — Broadcast Editorial rules and tokens.
- docs/Agent Workflow.md — model, delegation, validation, completion, and routing-log rules.
- docs/Release Workflow.md — commit, release, bug-tracker, What's New, and release-note gates; read only for release work.
- docs/Companion Shared Rows.md — canonical Companion and Trade-adjacent rows.
- docs/Scoring Call Sites.md — scoring call-site audit.
- docs/Fantasy Live.md — Fantasy Live chart, replay, probability, and filter rules.
- docs/Trade Engine.md and docs/Trade Proposal Cards.md — Trade architecture and card contracts.
- docs/Scout.md — Scout architecture, APIs, importers, production data, and routing.
- For QA, testing, validation, or regression-review tasks, use docs/Agent Workflow.md and the relevant feature references; do not load unrelated material.

## Design system — Broadcast Editorial

- Use semantic CSS custom properties from src/index.css; do not add hardcoded Tailwind palette or feature-code hex colors.
- Use color-signature-fg for text on signature-colored backgrounds; color-signature is decorative.
- Inputs are at least 16px; coarse-pointer controls are at least 44px; fixed bottom UI respects env(safe-area-inset-bottom).
- Use the standard easing cubic-bezier(0.32, 0.72, 0, 1), persisted display-size modes, semantic type/control/density tokens, and no CSS zoom or whole-app transforms.
- Preserve readable identity, data meaning, contrast, focus states, and reliable interaction before decorative treatment.
- Use the documented readable, data, and workbench page frames. Sticky controls paint an opaque surface, and centered modals keep headers/footers fixed while their inner region scrolls.
- A sticky/frozen header row needs an opaque background, and its `top` must cancel out any padding-top on the scrolling ancestor (e.g. `top: -16px` / `-24px` to match `.content-area`'s `pt-4`/`lg:pt-6`), not `top: 0`. That padding is only a one-time scroll offset, not a persistent band — non-sticky siblings scroll straight through it while a `top: 0` header still holds itself below that line, letting their content sneak through the gap. Canceling the offset aligns the stuck position with the container's true edge instead of covering the gap with a shield. See `.statistics-schedule-group-row` in src/index.css. If a header sticks below other fixed/sticky chrome instead of a scrolling ancestor's own padding, add that chrome's height to the offset the same way.
- A `position: sticky` header inside a plain block container (a div-per-group, as in `.statistics-schedule-kickoff-group`) naturally releases and hands off to the next group's header once its own container scrolls past, continuously and with zero lag — no extra work needed. Inside a `<table>`, it does not: `<tbody>`/`<tr>` don't bound a sticky descendant the way a block container does, so every group's sticky `<th>` locks into the same slot and overlaps instead of handing off. Don't paper over this with a scroll/IntersectionObserver-driven class toggle — that only approximates the release at whatever granularity the observer fires, which can visibly lag or jump under fast scrolling where native CSS containing-block release cannot. Instead build the grouped table from divs with ARIA table roles (`role="table"/"rowgroup"/"row"/"columnheader"/"cell"`, columns via `display: grid` + a shared `grid-template-columns`) so each group is a genuine block container, exactly like Schedule's kickoff-group divs. See `StandingsSection` in src/components/StatisticsStandings.jsx and `.statistics-standings-group` in src/index.css.
- Companion and Trade-adjacent rows use the shared row system; do not recreate team gradients, logos, avatars, status badges, selector controls, or contrast logic locally.
- Page-level unavailable, loading, and empty-route messages are centered and unframed; compact framed empty states are for inline lists, tables, and filters.

## Navigation and high-risk surfaces

- Route truth is src/utils/appRoutes.js. Use the parser, normalizer, and builder rather than duplicating route logic.
- App shell ownership is in src/App.jsx, src/components/Sidebar.jsx, src/components/NavBar.jsx, and src/components/BottomTabBar.jsx.
- Treat SleeperContext.jsx, PredictionContext.jsx, scoringEngine.js, provider boundaries, route normalization, and PWA behavior as high-blast-radius surfaces. Read their routed documentation and audit direct consumers before changing them.

## Feature maintenance triggers

- Scoring changes require docs/Scoring Call Sites.md, position-aware point-call audits, and all relevant call sites before completion.
- Trade valuation, proposal, ranking, upgrade, or explanation changes require docs/Trade Engine.md in the same pass and user-facing fantasy language in the UI.
- Trade proposal-card changes require docs/Trade Proposal Cards.md.
- Companion or Trade-adjacent row changes require docs/Companion Shared Rows.md and the shared primitives.
- Filtered ranked lists calculate rank before filtering and render the carried rank.
- productionAdjustedValue preserves null propagation and returns ktcVal rather than converting missing values to zero.

## API and release boundaries

- BALLDONTLIE, CFBD/CollegeFootballData, and similar paid credentials are secrets. Keep requests server-side and never expose keys in the client bundle.
- Never auto-commit, bump versions, push, deploy, or perform external writes unless the user explicitly requests that action.
- Read docs/Release Workflow.md before committing, preparing a release, changing release metadata, or generating release notes.

## User-facing copy

- Guides are succinct and instructional.
- Prefer plain-language labels over niche acronyms.
- Fantasy-platform errors reference the connected platform dynamically rather than hardcoding a provider name.
