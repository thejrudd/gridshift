# Conventions And Gotchas

Back: [[Home]]

This page captures the repo rules that are easiest to violate during normal edits.

## Versioning Workflow

- Do not auto-commit.
- Do not auto-bump versions.
- Do not update the tracked versioning files unless the user explicitly asks for versioning or commit work.

## Styling Rules

- Use CSS custom properties from `src/index.css`.
- Do not hardcode Tailwind palette colors or ad hoc hex values in components.
- Dark mode is controlled by the `.dark` class on `<html>`.
- Signature color is decorative, not general body text color.

## Layout Rules

- Desktop shell is sidebar + content area.
- Mobile/tablet shell is top nav + bottom tab bar.
- Keep modals center-aligned unless the UI is intentionally an action sheet.

## Ranking Gotcha

- Compute rank on the full sorted list first.
- Filter after rank is assigned.
- Render `item.rank`, not the filtered map index.

## Scoring Change Rule

- If scoring changes, start in `src/utils/scoringEngine.js`.
- Then audit every scoring call site listed in `AGENTS.md`.
- Before closing the change, grep for `calcPoints(` and `calcPointsFromTotals(` and verify position handling.

## KTC Null Handling Gotcha

- `productionAdjustedValue` must early-return `ktcVal`.
- Do not replace that with `ktcVal ?? 0`, or missing matches will render as `0` instead of `-`.

## App Structure Reality

- `src/App.jsx` behaves like the router.
- Navigation is state-driven and conditionally rendered, not route-driven.
- Cross-feature jumps often originate in `App.jsx`.

## State Risk Areas

- `src/context/SleeperContext.jsx` has the widest blast radius.
- `src/context/PredictionContext.jsx` can create subtle sync regressions.
- `src/utils/scoringEngine.js` changes can cascade into Companion, Compare, and KTC adjustments.

## Documentation Expansion Ideas

- Split each major feature into its own note.
- Add one note per risky subsystem, such as scoring or Sleeper enrichment.
- Add sequence diagrams for flows like league connection, player data fetch, and trade valuation.
