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
  companion: {
    title: 'HOW TO USE COMPANION',
    steps: [
      {
        title: 'Connect Your League',
        description: 'Enter your Sleeper username to get started, then select your league from the list. The app imports your roster, lineup, scoring rules, and weekly matchup data directly from Sleeper.',
      },
      {
        title: 'Reading the Matchup Screen',
        description: 'The Matchup tab compares your starters against your opponent\'s at each lineup slot side-by-side. Each card shows the player\'s actual points scored this week, the projected point range for the game, and who they\'re facing. Tap any player to see a full breakdown.',
      },
      {
        title: 'How Projections Are Calculated',
        description: 'Projections start from a player\'s season average and apply four multipliers: (1) Location — home vs away splits, if 3+ games each are available. (2) Opponent — how many points the opposing defense allows at this position vs league average, clamped between 0.65× and 1.45×. (3) Weather — cold temps, high winds, and heavy rain reduce projections for passing positions more than rushing. (4) Snap % trend — compares the player\'s snap usage over the last 4 games vs their season average, capturing role changes like dual-back committees, emerging receivers, and depth-chart shifts. The formula is: season avg × location × opponent × weather × snap trend.',
      },
      {
        title: 'Matchup Difficulty',
        description: 'Each player card shows an "Easy matchup," "Avg matchup," or "Hard matchup" badge. This reflects how the opposing defense ranks against this position league-wide. Easy (green) means the defense allows 10%+ more points than average; Hard (red) means 10%+ fewer. At least 3 games of data against that defense are required before a badge appears.',
      },
      {
        title: 'Projection Range',
        description: 'The range shown (e.g. proj 6.1–18.2) represents the floor and ceiling based on the player\'s 10th–90th percentile historical games, adjusted for opponent difficulty and weather. It shows the realistic spread of outcomes — not a guarantee. The single projected number is the adjusted season average.',
      },
      {
        title: 'Player Drilldown',
        description: 'Tap any player to open a detailed panel with three sections: Rankings (week and season position rank, average PPG), Game Context (opponent, venue, defense stats showing average points allowed to that position, and the projection range), and a stat-by-stat Fantasy Score breakdown showing exactly how this week\'s points were earned.',
      },
      {
        title: 'Scoring Settings',
        description: 'All projections and rankings use your league\'s actual scoring rules, imported automatically from Sleeper when you connect. If your league uses custom settings, you can review or adjust them in the Scoring tab. Changes take effect immediately across all projections.',
      },
    ],
  },
};

const Guide = ({ onClose, activeTab = 'predictions' }) => {
  const content = GUIDE_CONTENT[activeTab] ?? GUIDE_CONTENT.predictions;
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);

    // Lock body scroll while guide is open
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
