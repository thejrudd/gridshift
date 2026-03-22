// ── CompareTab ────────────────────────────────────────────────────────────────
// Unified 4th top-level tab: side-by-side ESPN stats + Sleeper fantasy + Trade.
// Player selection uses ESPN rosters (rich smart search).
// Sleeper match is attempted automatically via espn_id / name+pos lookup.

import { useState, useCallback, useEffect } from 'react';
import { fetchPlayerStats, fetchPlayerCareerStats, CURRENT_SEASON } from '../../utils/playerApi';
import { buildStatMap, buildRankMap } from '../../utils/playerMetrics';
import { matchEspnToSleeper } from '../../utils/espnSleeperMatch';
import { useSleeper } from '../../context/SleeperContext';
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

function darkenHex(hex, amount = 0.28) {
  const r = Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

const POSITION_COLORS = {
  QB: '#ef4444', RB: '#22c55e', WR: '#3b82f6', TE: '#f59e0b', K: '#8b5cf6',
};

const PANELS = [
  { id: 'stats',   label: 'Stats' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'trade',   label: 'Trade' },
];

// ── CompareTab ────────────────────────────────────────────────────────────────

export default function CompareTab({ teams, initialPlayerA, onConsumeInitialPlayerA }) {
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

  const palette  = TEAM_COLORS[player.teamId?.toLowerCase()];
  const heroBg   = palette ? (darkMode ? palette.darkPrimary : palette.primary) : null;
  const onBg     = heroBg ? (hexLuminance(heroBg) > 0.3 ? '#0C0F14' : '#FFFFFF') : null;
  const onBgMuted = onBg === '#FFFFFF' ? 'rgba(255,255,255,0.65)' : 'rgba(12,15,20,0.55)';
  const overlayBg = onBg === '#FFFFFF' ? 'rgba(255,255,255,0.15)' : 'rgba(12,15,20,0.12)';

  const cardBg = heroBg
    ? `linear-gradient(150deg, ${heroBg} 0%, ${darkenHex(heroBg, 0.3)} 100%)`
    : 'var(--color-fill)';

  return (
    <div
      className="flex-1 flex flex-col items-center gap-2 rounded-2xl py-4 px-3 relative overflow-hidden"
      style={{ background: cardBg }}
    >
      {/* City map background */}
      {heroBg && player.teamId && (
        <img
          src={`/maps/${player.teamId.toLowerCase()}.png`}
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ opacity: 0.12, mixBlendMode: 'luminosity' }}
          onError={e => { e.target.style.display = 'none'; }}
        />
      )}

      {/* Team logo watermark — vertically centered, right-aligned */}
      {heroBg && player.teamId && (
        <div
          className="absolute inset-y-0 right-0 flex items-center pointer-events-none"
          aria-hidden="true"
          style={{ paddingRight: '8px' }}
        >
          <img
            src={`https://a.espncdn.com/i/teamlogos/nfl/500/${player.teamId.toLowerCase()}.png`}
            alt=""
            style={{ width: '108px', height: '108px', objectFit: 'contain', opacity: 0.13 }}
            onError={e => { e.target.style.display = 'none'; }}
          />
        </div>
      )}

      {/* Clear */}
      <button
        onClick={onClear}
        className="absolute top-2 right-2 p-1"
        style={{ color: heroBg ? onBgMuted : 'var(--color-label-quaternary)' }}
        aria-label="Remove player"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      <PlayerThumb id={player.id} name={player.displayName} heroBg={heroBg} onBgMuted={onBgMuted} />

      <div className="text-center min-w-0 w-full relative">
        <div
          className="font-semibold text-sm truncate"
          style={{ color: heroBg ? onBg : 'var(--color-label)' }}
          title={player.displayName}
        >
          {player.displayName}
        </div>
        <div className="flex items-center justify-center gap-1 mt-0.5 flex-wrap">
          <span className="text-xs font-bold" style={{ color: heroBg ? onBg : (POSITION_COLORS[player.position] ?? 'var(--color-label-tertiary)') }}>
            {player.position}
          </span>
          {player.teamName && (
            <>
              <span className="text-xs" style={{ color: heroBg ? onBgMuted : 'var(--color-label-quaternary)' }}>·</span>
              <span className="text-xs" style={{ color: heroBg ? onBgMuted : 'var(--color-label-tertiary)' }}>
                {player.teamName}
              </span>
            </>
          )}
        </div>
        {player.status && player.status !== 'Active' && (
          <div className="flex justify-center mt-1">
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
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
          </div>
        )}
      </div>

      <button
        onClick={onPick}
        className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-opacity active:opacity-60 relative"
        style={{ background: heroBg ? overlayBg : 'var(--color-fill-secondary)', color: heroBg ? onBg : 'var(--color-label-tertiary)' }}
      >
        Change
      </button>
    </div>
  );
}

function PlayerThumb({ id, name, heroBg, onBgMuted }) {
  const [err, setErr] = useState(false);
  const initials = (name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const src = `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`;

  return err ? (
    <div
      className="w-20 h-20 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
      style={{
        background: heroBg ? 'rgba(0,0,0,0.2)' : 'var(--color-fill-secondary)',
        color: heroBg ? onBgMuted : 'var(--color-label-quaternary)',
      }}
    >
      {initials}
    </div>
  ) : (
    <img
      src={src}
      alt=""
      className="w-20 h-20 rounded-full object-cover shrink-0"
      style={{ background: 'var(--color-fill-secondary)' }}
      onError={() => setErr(true)}
    />
  );
}

