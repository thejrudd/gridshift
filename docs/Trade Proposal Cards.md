# Trade Proposal Cards

This note defines the layout contract for Trade proposal player and draft pick cards. Keep this separate from `AGENTS.md` so detailed card rules do not consume normal working context.

Primary implementation:
- `src/components/companion/CompanionTrade.jsx`
- `ProposalPlayerCard(...)`
- `TradeProposalItem(...)`

## Core Contract

- Proposal cards use a fixed `5:7` classic trading-card ratio via `aspect-[5/7]`.
- Cards are sized from available proposal-section width and viewport height, not from the number of assets in the package.
- Cards must not stretch to fill full mobile width.
- Cards should not wrap line-by-line while horizontal space is available.
- Fixed-ratio cards resize as one unit. Do not force card height independently from card width.
- Player and draft-pick cards must never vertically clip required text.
- The card identity must preserve the established sports-card typography and visual hierarchy.
- Do not solve fit problems by shrinking identity typography into unreadable text.

## Responsive Card Sizing

Current compact card wrapper:

```jsx
w-[min(76vw,30vh,14rem)]
```

Current wide card override:

```jsx
2xl:w-[clamp(13rem,14vw,15rem)]
```

Meaning:
- On compact layouts, card width is capped by viewport width, viewport height, and an absolute rem cap.
- On wide `2xl` layouts, cards can sit in a row and use a larger desktop-oriented width. Container width should remain fluid.
- Layouts that promise three visible cards must calculate width from available container width, gap size, and card count.
- Give/Get sides stack below `2xl` and become side-by-side at `2xl`. Each side should use the available proposal width; do not apply fixed side-container caps that clip card rows while page space is still available.
- Each Give/Get side owns its own horizontal card row. Do not require all cards for the full trade to fit before allowing side-level horizontal layout.
- Side card rows use `flex-row flex-nowrap` at all breakpoints. If one side cannot fit all of its cards, allow horizontal overflow for that side instead of stacking every card vertically. Use `scrollbar-hide`; player-card rows must never show a visible scrollbar.
- Pick callouts switch at the same `2xl` breakpoint as the card layout to avoid duplicated visual treatment.

## Required Content Priority

Required content, in order:
- player photo or draft-pick hero
- player name or draft-pick label
- abbreviated team/position when applicable
- trade value
- team logo when applicable

Trade value color must be uniform across players and picks. Do not color trade values by team palette because that can imply a semantic value difference. Keep team colors in decorative areas such as backgrounds, borders, glows, left highlights, and logo treatment.

Current value color:

```jsx
var(--color-label)
```

## Text Rules

- Player names, draft-pick labels, and team/position labels are single-line only.
- Do not wrap, truncate, or ellipsize those identity labels.
- Use abbreviated team/position labels, such as `TB · QB`.
- Preserve the established `Barlow Condensed` uppercase card typography.
- If text pressure appears, address layout/card width or optional detail visibility first.
- Optional stat/detail rows drop before required identity or value text clips.

## Player Card Layout

`ProposalPlayerCard` supports both full and compact card modes.

Compact proposal cards pass:

```jsx
compactTradeCard
```

Current photo/hero area:

```jsx
height: compactTradeCard ? '48%' : '56%'
```

Reasoning:
- Full/non-proposal cards can give the player photo more vertical presence.
- Compact proposal cards reduce the photo band so the lower area has room for value and stat summaries.
- Do not increase compact photo height unless the lower detail area still fits without clipping.

The player image uses:

```jsx
objectFit: 'cover'
objectPosition: 'top center'
```

Team logo:
- Player cards keep the team logo badge in the top-right.
- `topRightSlot` may replace the logo only for explicit controls such as remove buttons.
- Team colors may be used for background, border, glow, and logo badge treatment.
- Team colors must not be used for trade value text.

## Stat Rules

Stats are optional detail. They must never clip or overflow.

Compact proposal stat selection:

```jsx
const visibleStatDefs = compactTradeCard ? statDefs.slice(0, 2) : statDefs;
```

Meaning:
- Compact proposal cards show only the first two position-specific stat rows in the `Stats` panel.
- Larger/non-proposal cards may show fuller stat tables if they fit cleanly.
- If the compact stat area clips again, reduce visible rows or adjust photo/detail allocation before changing required identity content.

Desktop compact cards:
- Show two panels: `Stats` and `Fantasy`.
- `Stats` uses `visibleStatDefs`, capped to two rows for compact proposal cards.
- `Fantasy` shows `PPG` and positional rank.
- Positional rank must format as `posLabel + rank`, for example `QB13`, not just `QB`.
- `Season` is hidden for compact proposal cards and only appears on larger/non-compact cards.

Mobile compact cards:
- Use the lower open space for a two-column summary.
- The row is `flex-1 min-h-0` so it dynamically fills available lower-card height.
- Stat boxes use `justify-center` so content is vertically centered in the available space.
- Current mobile summary fields are `PPG` and positional rank.
- Mobile rank must also format as `posLabel + rank`, for example `QB13`.

## Draft Pick Cards

Draft pick cards use the same `5:7` frame and compact photo/hero allocation.

Pick cards:
- Use a themed pick background based on favorite team when available.
- Show draft-pick hero content in the top area.
- Show round/quality label in the banner.
- Show pick trade value with the same uniform value color as player cards.
- May show projected pick range as optional detail on larger cards.
- Must follow the same no-wrap/no-truncation identity-label rule.

## Equal Height Behavior

`TradeProposalItem` uses `useEqualizedCardHeight(...)`.

Current behavior:
- Equal-height syncing is enabled only on wide `2xl` card rows.
- Compact stacked layouts do not force equalized heights.
- `forcedHeight` is passed into `ProposalPlayerCard` when equalization is active.

Do not enable equal-height syncing on compact/mobile layouts unless it is tested against the fixed `5:7` ratio and no-clipping rules.

## Maintenance Checklist

When editing Trade proposal cards:
- Verify player and draft-pick cards preserve `5:7` by resizing width and height together.
- Verify promised three-card rows derive card width from container width, gaps, and visible count.
- Verify optional stat/detail rows drop before identity or value text clips.
- Verify a QB card with passing stats does not clip the stat panel.
- Verify a long-name player does not wrap or ellipsize.
- Verify rank displays as `QB13`, `RB8`, etc., not only `QB` or `RB`.
- Verify trade value color is uniform across teams and picks.
- Verify a draft pick card follows the same label/value rules.
- Verify mobile cards do not stretch full width.
- Verify mobile stat boxes flex-fill available lower-card space.
- Verify each side of the trade keeps its own cards in one horizontal row when space exists, even if Give/Get are stacked.
- Verify no proposal-level or side-level fixed max-width clips player cards while page space is still available.
- Verify no visible scrollbar appears underneath player-card rows.
- Verify pick callouts and card layout use the same breakpoint behavior.
