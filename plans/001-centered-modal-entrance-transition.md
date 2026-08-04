# 001 — Add centered-modal entrance transitions

- **Status**: TODO
- **Commit**: `8792ea7`
- **Severity**: MEDIUM
- **Category**: Missed opportunities; accessibility; cohesion & tokens
- **Estimated scope**: 2 files, about 45 lines

## Problem

GridShift's shared centered-dialog primitive mounts at its final visual state.
That makes occasional dialogs (Guide, display settings, welcome, What's New,
player detail, and trade dialogs) appear abruptly even though the mobile-sheet
variant already has a deliberate entrance and interactive dismiss behavior.

```jsx
// src/components/Modal.jsx:145 — current centered-dialog branch
return (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center p-4"
    style={{ background: 'rgba(0,0,0,0.5)' }}
    onClick={onClose}
  >
    <div
      className={`modal-panel w-full rounded-2xl overflow-hidden ${containerClassName}`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      style={{ background: 'var(--color-bg-secondary)', ...containerStyle }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  </div>
);
```

```css
/* src/index.css:8767 — current */
.modal-panel {
  background: var(--color-bg-secondary);
}
```

The task is intentionally limited to **entrance** motion. Most children invoke
their parent-owned `onClose` callback directly, which unmounts the dialog in
the same React update. A uniform exit transition would require a separate
presence API and coordinated changes across 24 call sites; do not add a partial
or inconsistent exit animation in this plan.

## Target

For every non-`mobileSheet` use of `Modal`, fade the scrim and fade/scale the
centered panel from `scale(0.97)` to `scale(1)` when it mounts. The panel stays
centered (`transform-origin: center`). Motion must use only `opacity` and
`transform`, must not delay focus or interaction, and must leave the existing
mobile-sheet animation, drag, velocity dismissal, and exit behavior untouched.

```css
/* target additions in src/index.css */
:root {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
}

.modal-overlay--centered {
  opacity: 1;
  transition: opacity 200ms var(--ease-out);
}

.modal-panel--centered {
  opacity: 1;
  transform: scale(1);
  transform-origin: center;
  transition: opacity 200ms var(--ease-out), transform 200ms var(--ease-out);
}

.modal-overlay--centered[data-entering='true'],
.modal-panel--centered[data-entering='true'] {
  opacity: 0;
}

.modal-panel--centered[data-entering='true'] {
  transform: scale(0.97);
}

@media (prefers-reduced-motion: reduce) {
  .modal-overlay--centered {
    transition: opacity 120ms var(--ease-out);
  }

  .modal-panel--centered {
    transform: none;
    transition: opacity 120ms var(--ease-out);
  }

  .modal-panel--centered[data-entering='true'] {
    transform: none;
  }
}
```

```jsx
// target pattern in src/components/Modal.jsx
const [isEntering, setIsEntering] = useState(true);

useEffect(() => {
  const frame = window.requestAnimationFrame(() => setIsEntering(false));
  return () => window.cancelAnimationFrame(frame);
}, []);

// Apply only in the non-mobileSheet branch:
// overlay: className="modal-overlay modal-overlay--centered ..."
// panel:   className="modal-panel modal-panel--centered ..."
// both:    data-entering={isEntering ? 'true' : 'false'}
```

The `requestAnimationFrame` creates a real initial rendered state before the
transition target is applied. Use it instead of a mount keyframe so a rapid
mount/unmount does not restart an animation from zero.

## Repo conventions to follow

- GridShift is a crisp, information-dense dashboard. Motion is reserved for
  occasional state changes and uses a strong responsive curve rather than
  bounce or decorative stagger.
- The existing mobile-sheet path in `src/components/Modal.jsx:102-143` is
  deliberately separate. Its current entrance is
  `sheet-slide-up 240ms cubic-bezier(0.32, 0.72, 0, 1)` and its drag-dismiss
  transition is set inline. Do not alter that branch.
- `src/index.css:8934-8946` already keeps a `prefers-reduced-motion` decision
  adjacent to modal styles. Put the centered-dialog reduced-motion override in
  the same modal CSS area.
- Add `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` once in the existing `:root`
  token block near the top of `src/index.css`; do not hand-type the curve at
  each rule or introduce a motion library.

## Steps

1. In `src/index.css`, add exactly this token inside the existing `:root` block:

   ```css
   --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
   ```

2. In the modal styles beside `.modal-panel` in `src/index.css`, add the target
   `.modal-overlay--centered` and `.modal-panel--centered` rules shown above.
   They must animate only `opacity` and `transform`, use `200ms`, and use
   `var(--ease-out)`. Do not use `transition: all`, keyframes, blur, layout
   properties, or a scale below `0.97`.

3. In that same modal CSS area, add the exact `@media (prefers-reduced-motion:
   reduce)` block shown above. It must retain the 120ms opacity transition and
   remove scale movement; it must not set `transition: none`.

4. In `src/components/Modal.jsx`, add `isEntering` state alongside the existing
   drag/dismiss state, plus the one-frame `useEffect` shown in the Target
   section. `useEffect` and `useState` are already imported. Cancel the frame
   during cleanup.

5. Change only the non-`mobileSheet` return branch in `src/components/Modal.jsx`:

   - Add `modal-overlay modal-overlay--centered` to the overlay class list
     while preserving its existing positioning utilities and click handler.
   - Add `modal-panel--centered` to the panel class list while preserving
     `modal-panel`, width, rounding, overflow, caller-provided class name,
     inline style merge, ARIA attributes, and click propagation stop.
   - Set `data-entering={isEntering ? 'true' : 'false'}` on both elements.

6. Confirm that neither the `if (mobileSheet)` branch nor its inline
   `animation`, `transform`, `transition`, pointer handlers, dismiss timer, or
   history behavior changed. Also leave the custom league switcher in
   `src/App.jsx:1958-2007` out of scope; it does not use `Modal` and should not
   receive a one-off implementation in this shared-component plan.

## Boundaries

- Do NOT modify `src/App.jsx`, any individual modal content component, modal
  callers, or the existing mobile-sheet path.
- Do NOT add dependencies, a JS animation library, a global `transition: all`,
  keyframes, `filter`, `width`, `height`, `margin`, `top`, or `left` animation.
- Do NOT add an exit transition. Parent callbacks currently unmount directly;
  building a presence lifecycle is separate scoped work.
- Do NOT touch the unrelated existing worktree changes in `TO_DO.md`,
  `docs/Draft Assistant.md`, `src/components/draft/DraftAssistant.jsx`, or
  other portions of `src/index.css`.
- If the cited code no longer matches commit `8792ea7`, stop and report the
  drift instead of improvising.

## Verification

- **Mechanical**:

  ```sh
  npm run build
  ```

  Expect a successful Vite production build with no new CSS or React errors.

- **Feel check**: run the app and open the Guide, Display settings, and a
  player-detail dialog. Confirm each dialog and scrim arrive promptly, the
  panel only moves from `scale(0.97)` to `scale(1)`, and it remains usable as
  soon as it is visible.

- **Mobile-sheet regression check**: at a viewport below 1024px, open the
  Options action sheet. Confirm it still rises from the bottom over 240ms,
  tracks the drag handle directly, returns to rest after a short drag, and
  dismisses with its existing velocity/distance behavior.

- **Slow-motion check**: in browser DevTools Animations, set playback to 10%.
  The centered panel should fade and settle from 0.97 without bounce, overshoot,
  blur, or layout movement. Rapidly open and close a centered modal several
  times; every new mount should begin cleanly from the same initial state.

- **Reduced-motion check**: emulate `prefers-reduced-motion: reduce` in the
  Rendering panel. Reopen the same dialogs and verify the panel no longer
  scales but both panel and scrim still fade for 120ms.

- **Done when**: all non-mobile-sheet uses of `Modal` get the shared entrance;
  all mobile sheets behave exactly as before; and the only new motion values
  are `200ms`/`120ms`, `scale(0.97)`, and
  `cubic-bezier(0.23, 1, 0.32, 1)` through `--ease-out`.
