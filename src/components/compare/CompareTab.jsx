// ── CompareTab ────────────────────────────────────────────────────────────────
// Unified 4th top-level tab: side-by-side ESPN stats + Sleeper fantasy.
// Player selection uses ESPN rosters (rich smart search).
// Sleeper match is attempted automatically via espn_id / name+pos lookup.

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPlayerStats, fetchPlayerCareerStats, CURRENT_SEASON } from '../../utils/playerApi';
import { buildStatMap, buildRankMap } from '../../utils/playerMetrics';
import { matchEspnToSleeper } from '../../utils/espnSleeperMatch';
import { useSleeperLeague, useSleeperStats } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import useCardGlow from '../../hooks/useCardGlow.jsx';
import { getTeamVisualTheme } from '../../utils/teamVisualTheme.js';
import {
  getCompanionPositionColor,
  getNflTeamLogoUrl,
  getPositionTextColor,
} from '../../utils/companionAssetVisuals.js';
import ComparePickerSheet from './ComparePickerSheet';
import CompareStatsPanel, { COMPARE_YEARS } from './CompareStatsPanel';
import CompareFantasyPanel from './CompareFantasyPanel';

const PANELS = [
  { id: 'stats',   label: 'Stats' },
  { id: 'fantasy', label: 'Fantasy' },
];

function scheduleDeferredCompareTask(callback, timeout = 220) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const idleId = window.requestIdleCallback(() => callback(), { timeout });
    return () => window.cancelIdleCallback(idleId);
  }
  const timerId = window.setTimeout(callback, 0);
  return () => window.clearTimeout(timerId);
}

function getPlayerExperienceYears(player) {
  const raw = player?.experience;
  if (typeof raw === 'number') return raw;
  if (typeof raw?.years === 'number') return raw.years;
  return 0;
}

function getPlayerFirstSeason(player) {
  if (!player) return null;
  const seasonsCompleted = getPlayerExperienceYears(player);
  return Math.max(2018, CURRENT_SEASON - seasonsCompleted);
}

function isPlayerInSeason(player, year) {
  if (!player || year === 'career') return Boolean(player);
  const firstSeason = getPlayerFirstSeason(player);
  return firstSeason != null && year >= firstSeason && year <= CURRENT_SEASON;
}

// ── CompareTab ────────────────────────────────────────────────────────────────

export default function CompareTab({ teams, initialPlayerA, initialPlayerB, onPlayerAChange, onPlayerBChange, onViewPlayer }) {
  const {
    hasLeague,
    season: sleeperSeason,
    changeSeason: changeSleeperSeason,
    availableSeasons: sleeperAvailableSeasons,
  } = useSleeperLeague();
  const { players: sleeperPlayers, loadPlayers } = useSleeperStats();

  // ESPN player selections
  const [playerA, setPlayerA] = useState(null);
  const [playerB, setPlayerB] = useState(null);

  // Matched Sleeper IDs
  const [sleeperIdA, setSleeperIdA] = useState(null);
  const [sleeperIdB, setSleeperIdB] = useState(null);

  // Per-year stat caches: { [year|'career']: statMap }
  const [cacheA, setCacheA] = useState({});
  const [cacheB, setCacheB] = useState({});

  // Per-year rank caches: { [year|'career']: rankMap }
  const [rankCacheA, setRankCacheA] = useState({});
  const [rankCacheB, setRankCacheB] = useState({});

  // Sets of years currently loading
  const [loadingYearsA, setLoadingYearsA] = useState(new Set());
  const [loadingYearsB, setLoadingYearsB] = useState(new Set());

  const [pickingSlot, setPickingSlot] = useState(null); // 'A' | 'B' | null
  const [selectedYear, setSelectedYear] = useState(CURRENT_SEASON);
  const [panel, setPanel] = useState('stats');
  const [showAdvancedStats, setShowAdvancedStats] = useState(false);
  const [showStatRanks, setShowStatRanks] = useState(true);
  const [statsEdgeSummary, setStatsEdgeSummary] = useState(null);
  const [fantasyEdgeSummary, setFantasyEdgeSummary] = useState(null);

  // ── Pre-populate player A from Statistics view ──────────────────────────────

  useEffect(() => {
    if (!initialPlayerA) return;
    setPlayerA(initialPlayerA);
    setCacheA({});
    setRankCacheA({});
    setLoadingYearsA(new Set());
    setPanel('stats');
    const cancelTask = scheduleDeferredCompareTask(() => {
      if (isPlayerInSeason(initialPlayerA, selectedYear)) loadYear('A', initialPlayerA, selectedYear);
      if (hasLeague) {
        (async () => {
          const playersData = sleeperPlayers ?? await loadPlayers();
          const sid = playersData ? matchEspnToSleeper(initialPlayerA, playersData) : null;
          setSleeperIdA(sid);
        })();
      }
    });
    return () => cancelTask?.();
  }, [initialPlayerA]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!initialPlayerB) return;
    setPlayerB(initialPlayerB);
    setCacheB({});
    setRankCacheB({});
    setLoadingYearsB(new Set());
    setPanel('stats');
    const cancelTask = scheduleDeferredCompareTask(() => {
      if (isPlayerInSeason(initialPlayerB, selectedYear)) loadYear('B', initialPlayerB, selectedYear);
      if (hasLeague) {
        (async () => {
          const playersData = sleeperPlayers ?? await loadPlayers();
          const sid = playersData ? matchEspnToSleeper(initialPlayerB, playersData) : null;
          setSleeperIdB(sid);
        })();
      }
    });
    return () => cancelTask?.();
  }, [initialPlayerB]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stat fetching ───────────────────────────────────────────────────────────

  const loadYear = useCallback(async (slot, player, year) => {
    const setCache     = slot === 'A' ? setCacheA     : setCacheB;
    const setRankCache = slot === 'A' ? setRankCacheA : setRankCacheB;
    const setLoading   = slot === 'A' ? setLoadingYearsA : setLoadingYearsB;

    setLoading(prev => new Set([...prev, year]));
    try {
      const json = year === 'career'
        ? await fetchPlayerCareerStats(player.id).catch(() => null)
        : await fetchPlayerStats(player.id, year).catch(() => null);
      const statMap = json ? buildStatMap(json) : {};
      const rankMap = json ? buildRankMap(json) : {};
      setCache(prev => ({ ...prev, [year]: statMap }));
      setRankCache(prev => ({ ...prev, [year]: rankMap }));
    } finally {
      setLoading(prev => { const s = new Set(prev); s.delete(year); return s; });
    }
  }, []);

  // ── Slot selection ──────────────────────────────────────────────────────────

  async function handleSelect(player) {
    const slot = pickingSlot;
    setPickingSlot(null);

    // Start stat fetch immediately (doesn't need Sleeper data)
    if (slot === 'A') {
      setPlayerA(player);
      onPlayerAChange?.(player);
      setCacheA({});
      setLoadingYearsA(new Set());
      if (isPlayerInSeason(player, selectedYear)) loadYear('A', player, selectedYear);
    } else {
      setPlayerB(player);
      onPlayerBChange?.(player);
      setCacheB({});
      setLoadingYearsB(new Set());
      if (isPlayerInSeason(player, selectedYear)) loadYear('B', player, selectedYear);
    }

    // Match to Sleeper — load player DB if not yet available
    if (hasLeague) {
      const playersData = sleeperPlayers ?? await loadPlayers();
      const sid = playersData ? matchEspnToSleeper(player, playersData) : null;
      if (slot === 'A') setSleeperIdA(sid);
      else setSleeperIdB(sid);
    }
  }

  function handleClear(slot) {
    if (slot === 'A') {
      setPlayerA(null);
      onPlayerAChange?.(null);
      setCacheA({});
      setRankCacheA({});
      setLoadingYearsA(new Set());
      setSleeperIdA(null);
    } else {
      setPlayerB(null);
      onPlayerBChange?.(null);
      setCacheB({});
      setRankCacheB({});
      setLoadingYearsB(new Set());
      setSleeperIdB(null);
    }
  }

  function handleYearChange(year) {
    startTransition(() => {
      setSelectedYear(year);
    });
    if (playerA && isPlayerInSeason(playerA, year) && cacheA[year] === undefined && !loadingYearsA.has(year)) loadYear('A', playerA, year);
    if (playerB && isPlayerInSeason(playerB, year) && cacheB[year] === undefined && !loadingYearsB.has(year)) loadYear('B', playerB, year);
  }

  const mapA = cacheA[selectedYear] ?? null;
  const mapB = cacheB[selectedYear] ?? null;
  const rankMapA = rankCacheA[selectedYear] ?? {};
  const rankMapB = rankCacheB[selectedYear] ?? {};
  const isLoadingA = loadingYearsA.has(selectedYear);
  const isLoadingB = loadingYearsB.has(selectedYear);

  // Compute which years to show: union of seasons where either selected player was in the league.
  // Experience is seasons completed before the current season (0 = rookie this year).
  const firstYearA = getPlayerFirstSeason(playerA);
  const firstYearB = getPlayerFirstSeason(playerB);
  const minYear = firstYearA !== null && firstYearB !== null
    ? Math.min(firstYearA, firstYearB)
    : (firstYearA ?? firstYearB ?? 2018);
  const visibleYears = (playerA || playerB)
    ? Array.from({ length: CURRENT_SEASON - minYear + 1 }, (_, i) => CURRENT_SEASON - i)
    : [];
  const selectedYearAvailable = selectedYear === 'career' || visibleYears.includes(selectedYear);

  useEffect(() => {
    if (!visibleYears.length || selectedYearAvailable) return;
    const nextYear = visibleYears[0];
    setSelectedYear(nextYear);
    if (playerA && isPlayerInSeason(playerA, nextYear) && cacheA[nextYear] === undefined && !loadingYearsA.has(nextYear)) loadYear('A', playerA, nextYear);
    if (playerB && isPlayerInSeason(playerB, nextYear) && cacheB[nextYear] === undefined && !loadingYearsB.has(nextYear)) loadYear('B', playerB, nextYear);
  }, [cacheA, cacheB, loadYear, loadingYearsA, loadingYearsB, playerA, playerB, selectedYearAvailable, visibleYears]);

  return (
    <div className="trade-compare pb-8" data-testid="trade-compare-root">
      {/* ── Panel tab selector — always at top ───────────────────────────── */}
      <div className="px-4">
      <div className="trade-compare__tabs season-tabs" role="tablist">
        {PANELS.map(({ id, label }) => {
          if (id === 'fantasy' && !hasLeague) return null;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={panel === id}
              onClick={() => setPanel(id)}
              className={`trade-compare__tab season-tab${panel === id ? ' active' : ''}`}
              data-testid={`trade-compare-tab-${id}`}
            >
              {label}
            </button>
          );
        })}
      </div>
      </div>

      {panel === 'stats' && (playerA || playerB) && (
        <CompareSeasonControls
          playerA={playerA}
          playerB={playerB}
          selectedYear={selectedYear}
          visibleYears={visibleYears}
          loadingYearsA={loadingYearsA}
          loadingYearsB={loadingYearsB}
          showAdvanced={showAdvancedStats}
          onAdvancedChange={setShowAdvancedStats}
          showRanks={showStatRanks}
          onRanksChange={setShowStatRanks}
          onYearChange={handleYearChange}
        />
      )}

      {panel === 'fantasy' && hasLeague && (playerA || playerB) && (
        <CompareSeasonControls
          playerA={playerA}
          playerB={playerB}
          selectedYear={sleeperSeason}
          visibleYears={sleeperAvailableSeasons}
          loadingYearsA={new Set()}
          loadingYearsB={new Set()}
          onYearChange={changeSleeperSeason}
        />
      )}

      {/* ── Player slot row — always visible below tabs ──────────────────── */}
      <div
        className="trade-compare__slots flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-stretch"
        data-testid="trade-compare-slots"
        style={{ borderBottom: '1px solid var(--color-separator)' }}
      >
        <PlayerSlot
          slotId="a"
          label="Player 1"
          player={playerA}
          onPick={() => setPickingSlot('A')}
          onClear={() => handleClear('A')}
          onViewPlayer={onViewPlayer}
        />
        <div
          className="trade-compare__versus flex items-center justify-center shrink-0 text-xs font-bold"
          style={{
            color: 'var(--color-label-quaternary)',
            width: (panel === 'stats' || panel === 'fantasy') && playerA && playerB ? 'auto' : 24,
          }}
        >
          {panel === 'stats' && playerA && playerB ? (
            <CategoryEdgeSummary summary={statsEdgeSummary} label="Stats Edge" note="stat wins" />
          ) : panel === 'fantasy' && playerA && playerB ? (
            <CategoryEdgeSummary summary={fantasyEdgeSummary} label="Fantasy Edge" note="metric wins" />
          ) : (
            'vs'
          )}
        </div>
        <PlayerSlot
          slotId="b"
          label="Player 2"
          player={playerB}
          onPick={() => setPickingSlot('B')}
          onClear={() => handleClear('B')}
          onViewPlayer={onViewPlayer}
        />
      </div>

      {/* ── Panel content ────────────────────────────────────────────────── */}
      {panel === 'stats' && (
        <CompareStatsPanel
          playerA={playerA}
          playerB={playerB}
          mapA={mapA}
          mapB={mapB}
          rankMapA={rankMapA}
          rankMapB={rankMapB}
          loadingA={isLoadingA}
          loadingB={isLoadingB}
          selectedYear={selectedYear}
          firstYearA={firstYearA}
          firstYearB={firstYearB}
          showAdvanced={showAdvancedStats}
          showRanks={showStatRanks}
          onEdgeSummaryChange={setStatsEdgeSummary}
        />
      )}

      {panel === 'fantasy' && hasLeague && (
        <CompareFantasyPanel
          sleeperIdA={sleeperIdA}
          sleeperIdB={sleeperIdB}
          onEdgeSummaryChange={setFantasyEdgeSummary}
        />
      )}

      {/* Empty state — no players selected */}
      {!playerA && !playerB && (
        <div className="flex flex-col items-center justify-center py-20 px-6 gap-2">
          <span className="text-sm text-center" style={{ color: 'var(--color-label-secondary)' }}>
            Select two players to compare side-by-side.
          </span>
          <span className="text-xs text-center" style={{ color: 'var(--color-label-quaternary)' }}>
            Searches all 32 NFL rosters for stats and fantasy comparisons.
          </span>
        </div>
      )}

      {/* ── Player picker sheet ──────────────────────────────────────────── */}
      {pickingSlot && (
        <ComparePickerSheet
          teams={teams}
          excludeId={pickingSlot === 'A' ? playerB?.id : playerA?.id}
          onSelect={handleSelect}
          onClose={() => setPickingSlot(null)}
        />
      )}
    </div>
  );
}

function CompareSeasonControls({
  playerA,
  playerB,
  selectedYear,
  visibleYears,
  loadingYearsA,
  loadingYearsB,
  showAdvanced,
  onAdvancedChange,
  showRanks,
  onRanksChange,
  onYearChange,
}) {
  const showAdvancedControl = typeof onAdvancedChange === 'function';
  const showRankControl = typeof onRanksChange === 'function';

  return (
    <div className="trade-compare__stat-controls px-4 pt-3">
      <div
        className="trade-compare__year-rail"
        aria-label="Compare season"
      >
        {(visibleYears.length ? visibleYears : COMPARE_YEARS).map(year => {
          const active = selectedYear === year;
          const inFlight = (playerA && loadingYearsA.has(year)) || (playerB && loadingYearsB.has(year));
          return (
            <button
              key={year}
              onClick={() => onYearChange(year)}
              className="trade-compare__year-chip"
              data-active={active}
              style={{
                background: active ? 'var(--color-signature)' : 'var(--color-fill)',
                color: active ? 'var(--color-signature-fg)' : 'var(--color-label-secondary)',
                opacity: inFlight ? 0.55 : 1,
              }}
            >
              {year}
            </button>
          );
        })}
        <button
          onClick={() => onYearChange('career')}
          className="trade-compare__year-chip"
          data-active={selectedYear === 'career'}
          style={{
            background: selectedYear === 'career' ? 'var(--color-accent)' : 'var(--color-fill)',
            color: selectedYear === 'career' ? '#fff' : 'var(--color-label-secondary)',
          }}
        >
          Career
        </button>
      </div>

      {(showRankControl || showAdvancedControl) && (
        <div className="trade-compare__control-toggles">
          {showRankControl && (
            <ControlToggle
              label="Ranks"
              active={showRanks}
              onClick={() => onRanksChange(v => !v)}
            />
          )}
          {showAdvancedControl && (
            <ControlToggle
              label="Advanced"
              active={showAdvanced}
              onClick={() => onAdvancedChange(v => !v)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ControlToggle({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="trade-compare__advanced-toggle"
      aria-pressed={active}
    >
      <span
        className="trade-compare__advanced-switch"
        data-active={active}
        aria-hidden="true"
      >
        <span />
      </span>
      {label}
    </button>
  );
}

function CategoryEdgeSummary({ summary, label, note }) {
  const leadA = summary?.leadA ?? 0;
  const leadB = summary?.leadB ?? 0;
  const pushRows = summary?.pushRows ?? 0;

  return (
    <div className="trade-compare__category-edge" aria-label="Category edge">
      <span className="trade-compare__category-edge-label">{label}</span>
      <span className="trade-compare__category-edge-score">{leadA}-{leadB}</span>
      <span className="trade-compare__category-edge-note">
        {pushRows ? `${pushRows} even · ${note}` : note}
      </span>
    </div>
  );
}

// ── PlayerSlot ────────────────────────────────────────────────────────────────

function PlayerSlot({ slotId, label, player, onPick, onClear, onViewPlayer, ktcValue, isKtcLeader, ktcNotFound }) {
  const { darkMode } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const teamTheme = player ? getTeamVisualTheme(player.teamId, darkMode) : null;
  const hasTeamGradient = Boolean(teamTheme?.gradient);
  const positionColor = getCompanionPositionColor(player?.position);
  const positionTextColor = positionColor ? getPositionTextColor(positionColor) : 'var(--color-label)';
  const accentColor = teamTheme?.borderColor ?? positionColor ?? 'var(--color-accent)';
  const slotBg = hasTeamGradient ? teamTheme.gradient : (teamTheme?.tint ?? 'var(--color-fill)');
  const hoverBg = teamTheme?.hoverTint ?? 'var(--color-fill-secondary)';
  const slotForeground = hasTeamGradient ? teamTheme.gradientForeground : 'var(--color-label)';
  const slotMuted = hasTeamGradient ? teamTheme.gradientMuted : 'var(--color-label-secondary)';
  const slotSubtle = hasTeamGradient ? teamTheme.gradientSubtle : 'var(--color-fill-secondary)';
  const valueForeground = hasTeamGradient ? teamTheme.gradientEndForeground : slotForeground;
  const valueMuted = hasTeamGradient ? teamTheme.gradientEndMuted : 'var(--color-label-quaternary)';
  const teamLogoUrl = getNflTeamLogoUrl(teamTheme?.logoKey);
  const { glowHandlers, borderOverlay, glowShadow } = useCardGlow({
    enabled: Boolean(player && isHovered),
    color: accentColor,
    cardColor: teamTheme?.color ?? null,
    darkMode,
    coreColor: darkMode ? '#FFFFFF' : null,
    outerColor: accentColor,
  });
  const baseShadow = isHovered ? '0 5px 12px rgba(12,15,20,0.09)' : 'none';
  const slotShadow = glowShadow ? `${glowShadow}, ${baseShadow}` : baseShadow;
  const testId = `trade-compare-slot-${slotId}`;
  const slotClassName = [
    'trade-compare__slot-card',
    player ? 'is-filled' : 'is-empty',
    hasTeamGradient ? 'has-team-gradient' : '',
    isKtcLeader ? 'is-value-leader' : '',
  ].filter(Boolean).join(' ');

  if (!player) {
    return (
      <button
        type="button"
        onClick={onPick}
        className={`${slotClassName} flex min-h-[104px] flex-1 flex-col items-center justify-center gap-2 rounded-xl py-5 transition-opacity active:opacity-60`}
        data-testid={testId}
        style={{ background: 'var(--color-fill)', border: '1.5px dashed var(--color-separator)' }}
      >
        <div
          className="trade-compare__slot-add rounded-full flex items-center justify-center"
          style={{
            width: 40,
            height: 40,
            background: 'var(--color-fill-secondary)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ color: 'var(--color-label-tertiary)' }}>
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </div>
        <span
          className="trade-compare__slot-placeholder font-semibold text-center"
          style={{
            color: 'var(--color-label-tertiary)',
            fontSize: '13px',
            lineHeight: 1.15,
          }}
        >
          {label}
        </span>
      </button>
    );
  }

  const showKtcExtension = ktcValue != null || ktcNotFound;
  const teamMeta = player.teamName ?? player.teamId ?? '';
  const cardTitle = [player.displayName, player.position, teamMeta].filter(Boolean).join(' · ');

  return (
    <div
      onClick={onPick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onPick();
        }
      }}
      onMouseMove={glowHandlers.onMouseMove}
      onMouseEnter={(event) => {
        setIsHovered(true);
        glowHandlers.onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        setIsHovered(false);
        glowHandlers.onMouseLeave?.(event);
      }}
      onFocus={(event) => {
        setIsHovered(true);
        glowHandlers.onMouseEnter?.(event);
      }}
      onBlur={(event) => {
        setIsHovered(false);
        glowHandlers.onMouseLeave?.(event);
      }}
      className={`${slotClassName} flex-1 rounded-xl relative overflow-hidden cursor-pointer`}
      data-testid={testId}
      title={cardTitle}
      style={{
        background: isHovered && !hasTeamGradient ? hoverBg : slotBg,
        border: '1px solid var(--color-separator)',
        '--trade-compare-slot-accent': accentColor,
        '--trade-compare-slot-fg': slotForeground,
        '--trade-compare-slot-muted': slotMuted,
        '--trade-compare-slot-subtle': slotSubtle,
        '--trade-compare-slot-value-fg': valueForeground,
        '--trade-compare-slot-value-muted': valueMuted,
        boxShadow: slotShadow,
        transition: 'background 150ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 200ms cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      {borderOverlay}
      {hasTeamGradient && (
        <div
          className="trade-compare__slot-gradient-overlay"
          style={{ background: teamTheme.gradientOverlay }}
          aria-hidden="true"
        />
      )}
      <div className="trade-compare__slot-content relative flex min-h-[112px] items-center gap-3 p-3 sm:min-h-[116px] sm:gap-4 sm:p-4">
        <div className="trade-compare__slot-media relative shrink-0">
          <PlayerThumb id={player.id} name={player.displayName} size={56} className="trade-compare__slot-avatar" />
        </div>

        <div className="trade-compare__slot-body min-w-0 flex-1 pr-7">
          {onViewPlayer ? (
            <button
              type="button"
              className="trade-compare__slot-name block w-full min-w-0 text-left font-semibold"
              style={{
                color: slotForeground,
                textDecoration: isHovered ? 'underline' : 'none',
                textUnderlineOffset: '2px',
              }}
              onClick={(event) => {
                event.stopPropagation();
                onViewPlayer(player);
              }}
            >
              {player.displayName}
            </button>
          ) : (
            <div
              className="trade-compare__slot-name min-w-0 font-semibold"
              style={{ color: slotForeground }}
            >
              {player.displayName}
            </div>
          )}

          <div
            className="trade-compare__slot-meta mt-1 text-xs"
            style={{ color: slotMuted }}
          >
            {positionColor && (
              <span
                className="trade-compare__slot-position shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                style={{
                  background: positionColor,
                  color: positionTextColor,
                  boxShadow: '0 4px 10px rgba(0,0,0,0.16)',
                }}
              >
                {player.position}
              </span>
            )}
            {teamMeta && (
              <span className="trade-compare__slot-team-name min-w-0">
                {teamMeta}
              </span>
            )}
          </div>

          {player.status && player.status !== 'Active' && (
            <span
              className={[
                'trade-compare__slot-status inline-block mt-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase',
                player.status.includes('Reserve') ? 'is-reserve' : '',
                player.status.includes('Physic') ? 'is-physically-unable' : '',
                player.status.includes('Suspend') ? 'is-suspended' : '',
              ].filter(Boolean).join(' ')}
              style={{
                background: slotSubtle,
                color: slotForeground,
                borderColor: slotMuted,
              }}
            >
              {player.status}
            </span>
          )}

          {showKtcExtension && (
            <div className="trade-compare__slot-value mt-2">
              <span
                className="trade-compare__slot-value-label text-[10px] uppercase tracking-widest"
                style={{ color: valueMuted }}
              >
                Trade Value{' '}
              </span>
              <span
                className="trade-compare__slot-value-number text-sm font-bold tabular-nums"
                style={{ color: valueForeground }}
              >
                {ktcValue != null ? ktcValue.toLocaleString() : 'Not in KTC'}
              </span>
            </div>
          )}
        </div>

        {teamLogoUrl && (
          <img
            src={teamLogoUrl}
            aria-hidden="true"
            alt=""
            className="trade-compare__slot-watermark pointer-events-none select-none absolute right-10 top-1/2 h-16 w-16 -translate-y-1/2 object-contain opacity-15"
            loading="lazy"
            decoding="async"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        )}

        <button
          type="button"
          onClick={e => { e.stopPropagation(); onClear(); }}
          className="trade-compare__slot-clear absolute right-2 top-2 shrink-0 rounded-full flex h-6 w-6 items-center justify-center text-xs"
          data-testid={`trade-compare-slot-${slotId}-clear`}
          style={{
            background: slotSubtle,
            color: slotForeground,
          }}
          aria-label="Remove player"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function PlayerThumb({ id, name, size = 36, className = '' }) {
  const [err, setErr] = useState(false);
  const initials = (name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return err ? (
    <div
      className={[
        'rounded-full flex items-center justify-center shrink-0 text-xs font-bold',
        className,
      ].filter(Boolean).join(' ')}
      style={{ background: 'var(--color-fill-secondary)', color: 'var(--color-label-quaternary)', width: size, height: size }}
    >
      {initials}
    </div>
  ) : (
    <img
      src={`https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`}
      alt=""
      className={[
        'rounded-full object-cover shrink-0',
        className,
      ].filter(Boolean).join(' ')}
      style={{ background: 'var(--color-fill-secondary)', width: size, height: size }}
      onError={() => setErr(true)}
    />
  );
}
