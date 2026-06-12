# GridShift — Project Memory

## Project Overview
- **Tech stack**: React 19 + Vite 7 + Tailwind CSS 3
- **Fonts**: Barlow Condensed (display/brand), Figtree (body/UI)
- **Dark mode**: `.dark` class on `<html>`
- **PWA**: vite-plugin-pwa + nginx in Docker
- **Active branch**: `main` — all work ships directly here
- **Current version**: v7.3

## API Secret Handling
- Any BALLDONTLIE, CFBD/CollegeFootballData, or similar paid API key must be treated as a secret and must never be committed into the repo or exposed in the client bundle.
- If the project upgrades to a paid BALLDONTLIE or CFBD subscription, rotate the existing key and move all access behind a server-side or proxy boundary before production use.

## Versioning Roadmap
- **v6.0** — Trade Suite (shipped)
- **v7.0** — Draft Coach (rookie scouting data, combine results, dynasty ADP)

---

## Docs First

Prefer the docs folder for current architecture and implementation references instead of duplicating long guidance in this file.

- `docs/Home.md` — doc map / entry point
- `docs/Architecture Map.md` — current architectural layout and file ownership
- `docs/Where To Edit.md` — feature-to-file edit guide
- `docs/Design System Quick Ref.md` — key rules checklist and team color palette details
- `docs/Design Tokens.md` — full token table and design-system details
- `docs/Companion Shared Rows.md` — canonical Companion/Trade selector row rendering, team-gradient contrast, player row slots, badges, logos, and responsive row rules
- `docs/Scoring Call Sites.md` — full scoring audit checklist
- `docs/Trade Engine.md` — Trade engine architecture, explanation rules, and maintenance reference
- `docs/Trade Proposal Cards.md` — Trade proposal card sizing, content priority, and no-clipping rules
- `docs/Scout.md` — Scout tab architecture, APIs, CFBD importers, generated production data, Prospect Statistics modal data contracts, route integration, and real-data wiring checklist
- `QA_CHECKLIST.md` — manual QA flows; only open when explicitly doing QA or test validation

---

## Design System — "Broadcast Editorial"

All colors via CSS custom properties in `src/index.css` — never hardcoded Tailwind palette or hex values. The `.dark` class on `<html>` swaps all values. Full rules and team color palette details: **`docs/Design System Quick Ref.md`** — full token table: **`docs/Design Tokens.md`**

Critical rules (apply to every UI change):
- `--color-signature` (`#F5B700`) decorative only — never body text. Use `--color-signature-fg` for text ON signature backgrounds.
- `font-size: 16px` on all inputs (prevents iOS auto-zoom). Safe areas: `env(safe-area-inset-bottom)` on fixed bottom bars. Motion: `cubic-bezier(0.32, 0.72, 0, 1)`.
- Companion and Trade-adjacent player/asset selector rows must use the shared row system documented in `docs/Companion Shared Rows.md`. Do not recreate local team-gradient, logo/avatar fallback, status badge, selector button, or gradient contrast logic in feature files.
- Page-level unavailable, loading, or empty-route reason messages must be centered in the page as unframed text, matching the Companion Matchup empty-state pattern. Do not render page availability reasons as bordered cards or left-aligned panels; keep compact framed empty states only for inline list/table/filter results.

---

## Navigation Architecture

### Layout Breakpoints
- `< 1024px` (lg): Mobile/tablet — bottom tab bar + sticky NavBar (44px)
- `≥ 1024px` (lg+): Desktop — left sidebar (240px) + full-width content area

### State Variables
- `activeTab`: `'predictions'` | `'statistics'` | `'companion'` | `'compare'`
- `seasonView`: `'predictions'` | `'standings'` | `'playoffs'`
- `companionView`: `'roster'` | `'rankings'` | `'matchup'` | `'waiver'` | `'league'` | `'defense'` | `'trade'` | `'scoring'`

### Key Layout Files
- `src/App.jsx` — Two-panel shell
- `src/components/Sidebar.jsx` — 240px persistent desktop sidebar (lg+): brand, progress, nav, actions, version string
- `src/components/NavBar.jsx` — 44px sticky top nav (mobile/tablet only)
- `src/components/BottomTabBar.jsx` — Bottom tab bar (mobile/tablet, hidden lg+)

---

## Commit & Version Workflow

### Never auto-commit
Do NOT create commits, bump versions, or update any of the 6 tracked files unless the user explicitly asks. Mentioning a version number (e.g. "let's work on v5.9") means that's the version context — not a commit instruction. Only commit when the user says something like "commit this", "make a commit", or "bump the version".

**Why:** Auto-committing causes version creep and races ahead of planned roadmap milestones.

### 6-File Commit Checklist
On every commit that bumps the version, update ALL of these before committing:

1. **`CHANGELOG.md`** — Add a new version section with bullet points for all changes. New entries at the **bottom** (oldest first, newest last).
2. **`KNOWN_BUGS.md`** — Move fixed bugs from Open → Fixed with the correct version number; add any new bugs.
3. **`TO_DO.md`** — Remove completed items (see TO_DO workflow below).
4. **`package.json`** — Bump `"version"` to the new version number.
5. **`src/components/Sidebar.jsx`** — Update the hardcoded version string in the sidebar footer.
6. **`README.md`** — See README rules below.

After committing: do NOT run `git push` — the user pushes manually.

**Why package.json matters:** The version bump forces vite-plugin-pwa to regenerate the service worker precache manifest with a new revision hash, so browsers/PWA installs fetch the updated build instead of serving stale cache.

### CHANGELOG.md Rules
- Never use "Unreleased" as a section header — always assign changes to a specific version number, even if not yet released.
- If the version number is unclear, ask the user before writing the entry.

### GitHub Release Notes Format
- Whenever the user asks for release notes, provide them in Markdown format.
- When generating GitHub release notes, use Markdown with the release title as `# vX.Y[.Z] - Short Release Theme`.
- Organize notes in this order: `## New Features`, then `## Improvements`, then `## Bug Fixes`.
- Focus the notes on the changes included between the previous released version and the requested release tag/version.
- Keep bullets user-facing and grouped by feature area; avoid internal implementation detail unless it helps explain the release impact.

### Commit Message Rules
- Version/release commits must use a glance-able subject in this format: `vX.Y[.Z] - Short Release Theme`.
- Do not use generic subjects like `Release v6.3`; GitHub shows the subject in file history, so it must summarize what shipped.
- Include a commit body with a short summary sentence and a `Highlights:` list covering the major shipped changes.
- Keep the commit body aligned with `CHANGELOG.md`, `README.md` What's New, and the actual files changed.

### README.md Rules
- **Features section**: Major features only, one line each. Update when a new major feature ships. No bug fixes or minor polish.
- **What's New section**: Contains ONLY the most recently committed version. Replace the previous entry entirely — do not accumulate multiple "What's New" sections. Link to CHANGELOG.md for history.
- **Roadmap section**: Derived from TO_DO.md, but only major planned versions and significant blocked features. No backlog polish or unversioned experiments.

---

## Bug Tracking (KNOWN_BUGS.md)

- When a bug is identified (whether reported or found during work): add it to the **Open** section immediately, before fixing it.
- If the bug was previously in **Fixed**: move it back to Open and remove the "Fixed In" version note.
- Move a bug to **Fixed** at commit time, using the version number being committed. Never use "Unreleased".

---

## TO_DO.md Workflow

- File is `TO_DO.md` at project root (not `to-do list.md` or any other name).
- Versioned sections are **chronological — earliest version first**, latest version last.
- **Backlog (Unversioned)** section is always at the bottom.
- Whenever a new feature is requested or planned, add it to TO_DO.md in the appropriate version section or backlog immediately.
- Completed versions are **deleted entirely** from TO_DO.md — no strikethroughs, no "✓ Complete" stubs. They live in CHANGELOG.md.
- Before every commit: cross-check TO_DO.md against CHANGELOG.md, remove everything that has been shipped. The earliest entry in TO_DO.md should always be the next unshipped version.

---

## Modal Pattern

All modals must be center-aligned. Never bottom-sheet style unless it's a deliberate ActionSheet.

Use the shared `src/components/Modal.jsx` wrapper — it handles backdrop, scroll lock, centering, and stopPropagation automatically:

```jsx
<Modal onClose={onClose} containerClassName="max-w-lg" containerStyle={{ border: '1px solid var(--color-separator)' }}>
  {/* content */}
</Modal>
```

- `containerClassName` — Tailwind classes for the inner container (e.g. `max-w-3xl`, `flex flex-col`)
- `containerStyle` — inline styles (maxWidth, maxHeight, border, boxShadow, etc.)
- Scrollable content goes in an **inner** div with `overflow-y-auto`, not the Modal container itself
- Bottom-sheet / ActionSheet components use their own pattern (`rounded-t-2xl`, `fixed bottom-0`) — do not wrap with `Modal`

---

## Guide Content Style

Keep Guide content succinct, instructional, and not verbose.
- 1–2 sentences per step max
- Lead with what the feature does, follow with how to use it
- Skip background explanation; don't restate what the UI already shows
- 2–4 steps per tab is the right range

## Communication Preference

- Prefer plain-language labels over niche or non-standardized acronyms in UI copy.
- Avoid acronyms when they speed up communication at the expense of understanding.
- Do not load or reference `QA_CHECKLIST.md` during normal implementation work unless the task is explicitly about QA, testing, validation, or regression review.

---

## Scoring Call Sites

When making any change to scoring logic (new fields, position bonuses, new Sleeper stat keys), audit the full checklist in **`docs/Scoring Call Sites.md`**.

Quick summary: every `calcPoints()` and `calcPointsFromTotals()` call must pass `position`. Grep for these across the repo before closing any scoring PR.

---

## Trade Engine Maintenance

- Any change to Trade valuation, proposal generation, proposal selection/ranking, Upgrade logic, or Trade explanation wording must be reflected in `docs/Trade Engine.md` in the same pass.
- Prefer user-facing fantasy-football language in Trade UI; keep internal engine terms in the docs, not in explanation cards, unless clearly labeled.

---

## State Risk Areas

- `SleeperContext.jsx` has the widest blast radius — changes cascade into all Companion and Compare views.
- `PredictionContext.jsx` can create subtle sync regressions (opposing game results).
- `scoringEngine.js` changes cascade into Companion, Compare, and KTC adjustments.

---

## Common Gotchas

### Trade proposal card sizing
Detailed rules live in `docs/Trade Proposal Cards.md`. Any time proposal player or draft cards are resized, verify the fixed 5:7 ratio, single-line identity labels, desktop stat fit, mobile width caps, and equal-height syncing across a trade package.

### Ranked lists with search filters
Always compute rank (`i + 1`) on the full sorted list, then filter for display. Never derive rank after filtering — the rank number will reflect position in the filtered subset, not the true overall rank. Carry `rank` as a property on each item; render uses `item.rank`, not the map index.

### `productionAdjustedValue` null propagation
The early-return guard must be `return ktcVal` (not `return ktcVal ?? 0`). Returning `0` for players with no KTC match causes `fmtKtcValue(0)` to render "0" instead of "—", since `adjVal ?? it.val` only falls back on null/undefined, not `0`.

### Team logo alignment in grid rows
Before adding or changing Companion/Trade-adjacent player rows, read `docs/Companion Shared Rows.md`. Use `CompanionPlayerRow`, `CompanionAssetRow`, `CompanionSelectorControls`, `teamVisualTheme.js`, and `companionAssetVisuals.js` as the single source of truth for row visuals.

When team logos (or any element like "ROSTERED" badges) must sit immediately after a player name **and** be horizontally aligned across all rows, use this three-part pattern:

1. **Measure the longest name** with a canvas — `measureMaxNameWidth(players)` renders each name at the exact CSS font and returns the widest pixel width.
2. **Set the name column to `minmax(0, <measured>px)`** in `gridTemplateColumns`. This caps the column at the widest name so no names truncate, but allows it to shrink on narrow viewports.
3. **Put the logo/badge in a separate `auto` column**, and add a **`1fr` spacer column** between the logo and the stat columns to absorb leftover row width.

The `1fr` spacer is critical — without it, `minmax(0, Npx)` leaves unallocated space in the grid that pushes the logo toward the center instead of keeping it tight against the name. On compact phones, skip the measured column, the logo column, and the spacer entirely (use `minmax(0,1fr)` for the name and don't render the logo/spacer divs).

Reference implementations: `CompanionRankings.jsx` and `CompanionLeague.jsx`.
