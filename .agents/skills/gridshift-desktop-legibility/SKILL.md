---
name: gridshift-desktop-legibility
description: Audit or implement desktop readability for GridShift dashboard and workbench surfaces across laptop, short-height, and wide-monitor viewports. Use for text size, contrast, viewing-distance, density, viewport fit, internal scrolling, or external-monitor concerns. Do not use for mobile-only work.
---

# GridShift Desktop Legibility

Improve desktop readability without breaking the route's layout, density,
scroll ownership, or user-controlled Display Size behavior.

## Required context

Before acting:

1. Read `AGENTS.md`.
2. Read `docs/Desktop Legibility.md` completely.
3. Read `docs/Design System Quick Ref.md`, the relevant parts of
   `docs/Design Tokens.md`, and `.interface-design/system.md`.
4. Inspect the route component, styles, existing tests, and current
   browser-visible state.
5. Identify upstream and downstream consumers of shared tokens or components
   before proposing changes.

Treat GridShift documentation as the implementation source of truth. Apple
guidance informs the principles; it does not replace GridShift's component and
token contracts.

If the user requests an audit, review, or diagnosis only, keep the work
read-only. Implement only when the request authorizes changes.

## Establish the contract

Determine:

- Whether the route is a fixed dashboard/workbench or a document-scrolling
  page.
- Which areas, if any, own independent scrolling.
- Which information is primary, supporting, or decorative.
- Which viewport dimensions the report or screenshots represent.
- Whether the request is desktop-only.
- Whether a live usage test is needed alongside automated checks.

Do not assume physical display size, DPI, OS scaling, browser zoom, or viewing
distance from CSS viewport dimensions.

## Audit rendered behavior

Inspect computed and browser-visible behavior, not source values alone:

- Effective font size, weight, line height, tracking, wrapping, and truncation.
- Effective contrast after inherited color, parent opacity, overlays, gradients,
  selected fills, and disabled styles.
- Portrait, logo, icon, and control prominence relative to nearby text.
- Row height, padding, visible-item capacity, sticky controls, and internal
  scrolling.
- Short-height overflow and wide-monitor negative space.
- Chart or visualization space relative to labels, controls, rails, and feeds.
- Compact, Comfortable, and Large Display Size behavior when affected.
- Increased-contrast, focus, hover, active, loading, empty, and populated states.

Classify meaningful clocks, scores, totals, names, status, filters,
instructions, and axis values as readable content. Reserve micro typography and
heavily muted colors for genuinely decorative overlines or nonessential badges.

## Implement

Prefer existing semantic `--type-*`, color, control-height, density, and frame
tokens. Use component- or container-aware `clamp()`, `minmax()`, container
queries, and targeted width/height tiers. Preserve `gridshift-display-size` as
the user-controlled global scale.

Do not use:

- CSS `zoom` or whole-application transforms.
- Guessed DPI or physical-monitor detection.
- Parent opacity on containers containing meaningful text.
- A global factor that enlarges every element equally.
- Smaller meaningful text as the first response to a short viewport.

For short-height dashboards, simplify geometry, reallocate decorative or chart
space, reduce nonessential gaps, change orientation, or add an internal scroll
owner before reducing readable type. Keep interaction-critical visualizations
above an explicit useful minimum.

On wide displays, use the available workbench space while increasing the
prominence of content that became visually distant. Do not stretch readable
prose or identity rows indiscriminately across the monitor.

Keep mobile and tablet behavior unchanged when the request is desktop-specific.
Do not copy Fantasy Live's selectors or pixel values without establishing the
new surface's own focal hierarchy and geometry.

## Validate

Start with exact user-supplied dimensions. Otherwise cover the representative
matrix in `docs/Desktop Legibility.md`, including at least `1280 × 720`,
`1440 × 600`, and `2560 × 1440` when those sizes are relevant.

Validate the real surface contract:

- Correct document and internal scroll owners.
- No clipping or unreachable controls.
- Meaningful text meets its documented semantic floor and contrast target.
- No compounded opacity makes inactive content illegible.
- Charts remain interactive with a useful minimum plotting area.
- Populated rows are readable at normal viewing distance.
- Display Size modes and intentionally untouched mobile/tablet behavior remain
  stable where affected.

Run focused browser tests, relevant unit tests, changed-file lint,
`npm run build`, and `git diff --check`. Use screenshot or visual inspection for
typography and hierarchy; source-only assertions are insufficient.

If fixture or environment limits prevent populated-state validation, report
that explicitly and name the exact live usage check still needed.

## Report

Lead with the user-visible outcome. Summarize typography and contrast changes,
layout or space-allocation changes, tested viewports and Display Size modes,
preserved scroll behavior, downstream effects, intentionally untouched
breakpoints, and any remaining manual validation.
