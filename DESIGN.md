---
version: alpha
name: GridShift — Broadcast Editorial
description: >
  A sports-broadcast-meets-editorial design system for the GridShift app.
  Dark stadium slate meets warm newsprint. Signature amber signals action.

colors:
  signature: "#F5B700"
  signature-fg: "#0C0F14"
  background-light: "#F2F1EC"
  background-dark: "#0C0F14"
  surface-light: "#FFFFFF"
  surface-dark: "#141A22"
  surface-secondary-light: "#E9E8E2"
  surface-secondary-dark: "#1C2332"
  separator-light: "#D0CFC8"
  separator-dark: "#252E3C"
  accent: "#1A6EFF"
  accent-dark: "#5AADFF"
  accent-green: "#00A844"
  accent-green-dark: "#2ED578"
  accent-red: "#E0270F"
  accent-red-dark: "#FF4433"
  accent-orange: "#E07800"
  accent-orange-dark: "#FF8C1A"
  label: "#0C0F14"
  label-dark: "#E4EBF4"

typography:
  display-brand:
    fontFamily: "Barlow Condensed"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: "32px"
    letterSpacing: "0.08em"
  display-sub:
    fontFamily: "Barlow Condensed"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
    letterSpacing: "0.18em"
  headline-tab:
    fontFamily: "Barlow Condensed"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: "20px"
    letterSpacing: "0.07em"
  headline-season:
    fontFamily: "Barlow Condensed"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: "16px"
    letterSpacing: "0.06em"
  body-md:
    fontFamily: "Figtree"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
    letterSpacing: "0"
  body-sm:
    fontFamily: "Figtree"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
    letterSpacing: "0"
  label-nav:
    fontFamily: "Figtree"
    fontSize: "12.5px"
    fontWeight: 600
    lineHeight: "16px"
    letterSpacing: "0"
  label-action:
    fontFamily: "Figtree"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: "16px"
    letterSpacing: "0"
  label-section:
    fontFamily: "Figtree"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: "12px"
    letterSpacing: "0.10em"
  label-tab:
    fontFamily: "Figtree"
    fontSize: "10px"
    fontWeight: 500
    lineHeight: "12px"
    letterSpacing: "0.01em"
  label-micro:
    fontFamily: "Barlow Condensed"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: "12px"
    letterSpacing: "0.14em"
  chip-action:
    fontFamily: "Barlow Condensed"
    fontSize: "10.5px"
    fontWeight: 800
    lineHeight: "12px"
    letterSpacing: "0.10em"
  chip-filter:
    fontFamily: "Figtree"
    fontSize: "12px"
    fontWeight: 800
    lineHeight: "12px"
    letterSpacing: "0"
  stat-value:
    fontFamily: "Barlow Condensed"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: "24px"
    letterSpacing: "-0.02em"
  stat-hero:
    fontFamily: "Barlow Condensed"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: "32px"
    letterSpacing: "-0.01em"

rounded:
  sm: "0.125rem"
  DEFAULT: "0.25rem"
  md: "0.375rem"
  lg: "0.5rem"
  xl: "0.75rem"
  2xl: "1rem"
  full: "9999px"
  control: "7px"
  panel: "8px"

spacing:
  base: "8px"
  xs: "4px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  nav-height: "44px"
  tab-height: "49px"
  sidebar-width: "240px"

components:
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.label}"
    typography: "{typography.label-nav}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
  nav-item-active:
    backgroundColor: "{colors.signature}"
    textColor: "{colors.signature-fg}"
    typography: "{typography.label-nav}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
  tab-item:
    backgroundColor: "transparent"
    textColor: "{colors.label}"
    typography: "{typography.label-tab}"
    padding: "{spacing.xs}"
  tab-item-active:
    backgroundColor: "transparent"
    textColor: "{colors.signature}"
    typography: "{typography.label-tab}"
    padding: "{spacing.xs}"
  section-label:
    backgroundColor: "transparent"
    textColor: "{colors.label}"
    typography: "{typography.label-section}"
    padding: "{spacing.sm}"
  card:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.label}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.xl}"
    padding: "{spacing.md}"
  modal:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.label}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg}"
  filter-chip:
    backgroundColor: "{colors.signature}"
    textColor: "{colors.signature-fg}"
    typography: "{typography.chip-filter}"
    rounded: "{rounded.panel}"
    padding: "{spacing.sm}"
  button-primary:
    backgroundColor: "{colors.signature}"
    textColor: "{colors.signature-fg}"
    typography: "{typography.chip-action}"
    rounded: "{rounded.control}"
    padding: "{spacing.md}"
  button-destructive:
    backgroundColor: "{colors.accent-red}"
    textColor: "#FFFFFF"
    typography: "{typography.label-nav}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
---

## Overview

GridShift uses a **Broadcast Editorial** design language — the visual confidence of live sports coverage applied to a fantasy football tool. The system pairs deep slate charcoal (dark mode) or warm newsprint white (light mode) with a persistent stadium amber accent that signals activity, selection, and progress at a glance.

The aesthetic is dense but ordered: information-first, with typography doing the heavy lifting on hierarchy. Motion is subtle and spring-based. The design never decorates for its own sake — every visual decision either aids comprehension or reinforces the broadcast identity.

**Guiding principles:**

1. **Amber signals action and "you."** The signature color marks interactive/active states, primary actions, and the user's own team in data visualizations — never body copy.
2. **Condensed for the broadcast voice, geometric for reading.** Barlow Condensed carries display type, editorial micro-labels, and stat numerals; Figtree handles readable body copy, descriptions, and form inputs.
3. **One structural breakpoint, layered adaptation.** The 1024px breakpoint is the only place the navigation shell restructures (bottom tabs vs sidebar). Within a shell, sizing is fluid via `clamp()`. A compact tier (`max-width: 560px`) may only *reduce density* — hide chrome, tighten padding — never restructure layout. Input adaptations (touch target sizes, hover vs tap) use pointer capability queries (`pointer: coarse`), never width.
4. **Dark mode is native.** The `.dark` class on `<html>` swaps all design tokens. No third-party library.
5. **Important content must fit.** User-facing names, dates, venues, stats, scores, labels, and controls should wrap or reflow before they truncate. Ellipsis is reserved for low-priority decorative metadata only, never for information a user needs to act on or compare.
6. **Each fact appears once per surface.** No screen should show the same team name, score, status, or metric in more than one place at the same time (a detail tooltip or drill-in repeating a summary value is fine — simultaneous duplication in the base layout is not). Status indicators (live dots, "updated at" stamps) appear exactly once. Prefer merging adjacent header/status strips over stacking them.

> **Token source of truth:** the CSS custom properties in `src/index.css` and `tailwind.config.js` are authoritative. The YAML frontmatter above is a machine-readable mirror — any token change must update both in the same pass.

---

## Colors

### Signature Amber

`#F5B700` is the single brand accent. It never appears as body copy, headings, or descriptive labels.

Any text or icon placed *on* a signature-colored background must use `--color-signature-fg` (`#0C0F14`) for sufficient contrast.

**Valid uses:**

- Active states: sidebar nav border, season tab underline, bottom tab active icon and label, filter chip background, progress bar fill.
- Primary actions: primary buttons and CTAs use a signature background with `--color-signature-fg` text.
- **"You/yours" identity in data visualizations:** the user's own team/side takes amber (chart series, dial rings, feed edge bars); the opponent takes blue `accent`.
- A **singular focal numeral** — one large tabular figure that is the sole subject of its element (e.g. a win-chance dial percentage) — may render in amber.

**Invalid uses:** body copy, headings, descriptive labels, paragraph or multi-word text of any kind, icon fills in non-active states.

### Backgrounds

Two tones per mode create depth without strong shadows:

- **Canvas** — the page background. Light: `#F2F1EC` (warm newsprint). Dark: `#0C0F14` (stadium night).
- **Surface** — elevated components (sidebar, cards, modals). Light: `#FFFFFF`. Dark: `#141A22`.
- **Surface secondary** — nested or tertiary elevation. Light: `#E9E8E2`. Dark: `#1C2332`.

### Text Opacity Scale

Labels use a single base color scaled by opacity to express hierarchy. This avoids proliferating named colors and keeps the palette consistent across modes.

| Level | Opacity | Use |
|---|---|---|
| Primary | 100% | Body text, headings, active labels |
| Secondary | 58% | Navigation items, supporting copy |
| Tertiary | 35% | Placeholders, section dividers |
| Quaternary | 20% | Disabled states, minimal hints |

### Semantic Accents

| Role | Light | Dark |
|---|---|---|
| Interactive (links, focus) | `#1A6EFF` | `#5AADFF` |
| Success / positive | `#00A844` | `#2ED578` |
| Destructive / error | `#E0270F` | `#FF4433` |
| Caution / warning | `#E07800` | `#FF8C1A` |

### Team-Color Gradients

Use team gradients when a surface is primarily about team or player identity: player hero cards, team cards, roster rows, selection rows, and other scannable football assets. Do not use them for generic controls, page backgrounds, or dense text-only panels.

Source raw colors from `getTeamPalette(team)` in `src/data/teamColors.js`, and source computed UI treatment from `getTeamVisualTheme(team, darkMode)` in `src/utils/teamVisualTheme.js`. Never hard-code one-off team hex values or duplicate gradient/contrast math in component code.

**Gradient recipe:**

- Light mode starts from `palette.primary` and `palette.secondary`.
- Dark mode starts from `palette.darkPrimary` and `palette.darkSecondary`.
- Direction and readable exceptions come from `TEAM_IDENTITY_REVERSED_GRADIENT_TEAMS` in `src/utils/teamVisualTheme.js`; pass explicit options only for a deliberate surface-specific exception. `nyg` and `nyj` are side-sensitive: use `logoSide: 'start'` when their logo sits on the left, and `logoSide: 'end'` when their logo sits on the right.
- Gradient: use the shared Trade-style three-stop treatment returned as `theme.gradient`.
- Overlay: add the shared full-surface overlay returned as `theme.gradientOverlay`:
  - Dark: `linear-gradient(180deg, rgba(12,15,20,0.04) 0%, rgba(12,15,20,0.22) 100%)`
  - Light: `linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(12,15,20,0.12) 100%)`

**Readable text on gradients:**

Use the foreground values returned by `getTeamVisualTheme()`. Default player/team names use `theme.gradientForeground`, which is intentionally tied to the gradient start because names sit on the left side of the shared 135-degree treatment. Right-side stats and values use `theme.gradientEndForeground`; centered or full-width text can use `theme.gradientFullForeground` only when it truly spans the full gradient.

The helper chooses between `#FFFFFF` and `#0C0F14` by testing contrast against the relevant gradient region. Do not choose text color from team identity, raw luminance, or only the first/last stop. This keeps similar treatments, such as Ravens and Vikings purple gradients, consistent: left-side identity text stays white over purple, while right-side value text can switch to near-black over gold when needed.

If neither white nor near-black reads well in the text's region, adjust the gradient before adding shadows or outlines:

1. Flip gradient direction if the text sits mostly over the opposite side.
2. Use the alternate team endpoint (`secondary` or `darkSecondary`) if it improves contrast without losing team identity.
3. Add or strengthen the mode overlay slightly.
4. As a last resort, place the text in a non-card overlay band using design tokens.

**Logos and photos:**

- Use team logos as explicit layout elements when they need to be inspected. Do not place important text over a logo watermark.
- Watermark logos are allowed only at low opacity and behind non-critical empty space.
- Player photos should prefer Sleeper thumbnails for fantasy roster surfaces and fall back to ESPN headshots when an ESPN ID exists.

---

## Typography

Two typefaces. No exceptions.

**Barlow Condensed** (`--font-display`) — the broadcast voice. Used for display type and brand, editorial micro-labels (uppercase, tracked, 9–11px, weight 700–800), chip/segment button labels, kickers, and all stat numerals (with `font-variant-numeric: tabular-nums`). Weights 400, 600, 700, 800.

**Figtree** (`--font-body` / `sans`) — the reading voice. Used for body copy, descriptions, play/event text, form inputs, and shell navigation labels. Weights 400, 500, 600, 700.

The dividing line: **if the text is scanned** (a label, a stat, a status), it is Barlow Condensed; **if it is read** (a sentence, a description, an input), it is Figtree.

### Scale

Use these styles instead of inventing per-surface sizes. If a new surface needs a size that isn't here, add it to this table (and the frontmatter) in the same pass.

| Style | Family | Weight | Size | Tracking | Transform | Use |
|---|---|---|---|---|---|---|
| `display-brand` | Barlow Condensed | 700 | 28px | 0.08em | — | Wordmark "NFL" |
| `display-sub` | Barlow Condensed | 400 | 12px | 0.18em | uppercase | Wordmark "PREDICTOR" |
| `headline-tab` | Barlow Condensed | 700 | 15px | 0.07em | uppercase | Season subnav tabs |
| `headline-season` | Barlow Condensed | 700 | 11px | 0.06em | — | Season year label |
| `label-micro` | Barlow Condensed | 700–800 | 9.5–10px | 0.10–0.18em | uppercase | Kickers, section strips, dt labels, glance text |
| `chip-action` | Barlow Condensed | 800 | 10.5px | 0.10em | uppercase | Dense broadcast chips (Companion Live chip buttons) |
| `chip-filter` | Figtree | 800 | 10–13px | 0 | — | Standard filter/sort chips (`.companion-selector-button`, sized by xs/sm/md tier) |
| `stat-value` | Barlow Condensed | 800 | 17–22px | -0.02em | tabular-nums | Row/point values, box-score figures |
| `stat-hero` | Barlow Condensed | 800 | 34–44px | -0.01em | tabular-nums | Hero scores and focal totals |
| `body-md` | Figtree | 400 | 16px | 0 | — | Default body copy, inputs |
| `body-sm` | Figtree | 400–600 | 12.5–14px | 0 | — | Card/list content, event descriptions |
| `label-nav` | Figtree | 600 | 12.5px | 0 | — | Sidebar nav items |
| `label-action` | Figtree | 500 | 12.5px | 0 | — | Sidebar action items |
| `label-section` | Figtree | 700 | 10px | 0.10em | uppercase | Section divider labels |
| `label-tab` | Figtree | 500/600 | 10px | 0.01em | — | Bottom tab labels (600 when active) |

**Input rule:** All `<input>` and `<select>` elements must have `font-size: 16px` to prevent iOS Safari from auto-zooming on focus. This is non-negotiable.

---

## Layout

A single structural breakpoint at `1024px` splits the two navigation shells. Within a shell, adaptation is layered, in this order:

1. **Fluid sizing** — `clamp()` for type and spacing that should scale with the viewport.
2. **Compact tier (`max-width: 560px`)** — density reduction only: tighter padding, hidden decorative chrome, stacked control rows. Never a different layout structure.
3. **Pointer capability (`pointer: coarse`)** — touch-target and interaction adjustments, independent of width.

### Container Queries for Dense Data Panels

Dense data panels whose width depends on variable siblings — an inline detail pane that appears beside them, a resizable rail, a collapsible column — adapt via CSS container queries (`container-type: inline-size` on the panel), not viewport queries. Viewport width is the wrong signal when a sibling can consume hundreds of pixels at the same viewport.

The Draft Big Board is the canonical example (`container-name: draft-big-board` with tiers at 900/620/460/380px). When a panel narrows, shed content in density-reduction order: helper labels for obvious numbers first, then decorative team logos, then lower-priority metric columns (e.g. PPG/Volume/Tier drop before Rank/Rating/Trend), and only then shrink identity text. Never let column-shedding restructure the panel's layout.

### Available Width, Not Viewport Width

Full-width multi-column strips (status banners, header strips) must choose their collapse point from the width actually available to them, not the raw viewport width — the 240px desktop sidebar makes viewport ≠ content width. A strip whose columns need N px of content must collapse below a viewport of N + 240px when it lives inside the desktop shell, or use a container query so the math is automatic.

### Input Modalities

The desktop shell is mouse-first; the mobile/tablet shell is touch-first — but pointer type is detected by capability, not by viewport width (an iPad in landscape is 1024px+ *and* touch).

- **Touch targets:** interactive elements must reach **44×44px minimum** under `@media (pointer: coarse)`. Compact 30–34px controls are acceptable for mouse only.
- **Hover is an enhancement, never a requirement.** Any information revealed on hover (tooltips, glows, inspection crosshairs) must have a tap-driven equivalent on coarse pointers — tap to show, tap outside to dismiss. Never leave a hover-only affordance as the sole path to information.
- **Scroll-adjacent interactions:** elements inside a scrollable page that capture pointer events (charts, sliders) must set `touch-action` so vertical panning still scrolls the page, and must clear transient UI on `pointercancel`.
- **Sticky scroll shields:** sticky tabs, filters, and headers inside an independently scrolling content area must paint an opaque surface through the scrollport's top padding or offset. Use an isolated wrapper and background shield where necessary; earlier rows, cards, charts, and event text must never remain visible above or behind the sticky control.
- **Hover styles** (`:hover` fills, mouse-tracking glows) are desktop polish; do not port them to touch, and never let a stuck hover state carry meaning.
- **Modifier-key shortcuts are enhancements.** Ctrl/⌘-click multi-select and similar modifier interactions may extend a control for desktop power users, but must never be the only path to a necessary capability — provide a first-class option that works on touch (e.g. the Offense/Defense group chips beside single-position filters).

### Mobile / Tablet (< 1024px)

- **Top bar:** Sticky `NavBar`, 44px tall. Transparent until scroll, then frosted glass (`blur(16px) saturate(160%)`).
- **Bottom bar:** Fixed `BottomTabBar`, 49px tall + `env(safe-area-inset-bottom)` for device safe areas.
- **Sidebar:** Hidden.
- **Content:** Scrollable region between the two bars. Bottom padding accounts for tab bar height and safe area inset.

### Dense Mobile Rows

Player names and primary identity text are the highest-priority content in dense mobile/tablet rows. When a row runs out of horizontal space, reclaim space by removing or shrinking lower-priority chrome before increasing row height.

**Compression order:**

1. Hide decorative team logos or secondary artwork.
2. Hide helper labels for obvious numbers, such as `PPG` or `Value`, while keeping the number.
3. Hide or compact position/team badges on the narrowest widths, then restore them at slightly wider mobile breakpoints.
4. Shrink fixed assets like check circles, headshots, and badges by a few pixels.
5. Only after those steps, consider smaller name text or a taller row.

Do not solve mobile name truncation by making every selection row taller unless the row is meant to become an expanded card. Compact picker rows should preserve their scanning rhythm; optional metadata should drop before player names become unreadable.

### Roster Identity Rows

Roster player names are required identity content and must not be truncated or ellipsized. Use measured name columns on wider layouts, allow names to wrap when space is tight, and remove lower-priority chrome such as decorative logos, helper labels, or secondary badges before hiding any part of the player's name.

### Mobile Filter And Sort Rails

When filter chips and sort options appear near the same list or table, keep each control group localized to its own single horizontal row on mobile/tablet: one row for filters, one row for sort. Do not merge filters and sort into a shared rail.

Rows with overflow must use the scroll-cue pattern: a right-side fade/chevron appears only when more options exist to the right, and a matching left-side fade/chevron appears only after the row has been scrolled away from the start. Each rail tracks its own scroll state, so cues disappear at their respective edges. The cue overlays the row edge; it must not be part of the scrollable chip content or move with the chips.

### Desktop (≥ 1024px)

- **Sidebar:** Fixed left panel, 240px wide, full viewport height.
- **NavBar + BottomTabBar:** Hidden.
- **Content:** `margin-left: 240px`, scrolls independently.

### Safe Area Insets

All fixed bottom bars must include `env(safe-area-inset-bottom)` in their height or padding. Never hard-code the tab bar height without this offset.

### Grid Patterns

**Team logo alignment in ranked lists:** Measure the widest player name using a canvas element, then set the name column to `minmax(0, <measured>px)` in `grid-template-columns`. Add a separate `auto` column for the logo/badge, and a `1fr` spacer column between the logo and stat columns to absorb leftover row width. Without the spacer, unallocated space pushes the logo toward the center.

**Rank computation in filtered lists:** Always compute rank (i + 1) on the full sorted array, then filter for display. Carry `rank` as a property on each item. Never derive rank from the filtered map index.

### Table Layout

Column headers should be vertically centered over the metric data they describe unless a specific surface calls for another alignment. Header cells and data cells must share the same grid contract so sorting controls, labels, values, and actions line up row by row.

Column headers are required comparison labels and should not be truncated. Header text may wrap or use controlled horizontal overflow, as long as it does not overlap other elements and all header cells preserve a consistent vertical rhythm.

Table elements must never overlap. Reserve stable columns for required identity, metric, status, and action slots so missing or longer content does not reshape neighboring rows.

When tables narrow, resize columns or remove lower-priority elements before visual consistency breaks. Keep the highest-priority data visible first, then drop helper labels, decorative logos, secondary metrics, or other chrome in that order.

### Horizontal Overflow Indicators

Horizontally scrollable tables, stat strips, and dense card rows should show directional edge indicators when hidden content exists off-screen. The indicator is a temporary affordance, not permanent decoration: show the right arrow only when the user can scroll farther right, show the left arrow only after content exists back to the left, and hide each arrow as soon as that edge is reached.

Use a subtle surface-matched gradient fade at the edge with a small circular arrow control layered above the scroll area. The indicator should be `pointer-events-none` so swipes, drags, and taps still belong to the content underneath. Keep it mode-aware by matching light and dark surface tokens, and avoid signature amber unless the arrow is also an active command.

---

## Elevation & Depth

The system uses three layers:

| Layer | Background Token | Typical Use |
|---|---|---|
| Canvas | `--color-bg` | Page background |
| Surface | `--color-bg-secondary` | Sidebar, cards, modals |
| Elevated | `--color-bg-tertiary` | Nested panels, hover states |

Depth is expressed through background color progression, not drop shadows. The one exception is the card glow effect on interactive trade proposal cards (desktop only), which uses a radial gradient centered on the mouse position at a 400px radius. This effect falls back to a neutral glow when the team color is too similar to the glow.

Bar elements (NavBar, BottomTabBar) use backdrop blur — `blur(16px) saturate(160%)` with `-webkit-backdrop-filter` for Safari — over a semi-transparent background color.

---

## Shapes

Corner radii follow Tailwind's **default** scale (`tailwind.config.js` does not extend it), plus two hand-written CSS values for dense data surfaces. Four tiers:

| Tier | Value | Use |
|---|---|---|
| Control | `7–10px` | Chip buttons and segmented controls (selector chips scale radius with size tier: xs 7px / sm 8px / md 10px), small square buttons (pagers, back) |
| Panel | `8px` | Dense data panels, boards, rails, alerts, disclosure panels |
| Card | `rounded-xl` (0.75rem / 12px) | Cards and list containers built with Tailwind classes |
| Modal | `rounded-2xl` (1rem / 16px) | Modals and large overlays |

Badges and tiny tags use `2–4px`; avatars and pills use `rounded-full` (9999px). Filter chips use the control tier, not `rounded-full`.

Desktop modals always use `rounded-2xl` — never `rounded-t-2xl` ad hoc. A bottom sheet is only ever an explicit decision: either the `Modal mobileSheet` variant (mobile drill-ins, see Modal → Mobile Sheet) or the `ActionSheet` component.

---

## Components

### Modal

Center-aligned by default; bottom sheets only via the explicit `mobileSheet` variant below.

- Backdrop: `fixed inset-0 z-50 flex items-center justify-center`, `background: rgba(0,0,0,0.5)`
- Container: `rounded-2xl w-full mx-4` with a defined `maxWidth`
- Scroll lock: `document.body.style.overflow = 'hidden'` on mount; restore on unmount
- Scrollable content lives in the inner div (`overflow-y-auto`), not the container
- Close on backdrop click; stop propagation on inner div

#### Mobile Sheet (`<Modal mobileSheet>`)

The sanctioned slide-up drill-in for mobile/tablet (`< 1024px`). Used for player previews, pickers, and detail sheets across Companion, Draft, Scout, and Compare.

- Overlay `.modal-overlay--mobile-sheet` sits at `z-index: 90` and **covers the bottom tab bar** (`z-index: 50`) — sheet content must not add tab-bar clearance padding.
- The Modal panel owns the **drag handle** and the **`env(safe-area-inset-bottom)` padding**. Sheet children must not render a second handle strip or re-add safe-area padding.
- Dismissal: drag-down on the handle, backdrop tap, and Escape. All three are provided by `Modal` — don't reimplement.
- Close affordance: a circular (`rounded-full`) button inside the sheet's header/hero, meeting the 44px target under `pointer: coarse` (visual 30px + `::after { inset: -7px }` hit-area expansion).
- Entry animation: slide-up 240ms `cubic-bezier(0.32, 0.72, 0, 1)`; bottom action rows sit flush at the sheet bottom with symmetric padding — no dead band below the last control.

### Card

- Base: `rounded-xl` corners, surface background, `body-sm` typography
- Interactive trade proposal cards add a mouse-tracking border glow (desktop only)
- Card glow uses team color with a neutral fallback when the color is too close to the glow target
- Cards in a trade package sync their heights equally across the package
- Player/trade cards must never vertically clip identity or value text
- Fixed-ratio cards resize as a unit; do not force height independently from width
- When a layout promises a fixed visible card count, derive card width from container width, gaps, and count
- Optional stat/detail rows drop before required identity/value text clips

### Navigation Item (Sidebar)

- Default: transparent background, secondary label color, `label-nav` typography
- Active: `--color-signature` left border (3px), full-width row, no background fill on the item itself
- Hover: `--color-fill` background (subtle, ~7% opacity)

### Bottom Tab Item

- Default: secondary label color, `label-tab` typography, outline icon
- Active: `--color-signature` icon and label, filled icon variant, `font-weight: 600`

### Section Label

- `label-section` typography (10px, 700, uppercase, 0.10em tracking)
- `--color-label-tertiary` color
- No background; used as a visual divider within panels

### Filter Chip

The standard filter/sort chip is the shared `.companion-selector-button` (`CompanionSelectorButton` in `src/components/companion/CompanionSelectorControls.jsx`).

- Typography: `chip-filter` (Figtree 800; 10/12/13px by xs/sm/md size tier)
- Border radius: control tier, scaled with size (7/8/10px)
- Rest: `--color-fill` background, `--color-separator` border, `--color-label-secondary` text
- Active: `--color-signature` background and border, `--color-signature-fg` text, subtle dark inset shadow — always via the `.is-active` class / `active` prop, never re-created inline
- Touch: 44px min-height under `pointer: coarse` (32px sm tier is mouse-only density)

`chip-action` (condensed, uppercase) is reserved for the dense broadcast-style chips on Companion Live.

### Menu (Dropdown)

Dropdown menus (sort selectors, fantasy-team filters) share one pattern — do not invent per-surface variants:

- **Trigger:** `CompanionMenuTrigger` — an uppercase micro kicker naming the control (SORT, TEAM), the current value (14px/700 Figtree, truncating), and a chevron that flips while open (`CompanionMenuChevron`). Never a text affordance like "SELECT". Sized to the md control tier: min-height 38px (44px coarse), radius 10px, `--color-fill` background, separator border. An `engaged` state (amber inset ring) marks a menu actively filtering away from its default.
- **Popover:** `--color-bg` surface, `--color-separator` border, `rounded-xl`, soft drop shadow, anchored below the trigger.
- **Options:** `.companion-menu-item` — 14px Figtree semibold (buttons are exempt from the 16px input rule), 40px min row height (44px under `pointer: coarse`), leading selection mark (`CompanionMenuSelectionMark` — checkbox for multi-select, radio dot for single-select), `.is-checked` = `--color-fill-secondary` tint, hover = `--color-fill`, focus-visible = inset accent ring.
- **Dismissal:** backdrop tap/click and the Escape key both close the menu (`useMenuEscapeClose`).

### Canonical Controls & Interaction States

Every Companion filter pill, segmented toggle, menu trigger, sort selector, and search field routes through the shared control system in `src/components/companion/CompanionSelectorControls.jsx` (`CompanionSelectorButton`, `CompanionSegmentedControl`, `CompanionSelectorRail`, `CompanionMenuTrigger`, `CompanionFantasyTeamMenu`, `CompanionSearchField`). If a control needs a size or variant that doesn't exist, **extend the canonical component and its CSS** — never style a one-off `<button>` with inline values that approximate the system.

`CompanionSegmentedControl` renders a grid of standard selector pills (md tier, equal column widths) with **no extra panel chrome** — no wrapping border, background box, or extra padding — so a segmented toggle height-matches any md control beside it. The active segment uses the standard signature fill via `.is-active`, never a bespoke treatment.

Because all canonical control CSS in `src/index.css` loads after `@tailwind utilities`, equal-specificity Tailwind utility classes **cannot override canonical control styles** — they silently lose the cascade. To change a canonical control's layout or look, extend the canonical class (a new variant/modifier), don't stack utilities on the instance.

Every interactive control must ship a complete state set:

| State | Treatment |
|---|---|
| Resting | On-token; quiet is fine, but must not read as plain text |
| Hover (fine pointers) | Real change — chips: `--color-fill-secondary` fill + border nudge; menu items: `--color-fill` |
| Focus-visible | `2px solid --color-accent` ring, offset 2px (inset -2px inside popovers/rows) |
| Active/selected | Signature fill + `--color-signature-fg` via `.is-active`/`.is-checked`, with the matching ARIA attribute (`aria-pressed`/`aria-checked`) |
| Pressed | Momentary feedback (`:active` opacity 0.72) |
| Disabled | `disabled` attribute + opacity 0.48, `not-allowed`, no hover response |

Sortable column headers use the shared `.companion-sort-header` pattern (`is-active` label color, hover signature, focus-visible accent ring, triangle arrow). Transitions keep the house easing `cubic-bezier(0.32, 0.72, 0, 1)`.

### Primary Button

- Background: `--color-signature`; text: `--color-signature-fg`
- Typography: `chip-action` (condensed, uppercase, tracked)
- Border radius: control tier (7px); min-height 44px
- Blue `--color-accent` is **not** a button fill — it marks links, focus rings, selection, and the opponent side in data visualizations

### Input

- `font-size: 16px` always (iOS zoom prevention)
- Border: `--color-separator` at rest, `--color-accent` on focus
- Background: `--color-bg-secondary`
- Border radius: `rounded-lg`

### Shared UI Primitives (`src/components/ui/`)

The app-wide building blocks. Use them — never rebuild a local variant.

| Component | Purpose |
|---|---|
| `Spinner` | The only sanctioned spinner; strokes `currentColor`, sizes `sm`/`md` |
| `Skeleton` / `SkeletonStatChip` / `SkeletonText` / `SkeletonCard` | Loading placeholders (see Loading States) |
| `SectionSkeleton` | Suspense fallback for lazy-loaded views |
| `StatsProgressBanner` | The only real-progress bar (season-stats load) |
| `SeasonChip` | Compact league-year selector; lives in the mobile NavBar |
| `SeasonHintBanner` | One-line wrong-league-year hint with a one-tap switch (see `src/utils/seasonAvailability.js` for the capability convention) |
| `StatusBadge` | The single Beta/Alpha marker — one label, shape, and color everywhere |
| `EmptyState` | The single empty-state treatment (see Empty States) |

### Status Tints

Soft semantic surfaces derive from accent tokens via the `.bg-tint-*` / `.border-tint-*` utilities in `src/index.css` (`accent`, `green`, `red`, `orange`, `alpha`, `signature`, plus `-strong` background variants). Never hand-roll `bg-green-50 dark:bg-green-900/30`-style palette tints.

### Tooltips

The chart tooltip treatment (elevated `--color-bg-secondary` panel, `pointer-events: none`, clamped to its container, tap-equivalent on touch) is the app-wide tooltip style — non-chart tooltips follow the same recipe.

---

## Information Density & Redundancy

The aesthetic is dense but ordered — density comes from showing *more distinct facts*, never the same fact twice.

- **One fact, one place.** Team names, scores, statuses, and metrics render once per surface. If a headline would repeat what a hero/summary block already shows, delete the headline.
- **One status indicator.** A surface gets at most one live dot / pulse and one "updated at" stamp. Merge status into an existing header strip instead of adding a new one.
- **Persistent chrome must earn its place.** Controls that are rarely used (diagnostics, manual refresh while auto-refresh runs, session toggles) live behind a single disclosure ("⋯"), not as always-visible buttons.
- **Inapplicable controls hide, they don't disable.** A control that can do nothing in the current state (e.g. a stat-value toggle while a non-stat sort is active) is removed from the layout and appears when it becomes meaningful. Disabled styling is reserved for actions the user can unblock in place.
- **Explanatory captions are noise.** Don't label what the UI already demonstrates ("updates live", "tap to select"). Guide content belongs in the Guide tab.
- **Redundant encodings are allowed only across channels,** e.g. color + position + label for accessibility — not two labels.

---

## Charts & Data Visualization

- **Never stretch text.** Do not use `preserveAspectRatio="none"` on an SVG that contains text or fixed-shape markers. Measure the container (ResizeObserver) and build the viewBox from real pixel dimensions so a 1:1 coordinate mapping holds at every viewport and pixel density.
- **Series colors:** amber `--color-signature` = the user's side; blue `--color-accent` = the opponent. Positive/negative deltas use green/red semantic accents.
- **Inspection:** mouse gets hover crosshair + tooltip that clears on `pointerleave`; touch gets tap/drag-to-scrub with tap-outside dismiss (see Input Modalities). Tooltips are `pointer-events: none` and clamp within the plot.
- **Identify series inside the plot** (small swatch + short label in the SVG) *or* in a legend — never both.
- **Axis/grid chrome is minimal:** dashed separators, tertiary-label tick text, tabular numerals.

---

## Status & Diagnostics

Live/async surfaces follow one pattern:

- **One status line** in the surface's header: optional pulsing dot + condensed micro-label ("LIVE · 3 GAMES · UPDATED 1:23 PM"). Short states, not sentences.
- **One disclosure** ("⋯" control button) opens a diagnostics panel: definition list of key/value facts plus the rarely-used actions (pause/resume, manual refresh, session off).
- **Errors** use the alert treatment (red-tinted panel) and appear only while true.
- Setup instructions, key names, and environment details never appear in UI copy — link the docs instead, in plain language.

---

## Loading States

One loading language, app-wide. Shared primitives live in `src/components/ui/` — never build a one-off spinner or pulse bar.

**Three sanctioned patterns:**

1. **Instant shell + skeleton chips** (default for data views): render real structure — names, logos, layout — the moment it's available, and put a `SkeletonStatChip` only where a value hasn't hydrated. Never render placeholder values (`0.0`, `—`, fabricated names) as if they were data; after hydration, `—` remains the legitimate "no data" marker.
2. **Section skeleton** (`SectionSkeleton`, Suspense fallbacks / no shell data): a header bar plus card shapes shaped like the incoming content. Never a bare "Loading..." text line.
3. **Scoped spinner** (`Spinner`, sub-second waits): inline in a button, input, or modal, taking the surrounding text color. Not for whole content areas.

**Progress:**

- A progress percentage appears only where it is real — the season-stats load (`StatsProgressBanner`, driven by `statsProgress`). Fake or simulated progress is prohibited; when duration is unknown, use an indeterminate spinner.
- Skeleton visual spec: `--color-fill-secondary` base with a `--color-fill` shimmer sweep (`.gs-skeleton`), corner radius matching the element it replaces, static under `prefers-reduced-motion`.
- Season-switch controls show a pending state while `seasonSwitching` is set: target control gets a small spinner, siblings dim and disable.

---

## Empty States

- One empty state per surface — never stack a board empty state and a rail empty state at the same time. If a panel has nothing to show and no action to offer, don't render the panel.
- Format: one condensed micro-label line, or short heading + one supporting line. No illustrations, no paragraphs.
- The message states what will fill the space and, if applicable, the single action that gets there ("Turn on Live to see plays and their fantasy impact.").

---

## Do's and Don'ts

**Do** use `--color-signature` on active states, primary actions, "you/yours" data-viz series, and singular focal numerals. Never on body copy, headings, or descriptive labels.

**Don't** place readable text directly on `#F5B700` without using `--color-signature-fg` (`#0C0F14`) as the text color.

**Do** render each team name, score, and status exactly once per surface, and merge status into an existing header strip.

**Don't** add a headline, legend, or caption that repeats what a hero, summary block, or adjacent control already shows.

**Do** measure a chart's container and build the SVG viewBox from real pixel dimensions.

**Don't** use `preserveAspectRatio="none"` on SVGs containing text — the type distorts differently at every viewport width.

**Do** give every hover interaction a tap equivalent, and 44px targets under `pointer: coarse`.

**Don't** gate information behind hover-only affordances or ship sub-44px touch targets on coarse pointers.

**Do** compute rank on the full sorted list before applying any search or position filter.

**Don't** derive rank from the filtered array index — the number will reflect the filtered position, not the true rank.

**Do** show horizontal scroll arrows only while additional content exists in that direction.

**Don't** leave scroll arrows visible at the far left or far right edge, or let the indicator block touch/drag interaction with the scrollable content.

**Do** lock body scroll (`document.body.style.overflow = 'hidden'`) when a modal is open, and clean up on unmount.

**Don't** apply `overflow: hidden` to the modal container — scrollable content belongs in the inner content div.

**Do** include `env(safe-area-inset-bottom)` in any fixed bottom bar's height or padding calculation.

**Don't** hard-code the tab bar height (`49px`) without the safe area offset. Home indicator and notch devices will clip content.

**Do** use `font-size: 16px` on all `<input>` and `<select>` elements.

**Don't** use smaller font sizes on inputs — iOS Safari will auto-zoom the viewport on focus.

**Do** pair the 240px sidebar with `margin-left: 240px` on the content area at the `lg` breakpoint.

**Don't** use `padding-left` on the content area for sidebar offset — it affects background fill and scroll width.

**Do** use spring-curve easing `cubic-bezier(0.32, 0.72, 0, 1)` for entrance animations.

**Don't** use linear or ease-in for UI element entrances — the motion will feel mechanical rather than physical.

**Do** show an honest loading state — skeleton chips for unhydrated values, a spinner for unknown durations, real progress only where measured.

**Don't** simulate progress, or render placeholder values (`0.0`, `—`, fabricated names) as if they were loaded data.

**Do** keep text at or above the 9px floor (`label-micro` is 9.5–10px); reserve `--color-signature` for active states, rules, chips, and a surface's singular focal numeral.

**Don't** set body copy, labels, or per-row values in signature amber, or ship text below 9px anywhere.
