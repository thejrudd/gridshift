---
name: validate-gridshift-tour
description: Validate GridShift's complete historical What's New tour before a commit or when changing tour entries, routes, anchors, copy, or tour context. Not for ordinary unit tests or unrelated UI work.
---

# Validate GridShift What's New Tour

Use this skill for release gates and changes that can affect historical tour
behavior.

1. Read docs/Release Workflow.md and the relevant entries in
   src/data/whatsNew.js.
2. Run npm run validate:tour.
3. Run npm run test:e2e:tour.
4. Check desktop and mobile routes, anchor ownership, tooltip text,
   advancement, and effective feature history after supersedes.
5. Review route, navigation, conditional-rendering, feature-copy, tour-state,
   and data-tour changes in the actual diff.

Treat mechanical or semantic failures as blockers. An unavailable browser or
environment is not a pass; report the exact missing evidence and the manual
scenario still required. Return the commands run, their results, historical
coverage, changed paths reviewed, and any unresolved gap.
