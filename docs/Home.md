# NFL Predictor Docs

This folder is the start of an Obsidian-friendly wiki for the repository.

Use this note as the entry point.

## Jump Links

- [[Architecture Map]]
- [[Feature Map]]
- [[Where To Edit]]
- [[Conventions And Gotchas]]

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
  A --> C[Feature Map]
  A --> D[Where To Edit]
  A --> E[Conventions And Gotchas]

  B --> B1[src/main.jsx]
  B --> B2[src/App.jsx]
  B --> B3[src/context]
  B --> B4[src/utils]
  B --> B5[src/components]

  C --> C1[Predictions]
  C --> C2[Statistics]
  C --> C3[Companion]
  C --> C4[Compare]
  C --> C5[Export]

  D --> D1[Navigation and layout]
  D --> D2[Scoring]
  D --> D3[Sleeper integration]
  D --> D4[Player data]
  D --> D5[Trade and KTC]
```
