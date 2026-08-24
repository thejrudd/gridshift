import Modal from './Modal';

const GUIDE_CONTENT = {
  predictions_picks: {
    title: 'PICKS',
    steps: [
      {
        title: 'Pick a mode',
        description: 'Predict Record edits wins and division wins by team. Advanced Mode opens a team schedule for game-by-game W/L/T picks.',
      },
      {
        title: 'Balance the season',
        description: 'Quick records keep division records possible; saved game picks sync the opponent result automatically.',
      },
      {
        title: 'Watch progress',
        description: 'The sidebar and mobile header track completed teams and games. Standings and Playoffs update from the records you enter.',
      },
      {
        title: 'Save your work',
        description: 'Use Actions to export predictions as JSON, import a saved file, randomize picks, or reset the season.',
      },
    ],
  },

  predictions_standings: {
    title: 'STANDINGS',
    steps: [
      {
        title: 'Read the divisions',
        description: 'Teams are ranked inside each division from your current predictions, with record and division record shown together.',
      },
      {
        title: 'Fix a ranking',
        description: 'Return to Picks to change a team record or game picks. Standings recalculate immediately.',
      },
      {
        title: 'Set playoff context',
        description: 'Division winners and wild cards feed the Playoffs tab once predicted records exist.',
      },
    ],
  },

  predictions_playoffs: {
    title: 'PLAYOFFS',
    steps: [
      {
        title: 'Build from records',
        description: 'Predict records in Picks first; the bracket uses the live AFC/NFC seeds from those records.',
      },
      {
        title: 'Pick winners',
        description: 'Tap a team in each matchup to advance them. Changing an earlier pick clears dependent later-round picks.',
      },
      {
        title: 'Finish the bracket',
        description: 'Choose conference champions, then select a Super Bowl winner from the final matchup.',
      },
    ],
  },

  statistics_browser: {
    title: 'STATISTICS',
    steps: [
      {
        title: 'Find a player or team',
        description: 'Search by player, position, team, city, conference, or division; use position chips to narrow player results.',
      },
      {
        title: 'Open teams',
        description: 'Team cards are grouped by conference and division, then open roster, starters, franchise history, and schedule access.',
      },
      {
        title: 'Open players',
        description: 'Player rows and search results open profiles with game stats, fantasy views, visuals, and trade actions when available.',
      },
    ],
  },

  statistics_schedule: {
    title: 'SCHEDULE',
    steps: [
      {
        title: 'Choose view',
        description: "View by Week shows the league slate. View by Team shows one team's full schedule and bye.",
      },
      {
        title: 'Filter the slate',
        description: 'Use week chips, the team selector, and All/International/PrimeTime/Holiday filters to narrow games.',
      },
      {
        title: 'Open game stats',
        description: 'Final games with ESPN data show a Game Stats action that opens the box-score page.',
      },
    ],
  },

  statistics_standings: {
    title: 'STANDINGS',
    steps: [
      {
        title: 'Read the divisions',
        description: 'Division tables rank teams by schedule results and show overall, division, and conference records.',
      },
      {
        title: 'Scan the conferences',
        description: 'Conference tables roll AFC and NFC teams into separate ranked views with the same record context.',
      },
    ],
  },

  statistics_team: {
    title: 'TEAM PAGE',
    steps: [
      {
        title: 'Scan the team',
        description: 'The hero shows team identity, history, and a View Schedule action when schedule data is loaded.',
      },
      {
        title: 'Check starters',
        description: 'Use Offense, Defense, and Special Teams to switch projected starter groups.',
      },
      {
        title: 'Browse roster',
        description: 'Expand position groups in Full Roster, then tap a player to open their profile.',
      },
    ],
  },

  statistics_player: {
    title: 'PLAYER PAGE',
    steps: [
      {
        title: 'Use hero actions',
        description: 'Open career highlights, view the team schedule, compare the player, or build a trade when a Sleeper match exists.',
      },
      {
        title: 'Switch stat modes',
        description: 'Game Stats uses ESPN data. Fantasy Values and Visual unlock when linked Sleeper scoring and player data are available.',
      },
      {
        title: 'Expand seasons',
        description: 'Open a season or Career row to load details, game logs, honors, and fantasy scoring for that year.',
      },
    ],
  },

  statistics_game: {
    title: 'GAME STATS',
    steps: [
      {
        title: 'Read the matchup',
        description: 'The hero shows teams, kickoff or status, and the final score when available.',
      },
      {
        title: 'Compare box score',
        description: 'Team Stats lists ESPN summary categories side by side for the away and home teams.',
      },
      {
        title: 'Go back',
        description: 'Use Back to Schedule to return to the schedule filters that led here.',
      },
    ],
  },

  scout_prospects: {
    title: 'PROSPECTS',
    steps: [
      {
        title: 'Shape the board',
        description: 'Sort by projected pick, prospect rank, grade, dynasty ADP, combine drills, or production.',
      },
      {
        title: 'Filter prospects',
        description: 'Use position chips, Combine Data, Team Colors, and search to narrow the class.',
      },
      {
        title: 'Open reports',
        description: 'Tap a prospect for draft slot, production, combine, and profile details. Use compare on two players to view them side by side.',
      },
      {
        title: 'View statistics',
        description: 'From a prospect profile, open college statistics when production data is available.',
      },
    ],
  },

  scout_picks: {
    title: 'DRAFT PICKS',
    steps: [
      {
        title: 'Track slots',
        description: 'Picks shows the live or fallback 2026 draft order grouped by round.',
      },
      {
        title: 'Filter the board',
        description: 'Use Remaining, All, round chips, and the team filter to focus the list.',
      },
      {
        title: 'Open team picks',
        description: 'Tap a pick row to see every pick currently held by that team.',
      },
    ],
  },

  scout_results: {
    title: 'DRAFT RESULTS',
    steps: [
      {
        title: 'Follow selections',
        description: 'Results fills from the live feed or static results and links matched prospects back to their reports.',
      },
      {
        title: 'Filter results',
        description: 'Use position chips and team filters to isolate the picks you care about.',
      },
      {
        title: 'Change order',
        description: 'Top Picks shows draft order; Most Recent puts the newest selections first during the draft.',
      },
    ],
  },

  companion_roster: {
    title: 'ROSTERS',
    steps: [
      {
        title: 'Choose a team',
        description: 'Start on your roster, then select another manager to inspect their players by position under your league scoring.',
      },
      {
        title: 'Open players or picks',
        description: 'Tap a player for details, or switch to Draft Picks to review future-pick ownership across the league.',
      },
      {
        title: 'Start trades',
        description: 'Trade loads your players as give assets and opponent players as get assets with that manager selected.',
      },
    ],
  },

  companion_rankings: {
    title: 'RANKINGS',
    steps: [
      {
        title: 'Rank the league',
        description: 'Rankings uses your league scoring to sort all fantasy-relevant players with true overall or positional ranks.',
      },
      {
        title: 'Filter and sort',
        description: 'Reshape the list with position chips, fantasy team filters, search, rank scope, and stat sorts. Toggle stat sorts between Fantasy Value and Game Stats when both apply.',
      },
      {
        title: 'Export the view',
        description: 'Use Export to download the current list as CSV or text, keeping your filters and owner names. Review historical production in the Scoring tab under your current league rules before comparing position strength.',
      },
      {
        title: 'Open players',
        description: 'Tap a row for a preview or full Statistics profile.',
      },
    ],
  },

  companion_matchup: {
    title: 'MATCHUPS',
    steps: [
      {
        title: 'Choose the week and matchup',
        description: 'Use the week control, matchup chooser, or previous and next buttons to move through the league slate.',
      },
      {
        title: 'Read the score',
        description: 'The header compares both managers; tap either score panel for a lineup scoring breakdown.',
      },
      {
        title: 'Inspect players',
        description: 'Tap a starter or bench row for projection, matchup difficulty, weekly stats, and a path to the full profile.',
      },
    ],
  },

  companion_waiver: {
    title: 'WAIVERS',
    steps: [
      {
        title: 'Find free agents',
        description: 'Waiver lists players not rostered in your league and ranks them by recent form, season output, or projection.',
      },
      {
        title: 'Narrow results',
        description: 'Use position chips and search; projected sorting adds upcoming opponent and schedule context where available.',
      },
      {
        title: 'Read signals',
        description: 'Hot/cold tags, projected points, season points, and four-week average help prioritize adds.',
      },
      {
        title: 'Open players',
        description: 'Tap a row for preview or full profile when ESPN data is matched.',
      },
    ],
  },

  companion_league: {
    title: 'LEAGUE',
    steps: [
      {
        title: 'Switch views',
        description: 'Rosters shows each manager and their players. Draft Picks shows current pick ownership across future years.',
      },
      {
        title: 'Browse managers',
        description: "Select an owner to inspect their roster, player stats, and status by position.",
      },
      {
        title: 'Use trade shortcuts',
        description: 'Trade buttons load your players as give assets and opponent players as get assets in Agent.',
      },
      {
        title: 'Read picks',
        description: 'In Draft Picks, the matrix marks own, acquired, and traded-away picks by year and round.',
      },
    ],
  },

  companion_heatmap: {
    title: 'HEATMAP',
    steps: [
      {
        title: 'Choose the lens',
        description: 'Phase switches offense allowed vs defense production; position and stat controls decide what each cell measures.',
      },
      {
        title: 'Filter context',
        description: 'Location, color scope, favorite-team colors, spread, and over/under controls change how the grid is interpreted.',
      },
      {
        title: 'Sort the grid',
        description: 'Click week, average, or team headers to reorder; team sorting can group alphabetically, by conference, or by division.',
      },
      {
        title: 'Drill into cells',
        description: 'Tap a populated cell to see weekly contributors, then open a player profile when a match is available.',
      },
    ],
  },

  companion_defense: {
    title: 'DEFENSES',
    steps: [
      {
        title: 'Pick what is allowed',
        description: 'Choose Game Stats or Fantasy Value, then select QB/RB/WR/TE and the stat category.',
      },
      {
        title: 'Rank defenses',
        description: 'Sort by defense name, total allowed, or per-game allowed to find favorable or difficult matchups.',
      },
      {
        title: 'Search and inspect',
        description: 'Search teams to narrow the list; tap a defense for weekly breakdown and player contributors.',
      },
    ],
  },

  companion_scoring: {
    title: 'SCORING',
    steps: [
      {
        title: 'Sync rules',
        description: 'Use Sync from your current league to refresh Sleeper scoring settings.',
      },
      {
        title: 'Choose visibility',
        description: 'Active shows only non-zero fields; All shows every supported scoring key.',
      },
      {
        title: 'Review historical results',
        description: 'Choose a prior completed season to recalculate its production under the current league rules, then Reset season to return to the latest prior season.',
      },
      {
        title: 'Understand impact',
        description: 'Fantasy rankings, projections, matchup values, and trade adjustments use the active scoring rules.',
      },
    ],
  },

  league_standings: {
    title: 'LEAGUE STANDINGS',
    steps: [
      {
        title: 'Choose a season',
        description: 'Use the league-year control to compare the current table with final standings from linked seasons.',
      },
      {
        title: 'Read the race',
        description: 'Review divisions, recent form, playoff seeds, and evidence-backed postseason brackets when available.',
      },
    ],
  },

  league_history: {
    title: 'LEAGUE HISTORY',
    steps: [
      {
        title: 'Review the league lifetime',
        description: 'Compare managers across linked seasons through championships, records, rivalries, and the lifetime leaderboard.',
      },
      {
        title: 'Inspect the evidence',
        description: 'Open record and rivalry details to see the seasons and matchups behind each result.',
      },
    ],
  },

  league_activity: {
    title: 'LEAGUE ACTIVITY',
    steps: [
      {
        title: 'Choose a season',
        description: 'Activity shows completed transactions from the selected linked league season.',
      },
      {
        title: 'Filter the feed',
        description: 'Narrow the ledger by transaction type, manager, player, pick, or waiver budget.',
      },
    ],
  },

  trade_agent: {
    title: 'AGENT',
    steps: [
      {
        title: 'Build the deal',
        description: 'Choose a partner, then add players or picks to either side with the shelf, add buttons, or Search All Rostered Players.',
      },
      {
        title: 'Read the value',
        description: 'The scoreboard totals both sides, names who the deal favors, and marks close offers as fair.',
      },
      {
        title: 'Balance it',
        description: 'Suggest Adjustment proposes adds, removes, or swaps; Value Trends shows recent KTC movement for players in the offer.',
      },
      {
        title: 'Check assumptions',
        description: 'The value note explains format, superflex/1QB, and league-adjusted scoring/pick context.',
      },
    ],
  },

  trade_intelligence: {
    title: 'INTELLIGENCE',
    steps: [
      {
        title: 'Choose a partner',
        description: 'Pick a manager so ideas can use your roster, their roster, and available picks.',
      },
      {
        title: 'Set the lens',
        description: 'Fix Needs targets lineup help; Use Surplus looks for ways to convert depth into players or picks.',
      },
      {
        title: 'Filter ideas',
        description: 'Sort and filter packages by fit, upgrade, cost, players, and picks.',
      },
      {
        title: 'Apply a package',
        description: 'Review give/get totals and Why It Helps, then Apply to move the idea into Agent for final edits.',
      },
    ],
  },

  trade_upgrade: {
    title: 'UPGRADES',
    steps: [
      {
        title: 'Pick a target',
        description: 'Choose the player you want to acquire; the target card shows value, rank, and scoring context.',
      },
      {
        title: 'Choose movers',
        description: 'Select players you are willing to move, and decide whether packages can combine multiple assets.',
      },
      {
        title: 'Set picks and posture',
        description: 'Allow your picks, picks back, and posture to control how aggressive the search should be.',
      },
      {
        title: 'Review paths',
        description: 'Find Upgrades groups offers by manager; sort the paths and Apply one to Agent.',
      },
    ],
  },

  compare: {
    title: 'COMPARE',
    steps: [
      {
        title: 'Select players',
        description: 'Open player slots and search all NFL rosters to choose the comparison.',
      },
      {
        title: 'Compare stats',
        description: 'Switch years or Career, then toggle deeper stat rows when advanced data is available.',
      },
      {
        title: 'Compare fantasy',
        description: 'A connected fantasy league unlocks fantasy scoring under that league season and scoring format.',
      },
      {
        title: 'Open profiles',
        description: 'Player cards can jump to Statistics, and trade actions can load matched players into Agent.',
      },
    ],
  },

  'draft_war-room': {
    title: 'DRAFT',
    steps: [
      {
        title: 'Build by position',
        description: 'Add players from Big Board into each position list, then rank them in your preferred order.',
      },
      {
        title: 'Track availability',
        description: 'Sleeper picks mark drafted players as gone while keeping them on your saved board for context.',
      },
      {
        title: 'Use the draft banner',
        description: 'Pre-draft setup appears before the room starts; live drafts show the current pick and your next pick.',
      },
    ],
  },

  'draft_my-board': {
    title: 'BOARD',
    steps: [
      {
        title: 'Build lanes',
        description: 'Drag or add players from Available into position lanes, then reorder each lane as your draft priority changes.',
      },
      {
        title: 'Sort overall',
        description: 'Switch to Overall to review the same saved players by Market, Rating, PPG, Tier, or name without changing lane order.',
      },
      {
        title: 'Watch your roster',
        description: 'Projected Roster keeps locked Sleeper players current, then marks the top available Board target for each open position.',
      },
    ],
  },

  draft_results: {
    title: 'RESULTS',
    steps: [
      {
        title: 'Review the order',
        description: 'Before picks are made, Results shows the Sleeper pick order with traded-pick ownership applied.',
      },
      {
        title: 'Track completed picks',
        description: 'As Sleeper picks arrive, Results switches to drafted player rows sorted first pick first by default.',
      },
      {
        title: 'Filter the board',
        description: 'Use position, sort, and fantasy-team controls to narrow completed picks during or after the draft.',
      },
    ],
  },
};

function getGuideKey({
  activeTab,
  seasonView,
  statisticsView,
  companionView,
  leagueView,
  tradeView,
  scoutView,
  draftView,
}) {
  if (activeTab === 'predictions') {
    return seasonView === 'predictions' ? 'predictions_picks' : `predictions_${seasonView}`;
  }
  if (activeTab === 'statistics') return `statistics_${statisticsView}`;
  if (activeTab === 'fantasy' || activeTab === 'companion') {
    const legacyView = {
      rosters: 'roster',
      matchups: 'matchup',
      waivers: 'waiver',
      defenses: 'defense',
    }[companionView] ?? companionView;
    return `companion_${legacyView}`;
  }
  if (activeTab === 'league') return `league_${leagueView}`;
  if (activeTab === 'trade') return `trade_${tradeView}`;
  if (activeTab === 'scout') return `scout_${scoutView}`;
  if (activeTab === 'draft') return `draft_${draftView}`;
  return activeTab;
}

const Guide = ({
  onClose,
  activeTab = 'predictions',
  seasonView = 'predictions',
  statisticsView = 'browser',
  companionView = 'rosters',
  leagueView = 'standings',
  tradeView = 'agent',
  scoutView = 'prospects',
  draftView = 'war-room',
}) => {
  const key = getGuideKey({
    activeTab,
    seasonView,
    statisticsView,
    companionView,
    leagueView,
    tradeView,
    scoutView,
    draftView,
  });
  const content = GUIDE_CONTENT[key] ?? GUIDE_CONTENT[activeTab] ?? GUIDE_CONTENT.predictions_picks;

  return (
    <Modal
      onClose={onClose}
      ariaLabel={`${content.title} guide`}
      containerClassName="max-w-2xl flex max-h-[90vh] flex-col"
      containerStyle={{ border: '1px solid var(--color-separator)' }}
    >
      <div
        className="flex items-center justify-between gap-4 p-5 sm:p-6"
        style={{
          background: 'var(--color-bg-tertiary)',
          borderBottom: '1px solid var(--color-separator)',
        }}
      >
        <h2
          className="font-display text-2xl tracking-wide"
          style={{ color: 'var(--color-label)' }}
        >
          {content.title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full text-3xl leading-none transition-opacity hover:opacity-70"
          style={{ color: 'var(--color-label-secondary)' }}
          aria-label="Close guide"
        >
          &times;
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
        {content.steps.map((step, index) => (
          <div key={step.title} className="flex gap-4">
            <div
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold"
              style={{
                background: 'var(--color-signature)',
                color: 'var(--color-signature-fg)',
              }}
            >
              {index + 1}
            </div>
            <div>
              <h3 className="font-semibold" style={{ color: 'var(--color-label)' }}>
                {step.title}
              </h3>
              <p className="mt-0.5 text-sm" style={{ color: 'var(--color-label-secondary)' }}>
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
};

export default Guide;
