---
name: flat-data-surface
description: Flatten a dense grouped data surface — nested panel/card chrome, repeated per-group column headers, uneven row heights, redundant section headings, or a table that clips instead of narrowing. Use for grouped tables, standings, leaderboards, and comparison grids. Not for forms, editorial pages, or single-record detail views.
---

# Flat Data Surface

Use when a grouped data surface reads as boxes inside boxes, repeats its column
headers once per group, renders rows at different heights across groups, or
spends vertical space on headings that restate what the data already shows.

The target shape is one continuous sheet: a single frozen column header per
scope, group labels that scroll with their rows, and uniform row geometry.

## Order of work

1. Read the route component, its styles, and the routed documentation before
   editing. Name the surface's scopes (the one or two independent groupings a
   reader actually compares within).
2. Inventory what the rules would remove, demote, or newly surface, and ask the
   user before editing. See "Confirm removals first" below. This pause is
   required; it is not satisfied by stating assumptions and proceeding.
3. Apply the rules below in order, limited to what the user approved. Each
   removes a container, a repetition, or a heading — stop when the surface is
   flat, not when it is minimal.
4. Validate geometry in a browser at real breakpoints. Measured numbers, not
   screenshots alone. See references/implementation.md.

## Rules

**Confirm removals first.** Before the first edit, list every piece of content
the pass would drop, demote, or newly expose — summary tiles, section headings,
per-group counts, secondary identity lines, columns that would abbreviate or
shed at a tier, and anything the flattening would pull into view that was
previously behind chrome. Present it as a short approval list with a
recommendation per item, and ask the user which to remove, which to keep, and
whether anything currently hidden should be surfaced. Structural flattening
(containers, repeated headers, row geometry) may proceed once the content
decisions are settled. Never delete user-facing content on the assumption that a
rule below authorizes it — the rules describe the target shape, the user owns
what the surface says.

**One frame, not three.** A route should not wrap a panel that wraps a card that
wraps the data. Delete the intermediate borders, radii, and backgrounds; let
rows sit directly on the page. Keep the route's existing max-width frame.

**One column header per scope, frozen.** Do not repeat headers per group. Use a
single table per scope with a sticky `thead`, and render each group as its own
`tbody` introduced by a full-width label row that scrolls normally. The header
must be opaque through the scroll container's top padding, or rows show in the
band above it while scrolling.

**Uniform row geometry.** Every row in every group is the same height. Pin the
height on the cell, and keep the cause of variance out of the row — a wrapping
name is the usual culprit. Rows that grow on some groups and not others are the
single loudest sign of an unflattened surface.

**Group rows carry identity, not chrome.** When a per-group card header is
removed, its meaning moves into the group label row: the group name, plus a
muted scope tag when two scopes share a page. Counts a reader can see by looking
(`4 teams` above four rows) are noise — drop them.

**Delete headings that restate structure.** Section titles, eyebrows, and
summary tiles whose content is already visible in the groups below are vertical
space with no payload. Keep only text carrying something the data cannot show —
freshness, provenance, scope of the query.

**Two scopes stay distinct without titles.** Separate them with a rule and
larger gap, and let each group row's scope tag name it. Keep them as separate
tables with distinct accessible names; do not merge into one table, because the
same record appearing twice with different ranks is misleading to assistive
technology.

**Narrow by tiers, never by clipping.** A horizontal scroll wrapper and a header
frozen to the viewport are mutually exclusive — `overflow-x` makes the wrapper
the sticky containing block, so the header stops freezing to the page. Keep the
frozen header and make the table fit instead: abbreviate column labels at one
breakpoint, shed the lowest-priority identity text at another.

**Identity never truncates.** Shed in this order: full column labels →
supporting metric width → the secondary identity line. Never ellipsize or clip a
name. Preserve it in `title` and `aria-label` on the tier that drops it.

**Derive breakpoints from content width, not round numbers.** The tier boundary
is the viewport where the widest real value stops fitting, accounting for any
persistent sidebar. Compute it, then verify at the boundary and one pixel below.

## Validation

Required before reporting the pass complete, at each tier boundary and at the
narrowest supported width:

- No element clips: every header and identity cell has `scrollWidth <=
  clientWidth`.
- Row heights collapse to a single distinct value per tier.
- No horizontal document overflow.
- The frozen header stays frozen through a scroll, and nothing paints above it.

references/implementation.md carries the CSS recipe and the measurement snippet.
