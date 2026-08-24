# Open Pencil Integration

Back: [[Home]]

This note captures where Open Pencil could fit into GridShift later, without assigning it to a specific planned version yet.

## What It Is

Open Pencil is an open-source, Figma-compatible design editor that can open `.fig` and `.pen` files, work as a desktop app or PWA, and expose a programmable/headless toolkit for custom workflows. It also includes built-in AI assistance, real-time collaboration, export paths, and CLI tooling for inspecting, querying, linting, and converting design files.

Source: [`open-pencil/open-pencil`](https://github.com/open-pencil/open-pencil)

## Relevant Capabilities

- Opens and edits native Figma-style files (`.fig`) plus Open Pencil files (`.pen`)
- AI-assisted design creation and modification through a chat workflow with many available tools
- Headless CLI for inspection, XPath-style queries, linting, and export
- Vue SDK for embedding editor-like surfaces into custom apps
- Real-time P2P collaboration with cursors, presence, and follow mode
- Export to PNG, JPG, WEBP, SVG, `.fig`, JSX, and Tailwind-friendly HTML
- Auto layout and CSS Grid support, including gap, padding, alignment, and track sizing
- Runs as desktop app, browser app, and PWA

## Potential GridShift Uses

- Design system prototyping for future Trade and Companion UI changes before implementation
- Layout exploration for cards, modals, stepper flows, and dense data-heavy screens where proportion matters
- Rapid mockups for upcoming features like Trade detail drilldowns, Draft Coach player pages, or compare-style side-by-side panels
- Generating shareable design artifacts for review before code is written
- Exporting layout ideas into JSX or Tailwind-shaped markup as a starting point for React implementation
- Using the CLI to inspect and lint design files if the app ever starts keeping official design specs alongside code
- Building a custom editor surface for a single GridShift workflow, such as card-based trade proposals or draft prospect comparison
- Supporting collaborative design reviews with a shared visual file instead of static screenshots

## Technical / UX Fit Considerations

- Best fit is for feature planning, visual prototyping, and layout validation, not for app runtime logic
- The Tailwind export path is interesting for this repo because most of the app already uses Tailwind and CSS custom properties
- The headless/Vue SDK angle is potentially useful if GridShift ever wants a purpose-built design sandbox for complex Trade or Draft Coach screens
- Real-time collaboration could help if future design work is split between multiple contributors or if product ideas need to be reviewed live
- The `.fig` compatibility matters if the team ever wants to import, inspect, or adapt external design assets

## Risks / Unknowns

- It is still active development and explicitly not production-ready
- The repo is design-tool focused, so the value for GridShift depends on whether we want a stronger prototype workflow versus just coding directly
- Collaboration is P2P and local-first, which is good for simplicity but may limit team workflow expectations if we ever need centralized review history
- Tailwind/JSX export can help bootstrap layouts, but it will still need manual refinement to match this app’s current design tokens and behavior
- We would need to evaluate how stable the file formats and SDK APIs are before depending on them in a real pipeline

## Recommendation

Treat Open Pencil as a future design-prototyping and layout-validation tool, not as a core runtime dependency.

Best near-term uses for GridShift would be:

- testing Trade and Draft Coach card layouts before implementation
- creating higher-fidelity mockups for complex modal flows
- generating JSX/Tailwind starting points for new screens or card systems

If the Trade suite keeps growing in visual complexity, Open Pencil is a reasonable candidate for a dedicated design sandbox later.
