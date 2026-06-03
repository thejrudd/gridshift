import { fetchRoster } from './playerApi.js';

export const STATISTICS_MODES = {
  GAME: 'game',
  FANTASY: 'fantasy',
  VISUAL: 'visual',
};

function getSleeperDisplayName(player = {}) {
  return player.full_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim();
}

function normalizePlayerName(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findRosterNameMatch(roster, player) {
  const displayName = getSleeperDisplayName(player);
  const normalizedName = normalizePlayerName(displayName);
  if (!normalizedName) return null;

  return roster.find((candidate) => candidate.displayName?.toLowerCase() === displayName.toLowerCase())
    ?? roster.find((candidate) => normalizePlayerName(candidate.displayName) === normalizedName)
    ?? null;
}

export function buildStatisticsPlayerMetaFromSleeperId(sleeperId, sleeperPlayers, espnIdOverrides = {}) {
  if (!sleeperId || !sleeperPlayers) return null;

  const player = sleeperPlayers[sleeperId];
  if (!player) return null;

  const espnId = player.espn_id ?? espnIdOverrides?.[sleeperId] ?? null;
  if (!espnId) return null;

  return {
    id: String(espnId),
    sleeperId: String(sleeperId),
    espnId: String(espnId),
    espn_id: String(espnId),
    sourceIds: { ...(player.sourceIds ?? {}), espn: String(espnId) },
    displayName: player.full_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim(),
    teamId: player.team?.toUpperCase?.() ?? null,
    position: player.position ?? '',
    positionName: '',
    experience: player.years_exp != null ? player.years_exp + 1 : undefined,
    jersey: player.number ?? '',
    status: player.injury_status ?? '',
  };
}

export async function resolveStatisticsPlayerMetaFromSleeperId(
  sleeperId,
  sleeperPlayers,
  espnIdOverrides = {},
  { fetchRosterFn = fetchRoster } = {},
) {
  const existingMeta = buildStatisticsPlayerMetaFromSleeperId(sleeperId, sleeperPlayers, espnIdOverrides);
  if (existingMeta) return existingMeta;

  if (!sleeperId || !sleeperPlayers) return null;
  const player = sleeperPlayers[sleeperId];
  if (!player) return null;

  const displayName = getSleeperDisplayName(player);
  const teamId = player.team?.toUpperCase?.() ?? null;
  if (!displayName || !teamId) return null;

  try {
    const roster = await fetchRosterFn(teamId);
    const match = findRosterNameMatch(roster ?? [], player);
    if (!match?.id) return null;

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
  };
}
