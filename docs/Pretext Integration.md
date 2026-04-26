# Pretext Integration

Back: [[Home]]

This note captures where Pretext could fit into GridShift later, without assigning it to a specific planned version yet.

## What It Is

Pretext is a pure JavaScript/TypeScript text-measurement and layout library. It can measure multiline text without DOM reflow, and it can lay text out for DOM, Canvas, SVG, and eventually server-side rendering.

Source: [`chenglou/pretext`](https://github.com/chenglou/pretext)

## Relevant Capabilities

- Measures paragraph height without `getBoundingClientRect` / `offsetHeight`
- Supports `prepare()` + `layout()` flow for fast repeated sizing after one-time preprocessing
- Handles multilingual text, emojis, and mixed bidirectional text
- Supports `whiteSpace: 'pre-wrap'` for textarea-like content
- Can return line lists with `layoutWithLines()` and `walkLineRanges()`
- Designed to avoid browser layout reflow during text measurement
- Useful for canvas/SVG rendering paths as well as DOM-based layout decisions

## Potential GridShift Uses

- Dynamic sizing for Trade proposal cards so text-heavy cards can grow without overflow
- Measuring Trade/Upgrades/Intelligence explanation copy before rendering, to keep cards proportionate
- Better width/height decisions for draft cards, player cards, modal content, and stat summaries
- Precomputing text heights for mobile layouts where line breaks matter more than on desktop
- Building smarter truncation or wrap rules for dense tables like player stat boxes and compare views
- Supporting future export surfaces where card dimensions need to be known before rendering screenshots or shareables
- Helping any future masonry/grid layouts keep consistent row heights without relying on DOM reads

## Technical / UX Fit Considerations

- Strongest fit is for layout measurement, not for visual rendering itself
- The app already has several card-heavy surfaces, so a deterministic text measurement layer could reduce overflow bugs
- It pairs well with the current Trade card work because those cards already depend on equal-height and responsive width behavior
- It could also help with future `v6.1` drilldowns by measuring modal copy and stat blocks before render
- Since it uses the browser font engine as the source of truth, it should match real UI rendering better than heuristic text estimation

## Risks / Unknowns

- It does not solve layout design on its own; it only gives better text metrics
- The library depends on font availability and correct font loading, so we would need to verify behavior with Barlow Condensed and Figtree in this app
- We would need to confirm that it behaves consistently across Safari, Edge, and mobile browsers
- It adds another abstraction to a problem the app can sometimes already solve with CSS and `ResizeObserver`
- If overused, it could become a substitute for simpler responsive CSS where text measurement is not actually needed

## Recommendation

Treat Pretext as a likely utility layer for future card sizing and overflow control.

Best near-term uses for GridShift would be:

- measuring Trade proposal card text before rendering
- keeping draft/player cards proportionate when copy length varies
- improving modal and comparison layouts that need predictable text height

If the Trade suite keeps expanding in complexity, Pretext is a strong candidate for a shared text-measurement helper instead of ad hoc DOM-based sizing logic.
