# Agent Workflow

Use this document when choosing a model, delegating work, escalating uncertainty,
planning validation, or deciding whether a task is complete. Root instructions
contain only the short routing contract so ordinary work does not load this
detail unnecessarily.

## Objective

Optimize total expected task cost, not only the tokens in one model response.
Count context duplication, coordination, latency, validation, and likely rework
alongside model tokens. Use the lowest-cost path that is likely to finish the
defined slice correctly on its first useful pass.

## Authority and autonomy

- The user's explicit request and choices define scope and take precedence over
  guidelines in a skill.
- A skill cannot authorize a commit, release, deployment, external write,
  destructive action, secret-handling change, or expanded product scope.
- For a material product, design, architecture, security, data-integrity,
  billing, irreversible-action, or validation-boundary choice, ask before
  implementation. Present concise options, identify a recommendation, and let
  the user accept it or choose another.
- For reversible low-risk implementation details, choose the lowest-risk
  interpretation and state the assumption; do not ask preference questions
  merely to offload routine decisions.
- Once a scoped change is authorized, continue through implementation,
  inspection, repair, and proportionate checks without repeated approval stops.
- If a skill causes a pause, permission request, unfinished work, or divergence,
  name the exact SKILL.md, distinguish its requirement from interpretation, and
  explain the effect.

## Routing rubric

| Task shape | Default model and effort | Delegation |
| --- | --- | --- |
| One known, isolated, reversible change with one coherent owner | Parent locally, or Luna / medium | None |
| Targeted lookup, code tracing, documentation lookup, or routine test review | Luna / low | One read-only worker only when it removes genuine uncertainty |
| Isolated implementation, focused test work, or bounded UI refinement | Luna / medium | One worker when it owns a separate file set |
| Bounded but unusually difficult investigation | Luna / max | Use only when it is still self-contained and cheaper than Terra |
| Uncertain root cause, difficult debugging, multi-file or cross-surface behavior | Terra / high | Up to two independent investigators, then one owner |
| Architecture, scoring, provider semantics, secrets, data integrity, production recovery, or high-impact regression | Terra / xhigh | One owner plus independent review |
| Complex multi-file implementation where stronger first-pass quality is likely to reduce total cost | Sol / high | One owner; parent integrates and reviews |
| Contradictory evidence, exceptional unresolved judgment, or explicitly requested maximum-quality review | Sol / max | Narrow the decision before using it; avoid broad fan-out |
| Demanding, clearly bounded end-to-end work or architectural reconciliation | Astra / medium | Explicitly announce Astra and its effort; use only for this class of work |
| Independent high-impact review after a lower-tier implementation | Lowest sufficient review tier | Use Astra / xhigh only when the task also meets an approved Astra class and a stronger review is likely to reduce risk |

Model escalation must answer a concrete question: what uncertainty, missed
dependency, or rework risk does the higher tier remove? If there is no answer,
stay at the lower-cost tier. Task size alone is not an escalation reason.

Sol/high is allowed as an implementation owner when first-pass quality matters
for a complex multi-file slice. It is not the default for ordinary large or
time-consuming work; Terra is the normal cross-cutting tier.

Astra has standing approval only for a demanding, clearly bounded end-to-end
workflow, architectural reconciliation, or high-ambiguity cross-surface task
where stronger synthesis is likely to reduce rework. State Astra and the effort
in the routing handoff. Do not use Astra for routine exploration, a one-file
change, simple visual polish, routine lint, or a task that lacks acceptance
criteria.

## Delegation design

Delegate only when work is independently separable and parallel progress or
independent confidence is worth the extra context. Keep the prompt minimal and
give each worker one clear question or ownership boundary.

Normal fan-out is:

- zero to two read-only investigators;
- one implementation owner;
- one independent reviewer only when a review trigger applies.

Do not exceed two investigators concurrently. Do not recursively delegate
without a new parent-owned decision. Assign one writer per file or tightly
coupled file set. Do not ask multiple workers to edit overlapping files.

Every delegated handoff contains four compact fields:

1. Purpose and non-goals.
2. Model and reasoning effort.
3. Skillset or supporting references.
4. Expected deliverable and evidence format.

Announce routing when the choice is non-obvious, when Astra is used, or when a
higher tier changes the cost or authority boundary. Routine low-cost routing
does not need a long explanation.

### Investigator output

- Question answered.
- Evidence: files, symbols, and useful line ranges.
- Likely cause or dependency map.
- Risk and affected surfaces.
- Recommendation and unresolved uncertainty.
- Explicit statement that no files were changed when the task is read-only.

### Implementation-owner output

- Scope and non-goals.
- Changed paths.
- Requirement-to-behavior mapping.
- Validation actually run and its result.
- Checks intentionally not run and why.
- Remaining uncertainty.
- Explicit statement that no commit, push, deploy, or external write was implied.

### Reviewer output

- Acceptance criteria checked.
- Findings ranked by severity with precise evidence.
- Missed dependencies or insufficient validation.
- Verdict: accept, accept with disclosed gap, or block.
- No speculative redesign and no duplicate implementation.

The parent remains responsible for conflict resolution, final integration,
evidence synthesis, and declaring the task state.

## Independent review triggers

Independent review is mandatory for changes involving:

- secrets, security, or authorization;
- scoring or data-integrity invariants;
- provider semantics or paid API boundaries;
- production recovery;
- release or release metadata;
- route normalization or shared state with a material blast radius;
- a high-impact regression;
- a visual change whose acceptance depends on browser-visible geometry and the
  implementation evidence does not already cover it.

Review remains optional for ordinary isolated edits, copy changes, and low-risk
local UI work. A reviewer checks the actual diff and evidence; it does not
re-run the whole investigation by default.

## Good versus complete

Good means the work is scoped, plausibly correct, and supported by enough
evidence to request review or user testing.

Complete means every agreed acceptance criterion has an evidence-backed
disposition: passed, intentionally deferred with user approval, or blocked with
a concrete reason. A complete task record covers:

1. Outcome — requested behavior or invariant is implemented.
2. Scope — unrelated dirty work is preserved.
3. Dependencies — direct and material downstream consumers are checked.
4. Validation — proportionate checks actually run are reported.
5. Risk evidence — browser proof for visual claims, caller audits for shared
   utilities, and multi-context coverage for scoring or provider changes.
6. Documentation — durable contracts and required references are updated.
7. Uncertainty — manual testing, environment blocks, and deferred work are
   plainly labeled.
8. Authority — shipping, committing, deploying, and external actions remain
   separate decisions.

Use these statuses:

| Status | Meaning |
| --- | --- |
| Implemented | Code or documentation exists, but agreed evidence is incomplete |
| Validated | Agreed automated and/or browser checks passed, with gaps disclosed |
| Complete | The explicit definition of done is satisfied |

If user acceptance is an agreed gate, remain Validated and pending user
acceptance until it happens. If the user owns detailed UI testing as a
follow-up rather than a gate, report that follow-up without pretending it ran.
An environment failure is never a passing check.

## Proportional validation

| Tier | Use for | Minimum evidence |
| --- | --- | --- |
| 0 | Copy, comments, metadata, or documentation-only edits | Diff review and link/reference checks |
| 1 | Isolated behavior or utility change | Focused unit/import check and changed-file lint where meaningful |
| 2 | Component or route behavior | Focused tests plus relevant integration path; browser evidence for visual claims |
| 3 | Shared state, provider, scoring, routing, PWA, or performance | Targeted suite, build, immediate integration surfaces, and a precise usage scenario |
| 4 | Release or high-risk data behavior | Tier 3, mandatory review when triggered, and all release gates |

Do not impose a build or full suite on every small edit. Do run required local
checks without repeated approval when fixtures are disposable and have no
production access. Repair failures caused by the requested change and rerun the
affected checks.

For UI work, Codex verifies underlying behavior and basic interaction; the user
owns detailed live UI testing unless a different boundary is agreed. Give the
user exact setup, action, expected result, and edge cases for that follow-up.

## Routing trial log

For the next 10–15 substantive tasks, record the model, reasoning effort,
delegation count, validation tier, escalation, and rework reason in
docs/Agent Routing Log.md. Keep entries short and use the evidence to revise
this rubric rather than preserving intuition that no longer matches observed
cost.
