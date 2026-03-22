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
        description: 'Projections start from a player\'s season average (prior weeks only) and apply four multipliers: (1) Location — home vs. away averages, used only when 3+ games of each are available. (2) Opponent — how many fantasy points the opposing defense has allowed to this position vs. league average, clamped between 0.65× and 1.45×. Requires at least 3 games of data. (3) Weather — cold temps, high winds, and rain each apply separate reductions, with passing positions penalized more than rushing. Indoor games skip weather entirely. (4) Snap % trend — compares snap share over the last 4 games vs. the season average, clamped between 0.75× and 1.25×. Captures role changes like RBBC shifts and depth-chart demotions. Applied to QB, RB, WR, and TE only. Formula: season avg × location × opponent × weather × snap trend.',
      },
      {
        title: 'Projection Floor & Ceiling',
        description: 'The range (e.g. proj 6.1–18.2) is built from the player\'s scoring history. The floor is the average of their bottom 25% of games — a realistic bad week. The ceiling is the average of their top 25% — a realistic big week. Both are then adjusted by the same opponent and weather multipliers as the main projection. The range shows the realistic spread of outcomes, not a guarantee.',
      },
      {
        title: 'Matchup Difficulty',
        description: 'Each player card shows a matchup difficulty badge: Easy, Favorable, Average, Challenging, or Difficult. The badge is based on a percentile ranking — the opposing defense is ranked against all 32 teams by how many fantasy points they allow to that position on average (prior weeks only). The top 20% most generous defenses are Easy; the bottom 20% stingiest are Difficult. The badge only appears once at least 3 games of data are available for 5 or more teams.',
      },
      {
        title: 'Player Drilldown',
        description: 'Tap any player to open a detailed panel with three sections: Rankings (week and season position rank, average PPG), Game Context (opponent, venue, average points allowed to this position by the opposing defense, and the projection range), and a stat-by-stat Fantasy Score breakdown showing exactly how this week\'s points were earned.',
      },
      {
        title: 'Scoring Settings',
        description: 'All projections and rankings use your league\'s actual scoring rules, imported automatically from Sleeper when you connect. You can review or adjust them in the Scoring tab. Changes take effect immediately across all projections.',
      },
      {
        title: 'Heatmap Tab — Overview',
        description: 'The Heatmap tab is a full-season grid showing every NFL team\'s performance week by week. Use the Phase filter to switch between Offense (what opposing offenses scored against each defense — useful for spotting matchup strengths and weaknesses) and Defense (what each team\'s own IDP players produced in fantasy points or individual defensive stats).',
      },
      {
        title: 'Heatmap Tab — Offense Phase',
        description: 'Filter by offensive position (All, QB, RB, WR, TE, K) to isolate matchup data by position group. Switch the Stat to Fantasy Points, Receiving Yards, Rushing Yards, or Game Score (the actual NFL points allowed that week). Each cell shows the stat value and a small opponent label. The AVG column reflects the season per-game average weighted by games played — weeks where the defense held the opponent to zero count toward the denominator.',
      },
      {
        title: 'Heatmap Tab — Defense Phase',
        description: 'Filter by defensive position group (All, DL, LB, DB). Use the Stat filter to isolate specific stats: Fantasy Points, Sacks, Interceptions, Forced Fumbles, Tackles for Loss, Passes Defended, QB Hits, or Defensive Touchdowns. Color coding is flipped in this phase — green means more points or stats (better IDP output), red means fewer.',
      },
      {
        title: 'Heatmap Tab — Color',
        description: 'The Color toggle controls the scale: Overall compares every cell against the full-season range; By Week normalizes each column independently (good for spotting weekly outliers); By Team normalizes each row independently (good for comparing a team\'s relative highs and lows). In Offense phase, green = harder matchup (defense is stingy). In Defense phase, green = more production. If you\'ve set a favorite team under My Team, a team colors toggle appears to replace the default heatmap palette with your team\'s colors.',
      },
      {
        title: 'Heatmap Tab — Sorting & Drilldown',
        description: 'Click any column header to sort by that column; click again to reverse. The Team column has three sort modes: A–Z, Conference (AFC then NFC, alphabetical within), and Division (grouped by division). Tap any data cell to open a drilldown showing which players contributed to that week\'s total, with a point breakdown per player. Tap a player\'s name in the drilldown to jump directly to their profile in the Statistics section.',
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
        description: 'The Stats tab shows a full side-by-side stat table for the selected season. Stats are grouped by category (Passing, Rushing, Receiving, Tackling, etc.) based on position, using the same source as the Statistics tab — every stat available from ESPN is shown. A gold ▲ marks the better value in each row. Toggle Advanced to reveal deeper metrics like QBR, yards after catch, 50+ yard field goals, and more.',
      },
      {
        title: 'Year Navigation',
        description: 'Use the year pills at the top of the Stats panel to switch between seasons (2018–present) or Career totals. Each player\'s data loads independently — switching years fetches both players\' stats for that season. A dimmed pill means that year is still loading.',
      },
      {
        title: 'Fantasy Panel',
        description: 'The Fantasy tab requires a connected Sleeper league (connect in Companion). It shows season total points, avg PPG, last 4-week average, positional rank, and a projected floor/ceiling for the upcoming week. The stat breakdown below shows how many fantasy points each scoring category contributed — pass yards × scoring rate, touchdowns × points per TD, and so on — using your league\'s actual scoring rules.',
      },
      {
        title: 'Stat Category Rankings',
        description: 'Each row in the Fantasy stat breakdown shows a small positional rank below each player\'s value (e.g. 3rd, 12th). Rankings are computed against all players at the same position in the Sleeper database, sorted by fantasy points earned in that category — so rank 1 means the most fantasy value generated from that stat.',
      },
      {
        title: 'ESPN → Sleeper Matching',
        description: 'When you select an ESPN player, the app automatically looks them up in your Sleeper player database using their ESPN ID, then falls back to a name and position match. If a player can\'t be matched — typically because they\'re not in the Sleeper database at all — their Fantasy panel column will show "—" throughout.',
      },
      {
        title: 'Trade Panel',
        description: 'The Trade tab is a placeholder for the upcoming Trade Agent feature, which will show KeepTradeCut trade values and generate trade proposals in either direction based on your roster and league context.',
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
