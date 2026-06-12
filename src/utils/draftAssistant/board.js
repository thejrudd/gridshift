export const DRAFT_POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB'];

export function normalizeBoardPosition(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'DST') return 'DEF';
  if (normalized === 'FB') return 'RB';
  if (normalized === 'DE' || normalized === 'DT') return 'DL';
  if (normalized === 'CB' || normalized === 'S' || normalized === 'SS' || normalized === 'FS') return 'DB';
  if (normalized === 'ILB' || normalized === 'OLB') return 'LB';
  return normalized || 'FLEX';
}

export function getPlayerBoardPositions(player) {
  const rawPositions = [
    ...(Array.isArray(player?.fantasy_positions) ? player.fantasy_positions : []),
    ...(Array.isArray(player?.raw?.fantasy_positions) ? player.raw.fantasy_positions : []),
    player?.fantasyPosition,
    player?.position,
    player?.raw?.position,
  ];
  const positions = rawPositions
    .map(normalizeBoardPosition)
    .filter((position) => position && position !== 'FLEX');
  return [...new Set(positions)];
}

export function playerCanSlotIntoBoardPosition(player, position) {
  const normalizedPosition = normalizeBoardPosition(position);
  if (!normalizedPosition || normalizedPosition === 'FLEX' || normalizedPosition === 'ALL') return false;
  return getPlayerBoardPositions(player).includes(normalizedPosition);
}

export function emptyBoard() {
  return {};
}

export function normalizeBoardByPosition(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyBoard();
  return Object.fromEntries(
    Object.entries(value)
      .map(([position, ids]) => [
        normalizeBoardPosition(position),
        Array.isArray(ids) ? ids.map((id) => String(id)).filter(Boolean) : [],
      ])
      .filter(([, ids]) => ids.length > 0),
  );
}

export function flattenBoardIds(boardByPosition) {
  return Object.values(boardByPosition ?? {}).flatMap((ids) => ids ?? []);
}

export function normalizeOverallBoardIds(overallIds, boardByPosition) {
  const boardIds = flattenBoardIds(boardByPosition).map((id) => String(id));
  const boardIdSet = new Set(boardIds);
  const seen = new Set();
  const orderedIds = [];

  for (const id of Array.isArray(overallIds) ? overallIds : []) {
    const normalizedId = String(id ?? '');
    if (!normalizedId || !boardIdSet.has(normalizedId) || seen.has(normalizedId)) continue;
    seen.add(normalizedId);
    orderedIds.push(normalizedId);
  }

  for (const id of boardIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    orderedIds.push(id);
  }

  return orderedIds;
}

export function orderBoardByOverall(boardByPosition, overallIds) {
  const normalizedBoard = normalizeBoardByPosition(boardByPosition);
  const orderedIds = normalizeOverallBoardIds(overallIds, normalizedBoard);
  const overallIndex = new Map(orderedIds.map((id, index) => [id, index]));
  return Object.fromEntries(
    Object.entries(normalizedBoard).map(([position, ids]) => [
      position,
      [...ids].sort((left, right) => (overallIndex.get(left) ?? Infinity) - (overallIndex.get(right) ?? Infinity)),
    ]),
  );
}

export function createOrderedBoardState(boardByPosition, overallIds = []) {
  const normalizedBoard = normalizeBoardByPosition(boardByPosition);
  const normalizedOverallIds = normalizeOverallBoardIds(overallIds, normalizedBoard);
  return {
    boardByPosition: orderBoardByOverall(normalizedBoard, normalizedOverallIds),
    overallIds: normalizedOverallIds,
  };
}

export function removePlayerFromBoard(boardByPosition, playerId) {
  const id = String(playerId);
  const next = {};
  for (const [position, ids] of Object.entries(boardByPosition ?? {})) {
    const filtered = (ids ?? []).filter((item) => item !== id);
    if (filtered.length > 0) next[position] = filtered;
  }
  return next;
}

function moveIdBefore(overallIds, playerId, beforePlayerId) {
  const id = String(playerId ?? '');
  if (!id) return overallIds;
  const next = overallIds.filter((item) => item !== id);
  const beforeIndex = beforePlayerId == null ? -1 : next.indexOf(String(beforePlayerId));
  if (beforeIndex >= 0) next.splice(beforeIndex, 0, id);
  else next.push(id);
  return next;
}

function moveIdAfter(overallIds, playerId, afterPlayerId) {
  const id = String(playerId ?? '');
  if (!id) return overallIds;
  const next = overallIds.filter((item) => item !== id);
  const afterIndex = afterPlayerId == null ? -1 : next.indexOf(String(afterPlayerId));
  if (afterIndex >= 0) next.splice(afterIndex + 1, 0, id);
  else next.push(id);
  return next;
}

export function addPlayerToOrderedBoard(boardState, player) {
  const current = createOrderedBoardState(boardState?.boardByPosition, boardState?.overallIds);
  const nextBoard = addPlayerToBoard(current.boardByPosition, player);
  const playerId = String(player?.id ?? '');
  const nextOverallIds = current.overallIds.includes(playerId)
    ? current.overallIds
    : [...current.overallIds, playerId];
  return createOrderedBoardState(nextBoard, nextOverallIds);
}

export function removePlayerFromOrderedBoard(boardState, playerId) {
  const current = createOrderedBoardState(boardState?.boardByPosition, boardState?.overallIds);
  const id = String(playerId ?? '');
  return createOrderedBoardState(
    removePlayerFromBoard(current.boardByPosition, id),
    current.overallIds.filter((item) => item !== id),
  );
}

export function movePlayerToOrderedBoardPosition(boardState, position, playerId, beforePlayerId = null, player = null) {
  const current = createOrderedBoardState(boardState?.boardByPosition, boardState?.overallIds);
  const normalizedPosition = normalizeBoardPosition(position);
  const id = String(playerId ?? '');
  if (!id) return current;

  const nextBoard = movePlayerToBoardPosition(current.boardByPosition, normalizedPosition, id, beforePlayerId, player);
  if (nextBoard === current.boardByPosition) return current;

  let nextOverallIds;
  if (beforePlayerId != null) {
    nextOverallIds = moveIdBefore(current.overallIds, id, beforePlayerId);
  } else {
    const laneIds = nextBoard[normalizedPosition] ?? [];
    const previousLaneId = [...laneIds].reverse().find((item) => item !== id) ?? null;
    nextOverallIds = moveIdAfter(current.overallIds, id, previousLaneId);
  }

  return createOrderedBoardState(nextBoard, nextOverallIds);
}

export function moveWithinPosition(boardByPosition, position, playerId, direction) {
  const normalizedPosition = normalizeBoardPosition(position);
  const ids = [...(boardByPosition?.[normalizedPosition] ?? [])];
  const index = ids.indexOf(String(playerId));
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return boardByPosition;
  [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
  return {
    ...boardByPosition,
    [normalizedPosition]: ids,
  };
}

export function moveOrderedBoardPlayerWithinPosition(boardState, position, playerId, direction) {
  const current = createOrderedBoardState(boardState?.boardByPosition, boardState?.overallIds);
  const normalizedPosition = normalizeBoardPosition(position);
  const ids = [...(current.boardByPosition?.[normalizedPosition] ?? [])];
  const index = ids.indexOf(String(playerId));
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return current;

  const currentId = ids[index];
  const swapId = ids[nextIndex];
  const nextOverallIds = [...current.overallIds];
  const currentOverallIndex = nextOverallIds.indexOf(currentId);
  const swapOverallIndex = nextOverallIds.indexOf(swapId);
  if (currentOverallIndex < 0 || swapOverallIndex < 0) return current;
  [nextOverallIds[currentOverallIndex], nextOverallIds[swapOverallIndex]] = [
    nextOverallIds[swapOverallIndex],
    nextOverallIds[currentOverallIndex],
  ];
  return createOrderedBoardState(current.boardByPosition, nextOverallIds);
}

export function moveOverallBoardPlayer(boardState, playerId, direction) {
  const current = createOrderedBoardState(boardState?.boardByPosition, boardState?.overallIds);
  const ids = [...current.overallIds];
  const index = ids.indexOf(String(playerId));
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return current;
  [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
  return createOrderedBoardState(current.boardByPosition, ids);
}

export function movePlayerToBoardPosition(boardByPosition, position, playerId, beforePlayerId = null, player = null) {
  const normalizedPosition = normalizeBoardPosition(position);
  const id = String(playerId ?? '');
  if (!id) return boardByPosition;
  if (player && !playerCanSlotIntoBoardPosition(player, normalizedPosition)) return boardByPosition;
  if (beforePlayerId != null && String(beforePlayerId) === id) return boardByPosition;

  const cleaned = removePlayerFromBoard(boardByPosition, id);
  const ids = [...(cleaned[normalizedPosition] ?? [])];
  const beforeIndex = beforePlayerId == null ? -1 : ids.indexOf(String(beforePlayerId));
  if (beforeIndex >= 0) ids.splice(beforeIndex, 0, id);
  else ids.push(id);

  return {
    ...cleaned,
    [normalizedPosition]: ids,
  };
}

export function addPlayerToBoard(boardByPosition, player) {
  const position = normalizeBoardPosition(player?.position);
  const playerId = String(player?.id ?? '');
  if (!playerId) return boardByPosition;
  return movePlayerToBoardPosition(boardByPosition, position, playerId, null, player);
}
