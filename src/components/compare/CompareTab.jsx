// ── CompareTab ────────────────────────────────────────────────────────────────
// Unified 4th top-level tab: side-by-side ESPN stats + Sleeper fantasy + Trade.
// Player selection uses ESPN rosters (rich smart search).
// Sleeper match is attempted automatically via espn_id / name+pos lookup.

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPlayerStats, fetchPlayerCareerStats, CURRENT_SEASON } from '../../utils/playerApi';
import { buildStatMap, buildRankMap } from '../../utils/playerMetrics';
import { matchEspnToSleeper } from '../../utils/espnSleeperMatch';
import { useSleeperLeague, useSleeperStats } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
import useMediaQuery from '../../hooks/useMediaQuery';
import useCardGlow from '../../hooks/useCardGlow.jsx';
import { TEAM_COLORS } from '../../data/teamColors';
import ComparePickerSheet from './ComparePickerSheet';
import CompareStatsPanel from './CompareStatsPanel';
import CompareFantasyPanel from './CompareFantasyPanel';
import CompareTradePanel from './CompareTradePanel';

function hexLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// Darken a hex color by multiplying each channel by `factor` (0–1)
function darkenHex(hex, factor) {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ESPN teamId → TEAM_COLORS key (same mismatches as Sleeper)
const ESPN_TEAM_MAP = { lar: 'la', was: 'wsh' };
function toTeamKey(espnTeamId) {
  if (!espnTeamId) return '';
  const lower = espnTeamId.toLowerCase();
  return ESPN_TEAM_MAP[lower] ?? lower;
}

const PANELS = [
  { id: 'stats',   label: 'Stats' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'trade',   label: 'Trade' },
];

function scheduleDeferredCompareTask(callback, timeout = 220) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const idleId = window.requestIdleCallback(() => callback(), { timeout });
    return () => window.cancelIdleCallback(idleId);
  }
  const timerId = window.setTimeout(callback, 0);
  return () => window.clearTimeout(timerId);
}

// ── CompareTab ────────────────────────────────────────────────────────────────

export default function CompareTab({ teams, initialPlayerA, initialPlayerB, onPlayerAChange, onPlayerBChange, onBuildTrade, onViewPlayer }) {
  const { hasLeague, myRoster } = useSleeperLeague();
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
  const [tradeVals, setTradeVals] = useState({ valA: null, valB: null, leader: null, maxVal: null, notFoundA: false, notFoundB: false });

  const handleTradeValuesChange = useCallback((next) => {
    setTradeVals((prev) => {
      if (
        prev.valA === next.valA &&
        prev.valB === next.valB &&
        prev.leader === next.leader &&
        prev.maxVal === next.maxVal &&
        prev.notFoundA === next.notFoundA &&
        prev.notFoundB === next.notFoundB
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  // ── Pre-populate player A from Statistics view ──────────────────────────────

  useEffect(() => {
    if (!initialPlayerA) return;
    setPlayerA(initialPlayerA);
    setCacheA({});
    setRankCacheA({});
    setLoadingYearsA(new Set());
    setPanel('stats');
    const cancelTask = scheduleDeferredCompareTask(() => {
      loadYear('A', initialPlayerA, selectedYear);
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
      loadYear('B', initialPlayerB, selectedYear);
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
      loadYear('A', player, selectedYear);
    } else {
      setPlayerB(player);
      onPlayerBChange?.(player);
      setCacheB({});
      setLoadingYearsB(new Set());
      loadYear('B', player, selectedYear);
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
    if (playerA && cacheA[year] === undefined && !loadingYearsA.has(year)) loadYear('A', playerA, year);
    if (playerB && cacheB[year] === undefined && !loadingYearsB.has(year)) loadYear('B', playerB, year);
  }

  const buildTradeHandler = useMemo(() => {
    if (!onBuildTrade || !hasLeague) return null;
    const rosterPlayers = myRoster()?.players ?? [];
    const aOnRoster = sleeperIdA ? rosterPlayers.includes(sleeperIdA) : false;
    const bOnRoster = sleeperIdB ? rosterPlayers.includes(sleeperIdB) : false;
    if (aOnRoster && !bOnRoster) return () => onBuildTrade(sleeperIdA, sleeperIdB);
    if (bOnRoster && !aOnRoster) return () => onBuildTrade(sleeperIdB, sleeperIdA);
    return null;
  }, [hasLeague, myRoster, onBuildTrade, sleeperIdA, sleeperIdB]);

  const mapA = cacheA[selectedYear] ?? null;
  const mapB = cacheB[selectedYear] ?? null;
  const rankMapA = rankCacheA[selectedYear] ?? {};
  const rankMapB = rankCacheB[selectedYear] ?? {};
  const isLoadingA = loadingYearsA.has(selectedYear);
  const isLoadingB = loadingYearsB.has(selectedYear);

  // Compute which years to show: only years from each player's rookie season onwards.
  // experience.years = seasons completed before this season (0 = rookie this year).
  const firstYearA = playerA ? Math.max(2018, CURRENT_SEASON - (playerA.experience ?? 0)) : null;
  const firstYearB = playerB ? Math.max(2018, CURRENT_SEASON - (playerB.experience ?? 0)) : null;
  const minYear = firstYearA !== null && firstYearB !== null
    ? Math.min(firstYearA, firstYearB)
    : (firstYearA ?? firstYearB ?? 2018);
  const visibleYears = (playerA || playerB)
    ? Array.from({ length: CURRENT_SEASON - minYear + 1 }, (_, i) => CURRENT_SEASON - i)
    : [];

  return (
    <div className="pb-8">
      {/* ── Panel tab selector — always at top ───────────────────────────── */}
      <div className="px-4">
      <div className="season-tabs" role="tablist">
        {PANELS.map(({ id, label }) => {
          if (id === 'fantasy' && !hasLeague) return null;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={panel === id}
              onClick={() => setPanel(id)}
              className={`season-tab${panel === id ? ' active' : ''}`}
            >
              {label}
            </button>
          );
        })}
      </div>
      </div>

      {/* ── Player slot row — always visible below tabs ──────────────────── */}
      <div
        className="flex gap-3 px-4 py-4"
        style={{ borderBottom: '1px solid var(--color-separator)' }}
      >
        <PlayerSlot
          label="Player 1"
          player={playerA}
          onPick={() => setPickingSlot('A')}
          onClear={() => handleClear('A')}
          onViewPlayer={onViewPlayer}
          ktcValue={panel === 'trade' ? tradeVals.valA : null}
          isKtcLeader={panel === 'trade' && tradeVals.leader === 'A'}
          ktcNotFound={panel === 'trade' && tradeVals.notFoundA}
        />
        <div
          className="flex items-center justify-center shrink-0 text-xs font-bold"
          style={{ color: 'var(--color-label-quaternary)', width: 24 }}
        >
          vs
        </div>
        <PlayerSlot
          label="Player 2"
          player={playerB}
          onPick={() => setPickingSlot('B')}
          onClear={() => handleClear('B')}
          onViewPlayer={onViewPlayer}
          ktcValue={panel === 'trade' ? tradeVals.valB : null}
          isKtcLeader={panel === 'trade' && tradeVals.leader === 'B'}
          ktcNotFound={panel === 'trade' && tradeVals.notFoundB}
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
          loadingYearsA={loadingYearsA}
          loadingYearsB={loadingYearsB}
          selectedYear={selectedYear}
          onYearChange={handleYearChange}
          visibleYears={visibleYears}
        />
      )}

      {panel === 'fantasy' && hasLeague && (
        <CompareFantasyPanel
          sleeperIdA={sleeperIdA}
          sleeperIdB={sleeperIdB}
        />
      )}

      {panel === 'trade' && (
        <CompareTradePanel
          playerA={playerA}
          playerB={playerB}
          sleeperPlayerA={sleeperIdA && sleeperPlayers ? sleeperPlayers[sleeperIdA] : null}
          sleeperPlayerB={sleeperIdB && sleeperPlayers ? sleeperPlayers[sleeperIdB] : null}
          onValuesChange={handleTradeValuesChange}
          onBuildTrade={buildTradeHandler}
        />
      )}

      {/* Empty state — no players selected */}
      {!playerA && !playerB && (
        <div className="flex flex-col items-center justify-center py-20 px-6 gap-2">
          <span className="text-sm text-center" style={{ color: 'var(--color-label-secondary)' }}>
            Select two players to compare side-by-side.
          </span>
          <span className="text-xs text-center" style={{ color: 'var(--color-label-quaternary)' }}>
            Searches all 32 NFL rosters — stats, fantasy, and trade value.
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

// ── PlayerSlot ────────────────────────────────────────────────────────────────

function PlayerSlot({ label, player, onPick, onClear, onViewPlayer, ktcValue, isKtcLeader, ktcNotFound }) {
  const { darkMode } = useTheme();
  const isCompact = useMediaQuery('(max-width: 640px)');
  const [isHovered, setIsHovered] = useState(false);
  const teamKey = toTeamKey(player?.teamId);
  const palette = player ? (TEAM_COLORS[teamKey] ?? null) : null;
  const teamColor = palette ? (darkMode ? palette.darkPrimary : palette.primary) : null;
  const isLight = teamColor ? hexLuminance(teamColor) > 0.35 : false;
  const tintBg = teamColor ? `${teamColor}${isLight ? '18' : '22'}` : 'var(--color-fill)';
  const borderColor = teamColor
    ? (!darkMode && isLight ? darkenHex(teamColor, 0.55) : teamColor)
    : null;
  const glowColor = borderColor ?? (darkMode ? '#5AADFF' : '#1A6EFF');
  const hoverBg = teamColor ? `${teamColor}${isLight ? '2e' : '30'}` : 'var(--color-fill-secondary)';
  const { glowHandlers, borderOverlay, glowShadow } = useCardGlow({
    enabled: Boolean(player && isHovered),
    color: glowColor,
    cardColor: borderColor ?? null,
    darkMode,
    coreColor: darkMode ? '#FFFFFF' : null,
    outerColor: glowColor,
  });
  const baseShadow = isHovered
    ? '0 8px 18px rgba(12,15,20,0.10), 0 2px 6px rgba(12,15,20,0.08)'
    : '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)';
  const slotShadow = glowShadow ? `${glowShadow}, ${baseShadow}` : baseShadow;

  if (!player) {
    return (
      <button
        onClick={onPick}
        className="flex-1 flex flex-col items-center justify-center gap-2 rounded-2xl py-5 transition-opacity active:opacity-60"
        style={{ background: 'var(--color-fill)', border: '1.5px dashed var(--color-separator)' }}
      >
        <div
          className="rounded-full flex items-center justify-center"
          style={{
            width: isCompact ? 44 : 36,
            height: isCompact ? 44 : 36,
            background: 'var(--color-fill-secondary)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ color: 'var(--color-label-tertiary)' }}>
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </div>
        <span
          className="font-semibold text-center"
          style={{
            color: 'var(--color-label-tertiary)',
            fontSize: isCompact ? '13px' : undefined,
            lineHeight: isCompact ? 1.15 : undefined,
          }}
        >
          {label}
        </span>
      </button>
    );
  }

  const showKtcExtension = ktcValue != null || ktcNotFound;
  const teamMeta = player.teamName ?? player.teamId ?? '';

  return (
    <div
      onClick={onPick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onPick()}
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
      className="flex-1 rounded-xl relative overflow-hidden cursor-pointer"
      style={{
        background: isHovered ? hoverBg : tintBg,
        border: '1px solid var(--color-separator)',
        borderLeft: borderColor ? `4px solid ${borderColor}` : '4px solid var(--color-separator)',
        boxShadow: slotShadow,
        transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'background 150ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 200ms cubic-bezier(0.32, 0.72, 0, 1), transform 200ms cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      {borderOverlay}
      {isCompact ? (
        <div
          className="relative flex"
          style={{
            alignItems: 'center',
            gap: '12px',
            padding: '12px 12px 12px 10px',
            minHeight: 112,
          }}
        >
          <div className="relative shrink-0">
            <PlayerThumb id={player.id} name={player.displayName} size={52} />
            {teamKey && (
              <div
                className="absolute -right-1 -bottom-1 rounded-full p-1"
                style={{
                  background: darkMode ? 'rgba(12,15,20,0.82)' : 'rgba(255,255,255,0.92)',
                  border: `1px solid ${borderColor ?? 'var(--color-separator)'}`,
                }}
              >
                <img
                  src={`https://a.espncdn.com/i/teamlogos/nfl/500/${teamKey}.png`}
                  alt=""
                  className="block"
                  style={{ width: 14, height: 14, objectFit: 'contain' }}
                  loading="lazy"
                  decoding="async"
                  onError={e => { e.target.style.display = 'none'; }}
                />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 pr-6" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div
              className="font-semibold"
              style={{
                color: onViewPlayer ? (borderColor ?? 'var(--color-accent)') : 'var(--color-label)',
                cursor: onViewPlayer ? 'pointer' : 'default',
                textDecoration: onViewPlayer && isHovered ? 'underline' : 'none',
                textUnderlineOffset: '2px',
                fontSize: '14px',
                lineHeight: 1.15,
                whiteSpace: 'normal',
                wordBreak: 'break-word',
              }}
              onClick={onViewPlayer ? e => { e.stopPropagation(); onViewPlayer(player); } : undefined}
            >
              {player.displayName}
            </div>
            <div
              style={{
                color: 'var(--color-label-secondary)',
                fontSize: '11px',
                lineHeight: 1.2,
                marginTop: '3px',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
              }}
            >
              {player.position}{teamMeta ? ` · ${teamMeta}` : ''}
            </div>
            {player.status && player.status !== 'Active' && (
              <span
                className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                style={{
                  background: player.status.includes('Reserve') ? '#ef4444'
                    : player.status.includes('Physic') ? '#8b5cf6'
                    : player.status.includes('Suspend') ? '#6b7280'
                    : '#f59e0b',
                  color: '#fff',
                }}
              >
                {player.status}
              </span>
            )}
            {showKtcExtension && (
              <div className="mt-1.5">
                <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-label-quaternary)' }}>
                  Trade Value{' '}
                </span>
                <span
                  className="text-xs font-bold tabular-nums"
                  style={{ color: isKtcLeader ? 'var(--color-signature)' : 'var(--color-label)' }}
                >
                  {ktcValue != null ? ktcValue.toLocaleString() : 'Not in KTC'}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={e => { e.stopPropagation(); onClear(); }}
            className="shrink-0 rounded-full flex items-center justify-center"
            style={{
              background: 'var(--color-fill-secondary)',
              color: 'var(--color-label-tertiary)',
              fontSize: '11px',
              width: 22,
              height: 22,
              position: 'absolute',
              top: 8,
              right: 8,
            }}
            aria-label="Remove player"
          >
            ×
          </button>
        </div>
      ) : (
        <div
          className="relative flex items-center"
          style={{
            gap: '16px',
            padding: '14px 16px 14px 14px',
            minHeight: 106,
          }}
        >
          {teamKey && (
            <img
              src={`https://a.espncdn.com/i/teamlogos/nfl/500/${teamKey}.png`}
              aria-hidden="true"
              className="pointer-events-none select-none absolute right-12 top-1/2 -translate-y-1/2"
              style={{ width: 58, height: 58, objectFit: 'contain', opacity: 0.12 }}
              loading="lazy"
              decoding="async"
              onError={e => { e.target.style.display = 'none'; }}
            />
          )}

          <PlayerThumb id={player.id} name={player.displayName} size={74} />

          <div className="flex-1 min-w-0 pr-8" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '4px' }}>
            <div
              className="font-semibold"
              style={{
                color: onViewPlayer ? (borderColor ?? 'var(--color-accent)') : 'var(--color-label)',
                cursor: onViewPlayer ? 'pointer' : 'default',
                textDecoration: onViewPlayer && isHovered ? 'underline' : 'none',
                textUnderlineOffset: '2px',
                fontSize: '28px',
                lineHeight: 0.95,
                fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif",
                letterSpacing: '0.01em',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
              }}
              onClick={onViewPlayer ? e => { e.stopPropagation(); onViewPlayer(player); } : undefined}
            >
              {player.displayName}
            </div>
            <div
              style={{
                color: 'var(--color-label-secondary)',
                fontSize: '13px',
                lineHeight: 1.2,
                whiteSpace: 'normal',
              }}
            >
              {player.position}{teamMeta ? ` · ${teamMeta}` : ''}
            </div>
            {showKtcExtension && (
              <div className="mt-1">
                <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-label-quaternary)' }}>
                  Trade Value{' '}
                </span>
                <span
                  className="text-sm font-bold tabular-nums"
                  style={{ color: isKtcLeader ? 'var(--color-signature)' : 'var(--color-label)' }}
                >
                  {ktcValue != null ? ktcValue.toLocaleString() : 'Not in KTC'}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={e => { e.stopPropagation(); onClear(); }}
            className="shrink-0 rounded-full flex items-center justify-center"
            style={{
              background: 'var(--color-fill-secondary)',
              color: 'var(--color-label-tertiary)',
              fontSize: '11px',
              width: 20,
              height: 20,
              position: 'absolute',
              top: 8,
              right: 8,
            }}
            aria-label="Remove player"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

function PlayerThumb({ id, name, size = 36 }) {
  const [err, setErr] = useState(false);
  const initials = (name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return err ? (
    <div
      className="rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
      style={{ background: 'var(--color-fill-secondary)', color: 'var(--color-label-quaternary)', width: size, height: size }}
    >
      {initials}
    </div>
  ) : (
    <img
      src={`https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`}
      alt=""
      className="rounded-full object-cover shrink-0"
      style={{ background: 'var(--color-fill-secondary)', width: size, height: size }}
      onError={() => setErr(true)}
    />
  );
}

