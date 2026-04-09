// ── CompareTab ────────────────────────────────────────────────────────────────
// Unified 4th top-level tab: side-by-side ESPN stats + Sleeper fantasy + Trade.
// Player selection uses ESPN rosters (rich smart search).
// Sleeper match is attempted automatically via espn_id / name+pos lookup.

import { useState, useCallback, useEffect } from 'react';
import { fetchPlayerStats, fetchPlayerCareerStats, CURRENT_SEASON } from '../../utils/playerApi';
import { buildStatMap, buildRankMap } from '../../utils/playerMetrics';
import { matchEspnToSleeper } from '../../utils/espnSleeperMatch';
import { useSleeperLeague, useSleeperStats } from '../../context/SleeperContext';
import { useTheme } from '../../context/ThemeContext';
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

// ── CompareTab ────────────────────────────────────────────────────────────────

export default function CompareTab({ teams, initialPlayerA, initialPlayerB, onConsumeInitialPlayerA, onConsumeInitialPlayerB, onBuildTrade, onViewPlayer }) {
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

  // ── Pre-populate player A from Statistics view ──────────────────────────────

  useEffect(() => {
    if (!initialPlayerA) return;
    onConsumeInitialPlayerA?.();
    setPlayerA(initialPlayerA);
    setCacheA({});
    setRankCacheA({});
    setLoadingYearsA(new Set());
    loadYear('A', initialPlayerA, selectedYear);
    setPanel('stats');
    if (hasLeague) {
      (async () => {
        const playersData = sleeperPlayers ?? await loadPlayers();
        const sid = playersData ? matchEspnToSleeper(initialPlayerA, playersData) : null;
        setSleeperIdA(sid);
      })();
    }
  }, [initialPlayerA]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!initialPlayerB) return;
    onConsumeInitialPlayerB?.();
    setPlayerB(initialPlayerB);
    setCacheB({});
    setRankCacheB({});
    setLoadingYearsB(new Set());
    loadYear('B', initialPlayerB, selectedYear);
    setPanel('stats');
    if (hasLeague) {
      (async () => {
        const playersData = sleeperPlayers ?? await loadPlayers();
        const sid = playersData ? matchEspnToSleeper(initialPlayerB, playersData) : null;
        setSleeperIdB(sid);
      })();
    }
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
      setCacheA({});
      setLoadingYearsA(new Set());
      loadYear('A', player, selectedYear);
    } else {
      setPlayerB(player);
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
    if (slot === 'A') { setPlayerA(null); setCacheA({}); setRankCacheA({}); setLoadingYearsA(new Set()); setSleeperIdA(null); }
    else              { setPlayerB(null); setCacheB({}); setRankCacheB({}); setLoadingYearsB(new Set()); setSleeperIdB(null); }
  }

  function handleYearChange(year) {
    setSelectedYear(year);
    if (playerA && cacheA[year] === undefined && !loadingYearsA.has(year)) loadYear('A', playerA, year);
    if (playerB && cacheB[year] === undefined && !loadingYearsB.has(year)) loadYear('B', playerB, year);
  }

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
          onValuesChange={setTradeVals}
          onBuildTrade={(() => {
            if (!onBuildTrade || !hasLeague) return null;
            const rosterPlayers = myRoster()?.players ?? [];
            const aOnRoster = sleeperIdA ? rosterPlayers.includes(sleeperIdA) : false;
            const bOnRoster = sleeperIdB ? rosterPlayers.includes(sleeperIdB) : false;
            // Exactly one player must be on own roster
            if (aOnRoster && !bOnRoster) return () => onBuildTrade(sleeperIdA, sleeperIdB);
            if (bOnRoster && !aOnRoster) return () => onBuildTrade(sleeperIdB, sleeperIdA);
            return null;
          })()}
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

  if (!player) {
    return (
      <button
        onClick={onPick}
        className="flex-1 flex flex-col items-center justify-center gap-1.5 rounded-2xl py-5 transition-opacity active:opacity-60"
        style={{ background: 'var(--color-fill)', border: '1.5px dashed var(--color-separator)' }}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'var(--color-fill-secondary)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ color: 'var(--color-label-tertiary)' }}>
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </div>
        <span className="text-xs font-semibold" style={{ color: 'var(--color-label-tertiary)' }}>
          {label}
        </span>
      </button>
    );
  }

  const teamKey = toTeamKey(player.teamId);
  const palette = TEAM_COLORS[teamKey] ?? null;
  const teamColor = palette ? (darkMode ? palette.darkPrimary : palette.primary) : null;
  const isLight = teamColor ? hexLuminance(teamColor) > 0.35 : false;
  const tintBg = teamColor ? `${teamColor}${isLight ? '18' : '22'}` : 'var(--color-fill)';
  // Darken light-colored borders in light mode so they're visible on the cream background
  const borderColor = teamColor
    ? (!darkMode && isLight ? darkenHex(teamColor, 0.55) : teamColor)
    : null;

  const showKtcExtension = ktcValue != null || ktcNotFound;

  return (
    <div
      onClick={onPick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onPick()}
      className="flex-1 rounded-xl px-3 py-2.5 flex items-center gap-2.5 relative overflow-hidden cursor-pointer"
      style={{
        background: tintBg,
        borderLeft: borderColor ? `3px solid ${borderColor}` : '3px solid transparent',
      }}
    >
      <PlayerThumb id={player.id} name={player.displayName} />

      <div className="flex-1 min-w-0 relative">
        {teamKey && (
          <img
            src={`https://a.espncdn.com/i/teamlogos/nfl/500/${teamKey}.png`}
            aria-hidden="true"
            className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none select-none"
            style={{ width: 40, height: 40, objectFit: 'contain', opacity: 0.10 }}
            onError={e => { e.target.style.display = 'none'; }}
          />
        )}
        <div
          className="text-sm font-semibold truncate"
          style={{ color: onViewPlayer ? 'var(--color-accent)' : 'var(--color-label)', cursor: onViewPlayer ? 'pointer' : 'default', textDecoration: onViewPlayer ? 'underline' : 'none', textUnderlineOffset: '2px' }}
          onClick={onViewPlayer ? e => { e.stopPropagation(); onViewPlayer(player); } : undefined}
        >
          {player.displayName}
        </div>
        <div className="text-xs truncate" style={{ color: 'var(--color-label-secondary)' }}>
          {player.position}{player.teamName ? ` · ${player.teamName}` : ''}
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

        {/* KTC value extension — only shown in Trade tab */}
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
        className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
        style={{ background: 'var(--color-fill-secondary)', color: 'var(--color-label-tertiary)', fontSize: '11px' }}
        aria-label="Remove player"
      >
        ×
      </button>
    </div>
  );
}

function PlayerThumb({ id, name }) {
  const [err, setErr] = useState(false);
  const initials = (name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return err ? (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
      style={{ background: 'var(--color-fill-secondary)', color: 'var(--color-label-quaternary)' }}
    >
      {initials}
    </div>
  ) : (
    <img
      src={`https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`}
      alt=""
      className="w-9 h-9 rounded-full object-cover shrink-0"
      style={{ background: 'var(--color-fill-secondary)' }}
      onError={() => setErr(true)}
    />
  );
}

