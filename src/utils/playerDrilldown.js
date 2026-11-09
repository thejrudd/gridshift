import { fetchRoster } from './playerApi.js';
import { cachedFetch, TTL } from './playerCache.js';

export const STATISTICS_MODES = {
  GAME: 'game',
  FANTASY: 'fantasy',
  VISUAL: 'visual',
};

function getSleeperDisplayName(player = {}) {
  return player.full_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim();
}

function normalizeEspnId(id) {
  if (id == null || id === '') return null;
  return String(id);
}

// Exported for the search index, which must normalize names the same way this
// module matches them so a search hit and a drilldown agree on identity.
export function normalizePlayerName(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildStatisticsPlayerMetaFromSleeperPlayer(sleeperId, player = {}, espnId) {
  const resolvedEspnId = normalizeEspnId(espnId);
  if (!resolvedEspnId) return null;

  return buildStatisticsPlayerMeta(player, {
    id: resolvedEspnId,
    sleeperId: String(sleeperId),
    espnId: resolvedEspnId,
    espn_id: resolvedEspnId,
    sourceIds: { ...(player.sourceIds ?? {}), espn: resolvedEspnId },
    displayName: getSleeperDisplayName(player),
    teamId: player.team?.toUpperCase?.() ?? null,
    position: player.position ?? '',
    positionName: '',
    experience: player.years_exp != null ? player.years_exp + 1 : undefined,
    jersey: player.number ?? '',
    status: player.injury_status ?? '',
  });
}

export function buildStatisticsPlayerMetaFromSleeperId(sleeperId, sleeperPlayers, espnIdOverrides = {}) {
  if (!sleeperId || !sleeperPlayers) return null;

  const player = sleeperPlayers[sleeperId];
  if (!player) return null;

  const espnId = normalizeEspnId(player.espn_id) ?? normalizeEspnId(espnIdOverrides?.[sleeperId]);
  return buildStatisticsPlayerMetaFromSleeperPlayer(sleeperId, player, espnId);
}

export function findRosterMatchForSleeperPlayer(player = {}, roster = []) {
  const displayName = getSleeperDisplayName(player);
  if (!displayName) return null;

  const normalizedSleeperName = normalizePlayerName(displayName);
  const sleeperPosition = String(player.position ?? '').toUpperCase();
  const nameMatches = roster.filter((candidate) => {
    const candidateName = candidate.displayName ?? candidate.fullName ?? '';
    return candidateName.toLowerCase() === displayName.toLowerCase()
      || normalizePlayerName(candidateName) === normalizedSleeperName;
  });

  if (nameMatches.length <= 1 || !sleeperPosition) return nameMatches[0] ?? null;
  return nameMatches.find((candidate) => String(candidate.position ?? '').toUpperCase() === sleeperPosition)
    ?? nameMatches[0]
    ?? null;
}

const ESPN_PLAYER_SEARCH_URL = 'https://site.web.api.espn.com/apis/common/v3/search';

async function searchEspnPlayers(name) {
  const params = new URLSearchParams({
    query: name,
    limit: '10',
    type: 'player',
    sport: 'football',
    league: 'nfl',
  });
  const response = await fetch(`${ESPN_PLAYER_SEARCH_URL}?${params}`);
  if (!response.ok) throw new Error(`Player search failed: ${response.status}`);
  const payload = await response.json();
  return (payload?.items ?? []).map((item) => ({ id: item?.id, displayName: item?.displayName ?? '' }));
}

/**
 * A player's ESPN id found by name, for a player with no team to look up a
 * roster on — a free agent such as Najee Harris, whom Sleeper lists with
 * neither a team nor an ESPN id.
 *
 * ESPN's search does not say a player's position, so the name has to be
 * unique: two players with the same name (the two Josh Allens) give null
 * rather than a guess that would open the wrong player's page.
 */
export async function lookupEspnIdByName(name, { searchFn = searchEspnPlayers } = {}) {
  const normalized = normalizePlayerName(name);
  if (!normalized) return null;
  try {
    const candidates = await cachedFetch(
      `espn_player_search_v1_${normalized}`,
      () => searchFn(String(name).trim()),
      TTL.roster,
    );
    const matches = (candidates ?? []).filter((candidate) => (
      candidate?.id != null && normalizePlayerName(candidate.displayName) === normalized
    ));
    return matches.length === 1 ? String(matches[0].id) : null;
  } catch {
    return null;
  }
}

export async function resolveStatisticsPlayerMetaFromSleeperId(
  sleeperId,
  sleeperPlayers,
  espnIdOverrides = {},
  { rosterFetcher = null, fetchRosterFn = null, nameLookup = lookupEspnIdByName } = {},
) {
  const playerMeta = buildStatisticsPlayerMetaFromSleeperId(sleeperId, sleeperPlayers, espnIdOverrides);
  if (playerMeta) return playerMeta;

  if (!sleeperId || !sleeperPlayers) return null;
  const player = sleeperPlayers[sleeperId];
  if (!player) return null;
  const teamId = player.team?.toUpperCase?.();

  // No team, so no roster to match on: find the player by name instead.
  if (!teamId) {
    const displayName = getSleeperDisplayName(player);
    const espnId = typeof nameLookup === 'function' ? await nameLookup(displayName) : null;
    if (!espnId) return null;
    return buildStatisticsPlayerMeta({}, {
      id: espnId,
      espnId,
      sleeperId: String(sleeperId),
      displayName,
      teamId: null,
      position: player.position ?? '',
      experience: player.years_exp != null ? player.years_exp + 1 : undefined,
      jersey: player.number ?? '',
      status: player.injury_status ?? player.status ?? '',
    });
  }

  const fetchRosterForTeam = rosterFetcher ?? fetchRosterFn ?? fetchRoster;
  if (typeof fetchRosterForTeam !== 'function') return null;

  try {
    const roster = await fetchRosterForTeam(teamId);
    const match = findRosterMatchForSleeperPlayer(player, roster ?? []);
    if (!match?.id) return null;

    const displayName = getSleeperDisplayName(player);
    return buildStatisticsPlayerMeta(match, {
      id: String(match.id),
      sleeperId: String(sleeperId),
      displayName,
      teamId,
      position: player.position ?? '',
      experience: player.years_exp != null ? player.years_exp + 1 : undefined,
      jersey: player.number ?? '',
      status: player.injury_status ?? player.status ?? '',
    });
  } catch {
    return null;
  }
}

export function buildStatisticsPlayerMeta(player = {}, fallback = {}) {
  const id = player.id ?? fallback.id;
  if (id == null) return null;
  const espnId = player.espnId
    ?? player.espn_id
    ?? player.sourceIds?.espn
    ?? fallback.espnId
    ?? fallback.espn_id
    ?? fallback.sourceIds?.espn
    ?? (/^\d+$/.test(String(id)) ? id : null);
  const sourceIds = {
    ...(fallback.sourceIds ?? {}),
    ...(player.sourceIds ?? {}),
  };
  if (espnId != null) sourceIds.espn = String(espnId);

  return {
    id: String(id),
    sleeperId: player.sleeperId ?? fallback.sleeperId,
    espnId: espnId != null ? String(espnId) : undefined,
    espn_id: espnId != null ? String(espnId) : undefined,
    sourceIds,
    displayName: player.displayName ?? player.full_name ?? player.name ?? fallback.displayName ?? '',
    teamId: player.teamId ?? player.team?.toUpperCase?.() ?? fallback.teamId ?? null,
    position: player.position ?? fallback.position ?? '',
    positionName: player.positionName ?? fallback.positionName ?? '',
    experience: player.experience ?? fallback.experience,
    jersey: player.jersey ?? player.number ?? fallback.jersey ?? '',
    status: player.status ?? player.injury_status ?? fallback.status ?? '',
    injuryStatus: player.injuryStatus ?? player.injury_status ?? fallback.injuryStatus ?? fallback.injury_status ?? fallback.status ?? '',
  };
}
