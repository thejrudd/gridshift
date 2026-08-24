import { fetchRoster } from './playerApi.js';

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

function normalizePlayerName(name) {
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

export async function resolveStatisticsPlayerMetaFromSleeperId(
  sleeperId,
  sleeperPlayers,
  espnIdOverrides = {},
  { rosterFetcher = null, fetchRosterFn = null } = {},
) {
  const playerMeta = buildStatisticsPlayerMetaFromSleeperId(sleeperId, sleeperPlayers, espnIdOverrides);
  if (playerMeta) return playerMeta;

  if (!sleeperId || !sleeperPlayers) return null;
  const player = sleeperPlayers[sleeperId];
  const teamId = player?.team?.toUpperCase?.();
  if (!player || !teamId) return null;

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
  };
}
