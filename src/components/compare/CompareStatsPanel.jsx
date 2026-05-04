// ── CompareStatsPanel ─────────────────────────────────────────────────────────
// Year navigation + side-by-side ESPN stat table for player comparison.
// Uses getStatRows() from playerMetrics — same source as Statistics mode.

import { useEffect } from 'react';
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

const STAT_LABEL_OVERRIDES = {
  completions: 'Completions',
  passingAttempts: 'Pass Attempts',
  completionPct: 'Completion Percentage',
  passingYards: 'Passing Yards',
  yardsPerPassAttempt: 'Yards Per Attempt',
  passingTouchdowns: 'Passing Touchdowns',
  QBRating: 'Passer Rating',
  yardsPerCompletion: 'Yards Per Completion',
  rushingYards: 'Rushing Yards',
  rushingTouchdowns: 'Rushing Touchdowns',
  interceptions: 'Interceptions',
  interceptionPct: 'Interception Percentage',
  fumblesLost: 'Fumbles Lost',
  totalQBR: 'Total QBR',
  netYardsPerPassAttempt: 'Net Yards Per Attempt',
  sackYardsLost: 'Sack Yards Lost',
  passingBigPlays: 'Passing Big Plays',
  passingFirstDowns: 'Passing First Downs',
  passingYardsAfterCatch: 'Passing Yards After Catch',
  passingYardsAtCatch: 'Passing Yards At Catch',
  longPassing: 'Longest Pass',
  passingYardsPerGame: 'Passing Yards Per Game',
  rushingFirstDowns: 'Rushing First Downs',
  longRushing: 'Longest Rush',
  rushingYardsPerGame: 'Rushing Yards Per Game',
  rushingAttempts: 'Carries',
  yardsPerRushAttempt: 'Yards Per Carry',
  receptions: 'Receptions',
  receivingYards: 'Receiving Yards',
  receivingTouchdowns: 'Receiving Touchdowns',
  fumbles: 'Fumbles',
  rushing20PlusYds: '20+ Yard Runs',
  receivingFirstDowns: 'Receiving First Downs',
  receivingYardsAfterCatch: 'Receiving Yards After Catch',
  yardsFromScrimmagePerGame: 'Yards From Scrimmage Per Game',
  totalYardsFromScrimmage: 'Yards From Scrimmage',
  receivingTargets: 'Targets',
  yardsPerReception: 'Yards Per Reception',
  longReception: 'Longest Reception',
  receiving20PlusYds: '20+ Yard Receptions',
  receivingYardsAtCatch: 'Receiving Yards At Catch',
  receivingYardsPerGame: 'Receiving Yards Per Game',
  totalTackles: 'Tackles',
  soloTackles: 'Solo Tackles',
  tacklesForLoss: 'Tackles For Loss',
  QBHits: 'QB Hits',
  fumblesForced: 'Forced Fumbles',
  passesDefended: 'Passes Defended',
  hurries: 'Hurries',
  sackYards: 'Sack Yards',
  interceptionYards: 'Interception Yards',
  interceptionTouchdowns: 'Interception Touchdowns',
  longInterception: 'Longest Interception',
  fieldGoalsMade: 'Field Goals Made',
  fieldGoalAttempts: 'Field Goal Attempts',
  fieldGoalPct: 'Field Goal Percentage',
  longFieldGoalMade: 'Longest Field Goal',
  extraPointsMade: 'Extra Points Made',
  extraPointAttempts: 'Extra Point Attempts',
  extraPointPct: 'Extra Point Percentage',
  totalKickingPoints: 'Total Kicking Points',
  fieldGoalsMade50: '50+ Field Goals Made',
  fieldGoalAttempts50: '50+ Field Goal Attempts',
  fieldGoalsMade50_59: '50-59 Yard Field Goals Made',
  longFieldGoalAttempt: 'Longest Field Goal Attempt',
  punts: 'Punts',
  puntYards: 'Punt Yards',
  grossAvgPuntYards: 'Punt Average',
  netAvgPuntYards: 'Net Punt Average',
  puntsInside20: 'Punts Inside 20',
  touchbacks: 'Touchbacks',
  longPunt: 'Longest Punt',
  puntsInside10: 'Punts Inside 10',
  puntsBlocked: 'Punts Blocked',
  touchbackPct: 'Touchback Percentage',
  puntsInside10Pct: 'Inside 10 Percentage',
  puntsInside20Pct: 'Inside 20 Percentage',
  gamesPlayed: 'Games Played',
};

function getCompareStatLabel(label, key) {
  if (key === 'sacks' && label === 'Sacks Taken') return 'Sacks Taken';
  if (key === 'sacks') return 'Sacks';
  if (key && STAT_LABEL_OVERRIDES[key]) return STAT_LABEL_OVERRIDES[key];
  const fallbacks = {
    'TD/INT': 'Touchdown To Interception Ratio',
    'TDs': 'Touchdowns',
    'INTs': 'Interceptions',
    'INT%': 'Interception Percentage',
    'FGM': 'Field Goals Made',
    'FGA': 'Field Goal Attempts',
    'FG%': 'Field Goal Percentage',
    'XPM': 'Extra Points Made',
    'XPA': 'Extra Point Attempts',
    'XP%': 'Extra Point Percentage',
    'TB': 'Touchbacks',
  };
  return fallbacks[label] ?? label;
}

function lastName(displayName) {
  if (!displayName) return '—';
  const parts = displayName.split(' ');
  for (let i = parts.length - 1; i >= 0; i--) {
    if (!SUFFIXES.has(parts[i].toLowerCase())) return parts[i];
  }
  return parts[parts.length - 1];
}

function formatStatValue(raw, decimals = 0, suffix = '') {
  const num = parseFloat(raw);
  if (isNaN(num) || num === 0) return '—';
  const formatted = decimals === 0
    ? Math.round(num).toLocaleString('en-US')
    : num.toFixed(decimals);
  return `${formatted}${suffix}`;
}

function hasDisplayValue(raw) {
  const num = parseFloat(raw);
  return !isNaN(num) && num !== 0;
}

function hasAnySeasonActivity(statsMap) {
  return Object.values(statsMap ?? {}).some((value) => {
    const num = parseFloat(value);
    return !isNaN(num) && num !== 0;
  });
}

function getSideSeasonState(player, statsMap, loading, selectedYear, firstYear) {
  if (!player) return 'empty';
  if (selectedYear !== 'career' && firstYear != null && selectedYear < firstYear) return 'not-in-league';
  if (loading) return 'loading';
  if (statsMap == null) return 'loading';
  if (!hasAnySeasonActivity(statsMap)) return 'inactive';
  return 'active';
}

function formatSideStat(raw, decimals, suffix, seasonState) {
  if (seasonState === 'not-in-league' || seasonState === 'empty') return '';
  if (seasonState === 'inactive') return 'Inactive';
  return formatStatValue(raw, decimals, suffix);
}

function sideHasDisplayValue(raw, seasonState) {
  if (seasonState !== 'active') return false;
  return hasDisplayValue(raw);
}

function withUsageSection(sections) {
  const hasGames = sections.some(section => section.rows.some(row => row.key === 'gamesPlayed'));
  if (hasGames) return sections;
  return [
    { heading: 'Usage', rows: [{ label: 'Games', key: 'gamesPlayed', decimals: 0, suffix: '' }] },
    ...sections,
  ];
}

function buildStatRows(sections, safeMapA, safeMapB, safeRankA, safeRankB, posA, stateA, stateB) {
  return sections.map(({ heading, rows }) => ({
    heading,
    rows: rows.map(({ label, key, decimals = 0, suffix = '', computeForMap }) => {
      const rawA = key != null ? safeMapA[key] : (computeForMap ? computeForMap(safeMapA) : null);
      const rawB = key != null ? safeMapB[key] : (computeForMap ? computeForMap(safeMapB) : null);
      const nA = rawA != null ? parseFloat(rawA) : NaN;
      const nB = rawB != null ? parseFloat(rawB) : NaN;
      const validA = sideHasDisplayValue(rawA, stateA);
      const validB = sideHasDisplayValue(rawB, stateB);
      let winA = false;
      let winB = false;

      if (validA && validB && key != null) {
        const lower = isLowerBetter(key, posA);
        winA = lower ? nA < nB : nA > nB;
        winB = lower ? nB < nA : nB > nA;
      }

      return {
        label: getCompareStatLabel(label, key),
        compactLabel: label,
        key,
        valueA: formatSideStat(rawA, decimals, suffix, stateA),
        valueB: formatSideStat(rawB, decimals, suffix, stateB),
        rankA: validA && key != null ? (safeRankA[key] ?? null) : null,
        rankB: validB && key != null ? (safeRankB[key] ?? null) : null,
        validA,
        validB,
        winA,
        winB,
      };
    }),
  }));
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
  selectedYear,
  firstYearA,
  firstYearB,
  showAdvanced = false,
  showRanks = true,
  onEdgeSummaryChange,
}) {
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

  const displaySections = withUsageSection(showAdvanced ? [...standard, ...advanced] : standard);
  const hasStats = mapA !== null || mapB !== null;
  const stateA = getSideSeasonState(playerA, mapA, loadingA, selectedYear, firstYearA);
  const stateB = getSideSeasonState(playerB, mapB, loadingB, selectedYear, firstYearB);
  const statSections = buildStatRows(displaySections, safeMapA, safeMapB, safeRankA, safeRankB, posA, stateA, stateB);
  const hasBothPlayers = Boolean(playerA && playerB);
  const hasOnePlayer = Boolean(playerA || playerB) && !hasBothPlayers;
  const allRows = statSections.flatMap(section => section.rows);
  const leadA = allRows.filter(row => row.winA).length;
  const leadB = allRows.filter(row => row.winB).length;
  const measuredRows = allRows.filter(row => row.validA && row.validB).length;
  const pushRows = Math.max(0, measuredRows - leadA - leadB);

  useEffect(() => {
    if (!onEdgeSummaryChange) return;
    if (!hasBothPlayers || displaySections.length === 0) {
      onEdgeSummaryChange(null);
      return;
    }
    onEdgeSummaryChange({ leadA, leadB, pushRows, measuredRows });
  }, [displaySections.length, hasBothPlayers, leadA, leadB, measuredRows, onEdgeSummaryChange, pushRows]);

  return (
    <div>
      {/* ── Stat content ──────────────────────────────────────────────── */}
      {(playerA || playerB) && (
        (loadingA || loadingB) && !hasStats ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="w-5 h-5" />
          </div>
        ) : (
          <>
            {displaySections.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm" style={{ color: 'var(--color-label-quaternary)' }}>
                No stats available for this season.
              </div>
            ) : hasBothPlayers ? (
              <TwoPlayerStatsView
                sections={statSections}
                playerA={playerA}
                playerB={playerB}
                showRanks={showRanks}
              />
            ) : hasOnePlayer ? (
              <SinglePlayerStatsView
                sections={statSections}
                player={playerA ?? playerB}
                side={playerA ? 'A' : 'B'}
                loading={playerA ? loadingA : loadingB}
                showRanks={showRanks}
              />
            ) : null}
          </>
        )
      )}
    </div>
  );
}

function TwoPlayerStatsView({ sections, playerA, playerB, showRanks }) {
  return (
    <div className="compare-stats">
      <div className="compare-stats__sections">
        {sections.map(({ heading, rows }) => (
          <section key={heading} className="compare-stats__section">
            <div className="compare-stats__section-heading">
              {heading}
            </div>
            <div className="compare-stats__table">
              {rows.map(row => (
                <CompareStatRow
                  key={row.label}
                  row={row}
                  nameA={lastName(playerA?.displayName)}
                  nameB={lastName(playerB?.displayName)}
                  showRanks={showRanks}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function SinglePlayerStatsView({ sections, player, side, loading, showRanks }) {
  const rows = sections.flatMap(section => section.rows)
    .filter(row => side === 'A' ? row.validA : row.validB);
  const spotlightRows = rows.slice(0, 6);

  return (
    <div className="compare-stats compare-stats--single">
      <div className="compare-stats__single-header">
        <PlayerColumnHeader player={player} loading={loading} />
        <div className="compare-stats__single-note">
          Add a second player above to turn this profile into a head-to-head matchup.
        </div>
      </div>

      {spotlightRows.length > 0 && (
        <div className="compare-stats__spotlight-grid">
          {spotlightRows.map(row => (
            <SingleStatTile key={row.label} row={row} side={side} showRanks={showRanks} />
          ))}
        </div>
      )}

      <div className="compare-stats__sections">
        {sections.map(({ heading, rows: sectionRows }) => (
          <section key={heading} className="compare-stats__section">
            <div className="compare-stats__section-heading">
              {heading}
            </div>
            <div className="compare-stats__single-table">
              {sectionRows.map(row => (
                <SingleStatRow key={row.label} row={row} side={side} showRanks={showRanks} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function PlayerColumnHeader({ player, loading, align = 'left' }) {
  return (
    <div className={`compare-stats__player-header compare-stats__player-header--${align}`}>
      {loading && <Spinner />}
      <span className="compare-stats__player-name">{lastName(player?.displayName)}</span>
      {player?.position && <span className="compare-stats__player-meta">{player.position}</span>}
    </div>
  );
}

function CompareStatRow({ row, nameA, nameB, showRanks }) {
  return (
    <div className={`compare-stats__row ${showRanks ? '' : 'is-ranks-hidden'}`}>
      <StatValueCell
        name={nameA}
        value={row.valueA}
        rank={row.rankA}
        winner={row.winA}
        loser={row.validA && row.validB && row.winB}
        align="right"
        showRank={showRanks}
      />
      <div className="compare-stats__metric">
        <span className="compare-stats__metric-label compare-stats__metric-label--full">{row.label}</span>
        <span className="compare-stats__metric-label compare-stats__metric-label--compact">{row.compactLabel}</span>
      </div>
      <StatValueCell
        name={nameB}
        value={row.valueB}
        rank={row.rankB}
        winner={row.winB}
        loser={row.validA && row.validB && row.winA}
        showRank={showRanks}
      />
    </div>
  );
}

function StatValueCell({ name, value, rank, winner, loser, align = 'left', showRank = true }) {
  const rankLabel = rank ?? '';
  const isStatusValue = value === '' || value === 'Inactive';
  return (
    <div className={`compare-stats__value-cell compare-stats__value-cell--${align} ${showRank ? '' : 'is-ranks-hidden'} ${winner ? 'is-winner' : ''} ${loser ? 'is-loser' : ''}`}>
      <span className="compare-stats__side-name">{name}</span>
      {showRank && align === 'right' && <span className={`compare-stats__rank ${rankLabel ? '' : 'is-empty'}`}>{rankLabel}</span>}
      <span className={`compare-stats__value ${isStatusValue ? 'is-status' : ''}`}>{value}</span>
      {showRank && align !== 'right' && <span className={`compare-stats__rank ${rankLabel ? '' : 'is-empty'}`}>{rankLabel}</span>}
    </div>
  );
}

function SingleStatRow({ row, side, showRanks }) {
  const value = side === 'A' ? row.valueA : row.valueB;
  const rank = side === 'A' ? row.rankA : row.rankB;
  return (
    <div className="compare-stats__single-row">
      <span className="compare-stats__single-label">{row.label}</span>
      <span className="compare-stats__single-value">
        <span className="compare-stats__value">{value}</span>
        {showRanks && rank && <span className="compare-stats__rank">{rank}</span>}
      </span>
    </div>
  );
}

function SingleStatTile({ row, side, compact = false, showRanks = true }) {
  const value = side === 'A' ? row.valueA : row.valueB;
  const rank = side === 'A' ? row.rankA : row.rankB;
  return (
    <article className={`compare-stats__single-tile ${compact ? 'is-compact' : ''}`}>
      <span className="compare-stats__card-label">{row.label}</span>
      <span className="compare-stats__value">{value}</span>
      {showRanks && rank && <span className="compare-stats__rank">{rank}</span>}
    </article>
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
