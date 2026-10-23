---
name: validate-gridshift-tour
description: Validate GridShift's complete historical What's New tour before a commit or when changing tour entries, routes, anchors, copy, or tour context. Not for ordinary unit tests or unrelated UI work.
---

# Validate GridShift What's New Tour

Use this skill for release gates and changes that can affect historical tour
behavior.

1. Read docs/Release Workflow.md, inspect the proposed commit/release scope and
   its diff, and read the relevant entries in src/data/whatsNew.js.
2. Before running either validation command, present the user with the
   candidate list of genuinely new user-facing capabilities; do not count
   enhancements or bug fixes as new features. Ask the user to confirm or
   correct it. If there are no new features, say so and ask them to confirm
   that there are none. Wait for explicit confirmation; do not start tour
   validation before it arrives.
3. For a feature release, confirm which user-approved features should receive
   in-app What's New tour coverage. If the user already specified coverage
   while confirming the list, do not ask again.
4. Apply any confirmed What's New entry changes before validating. Then run
   npm run validate:tour.
5. Run npm run test:e2e:tour.
6. Check desktop and mobile routes, anchor ownership, tooltip text,
   advancement, and effective feature history after supersedes.
7. Review route, navigation, conditional-rendering, feature-copy, tour-state,
   and data-tour changes within the proposed commit/release scope.

Treat mechanical or semantic failures as blockers. An unavailable browser or
environment is not a pass; report the exact missing evidence and the manual
scenario still required. Return the commands run, their results, historical
coverage, changed paths reviewed, and any unresolved gap.
