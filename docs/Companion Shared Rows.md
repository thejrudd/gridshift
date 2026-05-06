# Companion Shared Rows

Back: [[Home]]

This is the source-of-truth note for Companion and Trade-adjacent selector/player row rendering.

## Canonical Files

- `src/components/companion/CompanionPlayerRow.jsx` — canonical player row renderer for Companion player lists and Trade-adjacent player pickers.
- `src/components/companion/CompanionAssetRow.jsx` — canonical selectable asset row for player/pick/manager assets in Trade and Companion selector contexts.
- `src/components/companion/CompanionSelectorControls.jsx` — canonical selector rails, buttons, segmented controls, and search fields.
- `src/components/HorizontalScrollCue.jsx` and `src/hooks/useHorizontalScrollCue.js` — canonical left/right scroll affordance for overflowing selector and tab rails.
- `src/components/companion/PlayerStatusBadge.jsx` — player availability/status badge rendering; uses local row contrast when rendered inside `CompanionPlayerRow`.
- `src/hooks/useCompanionPlayerLocalContrast.js` — measures the badge/text position inside a rendered row and chooses the readable start/mid/end gradient foreground.
- `src/utils/teamVisualTheme.js` — canonical NFL team theme, gradient, overlay, tint, and contrast source.
- `src/utils/companionAssetVisuals.js` — shared player image, team logo, initials, position color, and asset visual helpers.
- `src/index.css` — shared `.companion-player-row`, selector, and asset-row CSS.

## Ownership Rule

Use the shared renderer for row styling and visual structure. Feature screens should provide context-specific data and behavior only.

The shared layer owns:

- Team gradients, tints, overlays, and local contrast variables.
- Player headshots and fallback initials.
- Team logo rendering and failed-logo slot preservation.
- Position badges, player status badges, selected/disabled/interactive states, hover/focus glow.
- Shared desktop/mobile row mechanics and no-overflow defaults.

Feature screens own:

- Sorting, filtering, scoring, projections, trade valuation, and route state.
- Contextual metrics such as rank, season points, projected points, KTC value, owner, matchup, trend, or actions.
- Section-specific column templates passed into the shared row.

Do not re-create local luminance helpers, team-gradient helpers, headshot fallback logic, status badge contrast, or selector button styles in feature components. Extend the shared files instead.

## Scrollable Rails And Cues

Use `useHorizontalScrollCue` with `HorizontalScrollCue` for overflowing tab rails, selector rails, and dense mobile control rows. The cue should be positioned in the same shell that defines the rail's visual width.

For full-bleed mobile rails, the shell must share the rail's negative margin or full-bleed width. Do not mount the cue inside a narrower parent while the scroll rail bleeds to the viewport edge; the cue will stop early and text can remain visible beside the arrow.

When changing cue layout, keep a Playwright geometry assertion that compares the cue's rendered edge with the scroll rail's rendered edge. The cue should cover the actual right/left edge, not merely be visible.

## Player Row Pattern

Use `CompanionPlayerRow` for player rows in:

- Companion Roster
- Companion League
- Companion Rankings
- Companion Waiver
- Companion Matchup player rows
- Heatmap player drilldown/performer lists
- Trade roster picker, roster browse, and Upgrade Finder mover rows

Keep proposal sports-card visuals separate; those are intentionally card-shaped, not selector rows.

Preferred shape:

```jsx
<CompanionPlayerRow
  player={player}
  darkMode={darkMode}
  interactive
  onClick={onSelect}
  metaSegments={[player.position, player.team]}
  gridTemplate="44px minmax(0, 1fr) 44px auto"
  columnGridTemplate="72px 58px 58px"
  columns={[
    <StatusOrContext key="status" />,
    <CompanionPlayerMetric key="season" value={season} />,
    <CompanionPlayerMetric key="avg" value={avg} />,
  ]}
/>
```

Use explicit `gridTemplate` and `columnGridTemplate` values when a screen has fixed metric columns. Avoid relying on implicit CSS grid placement for logos, statuses, or metrics.

## Contrast And Badges

Team gradients are not uniform. Text can be readable on the left side of a row and unreadable on the right side, or vice versa.

- Use `CompanionPlayerMetric` for metric values; it reads the row's value-side contrast variables.
- Use `PlayerStatusBadge` for player availability/injury statuses inside shared rows. Pass `compact` in mobile/limited-width slots so labels come from `src/utils/playerAvailabilityStatus.js` (`Questionable` → `Q`, `Injured Reserve` → `IR`, etc.). Use `CompanionPlayerStatus` only for generic contextual chips such as `ROSTERED`, `HOT`, or selected-state labels.
- Use `CompanionPlayerLocalContrastText` for custom overlay text such as `ROSTERED`.
- Do not hardcode `var(--color-label)`, semantic red/green/orange, or team accent colors for text that sits on a team gradient unless the component intentionally opts out of local contrast.

The local contrast hook measures the element's actual rendered position in `.companion-player-row`, including viewport/layout changes, and chooses the row's start/mid/end foreground. This is required for desktop and mobile because the same badge can render in different gradient regions.

## Logo And Avatar Slots

Never hide failed image loads with `display: none` inside grid rows. Removing an image removes its grid slot and can collapse the identity column.

`CompanionPlayerRow` preserves:

- Avatar slot with fallback initials when the player headshot fails.
- Team logo slot with a spacer when the logo fails or is absent.

When a section needs aligned team logos, keep logos in the shared row logo slot or in a deliberately reserved column. Conditional labels such as `ROSTERED`, `HOT`, or status badges must not change the logo's horizontal position between rows.

## Desktop And Mobile

Desktop rows should reserve predictable columns for status/logo/metrics so missing data does not reshape the row. Mobile rows should keep the priority order tight: avatar, identity, highest-priority metric/status, and action.

For compact phones, it is fine to hide lower-priority logos or columns, but do not hide identity text before removing decorative chrome.

## Known Pitfalls

- Waiver rows with no projection or failed headshots must still preserve avatar, identity, logo, status, and metric columns.
- Rankings `ROSTERED` labels need local contrast and a reserved label slot so team logos align across rostered and unrostered rows.
- Player status badges can sit on any part of a gradient; they must use local contrast.
- Matchup score values and labels should use shared metric colors together, not separate hardcoded colors.
- Shared row CSS lives in `src/index.css`; do not add per-screen duplicate row systems unless the surface is intentionally not a selector/player row.
