# Ollama Delegation

This repo includes a small local broker so Codex can delegate lighter work to Ollama, then review the outputs before any code is changed.

## What It Does

- Sends one or many bounded tasks to a local Ollama server
- Packs selected repo files into the prompt for each task
- Runs multiple tasks in parallel in batch mode
- Writes each task's request and result to `tmp/ollama-broker/` for review
- Validates `coding` task output before Codex treats it as reviewable

This keeps Codex in the supervisor role while Ollama acts as a cheap local worker pool for docs, tests, coding sketches, and reasoning passes.

## Prerequisites

1. Install and run [Ollama](https://ollama.com/).
2. Pull at least one local model, for example:

```bash
ollama pull qwen2.5-coder:7b
```

3. Confirm the server is available at `http://127.0.0.1:11434`.
4. See which local models are installed:

```bash
node scripts/ollama-broker.js models
```

## Quick Start

Single task:

```bash
node scripts/ollama-broker.js run --task docs --prompt "Summarize the app shell." --files src/App.jsx,src/components/Sidebar.jsx
```

Batch plan:

```bash
node scripts/ollama-broker.js batch --plan docs/examples/ollama-tasks.example.json --parallel 3
```

List installed models:

```bash
node scripts/ollama-broker.js models
```

Retry a prior task with reviewer feedback:

```bash
node scripts/ollama-broker.js retry --source tmp/ollama-broker/coding-sidebar/request.json --feedback "Only touch Sidebar.jsx and keep the existing desktop/mobile visibility behavior."
```

Artifacts are written to:

```text
tmp/ollama-broker/
```

Each task gets its own folder with:

- `request.json` — the final prompt and task metadata
- `result.md` — the model output in markdown
- `result.json` — status, duration, token counts, validation info, and response text
- `model-observations.jsonl` — append-only per-run notes keyed by model and outcome

## Good Task Types

- `docs` for summaries, code explanations, and draft writeups
- `reasoning` for tradeoff analysis and local decision support
- `coding` for low-risk refactor sketches and patch proposals
- `tests` for likely regression coverage ideas
- `summary` for compressing large file context into something Codex can review quickly

## Review Loop Pattern

The intended loop is:

1. Codex picks a bounded subtask and sends it to Ollama.
2. The broker checks whether the response is structurally valid.
3. Codex reads `result.md` and `result.json` and decides whether it is useful.
4. If needed, Codex launches another pass with tighter instructions or reviewer feedback.
5. Codex applies or rejects the result after review.

Example second pass:

```bash
node scripts/ollama-broker.js retry --source tmp/ollama-broker/sidebar-pass-1/request.json --feedback "Keep the existing mobile and desktop visibility rules unchanged, and return a fenced patch block."
```

## Coding Task Validation

`coding` tasks must return markdown with exactly these sections:

- `Intent`
- `Files Touched`
- `Proposed Patch`
- `Risks`
- `Tests`

The `Proposed Patch` section must contain exactly one fenced code block using `diff` or `patch`. That block must contain a parseable unified diff with repo-relative file headers like `--- a/src/App.jsx`, `+++ b/src/App.jsx`, and at least one hunk header like `@@ -10,3 +10,4 @@`.

The files named in `Files Touched` must match the files present in the diff, and the diff must stay inside the task's allowed file list.

If required sections are missing, the patch block is malformed, or the diff is not parseable, the task is marked `invalid` in `result.json` instead of `completed`.

This is intentional: a weak answer should still be saved for review, but Codex should know it needs another pass.

Example `Proposed Patch` shape:

```diff
--- a/src/components/Sidebar.jsx
+++ b/src/components/Sidebar.jsx
@@ -10,6 +10,7 @@
 import { useSleeper } from '../context/SleeperContext';
 
 export default function Sidebar({
+  // Example patch line
   activeTab,
   onTabChange,
   predictionCount,
```

## Example Plan Format

```json
{
  "defaults": {
    "model": "qwen2.5-coder:7b",
    "parallel": 2,
    "outDir": "tmp/ollama-broker"
  },
  "tasks": [
    {
      "id": "shell-docs",
      "type": "docs",
      "prompt": "Summarize the shell layout and identify the key entry points.",
      "files": ["src/App.jsx", "src/components/Sidebar.jsx", "src/components/NavBar.jsx"]
    },
    {
      "id": "tests-scoring",
      "type": "tests",
      "prompt": "List the smallest high-value regression tests for scoring changes.",
      "files": ["src/utils/scoringEngine.js", "src/utils/projectionEngine.js"]
    }
  ]
}
```

## Notes

- The broker does not edit files or run git commands.
- File contents are truncated per file to keep prompts bounded.
- The default model is `qwen2.5-coder:7b`, but you can override it with `--model`.
- If your Ollama server listens elsewhere, pass `--endpoint`.
- Model-level successes and failures are appended to `tmp/ollama-broker/model-observations.jsonl`.
