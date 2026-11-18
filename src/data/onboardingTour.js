// First-run product overview. This stays separate from WHATS_NEW: onboarding
// explains the stable app shape, while release tours describe crossed versions.
export const ONBOARDING_TOUR = [
  {
    title: 'GridShift overview',
    features: [
      {
        id: 'onboarding-companion',
        name: 'Fantasy',
        description: 'Your connected fantasy decision workspace.',
        steps: [{
          route: null,
          anchor: '[data-tour="tab-companion"]',
          anchorMobile: null,
          title: 'Manage your fantasy teams',
          body: 'Review rosters, rankings, matchups, heatmaps, defenses, and scoring settings in one connected workspace. Rankings also includes unrostered players and their projections.',
          placement: 'auto',
        }],
      },
      {
        id: 'onboarding-league',
        name: 'League',
        description: 'Standings, history, and league activity.',
        steps: [{
          route: null,
          anchor: '[data-tour="tab-league"]',
          anchorMobile: null,
          title: 'Follow the whole league',
          body: 'Open current standings, long-term league history, and the completed transaction activity feed.',
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
        id: 'onboarding-predictions',
        name: 'Predict',
        description: 'Build your view of the NFL season.',
        steps: [{
          route: null,
          anchor: '[data-tour="tab-predictions"]',
          anchorMobile: null,
          title: 'Predict the season',
          body: 'Choose team records and games, then build the playoff picture created by your predictions.',
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

// League-less first run: the same overview, with Fantasy, League, Trade, and
// Draft shown on sample data (src/components/tour/TourFantasyPreview.jsx).
// Statistics and Predict are real screens, since neither needs a league.
const replayFeatures = ONBOARDING_TOUR[0].features.filter((feature) => (
  feature.id === 'onboarding-guide' || feature.id === 'onboarding-replay'
));

function previewFeature(id, name, description, tab, route, step) {
  return {
    id,
    name,
    description,
    steps: [{
      route,
      anchor: `[data-tour="preview-${tab}"]`,
      anchorMobile: null,
      placement: 'auto',
      ...step,
    }],
  };
}

export const ONBOARDING_PREVIEW_TOUR = [
  {
    title: 'GridShift overview',
    features: [
      previewFeature(
        'onboarding-preview-fantasy',
        'Fantasy',
        'Your connected fantasy decision workspace.',
        'fantasy',
        { activeTab: 'fantasy', companionView: 'rosters' },
        {
          title: 'Manage your fantasy teams',
          body: 'Connect a league to review rosters, rankings, matchups, heatmaps, defenses, and scoring settings in one place. This is sample data.',
        },
      ),
      previewFeature(
        'onboarding-preview-league',
        'League',
        'Standings, history, and league activity.',
        'league',
        { activeTab: 'league', leagueView: 'standings' },
        {
          title: 'Follow the whole league',
          body: 'See current standings, long-term league history, and the completed transaction feed for your league.',
        },
      ),
      {
        id: 'onboarding-preview-statistics',
        name: 'Statistics',
        description: 'NFL schedules, standings, teams, and players.',
        steps: [{
          route: { activeTab: 'statistics' },
          anchor: '[data-tour="tab-statistics"]',
          anchorMobile: null,
          title: 'Explore NFL statistics',
          body: 'Browse schedules and standings, then open team and player drilldowns for deeper season context. No league needed.',
          placement: 'auto',
        }],
      },
      previewFeature(
        'onboarding-preview-trade',
        'Trade',
        'Sleeper trade building and analysis.',
        'trade',
        { activeTab: 'trade' },
        {
          title: 'Build better trades',
          body: 'Build and analyze trades, find roster upgrades, compare values, and review your league\'s completed trades.',
        },
      ),
      previewFeature(
        'onboarding-preview-draft',
        'Draft',
        'Planning and results for your league draft.',
        'draft',
        { activeTab: 'draft' },
        {
          title: 'Prepare for draft day',
          body: 'Use the War Room and your personal board before the draft, then follow upcoming picks or review completed results.',
        },
      ),
      {
        id: 'onboarding-preview-predictions',
        name: 'Predict',
        description: 'Build your view of the NFL season.',
        steps: [{
          route: { activeTab: 'predictions' },
          anchor: '[data-tour="tab-predictions"]',
          anchorMobile: null,
          title: 'Predict the season',
          body: 'Choose team records and games, then build the playoff picture created by your predictions. No league needed.',
          placement: 'auto',
        }],
      },
      ...replayFeatures,
    ],
  },
];
