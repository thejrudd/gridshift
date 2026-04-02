import { useMemo, useState } from 'react';
import { buildStatMap, buildRankMap, getStatRows, getGameLogColumns } from '../utils/playerMetrics';
import { CURRENT_SEASON } from '../utils/playerApi';
import { useSleeper } from '../context/SleeperContext';
import {
  buildFantasyRankByKey,
  getFantasyContribution,
} from '../utils/fantasyStatContributions';

// Extract a formatted stat value from a per-game statsJson
function statVal(statsJson, key, decimals = 0, suffix = '') {
  const map = buildStatMap(statsJson);
  const raw = map[key];
  if (raw === null || raw === undefined) return '--';
  const num = parseFloat(raw);
  if (isNaN(num)) return '--';
  return `${Number(num).toFixed(decimals)}${suffix}`;
}

const PlayerStatTable = ({ year, statsJson, position, sleeperId = null, expanded, onToggle, loading, error, gameLog, gameLogLoading, honors = [], accentColor }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showFantasyValue, setShowFantasyValue] = useState(false);
  const { scoringSettings, players: sleeperPlayers, seasonStats: sleeperSeasonStats } = useSleeper();

  const { standard, advanced, statsMap } = useMemo(() => {
    if (!statsJson) return { standard: [], advanced: [] };
    const map = buildStatMap(statsJson);
    const rankMap = buildRankMap(statsJson);
    const sections = getStatRows(map, position, rankMap);
    return { ...sections, statsMap: map };
  }, [position, statsJson]);

  const label = year === 'career' ? 'Career' : `${year} Season`;
  const canShowFantasyValue = year === CURRENT_SEASON && !!scoringSettings;
  const fantasyRankByKey = useMemo(
    () => buildFantasyRankByKey(sleeperSeasonStats, sleeperPlayers, scoringSettings),
    [scoringSettings, sleeperPlayers, sleeperSeasonStats],
  );

  const enrichRows = (sections) => sections.map((section) => ({
    ...section,
    rows: section.rows.map((row) => ({
      ...row,
      fantasyPoints: canShowFantasyValue && showFantasyValue
        ? getFantasyContribution(row.key, statsMap, position, scoringSettings)
        : null,
      fantasyRank: canShowFantasyValue && showFantasyValue && sleeperId
        ? (fantasyRankByKey.get(row.key)?.get(sleeperId) ?? null)
        : null,
    })),
  }));

  // Merge advanced sections into display when toggle is on
  const displaySections = useMemo(() => {
    const sections = showAdvanced ? [...standard, ...advanced] : standard;
    return canShowFantasyValue && showFantasyValue ? enrichRows(sections) : sections;
  }, [advanced, canShowFantasyValue, fantasyRankByKey, scoringSettings, showAdvanced, showFantasyValue, sleeperId, standard, statsMap, position]);
  const hasAdvanced = advanced.length > 0;

  return (
    <div
      className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden transition-all"
      style={expanded && accentColor ? { borderLeftColor: accentColor, borderLeftWidth: '3px' } : undefined}
    >
      {/* Accordion header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold shrink-0">
            {label}
          </span>
          {honors.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {honors.map(honor => <HonorBadge key={honor} honor={honor} />)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <svg
              className="animate-spin w-4 h-4"
              style={{ color: accentColor ?? '#3b82f6' }}
              fill="none" viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Stat content */}
      {expanded && (
        <div className="bg-white dark:bg-gray-900">
          {error ? (
            <p className="px-4 py-3 text-sm text-red-500 dark:text-red-400 italic">{error}</p>
          ) : loading ? (
            <p className="px-4 py-3 text-sm text-gray-400 italic">Loading stats…</p>
          ) : standard.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400 italic">No stats available for this season.</p>
          ) : (
            <>
              {/* Season totals — grouped by category */}
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                {(hasAdvanced || canShowFantasyValue) && (
                  <div className="mb-3 pb-3 border-b border-gray-100 dark:border-gray-700 flex flex-wrap gap-x-5 gap-y-2">
                    {canShowFantasyValue && (
                      <button
                        role="switch"
                        aria-checked={showFantasyValue}
                        onClick={() => setShowFantasyValue(v => !v)}
                        className="flex items-center gap-2 group"
                      >
                        <span
                          className={`relative inline-flex h-4 w-7 shrink-0 rounded-full border transition-colors duration-200 ${!showFantasyValue ? 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600' : ''}`}
                          style={showFantasyValue && accentColor ? { background: accentColor, borderColor: accentColor } : undefined}
                        >
                          <span className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform duration-200 ${showFantasyValue ? 'translate-x-3' : 'translate-x-0'}`} />
                        </span>
                        <span
                          className={`text-xs font-semibold transition-colors ${!showFantasyValue ? 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-400' : ''}`}
                          style={showFantasyValue && accentColor ? { color: accentColor } : undefined}
                        >
                          Fantasy value
                        </span>
                      </button>
                    )}

                    {/* Advanced stats toggle */}
                    {hasAdvanced && (
                      <button
                        role="switch"
                        aria-checked={showAdvanced}
                        onClick={() => setShowAdvanced(v => !v)}
                        className="flex items-center gap-2 group"
                      >
                        {/* Pill track */}
                        <span
                          className={`relative inline-flex h-4 w-7 shrink-0 rounded-full border transition-colors duration-200 ${!showAdvanced ? 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600' : ''}`}
                          style={showAdvanced && accentColor ? { background: accentColor, borderColor: accentColor } : undefined}
                        >
                          <span className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform duration-200 ${showAdvanced ? 'translate-x-3' : 'translate-x-0'}`} />
                        </span>
                        <span
                          className={`text-xs font-semibold transition-colors ${!showAdvanced ? 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-400' : ''}`}
                          style={showAdvanced && accentColor ? { color: accentColor } : undefined}
                        >
                          Advanced stats
                        </span>
                      </button>
                    )}
                  </div>
                )}

                <StatSections sections={displaySections} accentColor={accentColor} />
              </div>

              {/* Game-by-game log (not shown for career row) */}
              {year !== 'career' && (
                <GameLog
                  gameLog={gameLog}
                  gameLogLoading={gameLogLoading}
                  position={position}
                  showAdvanced={showAdvanced}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// Color config for each award/honor type
const HONOR_CONFIG = {
  'NFL MVP':                          { label: 'MVP',      cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-600' },
  'Super Bowl MVP':                   { label: 'SB MVP',   cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-600' },
  'NFL Offensive Player of the Year': { label: 'OPOY',     cls: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-600' },
  'NFL Defensive Player of the Year': { label: 'DPOY',     cls: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-300 dark:border-red-600' },
  'NFL Offensive Rookie of the Year': { label: 'OROTY',    cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-600' },
  'NFL Defensive Rookie of the Year': { label: 'DROTY',    cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-600' },
  'NFL Comeback Player of the Year':  { label: 'CPOY',     cls: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-600' },
  'Walter Payton NFL Man of the Year':{ label: 'WPMOY',    cls: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-600' },
  'Pro Bowl':                         { label: 'Pro Bowl', cls: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-600' },
  '1st Team All-Pro':                 { label: '1st AP',   cls: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-600' },
  '2nd Team All-Pro':                 { label: '2nd AP',   cls: 'bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600' },
};

const HonorBadge = ({ honor }) => {
  const c = HONOR_CONFIG[honor] ?? { label: honor, cls: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600' };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wide ${c.cls}`}>
      {c.label}
    </span>
  );
};

const StatSections = ({ sections, accentColor }) => (
  <div className="space-y-4">
    {sections.map(({ heading, rows }) => (
      <div key={heading}>
        <div
          className="text-[10px] font-bold uppercase tracking-widest pb-1 mb-2 border-b"
          style={accentColor
            ? { color: accentColor, borderBottomColor: `${accentColor}40` }
            : { color: undefined, borderBottomColor: undefined }
          }
        >
          <span className={accentColor ? '' : 'text-gray-400 dark:text-gray-500'}>{heading}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-2">
          {rows.map(({ label, value, rank, fantasyPoints, fantasyRank }) => (
            <div key={label} className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">{label}</span>
              <div className="flex items-baseline gap-1">
                <span className="text-base font-bold text-gray-800 dark:text-gray-100">{value}</span>
                {rank && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">({rank})</span>
                )}
              </div>
              {fantasyPoints != null && fantasyPoints !== 0 && (
                <div className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
                  {fantasyPoints.toFixed(2)} pts
                  {fantasyRank != null ? ` · #${fantasyRank}` : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

const GameLog = ({ gameLog, gameLogLoading, position, showAdvanced }) => {
  const { standard, advanced } = getGameLogColumns(position);
  const cols = showAdvanced ? [...standard, ...advanced] : standard;

  if (gameLogLoading) {
    return (
      <div className="px-4 py-3 flex items-center gap-2 text-sm text-gray-400 italic border-t border-gray-100 dark:border-gray-800">
        <svg className="animate-spin w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading game log…
      </div>
    );
  }

  if (!gameLog || gameLog.length === 0) return null;

  return (
    <div className="overflow-x-auto border-t border-gray-100 dark:border-gray-800">
      <table className="w-full text-xs min-w-max">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800/60">
            <th className="px-3 py-2 text-left font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider whitespace-nowrap">Wk</th>
            <th className="px-3 py-2 text-left font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider whitespace-nowrap">Team</th>
            <th className="px-3 py-2 text-left font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider whitespace-nowrap">Opponent</th>
            <th className="px-3 py-2 text-left font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider whitespace-nowrap">Result</th>
            {cols.map(col => (
              <th key={col.key} className="px-3 py-2 text-right font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider whitespace-nowrap">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {gameLog.map((game, i) => {
            const { meta } = game;
            const isBye      = !!meta.isBye;
            const isInactive = !!meta.isInactive;
            const result     = meta.result ?? '-';
            const isPost     = !!meta.isPostseason;
            const prevIsPost = i > 0 && !!gameLog[i - 1].meta.isPostseason;
            const showPlayoffDivider = isPost && !prevIsPost;

            // BYE row — simple full-width label
            if (isBye) {
              return (
                <tr key={game.eventId} className="bg-gray-50/40 dark:bg-gray-800/20 italic">
                  <td className="px-3 py-1 text-gray-400 dark:text-gray-600 tabular-nums text-[11px]">{meta.week}</td>
                  <td className="px-3 py-1 text-gray-400 dark:text-gray-600 text-[11px]">{meta.myTeam ?? '—'}</td>
                  <td colSpan={2 + cols.length} className="px-3 py-1 text-gray-400 dark:text-gray-600 font-medium tracking-wide">
                    BYE
                  </td>
                </tr>
              );
            }

            const resultColor =
              result === 'W' ? 'text-green-600 dark:text-green-400' :
              result === 'L' ? 'text-red-500 dark:text-red-400' :
              'text-gray-400';

            const rowBg = isPost
              ? 'bg-amber-50/60 dark:bg-amber-900/10'
              : isInactive
                ? 'bg-gray-50/60 dark:bg-gray-800/30'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800/40';

            const weekLabel = isPost
              ? (meta.roundLabel ?? 'Playoffs')
              : (meta.week ?? i + 1);

            const dimText = isInactive ? 'opacity-60' : '';

            return (
              <>
                {showPlayoffDivider && (
                  <tr key={`divider-${game.eventId}`}>
                    <td
                      colSpan={4 + cols.length}
                      className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-t-2 border-amber-200 dark:border-amber-800"
                    >
                      Playoffs
                    </td>
                  </tr>
                )}
                <tr key={game.eventId ?? i} className={`transition-colors ${rowBg} ${dimText}`}>
                  <td className="px-3 py-1.5 text-gray-400 dark:text-gray-500 whitespace-nowrap tabular-nums text-[11px]">
                    {weekLabel}
                  </td>
                  <td className="px-3 py-1.5 font-medium whitespace-nowrap text-gray-500 dark:text-gray-400 text-[11px]">
                    {meta.myTeam ?? '—'}
                  </td>
                  <td className={`px-3 py-1.5 font-medium whitespace-nowrap ${isPost ? 'text-amber-700 dark:text-amber-300' : 'text-gray-700 dark:text-gray-300'}`}>
                    {meta.opponent ?? '—'}
                  </td>
                  <td className={`px-3 py-1.5 font-semibold whitespace-nowrap ${resultColor}`}>
                    {result !== '-' ? `${result} ${meta.score ?? ''}` : '—'}
                    {isInactive && (
                      <span className="ml-1.5 text-[10px] font-normal text-gray-400 dark:text-gray-500 not-italic normal-case">
                        (inactive)
                      </span>
                    )}
                  </td>
                  {cols.map(col => (
                    <td key={col.key} className="px-3 py-1.5 text-right text-gray-800 dark:text-gray-200 tabular-nums whitespace-nowrap">
                      {statVal(game.statsJson, col.key, col.decimals ?? 0, col.suffix ?? '')}
                    </td>
                  ))}
                </tr>
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default PlayerStatTable;
