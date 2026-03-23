import { useEffect, useMemo, useState } from 'react';
import { useSleeper } from '../../context/SleeperContext';
import { calcPointsFromTotals } from '../../utils/scoringEngine';
import { computePositionalRanks, getAvgPPG } from '../../utils/projectionEngine';
import PlayerWeeklySheet from './PlayerWeeklySheet';

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB', 'DE', 'DT', 'CB', 'S'];
const POSITION_COLORS = {
  QB: '#ef4444',
  RB: '#22c55e',
  WR: '#3b82f6',
  TE: '#f59e0b',
  K:  '#8b5cf6',
  DEF: '#6b7280',
};

export default function CompanionRoster({ onTradePlayer }) {
  const {
    sleeperUser, leagueUsers, rosters,
    players, loadPlayers,
    weeklyStats, seasonStats, loadSeasonStats,
    statsLoading, statsProgress,
    scoringSettings,
    myRoster,
  } = useSleeper();

  // Load player DB on mount
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);

  // Load stats if not loaded
  useEffect(() => {
    if (!seasonStats && !statsLoading) loadSeasonStats();
  }, [seasonStats, statsLoading, loadSeasonStats]);

  const roster = myRoster();

  const positionalRanks = useMemo(
    () => computePositionalRanks(seasonStats, players, scoringSettings),
    [seasonStats, players, scoringSettings],
  );

  const rosterPlayers = useMemo(() => {
    if (!roster || !players) return [];

    // Sleeper includes IR players in both `players` and `reserve` — deduplicate via Set
    const playerIds = [...new Set([...(roster.players || []), ...(roster.reserve || [])])];

    return playerIds.map(id => {
      const p = players[id];
      if (!p) return null;

      const stats = seasonStats?.[id] ?? null;
      const weekly = weeklyStats?.[id] ?? [];
      const pts = stats ? calcPointsFromTotals(stats, scoringSettings) : null;
      const avgPPG = getAvgPPG(weekly, scoringSettings);
      const rank = positionalRanks[id] ?? null;
      const isReserve = roster.reserve?.includes(id);

      return {
        id,
        name: p.full_name || `${p.first_name} ${p.last_name}`,
        position: p.position,
        team: p.team || 'FA',
        pts,
        avgPPG,
        rank,
        isReserve,
        injuryStatus: p.injury_status,
      };
    }).filter(Boolean);
  }, [roster, players, seasonStats, weeklyStats, scoringSettings, positionalRanks]);

  // Group by position
  const grouped = useMemo(() => {
    const groups = {};
    for (const p of rosterPlayers) {
      const pos = POSITION_ORDER.includes(p.position) ? p.position : 'Other';
      if (!groups[pos]) groups[pos] = [];
      groups[pos].push(p);
    }
    // Sort within each group by pts desc
    for (const pos of Object.keys(groups)) {
      groups[pos].sort((a, b) => (b.pts ?? -1) - (a.pts ?? -1));
    }
    return groups;
  }, [rosterPlayers]);

  if (!roster) {
    return (
      <EmptyState message="Could not find your roster in this league." />
    );
  }

  if (!players) {
    return <LoadingState label="Loading player database…" />;
  }

  return (
    <div className="pb-6">
      {/* Stats loading banner */}
      {statsLoading && (
        <div
          className="mx-4 mb-4 px-4 py-2.5 rounded-xl flex items-center gap-3"
          style={{ background: 'var(--color-fill)' }}
        >
          <div
            className="h-1 flex-1 rounded-full overflow-hidden"
            style={{ background: 'var(--color-fill-secondary)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${statsProgress}%`, background: 'var(--color-signature)' }}
            />
          </div>
          <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--color-label-tertiary)' }}>
            Loading stats {statsProgress}%
          </span>
        </div>
      )}

      {/* Column headers */}
      <div
        className="flex items-center gap-3 px-4 pb-2 mb-1"
        style={{ borderBottom: '1px solid var(--color-separator)' }}
      >
        <div className="w-9 shrink-0" />
        <span className="flex-1 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>
          Player
        </span>
        <span className="w-16 text-right text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>
          Season
        </span>
        <span className="w-14 text-right text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-label-tertiary)' }}>
          Avg/G
        </span>
        <div className="w-3 shrink-0" />
      </div>

      {POSITION_ORDER.filter(pos => grouped[pos]?.length).map(pos => (
        <div key={pos} className="mb-4">
          <div
            className="px-4 py-1.5 text-xs font-bold uppercase tracking-widest"
            style={{ color: POSITION_COLORS[pos] ?? 'var(--color-label-tertiary)' }}
          >
            {pos}
          </div>
          {grouped[pos].map(player => (
            <PlayerRow key={player.id} player={player} onSelect={() => setSelectedPlayerId(player.id)}
              onTrade={onTradePlayer ? () => onTradePlayer(player.id) : null} />
          ))}
        </div>
      ))}

      {rosterPlayers.length === 0 && !statsLoading && (
        <EmptyState message="No players on your roster." />
      )}

      {selectedPlayerId && (
        <PlayerWeeklySheet playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
      )}
    </div>
  );
}

function PlayerRow({ player, onSelect, onTrade }) {
  const isInjured = player.injuryStatus && player.injuryStatus !== 'Questionable';
  const rankLabel = player.rank ? `${player.rank.posLabel}${player.rank.rank}` : null;

  return (
    <div className="flex items-center w-full" style={{ borderBottom: '1px solid var(--color-separator)' }}>
      <button
        onClick={onSelect}
        className="flex items-center flex-1 min-w-0 px-4 py-2.5 gap-3 text-left active:opacity-60 transition-opacity"
      >
        {/* Avatar */}
        <img
          src={`https://sleepercdn.com/content/nfl/players/thumb/${player.id}.jpg`}
          alt={player.name}
          className="w-9 h-9 rounded-full shrink-0 object-cover"
          style={{ background: 'var(--color-fill)' }}
          onError={e => { e.target.src = 'https://sleepercdn.com/images/v2/icons/player_default.webp'; }}
        />

        {/* Name / meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm truncate" style={{ color: 'var(--color-label)' }}>
              {player.name}
            </span>
            {player.injuryStatus && (
              <span
                className="text-xs font-bold px-1 py-0.5 rounded shrink-0"
                style={{
                  background: isInjured ? 'rgba(239,68,68,0.12)' : 'rgba(245,183,0,0.12)',
                  color: isInjured ? 'var(--color-accent-red)' : 'var(--color-signature)',
                  fontSize: '10px',
                }}
              >
                {player.injuryStatus}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs" style={{ color: 'var(--color-label-tertiary)' }}>
              {player.team}{player.isReserve && ' · IR'}
            </span>
            {rankLabel && (
              <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--color-label-quaternary)' }}>
                · {rankLabel}
              </span>
            )}
          </div>
        </div>

        {/* Season pts */}
        <div className="w-16 text-right">
          <span className="font-bold tabular-nums text-sm" style={{ color: 'var(--color-label)' }}>
            {player.pts !== null ? player.pts.toFixed(1) : '—'}
          </span>
        </div>

        {/* Avg PPG */}
        <div className="w-14 text-right">
          <span className="tabular-nums text-sm" style={{ color: 'var(--color-label-secondary)' }}>
            {player.avgPPG > 0 ? player.avgPPG.toFixed(1) : '—'}
          </span>
        </div>

        {/* Drill-in chevron */}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-label-quaternary)', flexShrink: 0 }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>

      {onTrade && (
        <button
          onClick={onTrade}
          className="shrink-0 px-3 py-1.5 mr-3 rounded-lg text-xs font-semibold transition-colors active:opacity-60"
          style={{ background: 'var(--color-fill)', color: 'var(--color-accent)' }}
        >
          Trade
        </button>
      )}
    </div>
  );
}

function LoadingState({ label }) {
  return (
    <div className="flex items-center justify-center py-20">
      <span className="text-sm" style={{ color: 'var(--color-label-secondary)' }}>{label}</span>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex items-center justify-center py-20 px-6">
      <span className="text-sm text-center" style={{ color: 'var(--color-label-secondary)' }}>{message}</span>
    </div>
  );
}
