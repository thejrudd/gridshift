// Export the current Rankings view as a downloadable CSV, plain-text file, or
// branded PNG. The PNG reads its colors from the app's semantic CSS tokens so
// the export stays aligned with GridShift's current visual system.
// Rows are scored with whatever scoring is active in the app (your league's
// settings, or a previewed league's settings when a scoring override is on),
// so the export inherently reflects the "Preview another league's scoring" state.

function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'rankings';
}

function escapeCsvCell(value) {
  const str = value == null ? '' : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function buildCsv(columns, rows) {
  const header = columns.map(col => escapeCsvCell(col.label)).join(',');
  const body = rows
    .map(row => columns.map(col => escapeCsvCell(row[col.key])).join(','))
    .join('\n');
  return `${header}\n${body}\n`;
}

function buildTxt(columns, rows, meta) {
  const widths = columns.map(col =>
    rows.reduce(
      (max, row) => Math.max(max, String(row[col.key] ?? '').length),
      col.label.length,
    ),
  );
  const pad = (value, i) => String(value ?? '').padEnd(widths[i]);
  const headerLine = columns.map((col, i) => pad(col.label, i)).join('  ');
  const ruleLine = widths.map(w => '-'.repeat(w)).join('  ');
  const bodyLines = rows.map(row =>
    columns.map((col, i) => pad(row[col.key], i)).join('  '),
  );

  const preamble = [
    meta?.title,
    meta?.scoringLabel ? `Scoring: ${meta.scoringLabel}` : null,
    meta?.scoringStatsLabel ?? null,
    meta?.subtitle,
    `Players: ${rows.length}`,
  ].filter(Boolean);

  return `${preamble.join('\n')}\n\n${headerLine}\n${ruleLine}\n${bodyLines.join('\n')}\n`;
}

function triggerDownload(content, mimeType, filename) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// columns: [{ key, label }]  rows: array of objects keyed by column key
// meta: { title, subtitle, scoringLabel, fileBase }
export function downloadRankingsExport({ columns, rows, meta = {}, format = 'csv' }) {
  if (!rows?.length) return false;
  const base = slugify(meta.fileBase ?? 'gridshift-rankings');
  if (format === 'txt') {
    triggerDownload(buildTxt(columns, rows, meta), 'text/plain;charset=utf-8', `${base}.txt`);
  } else {
    triggerDownload(buildCsv(columns, rows), 'text/csv;charset=utf-8', `${base}.csv`);
  }
  return true;
}

export const RANKINGS_IMAGE_MAX_COUNT = 100;

export function formatRankingsStatsLabel(season) {
  const normalizedSeason = String(season ?? '').trim();
  return normalizedSeason ? `Calculated using ${normalizedSeason} NFL stats` : 'NFL stat season unavailable';
}

export function normalizeRankingsImageCount(value, availableCount) {
  const available = Math.max(0, Math.min(RANKINGS_IMAGE_MAX_COUNT, Math.floor(Number(availableCount) || 0)));
  if (!available) return 0;
  const parsed = Number(value);
  const requested = Number.isFinite(parsed) ? Math.round(parsed) : Math.min(25, available);
  return Math.max(1, Math.min(available, requested));
}

export function getRankingsImageDimensions(count) {
  const normalized = Math.max(1, Math.min(RANKINGS_IMAGE_MAX_COUNT, Math.floor(Number(count) || 1)));
  return {
    width: 1080,
    height: Math.max(720, 382 + normalized * 72),
    rowHeight: 72,
  };
}

export function getRankingsImageRows(rows, count) {
  const normalized = normalizeRankingsImageCount(count, rows?.length ?? 0);
  return normalized ? rows.slice(0, normalized) : [];
}

function getCanvasPalette() {
  const styles = window.getComputedStyle(document.documentElement);
  const token = (name) => styles.getPropertyValue(name).trim();
  return {
    background: token('--color-bg'),
    surface: token('--color-bg-secondary'),
    surfaceAlt: token('--color-bg-tertiary'),
    text: token('--color-label'),
    textSecondary: token('--color-label-secondary'),
    textTertiary: token('--color-label-tertiary'),
    separator: token('--color-separator'),
    signature: token('--color-signature'),
    signatureFg: token('--color-signature-fg'),
  };
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fitText(ctx, value, maxWidth, minSize, fontFactory) {
  const text = String(value ?? '');
  let size = fontFactory.size;
  while (size > minSize) {
    ctx.font = fontFactory.render(size);
    if (ctx.measureText(text).width <= maxWidth) return text;
    size -= 1;
  }
  ctx.font = fontFactory.render(minSize);
  if (ctx.measureText(text).width <= maxWidth) return text;
  let fitted = text;
  while (fitted.length > 1 && ctx.measureText(`${fitted}…`).width > maxWidth) fitted = fitted.slice(0, -1);
  return `${fitted}…`;
}

function drawWrappedText(ctx, value, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = String(value ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    let finalLine = visible[maxLines - 1];
    while (finalLine.length > 1 && ctx.measureText(`${finalLine}…`).width > maxWidth) finalLine = finalLine.slice(0, -1);
    visible[maxLines - 1] = `${finalLine}…`;
  }
  visible.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
}

function drawMetaPanel(ctx, palette, { x, y, width, label, value, detail, secondaryDetail }) {
  roundedRect(ctx, x, y, width, 112, 14);
  ctx.fillStyle = palette.surface;
  ctx.fill();
  ctx.fillStyle = palette.textTertiary;
  ctx.font = '800 16px Figtree, sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText(label.toUpperCase(), x + 22, y + 27);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = palette.text;
  ctx.font = '700 22px Figtree, sans-serif';
  drawWrappedText(ctx, value, x + 22, y + 57, width - 44, 25, detail || secondaryDetail ? 1 : 2);
  if (detail) {
    ctx.fillStyle = palette.textTertiary;
    ctx.font = '600 16px Figtree, sans-serif';
    ctx.fillText(fitText(ctx, detail, width - 44, 13, {
      size: 16,
      render: size => `600 ${size}px Figtree, sans-serif`,
    }), x + 22, y + 80);
  }
  if (secondaryDetail) {
    ctx.fillStyle = palette.textTertiary;
    ctx.font = '600 15px Figtree, sans-serif';
    ctx.fillText(fitText(ctx, secondaryDetail, width - 44, 12, {
      size: 15,
      render: size => `600 ${size}px Figtree, sans-serif`,
    }), x + 22, y + 101);
  }
}

function drawRankingsImage({ rows, meta, count }) {
  const selectedRows = getRankingsImageRows(rows, count);
  const { width, height, rowHeight } = getRankingsImageDimensions(selectedRows.length);
  const palette = getCanvasPalette();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot create the rankings image.');

  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = palette.signature;
  ctx.fillRect(0, 0, width, 12);

  ctx.fillStyle = palette.textTertiary;
  ctx.font = '800 18px Figtree, sans-serif';
  ctx.letterSpacing = '3px';
  ctx.fillText('GRIDSHIFT · FANTASY RANKINGS', 64, 58);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = palette.text;
  ctx.font = '900 58px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.fillText(`TOP ${selectedRows.length} PLAYERS`, 64, 116);
  ctx.fillStyle = palette.textSecondary;
  ctx.font = '600 18px Figtree, sans-serif';
  ctx.fillText(fitText(ctx, meta.subtitle, width - 128, 14, {
    size: 18,
    render: size => `600 ${size}px Figtree, sans-serif`,
  }), 64, 145);

  drawMetaPanel(ctx, palette, {
    x: 64,
    y: 166,
    width: 464,
    label: 'Sorting',
    value: meta.sortLabel,
  });
  drawMetaPanel(ctx, palette, {
    x: 552,
    y: 166,
    width: 464,
    label: 'Scoring model',
    value: meta.scoringModelLabel,
    detail: meta.scoringLabel,
    secondaryDetail: meta.scoringStatsLabel,
  });

  const headerY = 296;
  ctx.fillStyle = palette.textTertiary;
  ctx.font = '800 15px Figtree, sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText('#', 72, headerY + 27);
  ctx.fillText('POS', 146, headerY + 27);
  ctx.fillText('PLAYER', 232, headerY + 27);
  ctx.textAlign = 'right';
  ctx.fillText(String(meta.metricLabel ?? 'VALUE').toUpperCase(), 1008, headerY + 27);
  ctx.textAlign = 'left';
  ctx.letterSpacing = '0px';

  const rowsY = 340;
  selectedRows.forEach((row, index) => {
    const y = rowsY + index * rowHeight;
    roundedRect(ctx, 64, y, 952, 62, 12);
    ctx.fillStyle = index % 2 === 0 ? palette.surface : palette.surfaceAlt;
    ctx.fill();

    ctx.fillStyle = palette.text;
    ctx.font = '800 26px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillText(String(row.rank ?? index + 1), 78, y + 39);

    roundedRect(ctx, 136, y + 13, 70, 36, 8);
    ctx.fillStyle = palette.signature;
    ctx.fill();
    ctx.fillStyle = palette.signatureFg;
    ctx.font = '900 19px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(row.position ?? '—'), 171, y + 38);
    ctx.textAlign = 'left';

    ctx.fillStyle = palette.text;
    const name = fitText(ctx, row.player, 500, 24, {
      size: 30,
      render: size => `800 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`,
    });
    ctx.fillText(name, 232, y + 31);
    const identityMeta = [row.team, row.owner].filter(Boolean).join(' · ');
    ctx.fillStyle = palette.textTertiary;
    ctx.font = '600 15px Figtree, sans-serif';
    ctx.fillText(fitText(ctx, identityMeta, 500, 12, {
      size: 15,
      render: size => `600 ${size}px Figtree, sans-serif`,
    }), 232, y + 50);

    ctx.textAlign = 'right';
    ctx.fillStyle = palette.text;
    ctx.font = '800 27px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillText(String(row.primaryValue ?? '—'), 994, y + 31);
    if (row.secondaryValue) {
      ctx.fillStyle = palette.textTertiary;
      ctx.font = '600 14px Figtree, sans-serif';
      ctx.fillText(String(row.secondaryValue), 994, y + 50);
    }
    ctx.textAlign = 'left';
  });

  ctx.strokeStyle = palette.separator;
  ctx.beginPath();
  ctx.moveTo(64, height - 48);
  ctx.lineTo(1016, height - 48);
  ctx.stroke();
  ctx.fillStyle = palette.textTertiary;
  ctx.font = '700 15px Figtree, sans-serif';
  ctx.fillText('GRIDSHIFT', 64, height - 20);
  ctx.textAlign = 'right';
  ctx.fillText(`${selectedRows.length} PLAYERS · CURRENT VIEW`, 1016, height - 20);
  ctx.textAlign = 'left';

  return { canvas, selectedRows };
}

export async function downloadRankingsImage({ rows, meta = {}, count }) {
  const selectedRows = getRankingsImageRows(rows, count);
  if (!selectedRows.length) return false;
  await document.fonts?.ready;
  const { canvas } = drawRankingsImage({ rows: selectedRows, meta, count: selectedRows.length });
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('GridShift could not finish the rankings image.');
  const base = slugify(meta.fileBase ?? 'gridshift-rankings');
  triggerBlobDownload(blob, `${base}-top-${selectedRows.length}.png`);
  return true;
}
