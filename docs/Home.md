# GridShift Docs

This folder is the start of an Obsidian-friendly wiki for the repository.

Use this note as the entry point.

## Jump Links

- [[Architecture Map]]
- [[Where To Edit]]
- [[Design System Quick Ref]]
- [[Design Tokens]]
- [[Companion Shared Rows]]
- [[Scoring Call Sites]]
- [[ESPN Fantasy Scoring]]
- [[Trade Engine]]
- [[Scout]]
- [[Draft Assistant]]
- [[BALLDONTLIE NFL Integration]]

## Archive

Completed proposals and speculative integrations that are no longer active:

- [[archive/Shell Redesign Proposal]]
- [[archive/AP Action Photos Integration]]
- [[archive/Ollama Delegation]]
- [[archive/Authentication And Memberships]]
- [[archive/Pretext Integration]]
- [[archive/Open Pencil Integration]]
- [[archive/Card Glow Effect]]

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
  A --> L[Companion Shared Rows]
  A --> D[Where To Edit]
  A --> E[Scoring Call Sites]
  A --> J[Trade Engine]
  A --> K[Scout]
  A --> M[Draft Assistant]
  A --> H[BALLDONTLIE NFL Integration]

  B --> B1[src/main.jsx]
  B --> B2[src/App.jsx]
  B --> B3[src/context]
  B --> B4[src/utils]
  B --> B5[src/components]

  C --> C1[Color Tokens Table]
  C --> C2[Signature Accent Rules]
  C --> C3[Key Conventions]
  L --> L1[Shared player rows]
  L --> L2[Selector controls]
  L --> L3[Gradient contrast]

  D --> D1[Navigation and layout]
  D --> D2[Scoring]
  D --> D3[Sleeper integration]
  D --> D4[Player data]
  D --> D5[Trade and KTC]
  J --> J1[Agent flow]
  J --> J2[Intelligence flow]
  J --> J3[Upgrade flow]
  K --> K1[Prospects]
  K --> K2[Picks and Results]
  K --> K3[CFBD Importers]
  M --> M1[Live draft sync]
  M --> M2[Projection normalization]
  M --> M3[Recommendation heuristics]
```
