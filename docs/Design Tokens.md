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
| `--color-signature` | `#F5B700` | `#F5B700` (same both modes) |
| `--color-signature-fg` | `#0C0F14` | `#0C0F14` (same both modes) |
| `--bar-bg` | `rgba(242,241,236,0.88)` | `rgba(12,15,20,0.90)` |
| `--bar-border` | `rgba(12,15,20,0.12)` | `rgba(228,235,244,0.10)` |
| `--bar-height-nav` | `44px` | — |
| `--bar-height-tab` | `49px` | — |

## Signature Accent Usage (`#F5B700` / `--color-signature`)

Decorative only: sidebar active border, season tab underline, progress bar fill, filter chip bg, bottom tab bar active icon/label. Never use as body text color. Text/icons placed ON a signature background use `--color-signature-fg` (`#0C0F14`).

## Key Conventions

- `font-size: 16px` on all inputs (prevents iOS auto-zoom)
- Safe area insets: `env(safe-area-inset-bottom)` on fixed bottom bars
- Motion: CSS animations, spring-curve easing `cubic-bezier(0.32, 0.72, 0, 1)`
