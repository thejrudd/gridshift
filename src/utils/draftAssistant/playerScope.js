export function limitDraftRows(rows, { limit = null, includeRostered = false } = {}) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const parsedLimit = Number(limit);
  const safeLimit = limit == null || !Number.isFinite(parsedLimit)
    ? normalizedRows.length
    : Math.max(0, Math.floor(parsedLimit));
  const visibleRows = normalizedRows.slice(0, safeLimit);

  if (!includeRostered || visibleRows.length === normalizedRows.length) return visibleRows;

  const visibleIds = new Set(visibleRows.map((player) => String(player?.id ?? '')));
  return [
    ...visibleRows,
    ...normalizedRows.slice(safeLimit).filter((player) => {
      const playerId = String(player?.id ?? '');
      if (!player?.rostered || !playerId || visibleIds.has(playerId)) return false;
      visibleIds.add(playerId);
      return true;
    }),
  ];
}
