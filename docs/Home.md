# NFL Predictor Docs

This folder is the start of an Obsidian-friendly wiki for the repository.

Use this note as the entry point.

## Jump Links

- [[Architecture Map]]
- [[Where To Edit]]
- [[Design Tokens]]
- [[Scoring Call Sites]]
- [[Trade Engine]]
- [[Open Pencil Integration]]
- [[Pretext Integration]]
- [[BALLDONTLIE NFL Integration]]
- [[Authentication And Memberships]]

## Suggested Obsidian Use

- Open the repository root as the vault so code and docs live together.
- Start from this note in graph view or mind-map plugins.
- Expand each page into deeper notes over time instead of growing one giant file.

## Repository Snapshot

- Main app entry: `src/main.jsx`
- Main shell: `src/App.jsx`
- Core app state: `src/context/PredictionContext.jsx`
- Theme state: `src/context/ThemeContext.jsx`
- Sleeper/fantasy state: `src/context/SleeperContext.jsx`

## Architecture Overview

```mermaid
flowchart TD
  A[Home] --> B[Architecture Map]
  A --> C[Design Tokens]
  A --> D[Where To Edit]
  A --> E[Scoring Call Sites]
  A --> J[Trade Engine]
  A --> F[Open Pencil Integration]
  A --> G[Pretext Integration]
  A --> H[BALLDONTLIE NFL Integration]
  A --> I[Authentication And Memberships]

  B --> B1[src/main.jsx]
  B --> B2[src/App.jsx]
  B --> B3[src/context]
  B --> B4[src/utils]
  B --> B5[src/components]

  C --> C1[Color Tokens Table]
  C --> C2[Signature Accent Rules]
  C --> C3[Key Conventions]

  D --> D1[Navigation and layout]
  D --> D2[Scoring]
  D --> D3[Sleeper integration]
  D --> D4[Player data]
  D --> D5[Trade and KTC]
  J --> J1[Agent flow]
  J --> J2[Intelligence flow]
  J --> J3[Upgrade flow]
```
