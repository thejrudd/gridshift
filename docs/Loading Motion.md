# Loading Motion

Back: [[Home]]

This is the source-of-truth note for how GridShift surfaces arrive: what a
placeholder does while it waits, when it is allowed to appear, how it gives way
to real data, and how the real rows enter.

It exists so the knobs have names. If you come back in six months wanting "the
thing that controls how fast the rows cascade in", it is **stagger**, it lives in
`src/index.css` as `--gs-load-stagger`, and the glossary below says what it does.

The profile currently shipped is the one signed off in the *Rankings Loading —
Tweaks* motion study. Rollout so far is **Fantasy only** — every other section
still uses its own ad-hoc loading treatment. See [Rolling Out To Other
Sections](#rolling-out-to-other-sections).

## Canonical Files

- `src/index.css` — the `--gs-load-*` tokens (top of `:root`), the `.gs-skeleton`
  texture variants, the `.gridshift-reveal*` entrance family, and the
  `.gs-loadswap*` handoff rules. **CSS is authoritative for anything CSS uses.**
- `src/utils/loadingMotion.js` — the JS mirror of the same profile, plus the
  helpers for things CSS cannot express (`revealIndex`, `revealDelay`,
  `revealTotalDuration`, `loadingMotionAttrs`).
- `src/hooks/useLoadingReveal.js` — the timing gate. Owns *show after* and
  *minimum hold* and produces the phase a surface renders.
- `src/components/ui/LoadingSwap.jsx` — `LoadingSwap` (skeleton → content),
  `RevealList` (entrance with no skeleton), `SkeletonRows` (default placeholder
  body).
- `src/components/ui/Skeleton.jsx` — the placeholder shapes themselves.
- `src/components/ui/SectionSkeleton.jsx` — the Suspense fallback every lazy
  route mounts behind.
- `tests/unit/loadingMotion.test.mjs` — fails the build if the CSS tokens and the
  JS mirror drift apart.

## Glossary

Every one of these is a named token. Change it in **both** `src/index.css` and
`src/utils/loadingMotion.js`; the unit test enforces that you did.

| Knob | Token | JS key | Shipped | What it means |
| --- | --- | --- | --- | --- |
| **Duration** | `--gs-load-duration` | `duration` | `500ms` | How long *one row's* entrance animation runs, start to settled. Not the length of the whole list arriving — that is duration plus the last row's stagger. |
| **Stagger** | `--gs-load-stagger` | `stagger` | `20ms` | The gap between one row starting and the next one starting. Row N begins at N × stagger. `0` makes the whole list arrive as one beat. Tight on purpose: the cascade should read as a single motion sweeping down the list, not as rows queueing up. Much past ~40ms it starts to feel laboured, and a long list begins to look like it is buffering. |
| **Stagger cap** | `--gs-load-stagger-cap` | `staggerCap` | `7` | The row index past which delay stops growing. Rows beyond it are below the fold on open, and letting them keep trickling means the reveal is still running after the user has started reading. Every row past the cap shares the cap's delay — it caps the *delay*, not the animation. Skipping the tail entirely leaves a long list sitting there fully painted while only the top eight fade in, which reads as slow and artificial. |
| **Easing** | `--gs-load-ease` | `easing` | `broadcast` | The speed curve of the entrance. `broadcast` — `cubic-bezier(0.32, 0.72, 0, 1)` — is the app standard and the same curve every other GridShift transition uses. Named alternates ship unused: `--gs-load-ease-overshoot` (springy, settles past its target), `--gs-load-ease-decelerate` (fast start, long glide), `--gs-load-ease-standard` (Material's neutral curve). |
| **Entrance** | `[data-gs-entrance]` | `entrance` | `lift` | The *gesture* a row uses to arrive. `lift` rises ~9px while fading in. `fade` is opacity only. `wipe` uncovers left to right. `scale` settles up from 96.5%. `slide` enters from the left. |
| **Order** | *(JS only)* | `order` | `top-down` | Which row goes first. `top-down`, `bottom-up`, or `center-out` (middle row leads, pairs either side share a beat). This is an index transform, not a CSS property, so it is applied by `revealIndex()` and handed to CSS as `--gs-reveal-index`. The auto-stagger container is always top-down. |
| **Texture** | `[data-gs-texture]` | `texture` | `sweep` | What a placeholder *does* while it waits. `sweep` runs a highlight across the shape. `pulse` breathes the whole shape. `build` wipes a fill in from the left each cycle. `static` is a flat fill with no animation — also the reduced-motion resting state for all four. |
| **Texture speed** | `--gs-load-texture-duration` | — | `1600ms` | One full cycle of whichever texture is playing. |
| **Show after** | `--gs-load-show-after` | `showAfter` | `120ms` | How long a surface stays as bare structure before *any* placeholder appears. A load that finishes inside this window never flashes one — this is the knob that stops a fast tab switch from strobing. |
| **Minimum hold** | `--gs-load-min-hold` | `minimumHold` | `240ms` | Once a skeleton *has* appeared it stays at least this long. Without it, a load that resolves a frame after the show-after timer produces a 16ms flicker. Show-after and minimum hold are a pair: the first prevents a flash, the second prevents a strobe. |
| **Coalesce gate** | `--gs-load-gate` | `coalesceGate` | `90ms` | Grace period after the first data fragment lands. Anything arriving inside it reveals on the same clock; anything later comes in as its own quiet second wave rather than holding the whole list back. Declared and documented; no Fantasy surface currently has enough independent fragments to need it — see [Not Yet Wired](#not-yet-wired). |
| **Handoff** | `[data-gs-handoff]` | `handoff` | `row-by-row` | How the skeleton gives way to the content replacing it. `cut` drops it on the frame content mounts. `cross-fade` fades the whole placeholder block out underneath the arriving rows. `row-by-row` dissolves each placeholder row exactly as its own real row lifts in, so the list converts itself top to bottom. |
| **Handoff fade** | `--gs-load-handoff-fade` | `handoffFade` | `300ms` | How long the outgoing skeleton stays mounted, overlaying the content, during a `cross-fade` or `row-by-row` handoff. |
| **Rails** | `.gridshift-reveal--rails` | `rails` | *off in Fantasy* | The accent bar down a row's leading edge grows from nothing a beat after the row itself starts, so the team colour lands as its own gesture. `--gs-load-rail-duration` / `--gs-load-rail-delay` control it. Not enabled in Fantasy — see [Known Limits](#known-limits). |
| **Count up** | — | `countUp` | `false` | Whether numeric values tick up to their value on arrival. Deliberately off: on data-dense fantasy rows, six numbers all counting at once reads as instability rather than liveliness. |

## Fill Mode — Why It Is `backwards`

This is the one implementation detail worth knowing before touching the CSS,
because getting it wrong produces a bug that looks like a rendering glitch.

The obvious way to write a staggered entrance is `opacity: 0` on the element
plus `animation-fill-mode: forwards`. That works, and it is wrong: it hands the
element's *final, resting* appearance to an animation, which then has to stay
alive forever to keep holding it. Every row in the list keeps a live filling
animation, and any frame that re-creates or drops one paints that row at its
base style — `opacity: 0`. On a long list, style recalc walks the rows in
document order, so the result is a flicker cascading down the page after the
load has visibly finished. It was most obvious in Rankings, which renders 100
rows. Rosters uses the same direct-child reveal structure: position headings and
player rows each enter as their own item, so the list has enough beats to read
as a cascade.

`backwards` inverts the ownership. The element's own resting style is already
correct, the animation only supplies the from-state during its delay, and it
releases cleanly when it ends. Nothing is left holding the row's appearance.

The rule, which `tests/unit/loadingMotion.test.mjs` enforces: **entrance
animations fill `backwards` and never set a base `opacity: 0`.** Exits are the
opposite case — `.gs-loadswap__skeleton` handoffs end at `opacity: 0` and do
need to keep holding it, so those keep `both`.

This is also why the stagger cap caps the *delay* and not the animation. It is
tempting to skip the off-screen tail of a long list entirely — it is cheaper —
but it leaves ninety rows sitting there fully painted while only the top eight
fade in, and the reveal reads as slow and artificial rather than as one motion.
Every row animates; rows past the cap just share its delay. With the fill mode
corrected they release as soon as they finish, so nothing is retained.

## Phases

`useLoadingReveal()` turns a boolean `loading` into one of three phases. A
surface renders all the chrome it can in every phase — the study's core finding
is that **structure should be present from the first frame** and only
unhydrated *values* should shimmer.

| Phase | What is on screen |
| --- | --- |
| `structure` | Real chrome only: tabs, filters, sort headers, rank numbers, column labels. A load that resolves inside *show after* never leaves this phase. |
| `skeleton` | Placeholders are up, held for at least *minimum hold*. |
| `content` | Real rows are mounted and entering on the stagger. `isHandingOff` stays true for *handoff fade* so the outgoing skeleton can dissolve under them. |

## How To Wire A Surface

Most surfaces need one component and no state of their own. The defaults *are*
the signed-off profile — passing nothing is the correct call.

```jsx
import LoadingSwap, { SkeletonRows } from '../ui/LoadingSwap.jsx';

<LoadingSwap
  loading={rowsPending}
  resetKey={`${leagueId}:${season}`}
  skeleton={<SkeletonRows count={6} height="3.5rem" />}
>
  {rows.map(row => <Row key={row.id} {...row} />)}
</LoadingSwap>
```

Rules that matter:

- **One element per row at the top level.** Children become the reveal's direct
  children. A fragment wrapping several rows reveals them as a single beat.
- **`loading` means "there is nothing to show yet"**, not "a request is in
  flight". Once rows exist, a background refresh must keep them on screen and
  hydrate cells in place; dropping a populated list back to placeholders is the
  worst thing this system can do.
- **`resetKey` is what replays the reveal.** Give it whatever a navigation
  changes — the week, the league, the selected roster — or the list only ever
  animates on first mount.
- **`RevealList`** is the same entrance with no skeleton, for surfaces whose rows
  are already in hand when they mount.
- Keep the placeholder's row count and height close to the real rows. The
  row-by-row handoff lines the two layers up by index, so a placeholder list of
  three against a content list of twenty converts unevenly.

### Non-default profiles

```jsx
<LoadingSwap entrance="fade" texture="pulse" handoff="cross-fade" ... />
```

`loadingMotionAttrs()` only emits an attribute when it differs from the default,
so a surface that passes the shipped value stays on the token and follows any
future retune automatically.

## Rollout Status

### Wired

| Surface | File | Treatment |
| --- | --- | --- |
| Rankings | `src/components/companion/CompanionRankings.jsx` | Full skeleton → reveal. Consolidated the two separate ad-hoc skeleton blocks (scoring-mode and ADP-mode) into one gate. |
| Rosters | `src/components/companion/CompanionLeague.jsx` | Full skeleton → reveal. Position headings and player rows are individual reveal items, so the roster cascades in the same readable sequence as Rankings. |
| Waivers | `src/components/companion/CompanionWaiver.jsx` | Full skeleton → reveal. The existing centered "Preparing waiver options…" copy is retained *above* the placeholder rows rather than instead of them. |
| Injuries | `src/components/companion/CompanionInjuries.jsx` | Full skeleton → reveal, replacing the "Loading injury report…" empty state. |
| Defenses | `src/components/companion/CompanionDefense.jsx` | Full skeleton → reveal, and restructured to be structure-first: the table frame and its sort headers now render during loading instead of being replaced by a centered message. |
| Heatmap | `src/components/companion/CompanionHeatmap.jsx` | Skeleton → reveal on the **`fade`** entrance, not `lift`. See [Known Limits](#known-limits). |
| Matchups | `src/components/companion/CompanionMatchup.jsx` | Structure-first skeleton (`MatchupSkeleton`) replacing the old centred "Preparing matchup…" sentence, the masthead reveal below, and `RevealList` on the head-to-head starter rows. All keyed by league/season/week/opponent so every week change replays them. |
| All lazy Fantasy routes | `src/components/ui/SectionSkeleton.jsx` | The Suspense fallback holds itself invisible for *show after* and then fades up, so a chunk that resolves inside that window paints no placeholder at all. This is show-after implemented in pure CSS, because a Suspense fallback cannot be delayed from outside. |
| Every existing `.gs-skeleton` | `src/index.css` | All placeholders app-wide now read the texture tokens. This is the one part of the change that is not Fantasy-scoped — the primitive is shared. |
| Matchup drilldowns | `src/index.css` | The pre-existing `.gridshift-reveal` block (preview panel, team score breakdown, player drilldown, player compare) was refactored onto the tokens. Its computed values are unchanged — it was already 500ms / 70ms / broadcast — so those surfaces look identical but now follow a retune. |

### The Matchup Masthead

The matchup page borrows the drilldowns' reveal vocabulary rather than the
list stagger, because it is one composed graphic and not a list of rows. Adding
`.gridshift-reveal` to the masthead `<section>` scopes these:

- The two team panels **wipe inward from their own outer edge** — `is-mine`
  from the left, `is-opponent` from the right — the same gesture the player
  compare sheet's dual heroes use.
- The **VS axis** between them opens from the centre on the `seam` keyframe.
- The **win-chance bar** grows outward from the seam: each half is a grid cell
  sized by percentage, so it cannot animate to a keyframe width and grows on
  `scaleX` anchored to the split instead. The bar opens from where the two
  shares meet rather than sweeping across it.
- The **seam marker and the percentage labels** only fade, and only once the bar
  has settled. The marker carries a centring translate of its own, so animating
  its transform would fight its positioning — the same rule the drilldown's
  rank markers follow.

The masthead is keyed on league/season/week/opponent, so the whole gesture
replays on every navigation rather than only on first mount.

While the matchup is preparing, `MatchupSkeleton` stands in: the same masthead
score grid, the same win-probability strip, and nine head-to-head row shapes on
the real slot template. It carries `.gs-section-skeleton`, so it inherits the
SHOW AFTER delay in pure CSS and a matchup that prepares quickly paints no
placeholder at all.

### Known Limits

These are the "implementation issues between tabs" the rollout hit. None are
bugs; each is a place where the study's setting does not survive contact with
the shipped markup.

- **Heatmap cannot use the `lift` entrance.** The grid scrolls under sticky week
  headers and a sticky team column. A transform-based entrance makes the
  animating wrapper the containing block for those sticky descendants for the
  length of the reveal, which unsticks them mid-animation. `fade` is opacity
  only and does not create a containing block, so Heatmap runs `entrance="fade"`.
  Any future surface with sticky descendants inside the revealed subtree needs
  the same treatment.
- **"Team rails grow" is not enabled anywhere in Fantasy.** The study animates a
  4px accent element on the leading edge of each row. The shipped
  `CompanionPlayerRow` draws that accent as an `inset box-shadow` on the row
  itself, not as a child element, and a box-shadow cannot be scaled. Turning it
  on means restructuring the shared row primitive — a change to
  [[Companion Shared Rows]] with blast radius across Companion *and* Trade, which
  is out of proportion to a second-beat colour gesture. The knob is built and
  documented (`.gridshift-reveal--rails` + a `.gs-reveal-rail` child element) and
  works for any surface that renders its rail as a real element.
- **Live is not wired.** `CompanionLive` is a realtime surface with its own
  documented motion language (`--fl-*`), a session gate rather than a data load,
  and no skeletons today. Arrival motion for a feed that is continuously
  updating is a different design question from arrival motion for a list that
  loads once. See [[Fantasy Live]].
- **Scoring is not wired.** It is a settings surface. Its loading states are
  per-control spinners on individual actions, not a list arriving; there is
  nothing for a staggered reveal to act on.

### Not Yet Wired

- **Coalesce gate.** The token is declared and the concept is documented, but no
  Fantasy surface currently loads enough genuinely independent fragments for the
  gate to change anything — each tab has effectively one arrival. It becomes
  real the moment a surface merges, say, Sleeper rosters with a provider stat
  feed and a projection call on separate clocks. `revealTotalDuration()` is the
  helper for deciding when the coalesced reveal has settled.

## Rolling Out To Other Sections

The system is deliberately section-agnostic; nothing in it is Fantasy-specific.
To extend it to Statistics, Trade, Draft, Predictions, or Scout:

1. **Nothing to build.** The tokens, the hook, and `LoadingSwap` are already
   global, and `.gs-skeleton` already reads the texture tokens app-wide.
2. **Find each surface's real "nothing to show yet" flag.** This is the only
   genuinely per-surface judgement, and the one that is easy to get wrong — see
   the `loading` rule under [How To Wire A Surface](#how-to-wire-a-surface).
3. **Check for sticky or fixed descendants inside the revealed subtree** before
   using the default `lift`. If there are any, use `entrance="fade"`. This is the
   single most likely way to break a page; Heatmap already hit it.
4. **Make the surface structure-first** where it early-returns a centered loading
   message today. Defenses in this pass is the worked example of that conversion.
5. **Match placeholder row count and height to the real rows**, so the
   row-by-row handoff converts evenly.
6. **Never write `opacity: 0` + `forwards`** if you add a new entrance keyframe.
   See [Fill Mode](#fill-mode--why-it-is-backwards) — the unit test will catch
   it, but the failure it prevents is worth understanding first.
7. **Retune globally, not locally.** If a section wants a different feel, reach
   for the named alternates (`entrance`, `texture`, `handoff`) before adding a
   new token. A new token means a new row in the glossary above and a new
   assertion in `tests/unit/loadingMotion.test.mjs`.

Surfaces with their own established motion language — Fantasy Live's `--fl-*`
block, the NFL play visuals — should be reconciled deliberately rather than
having this profile dropped on top of them.

## Accessibility

Every animation in this system is disabled under `prefers-reduced-motion:
reduce`: entrances, textures, handoffs, rails, and the section skeleton's own
delayed fade. Reduced motion resolves to the `static` texture and an instant cut
handoff. `LoadingSwap` sets `aria-busy` while loading and marks the placeholder
layer `aria-hidden`.

Show-after and minimum hold are also accessibility features, not just polish: a
placeholder that appears and vanishes inside 100ms is a flash, and flashing
content is a barrier before it is an aesthetic problem.
