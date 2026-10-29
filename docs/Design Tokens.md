# Design Tokens — "Broadcast Editorial"

All colors defined as CSS custom properties in `src/index.css`. The `.dark` class on `<html>` swaps all values.

## Color Tokens

| Token | Light | Dark |
|---|---|---|
| `--color-bg` | `#F2F1EC` (warm off-white) | `#0C0F14` (deep slate-charcoal) |
| `--color-bg-secondary` | `#FFFFFF` | `#141A22` |
| `--color-bg-tertiary` | `#E9E8E2` | `#1C2332` |
| `--color-label` | `rgba(12,15,20,1)` | `rgba(228,235,244,1)` |
| `--color-label-secondary` | `rgba(12,15,20,0.58)` | `rgba(228,235,244,0.58)` |
| `--color-label-tertiary` | `rgba(12,15,20,0.35)` | `rgba(228,235,244,0.35)` |
| `--color-label-quaternary` | `rgba(12,15,20,0.20)` | `rgba(228,235,244,0.20)` |
| `--color-fill` | `rgba(12,15,20,0.07)` | `rgba(228,235,244,0.09)` |
| `--color-fill-secondary` | `rgba(12,15,20,0.05)` | `rgba(228,235,244,0.06)` |
| `--color-fill-tertiary` | `rgba(12,15,20,0.03)` | `rgba(228,235,244,0.04)` |
| `--color-separator` | `rgba(12,15,20,0.12)` | `rgba(228,235,244,0.10)` |
| `--color-separator-opaque` | `#D0CFC8` | `#252E3C` |
| `--color-accent` | `#1A6EFF` | `#5AADFF` |
| `--color-accent-green` | `#00A844` | `#2ED578` |
| `--color-accent-red` | `#E0270F` | `#FF4433` |
| `--color-accent-orange` | `#E07800` | `#FF8C1A` |
| `--color-live-defense` | `#526071` | `#64748B` |
| `--color-live-defense-fg` | `#FFFFFF` | `#FFFFFF` |
| `--color-scoring-passing` | `#1A6EFF` | `#5AADFF` |
| `--color-scoring-rushing` | `#00A844` | `#2ED578` |
| `--color-scoring-receiving` | `#E07800` | `#FF8C1A` |
| `--color-scoring-bonus` | `#8A4DFF` | `#A780FF` |
| `--color-scoring-kicking` | `#C99600` | `#F5B700` |
| `--color-scoring-special` | `#0E9E94` | `#2CCFC2` |
| `--color-scoring-dst` | `#D6337F` | `#FF6FB5` |
| `--color-scoring-idp` | `#8B6A45` | `#C8A27A` |
| `--color-scoring-negative` | `#E0270F` | `#FF4433` |
| `--color-scoring-other` | `rgba(12, 15, 20, 0.35)` | `rgba(228, 235, 244, 0.35)` |
| `--color-signature` | `#F5B700` | `#F5B700` (same both modes) |
| `--color-signature-fg` | `#0C0F14` | `#0C0F14` (same both modes) |
| `--color-drilldown-stat-1` … `-4` | `#1A6EFF` · `#0E9E94` · `#8A4DFF` · `#E07800` | `#5AADFF` · `#2CCFC2` · `#A780FF` · `#FF8C1A` |
| `--color-drilldown-band` | `rgba(245,183,0,0.22)` | `rgba(245,183,0,0.20)` |
| `--bar-bg` | `rgba(242,241,236,0.88)` | `rgba(12,15,20,0.90)` |
| `--bar-border` | `rgba(12,15,20,0.12)` | `rgba(228,235,244,0.10)` |
| `--bar-height-nav` | `44px` | — |
| `--bar-height-tab` | `49px` | — |

The `--color-drilldown-*` tokens belong to the player matchup drilldown only: a stat-category series for stat-line rows (green and red stay reserved for above/below a benchmark) and the signature-tinted likely-range band.

### Text Contrast Semantics

- `--color-label` is for primary identity, values, instructions, actions, and
  selected state.
- `--color-label-secondary` is for supporting information that still needs to
  be read. Verify its rendered contrast on the actual surface in both themes;
  the token name is not a guarantee after blending.
- `--color-label-tertiary` and `--color-label-quaternary` are for nonessential
  decoration. Do not use them for timestamps, game state, totals, axis labels,
  control hints, inactive options, or text required to operate a view.
- Do not combine semantic text colors with parent opacity. Alpha compounds and
  can turn otherwise readable text into decorative-level contrast.
- Target at least `4.5:1` for normal text and `3:1` for qualifying large or bold
  text. Dense data views should support `prefers-contrast: more`, promoting
  meaningful text and SVG labels to `--color-label`.

## Signature Accent Usage (`#F5B700` / `--color-signature`)

Decorative only: sidebar active border, season tab underline, progress bar fill, filter chip bg, bottom tab bar active icon/label. Never use as body text color. Text/icons placed ON a signature background use `--color-signature-fg` (`#0C0F14`).

## Key Conventions

- `font-size: 16px` on all inputs (prevents iOS auto-zoom)
- Safe area insets: `env(safe-area-inset-bottom)` on fixed bottom bars
- Motion: CSS animations, spring-curve easing `cubic-bezier(0.32, 0.72, 0, 1)`

## Responsive Display Scale

GridShift applies a persisted `data-display-size` value to `<html>` before React renders. The supported values are `compact`, `comfortable`, and `large`; invalid or missing values normalize to `comfortable`. Browser zoom and operating-system scaling remain additive and must never be inferred from device-pixel ratio.

| Preset | Root size | Desktop control height | Density |
|---|---:|---:|---|
| Compact | `15px` | `36px` | Tight |
| Comfortable | `16px` | `40px` | Standard |
| Large | `18px` | `44px` | Expanded |

Coarse-pointer controls remain at least `44px`, and inputs/selects/textareas remain at least `16px`, regardless of preset.

Display Size, browser zoom, and OS scaling are additive. Test Compact,
Comfortable, and Large at representative desktop geometries; a local component
clamp must not cancel or flatten the selected preset.

### Semantic Type Tokens

| Token | Comfortable role |
|---|---|
| `--type-micro` | `11px` decorative badges and overlines only |
| `--type-label` | `12px` readable labels and compact headers |
| `--type-meta` | `13px` supporting player/team metadata |
| `--type-body` | `14px` standard UI copy |
| `--type-emphasis` | `16px` emphasized body and primary row identity |
| `--type-heading-sm` | `18px` subsection headings |
| `--type-heading-md` | `24px` section headings |
| `--type-heading-lg` | `32px` page headings |
| `--type-display` | `44px` broadcast display type |

Do not introduce meaningful user-facing text below `--type-label`. `--type-micro` is reserved for terse decorative/status chrome.

### Desktop Viewing-Distance Roles

These are semantic roles, not fixed component pixels. They inherit the active
Display Size preset. A wide component may grow within the range; a short
viewport should recompose before shrinking below the floor.

| Content role | Desktop floor | Wide-container growth |
|---|---|---|
| Primary row identity | `--type-emphasis` | Up to `--type-heading-sm` |
| Readable description/body | `--type-body` | Up to `--type-emphasis` |
| Persistent supporting facts | `--type-label`; prefer `--type-meta` when space permits | Up to `--type-body` |
| Decorative overline/badge | `--type-micro` | Usually unchanged |
| Primary row metric | Role-appropriate heading/value token | One semantic step while it remains focal |

Use container units and semantic endpoints, for example
`clamp(var(--type-body), 0.75cqw, var(--type-emphasis))`. Do not create a second
global scale keyed only to viewport width. The component container determines
local growth; Display Size determines the user's global scale.

When Barlow Condensed carries meaningful uppercase labels, prefer stronger
weights and restrained tracking. Use Figtree for prose and descriptions. See
[[Desktop Legibility]] for the complete audit and validation contract.

## Design Foundation Tokens (Stage 5.1)

Declared in `:root` in `src/index.css`. Each role aliases a base token, so `.dark` needs no second definition. Rules and components: [[Design System Quick Ref]] › Design Foundation.

### Text roles

| Role | Class | Font | Size token | Weight | Colour |
| --- | --- | --- | --- | --- | --- |
| Page title | `.gs-text-page-title` | Barlow Condensed, uppercase | `--text-page-title-size` (`--type-heading-lg` to `--type-display`) | 800 | `--color-text-primary` |
| Section heading | `.gs-text-section` | Barlow Condensed, uppercase | `--text-section-size` (`--type-heading-sm`) | 750 | `--color-text-primary` |
| Row title | `.gs-text-row-title` | Figtree | `--text-row-title-size` (`--type-emphasis`) | 650 | `--color-text-primary` |
| Body | `.gs-text-body` | Figtree | `--text-body-size` (`--type-body`) | 400 | `--color-text-primary` |
| Secondary | `.gs-text-secondary` | Figtree | `--text-secondary-size` (`--type-meta`) | 500 | `--color-text-secondary` |
| Meta | `.gs-text-meta` | Barlow Condensed, uppercase, `0.1em` | `--text-meta-size` (`--type-label`) | 700 | `--color-text-meta` |

### Colour, state, and spacing roles

| Token | Resolves to | Use |
| --- | --- | --- |
| `--color-text-primary` | `--color-label` | Identity, values, headings, selected state |
| `--color-text-secondary` | `--color-label-secondary` | Supporting text that must be read |
| `--color-text-meta` | `--color-label-secondary` | Column headers, eyebrows, section meta |
| `--color-text-disabled` | `--color-label-tertiary` | Disabled controls only |
| `--color-surface-page` | `--color-bg` | Sections, tables, rows |
| `--color-surface-object` | `--color-bg-secondary` | Dialogs, sheets, draggable items only |
| `--color-divider` / `--color-divider-strong` | `--color-separator` / `--color-separator-opaque` | Row lines / section heading rule |
| `--color-state-hover` / `--color-state-active` | `--color-fill-secondary` / `--color-fill` | Hover and pressed backgrounds |
| `--color-state-selected` | `--color-signature` | Selected-tab underline, selected-row rail (decorative) |
| `--color-focus-ring`, `--focus-ring-width`, `--focus-ring-offset` | `--color-accent`, `2px`, `2px` | Keyboard focus outline |
| `--state-transition` | `160ms` standard easing | State colour changes |
| `--space-section`, `--space-section-header`, `--space-row-y`, `--space-row-x` | `clamp(28px, 3.4vw, 44px)`, `10px`, `12px`, `12px` | Flat layout spacing |

## Page Frame Tokens

| Frame | Maximum | Intended surfaces |
|---|---:|---|
| `--page-frame-readable` | `1200px` | Settings, scoring, instructional/detail content |
| `--page-frame-data` | `1600px` | Rosters, rankings, schedules, standings, history, activity |
| `--page-frame-workbench` | `1920px` | Trade, Draft, Scout, Compare, Matchup, Heatmap |

Use `.page-frame-readable`, `.page-frame-data`, or `.page-frame-workbench` on the route root. Frames center themselves and preserve the normal mobile/tablet flow.

## Loading Motion Tokens

Declared at the end of `:root` in `src/index.css`, mirrored in
`src/utils/loadingMotion.js`, parity-checked by `tests/unit/loadingMotion.test.mjs`.
Definitions for each: [[Loading Motion]].

| Token | Value | Controls |
| --- | --- | --- |
| `--gs-load-duration` | `500ms` | One row's entrance animation, start to settled |
| `--gs-load-stagger` | `20ms` | Gap between consecutive rows starting |
| `--gs-load-stagger-cap` | `7` | Row index past which the delay stops growing (rows past it still animate) |
| `--gs-load-ease` | `cubic-bezier(0.32, 0.72, 0, 1)` | Entrance speed curve (the app standard) |
| `--gs-load-ease-overshoot` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Named alternate — springy |
| `--gs-load-ease-decelerate` | `cubic-bezier(0, 0, 0.2, 1)` | Named alternate — fast start, long glide |
| `--gs-load-ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | Named alternate — neutral |
| `--gs-load-texture-duration` | `1600ms` | One cycle of the skeleton's shimmer/pulse/build |
| `--gs-load-show-after` | `120ms` | Bare structure before any placeholder appears |
| `--gs-load-min-hold` | `240ms` | Floor a placeholder stays once it has appeared |
| `--gs-load-gate` | `90ms` | Coalesce window for late data fragments (declared, not yet consumed) |
| `--gs-load-handoff-fade` | `300ms` | How long the skeleton lingers under arriving content |
| `--gs-load-rail-duration` | `620ms` | Leading accent bar grow |
| `--gs-load-rail-delay` | `90ms` | Beat before the accent bar starts |

Per-surface selectors, not tokens: `[data-gs-entrance]` (`lift` / `fade` / `wipe`
/ `scale` / `slide`), `[data-gs-texture]` (`sweep` / `pulse` / `build` /
`static`), `[data-gs-handoff]` (`cut` / `cross-fade` / `row-by-row`).
