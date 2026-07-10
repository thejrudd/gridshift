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
//     steps: [{                  // interactive tour steps, in walk order
//       route: { activeTab, companionView, ... } | null,  // applyRoute shape; null = stay on current view
//       anchor: '[data-tour="..."]',   // CSS selector; resolver picks the visible match
//       anchorMobile: null,            // optional mobile-only override selector
//       title: 'Tooltip title',
//       body: 'Tooltip body copy.',
//       placement: 'auto',             // 'auto' | 'top' | 'bottom' | 'left' | 'right'
//     }],
//   }],
// }
//
// Rules (see CLAUDE.md commit checklist): append new versions at the END; never
// rewrite past entries except to repair broken anchors/routes.

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
];
