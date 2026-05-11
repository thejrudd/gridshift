export const STATISTICS_MODES = {
  GAME: 'game',
  FANTASY: 'fantasy',
  VISUAL: 'visual',
};

export function buildStatisticsPlayerMetaFromSleeperId(sleeperId, sleeperPlayers, espnIdOverrides = {}) {
  if (!sleeperId || !sleeperPlayers) return null;

  const player = sleeperPlayers[sleeperId];
  if (!player) return null;

  const espnId = player.espn_id ?? espnIdOverrides?.[sleeperId] ?? null;
  if (!espnId) return null;

  return {
    id: String(espnId),
    sleeperId: String(sleeperId),
    displayName: player.full_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim(),
    teamId: player.team?.toUpperCase?.() ?? null,
    position: player.position ?? '',
    positionName: '',
    experience: player.years_exp != null ? player.years_exp + 1 : undefined,
    jersey: player.number ?? '',
    status: player.injury_status ?? '',
  };
}

export function buildStatisticsPlayerMeta(player = {}, fallback = {}) {
  const id = player.id ?? fallback.id;
  if (id == null) return null;

  return {
    id: String(id),
    sleeperId: player.sleeperId ?? fallback.sleeperId,
    displayName: player.displayName ?? player.full_name ?? player.name ?? fallback.displayName ?? '',
    teamId: player.teamId ?? player.team?.toUpperCase?.() ?? fallback.teamId ?? null,
    position: player.position ?? fallback.position ?? '',
    positionName: player.positionName ?? fallback.positionName ?? '',
    experience: player.experience ?? fallback.experience,
    jersey: player.jersey ?? player.number ?? fallback.jersey ?? '',
    status: player.status ?? player.injury_status ?? fallback.status ?? '',
  };
}
