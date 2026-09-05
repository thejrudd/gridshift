export const DRAFT_BYE_CONFLICT_SEVERITY = Object.freeze({
  NONE: 'none',
  MEDIUM: 'medium',
  HIGH: 'high',
});

function normalizeId(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizePosition(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === 'DST' || normalized === 'D/ST' || normalized === 'DEFENSE') return 'DEF';
  return normalized;
}

function normalizeByeWeek(value) {
  if (value == null || value === '') return null;
  const week = Number(value);
  return Number.isInteger(week) && week >= 1 && week <= 18 ? week : null;
}

function getPlayer(playersById, playerId) {
  if (!playersById || !playerId) return null;
  if (playersById instanceof Map) return playersById.get(playerId) ?? null;
  return playersById[playerId] ?? null;
}

function getPlayerId(value) {
  if (value && typeof value === 'object') {
    return normalizeId(value.id ?? value.playerId ?? value.player_id);
  }
  return normalizeId(value);
}

function uniqueIds(values = []) {
  const ids = [];
  const seen = new Set();
  for (const value of values ?? []) {
    const id = getPlayerId(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function getPlayerDetails(playersById, playerId) {
  const player = getPlayer(playersById, playerId);
  const raw = player?.raw ?? player;
  const name = player?.name
    ?? player?.full_name
    ?? raw?.full_name
    ?? [player?.first_name ?? raw?.first_name, player?.last_name ?? raw?.last_name]
      .filter(Boolean)
      .join(' ')
    ?? `Player ${playerId}`;
  const position = normalizePosition(
    player?.position
      ?? player?.fantasy_positions?.[0]
      ?? raw?.fantasy_positions?.[0]
      ?? raw?.position,
  );
  const week = normalizeByeWeek(
    player?.byeWeek
      ?? player?.teamContext?.byeWeek
      ?? player?.bye_week
      ?? player?.metadata?.bye_week
      ?? player?.metadata?.bye
      ?? player?.bye
      ?? raw?.byeWeek
      ?? raw?.bye_week
      ?? raw?.metadata?.bye_week
      ?? raw?.metadata?.bye
      ?? raw?.bye,
  );

  return {
    playerId,
    name: String(name || `Player ${playerId}`),
    position,
    week,
  };
}

function emptyConflict(details) {
  return {
    playerId: details.playerId,
    week: details.week,
    matchingPlayerIds: [],
    matchingPlayerNames: [],
    matchingPlayerLabels: [],
    totalOverlaps: 0,
    exactPositionOverlaps: 0,
    severity: DRAFT_BYE_CONFLICT_SEVERITY.NONE,
  };
}

/**
 * Build Draft Board bye-conflict annotations without depending on React state.
 *
 * `rosteredPlayerIds` is the only comparison set. The Board's saved targets are
 * candidates to evaluate, not comparison peers, so a Board player only warns
 * when its bye overlaps a player currently locked to the manager's roster.
 */
export function buildDraftByeConflictModel({
  playersById = {},
  candidatePlayerIds = [],
  rosteredPlayerIds = [],
} = {}) {
  const comparisonPlayerIds = uniqueIds(rosteredPlayerIds);

  const detailsById = new Map();
  const getDetails = (playerId) => {
    if (!detailsById.has(playerId)) {
      detailsById.set(playerId, getPlayerDetails(playersById, playerId));
    }
    return detailsById.get(playerId);
  };
  const evaluatedPlayerIds = uniqueIds([...(candidatePlayerIds ?? []), ...comparisonPlayerIds]);
  const byPlayerId = new Map();

  for (const playerId of evaluatedPlayerIds) {
    const details = getDetails(playerId);
    if (details.week == null) {
      byPlayerId.set(playerId, emptyConflict(details));
      continue;
    }

    const matchingPlayers = comparisonPlayerIds
      .filter((comparisonId) => comparisonId !== playerId)
      .map(getDetails)
      .filter((comparison) => comparison.week === details.week);
    const exactPositionOverlaps = details.position == null
      ? 0
      : matchingPlayers.filter((comparison) => comparison.position === details.position).length;
    const severity = exactPositionOverlaps > 0
      ? DRAFT_BYE_CONFLICT_SEVERITY.HIGH
      : matchingPlayers.length > 0
        ? DRAFT_BYE_CONFLICT_SEVERITY.MEDIUM
        : DRAFT_BYE_CONFLICT_SEVERITY.NONE;

    byPlayerId.set(playerId, {
      playerId,
      week: details.week,
      matchingPlayerIds: matchingPlayers.map((player) => player.playerId),
      matchingPlayerNames: matchingPlayers.map((player) => player.name),
      matchingPlayerLabels: matchingPlayers.map((player) => (
        player.position ? `${player.name} (${player.position})` : player.name
      )),
      totalOverlaps: matchingPlayers.length,
      exactPositionOverlaps,
      severity,
    });
  }

  return {
    comparisonPlayerIds,
    byPlayerId,
  };
}
