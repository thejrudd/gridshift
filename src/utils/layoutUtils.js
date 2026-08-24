// Hand-crafted bento layouts per section count.
// Each cell: [colStart, colEnd, rowStart, rowEnd] on a 4-column grid.
export const BENTO_LAYOUTS = {
  1: { rowFrs: [1], cells: [[1, 5, 1, 2]] },
  2: { rowFrs: [1], cells: [[1, 3, 1, 2], [3, 5, 1, 2]] },
  3: {
    rowFrs: [1, 1],
    cells: [[1, 3, 1, 3], [3, 5, 1, 2], [3, 5, 2, 3]],
  },
  4: {
    rowFrs: [1.4, 1],
    cells: [[1, 3, 1, 2], [3, 4, 1, 3], [4, 5, 1, 3], [1, 3, 2, 3]],
  },
  5: {
    rowFrs: [3, 2, 2],
    cells: [[1, 3, 1, 2], [3, 5, 1, 2], [1, 4, 2, 3], [4, 5, 2, 4], [1, 4, 3, 4]],
  },
  6: {
    rowFrs: [3, 2, 2.5],
    cells: [[1, 3, 1, 2], [3, 5, 1, 2], [1, 2, 2, 4], [2, 5, 2, 3], [2, 4, 3, 4], [4, 5, 3, 4]],
  },
  7: {
    rowFrs: [3, 2, 2],
    cells: [[1, 3, 1, 2], [3, 5, 1, 2], [1, 2, 2, 4], [2, 4, 2, 3], [4, 5, 2, 3], [2, 4, 3, 4], [4, 5, 3, 4]],
  },
  8: {
    rowFrs: [3, 2, 2, 2],
    cells: [[1, 3, 1, 2], [3, 5, 1, 2], [1, 2, 2, 4], [2, 5, 2, 3], [2, 4, 3, 4], [4, 5, 3, 4], [1, 3, 4, 5], [3, 5, 4, 5]],
  },
  9: {
    rowFrs: [3, 2, 2, 2],
    cells: [[1, 3, 1, 2], [3, 5, 1, 2], [1, 2, 2, 4], [2, 4, 2, 3], [4, 5, 2, 3], [2, 4, 3, 4], [4, 5, 3, 4], [1, 3, 4, 5], [3, 5, 4, 5]],
  },
  10: {
    rowFrs: [2.5, 2, 2, 2, 2],
    cells: [[1, 3, 1, 2], [3, 5, 1, 2], [1, 2, 2, 4], [2, 4, 2, 3], [4, 5, 2, 3], [2, 5, 3, 4], [1, 3, 4, 5], [3, 5, 4, 5], [1, 3, 5, 6], [3, 5, 5, 6]],
  },
  11: {
    rowFrs: [2.5, 2, 2, 2, 2],
    cells: [[1, 3, 1, 2], [3, 5, 1, 2], [1, 2, 2, 4], [2, 4, 2, 3], [4, 5, 2, 3], [2, 4, 3, 4], [4, 5, 3, 4], [1, 3, 4, 5], [3, 5, 4, 5], [1, 3, 5, 6], [3, 5, 5, 6]],
  },
};

export const SECTION_IDEAL_AR = {
  bestWorst: 1.8, playoffSeeds: 0.85, divisionWinners: 3.5,
  conferenceShowdown: 1.0, toughestDivision: 0.8, boldPredictions: 1.3,
  worstDivision: 0.8, strengthOfSchedule: 1.5, closestRace: 1.2,
  wildCard: 0.85, parityIndex: 1.0,
};

export const SECTION_ORDER = [
  'bestWorst', 'playoffSeeds', 'divisionWinners', 'conferenceShowdown',
  'toughestDivision', 'boldPredictions', 'worstDivision', 'strengthOfSchedule',
  'closestRace', 'wildCard', 'parityIndex',
];

// --- Pixel helpers (full-size for export) ---
export const GRID_W = 1040;
export const GRID_H = 920;
export const GAP = 14;
export const COL_UNIT = (GRID_W - 3 * GAP) / 4;
export const PAD = 12;

// --- RGL constants (full-size) ---
export const RGL_TOTAL_ROWS = 12;
export const RGL_ROW_HEIGHT = (GRID_H - (RGL_TOTAL_ROWS - 1) * GAP) / RGL_TOTAL_ROWS;

// --- Preview constants (half-size for interactive drag) ---
export const PREVIEW_SCALE = 0.7;
export const PREVIEW_GRID_W = GRID_W * PREVIEW_SCALE;
export const PREVIEW_GRID_H = GRID_H * PREVIEW_SCALE;
export const PREVIEW_GAP = GAP * PREVIEW_SCALE;
export const PREVIEW_COL_UNIT = (PREVIEW_GRID_W - 3 * PREVIEW_GAP) / 4;
export const PREVIEW_PAD = PAD * PREVIEW_SCALE;
export const PREVIEW_ROW_HEIGHT = (PREVIEW_GRID_H - (RGL_TOTAL_ROWS - 1) * PREVIEW_GAP) / RGL_TOTAL_ROWS;

export function getCellInfo(c1, c2, r1, r2, rowFrs) {
  const colSpan = c2 - c1;
  const rowSpan = r2 - r1;
  const totalFr = rowFrs.reduce((a, b) => a + b, 0);
  const availH = GRID_H - (rowFrs.length - 1) * GAP;
  const cellW = colSpan * COL_UNIT + (colSpan - 1) * GAP;
  let cellH = 0;
  for (let r = r1 - 1; r < r2 - 1; r++) cellH += (rowFrs[r] / totalFr) * availH;
  cellH += (rowSpan - 1) * GAP;
  const w = cellW - PAD * 2;
  const h = cellH - PAD * 2;
  return { w, h, aspect: w / h };
}

export function getRGLCellInfo(colSpan, rowSpan) {
  const cellW = colSpan * COL_UNIT + (colSpan - 1) * GAP;
  const cellH = rowSpan * RGL_ROW_HEIGHT + (rowSpan - 1) * GAP;
  const w = cellW - PAD * 2;
  const h = cellH - PAD * 2;
  return { w, h, aspect: w / h };
}

export function getPreviewCellInfo(colSpan, rowSpan) {
  const cellW = colSpan * PREVIEW_COL_UNIT + (colSpan - 1) * PREVIEW_GAP;
  const cellH = rowSpan * PREVIEW_ROW_HEIGHT + (rowSpan - 1) * PREVIEW_GAP;
  const w = cellW - PREVIEW_PAD * 2;
  const h = cellH - PREVIEW_PAD * 2;
  return { w, h, aspect: w / h };
}

export function matchSectionsToCells(activeSections, cellInfos) {
  const n = activeSections.length;
  if (n <= 1) return [0];
  const sc = [...Array(n).keys()].sort((a, b) => cellInfos[a].aspect - cellInfos[b].aspect);
  const ss = [...Array(n).keys()].sort(
    (a, b) => (SECTION_IDEAL_AR[activeSections[a]] || 1) - (SECTION_IDEAL_AR[activeSections[b]] || 1)
  );
  const out = new Array(n);
  ss.forEach((si, i) => { out[si] = sc[i]; });
  return out;
}

// Size constraints per section (grid is 4 cols × 12 rows).
export const SECTION_SIZE_LIMITS = {
  bestWorst:           { minW: 1, minH: 3, maxW: 3, maxH: 8 },
  playoffSeeds:        { minW: 2, minH: 6, maxW: 4, maxH: 12 },
  divisionWinners:     { minW: 2, minH: 3, maxW: 4, maxH: 8 },
  conferenceShowdown:  { minW: 1, minH: 3, maxW: 3, maxH: 8 },
  toughestDivision:    { minW: 1, minH: 2, maxW: 2, maxH: 5 },
  boldPredictions:     { minW: 1, minH: 3, maxW: 3, maxH: 8 },
  worstDivision:       { minW: 1, minH: 2, maxW: 2, maxH: 5 },
  strengthOfSchedule:  { minW: 2, minH: 3, maxW: 4, maxH: 8 },
  closestRace:         { minW: 2, minH: 3, maxW: 3, maxH: 8 },
  wildCard:            { minW: 2, minH: 3, maxW: 4, maxH: 8 },
  parityIndex:         { minW: 1, minH: 2, maxW: 2, maxH: 5 },
};

export function bentoToRGL12(cells, rowFrs, sectionKeys) {
  const totalFr = rowFrs.reduce((a, b) => a + b, 0);
  const rowBounds = [0];
  let accum = 0;
  for (const fr of rowFrs) {
    accum += fr;
    rowBounds.push(Math.round((accum / totalFr) * RGL_TOTAL_ROWS));
  }

  return cells.map(([c1, c2, r1, r2], idx) => {
    const key = sectionKeys[idx] || String(idx);
    const limits = SECTION_SIZE_LIMITS[key] || { minW: 1, minH: 1, maxW: 4, maxH: 12 };
    return {
      i: key,
      x: c1 - 1,
      y: rowBounds[r1 - 1],
      w: c2 - c1,
      h: rowBounds[r2 - 1] - rowBounds[r1 - 1],
      minW: limits.minW,
      minH: limits.minH,
      maxW: limits.maxW,
      maxH: limits.maxH,
    };
  });
}

export function rglToCSSGrid({ x, y, w, h }) {
  return [x + 1, x + w + 1, y + 1, y + h + 1];
}
