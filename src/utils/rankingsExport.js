// Export the current Rankings view as a downloadable CSV or plain-text file.
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
