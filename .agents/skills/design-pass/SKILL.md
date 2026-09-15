---
name: design-pass
description: Audit or implement a named GridShift UI surface when the user requests a design review, UI cleanup, inconsistent controls, missing interaction states, or responsive breakage. Not for general feature work, marketing pages, or image generation.
---

# GridShift Design Pass

Use this skill with a named feature area. If no area is given and the missing
surface changes the work, ask for it before acting.

- Read the relevant route component, styles, tests, and routed documentation.
- Use Broadcast Editorial, existing tokens, shared Companion controls, and the
  user's stated acceptance criteria as the design authority.
- Audit purpose, on-screen noise, duplicated information, responsive geometry,
  space allocation, accessibility, and complete interaction states.
- For desktop readability concerns, also use the focused desktop-legibility
  skill. For a grouped data surface with nested chrome, repeated per-group
  headers, or uneven row heights, use the flat-data-surface skill. Read
  references/interactive-controls.md only when controls or tappable rows are in
  scope.
- Keep the pass read-only when the user asks for review or diagnosis. Implement
  only authorized changes and preserve unrelated work.
- Ask before editing only for a material product, architecture, accessibility,
  or visual-direction choice. Resolve routine details from the existing system.
- Validate changed files and the actual claim: use focused tests for behavior,
  browser-visible evidence for visual geometry, and a precise manual scenario
  when the user owns live UI testing.
- Report the user-visible outcome, changed paths, evidence, preserved behavior,
  deferred work, and any environment or manual-testing gap.
