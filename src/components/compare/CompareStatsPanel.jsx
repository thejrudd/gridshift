// ── CompareStatsPanel ─────────────────────────────────────────────────────────
// Year navigation + side-by-side ESPN stat table for player comparison.
// Uses getStatRows() from playerMetrics — same source as Statistics mode.

import { useState } from 'react';
import { CURRENT_SEASON } from '../../utils/playerApi';
import { getStatRows } from '../../utils/playerMetrics';

// Year range: current season back to 2018, plus Career
export const COMPARE_YEARS = Array.from(
  { length: CURRENT_SEASON - 2018 + 1 },
  (_, i) => CURRENT_SEASON - i,
);

// Stat keys where a lower value is the better outcome
const LOWER_IS_BETTER = new Set(['interceptions', 'interceptionPct', 'fumblesLost', 'fumbles']);
// These are lower-is-better only for QBs (sacks taken, yards lost)
const QB_LOWER = new Set(['sacks', 'sackYardsLost']);

function isLowerBetter(key, posGroup) {
  if (LOWER_IS_BETTER.has(key)) return true;
  if (posGroup === 'QB' && QB_LOWER.has(key)) return true;
  return false;
}

// Build a stat map that includes any key present in either player's map
function mergeMaps(a, b) {
  const merged = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const va = a[k]; const vb = b[k];
    const nva = parseFloat(va); const nvb = parseFloat(vb);
    if (!isNaN(nva) && nva !== 0) merged[k] = va;
    else if (!isNaN(nvb) && nvb !== 0) merged[k] = vb;
    else merged[k] = va ?? vb;
  }
  return merged;
}

const SUFFIXES = new Set(['jr.', 'sr.', 'ii', 'iii', 'iv', 'v', 'jr', 'sr']);

function lastName(displayName) {
  if (!displayName) return '—';
  const parts = displayName.split(' ');
  for (let i = parts.length - 1; i >= 0; i--) {
    if (!SUFFIXES.has(parts[i].toLowerCase())) return parts[i];
  }
  return parts[parts.length - 1];
}

// ── CompareStatsPanel ─────────────────────────────────────────────────────────

/**
 * Props:
 *   playerA / playerB     - ESPN player objects (or null)
 *   mapA / mapB           - flat stat maps for selectedYear (or null if not loaded)
 *   rankMapA / rankMapB   - flat rank maps for selectedYear
 *   loadingA / loadingB   - bool: is selectedYear loading?
 *   loadingYears{A,B}     - Set of years currently in flight (for year pill opacity)
 *   selectedYear          - number | 'career'
 *   onYearChange          - (year) => void
 */
export default function CompareStatsPanel({
  playerA, playerB,
  mapA, mapB,
  rankMapA, rankMapB,
  loadingA, loadingB,
  loadingYearsA, loadingYearsB,
  selectedYear, onYearChange,
  visibleYears,
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const posA = playerA?.position ?? '';
  const posB = playerB?.position ?? '';
  const safeMapA = mapA ?? {};
  const safeMapB = mapB ?? {};
  const safeRankA = rankMapA ?? {};
  const safeRankB = rankMapB ?? {};

  // Merge both players' maps so getStatRows can find data from either player
  const mergedMap = mergeMaps(safeMapA, safeMapB);

  // Call getStatRows for each position separately so cross-position comparisons
  // (e.g. RB vs QB) show stats from both positions, not just one.
  // Sections with the same heading are merged; duplicate row labels are deduplicated.
  function mergeStatSections(secA, secB) {
    const result = new Map();
    for (const sec of [...secA, ...secB]) {
      if (result.has(sec.heading)) {
        const existing = result.get(sec.heading);
        const seen = new Set(existing.rows.map(r => r.label));
        const toAdd = sec.rows.filter(r => !seen.has(r.label));
        result.set(sec.heading, { heading: sec.heading, rows: [...existing.rows, ...toAdd] });
      } else {
        result.set(sec.heading, { heading: sec.heading, rows: [...sec.rows] });
      }
    }
    return [...result.values()];
  }

  const { standard: stdA, advanced: advA } = (playerA || playerB) && posA
    ? getStatRows(mergedMap, posA, {})
    : { standard: [], advanced: [] };
  const { standard: stdB, advanced: advB } = (playerA || playerB) && posB && posB !== posA
    ? getStatRows(mergedMap, posB, {})
    : { standard: [], advanced: [] };

  const standard = mergeStatSections(stdA, stdB);
  const advanced = mergeStatSections(advA, advB);

  const displaySections = showAdvanced ? [...standard, ...advanced] : standard;
  const hasAdvanced = advanced.length > 0;
  const hasStats = mapA !== null || mapB !== null;

  return (
    <div>
      {/* ── Year selector ─────────────────────────────────────────────── */}
      {(playerA || playerB) && (
        <div
          className="px-4 py-3"
          style={{ borderBottom: '1px solid var(--color-separator)' }}
        >
          <div
            className="flex gap-1.5 overflow-x-auto pb-0.5"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {(visibleYears ?? COMPARE_YEARS).map(year => {
              const active = selectedYear === year;
              const inFlight = (playerA && loadingYearsA.has(year)) || (playerB && loadingYearsB.has(year));
              return (
                <button
                  key={year}
                  onClick={() => onYearChange(year)}
                  className="shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors"
                  style={{
                    background: active ? 'var(--color-accent)' : 'var(--color-fill)',
                    color: active ? '#fff' : 'var(--color-label-secondary)',
                    opacity: inFlight ? 0.55 : 1,
                  }}
                >
                  {year}
                </button>
              );
            })}
            <button
              onClick={() => onYearChange('career')}
              className="shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors"
              style={{
                background: selectedYear === 'career' ? 'var(--color-accent)' : 'var(--color-fill)',
                color: selectedYear === 'career' ? '#fff' : 'var(--color-label-secondary)',
              }}
            >
              Career
            </button>
          </div>
        </div>
      )}

      {/* ── Stat content ──────────────────────────────────────────────── */}
      {(playerA || playerB) && (
        (loadingA || loadingB) && !hasStats ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="w-5 h-5" />
          </div>
        ) : (
          <>
            {/* Season label + Advanced toggle */}
            <div
              className="flex items-center justify-between px-4 py-2"
              style={{ background: 'var(--color-fill)', borderBottom: '1px solid var(--color-separator)' }}
            >
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-label-quaternary)' }}>
                {selectedYear === 'career' ? 'Career Totals' : `${selectedYear} Season`}
              </span>
              {hasAdvanced && (
                <button
                  onClick={() => setShowAdvanced(v => !v)}
                  className="flex items-center gap-1.5 text-xs font-semibold"
                  style={{ color: showAdvanced ? 'var(--color-accent)' : 'var(--color-label-tertiary)' }}
                >
                  <span
                    className="relative inline-flex h-3.5 w-6 shrink-0 rounded-full border transition-colors duration-200"
                    style={{
                      background: showAdvanced ? 'var(--color-accent)' : 'var(--color-fill-secondary)',
                      borderColor: showAdvanced ? 'var(--color-accent)' : 'var(--color-separator)',
                    }}
                  >
                    <span className={`absolute top-0.5 left-0.5 h-2.5 w-2.5 rounded-full bg-white shadow transition-transform duration-200 ${showAdvanced ? 'translate-x-2.5' : 'translate-x-0'}`} />
                  </span>
                  Advanced
                </button>
              )}
            </div>

            {/* Player name sub-headers */}
            <div className="flex items-center px-4 py-2" style={{ borderBottom: '1px solid var(--color-separator)' }}>
              <div className="flex-1 text-right text-xs font-semibold pr-2 flex items-center justify-end gap-1.5" style={{ color: 'var(--color-label-secondary)' }}>
                {loadingA && <Spinner />}
                <span className="truncate">{lastName(playerA?.displayName)}</span>
              </div>
              <div className="shrink-0" style={{ width: 80 }} />
              <div className="flex-1 text-left text-xs font-semibold pl-2 flex items-center gap-1.5" style={{ color: 'var(--color-label-secondary)' }}>
                <span className="truncate">{lastName(playerB?.displayName)}</span>
                {loadingB && <Spinner />}
              </div>
            </div>

            {/* Stat sections */}
            {displaySections.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm" style={{ color: 'var(--color-label-quaternary)' }}>
                No stats available for this season.
              </div>
            ) : displaySections.map(({ heading, rows }) => (
              <div key={heading}>
                {/* Section heading */}
                <div
                  className="px-4 py-1.5"
                  style={{ background: 'var(--color-fill-secondary)', borderBottom: '1px solid var(--color-separator)' }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-label-quaternary)' }}>
                    {heading}
                  </span>
                </div>

                {/* Stat rows */}
                {rows.map(({ label, key, decimals = 0, suffix = '', computeForMap }) => {
                  const rawA = key != null ? safeMapA[key] : (computeForMap ? computeForMap(safeMapA) : null);
                  const rawB = key != null ? safeMapB[key] : (computeForMap ? computeForMap(safeMapB) : null);
                  const nA = rawA != null ? parseFloat(rawA) : NaN;
                  const nB = rawB != null ? parseFloat(rawB) : NaN;
                  const validA = !isNaN(nA) && nA !== 0;
                  const validB = !isNaN(nB) && nB !== 0;

                  let winA = false, winB = false;
                  if (validA && validB && key != null) {
                    const lower = isLowerBetter(key, posA);
                    winA = lower ? nA < nB : nA > nB;
                    winB = lower ? nB < nA : nB > nA;
                  }

                  const fmtV = (raw) => {
                    const num = parseFloat(raw);
                    if (isNaN(num) || num === 0) return '—';
                    const formatted = decimals === 0
                      ? Math.round(num).toLocaleString('en-US')
                      : num.toFixed(decimals);
                    return `${formatted}${suffix}`;
                  };

                  const rankA = key != null ? (safeRankA[key] ?? null) : null;
                  const rankB = key != null ? (safeRankB[key] ?? null) : null;

                  return (
                    <div
                      key={label}
                      className="flex px-4 py-2.5"
                      style={{ borderBottom: '1px solid var(--color-separator)' }}
                    >
                      {/* Player A value */}
                      <div className="flex-1 text-right pr-2">
                        <div className="flex items-baseline justify-end gap-1">
                          {winA && <span className="text-[10px]" style={{ color: 'var(--color-signature)' }}>▲</span>}
                          <span
                            className="font-bold tabular-nums text-sm"
                            style={{ color: winA ? 'var(--color-signature)' : 'var(--color-label)' }}
                          >
                            {fmtV(rawA)}
                          </span>
                        </div>
                        {rankA && (
                          <div className="text-[10px] tabular-nums" style={{ color: 'var(--color-label-quaternary)' }}>
                            {rankA}
                          </div>
                        )}
                      </div>

                      {/* Stat label (center) */}
                      <div className="shrink-0 flex items-center justify-center" style={{ width: 80 }}>
                        <span className="text-xs text-center" style={{ color: 'var(--color-label-quaternary)' }}>{label}</span>
                      </div>

                      {/* Player B value */}
                      <div className="flex-1 text-left pl-2">
                        <div className="flex items-baseline gap-1">
                          <span
                            className="font-bold tabular-nums text-sm"
                            style={{ color: winB ? 'var(--color-signature)' : 'var(--color-label)' }}
                          >
                            {fmtV(rawB)}
                          </span>
                          {winB && <span className="text-[10px]" style={{ color: 'var(--color-signature)' }}>▲</span>}
                        </div>
                        {rankB && (
                          <div className="text-[10px] tabular-nums" style={{ color: 'var(--color-label-quaternary)' }}>
                            {rankB}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )
      )}
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner({ size = 'w-3 h-3' }) {
  return (
    <svg className={`animate-spin ${size} shrink-0`} style={{ color: 'var(--color-accent)' }} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
