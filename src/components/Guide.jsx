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
        title: 'Build a Trade',
        description: 'Select a trade partner from the carousel above, then tap + Player or + Pick to add assets to each side. Or tap Search All Players to find any rostered player — including your own — from across the whole league.',
      },
      {
        title: 'Trade Values',
        description: 'Values come from KeepTradeCut (KTC), automatically calibrated for your league format (dynasty/redraft, 1QB/Superflex) and adjusted for your scoring settings.',
      },
      {
        title: 'Fairness Verdict',
        description: 'The value bar shows the gap between sides. A trade is considered fair when the gap is less than 5% of the higher side\'s total.',
      },
      {
        title: 'Refine Trade',
        description: 'Once items are added, tap Refine Trade to get suggested additions, removals, or swaps that move the deal closer to even.',
      },
    ],
  },

  trade_intelligence: {
    title: 'INTELLIGENCE',
    steps: [
      {
        title: 'Choose a Partner',
        description: 'Select a manager above to load trade ideas tailored to that roster matchup.',
      },
      {
        title: 'Switch Modes',
        description: 'Fix Needs focuses on starter upgrades. Use Surplus looks for deals where you can move depth or strength for picks and roster help.',
      },
      {
        title: 'Apply a Proposal',
        description: 'Tap Apply on any idea to send the full package into Agent, where you can review or edit the trade.',
      },
    ],
  },

  trade_upgrade: {
    title: 'UPGRADE FINDER',
    steps: [
      {
        title: 'Pick Your Target',
        description: 'Choose one of your players to upgrade, then select which outgoing players or picks you are willing to use.',
      },
      {
        title: 'Set Your Price',
        description: 'Use the posture controls to decide whether to underpay, stay fair, or overpay for the upgrade.',
      },
      {
        title: 'Search the League',
        description: 'Results show upgrade packages across every roster, including optional picks coming back when the value needs to balance.',
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
        description: 'Shows KTC trade values for both players with league-adjusted multipliers. Tap Build Full Trade to open Agent with both players pre-loaded.',
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
