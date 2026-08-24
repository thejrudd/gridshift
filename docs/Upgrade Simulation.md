# What's New Upgrade Simulation

Back: [[Home]]

## v8.1.1 to v8.2

Run:

```bash
npm run dev:upgrade:8.1.1-to-8.2
```

This starts the normal local GridShift development environment while presenting the client as v8.2.0 and treating v8.1.1 as the previously installed version. The package version, browser installed-version key, production build behavior, and release files are not changed.

The simulator keeps the v8.2 What's New modal and tour replayable after refresh. For this scenario, the modal contains only:

- Trade History
- Draft Picks and Results

A connected Sleeper league is still required because the real feature tour only appears when league context is available. Before the selected draft starts, the Draft step uses tour-only placeholder teams and players. After the draft starts, it keeps the league's real results.

Additional Vite arguments can be appended after `--`, for example:

```bash
npm run dev:upgrade:8.1.1-to-8.2 -- --host 0.0.0.0
```

Stop the environment with `Ctrl+C`.

## How It Works

`scripts/dev.mjs` accepts paired `--upgrade-from` and `--upgrade-to` values. It passes a development-only baseline to `useWhatsNew` and a temporary app-version override to Vite. The normal package version remains the production source of truth whenever those flags are absent.

The generic flags can support later upgrade paths, but each named scenario should receive its own package script and coverage before it is treated as a supported review environment.
