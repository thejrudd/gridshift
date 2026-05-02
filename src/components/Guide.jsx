import { useEffect } from 'react';

const GUIDE_CONTENT = {
  predictions: {
    title: 'HOW TO PREDICT',
    steps: [
      {
        title: 'Pick a Team',
        description: 'Tap any team from the division cards to open the prediction editor for that team.',
      },
      {
        title: 'Set the Record',
        description: 'Use the record controls to set wins, losses, and ties — or toggle individual game outcomes for more precision.',
      },
      {
        title: 'Auto-Sync',
        description: "Predictions sync with opponents automatically. If you pick Team A to beat Team B, Team B's schedule updates with that loss.",
      },
      {
        title: 'Track Progress',
        description: 'The progress bar shows how many of the 32 teams you\'ve predicted so far.',
      },
      {
        title: 'Stay Valid',
        description: 'A green "Valid" badge appears when the league balances — exactly 272 total wins across all teams.',
      },
      {
        title: 'View Results',
        description: 'Switch to the Standings or Playoffs tabs to see projected division rankings and the playoff bracket.',
      },
      {
        title: 'Save & Share',
        description: 'Export your predictions as a JSON file to save them, or import a previously saved file to restore your picks.',
      },
    ],
  },
  statistics: {
    title: 'HOW TO USE STATISTICS',
    steps: [
      {
        title: 'Browse by Division',
        description: 'Teams are organized by conference and division. Scroll through to find any team in the league.',
      },
      {
        title: 'Open a Team Page',
        description: 'Tap any team card to view their full roster, key players, and franchise history.',
      },
      {
        title: 'Key Players Strip',
        description: 'The top of each team page highlights the depth-chart starter at each key position — QB, RB, WR, and more.',
      },
      {
        title: 'Full Roster',
        description: 'Scroll down to see the complete roster organized by position group. Tap any group to expand it.',
      },
      {
        title: 'Player Profiles',
        description: 'Tap any player to view their detailed profile, including position, experience, and headshot.',
      },
    ],
  },
  scout: {
    title: 'HOW TO USE SCOUT',
    steps: [
      {
        title: 'Start with Projected Pick',
        description: 'Scout defaults to Projected Pick so the list opens in a draft-order view rather than a pure talent-board view.',
      },
      {
        title: 'Filter the Class',
        description: 'Use the position chips to focus on a single position group or to limit to Offense or Defense. Combine Data keeps only prospects with verified drill results, not measured-only players.',
      },
      {
        title: 'Understand the Labels',
        description: 'Projected Pick is the current pre-draft order, Prospect Rank is the overall board placement, and combine labels like Tested or Measured Only show how much verified event data is loaded.',
      },
      {
        title: 'Read the Tiers',
        description: 'Elite marks blue-chip prospects, Starter marks players with a realistic NFL starting path, and Rotational marks role-player or depth contributors.',
      },
      {
        title: 'Open a Prospect Card',
        description: 'Tap any player to see projected pick, prospect rank, scouting tier, college production, and combine results in one place.',
      },
      {
        title: 'Compare Players',
        description: 'Use the compare control on any row to stack two prospects side by side across draft, production, and combine data.',
      },
    ],
  },

  // ── Companion — per sub-tab ───────────────────────────────────────────────

  companion_roster: {
    title: 'ROSTER',
    steps: [
      {
        title: 'Your Lineup',
        description: 'Active starters are listed at the top by position slot, bench below. Season totals, avg PPG, and positional rank are shown for each player.',
      },
      {
        title: 'Player Drilldown',
        description: 'Tap any player to open their weekly breakdown, projected range for the current week, and matchup context.',
      },
      {
        title: 'Trade from Here',
        description: 'Tap the Trade button on any player row to open Agent with that player pre-loaded on your side.',
      },
    ],
  },

  companion_rankings: {
    title: 'RANKINGS',
    steps: [
      {
        title: 'League-Wide Rankings',
        description: 'All rostered players in your league ranked by season fantasy points under your scoring settings.',
      },
      {
        title: 'Filter & Search',
        description: 'Use the position chips to filter by position group, or search by name. Players on a roster are highlighted.',
      },
      {
        title: 'Weekly Breakdown',
        description: 'Tap any player to view their week-by-week scoring history.',
      },
    ],
  },

  companion_matchup: {
    title: 'MATCHUP',
    steps: [
      {
        title: 'Side-by-Side Starters',
        description: 'Your lineup vs. your opponent\'s — each position slot shown side by side with actual points scored and a projected range for this week.',
      },
      {
        title: 'Projections',
        description: 'Projection = season average × location factor × opponent strength × weather × snap trend. The range (floor–ceiling) reflects 25th–75th percentile of the player\'s scoring history, adjusted for the same matchup factors.',
      },
      {
        title: 'Matchup Difficulty',
        description: 'Each card shows a difficulty badge (Easy → Difficult) based on how many fantasy points the opposing defense has allowed to that position this season, percentile-ranked against all 32 teams.',
      },
      {
        title: 'Player Drilldown',
        description: 'Tap any player card for a detailed breakdown: positional rank, opponent context, points allowed by the defense to this position, and a line-by-line scoring summary.',
      },
    ],
  },

  companion_waiver: {
    title: 'WAIVER',
    steps: [
      {
        title: 'Available Players',
        description: 'Players not currently on any roster in your league, ranked by projected value under your scoring settings.',
      },
      {
        title: 'Filter & Search',
        description: 'Filter by position or search by name. Ownership percentage is shown for players rostered in other leagues.',
      },
      {
        title: 'Player Drilldown',
        description: 'Tap any player to view their season stats, recent form, and projected range for the current week.',
      },
    ],
  },

  companion_league: {
    title: 'LEAGUE',
    steps: [
      {
        title: 'All Rosters',
        description: 'Every team in your league with their full roster, sorted by KTC value. Your team is pinned at the top.',
      },
      {
        title: 'Roster Drilldown',
        description: 'Tap any team to expand their depth chart with season stats and weekly splits for each player.',
      },
      {
        title: 'Trade from Here',
        description: 'Tap the Trade button on any opponent\'s player to open Agent with that player pre-loaded on their side.',
      },
    ],
  },

  companion_defense: {
    title: 'HEATMAP',
    steps: [
      {
        title: 'What You\'re Seeing',
        description: 'A week-by-week grid of every NFL team\'s performance. Each cell is one team\'s stat for one week.',
      },
      {
        title: 'Offense Phase',
        description: 'Shows points (or yards) allowed to each offensive position — useful for spotting favorable matchups. Green = more allowed (easier for your player), red = stingier. Filter by position to focus on QB, RB, WR, TE, or K.',
      },
      {
        title: 'Defense Phase',
        description: 'Shows IDP production per team per week. Green = more production. Filter by defensive position group (DL, LB, DB) and stat.',
      },
      {
        title: 'Drilldown',
        description: 'Tap any cell to see which players drove that week\'s total. Tap a player\'s name to jump to their profile.',
      },
    ],
  },

  trade_agent: {
    title: 'AGENT',
    steps: [
      {
        title: 'Build The Deal',
        description: 'Choose a trade partner, then add players or picks to either side. On desktop you can use the roster shelf; on mobile use the add buttons or Search All Rostered Players.',
      },
      {
        title: 'Read The Scoreboard',
        description: 'The scoreboard totals each side, shows who the deal favors, and marks a trade as near even when the gap is small.',
      },
      {
        title: 'Use League Values',
        description: 'Player values start with KeepTradeCut and are adjusted for your league format and scoring. Draft pick values use the picks each manager actually owns.',
      },
      {
        title: 'Adjust And Review',
        description: 'Use Suggest Adjustment to find adds, removes, or swaps that can balance the offer. Open Value Trends to see recent market movement for players in the deal.',
      },
    ],
  },

  trade_intelligence: {
    title: 'INTELLIGENCE',
    steps: [
      {
        title: 'Choose a Partner',
        description: 'Select a manager to generate trade ideas built around your roster, their roster, and the picks each side can move.',
      },
      {
        title: 'Switch Modes',
        description: 'Fix Needs looks for deals that improve your lineup. Use Surplus looks for ways to move depth or strength for players and picks.',
      },
      {
        title: 'Filter The Ideas',
        description: 'Use the player and pick filters to control how many assets appear on each side. Reset Filters returns to the full idea list.',
      },
      {
        title: 'Apply And Edit',
        description: 'Tap Apply to send any idea into Agent. From there you can review the totals, open player details, or change the package.',
      },
    ],
  },

  trade_upgrade: {
    title: 'UPGRADE FINDER',
    steps: [
      {
        title: 'Pick The Target',
        description: 'Choose the player you want to upgrade into. The target card shows their value, rank, and scoring context before you search.',
      },
      {
        title: 'Choose Your Movers',
        description: 'Select players you are willing to give up, then use position chips and sort controls to reshape the suggested list. Package Size controls whether the search can combine up to three assets.',
      },
      {
        title: 'Set Picks And Posture',
        description: 'Use My Picks and Picks Back to decide whether draft picks can balance the deal. Trade Posture shifts the search from buy-low ideas to stronger offers.',
      },
      {
        title: 'Review Upgrade Paths',
        description: 'Find Upgrades scans the league and groups results by manager. Sort the paths, read why each side benefits, then Apply a package to Agent for final review.',
      },
    ],
  },

  companion_scoring: {
    title: 'SCORING SETTINGS',
    steps: [
      {
        title: 'Your League\'s Rules',
        description: 'Scoring settings are imported directly from Sleeper when you connect. All projections, rankings, and trade values in Companion use these rules.',
      },
      {
        title: 'Active vs. All',
        description: 'Active shows only fields your league has set to a non-zero value. All reveals every supported scoring field, including those at 0.',
      },
      {
        title: 'Sync',
        description: 'Tap Sync to re-import the latest settings from your Sleeper league at any time.',
      },
    ],
  },

  compare: {
    title: 'HOW TO USE COMPARE',
    steps: [
      {
        title: 'Select Two Players',
        description: 'Tap either player slot to open the search sheet. Type any name, nickname, position, team, city, conference, or division — the search covers all 32 NFL rosters. Examples: "Lamar", "Bills RB", "AFC East receivers", "slot WRs in Dallas". Tap a result to lock that player into the slot.',
      },
      {
        title: 'Stats Panel',
        description: 'Side-by-side stat table for the selected season, grouped by category. A gold ▲ marks the better value in each row. Toggle Advanced to reveal deeper metrics like QBR, yards after catch, and more.',
      },
      {
        title: 'Year Navigation',
        description: 'Use the year pills to switch between seasons or Career totals. Each player\'s data loads independently.',
      },
      {
        title: 'Fantasy Panel',
        description: 'Requires a connected Sleeper league. Shows season total points, avg PPG, last 4-week average, positional rank, and projected floor/ceiling — all under your league\'s scoring rules.',
      },
      {
        title: 'Trade Panel',
        description: 'Shows league-adjusted trade values, recent value trends, and quick context for both players. Build Full Trade opens Agent with the players loaded when one is on your roster.',
      },
    ],
  },
};

const Guide = ({ onClose, activeTab = 'predictions', companionView = 'roster', tradeView = 'agent' }) => {
  const key = activeTab === 'companion'
    ? `companion_${companionView}`
    : activeTab === 'trade'
      ? (tradeView === 'compare'
        ? 'compare'
        : tradeView === 'intelligence'
          ? 'trade_intelligence'
          : tradeView === 'upgrade'
            ? 'trade_upgrade'
            : 'trade_agent')
      : activeTab;
  const content = GUIDE_CONTENT[key] ?? GUIDE_CONTENT[activeTab] ?? GUIDE_CONTENT.predictions;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  useEffect(() => {
    const handleEscape = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 flex items-center justify-between">
          <h2 className="text-2xl font-display tracking-wide">{content.title}</h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 text-3xl leading-none"
            aria-label="Close guide"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {content.steps.map((step, i) => (
            <div key={i} className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
                {i + 1}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">{step.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Guide;
