// What's New feature-tour entries, oldest → newest. FEATURE versions only —
// patch/bug-fix releases get no entry, so users updating across them see nothing.
// A version is treated as a feature version iff it appears here.
//
// Entry shape:
// {
//   version: '8.1.0',            // exact package.json version it shipped in
//   title: 'Release theme',      // shown as the section header in the What's New modal
//   features: [{
//     id: 'kebab-id',            // stable unique id
//     name: 'Feature name',      // modal list label
//     description: '...',        // one sentence shown in the modal
//     supersedes: ['older-id'],   // optional older features omitted when both versions are crossed
//     steps: [{                  // interactive tour steps, in walk order
//       route: { activeTab, companionView, ... } | null,  // applyRoute shape; null = stay on current view
//       anchor: '[data-tour="..."]',   // CSS selector; resolver picks the visible match
//       anchorMobile: null,            // optional mobile-only override selector
//       title: 'Tooltip title',
//       body: 'Tooltip body copy.',
//       placement: 'auto',             // 'auto' | 'top' | 'bottom' | 'left' | 'right'
//       contextKey/copyByContext: null, // optional context-sensitive copy
//       demoMode/demoWhen: null,        // optional tour-only presentation state
//     }],
//   }],
// }
//
// Rules (see AGENTS.md commit checklist): append new versions at the END.
// Declare supersedes when a later feature replaces an older toured behavior;
// never rewrite past entries except to repair broken anchors/routes/copy.

export const WHATS_NEW = [
  {
    version: '8.1.0',
    title: 'Draft & Defense Insights',
    features: [
      {
        id: 'draft-outcome-insights',
        name: 'Draft outcome insights',
        description: 'Review historical draft picks against their positional season finish with clear outcome grades.',
        steps: [
          {
            route: { activeTab: 'draft', draftView: 'results' },
            anchor: '[data-tour="draft-view-results"]',
            anchorMobile: null,
            title: 'Draft Results',
            body: 'Draft Results now compares historical draft rank with the player\'s season finish and explains the outcome grade.',
            placement: 'auto',
          },
        ],
      },
      {
        id: 'companion-defense',
        name: 'Defense rankings',
        description: 'Compare NFL defenses by fantasy points allowed and defensive production with clearer drilldowns.',
        steps: [
          {
            route: { activeTab: 'fantasy', companionView: 'defenses' },
            anchor: '[data-tour="companion-view-defense"]',
            anchorMobile: null,
            title: 'Defense rankings',
            body: 'Defense is now a full Companion view with position filters, sortable rankings, and team-level scoring details.',
            placement: 'auto',
          },
        ],
      },
    ],
  },
  {
    version: '8.2.0',
    title: 'Trade History & Draft Clarity',
    features: [
      {
        id: 'trade-history',
        name: 'Trade history',
        description: 'Review finalized league trades from the selected season and every linked season before it.',
        steps: [
          {
            route: { activeTab: 'trade', tradeView: 'history' },
            anchor: '[data-tour="trade-view-history"]',
            anchorMobile: null,
            title: 'Trade History',
            body: 'History collects finalized league trades in one place, including players, draft picks, and waiver budget exchanged.',
            placement: 'auto',
          },
          {
            route: { activeTab: 'trade', tradeView: 'history' },
            anchor: '[data-tour="trade-history-content"]',
            anchorMobile: null,
            title: 'Browse Every Linked Season',
            body: 'Start with the selected league year, then expand earlier seasons, filter by manager, or search for a team, player, pick, or waiver budget.',
            placement: 'auto',
          },
        ],
      },
      {
        id: 'draft-picks-results',
        name: 'Draft Picks and Results',
        description: 'Follow the upcoming draft order before the draft, then review completed selections after it starts.',
        supersedes: ['draft-outcome-insights'],
        steps: [
          {
            route: { activeTab: 'draft', draftView: 'results' },
            anchor: '[data-tour="draft-view-results"]',
            anchorMobile: null,
            contextKey: 'draftTourState',
            copyByContext: {
              current_pre_draft: {
                title: '{{selectedLeagueSeason}} Current Draft Picks',
                body: 'You are viewing the current {{selectedLeagueSeason}} league year. Sleeper reports that this draft has not started, so Picks shows the upcoming order and will become Results when drafting begins.',
              },
              current_results: {
                title: '{{selectedLeagueSeason}} Current Draft Results',
                body: 'You are viewing the current {{selectedLeagueSeason}} league year. Sleeper reports that this draft has started, so Results shows the selections recorded for this season.',
              },
              historical_pre_draft: {
                title: '{{selectedLeagueSeason}} Historical Draft Picks',
                body: 'You are viewing {{selectedLeagueSeason}} league history, not the current {{currentLeagueSeason}} league year. Sleeper still reports this selected season as pre-draft, so Picks shows its upcoming order.',
              },
              historical_results: {
                title: '{{selectedLeagueSeason}} Historical Draft Results',
                body: 'You are viewing {{selectedLeagueSeason}} league history, not the current {{currentLeagueSeason}} league year. Results shows the selections recorded for this past season.',
              },
            },
            placement: 'auto',
          },
          {
            route: { activeTab: 'draft', draftView: 'results' },
            anchor: '[data-tour="draft-results-content"]',
            anchorMobile: null,
            contextKey: 'draftTourState',
            copyByContext: {
              current_pre_draft: {
                title: 'Preview {{selectedLeagueSeason}} Draft Results',
                body: 'These placeholder picks preview the Results board for your current {{selectedLeagueSeason}} league year. Select an earlier year at the top of the page to review a completed draft instead.',
              },
              current_results: {
                title: 'Review {{selectedLeagueSeason}} Draft Results',
                body: 'These are the recorded selections for your current {{selectedLeagueSeason}} league year. Select an earlier year at the top of the page to review historical results.',
              },
              historical_pre_draft: {
                title: 'Preview {{selectedLeagueSeason}} Draft Results',
                body: 'These placeholder picks preview Results for the selected {{selectedLeagueSeason}} historical league year. Switch to {{currentLeagueSeason}} at the top of the page to return to your current league year.',
              },
              historical_results: {
                title: 'Review {{selectedLeagueSeason}} Draft History',
                body: 'These are the recorded selections for the historical {{selectedLeagueSeason}} league year. Switch to {{currentLeagueSeason}} at the top of the page to return to your current league year.',
              },
            },
            demoMode: 'draft-results',
            demoWhen: { draftPhase: 'pre_draft' },
            placement: 'auto',
          },
        ],
      },
    ],
  },
  {
    version: '8.3.0',
    title: 'League History, Draft Blueprint & Display',
    features: [
      {
        id: 'league-workspace',
        name: 'League workspace',
        description: 'Explore Fantasy tools and League records through a clearer top-level workspace structure.',
        steps: [
          {
            route: { activeTab: 'fantasy', companionView: 'rosters' },
            anchor: '[data-tour="tab-companion"]',
            anchorMobile: null,
            title: 'Companion is now Fantasy',
            body: 'Your former Companion home is now Fantasy. Rosters, Rankings, Matchups, Waivers, Defenses, and league scoring tools remain here.',
            placement: 'auto',
          },
          {
            route: { activeTab: 'league', leagueView: 'standings' },
            anchor: '[data-tour="league-view-standings"]',
            anchorMobile: null,
            title: 'A dedicated League workspace',
            body: 'Standings, History, and Activity now live together in the League workspace, while Fantasy keeps rosters, matchups, and league tools close at hand.',
            placement: 'auto',
          },
        ],
      },
      {
        id: 'league-history-record-book',
        name: 'League History record book',
        description: 'See linked-season champions, lifetime standings, rivalries, and core league records in one view.',
        steps: [
          {
            route: { activeTab: 'league', leagueView: 'history' },
            anchor: '[data-tour="league-view-history"]',
            anchorMobile: null,
            title: 'League History',
            body: 'Open the record book for champions, lifetime standings, most-played rivalries, and evidence-backed league records across linked seasons.',
            placement: 'auto',
          },
          {
            route: { activeTab: 'league', leagueView: 'history' },
            anchor: '[data-tour="league-history-content"]',
            anchorMobile: null,
            title: 'Your league record book',
            body: 'History connects prior seasons and surfaces champions, team identities, head-to-head rivalries, scoring marks, streaks, trades, and waiver activity.',
            placement: 'auto',
          },
        ],
      },
      {
        id: 'league-standings-activity',
        name: 'League Standings and Activity',
        description: 'Follow finalized standings and completed transactions for the selected league year.',
        steps: [
          {
            route: { activeTab: 'league', leagueView: 'standings' },
            anchor: '[data-tour="league-standings-content"]',
            anchorMobile: null,
            title: 'Finalized standings',
            body: 'Standings use completed matchups, show playoff seeding, and preserve the selected league year as it develops.',
            placement: 'auto',
          },
          {
            route: { activeTab: 'league', leagueView: 'activity' },
            anchor: '[data-tour="league-view-activity"]',
            anchorMobile: null,
            title: 'Completed league activity',
            body: 'Activity turns completed trades, waivers, free-agent moves, draft capital, and commissioner changes into a season ledger.',
            placement: 'auto',
          },
        ],
      },
      {
        id: 'draft-blueprint',
        name: 'Draft Blueprint',
        description: 'Start Draft Results with a team-by-team view of roster construction, then drill into the Pick List.',
        steps: [{
          route: { activeTab: 'draft', draftView: 'results' },
          anchor: '[data-tour="draft-blueprint-content"]',
          anchorMobile: null,
          title: 'Draft Blueprint',
          body: 'Draft Results now opens with each team\'s pick count, position construction, first-round selection, and a direct path into the chronological Pick List.',
          demoMode: 'draft-results',
          demoWhen: { draftPhase: 'pre_draft' },
          placement: 'auto',
        }],
      },
      {
        id: 'responsive-display-settings',
        name: 'Display settings',
        description: 'Choose Compact, Comfortable, or Large sizing while keeping browser zoom and system scaling available.',
        steps: [{
          route: null,
          anchor: '[data-tour="display-settings"]',
          anchorMobile: '[data-tour="app-menu"]',
          title: 'Choose your display size',
          body: 'Open Display to choose Compact, Comfortable, or Large type, controls, and spacing. Your preference stays on this device, and browser zoom still works normally.',
          placement: 'auto',
        }],
      },
    ],
  },
  {
    version: '8.4.0',
    title: 'Live Scoring & NFL Scores',
    features: [
      {
        id: 'statistics-scores-beta',
        name: 'Statistics Scores (Beta)',
        description: 'Follow provider-backed NFL scores while regular-season archive coverage continues to expand.',
        steps: [{
          route: { activeTab: 'statistics', statisticsView: 'scores' },
          anchor: '[data-tour="statistics-view-scores"]',
          anchorMobile: null,
          title: 'Statistics Scores · Beta',
          body: 'Real preseason scores are available now, with more game and season coverage on the way.',
          placement: 'auto',
        }],
      },
      {
        id: 'fantasy-live-alpha',
        name: 'Fantasy Live (Alpha)',
        description: 'Replay Sleeper matchups with live scoring, win probability, scoring plays, and player context.',
        steps: [{
          route: { activeTab: 'fantasy', companionView: 'live' },
          anchor: '[data-tour="companion-view-live"]',
          anchorMobile: null,
          title: 'Fantasy Live · Alpha',
          body: 'Follow live fantasy matchups with scores from your connected platform. This early preview will keep improving as more in-season data becomes available.',
          placement: 'auto',
        }],
      },
      {
        id: 'fantasy-scoring-blueprint',
        name: 'Fantasy Scoring Blueprint',
        description: 'Understand your league rules through an accurate summary, position strengths, and real-game scoring examples.',
        steps: [{
          route: { activeTab: 'fantasy', companionView: 'scoring' },
          anchor: '[data-tour="companion-view-scoring"]',
          anchorMobile: null,
          title: 'Your Scoring Blueprint',
          body: 'Scoring now separates offense, kicking, team defense, and special teams, surfaces reception premiums, and itemizes how your league rules score real performances.',
          placement: 'auto',
        }],
      },
    ],
  },
  {
    version: '8.5.0',
    title: 'Fantasy & Draft Context',
    features: [
      {
        id: 'fantasy-draft-context',
        name: 'Fantasy and Draft context',
        description: 'See injury availability and roster context while preparing your team, with keeper labels when your league uses keepers and managers have set them.',
        steps: [
          {
            route: { activeTab: 'fantasy', companionView: 'rosters' },
            anchor: '[data-tour="companion-view-roster"]',
            anchorMobile: null,
            title: 'More context in Fantasy',
            body: 'Roster rows keep platform-provided injury availability visible. If your league is a keeper league, keepers are marked here once the respective manager sets them.',
            placement: 'auto',
          },
          {
            route: { activeTab: 'draft', draftView: 'war-room' },
            anchor: '[data-tour="tab-draft"]',
            anchorMobile: null,
            title: 'More context for Draft decisions',
            body: 'Draft tools keep injury status and roster eligibility close to the decisions you are making. Keeper labels appear only when your league and managers have provided them.',
            placement: 'auto',
          },
        ],
      },
    ],
  },
  {
    version: '8.6.0',
    title: 'Live Play-by-Play',
    features: [
      {
        id: 'fantasy-live-alpha-playback',
        name: 'Fantasy Live (Alpha)',
        description: 'Follow each fantasy matchup through a clearer scoring feed, focused filters, and animated play replays.',
        supersedes: ['fantasy-live-alpha'],
        steps: [{
          route: { activeTab: 'fantasy', companionView: 'live' },
          anchor: '[data-tour="companion-view-live"]',
          anchorMobile: null,
          title: 'Fantasy Live · Alpha',
          body: 'Follow your matchup as it happens, filter the scoring feed, and expand a play to replay the action with your team\'s fantasy impact and every rostered contributor.',
          placement: 'auto',
        }],
      },
      {
        id: 'statistics-scores-beta-current',
        name: 'Statistics Scores (Beta)',
        description: 'Track provider-backed NFL scores, live game context, and expanding game-detail coverage in one season board.',
        supersedes: ['statistics-scores-beta'],
        steps: [{
          route: { activeTab: 'statistics', statisticsView: 'scores' },
          anchor: '[data-tour="statistics-view-scores"]',
          anchorMobile: null,
          title: 'Statistics Scores · Beta',
          body: 'Open Scores for provider-backed NFL results, live possession and latest-play context, plus game drilldowns when detailed coverage is available.',
          placement: 'auto',
        }],
      },
      {
        id: 'statistics-scores-play-by-play',
        name: 'Statistics Scores play-by-play',
        description: 'Open a game drilldown to read its drives, inspect each play, and replay a drive snap by snap.',
        steps: [{
          route: { activeTab: 'statistics', statisticsView: 'scores' },
          anchor: '[data-tour="statistics-scores-play-by-play"]',
          anchorMobile: null,
          title: 'Play-by-play, drive by drive',
          body: 'This tour preview opens Play-by-Play with normalized descriptions and field position. Expand the drive, then choose Play drive to replay every snap in sequence.',
          demoMode: 'statistics-scores-play-by-play',
          placement: 'auto',
        }],
      },
    ],
  },
];
