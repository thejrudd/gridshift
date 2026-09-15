# Agent Routing Log

This is a lightweight trial record for the model and delegation rubric in
docs/Agent Workflow.md. Record only substantive tasks; do not load this file
for ordinary implementation.

Keep each entry compact:

- Date and task:
- Parent model and effort:
- Delegated roles, models, and efforts:
- Validation tier and checks:
- Escalation or review:
- Rework, failure, or saved effort:
- Final status:

The trial target is the next 10–15 substantive tasks. After the trial, revise
the routing rubric from observed total cost and quality.

## Entry 1 — 2026-09-12 — Instruction and skill optimization

- Date and task: Review the GPT-6 Astra guidance, attached agent-tree concept,
  GridShift instructions, skills, and completion contract.
- Parent model and effort: GPT-5 parent session; exact app alias unavailable.
- Delegated roles, models, and efforts: Luna/low repository explorer;
  Terra/high policy architect; Sol/high adversarial tree review; Terra/high
  governance review; Luna/low focused correction review.
- Validation tier and checks: Tier 0 governance/skill metadata review;
  synchronized-file check; manual JavaScript YAML/frontmatter validation;
  routed-document checks; npm run validate:tour.
- Escalation or review: Astra was not needed; Terra/high review initially found
  three concrete gaps, and Luna/low follow-up accepted the corrections.
- Rework, failure, or saved effort: one initial Sol/high tree review timed out
  and was stopped without edits; no repository rework or unrelated-file
  changes resulted.
- Final status: Complete for the agreed governance scope; the bundled
  skill-creator validator remains environment-blocked because PyYAML is not
  installed, with equivalent validation passing.

## Entry 2 — 2026-09-12 — Fantasy Matchups actual score hierarchy and pace delta

- Date and task: Keep started-player actual points primary, show the
  full-game projection beneath them, and distinguish live performance against
  the expected pace target in Fantasy Matchups rows.
- Parent model and effort: GPT-5 parent session; local default effort.
- Delegated roles, models, and efforts: None; one coherent owner.
- Validation tier and checks: Tier 2; focused matchup unit/import tests (40
  passed), production build, focused Playwright actual-first and pregame
  regressions in desktop and mobile (4 passed), and git diff --check.
- Escalation or review: No independent review; no-watch preview required
  escalated local listener access after the dev harness hit EMFILE.
- Rework, failure, or saved effort: The initial dev/browser launch was
  environment-blocked by EMFILE watch limits and sandbox EPERM listener
  restrictions; the no-watch preview pivot produced passing browser evidence.
  Focused ESLint still reports pre-existing React hook/ref errors in the
  already-dirty CompanionMatchup.jsx. The adjacent historical-finality E2E
  still fails its pre-existing forecast-lock assertion before row checks.
- Final status: Validated; detailed live UI acceptance remains a user-owned
  follow-up, and changing the displayed live projection number itself remains
  intentionally deferred beyond the expected-pace comparison.

## Entry 3 — 2026-09-13 — Fantasy Matchups metric labels and rank copy

- Date and task: Remove redundant `PTS`/`PROJ` row labels and change the
  positional season-rank suffix to `Overall` in Fantasy Matchups.
- Parent model and effort: GPT-5 parent session; local default effort.
- Delegated roles, models, and efforts: None; one coherent owner.
- Validation tier and checks: Tier 2; production build, focused matchup unit
  and import tests (40 passed), focused Playwright pregame and started-player
  regressions in desktop and mobile (4 passed), and git diff --check.
- Escalation or review: No independent review; no-watch preview required
  escalated local listener access.
- Rework, failure, or saved effort: A direct rank-copy browser assertion was
  removed because the synthetic fixture has no positive season-scoring stats,
  so it renders no rank metadata; the source branch remains covered by the
  requested `Overall` copy. Focused ESLint still reports the existing
  CompanionMatchup hook/ref debt (14 errors and 7 warnings).
- Final status: Validated; detailed live UI acceptance remains a user-owned
  follow-up.

## Entry 4 — 2026-09-13 — Fantasy Matchups inline performance delta

- Date and task: Remove the remaining standalone points presentation and place
  the live performance arrow and differential beside the actual score.
- Parent model and effort: GPT-5 parent session; local default effort.
- Delegated roles, models, and efforts: None; one coherent owner.
- Validation tier and checks: Tier 2; production build, focused matchup unit
  and import tests (40 passed), focused Playwright pregame and started-player
  regressions in desktop and mobile with inline-position assertions (4
  passed), and git diff --check.
- Escalation or review: No independent review; no-watch preview required
  escalated local listener access.
- Rework, failure, or saved effort: Kept the shared CompanionPlayerMetric API
  unchanged and scoped the horizontal treatment to matchup actual metrics.
  Focused ESLint still reports the existing CompanionMatchup hook/ref debt
  (14 errors and 7 warnings).
- Final status: Validated; detailed live UI acceptance remains a user-owned
  follow-up.

## Entry 5 — 2026-09-13 — Fantasy Matchups final-score emphasis

- Date and task: Remove the visible live score differential, neutralize
  completed-player scores, and increase actual-versus-projection hierarchy.
- Parent model and effort: GPT-5 parent session; local default effort.
- Delegated roles, models, and efforts: None; one coherent owner.
- Validation tier and checks: Tier 2; production build, focused matchup unit
  and import tests (40 passed), focused Playwright pregame/live/final
  regressions in desktop and mobile (6 passed), and git diff --check.
- Escalation or review: No independent review; no-watch preview required
  escalated local listener access.
- Rework, failure, or saved effort: Removed the inline differential after the
  user found it visually offset; live score color remains available for
  ahead/behind context, while confirmed final rows use neutral styling. The
  focused ESLint result remains the existing CompanionMatchup hook/ref debt
  (14 errors and 7 warnings).
- Final status: Validated; detailed live UI acceptance remains a user-owned
  follow-up.

## Entry 6 — 2026-09-13 — Fantasy Matchups finished-score neutrality

- Date and task: Remove the visible plus/minus differential, retain live-only
  performance color, neutralize completed player scores, and enlarge actual
  score emphasis relative to projection.
- Parent model and effort: GPT-5 parent session; local default effort.
- Delegated roles, models, and efforts: None; one coherent owner.
- Validation tier and checks: Tier 2; production build, focused matchup unit
  and import tests (40 passed), focused Playwright pregame/live/final
  regressions in desktop and mobile (6 passed), and git diff --check.
- Escalation or review: No independent review; no-watch preview required
  escalated local listener access.
- Rework, failure, or saved effort: Replaced the inline delta treatment after
  visual review found it offset; final-state coverage now confirms no delta or
  positive/negative class, while live coverage confirms semantic color stays
  available. Focused ESLint still reports the existing CompanionMatchup
  hook/ref debt (14 errors and 7 warnings).
- Final status: Validated; detailed live UI acceptance remains a user-owned
  follow-up.

## Entry 7 — 2026-09-13 — League switcher Broadcast lineup redesign

- Date and task: Redesign the Switch League dialog around an explicit year-first
  flow, league imagery, readable contrast, and image-led league selection rows.
- Parent model and effort: GPT-5 parent session; local default effort.
- Delegated roles, models, and efforts: None; one coherent UI owner.
- Validation tier and checks: Tier 2; targeted ESLint, production build,
  focused league-switcher Playwright regression in desktop and mobile (2
  passed), light/dark screenshot review, and git diff --check.
- Escalation or review: No independent review; the initial watched server hit
  EMFILE/EPIPE, so browser validation used an escalated no-watch preview.
- Rework, failure, or saved effort: Visual review replaced the unreliable
  remote default account image and missing team-count output with stable
  fallbacks. Copy ID remained isolated from league selection, and the existing
  ignored test file was restored after temporary expanded visual coverage.
- Final status: Validated; detailed live UI acceptance remains a user-owned
  follow-up.

## Entry 8 — 2026-09-13 — Player matchup decision briefing redesign

- Date and task: Rework the Fantasy Matchups player drilldown into an
  evidence-led sit/start briefing with projection range, season and opponent
  benchmarks, availability, outdoor weather, and recent form.
- Parent model and effort: Sol/high implementation owner under the parent
  Codex session.
- Delegated roles, models, and efforts: Luna/medium read-only data-contract
  audit; Terra/high independent read-only implementation and visual-risk
  review.
- Validation tier and checks: Tier 2; 37 focused unit/rendering tests passed,
  the dedicated Playwright fixture passed at 1280x720, 1440x600, 2560x1440,
  and 390x844, production build passed, task-owned ESLint passed, and scoped
  git diff --check passed. A labeled four-viewport contact sheet was reviewed.
- Escalation or review: Watched Playwright startup hit the known EMFILE/EPIPE
  environment limit, so validation used an escalated no-watch production
  preview and Chromium launch. The independent reviewer found missing
  `isFinal`/`final` phase handling and undersized scoring-contribution text;
  both were repaired and covered before final validation.
- Rework, failure, or saved effort: Opponent allowance is compared with the
  league-average positional allowance rather than the individual player's
  projection, tied allowances share competition rank, and early-season prior
  evidence stays isolated from shared Heatmap/projection classifications.
  Visual review also shortened the mobile outlook and removed a third repeated
  weather warning. Focused CompanionMatchup lint still reports its existing
  hook/ref debt (14 errors and 5 warnings).
- Final status: Validated; detailed live UI acceptance remains a user-owned
  follow-up.
