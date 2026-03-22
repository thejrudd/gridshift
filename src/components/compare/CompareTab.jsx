// ── CompareTab ────────────────────────────────────────────────────────────────
// Unified 4th top-level tab: side-by-side ESPN stats + Sleeper fantasy + Trade.
// Player selection uses ESPN rosters (rich smart search).
// Sleeper match is attempted automatically via espn_id / name+pos lookup.

import { useState, useCallback } from 'react';
import { fetchPlayerStats, fetchPlayerCareerStats, CURRENT_SEASON } from '../../utils/playerApi';
import { buildStatMap, buildRankMap } from '../../utils/playerMetrics';
import { matchEspnToSleeper } from '../../utils/espnSleeperMatch';
import { useSleeper } from '../../context/SleeperContext';
import ComparePickerSheet from './ComparePickerSheet';
import CompareStatsPanel from './CompareStatsPanel';
import CompareFantasyPanel from './CompareFantasyPanel';
import CompareTradePanel from './CompareTradePanel';

const POSITION_COLORS = {
  QB: '#ef4444', RB: '#22c55e', WR: '#3b82f6', TE: '#f59e0b', K: '#8b5cf6',
};

const PANELS = [
  { id: 'stats',   label: 'Stats' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'trade',   label: 'Trade' },
];

// ── CompareTab ────────────────────────────────────────────────────────────────

export default function CompareTab({ teams }) {
  const { players: sleeperPlayers, hasLeague, loadPlayers } = useSleeper();

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

  return (
    <div className="pb-8">
      {/* ── Player slot row ──────────────────────────────────────────────── */}
      <div
        className="flex gap-3 px-4 py-4"
        style={{ borderBottom: '1px solid var(--color-separator)' }}
      >
        <PlayerSlot
          label="Player 1"
          player={playerA}
          onPick={() => setPickingSlot('A')}
          onClear={() => handleClear('A')}
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
        />
      </div>

      {/* ── Panel tab selector ───────────────────────────────────────────── */}
      {(playerA || playerB) && (
        <div
          className="flex gap-1 px-4 py-3 overflow-x-auto"
          style={{ borderBottom: '1px solid var(--color-separator)', scrollbarWidth: 'none' }}
        >
          {PANELS.map(({ id, label }) => {
            // Only show Fantasy tab if connected
            if (id === 'fantasy' && !hasLeague) return null;
            const active = panel === id;
            return (
              <button
                key={id}
                onClick={() => setPanel(id)}
                className="shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors"
                style={{
                  background: active ? 'var(--color-accent)' : 'var(--color-fill)',
                  color: active ? '#fff' : 'var(--color-label-secondary)',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

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
        />
      )}

      {panel === 'fantasy' && hasLeague && (
        <CompareFantasyPanel
          sleeperIdA={sleeperIdA}
          sleeperIdB={sleeperIdB}
        />
      )}

      {panel === 'trade' && (
        <CompareTradePanel />
      )}

      {/* Empty state — no players selected, no panel tabs yet */}
      {!playerA && !playerB && panel === 'stats' && (
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

function PlayerSlot({ label, player, onPick, onClear }) {
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

  const posColor = POSITION_COLORS[player.position] ?? 'var(--color-label-tertiary)';

  return (
    <div
      className="flex-1 flex flex-col items-center gap-2 rounded-2xl py-4 px-3 relative"
      style={{ background: 'var(--color-fill)' }}
    >
      {/* Clear */}
      <button
        onClick={onClear}
        className="absolute top-2 right-2 p-1"
        style={{ color: 'var(--color-label-quaternary)' }}
        aria-label="Remove player"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      <PlayerThumb id={player.id} name={player.displayName} />

      <div className="text-center min-w-0 w-full">
        <div
          className="font-semibold text-sm truncate"
          style={{ color: 'var(--color-label)' }}
          title={player.displayName}
        >
          {player.displayName}
        </div>
        <div className="flex items-center justify-center gap-1 mt-0.5 flex-wrap">
          <span className="text-xs font-bold" style={{ color: posColor }}>
            {player.position}
          </span>
          {player.teamName && (
            <>
              <span className="text-xs" style={{ color: 'var(--color-label-quaternary)' }}>·</span>
              <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
                {player.teamName}
              </span>
            </>
          )}
        </div>
      </div>

      <button
        onClick={onPick}
        className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-opacity active:opacity-60"
        style={{ background: 'var(--color-fill-secondary)', color: 'var(--color-label-tertiary)' }}
      >
        Change
      </button>
    </div>
  );
}

function PlayerThumb({ id, name }) {
  const [err, setErr] = useState(false);
  const initials = (name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const src = `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`;

  return err ? (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
      style={{ background: 'var(--color-fill-secondary)', color: 'var(--color-label-quaternary)' }}
    >
      {initials}
    </div>
  ) : (
    <img
      src={src}
      alt=""
      className="w-12 h-12 rounded-full object-cover shrink-0"
      style={{ background: 'var(--color-fill-secondary)' }}
      onError={() => setErr(true)}
    />
  );
}

