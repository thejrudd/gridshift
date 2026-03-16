import { useEffect, useMemo, useState } from 'react';
import { useSleeper } from '../../context/SleeperContext';
import { calcPointsFromTotals } from '../../utils/scoringEngine';
import PlayerWeeklySheet from './PlayerWeeklySheet';

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB'];

// Map filter chip → set of actual Sleeper position values
const POSITION_FILTER_MAP = {
  DL: new Set(['DL', 'DE', 'DT']),
  LB: new Set(['LB', 'ILB', 'OLB']),
  DB: new Set(['DB', 'CB', 'S', 'SS', 'FS']),
};
const POSITION_COLORS = {
  QB: '#ef4444',
  RB: '#22c55e',
  WR: '#3b82f6',
  TE: '#f59e0b',
  K:  '#8b5cf6',
};

export default function CompanionRankings() {
  const {
    players, loadPlayers,
    seasonStats, loadSeasonStats,
    statsLoading, statsProgress,
    scoringSettings,
    rosters,
  } = useSleeper();

  const [posFilter, setPosFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);
  useEffect(() => {
    if (!seasonStats && !statsLoading) loadSeasonStats();
  }, [seasonStats, statsLoading, loadSeasonStats]);

  // Build set of all rostered player IDs for highlighting
  const rosteredIds = useMemo(() => {
    const ids = new Set();
    for (const r of rosters) {
      for (const id of (r.players || [])) ids.add(id);
      for (const id of (r.reserve || [])) ids.add(id);
    }
    return ids;
  }, [rosters]);

  const ranked = useMemo(() => {
    if (!players || !seasonStats) return [];

    return Object.entries(seasonStats)
      .map(([id, stats]) => {
        const p = players[id];
        if (!p) return null;
        const pos = p.position;
        if (!['QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB', 'DE', 'DT', 'CB', 'S', 'ILB', 'OLB', 'SS', 'FS'].includes(pos)) return null;
        if (posFilter !== 'ALL') {
          const group = POSITION_FILTER_MAP[posFilter];
          if (group ? !group.has(pos) : pos !== posFilter) return null;
        }
        const q = search.trim().toLowerCase();
        if (q && !p.full_name?.toLowerCase().includes(q) && !p.team?.toLowerCase().includes(q)) return null;

        const pts = calcPointsFromTotals(stats, scoringSettings);
        if (pts <= 0) return null;

        return {
          id,
          name: p.full_name || `${p.first_name} ${p.last_name}`,
          position: pos,
          team: p.team || 'FA',
          pts,
          isRostered: rosteredIds.has(id),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 100);
  }, [players, seasonStats, scoringSettings, posFilter, search, rosteredIds]);

  return (
    <div className="pb-6">
      {/* Filters */}
      <div className="px-4 pb-3 flex flex-col gap-2">
        {/* Position chips */}
        <div className="flex gap-1.5 flex-wrap">
          {POSITIONS.map(pos => (
            <button
              key={pos}
              onClick={() => setPosFilter(pos)}
              className="px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
              style={{
                background: posFilter === pos ? 'var(--color-signature)' : 'var(--color-fill)',
                color: posFilter === pos ? '#0C0F14' : 'var(--color-label-secondary)',
              }}
            >
              {pos}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: 'var(--color-label-tertiary)' }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search players…"
            className="w-full pl-9 pr-3 py-2 rounded-xl font-medium focus:outline-none"
            style={{
              fontSize: '16px',
              background: 'var(--color-fill-secondary)',
              color: 'var(--color-label)',
            }}
          />
        </div>
      </div>

      {/* Stats loading */}
      {statsLoading && (
        <div className="mx-4 mb-3 px-4 py-2.5 rounded-xl flex items-center gap-3" style={{ background: 'var(--color-fill)' }}>
          <div className="h-1 flex-1 rounded-full overflow-hidden" style={{ background: 'var(--color-fill-secondary)' }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${statsProgress}%`, background: 'var(--color-signature)' }} />
          </div>
          <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--color-label-tertiary)' }}>
            {statsProgress}%
          </span>
        </div>
      )}

      {/* Column headers — match: rank(w-8) + gap(2) + avatar(w-8) + gap(2) + name(flex-1) + pts(w-20) + chevron(w-3) */}
      <div className="flex items-center gap-2 px-4 pb-2 mb-1" style={{ borderBottom: '1px solid var(--color-separator)' }}>
        <span className="w-8 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>#</span>
        <div className="w-8 shrink-0" />
        <span className="flex-1 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Player</span>
        <span className="w-20 text-right text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>Pts</span>
        <div className="w-3 shrink-0" />
      </div>

      {!seasonStats && !statsLoading && (
        <div className="flex items-center justify-center py-16">
          <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>Loading stats…</span>
        </div>
      )}

      {ranked.map((player, i) => (
        <RankRow key={player.id} rank={i + 1} player={player} onSelect={() => setSelectedPlayerId(player.id)} />
      ))}

      {ranked.length === 0 && seasonStats && (
        <div className="flex items-center justify-center py-16">
          <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>No players found.</span>
        </div>
      )}

      {selectedPlayerId && (
        <PlayerWeeklySheet playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
      )}
    </div>
  );
}

function RankRow({ rank, player, onSelect }) {
  const posColor = POSITION_COLORS[player.position] ?? 'var(--color-label-tertiary)';

  return (
    <button
      onClick={onSelect}
      className="flex items-center w-full px-4 py-2.5 gap-2 text-left active:opacity-60 transition-opacity"
      style={{
        borderBottom: '1px solid var(--color-separator)',
        background: player.isRostered ? 'rgba(245,183,0,0.04)' : 'transparent',
      }}
    >
      <span className="w-8 text-xs tabular-nums" style={{ color: 'var(--color-label-quaternary)' }}>
        {rank}
      </span>

      <img
        src={`https://sleepercdn.com/content/nfl/players/thumb/${player.id}.jpg`}
        alt={player.name}
        className="w-8 h-8 rounded-full shrink-0 object-cover"
        style={{ background: 'var(--color-fill)' }}
        onError={e => { e.target.src = 'https://sleepercdn.com/images/v2/icons/player_default.webp'; }}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-sm truncate" style={{ color: 'var(--color-label)' }}>
            {player.name}
          </span>
          {player.isRostered && (
            <span
              className="text-xs font-bold px-1 rounded shrink-0"
              style={{ background: 'rgba(245,183,0,0.15)', color: 'var(--color-signature)', fontSize: '10px' }}
            >
              ROSTERED
            </span>
          )}
        </div>
        <div className="text-xs mt-0.5 flex items-center gap-1.5">
          <span style={{ color: posColor, fontWeight: 600 }}>{player.position}</span>
          <span style={{ color: 'var(--color-label-tertiary)' }}>{player.team}</span>
        </div>
      </div>

      <span className="w-20 text-right font-bold tabular-nums text-sm" style={{ color: 'var(--color-label)' }}>
        {player.pts.toFixed(1)}
      </span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-label-quaternary)', flexShrink: 0 }}>
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </button>
  );
}
