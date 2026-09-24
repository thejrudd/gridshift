// ── Fantasy ownership lookup ───────────────────────────────────────────────
// Who, in the connected league, rosters a given player.
//
// Two surfaces need the same answer and were each about to derive it their own
// way: the search palette, which shows it on a player result and offers the two
// places it leads, and the Statistics player header, which had the fact
// (`playerOwnerRosterId`) but only ever rendered "Trade Target" — leaving the
// user to open a trade against a manager the page never named.
//
// Reserve and taxi count as rostered. A player stashed on IR is still owned, and
// a search result that called him a free agent would be wrong in the way that
// matters: it is the ownership, not the lineup slot, that decides who you would
// be trading with.

const ROSTER_FIELDS = ['players', 'reserve', 'taxi'];

/**
 * Does this roster hold the player?
 *
 * Exported because the player header asks the question directly about one
 * roster — its own — and building a whole league map for that would be waste.
 */
export function rosterHasSleeperPlayer(roster, sleeperId) {
  if (!roster || sleeperId == null) return false;
  const normalizedId = String(sleeperId);
  return ROSTER_FIELDS.some((field) => (
    (roster[field] ?? []).some((playerId) => String(playerId) === normalizedId)
  ));
}

function teamNameFor(roster, leagueUsers) {
  const owner = leagueUsers?.find?.((user) => user.user_id === roster.owner_id);
  return owner?.metadata?.team_name || null;
}

/**
 * Build a `sleeperId → owner` map for the whole league.
 *
 * One pass over the rosters rather than a scan per lookup: the search palette
 * asks this question on every keystroke, for whichever result is active, and a
 * per-keystroke scan of a dozen rosters times a few hundred players is the kind
 * of cost that shows up as input lag.
 *
 * Returns an empty map when there is no league, so callers never branch on it.
 */
export function buildFantasyOwnership({
  rosters = [],
  leagueUsers = [],
  getUserDisplayName = null,
  myRosterId = null,
} = {}) {
  const byPlayerId = new Map();

  for (const roster of rosters ?? []) {
    const rosterId = roster?.roster_id;
    if (rosterId == null) continue;

    const managerName = typeof getUserDisplayName === 'function'
      ? getUserDisplayName(roster.owner_id)
      : null;
    const teamName = teamNameFor(roster, leagueUsers);
    const owner = {
      rosterId: Number(rosterId),
      teamName: teamName ?? null,
      managerName: managerName ?? null,
      // What to call this team in one line. The team name is what the league
      // sees; the manager is the fallback when nobody set one.
      label: teamName || managerName || `Team ${rosterId}`,
      isMine: myRosterId != null && String(myRosterId) === String(rosterId),
    };

    for (const field of ROSTER_FIELDS) {
      for (const playerId of roster[field] ?? []) {
        if (playerId == null) continue;
        byPlayerId.set(String(playerId), owner);
      }
    }
  }

  return byPlayerId;
}

/**
 * The owner of one player, or null when nobody in the league rosters them.
 *
 * `ownership` is the map above. A null result means free agent *in this league*,
 * which is only a meaningful claim when a league is connected — callers with no
 * league pass no map and get null for everyone, so they must not render the
 * "free agent" wording on the strength of it.
 */
export function findFantasyOwner(ownership, sleeperId) {
  if (!ownership || sleeperId == null) return null;
  return ownership.get(String(sleeperId)) ?? null;
}
