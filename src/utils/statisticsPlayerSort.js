const DEFAULT_SORT_COLUMNS = Object.freeze({
  passing: 'YDS',
  rushing: 'YDS',
  receiving: 'YDS',
  defense: 'TOT',
  kicking: 'PTS',
  punting: 'AVG',
  returns: 'YDS',
});

const MISSING_VALUES = new Set(['', '—', '-', 'n/a', 'na']);

function normalizedDirection(direction) {
  return direction === 'asc' ? 'asc' : 'desc';
}

export function getDefaultStatisticsPlayerSort(group) {
  const defaultColumn = DEFAULT_SORT_COLUMNS[group?.id] ?? group?.columns?.[0];
  const columnIndex = group?.columns?.indexOf(defaultColumn) ?? -1;
  return {
    columnIndex: columnIndex >= 0 ? columnIndex : 0,
    direction: 'desc',
  };
}

export function normalizeStatisticsPlayerSort(group, sort) {
  const defaultSort = getDefaultStatisticsPlayerSort(group);
  const columnIndex = Number(sort?.columnIndex);
  return {
    columnIndex: Number.isInteger(columnIndex) && columnIndex >= 0 && columnIndex < (group?.columns?.length ?? 0)
      ? columnIndex
      : defaultSort.columnIndex,
    direction: normalizedDirection(sort?.direction ?? defaultSort.direction),
  };
}

/**
 * Convert a displayed player value into a sortable number. Slash values use
 * their rate (for example, C/ATT and FG), while — stays unknown and sorts
 * below known values in either direction.
 */
export function getStatisticsPlayerSortValue(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (MISSING_VALUES.has(text)) return null;

  const ratio = /^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/.exec(text);
  if (ratio) {
    const numerator = Number(ratio[1]);
    const denominator = Number(ratio[2]);
    return denominator > 0 ? numerator / denominator : null;
  }

  const numeric = Number(text.replace(/,/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
}

export function sortStatisticsPlayerRows(rows = [], group, sort = null) {
  const activeSort = normalizeStatisticsPlayerSort(group, sort);
  const direction = activeSort.direction === 'asc' ? 1 : -1;

  return rows
    .map((row, index) => ({
      row,
      index,
      value: getStatisticsPlayerSortValue(row?.values?.[activeSort.columnIndex]),
    }))
    .sort((left, right) => {
      if (left.value == null || right.value == null) {
        if (left.value == null && right.value == null) return left.index - right.index;
        return left.value == null ? 1 : -1;
      }
      if (left.value !== right.value) return (left.value - right.value) * direction;
      // Preserve the provider's order for tied values, including the initial
      // leader order supplied by the server and local fixture.
      return left.index - right.index;
    })
    .map(({ row }) => row);
}
