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
            route: { activeTab: 'companion', companionView: 'defense' },
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
            contextKey: 'draftPhase',
            copyByContext: {
              pre_draft: {
                title: 'Draft Picks',
                body: 'Before your draft, this tab is Picks and shows the upcoming order. It automatically becomes Results after the draft starts.',
              },
              results: {
                title: 'Draft Results',
                body: 'Now that the draft has started, this tab is Results and shows the league\'s real selections. Before the draft, it appears as Picks and shows the upcoming order.',
              },
            },
            placement: 'auto',
          },
          {
            route: { activeTab: 'draft', draftView: 'results' },
            anchor: '[data-tour="draft-results-content"]',
            anchorMobile: null,
            contextKey: 'draftPhase',
            copyByContext: {
              pre_draft: {
                title: 'Preview Draft Results',
                body: 'These placeholder picks demonstrate the Results board you will see after the draft starts. Select an earlier league year at the top of the page to review past draft results.',
              },
              results: {
                title: 'Review Draft Results',
                body: 'These are your league\'s real draft results. Select an earlier league year at the top of the page to review results from a past season.',
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
];
