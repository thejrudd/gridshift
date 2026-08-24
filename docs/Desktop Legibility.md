# Desktop Legibility

GridShift desktop interfaces must remain readable at a normal monitor viewing
distance while preserving the density and interaction model of each surface.
This is a hierarchy and responsive-layout problem, not a reason to scale the
whole application uniformly.

Related: [[Design System Quick Ref]], [[Design Tokens]]

## Design basis

Apple's typography guidance recommends testing text at realistic viewing
distances and increasing size, weight, contrast, or background separation when
testing exposes difficulty. It lists `13pt` as the normal macOS text size and
`10pt` as the minimum, while also emphasizing that hierarchy should survive
user-selected text scaling. Apple's accessibility guidance uses WCAG Level AA
as a practical contrast baseline: `4.5:1` for normal text and `3:1` for
qualifying large or bold text.

- [Apple Human Interface Guidelines — Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
- [Apple Human Interface Guidelines — Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)

These are inputs to GridShift's system, not replacements for its tokens,
display-density preferences, route frames, or component contracts.

## Physical-display boundary

A browser viewport does not reliably reveal physical display size, pixel
density, operating-system scaling, browser zoom, or viewing distance. Never
infer those values from `devicePixelRatio`, screen resolution, or viewport
dimensions, and never compensate with CSS `zoom` or a whole-application
transform.

The persisted `gridshift-display-size` preference is GridShift's user-controlled
global scale. Component and container queries may provide modest local
refinement, but they must remain additive with Compact, Comfortable, and Large.

## Information hierarchy

Classify text by whether someone needs it to understand or operate the view.
Meaningful content includes names, scores, totals, timestamps, game state,
filters, instructions, axis values, and persistent status. Do not demote these
items to decorative typography merely to create visual hierarchy.

| Content role | Desktop floor | Wide-container growth |
|---|---|---|
| Primary row identity | `--type-emphasis` | Up to `--type-heading-sm` |
| Readable description or body | `--type-body` | Up to `--type-emphasis` |
| Persistent supporting fact | `--type-label`; prefer `--type-meta` when space permits | Up to `--type-body` |
| Decorative overline or terse badge | `--type-micro` | Usually unchanged |
| Primary row metric | Role-appropriate heading/value token | One semantic step while it remains focal |

`--type-label` is the absolute meaningful-text floor, not the preferred size
for every desktop fact. At normal desktop viewing distance, identity and prose
should normally begin at `--type-emphasis` and `--type-body`. Barlow Condensed
uppercase text reads optically smaller than Figtree body text, so meaningful
condensed labels need sufficient weight, restrained tracking, and often the
next semantic size.

Use component-aware interpolation with semantic endpoints, for example:

```css
font-size: clamp(var(--type-body), 0.75cqw, var(--type-emphasis));
```

Do not create a second global scale based only on viewport width.

## Contrast and state

- Use `--color-label` for primary identity, values, instructions, actions, and
  selected state.
- Use `--color-label-secondary` for supporting information that still needs to
  be read. Verify its effective contrast on the rendered surface in both
  themes.
- Reserve `--color-label-tertiary` and `--color-label-quaternary` for
  nonessential decoration. They are not appropriate for operational status,
  timestamps, totals, axis labels, instructions, or inactive choices.
- Never reduce opacity on a parent that contains meaningful text. Parent and
  descendant alpha compound; use a fill, border, ring, weight, position, or
  semantic text token to communicate inactive or selected state.
- Dense data surfaces should support `prefers-contrast: more` by promoting
  meaningful secondary text and SVG labels to `--color-label`. Keep genuine
  overlines and separators subdued.
- Check text over gradients, overlays, selected fills, and disabled states.
  A token name alone is not proof of the final contrast ratio.

## Responsive allocation

Scale the focal visual, identity, and primary metric as one hierarchy. If a
player or asset rail is meant to emphasize people, growing only its container
does not improve legibility; portraits or logos, names, and the key value must
grow together.

On wide and tall workbenches, spend some available negative or chart space on
the focal identity and list layers. Do not stretch readable prose or identity
rows indiscriminately across the full monitor.

On short-height dashboards, recompose before shrinking meaningful content:

1. Reduce decorative chrome and nonessential gaps.
2. Change a vertical tile or rail to a horizontal treatment.
3. Reallocate space from a visualization that remains useful above its tested
   minimum.
4. Give a dense list its own scroll owner.
5. Remove lower-priority metadata before truncating identity or controls.

Do not restore document-level scrolling to a viewport-bound dashboard, and do
not compress an interaction-critical chart below its explicit tested minimum.
Document-scrolling routes should retain the appropriate readable, data, or
workbench frame; desktop legibility is not permission to make every route
full-bleed.

## Validation matrix

Start with dimensions supplied by the user. When none are supplied, cover:

| Viewport | Purpose |
|---|---|
| `1280 × 720` | Constrained laptop baseline |
| `1440 × 600` | Unusually short desktop stress case |
| `1440 × 800` | Common laptop or 16:10-style working height |
| `2560 × 1440` | Wide external monitor |
| `2560 × 1600` | Wide 16:10 monitor when the route is height-bound |

Also verify:

- Compact, Comfortable, and Large Display Size where affected.
- Light and dark themes, plus `prefers-contrast: more` where supported.
- Populated, empty, loading, selected, hover, focus, and disabled states that
  materially change contrast or geometry.
- Browser-visible computed size, weight, line height, wrapping, effective
  opacity, and contrast rather than source values alone.
- Scroll ownership, sticky-header shielding, control reachability, long names,
  avatar fallbacks, and simultaneously visible row count.
- Readability at 100% browser zoom from a normal seated viewing distance.

For implementations, run focused browser tests, relevant unit tests,
changed-file lint, `npm run build`, and `git diff --check`. Source-only
assertions do not replace a visual usage check.

## Fantasy Live reference profile

Fantasy Live is a calibrated example, not a universal pixel scale:

- Standard desktop performer portraits are `52px`; wide/tall portraits are
  `64px`; unusually short `600px`-high viewports use a horizontal `44px`
  treatment.
- Performer names are at least `13px` on desktop and `14px` on wide displays.
  Point totals are at least `15px`, increasing to `18px` on wide displays.
- Inactive performer content stays at full opacity. Selection uses the portrait
  ring, background, and position instead of fading every other player.
- Feed avatars scale from `52px` to `64px`. Names, descriptions, metadata, and
  point changes scale independently through semantic tokens and container
  queries. The feed remains the vertical scroll owner.
- Meaningful chart time, axis, zoom, matchup, verdict, and win-probability text
  uses readable semantic contrast; decorative overlines stay subdued.
- The `1440 × 600` contract keeps document scrolling disabled, preserves at
  least an `80px` interactive chart, and retains `44px` portraits, `13px`
  names, and `15px` point totals.
- The `2560 × 1440` contract fills the available workbench width and retains
  `64px` portraits, `14px` names, and `18px` point totals.

Reference implementation:

- `src/index.css` — desktop Fantasy Live type, contrast, container, and height tiers.
- `src/components/companion/live/LivePerformerRail.jsx` — portrait hierarchy.
- `src/components/companion/live/LiveFeed.jsx` — populated feed rows.
- `src/components/shared/PlayerAvatar.jsx` — scalable fallback initials.
- `tests/e2e/fantasy-live-workbench.spec.js` — short and wide viewport contracts.

Do not copy these selectors or pixel values into another feature without first
establishing that feature's focal content, scroll owners, and geometry.

## Downstream checks

- Larger rows reduce simultaneous row count. Confirm that the list owns its
  scrolling and that sticky controls paint an opaque shield.
- Larger rails consume chart or canvas height. Define a useful visualization
  minimum and a no-document-scroll assertion for viewport-bound dashboards.
- Larger type increases wrapping. Test long player, team, league, and status
  labels; keep action and value columns stable and drop secondary chrome before
  hiding identity.
- Larger portraits expose fallback and source-resolution weaknesses. Scale
  initials with the avatar and preserve the layout slot after image failure.
- Container growth must remain additive with all Display Size presets.
- `prefers-contrast: more` needs separate CSS `color` and SVG `fill` handling.
- Keep mobile/tablet density and coarse-pointer targets unchanged when a request
  is desktop-only.
