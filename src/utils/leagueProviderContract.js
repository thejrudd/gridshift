// Provider-neutral league data contract (Stage 5.0 integration spike).
//
// Fantasy views read league data through this contract so one component can
// show a Sleeper league or a GridShift league. A provider implementation maps
// its source into these shapes; it never hands another provider's ids, caches,
// seasons, or roster numbers to a view. Full contract, per-view audit, and
// migration status: docs/League Provider Contract.md.
//
// Phase 5.0 implements the Standings slice only. Every other shape below is
// written down so later phases build against one agreed contract, but no view
// reads it yet.

/** Provider ids. `sleeper` is the default and needs no configuration. */
export const LEAGUE_PROVIDER_IDS = Object.freeze({
  SLEEPER: 'sleeper',
  GRIDSHIFT: 'gridshift',
});

/**
 * Capabilities a provider can report. Read capabilities describe data the
 * provider can supply; platform capabilities are functions only a hosted
 * league has (Sleeper owns them for Sleeper leagues, so core never offers them
 * there).
 */
export const LEAGUE_CAPABILITIES = Object.freeze({
  // Read
  LEAGUE: 'league',
  TEAMS: 'teams',
  ROSTERS: 'rosters',
  MATCHUPS: 'matchups',
  STANDINGS: 'standings',
  PLAYERS: 'players',
  STATS: 'stats',
  SCORING: 'scoring',
  TRANSACTIONS: 'transactions',
  ACTIVITY: 'activity',
  HISTORY: 'history',
  BRACKETS: 'brackets',
  DRAFT_PICKS: 'draftPicks',
  PROJECTIONS: 'projections',
  LIVE_SCORING: 'liveScoring',
  // Platform
  COMMISSIONER: 'commissioner',
  DRAFT: 'draft',
  LIVE_TRANSACTIONS: 'liveTransactions',
  LINEUP_EDITING: 'lineupEditing',
});

const C = LEAGUE_CAPABILITIES;

/**
 * What each provider supplies today. `consumed` lists the capabilities core
 * views actually read through the contract; the rest are supplied by the
 * provider but not wired yet (views keep their existing data path for Sleeper
 * and show an unavailable state for GridShift).
 */
export const LEAGUE_PROVIDERS = Object.freeze({
  [LEAGUE_PROVIDER_IDS.SLEEPER]: Object.freeze({
    id: LEAGUE_PROVIDER_IDS.SLEEPER,
    label: 'Sleeper',
    capabilities: Object.freeze([
      C.LEAGUE, C.TEAMS, C.ROSTERS, C.MATCHUPS, C.STANDINGS, C.PLAYERS, C.STATS, C.SCORING,
      C.TRANSACTIONS, C.ACTIVITY, C.HISTORY, C.BRACKETS, C.DRAFT_PICKS, C.PROJECTIONS, C.LIVE_SCORING,
    ]),
    consumed: Object.freeze([C.STANDINGS]),
  }),
  [LEAGUE_PROVIDER_IDS.GRIDSHIFT]: Object.freeze({
    id: LEAGUE_PROVIDER_IDS.GRIDSHIFT,
    label: 'GridShift',
    // The platform API serves all of these; phase 5.0 wires Standings only.
    capabilities: Object.freeze([
      C.LEAGUE, C.TEAMS, C.ROSTERS, C.MATCHUPS, C.STANDINGS, C.PLAYERS, C.STATS, C.SCORING,
      C.TRANSACTIONS, C.ACTIVITY, C.COMMISSIONER, C.DRAFT, C.LIVE_TRANSACTIONS, C.LINEUP_EDITING,
    ]),
    consumed: Object.freeze([C.STANDINGS]),
  }),
});

export function getLeagueProvider(providerId) {
  return LEAGUE_PROVIDERS[providerId] ?? LEAGUE_PROVIDERS[LEAGUE_PROVIDER_IDS.SLEEPER];
}

/** True when the provider supplies the capability and core reads it through the contract. */
export function canUseLeagueCapability(providerId, capability) {
  const provider = LEAGUE_PROVIDERS[providerId];
  return Boolean(provider?.capabilities.includes(capability) && provider.consumed.includes(capability));
}

/**
 * @typedef {'sleeper' | 'gridshift'} LeagueProviderId
 *
 * @typedef {object} LeagueSummary
 * @property {LeagueProviderId} provider
 * @property {string} leagueId      Provider-scoped id. Never compared across providers.
 * @property {string} name
 * @property {string} season        Four-digit NFL season.
 * @property {'commissioner' | 'manager' | null} viewerRole  Null when the provider has no signed-in viewer (Sleeper).
 *
 * @typedef {object} LeagueTeam
 * @property {string} teamId        Provider-scoped (Sleeper roster id as a string, GridShift team uuid).
 * @property {string} name
 * @property {string} managerName
 * @property {boolean} isViewer
 *
 * @typedef {object} StandingRow
 * @property {string} participantId Stable key for the row (Sleeper user id or season-roster key; GridShift team uuid).
 * @property {number} seed          Rank shown at the left.
 * @property {string} teamName
 * @property {string} managerName
 * @property {number} wins
 * @property {number} losses
 * @property {number} ties
 * @property {Array<'W' | 'L' | 'T'>} recentForm  Up to five most recent counted results, oldest first.
 * @property {number} pointsFor
 * @property {number} pointsAgainst
 *
 * @typedef {object} SeasonStandings
 * @property {string} season
 * @property {number} throughWeek   Last counted (final) week; 0 when nothing is final.
 * @property {number} playoffTeamCount
 * @property {StandingRow[]} rows   Ordered by the provider's own tiebreakers.
 * @property {Array<{ id: string, label: string, rows: StandingRow[] }>} divisions
 *
 * @typedef {object} StandingsPostseason
 * @property {'bracket' | 'championship'} kind  `bracket`: a provider-run playoff bracket (Sleeper);
 *   `championship`: a single championship matchup between the top two (GridShift pilot).
 * @property {number | null} week   First playoff week (bracket) or championship week.
 *
 * @typedef {object} StandingsModel
 * @property {LeagueProviderId} provider
 * @property {'loading' | 'error' | 'signed-out' | 'empty' | 'unsupported' | 'ready'} status
 * @property {string} season
 * @property {string} error
 * @property {() => void} retry
 * @property {boolean} historical   True for a completed season (final table and brackets).
 * @property {SeasonStandings | null} standings
 * @property {object | null} brackets         `normalizeSeasonBrackets` shape; Sleeper only for now.
 * @property {object | null} finalPlacements  `buildFinalPlacements` shape; Sleeper only for now.
 * @property {StandingsPostseason | null} postseason
 */
