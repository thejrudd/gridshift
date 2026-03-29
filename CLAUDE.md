# NFL Predictor — Project Memory

## Project Overview
- **Tech stack**: React 19 + Vite 7 + Tailwind CSS 3
- **Fonts**: Barlow Condensed (display/brand), Figtree (body/UI)
- **Dark mode**: `.dark` class on `<html>`
- **PWA**: vite-plugin-pwa + nginx in Docker
- **Active branch**: `main` — all work ships directly here
- **Current version**: v5.8.6

## Versioning Roadmap
- **v5.9** — Areas of Opportunity (Companion sub-tab: roster weakness analysis + trade/waiver CTAs)
- **v6.0** — Draft Coach (rookie scouting data, combine results, dynasty ADP)

---

## Design System — "Broadcast Editorial"

This system is fully implemented in main. All colors via CSS custom properties — never hardcoded Tailwind palette or hex values in components.

### Color Tokens
All defined as CSS custom properties in `src/index.css`. The `.dark` class on `<html>` swaps all values.

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

### Signature Accent Usage (`#F5B700` / `--color-signature`)
Decorative only: sidebar active border, season tab underline, progress bar fill, filter chip bg, bottom tab bar active icon/label. Never use as body text color. Text/icons placed ON a signature background use `--color-signature-fg` (`#0C0F14`).

### Key Conventions
- `font-size: 16px` on all inputs (prevents iOS auto-zoom)
- Safe area insets: `env(safe-area-inset-bottom)` on fixed bottom bars
- Motion: CSS animations, spring-curve easing `cubic-bezier(0.32, 0.72, 0, 1)`

---

## Navigation Architecture

### Layout Breakpoints
- `< 1024px` (lg): Mobile/tablet — bottom tab bar + sticky NavBar (44px)
- `≥ 1024px` (lg+): Desktop — left sidebar (240px) + full-width content area

### Sidebar / Tab Bar Visibility Pattern
```css
.app-sidebar { display: none; }
@media (min-width: 1024px) { .app-sidebar { display: flex; } }
/* Bottom tab bar / NavBar: inverse of above */
```

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

- **Backdrop**: `fixed inset-0 z-50 flex items-center justify-center` with `background: rgba(0,0,0,0.5)`
- **Container**: `rounded-2xl` (not `rounded-t-2xl`), `w-full mx-4`, `maxWidth` as needed
- **Body scroll lock**: `document.body.style.overflow = 'hidden'` on mount; cleanup with `return () => { document.body.style.overflow = ''; }`
- Scrollable content goes in the **inner** content div (`overflow-y-auto`), not the outer container
- Close on backdrop click (`onClick={onClose}`); stop propagation on inner div

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

---

## Scoring Call Sites

When making any change to scoring logic (new fields in `DEFAULT_SCORING`/`STAT_TO_SCORING_KEY`, position bonuses, new Sleeper stat keys), audit every location in this checklist:

### Core Engine (update first)
| File | What to check |
|---|---|
| `src/utils/scoringEngine.js` — `DEFAULT_SCORING` | Add new scoring field with `0.0` default |
| `src/utils/scoringEngine.js` — `STAT_TO_SCORING_KEY` | Map Sleeper weekly stat key → scoring key; add alias keys for variants |
| `src/utils/scoringEngine.js` — `SCORING_SETTINGS_ALIASES` | Map Sleeper `scoring_settings` key → internal key when they differ |
| `src/utils/scoringEngine.js` — `calcPoints` position block | Add position-specific bonus handling |
| `src/context/SleeperContext.jsx` | Verify startup re-derives from `league.scoring_settings` via `importLeagueScoring` |

### Projection / Analytics Engine (pass `position` everywhere)
| File | Function | What to check |
|---|---|---|
| `src/utils/projectionEngine.js` | `getDefenseStrength` | Both `calcPoints` calls must pass `player.position` |
| `src/utils/projectionEngine.js` | `getLeagueAvgPPG` | `calcPoints` call must pass `player.position` |
| `src/utils/projectionEngine.js` | `projectPlayer` | All three `calcPoints` calls must pass `pos` |
| `src/utils/projectionEngine.js` | `buildDefenseTable` | Default `valueFn` uses `(wEntry, position)` — verify new calls also pass position |
| `src/utils/projectionEngine.js` | `computePositionalRanks` | `calcPoints` must pass `p.position` |
| `src/utils/projectionEngine.js` | `getAvgPPG` | Verify signature passes position through to `calcPoints` |

### Companion Tab Components
| File | What to check |
|---|---|
| `src/components/companion/CompanionRoster.jsx` | `calcPointsFromTotals` and `getAvgPPG` — both pass `p.position` |
| `src/components/companion/CompanionLeague.jsx` | `calcPointsFromTotals` and `getAvgPPG` — both pass `p.position` |
| `src/components/companion/CompanionRankings.jsx` | `calcPointsFromTotals` — passes `p.position` |
| `src/components/companion/CompanionWaiver.jsx` | `calcPointsFromTotals`, `getRecentAvg`, inline `calcPoints` — all pass `pos` |
| `src/components/companion/CompanionMatchup.jsx` | `calcPoints` in weekly ranks loop and `enrichPlayer` — both pass `p.position`; `getAvgPPG` passes `p.position` |
| `src/components/companion/CompanionDefense.jsx` | `defenseScoredTable` getValue callback `(wEntry, pos)` — called as `getValue(wEntry, player.position)` |
| `src/components/companion/PlayerWeeklySheet.jsx` | `calcPoints` — passes `player?.position` |
| `src/components/companion/CompanionScoring.jsx` | `STAT_GROUPS` — add any new scoring field so it's visible in UI |
| `src/components/companion/CompanionTrade.jsx` — `ValuationInfoSheet` | Read new scoring settings fields; add `AdjustmentRow` entries; update KTC baseline list |

### Compare Tab Components
| File | What to check |
|---|---|
| `src/components/compare/CompareFantasyPanel.jsx` | `calcPointsFromTotals`, `getAvgPPG`, `getRecentAvg`, weekly `calcPoints` — all pass `pos` |
| `src/components/compare/CompareTradePanel.jsx` | `calcPointsFromTotals` — passes `position` in all 3 call sites |

### KTC Value Adjustments
| File | What to check |
|---|---|
| `src/utils/ktcApi.js` — `computeKtcMultipliers` | Add multiplier logic for any new scoring field that materially affects positional value |

**Before closing any scoring-related change:** grep for `calcPoints(` and `calcPointsFromTotals(` across the repo and verify every call site either (a) passes position or (b) is in a context where position is genuinely unavailable.

---

## Common Gotchas

### Ranked lists with search filters
Always compute rank (`i + 1`) on the full sorted list, then filter for display. Never derive rank after filtering — the rank number will reflect position in the filtered subset, not the true overall rank. Carry `rank` as a property on each item; render uses `item.rank`, not the map index.

### `productionAdjustedValue` null propagation
The early-return guard must be `return ktcVal` (not `return ktcVal ?? 0`). Returning `0` for players with no KTC match causes `fmtKtcValue(0)` to render "0" instead of "—", since `adjVal ?? it.val` only falls back on null/undefined, not `0`.
