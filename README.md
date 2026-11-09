# GridShift

**Your NFL season and Sleeper fantasy league, in one place.**

Plan the season, follow your matchups, prepare for your draft, and explore the numbers behind every game. GridShift is free, open source, ad-free, and self-hostable.

[Get started](#get-started) · [Features](#what-you-can-do) · [Compatibility](#compatibility-and-data) · [Self-hosting guide](docs/Self-Hosting.md) · [Roadmap](#roadmap)

## What you can do

- **Follow your fantasy league.** Connect a Sleeper league to explore rosters, scoring, weekly matchups, schedules, league history, and trade tools.
- **See the story behind a matchup.** Compare projections and game context. Fantasy Live (Alpha) adds scoring plays, a replay bar, and win chance for enabled leagues with the required data access.
- **Prepare for draft day.** Use the Draft Assistant (Beta) for rankings, a draft board, and team blueprints; explore prospects and comparisons in Scout (Beta).
- **Plan the NFL season.** Pick game outcomes, project standings and playoff seeds, and share your predictions.
- **Explore football data.** Browse schedules, standings, player and team profiles, game logs, and scores. Statistics Scores (Beta) includes additional game detail when the required data is available.
- **Make it yours.** Choose a favorite-team theme, dark mode, and display size; install the app as a PWA or export and restore predictions.

## Get started

To run GridShift locally, install [Node.js](https://nodejs.org/) 20.19+ or 22.12+ (excluding Node 21), and Git, then run:

```bash
git clone https://github.com/thejrudd/gridshift.git
cd gridshift
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The development command starts the app and its local API sidecar. Some features use external data sources and need an internet connection.

For a production build, run `npm run build`; the output is written to `dist/`. For Docker, optional data providers, and server configuration, see the [self-hosting guide](docs/Self-Hosting.md). The included Compose file is configured for a Cloudflare tunnel and requires deployment secrets.

## Compatibility and data

GridShift connects to Sleeper; support varies by feature and league format. Auction drafts are not yet supported by Draft Assistant, and extra matchups against the league median are not yet included in weekly results, standings, or playoff seeding. FAAB transfers are recognized in trade and history flows, but FAAB does not have a numeric trade value.

BALLDONTLIE is optional. Core predictions and many Sleeper league tools work without its key, while Fantasy Live and some statistics and play-by-play features require appropriate data access. Without it, some player and team dashboard tabs can incorrectly report that there are no finished games. Availability depends on data coverage and account capabilities. See the [feature availability matrix](docs/Self-Hosting.md#self-hosting-without-balldontlie) for details.

## Roadmap

- **v9.4 — Search quality and performance** — Improve typo and phrase matching in Search, then profile Companion, Heatmap, and Draft to optimize measured bottlenecks while preserving existing data and provider contracts.
- **After v9.4 — Opponent injuries** — In Fantasy Injuries, see who each rostered player faces this week and how the opposing unit's injuries change that matchup.
- **v9.5 and later — Additive features** — The release order is still provisional. Planned user-facing work includes:
  - **Extra matchup against the league median** — Automatically add each team's second regular-season win, loss, or tie to weekly results, standings, and playoff seeding when Sleeper's league records show the feature is enabled.
  - **More Global Search answers** — Answer live NFL score and game-status questions, show the connected league's live matchup, and find league-history records and activity. Load linked-season history only when a history query needs it.
- Bug fixes continue alongside every release.

## Privacy, license, and more

GridShift is available under the [MIT License](LICENSE). See the [Privacy Policy](PRIVACY.md) for browser storage, connected services, and optional hosted features.

- [Self-hosting and configuration](docs/Self-Hosting.md)
- [Changelog](CHANGELOG.md)
- [Project principles, technology, and structure](docs/Project%20Reference.md)
- [Report an issue](https://github.com/thejrudd/gridshift/issues)
