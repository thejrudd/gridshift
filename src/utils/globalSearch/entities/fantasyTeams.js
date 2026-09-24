// ── Fantasy team records ───────────────────────────────────────────────────
// Built from the connected league's rosters and users, which SleeperContext
// hydrates from localStorage at mount — so these are available immediately and
// never need a fetch of their own.
//
// Team names come from league metadata. Manager profile names and usernames are
// read separately so a configured team name cannot hide either search term.

import { KIND_FANTASY_TEAM, makeRecord, nameTokens } from './record.js';

function findLeagueUser(roster, leagueUsers) {
  const ownerId = String(roster?.owner_id ?? '');
  if (!ownerId) return null;
  return leagueUsers?.find?.((user) => String(user?.user_id ?? '') === ownerId) ?? null;
}

function cleanName(value) {
  return typeof value === 'string' ? value.trim() || null : null;
}

function fallbackManagerName(roster, teamName, getUserDisplayName) {
  if (typeof getUserDisplayName !== 'function') return null;
  const fallback = cleanName(getUserDisplayName(roster?.owner_id));
  if (!fallback || fallback.toLowerCase() === 'unknown') return null;
  // The shared helper prefers metadata.team_name. Do not mistake that fallback
  // for the manager's profile name when the league user record has no profile.
  if (fallback.toLowerCase() === cleanName(teamName)?.toLowerCase()) return null;
  return fallback;
}

/**
 * One record per fantasy team, findable by team name, manager display name,
 * and manager username.
 *
 * Weight is high: in a connected league these are a dozen records the user
 * knows personally, and a query matching one is almost never a coincidence.
 */
export function buildFantasyTeamRecords({
  rosters = [],
  leagueUsers = [],
  getUserDisplayName = null,
} = {}) {
  return (rosters ?? []).reduce((records, roster) => {
    const rosterId = roster?.roster_id;
    if (rosterId == null) return records;

    const owner = findLeagueUser(roster, leagueUsers);
    const teamName = cleanName(owner?.metadata?.team_name);
    const managerUsername = cleanName(owner?.username);
    const managerName = cleanName(owner?.display_name)
      || managerUsername
      || fallbackManagerName(roster, teamName, getUserDisplayName);
    const label = teamName || managerName || `Team ${rosterId}`;
    const sublabel = teamName && managerName ? managerName : 'Fantasy team';

    records.push(makeRecord({
      kind: KIND_FANTASY_TEAM,
      id: String(rosterId),
      label,
      sublabel,
      tokens: [
        ...nameTokens(teamName),
        ...nameTokens(managerName),
        ...nameTokens(managerUsername),
      ],
      route: {
        activeTab: 'fantasy',
        companionView: 'rosters',
        leagueSubview: 'roster',
        leagueRosterId: String(rosterId),
      },
      weight: 0.95,
      meta: {
        rosterId: Number(rosterId),
        ownerId: roster.owner_id ?? null,
        managerName: managerName ?? null,
        managerUsername: managerUsername ?? null,
        teamName: teamName ?? null,
      },
    }));

    return records;
  }, []);
}
