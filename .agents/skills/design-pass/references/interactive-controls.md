# Interactive Controls Review

Read this reference only when a design pass touches filters, tabs, toggles,
menus, search fields, sort controls, or tappable rows/cards.

## Canonical system

Companion controls live in
src/components/companion/CompanionSelectorControls.jsx with styles in
src/index.css. Prefer CompanionSelectorButton,
CompanionSegmentedControl, CompanionSelectorRail, the fantasy-team menu, and
the shared search field over hand-rolled equivalents.

Check the canonical size tier, typography, border, fill, radius, and the
coarse-pointer 44px floor. Extend the canonical system when a genuine tier or
variant is missing; do not approximate it with local inline styles.

## State and semantics

For every interactive control, check:

- resting affordance;
- hover feedback for fine pointers;
- focus-visible treatment for keyboard users;
- active or selected treatment with the correct ARIA state;
- pressed feedback;
- disabled styling and the disabled attribute.

Confirm menu triggers expose expanded state and menu items expose the correct
role and selection state. Tappable rows need a clear hover, focus, and pressed
response when they are keyboard- or pointer-actionable.

## Measured verification

Compare adjacent controls at representative widths and display sizes. For
visual claims, inspect computed height, font size, weight, padding, radius, and
the 44px coarse-pointer floor at the affected viewports. Include dark mode and
landscape when the layout or interaction state can change.

Report each finding as what is present, what should be present, and why. Add a
canonical rule to the design documentation only when the pass establishes a
reusable project-wide contract.
