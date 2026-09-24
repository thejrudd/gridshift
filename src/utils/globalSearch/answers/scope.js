// ── Team scope ─────────────────────────────────────────────────────────────
// Turns the team, division and conference slots into the set of NFL teams an
// answer is about, plus a name for it.
//
// Three resolvers need exactly this and were each about to grow their own copy:
// leaders ("nfc west rushing leader"), standings ("afc standings") and team
// stats ("seahawks point differential"). It lives here so a query like
// "afc east sacks leader" means the same set of teams whichever card answers it.
//
// Slots are AND-ed, matching rank.js: "nfc west seahawks" is the Seahawks, not
// the division plus them. An empty intersection is a real answer — no team
// satisfies it — and is reported as such rather than silently widening to the
// league.

/**
 * Index the team list by id, division and conference.
 *
 * `teams` is the same array the rest of the app uses (`scheduleData.teams`):
 * `{ id, name, division, conference }`.
 */
function indexTeams(teams = []) {
  const byId = new Map();
  for (const team of teams ?? []) {
    const id = String(team?.id ?? '').toUpperCase();
    if (!id) continue;
    byId.set(id, {
      id,
      name: team.name ?? id,
      division: team.division ?? null,
      // Some fixtures carry only the division ("NFC West"), which names the
      // conference in its first word.
      conference: team.conference
        ?? (typeof team.division === 'string' ? team.division.split(' ')[0] : null),
    });
  }
  return byId;
}

function matchesAny(value, wanted) {
  if (!wanted.length) return true;
  if (!value) return false;
  const normalized = String(value).toLowerCase();
  return wanted.some((entry) => String(entry).toLowerCase() === normalized);
}

/**
 * The teams a query is scoped to.
 *
 * Returns `{ teamIds, label, isLeagueWide, isSingleTeam }`. `teamIds` is null
 * when the query named no scope at all, which means the whole league — callers
 * check `isLeagueWide` rather than treating null as "no results".
 */
export function resolveTeamScope(slots = {}, teams = []) {
  const byId = indexTeams(teams);
  const wantedTeams = slots.teams ?? [];
  const wantedDivisions = slots.divisions ?? [];
  const wantedConferences = slots.conferences ?? [];

  if (!wantedTeams.length && !wantedDivisions.length && !wantedConferences.length) {
    return { teamIds: null, label: null, isLeagueWide: true, isSingleTeam: false };
  }

  const teamIds = new Set();
  for (const team of byId.values()) {
    if (!matchesAny(team.id, wantedTeams)) continue;
    if (!matchesAny(team.division, wantedDivisions)) continue;
    if (!matchesAny(team.conference, wantedConferences)) continue;
    teamIds.add(team.id);
  }

  // A team the team list does not carry still scopes the answer. Otherwise a
  // fixture or a data gap would silently widen "seahawks sacks" to the league.
  if (!byId.size) {
    for (const abbr of wantedTeams) teamIds.add(String(abbr).toUpperCase());
  }

  return {
    teamIds,
    label: describeScope(slots, byId, teamIds),
    isLeagueWide: false,
    isSingleTeam: teamIds.size === 1,
  };
}

/**
 * What to call this scope in a card title.
 *
 * A single team gets its full name, because that is how the team reads
 * everywhere else in the app. A division or conference gets its own name. Both
 * named together are joined, since the query asked for both.
 */
function describeScope(slots, byId, teamIds) {
  const parts = [];

  for (const division of slots.divisions ?? []) parts.push(division);
  for (const conference of slots.conferences ?? []) {
    // "NFC West" already says NFC; repeating the conference reads as a stutter.
    if (!parts.some((part) => String(part).startsWith(conference))) parts.push(conference);
  }

  if (slots.teams?.length) {
    for (const abbr of slots.teams) {
      const id = String(abbr).toUpperCase();
      parts.push(byId.get(id)?.name ?? id);
    }
  } else if (!parts.length && teamIds?.size === 1) {
    const [only] = [...teamIds];
    parts.push(byId.get(only)?.name ?? only);
  }

  return parts.join(' · ') || null;
}

/**
 * Is this player's team inside the scope?
 *
 * A league-wide scope admits everyone, including a player whose team is unknown
 * — filtering those out would quietly drop free agents from a leaderboard that
 * never asked about teams.
 */
export function isTeamInScope(scope, team) {
  if (!scope || scope.isLeagueWide || !scope.teamIds) return true;
  if (!team) return false;
  return scope.teamIds.has(String(team).toUpperCase());
}
