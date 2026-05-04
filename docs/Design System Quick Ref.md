# Design System Quick Ref — "Broadcast Editorial"

Full token table and dark-mode values: **`docs/Design Tokens.md`**

## Key Rules

- All colors via CSS custom properties in `src/index.css` — never hardcoded Tailwind palette or hex values in components. The `.dark` class on `<html>` swaps all values.
- `--color-signature` (`#F5B700`) is decorative only — never body text. Use `--color-signature-fg` for text ON signature backgrounds.
- `font-size: 16px` on all inputs (prevents iOS auto-zoom)
- Safe area insets: `env(safe-area-inset-bottom)` on fixed bottom bars
- Motion: spring-curve easing `cubic-bezier(0.32, 0.72, 0, 1)`
- Roster player names are priority content: do not truncate or ellipsize them. Let names wrap when needed, and drop lower-priority row chrome before hiding identity text.

## Team Color Palettes

- NFL teams — raw palettes live in `src/data/teamColors.js` (`TEAM_COLORS`, `getTeamPalette`); computed gradients, overlays, region-aware contrast, tints, reversed-gradient exceptions, side-sensitive logo contrast, and logo badge colors live in `src/utils/teamVisualTheme.js` (`getTeamVisualTheme`). `nyg` and `nyj` are side-sensitive: left-logo Statistics cards reverse them, while right-logo Trade rows/cards keep the default direction. Used for Statistics, Companion, Trade, Scout Results pick rows, and the Compare/Heatmap surfaces.
- College teams — `src/data/collegeColors.js` (`COLLEGE_COLORS`, `getCollegePalette`, `buildCollegeRowGradient`, `getCollegeForeground`). Used for the optional Scout Prospects "Team Colors" toggle. Mirrors the NFL palette structure (primary / secondary / darkPrimary / darkSecondary) and the same `linear-gradient(135deg, primary 0%, darken(primary,0.28) 58%, secondary 100%)` row treatment used by Scout Results.
- When adding a new school to `ROOKIES_2026`, add a matching entry to `COLLEGE_COLORS` keyed by the normalized college name (`normalizeCollegeKey`). If the official primary is near-black or very dark navy, set `darkPrimary` to the brighter accent so the gradient still reads in dark mode.

## Companion And Trade Row Rendering

See [[Companion Shared Rows]] before changing Companion/Trade-adjacent selector rows.

- `CompanionPlayerRow`, `CompanionAssetRow`, and `CompanionSelectorControls` are the single source of truth for player rows, asset rows, selector rails, buttons, segmented controls, and search fields.
- `teamVisualTheme.js` owns NFL team gradients, overlays, tints, reversed-gradient exceptions, side-sensitive logo options, and contrast variables. Feature components should not create duplicate luminance/darken/team-palette helpers.
- `companionAssetVisuals.js` owns shared player images, fallback initials, team logos, position colors, and asset visual decisions.
- Player status badges, `ROSTERED` labels, trend labels, and metric text on team gradients must use the shared local-contrast path (`PlayerStatusBadge`, `CompanionPlayerStatus`, `CompanionPlayerLocalContrastText`, or `CompanionPlayerMetric`). Do not hardcode text colors based only on light/dark mode or team accent.
- Preserve row slots. Failed headshots should fall back to initials and failed logos should leave a spacer; never remove a grid cell with `display: none` because it can collapse player identity columns.
