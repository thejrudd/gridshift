const FORMAT_BY_SLEEPER_TYPE = Object.freeze({
  0: 'redraft',
  1: 'keeper',
  2: 'dynasty',
});

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

function normalizeLeagueFormat(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'keeper' || normalized === 'dynasty' || normalized === 'redraft') {
    return normalized;
  }
  return FORMAT_BY_SLEEPER_TYPE[normalized] ?? 'redraft';
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

function getPickPlayerId(pick) {
  return normalizeId(pick?.playerId ?? pick?.player_id ?? pick?.metadata?.player_id);
}

function getPickRosterId(pick) {
  return normalizeId(pick?.rosterId ?? pick?.roster_id);
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
    totalOverlaps: 0,
    exactPositionOverlaps: 0,
    severity: DRAFT_BYE_CONFLICT_SEVERITY.NONE,
  };
}

/**
 * Build Draft Board bye-conflict annotations without depending on React state.
 *
 * Inputs use the shapes DraftAssistant already owns:
 * - `leagueType`: Sleeper league type 0/1/2 or redraft/keeper/dynasty.
 * - `playersById`: object or Map of raw or enriched player rows.
 * - `candidatePlayerIds`: every visible player the caller wants annotated.
 * - `savedTargetIds`: locally saved Board targets.
 * - `existingRosterPlayerIds`: the manager's current roster before this draft.
 * - `draftPicks`: normalized or raw picks; `myRosterId` identifies the user's picks.
 *
 * Still-available saved targets compare with one another in every format so the
 * Board can warn about conflicts in the manager's draft plan. The comparison pool
 * then adds format-aware commitments: dynasty uses the existing roster plus the
 * user's picks, keeper uses assigned keeper picks plus later user picks (the pick
 * feed, never every holdover), and redraft adds only the user's picks. Players
 * drafted by another manager are never conflicts.
 */
export function buildDraftByeConflictModel({
  leagueType = 0,
  playersById = {},
  candidatePlayerIds = [],
  savedTargetIds = [],
  existingRosterPlayerIds = [],
  draftPicks = [],
  myRosterId = null,
} = {}) {
  const format = normalizeLeagueFormat(leagueType);
  const normalizedMyRosterId = normalizeId(myRosterId);
  const allDraftedPlayerIds = new Set();
  const ownDraftPickIds = [];

  for (const pick of draftPicks ?? []) {
    const playerId = getPickPlayerId(pick);
    if (!playerId) continue;
    allDraftedPlayerIds.add(playerId);
    if (normalizedMyRosterId && getPickRosterId(pick) === normalizedMyRosterId) {
      ownDraftPickIds.push(playerId);
    }
  }

  const ownPickIdSet = new Set(ownDraftPickIds);
  const draftedByOtherIds = new Set(
    [...allDraftedPlayerIds].filter((playerId) => !ownPickIdSet.has(playerId)),
  );
  const savedIds = uniqueIds(savedTargetIds);
  const availableSavedIds = savedIds.filter((playerId) => !draftedByOtherIds.has(playerId));
  const savedTargetsAndOwnPicks = [...availableSavedIds, ...ownDraftPickIds];
  let comparisonPlayerIds;

  if (format === 'dynasty') {
    comparisonPlayerIds = uniqueIds([
      ...(existingRosterPlayerIds ?? []),
      ...savedTargetsAndOwnPicks,
    ]);
  } else if (format === 'keeper') {
    comparisonPlayerIds = uniqueIds(savedTargetsAndOwnPicks);
  } else {
    comparisonPlayerIds = uniqueIds(savedTargetsAndOwnPicks);
  }

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
    if (details.week == null || draftedByOtherIds.has(playerId)) {
      byPlayerId.set(playerId, emptyConflict(details));
      continue;
    }

    const matchingPlayers = comparisonPlayerIds
      .filter((comparisonId) => comparisonId !== playerId && !draftedByOtherIds.has(comparisonId))
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
      totalOverlaps: matchingPlayers.length,
      exactPositionOverlaps,
      severity,
    });
  }

  return {
    format,
    comparisonPlayerIds,
    byPlayerId,
  };
}
