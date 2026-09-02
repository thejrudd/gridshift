# GridShift — Project Memory

## Project Overview

- **Tech stack**: React 19 + Vite 7 + Tailwind CSS 3
- **Fonts**: Barlow Condensed (display/brand), Figtree (body/UI)
- **Dark mode**: `.dark` class on `<html>`
- **PWA**: vite-plugin-pwa + nginx in Docker
- **Active branch**: `main` — all work ships directly here
- **Current version**: v8.8.3

---

## Core Working Rules

### Task Startup

Before implementation:

1. Identify the smallest set of files likely involved.
2. Read the relevant architecture or implementation references from `docs/Where To Edit.md`.
3. Check `TO_DO.md` when the task affects planned work.
4. Check `KNOWN_BUGS.md` when the task fixes or investigates a tracked bug.
5. Delegate independent workstreams when subagents would materially improve speed or quality.
6. Do not scan the entire repository unless targeted exploration fails.

### Investigation Before Editing

For non-trivial bugs, regressions, or architectural changes:

- Determine the likely root cause before modifying code.
- Prefer targeted searches and call-site tracing over broad exploration or refactoring.
- Identify the intended fix and affected surfaces before editing.
- When root cause is uncertain, prefer a small localized experiment over speculative changes across multiple systems.

### Decision Making

Do not ask for clarification when a reasonable, reversible interpretation exists and the instructions, existing product rules, or repository conventions make the choice clear.

Ask when:

- different interpretations materially change user-visible behavior,
- the choice is difficult to reverse,
- it affects data integrity, security, billing, or architecture,
- or the user explicitly owns the product/design decision.

For these preference questions, ask before implementation rather than after making a draft. Present concise options, include the recommended option, and allow the user to simply accept the recommendation. Do not ask preference questions for low-risk implementation details that can be resolved from the repository.

For low-risk implementation details, choose the option most consistent with the existing codebase and record meaningful assumptions.

When operating unattended, proceed with the most reasonable interpretation instead of blocking on low-risk ambiguity.

### Scope and Simplicity

- Match the solution to the problem. Use the simplest solution that reliably satisfies the requirement.
- Keep changes scoped to the requested work.
- Do not opportunistically refactor adjacent code or reformat unrelated files.
- Do not introduce abstractions solely for hypothetical future needs.
- Surface worthwhile follow-up work separately rather than folding it into the current task.
- Suggest materially better long-term approaches when relevant, but do not expand scope without reason.

Once the requested behavior works and relevant validation passes, stop editing.

### Reuse Before Creation

Before creating a new component, hook, utility, formatter, token, data model, or shared pattern:

1. Search for an existing equivalent.
2. Prefer extending an existing shared implementation when responsibilities genuinely align.
3. Do not consolidate code merely because it looks similar when the behaviors differ materially.

### Uncertainty

- Flag meaningful uncertainty explicitly.
- Prefer evidence from the existing code and documentation over assumptions.
- When useful, run a small, localized, low-risk experiment to test a hypothesis.
- Do not leave speculative changes in place simply because they appear to work.

---

## Model and Subagent Policy

Delegation and model selection are deliberate routing decisions, not defaults supplied by the runner. Before dispatching work, classify each workstream by purpose, risk, and reasoning difficulty; choose a model, reasoning effort, and relevant skillset that fit that classification. Do not use Luna at Extra High/xhigh reasoning for routine work merely because it is the available default.

For one clearly scoped change, the parent agent should implement it directly. If that change is high-risk and independent review would materially reduce risk, ask about that preference before implementation rather than delegating automatically. For prompts containing multiple distinct fixes or changes, split independent workstreams and give each one an explicit role before implementation. A single catch-all subagent is not a substitute for tailored exploration, implementation, and verification when those responsibilities can be separated.

Use this routing guide as the default:

| Workstream | Default model / reasoning | Typical skillset |
| --- | --- | --- |
| Targeted repository exploration, code-path tracing, or documentation lookup | **Luna / low** | Repository research; the relevant feature or documentation skill |
| Straightforward isolated implementation or editing | **Luna / medium** | The relevant implementation skill; add UI/accessibility guidance for interface work |
| Test authoring, regression review, changed-file lint, or focused validation | **Luna / low–medium** | Testing/review skill; browser or desktop-legibility skill when the claim is visual |
| Visual/interface design, responsive behavior, or interaction polish | **Luna / medium** | `interface-design`, plus the narrow skill that matches the surface, such as `apple-design`, `gridshift-desktop-legibility`, or `design-taste-frontend` |
| Difficult debugging, multi-file implementation, or cross-cutting behavior | **Terra / high** | The relevant feature skill plus testing or architecture guidance |
| Architecture, data integrity, security, production recovery, or unresolved high-impact regressions | **Terra / xhigh** | Architecture/security/feature-specific skill and an independent verification role |
| Exceptionally ambiguous, high-risk, or failed-Terra work | **Sol / max** | The narrowest applicable specialist skill; use only when the risk justifies it |

Reasoning effort is independent of model family. Optimize for first-pass completion, not the lowest nominal token cost: start at the lowest level likely to succeed, but choose Terra before dispatch whenever a missed dependency, uncertain root cause, or broad downstream effect would likely cause rework. **Luna / xhigh is an exception, not a baseline**; routine work should use Luna low or medium.

Use **Sol / max** only when the cost of a wrong or incomplete first pass justifies the highest reasoning level: unusually ambiguous architecture or product decisions, security or data-integrity boundaries, production recovery with significant blast radius, contradictory evidence after Terra investigation, a failed Terra attempt that needs a fresh senior review, or an explicitly requested maximum-quality second opinion. Do not use Sol merely because a task is large, touches many files, or is time-consuming; use Terra when the problem is difficult but structurally understood.

Every delegation must identify all four items before dispatch: the workstream purpose, the selected model and reasoning effort, the applicable skillset, and the expected deliverable. Announce this routing to the user when the choice is non-obvious; otherwise keep it concise and proceed. If no subagent is used for a non-trivial task, state why the work is better kept in the parent agent (for example, it is one clearly scoped change, tightly coupled edits, no meaningful parallelism, or a final synthesis step).

### Preferred Subagent Roles

Prefer delegating:

- repository and code-path investigation,
- independent root-cause analysis,
- test and regression review,
- documentation impact analysis,
- isolated implementation workstreams.

For multi-workstream changes, use this sequence: read-only investigation first, one designated implementation owner second, and an independent review agent afterward. For a high-risk single-scope change, ask before implementation whether to add the independent review. The reviewer checks the resulting diff and evidence rather than repeating the implementation. For visual changes, include a browser-visible, geometry, accessibility, or design-system review as appropriate.

Avoid having multiple agents modify the same files unless necessary. Prefer read-only investigation and review agents when ownership overlaps, and make the parent agent the final owner of conflicting recommendations.

Delegated agents must read the relevant `SKILL.md` completely before acting and must stay within the assigned purpose. They should return concrete findings, changed paths, validation results, and unresolved uncertainty so the parent can synthesize rather than blindly accept the result.

The parent agent owns the final result and must synthesize and verify subagent work rather than assuming it is correct.

---

## Validation

Use validation proportional to the change.

### During Implementation

Before implementation begins on work that needs validation, ask whether a usage test is wanted in Codex or whether the user plans to test manually in the live developer environment. Do not infer that choice from the existence of automated tests.

Run the smallest relevant check needed to confirm the current change, such as:

- targeted unit tests,
- targeted lint or type checks,
- localized build/import checks,
- focused browser or E2E tests.

Do not repeatedly run full-project validation after every small edit unless the change has broad architectural impact.

### Before Declaring a Task Complete

Validate the affected feature and its immediate integration surfaces.

A task is complete when:

- the requested behavior is implemented,
- relevant edge cases identified during the task are handled,
- required documentation is updated,
- appropriate validation passes,
- unrelated files were not changed,
- and remaining uncertainty or follow-up work is clearly reported.

A commit is a separate action and occurs only when explicitly requested.

### Before Commit

Run all commit-specific and release-specific gates defined below.

---

## Collaboration and Project Memory

- Keep `AGENTS.md` and `CLAUDE.md` synchronized. Any instruction or project-memory change made in one must be mirrored in the other during the same pass.
- Prefer plain-language communication and implementation choices over unnecessary complexity.
- Keep project-specific implementation knowledge in the relevant `docs/` file instead of expanding this file unless the rule must apply broadly to future tasks.

---

## API Secret Handling

- Treat BALLDONTLIE, CFBD/CollegeFootballData, and similar paid API keys as secrets.
- Never commit secrets to the repository or expose them in the client bundle.
- Paid API access must cross a server-side or proxy boundary before production use.
- If moving an existing client-used API to a paid plan, rotate the existing key as part of the migration.

---

## Documentation Map

Use `docs/Where To Edit.md` to determine which references apply before implementation.

Key references:

- `docs/Home.md` — documentation map and entry point
- `docs/Architecture Map.md` — architecture and file ownership
- `docs/Where To Edit.md` — feature-to-file edit guide
- `docs/Design System Quick Ref.md` — core design rules and team colors
- `docs/Design Tokens.md` — full design token reference
- `docs/Companion Shared Rows.md` — canonical Companion/Trade row system
- `docs/Scoring Call Sites.md` — scoring-change audit checklist
- `docs/Fantasy Live.md` — Fantasy Live implementation rules (pace chart, replay, win probability, play filter)
- `docs/Trade Engine.md` — Trade architecture, valuation, selection, and explanation rules
- `docs/Trade Proposal Cards.md` — Trade proposal card layout and sizing
- `docs/Scout.md` — Scout architecture, APIs, importers, production data, modals, and routing
- `QA_CHECKLIST.md` — manual QA flows

Do not load `QA_CHECKLIST.md` during normal implementation unless the task is explicitly about QA, testing, validation, or regression review.

---

## Design System — "Broadcast Editorial"

Follow `docs/Design System Quick Ref.md` for all UI changes and `docs/Design Tokens.md` for the complete token set.

Critical invariants:

- Use CSS custom properties from `src/index.css`; do not introduce hardcoded Tailwind palette colors or hex colors into feature code.
- `--color-signature` is decorative only. Use `--color-signature-fg` for text on signature-colored backgrounds.
- Inputs must use at least `16px` font size to prevent iOS auto-zoom.
- Coarse-pointer controls must remain at least `44px`.
- Fixed bottom UI must respect `env(safe-area-inset-bottom)`.
- Standard motion easing is `cubic-bezier(0.32, 0.72, 0, 1)`.
- Display density is driven by persisted `gridshift-display-size` and `data-display-size="compact|comfortable|large"` on `<html>`, with Comfortable as fallback.
- Apply display density before React renders.
- Never infer display density from DPI or use CSS `zoom` or whole-app transforms.
- Prefer semantic `--type-*`, `--control-height`, and `--density-space-*` tokens over new fixed typography or density values.
- `--type-micro` is for decorative badges and overlines, not meaningful labels.
- Prefer fluid, container-aware responsive layouts using tools such as `clamp()`, `minmax()`, wrapping, flexible gaps, and viewport-sensitive spacing.
- Fixed dimensions are appropriate only for documented shell constraints, fixed-format media/aspect ratios, or explicit feature contracts.

### Page Frames

Route roots must use the appropriate centered frame tier:

- `page-frame-readable` — `1200px`, settings/detail content
- `page-frame-data` — `1600px`, lists and standings
- `page-frame-workbench` — `1920px`, multi-panel tools

Keep identity, primary metrics, and actions in predictable columns instead of stretching rows across ultrawide displays.

### Sticky and Modal Behavior

Sticky controls inside independently scrolling regions must paint an opaque surface through the scrollport's top padding or offset. Scrolled content must never remain visible behind sticky tabs, filters, or headers.

Centered display/settings modals must keep headers and footers fixed within the modal while an inner region scrolls. Primary actions must remain visible on narrow screens and at Large display size.

Use the shared `src/components/Modal.jsx` for standard centered modals. Bottom sheets and ActionSheets are separate patterns and must not use `Modal`.

### Shared Companion and Trade Rows

Companion and Trade-adjacent player or asset selector rows must use the shared system documented in `docs/Companion Shared Rows.md`.

Do not recreate local:

- team-gradient logic,
- logo/avatar fallback behavior,
- status badges,
- selector controls,
- gradient contrast logic.

### Empty and Unavailable States

Page-level unavailable, loading, or empty-route reason messages must be centered, unframed text matching the Companion Matchup empty-state pattern.

Compact framed empty states remain appropriate for inline list, table, and filter results.

---

## Navigation Architecture

### Breakpoints

- `< 1024px`: mobile/tablet — bottom tab bar + sticky 44px NavBar
- `≥ 1024px`: desktop — 240px left sidebar + content area

### Navigation State

- `activeTab`: `'predictions' | 'statistics' | 'companion' | 'compare'`
- `seasonView`: `'predictions' | 'standings' | 'playoffs'`
- `companionView`: `'roster' | 'rankings' | 'live' | 'matchup' | 'waiver' | 'league' | 'defense' | 'trade' | 'scoring'`

### Key Files

- `src/App.jsx` — primary shell
- `src/components/Sidebar.jsx` — persistent desktop sidebar
- `src/components/NavBar.jsx` — mobile/tablet sticky top navigation
- `src/components/BottomTabBar.jsx` — mobile/tablet bottom navigation

---

## High-Risk Areas

Treat changes to these surfaces as higher blast-radius work and validate accordingly:

- `SleeperContext.jsx` — cascades through Companion and Compare
- `PredictionContext.jsx` — can create subtle opposing-game-result synchronization regressions
- `scoringEngine.js` — affects Companion, Compare, KTC adjustments, and scoring-derived behavior

---

## Feature-Specific Maintenance Rules

### Scoring

For any scoring-logic change, including new fields, bonuses, or Sleeper stat keys:

- Follow the complete audit in `docs/Scoring Call Sites.md`.
- Verify every relevant `calcPoints()` and `calcPointsFromTotals()` call passes `position`.
- Search all call sites before declaring the change complete.

### Trade Engine

Any change to:

- Trade valuation,
- proposal generation,
- proposal selection or ranking,
- Upgrade logic,
- or Trade explanation wording

must update `docs/Trade Engine.md` in the same pass.

Prefer user-facing fantasy-football language in Trade UI. Keep internal engine terminology in documentation unless explicitly useful to users.

### Trade Proposal Cards

When changing Trade proposal player or draft-card layout, follow `docs/Trade Proposal Cards.md` and validate its sizing, ratio, content-priority, responsive, and equal-height requirements.

### Companion Shared Rows

When changing Companion or Trade-adjacent player/asset rows, follow `docs/Companion Shared Rows.md` and use its shared components and visual helpers.

Do not recreate row alignment or team-visual behavior in feature components.

### Ranked Search Results

When a ranked list can be filtered:

- Compute rank on the complete sorted list before filtering.
- Carry the rank as data.
- Render the stored rank rather than the filtered array index.

### `productionAdjustedValue`

Preserve null propagation.

The early-return guard must return `ktcVal`, not `ktcVal ?? 0`, so missing values remain missing and render as `—` rather than `0`.

---

## UI Content Style

### Guides

Keep Guide content succinct and instructional:

- 1–2 sentences per step
- lead with what the feature does, then how to use it
- do not restate obvious UI text
- generally use 2–4 steps per tab

### User-Facing Copy

- Prefer plain-language labels over niche or non-standard acronyms.
- Avoid acronyms when they reduce comprehension.
- Fantasy-platform error messages must reference the currently connected platform dynamically rather than hardcoding ESPN, Sleeper, or another provider.

---

# Commit and Release Workflow

## Never Auto-Commit

Do not:

- create commits,
- bump versions,
- update release-tracking files solely because a version was mentioned,
- or push changes

unless the user explicitly asks.

A statement such as "let's work on v8.7" establishes version context; it is not permission to commit.

After committing, do not run `git push`. The user pushes manually.

---

## Before Every Commit

Before committing:

1. Ask the user whether open bugs assigned to the target version have actually been resolved.
2. Do not move version-specific bugs to Fixed based only on implementation assumptions.
3. Run the required validation and historical What's New tour gate.
4. Cross-check release metadata against the actual diff.

---

## Version-Bump Checklist

For every commit that bumps the version, update all applicable release files:

1. `CHANGELOG.md`
2. `KNOWN_BUGS.md`
3. `TO_DO.md`
4. `package.json`
5. `src/components/Sidebar.jsx`
6. `README.md`
7. `src/data/whatsNew.js` for feature releases only

Updating `package.json` is required because the version change forces vite-plugin-pwa to regenerate the service-worker precache revision.

### What's New

For feature releases, ask the user which shipped changes should receive in-app What's New tour coverage.

Append the new version entry to `src/data/whatsNew.js`; entries remain oldest-first.

Each feature must contain:

- `id`
- `name`
- `description`
- 1–3 tour `steps`

Each step must include:

- a route using the `applyRoute` shape,
- an anchor selector such as `[data-tour="..."]`,
- tooltip title,
- tooltip body.

Add missing `data-tour` attributes where needed.

If a newer feature replaces or materially changes an older toured feature, use `supersedes: ['older-feature-id']`.

Do not rewrite historical entries except to repair broken routes, anchors, or copy. Preserve history through supersession.

Patch/bug-fix versions do not receive What's New entries.

---

## What's New Tour Regression Gate

Before every commit, invoke `$validate-gridshift-tour` and validate the complete historical tour, not only the target release.

The gate must:

1. Run `npm run validate:tour`.
2. Run `npm run test:e2e:tour`.
3. Validate desktop and mobile routes, anchors, tooltips, and advancement.
4. Evaluate feature evolution across crossed versions and apply supersession where newer behavior replaces older behavior.
5. Review staged changes affecting routes, navigation, conditional rendering, feature names/copy, tour context/demo state, or `data-tour` anchor owners.
6. Confirm remaining historical tooltip text accurately describes the current UI.
7. Treat mechanical or semantic historical failures as commit blockers.

For upgrades spanning multiple feature versions, validate effective crossed entries in order after supersession. Do not replay raw historical entries when doing so would revive obsolete behavior.

A successful build or unit-test run does not replace this gate.

---

## CHANGELOG.md

- Never use an `Unreleased` section.
- Every entry belongs to a specific version.
- Entries are chronological: oldest first, newest last.
- If the target version is unclear, ask before writing the entry.

---

## KNOWN_BUGS.md

Add a bug to **Open** before fixing it when:

- it is user-visible,
- it is a regression,
- it may survive the current work session,
- or separately tracking it has value.

Do not create tracker churn for trivial implementation mistakes discovered and corrected within the same active task before they reach a completed state.

If a previously fixed bug recurs, move it back to Open and remove its Fixed In version.

Move bugs to **Fixed** only at commit time, using the actual committed version. Never use `Unreleased`.

---

## TO_DO.md

- The file is `TO_DO.md`.
- Versioned sections are chronological, earliest first.
- `Backlog (Unversioned)` remains last.
- Add newly planned features to the appropriate upcoming version or backlog when requested or agreed upon.
- Delete completed version sections entirely once shipped; completed work belongs in `CHANGELOG.md`.
- Before committing, cross-check `TO_DO.md` against `CHANGELOG.md` and remove shipped work.
- The earliest versioned section should always represent the next unshipped version.

---

## README.md

### Features

List major features only, one line each. Do not add bug fixes or minor polish.

### What's New

Show only the most recently committed version. Replace the previous entry rather than accumulating historical entries.

Link to `CHANGELOG.md` for history.

### Roadmap

Derive major planned versions and significant blocked features from `TO_DO.md`.

Do not include backlog polish or unversioned experiments.

---

## Commit Messages

Version/release commit subjects must use:

`vX.Y[.Z] - Short Release Theme`

Do not use generic subjects such as `Release v6.3`.

Include a commit body with:

- a short summary sentence
- a `Highlights:` list of the major shipped changes

Keep the message aligned with the actual diff, `CHANGELOG.md`, and `README.md`.

---

## GitHub Release Notes

When asked for GitHub release notes, return raw Markdown source.

Use:

`# vX.Y[.Z] - Short Release Theme`

Sections appear in this order when applicable:

1. `## New Features`
2. `## Improvements`
3. `## Bug Fixes`

Describe changes between the previous released version and the requested release.

Keep bullets user-facing and grouped by feature area. Avoid unnecessary implementation detail.
