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

rounded:
  sm: "0.25rem"
  DEFAULT: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
  full: "9999px"

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
    typography: "{typography.label-section}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#FFFFFF"
    typography: "{typography.label-nav}"
    rounded: "{rounded.lg}"
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

1. **Amber signals action.** The signature color marks only interactive or active states — never body copy.
2. **Condensed for headlines, geometric for body.** Barlow Condensed carries the broadcast voice; Figtree handles readable UI.
3. **One breakpoint.** Everything below 1024px is mobile-first; everything at or above 1024px is the desktop shell. No intermediate complexity.
4. **Dark mode is native.** The `.dark` class on `<html>` swaps all design tokens. No third-party library.

---

## Colors

### Signature Amber

`#F5B700` is the single brand accent. It is **decorative only** — used for active states, progress fills, and selection indicators. It never appears as body text.

Any text or icon placed *on* a signature-colored background must use `--color-signature-fg` (`#0C0F14`) for sufficient contrast.

**Valid uses:** active sidebar nav border, season tab underline, progress bar fill, bottom tab active icon and label, filter chip background.

**Invalid uses:** body copy, headings, descriptive labels, icon fills in non-active states.

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

Source colors from `getTeamPalette(team)` in `src/data/teamColors.js`; never hard-code one-off team hex values in component code.

**Gradient recipe:**

- Light mode: `palette.primary -> palette.secondary`
- Dark mode: `palette.darkPrimary -> palette.darkSecondary`
- Direction: `linear-gradient(135deg, start 0%, end 100%)`
- Reversed teams: some palettes read better with `secondary -> primary`; keep these in a local named set for the surface and document any exceptions. In the Trade Upgrades surface, NYG and NYJ intentionally use the normal direction for readability.
- Overlay: add a subtle full-surface overlay above the gradient:
  - Dark: `linear-gradient(180deg, rgba(12,15,20,0.04) 0%, rgba(12,15,20,0.22) 100%)`
  - Light: `linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(12,15,20,0.12) 100%)`

**Readable text on gradients:**

Pick foreground text by testing both `#FFFFFF` and `#0C0F14` against the gradient start, midpoint, and end, then use the color with the better worst-case contrast. Do not choose text color from only the first gradient stop; teams with black, silver, white, or gold endpoints can otherwise create low-contrast zones.

If neither white nor near-black reads well across the whole surface, adjust the gradient before adding shadows or outlines:

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

**Barlow Condensed** — display and brand. Used for the wordmark, section tabs, and editorial labels where broadcast impact is needed. Weights 400, 600, 700, 800.

**Figtree** — body and UI. Used for all interactive labels, navigation, body copy, and data. Weights 400, 500, 600, 700.

### Scale

| Style | Family | Weight | Size | Tracking | Transform | Use |
|---|---|---|---|---|---|---|
| `display-brand` | Barlow Condensed | 700 | 28px | 0.08em | — | Wordmark "NFL" |
| `display-sub` | Barlow Condensed | 400 | 12px | 0.18em | uppercase | Wordmark "PREDICTOR" |
| `headline-tab` | Barlow Condensed | 700 | 15px | 0.07em | uppercase | Season subnav tabs |
| `headline-season` | Barlow Condensed | 700 | 11px | 0.06em | — | Season year label |
| `body-md` | Figtree | 400 | 16px | 0 | — | Default body copy, inputs |
| `body-sm` | Figtree | 400 | 14px | 0 | — | Card and list content |
| `label-nav` | Figtree | 600 | 12.5px | 0 | — | Sidebar nav items |
| `label-action` | Figtree | 500 | 12.5px | 0 | — | Sidebar action items |
| `label-section` | Figtree | 700 | 10px | 0.10em | uppercase | Section divider labels |
| `label-tab` | Figtree | 500/600 | 10px | 0.01em | — | Bottom tab labels (600 when active) |

**Input rule:** All `<input>` and `<select>` elements must have `font-size: 16px` to prevent iOS Safari from auto-zooming on focus. This is non-negotiable.

---

## Layout

A single breakpoint at `1024px` splits the two navigation shells.

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

Corner radii follow Tailwind's default scale, extended with `rounded-xl` (`1.5rem`) as the standard for cards and modals.

| Token | Value | Use |
|---|---|---|
| `rounded-sm` | 0.25rem | Tight UI elements, badges |
| `rounded` | 0.5rem | Default buttons, chips |
| `rounded-md` | 0.75rem | Navigation items |
| `rounded-lg` | 1rem | Buttons, inputs, list items |
| `rounded-xl` | 1.5rem | Cards, modals, panels |
| `rounded-full` | 9999px | Avatars, filter chips, pills |

Modals always use `rounded-2xl` (equivalent to `rounded-xl`) — never `rounded-t-2xl` (the bottom-sheet pattern). If the intent is a bottom sheet, that must be an explicit `ActionSheet` component decision.

---

## Components

### Modal

Center-aligned, never bottom-sheet by default.

- Backdrop: `fixed inset-0 z-50 flex items-center justify-center`, `background: rgba(0,0,0,0.5)`
- Container: `rounded-2xl w-full mx-4` with a defined `maxWidth`
- Scroll lock: `document.body.style.overflow = 'hidden'` on mount; restore on unmount
- Scrollable content lives in the inner div (`overflow-y-auto`), not the container
- Close on backdrop click; stop propagation on inner div

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

### Filter Chip (Active)

- Background: `--color-signature`
- Text: `--color-signature-fg`
- Border radius: `rounded-full`
- Typography: `label-section`

### Input

- `font-size: 16px` always (iOS zoom prevention)
- Border: `--color-separator` at rest, `--color-accent` on focus
- Background: `--color-bg-secondary`
- Border radius: `rounded-lg`

---

## Do's and Don'ts

**Do** use `--color-signature` only on active states and decorative fills. Never on readable text.

**Don't** place readable text directly on `#F5B700` without using `--color-signature-fg` (`#0C0F14`) as the text color.

**Do** compute rank on the full sorted list before applying any search or position filter.

**Don't** derive rank from the filtered array index — the number will reflect the filtered position, not the true rank.

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
