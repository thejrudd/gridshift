# Token Optimization Plan

**Status:** active operating plan
**Last reviewed:** 2026-09-12

## Goal

Reduce total expected cost for Codex work without losing the context that
protects product behavior, data meaning, accessibility, or user trust. Total
cost includes input context, model output, delegated workers, coordination,
validation, latency, and rework.

## Implemented direction

- Keep AGENTS.md and CLAUDE.md synchronized, but make both concise and
  contextual.
- Keep durable authority, safety, scope, and short routing rules in the root
  files.
- Move detailed delegation, completion, and proportional-validation guidance to
  docs/Agent Workflow.md.
- Move commit and release gates to docs/Release Workflow.md.
- Use docs/Where To Edit.md and feature documentation as progressive-disclosure
  routers.
- Track only focused, portable GridShift skills in .agents/skills:
  design-pass, gridshift-desktop-legibility, and validate-gridshift-tour.
- Keep optional creative-taste and image-generation skills in the personal,
  explicit-only collection; retain narrow general-purpose interface guidance
  when its trigger genuinely matches.
- Record routing decisions for the next 10–15 substantive tasks in
  docs/Agent Routing Log.md.

## Current skill rules

Skill descriptions should state the actual capability and the narrow condition
that activates it. SKILL.md should contain only shared purpose, essential
constraints, and routing. Put mode-specific checklists and examples in
references and read them only when the mode is relevant.

Skills do not override user instructions, authorize extra actions, or require
exhaustive output. Competing visual directions remain explicit choices rather
than ambient project guidance.

## Deferred or conditional work

- Generated data exclusion remains a separate experiment. Do not assume that a
  Claude-specific ignore file changes Codex context behavior; verify the
  mechanism and measure before adding it.
- Splitting large feature components is worthwhile only when a real task
  repeatedly needs a smaller ownership boundary. Do not refactor solely for a
  line-count target.
- Comment migration is lower priority than removing duplicated authority and
  narrowing skill discovery.
- Keep archived or historical documents out of active routing only when their
  current location and references are verified; do not move user-authored dirty
  work as part of this plan.

## Evaluation

At the end of the routing trial, compare first-pass completion, worker count,
validation effort, rework, elapsed time, and unresolved gaps. Retain a higher
model or extra reviewer only when the evidence shows that it reduces total
expected cost or materially improves confidence.
