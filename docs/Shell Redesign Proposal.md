# Shell Redesign Proposal

**Status:** Proposed — not yet implemented
**Scope:** Navigation shell only (Sidebar, NavBar, BottomTabBar, content-area wrapper). No content-area components are changed.
**Goal:** Refine the existing Broadcast Editorial design language for cleaner visual hierarchy and remove minor inconsistencies. All changes are visual/CSS only — no behavioral or functional changes.

---

## Current Design System

### Aesthetic Identity — "Broadcast Editorial"

The app uses a custom token system defined in `src/index.css`. The guiding aesthetic is stadium broadcast: amber/gold signature accent against deep slate-charcoal in dark mode, warm newsprint off-white in light mode. Two fonts: **Barlow Condensed** (display/brand, uppercase, wide tracking) and **Figtree** (body/UI).

### Color Tokens

| Token | Light Mode | Dark Mode |
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
| `--color-signature` | `#F5B700` | `#F5B700` (same both modes) |
| `--color-signature-fg` | `#0C0F14` | `#0C0F14` (same both modes) |
| `--bar-bg` | `rgba(242,241,236,0.88)` | `rgba(12,15,20,0.90)` |
| `--bar-border` | `rgba(12,15,20,0.12)` | `rgba(228,235,244,0.10)` |
| `--bar-height-nav` | `44px` | — |
| `--bar-height-tab` | `49px` | — |

**Signature accent rules:** `#F5B700` is decorative only — sidebar active border, season tab underline, progress bar fill, filter chip background, bottom tab active icon/label. Never used as body text color. Text on a signature background uses `--color-signature-fg` (`#0C0F14`).

### Typography

| Role | Font | Weight | Size | Notes |
|---|---|---|---|---|
| Brand/display | Barlow Condensed | 700 | 28px | Uppercase, `0.08em` tracking |
| Brand sub | Barlow Condensed | 400 | 12px | Uppercase, `0.18em` tracking |
| Season label | Barlow Condensed | 700 | 11px | `0.06em` tracking, signature color |
| Editorial tabs | Barlow Condensed | 700 | 15px | Uppercase, `0.07em` tracking |
| Nav item label | Figtree | 600 | 14px | |
| Action item | Figtree | 500 | 13px | |
| Section label | Figtree | 700 | 10px | Uppercase, `0.10em` tracking |
| Tab bar label | Figtree | 500/600 | 10px | 600 when active |

### Layout Architecture

**Breakpoints:**
- `< 1024px` — Mobile/tablet: sticky NavBar (44px) + fixed bottom tab bar (49px + safe area)
- `≥ 1024px` — Desktop: 240px sticky left sidebar + full-width content area. NavBar and BottomTabBar hidden.

**Key files:**
- `src/App.jsx` — App shell, navigation state, content routing
- `src/components/Sidebar.jsx` — Desktop sidebar (lg+)
- `src/components/NavBar.jsx` — Mobile top bar (< lg)
- `src/components/BottomTabBar.jsx` — Mobile bottom tab bar (< lg)
- `src/index.css` — All shell CSS classes

### Current Shell Components

**Sidebar** (`src/components/Sidebar.jsx`)
- Background: `--color-bg-secondary` (one step above canvas)
- Right border: `1px solid var(--color-separator)`
- **Brand section:** "NFL" at 28px bold stacked over "PREDICTOR" at 12px. Season year and favorite team chip in an inline row below.
- **Progress section:** Season completion bar + count. Uses `visibility: hidden` (not `display: none`) when not on Predictions tab — space is reserved but empty on all other tabs.
- **Nav section:** Four items — Predictions, Statistics, Companion (Beta), Trade (Beta). Active item: `3px` amber left border + `--color-fill` background fill.
- **Actions section:** Context-sensitive flat list of same-weight text buttons. Guide always visible. Predictions: Create Image, Export JSON, Import JSON, Randomize, Reset All. Companion/Trade: Scoring Settings, Disconnect. All buttons same visual weight except Reset All which uses `--color-accent-red`.
- **Footer:** My Team, Dark Mode toggle, About/GitHub, version string.

**NavBar** (`src/components/NavBar.jsx`)
- 44px sticky. Transparent until scrolled, then blurred `--bar-bg` with border.
- Left: dark mode toggle. Center: "NFL | PREDICTOR" wordmark (always static). Right: three-dot menu.

**BottomTabBar** (`src/components/BottomTabBar.jsx`)
- Fixed bottom, `49px + safe-area-inset-bottom`. Blurred `--bar-bg`.
- Four tabs: Predictions (football), Statistics (person), Companion (star, Beta), Trade (arrows, Beta).
- Active state: icon + label switch to `--color-signature` amber.

---

## What's Working — Keep As-Is

- The full color token system and both palettes
- `#F5B700` signature amber as the universal active/decorative signal
- Barlow Condensed + Figtree font pairing
- Bottom tab bar behavior, active states, and all icons
- Sub-navigation editorial tab treatment (amber underline indicator)
- Mobile NavBar glass-blur scroll behavior
- The `--color-separator` border-only approach for the sidebar right edge
- All content-area components — nothing below the shell is touched

---

## Proposed Changes

### 1. Sidebar — Unify Background Surface

**Current:** Sidebar background is `--color-bg-secondary`. Content area is `--color-bg`. Two competing surface planes that fragment the page into "sidebar world" and "content world."

**Proposed:** Change sidebar background to `--color-bg`. The `1px solid var(--color-separator)` right border provides all the separation needed.

**File:** `src/index.css` — `.app-sidebar { background: var(--color-bg); }`

---

### 2. Sidebar — Brand Section Redesign

**Current:** "NFL" at 28px bold stacked over "PREDICTOR" at 12px. The 28px → 12px size jump is abrupt and makes the tagline feel tacked on. The season year and favorite team chip are crammed into a small inline row below.

**Proposed:** Treat "NFL PREDICTOR" as a single horizontal wordmark — "NFL" in Barlow Condensed bold, a thin vertical separator, then "PREDICTOR" in Barlow Condensed at a lighter weight. Season year on its own line below, left-aligned. Favorite team chip repositioned to sit cleanly below the season year rather than inline with it.

**File:** `src/components/Sidebar.jsx` — brand section markup and styles

---

### 3. Sidebar — Active Nav State Refinement

**Current:** Active item uses both a `3px` amber left border AND a `--color-fill` background. Two signals for the same state — neither strong enough on its own, both fighting for attention.

**Proposed:** Increase the left border to `4px`. Replace the `--color-fill` background with a very-low-opacity amber tint (`rgba(245, 183, 0, 0.06)`). This makes amber the single coherent signal: the border anchors it, the tinted fill reinforces it through color rather than a generic lightness shift.

**File:** `src/index.css` — `.sidebar-nav-item.active`

---

### 4. Sidebar — Actions Section Visual Hierarchy

**Current:** All action items are the same weight and size. Guide, Export JSON, Randomize, and Reset All are visually indistinguishable except for the red color on Reset All.

**Proposed:** Use the existing `--color-label-secondary` vs `--color-label-tertiary` split to separate primary utility actions (Guide, Scoring Settings) from data I/O actions (Export, Import, Randomize). Reset All keeps its red and gains a slightly more generous top margin to reinforce the visual separation the divider already creates. The section label "Actions" becomes contextual: "Predictions" on the Predictions tab, "League" on Companion and Trade.

**File:** `src/components/Sidebar.jsx` — action item rendering; `src/index.css` — minor spacing tweak

---

### 5. Sidebar — Progress Section Space Reclaim

**Current:** Progress bar uses `visibility: hidden` when not on Predictions tab. The space is reserved but completely wasted on every other tab.

**Proposed:** Replace `visibility: hidden` with conditional rendering — only mount the progress section when `activeTab === 'predictions'`. Pure visual change; no behavioral effect. Reclaims the vertical space on other tabs so the nav items sit higher.

**File:** `src/components/Sidebar.jsx` — wrap progress section in `{activeTab === 'predictions' && …}`

---

## Files to Touch

| Change | File(s) |
|---|---|
| 1. Sidebar background | `src/index.css` |
| 2. Brand section | `src/components/Sidebar.jsx` |
| 3. Active nav state | `src/index.css` |
| 4. Actions hierarchy | `src/components/Sidebar.jsx`, `src/index.css` |
| 5. Progress visibility | `src/components/Sidebar.jsx` |
