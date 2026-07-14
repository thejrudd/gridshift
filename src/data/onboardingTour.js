// First-run product overview. This stays separate from WHATS_NEW: onboarding
// explains the stable app shape, while release tours describe crossed versions.
export const ONBOARDING_TOUR = [
  {
    title: 'GridShift overview',
    features: [
      {
        id: 'onboarding-companion',
        name: 'Companion',
        description: 'Your connected fantasy league hub.',
        steps: [{
          route: null,
          anchor: '[data-tour="tab-companion"]',
          anchorMobile: null,
          title: 'Your league companion',
          body: 'Review rosters, rankings, matchups, waivers, league trends, defense results, and scoring settings in one connected workspace.',
          placement: 'auto',
        }],
      },
      {
        id: 'onboarding-statistics',
        name: 'Statistics',
        description: 'NFL schedules, standings, teams, and players.',
        steps: [{
          route: null,
          anchor: '[data-tour="tab-statistics"]',
          anchorMobile: null,
          title: 'Explore NFL statistics',
          body: 'Browse schedules and standings, then open team and player drilldowns for deeper season context.',
          placement: 'auto',
        }],
      },
      {
        id: 'onboarding-trade',
        name: 'Trade',
        description: 'Sleeper trade building and analysis.',
        steps: [{
          route: null,
          anchor: '[data-tour="tab-trade"]',
          anchorMobile: null,
          title: 'Build better trades',
          body: 'Build and analyze Sleeper trades, find roster upgrades, compare values, and review your league\'s completed trade history.',
          placement: 'auto',
        }],
      },
      {
        id: 'onboarding-draft',
        name: 'Draft',
        description: 'Planning and results for your league draft.',
        steps: [{
          route: null,
          anchor: '[data-tour="tab-draft"]',
          anchorMobile: null,
          title: 'Prepare for draft day',
          body: 'Use the War Room and your personal board before the draft, then follow upcoming picks or review completed results.',
          placement: 'auto',
        }],
      },
      {
        id: 'onboarding-scout',
        name: 'Scout',
        description: 'Rookie research and prospect comparisons.',
        steps: [{
          route: null,
          anchor: '[data-tour="tab-scout"]',
          anchorMobile: null,
          title: 'Scout the next class',
          body: 'Compare prospects using rankings, combine measurements, and college production before building your draft board.',
          placement: 'auto',
        }],
      },
      {
        id: 'onboarding-predictions',
        name: 'Predictions',
        description: 'Build your view of the NFL season.',
        steps: [{
          route: null,
          anchor: '[data-tour="tab-predictions"]',
          anchorMobile: null,
          title: 'Predict the season',
          body: 'Pick team records and games, then follow the standings and playoff picture created by your predictions.',
          placement: 'auto',
        }],
      },
      {
        id: 'onboarding-guide',
        name: 'Guide',
        description: 'Contextual help and display controls.',
        steps: [{
          route: null,
          anchor: '[data-tour="app-guide"]',
          anchorMobile: '[data-tour="theme-toggle"]',
          contextKey: 'tourViewport',
          copyByContext: {
            desktop: {
              title: 'Help for every section',
              body: 'Open Guide whenever you need concise instructions for the page and feature you are currently viewing.',
            },
            mobile: {
              title: 'Choose your display',
              body: 'Use this control to switch between light and dark mode. Detailed help is available from Guide in the options menu.',
            },
          },
          placement: 'auto',
        }],
      },
      {
        id: 'onboarding-replay',
        name: 'App Tour',
        description: 'Replay this overview whenever you need it.',
        steps: [{
          route: null,
          anchor: '[data-tour="app-tour"]',
          anchorMobile: '[data-tour="app-menu"]',
          contextKey: 'tourViewport',
          copyByContext: {
            desktop: {
              title: 'Replay the app tour',
              body: 'Switch display modes above, or select App Tour here whenever you want to see this overview again.',
            },
            mobile: {
              title: 'Help and replay',
              body: 'Open the options menu for the contextual Guide and the App Tour replay control.',
            },
          },
          placement: 'auto',
        }],
      },
    ],
  },
];
