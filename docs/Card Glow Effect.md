# Card Glow Effect

Mouse-tracking border glow applied to interactive trade proposal cards (desktop only — the effect relies on `onMouseMove`).

## Hook: `src/hooks/useCardGlow.jsx`

### Parameters

| Param | Type | Default | Purpose |
|---|---|---|---|
| `enabled` | boolean | `true` | Gate the effect (e.g. only on interactive cards) |
| `color` | string (hex) | `'#5AADFF'` | Desired glow color |
| `cardColor` | string (hex) | `null` | Card's dominant bg color — used for similarity check |
| `darkMode` | boolean | `true` | Adjusts strategy per theme |

### Returns

| Key | Type | Usage |
|---|---|---|
| `isGlowing` | boolean | Whether the mouse is currently over the card |
| `glowHandlers` | object | Spread onto the card div: `{onMouseMove, onMouseEnter, onMouseLeave}` |
| `borderOverlay` | JSX | Render inside the card as a child — the masked border glow |
| `glowShadow` | string | A `box-shadow` value to merge into the card's `style.boxShadow` |

### Usage in CompanionTrade.jsx

```jsx
const { isGlowing, glowHandlers, borderOverlay, glowShadow } = useCardGlow({
  enabled: isInteractive,
  color: teamColor,
  cardColor: teamColor,
  darkMode,
});

// Merge glowShadow into boxShadow
const cardBoxShadow = glowShadow ? `${glowShadow}, ${baseShadow}` : baseShadow;

<div {...glowHandlers} style={{ boxShadow: cardBoxShadow }}>
  {borderOverlay}
  {/* card content */}
</div>
```

## How It Works

### Border glow (both modes)

A `div` overlay positioned at `inset: -1` with `pointer-events: none` and `z-index: 21`. The border is achieved via CSS `mask-composite: exclude` — the overlay has a radial gradient as its `background` (origin: `border-box`) and two masks that cancel the padding region, leaving only the border ring visible.

The radial gradient is a 400px circle centered at the mouse position (`onMouseMove` tracks `e.clientX - rect.left` / `e.clientY - rect.top`). This makes the border glow brightest at the nearest edge to the cursor and fade away around the perimeter.

Gradient stops: `cc` at center, `55` at 30%, `18` at 60%, transparent at 80%.

### Outer shadow (light mode only)

A directional `box-shadow` computed from the mouse's offset relative to the card center. The shadow shifts up to 5px toward the cursor, creating a soft colored bloom outside the card that follows the mouse. This compensates for the masked border being less visible against the light page background.

### Color similarity fallback

`colorsAreSimilar()` computes Euclidean distance in RGB space between the glow color and the card's dominant background color. If the distance is below 80 (e.g. Browns: same orange for both), the glow swaps to a neutral: `#FFFFFF` in dark mode, `#1A1A2E` in light mode.

### Why not `accentColor`?

The palette's `accentColor` is contrast-adjusted for text legibility on card backgrounds. For many teams in light mode, this resolves to `#F2F1EC` (near-white) because their primary colors are dark (`hexLuminance < 0.18`). That makes it invisible as a glow against the off-white page background. The glow uses the team's vivid primary color directly instead.

## Tuning

The main knobs for adjusting intensity:

- **Border gradient alphas** (`cc`/`55`/`18`): increase the first stop for a brighter core, the second for wider reach
- **Gradient radius** (400px): larger = softer/wider glow, smaller = tighter hotspot
- **Light mode shadow alphas** (`33`/`22`): increase for more visible outer bloom
- **Shadow spread/blur** (16px/4px and 22px/4px): increase for a larger outer glow
- **Similarity threshold** (80): lower = only exact matches trigger fallback, higher = more teams get the neutral glow
