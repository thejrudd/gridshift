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
];
