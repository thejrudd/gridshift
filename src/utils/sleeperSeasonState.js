function normalizeLeagueId(value) {
  return value == null ? null : String(value);
}

/**
 * Removes an interrupted or stale persisted league snapshot before hydration.
 * League IDs and roster IDs are season-local, so a snapshot is only usable
 * when its selected league ID and league season agree with the stored season.
 */
export function sanitizePersistedSleeperState(state) {
  if (!state || typeof state !== 'object') return state;

  const storedSeason = String(state.season ?? '').trim();
  const storedLeagueId = normalizeLeagueId(state.selectedLeagueId);
  const snapshotLeagueId = normalizeLeagueId(state.league?.league_id);
  const snapshotSeason = state.league?.season == null ? null : String(state.league.season).trim();
  const snapshotIsCoherent = Boolean(
    storedLeagueId
    && state.league
    && snapshotLeagueId === storedLeagueId
    && snapshotSeason === storedSeason,
  );

  const hasOrphanedSnapshotData = (state.rosters?.length ?? 0) > 0 || (state.leagueUsers?.length ?? 0) > 0;
  if ((!hasOrphanedSnapshotData && state.selectedLeagueId == null && state.league == null) || snapshotIsCoherent) {
    return state;
  }

  return {
    ...state,
    selectedLeagueId: null,
    league: null,
    rosters: [],
    leagueUsers: [],
    leagues: state.leaguesBySeason?.[storedSeason] ?? [],
  };
}
